/**
 * Premium generators: appliances. Refrigerators, hobs, ranges, built-in ovens,
 * hoods, microwave and dishwasher (this file); laundry, screens, climate and
 * small appliances in `appliances.home.ts`; shared slots and parts in
 * `appliances.parts.ts`.
 *
 * Appliances read as real products through their details: door seams with a
 * dark gasket behind the gap, bar or recessed handles, control panels with a
 * lit display and knobs or touch zones, kick plates, feet and vents. Nothing
 * carries a brand. Bodies default to brushed steel, handles to polished chrome.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { CAST, DISPLAY, GASKET, GLOSS, STEEL, barPull, display, door, feet, knob } from './appliances.parts';
import { HOME_APPLIANCE_GENERATORS } from './appliances.home';
import { K, frontGrid, plinth, sidePanel, worktop, type Handles, type Row } from './kitchen';
import { annulus, disc, sweep } from './kitchen.kit';
import { Model, box, cyl, lathe, param, rbox, type BuildContext } from './kit';

export * from './appliances.parts';

const { PI } = Math;

/* ---------------------------------------------------------------- fridges */

/**
 * Freestanding refrigerator: cabinet, insulated doors on a dark gasket, bar
 * handles, a vented kick plate and feet. `doors` 'single' | 'topfreezer' |
 * 'sidebyside' (freezer on the left with an ice and water dispenser) |
 * 'mini' (a recessed pull instead of a bar).
 */
export function buildFridge(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const type = param<'single' | 'topfreezer' | 'sidebyside' | 'mini'>(entry, 'doors', 'single');
  const mini = type === 'mini';
  const proj = mini ? 0 : 0.04;
  const face = D / 2 - proj;
  const doorT = Math.min(0.06, D * 0.1);
  const foot = 0.012;
  const kick = Math.min(0.085, H * 0.07);
  const cabFront = face - doorT - 0.004;
  const gap = 0.004;
  m.part('body', rbox(W, H - foot, cabFront + D / 2, 0.012, 0, foot, (cabFront - D / 2) / 2, 3));
  feet(m, W, D - proj, foot + 0.002, -proj / 2);
  // Kick plate: a dark vent with slats.
  m.fixed(GASKET, rbox(W - 0.04, kick - foot - 0.008, 0.012, 0.003, 0, foot + 0.004, cabFront + 0.006, 1));
  const slats = Math.max(3, Math.round(W / 0.08));
  for (let i = 0; i < slats; i++) {
    const x = -W / 2 + 0.04 + ((W - 0.08) * (i + 0.5)) / slats;
    m.part('body', rbox((W - 0.08) / slats - 0.012, kick - foot - 0.024, 0.006, 0.0015, x, foot + 0.012, cabFront + 0.012, 1));
  }
  const y0 = kick;
  const y1 = H - 0.002;
  const half = gap / 2;
  if (type === 'sidebyside') {
    const xs = -W / 2 + W * 0.42;
    door(m, 'body', -W / 2 + 0.002, xs - half, y0, y1, face, doorT);
    door(m, 'body', xs + half, W / 2 - 0.002, y0, y1, face, doorT);
    const hl = Math.min(0.9, (y1 - y0) * 0.5);
    const hy = y0 + (y1 - y0) * 0.55;
    barPull(m, 'handles', xs - 0.045, hy, hl, face, true, proj);
    barPull(m, 'handles', xs + 0.045, hy, hl, face, true, proj);
    // Ice and water dispenser: a dark recess framed in steel, a paddle and a display above it.
    const dx = -W / 2 + W * 0.21 - 0.01;
    const dw = Math.min(0.2, W * 0.24);
    const dh = Math.min(0.32, H * 0.18);
    const dy = y0 + (y1 - y0) * 0.5;
    m.part('handles', rbox(dw + 0.02, dh + 0.02, 0.004, 0.006, dx, dy - 0.01, face + 0.001, 2));
    m.fixed(GASKET, rbox(dw, dh, 0.004, 0.005, dx, dy, face + 0.003, 2));
    m.part('handles', rbox(dw * 0.4, dh * 0.4, 0.006, 0.004, dx, dy + dh * 0.45, face + 0.005, 2));
    m.part('handles', rbox(dw * 0.7, 0.01, 0.02, 0.003, dx, dy + 0.012, face + 0.01, 2));
    display(m, dx, dy + dh + 0.06, face, dw * 0.8, 0.045, 3);
  } else if (type === 'topfreezer') {
    const ys = y0 + (y1 - y0) * 0.7;
    door(m, 'body', -W / 2 + 0.002, W / 2 - 0.002, ys + half, y1, face, doorT);
    door(m, 'body', -W / 2 + 0.002, W / 2 - 0.002, y0, ys - half, face, doorT);
    const hx = W / 2 - 0.06;
    barPull(m, 'handles', hx, ys + 0.03 + Math.min(0.2, (y1 - ys) * 0.4) / 2, Math.min(0.2, (y1 - ys) * 0.4), face, true, proj);
    barPull(m, 'handles', hx, ys - 0.03 - Math.min(0.4, (ys - y0) * 0.4) / 2, Math.min(0.4, (ys - y0) * 0.4), face, true, proj);
  } else {
    door(m, 'body', -W / 2 + 0.002, W / 2 - 0.002, y0, y1, face, doorT);
    if (mini) {
      // A recessed pull along the opening edge and a worktop-style top.
      m.fixed(GASKET, rbox(0.02, (y1 - y0) * 0.5, 0.004, 0.002, W / 2 - 0.03, y0 + (y1 - y0) * 0.42, face - 0.0015, 1));
      m.part('handles', rbox(0.014, (y1 - y0) * 0.5 - 0.01, 0.003, 0.002, W / 2 - 0.03, y0 + (y1 - y0) * 0.42 + 0.005, face + 0.0005, 1));
    } else {
      const hl = Math.min(0.45, (y1 - y0) * 0.38);
      barPull(m, 'handles', W / 2 - 0.06, y0 + (y1 - y0) * 0.62, hl, face, true, proj);
    }
  }
  return m.build();
}

/* ------------------------------------------------------------------- hobs */

interface Burner {
  x: number;
  z: number;
  r: number;
  wok?: boolean;
}

/** Burner positions and the cells of the pan-support grid around them. */
function burnerLayout(W: number, za: number, zb: number, n: number): { burners: Burner[]; cells: { x0: number; x1: number; z0: number; z1: number }[] } {
  const xa = -W / 2 + 0.03;
  const xb = W / 2 - 0.03;
  const cols = n <= 2 ? 1 : n === 5 ? 3 : 2;
  const cw = (xb - xa) / cols;
  const zm = (za + zb) / 2;
  const burners: Burner[] = [];
  const cells: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const sizes = [1, 0.75, 0.85, 1.05];
  let k = 0;
  for (let c = 0; c < cols; c++) {
    const x0 = xa + cw * c;
    const x1 = x0 + cw;
    if (n === 5 && c === 1) {
      cells.push({ x0, x1, z0: za, z1: zb });
      burners.push({ x: (x0 + x1) / 2, z: zm, r: Math.min(cw, zb - za) * 0.27, wok: true });
      continue;
    }
    for (const [z0, z1] of [
      [za, zm],
      [zm, zb],
    ] as const) {
      cells.push({ x0, x1, z0, z1 });
      burners.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.min(cw, z1 - z0) * 0.22 * sizes[k++ % 4]! });
    }
  }
  return { burners, cells };
}

/**
 * Draws a hob on a plate whose underside is at y0: `n` burners with
 * enamelled caps on steel crowns under cast-iron supports, knobs along the
 * front; or an induction top with printed zones and touch controls. The top
 * of the tallest part is at y0 + h. Slot names are given by the caller.
 */
function hobTop(
  m: Model,
  o: { W: number; D: number; y0: number; h: number; n: number; induction: boolean; top: string; supports: string | null; knobs: string; z?: number },
): void {
  const { W, D, y0, h } = o;
  const zc = o.z ?? 0;
  if (o.induction) {
    const pt = h - 0.0003;
    m.part(o.top, rbox(W - 0.008, pt, D - 0.008, Math.min(0.003, pt / 2), 0, y0, zc, 2));
    // A slim steel bevel frame round the glass.
    for (const s of [-1, 1]) {
      m.part(o.knobs, rbox(0.006, pt - 0.001, D, 0.002, s * (W / 2 - 0.003), y0, zc, 1));
      m.part(o.knobs, rbox(W, pt - 0.001, 0.006, 0.002, 0, y0, zc + s * (D / 2 - 0.003), 1));
    }
    const top = y0 + pt;
    const zones: [number, number, number][] = [
      [-W * 0.24, D * 0.16, Math.min(W, D) * 0.2],
      [-W * 0.24, -D * 0.22, Math.min(W, D) * 0.15],
      [W * 0.24, D * 0.18, Math.min(W, D) * 0.15],
      [W * 0.24, -D * 0.16, Math.min(W, D) * 0.2],
    ];
    for (const [x, z, r] of zones) {
      m.fixed('metal.white', annulus(r, r - 0.0018, 0.0003, x, top, zc + z, 48));
      m.fixed('metal.white', annulus(r * 0.55, r * 0.55 - 0.0012, 0.0003, x, top, zc + z, 36));
    }
    // Touch slider and keys at the front centre.
    const fz = zc + D / 2 - 0.035;
    m.fixed('metal.white', box(W * 0.28, 0.0003, 0.004, 0, top, fz));
    for (let i = 0; i < 4; i++) m.fixed('metal.white', disc(0.006, 0.0003, -W * 0.3 + i * 0.028, top, fz, 14));
    m.fixed('#ff5a3c', disc(0.004, 0.0003, W * 0.3, top, fz, 12));
    return;
  }
  const plateT = Math.min(0.006, h * 0.12);
  m.part(o.top, rbox(W, plateT, D, plateT * 0.45, 0, y0, zc, 2));
  const p = y0 + plateT;
  const za = zc - D / 2 + 0.03;
  const zb = zc + D / 2 - 0.075;
  const { burners, cells } = burnerLayout(W, za, zb, o.n);
  const bh = Math.min(0.024, (h - plateT) * 0.48);
  for (const b of burners) {
    const rings = b.wok ? [b.r, b.r * 0.55] : [b.r];
    m.fixed(STEEL, lathe([[0, 0], [b.r * 1.08, 0], [b.r * 1.08, bh * 0.3], [b.r, bh * 0.5], [b.r * 0.35, bh * 0.5]], b.x, p, b.z, 32));
    for (const r of rings) {
      m.fixed(STEEL, lathe([[r * 0.72, bh * 0.5], [r * 0.8, bh * 0.72], [r * 0.74, bh * 0.76], [r * 0.6, bh * 0.76]], b.x, p, b.z, 32));
    }
    m.fixed(CAST, lathe([[0, bh * 0.72], [rings[rings.length - 1]! * 0.62, bh * 0.72], [rings[rings.length - 1]! * 0.6, bh * 0.92], [rings[rings.length - 1]! * 0.3, bh], [0, bh]], b.x, p, b.z, 28));
  }
  // Cast-iron supports: a grid along the cell edges, fingers reaching in towards each burner, feet on the glass.
  const sup = o.supports ?? CAST;
  const put = (g: THREE.BufferGeometry) => (o.supports ? m.part(sup, g) : m.fixed(sup, g));
  const bar = 0.009;
  const yTop = y0 + h;
  for (const c of cells) {
    put(rbox(c.x1 - c.x0, bar, bar, 0.003, (c.x0 + c.x1) / 2, yTop - bar, c.z0, 2));
    put(rbox(c.x1 - c.x0, bar, bar, 0.003, (c.x0 + c.x1) / 2, yTop - bar, c.z1, 2));
    put(rbox(bar, bar, c.z1 - c.z0, 0.003, c.x0, yTop - bar, (c.z0 + c.z1) / 2, 2));
    put(rbox(bar, bar, c.z1 - c.z0, 0.003, c.x1, yTop - bar, (c.z0 + c.z1) / 2, 2));
    const b = burners.find((q) => q.x > c.x0 && q.x < c.x1 && q.z > c.z0 && q.z < c.z1)!;
    const gapR = b.r * 1.15;
    const lx = (c.x1 - c.x0) / 2 - gapR;
    const lz = (c.z1 - c.z0) / 2 - gapR;
    if (lx > 0.01) for (const s of [-1, 1]) put(rbox(lx, bar, bar * 0.8, 0.003, b.x + s * (gapR + lx / 2), yTop - bar, b.z, 2));
    if (lz > 0.01) for (const s of [-1, 1]) put(rbox(bar * 0.8, bar, lz, 0.003, b.x, yTop - bar, b.z + s * (gapR + lz / 2), 2));
  }
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) for (const z of [za, zb]) put(cyl(0.006, 0.006, h - plateT - bar + 0.001, x, p, z, 'y', 10));
  // Knobs along the front edge, one per burner.
  const kz = zc + D / 2 - 0.038;
  const kn = burners.length;
  const kr = Math.min(0.019, W / (kn * 4));
  const kh = Math.min(0.026, h - plateT);
  const order = [...burners].sort((a, b) => a.x - b.x || a.z - b.z);
  order.forEach((b, i) => {
    const x = kn === 1 ? 0 : -W / 2 + 0.06 + ((W - 0.12) * i) / (kn - 1);
    const kx = W < 0.4 ? (i - (kn - 1) / 2) * kr * 3 : x;
    m.part(o.knobs, cyl(kr * 1.15, kr * 1.2, 0.004, kx, p, kz, 'y', 24));
    m.part(o.knobs, cyl(kr * 0.92, kr, kh - 0.004, kx, p + 0.004, kz, 'y', 24));
    m.fixed(CAST, box(kr * 0.25, 0.001, kr * 1.4, kx, p + kh - 0.0005, kz));
    void b;
  });
}

/**
 * Hob that sits on the worktop. Params: `burners` 2 | 4 | 5 (gas), `type`
 * 'gas' | 'induction'.
 */
export function buildHob(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const induction = param<'gas' | 'induction'>(entry, 'type', 'gas') === 'induction';
  hobTop(m, { W, D, y0: 0, h: H, n: param(entry, 'burners', 4), induction, top: 'top', supports: induction ? null : 'supports', knobs: 'controls' });
  return m.build();
}

/* ------------------------------------------------------------ oven inserts */

/**
 * A built-in oven filling (x, y0, w, h) with its frame face at z: a steel
 * control strip with knobs and a display, and a black glass door with a
 * window and a bar handle proud of z by up to `proj`.
 */
export function ovenInsert(m: Model, x: number, y0: number, w: number, h: number, z: number, proj = 0.019): void {
  const strip = Math.min(0.095, h * 0.17);
  m.fixed(STEEL, rbox(w, h, 0.012, 0.003, x, y0, z - 0.006, 2));
  // Control strip.
  for (const s of [-1, 1]) knob(m, `mat:${GLOSS}`, x + s * w * 0.33, y0 + h - strip / 2, z, Math.min(0.018, strip * 0.22), 0.016);
  display(m, x, y0 + h - strip / 2 + 0.014, z, Math.min(0.14, w * 0.25), 0.03, 4);
  // Door: black glass, a dark window, a steel bar handle on stand-offs.
  const dy1 = y0 + h - strip - 0.004;
  m.fixed(GLOSS, rbox(w - 0.008, dy1 - y0 - 0.006, 0.006, 0.002, x, y0 + 0.004, z + 0.003, 1));
  m.fixed(GASKET, rbox(w * 0.72, (dy1 - y0) * 0.5, 0.002, 0.012, x, y0 + (dy1 - y0) * 0.22, z + 0.0065, 2));
  const handleY = dy1 - 0.035;
  m.fixed(STEEL, rbox(w * 0.8, 0.014, 0.014, 0.006, x, handleY - 0.007, z + proj - 0.007, 2));
  for (const s of [-1, 1]) m.fixed(STEEL, cyl(0.005, 0.005, proj - 0.012, x + s * w * 0.36, handleY, z + 0.006 + (proj - 0.014) / 2, 'z', 10));
}

/** A built-in microwave filling (x, y0, w, h), face at z: black glass door with a window, controls on the right. */
export function microwaveInsert(m: Model, x: number, y0: number, w: number, h: number, z: number): void {
  m.fixed(STEEL, rbox(w, h, 0.012, 0.003, x, y0, z - 0.006, 2));
  const cw = Math.min(0.13, w * 0.24);
  const dx1 = x + w / 2 - cw - 0.008;
  const dx0 = x - w / 2 + 0.01;
  m.fixed(GLOSS, rbox(dx1 - dx0, h - 0.02, 0.006, 0.002, (dx0 + dx1) / 2, y0 + 0.01, z + 0.003, 1));
  m.fixed(GASKET, rbox((dx1 - dx0) * 0.7, (h - 0.02) * 0.62, 0.002, 0.01, (dx0 + dx1) / 2 - 0.02, y0 + h * 0.2, z + 0.0065, 2));
  m.fixed(GLOSS, rbox(cw, h - 0.02, 0.004, 0.002, x + w / 2 - cw / 2 - 0.006, y0 + 0.01, z + 0.002, 1));
  display(m, x + w / 2 - cw / 2 - 0.006, y0 + h * 0.78, z + 0.004, cw * 0.75, 0.024, 4);
  knob(m, `mat:${STEEL}`, x + w / 2 - cw / 2 - 0.006, y0 + h * 0.42, z + 0.004, Math.min(0.02, cw * 0.18), 0.014, GLOSS);
}

/**
 * Built-in oven housing in kitchen units. `housing` 'base' (under the
 * worktop, a drawer below) or 'tall' (oven and microwave at eye level in a
 * tall unit, doors below and above). Params also `handles` like the kitchen.
 */
export function buildOvenHousing(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const tall = param<'base' | 'tall'>(entry, 'housing', 'base') === 'tall';
  const handles = param<Handles>(entry, 'handles', 'rail');
  const ow = Math.min(0.595, W - 0.005);
  if (!tall) {
    const face = D / 2 - K.overhang;
    const topY = H - K.top;
    const pl = Math.min(K.plinth, topY * 0.2);
    for (const sx of [-1, 1]) {
      sidePanel(m, sx * (W / 2 - K.panel / 2), 0, pl, -D / 2, face - K.plinthRecess);
      sidePanel(m, sx * (W / 2 - K.panel / 2), pl, topY, -D / 2, face - K.front - 0.004);
    }
    plinth(m, -W / 2 + 0.001, W / 2 - 0.001, face, pl);
    worktop(m, -W / 2, W / 2, -D / 2, D / 2, H);
    const oh = Math.min(0.595, (topY - pl) * 0.8);
    const oy = topY - 0.004 - oh;
    ovenInsert(m, 0, oy, ow, oh, face - 0.004, Math.min(K.overhang + 0.004, 0.024));
    frontGrid(m, { x0: -W / 2, x1: W / 2, y0: pl, y1: oy - 0.002, face, rows: [{ h: 1, cols: 1, kind: 'drawer' }], handles, railTop: true });
    return m.build();
  }
  const face = handles === 'bar' ? D / 2 - K.handle : D / 2;
  const pl = Math.min(K.plinth, H * 0.08);
  for (const sx of [-1, 1]) {
    sidePanel(m, sx * (W / 2 - K.panel / 2), 0, pl, -D / 2, face - K.plinthRecess);
    sidePanel(m, sx * (W / 2 - K.panel / 2), pl, H, -D / 2, face - K.front - 0.004);
  }
  const inner = face - K.front - 0.004;
  m.part('carcass', rbox(W - 2 * K.panel, K.panel, inner + D / 2, 0.0015, 0, H - K.panel, (inner - D / 2) / 2, 1));
  plinth(m, -W / 2 + 0.001, W / 2 - 0.001, face, pl);
  // Oven at eye level, a compact microwave above it.
  const oh = Math.min(0.595, H * 0.28);
  const oy = Math.min(0.78, H * 0.36);
  const mh = Math.min(0.39, H * 0.18);
  const my = oy + oh + 0.006;
  const applianceFace = D / 2 - 0.022;
  ovenInsert(m, 0, oy, ow, oh, applianceFace, 0.02);
  microwaveInsert(m, 0, my, ow, mh, applianceFace);
  const rows = (n: number): Row[] => [{ h: 1, cols: W > 0.75 ? 2 : 1, kind: n > 0 ? 'door' : 'drawer' }];
  frontGrid(m, { x0: -W / 2, x1: W / 2, y0: pl, y1: oy - 0.003, face, rows: rows(1), handles, railTop: true });
  frontGrid(m, { x0: -W / 2, x1: W / 2, y0: my + mh + 0.004, y1: H, face, rows: rows(1), handles, railTop: false });
  // A finger rail above the lower doors needs a matching shadow under the oven.
  m.fixed(GASKET, box(W - 2 * K.panel, 0.004, 0.02, 0, oy - 0.004, applianceFace - 0.01));
  return m.build();
}

/* ------------------------------------------------- range, microwave, dishwasher */

/**
 * Freestanding cooker: a gas or ceramic hob on top, a control panel with
 * knobs and a clock, an oven door of black glass with a window and a bar
 * handle, a storage drawer and feet. `type` 'gas' | 'electric'.
 */
export function buildRange(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const gas = param<'gas' | 'electric'>(entry, 'type', 'gas') === 'gas';
  const proj = 0.035;
  const face = D / 2 - proj;
  const hobH = gas ? Math.min(0.055, H * 0.07) : 0.008;
  const bodyTop = H - hobH;
  const foot = 0.015;
  m.part('body', rbox(W, bodyTop - foot, face + D / 2, 0.006, 0, foot, (face - D / 2) / 2, 2));
  feet(m, W, D - proj, foot + 0.002, -proj / 2);
  hobTop(m, { W, D: D - 0.002, y0: bodyTop, h: hobH, n: 4, induction: !gas, top: 'top', supports: null, knobs: 'handles', z: 0 });
  // Control panel.
  const panelH = Math.min(0.11, H * 0.12);
  const py = bodyTop - panelH - 0.006;
  m.part('body', rbox(W - 0.01, panelH, 0.02, 0.004, 0, py, face + 0.006, 2));
  const kn = 5;
  for (let i = 0; i < kn; i++) {
    const x = -W / 2 + 0.07 + ((W - 0.14) * i) / (kn - 1);
    if (i === 2) display(m, x, py + panelH / 2 + 0.012, face + 0.016, 0.07, 0.024, 4);
    else knob(m, 'handles', x, py + panelH / 2, face + 0.016, 0.017, 0.018);
  }
  // Oven door with window and handle, drawer below.
  const dy1 = py - 0.008;
  const dh = Math.min(0.12, H * 0.14);
  const dy0 = foot + 0.02 + dh + 0.006;
  m.fixed(GLOSS, rbox(W - 0.012, dy1 - dy0, 0.02, 0.006, 0, dy0, face + 0.01, 2));
  m.fixed(GASKET, rbox(W * 0.66, (dy1 - dy0) * 0.48, 0.002, 0.012, 0, dy0 + (dy1 - dy0) * 0.2, face + 0.0205, 2));
  barPull(m, 'handles', 0, dy1 - 0.04, W * 0.78, face + 0.02, false, proj - 0.02, 0.014);
  door(m, 'body', -W / 2 + 0.006, W / 2 - 0.006, foot + 0.02, foot + 0.02 + dh, face + 0.012, 0.012, 0.004);
  barPull(m, 'handles', 0, foot + 0.02 + dh - 0.03, W * 0.4, face + 0.012, false, proj - 0.012, 0.012);
  return m.build();
}

/** Countertop microwave: steel body, black glass door with a window, a control column with a display and a dial, a door pull. */
export function buildMicrowave(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const proj = 0.012;
  const face = D / 2 - proj;
  const foot = 0.01;
  m.part('body', rbox(W, H - foot, face + D / 2 - 0.004, 0.01, 0, foot, (face - 0.004 - D / 2) / 2, 3));
  feet(m, W - 0.02, D - 0.06, foot + 0.001);
  // Side vents.
  for (let i = 0; i < 6; i++) m.fixed(GASKET, box(0.001, 0.006, D * 0.3, W / 2 + 0.0002, H * 0.55 + i * 0.014, -D * 0.12));
  const cw = Math.min(0.13, W * 0.26);
  const dx1 = W / 2 - cw - 0.004;
  const dx0 = -W / 2 + 0.006;
  m.fixed(GLOSS, rbox(dx1 - dx0, H - foot - 0.016, 0.008, 0.004, (dx0 + dx1) / 2, foot + 0.008, face - 0.003, 2));
  m.fixed(GASKET, rbox((dx1 - dx0) * 0.72, (H - foot) * 0.56, 0.002, 0.01, (dx0 + dx1) / 2 - 0.015, foot + (H - foot) * 0.2, face + 0.0012, 2));
  m.part('handles', rbox(0.014, (H - foot) * 0.7, proj + 0.004, 0.005, dx1 - 0.02, foot + (H - foot) * 0.15, face + proj / 2 - 0.002, 2));
  const cx = W / 2 - cw / 2 - 0.005;
  m.fixed(GLOSS, rbox(cw, H - foot - 0.016, 0.006, 0.003, cx, foot + 0.008, face - 0.004, 2));
  display(m, cx, foot + (H - foot) * 0.82, face - 0.001, cw * 0.72, 0.022, 4);
  knob(m, 'handles', cx, foot + (H - foot) * 0.46, face - 0.001, Math.min(0.022, cw * 0.2), proj);
  for (let i = 0; i < 3; i++) m.part('handles', rbox(cw * 0.22, 0.012, 0.004, 0.002, cx + (i - 1) * cw * 0.28, foot + (H - foot) * 0.18, face, 1));
  return m.build();
}

/** Freestanding dishwasher: steel cabinet and door, a black control strip with a display and keys, a bar handle and a recessed kick plate. */
export function buildDishwasher(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const proj = 0.03;
  const face = D / 2 - proj;
  const kick = Math.min(0.09, H * 0.1);
  const foot = 0.012;
  m.part('body', rbox(W, H - foot, face - 0.05 + D / 2, 0.008, 0, foot, (face - 0.05 - D / 2) / 2, 3));
  feet(m, W, D - proj, foot + 0.002, -proj / 2);
  m.fixed(GASKET, rbox(W - 0.03, kick - foot - 0.006, 0.01, 0.002, 0, foot + 0.003, face - 0.06, 1));
  door(m, 'body', -W / 2 + 0.002, W / 2 - 0.002, kick, H - 0.003, face, 0.048, 0.006);
  const sh = Math.min(0.075, H * 0.09);
  m.fixed(GLOSS, rbox(W - 0.012, sh, 0.004, 0.002, 0, H - 0.008 - sh, face + 0.0015, 1));
  display(m, -W * 0.2, H - 0.008 - sh / 2 + 0.012, face + 0.003, 0.08, 0.024, 4);
  for (let i = 0; i < 5; i++) m.fixed(DISPLAY, disc(0.004, 0.001, W * 0.04 + i * 0.045, 0, 0).rotateX(PI / 2).translate(0, H - 0.008 - sh / 2, face + 0.0036));
  barPull(m, 'handles', 0, H - 0.008 - sh - 0.04, W * 0.7, face, false, proj, 0.014);
  return m.build();
}

/* ------------------------------------------------------------------ hoods */

/**
 * Cooker hood on the wall, its chimney duct reaching the top of the box.
 * `style` 'chimney' (a slim flat visor with a glass edge strip and touch
 * controls) or 'canopy' (a sloping steel canopy with a skirt). Grease
 * filters and two lights underneath.
 */
export function buildHood(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const canopy = param<'chimney' | 'canopy'>(entry, 'style', 'chimney') === 'canopy';
  const back = -D / 2;
  const ductW = Math.min(0.28, W * 0.42);
  const ductD = Math.min(0.24, D * 0.5);
  let base: number;
  if (canopy) {
    const skirt = Math.min(0.07, H * 0.1);
    const slopeTop = Math.min(0.32, H * 0.45);
    const shift = (D - ductD) / 2;
    const prof: [number, number][] = [
      [-0.004, 0],
      [0, 0.004],
      [0, skirt],
      [-0.004, skirt + 0.006],
      [-(Math.min(W, D) / 2 - ductD / 2), slopeTop],
    ];
    const g = sweep(prof, W / 2, D / 2, 0.02, 0, 0, 0, 3);
    // Lean the slope towards the wall so the duct stands against it.
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, (y - skirt) / (slopeTop - skirt));
      pos.setZ(i, pos.getZ(i) - t * shift);
      pos.setX(i, pos.getX(i) * (1 - t * (1 - ductW / W) * 0.12));
    }
    g.computeVertexNormals();
    m.part('body', g);
    m.part('body', box(W - 0.004, 0.002, D - 0.004, 0, 0.004, 0));
    base = slopeTop - 0.004;
    m.part('controls', rbox(W * 0.3, 0.02, 0.004, 0.002, 0, skirt * 0.3, D / 2 + 0.0002 - 0.004, 1));
    for (let i = 0; i < 4; i++) m.fixed(DISPLAY, disc(0.003, 0.001, 0, 0, 0).rotateX(PI / 2).translate(-W * 0.12 + i * W * 0.08, skirt * 0.3 + 0.01, D / 2 - 0.0015));
  } else {
    const visor = Math.min(0.06, H * 0.12);
    m.part('body', rbox(W, visor, D, 0.006, 0, 0, 0, 3));
    m.fixed(GLOSS, rbox(W - 0.03, visor * 0.5, 0.004, 0.002, 0, visor * 0.25, D / 2 - 0.0015, 1));
    for (let i = 0; i < 4; i++) m.part('controls', disc(0.005, 0.001, 0, 0, 0).rotateX(PI / 2).translate(W * 0.2 + i * 0.026, visor * 0.5, D / 2 + 0.0004 - 0.0005));
    m.fixed(DISPLAY, disc(0.0025, 0.001, 0, 0, 0).rotateX(PI / 2).translate(W * 0.2 - 0.026, visor * 0.5, D / 2 - 0.0004));
    base = visor - 0.002;
  }
  // Filters and lights underneath.
  const fw = (W - 0.1) / 2;
  for (const s of [-1, 1]) {
    m.fixed(STEEL, rbox(fw - 0.01, 0.003, D * 0.62, 0.001, s * (fw / 2 + 0.005), -0.0005 + 0.0005, -D * 0.06, 1));
    for (let i = 0; i < 7; i++) m.fixed(GASKET, box(fw - 0.04, 0.0006, 0.004, s * (fw / 2 + 0.005), -0.0001, -D * 0.06 - D * 0.27 + (i * D * 0.54) / 6));
    m.fixed('#fff4dc', disc(0.025, 0.002, s * (W / 2 - 0.05), 0, D * 0.32, 20));
  }
  // Chimney duct to the top, against the wall.
  m.part('body', rbox(ductW, H - base, ductD, 0.004, 0, base, back + ductD / 2, 2));
  m.fixed(GASKET, box(ductW + 0.002, 0.002, ductD + 0.002, 0, H - 0.3, back + ductD / 2));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const APPLIANCES_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  applFridge: buildFridge,
  applHob: buildHob,
  applOvenHousing: buildOvenHousing,
  applRange: buildRange,
  applMicrowave: buildMicrowave,
  applDishwasher: buildDishwasher,
  applHood: buildHood,
  ...HOME_APPLIANCE_GENERATORS,
};
