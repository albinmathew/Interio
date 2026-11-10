import type { Id, Level, Pt, Wall } from '../schema';
import { memoLevel } from './memo';
import { add, cross, dist, lineIntersection, norm, perp, scale, sub } from './vec';

export interface WallFootprint {
  wallId: Id;
  /** Unit direction a -> b and its left normal. */
  dir: Pt;
  normal: Pt;
  length: number;
  /** Mitred corner points. "Left"/"right" are relative to the a -> b direction. */
  aL: Pt;
  aR: Pt;
  bL: Pt;
  bR: Pt;
  /** Counter-clockwise outline: aR, bR, b, bL, aL, a. */
  polygon: Pt[];
  /** Number of walls meeting at each end. */
  degreeA: number;
  degreeB: number;
}

interface Spoke {
  wall: Wall;
  /** Unit direction pointing away from the vertex. */
  d: Pt;
  h: number;
  angle: number;
  left?: Pt;
  right?: Pt;
}

function compute(level: Level): WallFootprint[] {
  const spokes = new Map<Id, Spoke[]>();
  const ends = new Map<Id, { sa: Spoke; sb: Spoke }>();
  const walls = Object.values(level.walls).filter((w) => {
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    return a && b && dist(a, b) >= 1;
  });
  for (const w of walls) {
    const a = level.vertices[w.a]!;
    const b = level.vertices[w.b]!;
    const d = norm(sub(b, a));
    const back = scale(d, -1);
    const sa: Spoke = { wall: w, d, h: w.thickness / 2, angle: Math.atan2(d.y, d.x) };
    const sb: Spoke = { wall: w, d: back, h: w.thickness / 2, angle: Math.atan2(back.y, back.x) };
    (spokes.get(w.a) ?? spokes.set(w.a, []).get(w.a)!).push(sa);
    (spokes.get(w.b) ?? spokes.set(w.b, []).get(w.b)!).push(sb);
    ends.set(w.id, { sa, sb });
  }

  for (const [vid, list] of spokes) {
    const v = level.vertices[vid]!;
    list.sort((m, n) => m.angle - n.angle);
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!;
      const next = list[(i + 1) % list.length]!;
      const squareLeft = add(v, scale(perp(cur.d), cur.h));
      const squareRight = add(v, scale(perp(next.d), -next.h));
      if (list.length === 1) {
        cur.left = squareLeft;
        cur.right = squareRight;
        break;
      }
      // The left side of `cur` meets the right side of `next` (the next spoke counter-clockwise).
      const parallel = Math.abs(cross(cur.d, next.d)) < 0.05;
      const hit = parallel ? null : lineIntersection(squareLeft, cur.d, squareRight, next.d);
      if (hit && dist(hit, v) <= 4 * Math.max(cur.h, next.h)) {
        cur.left = hit;
        next.right = hit;
      } else {
        cur.left = squareLeft;
        next.right = squareRight;
      }
    }
  }

  return walls.map((w) => {
    const a = level.vertices[w.a]!;
    const b = level.vertices[w.b]!;
    const dir = norm(sub(b, a));
    const { sa, sb } = ends.get(w.id)!;
    // At b the spoke points backwards, so its left is the wall's right.
    const aL = sa.left!;
    const aR = sa.right!;
    const bR = sb.left!;
    const bL = sb.right!;
    return {
      wallId: w.id,
      dir,
      normal: perp(dir),
      length: dist(a, b),
      aL,
      aR,
      bL,
      bR,
      polygon: [aR, bR, b, bL, aL, a],
      degreeA: spokes.get(w.a)!.length,
      degreeB: spokes.get(w.b)!.length,
    };
  });
}

/** Plan outlines of every wall with mitred joins. Pure and uncached. */
export const wallFootprints: (level: Level) => WallFootprint[] = compute;

/** Cached `wallFootprints` for IMMUTABLE levels (anything read from the plan store). */
export const selectFootprints: (level: Level) => WallFootprint[] = memoLevel((l) => [l.vertices, l.walls], compute);

export function wallFootprint(level: Level, wallId: Id): WallFootprint | null {
  return wallFootprints(level).find((f) => f.wallId === wallId) ?? null;
}

export interface OpeningFrame {
  /** Centre of the opening on the wall centreline. */
  center: Pt;
  /** Jamb points on the centreline nearer vertex a (`left`) and vertex b (`right`). */
  left: Pt;
  right: Pt;
  /** Unit direction a -> b and the wall's left normal. */
  dir: Pt;
  normal: Pt;
  thickness: number;
  /** Wall direction in CCW degrees. */
  angleDeg: number;
}

export function openingFrame(level: Level, openingId: Id): OpeningFrame | null {
  const o = level.openings[openingId];
  const wall = o && level.walls[o.wallId];
  if (!o || !wall) return null;
  const a = level.vertices[wall.a];
  const b = level.vertices[wall.b];
  if (!a || !b) return null;
  const dir = norm(sub(b, a));
  const center = add(a, scale(dir, o.offset));
  return {
    center,
    left: add(center, scale(dir, -o.width / 2)),
    right: add(center, scale(dir, o.width / 2)),
    dir,
    normal: perp(dir),
    thickness: wall.thickness,
    angleDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
  };
}
