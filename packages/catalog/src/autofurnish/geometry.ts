/** Plan-space helpers for the layout engine: oriented rectangles and polygon tests. Millimetres, y up. */
import { vec, type Pt } from '@interio/core';

/** Corners of a w x d rectangle centred on (x, y) and rotated CCW by `rotDeg`. Counter-clockwise. */
export function rectCorners(x: number, y: number, w: number, d: number, rotDeg: number): Pt[] {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hd = d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, ly]) => ({ x: x + lx! * c - ly! * s, y: y + lx! * s + ly! * c }));
}

/** Item-local offset (lx along the width, ly along the depth; the front is -ly) to plan space. */
export function localToPlan(x: number, y: number, rotDeg: number, lx: number, ly: number): Pt {
  const p = vec.rotate({ x: lx, y: ly }, rotDeg);
  return { x: x + p.x, y: y + p.y };
}

/** Rotation that makes an item's front point along `dir`. */
export function rotationFacing(dir: Pt): number {
  return normaliseDeg((Math.atan2(dir.y, dir.x) * 180) / Math.PI + 90);
}

export function normaliseDeg(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  const rounded = Math.round(r * 100) / 100;
  return rounded >= 360 ? 0 : rounded;
}

function project(poly: Pt[], axis: Pt): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Separating-axis test for two convex polygons. Touching (within `eps`) does not count as overlap. */
export function convexOverlap(a: Pt[], b: Pt[], eps = 0.5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const axis = vec.norm({ x: -(q.y - p.y), y: q.x - p.x });
      if (axis.x === 0 && axis.y === 0) continue;
      const [a0, a1] = project(a, axis);
      const [b0, b1] = project(b, axis);
      if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
    }
  }
  return true;
}

/** Shrinks a convex polygon towards its centroid by `amount` mm (approximately, per vertex). */
export function shrink(poly: Pt[], amount: number): Pt[] {
  const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return poly.map((p) => {
    const d = vec.sub(c, p);
    const l = vec.len(d);
    return l < amount ? c : vec.add(p, vec.scale(d, amount / l));
  });
}

/** True when the convex polygon `inner` lies inside the simple polygon `outer` (touching the boundary is allowed). */
export function insidePolygon(inner: Pt[], outer: Pt[], tolerance = 2): boolean {
  const test = shrink(inner, tolerance);
  for (const p of test) if (!vec.pointInPolygon(p, outer)) return false;
  // Concave rooms: a wall corner may poke into the rectangle, or an edge may cross it.
  for (const v of outer) if (vec.pointInPolygon(v, test)) return false;
  for (let i = 0; i < test.length; i++) {
    const a = test[i]!;
    const b = test[(i + 1) % test.length]!;
    for (let j = 0; j < outer.length; j++) if (vec.segmentIntersection(a, b, outer[j]!, outer[(j + 1) % outer.length]!)) return false;
  }
  return true;
}

/** Distance from `origin` along the unit vector `dir` to the first polygon edge it hits, or Infinity. */
export function rayToPolygon(origin: Pt, dir: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const e = vec.sub(poly[(i + 1) % poly.length]!, a);
    const den = vec.cross(dir, e);
    if (Math.abs(den) < 1e-9) continue;
    const t = vec.cross(vec.sub(a, origin), e) / den;
    const u = vec.cross(vec.sub(a, origin), dir) / den;
    if (t > 1 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return best;
}

/** Shortest distance from a point to the boundary of a polygon. */
export function distanceToBoundary(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, vec.projectOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!).distance);
  return best;
}
