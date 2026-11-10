import type { Id, Level, Pt } from '../schema';
import { deriveFaces, type Face } from './faces';
import { memoLevel } from './memo';
import { interiorPoint, pointInPolygon, polygonBounds } from './vec';

export interface RoomGeom extends Face {
  /** Room attached to this face, or null when no room seed lies inside it (call `reconcileRooms`). */
  roomId: Id | null;
  /** A point safely inside the clear floor area: label anchor, camera spot. */
  centroid: Pt;
  /** Bounding size of the clear floor area, mm. */
  width: number;
  depth: number;
}

function compute(level: Level): RoomGeom[] {
  const faces = deriveFaces(level);
  const rooms = Object.values(level.rooms);
  const taken = new Set<Id>();
  return faces.map((face) => {
    const room = rooms.find((r) => !taken.has(r.id) && pointInPolygon(r.seed, face.polygon));
    if (room) taken.add(room.id);
    const b = polygonBounds(face.interior);
    return {
      ...face,
      roomId: room?.id ?? null,
      centroid: interiorPoint(face.interior),
      width: b.maxX - b.minX,
      depth: b.maxY - b.minY,
    };
  });
}

/** Room polygons derived from the wall graph. Pure and uncached: safe on a level that is being mutated. */
export const deriveRooms: (level: Level) => RoomGeom[] = compute;

/**
 * Cached `deriveRooms` for IMMUTABLE levels (anything read from the plan store).
 * Keyed on slice identity, so never call it on a level you mutate in place.
 */
export const selectRooms: (level: Level) => RoomGeom[] = memoLevel((l) => [l.vertices, l.walls, l.rooms], compute);

export function roomAt(level: Level, p: Pt): RoomGeom | null {
  return deriveRooms(level).find((r) => pointInPolygon(p, r.polygon)) ?? null;
}

export function roomGeom(level: Level, roomId: Id): RoomGeom | null {
  return deriveRooms(level).find((r) => r.roomId === roomId) ?? null;
}
