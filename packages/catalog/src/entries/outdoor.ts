/** Catalog entries: outdoor. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { AIRER_SLOTS, LOUNGER_SLOTS, PLANTER_SLOTS, SLAT_TABLE_SLOTS, SLAT_TABLE_WOOD_SLOTS } from '../premium/outdoor';
import { gen } from './helpers';

export const OUTDOOR_ENTRIES: CatalogEntry[] = [
  gen('outdoor.chair', 'Balcony lounge chair', 'outdoor', ['balcony'], 'lounger', [600, 680, 760], ['patio chair', 'garden chair', 'outdoor'], { slots: LOUNGER_SLOTS }),
  gen('outdoor.table', 'Bistro table', 'outdoor', ['balcony'], 'slatTable', [600, 600, 720], ['patio table', 'garden table', 'outdoor', 'tea table'], {
    slots: SLAT_TABLE_SLOTS,
    params: { shape: 'round' },
  }),
  gen('outdoor.table.coffee', 'Outdoor coffee table', 'outdoor', ['balcony'], 'slatTable', [600, 600, 380], ['patio table', 'garden table', 'outdoor'], {
    slots: SLAT_TABLE_WOOD_SLOTS,
    params: { shape: 'square' },
  }),
  gen('outdoor.bench', 'Garden bench', 'outdoor', ['balcony'], 'lounger', [1300, 640, 860], ['patio bench', 'outdoor', 'teak'], {
    slots: LOUNGER_SLOTS,
    params: { seats: 2 },
  }),
  gen('outdoor.planter', 'Planter box', 'outdoor', ['balcony', 'foyer'], 'planterBox', [800, 300, 700], ['plants', 'planter', 'greenery', 'hedge'], { slots: PLANTER_SLOTS }),
  gen('drying.rack', 'Clothes drying rack', 'outdoor', ['balcony', 'utility'], 'airer', [1400, 560, 950], ['laundry', 'clothes stand', 'drying stand', 'airer'], { slots: AIRER_SLOTS }),
];
