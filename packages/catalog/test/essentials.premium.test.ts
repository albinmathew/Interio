import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ESSENTIALS_ENTRIES } from '../src/entries/essentials';
import { buildParametric } from '../src/index';
import { ESSENTIALS_GENERATORS } from '../src/premium/essentials';

interface Stats {
  meshes: number;
  triangles: number;
  size: THREE.Vector3;
  min: THREE.Vector3;
}

function stats(object: THREE.Object3D): Stats {
  let meshes = 0;
  let triangles = 0;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });
  const box = new THREE.Box3().setFromObject(object, true);
  return { meshes, triangles, size: box.getSize(new THREE.Vector3()), min: box.min };
}

const slotsOf = (object: THREE.Object3D) => {
  const out = new Set<string>();
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && typeof o.userData.slot === 'string') out.add(o.userData.slot);
  });
  return out;
};

const resized = (e: CatalogEntry, f: [number, number, number]): CatalogEntry => ({ ...e, dims: { w: Math.round(e.dims.w * f[0]), d: Math.round(e.dims.d * f[1]), h: Math.round(e.dims.h * f[2]) } });

describe('premium furnishing-package pieces', () => {
  it('gives every entry its own premium model', () => {
    for (const e of ESSENTIALS_ENTRIES) {
      expect(e.model.kind, e.id).toBe('parametric');
      if (e.model.kind !== 'parametric') continue;
      expect(Object.keys(ESSENTIALS_GENERATORS), e.id).toContain(e.model.generator);
      expect(e.model.generator, e.id).not.toBe('essentialsPlaceholder');
      expect(e.slots?.length ?? 0, e.id).toBeGreaterThanOrEqual(2);
      expect(e.slots!.length, e.id).toBeLessThanOrEqual(4);
    }
    expect(Object.keys(ESSENTIALS_GENERATORS)).not.toContain('essentialsPlaceholder');
  });

  it.each(ESSENTIALS_ENTRIES.map((e) => [e.id, e] as const))('%s stays within 8 meshes and the triangle budget', (_id, entry) => {
    const s = stats(buildParametric(entry));
    expect(s.meshes).toBeLessThanOrEqual(8);
    expect(s.triangles).toBeLessThanOrEqual(30_000);
    expect(s.triangles).toBeGreaterThan(800);
  });

  it.each(ESSENTIALS_ENTRIES.map((e) => [e.id, e] as const))('%s fits narrower, wider, shallower and taller boxes', (_id, entry) => {
    for (const f of [[0.8, 0.9, 0.9], [1.25, 1.15, 1.05], [1, 1, 0.92]] as [number, number, number][]) {
      const e = resized(entry, f);
      const s = stats(buildParametric(e));
      const want = [e.dims.w / 1000, e.dims.h / 1000, e.dims.d / 1000];
      const got = [s.size.x, s.size.y, s.size.z];
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!), `${e.id} axis ${i} at ${f.join('x')}`).toBeLessThanOrEqual(want[i]! * 0.02);
      expect(Math.abs(s.min.y), `${e.id} underside`).toBeLessThanOrEqual(0.005);
    }
  });

  it('shares slot sets between related pieces', () => {
    const ids = (prefix: string) => ESSENTIALS_ENTRIES.filter((e) => e.id.startsWith(prefix)).map((e) => JSON.stringify(e.slots));
    for (const group of [['wardrobe.'], ['bed.'], ['blind.roman.']]) expect(new Set(ids(group[0]!)).size, group[0]).toBe(1);
  });

  it('keeps the window visible under a raised Roman blind', () => {
    for (const e of ESSENTIALS_ENTRIES.filter((x) => x.id.startsWith('blind.roman.'))) {
      const object = buildParametric(e);
      let fabricLow = Infinity;
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh.userData.slot !== 'fabric' && mesh.userData.slot !== 'trim')) return;
        mesh.geometry.computeBoundingBox();
        fabricLow = Math.min(fabricLow, mesh.geometry.boundingBox!.min.y);
      });
      // The folds stack in the top part: at least half the drop shows the glass.
      expect(fabricLow / (e.dims.h / 1000), e.id).toBeGreaterThan(0.5);
      expect(slotsOf(object).size).toBe(3);
    }
  });

  it('prints the budget of each piece', () => {
    const rows = ESSENTIALS_ENTRIES.map((e) => {
      const s = stats(buildParametric(e));
      return `${e.id.padEnd(20)} ${e.model.kind === 'parametric' ? e.model.generator.padEnd(24) : ''} meshes ${s.meshes} tris ${Math.round(s.triangles)}`;
    });
    console.log(rows.join('\n'));
  });
});
