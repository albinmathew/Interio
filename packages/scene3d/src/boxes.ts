import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoxSpec } from './parts';

/** One geometry for a handful of boxes: frames, rails and posts draw in a single call. */
export function mergeBoxes(boxes: BoxSpec[]): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const parts = boxes
    .filter((b) => b.size.every((v) => v > 1e-5))
    .map((b) => {
      const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
      m.makeRotationY(b.rotationY ?? 0).setPosition(b.position[0], b.position[1], b.position[2]);
      g.applyMatrix4(m);
      return g;
    });
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  return merged;
}
