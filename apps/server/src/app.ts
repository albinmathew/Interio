/**
 * Interio API routes.
 *
 *   GET  /api/health        -> { ok, ai, model, provider }
 *   POST /api/analyze-plan  -> AnalyzePlanResponse (see @interio/core)
 *   POST /api/design-edit   -> DesignEditResponse  (see @interio/core)
 *
 * analyze-plan request: { image: base64 PNG|JPEG, mediaType, fileName? }
 *   200 { available: false }                 no provider configured; the client imports vector-only
 *   200 { available: true, result, model }   the reading
 *   400 / 413 / 502 { available: true, error }
 */
import { DesignEditRequestSchema, type AnalyzePlanResponse, type DesignEditResponse } from '@interio/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { effortFromEnv, fallbacksFromEnv, modelFromEnv, visionFromEnv, type Env, type Provider } from './config';
import { designEdit } from './design/edit';
import { AnalyzeError, MAX_IMAGE_BYTES, analyzePlan, type VisionSettings } from './vision/analyze';

export interface AppOptions extends Partial<Omit<VisionSettings, 'client'>> {
  /** Vision client. `null` turns AI assist off. Omit to pick one from the environment (see `config.ts`). */
  client?: VisionSettings['client'] | null;
  /** Reported by /api/health. Derived from the environment when `client` is omitted. */
  provider?: Provider;
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
  const { env = process.env, client: given, provider: givenProvider, ...overrides } = options;
  const fromEnv = given === undefined ? visionFromEnv(env) : null;
  const client = given === undefined ? fromEnv!.client : given;
  const provider: Provider = givenProvider ?? fromEnv?.provider ?? (client ? 'api' : 'off');
  const model = overrides.model ?? modelFromEnv(env, provider);
  const maxImageBytes = overrides.maxImageBytes ?? MAX_IMAGE_BYTES;
  const logger = overrides.logger ?? console.error;

  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, ai: client !== null, model, provider }));

  if (!client) {
    // Answered without reading the body: with no provider there is nothing to validate it for.
    app.post('/api/analyze-plan', (c) => c.json({ available: false } satisfies AnalyzePlanResponse));
    app.post('/api/design-edit', (c) => c.json({ available: false } satisfies DesignEditResponse));
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

  if (client) {
    const settings: VisionSettings = {
      ...overrides,
      client,
      model,
      effort: overrides.effort ?? effortFromEnv(env),
      fallbacks: overrides.fallbacks ?? fallbacksFromEnv(env),
    };
    const fail = (error: string): DesignEditResponse => ({ available: true, error });

    // A design request in plain language: the home, the catalog and the request in; a reply and operations out.
    app.post(
      '/api/design-edit',
      bodyLimit({ maxSize: 1_000_000, onError: (c) => c.json(fail('Request body is too large'), 413) }),
      async (c) => {
        let json: unknown;
        try {
          json = await c.req.json();
        } catch {
          return c.json(fail('Request body must be JSON'), 400);
        }
        const parsed = DesignEditRequestSchema.safeParse(json);
        if (!parsed.success) {
          const field = parsed.error.issues[0]?.path[0];
          return c.json(fail(`Request is not valid${typeof field === 'string' ? `: ${field}` : ''}`), 400);
        }
        try {
          const { reply, ops, model: servedBy } = await designEdit(settings, parsed.data);
          return c.json({ available: true, reply, ops, model: servedBy } satisfies DesignEditResponse);
        } catch (error) {
          if (error instanceof AnalyzeError) return c.json(fail(error.message), error.status);
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
