/**
 * Premium generators: office. Desks, the task chair, a filing pedestal and the
 * desk-top pieces (monitor, laptop, keyboard). See `beds.ts` for the
 * conventions; shared parts live in `seating.parts.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, box, cyl, param, rbox, slab, type BuildContext } from './kit';
import { Parts, beam, clamp, placeBox, rod, softBox } from './seating.parts';
import { slabTop } from './tables';

/* -------------------------------------------------------------------- slots */

export const DESK_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top', kind: 'wood', default: 'wood.oak' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
];
export const TASK_CHAIR_SLOTS: FinishSlot[] = [
  { id: 'seat', label: 'Seat and back', kind: 'fabric', default: 'fabric.weave.charcoal' },
  { id: 'frame', label: 'Frame and arms', kind: 'metal', default: 'metal.black' },
  { id: 'base', label: 'Base', kind: 'metal', default: 'metal.steel' },
];
export const MONITOR_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.black' },
  { id: 'stand', label: 'Stand', kind: 'metal', default: 'metal.steel' },
];
export const LAPTOP_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.steel' },
  { id: 'keys', label: 'Keys', kind: 'lacquer', default: 'lacquer.graphite' },
];
export const KEYBOARD_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.steel' },
  { id: 'keys', label: 'Keys', kind: 'lacquer', default: 'lacquer.white' },
];
export const PEDESTAL_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'lacquer', default: 'lacquer.white' },
  { id: 'top', label: 'Top', kind: 'wood', default: 'wood.oak' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.black' },
];

const GLIDE = '#1a1a1a';
const SCREEN = 'lacquer.black.gloss';

/* --------------------------------------------------------------------- desk */

/**
 * A desk used from +Z: a timber top with a cable grommet on two black steel
 * frames, a slim drawer, a cable tray at the back and a modesty panel.
 * `corner: 'left' | 'right'`: an L-shaped desk whose return runs forward on
 * that side, `depth` in mm for its arms (default 700).
 */
export function buildWorkDesk(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const corner = param<'left' | 'right' | 'none'>(entry, 'corner', 'none');
  const p = new Parts(m, corner === 'right');
  const topT = 0.026;
  const under = H - topT;
  const bar = 0.05;
  const barT = 0.022;
  const inset = 0.05;

  /** A steel end frame standing in the YZ plane at x, from z0 to z1. */
  const frameX = (x: number, z0: number, z1: number) => {
    for (const z of [z0 + barT / 2, z1 - barT / 2]) p.part('frame', rbox(bar * 0.6, under, barT, 0.004, x, 0, z, 1));
    p.part('frame', rbox(bar * 0.6, barT, z1 - z0, 0.004, x, under - barT, (z0 + z1) / 2, 1));
    p.part('frame', rbox(bar * 0.6, barT, z1 - z0, 0.004, x, 0.004, (z0 + z1) / 2, 1));
    for (const z of [z0 + 0.04, z1 - 0.04]) p.fixed(GLIDE, rbox(bar * 0.6, 0.006, 0.05, 0.002, x, 0, z, 1));
  };
  /** The same in the XY plane at z, from x0 to x1. */
  const frameZ = (z: number, x0: number, x1: number) => {
    for (const x of [x0 + barT / 2, x1 - barT / 2]) p.part('frame', rbox(barT, under, bar * 0.6, 0.004, x, 0, z, 1));
    p.part('frame', rbox(x1 - x0, barT, bar * 0.6, 0.004, (x0 + x1) / 2, under - barT, z, 1));
    p.part('frame', rbox(x1 - x0, barT, bar * 0.6, 0.004, (x0 + x1) / 2, 0.004, z, 1));
    for (const x of [x0 + 0.04, x1 - 0.04]) p.fixed(GLIDE, rbox(0.05, 0.006, bar * 0.6, 0.002, x, 0, z, 1));
  };
  const grommet = (x: number, z: number) => {
    p.part('frame', new THREE.TorusGeometry(0.03, 0.0035, 6, 24).rotateX(Math.PI / 2).translate(x, H - 0.0035, z));
    p.fixed(GLIDE, cyl(0.029, 0.029, 0.003, x, H - 0.005, z, 'y', 24));
  };
  const drawer = (x: number, z: number, w: number) => {
    const dh = 0.075;
    p.part('top', rbox(w, dh, 0.42, 0.004, x, under - dh, z - 0.21, 1));
    // Front with a finger groove along its underside.
    p.part('top', rbox(w + 0.004, dh - 0.016, 0.018, 0.004, x, under - dh + 0.014, z + 0.009, 2));
    p.fixed(GLIDE, rbox(w - 0.04, 0.006, 0.012, 0.002, x, under - dh + 0.006, z + 0.006, 1));
  };

  if (corner === 'none') {
    p.part('top', slabTop(W, D, 0.01, topT, H, 0.004));
    frameX(-W / 2 + inset, -D / 2 + 0.04, D / 2 - 0.06);
    frameX(W / 2 - inset, -D / 2 + 0.04, D / 2 - 0.06);
    // Modesty panel and cable tray at the back.
    p.part('frame', rbox(W - 2 * inset - 0.04, 0.26, 0.006, 0.002, 0, under - 0.3, -D / 2 + 0.08, 1));
    p.part('frame', rbox(W * 0.5, 0.06, 0.12, 0.004, -W * 0.08, under - 0.075, -D / 2 + 0.16, 1));
    drawer(W / 2 - inset - 0.25, D / 2 - 0.06, 0.4);
    grommet(-W / 2 + 0.22, -D / 2 + 0.09);
    return p.build();
  }
  // L-shaped: the main top along the back, the return forward on the left (mirrored for the right).
  const dd = clamp(param<number>(entry, 'depth', 700) / 1000, 0.5, Math.min(W, D) * 0.6);
  // Shape coordinates are (x, -z), inset by the bevel so the top keeps to its outline.
  const b = 0.004;
  const xo = W / 2 - b;
  const zo = D / 2 - b;
  const xi = -W / 2 + dd - b;
  const zi = -D / 2 + dd - b;
  const f = 0.09; // the inner corner is cut on a curve
  const s = new THREE.Shape();
  s.moveTo(-xo, zo);
  s.lineTo(xo, zo);
  s.lineTo(xo, -zi);
  s.lineTo(xi + f, -zi);
  s.quadraticCurveTo(xi, -zi, xi, -(zi + f));
  s.lineTo(xi, -zo);
  s.lineTo(-xo, -zo);
  s.closePath();
  p.part('top', slab(s, topT, 0, under, 0, b));
  frameX(W / 2 - inset, -D / 2 + 0.04, -D / 2 + dd - 0.06);
  frameZ(D / 2 - inset, -W / 2 + 0.04, -W / 2 + dd - 0.06);
  // Corner post and back panels.
  p.part('frame', rbox(0.05, under, 0.05, 0.006, -W / 2 + 0.06, 0, -D / 2 + 0.06, 1));
  p.fixed(GLIDE, rbox(0.05, 0.006, 0.05, 0.002, -W / 2 + 0.06, 0, -D / 2 + 0.06, 1));
  p.part('frame', rbox(W - dd - inset - 0.06, 0.26, 0.006, 0.002, (-W / 2 + dd + W / 2 - inset) / 2 - 0.02, under - 0.3, -D / 2 + 0.08, 1));
  p.part('frame', rbox(0.006, 0.26, D - dd - inset - 0.06, 0.002, -W / 2 + 0.08, under - 0.3, (-D / 2 + dd + D / 2 - inset) / 2 - 0.02, 1));
  drawer(W / 2 - inset - 0.25, -D / 2 + dd - 0.06, 0.4);
  grommet(-W / 2 + 0.16, -D / 2 + 0.16);
  return p.build();
}

/* --------------------------------------------------------------- task chair */

/**
 * An office task chair facing +Z: five-star base on twin-wheel castors, gas
 * lift in a shroud, tilt mechanism with its lever, a contoured upholstered seat
 * with a waterfall front, a lumbar-curved back on a steel spine, T-arms.
 */
export function buildTaskChair(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const seatY = clamp(H * 0.44, 0.42, 0.52); // top of the seat
  const wheel = 0.026;
  const baseR = Math.min(W, D) / 2 - 0.035;
  const hubY = 0.085;

  // Five-star base.
  p.part('base', cyl(0.045, 0.05, 0.065, 0, hubY - 0.035, 0, 'y', 20));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const len = baseR;
    const g = rbox(0.044, 0.03, len, 0.01, 0, -0.015, len / 2, 2);
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const f = 1 - 0.32 * clamp(pos.getZ(k) / len, 0, 1);
      pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k));
    }
    g.rotateX(0.07).translate(0, hubY, 0).rotateY(a);
    p.part('base', g);
    // Twin-wheel castor under the tip.
    const tx = Math.sin(a) * (len - 0.02);
    const tz = Math.cos(a) * (len - 0.02);
    p.fixed(GLIDE, cyl(wheel, wheel, 0.034, 0, 0, 0, 'x', 14).rotateY(a + Math.PI / 2).translate(tx, wheel, tz));
    p.part('frame', rbox(0.03, 0.022, 0.03, 0.006, tx, wheel + 0.006, tz, 1));
  }
  // Gas lift.
  const mechY = seatY - 0.13;
  p.part('frame', cyl(0.03, 0.032, 0.17, 0, hubY + 0.01, 0, 'y', 16));
  p.fixed('metal.chrome', cyl(0.016, 0.016, mechY - hubY - 0.15, 0, hubY + 0.17, 0, 'y', 12));
  // Mechanism and lever.
  p.part('frame', rbox(0.2, 0.05, 0.24, 0.012, 0, mechY, 0.02, 2));
  p.part('frame', rod([0.09, mechY + 0.02, 0.08], [0.17, mechY + 0.01, 0.12], 0.006, 8));
  p.part('frame', new THREE.SphereGeometry(0.012, 10, 8).translate(0.17, mechY + 0.01, 0.12));
  // Seat: contoured cushion with a rolled front edge.
  const sw = W * 0.78;
  const sd = D * 0.8;
  const seatZ = D / 2 - sd / 2 - 0.002;
  p.part('frame', rbox(sw * 0.92, 0.02, sd * 0.9, 0.008, 0, mechY + 0.05, seatZ, 1));
  const seat = softBox(sw, 0.075, sd, 0, 0, 0, 0.22, 0.035, 2);
  const pos = seat.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // Waterfall: the front edge rolls down; the sides lift a little.
    const z = pos.getZ(i) / (sd / 2);
    const x = pos.getX(i) / (sw / 2);
    pos.setY(i, pos.getY(i) - Math.max(0, z - 0.6) ** 2 * 0.09 + x * x * 0.012);
  }
  seat.computeVertexNormals();
  p.part('seat', placeBox(seat, { cx: 0, maxY: seatY, maxZ: D / 2 }));
  // Spine and back with a lumbar curve.
  const backW = W * 0.7;
  const backH = (H - seatY) * 0.86;
  const back = softBox(backW, 0.06, backH, 0, 0, 0, 0.25, 0.04, 2).rotateX(Math.PI / 2);
  const bp = back.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i) / (backW / 2);
    const y = bp.getY(i) / (backH / 2); // -1 bottom .. 1 top
    // Wraps round the sitter and pushes forward at the lumbar.
    bp.setZ(i, bp.getZ(i) + x * x * 0.035 * -1 + Math.exp(-((y + 0.35) ** 2) * 6) * 0.025);
  }
  back.computeVertexNormals();
  back.rotateX(-0.12);
  placeBox(back, { cx: 0, maxY: H, minZ: -D / 2 });
  back.computeBoundingBox();
  const bb = back.boundingBox!;
  p.part('seat', back);
  const spineZ = bb.min.z + 0.02;
  p.part('frame', beam([0, mechY + 0.02, -0.08], [0, mechY + 0.02, spineZ + 0.01], 0.06, 0.02, 0.006, 1));
  p.part('frame', beam([0, mechY + 0.02, spineZ], [0, bb.min.y + backH * 0.45, spineZ + 0.01], 0.06, 0.022, 0.008, 1));
  // T-arms.
  const armY = seatY + 0.2;
  const ax = W / 2 - 0.035;
  for (const s of [-1, 1]) {
    p.part('frame', rbox(0.07, 0.026, 0.26, 0.012, s * ax, armY - 0.026, seatZ - 0.03, 2));
    p.part('frame', rbox(0.03, armY - mechY - 0.05, 0.05, 0.008, s * (ax - 0.005), mechY + 0.03, seatZ - 0.05, 1));
    p.part('frame', rbox(ax - 0.06, 0.02, 0.05, 0.006, s * (ax / 2 + 0.01), mechY + 0.03, seatZ - 0.05, 1));
  }
  return p.build();
}

/* ------------------------------------------------------------ desk-top kit */

/** A monitor on a stand: slim bezel, a gloss screen, a rear housing, neck and a flat foot. */
export function buildMonitorScreen(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const hs = Math.min(H * 0.8, W * 0.6);
  const sy = H - hs;
  const t = 0.014;
  const sz = -D / 2 + D * 0.42; // front face of the panel
  p.part('body', rbox(W, hs, t, 0.004, 0, sy, sz - t / 2, 2));
  p.fixed(SCREEN, rbox(W - 0.014, hs - 0.03, 0.002, 0.001, 0, sy + 0.022, sz + 0.0005, 1));
  p.part('body', rbox(W * 0.55, hs * 0.55, 0.03, 0.012, 0, sy + hs * 0.25, sz - t - 0.012, 2));
  // Stand.
  const neckZ = sz - t - 0.035;
  p.part('stand', beam([0, 0.01, neckZ + 0.02], [0, sy + hs * 0.45, neckZ], 0.05, 0.018, 0.006, 1));
  p.part('stand', rbox(Math.min(W * 0.36, 0.26), 0.012, D, 0.006, 0, 0, 0, 2));
  return p.build();
}

/** An open laptop: aluminium body, keys and a trackpad, the lid leaning back with a gloss screen. */
export function buildLaptopComputer(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const baseT = 0.016;
  const lean = 0.3;
  const lidT = 0.007;
  const L = (H - baseT) / Math.cos(lean) - lidT * Math.sin(lean);
  const back = L * Math.sin(lean) + lidT;
  const bd = D - back; // base depth
  const bz = D / 2 - bd / 2;
  p.part('body', rbox(W, baseT, bd, 0.006, 0, 0, bz, 2));
  // Keyboard well and keys.
  const kw = W * 0.86;
  const rows = 6;
  const cols = 14;
  const u = kw / cols;
  const kz0 = D / 2 - bd + 0.015;
  for (let r = 0; r < rows; r++) {
    const kh = r === 0 ? u * 0.5 : u * 0.86;
    const zc = kz0 + r * u * 0.95 + kh / 2;
    if (r === rows - 1) {
      p.part('keys', box(u * 5.5, 0.0015, kh, 0, baseT, zc));
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) p.part('keys', box(u * 0.86, 0.0015, kh, s * (u * 3.2 + i * u), baseT, zc));
      continue;
    }
    for (let c = 0; c < cols; c++) p.part('keys', box(u * 0.86, 0.0015, kh, -kw / 2 + u * (c + 0.5), baseT, zc));
  }
  p.fixed(SCREEN, box(W * 0.36, 0.0008, bd * 0.3, 0, baseT, D / 2 - bd * 0.17));
  // Lid.
  const lid = rbox(W, L, lidT, 0.004, 0, 0, -lidT / 2, 2);
  lid.rotateX(-lean);
  placeBox(lid, { cx: 0, maxY: H, minZ: -D / 2 });
  p.part('body', lid);
  const scr = box(W - 0.02, L - 0.03, 0.001, 0, 0.012, 0.0005).rotateX(-lean);
  lid.computeBoundingBox();
  const lb = lid.boundingBox!;
  placeBox(scr, { cx: 0, minY: lb.min.y + 0.012 * Math.cos(lean), maxZ: lb.max.z + 0.0004 });
  p.fixed(SCREEN, scr);
  return p.build();
}

/** A low-profile keyboard: an aluminium plate with a slight wedge and a full grid of keys. */
export function buildComputerKeyboard(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const keyH = Math.min(0.008, H * 0.35);
  const bodyH = H - keyH;
  const g = rbox(W, bodyH, D, Math.min(0.008, bodyH / 2), 0, 0, 0, 2);
  // Wedge: lower at the front.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const f = 0.55 + 0.45 * (0.5 - pos.getZ(i) / D);
    pos.setY(i, pos.getY(i) * f);
  }
  g.computeVertexNormals();
  p.part('body', g);
  // A raised strip along the back edge.
  p.part('body', rbox(W - 0.004, keyH + 0.004, 0.012, 0.004, 0, bodyH - 0.004, -D / 2 + 0.008, 2));
  const cols = 15;
  const rows = 6;
  const margin = 0.012;
  const u = (W - 2 * margin) / (cols + 3.5);
  const rowsD = D - 2 * margin;
  for (let r = 0; r < rows; r++) {
    const zc = -D / 2 + margin + (rowsD / rows) * (r + 0.5);
    const yTop = bodyH * (0.55 + 0.45 * (0.5 - zc / D));
    const kd = (rowsD / rows) * 0.82;
    const y = H - keyH - (bodyH - yTop);
    const keyAt = (x: number, w: number) => p.part('keys', box(w, keyH, kd, x, y, zc));
    if (r === rows - 1) {
      keyAt(-W / 2 + margin + u * 7.5, u * 6.2);
      for (const x of [0.6, 1.6, 2.6, 11.4, 12.4, 13.4, 14.4]) keyAt(-W / 2 + margin + u * x, u * 0.9);
    } else {
      for (let c = 0; c < cols; c++) keyAt(-W / 2 + margin + u * (c + 0.5), u * 0.9);
    }
    // Number pad.
    for (let c = 0; c < 3; c++) keyAt(W / 2 - margin - u * (c + 0.5), u * 0.9);
  }
  return p.build();
}

/* ----------------------------------------------------------- filing pedestal */

/**
 * A filing pedestal: a lacquered carcass on a recessed plinth, two shallow
 * drawers over a deep file drawer, bar pulls, and a timber top.
 */
export function buildFilingPedestal(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const topT = 0.022;
  const plinth = 0.04;
  const pull = 0.03;
  const front = D / 2 - pull; // drawer fronts' outer face
  const carcD = front - 0.018 + D / 2;
  p.part('top', slabTop(W, D - pull, 0.006, topT, H, 0.003).translate(0, 0, -pull / 2));
  p.part('body', rbox(W - 0.004, H - topT - plinth, carcD, 0.004, 0, plinth, -D / 2 + carcD / 2, 2));
  p.fixed(GLIDE, rbox(W - 0.06, plinth + 0.002, carcD - 0.06, 0.004, 0, 0, -D / 2 + carcD / 2, 1));
  const avail = H - topT - plinth - 0.012;
  const hs = [0.27, 0.27, 0.46].map((f) => f * avail);
  let y = H - topT - 0.006;
  for (const h of hs) {
    y -= h;
    p.part('body', rbox(W - 0.012, h - 0.006, 0.018, 0.004, 0, y + 0.003, front - 0.009, 2));
    const pw = Math.min(0.16, W * 0.4);
    const py = y + h - 0.05;
    p.part('handles', rod([-pw / 2, py, front + pull - 0.008], [pw / 2, py, front + pull - 0.008], 0.006, 10));
    for (const s of [-1, 1]) p.part('handles', rod([s * (pw / 2 - 0.008), py, front], [s * (pw / 2 - 0.008), py, front + pull - 0.008], 0.005, 8));
  }
  return p.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const OFFICE_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  workDesk: buildWorkDesk,
  taskChair: buildTaskChair,
  monitorScreen: buildMonitorScreen,
  laptopComputer: buildLaptopComputer,
  computerKeyboard: buildComputerKeyboard,
  filingPedestal: buildFilingPedestal,
};
