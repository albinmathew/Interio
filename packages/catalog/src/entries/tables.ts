/** Catalog entries: tables. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { gen, glb } from './helpers';

export const TABLES_ENTRIES: CatalogEntry[] = [
  glb('table.coffee', 'Coffee table', 'tables', ['living'], 'table-coffee', ['centre table', 'center table', 'wooden']),
  glb('table.coffee.glass', 'Glass coffee table', 'tables', ['living'], 'table-coffee-glass', ['centre table', 'center table', 'glass']),
  glb('table.coffee.square', 'Square coffee table', 'tables', ['living'], 'table-coffee-square', ['centre table', 'center table', 'wooden']),
  glb('table.coffee.glass.square', 'Square glass coffee table', 'tables', ['living'], 'table-coffee-glass-square', ['centre table', 'center table', 'glass']),
  gen('table.side', 'Round side table', 'tables', ['living', 'bedroom', 'study'], 'sideTable', [450, 450, 520], ['end table', 'accent table', 'lamp table']),
  glb('table.console', 'Console table', 'tables', ['foyer', 'living', 'corridor'], 'table-console', ['hall table', 'entry table', 'sofa table']),
  glb('table.console.drawers', 'Console table with drawers', 'tables', ['foyer', 'living', 'bedroom'], 'table-console-drawers', ['hall table', 'entry table', 'dressing table']),
  glb('table.dining4', 'Dining table for four', 'tables', ['dining', 'kitchen', 'living'], 'table-dining-4', ['dining', '4 seater', 'wooden']),
  glb('table.dining6', 'Dining table for six', 'tables', ['dining', 'living'], 'table-dining-6', ['dining', '6 seater', 'wooden']),
  glb('table.dining8', 'Dining table for eight', 'tables', ['dining', 'living'], 'table-dining-8', ['dining', '8 seater', 'wooden']),
  glb('table.dining.trestle', 'Trestle dining table', 'tables', ['dining', 'living', 'balcony'], 'table-dining-trestle', ['dining', '6 seater', 'farmhouse']),
  glb('table.dining.glass', 'Glass dining table', 'tables', ['dining', 'living'], 'table-dining-glass', ['dining', '6 seater', 'glass']),
  glb('table.dining.round', 'Round dining table', 'tables', ['dining', 'kitchen', 'living'], 'table-dining-round', ['dining', '4 seater', 'pedestal']),
];
