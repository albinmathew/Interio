import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';

/**
 * Applies the catalog model conventions to a loaded GLB scene: rotates it by
 * `yawDeg` so its front faces +Z, scales its bounding box to `entry.dims`
 * (w along X, h along Y, d along Z) and puts its bottom-centre on the origin.
 *
 * The shipped models are already normalised (metres, bottom-centre origin,
 * front +Z, sized to `dims`), so for them this is the identity. It exists so
 * that any GLB dropped into the catalog still lands at its stated size.
 */
export function fitToDims(model: THREE.Object3D, entry: CatalogEntry): THREE.Group {
  const yaw = new THREE.Group();
  yaw.name = 'yaw';
  yaw.rotation.y = entry.model.kind === 'glb' ? THREE.MathUtils.degToRad(entry.model.yawDeg ?? 0) : 0;
  yaw.add(model);

  // Scale lives on its own group so it acts along world axes after the yaw.
  const fit = new THREE.Group();
  fit.name = 'fit';
  fit.add(yaw);

  const root = new THREE.Group();
  root.name = `catalog:${entry.id}`;
  root.add(fit);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root, true);
  if (box.isEmpty()) return root;
  const size = box.getSize(new THREE.Vector3());
  const sx = size.x > 1e-9 ? entry.dims.w / 1000 / size.x : 1;
  const sy = size.y > 1e-9 ? entry.dims.h / 1000 / size.y : 1;
  const sz = size.z > 1e-9 ? entry.dims.d / 1000 / size.z : 1;
  fit.scale.set(sx, sy, sz);
  fit.position.set(-((box.min.x + box.max.x) / 2) * sx, -box.min.y * sy, -((box.min.z + box.max.z) / 2) * sz);
  root.updateMatrixWorld(true);
  return root;
}
