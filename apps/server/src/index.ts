/**
 * Interio API. One job: AI assist for plan import.
 *
 *   GET  /api/health        -> { ok, ai, model }
 *   POST /api/analyze-plan  -> AnalyzePlanResponse (see @interio/core)
 *
 * Routes live in `app.ts`; `createApp({ client })` takes an injected Anthropic
 * client, and `app` below is the default instance wired from the environment.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { clientFromEnv } from './config';

export { createApp, type AppOptions } from './app';
export type { VisionClient, VisionMessage } from './vision/analyze';

const client = clientFromEnv();

export const app = createApp({ client });

const port = Number(process.env.INTERIO_API_PORT ?? 8787);

if (process.env.VITEST !== 'true') {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Interio API on http://localhost:${port} (AI assist ${client ? 'on' : 'off: no ANTHROPIC_API_KEY'})`);
  });
}
