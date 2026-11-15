/**
 * Premium Roman blinds, wall-anchored above a window: a fabric-covered headrail,
 * the shade drawn up into soft horizontal folds stacked at the top, a contrast
 * border, and a brass chain with its weight hanging to the bottom of the box.
 * The window below the folds stays clear.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, type BuildContext } from './kit';

/**
 * One fold of the raised shade: a soft D-shaped roll `w` wide, `h` tall and
 * standing `proud` in front of z0, its back tucked 6 mm behind. It sags and
 * swells a little in the middle, as the fabric does between the cords.
 */
function fold(w: number, h: number, proud: number, y: number, z0: number, sag: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const back = -Math.min(0.006, proud * 0.3);
  // A flattish face with a full, rounded bottom where the fabric turns back, and a soft top tucked under the fold above.
  s.moveTo(back, h * 0.12);
  s.bezierCurveTo(proud * 0.35, -h * 0.02, proud * 0.95, -h * 0.01, proud, h * 0.3);
  s.bezierCurveTo(proud * 1.01, h * 0.6, proud * 0.9, h * 0.86, proud * 0.6, h * 0.97);
  s.bezierCurveTo(proud * 0.3, h * 1.02, back * 0.5, h, back, h * 0.9);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, steps: Math.max(8, Math.round(w / 0.08)), bevelEnabled: false, curveSegments: 8 });
  g.rotateY(-Math.PI / 2).translate(w / 2, 0, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (w / 2);
    const mid = Math.max(0, 1 - u * u);
    // Droop in the middle, a hint of fullness forward, and the corners pulled in by the cords.
    pos.setY(i, pos.getY(i) - sag * mid);
    pos.setZ(i, pos.getZ(i) * (0.9 + 0.1 * mid));
  }
  g.computeVertexNormals();
  return g.translate(0, y, z0);
}

/**
 * Params: `folds` (default from the drop, about one per 30 cm of window),
 * `raised` (the share of the drop the stacked folds take, default 0.24).
 */
export function buildRomanBlind(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const n = Math.max(3, param(entry, 'folds', Math.round(H / 0.36)));
  const stackShare = THREE.MathUtils.clamp(param(entry, 'raised', 0.24), 0.12, 0.45);
  const back = -D / 2;
  const cap = 0.006; // brass end caps
  const fw = W - 2 * cap - 0.006; // shade width
  // Headrail, covered in the shade's fabric, with brass end caps.
  const railH = Math.min(0.045, H * 0.03);
  const railD = D * 0.42;
  m.part('fabric', rbox(W - 2 * cap, railH, railD, 0.006, 0, H - railH, back + railD / 2, 2));
  for (const s of [-1, 1]) m.part('hardware', rbox(cap, railH * 0.86, railD * 0.92, 0.002, s * (W / 2 - cap / 2), H - railH * 0.93, back + railD * 0.48, 1));
  // The face of the shade: flat from the headrail down to the stack.
  const z0 = back + railD + 0.002; // back face of the shade
  const ft = 0.004;
  const stackH = H * stackShare;
  const yStack = H - stackH; // underside of the lowest fold
  m.part('fabric', rbox(fw, H - yStack - stackH * 0.4, ft, 0.0015, 0, yStack + stackH * 0.4, z0 + ft / 2, 1));
  // Contrast border down both edges of the face.
  const bw = Math.min(0.03, W * 0.025);
  for (const s of [-1, 1]) m.part('trim', rbox(bw, H - yStack - stackH * 0.4 - railH * 0.2, 0.002, 0.0008, s * (fw / 2 - bw / 2), yStack + stackH * 0.4, z0 + ft + 0.001, 1));

  // Folds, the lowest one in front: each hangs a little further forward than the one above.
  const room = D / 2 - z0; // from the shade face to the front of the box
  const sag = Math.min(0.022, W * 0.009);
  // Lower folds are fuller: the lowest carries the weighted hem.
  const weights = Array.from({ length: n }, (_, i) => 1 + 0.35 * (i / Math.max(1, n - 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = H - railH;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1); // 0 top, 1 bottom
    const pitch = ((H - railH - yStack - sag) * weights[i]!) / total;
    y -= pitch;
    const proud = room * (0.38 + 0.62 * k ** 0.8);
    const droop = sag * (0.3 + 0.7 * k);
    // The lowest fold shows the face's bottom border: the contrast fabric.
    m.part(i === n - 1 ? 'trim' : 'fabric', fold(fw, pitch * 1.22, proud, y, z0, droop));
  }

  // Chain at the right end, behind the shade, down to a brass weight at the bottom of the box.
  const cx = W / 2 - cap - 0.014;
  const cz = back + railD * 0.5;
  const wH = Math.min(0.05, H * 0.035);
  const r = 0.0016;
  for (const dx of [-0.005, 0.005]) m.part('hardware', cyl(r, r, H - railH - wH + 0.004, cx + dx, wH - 0.002, cz, 'y', 6));
  m.part('hardware', lathe([[0, 0], [0.006, 0.002], [0.009, wH * 0.35], [0.008, wH * 0.7], [0.004, wH * 0.92], [0.0015, wH], [0, wH]], cx, 0, cz, 16));
  m.part('hardware', cyl(0.012, 0.012, 0.01, cx, H - railH - 0.008, cz, 'y', 16));
  return m.build();
}

/** Generators of this file, registered through `premium/essentials.ts`. */
export const BLIND_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsRomanBlind: buildRomanBlind,
};
