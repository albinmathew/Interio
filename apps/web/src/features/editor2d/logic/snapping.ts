/**
 * Pointer snapping for every tool. Wraps core `snap()` (vertices > underlay
 * points > walls) and adds axis alignment with existing vertices, the Shift
 * angle lock and a tidy rounding step for free points.
 */
import { snap, vec, type Id, type Level, type Pt, type SnapHit } from '@interio/core';

export type SnapKind = 'vertex' | 'underlay' | 'wall' | 'align' | 'point';

export interface Guide {
  /** The vertex (or chain point) the cursor is aligned with. */
  from: Pt;
  to: Pt;
}

export interface SnapContext {
  /** Snap radius in plan mm (a fixed number of screen pixels). */
  tolMm: number;
  underlayPoints?: Float32Array | null;
  /** Anchor of the segment being drawn: previous wall point, drag origin. */
  from?: Pt | null;
  /** Shift: lock the direction from `from` to multiples of 45 degrees. */
  lockAngle?: boolean;
  /** Alt: no snapping at all (the angle lock still applies). */
  disabled?: boolean;
  excludeVertices?: ReadonlySet<Id>;
  excludeWalls?: ReadonlySet<Id>;
  /** Points that are not vertices yet but should attract like them (the wall chain so far). */
  extraPoints?: readonly Pt[];
  /** Free points are rounded to this step. */
  gridStep?: number;
}

export interface SnapResult {
  point: Pt;
  /** What attracted the point, for the on-canvas indicator. Null when it is free. */
  kind: SnapKind | null;
  /** The plan element exactly under the result (a vertex or a wall), if any. */
  hit: Extract<SnapHit, { kind: 'vertex' | 'wall' }> | null;
  guides: Guide[];
}

const { add, dist, dot, scale, sub, lineIntersection, projectOnSegment } = vec;

/** Unit vector from `from` towards `p`, rounded to the nearest multiple of `stepDeg`. */
export function lockDirection(from: Pt, p: Pt, stepDeg = 45): Pt {
  const step = (stepDeg * Math.PI) / 180;
  const k = Math.round(Math.atan2(p.y - from.y, p.x - from.x) / step);
  const a = k * step;
  // Exact components on the axes, so locked walls are truly horizontal or vertical.
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);
  return { x: clean(Math.cos(a)), y: clean(Math.sin(a)) };
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

function elementAt(level: Level, p: Pt, ctx: SnapContext): SnapResult['hit'] {
  const hit = snap(level, p, 1.5, { excludeVertices: ctx.excludeVertices, excludeWalls: ctx.excludeWalls });
  return hit && hit.kind !== 'underlay' ? hit : null;
}

function alignCandidates(level: Level, ctx: SnapContext): Pt[] {
  const out: Pt[] = [];
  for (const [id, v] of Object.entries(level.vertices)) if (!ctx.excludeVertices?.has(id)) out.push(v);
  if (ctx.extraPoints) out.push(...ctx.extraPoints);
  if (ctx.from) out.push(ctx.from);
  return out;
}

function nearestExtra(p: Pt, ctx: SnapContext): Pt | null {
  let best: Pt | null = null;
  let bestD = ctx.tolMm;
  for (const q of ctx.extraPoints ?? []) {
    const d = dist(p, q);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function finish(level: Level, ctx: SnapContext, point: Pt, kind: SnapKind | null, guides: Guide[] = []): SnapResult {
  return { point, kind, guides, hit: elementAt(level, point, ctx) };
}

export function resolveSnap(level: Level, raw: Pt, ctx: SnapContext): SnapResult {
  const grid = ctx.gridStep ?? 1;
  const locked = ctx.lockAngle && ctx.from ? ctx.from : null;

  if (ctx.disabled) {
    if (!locked) return { point: raw, kind: null, hit: null, guides: [] };
    const dir = lockDirection(locked, raw);
    return { point: add(locked, scale(dir, Math.max(0, dot(sub(raw, locked), dir)))), kind: null, hit: null, guides: [] };
  }

  const coreOpts = { underlayPoints: ctx.underlayPoints ?? undefined, excludeVertices: ctx.excludeVertices, excludeWalls: ctx.excludeWalls };

  if (locked) {
    const dir = lockDirection(locked, raw);
    const along = Math.max(0, dot(sub(raw, locked), dir));
    const q = add(locked, scale(dir, along));
    const offRay = (p: Pt) => Math.abs(vec.cross(dir, sub(p, locked)));

    const hit = snap(level, q, ctx.tolMm, coreOpts);
    if (hit && hit.kind !== 'wall' && offRay(hit.point) < 0.5) return finish(level, ctx, hit.point, hit.kind);

    // Where the locked ray crosses the x or y of an existing vertex.
    let best: { point: Pt; from: Pt; d: number } | null = null;
    for (const c of alignCandidates(level, ctx)) {
      for (const axis of ['x', 'y'] as const) {
        if (Math.abs(dir[axis]) < 1e-9) continue;
        const t = (c[axis] - locked[axis]) / dir[axis];
        if (t <= 0) continue;
        const point = add(locked, scale(dir, t));
        const d = dist(point, q);
        if (d <= ctx.tolMm && (!best || d < best.d) && dist(point, c) > 1) best = { point, from: c, d };
      }
    }
    if (hit?.kind === 'wall') {
      const w = level.walls[hit.wallId];
      const a = w && level.vertices[w.a];
      const b = w && level.vertices[w.b];
      const cross = a && b ? lineIntersection(locked, dir, a, sub(b, a)) : null;
      if (cross && a && b && dist(cross, q) <= ctx.tolMm && projectOnSegment(cross, a, b).distance < 0.5 && (!best || dist(cross, q) <= best.d))
        return finish(level, ctx, cross, 'wall');
    }
    if (best) return finish(level, ctx, best.point, 'align', [{ from: best.from, to: best.point }]);
    return finish(level, ctx, add(locked, scale(dir, roundTo(along, grid))), null);
  }

  const hit = snap(level, raw, ctx.tolMm, coreOpts);
  if (hit?.kind === 'vertex') return finish(level, ctx, hit.point, 'vertex');
  const extra = nearestExtra(raw, ctx);
  if (extra) return finish(level, ctx, extra, 'point');
  if (hit?.kind === 'underlay') return finish(level, ctx, hit.point, 'underlay');

  // Axis alignment: the nearest vertex sharing (almost) the cursor's x, and likewise y.
  const alignTol = ctx.tolMm * 0.75;
  let ax: Pt | null = null;
  let ay: Pt | null = null;
  let dx = alignTol;
  let dy = alignTol;
  for (const c of alignCandidates(level, ctx)) {
    const ex = Math.abs(c.x - raw.x);
    const ey = Math.abs(c.y - raw.y);
    if (ex < dx || (ex === dx && ax && dist(c, raw) < dist(ax, raw))) {
      dx = ex;
      ax = c;
    }
    if (ey < dy || (ey === dy && ay && dist(c, raw) < dist(ay, raw))) {
      dy = ey;
      ay = c;
    }
  }

  if (hit?.kind === 'wall') {
    // Prefer the spot on the wall that also lines up with another vertex.
    const w = level.walls[hit.wallId]!;
    const a = level.vertices[w.a]!;
    const b = level.vertices[w.b]!;
    for (const [c, axisDir] of [
      [ax, { x: 0, y: 1 }],
      [ay, { x: 1, y: 0 }],
    ] as const) {
      if (!c) continue;
      const cross = lineIntersection(c, axisDir, a, sub(b, a));
      if (cross && dist(cross, raw) <= ctx.tolMm && projectOnSegment(cross, a, b).distance < 0.5 && dist(cross, c) > 1)
        return finish(level, ctx, cross, 'wall', [{ from: c, to: cross }]);
    }
    return finish(level, ctx, hit.point, 'wall');
  }

  if (ax || ay) {
    const point = { x: ax ? ax.x : roundTo(raw.x, grid), y: ay ? ay.y : roundTo(raw.y, grid) };
    const guides: Guide[] = [];
    if (ax) guides.push({ from: ax, to: point });
    if (ay) guides.push({ from: ay, to: point });
    return finish(level, ctx, point, 'align', guides);
  }
  return finish(level, ctx, { x: roundTo(raw.x, grid), y: roundTo(raw.y, grid) }, null);
}
