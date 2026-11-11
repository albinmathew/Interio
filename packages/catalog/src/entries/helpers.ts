/**
 * The catalog. Ids are stable: saved projects reference them.
 *
 * Every entry is `gen`: a premium parametric model built by a generator from
 * `premium/`, with finish slots the user can change per item.
 *
 * `mountHeight` is the default elevation of the underside: wall and ceiling
 * pieces, and things that normally sit on a worktop, desk or bedside table.
 * Ceiling pieces assume the default 3000 mm ceiling; placement should use
 * `level.ceilingHeight - dims.h` when it knows the level.
 */
import type { CatalogCategory, CatalogEntry, RoomType } from '@interio/core';

export type Extra = Partial<Pick<CatalogEntry, 'anchor' | 'mountHeight' | 'slots'>>;

export const INTERIO_LICENCE = 'CC0-1.0 (Interio parametric)';
export const thumb = (id: string) => `/catalog/thumbs/${id}.webp`;

export const gen = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  generator: string,
  [w, d, h]: [number, number, number],
  tags: string[],
  extra: Extra & { params?: Record<string, unknown> } = {},
): CatalogEntry => {
  const { params, ...rest } = extra;
  return {
    id,
    name,
    category,
    roomTypes,
    dims: { w, d, h },
    anchor: 'floor',
    model: { kind: 'parametric', generator, ...(params ? { params } : {}) },
    thumbnail: thumb(id),
    licence: INTERIO_LICENCE,
    tags,
    ...rest,
  };
};

export const WORKTOP = 870;
export const DESK = 750;
export const CEILING = 3000;
export const wall = (mountHeight: number): Extra => ({ anchor: 'wall', mountHeight });
export const ceiling = (h: number): Extra => ({ anchor: 'ceiling', mountHeight: CEILING - h });
export const on = (mountHeight: number): Extra => ({ mountHeight });

export const drawers = (cols: number, h = 1) => ({ h, cols, kind: 'drawer' });
export const doors = (cols: number, h = 1) => ({ h, cols, kind: 'door' });
export const KITCHEN_TOP = { thickness: 30, finish: 'worktop', front: 20 };
