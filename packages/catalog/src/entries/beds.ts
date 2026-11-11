/** Catalog entries: beds. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { BED_SLOTS } from '../premium/beds';
import { gen, glb } from './helpers';

export const BEDS_ENTRIES: CatalogEntry[] = [
  gen('bed.single', 'Single bed', 'beds', ['bedroom'], 'bed', [1000, 2080, 1000], ['bed', 'twin', 'kids', 'guest'], { slots: BED_SLOTS, params: { rows: 1 } }),
  gen('bed.double', 'Double bed', 'beds', ['bedroom'], 'bed', [1450, 2080, 1050], ['bed', 'full'], { slots: BED_SLOTS }),
  gen('bed.queen', 'Queen bed', 'beds', ['bedroom'], 'bed', [1650, 2130, 1100], ['bed', 'queen', 'master'], { slots: BED_SLOTS }),
  gen('bed.king', 'King bed', 'beds', ['bedroom'], 'bed', [1900, 2130, 1150], ['bed', 'king', 'master'], { slots: BED_SLOTS, params: { pillows: 3 } }),
  glb('bed.bunk', 'Bunk bed', 'beds', ['bedroom'], 'bed-bunk', ['bed', 'kids', 'twin']),
];
