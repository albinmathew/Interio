/**
 * One plan image in, one `VisionResult` out. The HTTP route and the CLI both
 * go through `analyzePlan`, so a recorded fixture is what the server returns.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { VisionResult } from '@interio/core';
import { inspectImage } from './image';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, buildUserText } from './prompt';
import { resizedSize, resolutionTierFor } from './resize';
import { parseJsonText, toVisionResult } from './sanitize';

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** The part of a Messages response this module reads. */
export interface VisionMessage {
  content: ReadonlyArray<{ type: string; text?: string }>;
  stop_reason: string | null;
  model?: string;
}

/** The slice of the Anthropic client that is used. `new Anthropic()` satisfies it; tests pass a fake. */
export interface VisionClient {
  beta: {
    messages: {
      create(params: CreateParams, options?: Anthropic.RequestOptions): PromiseLike<VisionMessage>;
    };
  };
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Logger = (message: string, detail?: Record<string, unknown>) => void;

export interface VisionSettings {
  client: VisionClient;
  model: string;
  /** Sent as `output_config.effort` when set; otherwise the model's default applies. */
  effort?: Effort;
  /** Ask the API to re-run a policy-declined request on its recommended fallback model. Default true. */
  fallbacks?: boolean;
  /** Per attempt. */
  timeoutMs?: number;
  /** Pause before the single retry. */
  retryDelayMs?: number;
  /** Largest accepted image, decoded. */
  maxImageBytes?: number;
  logger?: Logger;
}

export interface AnalyzeInput {
  /** Base64 PNG or JPEG, no `data:` prefix. */
  image: string;
  fileName?: string;
}

export interface AnalyzeOutput {
  result: VisionResult;
  /** The model that produced the result. */
  model: string;
}

/** Carries the HTTP status and a message that is safe to show the caller. */
export class AnalyzeError extends Error {
  constructor(
    readonly status: 400 | 413 | 502,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyzeError';
  }
}

/** The Claude API accepts up to 10 MB of base64 per image, which is 7.5 MB decoded. */
export const MAX_IMAGE_BYTES = 7_500_000;
/** The API rejects images above this on either side. */
const MAX_IMAGE_EDGE = 8000;
const MAX_OUTPUT_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRY_DELAY_MS = 750;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function analyzePlan(settings: VisionSettings, input: AnalyzeInput): Promise<AnalyzeOutput> {
  const { client, model, logger = defaultLogger } = settings;
  const bytes = decodeImage(input.image, settings.maxImageBytes ?? MAX_IMAGE_BYTES);
  const info = inspectImage(bytes);
  if (!info) throw new AnalyzeError(400, 'image is not a PNG or JPEG');
  if (info.width > MAX_IMAGE_EDGE || info.height > MAX_IMAGE_EDGE) {
    throw new AnalyzeError(400, `image is larger than ${MAX_IMAGE_EDGE} px on a side`);
  }
  // The model answers in pixels of the image as it sees it, which is the downsized one when the upload is large.
  const frame = resizedSize(info, resolutionTierFor(model));

  const params: CreateParams = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: info.mediaType, data: bytes.toString('base64') } },
          { type: 'text', text: buildUserText(frame, input.fileName) },
        ],
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      ...(settings.effort ? { effort: settings.effort } : {}),
    },
    ...(settings.fallbacks === false ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
  };

  const message = await createWithRetry(client, params, {
    timeoutMs: settings.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retryDelayMs: settings.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    logger,
  });

  if (message.stop_reason === 'refusal') {
    logger('analyze-plan: model declined the request');
    throw new AnalyzeError(502, 'The AI model declined to analyse this image.');
  }
  if (message.stop_reason === 'max_tokens') {
    logger('analyze-plan: response hit max_tokens');
    throw new AnalyzeError(502, 'The AI response was cut off before it was complete.');
  }
  const text = message.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
  const result = toVisionResult(parseJsonText(text), frame);
  if (!result) {
    logger('analyze-plan: response was not a readable result', { stopReason: message.stop_reason });
    throw new AnalyzeError(502, 'The AI response could not be read.');
  }
  return { result, model: message.model || model };
}

function decodeImage(image: string, maxBytes: number): Buffer {
  if (image.startsWith('data:')) throw new AnalyzeError(400, 'image must be raw base64 without a data: prefix');
  // Size is known from the length alone, so an oversized upload is refused before it is decoded.
  if (Math.floor((image.length * 3) / 4) > maxBytes + 2) throw tooLarge(maxBytes);
  if (!BASE64.test(image)) throw new AnalyzeError(400, 'image is not valid base64');
  const bytes = Buffer.from(image, 'base64');
  if (bytes.length > maxBytes) throw tooLarge(maxBytes);
  return bytes;
}

function tooLarge(maxBytes: number): AnalyzeError {
  return new AnalyzeError(413, `image is larger than ${(maxBytes / 1_000_000).toFixed(1)} MB`);
}

interface RetryOptions {
  timeoutMs: number;
  retryDelayMs: number;
  logger: Logger;
}

/** One attempt plus at most one retry, and only for failures that a retry can fix. */
async function createWithRetry(client: VisionClient, params: CreateParams, opts: RetryOptions): Promise<VisionMessage> {
  for (let attempt = 1; ; attempt++) {
    try {
      // Retries are counted here, so the SDK's own are switched off.
      return await client.beta.messages.create(params, { timeout: opts.timeoutMs, maxRetries: 0 });
    } catch (error) {
      const failure = describeFailure(error);
      // Status, error class and request id only: upstream bodies and anything credential-shaped stay out of logs and replies.
      opts.logger('analyze-plan: upstream call failed', { attempt, ...failure.detail });
      if (!failure.retryable || attempt >= 2) throw new AnalyzeError(502, failure.message);
      await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs));
    }
  }
}

interface Failure {
  retryable: boolean;
  message: string;
  detail: Record<string, unknown>;
}

function describeFailure(error: unknown): Failure {
  if (!(error instanceof Anthropic.APIError)) {
    const kind = error instanceof Error ? error.name : typeof error;
    return { retryable: false, message: 'AI analysis failed.', detail: { kind } };
  }
  const detail = { kind: error.constructor.name, status: error.status, requestId: error.requestID ?? undefined };
  const failure = (retryable: boolean, message: string): Failure => ({ retryable, message, detail });

  if (error instanceof Anthropic.APIConnectionTimeoutError) return failure(true, 'The AI service timed out.');
  if (error instanceof Anthropic.APIUserAbortError) return failure(false, 'AI analysis was cancelled.');
  if (error instanceof Anthropic.APIConnectionError) return failure(true, 'Could not reach the AI service.');
  if (error instanceof Anthropic.RateLimitError) {
    return failure(true, 'The AI service is rate-limiting requests. Try again shortly.');
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return failure(false, 'AI assist is misconfigured on the server: credentials were rejected.');
  }
  if (error instanceof Anthropic.NotFoundError) {
    return failure(false, 'AI assist is misconfigured on the server: the model is not available.');
  }
  if (error instanceof Anthropic.RequestTimeoutError || error instanceof Anthropic.ConflictError) {
    return failure(true, 'The AI service did not complete the request. Try again shortly.');
  }
  if (error instanceof Anthropic.InternalServerError) {
    return failure(true, 'The AI service is temporarily unavailable. Try again shortly.');
  }
  return failure(false, 'The AI service rejected the request.');
}

const defaultLogger: Logger = (message, detail) => {
  if (detail) console.error(message, detail);
  else console.error(message);
};
