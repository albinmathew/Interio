/**
 * Interio API. One job: AI assist for plan import.
 *
 *   GET  /api/health        -> { ok, ai }
 *   POST /api/analyze-plan  -> AnalyzePlanResponse (see @interio/core)
 *
 * Phase 0 ships the route with the no-key behaviour. The vision workstream
 * implements the Claude call.
 */
import { serve } from '@hono/node-server';
import type { AnalyzePlanResponse } from '@interio/core';
import { Hono } from 'hono';

export const app = new Hono();

const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

app.get('/api/health', (c) => c.json({ ok: true, ai: hasKey() }));

app.post('/api/analyze-plan', (c) => {
  const body: AnalyzePlanResponse = hasKey()
    ? { available: false, error: 'AI assist is not implemented yet' }
    : { available: false };
  return c.json(body);
});

const port = Number(process.env.INTERIO_API_PORT ?? 8787);

if (process.env.VITEST !== 'true') {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Interio API on http://localhost:${port} (AI assist ${hasKey() ? 'on' : 'off: no ANTHROPIC_API_KEY'})`);
  });
}
