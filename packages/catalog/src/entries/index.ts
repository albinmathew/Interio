/**
 * The catalog, one file per family so each can be worked on independently.
 * Ids are stable: saved projects reference them.
 */
import type { CatalogEntry } from '@interio/core';
import { SEATING_ENTRIES } from './seating';
import { TABLES_ENTRIES } from './tables';
import { BEDS_ENTRIES } from './beds';
import { STORAGE_ENTRIES } from './storage';
import { KITCHEN_ENTRIES } from './kitchen';
import { BATHROOM_ENTRIES } from './bathroom';
import { APPLIANCES_ENTRIES } from './appliances';
import { LIGHTING_ENTRIES } from './lighting';
import { DECOR_ENTRIES } from './decor';
import { OFFICE_ENTRIES } from './office';
import { OUTDOOR_ENTRIES } from './outdoor';
import { ACCESSORY_ENTRIES } from './accessories';

export const ENTRIES: CatalogEntry[] = [
  ...SEATING_ENTRIES,
  ...TABLES_ENTRIES,
  ...BEDS_ENTRIES,
  ...STORAGE_ENTRIES,
  ...KITCHEN_ENTRIES,
  ...BATHROOM_ENTRIES,
  ...APPLIANCES_ENTRIES,
  ...LIGHTING_ENTRIES,
  ...DECOR_ENTRIES,
  ...OFFICE_ENTRIES,
  ...OUTDOOR_ENTRIES,
  ...ACCESSORY_ENTRIES,
];
