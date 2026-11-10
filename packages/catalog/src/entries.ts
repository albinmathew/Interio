import type { CatalogCategory, CatalogEntry, RoomType } from '@interio/core';

const box = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  w: number,
  d: number,
  h: number,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id,
  name,
  category,
  roomTypes,
  dims: { w, d, h },
  anchor: 'floor',
  model: { kind: 'parametric', generator: 'box' },
  licence: 'CC0-1.0 (Interio parametric)',
  ...extra,
});

/** Placeholder set. Ids are stable: the real catalog keeps them. */
export const PLACEHOLDER_ENTRIES: CatalogEntry[] = [
  box('bed.double', 'Double bed', 'beds', ['bedroom'], 1600, 2100, 900),
  box('bed.single', 'Single bed', 'beds', ['bedroom'], 1000, 2000, 850),
  box('nightstand', 'Nightstand', 'storage', ['bedroom'], 450, 400, 500),
  box('wardrobe.2door', 'Two-door wardrobe', 'storage', ['bedroom'], 1200, 600, 2100),
  box('sofa.3seat', 'Three-seat sofa', 'seating', ['living'], 2200, 900, 800),
  box('armchair', 'Armchair', 'seating', ['living', 'bedroom', 'study'], 850, 850, 800),
  box('table.coffee', 'Coffee table', 'tables', ['living'], 1100, 600, 420),
  box('table.dining6', 'Dining table for six', 'tables', ['dining', 'living'], 1800, 900, 750),
  box('chair.dining', 'Dining chair', 'seating', ['dining', 'living', 'kitchen'], 450, 500, 900),
  box('desk', 'Desk', 'office', ['study', 'bedroom'], 1400, 700, 750),
  box('tv.unit', 'TV unit', 'storage', ['living', 'bedroom'], 1800, 420, 500),
  box('fridge.double', 'Double-door refrigerator', 'appliances', ['kitchen'], 900, 700, 1800),
  box('washer.front', 'Front-load washing machine', 'appliances', ['utility', 'bathroom'], 600, 600, 850),
  box('hob.4burner', 'Four-burner hob', 'appliances', ['kitchen'], 600, 520, 60, { mountHeight: 850 }),
  box('ac.split', 'Split air conditioner', 'appliances', ['bedroom', 'living'], 900, 220, 300, {
    anchor: 'wall',
    mountHeight: 2300,
  }),
];
