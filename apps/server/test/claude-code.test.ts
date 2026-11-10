import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index';
import { modelFromEnv, visionFromEnv } from '../src/config';
import { VisionClientError } from '../src/vision/analyze';
import { createClaudeCodeClient, findClaudeCommand, type SpawnFn } from '../src/vision/claudeCode';
import { png } from './helpers';

interface Call {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  stdin: string;
}

/** A stand-in for the `claude` process: records the call and prints the given events. */
function fakeSpawn(reply: { stdout?: string; stderr?: string; code?: number; hang?: boolean; throws?: boolean }) {
  const calls: Call[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    if (reply.throws) throw new Error('ENOENT');
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill(): void };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => undefined;
    const call: Call = { command, args, cwd: options.cwd, env: options.env, stdin: '' };
    calls.push(call);
    child.stdin.on('data', (chunk) => (call.stdin += String(chunk)));
    child.stdin.on('end', () => {
      if (reply.hang) return;
      child.stdout.end(reply.stdout ?? '');
      child.stderr.end(reply.stderr ?? '');
      setImmediate(() => child.emit('close', reply.code ?? 0));
    });
    return child as never;
  };
  return { spawn, calls };
}

const READING = {
  rooms: [{ label: 'BED ROOM-1', name: 'Bedroom 1', type: 'bedroom', x: 500, y: 350, dim1_mm: 3400, dim2_mm: 3960 }],
  tags: [{ text: 'D2', kind: 'door', x: 700, y: 600 }],
  scale: '1:50',
};

const events = (result: Record<string, unknown>) =>
  [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'assistant', message: { content: [] } }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, modelUsage: { 'claude-opus-5-5': {} }, ...result }),
  ].join('\n') + '\n';

const body = { image: png(2000, 1400), mediaType: 'image/png', fileName: 'unit-a.pdf' };

function appWith(reply: Parameters<typeof fakeSpawn>[0], env: Record<string, string | undefined> = {}) {
  const fake = fakeSpawn(reply);
  const client = createClaudeCodeClient({ command: '/bin/claude', env: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-should-not-pass', ...env }, spawn: fake.spawn });
  const logs: string[] = [];
  const app = createApp({ client, provider: 'claude-code', env: {}, retryDelayMs: 0, timeoutMs: 200, logger: (m) => logs.push(m) });
  const post = async () => {
    const res = await app.request('/api/analyze-plan', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    return { status: res.status, body: (await res.json()) as { available: boolean; error?: string; model?: string; result?: { rooms: unknown[]; tags: unknown[]; scaleText?: string } } };
  };
  return { ...fake, app, post, logs };
}

describe('Claude Code provider', () => {
  it('reads a plan through one headless run and returns the same contract as the API path', async () => {
    const { post, calls, app } = appWith({ stdout: events({ structured_output: READING, result: 'ignored' }) });
    const { status, body: out } = await post();
    expect(status).toBe(200);
    expect(out.available).toBe(true);
    expect(out.model).toBe('claude-opus-5-5');
    expect(out.result!.rooms).toHaveLength(1);
    expect(out.result!.rooms[0]).toMatchObject({ name: 'Bedroom 1', type: 'bedroom', dims: [3400, 3960], labelPoint: { x: 0.25, y: 0.25 } });
    expect(out.result!.tags).toHaveLength(1);
    expect(out.result!.scaleText).toBe('1:50');
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true, ai: true, model: 'claude-opus-5-5', provider: 'claude-code' });

    expect(calls).toHaveLength(1);
    const { command, args, env, stdin } = calls[0]!;
    expect(command).toBe('/bin/claude');
    const flag = (name: string) => args[args.indexOf(name) + 1];
    expect(args).toEqual(expect.arrayContaining(['-p', '--verbose', '--safe-mode', '--no-session-persistence']));
    expect(flag('--input-format')).toBe('stream-json');
    expect(flag('--output-format')).toBe('stream-json');
    expect(flag('--model')).toBe('claude-opus-5-5');
    expect(flag('--tools')).toBe(''); // a single model call: no tools
    expect(flag('--system-prompt')).toContain('floor-plan importer');
    expect(JSON.parse(flag('--json-schema')!)).toMatchObject({ type: 'object', required: ['rooms', 'tags', 'scale'] });
    // The login is used, never a key from the environment.
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    // The image travels as a content block on stdin, not as a file.
    const turn = JSON.parse(stdin) as { type: string; message: { content: { type: string; source?: { data: string } }[] } };
    expect(turn.type).toBe('user');
    expect(turn.message.content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: body.image } });
    expect(turn.message.content[1]!.type).toBe('text');
  });

  it('names the model that read the plan, not the housekeeping model listed beside it', async () => {
    const usage = { 'claude-haiku-5-5': { outputTokens: 12 }, 'claude-opus-5-5[1m]': { outputTokens: 900 } };
    const { post } = appWith({ stdout: events({ structured_output: READING, modelUsage: usage }) });
    expect((await post()).body.model).toBe('claude-opus-5-5');
    const other = { 'claude-haiku-5-5': { outputTokens: 12 }, 'claude-fable-5-2': { outputTokens: 900 } };
    expect((await appWith({ stdout: events({ structured_output: READING, modelUsage: other }) }).post()).body.model).toBe('claude-fable-5-2');
  });

  it('falls back to the result text when no structured output is reported', async () => {
    const { post } = appWith({ stdout: events({ result: JSON.stringify(READING) }) });
    const { status, body: out } = await post();
    expect(status).toBe(200);
    expect(out.result!.rooms).toHaveLength(1);
  });

  it.each([
    ['a usage limit', { stdout: events({ is_error: true, result: "You've hit your 5-hour limit · resets 6:20pm" }), code: 1 }, /usage limit/i, 1],
    ['a missing login', { stderr: 'Invalid API key · Please run /login', code: 1 }, /not signed in/i, 1],
    ['an unknown failure', { stderr: 'boom sk-secret-detail', code: 1 }, /could not complete/i, 2],
    ['a binary that cannot start', { throws: true }, /could not be started/i, 1],
    ['a run that never answers', { hang: true }, /timed out/i, 2],
  ] as const)('explains %s without leaking the tool output', async (_name, reply, message, attempts) => {
    const { post, calls } = appWith(reply);
    const { status, body: out } = await post();
    expect(status).toBe(502);
    expect(out).toEqual({ available: true, error: expect.stringMatching(message) });
    expect(JSON.stringify(out)).not.toContain('sk-secret-detail');
    // Only failures a second try can fix are retried.
    expect(Math.max(calls.length, 1)).toBe(attempts);
  });

  it('is a retryable or final error by kind', () => {
    expect(new VisionClientError('x', true).retryable).toBe(true);
  });
});

describe('provider selection', () => {
  const exists = (...files: string[]) => (file: string) => files.includes(file);

  it('finds claude on PATH, in the usual install locations, or where it is told to look', () => {
    expect(findClaudeCommand({ PATH: '/a:/b' }, exists('/b/claude'))).toBe('/b/claude');
    expect(findClaudeCommand({ HOME: '/home/me' }, exists('/home/me/.local/bin/claude'))).toBe('/home/me/.local/bin/claude');
    expect(findClaudeCommand({ INTERIO_CLAUDE_COMMAND: '/x/claude', PATH: '/b' }, exists('/x/claude', '/b/claude'))).toBe('/x/claude');
    expect(findClaudeCommand({ INTERIO_CLAUDE_COMMAND: '/missing' }, exists('/b/claude'))).toBeNull();
    expect(findClaudeCommand({ PATH: '/a' }, exists())).toBeNull();
  });

  it('prefers an API key, and can be forced or switched off', () => {
    // Nothing configured and no claude reachable from this environment.
    expect(visionFromEnv({ PATH: '/nonexistent' }).provider).toBe('off');
    expect(visionFromEnv({ ANTHROPIC_API_KEY: 'k', PATH: '/nonexistent' }).provider).toBe('api');
    expect(visionFromEnv({ ANTHROPIC_API_KEY: 'k', INTERIO_AI_PROVIDER: 'off' })).toEqual({ provider: 'off', client: null });
    expect(visionFromEnv({ INTERIO_AI_PROVIDER: 'api', PATH: '/nonexistent' }).provider).toBe('off');
    expect(visionFromEnv({ INTERIO_AI_PROVIDER: 'claude-code', ANTHROPIC_API_KEY: 'k', PATH: '/nonexistent' }).provider).toBe('off');
    // The login is opt-in: having Claude Code installed is not consent to send drawings anywhere.
    const installed = { INTERIO_CLAUDE_COMMAND: process.execPath };
    expect(visionFromEnv(installed).provider).toBe('off');
    expect(visionFromEnv({ ...installed, INTERIO_AI_PROVIDER: 'claude-code' }).provider).toBe('claude-code');
    expect(visionFromEnv({ ...installed, INTERIO_AI_PROVIDER: 'claude-code', ANTHROPIC_API_KEY: 'k' }).provider).toBe('claude-code');
  });

  it('defaults to Opus through Claude Code and to Fable on the API, unless a model is set', () => {
    expect(modelFromEnv({}, 'claude-code')).toBe('claude-opus-5-5');
    expect(modelFromEnv({}, 'api')).toBe('claude-fable-5-2');
    expect(modelFromEnv({ ANTHROPIC_MODEL: 'claude-opus-5-5' }, 'claude-code')).toBe('claude-opus-5-5');
  });
});
