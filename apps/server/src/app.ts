/**
 * Interio API routes.
 *
 *   GET  /api/health        -> { ok, ai, model }
 *   POST /api/analyze-plan  -> AnalyzePlanResponse (see @interio/core)
 *
 * analyze-plan request: { image: base64 PNG|JPEG, mediaType, fileName? }
 *   200 { available: false }                 no key configured; the client imports vector-only
 *   200 { available: true, result, model }   the reading
 *   400 / 413 / 502 { available: true, error }
 */
import type { AnalyzePlanResponse } from '@interio/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { clientFromEnv, effortFromEnv, fallbacksFromEnv, modelFromEnv, type Env } from './config';
import { AnalyzeError, MAX_IMAGE_BYTES, analyzePlan, type VisionSettings } from './vision/analyze';

export interface AppOptions extends Partial<Omit<VisionSettings, 'client'>> {
  /** Anthropic client. `null` turns AI assist off. Omit to build one from `ANTHROPIC_API_KEY`. */
  client?: VisionSettings['client'] | null;
  /** Source of defaults for anything not passed explicitly. Defaults to `process.env`. */
  env?: Env;
}

const RequestSchema = z.object({
  image: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg']),
  fileName: z.string().max(255).optional(),
});

const REQUEST_ERRORS: Record<string, string> = {
  image: 'image must be a non-empty base64 string',
  mediaType: 'mediaType must be image/png or image/jpeg',
  fileName: 'fileName must be a string of at most 255 characters',
};

const failure = (error: string): AnalyzePlanResponse => ({ available: true, error });

export function createApp(options: AppOptions = {}): Hono {
  const { env = process.env, client = clientFromEnv(env), ...overrides } = options;
  const model = overrides.model ?? modelFromEnv(env);
  const maxImageBytes = overrides.maxImageBytes ?? MAX_IMAGE_BYTES;
  const logger = overrides.logger ?? console.error;

  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, ai: client !== null, model }));

  if (!client) {
    // Answered without reading the body: with no key there is nothing to validate it for.
    app.post('/api/analyze-plan', (c) => c.json({ available: false } satisfies AnalyzePlanResponse));
  } else {
    const settings: VisionSettings = {
      ...overrides,
      client,
      model,
      maxImageBytes,
      effort: overrides.effort ?? effortFromEnv(env),
      fallbacks: overrides.fallbacks ?? fallbacksFromEnv(env),
    };
    // Base64 is 4 characters per 3 bytes; the rest is room for the JSON around it.
    const maxBodyBytes = Math.ceil(maxImageBytes / 3) * 4 + 4096;

    app.post(
      '/api/analyze-plan',
      bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.json(failure('Request body is too large'), 413) }),
      async (c) => {
        let json: unknown;
        try {
          json = await c.req.json();
        } catch {
          return c.json(failure('Request body must be JSON'), 400);
        }
        const parsed = RequestSchema.safeParse(json);
        if (!parsed.success) {
          const field = parsed.error.issues[0]?.path[0];
          return c.json(failure(REQUEST_ERRORS[String(field)] ?? 'Request body must be a JSON object'), 400);
        }

        try {
          const { image, fileName } = parsed.data;
          const { result, model: servedBy } = await analyzePlan(settings, { image, fileName });
          return c.json({ available: true, result, model: servedBy } satisfies AnalyzePlanResponse);
        } catch (error) {
          if (error instanceof AnalyzeError) return c.json(failure(error.message), error.status);
          throw error;
        }
      },
    );
  }

  app.onError((error, c) => {
    logger(`${c.req.method} ${c.req.path} failed: ${error.name}`);
    return c.json(failure('Internal error'), 500);
  });

  return app;
}
