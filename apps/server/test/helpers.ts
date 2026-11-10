import Anthropic from '@anthropic-ai/sdk';
import type { VisionClient, VisionMessage } from '../src/vision/analyze';

type Create = VisionClient['beta']['messages']['create'];
export type CreateParams = Parameters<Create>[0];
export type CreateOptions = Parameters<Create>[1];

/** What the fake does on each successive call; the last step repeats. */
export type Step = VisionMessage | Error;

export function fakeClient(...steps: Step[]) {
  const calls: { params: CreateParams; options: CreateOptions }[] = [];
  const client: VisionClient = {
    beta: {
      messages: {
        async create(params, options) {
          calls.push({ params, options });
          const step = steps[Math.min(calls.length, steps.length) - 1];
          if (!step) throw new Error('fakeClient has no steps');
          if (step instanceof Error) throw step;
          return step;
        },
      },
    },
  };
  return { client, calls };
}

/** A response shaped like the real one: a thinking block, then the JSON text. */
export function reply(payload: unknown, extra: Partial<VisionMessage> = {}): VisionMessage {
  return {
    content: [
      { type: 'thinking' },
      { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    ],
    stop_reason: 'end_turn',
    model: 'claude-fable-5-2',
    ...extra,
  };
}

/** Text that must never reach an API response or a log line. */
export const UPSTREAM_SECRET = 'sk-ant-api03-do-not-leak';

export function apiError(status: number, type = 'api_error'): Error {
  const body = { type: 'error', error: { type, message: `upstream detail ${UPSTREAM_SECRET}` } };
  return Anthropic.APIError.generate(status, body, undefined, new Headers({ 'request-id': 'req_test' }));
}

/** The first 24 bytes of a PNG: enough for a header-only reader. */
export function pngBytes(width: number, height: number, padding = 0): Buffer {
  const header = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.set([8, 2, 0, 0, 0], 24);
  return header;
}

/** SOI, an APP0 segment, then a baseline frame header. */
export function jpegBytes(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

export const png = (width: number, height: number) => pngBytes(width, height).toString('base64');
