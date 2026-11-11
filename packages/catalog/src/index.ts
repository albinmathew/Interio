/**
 * Furniture and appliance catalog.
 *
 * - `CATALOG`, `getEntry`, `entriesFor`: the entries. Every entry is a premium
 *   parametric model built in code (`premium/`), with finish slots the user can
 *   change per item. GLB entries are still supported for licensed model packs.
 * - `buildParametric`, `registerGenerator`: parametric models.
 * - `fitToDims`: applies the model conventions to a loaded GLB.
 * - `autoFurnish`: proposes a layout for one room.
 * - `placeEntry`: finds a free spot for one entry in a room.
 */
import './register';

export { CATALOG, entriesFor, getEntry } from './catalog';
export { buildParametric, hasGenerator, registerGenerator, type Generator } from './parametric';
export { furnitureMaterial, setFurnitureTextureResolver, type BuildContext, type FurnitureTextures } from './premium';
export { fitToDims } from './fit';
export { autoFurnish, type AutoFurnishOptions } from './autofurnish';
export { placeEntry, type PlaceEntryOptions } from './autofurnish/placeEntry';
