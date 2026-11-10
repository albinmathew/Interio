import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyFit, fitModel, rotateBoundsY, type Bounds } from '../src/fit';
import { makeBoxGlb } from './glb';

const dims = { w: 2200, d: 900, h: 800 };

function fittedBox(bounds: Bounds, yawDeg = 0): { min: number[]; max: number[] } {
  const fit = fitModel(bounds, dims, yawDeg);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = applyFit(fit, [x, y, z]);
        p.forEach((v, i) => {
          min[i] = Math.min(min[i]!, v);
          max[i] = Math.max(max[i]!, v);
        });
      }
  return { min, max };
}

function expectFitsDims(box: { min: number[]; max: number[] }): void {
  // Footprint centred on the origin, bottom on the floor, size equal to dims (metres).
  expect(box.min[0]).toBeCloseTo(-1.1, 6);
  expect(box.max[0]).toBeCloseTo(1.1, 6);
  expect(box.min[1]).toBeCloseTo(0, 6);
  expect(box.max[1]).toBeCloseTo(0.8, 6);
  expect(box.min[2]).toBeCloseTo(-0.45, 6);
  expect(box.max[2]).toBeCloseTo(0.45, 6);
}

describe('fitModel', () => {
  it('scales each axis to dims and puts the bottom-centre on the origin', () => {
    // A model authored in centimetres, off-centre and floating.
    expectFitsDims(fittedBox({ min: [100, 50, -40], max: [300, 130, 60] }));
  });

  it('handles models authored far from the origin at an arbitrary scale', () => {
    expectFitsDims(fittedBox({ min: [-0.02, -7, 12], max: [0.01, -6.5, 12.4] }));
  });

  it('applies yawDeg before fitting, so width and depth swap at 90 degrees', () => {
    const bounds: Bounds = { min: [0, 0, 0], max: [1, 1, 3] }; // long along z
    const fit = fitModel(bounds, dims, 90);
    // After a quarter turn the model's z extent (3) lies along x and is stretched to w.
    expect(fit.scale[0]).toBeCloseTo(2.2 / 3, 6);
    expect(fit.scale[2]).toBeCloseTo(0.9 / 1, 6);
    expectFitsDims(fittedBox(bounds, 90));
  });

  it('turns a model whose front faces +X so it faces +Z', () => {
    // A marker on the model's front (+X face) must end up on the +Z side.
    const bounds: Bounds = { min: [-1, 0, -2], max: [1, 1, 2] };
    const fit = fitModel(bounds, dims, -90);
    const front = applyFit(fit, [1, 0.5, 0]);
    expect(front[2]).toBeCloseTo(0.45, 6);
    expect(front[0]).toBeCloseTo(0, 6);
  });

  it('keeps flat axes at scale 1 instead of dividing by zero', () => {
    const fit = fitModel({ min: [0, 0, 0], max: [2, 0, 1] }, dims);
    expect(fit.scale[1]).toBe(1);
    expect(fit.scale.every(Number.isFinite)).toBe(true);
  });

  it('rotateBoundsY is exact for quarter turns', () => {
    const r = rotateBoundsY({ min: [1, 0, 2], max: [3, 5, 8] }, Math.PI / 2);
    // x' = z, z' = -x.
    expect(r.min[0]).toBeCloseTo(2, 9);
    expect(r.max[0]).toBeCloseTo(8, 9);
    expect(r.min[2]).toBeCloseTo(-3, 9);
    expect(r.max[2]).toBeCloseTo(-1, 9);
    expect(r.min[1]).toBe(0);
    expect(r.max[1]).toBe(5);
  });
});

describe('fitting a loaded GLB', () => {
  const load = (data: ArrayBuffer) =>
    new Promise<THREE.Group>((resolve, reject) => new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject));

  it('fits the bounding box of a parsed GLB scene, node transform included', async () => {
    // Box of 40 x 30 x 100 model units, scaled 0.5 and moved away from the origin by its node.
    const scene = await load(makeBoxGlb({ min: [-20, 0, -50], max: [20, 30, 50], translation: [7, 3, -4], scale: 0.5 }));
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([20, 15, 50]);

    // Nest the transforms exactly as ItemObject does: scale > offset > yaw > model.
    const fit = fitModel({ min: box.min.toArray(), max: box.max.toArray() }, dims, 90);
    const yaw = new THREE.Group();
    yaw.rotation.y = fit.yaw;
    yaw.add(scene);
    const offset = new THREE.Group();
    offset.position.set(...fit.offset);
    offset.add(yaw);
    const root = new THREE.Group();
    root.scale.set(...fit.scale);
    root.add(offset);
    root.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(root);
    expectFitsDims({ min: fitted.min.toArray(), max: fitted.max.toArray() });
  });
});
