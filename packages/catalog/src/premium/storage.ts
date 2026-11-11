/**
 * Premium generators: storage. Case goods (nightstands to wardrobes) share one
 * builder in `storage.case.ts`; the smaller pieces are here. See `beds.ts` for
 * the conventions.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, tube, type BuildContext } from './kit';
import { bookRow, fixedEmit, hash, join, panel, place, rng, vase, type G } from './decor.parts';
import { addShelfObjects, buildCase } from './storage.case';

export { CASE_SLOTS, SHELF_SLOTS, WALNUT_SLOTS, WARDROBE_SLOTS } from './storage.case';

/* -------------------------------------------------------------------- slots */

export const RACK_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
  { id: 'shelves', label: 'Shelves', kind: 'wood', default: 'wood.oak' },
];

export const LEDGE_SLOTS: FinishSlot[] = [
  { id: 'board', label: 'Shelf', kind: 'wood', default: 'wood.oak' },
  { id: 'accents', label: 'Rail and bookend', kind: 'metal', default: 'metal.brass' },
];

export const COAT_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'hooks', label: 'Hooks', kind: 'metal', default: 'metal.black' },
];

export const BOX_SLOTS: FinishSlot[] = [
  { id: 'box', label: 'Box', kind: 'woven', default: 'woven.jute' },
  { id: 'tape', label: 'Tape', kind: 'fabric', default: 'fabric.linen.ivory' },
];

export const BIN_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.steel' },
  { id: 'trim', label: 'Lid rim and pedal', kind: 'metal', default: 'metal.black' },
];

/* --------------------------------------------------------- open shelf rack */

/**
 * Open shelving on four square posts with cross-bracing at the back. Params:
 * `shelves` (default 5), `contents` (default true): boxes, books and a vase.
 */
export function buildShelfRack(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const n = Math.max(2, param(entry, 'shelves', 5));
  const p = Math.min(0.025, W * 0.04);
  const board = 0.022;
  const rand = rng(hash(entry.id));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.part('frame', rbox(p, H - 0.012, p, 0.004, sx * (W / 2 - p / 2), 0.012, sz * (D / 2 - p / 2), 1));
    // Levelling feet.
    for (const sz of [-1, 1]) m.part('frame', cyl(p * 0.42, p * 0.5, 0.012, sx * (W / 2 - p / 2), 0, sz * (D / 2 - p / 2), 'y', 12));
  }
  const ys = Array.from({ length: n }, (_, i) => 0.1 + ((H - board - 0.1) * i) / (n - 1));
  for (const y of ys) {
    m.part('shelves', panel(W - 2 * p - 0.004, board, D - 0.004, 0, y, 0, 0.003));
    // Steel lips under the front and back edges.
    for (const sz of [-1, 1]) m.part('frame', panel(W - 2 * p, 0.03, 0.012, 0, y - 0.03, sz * (D / 2 - 0.006), 0.001));
  }
  // X-bracing at the back, between the two lowest and the two highest shelves.
  const zb = -D / 2 + 0.004;
  for (const [ya, yb] of [[ys[0]!, ys[Math.floor((n - 1) / 2)]!], [ys[Math.ceil((n - 1) / 2)]!, ys[n - 1]!]] as const) {
    if (yb - ya < 0.1) continue;
    m.part('frame', tube([[-W / 2 + p, ya, zb], [W / 2 - p, yb, zb]], 0.003, false, 4));
    m.part('frame', tube([[-W / 2 + p, yb, zb], [W / 2 - p, ya, zb]], 0.003, false, 4));
  }
  if (param(entry, 'contents', true)) {
    for (let i = 0; i < n - 1; i++) {
      const y0 = ys[i]! + board;
      const y1 = ys[i + 1]! - 0.03;
      addShelfObjects(m, rand, -W / 2 + p + 0.02, W / 2 - p - 0.02, y0, y1, -D / 2 + 0.02, D / 2 - 0.02, n, i);
    }
  }
  return m.build();
}

/* ------------------------------------------------------- floating wall ledge */

/**
 * A floating oak ledge with a brass picture rail, books held by a bookend, a
 * vase and a small framed print leaning on the wall. Back at -Z.
 */
export function buildWallShelf(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const t = Math.min(0.032, H * 0.16);
  const rand = rng(hash(entry.id));
  m.part('board', rbox(W, t, D, 0.004, 0, 0, 0, 2));
  // Brass lip along the front, standing a little proud.
  m.part('accents', rbox(W - 0.02, 0.012, 0.006, 0.002, 0, t - 0.002, D / 2 - 0.003, 1));
  const room = H - t;
  // Books from the left, held by an L-shaped bookend.
  const emit = fixedEmit(m, 3);
  const end = bookRow(emit, rand, -W / 2 + 0.03, -W / 2 + W * 0.36, t, D / 2 - 0.02, room * 0.95, D * 0.7, false);
  m.part('accents', join([rbox(0.004, room * 0.6, D * 0.45, 0.001, end + 0.004, t, 0), rbox(0.06, 0.003, D * 0.45, 0.001, end + 0.03, t, 0)]));
  // A leaning print.
  const fw = Math.min(0.22, W * 0.26);
  const fh = room * 0.9;
  const lean = 0.1;
  const frame = join([
    rbox(fw, fh, 0.016, 0.003, 0, 0, 0, 1),
  ]);
  const print = rbox(fw - 0.03, fh - 0.03, 0.004, 0.001, 0, 0.015, 0.008, 1);
  for (const g of [frame, print]) g.rotateX(-lean).translate(W * 0.08, t, -D / 2 + 0.02 + Math.sin(lean) * fh);
  m.part('board', frame);
  m.fixed('lacquer.cream', print);
  // Vase, standing to the full height.
  m.fixed('ceramic.white', vase(room, Math.min(0.05, D * 0.24), W / 2 - 0.12, t, 0));
  return m.build();
}

/* ------------------------------------------------------------- coat stands */

/**
 * A coat hanging from its collar at the origin: width along X, hanging down -Y,
 * thickness along Z. Sloping shoulders, sleeves, a collar and a fuller hem.
 */
export function coat(w: number, len: number, th: number): G {
  const body = rbox(w, len, th, Math.min(th * 0.45, 0.03), 0, -len, 0, 3);
  const pos = body.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = -pos.getY(i) / len; // 0 at the collar, 1 at the hem
    const x = pos.getX(i);
    const across = Math.abs(x) / (w / 2);
    const width = v < 0.16 ? 0.62 + 0.38 * Math.sin((v / 0.16) * (Math.PI / 2)) : 1 + 0.07 * (v - 0.16);
    pos.setX(i, x * width);
    pos.setY(i, pos.getY(i) - (v < 0.25 ? across * across * 0.05 * (1 - v / 0.25) : 0));
    pos.setZ(i, pos.getZ(i) * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, v * 1.1))));
  }
  body.computeVertexNormals();
  const parts = [body, rbox(w * 0.42, 0.035, th * 1.08, 0.012, 0, -0.04, th * 0.04, 2)];
  for (const s of [-1, 1]) {
    const sleeve = rbox(w * 0.19, len * 0.58, th * 0.75, Math.min(th * 0.3, 0.02), 0, -len * 0.58, 0, 2);
    parts.push(place(sleeve, s * w * 0.41, -0.07, th * 0.12, 0, 0, s * 0.05));
  }
  return join(parts);
}

/** Oak coat stand: a pole on four splayed feet, pegs with ball ends, a coat, a tote bag and a hat. */
export function buildCoatStand(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const r = Math.min(0.022, W * 0.05);
  m.part('frame', cyl(r * 0.85, r, H - 0.02, 0, 0, 0, 'y', 20));
  m.part('frame', lathe([[r * 0.85, 0], [r * 0.95, 0.008], [r * 0.6, 0.02], [0, 0.022]], 0, H - 0.022, 0, 20));
  // Feet: reaching the edges of the footprint along x and z.
  const footH = Math.min(0.32, H * 0.2);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const reach = (dx ? W : D) / 2 - 0.016;
    m.part('frame', tube([[0, footH, 0], [dx * reach * 0.5, footH * 0.35, dz * reach * 0.5], [dx * reach, 0.016, dz * reach]], 0.014, false, 10));
    m.part('hooks', cyl(0.016, 0.016, 0.004, dx * reach, 0, dz * reach, 'y', 12));
  }
  // Six pegs in two tiers, the first pointing to the front.
  const len = Math.min(0.13, Math.min(W, D) / 2 - 0.04);
  const pegs: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    const y = H - 0.1 - (i % 2) * 0.12;
    const tip: [number, number, number] = [Math.cos(a) * len, y + 0.06, Math.sin(a) * len];
    pegs.push([Math.cos(a) * len * 0.7, y + 0.02, Math.sin(a) * len * 0.7]);
    m.part('hooks', tube([[0, y, 0], [Math.cos(a) * len * 0.65, y + 0.012, Math.sin(a) * len * 0.65], tip], 0.006, false, 8));
    m.part('hooks', new THREE.SphereGeometry(0.011, 12, 8).translate(...tip));
  }
  // A coat on the back peg, a tote bag on the front one, a hat on the side.
  const [cx, cy, cz] = pegs[3]!;
  const cw = Math.min(0.42, W * 0.78);
  m.fixed('fabric.weave.grey', coat(cw, Math.min(1.0, H * 0.56), 0.075).translate(cx, cy, cz - 0.035));
  const [bx, by, bz] = pegs[0]!;
  const bagH = Math.min(0.36, H * 0.2);
  m.fixed('fabric.linen.sand', join([rbox(0.3, bagH, 0.045, 0.02, bx, by - 0.08 - bagH, bz + 0.02, 2), tube([[bx - 0.08, by - 0.085, bz + 0.02], [bx, by + 0.005, bz + 0.01], [bx + 0.08, by - 0.085, bz + 0.02]], 0.006, false, 6)]));
  const [hx, hy, hz] = pegs[2]!;
  const hat = lathe([[0, 0], [0.14, 0], [0.15, 0.006], [0.1, 0.012], [0.085, 0.09], [0.06, 0.11], [0, 0.112]], 0, 0, 0, 28);
  m.fixed('fabric.weave.charcoal', place(hat, hx * 1.1, hy - 0.06, hz * 1.1, 0, 0.25, 0.9));
  return m.build();
}

/** Wall coat rack: oak shelf on two brackets over a hook rail, a coat and a tote bag hanging. Back at -Z. */
export function buildCoatRack(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const shelfT = 0.022;
  const railH = Math.min(0.09, H * 0.2);
  const railY = H - shelfT - 0.05 - railH;
  m.part('frame', rbox(W, shelfT, D, 0.004, 0, H - shelfT, 0, 2));
  m.part('frame', rbox(W - 0.02, railH, 0.02, 0.004, 0, railY, -D / 2 + 0.01, 2));
  for (const s of [-1, 1]) m.part('frame', rbox(0.02, 0.05 + railH * 0.5, D * 0.55, 0.003, s * (W / 2 - 0.08), H - shelfT - 0.05 - railH * 0.5, -D / 2 + D * 0.275, 1));
  const hooks = Math.max(3, Math.round(W / 0.16));
  const pitch = (W - 0.12) / (hooks - 1);
  const hookY = railY + railH * 0.5;
  for (let i = 0; i < hooks; i++) {
    const x = -W / 2 + 0.06 + pitch * i;
    m.part('hooks', tube([[x, hookY, -D / 2 + 0.02], [x, hookY - 0.012, -D / 2 + 0.06], [x, hookY + 0.02, -D / 2 + 0.085]], 0.005, false, 8));
    m.part('hooks', cyl(0.009, 0.009, 0.006, x, hookY, -D / 2 + 0.023, 'z', 12));
  }
  // A coat on the second hook, hanging to the bottom of the piece; a tote bag further along.
  const coatTop = hookY - 0.005;
  const g = coat(Math.min(0.44, W * 0.5), coatTop, 0.07);
  g.computeBoundingBox();
  const coatX = Math.max(-W / 2 + 0.06 + pitch, -W / 2 + 0.005 - g.boundingBox!.min.x);
  // Its hem rests at the bottom of the piece.
  m.fixed('fabric.weave.grey', g.translate(coatX, -g.boundingBox!.min.y, -D / 2 + 0.085));
  if (hooks >= 4) {
    const bh = Math.min(0.34, coatTop * 0.5);
    const x = -W / 2 + 0.06 + pitch * (hooks - 1.6);
    m.fixed('fabric.linen.sand', rbox(0.3, bh, 0.05, 0.02, x, hookY - 0.08 - bh, -D / 2 + 0.07, 2));
    m.fixed('fabric.linen.sand', tube([[x - 0.07, hookY - 0.085, -D / 2 + 0.07], [x, hookY + 0.008, -D / 2 + 0.085], [x + 0.07, hookY - 0.085, -D / 2 + 0.07]], 0.005, false, 6));
  }
  return m.build();
}

/* ------------------------------------------------------------- small pieces */

/** A closed moving box: flaps meeting along the top, packing tape, hand holes. */
export function buildBox(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const tape = 0.05;
  m.part('box', rbox(W - 0.004, H - 0.003, D - 0.004, 0.005, 0, 0, 0, 2));
  // The seam between the top flaps, and the tape over it and down both ends.
  m.fixed('#5b4a37', panel(W - 0.04, 0.002, 0.004, 0, H - 0.004, 0, 0.0005));
  m.part('tape', panel(W - 0.003, 0.003, tape, 0, H - 0.003, 0, 0.0005));
  for (const s of [-1, 1]) m.part('tape', panel(0.003, H * 0.25, tape, s * (W / 2 - 0.0015), H * 0.75 - 0.003, 0, 0.0005));
  // Hand holes in the sides.
  for (const s of [-1, 1]) m.fixed('#5b4a37', rbox(Math.min(0.12, W * 0.3), 0.035, 0.004, 0.012, 0, H * 0.72, s * (D / 2 - 0.0035), 3));
  return m.build();
}

/** Pedal bin: a soft rounded body, domed lid with a rim, hinge and pedal. */
export function buildBin(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const pedal = Math.min(0.06, D * 0.18);
  const bodyD = D - pedal;
  const r = Math.min(W, bodyD) / 2;
  const lidH = Math.min(0.06, H * 0.1);
  const zc = -D / 2 + bodyD / 2;
  const sx = W / 2 / r;
  const sz = bodyD / 2 / r;
  const bodyTop = H - lidH;
  const body = lathe([[0, 0.012], [r * 0.9, 0.012], [r * 0.97, 0.02], [r, 0.05], [r, bodyTop - 0.012], [r * 0.99, bodyTop]], 0, 0, 0, 40);
  m.part('body', body.scale(sx, 1, sz).translate(0, 0, zc));
  const lid = lathe([[r * 1.0, 0], [r * 1.0, 0.012], [r * 0.85, lidH * 0.6], [r * 0.5, lidH * 0.93], [0, lidH]], 0, 0, 0, 40);
  m.part('body', lid.scale(sx, 1, sz).translate(0, bodyTop, zc));
  m.part('trim', lathe([[r * 0.985, 0], [r * 1.0, 0], [r * 1.0, 0.014], [r * 0.985, 0.014]], 0, bodyTop - 0.004, 0, 40).scale(sx, 1, sz).translate(0, 0, zc));
  m.part('trim', lathe([[0, 0], [r * 0.95, 0], [r, 0.006], [r * 0.97, 0.014], [0, 0.014]], 0, 0, 0, 40).scale(sx, 1, sz).translate(0, 0, zc));
  // Hinge at the back, pedal at the front.
  m.part('trim', rbox(W * 0.3, 0.02, 0.03, 0.006, 0, bodyTop - 0.012, -D / 2 + 0.015, 2));
  m.part('trim', rbox(Math.min(0.16, W * 0.5), 0.014, pedal + 0.02, 0.005, 0, 0.012, D / 2 - (pedal + 0.02) / 2, 2));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const STORAGE_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  storageCase: buildCase,
  storageShelfRack: buildShelfRack,
  storageWallShelf: buildWallShelf,
  storageCoatStand: buildCoatStand,
  storageCoatRack: buildCoatRack,
  storageBox: buildBox,
  storageBin: buildBin,
};
