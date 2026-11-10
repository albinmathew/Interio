/**
 * Stage 4b: from loose strips to connected walls.
 *
 * Wall strips, window strips and door bridges that lie on one line are chained
 * into a `Run`: a single wall carrying its openings. Gaps between collinear
 * strips become passages. Run ends are then snapped onto the centrelines of the
 * walls they meet, so corners and T-junctions share a vertex.
 *
 * Everything is in drawing units and expressed relative to `T`, the dominant
 * wall thickness, so the stage needs no scale.
 */
import type { DoorSymbol } from './doors';
import { Dirs, type P2, type Strip } from './strips';

export type RunKind = 'wall' | 'low' | 'railing';
export type GapKind = 'door' | 'window' | 'glazed' | 'passage';

export interface RunOpening {
  u1: number;
  u2: number;
  kind: GapKind;
  /** Hinged doors: position of the hinge along the run and the side (+1 = +n) the leaf swings to. */
  hingeU?: number;
  swingSide?: 1 | -1;
  confidence: number;
}

export interface Run {
  dir: number;
  c: number;
  t: number;
  u1: number;
  u2: number;
  kind: RunKind;
  openings: RunOpening[];
  confidence: number;
}

export interface TopologyInput {
  dirs: Dirs;
  /** Dominant wall thickness in drawing units. */
  T: number;
  walls: Strip[];
  /** Strips shorter than they are thick: nibs and jamb returns. Used to line doors up, never as walls. */
  stubs: Strip[];
  glazing: { strip: Strip; kind: 'window' | 'glazed' }[];
  doors: DoorSymbol[];
  low: { strip: Strip; kind: 'low' | 'railing' }[];
  /** Rough centre of the plan; tells which side of a railing faces out. */
  centre?: P2;
  /** Widest gap between collinear walls that is still read as a passage, in units of T. */
  maxPassage?: number;
}

interface Piece extends Strip {
  kind: 'wall' | GapKind;
  hingeU?: number;
  swingSide?: 1 | -1;
  confidence: number;
}

const gapBetween = (a1: number, a2: number, b1: number, b2: number): number => Math.max(b1 - a2, a1 - b2, 0);
const overlap = (a1: number, a2: number, b1: number, b2: number): number => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Directions that carry wall strips. */
export function wallDirections(walls: Strip[]): number[] {
  return [...new Set(walls.map((s) => s.dir))];
}

/** Direction of (dx, dy), pulled onto a wall direction when it is within `tolDeg` of one. */
export function snapDirection(dirs: Dirs, wallDirs: number[], dx: number, dy: number, tolDeg = 12): number {
  const len = Math.hypot(dx, dy) || 1;
  let best = -1;
  let bestSin = Math.sin((tolDeg * Math.PI) / 180);
  for (const i of wallDirs) {
    const d = dirs.list[i]!.d;
    const sin = Math.abs((dx * d.y - dy * d.x) / len);
    if (sin <= bestSin) {
      bestSin = sin;
      best = i;
    }
  }
  return best >= 0 ? best : dirs.index(dx, dy);
}

/**
 * Scores the line p -> q as a place for an opening: +1 for each end that meets
 * wall (a collinear wall end or a crossing wall), -1 when wall already fills it.
 */
export function makeWallSupport(dirs: Dirs, T: number, walls: Strip[], stubs: Strip[], glazing: Strip[] = []) {
  const wallDirs = wallDirections(walls);
  const supportAt = (dir: number, u: number, c: number, lo: number, hi: number): boolean => {
    const p = dirs.point(dir, u, c);
    for (const s of walls) {
      if (s.dir === dir) {
        if (Math.abs(s.c - c) > s.t / 2 + 0.75 * T) continue;
        if (overlap(s.u1, s.u2, lo, hi) > 1.5 * T) continue;
        if (gapBetween(s.u1, s.u2, u, u) <= 2 * T) return true;
      } else if (dirs.sin(dir, s.dir) > 0.5) {
        const off = Math.abs(dirs.c(s.dir, p) - s.c);
        const along = dirs.u(s.dir, p);
        if (off <= s.t / 2 + 2 * T && along >= s.u1 - T && along <= s.u2 + T) return true;
      }
    }
    for (const s of [...stubs, ...glazing]) {
      if (s.dir !== dir || Math.abs(s.c - c) > s.t / 2 + 0.75 * T) continue;
      if (overlap(s.u1, s.u2, lo, hi) > 1.5 * T) continue;
      if (gapBetween(s.u1, s.u2, u, u) <= 1.5 * T) return true;
    }
    return false;
  };
  return (p: P2, q: P2): number => {
    const dir = snapDirection(dirs, wallDirs, q.x - p.x, q.y - p.y);
    const c = (dirs.c(dir, p) + dirs.c(dir, q)) / 2;
    const up = dirs.u(dir, p);
    const uq = dirs.u(dir, q);
    const lo = Math.min(up, uq);
    const hi = Math.max(up, uq);
    // A wall along the line means this is the open leaf resting against a wall, not the opening.
    for (const s of walls) {
      if (s.dir !== dir || Math.abs(s.c - c) > s.t / 2 + 1.5 * T) continue;
      if (overlap(s.u1, s.u2, lo, hi) > 0.5 * (hi - lo)) return -1;
    }
    return (supportAt(dir, up, c, lo, hi) ? 1 : 0) + (supportAt(dir, uq, c, lo, hi) ? 1 : 0);
  };
}

/** Moves an opening strip onto the centreline of the wall it interrupts. */
function align(piece: Piece, walls: Strip[], stubs: Strip[], T: number): void {
  let best: Strip | null = null;
  let bestScore = Infinity;
  for (const s of walls) {
    if (s.dir !== piece.dir) continue;
    const dc = Math.abs(s.c - piece.c);
    if (dc > s.t / 2 + 0.75 * T) continue;
    const gap = gapBetween(s.u1, s.u2, piece.u1, piece.u2);
    if (gap > 2.5 * T) continue;
    const score = gap + dc;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best) {
    piece.c = best.c;
    if (piece.kind === 'door') piece.t = best.t;
    return;
  }
  if (piece.kind !== 'door') return;
  for (const s of stubs) {
    if (s.dir !== piece.dir || Math.abs(s.c - piece.c) > s.t / 2 + 0.75 * T) continue;
    if (gapBetween(s.u1, s.u2, piece.u1, piece.u2) > 1.5 * T) continue;
    piece.c = s.c;
    return;
  }
}

function clusterByOffset<X extends { dir: number; c: number }>(items: X[], tol: number): X[][] {
  const sorted = [...items].sort((a, b) => a.dir - b.dir || a.c - b.c);
  const groups: X[][] = [];
  let cur: X[] = [];
  let mean = 0;
  for (const it of sorted) {
    if (cur.length > 0 && cur[0]!.dir === it.dir && it.c - mean <= tol) {
      cur.push(it);
      mean = cur.reduce((s, x) => s + x.c, 0) / cur.length;
    } else {
      if (cur.length > 0) groups.push(cur);
      cur = [it];
      mean = it.c;
    }
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

const PRIORITY: Record<GapKind, number> = { door: 3, glazed: 2, window: 1, passage: 0 };

function makeRun(pieces: Piece[], T: number): Run {
  const solid = pieces.filter((p) => p.kind === 'wall');
  const basis = solid.length > 0 ? solid : pieces;
  let w = 0;
  let c = 0;
  let t = 0;
  for (const p of basis) {
    const l = Math.max(p.u2 - p.u1, 1e-6);
    w += l;
    c += l * p.c;
    t += l * p.t;
  }
  const gaps = pieces
    .filter((p) => p.kind !== 'wall')
    .sort((a, b) => PRIORITY[b.kind as GapKind] - PRIORITY[a.kind as GapKind] || b.u2 - b.u1 - (a.u2 - a.u1));
  const openings: RunOpening[] = [];
  for (const g of gaps) {
    const len = g.u2 - g.u1;
    const clash = openings.find((o) => overlap(o.u1, o.u2, g.u1, g.u2) > 0.3 * Math.min(len, o.u2 - o.u1));
    if (clash) {
      // The same opening drawn twice (frame lines under a door swing): keep the better reading.
      if (clash.kind === g.kind) {
        clash.u1 = Math.min(clash.u1, g.u1);
        clash.u2 = Math.max(clash.u2, g.u2);
      }
      continue;
    }
    openings.push({
      u1: g.u1,
      u2: g.u2,
      kind: g.kind as GapKind,
      hingeU: g.hingeU,
      swingSide: g.swingSide,
      confidence: g.confidence,
    });
  }
  openings.sort((a, b) => a.u1 - b.u1);
  // An unexplained gap right next to glazing is part of the same glazed opening (frame drawn as a block).
  for (let i = 0; i + 1 < openings.length; ) {
    const a = openings[i]!;
    const b = openings[i + 1]!;
    const glass = (k: GapKind) => k === 'window' || k === 'glazed';
    if (b.u1 - a.u2 <= T && ((a.kind === 'passage' && glass(b.kind)) || (glass(a.kind) && b.kind === 'passage'))) {
      openings.splice(i, 2, { u1: a.u1, u2: b.u2, kind: 'glazed', confidence: 0.6 });
    } else i++;
  }
  return {
    dir: pieces[0]!.dir,
    c: c / w,
    t: solid.length > 0 ? t / w : Math.max(0.6 * T, Math.min(1.6 * T, t / w)),
    u1: Math.min(...pieces.map((p) => p.u1)),
    u2: Math.max(...pieces.map((p) => p.u2)),
    kind: 'wall',
    openings,
    confidence: solid.length > 0 ? 0.9 : 0.7,
  };
}

function chain(pieces: Piece[], joinTol: number): Piece[][] {
  const sorted = [...pieces].sort((a, b) => a.u1 - b.u1);
  const out: Piece[][] = [];
  let cur: Piece[] = [];
  let end = -Infinity;
  for (const p of sorted) {
    if (cur.length > 0 && p.u1 <= end + joinTol) {
      cur.push(p);
      end = Math.max(end, p.u2);
    } else {
      if (cur.length > 0) out.push(cur);
      cur = [p];
      end = p.u2;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export function buildRuns(input: TopologyInput): Run[] {
  const { dirs, T, walls, stubs } = input;
  const maxPassage = (input.maxPassage ?? 14) * T;

  const pieces: Piece[] = walls.map((s) => ({ ...s, kind: 'wall' as const, confidence: 0.9 }));
  for (const g of input.glazing) {
    const piece: Piece = { ...g.strip, kind: g.kind, confidence: 0.8 };
    align(piece, walls, stubs, T);
    pieces.push(piece);
  }
  const wallDirs = wallDirections(walls);
  for (const d of input.doors) {
    const dir = snapDirection(dirs, wallDirs, d.strike.x - d.hinge.x, d.strike.y - d.hinge.y);
    const uh = dirs.u(dir, d.hinge);
    const us = dirs.u(dir, d.strike);
    const c = (dirs.c(dir, d.hinge) + dirs.c(dir, d.strike)) / 2;
    const piece: Piece = {
      dir,
      c,
      t: T,
      u1: Math.min(uh, us),
      u2: Math.max(uh, us),
      kind: 'door',
      hingeU: uh,
      swingSide: dirs.c(dir, d.tip) - c >= 0 ? 1 : -1,
      confidence: d.confidence,
    };
    align(piece, walls, stubs, T);
    pieces.push(piece);
  }

  /** True when a wall or opening running another way meets the point: a strip ending there forms a corner, not a jamb. */
  const meetsCross = (dir: number, u: number, c: number, half: number): boolean => {
    const p = dirs.point(dir, u, c);
    return pieces.some((s) => {
      if (s.dir === dir || dirs.sin(dir, s.dir) < 0.2) return false;
      const off = Math.abs(dirs.c(s.dir, p) - s.c);
      const along = dirs.u(s.dir, p);
      return off <= s.t / 2 + 0.75 * T && along >= s.u1 - half - 0.75 * T && along <= s.u2 + half + 0.75 * T;
    });
  };
  /** True when a wall running another way ends on, or crosses, the line between two collinear ends. */
  const junctionBetween = (dir: number, c: number, ua: number, ub: number, half: number): boolean =>
    walls.some((s) => {
      if (s.dir === dir || dirs.sin(dir, s.dir) < 0.2) return false;
      const a = dirs.point(dir, ua, c);
      const b = dirs.point(dir, ub, c);
      const ca = dirs.c(s.dir, a) - s.c;
      const cb = dirs.c(s.dir, b) - s.c;
      if (ca * cb > 0) return false;
      const k = ca === cb ? 0.5 : ca / (ca - cb);
      const along = dirs.u(s.dir, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      return along >= s.u1 - half - 0.75 * T && along <= s.u2 + half + 0.75 * T;
    });

  const runs: Run[] = [];
  for (const group of clusterByOffset(pieces, 0.35 * T)) {
    const chains = chain(group, 3 * T);
    let cur = chains[0]!;
    for (let i = 1; i < chains.length; i++) {
      const next = chains[i]!;
      const end = Math.max(...cur.map((p) => p.u2));
      const start = Math.min(...next.map((p) => p.u1));
      const gap = start - end;
      const cA = makeRun(cur, T);
      const cB = makeRun(next, T);
      const c = (cA.c + cB.c) / 2;
      const half = Math.max(cA.t, cB.t) / 2;
      const solidA = cur.some((p) => p.kind === 'wall');
      const solidB = next.some((p) => p.kind === 'wall');
      // A junction within T of either end is the corner that end already forms, not a wall in the gap.
      if (gap > 2 * T && junctionBetween(cA.dir, c, end + T, start - T, half)) {
        // A wall arrives in the gap: the two pieces are one wall through a junction, or two walls.
        if (gap <= 6 * T) cur = [...cur, ...next];
        else {
          runs.push(cA);
          cur = next;
        }
        continue;
      }
      const freeA = !meetsCross(cA.dir, end, cA.c, cA.t / 2);
      const freeB = !meetsCross(cB.dir, start, cB.c, cB.t / 2);
      if (gap <= maxPassage && (freeA || freeB) && solidA && solidB) {
        cur = [...cur, { dir: cA.dir, c, t: T, u1: end, u2: start, kind: 'passage', confidence: freeA && freeB ? 0.6 : 0.45 }, ...next];
      } else {
        runs.push(cA);
        cur = next;
      }
    }
    runs.push(makeRun(cur, T));
  }

  // Railings and low walls: their own runs, unless they only shadow a wall that is already there.
  const lowPieces = input.low.map((l) => ({ ...l.strip, lowKind: l.kind }));
  const lowGroups = [
    ...clusterByOffset(lowPieces.filter((p) => p.lowKind === 'railing'), 0.5 * T),
    ...clusterByOffset(lowPieces.filter((p) => p.lowKind === 'low'), 0.5 * T),
  ];
  for (const group of lowGroups) {
    const sorted = [...group].sort((a, b) => a.u1 - b.u1);
    let cur: typeof sorted = [];
    const flush = () => {
      if (cur.length === 0) return;
      const u1 = Math.min(...cur.map((p) => p.u1));
      const u2 = Math.max(...cur.map((p) => p.u2));
      const lo = Math.min(...cur.map((p) => p.c - p.t / 2));
      const hi = Math.max(...cur.map((p) => p.c + p.t / 2));
      let c = (lo + hi) / 2;
      let t = hi - lo;
      let a1 = u1;
      let a2 = u2;
      const dir = cur[0]!.dir;
      const kind = cur[0]!.lowKind;
      const shadow = runs.some(
        (r) =>
          r.kind === 'wall' &&
          r.dir === dir &&
          Math.abs(r.c - c) <= r.t / 2 + t / 2 + 0.75 * T &&
          overlap(r.u1, r.u2, u1, u2) >= 0.6 * (u2 - u1),
      );
      if (!shadow && u2 - u1 >= 2 * T) {
        // A low wall that carries on from a wall end shares that wall's line.
        const lead = runs.find(
          (r) =>
            r.kind === 'wall' &&
            r.dir === dir &&
            Math.abs(r.c - c) <= r.t / 2 + t / 2 + 0.25 * T &&
            overlap(r.u1, r.u2, u1, u2) < 0.3 * (u2 - u1) &&
            gapBetween(r.u1, r.u2, u1, u2) <= 3 * T,
        );
        if (lead) {
          c = lead.c;
          if (lead.u2 <= (u1 + u2) / 2) a1 = lead.u2;
          else a2 = lead.u1;
        } else if (kind === 'railing' && input.centre) {
          // Balconies are dimensioned to the slab edge: put a slim rail on the outer line of the band.
          const slim = 0.375 * T;
          if (t > slim) {
            c = c >= dirs.c(dir, input.centre) ? hi : lo;
            t = slim;
          }
        }
        runs.push({ dir, c, t, u1: a1, u2: a2, kind, openings: [], confidence: 0.7 });
      }
      cur = [];
    };
    let end = -Infinity;
    for (const p of sorted) {
      if (cur.length > 0 && p.u1 > end + 1.5 * T) flush();
      cur.push(p);
      end = cur.length === 1 ? p.u2 : Math.max(end, p.u2);
    }
    flush();
  }

  snapEnds(runs, dirs, T);
  snapEnds(runs, dirs, T);
  const kept = runs.filter((r) => r.u2 - r.u1 > 0.25 * T);
  return [...kept, ...bridgeNearMisses(kept, dirs, T)];
}

/**
 * Last resort for ends that stop just short of another wall without lying on
 * its line (two parallel walls with a small step between them): a short
 * connector closes the step so rooms on either side stay closed.
 */
export function bridgeNearMisses(runs: Run[], dirs: Dirs, T: number): Run[] {
  const segs = runs.map((r) => runEnds(r, dirs));
  const nearest = (p: P2, a: P2, b: P2): P2 => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const k = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return { x: a.x + dx * k, y: a.y + dy * k };
  };
  const out: Run[] = [];
  const done: P2[] = [];
  runs.forEach((run, i) => {
    for (const e of [segs[i]!.a, segs[i]!.b]) {
      let best: P2 | null = null;
      let bestD = Infinity;
      let attached = false;
      segs.forEach((o, j) => {
        if (j === i || attached) return;
        const q = nearest(e, o.a, o.b);
        const d = Math.hypot(q.x - e.x, q.y - e.y);
        if (d <= 0.03 * T) attached = true;
        else if (d < bestD) {
          bestD = d;
          best = q;
        }
      });
      if (attached || !best || bestD > T) continue;
      const q: P2 = best;
      if (done.some((p) => Math.hypot(p.x - (e.x + q.x) / 2, p.y - (e.y + q.y) / 2) < 0.03 * T)) continue;
      done.push({ x: (e.x + q.x) / 2, y: (e.y + q.y) / 2 });
      const dir = dirs.index(q.x - e.x, q.y - e.y);
      const ua = dirs.u(dir, e);
      const ub = dirs.u(dir, q);
      out.push({
        dir,
        c: (dirs.c(dir, e) + dirs.c(dir, q)) / 2,
        t: Math.min(run.t, T),
        u1: Math.min(ua, ub),
        u2: Math.max(ua, ub),
        kind: run.kind,
        openings: [],
        confidence: 0.5,
      });
    }
  });
  return out;
}

/** Extends or trims every run end onto the centreline of the run it meets. */
export function snapEnds(runs: Run[], dirs: Dirs, T: number): void {
  const endTol = (r: Run, end: 1 | 2): number => {
    if (r.kind !== 'wall') return 4 * T;
    const u = end === 1 ? r.u1 : r.u2;
    return r.openings.some((o) => Math.abs((end === 1 ? o.u1 : o.u2) - u) <= 0.5 * T) ? 3 * T : 0.75 * T;
  };
  const moves: { run: Run; end: 1 | 2; u: number }[] = [];
  for (const a of runs) {
    const da = dirs.list[a.dir]!;
    for (const end of [1, 2] as const) {
      const uE = end === 1 ? a.u1 : a.u2;
      const sign = end === 1 ? -1 : 1;
      const tolA = endTol(a, end);
      let best: number | null = null;
      let bestExt = Infinity;
      for (const b of runs) {
        if (b === a) continue;
        const sin = dirs.sin(a.dir, b.dir);
        if (sin < 0.2) continue;
        const db = dirs.list[b.dir]!;
        // Point on A's centreline that lies on B's centreline.
        const den = da.d.x * db.n.x + da.d.y * db.n.y;
        const uA = (b.c - a.c * (da.n.x * db.n.x + da.n.y * db.n.y)) / den;
        const ext = (uA - uE) * sign;
        const hB = b.t / 2 / sin;
        // Walls reach a little further for a railing: its line is the slab edge, beyond the wall end.
        const reach = b.kind === 'wall' ? tolA : Math.max(tolA, 2 * T);
        if (ext > hB + reach || ext < -(hB + 0.5 * T)) continue;
        const p = dirs.point(a.dir, uA, a.c);
        const uB = dirs.u(b.dir, p);
        const hA = a.t / 2 / sin;
        if (uB < b.u1 - hA - Math.max(endTol(b, 1), tolA) || uB > b.u2 + hA + Math.max(endTol(b, 2), tolA)) continue;
        if (Math.abs(ext) < bestExt) {
          bestExt = Math.abs(ext);
          best = uA;
        }
      }
      if (best !== null) moves.push({ run: a, end, u: best });
    }
  }
  for (const m of moves) {
    if (m.end === 1) m.run.u1 = m.u;
    else m.run.u2 = m.u;
  }
}

export function runEnds(run: Run, dirs: Dirs): { a: P2; b: P2 } {
  return { a: dirs.point(run.dir, run.u1, run.c), b: dirs.point(run.dir, run.u2, run.c) };
}
