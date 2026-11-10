import { deriveRooms } from './geometry/rooms';
import { dist } from './geometry/vec';
import type { Issue, Level } from './schema';

/** Structural problems in a level. An empty list means the plan is sound. */
export function validateLevel(level: Level): Issue[] {
  const issues: Issue[] = [];
  for (const w of Object.values(level.walls)) {
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    if (!a || !b) {
      issues.push({ severity: 'error', code: 'wall.vertex', message: 'Wall references a missing vertex', refs: [w.id] });
      continue;
    }
    if (dist(a, b) < 1) issues.push({ severity: 'error', code: 'wall.zero', message: 'Wall has no length', refs: [w.id], at: a });
  }
  const byWall = new Map<string, { id: string; s0: number; s1: number }[]>();
  for (const o of Object.values(level.openings)) {
    const w = level.walls[o.wallId];
    const a = w && level.vertices[w.a];
    const b = w && level.vertices[w.b];
    if (!w || !a || !b) {
      issues.push({ severity: 'error', code: 'opening.wall', message: 'Opening references a missing wall', refs: [o.id] });
      continue;
    }
    const length = dist(a, b);
    const s0 = o.offset - o.width / 2;
    const s1 = o.offset + o.width / 2;
    if (s0 < 0 || s1 > length)
      issues.push({ severity: 'warning', code: 'opening.bounds', message: 'Opening extends past the end of its wall', refs: [o.id, w.id] });
    if (o.sill + o.height > w.height + 1)
      issues.push({ severity: 'warning', code: 'opening.height', message: 'Opening is taller than its wall', refs: [o.id, w.id] });
    const list = byWall.get(w.id) ?? [];
    for (const other of list)
      if (s0 < other.s1 && other.s0 < s1)
        issues.push({ severity: 'warning', code: 'opening.overlap', message: 'Openings overlap', refs: [o.id, other.id] });
    list.push({ id: o.id, s0, s1 });
    byWall.set(w.id, list);
  }
  const rooms = deriveRooms(level);
  if (Object.keys(level.walls).length > 0 && rooms.length === 0)
    issues.push({ severity: 'warning', code: 'rooms.none', message: 'No closed rooms yet. Close the wall loop to create one.' });
  for (const item of Object.values(level.items))
    if (item.roomId && !level.rooms[item.roomId])
      issues.push({ severity: 'info', code: 'item.room', message: 'Item points at a room that no longer exists', refs: [item.id] });
  return issues;
}
