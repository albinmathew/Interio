/**
 * Premium generators: styling accessories. Curtains that stack beside a window,
 * and the small things that dress a surface: a vase of branches, a trio of
 * vases, a tray with candles, a bowl, a fruit bowl, a stack of books and a
 * utensil crock. See `beds.ts` for the conventions; organic pieces are built at
 * their nominal size and fitted to the entry's box with `Fit`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, type BuildContext } from './kit';
import { BARK, Fit, GREENS, bookStack, hash, leaf, place, rng, surface, twoSided, vase, type Emit } from './decor.parts';

/* -------------------------------------------------------------------- slots */

export const STACKED_CURTAIN_SLOTS: FinishSlot[] = [
  { id: 'fabric', label: 'Curtains', kind: 'fabric', default: 'fabric.linen.ivory' },
  { id: 'rod', label: 'Rod', kind: 'metal', default: 'metal.black' },
];
export const VASE_SLOTS: FinishSlot[] = [{ id: 'vase', label: 'Vase', kind: 'ceramic', default: 'ceramic.white' }];
export const VASE_TRIO_SLOTS: FinishSlot[] = [
  { id: 'vase', label: 'Tall vase', kind: 'ceramic', default: 'ceramic.terracotta' },
  { id: 'small', label: 'Small vases', kind: 'ceramic', default: 'ceramic.white' },
];
export const TRAY_SLOTS: FinishSlot[] = [
  { id: 'tray', label: 'Tray', kind: 'wood', default: 'wood.walnut' },
  { id: 'holders', label: 'Candle holders', kind: 'metal', default: 'metal.brass' },
];
export const BOWL_SLOTS: FinishSlot[] = [{ id: 'bowl', label: 'Bowl', kind: 'wood', default: 'wood.walnut' }];
export const FRUIT_BOWL_SLOTS: FinishSlot[] = [{ id: 'bowl', label: 'Bowl', kind: 'ceramic', default: 'ceramic.white' }];
export const BOOK_STACK_SLOTS: FinishSlot[] = [
  { id: 'covers', label: 'Covers', kind: 'fabric', default: 'fabric.linen.taupe' },
  { id: 'pages', label: 'Pages', kind: 'fabric', default: 'fabric.linen.ivory' },
  { id: 'object', label: 'Object', kind: 'metal', default: 'metal.brass' },
];
export const CROCK_SLOTS: FinishSlot[] = [
  { id: 'crock', label: 'Crock', kind: 'ceramic', default: 'ceramic.white' },
  { id: 'utensils', label: 'Utensils', kind: 'wood', default: 'wood.oak' },
];

/* ----------------------------------------------------------------- curtains */

/**
 * Floor-length curtains on a rod, drawn open and stacked at both ends so they
 * frame a window without covering it. Wall-anchored: brackets touch the wall
 * at -Z, the hems the bottom of the box. Param `stack` (mm): the width of each
 * gathered panel, measured from the end of the rod. Between the panels there is
 * only the rod, in the top `ROD_BAND` mm of the box.
 */
export const ROD_BAND = 90;

export function buildStackedCurtains(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const fit = new Fit();
  const { W, D, H } = m;
  const stack = Math.min(W / 2, param(entry, 'stack', 300) / 1000);
  const rodR = 0.012;
  const fin = 0.03;
  const rodY = H - fin;
  const amp = Math.max(0.01, (D - 0.03) / 2); // fold depth: the folds fill the box in front of the brackets
  const zMid = -D / 2 + 0.024 + amp; // centre line of the folds, clear of the wall
  const zRod = Math.min(zMid, D / 2 - fin);
  // Rod, finials and brackets. The brackets stand behind the stacks, so the band between them stays clear below the rod.
  fit.part('rod', cyl(rodR, rodR, W - 2 * fin * 0.9, 0, rodY, zRod, 'x', 16));
  for (const s of [-1, 1]) {
    fit.part('rod', new THREE.SphereGeometry(fin, 18, 12).translate(s * (W / 2 - fin), rodY, zRod));
    const bx = s * (W / 2 - stack / 2);
    fit.part('rod', rbox(0.05, 0.08, 0.008, 0.002, bx, rodY - 0.04, -D / 2 + 0.004, 1));
    fit.part('rod', cyl(0.007, 0.007, zRod + D / 2, bx, rodY, (zRod - D / 2) / 2, 'z', 10));
  }
  // Two gathered panels with deep, soft folds that flare a little towards the hem.
  const top = rodY - rodR - 0.02;
  for (const s of [-1, 1]) {
    const outer = s * (W / 2 - 0.004);
    const folds = Math.max(4, Math.round(stack / 0.06));
    const sheet = surface(folds * 8, 20, (u, v) => {
      const k = 1 - v; // 0 at the top, 1 at the hem
      const width = (stack - 0.008) * (0.92 + 0.08 * k);
      const x = outer - s * u * width;
      const a = amp * (0.7 + 0.3 * k);
      const z = zMid + a * Math.sin(u * folds * Math.PI * 2 + (s > 0 ? 0 : Math.PI)) + Math.sin(u * 13.1 + s) * 0.003 * k;
      return [x, Math.max(0, top * v), z];
    });
    fit.part('fabric', twoSided(sheet));
    // Rings on the rod above the folds.
    for (let i = 0; i <= folds; i++) {
      const x = outer - s * (i / folds) * (stack - 0.01);
      fit.part('rod', new THREE.TorusGeometry(rodR + 0.006, 0.0025, 6, 12).translate(x, rodY, zRod));
    }
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* ------------------------------------------------------------------- vases */

/** A tall stoneware vase with a few bare branches and sparse leaves. */
export function buildVaseBranches(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const rand = rng(hash(entry.id));
  const fit = new Fit();
  const vh = 0.3;
  const vr = 0.075;
  fit.part('vase', vase(vh, vr, 0, 0, 0));
  const branches = 5;
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + rand() * 0.6;
    const lean = 0.08 + rand() * 0.14;
    const h = 0.42 + rand() * 0.28;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const wob = Math.sin(t * 5 + b) * 0.012;
      pts.push([Math.cos(a) * lean * t ** 1.3 + wob, vh * 0.85 + h * t, Math.sin(a) * lean * t ** 1.3 - wob]);
    }
    fit.fixed(BARK, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 18, 0.0035 - b * 0.0002, 5, false));
    const twigs = 6;
    for (let i = 1; i < twigs; i++) {
      const t = 0.35 + (0.6 * i) / twigs;
      const p = pts[Math.min(5, Math.round(t * 5))]!;
      const g = leaf(0.045 + rand() * 0.02, 0.026, 'oval', 3, 0.2, 0.4);
      fit.fixed(GREENS[Math.floor(rand() * 3)]!, place(g, p[0], p[1], p[2], rand() * Math.PI * 2, -0.3 - rand() * 0.5, 0));
    }
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Three turned vases of different heights in a loose row. */
export function buildVaseTrio(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fit = new Fit();
  fit.part('vase', vase(0.3, 0.075, -0.07, 0, 0));
  fit.part('small', lathe([[0, 0], [0.05, 0], [0.065, 0.06], [0.06, 0.14], [0.03, 0.18], [0.025, 0.2], [0, 0.19]], 0.07, 0, 0.03, 24));
  fit.part('small', lathe([[0, 0], [0.04, 0], [0.055, 0.04], [0.05, 0.09], [0.035, 0.11], [0, 0.105]], 0.15, 0, -0.03, 24));
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* -------------------------------------------------------- tray and bowls */

/** A rimmed tray with three pillar candles in holders of different heights. */
export function buildTrayCandles(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const fit = new Fit();
  const { W, D, H } = m;
  const t = 0.012;
  fit.part('tray', rbox(W, t, D, 0.004, 0, 0, 0, 2));
  for (const s of [-1, 1]) {
    fit.part('tray', rbox(W, 0.03, 0.01, 0.004, 0, 0, s * (D / 2 - 0.005), 2));
    fit.part('tray', rbox(0.01, 0.03, D - 0.02, 0.004, s * (W / 2 - 0.005), 0, 0, 2));
  }
  const candles: [number, number, number, number][] = [
    [-W * 0.26, -D * 0.08, H - t - 0.04, 0.032],
    [W * 0.02, D * 0.12, (H - t) * 0.72, 0.036],
    [W * 0.27, -D * 0.12, (H - t) * 0.52, 0.03],
  ];
  for (const [x, z, h, r] of candles) {
    const holder = Math.min(0.03, h * 0.25);
    fit.part('holders', lathe([[0, 0], [r * 1.35, 0], [r * 1.4, holder * 0.3], [r * 1.15, holder], [0, holder]], x, t, z, 24));
    const wax = h - holder;
    fit.fixed('lacquer.cream', cyl(r, r, wax - 0.008, x, t + holder, z, 'y', 20));
    fit.fixed('lacquer.black.gloss', cyl(0.0012, 0.0012, 0.01, x, t + holder + wax - 0.01, z, 'y', 4));
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** A turned shallow bowl. Param `fruit`: filled with fruit. */
export function buildBowl(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fruit = param(entry, 'fruit', false);
  const fit = new Fit();
  const R = 0.16;
  const h = fruit ? 0.08 : 0.1;
  fit.part('bowl', lathe([[0, 0], [R * 0.4, 0], [R * 0.45, 0.008], [R * 0.85, h * 0.55], [R, h], [R * 0.96, h], [R * 0.82, h * 0.6], [R * 0.4, 0.016], [0, 0.016]], 0, 0, 0, 40));
  if (fruit) {
    const rand = rng(hash(entry.id));
    const colours = ['#d9822b', '#c94a2c', '#9cad3a', '#e0b53c'];
    const spots: [number, number, number][] = [
      [-0.06, 0.03, 0.045],
      [0.055, 0.02, 0.044],
      [0.0, -0.06, 0.042],
      [-0.01, 0.065, 0.04],
      [0.01, 0.0, 0.046],
    ];
    spots.forEach(([x, z, r], i) => {
      const y = i === 4 ? 0.07 : 0.022 + r * 0.6;
      fit.fixed(colours[i % colours.length]!, new THREE.SphereGeometry(r, 18, 12).scale(1, 0.92 + rand() * 0.1, 1).translate(x, y + r * 0.9, z));
    });
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Three or four books lying in a stack, with a small brass sphere on top. */
export function buildBookStack(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const rand = rng(hash(entry.id));
  const fit = new Fit();
  const others = ['fabric.weave.charcoal', 'fabric.cotton.sage', 'fabric.linen.ivory'] as const;
  let n = 0;
  // Every other book takes the slot's colour, the rest a fixed one.
  const emit: Emit = (role, g) => {
    if (role === 'pages') fit.part('pages', g);
    else if (n++ % 2 === 0) fit.part('covers', g);
    else fit.fixed(others[role % others.length]!, g);
  };
  const top = bookStack(emit, rand, 4, 0, 0, 0, 0.29, 0.21);
  fit.part('object', new THREE.SphereGeometry(0.035, 20, 14).translate(0.04, top + 0.035, 0.01));
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** A stoneware crock holding wooden spoons and spatulas. */
export function buildCrock(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fit = new Fit();
  const r = 0.065;
  const h = 0.16;
  fit.part('crock', lathe([[0, 0], [r * 0.9, 0], [r, 0.01], [r, h * 0.9], [r * 1.05, h], [r * 0.95, h], [r * 0.9, h * 0.92], [r * 0.9, 0.012], [0, 0.012]], 0, 0, 0, 32));
  const tools: [number, number, number][] = [
    [0.2, -0.15, 0.3],
    [-0.15, 0.25, 0.28],
    [0.05, 0.1, 0.33],
    [-0.25, -0.2, 0.26],
  ];
  tools.forEach(([lean, yaw, len], i) => {
    const handle = cyl(0.006, 0.007, len, 0, 0, 0, 'y', 8);
    const head = i % 2 === 0 ? new THREE.SphereGeometry(0.024, 14, 8).scale(1, 1.3, 0.35).translate(0, len + 0.02, 0) : rbox(0.05, 0.07, 0.008, 0.004, 0, len - 0.005, 0, 1);
    for (const part of [handle, head]) fit.part('utensils', place(part, (i - 1.5) * 0.012, 0.02, ((i % 2) - 0.5) * 0.02, yaw, 0, lean * 0.35));
  });
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const ACCESSORY_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  accessoryCurtains: buildStackedCurtains,
  accessoryVaseBranches: buildVaseBranches,
  accessoryVaseTrio: buildVaseTrio,
  accessoryTrayCandles: buildTrayCandles,
  accessoryBowl: buildBowl,
  accessoryBookStack: buildBookStack,
  accessoryCrock: buildCrock,
};
