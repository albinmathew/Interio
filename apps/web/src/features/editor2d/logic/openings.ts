/** Opening defaults, placement on walls, and the architectural symbols drawn for them. */
import { DEFAULTS, ops, vec, type Id, type Level, type Opening, type OpeningKind, type Pt } from '@interio/core';

const { add, scale, sub, norm, perp, dot, cross } = vec;

/** Clear margin `clampOpening` keeps between an opening and the wall ends. */
export const END_MARGIN = 50;
const MIN_WIDTH = 200;

export function defaultOpening(kind: OpeningKind): Pick<Opening, 'kind' | 'width' | 'height' | 'sill'> {
  switch (kind) {
    case 'door':
      return { kind, width: DEFAULTS.doorWidth, height: DEFAULTS.doorHeight, sill: 0 };
    case 'sliding':
      return { kind, width: 2 * DEFAULTS.doorWidth, height: DEFAULTS.slidingHeight, sill: 0 };
    case 'window':
      return { kind, width: DEFAULTS.windowWidth, height: DEFAULTS.windowHeight, sill: DEFAULTS.windowSill };
    case 'passage':
      return { kind, width: 1200, height: DEFAULTS.doorHeight, sill: 0 };
  }
}

export interface Placement {
  wallId: Id;
  offset: number;
  width: number;
  hinge: 'a' | 'b';
  swing: 1 | -1;
  /** False when the opening cannot go here; `reason` says why. */
  valid: boolean;
  reason?: string;
}

/** Other openings on the wall overlapping [offset - width/2, offset + width/2]. */
export function overlaps(level: Level, wallId: Id, offset: number, width: number, ignoreId?: Id): boolean {
  const s0 = offset - width / 2;
  const s1 = offset + width / 2;
  return Object.values(level.openings).some(
    (o) => o.wallId === wallId && o.id !== ignoreId && s0 < o.offset + o.width / 2 && o.offset - o.width / 2 < s1,
  );
}

/**
 * Where an opening of `width` would land for a pointer at `p`: on the nearest
 * wall within `tolMm` of its face, centred under the pointer, kept inside the
 * wall. The swing follows the side of the wall the pointer is on and the hinge
 * goes to the nearer wall end.
 */
export function placeOpening(level: Level, p: Pt, width: number, tolMm: number, ignoreId?: Id): Placement | null {
  let best: { wallId: Id; t: number; gap: number } | null = null;
  for (const w of Object.values(level.walls)) {
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    if (!a || !b) continue;
    const pr = vec.projectOnSegment(p, a, b);
    const gap = pr.distance - w.thickness / 2;
    if (gap <= tolMm && (!best || gap < best.gap)) best = { wallId: w.id, t: pr.t, gap };
  }
  if (!best) return null;
  const wall = level.walls[best.wallId]!;
  const { a, b } = ops.wallEnds(level, wall);
  const length = vec.dist(a, b);
  const swing: 1 | -1 = cross(sub(b, a), sub(p, a)) >= 0 ? 1 : -1;
  const maxWidth = length - 2 * END_MARGIN;
  const base = { wallId: wall.id, swing, hinge: (best.t <= 0.5 ? 'a' : 'b') as 'a' | 'b' };
  if (maxWidth < MIN_WIDTH) return { ...base, offset: length / 2, width: Math.max(0, maxWidth), valid: false, reason: 'This wall is too short' };
  const w = Math.round(Math.min(width, maxWidth));
  const lo = END_MARGIN + w / 2;
  const hi = length - END_MARGIN - w / 2;
  let offset = Math.round((best.t * length) / 10) * 10;
  if (Math.abs(offset - length / 2) <= tolMm * 0.6) offset = length / 2;
  offset = Math.round(Math.max(lo, Math.min(hi, offset)));
  if (overlaps(level, wall.id, offset, w, ignoreId)) return { ...base, offset, width: w, valid: false, reason: 'Overlaps another opening' };
  return { ...base, offset, width: w, valid: true };
}

export interface OpeningSymbol {
  kind: OpeningKind;
  /** Jamb points on the centreline nearer vertex a (`left`) and b (`right`). */
  left: Pt;
  right: Pt;
  /** The gap in the wall: left-face a-side, left-face b-side, right-face b-side, right-face a-side. */
  gap: [Pt, Pt, Pt, Pt];
  /** Straight strokes: door leaf, glass lines, passage edges. */
  lines: [Pt, Pt][];
  /** Closed outlines: window frame, sliding panels. */
  rects: Pt[][];
  /** Door swing: quarter circle from the open leaf tip to the strike jamb, centred on the hinge. */
  arc?: { center: Pt; from: Pt; to: Pt; radius: number };
}

export interface WallFrame {
  a: Pt;
  dir: Pt;
  normal: Pt;
  thickness: number;
}

export function wallFrame(level: Level, wallId: Id): WallFrame | null {
  const wall = level.walls[wallId];
  const a = wall && level.vertices[wall.a];
  const b = wall && level.vertices[wall.b];
  if (!wall || !a || !b) return null;
  const dir = norm(sub(b, a));
  return { a, dir, normal: perp(dir), thickness: wall.thickness };
}

/** Plan-space geometry of an opening's drawing symbol. */
export function openingSymbol(f: WallFrame, o: Pick<Opening, 'offset' | 'width' | 'kind' | 'hinge' | 'swing'>): OpeningSymbol {
  const h = f.thickness / 2;
  const at = (s: number, n: number): Pt => add(add(f.a, scale(f.dir, s)), scale(f.normal, n));
  const s0 = o.offset - o.width / 2;
  const s1 = o.offset + o.width / 2;
  const sym: OpeningSymbol = {
    kind: o.kind,
    left: at(s0, 0),
    right: at(s1, 0),
    gap: [at(s0, h), at(s1, h), at(s1, -h), at(s0, -h)],
    lines: [],
    rects: [],
  };
  switch (o.kind) {
    case 'door': {
      const side = o.swing === -1 ? -1 : 1;
      const hingeS = o.hinge === 'b' ? s1 : s0;
      const strikeS = o.hinge === 'b' ? s0 : s1;
      const center = at(hingeS, side * h);
      const tip = at(hingeS, side * (h + o.width));
      const strike = at(strikeS, side * h);
      sym.lines.push([center, tip]);
      sym.arc = { center, from: tip, to: strike, radius: o.width };
      break;
    }
    case 'sliding': {
      // Two overlapping panels either side of the centreline.
      const p = Math.max(20, Math.min(45, h * 0.55));
      const lap = o.width * 0.06;
      const m = (s0 + s1) / 2;
      sym.rects.push([at(s0, 0), at(m + lap, 0), at(m + lap, p), at(s0, p)]);
      sym.rects.push([at(m - lap, -p), at(s1, -p), at(s1, 0), at(m - lap, 0)]);
      break;
    }
    case 'window': {
      sym.rects.push([...sym.gap]);
      const g = h > 60 ? h / 3 : 0;
      if (g) sym.lines.push([at(s0, g), at(s1, g)], [at(s0, -g), at(s1, -g)]);
      else sym.lines.push([at(s0, 0), at(s1, 0)]);
      break;
    }
    case 'passage':
      sym.lines.push([at(s0, h), at(s1, h)], [at(s0, -h), at(s1, -h)]);
      break;
  }
  return sym;
}

/** Offset along a wall (from vertex a) of the projection of `p`. */
export function offsetOnWall(level: Level, wallId: Id, p: Pt): number | null {
  const f = wallFrame(level, wallId);
  return f ? dot(sub(p, f.a), f.dir) : null;
}
