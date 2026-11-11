/** Catalog entries: office. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { DESK_SLOTS, KEYBOARD_SLOTS, LAPTOP_SLOTS, MONITOR_SLOTS, PEDESTAL_SLOTS, TASK_CHAIR_SLOTS } from '../premium/office';
import { DESK, gen, on } from './helpers';

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
  gen('cabinet.filing', 'Filing cabinet', 'office', ['study'], 'filingPedestal', [430, 560, 640], ['pedestal', 'drawers', 'file storage'], { slots: PEDESTAL_SLOTS }),
];
