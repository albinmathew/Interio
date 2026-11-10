/**
 * Open-plan areas. A drawing can label several rooms inside one walled space
 * ("Living", "Dining", "Foyer" with nothing between them). A room in the plan
 * model is a closed face of the wall graph, so each labelled zone is closed
 * with dividers: floor-level strips, 10 mm wide and 5 mm high, open along their
 * whole length. They separate rooms without standing in anyone's way.
 *
 * A zone is the rectangle of its labelled size that contains the label and
 * has as much of its outline on the surrounding walls as possible.
 */
import { deriveRooms, ops, vec, type Id, type Level, type Pt, type Wall } from '@interio/core';
import type { P2 } from './strips';

export const DIVIDER_THICKNESS = 10;
export const DIVIDER_HEIGHT = 5;

export const isDivider = (wall: Pick<Wall, 'kind' | 'thickness' | 'height'> | undefined): boolean =>
  !!wall && wall.kind === 'low' && wall.thickness === DIVIDER_THICKNESS && wall.height === DIVIDER_HEIGHT;

export interface ZoneLabel {
  name: string;
  at: Pt;
  dims?: [number, number];
}

/** Distance from `p` along `d` to the centreline of the first wall in the way. */
function castToWall(level: Level, p: Pt, d: P2): number | null {
  let best: number | null = null;
  for (const w of Object.values(level.walls)) {
    const { a, b } = ops.wallEnds(level, w);
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1) continue;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) / len < 0.3) continue;
    const qx = a.x - p.x;
    const qy = a.y - p.y;
    const s = (qx * ey - qy * ex) / den;
    const k = (qx * d.y - qy * d.x) / den;
    const slack = w.thickness / 2 / len;
    if (s <= 0 || k < -slack || k > 1 + slack) continue;
    if (best === null || s < best) best = s;
  }
  return best;
}

function distToBoundary(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, vec.projectOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!).distance);
  return best;
}

/** Where a divider stops: `straight` ends the divider itself, `tie` is a short link from there to a wall. */
interface End {
  straight: Pt;
  tie?: Pt;
  tieWall?: Id;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const INSET = 60;
const STEP = 40;

/**
 * Finds the zone rectangle for a label inside `interior` (the clear floor of
 * the room it shares). Coordinates are in the axes frame, relative to the label.
 */
function fitZone(dims: [number, number], local: Pt[], toPlan: (u: number, v: number) => Pt, interior: Pt[], firstAlongU: boolean, minShare: number): Rect | null {
  const us = [...new Set(local.map((p) => Math.round(p.x / 5) * 5))];
  const vs = [...new Set(local.map((p) => Math.round(p.y / 5) * 5))];
  /** Positions that put one edge of the zone on a wall line and keep the label inside. */
  const starts = (edges: number[], size: number): number[] => {
    const out = new Set<number>();
    for (const e of edges) {
      for (const lo of [e, e - size]) if (lo <= -100 && lo + size >= 100) out.add(lo);
    }
    return [...out];
  };
  const inside = (u: number, v: number) => vec.pointInPolygon(toPlan(u, v), interior);
  let best: { rect: Rect; score: number } | null = null;
  const orientations: [number, number, number][] = [
    [dims[0], dims[1], firstAlongU ? 1 : 0],
    [dims[1], dims[0], firstAlongU ? 0 : 1],
  ];
  for (const [w, h, asWritten] of orientations) {
    for (const x0 of starts(us, w)) {
      for (const y0 of starts(vs, h)) {
        const x1 = x0 + w;
        const y1 = y0 + h;
        // The whole zone must be clear floor of this room.
        if (!inside(x0 + INSET, y0 + INSET) || !inside(x1 - INSET, y0 + INSET) || !inside(x1 - INSET, y1 - INSET) || !inside(x0 + INSET, y1 - INSET)) continue;
        if (!inside((x0 + x1) / 2, (y0 + y1) / 2)) continue;
        let contact = 0;
        let total = 0;
        let leaves = false;
        const sample = (u: number, v: number, iu: number, iv: number) => {
          total++;
          if (distToBoundary(toPlan(u, v), interior) <= 30) contact++;
          else if (!inside(u + iu * INSET, v + iv * INSET)) leaves = true;
        };
        for (let u = x0 + 100; u < x1 - 50 && !leaves; u += 150) {
          sample(u, y0, 0, 1);
          sample(u, y1, 0, -1);
        }
        for (let v = y0 + 100; v < y1 - 50 && !leaves; v += 150) {
          sample(x0, v, 1, 0);
          sample(x1, v, -1, 0);
        }
        if (leaves || total === 0) continue;
        const share = contact / total;
        // Floating free in the room, or already walled all round.
        if (share < minShare || share > 0.97) continue;
        const offCentre = Math.abs(x0 + x1) + Math.abs(y0 + y1);
        const score = contact * 150 + asWritten * 200 - offCentre * 0.05;
        if (!best || score > best.score) best = { rect: { x0, x1, y0, y1 }, score };
      }
    }
  }
  return best?.rect ?? null;
}

/**
 * Adds dividers around labelled zones that are only part of a closed room:
 * zones that share the room with other labels, and a single label whose room
 * is larger than its labelled size (a bedroom with an entry lobby). `fits`
 * says whether a labelled size already matches a room's bounding size.
 * Returns the zones that were closed, and whether each stood alone in its room.
 */
export function splitOpenPlan(
  level: Level,
  labels: ZoneLabel[],
  axes: [P2, P2],
  fits: (labelled: [number, number], measured: [number, number]) => boolean = () => true,
): { name: string; alone: boolean }[] {
  const rooms = deriveRooms(level);
  const groups = new Map<number, ZoneLabel[]>();
  for (const label of labels) {
    const i = rooms.findIndex((g) => vec.pointInPolygon(label.at, g.polygon));
    if (i < 0) continue;
    groups.set(i, [...(groups.get(i) ?? []), label]);
  }
  const [ax, ay] = axes;
  const half = DIVIDER_THICKNESS / 2;
  const closed: { name: string; alone: boolean }[] = [];

  for (const [index, list] of groups) {
    const face = rooms[index]!;
    const alone = list.length === 1;
    if (alone) {
      // One label in a room that is bigger than the label says: divide off the labelled part.
      const only = list[0]!;
      if (!only.dims || fits(only.dims, [face.width, face.depth])) continue;
      const rest = face.interiorArea - only.dims[0] * only.dims[1];
      if (rest < 400_000 || rest > 0.45 * face.interiorArea) continue;
    }
    // Small zones first, so a larger zone can end on the dividers of the ones inside it.
    const ordered = list.filter((l) => l.dims).sort((a, b) => a.dims![0] * a.dims![1] - b.dims![0] * b.dims![1]);
    for (const label of ordered) {
      const toPlan = (u: number, v: number): Pt => ({ x: label.at.x + ax.x * u + ay.x * v, y: label.at.y + ax.y * u + ay.y * v });
      const local = face.interior.map((p) => ({
        x: (p.x - label.at.x) * ax.x + (p.y - label.at.y) * ax.y,
        y: (p.x - label.at.x) * ay.x + (p.y - label.at.y) * ay.y,
      }));
      const r = fitZone(label.dims!, local, toPlan, face.interior, Math.abs(ax.x) >= Math.abs(ax.y), alone ? 0.6 : 0.3);
      if (!r) continue;
      // Divider lines sit just outside the zone so its clear size is the labelled size.
      const x0 = r.x0 - half;
      const x1 = r.x1 + half;
      const y0 = r.y0 - half;
      const y1 = r.y1 + half;
      // The four sides, each from its low corner to its high corner.
      const sides = [
        { p0: toPlan(x0, y0), p1: toPlan(x0, y1), dir: ay },
        { p0: toPlan(x1, y0), p1: toPlan(x1, y1), dir: ay },
        { p0: toPlan(x0, y0), p1: toPlan(x1, y0), dir: ax },
        { p0: toPlan(x0, y1), p1: toPlan(x1, y1), dir: ax },
      ].map((s) => {
        // Keep the stretches that cross open floor; a side that runs along a wall needs no divider there.
        const len = vec.dist(s.p0, s.p1);
        const point = (t: number): Pt => ({ x: s.p0.x + s.dir.x * t, y: s.p0.y + s.dir.y * t });
        const pieces: [number, number][] = [];
        let start: number | null = null;
        let last = 0;
        for (let t = INSET; t <= len - INSET + 1e-6; t += STEP) {
          const q = point(t);
          // Within a hand's width of a wall there is nothing worth dividing off.
          if (vec.pointInPolygon(q, face.interior) && distToBoundary(q, face.interior) > 120) {
            if (start === null) start = t;
            last = t;
          } else if (start !== null) {
            if (last - start >= 300) pieces.push([start, last]);
            start = null;
          }
        }
        if (start !== null && last - start >= 300) pieces.push([start, last]);
        return { ...s, len, point, pieces };
      });
      const atStart = (t: number) => t <= INSET + STEP;
      const atEnd = (t: number, len: number) => t >= len - INSET - STEP;
      const touches = (side: number, end: 0 | 1): boolean =>
        sides[side]!.pieces.some(([a, b]) => (end === 0 ? atStart(a) : atEnd(b, sides[side]!.len)));
      /** For each side, the side and end that share its low and high corners. */
      const neighbour: [[number, 0 | 1], [number, 0 | 1]][] = [
        [[2, 0], [3, 0]],
        [[2, 1], [3, 1]],
        [[0, 0], [1, 0]],
        [[0, 1], [1, 1]],
      ];
      /**
       * Ties a divider end to the walls: straight on to the centreline of the
       * wall it runs into, plus a short tie where that point is past the wall's
       * end; at a wall corner, a tie across to the nearest wall.
       */
      const anchor = (end: Pt, from: Pt, dir: P2): End | null => {
        const s = castToWall(level, from, dir);
        if (s !== null && s <= 500 + INSET) {
          const on = { x: from.x + dir.x * s, y: from.y + dir.y * s };
          const near = ops.findWallNear(level, on, 200);
          return near && near.distance > 5 ? { straight: on, tie: near.point, tieWall: near.wallId } : { straight: on };
        }
        const near = ops.findWallNear(level, end, 300);
        return near ? { straight: end, tie: near.point, tieWall: near.wallId } : null;
      };
      /**
       * A tie that simply carries a wall on to the divider (it finishes a wall
       * corner) is built as that wall, so the room's clear outline stays square.
       */
      const tieLine = (e: End): { a: Pt; b: Pt; like?: Wall } => {
        const wall = e.tieWall ? level.walls[e.tieWall] : undefined;
        const line = { a: e.straight, b: e.tie! };
        if (!wall || isDivider(wall)) return line;
        const w = ops.wallEnds(level, wall);
        const wl = vec.dist(w.a, w.b);
        const tl = vec.dist(line.a, line.b);
        if (wl < 1 || tl < 1 || tl > wall.thickness) return line;
        const sin = Math.abs((w.b.x - w.a.x) * (line.b.y - line.a.y) - (w.b.y - w.a.y) * (line.b.x - line.a.x)) / (wl * tl);
        return sin < 0.05 ? { ...line, like: wall } : line;
      };
      const lines: { a: Pt; b: Pt; like?: Wall }[] = [];
      let ok = true;
      sides.forEach((side, i) => {
        const back = { x: -side.dir.x, y: -side.dir.y };
        for (const [a, b] of side.pieces) {
          const [lowCorner, highCorner] = neighbour[i]!;
          const head: End | null =
            atStart(a) && touches(lowCorner[0], lowCorner[1])
              ? { straight: side.p0 }
              : anchor(atStart(a) ? side.p0 : side.point(a), side.point(a + INSET), back);
          const tail: End | null =
            atEnd(b, side.len) && touches(highCorner[0], highCorner[1])
              ? { straight: side.p1 }
              : anchor(atEnd(b, side.len) ? side.p1 : side.point(b), side.point(b - INSET), side.dir);
          if (!head || !tail) {
            ok = false;
            return;
          }
          lines.push({ a: head.straight, b: tail.straight });
          if (head.tie) lines.push(tieLine(head));
          if (tail.tie) lines.push(tieLine(tail));
        }
      });
      if (!ok || lines.length === 0) continue;
      for (const line of lines) {
        // Two zones that meet share one divider: slide a line onto a divider that already runs beside it.
        const len = vec.dist(line.a, line.b);
        if (len < 1) continue;
        if (line.like) {
          ops.addWall(level, line.a, line.b, { kind: line.like.kind, thickness: line.like.thickness, height: line.like.height });
          continue;
        }
        const d = { x: (line.b.x - line.a.x) / len, y: (line.b.y - line.a.y) / len };
        for (const w of Object.values(level.walls)) {
          if (!isDivider(w)) continue;
          const e = ops.wallEnds(level, w);
          const wl = vec.dist(e.a, e.b);
          if (wl < 100 || Math.abs(d.x * (e.b.y - e.a.y) - d.y * (e.b.x - e.a.x)) / wl > 0.02) continue;
          const off = (e.a.x - line.a.x) * -d.y + (e.a.y - line.a.y) * d.x;
          if (Math.abs(off) < 0.5 || Math.abs(off) > 40) continue;
          const ta = (e.a.x - line.a.x) * d.x + (e.a.y - line.a.y) * d.y;
          const tb = (e.b.x - line.a.x) * d.x + (e.b.y - line.a.y) * d.y;
          if (Math.min(Math.max(ta, tb), len) - Math.max(Math.min(ta, tb), 0) < 100) continue;
          line.a = { x: line.a.x - d.y * off, y: line.a.y + d.x * off };
          line.b = { x: line.b.x - d.y * off, y: line.b.y + d.x * off };
          break;
        }
        ops.addWall(level, line.a, line.b, { kind: 'low', thickness: DIVIDER_THICKNESS, height: DIVIDER_HEIGHT });
      }
      closed.push({ name: label.name, alone });
    }
  }

  for (const w of Object.values(level.walls)) {
    if (!isDivider(w)) continue;
    const length = ops.wallLength(level, w);
    if (length < 320) continue;
    ops.addOpening(level, { wallId: w.id, offset: length / 2, width: length - 100, height: DIVIDER_HEIGHT, sill: 0, kind: 'passage' });
  }
  return closed;
}
