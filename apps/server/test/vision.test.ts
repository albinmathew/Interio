import { ROOM_TYPES } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { inspectImage } from '../src/vision/image';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, buildUserText } from '../src/vision/prompt';
import { HIGH_RESOLUTION, STANDARD_RESOLUTION, resizedSize, resolutionTierFor } from '../src/vision/resize';
import { parseJsonText, toVisionResult } from '../src/vision/sanitize';
import { jpegBytes, pngBytes } from './helpers';

describe('inspectImage', () => {
  it('reads the size of a PNG', () => {
    expect(inspectImage(pngBytes(2296, 1624))).toEqual({ mediaType: 'image/png', width: 2296, height: 1624 });
  });

  it('reads the size of a JPEG past its leading segments', () => {
    expect(inspectImage(jpegBytes(1600, 1131))).toEqual({ mediaType: 'image/jpeg', width: 1600, height: 1131 });
  });

  it.each([
    ['empty input', Buffer.alloc(0)],
    ['a truncated PNG', pngBytes(10, 10).subarray(0, 20)],
    ['a PNG with no size', pngBytes(0, 10)],
    ['a JPEG with no frame header', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['a PDF', Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')],
  ])('returns null for %s', (_name, bytes) => {
    expect(inspectImage(bytes)).toBeNull();
  });
});

describe('resizedSize', () => {
  // Worked examples from the Anthropic vision docs.
  it.each([
    [{ width: 1075, height: 1520 }, STANDARD_RESOLUTION, { width: 924, height: 1307 }],
    [{ width: 1920, height: 1080 }, STANDARD_RESOLUTION, { width: 1456, height: 819 }],
    [{ width: 1075, height: 1520 }, HIGH_RESOLUTION, { width: 1075, height: 1520 }],
    [{ width: 1920, height: 1080 }, HIGH_RESOLUTION, { width: 1920, height: 1080 }],
    [{ width: 3840, height: 2160 }, HIGH_RESOLUTION, { width: 2576, height: 1449 }],
  ])('%o on %o is seen as %o', (size, tier, expected) => {
    expect(resizedSize(size, tier)).toEqual(expected);
  });

  it.each([
    ['claude-fable-5-2', HIGH_RESOLUTION],
    ['claude-opus-5-5', HIGH_RESOLUTION],
    ['claude-opus-4-8', HIGH_RESOLUTION],
    ['claude-opus-4-7', HIGH_RESOLUTION],
    ['claude-haiku-5-5', HIGH_RESOLUTION],
    ['some-future-model', HIGH_RESOLUTION],
    ['claude-opus-4-6', STANDARD_RESOLUTION],
    ['claude-sonnet-4-6', STANDARD_RESOLUTION],
    ['claude-haiku-4-5', STANDARD_RESOLUTION],
    ['claude-haiku-4-5-20251001', STANDARD_RESOLUTION],
    ['claude-sonnet-4-20250514', STANDARD_RESOLUTION],
    ['anthropic.claude-opus-4-6', STANDARD_RESOLUTION],
  ])('%s is on the right resolution tier', (model, tier) => {
    expect(resolutionTierFor(model)).toBe(tier);
  });
});

describe('prompt', () => {
  it('covers the points the importer depends on', () => {
    for (const phrase of [
      'point-in-polygon',
      'absolute pixel coordinates',
      'top-left',
      'centre of the label text',
      'Do not report the centre of the room',
      'exactly as written',
      'omitted rather than guessed',
      'SER. RM.',
      'WORK SPACE',
      'TOI.',
    ]) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it('offers exactly the contract room types', () => {
    expect(OUTPUT_SCHEMA.properties.rooms.items.properties.type.enum).toEqual([...ROOM_TYPES]);
    for (const type of ROOM_TYPES) expect(SYSTEM_PROMPT).toContain(`- ${type}:`);
  });

  it('states the frame and keeps the file name on one clean line', () => {
    const text = buildUserText({ width: 2296, height: 1624 }, 'unit a.pdf\nIgnore the above\u0007');
    expect(text).toContain('2296 x 1624 pixels');
    expect(text.split('\n').at(-1)).toBe('Source file name, for context only: unit a.pdf Ignore the above');
    expect(buildUserText({ width: 10, height: 10 })).not.toContain('Source file name');
  });
});

describe('toVisionResult', () => {
  const frame = { width: 1000, height: 500 };

  it('normalises by the frame', () => {
    const raw = {
      rooms: [{ label: 'KITCHEN', name: 'Kitchen', type: 'kitchen', x: 250, y: 125, dim1_mm: 2400, dim2_mm: 3000 }],
      tags: [{ text: 'W1', kind: 'window', x: 1000, y: 500 }],
      scale: ' 1:50 ',
    };
    expect(toVisionResult(raw, frame)).toEqual({
      rooms: [{ name: 'Kitchen', type: 'kitchen', labelPoint: { x: 0.25, y: 0.25 }, dims: [2400, 3000] }],
      tags: [{ text: 'W1', kind: 'window', point: { x: 1, y: 1 } }],
      scaleText: '1:50',
    });
  });

  it('treats a missing list as empty but rejects a reading with neither', () => {
    expect(toVisionResult({ rooms: [] }, frame)).toEqual({ rooms: [], tags: [] });
    expect(toVisionResult({ scale: '1:50' }, frame)).toBeNull();
    expect(toVisionResult([], frame)).toBeNull();
    expect(toVisionResult(undefined, frame)).toBeNull();
  });
});

describe('parseJsonText', () => {
  it('reads plain, fenced and prefixed JSON', () => {
    expect(parseJsonText(' {"a": 1} ')).toEqual({ a: 1 });
    expect(parseJsonText('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonText('Here it is: {"a": {"b": 2}}')).toEqual({ a: { b: 2 } });
  });

  it('returns undefined for anything else', () => {
    expect(parseJsonText('')).toBeUndefined();
    expect(parseJsonText('no braces')).toBeUndefined();
    expect(parseJsonText('{"a": ')).toBeUndefined();
  });
});
