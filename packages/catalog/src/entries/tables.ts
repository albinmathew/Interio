/** Catalog entries: tables. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import {
  COFFEE_GLASS_SLOTS,
  COFFEE_WOOD_SLOTS,
  CONSOLE_DRAWER_SLOTS,
  CONSOLE_SLOTS,
  SIDE_TABLE_SLOTS,
  diningSlots,
} from '../premium/tables';
import { gen } from './helpers';

const DINING_OAK = diningSlots('wood.oak', 'wood.oak');
const DINING_OAK_METAL = diningSlots('wood.oak', 'metal.black', 'wood', 'metal');
const DINING_WALNUT = diningSlots('wood.walnut', 'wood.walnut');
const DINING_GLASS = diningSlots('glass.clear', 'metal.black', 'glass', 'metal');
const DINING_ROUND = diningSlots('stone.marble.white', 'wood.walnut', 'stone', 'wood');

export const TABLES_ENTRIES: CatalogEntry[] = [
  gen('table.coffee', 'Coffee table', 'tables', ['living'], 'coffeeTable', [1100, 600, 400], ['centre table', 'center table', 'wooden'], { slots: COFFEE_WOOD_SLOTS, params: { styled: true } }),
  gen('table.coffee.glass', 'Glass coffee table', 'tables', ['living'], 'coffeeTable', [1100, 600, 400], ['centre table', 'center table', 'glass'], {
    slots: COFFEE_GLASS_SLOTS,
    params: { material: 'glass' },
  }),
  gen('table.coffee.square', 'Square coffee table', 'tables', ['living'], 'coffeeTable', [750, 750, 400], ['centre table', 'center table', 'wooden'], { slots: COFFEE_WOOD_SLOTS, params: { styled: true } }),
  gen('table.coffee.glass.square', 'Square glass coffee table', 'tables', ['living'], 'coffeeTable', [750, 750, 400], ['centre table', 'center table', 'glass'], {
    slots: COFFEE_GLASS_SLOTS,
    params: { material: 'glass' },
  }),
  gen('table.side', 'Round side table', 'tables', ['living', 'bedroom', 'study'], 'occasionalTable', [450, 450, 520], ['end table', 'accent table', 'lamp table'], { slots: SIDE_TABLE_SLOTS }),
  gen('table.console', 'Console table', 'tables', ['foyer', 'living', 'corridor'], 'consoleTable', [1100, 350, 780], ['hall table', 'entry table', 'sofa table'], { slots: CONSOLE_SLOTS }),
  gen('table.console.drawers', 'Console table with drawers', 'tables', ['foyer', 'living', 'bedroom'], 'consoleTable', [1100, 380, 780], ['hall table', 'entry table', 'dressing table'], {
    slots: CONSOLE_DRAWER_SLOTS,
    params: { style: 'drawers' },
  }),
  gen('table.dining4', 'Dining table for four', 'tables', ['dining', 'kitchen', 'living'], 'diningTable', [1250, 800, 750], ['dining', '4 seater', 'wooden'], {
    slots: DINING_OAK,
    params: { settings: 4 },
  }),
  gen('table.dining6', 'Dining table for six', 'tables', ['dining', 'living'], 'diningTable', [1700, 900, 750], ['dining', '6 seater', 'wooden'], {
    slots: DINING_OAK_METAL,
    params: { base: 'metal', settings: 6, runner: true },
  }),
  gen('table.dining8', 'Dining table for eight', 'tables', ['dining', 'living'], 'diningTable', [2300, 1000, 750], ['dining', '8 seater', 'wooden'], {
    slots: DINING_WALNUT,
    params: { settings: 8, runner: true },
  }),
  gen('table.dining.trestle', 'Trestle dining table', 'tables', ['dining', 'living', 'balcony'], 'diningTable', [1800, 900, 750], ['dining', '6 seater', 'farmhouse'], {
    slots: DINING_OAK,
    params: { base: 'trestle', runner: true },
  }),
  gen('table.dining.glass', 'Glass dining table', 'tables', ['dining', 'living'], 'diningTable', [1700, 900, 750], ['dining', '6 seater', 'glass'], {
    slots: DINING_GLASS,
    params: { base: 'sled', top: 'glass', settings: 6 },
  }),
  gen('table.dining.round', 'Round dining table', 'tables', ['dining', 'kitchen', 'living'], 'diningTable', [1100, 1100, 750], ['dining', '4 seater', 'pedestal'], {
    slots: DINING_ROUND,
    params: { base: 'pedestal', top: 'stone', settings: 4, runner: true },
  }),
];
