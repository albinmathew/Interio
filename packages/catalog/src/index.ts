/**
 * Furniture and appliance catalog.
 *
 * - `CATALOG`, `getEntry`, `entriesFor`: the entries. GLB entries point at CC0
 *   models under `apps/web/public/catalog/models` (see `docs/assets/catalog.md`);
 *   parametric entries are built by the generators registered here.
 * - `buildParametric`, `registerGenerator`: parametric models.
 * - `fitToDims`: applies the model conventions to a loaded GLB.
 * - `autoFurnish`: proposes a layout for one room.
 * - `placeEntry`: finds a free spot for one entry in a room.
 */
import './generators';

export { CATALOG, entriesFor, getEntry } from './catalog';
export { buildParametric, hasGenerator, registerGenerator, type Generator } from './parametric';
export { furnitureMaterial, setFurnitureTextureResolver, type BuildContext, type FurnitureTextures } from './premium';
export { fitToDims } from './fit';
export { PALETTE, type MaterialSpec, type PaletteKey } from './palette';
export { MODELS, PACKS, type ModelId, type ModelSpec, type SourcePack } from './models';
export { autoFurnish, type AutoFurnishOptions } from './autofurnish';
export { placeEntry, type PlaceEntryOptions } from './autofurnish/placeEntry';
