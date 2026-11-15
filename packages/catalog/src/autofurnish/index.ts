import { deriveRooms, type Item, type Level, type RoomGeom } from '@interio/core';
import { Planner } from './planner';
import { homeScheme } from './schemes';
import { RoomSeed } from './seed';
import { applyScheme, releaseCurtains, reserveCurtains, stylePass, type StylingLevel } from './styling';
import { TEMPLATES, type Prefer } from './templates';

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

/** The layout engine for one room, or null when the room has no usable floor. Pass `geoms` to reuse a `deriveRooms` result. */
export function plannerFor(level: Level, roomId: string, geoms?: RoomGeom[]): Planner | null {
  const room = level.rooms[roomId];
  const geom = room && (geoms ?? deriveRooms(level)).find((g) => g.roomId === roomId);
  if (!room || !geom || geom.interior.length < 3) return null;
  const planner = new Planner(level, room, geom);
  return planner.runs.length < 3 ? null : planner;
}

export interface LayoutOptions {
  mounted: boolean;
  styling: StylingLevel;
  /** A package's pieces, tried before the template's own. */
  prefer?: Prefer;
  /** False when the windows get blinds instead of curtains (a package's blinds line hangs curtains on sliding doors). */
  curtained?: boolean;
}

/**
 * The main pieces of a room: its template, with the wall beside the windows kept for
 * curtains, and in bedrooms beside the sliding doors too. Elsewhere sliding doors get
 * curtains where the layout leaves room, since an open-plan living room needs that wall.
 */
export function layoutRoom(planner: Planner, seed: RoomSeed, opts: LayoutOptions): void {
  const curtained = opts.curtained ?? true;
  const reserved = opts.styling === 'none' ? [] : reserveCurtains(planner, opts.mounted, { windows: curtained, doors: planner.room.type === 'bedroom' });
  TEMPLATES[planner.room.type](planner, { mounted: opts.mounted, styled: opts.styling !== 'none', seed, prefer: opts.prefer });
  releaseCurtains(planner, reserved);
}

/** The styling layer and the colour scheme, on top of what the planner holds. */
export function finishRoom(planner: Planner, seed: RoomSeed, opts: LayoutOptions): void {
  if (opts.styling !== 'none') stylePass(planner, seed, opts.styling, opts.mounted, opts.curtained ?? true);
  applyScheme(planner, homeScheme(seed), seed);
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
  const opts: LayoutOptions = { mounted: options.mounted ?? true, styling: options.styling ?? 'full' };
  const seed = new RoomSeed(level, planner.room);
  layoutRoom(planner, seed, opts);
  if (opts.styling !== 'none') finishRoom(planner, seed, opts);
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
