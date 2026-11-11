/**
 * Premium generators: storage. Add one builder per kind of piece and list it in
 * `STORAGE_GENERATORS`; see `beds.ts` for the conventions.
 */
import type { CatalogEntry } from '@interio/core';
import type * as THREE from 'three';
import type { BuildContext } from './kit';

/** Generators of this family, registered by `premium/index.ts`. */
export const STORAGE_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {};
