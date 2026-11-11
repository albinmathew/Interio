/**
 * Which finish each part of the built level shows. Pure: runs in Node.
 */
import { DEFAULT_CEILING_MATERIAL, DEFAULT_WALL_MATERIAL, wallFaceFinish, type Level, type MaterialDef, type MeshGroup } from '@interio/core';

/** Floor of a room that has no finish of its own, and of open floor outside any room. */
export const DEFAULT_FLOOR = 'floor.tile.white';

export interface SurfaceFinish {
  /** Palette id or `#rrggbb`; undefined for the parts that never take a finish (cut tops, ends, reveals, bare facades). */
  finish?: string;
  surface: MaterialDef['surface'];
}

/**
 * The finish of one mesh group. A wall face shows its own accent finish
 * (`Wall.finishLeft` / `finishRight`), else its room's wall finish, else the default; an
 * outside face (no room) keeps the facade colour unless it has an accent of its own.
 */
export function surfaceFinish(level: Pick<Level, 'rooms' | 'walls'>, g: MeshGroup): SurfaceFinish {
  const room = g.roomId ? level.rooms[g.roomId] : undefined;
  switch (g.kind) {
    case 'floor':
      return { finish: room?.floorMaterial ?? DEFAULT_FLOOR, surface: 'floor' };
    case 'ceiling':
      return { finish: room?.ceilingMaterial ?? DEFAULT_CEILING_MATERIAL, surface: 'ceiling' };
    case 'wallSide': {
      const wall = g.wallId ? level.walls[g.wallId] : undefined;
      const side = g.side ?? 'left';
      const own = side === 'left' ? wall?.finishLeft : wall?.finishRight;
      if (!room && !own) return { surface: 'wall' };
      return { finish: wallFaceFinish(wall, side, room?.wallMaterial ?? DEFAULT_WALL_MATERIAL), surface: 'wall' };
    }
    default:
      return { surface: 'wall' };
  }
}
