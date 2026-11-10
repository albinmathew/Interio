/**
 * Interio API. One job: AI assist for plan import.
 *
 *   GET  /api/health        -> { ok, ai, model, provider }
 *   POST /api/analyze-plan  -> AnalyzePlanResponse (see @interio/core)
 *
 * Routes live in `app.ts`; `createApp({ client })` takes an injected Anthropic
 * client, and `app` below is the default instance wired from the environment.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { visionFromEnv } from './config';

export { createApp, type AppOptions } from './app';
export type { VisionClient, VisionMessage } from './vision/analyze';

const vision = visionFromEnv();

export const app = createApp({ client: vision.client, provider: vision.provider });

const port = Number(process.env.INTERIO_API_PORT ?? 8787);

if (process.env.VITEST !== 'true') {
  serve({ fetch: app.fetch, port }, () => {
    const how = { api: 'on: Anthropic API key', 'claude-code': 'on: Claude Code login on this machine', off: 'off: set ANTHROPIC_API_KEY, or INTERIO_AI_PROVIDER=claude-code to use the Claude Code login' }[vision.provider];
    console.log(`Interio API on http://localhost:${port} (AI assist ${how})`);
  });
}
