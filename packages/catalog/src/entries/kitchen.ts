/** Catalog entries: kitchen. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { KITCHEN_BASE_SLOTS, KITCHEN_OPEN_SLOTS, KITCHEN_SHELF_SLOTS, KITCHEN_WALL_SLOTS, type Row } from '../premium/kitchen';
import { WORKTOP, gen, wall } from './helpers';

const drawers = (cols: number, h = 1): Row => ({ h, cols, kind: 'drawer' });
const doors = (cols: number, h = 1): Row => ({ h, cols, kind: 'door' });
const base = { slots: KITCHEN_BASE_SLOTS };
/** Tall units and appliance housings line up with the tops of the wall units (1450 + 720 mm). */
export const TALL = 2170;
/** Depth of a tall unit: a base unit's carcass and front, so the fronts are flush. */
export const TALL_DEPTH = 580;

export const KITCHEN_ENTRIES: CatalogEntry[] = [
  gen('kitchen.base', 'Base cabinet', 'kitchen', ['kitchen'], 'kitchenBase', [600, 600, WORKTOP], ['base unit', 'counter', 'modular'], {
    ...base,
    params: { rows: [drawers(1, 0.2), doors(1, 0.8)] },
  }),
  gen('kitchen.base.drawers', 'Base cabinet with drawers', 'kitchen', ['kitchen'], 'kitchenBase', [600, 600, WORKTOP], ['base unit', 'counter', 'drawer unit', 'modular'], {
    ...base,
    params: { rows: [drawers(1, 0.22), drawers(1, 0.33), drawers(1, 0.45)] },
  }),
  gen('kitchen.base.corner', 'Corner base cabinet', 'kitchen', ['kitchen'], 'kitchenCorner', [900, 900, WORKTOP], ['base unit', 'counter', 'corner', 'modular'], base),
  gen('kitchen.base.end', 'Rounded end cabinet', 'kitchen', ['kitchen'], 'kitchenEnd', [600, 600, WORKTOP], ['base unit', 'counter', 'end unit', 'modular'], {
    slots: KITCHEN_OPEN_SLOTS,
  }),
  gen('kitchen.sink', 'Sink unit', 'kitchen', ['kitchen', 'utility'], 'kitchenBase', [600, 600, 1150], ['sink', 'tap', 'faucet', 'basin'], {
    ...base,
    params: { rows: [doors(1)], sink: 'inset', counter: WORKTOP },
  }),
  gen('kitchen.wall', 'Wall cabinet', 'kitchen', ['kitchen'], 'kitchenWall', [600, 350, 720], ['upper cabinet', 'overhead', 'modular'], {
    ...wall(1450),
    slots: KITCHEN_WALL_SLOTS,
  }),
  gen('kitchen.wall.double', 'Two-door wall cabinet', 'kitchen', ['kitchen'], 'kitchenWall', [800, 350, 720], ['upper cabinet', 'overhead', 'modular'], {
    ...wall(1450),
    slots: KITCHEN_WALL_SLOTS,
    params: { rows: [doors(2)] },
  }),
  gen('kitchen.wall.low', 'Low wall cabinet', 'kitchen', ['kitchen'], 'kitchenWall', [600, 350, 360], ['upper cabinet', 'overhead', 'bridge unit'], {
    ...wall(1810),
    slots: KITCHEN_WALL_SLOTS,
    params: { rows: [doors(1)] },
  }),
  gen('kitchen.wall.end', 'Open end shelf', 'kitchen', ['kitchen'], 'kitchenWall', [300, 350, 720], ['upper cabinet', 'overhead', 'open shelf'], {
    ...wall(1450),
    slots: KITCHEN_SHELF_SLOTS,
    params: { open: true, shelves: 2 },
  }),
  gen('kitchen.counter.1200', 'Counter run 1.2 m', 'kitchen', ['kitchen'], 'kitchenBase', [1200, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    ...base,
    params: { rows: [drawers(2, 0.22), doors(2, 0.78)] },
  }),
  gen('kitchen.counter.1800', 'Counter run 1.8 m', 'kitchen', ['kitchen'], 'kitchenBase', [1800, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    ...base,
    params: { rows: [drawers(3, 0.22), doors(3, 0.78)] },
  }),
  gen('kitchen.counter.2400', 'Counter run 2.4 m', 'kitchen', ['kitchen'], 'kitchenBase', [2400, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    ...base,
    params: { rows: [drawers(4, 0.22), doors(4, 0.78)] },
  }),
  gen('kitchen.island', 'Kitchen island', 'kitchen', ['kitchen'], 'kitchenBase', [1800, 900, 900], ['island', 'counter', 'breakfast bar'], {
    ...base,
    params: { rows: [drawers(3, 0.22), drawers(3, 0.78)], top: 40, back: 280, waterfall: true },
  }),
  gen('kitchen.bar', 'Breakfast bar', 'kitchen', ['kitchen', 'dining'], 'kitchenBar', [1200, 500, 1050], ['bar counter', 'peninsula'], base),
  gen('kitchen.bar.end', 'Breakfast bar end', 'kitchen', ['kitchen', 'dining'], 'kitchenBarEnd', [280, 500, 1050], ['bar counter', 'peninsula', 'end panel'], {
    slots: KITCHEN_OPEN_SLOTS,
  }),
  gen('kitchen.tall', 'Tall pantry unit', 'kitchen', ['kitchen', 'utility'], 'kitchenTall', [600, TALL_DEPTH, TALL], ['pantry', 'larder', 'tall unit'], {
    slots: KITCHEN_WALL_SLOTS,
    params: { rows: [doors(1, 0.6), doors(1, 0.4)] },
  }),
];
