/**
 * Stable seeds for the styling pass. Room ids are random (`newId`), so a seed
 * taken from them would restyle the same plan differently every time it is
 * imported. A room is keyed by what survives a re-import instead: its type and
 * its seed point. The home is keyed by its first room.
 */
import type { Level, Room } from '@interio/core';

/** FNV-1a: a stable 32-bit number from a string. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A room's identity for seeding: type and seed point to the nearest 10 cm. */
export function roomKey(room: Room): string {
  return `${room.type}@${Math.round(room.seed.x / 100)},${Math.round(room.seed.y / 100)}`;
}

/** The home's identity for seeding: its first room. */
export function homeKey(level: Level): string {
  const first = Object.values(level.rooms)[0];
  return first ? roomKey(first) : 'home';
}

/**
 * Picks for one room. Rooms of the same type walk through each list in turn
 * (ordered by where they are in the plan), from a starting point seeded by the
 * home, so two bedrooms differ while every room stays deterministic.
 */
export class RoomSeed {
  readonly home: number;
  readonly room: number;
  /** Position of the room among the home's rooms of its type, ordered by seed point. */
  readonly ordinal: number;

  constructor(level: Level, room: Room) {
    this.home = hashString(homeKey(level));
    this.room = hashString(roomKey(room));
    const order = Object.values(level.rooms)
      .filter((r) => r.type === room.type)
      .map((r) => ({ key: roomKey(r), y: -r.seed.y, x: r.seed.x }))
      .sort((a, b) => a.y - b.y || a.x - b.x || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    this.ordinal = Math.max(0, order.findIndex((r) => r.key === roomKey(room)));
  }

  /** One item of a list for a named choice ("plant", "art"...), varied between the rooms of a home. */
  pick<T>(name: string, list: readonly T[]): T {
    const start = hashString(`${this.home}:${name}`);
    return list[(start + this.ordinal) % list.length]!;
  }

  /** The list rotated to start at this room's pick: a preference order. */
  order<T>(name: string, list: readonly T[]): T[] {
    const start = (hashString(`${this.home}:${name}`) + this.ordinal) % list.length;
    return [...list.slice(start), ...list.slice(0, start)];
  }

  /** A random stream for one named choice of this room. */
  random(name: string): () => number {
    return seededRandom(hashString(`${this.home}:${this.room}:${name}`));
  }
}
