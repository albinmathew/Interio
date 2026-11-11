import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OFFICE_ENTRIES } from '../src/entries/office';
import { OUTDOOR_ENTRIES } from '../src/entries/outdoor';
import { SEATING_ENTRIES } from '../src/entries/seating';
import { TABLES_ENTRIES } from '../src/entries/tables';
import { GENERATORS } from '../src/generators';
import { buildParametric, getEntry } from '../src/index';
import { OFFICE_GENERATORS } from '../src/premium/office';
import { OUTDOOR_GENERATORS } from '../src/premium/outdoor';
import { SEATING_GENERATORS } from '../src/premium/seating';
import { TABLES_GENERATORS } from '../src/premium/tables';

const FAMILY = [...SEATING_ENTRIES, ...TABLES_ENTRIES, ...OFFICE_ENTRIES, ...OUTDOOR_ENTRIES];
const withParams = (entry: CatalogEntry, params: Record<string, unknown>): CatalogEntry => ({
  ...entry,
  model: { kind: 'parametric', generator: entry.model.kind === 'parametric' ? entry.model.generator : 'box', params: { ...(entry.model.kind === 'parametric' ? entry.model.params : {}), ...params } },
});

/** Signed volume of a mesh: positive when its faces point outwards. */
function signedVolume(mesh: THREE.Mesh): number {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = g.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

const slotMesh = (object: THREE.Object3D, slot: string) => {
  let found: THREE.Mesh | undefined;
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.slot === slot) found = o as THREE.Mesh;
  });
  return found!;
};

const sizeOf = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

describe('premium living, dining, office and outdoor families', () => {
  it('converts every entry to a premium model', () => {
    for (const e of FAMILY) {
      expect(e.model.kind, e.id).toBe('parametric');
      expect(e.slots?.length ?? 0, e.id).toBeGreaterThanOrEqual(2);
      expect(e.slots!.length, e.id).toBeLessThanOrEqual(4);
    }
  });

  it('does not shadow a first-generation generator', () => {
    const names = [SEATING_GENERATORS, TABLES_GENERATORS, OFFICE_GENERATORS, OUTDOOR_GENERATORS].flatMap((g) => Object.keys(g));
    for (const name of names) expect(Object.keys(GENERATORS), name).not.toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('mirrors left-handed sectionals and desks with their faces kept outward', () => {
    for (const [id, params] of [
      ['sofa.chaise', { chaise: 'left' }],
      ['sofa.corner', { corner: 'right' }],
      ['desk.corner', { corner: 'right' }],
    ] as const) {
      const entry = getEntry(id)!;
      const a = buildParametric(entry);
      const b = buildParametric(withParams(entry, params));
      const sa = sizeOf(a);
      const sb = sizeOf(b);
      expect(sb.distanceTo(sa), id).toBeLessThan(1e-6);
      const slot = entry.slots![0]!.id;
      const va = signedVolume(slotMesh(a, slot));
      const vb = signedVolume(slotMesh(b, slot));
      expect(va, id).toBeGreaterThan(0);
      expect(vb / va, id).toBeCloseTo(1, 3);
    }
  });

  it('keeps a dining table at its height with or without place settings', () => {
    for (const id of ['table.dining4', 'table.dining6', 'table.dining8', 'table.dining.round', 'table.dining.glass']) {
      const entry = getEntry(id)!;
      const laid = sizeOf(buildParametric(entry)).y;
      const bare = sizeOf(buildParametric(withParams(entry, { settings: 0, runner: false }))).y;
      expect(Math.abs(laid - entry.dims.h / 1000), id).toBeLessThan(0.003);
      expect(Math.abs(bare - entry.dims.h / 1000), id).toBeLessThan(0.003);
    }
  });

  it('builds sofas in every arm and leg style at their stated size', () => {
    const entry = getEntry('sofa.3seat')!;
    for (const arm of ['track', 'roll', 'wide', 'none']) {
      for (const legs of ['taper', 'block', 'metal', 'plinth']) {
        const s = sizeOf(buildParametric(withParams(entry, { arm, legs })));
        expect(Math.abs(s.x - entry.dims.w / 1000), `${arm}/${legs} w`).toBeLessThan(entry.dims.w * 0.00002);
        expect(Math.abs(s.y - entry.dims.h / 1000), `${arm}/${legs} h`).toBeLessThan(entry.dims.h * 0.00002);
        expect(Math.abs(s.z - entry.dims.d / 1000), `${arm}/${legs} d`).toBeLessThan(entry.dims.d * 0.00002);
      }
    }
  });
});
