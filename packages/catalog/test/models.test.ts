import fs from 'node:fs';
import path from 'node:path';
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { boundsSize, glbBounds, parseGlb, triangleCount } from '../scripts/lib/glb';
import { PUBLIC_CATALOG } from '../scripts/lib/paths';
import { CATALOG, PALETTE, buildParametric, fitToDims } from '../src/index';

/** Bounding box must match `dims` within 2% per axis, with the origin at the bottom centre. */
function expectFits(box: { min: number[]; max: number[] }, entry: CatalogEntry): void {
  const want = [entry.dims.w / 1000, entry.dims.h / 1000, entry.dims.d / 1000];
  const axes = ['w (x)', 'h (y)', 'd (z)'];
  for (let i = 0; i < 3; i++) {
    const tol = want[i]! * 0.02;
    expect(Math.abs(box.max[i]! - box.min[i]! - want[i]!), `${entry.id} size ${axes[i]}`).toBeLessThanOrEqual(tol);
    if (i === 1) expect(Math.abs(box.min[1]!), `${entry.id} underside at y = 0`).toBeLessThanOrEqual(tol);
    else expect(Math.abs((box.min[i]! + box.max[i]!) / 2), `${entry.id} centred on ${axes[i]}`).toBeLessThanOrEqual(tol);
  }
}

const boxOf = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(object, true);
  return { min: b.min.toArray(), max: b.max.toArray() };
};

const parametric = CATALOG.filter((e) => e.model.kind === 'parametric');
const glbs = CATALOG.filter((e) => e.model.kind === 'glb');

describe('parametric generators', () => {
  it.each(parametric.map((e) => [e.id, e] as const))('%s builds at its stated size', (_id, entry) => {
    const object = buildParametric(entry);
    expectFits(boxOf(object), entry);
    let meshes = 0;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const pos = mesh.geometry.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.isMeshStandardMaterial).toBe(true);
      expect(Object.keys(PALETTE)).toContain(mat.name);
    });
    // Merged by material: a placed item costs a handful of draw calls.
    expect(meshes).toBeGreaterThan(0);
    expect(meshes).toBeLessThanOrEqual(10);
  });

  it('follows the entry dims, not fixed sizes', () => {
    for (const entry of parametric) {
      const scaled: CatalogEntry = { ...entry, dims: { w: Math.round(entry.dims.w * 1.2), d: Math.round(entry.dims.d * 1.1), h: Math.round(entry.dims.h * 1.15) } };
      expectFits(boxOf(buildParametric(scaled)), scaled);
    }
  });

  it('falls back to a box for an unknown generator', () => {
    const entry: CatalogEntry = { ...parametric[0]!, model: { kind: 'parametric', generator: 'does-not-exist' } };
    expectFits(boxOf(buildParametric(entry)), entry);
  });
});

describe('GLB models', () => {
  const read = (entry: CatalogEntry) => {
    if (entry.model.kind !== 'glb') throw new Error('not a glb entry');
    return new Uint8Array(fs.readFileSync(path.join(PUBLIC_CATALOG, entry.model.url.replace(/^\/catalog\//, ''))));
  };

  it.each(glbs.map((e) => [e.id, e] as const))('%s is a valid GLB baked to its dims', (_id, entry) => {
    const glb = parseGlb(read(entry));
    const { json, bin } = glb;
    expect(json.asset.version).toBe('2.0');
    expect(json.asset.copyright).toMatch(/^CC0-1\.0 /);
    expect(json.buffers).toHaveLength(1);
    expect(json.buffers[0].byteLength).toBe(bin.byteLength);
    expect(json.images ?? []).toHaveLength(0);
    expect(json.extensionsRequired ?? []).toHaveLength(0);
    for (const view of json.bufferViews) expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(bin.byteLength);
    for (const prim of json.meshes[0].primitives) {
      expect(prim.attributes.POSITION).toBeDefined();
      expect(prim.attributes.NORMAL).toBeDefined();
      expect(json.accessors[prim.indices].count % 3).toBe(0);
      expect(Object.keys(PALETTE)).toContain(json.materials[prim.material].name);
    }
    expect(triangleCount(glb)).toBeGreaterThan(8);
    expect(triangleCount(glb)).toBeLessThan(5000);
    const bounds = glbBounds(glb);
    expectFits(bounds, entry);
    expect(boundsSize(bounds).every((v) => v > 0)).toBe(true);
  });

  it.each(glbs.map((e) => [e.id, e] as const))('%s loads with GLTFLoader and needs no further fitting', async (_id, entry) => {
    const data = read(entry);
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    let meshes = 0;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(0);
    expectFits(boxOf(gltf.scene), entry);
    // The renderer's fit step must leave a baked model where it is.
    expectFits(boxOf(fitToDims(gltf.scene, entry)), entry);
  });
});

describe('fitToDims', () => {
  it('scales, re-centres and turns an arbitrary model', () => {
    const entry: CatalogEntry = {
      id: 'test.fit',
      name: 'Fit test',
      category: 'decor',
      roomTypes: [],
      dims: { w: 2000, d: 500, h: 300 },
      anchor: 'floor',
      model: { kind: 'glb', url: '/catalog/models/none.glb', yawDeg: 90 },
      licence: 'CC0-1.0 (test)',
    };
    // 1 m wide along Z, off-centre, with a marker on its +X end (its "front").
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 1), new THREE.MeshBasicMaterial());
    body.position.set(3, 5, -2);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
    marker.position.set(3.2, 5, -2);
    marker.name = 'front';
    const model = new THREE.Group();
    model.add(body, marker);
    const fitted = fitToDims(model, entry);
    expectFits(boxOf(fitted), entry);
    // yawDeg 90 turns the model's +X front towards... the catalog front, +Z, is where -X ends up after a 90 degree turn about +Y.
    const at = fitted.getObjectByName('front')!.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(at.z)).toBeGreaterThan(0.1);
    expect(Math.abs(at.x)).toBeLessThan(0.05);
  });
});
