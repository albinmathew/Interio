/** Every generator of the premium set, by family. */
import type { CatalogEntry } from '@interio/core';
import type * as THREE from 'three';
import type { BuildContext } from './kit';
import { ACCESSORY_GENERATORS } from './accessories';
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

const FAMILIES = {
  beds: BED_GENERATORS,
  seating: SEATING_GENERATORS,
  tables: TABLES_GENERATORS,
  storage: STORAGE_GENERATORS,
  kitchen: KITCHEN_GENERATORS,
  bathroom: BATHROOM_GENERATORS,
  appliances: APPLIANCES_GENERATORS,
  lighting: LIGHTING_GENERATORS,
  decor: DECOR_GENERATORS,
  office: OFFICE_GENERATORS,
  outdoor: OUTDOOR_GENERATORS,
  accessories: ACCESSORY_GENERATORS,
};

/** Every premium generator by name. Two families may never use the same name: one would silently replace the other. */
export const PREMIUM_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = (() => {
  const all: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {};
  const owner = new Map<string, string>();
  for (const [family, generators] of Object.entries(FAMILIES)) {
    for (const [name, fn] of Object.entries(generators)) {
      const taken = owner.get(name);
      if (taken) throw new Error(`Premium generator "${name}" is defined by both ${taken} and ${family}`);
      owner.set(name, family);
      all[name] = fn as (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D;
    }
  }
  return all;
})();

export { furnitureMaterial, setFurnitureTextureResolver, type BuildContext, type FurnitureTextures } from './kit';
