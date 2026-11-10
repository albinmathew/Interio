import Anthropic from '@anthropic-ai/sdk';
import { AnalyzePlanResponseSchema, type AnalyzePlanResponse } from '@interio/core';
import { describe, expect, it, vi } from 'vitest';
import { app as defaultApp, createApp, type AppOptions } from '../src/index';
import { UPSTREAM_SECRET, apiError, fakeClient, jpegBytes, png, pngBytes, reply, type Step } from './helpers';

/** An invented reading of a 2000 x 1400 px sheet, in the model's wire format (pixels). */
const READING = {
  rooms: [
    { label: 'MASTER BED', name: 'Master Bedroom', type: 'bedroom', x: 500, y: 350, dim1_mm: 3300, dim2_mm: 4200 },
    { label: 'TOI. 1', name: 'Toilet 1', type: 'bathroom', x: 800, y: 280, dim1_mm: 1500, dim2_mm: 2400 },
    { label: 'LIVING/DINING', name: 'Living / Dining', type: 'living', x: 1300, y: 700, dim1_mm: 3600, dim2_mm: 6000 },
    { label: 'KITCHEN', name: 'Kitchen', type: 'kitchen', x: 1700, y: 840, dim1_mm: 2400, dim2_mm: 3000 },
    { label: 'WORK SPACE', name: 'Work Space', type: 'study', x: 1000, y: 1050, dim1_mm: 1800, dim2_mm: 2100 },
    { label: 'BALCONY', name: 'Balcony', type: 'balcony', x: 1300, y: 1190, dim1_mm: null, dim2_mm: null },
  ],
  tags: [
    { text: 'D1', kind: 'door', x: 1500, y: 210 },
    { text: 'D2', kind: 'door', x: 700, y: 560 },
    { text: 'SD1', kind: 'door', x: 1250, y: 1100 },
    { text: 'W2', kind: 'window', x: 640, y: 1330 },
    { text: 'V1', kind: 'window', x: 790, y: 140 },
  ],
  scale: '1:50',
};

const SHEET = png(2000, 1400);

function setup(steps: Step[], options: AppOptions = {}) {
  const fake = fakeClient(...steps);
  const logger = vi.fn();
  const app = createApp({ client: fake.client, env: {}, retryDelayMs: 0, logger, ...options });
  return { ...fake, app, logger };
}

async function post(app: ReturnType<typeof createApp>, body: unknown) {
  const res = await app.request('/api/analyze-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, body: AnalyzePlanResponseSchema.parse(JSON.parse(text)) };
}

const request = (image = SHEET) => ({ image, mediaType: 'image/png', fileName: 'unit-a.pdf' });

describe('GET /api/health', () => {
  it('reports AI off and the default model without a key', async () => {
    const res = await createApp({ env: {} }).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ai: false, model: 'claude-fable-5-2', provider: 'off' });
  });

  it('reports AI on and the configured model with a key', async () => {
    const env = { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_MODEL: 'claude-opus-5-5' };
    const res = await createApp({ env }).request('/api/health');
    expect(await res.json()).toEqual({ ok: true, ai: true, model: 'claude-opus-5-5', provider: 'api' });
  });

  it('is served by the default app', async () => {
    const res = await defaultApp.request('/api/health');
    // The default app follows the machine it runs on: an API key, a Claude Code login, or neither.
    const body = (await res.json()) as { ok: boolean; ai: boolean; provider: string };
    expect(body.ok).toBe(true);
    expect(body.ai).toBe(body.provider !== 'off');
    expect(['api', 'claude-code', 'off']).toContain(body.provider);
  });
});

describe('POST /api/analyze-plan without a key', () => {
  it.each([
    ['no key in the environment', { env: {} }],
    ['a blank key', { env: { ANTHROPIC_API_KEY: '  ' } }],
    ['an explicit null client', { client: null }],
  ] satisfies [string, AppOptions][])('answers { available: false } with %s', async (_name, options) => {
    const { status, body } = await post(createApp(options), request());
    expect(status).toBe(200);
    expect(body).toEqual({ available: false });
  });

  it('answers the same way whatever the body is', async () => {
    const { status, body } = await post(createApp({ client: null }), 'not json');
    expect(status).toBe(200);
    expect(body).toEqual({ available: false });
  });
});

describe('POST /api/analyze-plan with a key', () => {
  it('returns the reading as a VisionResult with normalised points', async () => {
    const { app, calls } = setup([reply(READING)]);
    const { status, body } = await post(app, request());

    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(body.available).toBe(true);
    expect(body.model).toBe('claude-fable-5-2');
    expect(body.error).toBeUndefined();
    expect(body.result?.rooms).toEqual([
      { name: 'Master Bedroom', type: 'bedroom', labelPoint: { x: 0.25, y: 0.25 }, dims: [3300, 4200] },
      { name: 'Toilet 1', type: 'bathroom', labelPoint: { x: 0.4, y: 0.2 }, dims: [1500, 2400] },
      { name: 'Living / Dining', type: 'living', labelPoint: { x: 0.65, y: 0.5 }, dims: [3600, 6000] },
      { name: 'Kitchen', type: 'kitchen', labelPoint: { x: 0.85, y: 0.6 }, dims: [2400, 3000] },
      { name: 'Work Space', type: 'study', labelPoint: { x: 0.5, y: 0.75 }, dims: [1800, 2100] },
      { name: 'Balcony', type: 'balcony', labelPoint: { x: 0.65, y: 0.85 } },
    ]);
    expect(body.result?.tags).toEqual([
      { text: 'D1', kind: 'door', point: { x: 0.75, y: 0.15 } },
      { text: 'D2', kind: 'door', point: { x: 0.35, y: 0.4 } },
      { text: 'SD1', kind: 'door', point: { x: 0.625, y: 1100 / 1400 } },
      { text: 'W2', kind: 'window', point: { x: 0.32, y: 0.95 } },
      { text: 'V1', kind: 'window', point: { x: 0.395, y: 0.1 } },
    ]);
    expect(body.result?.scaleText).toBe('1:50');
  });

  it('sends the image, the prompt, a JSON schema and the configured model', async () => {
    const { app, calls } = setup([reply(READING, { model: 'claude-opus-5-5' })], { model: 'claude-opus-5-5' });
    const { body } = await post(app, request());
    const { params, options } = calls[0]!;

    expect(params.model).toBe('claude-opus-5-5');
    expect(body.model).toBe('claude-opus-5-5');
    expect(params.messages).toHaveLength(1);
    const content = params.messages[0]!.content;
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: SHEET } },
      { type: 'text', text: expect.stringContaining('2000 x 1400 pixels') },
    ]);
    expect(JSON.stringify(content)).toContain('unit-a.pdf');
    expect(params.system).toEqual(expect.stringContaining('point-in-polygon'));
    expect(params.output_config?.format).toMatchObject({
      type: 'json_schema',
      schema: { type: 'object', required: ['rooms', 'tags', 'scale'], additionalProperties: false },
    });
    expect(params.output_config?.effort).toBeUndefined();
    expect(params.max_tokens).toBeGreaterThanOrEqual(8000);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    // Retries are counted by the server, not the SDK.
    expect(options).toMatchObject({ maxRetries: 0, timeout: expect.any(Number) });
  });

  it('takes the model, effort and fallback switch from the environment', async () => {
    const env = { ANTHROPIC_MODEL: 'claude-sonnet-5-5', INTERIO_AI_EFFORT: 'low', INTERIO_AI_FALLBACKS: 'off' };
    const { app, calls } = setup([reply(READING)], { env });
    await post(app, request());
    const { params } = calls[0]!;

    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config?.effort).toBe('low');
    expect(params).not.toHaveProperty('fallbacks');
    expect(params).not.toHaveProperty('betas');
  });

  it('reports the model that served the request when a fallback answered', async () => {
    const { app } = setup([reply(READING, { model: 'claude-opus-4-8' })]);
    const { body } = await post(app, request());
    expect(body.model).toBe('claude-opus-4-8');
  });

  it('sends the real image type when the declared one is wrong', async () => {
    const { app, calls } = setup([reply(READING)]);
    const { status } = await post(app, request(jpegBytes(2000, 1400).toString('base64')));
    expect(status).toBe(200);
    expect(calls[0]!.params.messages[0]!.content).toContainEqual(
      expect.objectContaining({ type: 'image', source: expect.objectContaining({ media_type: 'image/jpeg' }) }),
    );
  });

  it('normalises against the downsized frame the model sees', async () => {
    // 3840 x 2160 is downsized to 2576 x 1449 on current models and to 1456 x 819 on older ones.
    const centre = (w: number, h: number) =>
      reply({ rooms: [{ ...READING.rooms[0], x: w / 2, y: h / 2 }], tags: [], scale: null });

    const current = setup([centre(2576, 1449)]);
    const a = await post(current.app, request(png(3840, 2160)));
    expect(JSON.stringify(current.calls[0]!.params.messages)).toContain('2576 x 1449 pixels');
    expect(a.body.result?.rooms[0]?.labelPoint).toEqual({ x: 0.5, y: 0.5 });

    const older = setup([centre(1456, 819)], { model: 'claude-haiku-4-5' });
    const b = await post(older.app, request(png(3840, 2160)));
    expect(JSON.stringify(older.calls[0]!.params.messages)).toContain('1456 x 819 pixels');
    expect(b.body.result?.rooms[0]?.labelPoint).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps near-edge points and drops malformed entries without failing the response', async () => {
    const room = { label: 'BED ROOM-2', name: 'Bedroom 2', type: 'bedroom', x: 500, y: 500, dim1_mm: 3000, dim2_mm: 3300 };
    const tag = { text: 'D1', kind: 'door', x: 100, y: 100 };
    const messy = {
      rooms: [
        { ...room, name: 'Just outside', x: 1010, y: -5 },
        { ...room, name: 'Far outside', x: 5000 },
        { ...room, name: 'Text coordinate', x: '500' },
        { ...room, name: 'No point', y: null },
        { ...room, name: '   ', label: 'STORE' },
        { ...room, name: '', label: '' },
        { ...room, name: 'Unknown type', type: 'garage' },
        { ...room, name: 'Half a pair', dim2_mm: null },
        { ...room, name: 'Metres', dim1_mm: 3.3, dim2_mm: 4.2 },
        { ...room, name: 'Fractional', dim1_mm: 3000.4, dim2_mm: 3299.6 },
        null,
        'BED ROOM',
        room,
      ],
      tags: [
        { ...tag, kind: 'vent' },
        { ...tag, text: '  ' },
        { ...tag, y: 99999 },
        { ...tag, text: ' W1 ', kind: 'window', x: 1000.4, y: 0 },
        42,
      ],
      scale: '   ',
    };
    const { app } = setup([reply(messy)]);
    const { status, body } = await post(app, request(png(1000, 1000)));

    expect(status).toBe(200);
    const centre = { x: 0.5, y: 0.5 };
    expect(body.result?.rooms).toEqual([
      { name: 'Just outside', type: 'bedroom', labelPoint: { x: 1, y: 0 }, dims: [3000, 3300] },
      { name: 'STORE', type: 'bedroom', labelPoint: centre, dims: [3000, 3300] },
      { name: 'Unknown type', type: 'other', labelPoint: centre, dims: [3000, 3300] },
      { name: 'Half a pair', type: 'bedroom', labelPoint: centre },
      { name: 'Metres', type: 'bedroom', labelPoint: centre },
      { name: 'Fractional', type: 'bedroom', labelPoint: centre, dims: [3000, 3300] },
      { name: 'Bedroom 2', type: 'bedroom', labelPoint: centre, dims: [3000, 3300] },
    ]);
    expect(body.result?.tags).toEqual([
      { text: 'D1', kind: 'other', point: { x: 0.1, y: 0.1 } },
      { text: 'W1', kind: 'window', point: { x: 1, y: 0 } },
    ]);
    expect(body.result).not.toHaveProperty('scaleText');
  });

  it('accepts an empty reading and JSON wrapped in a code fence', async () => {
    const fenced = '```json\n{"rooms": [], "tags": [], "scale": null}\n```';
    const { app } = setup([reply(fenced)]);
    const { status, body } = await post(app, request());
    expect(status).toBe(200);
    expect(body).toEqual({ available: true, result: { rooms: [], tags: [] }, model: 'claude-fable-5-2' });
  });
});

describe('POST /api/analyze-plan input errors', () => {
  it.each([
    ['a body that is not JSON', '{"image": ', 'Request body must be JSON'],
    ['a body that is not an object', '[]', 'Request body must be a JSON object'],
    ['a missing image', { mediaType: 'image/png' }, 'image must be a non-empty base64 string'],
    ['an empty image', { image: '', mediaType: 'image/png' }, 'image must be a non-empty base64 string'],
    ['an unsupported media type', { image: SHEET, mediaType: 'image/gif' }, 'mediaType must be image/png or image/jpeg'],
    ['a missing media type', { image: SHEET }, 'mediaType must be image/png or image/jpeg'],
    ['a non-string file name', { ...request(), fileName: 7 }, 'fileName must be a string of at most 255 characters'],
    ['a data: URL', request(`data:image/png;base64,${SHEET}`), 'image must be raw base64 without a data: prefix'],
    ['text that is not base64', request('not base64!'), 'image is not valid base64'],
    ['bytes that are not an image', request(Buffer.from('plain text, not an image').toString('base64')), 'image is not a PNG or JPEG'],
    ['an image beyond the pixel limit', request(png(9000, 100)), 'image is larger than 8000 px on a side'],
  ])('rejects %s with 400', async (_name, payload, error) => {
    const { app, calls } = setup([reply(READING)]);
    const { status, body } = await post(app, payload);
    expect(status).toBe(400);
    expect(body).toEqual({ available: true, error });
    expect(calls).toHaveLength(0);
  });

  it('rejects an image over the size limit with 413', async () => {
    const { app, calls } = setup([reply(READING)], { maxImageBytes: 1024 });
    const { status, body } = await post(app, request(pngBytes(100, 100, 2000).toString('base64')));
    expect(status).toBe(413);
    expect(body).toEqual({ available: true, error: 'image is larger than 0.0 MB' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a body over the default limit with 413 before parsing it', async () => {
    const { app, calls } = setup([reply(READING)]);
    const { status, body } = await post(app, request('A'.repeat(10_100_000)));
    expect(status).toBe(413);
    expect(body).toEqual({ available: true, error: 'Request body is too large' });
    expect(calls).toHaveLength(0);
  });
});

describe('POST /api/analyze-plan upstream failures', () => {
  const leaks = (text: string, logger: ReturnType<typeof vi.fn>) =>
    text.includes(UPSTREAM_SECRET) || JSON.stringify(logger.mock.calls).includes(UPSTREAM_SECRET);

  it.each([
    ['a rate limit', apiError(429, 'rate_limit_error')],
    ['a server error', apiError(500)],
    ['an overloaded API', apiError(529, 'overloaded_error')],
    ['a request timeout status', apiError(408)],
    ['a dropped connection', new Anthropic.APIConnectionError({ message: `socket hang up ${UPSTREAM_SECRET}` })],
    ['a client timeout', new Anthropic.APIConnectionTimeoutError()],
  ])('retries once after %s and succeeds', async (_name, error) => {
    const { app, calls } = setup([error, reply(READING)]);
    const { status, body } = await post(app, request());
    expect(status).toBe(200);
    expect(body.result?.rooms).toHaveLength(6);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.params).toEqual(calls[0]!.params);
  });

  it('gives up with 502 after one retry', async () => {
    const { app, calls, logger } = setup([apiError(500), apiError(503), reply(READING)]);
    const { status, body, text } = await post(app, request());
    expect(status).toBe(502);
    expect(body).toEqual({ available: true, error: 'The AI service is temporarily unavailable. Try again shortly.' });
    expect(calls).toHaveLength(2);
    expect(leaks(text, logger)).toBe(false);
    expect(logger).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ attempt: 2, status: 503, requestId: 'req_test' }),
    );
  });

  it.each([
    ['a rejected key', apiError(401, 'authentication_error'), 'AI assist is misconfigured on the server: credentials were rejected.'],
    ['a forbidden key', apiError(403, 'permission_error'), 'AI assist is misconfigured on the server: credentials were rejected.'],
    ['an unknown model', apiError(404, 'not_found_error'), 'AI assist is misconfigured on the server: the model is not available.'],
    ['an invalid request', apiError(400, 'invalid_request_error'), 'The AI service rejected the request.'],
    ['an oversized request', apiError(413, 'request_too_large'), 'The AI service rejected the request.'],
    ['an unexpected throw', new TypeError(`boom ${UPSTREAM_SECRET}`), 'AI analysis failed.'],
  ])('answers 502 without retrying after %s', async (_name, failure, error) => {
    const { app, calls, logger } = setup([failure, reply(READING)]);
    const { status, body, text } = await post(app, request());
    expect(status).toBe(502);
    expect(body).toEqual({ available: true, error });
    expect(calls).toHaveLength(1);
    expect(leaks(text, logger)).toBe(false);
  });

  it.each([
    ['a refusal', reply('', { stop_reason: 'refusal', content: [] }), 'The AI model declined to analyse this image.'],
    ['truncated output', reply('{"rooms": [{"label": "KIT', { stop_reason: 'max_tokens' }), 'The AI response was cut off before it was complete.'],
    ['prose instead of JSON', reply('I could not find a floor plan in this image.'), 'The AI response could not be read.'],
    ['JSON of the wrong shape', reply({ answer: 'no rooms' }), 'The AI response could not be read.'],
    ['a response with no text', reply('', { content: [{ type: 'thinking' }] }), 'The AI response could not be read.'],
  ])('answers 502 without retrying after %s', async (_name, message, error) => {
    const { app, calls } = setup([message, reply(READING)]);
    const { status, body } = await post(app, request());
    expect(status).toBe(502);
    expect(body).toEqual({ available: true, error } satisfies AnalyzePlanResponse);
    expect(calls).toHaveLength(1);
  });
});
