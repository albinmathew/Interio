/**
 * Bedroom and foyer cabinetry of the furnishing package: hinged wardrobes up to
 * the ceiling (lacquer or mirror shutters, a loft row above), the dressing unit
 * with its stool, the writing table and the shoe cabinet with floating ledges.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { COVERS, PAGES, bookStack, hash, panel, rng, vase, type G } from './decor.parts';
import { absorb, variant } from './essentials.parts';
import { Model, cyl, lathe, param, rbox, roundedRect, slab, type BuildContext } from './kit';
import { beam } from './seating.parts';
import { buildCase } from './storage.case';

const GAP = 0.003; // shadow gap between fronts

/* ---------------------------------------------------------------- wardrobes */

/**
 * A door or loft front with a G-profile pull along one edge: a slim metal lip
 * flush with the face and a recessed metal channel behind it, the soft-close
 * look of a handle-less wardrobe. `edge` is where the profile runs.
 */
function profiledFront(m: Model, x0: number, x1: number, y0: number, y1: number, zFace: number, ft: number, edge: 'left' | 'right' | 'bottom', mirror: boolean): void {
  const pw = 0.024; // profile width
  const lip = 0.005;
  const zc = zFace - ft / 2;
  let [a0, a1, b0, b1] = [x0, x1, y0, y1]; // the panel, after the profile
  if (edge === 'left') {
    m.part('handles', panel(lip, y1 - y0, ft, x0 + lip / 2, y0, zc, 0.001));
    m.part('handles', panel(pw - lip, y1 - y0, 0.004, x0 + lip + (pw - lip) / 2, y0, zFace - ft + 0.004, 0.001));
    a0 = x0 + pw;
  } else if (edge === 'right') {
    m.part('handles', panel(lip, y1 - y0, ft, x1 - lip / 2, y0, zc, 0.001));
    m.part('handles', panel(pw - lip, y1 - y0, 0.004, x1 - lip - (pw - lip) / 2, y0, zFace - ft + 0.004, 0.001));
    a1 = x1 - pw;
  } else {
    m.part('handles', panel(x1 - x0, lip, ft, (x0 + x1) / 2, y0, zc, 0.001));
    m.part('handles', panel(x1 - x0, pw - lip, 0.004, (x0 + x1) / 2, y0 + lip, zFace - ft + 0.004, 0.001));
    b0 = y0 + pw;
  }
  if (!mirror) {
    m.part('fronts', rbox(a1 - a0, b1 - b0, ft, 0.0025, (a0 + a1) / 2, b0, zc, 1));
    return;
  }
  // Mirror shutter: a slim aluminium frame round a mirror, on a lacquered backing board.
  const f = 0.016;
  const w = a1 - a0;
  const h = b1 - b0;
  const cx = (a0 + a1) / 2;
  m.part('handles', panel(w, f, ft, cx, b0, zc, 0.0015));
  m.part('handles', panel(w, f, ft, cx, b1 - f, zc, 0.0015));
  if (edge !== 'left') m.part('handles', panel(f, h - 2 * f, ft, a0 + f / 2, b0 + f, zc, 0.0015));
  if (edge !== 'right') m.part('handles', panel(f, h - 2 * f, ft, a1 - f / 2, b0 + f, zc, 0.0015));
  m.part('fronts', panel(w - 0.004, h - 0.004, ft - 0.008, cx, b0 + 0.002, zFace - ft + (ft - 0.008) / 2, 0.001));
  m.fixed('glass.mirror', panel(w - 2 * f + 0.004, h - 2 * f + 0.004, 0.005, cx, b0 + f - 0.002, zFace - 0.0045, 0.0008));
}

/**
 * A hinged wardrobe of full-overlay shutters on an oak carcass and a recessed
 * plinth, with a loft row of short doors above the main ones. Main doors pair
 * up, their G-profiles meeting in the middle of each pair; loft doors open from
 * a profile along their bottom edge. Params: `doors` (default one per 45 cm),
 * `loft` (share of the height, default 0.25), `mirror` (main shutters are
 * mirrors in slim frames), `plinth` (mm, default 80).
 */
export function buildHingedWardrobe(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const mirror = param(entry, 'mirror', false);
  const n = Math.max(2, param(entry, 'doors', Math.round(W / (mirror ? 0.5 : 0.45))));
  const loftShare = THREE.MathUtils.clamp(param(entry, 'loft', 0.25), 0, 0.4);
  const plinth = Math.min(param(entry, 'plinth', 80) / 1000, H * 0.05);
  const t = 0.022; // boards: a thick oak frame round the shutters
  const ft = 0.019; // shutters
  const back = -D / 2;
  const zFace = D / 2 - 0.002; // the shutters sit a hair behind the frame
  const zc = 0;
  // Carcass: oak sides to the floor and a top framing the inset shutters, a bottom over the
  // recessed plinth, back panel, a fixed shelf behind the loft line.
  for (const s of [-1, 1]) m.part('carcass', panel(t, H, D, s * (W / 2 - t / 2), 0, zc, 0.003));
  m.part('carcass', panel(W - 2 * t + 0.002, t, D, 0, H - t, zc, 0.003));
  m.part('carcass', panel(W - 2 * t + 0.002, t, D, 0, plinth, zc, 0.003));
  m.part('carcass', panel(W - 2 * t, H - plinth - 2 * t, 0.008, 0, plinth + t, back + 0.012, 0.001));
  m.fixed('lacquer.graphite', panel(W - 2 * t, plinth, 0.016, 0, 0, D / 2 - 0.05, 0.001));
  // Shutters, inset in the frame: a loft row over the main row.
  const y0 = plinth + t + GAP;
  const y1 = H - t - GAP;
  const loftH = loftShare > 0 ? (y1 - y0) * loftShare : 0;
  const split = y1 - loftH;
  const inner = W - 2 * t;
  const dw = (inner - GAP * (n + 1)) / n;
  m.part('carcass', panel(inner, t, D - ft - 0.01, 0, split - t / 2, back + (D - ft - 0.01) / 2));
  for (let i = 0; i < n; i++) {
    const x0 = -inner / 2 + GAP + i * (dw + GAP);
    const x1 = x0 + dw;
    // Pairs open from the middle; an odd last door opens from its left edge.
    const edge = i % 2 === 0 && i < n - 1 ? 'right' : 'left';
    profiledFront(m, x0, x1, y0, loftH > 0 ? split - GAP / 2 : y1, zFace, ft, edge, mirror);
    if (loftH > 0) profiledFront(m, x0, x1, split + GAP / 2, y1, zFace, ft, 'bottom', false);
  }
  return m.build();
}

/* ------------------------------------------------------------ dressing unit */

/**
 * A dressing table against the wall: an oak top over a three-drawer pedestal on
 * the left and a slim drawer over the knee space, a tall arched mirror in an oak
 * frame rising from the back of the top, a round upholstered stool on brass legs
 * tucked under, and a tray with a vase and two bottles on the top. Front +Z.
 */
export function buildDressingUnit(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const topT = 0.028;
  const top = Math.min(0.76, H * 0.46); // writing height
  const back = -D / 2;
  const t = 0.018;
  // The top, softly rounded.
  m.part('carcass', rbox(W, topT, D, 0.006, 0, top - topT, 0, 2));
  // Drawer pedestal on the left, on a recessed plinth.
  const pw = Math.min(0.42, W * 0.44);
  const px = -W / 2 + pw / 2;
  const plinth = 0.06;
  const cz = back + (D - 0.02) / 2;
  const cd = D - 0.02;
  const below = top - topT;
  for (const s of [-1, 1]) m.part('carcass', panel(t, below, cd, px + s * (pw / 2 - t / 2), 0, cz));
  m.part('carcass', panel(pw - 2 * t, t, cd, px, plinth, cz));
  m.part('carcass', panel(pw - 2 * t, below - plinth - t, 0.008, px, plinth + t, back + 0.006, 0.001));
  m.fixed('lacquer.graphite', panel(pw - 2 * t, plinth, 0.016, px, 0, back + cd - 0.04, 0.001));
  const zFront = back + cd;
  const fh = (below - plinth - t - 4 * GAP) / 3;
  for (let i = 0; i < 3; i++) {
    const y = plinth + t + GAP + i * (fh + GAP);
    m.part('fronts', rbox(pw - 2 * t - 2 * GAP, fh, 0.018, 0.0025, px, y, zFront - 0.009, 1));
    // A slim brass bar pull.
    const py = y + fh - 0.05;
    m.part('handles', cyl(0.005, 0.005, Math.min(0.14, pw * 0.4), px, py, zFront + 0.016, 'x', 10));
    for (const s of [-1, 1]) m.part('handles', cyl(0.0035, 0.0035, 0.016, px + s * Math.min(0.06, pw * 0.17), py, zFront + 0.008, 'z', 8));
  }
  // The knee space: a slim drawer box under the top, carried by a tapered leg at each outer corner.
  const kx0 = px + pw / 2;
  const kx1 = W / 2;
  const boxH = 0.1;
  const legW = 0.036;
  const kw = kx1 - kx0;
  m.part('carcass', panel(kw - legW / 2, boxH, 0.016, kx0 + (kw - legW / 2) / 2, below - boxH, back + 0.012));
  m.part('carcass', panel(kw - legW / 2, t, cd - 0.02, kx0 + (kw - legW / 2) / 2, below - boxH, cz));
  for (const z of [back + 0.03, zFront - legW / 2]) m.part('carcass', beam([kx1 - legW / 2, 0, z], [kx1 - legW / 2, below, z], legW, legW, 0.006, 1, 0.7));
  m.part('fronts', rbox(kw - legW - 2 * GAP, boxH - t - 2 * GAP, 0.018, 0.0025, kx0 + (kw - legW) / 2, below - boxH + t + GAP, zFront - 0.009, 1));
  m.part('handles', rbox(Math.min(0.12, kw * 0.3), 0.005, 0.02, 0.002, kx0 + (kw - legW) / 2, below - 0.012, zFront + 0.005, 1));

  // Stool, tucked under the knee space.
  const sr = Math.min(0.19, kw * 0.36, D * 0.4);
  const sh = Math.min(0.46, below - boxH - 0.04);
  const sx = kx0 + (kw - legW) / 2;
  const sz = Math.min(D / 2 - sr - 0.005, zFront - sr * 0.85);
  const ch = 0.09;
  m.part('upholstery', lathe([[0, 0], [sr * 0.92, 0], [sr, ch * 0.22], [sr, ch * 0.65], [sr * 0.93, ch * 0.95], [sr * 0.5, ch], [0, ch * 1.03]], sx, sh - ch, sz, 36));
  m.part('carcass', cyl(sr * 0.9, sr * 0.9, 0.018, sx, sh - ch - 0.018, sz, 'y', 32));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const r0 = sr * 0.62;
    const r1 = sr * 0.84;
    m.part('handles', beam([sx + Math.cos(a) * r1, 0, sz + Math.sin(a) * r1], [sx + Math.cos(a) * r0, sh - ch - 0.018, sz + Math.sin(a) * r0], 0.014, 0.014, 0.006, 1));
  }
  m.part('handles', new THREE.TorusGeometry(sr * 0.74, 0.004, 6, 32).rotateX(Math.PI / 2).translate(sx, sh * 0.32, sz));

  // A tall arched mirror in an oak frame, standing on the back of the top.
  const mw = Math.min(W * 0.52, 0.6);
  const mh = H - top;
  const mx = W * 0.06;
  const fr = 0.03;
  const outer = archShape(mw, mh);
  const inner = archShape(mw - 2 * fr, mh - 2 * fr, fr);
  const ring = new THREE.Shape(outer.getPoints(24));
  ring.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
  const frameD = 0.03;
  m.part('carcass', upright(ring, frameD, 0.004).translate(mx, top, back));
  m.part('carcass', upright(archShape(mw - 0.01, mh - 0.01), 0.006).translate(mx, top + 0.005, back + 0.001));
  m.fixed('glass.mirror', upright(archShape(mw - 2 * fr + 0.006, mh - 2 * fr + 0.006), 0.005).translate(mx, top + fr - 0.003, back + 0.012));

  // On the top: an oak tray with a white vase and two bottles.
  const rand = rng(hash(entry.id));
  const tx = -W / 2 + Math.min(0.24, pw * 0.55);
  const tz = back + D * 0.45;
  m.part('carcass', rbox(0.24, 0.012, 0.14, 0.004, tx, top, tz, 2));
  m.fixed('ceramic.white', vase(Math.min(0.2, mh * 0.3), 0.04, tx - 0.06, top + 0.012, tz));
  for (const [dx, h] of [[0.03, 0.1], [0.075, 0.075]] as const) {
    m.fixed('ceramic.white', lathe([[0, 0], [0.02, 0], [0.022, 0.006], [0.022, h * 0.7], [0.01, h * 0.8], [0.008, h], [0, h]], tx + dx, top + 0.012, tz + (rand() - 0.5) * 0.03, 16));
    m.part('handles', cyl(0.011, 0.011, 0.018, tx + dx, top + 0.012 + h, tz, 'y', 12));
  }
  return m.build();
}

/** A flat shape drawn in XY, extruded `depth` towards +Z from z = 0; the bevel stays inside the outline. */
function upright(shape: THREE.Shape, depth: number, bevel = 0): G {
  const b = Math.min(bevel, depth / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * Math.max(b, 0), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 16, bevelOffset: -b });
  return g.translate(0, 0, Math.max(b, 0));
}

/** An arch in the XY plane: `w` wide, `h` tall from y = `y0`, a semicircular top. */
export function archShape(w: number, h: number, y0 = 0): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, y0);
  s.lineTo(r, y0);
  s.lineTo(r, y0 + h - r);
  s.absarc(0, y0 + h - r, r, 0, Math.PI, false);
  s.lineTo(-r, y0);
  return s;
}

/* ------------------------------------------------------------- writing desk */

/**
 * A writing table: a rounded oak top on four tapered legs, an apron box under
 * the top holding a drawer on the right and a slim open shelf for notebooks on
 * the left, brass pull and brass leg shoes. Height stays 750 mm.
 */
export function buildWritingDesk(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const topT = 0.026;
  const leg = 0.042;
  const inset = 0.035;
  const lx = W / 2 - inset - leg / 2;
  const lz = D / 2 - inset - leg / 2;
  const under = H - topT;
  const boxH = Math.min(0.12, H * 0.16);
  m.part('carcass', slab(roundedRect(W, D, 0.03), topT, 0, under, 0, 0.005));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.part('carcass', beam([sx * lx, 0.02, sz * lz], [sx * lx, under, sz * lz], leg, leg, 0.007, 1, 0.68));
      m.part('handles', beam([sx * lx, 0, sz * lz], [sx * lx, 0.022, sz * lz], leg * 0.72, leg * 0.72, 0.004, 1));
    }
  }
  // Apron box between the legs: back, ends and a bottom board that is the slim shelf.
  const ax = lx - leg / 2;
  const az0 = -lz + leg / 2;
  const az1 = lz + leg / 2 - 0.004;
  const y0 = under - boxH;
  m.part('carcass', panel(2 * ax, boxH, 0.018, 0, y0, -lz));
  for (const s of [-1, 1]) m.part('carcass', panel(0.018, boxH, az1 - az0, s * (ax - 0.009), y0, (az0 + az1) / 2));
  m.part('carcass', panel(2 * ax, 0.016, az1 - az0 - 0.01, 0, y0, (az0 + az1) / 2 - 0.005));
  // The drawer on the right, a divider, the open shelf on the left.
  const dw = Math.min(0.5, W * 0.4);
  const dx1 = ax - 0.018;
  const dx0 = dx1 - dw;
  m.part('carcass', panel(0.016, boxH - 0.016, az1 - az0 - 0.02, dx0 - 0.008 - GAP, y0 + 0.016, (az0 + az1) / 2 - 0.01));
  m.part('fronts', rbox(dw - 2 * GAP, boxH - 0.016 - 2 * GAP, 0.018, 0.0025, (dx0 + dx1) / 2, y0 + 0.016 + GAP, az1 - 0.009, 1));
  m.part('handles', rbox(Math.min(0.14, dw * 0.35), 0.005, 0.022, 0.002, (dx0 + dx1) / 2, under - 0.03, az1 + 0.006, 1));
  m.part('carcass', panel(dx0 - 0.016 - GAP + ax - 0.018, 0.012, 0.02, (-ax + 0.018 + dx0 - 0.016 - GAP) / 2, y0, az1 - 0.01));
  // Notebooks and a pen tray on the shelf.
  const rand = rng(hash(entry.id));
  const emit = (role: 'pages' | number, g: G) => m.fixed(role === 'pages' ? PAGES : COVERS[2], g);
  const sx0 = -ax + 0.018;
  const shelfW = dx0 - 0.016 - GAP - sx0;
  if (shelfW > 0.3) {
    bookStack(emit, rand, 3, sx0 + 0.17, y0 + 0.016, (az0 + az1) / 2, 0.27, Math.min(0.2, az1 - az0 - 0.04), boxH - 0.04);
    m.part('carcass', rbox(0.2, 0.014, 0.07, 0.004, sx0 + Math.min(shelfW - 0.12, 0.42), y0 + 0.016, (az0 + az1) / 2 + 0.03, 2));
  }
  return m.build();
}

/* ------------------------------------------------------ shoe rack and ledges */

/**
 * A closed shoe cabinet, about 900 mm high on slim legs, with fluted tilt-out
 * flaps and brass ledge pulls, under three floating oak ledges with brass lips.
 * Ledges hold a stack of books, a white vase and a small bowl. Back at -Z.
 * Params: `ledges` (default 3), `cabinet` (its height in mm, default 47% of the height).
 */
export function buildShoeRackLedges(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const { w, h } = entry.dims;
  const cabH = Math.round(param(entry, 'cabinet', h * 0.474));
  const cabinet = buildCase(
    variant(entry, { rows: [{ h: 1, cols: 2, kind: 'flap' }, { h: 1, cols: 2, kind: 'flap' }], legs: Math.round(cabH * 0.11), handle: 'ledge', style: 'fluted', fronts: 'inset' }, { h: cabH }),
    ctx,
  );
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const n = Math.max(2, param(entry, 'ledges', 3));
  const lt = Math.min(0.034, H * 0.018);
  const ld = Math.min(D * 0.62, 0.22);
  const back = -D / 2;
  const first = cabH / 1000 + Math.max(0.24, H * 0.17);
  const pitch = (H - lt - first) / (n - 1);
  const rand = rng(hash(entry.id));
  const emit = (role: 'pages' | number, g: G) => m.fixed(role === 'pages' ? PAGES : COVERS[1], g);
  for (let i = 0; i < n; i++) {
    const y = first + i * pitch;
    // Staggered lengths: the middle ledge is shorter, offset to the right.
    const lw = i % 2 === 1 ? W * 0.72 : W;
    const x = i % 2 === 1 ? W / 2 - lw / 2 : 0;
    m.part('carcass', rbox(lw, lt, ld, 0.005, x, y, back + ld / 2, 2));
    m.part('handles', rbox(lw - 0.03, 0.01, 0.005, 0.0015, x, y + lt - 0.003, back + ld - 0.0025, 1));
    if (i === n - 1) continue;
    const room = pitch - lt - 0.04;
    if (i === 0) {
      bookStack(emit, rand, 3, -W / 2 + 0.2, y + lt, back + ld * 0.5, 0.24, ld * 0.75, room * 0.4);
      m.fixed('ceramic.white', vase(Math.min(room, 0.24), 0.05, W / 2 - 0.16, y + lt, back + ld * 0.5));
    } else {
      m.fixed('ceramic.white', lathe([[0, 0], [0.04, 0], [0.07, 0.03], [0.085, 0.06], [0.08, 0.062], [0.065, 0.035], [0, 0.012]], x + lw * 0.25, y + lt, back + ld * 0.5, 28));
      bookStack(emit, rand, 2, x - lw * 0.15, y + lt, back + ld * 0.5, 0.2, ld * 0.7, room * 0.3);
    }
  }
  // A key tray on the cabinet.
  m.part('handles', lathe([[0, 0], [0.09, 0], [0.1, 0.008], [0.1, 0.018], [0.094, 0.018], [0.09, 0.006], [0, 0.006]], 0, 0, 0, 32).scale(1, 1, 0.6).translate(-W / 2 + 0.2, cabH / 1000, back + D * 0.45));
  return absorb(cabinet, m.build());
}

/** Generators of this file, registered through `premium/essentials.ts`. */
export const BEDROOM_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsWardrobe: buildHingedWardrobe,
  essentialsDressing: buildDressingUnit,
  essentialsWritingDesk: buildWritingDesk,
  essentialsShoeRack: buildShoeRackLedges,
};

