/**
 * Room finishes: which materials each surface can take, and the patches behind the
 * "apply to all" and "reset" actions. Pure: no store, no DOM.
 */
import {
  DEFAULT_CEILING_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  MATERIALS,
  MATERIAL_LIST,
  defaultFloorFor,
  defaultWallFor,
  type Id,
  type MaterialDef,
  type Room,
  type RoomType,
} from '@interio/core';

export type Surface = MaterialDef['surface'];

export const SURFACES: readonly Surface[] = ['floor', 'wall', 'ceiling'];

export const SURFACE_LABEL: Record<Surface, string> = { floor: 'Floor', wall: 'Walls', ceiling: 'Ceiling' };

/** The room property a surface's finish is stored in. */
const PROP = { floor: 'floorMaterial', wall: 'wallMaterial', ceiling: 'ceilingMaterial' } as const satisfies Record<Surface, keyof Room>;

export type FinishPatch = Partial<Pick<Room, 'floorMaterial' | 'wallMaterial' | 'ceilingMaterial'>>;

/** Paints are one flat colour, so they suit a ceiling as well as a wall. */
function isPaint(def: MaterialDef): boolean {
  return def.id.startsWith('wall.paint.');
}

/**
 * The finishes offered for a surface, in palette order. Floors and walls get their own
 * entries; a ceiling gets the ceiling entries followed by the wall paints, so it can be
 * coloured.
 */
export function finishOptions(surface: Surface, list: readonly MaterialDef[] = MATERIAL_LIST): MaterialDef[] {
  const own = list.filter((m) => m.surface === surface);
  return surface === 'ceiling' ? [...own, ...list.filter(isPaint)] : own;
}

/** Every surface with its options, in the order the panel shows them. */
export function finishGroups(list: readonly MaterialDef[] = MATERIAL_LIST): { surface: Surface; label: string; options: MaterialDef[] }[] {
  return SURFACES.map((surface) => ({ surface, label: SURFACE_LABEL[surface], options: finishOptions(surface, list) }));
}

/** The finish a room shows on a surface: its own, or the default the renderer falls back to. */
export function currentFinish(room: Pick<Room, 'floorMaterial' | 'wallMaterial' | 'ceilingMaterial'>, surface: Surface): string {
  if (surface === 'floor') return room.floorMaterial;
  if (surface === 'wall') return room.wallMaterial ?? DEFAULT_WALL_MATERIAL;
  return room.ceilingMaterial ?? DEFAULT_CEILING_MATERIAL;
}

/** Name for a finish id, also for ids the palette no longer has. */
export function finishName(id: string): string {
  return MATERIALS[id]?.name ?? 'Custom';
}

export function finishPatch(surface: Surface, id: string): FinishPatch {
  return { [PROP[surface]]: id };
}

/** The finishes a room of this type starts with. */
export function defaultFinishes(type: RoomType): Required<FinishPatch> {
  return { floorMaterial: defaultFloorFor(type), wallMaterial: defaultWallFor(type), ceilingMaterial: DEFAULT_CEILING_MATERIAL };
}

export function hasDefaultFinishes(room: Room): boolean {
  const d = defaultFinishes(room.type);
  return SURFACES.every((s) => currentFinish(room, s) === currentFinish(d, s));
}

/** Patch that puts a room back on its type's defaults (the ceiling returns to "not set"). */
export function resetPatch(room: Room): FinishPatch {
  const d = defaultFinishes(room.type);
  return { floorMaterial: d.floorMaterial, wallMaterial: d.wallMaterial, ceilingMaterial: undefined };
}

export type ApplyScope = 'all' | 'type';

/**
 * Patches that copy the finishes of room `sourceId` onto the other rooms: all of them,
 * or only those of the same type. Rooms that already look the same get no patch.
 */
export function applyFinishes(rooms: Record<Id, Room>, sourceId: Id, scope: ApplyScope): Record<Id, FinishPatch> {
  const source = rooms[sourceId];
  const out: Record<Id, FinishPatch> = {};
  if (!source) return out;
  for (const room of Object.values(rooms)) {
    if (room.id === sourceId || (scope === 'type' && room.type !== source.type)) continue;
    if (SURFACES.every((s) => currentFinish(room, s) === currentFinish(source, s))) continue;
    out[room.id] = { floorMaterial: source.floorMaterial, wallMaterial: source.wallMaterial, ceilingMaterial: source.ceilingMaterial };
  }
  return out;
}

const PLURAL: Record<RoomType, string> = {
  living: 'living rooms',
  dining: 'dining rooms',
  bedroom: 'bedrooms',
  kitchen: 'kitchens',
  bathroom: 'bathrooms',
  balcony: 'balconies',
  utility: 'utility rooms',
  foyer: 'foyers',
  study: 'studies',
  corridor: 'corridors',
  storage: 'storage rooms',
  other: 'other rooms',
};

/** "bedrooms", "living rooms": for "Apply to all bedrooms". */
export function pluralRoomType(type: RoomType): string {
  return PLURAL[type];
}

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (c: number): number => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/**
 * Multiplies RGBA pixels (sRGB bytes) by a linear-light colour, in place: the same
 * tint the 3D view gives a texture, so a swatch matches the surface it stands for.
 */
export function tintPixels(data: Uint8ClampedArray, multiplier: readonly [number, number, number]): Uint8ClampedArray {
  const luts = multiplier.map((k) => Uint8ClampedArray.from({ length: 256 }, (_, v) => toSrgb(Math.min(1, toLinear(v) * k))));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = luts[0]![data[i]!]!;
    data[i + 1] = luts[1]![data[i + 1]!]!;
    data[i + 2] = luts[2]![data[i + 2]!]!;
  }
  return data;
}
