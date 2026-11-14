/**
 * Catalog entries: styling accessories. Curtains in standard widths that stack
 * beside a window, and small pieces that dress a surface. Ids are stable:
 * saved projects reference them.
 */
import type { CatalogEntry } from '@interio/core';
import {
  BOOK_STACK_SLOTS,
  BOWL_SLOTS,
  CROCK_SLOTS,
  FRUIT_BOWL_SLOTS,
  STACKED_CURTAIN_SLOTS,
  TRAY_SLOTS,
  VASE_SLOTS,
  VASE_TRIO_SLOTS,
} from '../premium/accessories';
import { RUG_SLOTS } from '../premium/decor';
import { WORKTOP, gen, on, wall } from './helpers';

/** Widths of the stacked curtains, mm. Each gathered panel takes `CURTAIN_STACK` mm at an end of the rod. */
export const CURTAIN_WIDTHS = [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900] as const;
export const CURTAIN_STACK = 300;
/** Console and sideboard height: where surface pieces stand by default. */
const SURFACE = 780;

export const ACCESSORY_ENTRIES: CatalogEntry[] = [
  ...CURTAIN_WIDTHS.map((w) =>
    gen(`curtain.pair.${w}`, `Curtains ${(w / 1000).toFixed(1)} m`, 'decor', ['living', 'bedroom', 'dining', 'study'], 'accessoryCurtains', [w, 120, 2650], ['curtains', 'drapes', 'window', 'linen', 'floor length'], {
      ...wall(20),
      slots: STACKED_CURTAIN_SLOTS,
      params: { stack: CURTAIN_STACK },
    }),
  ),
  gen('rug.large', 'Large rug', 'decor', ['living', 'bedroom', 'dining'], 'decorRug', [3000, 2000, 15], ['rug', 'carpet', 'area rug', 'large'], { slots: RUG_SLOTS.oat }),
  gen('vase.branches', 'Vase with branches', 'decor', ['living', 'dining', 'foyer', 'bedroom'], 'accessoryVaseBranches', [300, 300, 700], ['vase', 'branches', 'stems', 'decor'], {
    ...on(SURFACE),
    slots: VASE_SLOTS,
  }),
  gen('vase.trio', 'Set of vases', 'decor', ['living', 'dining', 'bedroom', 'foyer'], 'accessoryVaseTrio', [330, 200, 300], ['vase', 'vases', 'ceramics', 'decor'], {
    ...on(SURFACE),
    slots: VASE_TRIO_SLOTS,
  }),
  gen('tray.candles', 'Tray with candles', 'decor', ['living', 'dining', 'bedroom', 'bathroom'], 'accessoryTrayCandles', [380, 240, 170], ['tray', 'candles', 'candle holder', 'decor'], {
    ...on(400),
    slots: TRAY_SLOTS,
  }),
  gen('bowl.wood', 'Wooden bowl', 'decor', ['living', 'dining', 'foyer'], 'accessoryBowl', [340, 340, 100], ['bowl', 'dish', 'decor'], { ...on(SURFACE), slots: BOWL_SLOTS }),
  gen('bowl.fruit', 'Fruit bowl', 'decor', ['kitchen', 'dining'], 'accessoryBowl', [320, 320, 150], ['bowl', 'fruit', 'fruit bowl'], {
    ...on(WORKTOP),
    slots: FRUIT_BOWL_SLOTS,
    params: { fruit: true },
  }),
  gen('books.stack', 'Stack of books', 'decor', ['living', 'bedroom', 'study'], 'accessoryBookStack', [300, 220, 150], ['book', 'books', 'coffee table books', 'decor'], {
    ...on(400),
    slots: BOOK_STACK_SLOTS,
  }),
  gen('utensil.crock', 'Utensil crock', 'kitchen', ['kitchen'], 'accessoryCrock', [160, 160, 380], ['utensils', 'crock', 'spoons', 'countertop'], { ...on(WORKTOP), slots: CROCK_SLOTS }),
];
