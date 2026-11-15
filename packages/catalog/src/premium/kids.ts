/**
 * The kids' bedroom set, after a soft pastel twin room: single beds with a
 * scalloped upholstered headboard and a quilted cover, a bedside unit with drawers
 * and woven baskets, a study and storage wall, and a teddy bear. See `beds.ts` for
 * the conventions. The storage pieces live in `kids.storage.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { duvetShape } from './beds';
import { Fit, twoSided, type G } from './decor.parts';
import { Model, cushion, cyl, param, pillow, rbox, turn, type BuildContext } from './kit';
import { KIDS_STORAGE_GENERATORS } from './kids.storage';

/* -------------------------------------------------------------------- slots */

/** Kids' single bed: ivory lacquer frame, cream bouclé headboard, blush quilted cover, ivory pillows. */
export const KIDS_BED_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'lacquer', default: 'lacquer.cream' },
  { id: 'headboard', label: 'Headboard', kind: 'fabric', default: 'fabric.boucle.cream' },
  { id: 'bedding', label: 'Quilt and cushion', kind: 'fabric', default: 'fabric.cotton.blush' },
  { id: 'pillows', label: 'Pillow', kind: 'fabric', default: 'fabric.linen.ivory' },
];

export const KIDS_TEDDY_SLOTS: FinishSlot[] = [{ id: 'fur', label: 'Fur', kind: 'fabric', default: 'woven.jute' }];

/** The fitted sheet and mattress. */
const SHEET = 'fabric.cotton.white';

/* ------------------------------------------------------------------ shapes */

/** An outline with a straight base on y = 0 and rounded top corners of radius r (r = w/2 is a full arch). */
export function archShape(w: number, h: number, r: number): THREE.Shape {
  const rr = Math.max(1e-4, Math.min(r, w / 2, h));
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - rr);
  s.absarc(w / 2 - rr, h - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + rr, h);
  s.absarc(-w / 2 + rr, h - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

/**
 * Stands a flat outline up: its face to +Z, `depth` deep from z0, the outline at
 * (x, y). A bevel of `bevel` rounds the edges; the outline is shrunk to keep the size.
 */
export function standUp(shape: (inset: number) => THREE.Shape, depth: number, bevel: number, x: number, y: number, z0: number, curveSegments = 10): G {
  const b = Math.max(0, Math.min(bevel, depth / 2 - 1e-4));
  const g = new THREE.ExtrudeGeometry(shape(b), {
    depth: Math.max(1e-4, depth - 2 * b),
    bevelEnabled: b > 0,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 3,
    curveSegments,
  });
  return g.translate(x, y, z0 + b);
}

/**
 * A quilted cover: `duvetShape`'s cloth stitched in squares of about `q`, the
 * stitch lines pulled in by `depth`. The squares follow the cloth over the roll
 * and down the drop, so the pattern runs on round the edges.
 */
export function quiltedDuvet(w: number, z0: number, z1: number, top: number, hem: number, puff: number, roll: number, q: number, depth: number, per = 4): G {
  const shape = duvetShape(w, z0, z1, top, hem, puff, roll);
  const cu = Math.max(2, Math.round(shape.across / q));
  const cv = Math.max(2, Math.round(shape.along / q));
  const nu = cu * per;
  const nv = cv * per;
  const pos: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...shape.at(i / nu, j / nv));
  const index: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      index.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  // Pull the stitches in, whichever way the grid's winding made the normals face.
  const centre = Math.round(nv / 2) * (nu + 1) + Math.round(nu / 2);
  const outward = n.getY(centre) >= 0 ? 1 : -1;
  const shoulder = top - roll;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      const fu = Math.sin((Math.PI * (i % per)) / per) ** 0.6;
      const fv = Math.sin((Math.PI * (j % per)) / per) ** 0.6;
      // The hem and the head edge keep their line: no stitch pulls them.
      const stitch = j === 0 || j === nv || i === 0 || i === nu ? 0 : depth * (1 - fu * fv);
      // Soft folds in the drop, growing towards the hem; always inwards, so the cover keeps its size.
      const fall = Math.min(1, Math.max(0, (shoulder - p.getY(k)) / Math.max(0.01, shoulder - hem)));
      // The hem line itself stays put, so the corners, folded flat into it, do not tear.
      const atHem = p.getY(k) <= hem + 0.002;
      const fold = atHem ? 0 : 0.007 * fall ** 1.3 * (1 - Math.cos(((p.getX(k) + p.getZ(k)) * 2 * Math.PI) / 0.31 + 0.8));
      const d = outward * (stitch + fold);
      p.setXYZ(k, p.getX(k) - n.getX(k) * d, p.getY(k) - n.getY(k) * d, p.getZ(k) - n.getZ(k) * d);
    }
  }
  g.computeVertexNormals();
  // Where the side and the foot both hang, the corner folds flat into the hem: its
  // triangles have no area and its normals no length, which shade as NaN (and bloom
  // white). Those vertices take the normal of the cloth just above them.
  for (let i = 0; i <= nu; i++) {
    for (let j = 1; j <= nv; j++) {
      const k = j * (nu + 1) + i;
      if (n.getX(k) ** 2 + n.getY(k) ** 2 + n.getZ(k) ** 2 > 1e-8) continue;
      const a = k - (nu + 1);
      n.setXYZ(k, n.getX(a), n.getY(a), n.getZ(a));
    }
  }
  for (let k = 0; k < n.count; k++) if (n.getX(k) ** 2 + n.getY(k) ** 2 + n.getZ(k) ** 2 < 1e-8) n.setXYZ(k, 0, outward, 0);
  return twoSided(g);
}

/* ---------------------------------------------------------------------- bed */

/**
 * Kids' single bed. A low frame on short tapered legs, a scalloped headboard of
 * upholstered arches on a lacquered backing, a mattress in a white sheet, a
 * quilted cover that falls nearly to the floor, folded back at the head, one
 * plump pillow and a smaller cushion in the cover's fabric. Head at -Z.
 *
 * Params: `scallops` across the headboard (default one per 330 mm of width).
 */
export function buildKidsBed(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const headT = 0.085;
  const bedBack = back + headT;
  const legH = Math.min(0.12, H * 0.13);
  const railH = 0.17;
  const railT = 0.03;
  const frameTop = legH + railH;
  const FW = W - 0.12; // frame width: the cover hangs over it, its stitches and folds clear of the rails
  const foot = D / 2 - 0.055; // the foot rail's face, well inside the cover's fall
  const bedLen = foot - bedBack;
  const zMid = bedBack + bedLen / 2;

  /* Frame: rails round a platform, short tapered legs. */
  for (const sx of [-1, 1]) m.part('frame', rbox(railT, railH, bedLen, 0.006, sx * (FW / 2 - railT / 2), legH, zMid, 2));
  m.part('frame', rbox(FW, railH, railT, 0.006, 0, legH, foot - railT / 2, 2));
  for (const sx of [-1, 1]) for (const z of [bedBack + 0.06, foot - 0.07]) m.part('frame', cyl(0.024, 0.017, legH, sx * (FW / 2 - 0.06), 0, z, 'y', 14));

  /* Headboard: a row of arches, the centre ones tallest, on a backing 8 mm proud all round. */
  const n = Math.max(2, Math.round(Number(param(entry, 'scallops', Math.round(W / 0.33)))));
  const cw = W / n;
  const backT = 0.022;
  const padT = headT - backT;
  const mid = (n - 1) / 2;
  const inner = n % 2 === 0 ? 0.5 : 0; // the middle arch, or the middle pair, stands tallest
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + cw * (i + 0.5);
    const drop = mid > inner ? 0.07 * ((Math.abs(i - mid) - inner) / (mid - inner)) ** 1.4 : 0;
    const top = H - drop;
    const bw = cw + 0.0005; // neighbours touch
    m.part('frame', standUp((b) => archShape(bw - 2 * b, top - 2 * b, bw / 2 - b), backT, 0.004, x, 0.004, back, 14));
    // The pad: from behind the mattress to 9 mm under the backing's crown.
    const py = frameTop - 0.05;
    const pw = cw - 0.018;
    const ph = top - 0.009 - py;
    m.part('headboard', standUp((b) => archShape(pw - 2 * b, ph - 2 * b, pw / 2 - b), padT, 0.02, x, py + 0.02, back + backT, 14));
  }

  /* Mattress in its sheet, sitting into the frame. */
  const mattW = FW - 0.012; // sitting into the frame, just inside the rails' faces
  const mattH = 0.2;
  const mattY = frameTop - 0.05;
  const mattLen = bedLen - railT - 0.01;
  m.fixed(SHEET, rbox(mattW, mattH, mattLen, 0.05, 0, mattY, bedBack + 0.005 + mattLen / 2, 4));
  const top = mattY + mattH;

  /* Pillow leaning on the headboard, a smaller cushion in the cover's fabric in front. */
  const pw = Math.min(0.66, mattW - 0.14);
  const pz = bedBack + 0.2;
  m.part('pillows', turn(pillow(pw, 0.2, 0.44, 0, top - 0.03, pz), -0.62, 0, 0, 0, top, pz));
  const cwid = Math.min(0.44, pw * 0.68);
  const cz = bedBack + 0.36;
  m.part('bedding', turn(pillow(cwid, 0.13, 0.32, 0, top + 0.005, cz), -1.05, 0, 0, 0, top, cz));

  /* The quilted cover: from below the cushion to the foot, nearly to the floor; folded back at the head. */
  const start = bedBack + 0.52;
  const coverW = W - 0.012;
  const hem = legH + 0.035;
  m.part('bedding', quiltedDuvet(coverW, start + 0.12, D / 2 - 0.004, top + 0.03, hem, 0.03, 0.055, 0.2, 0.017, 5));
  m.part('bedding', cushion(coverW - 0.03, 0.065, 0.27, 0, top + 0.012, start + 0.13, 0.4, 0.032));
  return m.build();
}

/* -------------------------------------------------------------------- teddy */

const FUR = 'fur';
const MUZZLE = 'fabric.boucle.cream';
const EYES = 'ceramic.black';
const RIBBON = 'fabric.cotton.blush';

const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number, ws = 22, hs = 14): G => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(x, y, z);

/** A capsule of radius r from a to b. */
function limb(a: [number, number, number], b: [number, number, number], r: number): G {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const g = new THREE.CapsuleGeometry(r, Math.max(1e-3, dir.length()), 5, 14);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const c = va.add(vb).multiplyScalar(0.5);
  return g.translate(c.x, c.y, c.z);
}

/**
 * A sitting teddy bear facing +Z: a pear-shaped body, a round head with a pale
 * muzzle, button eyes and nose, round ears with pale insides, arms resting at
 * its sides, legs out in front with pale foot pads, and a ribbon bow at the neck.
 * Built at a nominal size, then fitted to the entry's box.
 */
export function buildTeddy(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const f = new Fit();
  // Body, pear-shaped and leaning back a little.
  const body = ell(0.074, 0.088, 0.066, 0, 0, 0, 26, 18);
  const bp = body.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const k = 1.08 - 0.16 * ((bp.getY(i) / 0.088 + 1) / 2); // wider at the seat, narrower at the shoulders
    bp.setXYZ(i, bp.getX(i) * k, bp.getY(i), bp.getZ(i) * k);
  }
  body.computeVertexNormals();
  f.part(FUR, turn(body.translate(0, 0.09, -0.012), -0.14, 0, 0, 0, 0.05, -0.012));
  // Head and muzzle.
  f.part(FUR, ell(0.068, 0.062, 0.06, 0, 0.212, 0.002, 26, 18));
  f.fixed(MUZZLE, ell(0.032, 0.025, 0.027, 0, 0.196, 0.05));
  f.fixed(EYES, ell(0.012, 0.0085, 0.008, 0, 0.207, 0.076, 12, 8));
  for (const s of [-1, 1]) f.fixed(EYES, ell(0.0075, 0.0078, 0.005, s * 0.026, 0.226, 0.053, 10, 8));
  // Ears.
  for (const s of [-1, 1]) {
    f.part(FUR, turn(ell(0.026, 0.025, 0.012, s * 0.05, 0.262, -0.006), 0, 0, -s * 0.3, s * 0.05, 0.262, -0.006));
    f.fixed(MUZZLE, turn(ell(0.016, 0.015, 0.006, s * 0.05, 0.261, 0.003), 0, 0, -s * 0.3, s * 0.05, 0.261, 0.003));
  }
  // Arms and legs.
  for (const s of [-1, 1]) {
    // Arms: short, plump, the paws resting forward on the legs.
    f.part(FUR, limb([s * 0.062, 0.138, 0.004], [s * 0.088, 0.088, 0.05], 0.027));
    // Legs out in front, a little splayed, the soles facing forward.
    f.part(FUR, limb([s * 0.044, 0.042, 0.004], [s * 0.066, 0.036, 0.08], 0.035));
    f.fixed(MUZZLE, turn(ell(0.02, 0.024, 0.007, s * 0.068, 0.037, 0.113), 0, s * 0.27, 0, s * 0.068, 0.037, 0.113));
  }
  // A ribbon round the neck with a bow at the front.
  f.fixed(RIBBON, new THREE.TorusGeometry(0.05, 0.007, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 0.158, 0.0));
  for (const s of [-1, 1]) f.fixed(RIBBON, turn(ell(0.02, 0.012, 0.006, s * 0.018, 0.158, 0.052), 0, 0, s * 0.35, s * 0.018, 0.158, 0.052));
  f.fixed(RIBBON, ell(0.008, 0.009, 0.007, 0, 0.158, 0.056, 10, 8));
  f.into(m, [-m.W / 2, 0, -m.D / 2], [m.W / 2, m.H, m.D / 2]);
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const KIDS_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  kidsBed: buildKidsBed,
  kidsTeddy: buildTeddy,
  ...KIDS_STORAGE_GENERATORS,
};
