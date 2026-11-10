import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VisionResultSchema } from '@interio/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli';
import { apiError, fakeClient, pngBytes, reply } from './helpers';

const READING = {
  rooms: [{ label: 'KITCHEN', name: 'Kitchen', type: 'kitchen', x: 400, y: 300, dim1_mm: 2400, dim2_mm: 3000 }],
  tags: [{ text: 'D1', kind: 'door', x: 200, y: 150 }],
  scale: '1:50',
};

describe('analyze CLI', () => {
  let dir: string;
  let lines: string[];
  const print = (line: string) => lines.push(line);

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'interio-analyze-'));
    lines = [];
    await writeFile(path.join(dir, 'page 1.png'), pngBytes(800, 600));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a VisionResult next to the image by default', async () => {
    const { client, calls } = fakeClient(reply(READING));
    const code = await runCli(['page 1.png'], { client, env: { INIT_CWD: dir }, print });

    expect(code).toBe(0);
    const written = JSON.parse(await readFile(path.join(dir, 'page 1.vision.json'), 'utf8'));
    expect(VisionResultSchema.parse(written)).toEqual({
      rooms: [{ name: 'Kitchen', type: 'kitchen', labelPoint: { x: 0.5, y: 0.5 }, dims: [2400, 3000] }],
      tags: [{ text: 'D1', kind: 'door', point: { x: 0.25, y: 0.25 } }],
      scaleText: '1:50',
    });
    expect(calls[0]!.params.model).toBe('claude-fable-5-2');
    expect(JSON.stringify(calls[0]!.params.messages)).toContain('page 1.png');
    expect(lines.join('\n')).toContain('1 rooms, 1 tags, scale 1:50');
  });

  it('writes to the given path and uses the model from the environment', async () => {
    const { client, calls } = fakeClient(reply(READING));
    const env = { INIT_CWD: dir, ANTHROPIC_MODEL: 'claude-opus-5-5' };
    const code = await runCli(['page 1.png', 'out/../result.json'], { client, env, print });

    expect(code).toBe(0);
    expect(calls[0]!.params.model).toBe('claude-opus-5-5');
    expect(VisionResultSchema.safeParse(JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'))).success).toBe(true);
  });

  it('explains itself and writes nothing when it cannot run', async () => {
    const { client, calls } = fakeClient(apiError(401, 'authentication_error'));
    const options = { env: { INIT_CWD: dir }, print, retryDelayMs: 0, logger: () => {} };

    expect(await runCli([], { ...options, client })).toBe(2);
    expect(await runCli(['plan.pdf'], { ...options, client })).toBe(2);
    expect(await runCli(['page 1.png'], options)).toBe(1);
    expect(await runCli(['missing.png'], { ...options, client })).toBe(1);
    expect(calls).toHaveLength(0);
    expect(await runCli(['page 1.png'], { ...options, client })).toBe(1);

    expect(lines).toEqual([
      expect.stringContaining('Usage:'),
      expect.stringContaining('PDF input is not supported'),
      expect.stringContaining('ANTHROPIC_API_KEY is not set'),
      expect.stringContaining('Cannot read'),
      'Analysis failed: AI assist is misconfigured on the server: credentials were rejected.',
    ]);
    await expect(readFile(path.join(dir, 'page 1.vision.json'))).rejects.toThrow();
  });
});
