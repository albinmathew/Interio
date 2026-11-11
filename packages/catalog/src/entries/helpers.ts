/**
 * The catalog. Ids are stable: saved projects reference them.
 *
 * Two kinds of entry:
 * - `glb`: a model from `models.ts`, cut from a CC0 kit and baked to `dims`.
 * - `gen`: a parametric model built by a generator from `generators/`.
 *
 * `mountHeight` is the default elevation of the underside: wall and ceiling
 * pieces, and things that normally sit on a worktop, desk or bedside table.
 * Ceiling pieces assume the default 3000 mm ceiling; placement should use
 * `level.ceilingHeight - dims.h` when it knows the level.
 */
import type { CatalogCategory, CatalogEntry, RoomType } from '@interio/core';
import type { GeneratorName } from '../generators';
import { MODELS, PACKS, modelUrl, type ModelId } from '../models';

export type Extra = Partial<Pick<CatalogEntry, 'anchor' | 'mountHeight' | 'slots'>>;

export const INTERIO_LICENCE = 'CC0-1.0 (Interio parametric)';
export const thumb = (id: string) => `/catalog/thumbs/${id}.webp`;

export const glb = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  model: ModelId,
  tags: string[],
  extra: Extra = {},
): CatalogEntry => ({
  id,
  name,
  category,
  roomTypes,
  dims: { ...MODELS[model].dims },
  anchor: 'floor',
  model: { kind: 'glb', url: modelUrl(model) },
  thumbnail: thumb(id),
  licence: `${PACKS[MODELS[model].pack].licence} (${PACKS[MODELS[model].pack].name})`,
  tags,
  ...extra,
});

export const gen = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  generator: GeneratorName,
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
