/** Catalog entries: office. Ids are stable: saved projects reference them. */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import { DESK_SLOTS, KEYBOARD_SLOTS, LAPTOP_SLOTS, MONITOR_SLOTS, PEDESTAL_SLOTS, TASK_CHAIR_SLOTS } from '../premium/office';
import { DESK, gen, on, wall } from './helpers';

/** Overhead cupboards over a work desk: oak fronts to match the desk top, with a light strip underneath. */
const OVERHEAD_SLOTS: FinishSlot[] = [
  { id: 'fronts', label: 'Fronts', kind: 'wood', default: 'wood.oak' },
  { id: 'carcass', label: 'Carcass and end panels', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.black' },
];
/** Underside of the overhead cupboards: 750 mm over a desk, clear of a monitor and a seated head. */
export const OVERHEAD_MOUNT = 1500;
/** Underside of the lit floating shelf between a desk and its overhead cupboards: clear of a monitor's top. */
export const DESK_SHELF_MOUNT = 1240;

export const OFFICE_ENTRIES: CatalogEntry[] = [
  gen('desk', 'Desk', 'office', ['study', 'bedroom'], 'workDesk', [1400, 700, 750], ['study table', 'work desk', 'writing desk', 'computer table'], { slots: DESK_SLOTS }),
  gen('desk.corner', 'Corner desk', 'office', ['study'], 'workDesk', [1800, 1600, 750], ['study table', 'work desk', 'l-shaped'], {
    slots: DESK_SLOTS,
    params: { corner: 'left', depth: 700 },
  }),
  gen('chair.office', 'Office chair', 'office', ['study', 'bedroom'], 'taskChair', [640, 620, 1100], ['desk chair', 'swivel chair', 'task chair'], { slots: TASK_CHAIR_SLOTS }),
  gen('monitor', 'Monitor', 'office', ['study', 'bedroom'], 'monitorScreen', [620, 200, 460], ['computer', 'screen', 'display'], { slots: MONITOR_SLOTS, ...on(DESK) }),
  gen('laptop', 'Laptop', 'office', ['study', 'bedroom', 'living'], 'laptopComputer', [320, 290, 210], ['computer', 'notebook'], { slots: LAPTOP_SLOTS, ...on(DESK) }),
  gen('keyboard', 'Keyboard', 'office', ['study', 'bedroom'], 'computerKeyboard', [440, 140, 28], ['computer', 'keys'], { slots: KEYBOARD_SLOTS, ...on(DESK) }),
  ...([900, 1200] as const).map((w) =>
    gen(`storage.overhead.${w}`, `Overhead cupboard ${(w / 1000).toFixed(1)} m`, 'storage', ['study', 'bedroom'], 'kitchenWall', [w, 350, 600], ['overhead', 'wall cupboard', 'storage', 'loft', 'cabinet'], {
      ...wall(OVERHEAD_MOUNT),
      slots: OVERHEAD_SLOTS,
      params: { rows: [{ h: 1, cols: w > 1000 ? 3 : 2, kind: 'door' }], handles: 'bar' },
    }),
  ),
  ...([900, 1200] as const).map((w) =>
    gen(`shelf.floating.${w}`, `Lit floating shelf ${(w / 1000).toFixed(1)} m`, 'storage', ['study', 'bedroom', 'living'], 'floatingShelf', [w, 250, 40], ['shelf', 'floating shelf', 'wall shelf', 'led', 'lit', 'display'], {
      ...wall(DESK_SHELF_MOUNT),
      slots: [
        { id: 'shelf', label: 'Shelf', kind: 'wood', default: 'wood.oak' },
        { id: 'trim', label: 'Front edge', kind: 'metal', default: 'metal.brass' },
      ],
    }),
  ),
  gen('cabinet.filing', 'Filing cabinet', 'office', ['study'], 'filingPedestal', [430, 560, 640], ['pedestal', 'drawers', 'file storage'], { slots: PEDESTAL_SLOTS }),
];
