/** Catalog entries: outdoor. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { gen, glb } from './helpers';

export const OUTDOOR_ENTRIES: CatalogEntry[] = [
  glb('outdoor.chair', 'Balcony chair', 'outdoor', ['balcony'], 'outdoor-chair', ['patio chair', 'garden chair', 'outdoor']),
  glb('outdoor.table', 'Bistro table', 'outdoor', ['balcony'], 'outdoor-table', ['patio table', 'garden table', 'outdoor', 'tea table']),
  glb('outdoor.table.coffee', 'Outdoor coffee table', 'outdoor', ['balcony'], 'outdoor-coffee-table', ['patio table', 'garden table', 'outdoor']),
  glb('outdoor.bench', 'Garden bench', 'outdoor', ['balcony'], 'outdoor-bench', ['patio bench', 'outdoor', 'teak']),
  gen('outdoor.planter', 'Planter box', 'outdoor', ['balcony', 'foyer'], 'planter', [800, 300, 700], ['plants', 'planter', 'greenery', 'hedge']),
  gen('drying.rack', 'Clothes drying rack', 'outdoor', ['balcony', 'utility'], 'dryingRack', [1400, 560, 950], ['laundry', 'clothes stand', 'drying stand', 'airer']),
];
