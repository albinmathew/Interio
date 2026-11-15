/**
 * Who each bedroom is for. A bedroom keeps the role it was given; the others get one by
 * size before the home is furnished: the largest is the master bedroom, then the kids'
 * bedroom, then the guest bedroom. A fourth bedroom or more is a guest bedroom again,
 * and a home with two bedrooms has a master and a guest bedroom.
 */
import { deriveRooms, type BedroomRole, type Level, type RoomGeom } from '@interio/core';

/** The roles bedrooms take in order of size, for a home with `n` bedrooms. */
export function roleSequence(n: number): BedroomRole[] {
  if (n <= 1) return ['master'];
  if (n === 2) return ['master', 'guest'];
  return ['master', 'kids', 'guest'];
}

/**
 * The role of every bedroom: its own when set, otherwise one from its size among the
 * roles the set ones leave. Deterministic for a plan.
 */
export function bedroomRoles(level: Level, geoms: RoomGeom[] = deriveRooms(level)): Record<string, BedroomRole> {
  const bedrooms = Object.values(level.rooms).filter((r) => r.type === 'bedroom');
  const out: Record<string, BedroomRole> = {};
  const free = roleSequence(bedrooms.length);
  for (const room of bedrooms) {
    if (!room.role) continue;
    out[room.id] = room.role;
    const i = free.indexOf(room.role);
    if (i >= 0) free.splice(i, 1);
  }
  const area = (id: string) => geoms.find((g) => g.roomId === id)?.interiorArea ?? 0;
  const unset = bedrooms
    .filter((r) => !r.role)
    // Largest first; ties by position in the plan (top to bottom, left to right).
    .sort((a, b) => area(b.id) - area(a.id) || b.seed.y - a.seed.y || a.seed.x - b.seed.x);
  unset.forEach((room, i) => {
    out[room.id] = free[i] ?? 'guest';
  });
  return out;
}

/** Roles to write for bedrooms that have none yet. */
export function missingBedroomRoles(level: Level, geoms?: RoomGeom[]): Record<string, BedroomRole> {
  const all = bedroomRoles(level, geoms);
  return Object.fromEntries(Object.entries(all).filter(([id]) => !level.rooms[id]?.role));
}

export const ROLE_LABELS: Record<BedroomRole, string> = { master: 'Master', kids: 'Kids', guest: 'Guest' };
