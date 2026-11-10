/**
 * Furniture and appliance catalog.
 *
 * Phase 0 ships placeholder entries rendered as boxes so placement can be built
 * and tested. The catalog workstream replaces `entries.ts` with the real set
 * (GLB models under apps/web/public/catalog, parametric appliances, thumbnails,
 * licence records) and implements `autoFurnish`.
 */
import type { CatalogCategory, CatalogEntry, Item, Level, RoomType } from '@interio/core';
import { PLACEHOLDER_ENTRIES } from './entries';

export { buildParametric, registerGenerator, type Generator } from './parametric';

export const CATALOG: CatalogEntry[] = PLACEHOLDER_ENTRIES;

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
      (!q || e.name.toLowerCase().includes(q) || e.tags?.some((t) => t.includes(q))),
  );
}

/**
 * Proposes a furniture layout for one room. Returns items to add (never mutates).
 * Stub: the catalog workstream implements templates per room type.
 */
export function autoFurnish(_level: Level, _roomId: string): Omit<Item, 'id'>[] {
  return [];
}
