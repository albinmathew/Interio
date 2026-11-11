/**
 * Customising furniture and single wall faces: which swatches a slot offers, and the
 * patches behind each pick. Pure: no store, no DOM.
 */
import {
  FINISH_KINDS,
  FURNITURE_MATERIALS,
  FURNITURE_MATERIAL_LIST,
  MATERIALS,
  finishOf,
  isHexColor,
  type FinishKind,
  type FinishSlot,
  type FurnitureMaterial,
  type Id,
  type Item,
  type Level,
  type MaterialDef,
} from '@interio/core';

export const KIND_LABEL: Record<FinishKind, string> = {
  fabric: 'Fabric',
  leather: 'Leather',
  wood: 'Wood',
  lacquer: 'Painted',
  stone: 'Stone',
  metal: 'Metal',
  glass: 'Glass',
  ceramic: 'Ceramic',
  woven: 'Cane and jute',
};

export interface SwatchGroup {
  kind: FinishKind;
  label: string;
  materials: FurnitureMaterial[];
}

/**
 * Swatches for a slot: the materials of the slot's own kind first, then every other kind
 * (shown behind "More"), each in palette order.
 */
export function slotSwatchGroups(kind: FinishKind, list: readonly FurnitureMaterial[] = FURNITURE_MATERIAL_LIST): { primary: SwatchGroup; more: SwatchGroup[] } {
  const group = (k: FinishKind): SwatchGroup => ({ kind: k, label: KIND_LABEL[k], materials: list.filter((m) => m.kind === k) });
  return {
    primary: group(kind),
    more: FINISH_KINDS.filter((k) => k !== kind)
      .map(group)
      .filter((g) => g.materials.length > 0),
  };
}

/** The finish a slot of an item shows: its own choice, else the entry's default. */
export function slotValue(slots: readonly FinishSlot[] | undefined, item: Pick<Item, 'finishes'>, slotId: string): string | undefined {
  return finishOf(slots, item.finishes, slotId);
}

/** True when the item has its own (valid) choice for the slot. */
export function hasOwnFinish(item: Pick<Item, 'finishes'>, slotId: string): boolean {
  const v = item.finishes?.[slotId];
  return !!v && (!!FURNITURE_MATERIALS[v] || isHexColor(v));
}

/** Name of a furniture finish value. */
export function furnitureFinishName(value: string | undefined): string {
  if (!value) return 'Default';
  if (isHexColor(value)) return `Custom ${value.toLowerCase()}`;
  return FURNITURE_MATERIALS[value]?.name ?? 'Custom';
}

/**
 * The item's finishes after picking `value` for a slot (null clears it back to the
 * default). Undefined when nothing is left. Null when nothing would change.
 */
export function finishesAfterPick(item: Pick<Item, 'finishes'>, slotId: string, value: string | null): Record<string, string> | undefined | null {
  const current = item.finishes ?? {};
  const next = { ...current };
  if (value === null) {
    if (!(slotId in current)) return null;
    delete next[slotId];
  } else {
    const v = isHexColor(value) ? value.toLowerCase() : value;
    if (!FURNITURE_MATERIALS[v] && !isHexColor(v)) return null;
    if (current[slotId] === v) return null;
    next[slotId] = v;
  }
  return Object.keys(next).length ? next : undefined;
}

const sameFinishes = (a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean => {
  const ka = Object.keys(a ?? {});
  const kb = Object.keys(b ?? {});
  return ka.length === kb.length && ka.every((k) => a![k] === b?.[k]);
};

/** The other items of the same catalog entry whose finishes differ from `itemId`'s: the targets of "Apply to all". */
export function sameEntryTargets(level: Pick<Level, 'items'>, itemId: Id): Id[] {
  const source = level.items[itemId];
  if (!source) return [];
  return Object.values(level.items)
    .filter((i) => i.id !== itemId && i.catalogId === source.catalogId && !sameFinishes(i.finishes, source.finishes))
    .map((i) => i.id);
}

/** Every item of the same entry in the home, this one included. */
export function sameEntryCount(level: Pick<Level, 'items'>, itemId: Id): number {
  const source = level.items[itemId];
  return source ? Object.values(level.items).filter((i) => i.catalogId === source.catalogId).length : 0;
}

/* ------------------------------------------------------------- wall faces */

export type WallSide = 'left' | 'right';

/** The accent finish of one face, if it has one. */
export function faceFinish(wall: { finishLeft?: string; finishRight?: string } | undefined, side: WallSide): string | undefined {
  return side === 'left' ? wall?.finishLeft : wall?.finishRight;
}

/** The wall prop a face's finish is stored in, and the patch that sets (or with null clears) it. */
export function facePatch(side: WallSide, value: string | null): { finishLeft?: string } | { finishRight?: string } {
  const v = value === null ? undefined : isHexColor(value) ? value.toLowerCase() : value;
  return side === 'left' ? { finishLeft: v } : { finishRight: v };
}

/* ------------------------------------------------------- surface sections */

export interface FinishSection {
  label: string;
  options: MaterialDef[];
}

const SECTION_RULES: Record<MaterialDef['surface'], { label: string; test: (id: string) => boolean }[]> = {
  floor: [
    { label: 'Wood', test: (id) => /^floor\.(oak|walnut|ash|herringbone|chevron|deck)/.test(id) },
    { label: 'Stone and tile', test: (id) => /^floor\.(tile|marble|terrazzo|travertine|slate)/.test(id) },
    { label: 'Seamless and soft', test: () => true },
  ],
  wall: [
    { label: 'Paint', test: (id) => id.startsWith('wall.paint.') },
    { label: 'Panelling and paper', test: (id) => /^wall\.(wood|panel|wallpaper)/.test(id) },
    { label: 'Stone, tile and plaster', test: () => true },
  ],
  ceiling: [
    { label: 'Ceiling', test: (id) => id.startsWith('ceiling.') },
    { label: 'Paint', test: () => true },
  ],
};

/** A surface's options split into short labelled sections, each in palette order; every option appears once. */
export function finishSections(surface: MaterialDef['surface'], options: readonly MaterialDef[]): FinishSection[] {
  const rules = SECTION_RULES[surface];
  const sections = rules.map((r) => ({ label: r.label, options: [] as MaterialDef[] }));
  for (const def of options) sections[rules.findIndex((r) => r.test(def.id))]!.options.push(def);
  return sections.filter((s) => s.options.length > 0);
}

/** Name of a surface finish: palette name, "Custom #rrggbb", or "Custom" for ids the palette no longer has. */
export function surfaceFinishName(value: string | undefined): string {
  if (value && isHexColor(value)) return `Custom ${value.toLowerCase()}`;
  return (value && MATERIALS[value]?.name) ?? 'Custom';
}
