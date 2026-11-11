import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CATALOG, buildParametric, getEntry } from '../src/index';

/** Bounds of the meshes of one slot (or fixed material) of an entry. */
function partBounds(id: string, name: string): THREE.Box3 {
  const object = buildParametric(getEntry(id)!);
  const box = new THREE.Box3();
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.name === name) box.union(new THREE.Box3().setFromObject(mesh));
  });
  expect(box.isEmpty(), `${id} has ${name}`).toBe(false);
  return box;
}

describe('premium kitchen runs', () => {
  const runs = ['kitchen.base', 'kitchen.base.drawers', 'kitchen.sink', 'kitchen.counter.1200', 'kitchen.counter.2400', 'oven.builtin'];

  it('line up: one worktop height and front edge, fronts on one plane, one plinth', () => {
    const tops = runs.map((id) => partBounds(id, 'worktop'));
    const fronts = runs.map((id) => partBounds(id, 'fronts'));
    for (const [i, id] of runs.entries()) {
      // The sink unit's box includes its tap; its worktop stays at the counter height.
      expect(tops[i]!.max.y, id).toBeCloseTo(0.87, 3);
      expect(tops[i]!.max.z, id).toBeCloseTo(0.3, 3);
      expect(fronts[i]!.max.z, id).toBeCloseTo(0.28, 3);
      expect(partBounds(id, 'lacquer.graphite').min.y, id).toBeCloseTo(0, 3);
    }
  });

  it('tall units and housings are flush with the base fronts and level with the wall units', () => {
    const wallTop = (getEntry('kitchen.wall')!.mountHeight ?? 0) + getEntry('kitchen.wall')!.dims.h;
    for (const id of ['kitchen.tall', 'oven.tower', 'fridge.integrated']) {
      const e = getEntry(id)!;
      expect(e.dims.h, id).toBe(wallTop);
      // Distance from the wall to the face of the fronts, as for a base unit (300 + 280 mm).
      expect(partBounds(id, 'fronts').max.z + e.dims.d / 2000, id).toBeCloseTo(0.58, 3);
    }
  });

  it('hob and microwave sit on the worktop, the hood hangs well above the hob', () => {
    for (const id of ['hob.4burner', 'hob.2burner', 'hob.5burner', 'hob.induction', 'microwave']) expect(getEntry(id)!.mountHeight, id).toBe(870);
    expect(getEntry('hood.chimney')!.mountHeight! - 870).toBeGreaterThanOrEqual(650);
  });
});

describe('premium wet rooms', () => {
  it('basins and vanities stay below a mirror hung at 1050 mm', () => {
    for (const e of CATALOG.filter((x) => x.id.startsWith('basin.'))) expect(e.dims.h, e.id).toBeLessThanOrEqual(1050);
  });

  it('shower glass is thin and see-through', () => {
    for (const id of ['shower', 'shower.corner', 'shower.walkin']) {
      const object = buildParametric(getEntry(id)!);
      const glass = object.getObjectByName('glass') as THREE.Mesh;
      expect((glass.material as THREE.Material).transparent, id).toBe(true);
    }
  });

  it('sanitary ware is smooth: no part is a plain box', () => {
    for (const id of ['toilet', 'toilet.square', 'toilet.wall', 'basin.pedestal', 'basin.pedestal.square', 'bathtub']) {
      const object = buildParametric(getEntry(id)!);
      const ceramic = object.getObjectByName('ceramic') as THREE.Mesh;
      expect(ceramic.geometry.getAttribute('position').count / 3, id).toBeGreaterThan(500);
    }
  });
});
