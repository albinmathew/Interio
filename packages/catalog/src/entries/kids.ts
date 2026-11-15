/**
 * The kids' bedroom set: single beds, a bedside unit with baskets, a study and
 * storage wall, and a teddy bear. Ids and sizes are the contract room layouts
 * code against; their generators live in `premium/kids.ts` and `premium/kids.storage.ts`.
 */
import type { CatalogEntry } from '@interio/core';
import { KIDS_BED_SLOTS, KIDS_TEDDY_SLOTS } from '../premium/kids';
import { KIDS_BEDSIDE_SLOTS, KIDS_STUDY_SLOTS } from '../premium/kids.storage';
import { gen } from './helpers';

const STUDY_WIDTHS = [2100, 2400];

export const KIDS_ENTRIES: CatalogEntry[] = [
  gen('bed.single.kids', 'Kids single bed', 'beds', ['bedroom'], 'kidsBed', [1000, 2050, 950], ['bed', 'single', 'kids', 'children', 'child', 'twin', 'upholstered', 'quilt'], { slots: KIDS_BED_SLOTS }),
  gen('nightstand.baskets', 'Bedside unit with baskets', 'storage', ['bedroom'], 'kidsBedside', [1100, 400, 650], ['bedside table', 'nightstand', 'side table', 'baskets', 'wicker', 'drawers', 'kids', 'storage'], { slots: KIDS_BEDSIDE_SLOTS }),
  ...STUDY_WIDTHS.map((w) =>
    gen(`study.storage.kids.${w}`, `Study and storage wall ${(w / 1000).toFixed(1)} m`, 'storage', ['bedroom', 'study'], 'kidsStudy', [w, 600, 2400], ['study', 'desk', 'study table', 'wardrobe', 'storage', 'kids', 'children', 'built-in', 'overhead', 'shelf'], {
      slots: KIDS_STUDY_SLOTS,
      params: { wardrobe: 'left' },
    }),
  ),
  gen('toy.teddy', 'Teddy bear', 'decor', ['bedroom'], 'kidsTeddy', [260, 200, 300], ['teddy', 'teddy bear', 'toy', 'soft toy', 'kids', 'children', 'plush'], { slots: KIDS_TEDDY_SLOTS }),
];
