/**
 * Smooth camera paths for the cinematic tour: a centripetal Catmull-Rom spline through the
 * corners of a walking route, sampled evenly, that falls back to the route itself wherever
 * the curve would cut through a wall or a piece of furniture. Pure: runs in Node.
 */
import { vec, type Pt } from '@interio/core';

/** Drops points closer than `tolerance` (mm) to the line through their neighbours (Douglas-Peucker). */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let far = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = vec.projectOnSegment(points[i]!, points[a]!, points[b]!).distance;
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Point at `t` (0..1) of the centripetal Catmull-Rom segment from p1 to p2 (Barry and
 * Goldman's form). Centripetal parameterisation never loops or overshoots at tight corners.
 */
function segmentPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const knot = (a: Pt, b: Pt) => Math.max(Math.sqrt(vec.dist(a, b)), 1e-3);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: Pt, b: Pt, ta: number, tb: number) => vec.lerp(a, b, (u - ta) / (tb - ta));
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Samples of segment i (from points[i] to points[i+1]) of the spline through `points`, about every `step` mm, end excluded. */
function segmentSamples(points: Pt[], i: number, step: number): Pt[] {
  const n = points.length;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  // Mirrored phantom points at the ends keep the end tangents along the route.
  const p0 = i > 0 ? points[i - 1]! : vec.sub(vec.scale(p1, 2), p2);
  const p3 = i + 2 < n ? points[i + 2]! : vec.sub(vec.scale(p2, 2), p1);
  const count = Math.max(1, Math.ceil(vec.dist(p1, p2) / step));
  const out: Pt[] = [];
  for (let k = 0; k < count; k++) out.push(segmentPoint(p0, p1, p2, p3, k / count));
  return out;
}

/** The spline through every point, sampled about every `step` mm. */
export function catmullRom(points: Pt[], step = 50): Pt[] {
  if (points.length < 2) return points.slice();
  const out: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i++) out.push(...segmentSamples(points, i, step));
  out.push(points[points.length - 1]!);
  return out;
}

/** Straight samples from a to b, end excluded. */
function line(a: Pt, b: Pt, step: number): Pt[] {
  const count = Math.max(1, Math.ceil(vec.dist(a, b) / step));
  return Array.from({ length: count }, (_, k) => vec.lerp(a, b, k / count));
}

/**
 * A smooth glide along a walking route: the spline through the route's corners (points
 * within `tolerance` of a straight run are dropped first). Where a stretch of the curve
 * would leave walkable floor (`ok` false for a sample), that stretch is first retried
 * through the route's own points and otherwise walked straight, as the route does.
 * Starts and ends exactly where the route does.
 */
export function smoothPath(route: Pt[], ok: (p: Pt) => boolean, opts: { step?: number; tolerance?: number } = {}): Pt[] {
  const step = opts.step ?? 50;
  if (route.length < 3) return route.length < 2 ? route.slice() : [...line(route[0]!, route[route.length - 1]!, step), route[route.length - 1]!];
  const corners = simplify(route, opts.tolerance ?? 150);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const swoop = segmentSamples(corners, i, step);
    if (swoop.every(ok)) {
      out.push(...swoop);
      continue;
    }
    // The route's own points between these two corners: a tighter spline, then straight lines.
    const from = route.indexOf(corners[i]!);
    const to = route.indexOf(corners[i + 1]!);
    const inner = route.slice(from, to + 1);
    const tight = inner.length > 2 ? catmullRom(inner, step).slice(0, -1) : null;
    if (tight && tight.every(ok)) out.push(...tight);
    else for (let k = 0; k + 1 < inner.length; k++) out.push(...line(inner[k]!, inner[k + 1]!, step));
  }
  out.push(route[route.length - 1]!);
  return out;
}

/** Largest change of heading between successive steps of a sampled path, degrees. */
export function sharpestTurn(path: Pt[]): number {
  let worst = 0;
  for (let i = 1; i + 1 < path.length; i++) {
    const a = vec.sub(path[i]!, path[i - 1]!);
    const b = vec.sub(path[i + 1]!, path[i]!);
    if (vec.len(a) < 1e-6 || vec.len(b) < 1e-6) continue;
    const c = vec.dot(vec.norm(a), vec.norm(b));
    worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return worst;
}
