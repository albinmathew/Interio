import type { CatalogCategory, CatalogEntry, RoomType } from '@interio/core';
import { ENTRIES } from './entries';

export const CATALOG: CatalogEntry[] = ENTRIES;

const byId = new Map(CATALOG.map((e) => [e.id, e]));

export function getEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

export function entriesFor(filter: { category?: CatalogCategory; roomType?: RoomType; query?: string }): CatalogEntry[] {
  const q = filter.query?.trim().toLowerCase();
  return CATALOG.filter(
    (e) =>
      (!filter.category || e.category === filter.category) &&
      (!filter.roomType || e.roomTypes.length === 0 || e.roomTypes.includes(filter.roomType)) &&
      (!q || e.name.toLowerCase().includes(q) || e.id.includes(q) || e.tags?.some((t) => t.includes(q))),
  );
}
