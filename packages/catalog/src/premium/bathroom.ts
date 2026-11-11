/**
 * Premium generators: bathroom. Toilets, basins, vanity units, mirror cabinet
 * and mirror, shower enclosures, bathtub and towel rail.
 *
 * Sanitary ware is modelled as smooth sweeps (`sweep`, a profile run round a
 * rounded rectangle) and lathes: one continuous profile up the outside, over a
 * rim and down inside, so basins and bowls are real recesses with soft,
 * glossy edges. Fittings (taps, hinges, rails, the flush plate) share one
 * metal slot; glass is 8 mm panels in its own slot.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { SHADOW } from './kitchen';
import { alongX, arcLathe, deform, disc, edgeProfile, plate, rrect, sweep, withHoles } from './kitchen.kit';
import { Model, box, cushion, cyl, param, rbox, tube, type BuildContext } from './kit';

/* ------------------------------------------------------------------ slots */

export const B_CERAMIC: FinishSlot = { id: 'ceramic', label: 'Ceramic', kind: 'ceramic', default: 'ceramic.white' };
export const B_FITTINGS: FinishSlot = { id: 'fittings', label: 'Taps and fittings', kind: 'metal', default: 'metal.black' };
export const B_GLASS: FinishSlot = { id: 'glass', label: 'Glass', kind: 'glass', default: 'glass.clear' };
export const B_TRAY: FinishSlot = { id: 'tray', label: 'Shower tray', kind: 'stone', default: 'stone.quartz.white' };
export const B_FRONTS: FinishSlot = { id: 'fronts', label: 'Vanity fronts', kind: 'wood', default: 'wood.oak' };
export const B_TOP: FinishSlot = { id: 'top', label: 'Counter top', kind: 'stone', default: 'stone.marble.white' };
export const B_BASIN: FinishSlot = { id: 'basin', label: 'Basin', kind: 'ceramic', default: 'ceramic.white' };
export const B_PANEL: FinishSlot = { id: 'panel', label: 'Wall boxing', kind: 'stone', default: 'stone.terrazzo' };
export const B_BODY: FinishSlot = { id: 'body', label: 'Cabinet', kind: 'lacquer', default: 'lacquer.white' };
export const B_MIRROR: FinishSlot = { id: 'mirror', label: 'Mirror', kind: 'glass', default: 'glass.mirror' };
export const B_SHELF: FinishSlot = { id: 'shelf', label: 'Shelf', kind: 'wood', default: 'wood.oak' };
export const B_RAIL: FinishSlot = { id: 'rail', label: 'Rail', kind: 'metal', default: 'metal.black' };
export const B_TOWEL: FinishSlot = { id: 'towel', label: 'Towel', kind: 'fabric', default: 'fabric.cotton.white' };

export const SANITARY_SLOTS: FinishSlot[] = [B_CERAMIC, B_FITTINGS];
export const WALL_TOILET_SLOTS: FinishSlot[] = [B_CERAMIC, B_PANEL, B_FITTINGS];
export const VANITY_SLOTS: FinishSlot[] = [B_FRONTS, B_TOP, B_BASIN, B_FITTINGS];
export const SHOWER_SLOTS: FinishSlot[] = [B_GLASS, B_TRAY, B_FITTINGS];
export const MIRROR_CABINET_SLOTS: FinishSlot[] = [B_BODY, B_MIRROR];
export const MIRROR_SHELF_SLOTS: FinishSlot[] = [B_MIRROR, B_SHELF, B_FITTINGS];
export const TOWEL_RAIL_SLOTS: FinishSlot[] = [B_RAIL, B_TOWEL];

const LIGHT = '#fff3dc';
const { PI } = Math;

/* ---------------------------------------------------------------- pieces */

/**
 * Deck-mounted single-lever basin mixer standing on (x, y, z), `h` tall to the
 * top of its lever, its spout reaching `reach` towards +Z.
 */
export function basinMixer(m: Model, x: number, y: number, z: number, h: number, reach: number, slot = 'fittings'): void {
  const r = Math.min(0.016, h * 0.11);
  m.part(slot, cyl(r * 1.45, r * 1.5, 0.004, x, y, z, 'y', 24));
  m.part(slot, cyl(r, r, h * 0.8, x, y + 0.003, z, 'y', 20));
  m.part(slot, cyl(r, r * 0.92, 0.012, x, y + h * 0.8, z, 'y', 20));
  const sy = y + h * 0.66;
  const sr = r * 0.5;
  m.part(
    slot,
    tube(
      [
        [x, sy, z],
        [x, sy + 0.004, z + reach * 0.45],
        [x, sy - 0.004, z + reach * 0.85],
        [x, sy - 0.018, z + reach],
      ],
      sr,
      false,
      10,
    ),
  );
  // Lever lying back over the body.
  const lever = Math.min(0.05, h * 0.35);
  m.part(slot, rbox(0.011, 0.008, lever, 0.0035, x, y + h - 0.008, z - lever / 2 + 0.008, 2));
}

/** A drain: a fitting-finish ring round a dark grate, lying on y. */
function drain(m: Model, x: number, y: number, z: number, r = 0.022, slot = 'fittings'): void {
  m.part(slot, disc(r, 0.002, x, y, z, 24));
  m.fixed(SHADOW, disc(r * 0.72, 0.0025, x, y, z, 20));
}

/**
 * A glazed bowl recessed from a rim at `rimY`: rounded-rectangle opening
 * (half sizes hw, hd, corner radius rc) centred on (x, z), `depth` deep, with a
 * soft rim lip `lip` above the surrounding surface, a floor and a drain.
 */
function bowl(m: Model, slot: string, o: { hw: number; hd: number; rc: number; x: number; z: number; rimY: number; depth: number; lip?: number }): void {
  const lip = o.lip ?? 0;
  const top = o.rimY + lip;
  const prof: [number, number][] = [];
  if (lip > 0) prof.push([0.012, o.rimY - 0.0005], [0.012, o.rimY + lip * 0.4], [0.008, top], [0.002, top - 0.0005]);
  else prof.push([0.0005, top]);
  const d = o.depth;
  const floor = Math.min(o.hw, o.hd) * 0.45;
  prof.push([0, top - 0.004], [-0.004, top - d * 0.25], [-0.016, top - d * 0.68], [-0.045, top - d * 0.92], [-floor, top - d]);
  m.part(slot, sweep(prof, o.hw, o.hd, o.rc, o.x, 0, o.z, 6));
  // The sweep collapses to its corner centres; a flat floor closes what is left.
  const rcf = Math.max(0, o.rc - floor);
  const fw = 2 * Math.max(o.hw - floor, 0.001);
  const fd = 2 * Math.max(o.hd - floor, 0.001);
  m.part(slot, plate(rrect(fw + 0.004, fd + 0.004, rcf + 0.002, o.x, o.z), 0.001, top - d - 0.0006, 8));
  drain(m, o.x, top - d, o.z + o.hd * 0.1, Math.min(0.022, o.hw * 0.25));
}

/** Clamps every vertex behind z = zMin onto it: a flat back against a wall. */
const flatBack = (g: THREE.BufferGeometry, zMin: number) => deform(g, (x, y, z) => [x, y, Math.max(z, zMin)]);

/* ----------------------------------------------------------------- toilet */

/**
 * Toilet. `style` 'round' (soft egg-shaped pan) or 'square' (crisper, almost
 * vertical sides); `mount` 'floor' (close-coupled with a cistern on the pan)
 * or 'wall' (a wall-hung pan in front of a boxed-in cistern with a flush
 * plate). Seat and closed lid on top, front towards +Z.
 */
export function buildToilet(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const square = param<'round' | 'square'>(entry, 'style', 'round') === 'square';
  const wall = param<'floor' | 'wall'>(entry, 'mount', 'floor') === 'wall';
  const rim = Math.min(0.4, H * 0.52);
  const taper = square ? 0.04 : 0.16;

  // Wall-hung: a boxed-in cistern across the back carries the pan and the flush plate.
  const boxD = wall ? Math.min(0.16, D * 0.24) : 0;
  const cistD = wall ? 0 : Math.min(0.19, D * 0.27);
  const panBack = -D / 2 + (wall ? boxD : cistD * 0.45);
  const panW = wall ? Math.min(W, 0.37) : W;
  const hw = (panW / 2) * (square ? 0.97 : 0.96) / (1 + taper);
  const hd = (D / 2 - panBack) / 2;
  const cz = panBack + hd;
  const rc = square ? Math.min(0.07, hw * 0.45) : hw * 0.98;
  const egg = (g: THREE.BufferGeometry) =>
    deform(g, (x, y, z) => [x * (1 - taper * ((z - cz) / hd)), y, Math.max(z, panBack - 0.002)]);

  // Pan: foot (or the underside of a wall-hung pan), sides, rim.
  const y0 = wall ? Math.max(0.1, rim - 0.2) : 0;
  const prof: [number, number][] = wall
    ? [
        [-hw * 0.9, y0],
        [-hw * 0.55, y0 + 0.004],
        [-hw * 0.22, y0 + 0.035],
        [-hw * 0.06, y0 + (rim - y0) * 0.55],
        [0, rim - 0.035],
      ]
    : square
      ? [
          [-0.028, 0],
          [-0.026, 0.012],
          [-0.012, 0.035],
          [-0.004, rim * 0.5],
          [0, rim - 0.03],
        ]
      : [
          [-hw * 0.5, 0],
          [-hw * 0.48, 0.012],
          [-hw * 0.42, rim * 0.22],
          [-hw * 0.22, rim * 0.55],
          [-hw * 0.05, rim * 0.82],
          [0, rim - 0.035],
        ];
  prof.push([0, rim - 0.012], [-0.006, rim - 0.002], [-0.02, rim], [-0.05, rim]);
  m.part('ceramic', egg(sweep(prof, hw, hd, rc, 0, 0, cz, square ? 5 : 10)));
  // Seat and closed lid, from the front of the cistern (or the wall) to the front of the pan.
  const sb = wall ? panBack + 0.004 : -D / 2 + cistD + 0.006;
  const shd = (D / 2 - 0.004 - sb) / 2;
  const scz = sb + shd;
  const src = square ? rc : Math.min(hw * 0.98, shd);
  const seat: [number, number][] = [
    [-0.05, rim + 0.0005],
    [0.001, rim + 0.002],
    [0.003, rim + 0.01],
    [0, rim + 0.017],
    [-0.05, rim + 0.0175],
  ];
  m.part('ceramic', egg(sweep(seat, hw, shd, src, 0, 0, scz, square ? 5 : 10)));
  const lid: [number, number][] = [
    [-0.01, rim + 0.018],
    [0.002, rim + 0.021],
    [0.003, rim + 0.03],
    [0, rim + 0.04],
    [-0.035, rim + 0.046],
    [-hw, rim + 0.05],
  ];
  const lhw = hw - 0.003;
  const lhd = shd - 0.003;
  const lrc = Math.max(0.01, src - 0.003);
  m.part('ceramic', egg(sweep(lid, lhw, lhd, lrc, 0, 0, scz, square ? 5 : 10)));
  // Hinge posts at the back of the seat.
  for (const s of [-1, 1]) m.part('fittings', cyl(0.009, 0.009, 0.014, s * hw * 0.55, rim + 0.004, sb + 0.012, 'y', 14));

  if (wall) {
    m.part('panel', rbox(W, H, boxD, 0.004, 0, 0, -D / 2 + boxD / 2, 2));
    // Flush plate on the boxing, two buttons.
    const py = Math.min(H - 0.08, 1.0);
    const pz = -D / 2 + boxD;
    m.part('fittings', rbox(0.24, 0.155, 0.007, 0.004, 0, py - 0.0775, pz + 0.0035, 2));
    for (const s of [-1, 1]) m.part('fittings', rbox(0.1, 0.105, 0.005, 0.003, s * 0.054, py - 0.0525, pz + 0.009, 2));
    m.fixed(SHADOW, box(0.004, 0.106, 0.002, 0, py - 0.053, pz + 0.0075));
  } else {
    // Cistern on the back of the pan, flush buttons on top.
    const cy = rim - 0.02;
    const r = square ? 0.016 : 0.04;
    m.part('ceramic', rbox(W, H - cy - 0.004, cistD, r, 0, cy, -D / 2 + cistD / 2, square ? 3 : 5));
    const bz = -D / 2 + cistD / 2;
    for (const s of [0, 1]) {
      const g = new THREE.CylinderGeometry(0.024, 0.024, 0.005, 20, 1, false, s * PI + 0.04, PI - 0.08).translate(0, H - 0.0025, bz);
      m.part('fittings', g);
    }
  }
  return m.build();
}

/* ---------------------------------------------------------------- basins */

/**
 * Pedestal basin: a basin with a flat back against the wall, a deck for the
 * mixer behind the bowl, on a column. `style` 'round' | 'square'.
 */
export function buildPedestalBasin(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const square = param<'round' | 'square'>(entry, 'style', 'round') === 'square';
  const tapH = Math.min(0.16, H * 0.16);
  const rim = H - tapH;
  const bodyH = Math.min(0.17, rim * 0.2);
  const hw = W / 2;
  const hd = D / 2 + 0.04;
  const cz = -0.04;
  const rc = square ? 0.06 : Math.min(hw, hd) * 0.92;
  const prof: [number, number][] = [
    [-hw * 0.55, rim - bodyH],
    [-hw * 0.3, rim - bodyH + 0.006],
    [-0.045, rim - bodyH * 0.72],
    [-0.008, rim - bodyH * 0.3],
    [0, rim - 0.018],
    [-0.004, rim - 0.002],
    [-0.014, rim],
    [-0.03, rim],
  ];
  m.part('ceramic', flatBack(sweep(prof, hw, hd, rc, 0, 0, cz, square ? 5 : 12), -D / 2));
  // Deck with the bowl cut into it, and the bowl.
  const bhw = hw - 0.055;
  const bhd = Math.min(hd - 0.03, D * 0.36);
  const bz = D / 2 - 0.045 - bhd;
  const brc = square ? 0.05 : Math.min(bhw, bhd) * 0.95;
  const deckOuter = rrect(2 * (hw - 0.03), 2 * (hd - 0.03), Math.max(0.005, rc - 0.03), 0, cz);
  const deck = plate(withHoles(deckOuter, rrect(2 * bhw, 2 * bhd, brc, 0, bz)), 0.002, rim - 0.002, square ? 8 : 20);
  m.part('ceramic', flatBack(deck, -D / 2));
  bowl(m, 'ceramic', { hw: bhw, hd: bhd, rc: brc, x: 0, z: bz, rimY: rim, depth: Math.min(0.13, bodyH * 0.85) });
  // Column.
  const colTop = rim - bodyH + 0.01;
  if (square) {
    m.part('ceramic', rbox(Math.min(0.17, W * 0.3), colTop, Math.min(0.16, D * 0.36), 0.03, 0, 0, -D / 2 + Math.min(0.16, D * 0.36) / 2 + 0.01, 4));
  } else {
    const col = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.006],
        [0.088, 0.03],
        [0.075, colTop * 0.5],
        [0.08, colTop * 0.92],
        [0.1, colTop],
        [0, colTop],
      ].map(([r, y]) => new THREE.Vector2(r!, y!)),
      32,
    );
    m.part('ceramic', flatBack(col.scale(Math.min(1, W / 0.56), 1, Math.min(1, D / 0.46) * 0.8).translate(0, 0, -D / 2 + 0.085), -D / 2));
  }
  basinMixer(m, 0, rim, bz - bhd - Math.min(0.035, (bz - bhd + D / 2) * 0.5), tapH, Math.min(0.12, bhd * 0.7));
  return m.build();
}

/**
 * Vanity unit: a cabinet in the front finish with handleless drawers (a
 * finger groove along each top edge) on slim metal legs, a stone top with
 * inset ceramic basins and a mixer behind each.
 *
 * Params: `basins` (1), `drawers` rows (2), `legs` mm (160).
 */
export function buildVanity(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const basins = Math.max(1, param(entry, 'basins', 1));
  const rows = Math.max(1, param(entry, 'drawers', 2));
  const tapH = Math.min(0.165, H * 0.165);
  const counter = H - tapH;
  const T = 0.02;
  const legH = Math.min(param(entry, 'legs', 160) / 1000, counter * 0.3);
  const over = 0.012;
  const face = D / 2 - over;

  // Cabinet: sides and back panel recessed behind the drawer fronts.
  const cabY = legH;
  const cabTop = counter - T;
  // A hollow carcass: the basins drop into it from the top.
  const cd = D - over - 0.02;
  const cz = -over / 2 - 0.01;
  for (const sx of [-1, 1]) m.part('fronts', rbox(0.018, cabTop - cabY, cd, 0.003, sx * (W / 2 - 0.01), cabY, cz, 2));
  m.part('fronts', rbox(W - 0.002, 0.018, cd, 0.003, 0, cabY, cz, 2));
  m.part('fronts', box(W - 0.036, cabTop - cabY, 0.012, 0, cabY, -D / 2 + 0.006));
  const groove = 0.022;
  const rowH = (cabTop - cabY) / rows;
  for (let r = 0; r < rows; r++) {
    const y1 = cabTop - r * rowH;
    const y0 = y1 - rowH;
    const cols = basins > 1 && W > 1.1 ? 2 : 1;
    const cw = (W - 0.004) / cols;
    for (let c = 0; c < cols; c++) {
      const cx = -W / 2 + 0.002 + cw * (c + 0.5);
      m.part('fronts', rbox(cw - 0.003, y1 - y0 - groove - 0.0015, 0.019, 0.002, cx, y0 + 0.0015, face - 0.0095, 2));
    }
    // The finger groove: a dark recess along the top of the row.
    m.fixed(SHADOW, box(W - 0.006, groove, 0.002, 0, y1 - groove, face - 0.017));
  }
  // Legs: slim square posts at the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) m.part('fittings', rbox(0.022, legH + 0.004, 0.022, 0.003, sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.045) - (sz > 0 ? over : 0), 2));
  }

  // Top with the basin cut-outs, rounded front edge.
  const pitch = W / basins;
  const bhw = Math.min(0.24, pitch / 2 - 0.09);
  const bhd = Math.min(0.17, (D - 0.18) / 2);
  const bz = D / 2 - 0.05 - bhd;
  const brc = Math.min(bhw, bhd) * 0.85;
  const holes = Array.from({ length: basins }, (_, i) => rrect(2 * bhw + 0.002, 2 * bhd + 0.002, brc, -W / 2 + pitch * (i + 0.5), bz));
  const strip = 0.03;
  m.part('top', plate(withHoles(rrect(W, D - strip, 0, 0, -strip / 2), ...holes), T, counter - T, 14));
  m.part('top', alongX(edgeProfile(D / 2 - strip, D / 2, counter - T, counter, 0.004), W, 0, 3));
  for (let i = 0; i < basins; i++) {
    const x = -W / 2 + pitch * (i + 0.5);
    bowl(m, 'basin', { hw: bhw, hd: bhd, rc: brc, x, z: bz, rimY: counter, depth: Math.min(0.13, (cabTop - cabY) * 0.6), lip: 0.004 });
    basinMixer(m, x, counter, bz - bhd - Math.min(0.04, (bz - bhd + D / 2) * 0.45), tapH, Math.min(0.12, bhd * 0.75));
  }
  return m.build();
}

/* ---------------------------------------------------------------- mirrors */

/**
 * Mirror cabinet: a wall cabinet whose door is a mirror on a lacquered
 * frame, with an open shelf niche and a light underneath.
 */
export function buildMirrorCabinet(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const P = 0.016;
  const niche = Math.min(0.13, H * 0.18);
  const doorFace = D / 2;
  const inner = doorFace - 0.022;
  // Carcass: sides, top, bottom, a shelf over the niche, back.
  for (const s of [-1, 1]) m.part('body', rbox(P, H, inner + D / 2, 0.002, s * (W / 2 - P / 2), 0, (inner - D / 2) / 2, 2));
  m.part('body', rbox(W - 2 * P, P, inner + D / 2, 0.002, 0, H - P, (inner - D / 2) / 2, 1));
  m.part('body', rbox(W - 2 * P, P, inner + D / 2 + 0.02, 0.003, 0, 0.004, (inner + 0.02 - D / 2) / 2, 2));
  m.part('body', rbox(W - 2 * P, P, inner + D / 2 + 0.02, 0.003, 0, niche, (inner + 0.02 - D / 2) / 2, 2));
  m.part('body', box(W - 2 * P, H - 2 * P, 0.006, 0, P, -D / 2 + 0.003));
  m.fixed(LIGHT, box(W - 2 * P - 0.03, 0.004, 0.01, 0, 0, inner - 0.02));
  m.fixed(LIGHT, box(W - 2 * P - 0.03, 0.003, 0.008, 0, niche - 0.003, inner - 0.02));
  // Door: a thin lacquered board carrying a mirror with a polished edge.
  const doors = W > 0.7 ? 2 : 1;
  const dw = W / doors;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + dw * (i + 0.5);
    const y0 = niche + P + 0.003;
    m.part('body', rbox(dw - 0.003, H - y0 - 0.0015, 0.016, 0.002, x, y0, doorFace - 0.006 - 0.008, 2));
    m.part('mirror', rbox(dw - 0.007, H - y0 - 0.0055, 0.005, 0.0015, x, y0 + 0.002, doorFace - 0.0025, 1));
  }
  return m.build();
}

/** Mirror with a shelf: a round-cornered mirror with a soft back-light, an oak shelf on two brackets below it. */
export function buildMirrorShelf(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const shelfT = 0.025;
  const shelfY = 0.03;
  const my = shelfY + shelfT + 0.05;
  const back = -D / 2;
  const mh = H - my;
  m.part('mirror', plate(rrect(W - 0.006, mh, 0.05), 0.005, 0).rotateX(PI / 2).translate(0, my + mh / 2, back + 0.016));
  // Spacer board behind the mirror and a light glowing round its edge.
  m.fixed(SHADOW, rbox(W - 0.06, mh - 0.06, 0.01, 0.004, 0, my + 0.03, back + 0.006, 1));
  m.fixed(LIGHT, plate(withHoles(rrect(W, mh + 0.006, 0.053), rrect(W - 0.03, mh - 0.024, 0.045)), 0.003, 0).rotateX(PI / 2).translate(0, my + mh / 2, back + 0.0125));
  // Shelf and brackets.
  m.part('shelf', rbox(W * 0.86, shelfT, D - 0.008, 0.004, 0, shelfY, 0.004, 2));
  for (const s of [-1, 1]) {
    const x = s * W * 0.3;
    m.part('fittings', rbox(0.016, shelfY + 0.002, D * 0.7, 0.002, x, 0, back + D * 0.35, 1));
    m.part('fittings', rbox(0.016, 0.07, 0.006, 0.002, x, 0, back + 0.003, 1));
  }
  return m.build();
}

/* ---------------------------------------------------------------- showers */

/** A frameless glass panel, `t` thick, between two points in plan, standing from y0 to y1. */
function glass(m: Model, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, t = 0.008): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = rbox(len, y1 - y0, t, 0.002, 0, y0, 0, 1);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  m.part('glass', g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2));
}

/** Rain head on an arm from the back wall, a thermostatic mixer and a slide rail with a hand shower. */
function showerSet(m: Model, x: number, back: number, top: number, headZ: number, wallX?: { x: number; dir: number }): void {
  const armY = top - 0.032;
  m.part('fittings', cyl(0.03, 0.03, 0.006, x, armY, back + 0.003, 'z', 20));
  m.part('fittings', tube([[x, armY, back], [x, armY, headZ - 0.05], [x, armY - 0.02, headZ - 0.005], [x, armY - 0.05, headZ]], 0.011, false, 10));
  m.part('fittings', cyl(0.125, 0.12, 0.012, x, armY - 0.062, headZ, 'y', 40));
  m.fixed(SHADOW, disc(0.105, 0.001, x, armY - 0.0625, headZ, 36));
  // Mixer and slide rail on the wall (the back wall, or a side wall when given).
  const place = (g: THREE.BufferGeometry) => {
    if (!wallX) return g;
    // Built on the back wall at x, then turned to stand on the side wall.
    g.translate(-x, 0, -back);
    g.rotateY(wallX.dir > 0 ? -PI / 2 : PI / 2);
    return g.translate(wallX.x, 0, headZ);
  };
  m.part('fittings', place(rbox(0.32, 0.075, 0.05, 0.02, x, 1.05, back + 0.025, 3)));
  for (const s of [-1, 1]) m.part('fittings', place(cyl(0.024, 0.024, 0.03, x + s * 0.13, 1.0875, back + 0.065, 'z', 20)));
  m.part('fittings', place(cyl(0.009, 0.009, 0.7, x + 0.22, 1.2, back + 0.035, 'y', 12)));
  for (const y of [1.2, 1.9]) m.part('fittings', place(rbox(0.03, 0.03, 0.03, 0.006, x + 0.22, y - 0.015, back + 0.015, 2)));
  m.part('fittings', place(cyl(0.022, 0.016, 0.2, x + 0.22, 1.55, back + 0.07, 'y', 16)));
}

/**
 * Shower enclosure on a low tray, frameless 8 mm glass. `type` 'enclosure'
 * (default: a fixed front panel and a hinged door, fixed side panels, a slim
 * top rail) or 'walkin' (a single fixed front screen with a stabiliser bar to
 * the back wall and an open end).
 */
export function buildShower(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const walkin = param<'enclosure' | 'walkin'>(entry, 'type', 'enclosure') === 'walkin';
  const trayH = 0.04;
  const back = -D / 2;
  // Tray: a rim round a recessed floor with a square drain.
  m.part('tray', plate(withHoles(rrect(W, D, 0.012), rrect(W - 0.06, D - 0.06, 0.008)), trayH, 0, 8));
  m.part('tray', plate(rrect(W - 0.058, D - 0.058, 0.008), trayH - 0.006, 0, 8));
  const g0 = trayH + 0.004;
  const gTop = H - 0.02;
  const fz = D / 2 - 0.032;
  if (walkin) {
    const x0 = -W / 2 + Math.min(0.55, W * 0.38);
    glass(m, x0, fz, W / 2 - 0.006, fz, g0, gTop);
    // Stabiliser bar along the top edge to the back wall, wall channel at the closed end.
    m.part('fittings', rbox(0.02, 0.012, fz - back - 0.006, 0.003, W / 2 - 0.02, H - 0.012, (fz + back + 0.006) / 2, 2));
    m.part('fittings', rbox(0.024, 0.03, 0.03, 0.004, W / 2 - 0.02, H - 0.03, fz, 2));
    m.part('fittings', rbox(0.018, gTop - g0, 0.022, 0.002, W / 2 - 0.009, g0, fz, 1));
    m.part('fittings', rbox(0.03, 0.03, 0.006, 0.002, W / 2 - 0.02, H - 0.03, back + 0.003, 1));
    // Linear drain along the back wall.
    m.part('fittings', rbox(W * 0.6, 0.002, 0.07, 0.001, W * 0.1, trayH - 0.006, back + 0.07, 1));
    m.fixed(SHADOW, box(W * 0.6 - 0.02, 0.0025, 0.05, W * 0.1, trayH - 0.006, back + 0.07));
    showerSet(m, W * 0.18, back, H, back + Math.min(0.32, D * 0.4));
    return m.build();
  }
  // Front: fixed panel and a hinged door. Sides: fixed panels to the back wall.
  const xs = -W / 2 + 0.006;
  const xe = W / 2 - 0.006;
  const fixedW = (xe - xs) * 0.46;
  const xj = xs + fixedW;
  glass(m, xs, fz, xj, fz, g0, gTop);
  glass(m, xj + 0.004, fz, xe, fz, g0, gTop - 0.004);
  for (const s of [-1, 1]) glass(m, s * (W / 2 - 0.006), back + 0.012, s * (W / 2 - 0.006), fz - 0.008, g0, gTop);
  // Top rail over the fixed panels.
  for (const s of [-1, 1]) m.part('fittings', rbox(0.018, 0.02, fz - back - 0.01, 0.003, s * (W / 2 - 0.009), H - 0.02, (fz + back) / 2 - 0.005, 2));
  m.part('fittings', rbox(fixedW + 0.01, 0.02, 0.018, 0.003, xs + fixedW / 2 + 0.004, H - 0.02, fz, 2));
  // Wall channels, corner clamps, door hinges and a pull handle through the glass.
  for (const s of [-1, 1]) m.part('fittings', rbox(0.022, gTop - g0, 0.02, 0.002, s * (W / 2 - 0.011), g0, back + 0.01, 1));
  for (const y of [0.3, 1.75]) {
    for (const s of [-1, 1]) m.part('fittings', rbox(0.028, 0.05, 0.028, 0.004, s * (W / 2 - 0.014), y, fz, 2));
    m.part('fittings', rbox(0.05, 0.08, 0.026, 0.005, xj + 0.002, y, fz, 2));
  }
  const hx = xe - 0.07;
  m.part('fittings', rbox(0.016, 0.32, 0.016, 0.006, hx, 0.95, fz + 0.026, 2));
  m.part('fittings', rbox(0.016, 0.32, 0.016, 0.006, hx, 0.95, fz - 0.026, 2));
  for (const y of [0.99, 1.23]) m.part('fittings', cyl(0.005, 0.005, 0.05, hx, y, fz, 'z', 10));
  drain(m, 0, trayH - 0.006, 0, 0.045);
  showerSet(m, 0, back, H, back + Math.min(0.34, D * 0.4));
  return m.build();
}

/**
 * Quadrant corner shower: a quarter-round tray, two fixed curved panels at
 * the walls and a pair of curved sliding doors on a top track. Walls at the
 * back and on the `hand` side (default 'left').
 */
export function buildCornerShower(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const s = param<'left' | 'right'>(entry, 'hand', 'left') === 'left' ? -1 : 1;
  const cx = (s * W) / 2;
  const cz = -D / 2;
  const kx = W / D;
  const phi0 = s < 0 ? 0 : -PI / 2;
  const q = (g: THREE.BufferGeometry) => g.scale(kx, 1, 1).translate(cx, 0, cz);
  const trayH = 0.04;
  const R = D;
  const arc = (a: number) => phi0 + (s < 0 ? a : PI / 2 - a);
  // Tray with a rounded edge, closed against the walls.
  const tray: [number, number][] = [
    [0, 0],
    [R - 0.01, 0],
    [R - 0.002, 0.004],
    [R, 0.012],
    [R, trayH - 0.01],
    [R - 0.004, trayH - 0.002],
    [R - 0.014, trayH],
    [0, trayH],
  ];
  m.part('tray', q(arcLathe(tray, phi0, PI / 2, 28)));
  m.part('tray', box(0.001, trayH, D, cx - s * 0.0005, 0, 0));
  m.part('tray', box(W, trayH, 0.001, 0, 0, cz + 0.0005));
  // Curved glass: fixed panels at both walls, two sliding doors between them on an inner radius.
  const g0 = trayH + 0.004;
  const gTop = H - 0.03;
  const curved = (r: number, a0: number, a1: number, y0: number, y1: number) => {
    const t = 0.008;
    const prof: [number, number][] = [
      [r - t, y0],
      [r, y0],
      [r, y1],
      [r - t, y1],
      [r - t, y0],
    ];
    const lo = Math.min(arc(a0), arc(a1));
    m.part('glass', q(arcLathe(prof, lo, Math.abs(arc(a1) - arc(a0)), 14)));
  };
  const Rg = R - 0.03;
  curved(Rg, 0.01, 0.4, g0, gTop);
  curved(Rg, PI / 2 - 0.4, PI / 2 - 0.01, g0, gTop);
  curved(Rg - 0.018, 0.34, 0.82, g0 + 0.01, gTop - 0.01);
  curved(Rg - 0.018, PI / 2 - 0.82, PI / 2 - 0.34, g0 + 0.01, gTop - 0.01);
  // Top track following the curve, bottom guide, wall channels and door knobs.
  const track: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = arc(0.03 + ((PI / 2 - 0.06) * i) / 16);
    track.push([cx + (Rg - 0.009) * Math.sin(a) * kx, H - 0.018, cz + (Rg - 0.009) * Math.cos(a)]);
  }
  m.part('fittings', tube(track, 0.018, false, 8));
  // Wall channels where the glass meets the side wall and the back wall.
  m.part('fittings', rbox(0.02, gTop - g0, 0.022, 0.002, cx - s * 0.01, g0, cz + Rg - 0.004, 1));
  m.part('fittings', rbox(0.022, gTop - g0, 0.02, 0.002, cx - s * (Rg - 0.004) * kx, g0, cz + 0.01, 1));
  for (const a of [0.78, PI / 2 - 0.78]) {
    const p = arc(a);
    const r = Rg - 0.018 + 0.02;
    m.part('fittings', cyl(0.012, 0.012, 0.05, cx + r * Math.sin(p) * kx, 1.05, cz + r * Math.cos(p), 'y', 12));
  }
  drain(m, cx - s * W * 0.32, trayH, cz + D * 0.32, 0.045);
  showerSet(m, cx - s * Math.min(0.32, W * 0.36), -D / 2, H, -D / 2 + Math.min(0.3, D * 0.34));
  return m.build();
}

/* ---------------------------------------------------------------- bathtub */

/**
 * Built-in bathtub: a glazed shell with a soft rim and an inner slope, a deck
 * mixer and spout on the rim at the foot end (-X by default, `taps` 'left' |
 * 'right'), a waste and an overflow.
 */
export function buildBathtub(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const s = param<'left' | 'right'>(entry, 'taps', 'left') === 'left' ? -1 : 1;
  const tapH = Math.min(0.06, H * 0.1);
  const rim = H - tapH;
  const outer: [number, number][] = [
    [-0.012, 0],
    [-0.006, 0.006],
    [0, 0.03],
    [0, rim - 0.022],
    [-0.005, rim - 0.004],
    [-0.018, rim],
    [-0.04, rim],
  ];
  m.part('ceramic', sweep(outer, W / 2, D / 2, 0.035, 0, 0, 0, 5));
  // Deck between the rim and the basin, wider at the tap end.
  const footDeck = Math.min(0.13, W * 0.08);
  const sideDeck = Math.min(0.075, D * 0.1);
  const bhw = (W - footDeck - sideDeck) / 2;
  const bhd = D / 2 - sideDeck;
  const bx = -s * (footDeck - sideDeck) / 2;
  const brc = Math.min(0.16, bhd * 0.6);
  m.part('ceramic', plate(withHoles(rrect(W - 0.08, D - 0.08, 0.005), rrect(2 * bhw, 2 * bhd, brc, bx, 0)), 0.002, rim - 0.002, 16));
  // Basin: steep sides near the rim, a long slope down to a flat floor.
  const depth = Math.min(rim - 0.06, 0.42);
  const floorIn = Math.min(bhd * 0.55, 0.16);
  const inner: [number, number][] = [
    [0.0005, rim],
    [0, rim - 0.006],
    [-0.006, rim - depth * 0.3],
    [-0.03, rim - depth * 0.75],
    [-0.07, rim - depth * 0.95],
    [-floorIn, rim - depth],
  ];
  m.part('ceramic', sweep(inner, bhw, bhd, brc, bx, 0, 0, 8));
  const fr = Math.max(0, brc - floorIn);
  m.part('ceramic', plate(rrect(2 * (bhw - floorIn) + 0.004, 2 * (bhd - floorIn) + 0.004, fr + 0.002, bx, 0), 0.001, rim - depth - 0.0006, 10));
  // Waste and overflow at the foot end, mixer and spout on the deck.
  const footX = s * (W / 2 - footDeck);
  drain(m, footX - s * 0.16, rim - depth, 0, 0.026);
  m.part('fittings', cyl(0.03, 0.03, 0.006, footX - s * 0.01, rim - depth * 0.42, 0, 'x', 20));
  const deckX = s * (W / 2 - footDeck / 2 - 0.012);
  m.part('fittings', cyl(0.024, 0.026, 0.006, deckX, rim, 0, 'y', 20));
  m.part(
    'fittings',
    tube(
      [
        [deckX, rim, 0],
        [deckX, H - 0.016, 0],
        [deckX - s * 0.02, H - 0.012, 0],
        [deckX - s * 0.1, H - 0.03, 0],
      ],
      0.011,
      false,
      12,
    ),
  );
  for (const z of [-1, 1]) {
    const tz = z * Math.min(0.12, D * 0.17);
    m.part('fittings', cyl(0.019, 0.02, 0.005, deckX, rim, tz, 'y', 18));
    m.part('fittings', cyl(0.014, 0.014, tapH * 0.55, deckX, rim + 0.004, tz, 'y', 18));
    m.part('fittings', rbox(0.06, 0.008, 0.011, 0.003, deckX - s * 0.02, rim + tapH * 0.55, tz, 2));
  }
  return m.build();
}

/* ------------------------------------------------------------- towel rail */

/**
 * Towel rail: a ladder rail of two round stiles and four rungs on wall
 * brackets, with a bath towel folded over the second rung.
 */
export function buildTowelRail(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const r = 0.0125;
  const th = 0.011;
  const rz = D / 2 - 0.0105 - th - 0.0005;
  const sx = W / 2 - 0.022;
  for (const s of [-1, 1]) {
    m.part('rail', cyl(r, r, H - 2 * r, s * sx, r, rz, 'y', 16));
    for (const y of [r, H - r]) {
      // Domed end caps and brackets back to the wall.
      m.part('rail', new THREE.SphereGeometry(r, 16, 8).translate(s * sx, y, rz));
    }
    for (const y of [H * 0.18, H * 0.86]) {
      m.part('rail', cyl(0.008, 0.008, rz - back, s * sx, y, (rz + back) / 2, 'z', 12));
      m.part('rail', cyl(0.022, 0.022, 0.006, s * sx, y, back + 0.003, 'z', 20));
    }
  }
  const rungs = [0.06, 0.38, 0.7, 0.95].map((f) => r + (H - 2 * r) * f);
  for (const y of rungs) m.part('rail', cyl(0.0095, 0.0095, 2 * sx, 0, y, rz, 'x', 14));
  // Towel: front and back layers hanging from a soft fold over the third rung.
  const by = rungs[2]!;
  const tw = (2 * sx - 2 * r) * 0.82;
  const front = by * 0.78;
  const rear = by * 0.62;
  const fr = 0.0095 + th / 2 + 0.001;
  m.part('towel', cushion(tw, th, front, 0, 0, 0, 0.5, 0.004).rotateX(PI / 2).translate(0, by - front / 2, rz + 0.0105));
  m.part('towel', cushion(tw, th, rear, 0, 0, 0, 0.5, 0.004).rotateX(-PI / 2).translate(0, by - rear / 2, rz - 0.0105));
  m.part('towel', new THREE.CylinderGeometry(fr + th / 2, fr + th / 2, tw, 24, 1, false, 0, PI).rotateZ(PI / 2).translate(0, by, rz));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const BATHROOM_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  bathToilet: buildToilet,
  bathPedestalBasin: buildPedestalBasin,
  bathVanity: buildVanity,
  bathMirrorCabinet: buildMirrorCabinet,
  bathMirrorShelf: buildMirrorShelf,
  bathShower: buildShower,
  bathCornerShower: buildCornerShower,
  bathTub: buildBathtub,
  bathTowelRail: buildTowelRail,
};
