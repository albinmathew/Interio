import type { Geometry } from '@interio/core';
import * as THREE from 'three';

/** Wraps core mesh data in a three.js BufferGeometry (no copy of the typed arrays). */
export function geometryFromMesh(g: Geometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
