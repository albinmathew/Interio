/** Source-drawing underlay helpers: bounds, scaling, and a synthetic one for development and tests. */
import { vec, type Underlay } from '@interio/core';
import type { Bounds } from './view';

/** Extent of the underlay (linework, snap points and raster page) in plan mm, times `k`. */
export function underlayBounds(u: Pick<Underlay, 'segments' | 'snapPoints' | 'image'>, k = 1): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (u.image) {
    const { widthPx: w, heightPx: h, planFromImage: m } = u.image;
    for (const c of [vec.applyMat(m, { x: 0, y: 0 }), vec.applyMat(m, { x: w, y: 0 }), vec.applyMat(m, { x: w, y: h }), vec.applyMat(m, { x: 0, y: h })]) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
  }
  for (const arr of [u.segments, u.snapPoints]) {
    for (let i = 0; i + 1 < arr.length; i += 2) {
      const x = arr[i]!;
      const y = arr[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX) return null;
  return { minX: minX * k, minY: minY * k, maxX: maxX * k, maxY: maxY * k };
}

/** A copy of flat [x, y, ...] points multiplied by `k` (the same array when k is 1). */
export function scalePoints(points: Float32Array, k: number): Float32Array {
  if (k === 1) return points;
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) out[i] = points[i]! * k;
  return out;
}

export interface SyntheticUnderlayOptions {
  /** Total number of segments, including the outline. */
  segments?: number;
  /** Outline rectangle: [minX, minY, maxX, maxY] in plan mm. */
  rect?: [number, number, number, number];
  /** Where the filler linework goes: [minX, minY, maxX, maxY]. Keep it away from `rect` for deterministic snapping. */
  clutter?: [number, number, number, number];
  seed?: number;
}

/**
 * A stand-in for the importer's underlay: a clean rectangular room outline
 * (with snap points on its corners) plus short random strokes that mimic
 * hatching and furniture, up to `segments` in total. Deterministic for a seed.
 */
export function makeSyntheticUnderlay(opts: SyntheticUnderlayOptions = {}): Underlay {
  const total = Math.max(4, opts.segments ?? 2000);
  const [x0, y0, x1, y1] = opts.rect ?? [14000, 1000, 18000, 4000];
  const [cx0, cy0, cx1, cy1] = opts.clutter ?? [-1000, 10500, 19000, 15500];
  let state = (opts.seed ?? 7) >>> 0 || 1;
  const rnd = () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
  const segments = new Float32Array(total * 4);
  const outline = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  outline.forEach((s, i) => segments.set(s, i * 4));
  const snap: number[] = [x0, y0, x1, y0, x1, y1, x0, y1];
  for (let i = 4; i < total; i++) {
    const x = cx0 + rnd() * (cx1 - cx0);
    const y = cy0 + rnd() * (cy1 - cy0);
    const len = 60 + rnd() * 500;
    const horizontal = rnd() < 0.5;
    const ex = horizontal ? x + len : x;
    const ey = horizontal ? y : y + len;
    segments.set([x, y, ex, ey], i * 4);
    snap.push(x, y, ex, ey);
  }
  return { segments, snapPoints: new Float32Array(snap) };
}
