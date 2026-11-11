/** Catalog entries: kitchen. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { KITCHEN_TOP, WORKTOP, doors, drawers, gen, glb, wall } from './helpers';

export const KITCHEN_ENTRIES: CatalogEntry[] = [
  glb('kitchen.base', 'Base cabinet', 'kitchen', ['kitchen'], 'kitchen-base', ['base unit', 'counter', 'modular']),
  glb('kitchen.base.drawers', 'Base cabinet with drawers', 'kitchen', ['kitchen'], 'kitchen-base-drawers', ['base unit', 'counter', 'drawer unit', 'modular']),
  glb('kitchen.base.corner', 'Corner base cabinet', 'kitchen', ['kitchen'], 'kitchen-base-corner', ['base unit', 'counter', 'corner', 'modular']),
  glb('kitchen.base.end', 'Rounded end cabinet', 'kitchen', ['kitchen'], 'kitchen-base-end', ['base unit', 'counter', 'end unit', 'modular']),
  glb('kitchen.sink', 'Sink unit', 'kitchen', ['kitchen', 'utility'], 'kitchen-sink', ['sink', 'tap', 'faucet', 'basin']),
  glb('kitchen.wall', 'Wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall', ['upper cabinet', 'overhead', 'modular'], wall(1450)),
  glb('kitchen.wall.double', 'Two-door wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall-double', ['upper cabinet', 'overhead', 'modular'], wall(1450)),
  glb('kitchen.wall.low', 'Low wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall-low', ['upper cabinet', 'overhead', 'bridge unit'], wall(1810)),
  glb('kitchen.wall.end', 'Open end shelf', 'kitchen', ['kitchen'], 'kitchen-wall-end', ['upper cabinet', 'overhead', 'open shelf'], wall(1450)),
  gen('kitchen.counter.1200', 'Counter run 1.2 m', 'kitchen', ['kitchen'], 'cabinet', [1200, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(2, 0.22), doors(2, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.counter.1800', 'Counter run 1.8 m', 'kitchen', ['kitchen'], 'cabinet', [1800, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(3, 0.22), doors(3, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.counter.2400', 'Counter run 2.4 m', 'kitchen', ['kitchen'], 'cabinet', [2400, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(4, 0.22), doors(4, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.island', 'Kitchen island', 'kitchen', ['kitchen'], 'cabinet', [1800, 900, 900], ['island', 'counter', 'breakfast bar'], {
    params: { rows: [drawers(3, 0.22), doors(3, 0.78)], plinth: 100, top: { thickness: 40, finish: 'worktop', front: 20, back: 280, sides: 20 } },
  }),
  glb('kitchen.bar', 'Breakfast bar', 'kitchen', ['kitchen', 'dining'], 'kitchen-bar', ['bar counter', 'peninsula']),
  glb('kitchen.bar.end', 'Breakfast bar end', 'kitchen', ['kitchen', 'dining'], 'kitchen-bar-end', ['bar counter', 'peninsula', 'end panel']),
  gen('kitchen.tall', 'Tall pantry unit', 'kitchen', ['kitchen', 'utility'], 'cabinet', [600, 600, 2100], ['pantry', 'larder', 'tall unit'], {
    params: { rows: [doors(1, 0.62), doors(1, 0.38)], plinth: 100 },
  }),
];
