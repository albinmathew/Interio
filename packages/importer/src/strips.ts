/**
 * Stage 3: wall centrelines from wall edges.
 *
 * A wall is drawn as two opposite parallel edges, either the long sides of a
 * closed wall outline or a plain double line. `pairStrips` finds every such
 * pair and returns the strip between them: centreline, thickness and extent.
 * All geometry is in drawing units; nothing here knows the scale.
 */

export interface P2 {
  x: number;
  y: number;
}

/** Shared set of wall directions. Each has a unit direction `d` and its left normal `n`. */
export class Dirs {
  readonly list: { d: P2; n: P2; angle: number }[] = [];
  constructor(private readonly tolDeg = 1.2) {
    this.add(0);
    this.add(Math.PI / 2);
  }
  private add(angle: number): number {
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    // Keep the two principal axes exact.
    if (Math.abs(d.x) < 1e-12) d.x = 0;
    if (Math.abs(d.y) < 1e-12) d.y = 0;
    this.list.push({ d, n: { x: -d.y, y: d.x }, angle });
    return this.list.length - 1;
  }
  /** Index of the direction of vector (dx, dy), creating a new one when none is within tolerance. */
  index(dx: number, dy: number): number {
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI) a -= Math.PI;
    const tol = (this.tolDeg * Math.PI) / 180;
    let best = -1;
    let bestD = tol;
    for (let i = 0; i < this.list.length; i++) {
      let diff = Math.abs(a - this.list[i]!.angle);
      if (diff > Math.PI / 2) diff = Math.PI - diff;
      if (diff <= bestD) {
        bestD = diff;
        best = i;
      }
    }
    return best >= 0 ? best : this.add(a);
  }
  u(dir: number, p: P2): number {
    const { d } = this.list[dir]!;
    return d.x * p.x + d.y * p.y;
  }
  c(dir: number, p: P2): number {
    const { n } = this.list[dir]!;
    return n.x * p.x + n.y * p.y;
  }
  point(dir: number, u: number, c: number): P2 {
    const { d, n } = this.list[dir]!;
    return { x: d.x * u + n.x * c, y: d.y * u + n.y * c };
  }
  /** Sine of the angle between two directions (0 when parallel). */
  sin(a: number, b: number): number {
    const p = this.list[a]!.d;
    const q = this.list[b]!.d;
    return Math.abs(p.x * q.y - p.y * q.x);
  }
}

export interface EdgeIn {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Path the edge belongs to; used to find which side of a closed outline is solid. */
  path?: number;
}

export interface Strip {
  dir: number;
  /** Offset of the centreline along the direction's normal. */
  c: number;
  /** Thickness. */
  t: number;
  u1: number;
  u2: number;
}

interface Item {
  c: number;
  u1: number;
  u2: number;
  /** +1 when the solid side is towards +n, -1 towards -n, 0 unknown. */
  s: number;
  paired: number;
}

type Interval = [number, number];

function subtract(list: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (cut[1] <= a || cut[0] >= b) out.push([a, b]);
    else {
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
    }
  }
  return out;
}

/** Which closed paths are counter-clockwise (+1) or clockwise (-1). Open paths are absent. */
export function pathWinding(edges: EdgeIn[], eps = 0.02): Map<number, number> {
  const byPath = new Map<number, EdgeIn[]>();
  for (const e of edges) {
    if (e.path === undefined) continue;
    const list = byPath.get(e.path);
    if (list) list.push(e);
    else byPath.set(e.path, [e]);
  }
  const out = new Map<number, number>();
  for (const [id, list] of byPath) {
    if (list.length < 3) continue;
    let closed = true;
    let area = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const nx = list[(i + 1) % list.length]!;
      if (Math.abs(e.x2 - nx.x1) > eps || Math.abs(e.y2 - nx.y1) > eps) {
        closed = false;
        break;
      }
      area += e.x1 * e.y2 - e.x2 * e.y1;
    }
    if (closed && Math.abs(area) > 1e-9) out.set(id, area > 0 ? 1 : -1);
  }
  return out;
}

function toItems(edges: EdgeIn[], dirs: Dirs, oriented: boolean, minLen: number, eps: number): Map<number, Item[]> {
  const winding = oriented ? pathWinding(edges) : new Map<number, number>();
  const byDir = new Map<number, Item[]>();
  for (const e of edges) {
    const dx = e.x2 - e.x1;
    const dy = e.y2 - e.y1;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;
    const dir = dirs.index(dx, dy);
    const { d, n } = dirs.list[dir]!;
    const ua = d.x * e.x1 + d.y * e.y1;
    const ub = d.x * e.x2 + d.y * e.y2;
    const c = (n.x * (e.x1 + e.x2) + n.y * (e.y1 + e.y2)) / 2;
    let s = 0;
    const w = e.path === undefined ? undefined : winding.get(e.path);
    if (w) {
      // Solid side of a CCW outline is the left of each directed edge.
      const lx = (-dy / len) * w;
      const ly = (dx / len) * w;
      s = lx * n.x + ly * n.y > 0 ? 1 : -1;
    }
    const item: Item = { c, u1: Math.min(ua, ub), u2: Math.max(ua, ub), s, paired: 0 };
    const list = byDir.get(dir);
    if (list) list.push(item);
    else byDir.set(dir, [item]);
  }
  // Merge collinear pieces that touch or overlap (CAD exports split long lines).
  for (const [dir, list] of byDir) {
    list.sort((a, b) => a.c - b.c || a.u1 - b.u1);
    const merged: Item[] = [];
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1]!.c - list[i]!.c <= eps) j++;
      const group = list.slice(i, j + 1).sort((a, b) => a.s - b.s || a.u1 - b.u1);
      let cur: Item | null = null;
      for (const it of group) {
        if (cur && cur.s === it.s && it.u1 <= cur.u2 + eps) cur.u2 = Math.max(cur.u2, it.u2);
        else {
          if (cur) merged.push(cur);
          cur = { ...it };
        }
      }
      if (cur) merged.push(cur);
      i = j + 1;
    }
    merged.sort((a, b) => a.c - b.c);
    byDir.set(dir, merged);
  }
  return byDir;
}

function pairItems(byDir: Map<number, Item[]>, maxT: number, minOverlap: number, oriented: boolean, eps: number): Strip[] {
  const out: Strip[] = [];
  for (const [dir, list] of byDir) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      let remaining: Interval[] = [[a.u1, a.u2]];
      for (let j = i + 1; j < list.length && remaining.length > 0; j++) {
        const b = list[j]!;
        const t = b.c - a.c;
        if (t > maxT) break;
        if (t <= eps) continue;
        const ok = !oriented || (a.s >= 0 && b.s <= 0);
        let hit = false;
        for (const [lo, hi] of remaining) {
          const u1 = Math.max(lo, b.u1);
          const u2 = Math.min(hi, b.u2);
          if (u2 - u1 <= eps) continue;
          hit = true;
          if (ok && u2 - u1 >= minOverlap) {
            out.push({ dir, c: (a.c + b.c) / 2, t, u1, u2 });
            a.paired += u2 - u1;
            b.paired += u2 - u1;
          }
        }
        // The nearer edge hides whatever lies behind it.
        if (hit) remaining = subtract(remaining, [b.u1, b.u2]);
      }
    }
  }
  return out;
}

export interface PairOptions {
  /** Largest thickness to accept. */
  maxT: number;
  /** Shortest overlap of the two edges to accept. */
  minOverlap?: number;
  /** Use the winding of closed outlines to require solid material between the two edges. */
  oriented?: boolean | 'auto';
  /** Edges shorter than this are ignored. */
  minLen?: number;
  eps?: number;
}

export interface PairResult {
  strips: Strip[];
  /** Edges (after collinear merging) that found no partner: candidates for single-line walls. */
  singles: { dir: number; c: number; u1: number; u2: number }[];
  oriented: boolean;
}

const totalLength = (strips: Strip[]): number => strips.reduce((s, x) => s + (x.u2 - x.u1), 0);

export function pairStrips(edges: EdgeIn[], dirs: Dirs, opts: PairOptions): PairResult {
  const eps = opts.eps ?? 0.03;
  const minLen = opts.minLen ?? eps * 4;
  const minOverlap = opts.minOverlap ?? eps * 4;
  const run = (oriented: boolean) => {
    const items = toItems(edges, dirs, oriented, minLen, eps);
    const strips = pairItems(items, opts.maxT, minOverlap, oriented, eps);
    const singles: PairResult['singles'] = [];
    for (const [dir, list] of items) {
      for (const it of list) if (it.paired < 0.5 * (it.u2 - it.u1)) singles.push({ dir, c: it.c, u1: it.u1, u2: it.u2 });
    }
    return { strips, singles, oriented };
  };
  if (opts.oriented === false) return run(false);
  const plain = run(false);
  const strict = run(true);
  if (opts.oriented === true) return strict;
  // Outlines that wrap rooms instead of walls have their solid side outside: fall back to plain pairing.
  return totalLength(strict.strips) >= 0.7 * totalLength(plain.strips) ? strict : plain;
}

/**
 * Merges strips that lie side by side (sharing a face) into one thicker strip.
 * Windows and railings are drawn as three or four parallel lines; this turns
 * the thin slices between them into one strip across the whole wall.
 */
export function mergeStacked(strips: Strip[], eps = 0.05, minShare = 0.7): Strip[] {
  const out = strips.map((s) => ({ ...s }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (a.dir !== b.dir) continue;
        const aLo = a.c - a.t / 2;
        const aHi = a.c + a.t / 2;
        const bLo = b.c - b.t / 2;
        const bHi = b.c + b.t / 2;
        const touching = Math.abs(aHi - bLo) <= eps || Math.abs(bHi - aLo) <= eps;
        if (!touching) continue;
        const ov = Math.min(a.u2, b.u2) - Math.max(a.u1, b.u1);
        if (ov < minShare * Math.min(a.u2 - a.u1, b.u2 - b.u1)) continue;
        const lo = Math.min(aLo, bLo);
        const hi = Math.max(aHi, bHi);
        out[i] = { dir: a.dir, c: (lo + hi) / 2, t: hi - lo, u1: Math.min(a.u1, b.u1), u2: Math.max(a.u2, b.u2) };
        out.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return out;
}

/** The most common strip thickness, weighted by length. Null when there are no strips. */
export function dominantThickness(strips: Strip[], window = 0.06): number | null {
  const usable = strips.filter((s) => s.u2 - s.u1 >= s.t);
  if (usable.length === 0) return null;
  let best = 0;
  let bestW = -1;
  for (const s of usable) {
    let w = 0;
    let sum = 0;
    for (const o of usable) {
      if (Math.abs(o.t - s.t) <= window * s.t) {
        const l = o.u2 - o.u1;
        w += l;
        sum += l * o.t;
      }
    }
    if (w > bestW) {
      bestW = w;
      best = sum / w;
    }
  }
  return best;
}
