/** Catalog entries: office. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { DESK, drawers, gen, glb, on } from './helpers';

export const OFFICE_ENTRIES: CatalogEntry[] = [
  glb('desk', 'Desk', 'office', ['study', 'bedroom'], 'desk', ['study table', 'work desk', 'writing desk', 'computer table']),
  glb('desk.corner', 'Corner desk', 'office', ['study'], 'desk-corner', ['study table', 'work desk', 'l-shaped']),
  glb('chair.office', 'Office chair', 'office', ['study', 'bedroom'], 'chair-office', ['desk chair', 'swivel chair', 'task chair']),
  glb('monitor', 'Monitor', 'office', ['study', 'bedroom'], 'monitor', ['computer', 'screen', 'display'], on(DESK)),
  glb('laptop', 'Laptop', 'office', ['study', 'bedroom', 'living'], 'laptop', ['computer', 'notebook'], on(DESK)),
  glb('keyboard', 'Keyboard', 'office', ['study', 'bedroom'], 'keyboard', ['computer', 'keys'], on(DESK)),
  gen('cabinet.filing', 'Filing cabinet', 'office', ['study'], 'cabinet', [460, 560, 700], ['pedestal', 'drawers', 'file storage'], {
    params: { rows: [drawers(1), drawers(1), drawers(1)], finish: 'steelLight', insideFinish: 'steelMid', handleFinish: 'steelDark', plinth: 40 },
  }),
];
