import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/index';
import { PREMIUM_GENERATORS } from '../src/premium';

/**
 * No model ships a zero-length or NaN normal: it shades as NaN, which the walk view's bloom
 * spreads into a white screen (a duvet's corner folded flat into its hem did this).
 */
describe('normals', () => {
  it('every parametric model has unit-length normals', () => {
    const bad: string[] = [];
    for (const e of CATALOG) {
      if (e.model.kind !== 'parametric') continue;
      const build = PREMIUM_GENERATORS[e.model.generator];
      if (!build) continue;
      build(e).traverse((o) => {
        const n = (o as THREE.Mesh).geometry?.getAttribute('normal');
        if (!n) return;
        for (let k = 0; k < n.count; k++) {
          const len = n.getX(k) ** 2 + n.getY(k) ** 2 + n.getZ(k) ** 2;
          if (!(len > 1e-8)) {
            bad.push(e.id);
            return;
          }
        }
      });
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});
