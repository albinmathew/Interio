/**
 * Premium generators: tables. Coffee, side, console and dining tables. See
 * `beds.ts` for the conventions; shared parts live in `seating.parts.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, roundedRect, slab, type BuildContext } from './kit';
import { Parts, beam, clamp, ring, taperLeg, taperRod } from './seating.parts';

/* -------------------------------------------------------------------- slots */

export const COFFEE_WOOD_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top and shelf', kind: 'wood', default: 'wood.oak' },
  { id: 'legs', label: 'Legs', kind: 'wood', default: 'wood.walnut' },
];
export const COFFEE_GLASS_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Glass', kind: 'glass', default: 'glass.clear' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
  { id: 'shelf', label: 'Shelf', kind: 'wood', default: 'wood.walnut' },
];
export const SIDE_TABLE_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top', kind: 'stone', default: 'stone.marble.white' },
  { id: 'base', label: 'Base', kind: 'metal', default: 'metal.brass' },
];
export const CONSOLE_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top and shelf', kind: 'wood', default: 'wood.walnut' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
];
export const CONSOLE_DRAWER_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'wood', default: 'wood.oak' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.brass' },
];
export function diningSlots(top: string, base: string, topKind: FinishSlot['kind'] = 'wood', baseKind: FinishSlot['kind'] = 'wood'): FinishSlot[] {
  return [
    { id: 'top', label: 'Top', kind: topKind, default: top },
    { id: 'base', label: 'Base', kind: baseKind, default: base },
  ];
}

/* ------------------------------------------------------------------ helpers */

/** A few books lying on a shelf, in fixed cover colours. `x` is the centre, the stack sits on y. */
export function books(p: Parts, x: number, y: number, z: number, n: number, w = 0.24, d = 0.17, turnY = 0): void {
  const covers = ['lacquer.navy', 'lacquer.sage', 'lacquer.cream', 'lacquer.greige'];
  let at = y;
  for (let i = 0; i < n; i++) {
    const t = 0.022 + (i % 2) * 0.008;
    const s = 1 - i * 0.07;
    const g = rbox(w * s, t, d * s, 0.003, 0, at, 0, 1).rotateY(turnY + (i % 2 ? 0.08 : -0.05)).translate(x, 0, z);
    p.fixed(covers[i % covers.length]!, g);
    at += t;
  }
}

/** Places a slab of `shape` so its top is at y. */
/** A flat slab `w` x `d` with corner radius `r` and a bevelled edge, its top at y = `top`. The bevel stays inside the outline. */
const slabTop = (w: number, d: number, r: number, t: number, top: number, bevel: number) => slab(roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.001, r - bevel)), t, 0, top - t, 0, bevel);

/* ------------------------------------------------------------- coffee table */

/**
 * A coffee table (rectangular or square from its dims).
 * `material: 'wood'`: a soft-cornered oak top on tapered legs with aprons, a
 * lower shelf and a few books on it (`top`, `legs`).
 * `material: 'glass'`: a glass top showing its thickness in a slim black steel
 * frame, with a timber lower shelf (`top`, `frame`, `shelf`).
 */
export function buildCoffeeTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const material = param<'wood' | 'glass'>(entry, 'material', 'wood');
  const hasBooks = param<boolean>(entry, 'books', true);
  const shelfY = clamp(H * 0.24, 0.07, 0.12);
  if (material === 'glass') {
    const bar = 0.022;
    const gT = 0.012;
    // Top frame: an L-section ring the glass sits in.
    for (const s of [-1, 1]) {
      p.part('frame', rbox(W, 0.028, bar, 0.003, 0, H - 0.028, s * (D / 2 - bar / 2), 1));
      p.part('frame', rbox(bar, 0.028, D - 2 * bar + 0.002, 0.003, s * (W / 2 - bar / 2), H - 0.028, 0, 1));
    }
    p.part('top', rbox(W - 2 * bar + 0.006, gT, D - 2 * bar + 0.006, 0.002, 0, H - gT - 0.002, 0, 1));
    // Legs and lower frame.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('frame', rbox(bar, H - 0.026, bar, 0.003, sx * (W / 2 - bar / 2), 0, sz * (D / 2 - bar / 2), 1));
    for (const s of [-1, 1]) {
      p.part('frame', rbox(W - 2 * bar, 0.02, bar * 0.8, 0.003, 0, shelfY - 0.02, s * (D / 2 - bar / 2), 1));
      p.part('frame', rbox(bar * 0.8, 0.02, D - 2 * bar, 0.003, s * (W / 2 - bar / 2), shelfY - 0.02, 0, 1));
    }
    p.part('shelf', rbox(W - 2 * bar - 0.004, 0.02, D - 2 * bar - 0.004, 0.004, 0, shelfY, 0, 2));
    if (hasBooks) books(p, -W * 0.2, shelfY + 0.02, 0, 3, Math.min(0.26, W * 0.24), Math.min(0.19, D * 0.32), 0.1);
    return p.build();
  }
  const topT = 0.034;
  const r = Math.min(W, D) * 0.14;
  p.part('top', slabTop(W, D, r, topT, H, 0.008));
  const ix = W / 2 - Math.max(0.07, r * 0.75);
  const iz = D / 2 - Math.max(0.07, r * 0.75);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('legs', taperLeg(sx * ix, sz * iz, H - topT + 0.002, 0.024, 0.016, 0, 16));
  // Aprons between the legs, under the top.
  const ay = H - topT - 0.055;
  for (const s of [-1, 1]) {
    p.part('legs', rbox(2 * ix, 0.055, 0.02, 0.004, 0, ay, s * iz, 1));
    p.part('legs', rbox(0.02, 0.055, 2 * iz, 0.004, s * ix, ay, 0, 1));
  }
  // Lower shelf between the legs.
  p.part('top', slabTop(2 * ix + 0.03, 2 * iz + 0.03, 0.02, 0.02, shelfY + 0.02, 0.004));
  if (hasBooks) books(p, -ix * 0.45, shelfY + 0.02, 0, 3, Math.min(0.26, W * 0.24), Math.min(0.19, D * 0.32), 0.1);
  return p.build();
}

/* --------------------------------------------------------------- side table */

/** A round side table: a stone top with a rounded edge on three splayed brass legs with a ring. */
export function buildOccasionalTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const R = W / 2;
  const sz = D / W;
  const t = 0.022;
  p.part(
    'top',
    lathe(
      [
        [0, 0],
        [R - 0.008, 0],
        [R, 0.006],
        [R, t - 0.006],
        [R - 0.008, t],
        [0, t],
      ],
      0,
      H - t,
      0,
      40,
    ).scale(1, 1, sz),
  );
  const top = R * 0.42;
  const foot = R - 0.012;
  const legs = 3;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + Math.PI;
    p.part('base', taperRod([Math.sin(a) * foot, 0.005, Math.cos(a) * foot * sz], [Math.sin(a) * top, H - t, Math.cos(a) * top * sz], 0.009, 0.012, 12));
    p.part('base', cyl(0.011, 0.011, 0.004, Math.sin(a) * foot, 0, Math.cos(a) * foot * sz, 'y', 10));
  }
  const ry = H * 0.38;
  const rr = foot + (top - foot) * (ry / (H - t));
  p.part('base', ring(rr, 0.006, 0, ry, 0, 36, sz));
  p.part('base', cyl(top + 0.02, top + 0.02, 0.008, 0, H - t - 0.008, 0, 'y', 24).scale(1, 1, sz));
  return p.build();
}

/* ------------------------------------------------------------ console table */

/**
 * A console table. `style: 'shelf'`: a slim timber top and lower shelf on a
 * black steel frame (`top`, `frame`). `style: 'drawers'`: an oak console with
 * a row of drawers under the top on tapered legs, brass pulls (`body`, `handles`).
 */
export function buildConsoleTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const style = param<'shelf' | 'drawers'>(entry, 'style', 'shelf');
  if (style === 'shelf') {
    const topT = 0.03;
    const bar = 0.02;
    p.part('top', rbox(W, topT, D, 0.006, 0, H - topT, 0, 2));
    const fx = W / 2 - 0.03;
    const fz = D / 2 - 0.025;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('frame', rbox(bar, H - topT, bar, 0.003, sx * fx, 0, sz * fz, 1));
    const shelfY = clamp(H * 0.2, 0.1, 0.2);
    for (const y of [H - topT - 0.03, shelfY - 0.02]) {
      for (const s of [-1, 1]) {
        p.part('frame', rbox(2 * fx, 0.03 - (y < 0.5 ? 0.01 : 0), bar, 0.003, 0, y, s * fz, 1));
        p.part('frame', rbox(bar, 0.03 - (y < 0.5 ? 0.01 : 0), 2 * fz, 0.003, s * fx, y, 0, 1));
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.fixed('#1a1a1a', cyl(0.008, 0.008, 0.005, sx * fx, 0, sz * fz, 'y', 10));
    }
    p.part('top', rbox(2 * fx + bar, 0.02, 2 * fz + bar, 0.004, 0, shelfY, 0, 2));
    books(p, -W * 0.25, shelfY + 0.02, 0, 3, Math.min(0.24, W * 0.22), Math.min(0.17, D * 0.6), -0.05);
    books(p, W * 0.25, shelfY + 0.02, 0.0, 2, Math.min(0.22, W * 0.2), Math.min(0.16, D * 0.55), 0.12);
    return p.build();
  }
  const topT = 0.028;
  const boxH = clamp(H * 0.16, 0.1, 0.15);
  const leg = 0.04;
  const lx = W / 2 - leg / 2 - 0.02;
  const lz = D / 2 - leg / 2 - 0.015;
  const pull = 0.012;
  p.part('body', rbox(W, topT, D, 0.006, 0, H - topT, 0, 2));
  // Carcass under the top with drawers in front.
  const cy = H - topT - boxH;
  const front = D / 2 - pull - 0.035;
  p.part('body', rbox(2 * lx + leg, boxH, front + D / 2 - 0.02, 0.004, 0, cy, (front - D / 2 + 0.02) / 2, 1));
  const n = W > 0.9 ? 2 : 1;
  const dw = (2 * lx + leg - 0.02) / n;
  for (let i = 0; i < n; i++) {
    const x = -lx - leg / 2 + 0.01 + dw * (i + 0.5);
    p.part('body', rbox(dw - 0.006, boxH - 0.02, 0.018, 0.004, x, cy + 0.01, front + 0.009, 2));
    p.part('handles', rbox(Math.min(0.12, dw * 0.3), 0.012, 0.01, 0.004, x, cy + boxH / 2 - 0.006, front + 0.018 + 0.005, 2));
    p.part('handles', cyl(0.004, 0.004, 0.012, x - Math.min(0.12, dw * 0.3) / 2 + 0.008, cy + boxH / 2, front + 0.022, 'z', 8));
    p.part('handles', cyl(0.004, 0.004, 0.012, x + Math.min(0.12, dw * 0.3) / 2 - 0.008, cy + boxH / 2, front + 0.022, 'z', 8));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('body', beam([sx * lx, 0, sz * lz], [sx * lx, cy + 0.01, sz * lz], leg, leg, 0.006, 1, 0.65));
  // Brass caps on the feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('handles', rbox(leg * 0.68, 0.025, leg * 0.68, 0.003, sx * lx, 0, sz * lz, 1));
  return p.build();
}

/* ------------------------------------------------------------- dining table */

type DiningBase = 'legs' | 'metal' | 'trestle' | 'sled' | 'pedestal';

/** Height of a laid place setting: plates and flat cutlery only, so the table keeps its height. */
const SETTING_H = 0.012;

/**
 * A dining table. `base`: 'legs' (tapered timber legs with aprons), 'metal'
 * (slim black steel legs and rails), 'trestle' (two timber trestles and a
 * stretcher), 'sled' (two steel sled frames, for a glass top), 'pedestal' (a
 * round top on a turned column). `top`: 'wood' | 'glass' | 'stone'.
 * `settings`: number of laid places (dinner and side plates, napkin, cutlery;
 * no glasses, which would raise the table's height); `runner`: a linen runner.
 * The table top sits `SETTING_H` lower when places are laid.
 */
export function buildDiningTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const base = param<DiningBase>(entry, 'base', 'legs');
  const topKind = param<'wood' | 'glass' | 'stone'>(entry, 'top', 'wood');
  const settings = param<number>(entry, 'settings', 0);
  const runner = param<boolean>(entry, 'runner', false);
  const round = base === 'pedestal';
  const laid = settings > 0 || runner;
  const T = laid ? H - SETTING_H : H; // table surface
  const topT = topKind === 'glass' ? 0.012 : topKind === 'stone' ? 0.03 : 0.04;
  const under = T - topT;

  // Top.
  if (round) {
    const R = W / 2;
    p.part('top', lathe([[0, 0], [R - 0.012, 0], [R, 0.01], [R, topT - 0.008], [R - 0.01, topT], [0, topT]], 0, under, 0, 56).scale(1, 1, D / W));
  } else if (topKind === 'glass') {
    p.part('top', slabTop(W, D, 0.02, topT, T, 0.002));
  } else {
    p.part('top', slabTop(W, D, 0.012, topT, T, 0.006));
  }

  if (base === 'legs' || base === 'metal') {
    const metal = base === 'metal';
    const leg = metal ? 0.035 : 0.055;
    const ix = W / 2 - (metal ? 0.05 : 0.1);
    const iz = D / 2 - (metal ? 0.05 : 0.09);
    const ah = metal ? 0.04 : 0.08;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (metal) p.part('base', rbox(leg, under, leg, 0.004, sx * ix, 0, sz * iz, 1));
        else p.part('base', beam([sx * (ix + 0.012), 0, sz * (iz + 0.008)], [sx * ix, under, sz * iz], leg, leg, 0.008, 1, 0.62));
        p.fixed('#1a1a1a', cyl(0.012, 0.012, 0.004, sx * (ix + (metal ? 0 : 0.012)), 0, sz * (iz + (metal ? 0 : 0.008)), 'y', 10));
      }
    }
    const t = metal ? 0.02 : 0.024;
    for (const s of [-1, 1]) {
      p.part('base', rbox(2 * ix, ah, t, 0.004, 0, under - ah, s * (iz - (metal ? 0 : 0.012)), 1));
      p.part('base', rbox(t, ah, 2 * iz, 0.004, s * (ix - (metal ? 0 : 0.012)), under - ah, 0, 1));
    }
  } else if (base === 'trestle') {
    const tx = W / 2 - Math.max(0.2, W * 0.12);
    const foot = D - 0.12;
    for (const s of [-1, 1]) {
      const x = s * tx;
      // Foot, two splayed uprights, a cleat under the top.
      p.part('base', rbox(0.07, 0.06, foot, 0.012, x, 0, 0, 2));
      p.part('base', beam([x, 0.05, -foot * 0.32], [x, under - 0.05, -foot * 0.08], 0.07, 0.07, 0.01, 1));
      p.part('base', beam([x, 0.05, foot * 0.32], [x, under - 0.05, foot * 0.08], 0.07, 0.07, 0.01, 1));
      p.part('base', rbox(0.07, 0.05, foot * 0.75, 0.01, x, under - 0.05, 0, 2));
      for (const sz of [-1, 1]) p.fixed('#1a1a1a', rbox(0.06, 0.006, 0.07, 0.002, x, 0, sz * (foot / 2 - 0.06), 1));
    }
    // Stretcher through the uprights, wedged at each end.
    p.part('base', rbox(2 * tx + 0.16, 0.08, 0.045, 0.01, 0, under * 0.42, 0, 2));
    for (const s of [-1, 1]) p.part('base', rbox(0.02, 0.1, 0.06, 0.004, s * (tx + 0.06), under * 0.42 - 0.01, 0, 1));
  } else if (base === 'sled') {
    const sx0 = W / 2 - Math.max(0.12, W * 0.08);
    const bar = 0.03;
    for (const s of [-1, 1]) {
      const x = s * sx0;
      const z = D / 2 - 0.06;
      p.part('base', rbox(bar, under, bar, 0.004, x, 0, -z + bar / 2, 1));
      p.part('base', rbox(bar, under, bar, 0.004, x, 0, z - bar / 2, 1));
      p.part('base', rbox(bar, bar, 2 * z, 0.004, x, 0, 0, 1));
      p.part('base', rbox(bar, bar, 2 * z, 0.004, x, under - bar, 0, 1));
      // Clear pads the glass rests on.
      for (const sz of [-1, 1]) p.fixed('glass.frosted', cyl(0.014, 0.014, 0.003, x, under - 0.003, sz * (z - 0.08), 'y', 12));
    }
    p.part('base', rbox(2 * sx0, bar * 0.8, bar * 0.8, 0.004, 0, under * 0.35, 0, 1));
  } else {
    // Pedestal: a turned column on a flared foot.
    const R = Math.min(W, D) / 2;
    const footR = R * 0.48;
    p.part(
      'base',
      lathe(
        [
          [0, 0],
          [footR, 0],
          [footR, 0.02],
          [footR * 0.86, 0.04],
          [footR * 0.45, 0.12],
          [0.07, under * 0.45],
          [0.065, under * 0.8],
          [0.09, under - 0.03],
          [R * 0.3, under - 0.012],
          [R * 0.3, under],
          [0, under],
        ],
        0,
        0,
        0,
        40,
      ).scale(1, 1, D / W),
    );
  }

  // Place settings and runner.
  if (laid) {
    const covers: { x: number; z: number; a: number }[] = [];
    if (round) {
      const R = Math.min(W, D) / 2 - 0.19;
      for (let i = 0; i < settings; i++) {
        const a = (i / settings) * Math.PI * 2 + Math.PI / 4;
        covers.push({ x: Math.sin(a) * R * (W / Math.min(W, D)), z: Math.cos(a) * R * (D / Math.min(W, D)), a });
      }
    } else {
      const heads = settings > 2 * (W >= 1.6 ? 3 : 2) || (W >= 2.2 && settings >= 8);
      const perSide = Math.max(1, Math.ceil((settings - (heads ? 2 : 0)) / 2));
      const pitch = W / perSide;
      for (let i = 0; i < perSide; i++) {
        const x = -W / 2 + pitch * (i + 0.5);
        covers.push({ x, z: D / 2 - 0.19, a: 0 });
        if (covers.length < settings) covers.push({ x, z: -D / 2 + 0.19, a: Math.PI });
      }
      if (heads) {
        covers.push({ x: W / 2 - 0.19, z: 0, a: Math.PI / 2 });
        covers.push({ x: -W / 2 + 0.19, z: 0, a: -Math.PI / 2 });
      }
    }
    for (const c of covers.slice(0, settings)) placeSetting(p, c.x, T, c.z, c.a);
    if (runner) {
      if (round) p.fixed('fabric.linen.sand', cyl(Math.min(W, D) * 0.17, Math.min(W, D) * 0.17, 0.003, 0, T, 0, 'y', 32));
      else p.fixed('fabric.linen.sand', rbox(W - 0.24, 0.003, Math.min(0.38, D * 0.4), 0.001, 0, T, 0, 1));
      // A low bowl in the middle.
      const bowlR = Math.min(0.14, Math.min(W, D) * 0.14);
      p.fixed('ceramic.terracotta', lathe([[0, 0], [bowlR * 0.5, 0], [bowlR * 0.85, SETTING_H * 0.4], [bowlR, SETTING_H - 0.0015], [bowlR - 0.004, SETTING_H - 0.0015], [bowlR * 0.82, SETTING_H * 0.45], [0, 0.003]], 0, T + 0.0015, 0, 32));
    }
  }
  return p.build();
}

/** One laid place facing the table edge it sits at: dinner plate, side plate, napkin, knife and fork. */
function placeSetting(p: Parts, x: number, y: number, z: number, a: number): void {
  const at = (g: THREE.BufferGeometry) => g.rotateY(a).translate(x, 0, z);
  const plate = (r: number, h: number) =>
    lathe([[0, 0], [r * 0.62, 0], [r * 0.7, h * 0.35], [r, h - 0.0012], [r - 0.003, h], [r * 0.68, h * 0.5], [0, h * 0.42]], 0, y, 0, 36);
  p.fixed('ceramic.white', at(plate(0.135, SETTING_H - 0.001)));
  p.fixed('ceramic.white', at(plate(0.085, SETTING_H * 0.75).translate(-0.17, 0, -0.16)));
  p.fixed('fabric.linen.ivory', at(rbox(0.1, 0.006, 0.2, 0.002, -0.2, y, 0.02, 1)));
  // Fork on the napkin, knife on the right.
  p.fixed('metal.steel', at(rbox(0.016, 0.003, 0.19, 0.0015, -0.2, y + 0.006, 0.02, 1)));
  p.fixed('metal.steel', at(rbox(0.014, 0.003, 0.21, 0.0015, 0.175, y, 0.01, 1)));
}

/** Generators of this family, registered by `premium/index.ts`. */
export const TABLES_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  coffeeTable: buildCoffeeTable,
  occasionalTable: buildOccasionalTable,
  consoleTable: buildConsoleTable,
  diningTable: buildDiningTable,
};

