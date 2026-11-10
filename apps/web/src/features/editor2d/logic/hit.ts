/** What is under the pointer. Priority: vertex, opening, item, wall, room. */
import { ops, selectRooms, vec, type Level, type Pt, type Selection } from '@interio/core';
import { pointInItem } from './items';

export interface HitOptions {
  /** Set false to ignore vertices (they are only grabbable when their handles are drawn). */
  vertices?: boolean;
  /** Set false when the level is a draft being mutated: skips the memoised room lookup. */
  rooms?: boolean;
}

export function hitTest(level: Level, p: Pt, tolMm: number, opts: HitOptions = {}): Selection | null {
  if (opts.vertices !== false) {
    const v = ops.findVertexNear(level, p, tolMm * 1.2);
    if (v) return { kind: 'vertex', id: v };
  }

  let bestOpening: { id: string; d: number } | null = null;
  for (const o of Object.values(level.openings)) {
    const wall = level.walls[o.wallId];
    const a = wall && level.vertices[wall.a];
    const b = wall && level.vertices[wall.b];
    if (!wall || !a || !b) continue;
    const dir = vec.norm(vec.sub(b, a));
    const local = vec.sub(p, a);
    const along = Math.abs(vec.dot(local, dir) - o.offset);
    const across = Math.abs(vec.cross(dir, local));
    if (along <= o.width / 2 + tolMm * 0.4 && across <= wall.thickness / 2 + tolMm && (!bestOpening || across < bestOpening.d))
      bestOpening = { id: o.id, d: across };
  }
  if (bestOpening) return { kind: 'opening', id: bestOpening.id };

  const items = Object.values(level.items);
  for (let i = items.length - 1; i >= 0; i--) if (pointInItem(items[i]!, p)) return { kind: 'item', id: items[i]!.id };

  let bestWall: { id: string; d: number } | null = null;
  for (const w of Object.values(level.walls)) {
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    if (!a || !b) continue;
    const d = vec.projectOnSegment(p, a, b).distance - w.thickness / 2;
    if (d <= tolMm * 0.6 && (!bestWall || d < bestWall.d)) bestWall = { id: w.id, d };
  }
  if (bestWall) return { kind: 'wall', id: bestWall.id };

  if (opts.rooms !== false) {
    const room = selectRooms(level).find((r) => r.roomId && vec.pointInPolygon(p, r.polygon));
    if (room?.roomId) return { kind: 'room', id: room.roomId };
  }
  return null;
}

export const sameSelection = (a: Selection | null, b: Selection | null): boolean => a?.kind === b?.kind && a?.id === b?.id;
