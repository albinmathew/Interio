import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import type { BuildContext } from './premium/kit';

/**
 * A generator builds the 3D model for a parametric catalog entry.
 * Contract: metres, origin at the bottom-centre of the footprint, front facing +Z,
 * overall size equal to `entry.dims` (w along X, h along Y, d along Z).
 */
export type Generator = (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D;

const generators = new Map<string, Generator>();

export function registerGenerator(name: string, fn: Generator): void {
  generators.set(name, fn);
}

export function hasGenerator(name: string): boolean {
  return generators.has(name);
}

/** Flat colours for the box stand-in (unknown generators, models still loading). */
const CATEGORY_COLORS: Record<string, string> = {
  seating: '#7d8fa3',
  tables: '#a98462',
  beds: '#c9b8a4',
  storage: '#9a7b5c',
  kitchen: '#b9bdc2',
  bathroom: '#dfe6ea',
  appliances: '#c4c8cc',
  lighting: '#e8d9a8',
  decor: '#9db39a',
  office: '#8d8478',
  outdoor: '#8aa07c',
};

registerGenerator('box', (entry) => {
  const { w, d, h } = entry.dims;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w / 1000, h / 1000, d / 1000),
    new THREE.MeshStandardMaterial({ color: CATEGORY_COLORS[entry.category] ?? '#b0b0b0', roughness: 0.8 }),
  );
  mesh.position.y = h / 2000;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
});

/**
 * Builds the model for a parametric entry. `finishes` are the item's own
 * finishes by slot id (`Item.finishes`); slots without one use the entry's
 * defaults. Unknown generators fall back to a box.
 */
export function buildParametric(entry: CatalogEntry, finishes?: Record<string, string>): THREE.Object3D {
  const name = entry.model.kind === 'parametric' ? entry.model.generator : 'box';
  const fn = generators.get(name) ?? generators.get('box')!;
  return fn(entry, { finishes });
}
