/**
 * Stage 4a: hinged doors. A door is drawn as an arc (the swing) centred on the
 * hinge, plus a leaf from the hinge to one end of the arc. The other end of the
 * arc is where the closed leaf meets the opposite jamb.
 */
import type { P2 } from './strips';

export interface CurveIn {
  /** Cubic Bezier control points x0, y0, ... x3, y3. */
  p: ArrayLike<number>;
}

export interface Arc {
  centre: P2;
  radius: number;
  /** End points of the arc. */
  a: P2;
  b: P2;
  /** Swept angle in degrees. */
  sweep: number;
}

const bez = (p: ArrayLike<number>, t: number): P2 => {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return { x: a * p[0]! + b * p[2]! + c * p[4]! + d * p[6]!, y: a * p[1]! + b * p[3]! + c * p[5]! + d * p[7]! };
};

function circumcentre(a: P2, b: P2, c: P2): P2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/** Finds circular arcs among Bezier pieces and joins pieces of the same circle. */
export function findArcs(curves: CurveIn[], minR: number, maxR: number): Arc[] {
  interface Piece {
    centre: P2;
    radius: number;
    pts: P2[];
  }
  const pieces: Piece[] = [];
  for (const cv of curves) {
    const p0 = bez(cv.p, 0);
    const pm = bez(cv.p, 0.5);
    const p1 = bez(cv.p, 1);
    const centre = circumcentre(p0, pm, p1);
    if (!centre) continue;
    const radius = Math.hypot(p0.x - centre.x, p0.y - centre.y);
    if (radius < minR || radius > maxR) continue;
    const q1 = bez(cv.p, 0.25);
    const q3 = bez(cv.p, 0.75);
    const off = Math.max(
      Math.abs(Math.hypot(q1.x - centre.x, q1.y - centre.y) - radius),
      Math.abs(Math.hypot(q3.x - centre.x, q3.y - centre.y) - radius),
    );
    if (off > 0.03 * radius) continue;
    pieces.push({ centre, radius, pts: [p0, q1, pm, q3, p1] });
  }
  const groups: Piece[][] = [];
  for (const pc of pieces) {
    const g = groups.find(
      (list) =>
        Math.hypot(list[0]!.centre.x - pc.centre.x, list[0]!.centre.y - pc.centre.y) <= 0.06 * pc.radius &&
        Math.abs(list[0]!.radius - pc.radius) <= 0.04 * pc.radius,
    );
    if (g) g.push(pc);
    else groups.push([pc]);
  }
  const arcs: Arc[] = [];
  for (const g of groups) {
    const centre = {
      x: g.reduce((s, p) => s + p.centre.x, 0) / g.length,
      y: g.reduce((s, p) => s + p.centre.y, 0) / g.length,
    };
    const radius = g.reduce((s, p) => s + p.radius, 0) / g.length;
    const pts = g.flatMap((p) => p.pts);
    const angles = pts.map((p) => Math.atan2(p.y - centre.y, p.x - centre.x));
    const order = angles.map((_, i) => i).sort((i, j) => angles[i]! - angles[j]!);
    // The arc is everything except the widest empty sector.
    let gap = -1;
    let at = 0;
    for (let k = 0; k < order.length; k++) {
      const cur = angles[order[k]!]!;
      const next = k + 1 < order.length ? angles[order[k + 1]!]! : angles[order[0]!]! + 2 * Math.PI;
      if (next - cur > gap) {
        gap = next - cur;
        at = k;
      }
    }
    const b = pts[order[at]!]!;
    const a = pts[order[(at + 1) % order.length]!]!;
    arcs.push({ centre, radius, a, b, sweep: ((2 * Math.PI - gap) * 180) / Math.PI });
  }
  return arcs;
}

export interface DoorSymbol {
  hinge: P2;
  /** Where the closed leaf ends: the far jamb. */
  strike: P2;
  /** Tip of the leaf as drawn (open). */
  tip: P2;
  radius: number;
  /** 0..1: how sure we are which end of the arc is the strike. */
  confidence: number;
}

export interface LineIn {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Total length of door-layer lines drawn along hinge -> end: the leaf, when there is one. */
function leafEvidence(hinge: P2, end: P2, lines: LineIn[], radius: number): number {
  let sum = 0;
  const tol = 0.12 * radius;
  for (const l of lines) {
    const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    if (len < 0.3 * radius) continue;
    if (distToSegment({ x: l.x1, y: l.y1 }, hinge, end) > tol) continue;
    if (distToSegment({ x: l.x2, y: l.y2 }, hinge, end) > tol) continue;
    sum += len;
  }
  return sum;
}

/**
 * Turns swing arcs into door symbols. `wallSupport(hinge, end)` scores how well
 * the line hinge -> end sits in a gap between walls (higher is better, negative
 * means a wall is in the way); it decides between the two arc ends, with the
 * drawn leaf as the tie-breaker.
 */
export function findDoors(
  curves: CurveIn[],
  lines: LineIn[],
  opts: { minR: number; maxR: number; wallSupport?: (hinge: P2, end: P2) => number },
): DoorSymbol[] {
  const doors: DoorSymbol[] = [];
  for (const arc of findArcs(curves, opts.minR, opts.maxR)) {
    if (arc.sweep < 20 || arc.sweep > 115) continue;
    const leafA = leafEvidence(arc.centre, arc.a, lines, arc.radius);
    const leafB = leafEvidence(arc.centre, arc.b, lines, arc.radius);
    const supA = opts.wallSupport?.(arc.centre, arc.a) ?? 0;
    const supB = opts.wallSupport?.(arc.centre, arc.b) ?? 0;
    if (supA < 0 && supB < 0) continue;
    let strikeIsA: boolean;
    let confidence: number;
    if (supA !== supB) {
      strikeIsA = supA > supB;
      confidence = Math.max(supA, supB) >= 2 ? 0.9 : 0.7;
    } else if (leafA !== leafB) {
      strikeIsA = leafA < leafB;
      confidence = supA >= 1 ? 0.8 : 0.5;
    } else {
      strikeIsA = true;
      confidence = 0.3;
    }
    doors.push({
      hinge: arc.centre,
      strike: strikeIsA ? arc.a : arc.b,
      tip: strikeIsA ? arc.b : arc.a,
      radius: arc.radius,
      confidence,
    });
  }
  return doors;
}
