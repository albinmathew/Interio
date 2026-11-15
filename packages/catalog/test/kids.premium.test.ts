import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KIDS_ENTRIES } from '../src/entries/kids';
import { buildParametric } from '../src/index';
import { KIDS_GENERATORS } from '../src/premium/kids';

function stats(object: THREE.Object3D) {
  let meshes = 0;
  let triangles = 0;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });
  const box = new THREE.Box3().setFromObject(object, true);
  return { meshes, triangles, size: box.getSize(new THREE.Vector3()), min: box.min, max: box.max };
}

const withParams = (e: CatalogEntry, params: Record<string, unknown>, dims?: CatalogEntry['dims']): CatalogEntry => ({
  ...e,
  dims: dims ?? e.dims,
  model: { kind: 'parametric', generator: e.model.kind === 'parametric' ? e.model.generator : 'box', params: { ...(e.model.kind === 'parametric' ? e.model.params : {}), ...params } },
});

const meshesOf = (object: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

const STUDIES = KIDS_ENTRIES.filter((e) => e.id.startsWith('study.storage.kids.'));

describe('kids bedroom set', () => {
  it('has the pieces the room layout codes against', () => {
    const dims = Object.fromEntries(KIDS_ENTRIES.map((e) => [e.id, [e.dims.w, e.dims.d, e.dims.h]]));
    expect(dims).toEqual({
      'bed.single.kids': [1000, 2050, 950],
      'nightstand.baskets': [1100, 400, 650],
      'study.storage.kids.2100': [2100, 600, 2400],
      'study.storage.kids.2400': [2400, 600, 2400],
      'study.storage.kids.2100.r': [2100, 600, 2400],
      'study.storage.kids.2400.r': [2400, 600, 2400],
      'toy.teddy': [260, 200, 300],
    });
    for (const e of KIDS_ENTRIES) {
      expect(e.model.kind === 'parametric' && Object.keys(KIDS_GENERATORS).includes(e.model.generator), e.id).toBe(true);
      expect(e.anchor, e.id).toBe('floor');
    }
    expect(KIDS_ENTRIES.find((e) => e.id === 'toy.teddy')!.category).toBe('decor');
  });

  it.each(KIDS_ENTRIES.map((e) => [e.id, e] as const))('%s stays within 8 meshes and 30k triangles, with no degenerate normals', (_id, entry) => {
    const object = buildParametric(entry);
    const s = stats(object);
    expect(s.meshes).toBeLessThanOrEqual(8);
    expect(s.triangles).toBeLessThanOrEqual(30_000);
    // A zero-length normal shades as NaN, which the walk view's bloom spreads over the screen.
    for (const mesh of meshesOf(object)) {
      const n = mesh.geometry.getAttribute('normal');
      let zero = 0;
      for (let i = 0; i < n.count; i++) if (n.getX(i) ** 2 + n.getY(i) ** 2 + n.getZ(i) ** 2 < 0.25) zero++;
      expect(zero, `${entry.id} ${mesh.name}`).toBe(0);
    }
  });

  it.each(KIDS_ENTRIES.map((e) => [e.id, e] as const))('%s fits narrower, wider, shallower and taller boxes', (_id, entry) => {
    const sides = entry.id.startsWith('study.') ? ['left', 'right'] : ['left'];
    for (const wardrobe of sides) {
      for (const f of [[0.8, 0.9, 0.9], [1.25, 1.15, 1.05], [1, 1, 0.92], [1, 1, 1]]) {
        const dims = { w: Math.round(entry.dims.w * f[0]!), d: Math.round(entry.dims.d * f[1]!), h: Math.round(entry.dims.h * f[2]!) };
        const s = stats(buildParametric(withParams(entry, { wardrobe }, dims)));
        const want = [dims.w / 1000, dims.h / 1000, dims.d / 1000];
        const got = [s.size.x, s.size.y, s.size.z];
        for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!), `${entry.id} ${wardrobe} axis ${i} at ${f.join('x')}`).toBeLessThanOrEqual(want[i]! * 0.02);
        expect(Math.abs(s.min.y), `${entry.id} underside`).toBeLessThanOrEqual(0.005);
        expect(Math.abs(s.min.x + s.max.x), `${entry.id} centred`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it.each(STUDIES.map((e) => [e.id, e] as const))('%s keeps a clear knee space under a 750 mm desk, wardrobe at either end', (_id, entry) => {
    for (const wardrobe of ['left', 'right'] as const) {
      const object = buildParametric(withParams(entry, { wardrobe }));
      const W = entry.dims.w / 1000;
      const D = entry.dims.d / 1000;
      const desk = meshesOf(object).find((m) => m.userData.slot === 'desk')!;
      desk.geometry.computeBoundingBox();
      // The desk top's upper face is at 750 mm.
      const pos = desk.geometry.getAttribute('position');
      let top = 0;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 1) top = Math.max(top, pos.getY(i));
      expect(top).toBeCloseTo(0.75, 2);
      // Knee space: at least 700 mm wide, 600 mm high and the desk's depth, empty.
      const s = wardrobe === 'left' ? 1 : -1;
      const x0 = s * (-W / 2 + (W >= 2.3 ? 1.0 : 0.9) + 0.02);
      const x1 = x0 + s * 0.7;
      const knee = new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), 0.06, -D / 2 + 0.01), new THREE.Vector3(Math.max(x0, x1), 0.68, D / 2));
      const p = new THREE.Vector3();
      for (const mesh of meshesOf(object)) {
        const a = mesh.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i++) expect(knee.containsPoint(p.fromBufferAttribute(a, i)), `${entry.id} ${wardrobe} ${mesh.name} in the knee space`).toBe(false);
      }
      // The wardrobe's bar pulls are at its end, the LED strips glow.
      const handles = meshesOf(object).find((m) => m.userData.slot === 'handles')!;
      handles.geometry.computeBoundingBox();
      const lit = meshesOf(object).filter((m) => (m.material as THREE.MeshStandardMaterial).emissiveIntensity > 1);
      expect(lit.length).toBe(1);
      const hb = handles.geometry.boundingBox!;
      expect(wardrobe === 'left' ? hb.min.x : -hb.max.x).toBeLessThan(-W / 2 + 0.6);
    }
  });

  it('leaves the bedside unit top clear for a lamp and a frame', () => {
    const e = KIDS_ENTRIES.find((x) => x.id === 'nightstand.baskets')!;
    const s = stats(buildParametric(e));
    // Nothing stands on the top: the top is the highest thing.
    expect(s.max.y).toBeCloseTo(e.dims.h / 1000, 3);
    const baskets = meshesOf(buildParametric(e)).find((m) => m.userData.slot === 'baskets')!;
    baskets.geometry.computeBoundingBox();
    expect(baskets.geometry.boundingBox!.max.y).toBeLessThan(e.dims.h / 1000 * 0.7);
  });
});
