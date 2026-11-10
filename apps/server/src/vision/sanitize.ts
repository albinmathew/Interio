/**
 * Model output -> contract `VisionResult`.
 *
 * The model reports points in pixels of the frame it saw; the contract wants
 * 0..1 with the origin top-left. Entries are checked one by one so a single
 * bad row costs that row, not the whole reading.
 */
import { ROOM_TYPES, VisionResultSchema, type RoomType, type VisionResult } from '@interio/core';
import type { Size } from './resize';

type Room = VisionResult['rooms'][number];
type Tag = VisionResult['tags'][number];

const MAX_ROOMS = 200;
const MAX_TAGS = 500;
const MAX_NAME = 80;
const MAX_TAG_TEXT = 24;
const MAX_SCALE_TEXT = 40;

/**
 * A point may overshoot the frame by this fraction and still be clamped onto
 * the edge. Further out it is not a near-edge label but a point in the wrong
 * frame or unit, and clamping it would invent a location.
 */
const EDGE_TOLERANCE = 0.03;

/** Plausible range for a labelled room dimension in millimetres. */
const MIN_DIM_MM = 100;
const MAX_DIM_MM = 100_000;

const TAG_KINDS: readonly Tag['kind'][] = ['door', 'window', 'other'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function axis(value: unknown, extent: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = value / extent;
  if (n < -EDGE_TOLERANCE || n > 1 + EDGE_TOLERANCE) return null;
  return Math.min(1, Math.max(0, n));
}

function point(entry: Record<string, unknown>, frame: Size): { x: number; y: number } | null {
  const x = axis(entry.x, frame.width);
  const y = axis(entry.y, frame.height);
  return x === null || y === null ? null : { x, y };
}

function dimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const mm = Math.round(value);
  return mm >= MIN_DIM_MM && mm <= MAX_DIM_MM ? mm : null;
}

function room(entry: unknown, frame: Size): Room | null {
  if (!isRecord(entry)) return null;
  const name = text(entry.name, MAX_NAME) || text(entry.label, MAX_NAME);
  const labelPoint = point(entry, frame);
  if (!name || !labelPoint) return null;
  const type: RoomType = ROOM_TYPES.includes(entry.type as RoomType) ? (entry.type as RoomType) : 'other';
  const a = dimension(entry.dim1_mm);
  const b = dimension(entry.dim2_mm);
  return a !== null && b !== null ? { name, type, labelPoint, dims: [a, b] } : { name, type, labelPoint };
}

function tag(entry: unknown, frame: Size): Tag | null {
  if (!isRecord(entry)) return null;
  const code = text(entry.text, MAX_TAG_TEXT);
  const at = point(entry, frame);
  if (!code || !at) return null;
  const kind = TAG_KINDS.includes(entry.kind as Tag['kind']) ? (entry.kind as Tag['kind']) : 'other';
  return { text: code, kind, point: at };
}

function collect<T>(list: unknown, max: number, convert: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const entry of list) {
    if (out.length >= max) break;
    const item = convert(entry);
    if (item) out.push(item);
  }
  return out;
}

/**
 * @param raw   parsed JSON from the model (see `OUTPUT_SCHEMA`)
 * @param frame pixel size of the image as the model saw it
 * @returns null when `raw` is not a reading at all (no `rooms` and no `tags` list)
 */
export function toVisionResult(raw: unknown, frame: Size): VisionResult | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.rooms) && !Array.isArray(raw.tags)) return null;
  const scaleText = text(raw.scale, MAX_SCALE_TEXT);
  const result: VisionResult = {
    rooms: collect(raw.rooms, MAX_ROOMS, (entry) => room(entry, frame)),
    tags: collect(raw.tags, MAX_TAGS, (entry) => tag(entry, frame)),
    ...(scaleText ? { scaleText } : {}),
  };
  const checked = VisionResultSchema.safeParse(result);
  return checked.success ? checked.data : null;
}

/** Parses the model's text as JSON, tolerating a code fence or prose around the object. */
export function parseJsonText(source: string): unknown {
  const trimmed = source.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}
