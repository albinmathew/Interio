/**
 * Premium generators: outdoor. Slatted teak lounge chair and garden bench with
 * cushions, slatted round and square tables, a planter with foliage and a
 * clothes airer. See `beds.ts` for the conventions; shared parts live in
 * `seating.parts.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Model, cyl, lathe, param, rbox, type BuildContext } from './kit';
import { Parts, beam, clamp, placeBox, ring, rod, softBox, taperRod } from './seating.parts';

/* -------------------------------------------------------------------- slots */

export const LOUNGER_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.teak' },
  { id: 'cushions', label: 'Cushions', kind: 'fabric', default: 'fabric.linen.ivory' },
];
export const SLAT_TABLE_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top', kind: 'wood', default: 'wood.teak' },
  { id: 'base', label: 'Base', kind: 'metal', default: 'metal.black' },
];
export const SLAT_TABLE_WOOD_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top', kind: 'wood', default: 'wood.teak' },
  { id: 'base', label: 'Legs', kind: 'wood', default: 'wood.teak' },
];
export const PLANTER_SLOTS: FinishSlot[] = [
  { id: 'box', label: 'Planter', kind: 'wood', default: 'wood.teak' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
];
export const AIRER_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.white' },
  { id: 'rails', label: 'Rails', kind: 'metal', default: 'metal.steel' },
];

/** Deterministic pseudo-random numbers in [0, 1), so a model never changes between builds. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------------------------------------------------- lounge chair */

/**
 * A slatted lounge seat facing +Z: teak side frames with broad flat arms,
 * a slatted seat and reclined slatted back, a seat cushion and a back cushion
 * with piping. `arms: false` drops the arms; `seats` > 1 makes a garden bench
 * (one long seat cushion, a back cushion per seat).
 */
export function buildLounger(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const F = 'frame';
  const seats = param<number>(entry, 'seats', 1);
  const arms = param<boolean>(entry, 'arms', true);
  const seatY = clamp(H * (seats > 1 ? 0.5 : 0.46), 0.34, 0.45); // top of the slats
  const armY = seatY + 0.2;
  const post = 0.045;
  const armW = arms ? 0.075 : 0;
  const fx = W / 2 - armW / 2; // centre line of the side frames
  const front = D / 2 - post / 2 - 0.005;
  const rear = -D / 2 + 0.11;
  const lean = 0.28;

  for (const s of [-1, 1]) {
    const x = s * (arms ? fx : W / 2 - post / 2);
    // Front leg rises to the arm, rear leg to the back rail.
    p.part(F, rbox(post, (arms ? armY : seatY) - 0.02, post, 0.008, x, 0, front, 2));
    p.part(F, beam([x, 0, rear], [x, seatY, rear + 0.01], post, post, 0.008, 2));
    // Side rail under the seat and a low stretcher.
    p.part(F, rbox(post * 0.7, 0.07, front - rear, 0.008, x, seatY - 0.09, (front + rear) / 2, 2));
    p.part(F, rbox(post * 0.6, 0.035, front - rear, 0.006, x, 0.1, (front + rear) / 2, 1));
    if (arms) {
      // Broad flat arm, rounded at the front.
      p.part(F, rbox(armW, 0.028, D - 0.12, 0.01, s * fx, armY - 0.028, D / 2 - (D - 0.12) / 2, 2));
      p.part(F, rbox(post * 0.8, armY - seatY - 0.028, post * 0.8, 0.006, x, seatY, rear + 0.18, 1));
    }
  }
  const inner = 2 * (arms ? fx - armW / 2 : W / 2 - post);
  // Front and back rails.
  p.part(F, rbox(inner + 0.01, 0.07, post * 0.7, 0.008, 0, seatY - 0.09, front, 2));
  p.part(F, rbox(inner + 0.01, 0.07, post * 0.7, 0.008, 0, seatY - 0.09, rear, 2));
  // Seat slats.
  const sd = front - rear - post;
  const n = Math.max(4, Math.round(sd / 0.065));
  const gap = 0.012;
  const sw = (sd - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) p.part(F, rbox(inner, 0.02, sw, 0.005, 0, seatY - 0.02, rear + post / 2 + sw / 2 + i * (sw + gap), 1));
  // Reclined back: two stiles carrying horizontal slats.
  const backTop = H;
  const backLen = (backTop - seatY + 0.02) / Math.cos(lean);
  const stileX = inner / 2 - 0.02;
  const back: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) back.push(rbox(0.04, backLen, 0.035, 0.008, s * stileX, 0, 0, 2));
  const bn = Math.max(3, Math.round((backLen - 0.12) / 0.09));
  for (let i = 0; i < bn; i++) back.push(rbox(inner - 0.01, 0.06, 0.018, 0.005, 0, 0.1 + i * ((backLen - 0.16) / (bn - 1)) - 0.03, 0.026, 1));
  const bbox = new THREE.Box3();
  for (const g of back) {
    g.rotateX(-lean);
    g.computeBoundingBox();
    bbox.union(g.boundingBox!);
  }
  for (const g of back) p.part(F, g.translate(0, backTop - bbox.max.y, -D / 2 - bbox.min.z));
  // Cushions.
  const cushT = 0.08;
  const seatCush = softBox(inner - 0.012, cushT, sd + 0.01, 0, seatY, (front + rear) / 2 + 0.01, 0.18, 0.03, 2);
  p.part('cushions', seatCush);
  const py = seatY + cushT - 0.01;
  p.part('cushions', rod([-(inner / 2 - 0.03), py, (front + rear) / 2 + 0.01 + (sd + 0.01) / 2 - 0.012], [inner / 2 - 0.03, py, (front + rear) / 2 + 0.01 + (sd + 0.01) / 2 - 0.012], 0.005, 6));
  const bw = (inner - 0.012) / seats;
  const bh = (backTop - seatY - cushT) * 0.78;
  for (let i = 0; i < seats; i++) {
    const g = softBox(bw - (seats > 1 ? 0.012 : 0), 0.07, bh, 0, 0, 0, 0.3, 0.03, 2).rotateX(Math.PI / 2).rotateX(-lean);
    // Rests on the seat cushion, against the slats.
    const zAt = -D / 2 - bbox.min.z + 0.045;
    placeBox(g, { cx: -inner / 2 + 0.006 + bw * (i + 0.5), minY: seatY + cushT - 0.02, minZ: zAt + Math.tan(lean) * 0.02 });
    p.part('cushions', g);
  }
  return p.build();
}

/* ------------------------------------------------------------- slat table */

/**
 * A slatted teak table. `shape: 'round'`: a round slatted top on a black steel
 * tripod with a ring (bistro table). `shape: 'square'`: a square slatted top
 * with a slatted lower shelf on square teak legs (outdoor coffee table).
 */
export function buildSlatTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const shape = param<'round' | 'square'>(entry, 'shape', 'round');
  const topT = 0.024;
  const gap = 0.008;
  if (shape === 'round') {
    const R = W / 2;
    const sz = D / W;
    // A solid rim round slats cut to the circle.
    const band = 0.035;
    p.part(
      'top',
      lathe(
        [
          [R - band, 0],
          [R - 0.004, 0],
          [R, 0.004],
          [R, topT - 0.004],
          [R - 0.004, topT],
          [R - band, topT],
          [R - band, 0],
        ],
        0,
        H - topT,
        0,
        48,
      ).scale(1, 1, sz),
    );
    const Ri = R - band + 0.004;
    const n = Math.max(5, Math.round((2 * Ri) / 0.07)) | 1;
    const sw = (2 * Ri - (n - 1) * gap) / n;
    for (let i = 0; i < n; i++) {
      const z = -Ri + sw / 2 + i * (sw + gap);
      const zEdge = Math.min(Ri, Math.abs(z) + sw / 2);
      const len = Math.max(0.04, 2 * Math.sqrt(Math.max(0, Ri * Ri - zEdge * zEdge)) + 0.01);
      p.part('top', rbox(len, topT - 0.004, sw, 0.004, 0, H - topT, z * sz, 1));
    }
    p.part('top', ring(R - band - 0.02, 0.012, 0, H - topT - 0.012, 0, 40, sz));
    // Tripod with a foot ring.
    const top = R * 0.32;
    const foot = R * 0.92;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      p.part('base', taperRod([Math.sin(a) * foot, 0.006, Math.cos(a) * foot * sz], [Math.sin(a) * top, H - topT - 0.02, Math.cos(a) * top * sz], 0.012, 0.014, 12));
      p.fixed('#1a1a1a', cyl(0.014, 0.014, 0.007, Math.sin(a) * foot, 0, Math.cos(a) * foot * sz, 'y', 10));
    }
    const ry = H * 0.3;
    const rr = foot + (top - foot) * ((ry - 0.006) / (H - topT - 0.026));
    p.part('base', ring(rr, 0.008, 0, ry, 0, 36, sz));
    p.part('base', cyl(top + 0.03, top + 0.03, 0.012, 0, H - topT - 0.032, 0, 'y', 24).scale(1, 1, sz));
    return p.build();
  }
  // Square: slatted top in a mitred frame, slatted shelf, square legs.
  const leg = 0.05;
  const rim = 0.05;
  for (const s of [-1, 1]) {
    p.part('top', rbox(W, topT, rim, 0.006, 0, H - topT, s * (D / 2 - rim / 2), 2));
    p.part('top', rbox(rim, topT, D - 2 * rim, 0.006, s * (W / 2 - rim / 2), H - topT, 0, 2));
  }
  const n = Math.max(4, Math.round((D - 2 * rim) / 0.07));
  const sw = (D - 2 * rim - (n + 1) * gap) / n;
  for (let i = 0; i < n; i++) p.part('top', rbox(W - 2 * rim, topT - 0.004, sw, 0.004, 0, H - topT, -D / 2 + rim + gap + sw / 2 + i * (sw + gap), 1));
  const lx = W / 2 - leg / 2 - 0.015;
  const lz = D / 2 - leg / 2 - 0.015;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('base', rbox(leg, H - topT, leg, 0.008, sx * lx, 0, sz * lz, 2));
  for (const s of [-1, 1]) {
    p.part('base', rbox(2 * lx, 0.06, 0.025, 0.006, 0, H - topT - 0.06, s * lz, 1));
    p.part('base', rbox(0.025, 0.06, 2 * lz, 0.006, s * lx, H - topT - 0.06, 0, 1));
  }
  const shelfY = clamp(H * 0.2, 0.06, 0.12);
  const sn = Math.max(3, Math.round((2 * lz - leg) / 0.08));
  const ssw = (2 * lz - leg - (sn - 1) * gap * 1.5) / sn;
  for (let i = 0; i < sn; i++) p.part('top', rbox(2 * lx + leg * 0.5, 0.018, ssw, 0.004, 0, shelfY, -lz + leg / 2 + ssw / 2 + i * (ssw + gap * 1.5), 1));
  for (const s of [-1, 1]) p.part('base', rbox(0.025, 0.03, 2 * lz, 0.005, s * (lx - leg / 2 + 0.0125), shelfY - 0.03, 0, 1));
  return p.build();
}

/* ------------------------------------------------------------------ planter */

/**
 * A long planter: a slatted teak box on a black steel frame, soil, and a row
 * of shrubs of mixed heights and two greens, the tallest at the full height.
 */
export function buildPlanterBox(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const legH = 0.06;
  const boxH = clamp(H * 0.42, 0.2, 0.45);
  const top = legH + boxH;
  // Frame: corner posts and a base ring.
  const post = 0.025;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('frame', rbox(post, top, post, 0.003, sx * (W / 2 - post / 2), 0, sz * (D / 2 - post / 2), 1));
  for (const s of [-1, 1]) {
    p.part('frame', rbox(W - 2 * post, 0.02, 0.015, 0.003, 0, legH, s * (D / 2 - 0.0125), 1));
    p.part('frame', rbox(0.015, 0.02, D - 2 * post, 0.003, s * (W / 2 - 0.0125), legH, 0, 1));
  }
  // Horizontal slats all round.
  const n = Math.max(3, Math.round(boxH / 0.075));
  const gap = 0.008;
  const sh = (boxH - 0.02 - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) {
    const y = legH + 0.02 + i * (sh + gap);
    for (const s of [-1, 1]) {
      p.part('box', rbox(W - 2 * post, sh, 0.018, 0.004, 0, y, s * (D / 2 - post / 2), 1));
      p.part('box', rbox(0.018, sh, D - 2 * post, 0.004, s * (W / 2 - post / 2), y, 0, 1));
    }
  }
  // Cap rail.
  for (const s of [-1, 1]) {
    p.part('box', rbox(W, 0.02, 0.04, 0.005, 0, top - 0.02, s * (D / 2 - 0.02), 2));
    p.part('box', rbox(0.04, 0.02, D - 0.08, 0.005, s * (W / 2 - 0.02), top - 0.02, 0, 2));
  }
  p.fixed('wood.wenge', rbox(W - 0.06, 0.02, D - 0.06, 0.005, 0, top - 0.05, 0, 1));

  // Shrubs: clusters of lumpy leaf balls.
  const rand = rng(Math.round(W * 1000) * 31 + Math.round(D * 1000));
  const maxR = Math.min(D / 2 - 0.01, 0.2);
  const count = Math.max(2, Math.round(W / (maxR * 1.6)));
  const pitch = (W - 2 * maxR) / Math.max(1, count - 1);
  const leafH = H - top + 0.03; // foliage height above the soil line
  const lump = (r: number, x: number, y: number, z: number, sy: number, material: string) => {
    // Welded first, so the jitter keeps the surface closed and the shading smooth.
    const ico = new THREE.IcosahedronGeometry(1, 2);
    ico.deleteAttribute('normal');
    ico.deleteAttribute('uv');
    const g = mergeVertices(ico, 1e-5);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const k = 0.86 + 0.24 * rand();
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.scale(r, r * sy, r);
    // Keep inside the footprint and under the full height.
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const cx = clamp(x, -W / 2 - b.min.x, W / 2 - b.max.x);
    const cz = clamp(z, -D / 2 - b.min.z, D / 2 - b.max.z);
    const cy = Math.min(y, H - b.max.y);
    p.fixed(material, g.translate(cx, cy, cz));
  };
  for (let i = 0; i < count; i++) {
    const x = -W / 2 + maxR + pitch * i;
    const tall = i % 2 === 0;
    const h = leafH * (tall ? 1 : 0.7);
    const green = tall ? 'fabric.velvet.emerald' : 'fabric.cotton.sage';
    // A spill of small lumps over the rim, a body of overlapping ones, then the crown.
    lump(maxR * 0.7, x, top - 0.02 + maxR * 0.3, 0, 0.7, green);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rand();
      lump(maxR * (0.48 + 0.1 * rand()), x + Math.cos(a) * maxR * 0.45, top + h * (0.3 + 0.25 * (k % 2)), Math.sin(a) * maxR * 0.3, 0.95, green);
    }
    const crown = maxR * 0.5;
    lump(crown, x + (rand() - 0.5) * 0.04, top + h - crown * 0.95, 0, 1.1, green);
  }
  return p.build();
}

/* -------------------------------------------------------------------- airer */

/**
 * A clothes airer: a rail deck on crossed legs with two hinged side wings
 * raised, a towel and a shirt hung over the rails.
 */
export function buildAirer(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const tr = 0.009;
  const wingLift = 0.38;
  const deckW = W * 0.5;
  const wingL = (W / 2 - tr - deckW / 2) / Math.cos(wingLift);
  const deckY = H - tr - Math.sin(wingLift) * wingL;
  const dz = D / 2 - tr - 0.12; // half-depth of the deck
  // Deck frame and rails.
  for (const s of [-1, 1]) p.part('frame', rod([-deckW / 2, deckY, s * dz], [deckW / 2, deckY, s * dz], tr, 10));
  for (const s of [-1, 1]) p.part('frame', rod([s * deckW / 2, deckY, -dz], [s * deckW / 2, deckY, dz], tr, 10));
  const rails = Math.max(5, Math.round((2 * dz) / 0.06));
  const railZ = (i: number) => -dz + ((2 * dz) / (rails + 1)) * (i + 1);
  for (let i = 0; i < rails; i++) p.part('rails', rod([-deckW / 2, deckY, railZ(i)], [deckW / 2, deckY, railZ(i)], 0.0035, 6));
  // Wings, raised at an angle: rails run from the hinge outwards and up.
  const wy = deckY + Math.sin(wingLift) * wingL;
  const wx = deckW / 2 + Math.cos(wingLift) * wingL;
  const wingTopY = Math.min(H - tr, wy);
  for (const s of [-1, 1]) {
    const hx = s * deckW / 2;
    const ox = s * Math.min(W / 2 - tr, wx);
    for (const z of [-dz, dz]) p.part('frame', rod([hx, deckY, z], [ox, wingTopY, z], tr * 0.85, 10));
    p.part('frame', rod([ox, wingTopY, -dz], [ox, wingTopY, dz], tr * 0.85, 10));
    for (let i = 0; i < rails; i += 2) p.part('rails', rod([hx, deckY, railZ(i)], [ox, wingTopY, railZ(i)], 0.0035, 6));
  }
  // Crossed legs at each end of the deck, out to the full depth.
  for (const s of [-1, 1]) {
    const x = s * (deckW / 2 - 0.03);
    p.part('frame', rod([x, tr, -(D / 2 - tr)], [x, deckY, dz * 0.4], tr, 10));
    p.part('frame', rod([x, tr, D / 2 - tr], [x, deckY, -dz * 0.4], tr, 10));
    for (const z of [-(D / 2 - tr * 1.3), D / 2 - tr * 1.3]) p.fixed('#1a1a1a', new THREE.SphereGeometry(tr * 1.3, 8, 6).translate(x, tr * 1.3, z));
  }
  p.part('frame', rod([-(deckW / 2 - 0.03), deckY * 0.32, 0], [deckW / 2 - 0.03, deckY * 0.32, 0], tr * 0.7, 8));
  // Laundry: a towel over a deck rail and a shirt over a wing.
  const drape = (x: number, z: number, w: number, len: number, material: string) => {
    for (const s of [-1, 1]) {
      const g = rbox(w, len, 0.006, 0.003, 0, -len, 0, 1);
      g.rotateX(s * 0.07).translate(x, deckY + 0.002, z + s * 0.009);
      p.fixed(material, g);
    }
    p.fixed(material, cyl(0.011, 0.011, w, x, deckY + 0.002, z, 'x', 10));
  };
  drape(-deckW * 0.18, railZ(Math.floor(rails / 2) - 1), deckW * 0.42, Math.min(0.45, deckY * 0.5), 'fabric.cotton.white');
  drape(deckW * 0.22, railZ(rails - 2), deckW * 0.36, Math.min(0.32, deckY * 0.38), 'fabric.cotton.sky');
  return p.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const OUTDOOR_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  lounger: buildLounger,
  slatTable: buildSlatTable,
  planterBox: buildPlanterBox,
  airer: buildAirer,
};
