/**
 * Walking space. The room's clear floor is sampled on a grid; a cell is
 * walkable when a person (a disc of `PERSON_RADIUS`) can stand there without
 * touching a wall or anything standing on the floor. Doors and passages are
 * connected when a walkable path joins them.
 */
import { vec, type Pt } from '@interio/core';
import { distanceToBoundary } from './geometry';
import type { Planner } from './planner';

/** Half the width of a comfortable passage, mm. */
export const PERSON_RADIUS = 300;
const STEP = 100;
/** Pieces lower than this you would walk into; above it (wall art, a TV) you walk under or past. */
const KNEE = 900;

function distanceToConvex(p: Pt, poly: Pt[]): number {
  if (vec.pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, vec.projectOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!).distance);
  return best;
}

export interface WalkState {
  /**
   * Component of each door point in the walkable grid, or -1 when a door has no
   * walkable floor in front of it. Two doors with the same label are connected.
   */
  doors: number[];
  /** Walkable floor reachable from the doors, m2 (all walkable floor when the room has no doors). */
  reach: number;
}

export function walkState(p: Planner): WalkState {
  const obstacles = p.placed
    .filter((q) => !q.flat && q.zMin < KNEE)
    .flatMap((q) => q.parts?.filter((part) => part.zMin < KNEE).map((part) => part.rect) ?? [q.rect]);
  const xs = p.polygon.map((q) => q.x);
  const ys = p.polygon.map((q) => q.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / STEP) + 1;
  const ny = Math.ceil((Math.max(...ys) - y0) / STEP) + 1;
  const free = new Uint8Array(nx * ny);
  const at = (i: number, j: number): Pt => ({ x: x0 + i * STEP, y: y0 + j * STEP });
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const c = at(i, j);
      if (!vec.pointInPolygon(c, p.polygon) || distanceToBoundary(c, p.polygon) < PERSON_RADIUS - 1) continue;
      if (obstacles.some((r) => distanceToConvex(c, r) < PERSON_RADIUS - 1)) continue;
      free[i * ny + j] = 1;
    }
  }
  const label = new Int32Array(nx * ny).fill(-1);
  let next = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (!free[k] || label[k]! >= 0) continue;
    const queue = [k];
    label[k] = next;
    while (queue.length) {
      const c = queue.pop()!;
      const i = Math.floor(c / ny);
      const j = c % ny;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = a * ny + b;
        if (free[n] && label[n]! < 0) {
          label[n] = next;
          queue.push(n);
        }
      }
    }
    next++;
  }
  // A door reaches the walkable cell nearest to it, within a short step into the room.
  const doors = p.doorPoints.map((d) => {
    let best = -1;
    let bestDist = PERSON_RADIUS + 450;
    const i0 = Math.round((d.x - x0) / STEP);
    const j0 = Math.round((d.y - y0) / STEP);
    const r = Math.ceil(bestDist / STEP);
    for (let i = Math.max(0, i0 - r); i <= Math.min(nx - 1, i0 + r); i++) {
      for (let j = Math.max(0, j0 - r); j <= Math.min(ny - 1, j0 + r); j++) {
        const k = i * ny + j;
        if (!free[k]) continue;
        const dist = vec.dist(at(i, j), d);
        if (dist < bestDist) {
          bestDist = dist;
          best = label[k]!;
        }
      }
    }
    return best;
  });
  const counts = new Map<number, number>();
  for (let k = 0; k < nx * ny; k++) if (label[k]! >= 0) counts.set(label[k]!, (counts.get(label[k]!) ?? 0) + 1);
  const reachable = doors.length > 0 ? new Set(doors.filter((d) => d >= 0)) : new Set(counts.keys());
  let cells = 0;
  for (const c of reachable) cells += counts.get(c) ?? 0;
  return { doors, reach: (cells * STEP * STEP) / 1e6 };
}

/**
 * True when a piece of `w` x `d` mm left the room walkable: every pair of doors
 * connected before still is, no reachable door was cut off, and the reachable
 * floor shrank by little more than the piece's own reach (so it did not close
 * off a bedside or a corner of the room).
 */
export function stillWalkable(before: WalkState, after: WalkState, w: number, d: number): boolean {
  for (let a = 0; a < before.doors.length; a++) {
    if (before.doors[a]! >= 0 && after.doors[a]! < 0) return false;
    for (let b = a + 1; b < before.doors.length; b++) {
      if (before.doors[a]! >= 0 && before.doors[a] === before.doors[b] && after.doors[a] !== after.doors[b]) return false;
    }
  }
  const own = ((w + 2 * PERSON_RADIUS) * (d + 2 * PERSON_RADIUS)) / 1e6;
  return after.reach >= before.reach - own * 1.3 - 0.05;
}
