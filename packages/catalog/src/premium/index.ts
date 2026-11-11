/** Every generator of the premium set, by family. */
import { APPLIANCES_GENERATORS } from './appliances';
import { BATHROOM_GENERATORS } from './bathroom';
import { BED_GENERATORS } from './beds';
import { DECOR_GENERATORS } from './decor';
import { KITCHEN_GENERATORS } from './kitchen';
import { LIGHTING_GENERATORS } from './lighting';
import { OFFICE_GENERATORS } from './office';
import { OUTDOOR_GENERATORS } from './outdoor';
import { SEATING_GENERATORS } from './seating';
import { STORAGE_GENERATORS } from './storage';
import { TABLES_GENERATORS } from './tables';

export const PREMIUM_GENERATORS = {
  ...BED_GENERATORS,
  ...SEATING_GENERATORS,
  ...TABLES_GENERATORS,
  ...STORAGE_GENERATORS,
  ...KITCHEN_GENERATORS,
  ...BATHROOM_GENERATORS,
  ...APPLIANCES_GENERATORS,
  ...LIGHTING_GENERATORS,
  ...DECOR_GENERATORS,
  ...OFFICE_GENERATORS,
  ...OUTDOOR_GENERATORS,
};

export { furnitureMaterial, setFurnitureTextureResolver, type BuildContext, type FurnitureTextures } from './kit';
