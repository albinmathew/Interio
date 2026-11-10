/** Room helpers for the properties panel. */
import {
  DEFAULT_WALL_MATERIAL,
  defaultFloorFor,
  defaultWallFor,
  selectRooms,
  type Level,
  type Room,
  type RoomType,
} from '@interio/core';

/**
 * Patch for changing a room's type. The floor follows the new type's default
 * unless the user picked a finish (anything other than the old type's default);
 * the wall finish follows the same rule.
 */
export type RoomPatch = Partial<Omit<Room, 'id' | 'seed'>>;

export function roomTypePatch(room: Pick<Room, 'type' | 'floorMaterial' | 'wallMaterial'>, type: RoomType): RoomPatch {
  const patch: RoomPatch = { type };
  if (room.floorMaterial === defaultFloorFor(room.type)) patch.floorMaterial = defaultFloorFor(type);
  const wall = room.wallMaterial ?? DEFAULT_WALL_MATERIAL;
  if (wall === defaultWallFor(room.type)) {
    const next = defaultWallFor(type);
    if (next !== wall) patch.wallMaterial = next;
  }
  return patch;
}

export interface LevelTotals {
  rooms: number;
  walls: number;
  openings: number;
  /** Clear floor area of all rooms, mm^2. */
  area: number;
}

export function levelTotals(level: Level): LevelTotals {
  const rooms = selectRooms(level).filter((r) => r.roomId);
  return {
    rooms: rooms.length,
    walls: Object.keys(level.walls).length,
    openings: Object.keys(level.openings).length,
    area: rooms.reduce((s, r) => s + r.interiorArea, 0),
  };
}

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  living: 'Living room',
  dining: 'Dining room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  balcony: 'Balcony',
  utility: 'Utility',
  foyer: 'Foyer',
  study: 'Study',
  corridor: 'Corridor',
  storage: 'Storage',
  other: 'Other',
};
