import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '@interio/catalog';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { fitModel } from '../src/fit';

/**
 * The shipped catalog models are baked to the conventions (metres, bottom-centre
 * origin, front +Z, sized to `dims`). The load-time fit must leave them alone: any
 * scale other than 1 would distort a model that is already right.
 */
const publicDir = fileURLToPath(new URL('../../../apps/web/public', import.meta.url));
const glbs = CATALOG.filter((e) => e.model.kind === 'glb' && existsSync(publicDir + e.model.url));

const load = (path: string) =>
  new Promise<THREE.Group>((resolve, reject) => {
    const file = readFileSync(path);
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject);
  });

describe.skipIf(glbs.length === 0)('fit on the shipped catalog models', () => {
  it(`is the identity for all ${glbs.length} GLB entries`, async () => {
    const off: string[] = [];
    for (const entry of glbs) {
      if (entry.model.kind !== 'glb') continue;
      const scene = await load(publicDir + entry.model.url);
      scene.updateMatrixWorld(true);
      // Same bounds the renderer uses: exact, from the vertices.
      const box = new THREE.Box3().setFromObject(scene, true);
      const fit = fitModel({ min: box.min.toArray(), max: box.max.toArray() }, entry.dims, entry.model.yawDeg);
      const scaled = fit.scale.some((s) => Math.abs(s - 1) > 0.005);
      const moved = fit.offset.some((o) => Math.abs(o) > 0.002);
      if (scaled || moved || fit.yaw !== 0) off.push(`${entry.id}: scale ${fit.scale.map((s) => s.toFixed(4))} offset ${fit.offset.map((o) => o.toFixed(4))}`);
    }
    expect(off).toEqual([]);
  });
});
