/**
 * Stage 5: millimetres per drawing unit.
 *
 * Three independent estimates, most trusted first:
 *  - dimension: labelled room sizes against the measured clear spans,
 *  - wallThickness: the dominant wall strip against its nominal thickness,
 *  - titleBlock: the scale written on the sheet (plots are often "fit to paper",
 *    so this one is nominal).
 */
import type { ScaleEstimate } from '@interio/core';
import type { P2 } from './strips';

/** Millimetres per PDF point at 1:1. */
export const MM_PER_PT = 25.4 / 72;

/** Reads "SCALE - 1:50", "1 : 100", "Scale 1/75". Returns the denominator. */
export function parseScaleText(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.match(/1\s*[:/]\s*(\d{1,4})(?!\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 2000 ? n : null;
}

const STANDARD_WALLS = [75, 100, 115, 125, 150, 160, 200, 230, 250, 300];

/** Nominal thickness for a measured wall when the layer name does not give one. */
export function nearestStandardWall(mm: number, tolerance = 0.08): number | null {
  let best: number | null = null;
  let bestD = tolerance;
  for (const w of STANDARD_WALLS) {
    const d = Math.abs(mm - w) / w;
    if (d <= bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export interface WallSeg {
  a: P2;
  b: P2;
  t: number;
}

/**
 * Clear span through `p` along each axis: the distance between the wall faces
 * on either side. Null when a ray leaves the plan without meeting a wall.
 */
export function clearSpans(p: P2, walls: WallSeg[], axes: [P2, P2]): [number | null, number | null] {
  const cast = (d: P2): number | null => {
    let best: number | null = null;
    for (const w of walls) {
      const ex = w.b.x - w.a.x;
      const ey = w.b.y - w.a.y;
      const len = Math.hypot(ex, ey);
      if (len < 1e-9) continue;
      const den = d.x * ey - d.y * ex;
      const sin = Math.abs(den) / len;
      if (sin < 0.3) continue;
      const qx = w.a.x - p.x;
      const qy = w.a.y - p.y;
      const s = (qx * ey - qy * ex) / den;
      const k = (qx * d.y - qy * d.x) / den;
      const slack = w.t / 2 / len;
      if (s <= 0 || k < -slack || k > 1 + slack) continue;
      const face = s - w.t / 2 / sin;
      if (face > 0 && (best === null || face < best)) best = face;
    }
    return best;
  };
  const span = (d: P2): number | null => {
    const f = cast(d);
    const g = cast({ x: -d.x, y: -d.y });
    return f === null || g === null ? null : f + g;
  };
  return [span(axes[0]), span(axes[1])];
}

/**
 * Every clear width of a polygon along the two axes: for each band between
 * consecutive corners, the length of the chords across it. An L-shaped room
 * reports both its main span and the span through its lobe.
 */
export function polygonSpans(poly: P2[], axes: [P2, P2], minBand = 100): [number[], number[]] {
  const chords = (along: P2, across: P2): number[] => {
    const pts = poly.map((p) => ({ u: p.x * along.x + p.y * along.y, v: p.x * across.x + p.y * across.y }));
    const levels = [...new Set(pts.map((p) => Math.round(p.v)))].sort((a, b) => a - b);
    const out: number[] = [];
    for (let i = 0; i + 1 < levels.length; i++) {
      if (levels[i + 1]! - levels[i]! < minBand) continue;
      const v = (levels[i]! + levels[i + 1]!) / 2;
      const xs: number[] = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k]!;
        const b = pts[(k + 1) % pts.length]!;
        if (a.v > v !== b.v > v) xs.push(a.u + ((b.u - a.u) * (v - a.v)) / (b.v - a.v));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) out.push(xs[k + 1]! - xs[k]!);
    }
    return out;
  };
  return [chords(axes[0], axes[1]), chords(axes[1], axes[0])];
}

/**
 * Scale from labelled dimensions. Every label gives up to four candidate ratios
 * (two dimensions, two orientations); the true scale is where they pile up.
 */
export function dimensionScale(
  labels: { dims: [number, number]; spans: [number | null, number | null] }[],
  prior?: number | null,
): { value: number; support: number } | null {
  const candidates: { r: number; label: number }[] = [];
  labels.forEach((l, i) => {
    for (const d of l.dims) {
      for (const s of l.spans) {
        if (!s || s <= 0 || d <= 0) continue;
        const r = d / s;
        if (prior && Math.abs(r - prior) > 0.2 * prior) continue;
        candidates.push({ r, label: i });
      }
    }
  });
  let best: { value: number; support: number } | null = null;
  let bestKey = -1;
  for (const c of candidates) {
    const near = candidates.filter((o) => Math.abs(o.r - c.r) <= 0.012 * c.r);
    const support = new Set(near.map((o) => o.label)).size;
    const key = support * 1000 + near.length;
    if (key <= bestKey) continue;
    bestKey = key;
    const sorted = near.map((o) => o.r).sort((x, y) => x - y);
    best = { value: sorted[Math.floor(sorted.length / 2)]!, support };
  }
  return best && best.support >= 2 ? best : null;
}

export interface ScaleCandidates {
  dimension: number | null;
  wallThickness: number | null;
  titleBlock: number | null;
}

export function chooseScale(c: ScaleCandidates, user?: number | null, fallback = MM_PER_PT * 100): ScaleEstimate {
  const values = [c.dimension, c.wallThickness, c.titleBlock].filter((v): v is number => typeof v === 'number' && v > 0);
  const pick: { mmPerPdfUnit: number; source: ScaleEstimate['source'] } =
    user && user > 0
      ? { mmPerPdfUnit: user, source: 'user' }
      : c.dimension
        ? { mmPerPdfUnit: c.dimension, source: 'dimension' }
        : c.wallThickness
          ? { mmPerPdfUnit: c.wallThickness, source: 'wallThickness' }
          : { mmPerPdfUnit: c.titleBlock ?? fallback, source: 'titleBlock' };
  const spreadPct = values.length >= 2 ? ((Math.max(...values) - Math.min(...values)) / pick.mmPerPdfUnit) * 100 : 0;
  return { ...pick, spreadPct: Math.round(spreadPct * 100) / 100 };
}
