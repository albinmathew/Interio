/**
 * AI assist for the import: sends a render of the page to the API and gets room
 * names, labelled sizes and tags back. The wizard carries on without it.
 */
import { AnalyzePlanResponseSchema, type VisionResult } from '@interio/core';

export type AiStatus = 'used' | 'unavailable' | 'failed';

export interface AiOutcome {
  status: AiStatus;
  vision: VisionResult | null;
  /** Why the result is missing, for the review screen. */
  detail?: string;
  model?: string;
}

/** The API accepts images up to 7.5 MB decoded. */
export const MAX_IMAGE_BYTES = 7_000_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function analyzePlan(image: Blob, fileName: string, timeoutMs = 120_000): Promise<AiOutcome> {
  if (image.size > MAX_IMAGE_BYTES) return { status: 'failed', vision: null, detail: 'The page image is too large to send.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/analyze-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: await toBase64(image), mediaType: 'image/png', fileName }),
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'failed', vision: null, detail: `The assistant returned ${res.status}.` };
    const parsed = AnalyzePlanResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { status: 'failed', vision: null, detail: 'The assistant sent a reply that could not be read.' };
    const body = parsed.data;
    if (!body.available) return { status: 'unavailable', vision: null, detail: body.error };
    if (!body.result) return { status: 'failed', vision: null, detail: body.error ?? 'The assistant returned no result.' };
    return { status: 'used', vision: body.result, model: body.model };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { status: 'failed', vision: null, detail: aborted ? 'The assistant took too long.' : 'The assistant could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}
