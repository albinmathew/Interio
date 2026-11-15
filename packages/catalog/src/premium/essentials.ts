/**
 * Premium generators for the furnishing-package pieces (`entries/essentials.ts`).
 *
 * `essentialsPlaceholder` is a stand-in: a plain rounded block at the entry's size,
 * used until each piece gets its own model here.
 */
import type { CatalogEntry } from '@interio/core';
import type * as THREE from 'three';
import { Model, rbox, type BuildContext } from './kit';

function buildPlaceholder(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  m.fixed('lacquer.greige', rbox(m.W, m.H, m.D, 0.01));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const ESSENTIALS_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsPlaceholder: buildPlaceholder,
};
