/**
 * Saved looks of the home ("variants"): which one the home looks like right now,
 * names for new ones and when the first one is saved automatically. Pure.
 */
import type { Item, Level, Variant } from '@interio/core';

/** Setting whose absence means the same as its default, so `{}` and `{ lighting: daylight }` are one look. */
export interface SettingDefault {
  key: string;
  value: unknown;
}

/** The lighting preset: a project that never chose one is in daylight. Mirrors `LIGHTING_SETTING` in scene3d. */
export const LOOK_DEFAULTS: SettingDefault[] = [{ key: 'viewer3d.lighting', value: 'daylight' }];

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const ITEM_KEYS: (keyof Item)[] = ['catalogId', 'x', 'y', 'z', 'rotationDeg', 'roomId', 'scale', 'variant'];

const sameItem = (a: Item, b: Item): boolean => ITEM_KEYS.every((k) => a[k] === b[k]);

function sameSettings(a: Record<string, unknown>, b: Record<string, unknown>, defaults: SettingDefault[]): boolean {
  const fallback = new Map(defaults.map((d) => [d.key, d.value]));
  const value = (s: Record<string, unknown>, key: string) => s[key] ?? fallback.get(key);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (!sameValue(value(a, key), value(b, key))) return false;
  return true;
}

/**
 * True when applying the variant would change nothing: the same furniture in the same
 * places, the same name, type and finishes for every room it knows, the same settings.
 * Rooms that were removed from the plan since it was saved are ignored, as they are
 * when it is applied.
 */
export function variantMatches(variant: Variant, level: Level, settings: Record<string, unknown>, defaults: SettingDefault[] = LOOK_DEFAULTS): boolean {
  // Cheapest checks first: most variants differ in how much furniture they hold.
  let expected = 0;
  for (const item of Object.values(variant.items)) {
    if (item.roomId && !level.rooms[item.roomId]) continue;
    const now = level.items[item.id];
    if (!now || !sameItem(item, now)) return false;
    expected += 1;
  }
  if (expected !== Object.keys(level.items).length) return false;
  for (const [roomId, look] of Object.entries(variant.rooms)) {
    const room = level.rooms[roomId];
    if (!room) continue;
    if (
      room.name !== look.name ||
      room.type !== look.type ||
      room.floorMaterial !== look.floorMaterial ||
      (room.wallMaterial || undefined) !== (look.wallMaterial || undefined) ||
      (room.ceilingMaterial || undefined) !== (look.ceilingMaterial || undefined)
    )
      return false;
  }
  return sameSettings(variant.settings, settings, defaults);
}

/** Ids of the variants the home looks like right now (usually one or none). */
export function currentVariantIds(variants: Variant[], level: Level, settings: Record<string, unknown>): Set<string> {
  return new Set(variants.filter((v) => variantMatches(v, level, settings)).map((v) => v.id));
}

/** Newest first; variants saved in the same millisecond keep the later one on top. */
export function newestFirst(variants: Variant[]): Variant[] {
  return variants.map((v, i) => ({ v, i })).sort((a, b) => b.v.createdAt - a.v.createdAt || b.i - a.i).map((x) => x.v);
}

/** "Variant 3": the next number that no saved variant is using. */
export function defaultVariantName(variants: Pick<Variant, 'name'>[]): string {
  const taken = new Set(variants.map((v) => v.name.trim().toLowerCase()));
  let n = variants.length + 1;
  while (taken.has(`variant ${n}`)) n += 1;
  return `Variant ${n}`;
}

export const FIRST_LAYOUT_NAME = 'First layout';

/**
 * Whether the first furnished look should be saved by itself: the home has furniture,
 * nothing was saved yet, and it was not done for this project before (so deleting the
 * variant does not bring it back).
 */
export function wantsFirstLayout(project: { variants: unknown[]; levels: { items: Record<string, unknown> }[] } | null, levelIndex: number, alreadyDone: boolean): boolean {
  if (!project || alreadyDone || project.variants.length > 0) return false;
  return Object.keys(project.levels[levelIndex]?.items ?? {}).length > 0;
}

export const variantItemCount = (variant: Pick<Variant, 'items'>): number => Object.keys(variant.items).length;

/** Approximate size in bytes of what a data URL holds. */
export function dataUrlBytes(dataUrl: string): number {
  const body = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((body.length * 3) / 4);
}
