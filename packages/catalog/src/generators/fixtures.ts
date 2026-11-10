/**
 * Small parametric furniture, lighting and decor that round out the kit.
 * Same conventions as every generator: metres, bottom-centre origin, front +Z,
 * built to the entry's `dims`.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import type { PaletteKey } from '../palette';
import { Builder, param, size } from './kit';

type Built = ReturnType<Builder['build']>;

/** Round side table on a tripod. */
export function buildSideTable(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const top = 0.025;
  const finish = param<PaletteKey>(entry, 'finish', 'wood');
  b.add(finish, new THREE.CylinderGeometry(1, 1, top, 32).scale(W / 2, 1, D / 2).translate(0, H - top / 2, 0));
  const ring = Math.min(W, D) * 0.3;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    b.cyl('blackMetal', 0.011, 0.011, H - top, Math.cos(a) * ring, 0, Math.sin(a) * ring, 'y', 10);
  }
  b.cyl('blackMetal', ring + 0.011, ring + 0.011, 0.008, 0, H * 0.42, 0, 'y', 24);
  return b.build(`side-table:${entry.id}`);
}

/** Open utility shelving: four posts and evenly spaced shelves. `params.shelves` (default 5). */
export function buildShelfRack(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const shelves = param<number>(entry, 'shelves', 5);
  const post = 0.03;
  const board = 0.025;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('steelMid', post, H, post, sx * (W / 2 - post / 2), 0, sz * (D / 2 - post / 2));
  for (let i = 0; i < shelves; i++) {
    const y = 0.08 + ((H - board - 0.08) * i) / (shelves - 1);
    b.box(param<PaletteKey>(entry, 'finish', 'steelLight'), W - 0.01, board, D - 0.01, 0, y, 0);
  }
  return b.build(`shelf-rack:${entry.id}`);
}

/** Floating wall shelf on two brackets. */
export function buildWallShelf(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const board = 0.03;
  b.box(param<PaletteKey>(entry, 'finish', 'wood'), W, board, D, 0, H - board, 0);
  for (const s of [-1, 1]) {
    const x = s * W * 0.32;
    b.box('blackMetal', 0.03, H - board, 0.006, x, 0, -D / 2 + 0.003);
    b.box('blackMetal', 0.03, 0.006, D * 0.8, x, H - board - 0.006, -D / 2 + D * 0.4);
    b.add('blackMetal', new THREE.BoxGeometry(0.02, 0.005, Math.hypot(D * 0.6, H - board - 0.02)).rotateX(-Math.atan2(H - board - 0.02, D * 0.6)).translate(x, (H - board) / 2, -D / 2 + D * 0.3));
  }
  return b.build(`wall-shelf:${entry.id}`);
}

/** Framed mirror. `params.shape`: 'rect' | 'round'; `params.frame`: palette key. */
export function buildMirror(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const frame = param<PaletteKey>(entry, 'frame', 'blackMetal');
  const glass = Math.min(0.006, D * 0.3);
  const edge = Math.max(0.012, Math.min(W, H) * 0.035);
  if (param<string>(entry, 'shape', 'rect') === 'round') {
    b.add(frame, new THREE.CylinderGeometry(1, 1, D - glass, 48).rotateX(Math.PI / 2).scale(W / 2, H / 2, 1).translate(0, H / 2, -glass / 2));
    b.add('mirror', new THREE.CylinderGeometry(1, 1, glass, 48).rotateX(Math.PI / 2).scale(W / 2 - edge, H / 2 - edge, 1).translate(0, H / 2, D / 2 - glass / 2));
  } else {
    b.box(frame, W, H, D - glass, 0, 0, -glass / 2);
    b.box('mirror', W - 2 * edge, H - 2 * edge, glass, 0, edge, D / 2 - glass / 2);
  }
  return b.build(`mirror:${entry.id}`);
}

/** Towel rail with a towel folded over it. */
export function buildTowelRail(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const towel = 0.028;
  const bz = D / 2 - towel / 2;
  const by = H - towel / 2;
  b.cyl('chrome', 0.009, 0.009, W, 0, by, bz, 'x', 12);
  for (const s of [-1, 1]) {
    b.box('chrome', 0.014, 0.014, D - towel / 2, s * (W / 2 - 0.02), by - 0.007, -D / 2 + (D - towel / 2) / 2);
    b.cyl('chrome', 0.022, 0.022, 0.006, s * (W / 2 - 0.02), by, -D / 2 + 0.003, 'z', 16);
  }
  b.rounded(param<PaletteKey>(entry, 'finish', 'fabricCream'), towel, H, W * 0.56, towel / 2 - 0.001, -W * 0.06, H / 2, bz, 'x');
  b.box('fabricSand', W * 0.56 + 0.002, 0.03, towel + 0.001, -W * 0.06, H * 0.12, bz);
  return b.build(`towel-rail:${entry.id}`);
}

/** Framed wall art: frame, mount and a few flat colour fields. `params.frame`, `params.seed`. */
export function buildArtFrame(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const layer = Math.min(0.002, D * 0.1);
  const frameD = D - 2 * layer;
  const edge = Math.max(0.012, Math.min(W, H) * 0.035);
  const mount = Math.min(W, H) * 0.09;
  b.box(param<PaletteKey>(entry, 'frame', 'blackMetal'), W, H, frameD, 0, 0, -D / 2 + frameD / 2);
  b.box('white', W - 2 * edge, H - 2 * edge, layer, 0, edge, -D / 2 + frameD + layer / 2);
  const aw = W - 2 * edge - 2 * mount;
  const ah = H - 2 * edge - 2 * mount;
  const z = D / 2 - layer / 2;
  const y0 = edge + mount;
  const schemes: PaletteKey[][] = [
    ['fabricSand', 'fabricClay', 'fabricSage', 'fabricBlue'],
    ['fabricCream', 'fabricSage', 'fabricCharcoal', 'fabricClay'],
    ['fabricSand', 'fabricBlue', 'fabricCharcoal', 'fabricSand'],
  ];
  const c = schemes[param<number>(entry, 'seed', 0) % schemes.length]!;
  // A calm colour-block composition that fills the art area exactly.
  b.box(c[0]!, aw, ah, layer * 0.5, 0, y0, z - layer * 0.25);
  b.box(c[1]!, aw * 0.42, ah * 0.58, layer * 0.5, -aw * 0.29, y0, z + layer * 0.25);
  b.box(c[2]!, aw * 0.58, ah * 0.34, layer * 0.5, aw * 0.21, y0 + ah * 0.66, z + layer * 0.25);
  b.add(c[3]!, new THREE.CylinderGeometry(1, 1, layer * 0.5, 32).rotateX(Math.PI / 2).scale(Math.min(aw, ah) * 0.17, Math.min(aw, ah) * 0.17, 1).translate(aw * 0.2, y0 + ah * 0.3, z + layer * 0.25));
  return b.build(`art:${entry.id}`);
}

/** Flush ceiling light: base plate with an opal dome below. */
export function buildFlushLight(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const base = Math.min(0.02, H * 0.3);
  b.add('white', new THREE.CylinderGeometry(1, 1, base, 40).scale(W / 2, 1, D / 2).translate(0, H - base / 2, 0));
  b.dome('glow', (W / 2) * 0.9, H - base, (D / 2) * 0.9, 0, H - base, 0, true);
  return b.build(`flush-light:${entry.id}`);
}

/** Pendant: ceiling rose, cord and a metal shade with a lit diffuser. `params.shade`: palette key. */
export function buildPendant(entry: CatalogEntry): Built {
  const { W, H } = size(entry);
  const b = new Builder();
  const R = W / 2;
  const shadeH = Math.min(H * 0.38, R * 1.25);
  b.cyl('blackMetal', 0.05, 0.05, 0.02, 0, H - 0.02, 0, 'y', 20);
  b.cyl('blackMetal', 0.004, 0.004, H - 0.02 - shadeH, 0, shadeH, 0, 'y', 8);
  b.cyl(param<PaletteKey>(entry, 'shade', 'blackMetal'), R * 0.22, R, shadeH - 0.004, 0, 0.004, 0, 'y', 32);
  b.cyl('glow', R * 0.93, R * 0.93, 0.004, 0, 0, 0, 'y', 32);
  b.cyl('brushed', R * 0.24, R * 0.24, 0.03, 0, shadeH - 0.004, 0, 'y', 16);
  return b.build(`pendant:${entry.id}`);
}

/** Recessed downlight: trim ring and a lit lens. */
export function buildDownlight(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const lens = Math.min(0.002, H * 0.2);
  b.add('white', new THREE.CylinderGeometry(1, 0.86, H - lens, 32).scale(W / 2, 1, D / 2).translate(0, lens + (H - lens) / 2, 0));
  b.add('glow', new THREE.CylinderGeometry(1, 1, lens, 32).scale((W / 2) * 0.74, 1, (D / 2) * 0.74).translate(0, lens / 2, 0));
  return b.build(`downlight:${entry.id}`);
}

/** LED batten on the wall: slim body and a lit diffuser. */
export function buildBatten(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const cap = 0.02;
  b.box('plastic', W, H, D * 0.45, 0, 0, -D / 2 + D * 0.225);
  b.rounded('glow', D * 0.75, H * 0.8, W - 2 * cap, H * 0.38, 0, H / 2, D / 2 - D * 0.375, 'x');
  for (const s of [-1, 1]) b.box('plastic', cap, H, D, s * (W / 2 - cap / 2), 0, 0);
  return b.build(`batten:${entry.id}`);
}

/** Rectangular planter with a row of shrubs. `params.finish`: planter colour. */
export function buildPlanter(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const boxH = Math.min(H * 0.45, 0.4);
  const wall = 0.025;
  const finish = param<PaletteKey>(entry, 'finish', 'white');
  b.box(finish, W, boxH, wall, 0, 0, D / 2 - wall / 2);
  b.box(finish, W, boxH, wall, 0, 0, -D / 2 + wall / 2);
  b.box(finish, wall, boxH, D - 2 * wall, -W / 2 + wall / 2, 0, 0);
  b.box(finish, wall, boxH, D - 2 * wall, W / 2 - wall / 2, 0, 0);
  b.box('soil', W - 2 * wall, boxH - 0.03, D - 2 * wall, 0, 0, 0);
  const n = Math.max(2, Math.round(W / 0.26));
  const pitch = (W - 2 * wall) / n;
  const r = Math.min(pitch * 0.55, D / 2 - wall);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + wall + pitch * (i + 0.5);
    const tall = i % 2 === 0;
    const top = tall ? H : boxH + (H - boxH) * 0.72;
    const y0 = boxH - 0.04;
    const h = top - y0;
    b.cyl(tall ? 'plant' : 'plantDark', r * 0.3, r, h * 0.45, x, y0, tall ? 0 : D * 0.06, 'y', 7);
    b.cyl(tall ? 'plant' : 'plantDark', 0, r * 0.82, h * 0.6, x, y0 + h * 0.4, tall ? 0 : D * 0.06, 'y', 7);
  }
  return b.build(`planter:${entry.id}`);
}

/** Folding clothes-drying rack with a rail deck on crossed legs. */
export function buildDryingRack(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const tube = 0.016;
  const deckY = H - tube;
  for (const s of [-1, 1]) b.box('steelLight', W, tube, tube, 0, deckY, s * (D / 2 - tube / 2));
  for (const s of [-1, 1]) b.box('steelLight', tube, tube, D, s * (W / 2 - tube / 2), deckY, 0);
  const rails = 9;
  for (let i = 1; i < rails; i++) b.cyl('steelLight', 0.004, 0.004, W - 2 * tube, 0, deckY + tube / 2, -D / 2 + (D * i) / rails, 'x', 6);
  const reach = D - 0.08;
  const len = Math.hypot(reach, deckY);
  const lean = Math.atan2(reach, deckY);
  for (const sx of [-1, 1])
    for (const s of [-1, 1])
      b.add('steelMid', new THREE.BoxGeometry(tube, len - tube, tube).rotateX(s * lean).translate(sx * (W / 2 - tube * 1.6) + s * sx * tube * 0.55, deckY / 2, 0));
  for (const s of [-1, 1]) b.box('steelMid', W - tube * 2, tube * 0.7, tube * 0.7, 0, 0, s * (reach / 2 - 0.01));
  // A towel and a shirt-sized cloth over the rails.
  b.box('fabricSand', W * 0.22, 0.5, 0.012, -W * 0.22, H - 0.5, D * 0.18);
  b.box('fabricBlue', W * 0.18, 0.36, 0.012, W * 0.2, H - 0.36, -D * 0.12);
  return b.build(`drying-rack:${entry.id}`);
}
