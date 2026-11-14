import { deriveRooms, type Item, type Level } from '@interio/core';
import { Planner } from './planner';
import { homeScheme } from './schemes';
import { RoomSeed } from './seed';
import { applyScheme, releaseCurtains, reserveCurtains, stylePass, type StylingLevel } from './styling';
import { TEMPLATES } from './templates';

export type { StylingLevel } from './styling';
export { SCHEMES, type Scheme } from './schemes';

export interface AutoFurnishOptions {
  /** Include wall-mounted and ceiling pieces (AC, fan, lights, wall cabinets, mirrors, curtains, art). Default true. */
  mounted?: boolean;
  /**
   * The styling layer added after the main pieces: `none` (main pieces only), `light`
   * (curtains, bedside lamps, a rug, art and a plant) or `full` (also side tables, benches,
   * mirrors and objects on surfaces). Default `full`. Styled rooms take their finishes from
   * the home's colour scheme.
   */
  styling?: StylingLevel;
}

function plannerFor(level: Level, roomId: string): Planner | null {
  const room = level.rooms[roomId];
  const geom = room && deriveRooms(level).find((g) => g.roomId === roomId);
  if (!room || !geom || geom.interior.length < 3) return null;
  const planner = new Planner(level, room, geom);
  return planner.runs.length < 3 ? null : planner;
}

/**
 * Proposes a furniture layout for one room. Returns items to add; the level is never mutated.
 *
 * The layout follows the room's type and scales with its clear floor area. Every item stays
 * inside the room's clear polygon, no two items overlap (rugs may lie under furniture, and
 * pieces may stack: a hob on a counter, a lamp on a nightstand), door swings, sliding doors
 * and passages stay clear, and nothing taller than a window sill stands in front of a window
 * (curtains stack beside it). Items already in the room are treated as obstacles. The result
 * is deterministic: the same plan always gives the same items, even with new ids.
 */
export function autoFurnish(level: Level, roomId: string, options: AutoFurnishOptions = {}): Omit<Item, 'id'>[] {
  const planner = plannerFor(level, roomId);
  if (!planner) return [];
  const mounted = options.mounted ?? true;
  const styling = options.styling ?? 'full';
  const seed = new RoomSeed(level, planner.room);
  const reserved = styling === 'none' ? [] : reserveCurtains(planner, mounted);
  TEMPLATES[planner.room.type](planner, { mounted, styled: styling !== 'none', seed });
  releaseCurtains(planner, reserved);
  if (styling !== 'none') {
    stylePass(planner, seed, styling, mounted);
    applyScheme(planner, homeScheme(seed), seed);
  }
  return planner.result();
}

export interface StyleRoomOptions {
  mounted?: boolean;
  /** Default `full`. */
  styling?: Exclude<StylingLevel, 'none'>;
}

/**
 * Adds only the styling layer to a room that is already furnished: curtains, lamps, rugs,
 * art, plants and accessories around the pieces that stand there, in the home's colour
 * scheme. Returns the items to add; the level is never mutated. Running it again on the
 * result adds little or nothing.
 */
export function styleRoom(level: Level, roomId: string, options: StyleRoomOptions = {}): Omit<Item, 'id'>[] {
  const planner = plannerFor(level, roomId);
  if (!planner) return [];
  const seed = new RoomSeed(level, planner.room);
  stylePass(planner, seed, options.styling ?? 'full', options.mounted ?? true);
  applyScheme(planner, homeScheme(seed), seed);
  return planner.result();
}
