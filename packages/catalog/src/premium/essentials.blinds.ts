import type { CatalogEntry } from '@interio/core';
import type * as THREE from 'three';
import type { BuildContext } from './kit';

export const BLIND_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {};
