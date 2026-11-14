/**
 * Cove lighting: a lowered soffit round the edge of the ceiling of living rooms and
 * bedrooms, with a hidden warm LED strip on top of its inner edge washing the ceiling.
 * Pure geometry (plan millimetres): `Coves.tsx` builds the meshes.
 */
import { vec, type Level, type Pt, type RoomGeom, type RoomType } from '@interio/core';

/** Rooms that get a cove. */
export const COVE_ROOMS: readonly RoomType[] = ['living', 'dining', 'bedroom'];

/** Width of the soffit from the wall, mm. */
export const COVE_WIDTH = 320;
/** How far the soffit hangs below the ceiling, mm. */
export const COVE_DROP = 140;
/** How far the wash of light reaches across the ceiling from the soffit's edge, mm. */
export const COVE_WASH = 650;

/**
 * Offsets a counter-clockwise polygon inwards, each edge by its own distance (0 keeps the
 * edge where it is). Null when the result is not a proper polygon of the same shape (the
 * room is too small or too narrow for it).
 */
export function insetPolygon(poly: Pt[], distances: number[]): Pt[] | null {
  const n = poly.length;
  if (n < 3 || vec.polygonArea(poly) <= 0) return null;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const dir = vec.norm(vec.sub(b, a));
    // Left of a counter-clockwise edge is inside.
    const inward = { x: -dir.y, y: dir.x };
    return { p: vec.add(a, vec.scale(inward, distances[i] ?? 0)), dir };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n]!;
    const next = lines[i]!;
    const hit = vec.lineIntersection(prev.p, prev.dir, next.p, next.dir);
    // Collinear edges: the offset point of the vertex itself.
    out.push(hit ?? next.p);
  }
  if (vec.polygonArea(out) <= 0) return null;
  for (let i = 0; i < n; i++) {
    // Every edge keeps its direction: a flipped edge means the inset folded over itself.
    const a = out[i]!;
    const b = out[(i + 1) % n]!;
    const e = vec.sub(b, a);
    if (vec.len(e) > 1 && vec.dot(e, lines[i]!.dir) <= 0) return null;
    if (!vec.pointInPolygon(a, poly) && distances[i]! > 0 && distances[(i - 1 + n) % n]! > 0) return null;
  }
  return out;
}

/**
 * Drops vertices where two edges with the same flag run straight on (a wall split by a
 * junction on its far side), so an inset does not fold at them.
 */
export function mergeStraight(poly: Pt[], flags: boolean[]): { poly: Pt[]; flags: boolean[] } {
  const n = poly.length;
  const keep: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const p = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const a = vec.norm(vec.sub(p, prev));
    const b = vec.norm(vec.sub(next, p));
    const straight = Math.abs(vec.cross(a, b)) < 1e-3 && vec.dot(a, b) > 0;
    if (!(straight && flags[(i - 1 + n) % n] === flags[i])) keep.push(i);
  }
  return { poly: keep.map((i) => poly[i]!), flags: keep.map((i) => flags[i]!) };
}

export interface Cove {
  roomId: string;
  /** The room's clear floor outline (where the walls are). */
  outer: Pt[];
  /** Inner edge of the soffit, where the LED strip sits. */
  inner: Pt[];
  /** Where the wash of light on the ceiling fades out. */
  wash: Pt[];
  /** Per edge of `inner`: true where there is a wall behind (open sides of an open-plan room get no soffit and no light). */
  walled: boolean[];
}

/**
 * A cove for every living room and bedroom big enough to take one. Edges along dividers
 * (open-plan boundaries) get no soffit; the rest are inset by `COVE_WIDTH`.
 */
export function coves(level: Pick<Level, 'rooms' | 'walls'>, rooms: RoomGeom[]): Cove[] {
  const out: Cove[] = [];
  for (const r of rooms) {
    const room = r.roomId ? level.rooms[r.roomId] : undefined;
    if (!room || !COVE_ROOMS.includes(room.type)) continue;
    if (r.interior.length !== r.edgeWalls.length) continue;
    // Only full-height walls carry a soffit: dividers, low walls and railings leave that side open.
    const { poly: outer, flags: walled } = mergeStraight(
      r.interior,
      r.edgeWalls.map((id) => level.walls[id]?.kind === 'wall'),
    );
    if (!walled.some(Boolean)) continue;
    const inner = insetPolygon(outer, walled.map((w) => (w ? COVE_WIDTH : 0)));
    const wash = inner && insetPolygon(outer, walled.map((w) => (w ? COVE_WIDTH + COVE_WASH : 0)));
    if (!inner || !wash) continue;
    out.push({ roomId: room.id, outer, inner, wash, walled });
  }
  return out;
}
