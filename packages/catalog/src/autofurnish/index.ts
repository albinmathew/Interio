import { deriveRooms, type Item, type Level } from '@interio/core';
import { Planner } from './planner';
import { TEMPLATES } from './templates';

export interface AutoFurnishOptions {
  /** Include wall-mounted and ceiling pieces (AC, fan, lights, wall cabinets, mirrors). Default true. */
  mounted?: boolean;
}

/**
 * Proposes a furniture layout for one room. Returns items to add; the level is never mutated.
 *
 * The layout follows the room's type and scales with its clear floor area. Every item stays
 * inside the room's clear polygon, no two items overlap (rugs may lie under furniture, and
 * pieces may stack: a hob on a counter, a lamp on a nightstand), door swings, sliding doors
 * and passages stay clear, and nothing taller than a window sill stands in front of a window.
 * Items already in the room are treated as obstacles. The result is deterministic: the same
 * level always gives the same items.
 */
export function autoFurnish(level: Level, roomId: string, options: AutoFurnishOptions = {}): Omit<Item, 'id'>[] {
  const room = level.rooms[roomId];
  const geom = room && deriveRooms(level).find((g) => g.roomId === roomId);
  if (!room || !geom || geom.interior.length < 3) return [];
  const planner = new Planner(level, room, geom);
  if (planner.runs.length < 3) return [];
  TEMPLATES[room.type](planner, { mounted: options.mounted ?? true });
  return planner.result();
}
