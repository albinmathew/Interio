/**
 * Premium generators: kitchen. Base, wall, tall, corner and end units, counter
 * runs, sink unit, island and breakfast bar.
 *
 * Units are placed side by side by the automatic layout, so every base unit
 * shares the dimensions in `K`: the same plinth height and recess, the same
 * worktop thickness and front overhang, fronts on the same plane and a 3 mm
 * shadow gap all round each front (half of it on each side of a joint, so the
 * gap between neighbours equals the gap inside a unit). Worktops are extruded
 * along the run with flat ends, so neighbouring tops meet without a groove;
 * only their front edge is rounded.
 *
 * Fronts are handleless by default, with a recessed metal finger rail under
 * the worktop and between rows (`handles: 'rail'`), or carry slim bar handles
 * (`handles: 'bar'`).
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { alongX, alongZ, arcLathe, disc, edgeProfile, plate, rrect, sweep, withHoles } from './kitchen.kit';
import { Model, box, cyl, param, rbox, tube, type BuildContext } from './kit';

/* ------------------------------------------------------------------ slots */

export const K_FRONTS: FinishSlot = { id: 'fronts', label: 'Fronts', kind: 'lacquer', default: 'lacquer.greige' };
export const K_WORKTOP: FinishSlot = { id: 'worktop', label: 'Worktop', kind: 'stone', default: 'stone.quartz.white' };
export const K_CARCASS: FinishSlot = { id: 'carcass', label: 'Carcass and end panels', kind: 'lacquer', default: 'lacquer.greige' };
export const K_HANDLES: FinishSlot = { id: 'handles', label: 'Handles and rails', kind: 'metal', default: 'metal.black' };
export const K_SHELVES: FinishSlot = { id: 'shelves', label: 'Shelves', kind: 'wood', default: 'wood.oak' };

/** Base units, counter runs, sink, island, corner and bar. */
export const KITCHEN_BASE_SLOTS: FinishSlot[] = [K_FRONTS, K_WORKTOP, K_CARCASS, K_HANDLES];
/** Wall and tall units. */
export const KITCHEN_WALL_SLOTS: FinishSlot[] = [K_FRONTS, K_CARCASS, K_HANDLES];
/** Open shelving with a worktop (rounded end unit, bar end). */
export const KITCHEN_OPEN_SLOTS: FinishSlot[] = [K_WORKTOP, K_CARCASS, K_SHELVES];
/** Open wall shelving. */
export const KITCHEN_SHELF_SLOTS: FinishSlot[] = [K_CARCASS, K_SHELVES];

/* ------------------------------------------------------------- dimensions */

/** Shared kitchen dimensions in metres. Every unit uses these so a run lines up. */
export const K = {
  plinth: 0.1,
  plinthRecess: 0.06,
  top: 0.03,
  overhang: 0.02,
  front: 0.019,
  gap: 0.003,
  rail: 0.032,
  panel: 0.018,
  frontR: 0.0022,
  topR: 0.004,
  /** Bar handle projection beyond the front. */
  handle: 0.019,
};

/** Fixed materials: the plinth and the shadow behind the gaps, the under-cabinet light, stainless sink. */
export const SHADOW = 'lacquer.graphite';
export const LED = '#fff1d6';
export const STAINLESS = 'metal.steel';

export type FrontKind = 'door' | 'drawer';
export interface Row {
  /** Relative height of the row. */
  h: number;
  /** Fronts across the row. */
  cols: number;
  kind: FrontKind;
}
export type Handles = 'rail' | 'bar';

/* ---------------------------------------------------------------- pieces */

/** A front (door or drawer face) whose outer face is at z = face. */
export function front(m: Model, x: number, y0: number, y1: number, w: number, face: number, slot = 'fronts'): void {
  m.part(slot, rbox(w, y1 - y0, K.front, K.frontR, x, y0, face - K.front / 2, 2));
  // Dark backing so the shadow gaps read as gaps.
  m.fixed(SHADOW, box(w + K.gap * 0.9, y1 - y0 + K.gap * 0.9, 0.002, x, y0 - K.gap * 0.45, face - K.front - 0.0015));
}

/** A slim bar handle on stand-offs, `len` long, horizontal or vertical, standing proud of z = face. */
export function barHandle(m: Model, cx: number, cy: number, len: number, vertical: boolean, face: number, slot = 'handles'): void {
  const t = 0.009;
  const off = K.handle - t;
  const zBar = face + off + t / 2;
  if (vertical) {
    m.part(slot, rbox(t, len, t, 0.0035, cx, cy - len / 2, zBar, 2));
    for (const s of [-1, 1]) m.part(slot, cyl(0.0042, 0.0042, off + 0.002, cx, cy + s * (len / 2 - 0.018), face + off / 2, 'z', 10));
  } else {
    m.part(slot, rbox(len, t, t, 0.0035, cx, cy - t / 2, zBar, 2));
    for (const s of [-1, 1]) m.part(slot, cyl(0.0042, 0.0042, off + 0.002, cx + s * (len / 2 - 0.018), cy, face + off / 2, 'z', 10));
  }
}

/**
 * A recessed finger rail (a metal C channel) in the band [y0, y0 + K.rail]
 * from x0 to x1, behind the front plane z = face.
 */
export function fingerRail(m: Model, x0: number, x1: number, y0: number, face: number, slot = 'handles'): void {
  const w = x1 - x0;
  const x = (x0 + x1) / 2;
  const depth = 0.026;
  m.part(slot, box(w, K.rail, 0.0015, x, y0, face - depth));
  m.part(slot, rbox(w, 0.003, depth - 0.002, 0.001, x, y0, face - depth / 2 - 0.001, 1));
  m.part(slot, box(w, 0.0015, depth, x, y0 + K.rail - 0.0015, face - depth / 2));
}

/** An aluminium edge pull along the bottom (or top) edge of a wall-unit door. */
export function edgePull(m: Model, x: number, y: number, w: number, face: number, slot = 'handles'): void {
  m.part(slot, rbox(w, 0.014, K.front + 0.002, 0.0025, x, y, face - K.front / 2 - 0.001, 2));
}

/** Recessed plinth from x0 to x1, its face `K.plinthRecess` behind z = face. */
export function plinth(m: Model, x0: number, x1: number, face: number, h = K.plinth): void {
  m.fixed(SHADOW, rbox(x1 - x0, h - 0.002, 0.016, 0.002, (x0 + x1) / 2, 0, face - K.plinthRecess - 0.008, 1));
}

/** Worktop from x0 to x1 and z0 (back) to z1 (front), top at `top`, front edge rounded (and the back with `roundBack`). */
export function worktop(m: Model, x0: number, x1: number, z0: number, z1: number, top: number, t = K.top, roundBack = false, slot = 'worktop'): void {
  m.part(slot, alongX(edgeProfile(z0, z1, top - t, top, K.topR, roundBack ? K.topR : 0), x1 - x0, (x0 + x1) / 2, 3));
}

/**
 * A grid of fronts between y0 and y1 (rows top to bottom), from x0 to x1, with
 * the outer face at z = face. Rails: `railTop` puts a finger rail above the
 * top row (base units under a worktop), and every lower row gets one. Wall
 * units (`edge: 'bottom'`) get an edge pull on each door instead.
 */
export function frontGrid(
  m: Model,
  o: { x0: number; x1: number; y0: number; y1: number; face: number; rows: Row[]; handles: Handles; railTop: boolean; edge?: 'bottom'; hinge?: 'left' | 'right' },
): void {
  const total = o.rows.reduce((s, r) => s + r.h, 0) || 1;
  const H = o.y1 - o.y0;
  const W = o.x1 - o.x0;
  let top = o.y1;
  o.rows.forEach((row, ri) => {
    const rowH = (H * row.h) / total;
    const bottom = top - rowH;
    const rail = o.handles === 'rail' && !o.edge && (ri > 0 || o.railTop);
    const fy1 = rail ? top - K.rail : top - (ri === 0 && o.railTop ? K.gap : K.gap / 2);
    const fy0 = bottom + K.gap / 2;
    if (rail) fingerRail(m, o.x0, o.x1, top - K.rail, o.face);
    const cw = W / row.cols;
    for (let c = 0; c < row.cols; c++) {
      const cx = o.x0 + cw * (c + 0.5);
      const fw = cw - K.gap;
      if (o.handles === 'rail' && o.edge === 'bottom') {
        front(m, cx, fy0 + 0.014, fy1, fw, o.face);
        edgePull(m, cx, fy0, fw, o.face);
      } else front(m, cx, fy0, fy1, fw, o.face);
      if (o.handles !== 'bar') continue;
      const fh = fy1 - fy0;
      if (row.kind === 'drawer') {
        const len = Math.min(0.42, fw * 0.62);
        barHandle(m, cx, fy1 - Math.min(0.045, fh * 0.32), len, false, o.face);
      } else {
        // Doors open from the middle of a pair; a single door from the side away from its hinge.
        const opensRight = row.cols === 1 ? (o.hinge ?? 'left') === 'left' : c < row.cols / 2 ? true : false;
        const pair = row.cols > 1 && row.cols % 2 === 0;
        const right = pair ? c % 2 === 0 : opensRight;
        const hx = cx + (right ? 1 : -1) * (fw / 2 - 0.035);
        const len = Math.min(0.2, fh * 0.45);
        const hy = o.edge === 'bottom' ? fy0 + 0.04 + len / 2 : fy1 - 0.05 - len / 2;
        barHandle(m, hx, hy, len, true, o.face);
      }
    }
    top = bottom;
  });
}

/** Side panel of a unit between z0 (back) and z1, from y0 to y1, centred on x. */
export function sidePanel(m: Model, x: number, y0: number, y1: number, z0: number, z1: number, slot = 'carcass'): void {
  m.part(slot, rbox(K.panel, y1 - y0, z1 - z0, 0.0015, x, y0, (z0 + z1) / 2, 1));
}

/* ------------------------------------------------------------- base unit */

const defaultRows = (W: number): Row[] => [{ h: 1, cols: W > 0.75 ? 2 : 1, kind: 'door' }];

/**
 * Base unit, counter run, sink unit or island: plinth, carcass, a grid of
 * fronts and a worktop.
 *
 * Params: `rows` (top to bottom, default one row of doors), `handles` 'rail' |
 * 'bar' (default rail), `hinge` 'left' | 'right' for a single door, `top`
 * worktop thickness mm (30), `upstand` mm (0: a low upstand at the back, set
 * `dims.h` to the worktop height plus the upstand), `back` overhang at the
 * back mm (an island's seating side, 0), `waterfall` stone end panels (false),
 * `sink` 'none' | 'inset' | 'undermount' (none), `counter` worktop height of a
 * sink unit mm (870; the tap reaches the top of the box).
 */
export function buildKitchenBase(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const rows = param<Row[]>(entry, 'rows', defaultRows(W));
  const handles = param<Handles>(entry, 'handles', 'rail');
  const T = param(entry, 'top', 30) / 1000;
  const sink = param<'none' | 'inset' | 'undermount'>(entry, 'sink', 'none');
  const up = sink === 'none' ? param(entry, 'upstand', 0) / 1000 : 0;
  const backOver = Math.min(param(entry, 'back', 0) / 1000, D * 0.45);
  const waterfall = param(entry, 'waterfall', false);
  const counter = sink === 'none' ? H - up : Math.min(param(entry, 'counter', 870) / 1000, H - 0.08);
  const topY = counter - T;
  const face = D / 2 - K.overhang;
  const bodyBack = -D / 2 + backOver;
  const side = waterfall ? T : 0;
  const x0 = -W / 2 + side;
  const x1 = W / 2 - side;
  const pl = Math.min(K.plinth, topY * 0.2);

  // Carcass sides: behind the plinth line at the bottom, behind the finger rails above it.
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - side - K.panel / 2);
    sidePanel(m, x, 0, pl, bodyBack, face - K.plinthRecess);
    sidePanel(m, x, pl, topY, bodyBack, face - K.front - 0.004);
  }
  plinth(m, x0 + 0.001, x1 - 0.001, face, pl);
  frontGrid(m, { x0, x1, y0: pl, y1: topY, face, rows, handles, railTop: true, hinge: param(entry, 'hinge', 'left') });

  if (backOver > 0) {
    // The seating side of an island: finished panels in the front finish, on a recessed plinth.
    const cols = Math.max(1, rows[rows.length - 1]?.cols ?? 2);
    const cw = (x1 - x0) / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x0 + cw * (c + 0.5);
      m.part('fronts', rbox(cw - K.gap, topY - pl - K.gap * 1.5, K.front, K.frontR, cx, pl + K.gap / 2, bodyBack + K.front / 2, 2));
    }
    m.fixed(SHADOW, box(x1 - x0 - 0.004, topY - pl, 0.002, 0, pl, bodyBack + K.front + 0.0015));
    m.fixed(SHADOW, rbox(x1 - x0 - 0.004, pl - 0.002, 0.016, 0.002, 0, 0, bodyBack + K.plinthRecess + 0.008, 1));
  }

  if (waterfall) {
    for (const sx of [-1, 1]) m.part('worktop', rbox(T, topY + 0.002, D, K.topR, sx * (W / 2 - T / 2), 0, 0, 2));
  }

  if (sink === 'none') {
    worktop(m, -W / 2, W / 2, -D / 2, D / 2, counter, T, backOver > 0);
    if (up > 0) m.part('worktop', rbox(W, up + 0.002, 0.012, 0.003, 0, counter - 0.002, -D / 2 + 0.006, 2));
  } else {
    buildSinkTop(m, { counter, T, sink, face });
  }
  return m.build();
}

/** Worktop with a sink cut into it, the bowl, its drain and a single-lever tap reaching the top of the box. */
function buildSinkTop(m: Model, o: { counter: number; T: number; sink: 'inset' | 'undermount'; face: number }): void {
  const { W, D, H } = m;
  const { counter, T } = o;
  const topY = counter - T;
  const bw = Math.max(0.2, Math.min(W - 0.16, 0.76));
  const bd = Math.max(0.2, Math.min(D - 0.2, 0.4));
  const frontStrip = 0.035;
  const bz = D / 2 - 0.075 - bd / 2;
  const br = 0.03;
  // Back of the worktop with the cut-out (shape y is world z), and a rounded front strip. An inset
  // bowl drops through a slightly larger hole; the stone overhangs an undermount bowl a little.
  const inset = o.sink === 'inset';
  const cut = inset ? rrect(bw + 0.002, bd + 0.002, br + 0.001, 0, bz) : rrect(bw - 0.008, bd - 0.008, br - 0.004, 0, bz);
  m.part('worktop', plate(withHoles(rrect(W, D - frontStrip, 0, 0, -frontStrip / 2), cut), T, topY, 16));
  m.part('worktop', alongX(edgeProfile(D / 2 - frontStrip, D / 2, topY, counter, K.topR), W, 0, 3));

  // Bowl: walls with a small floor radius, then a flat floor, all in brushed stainless. Drawn top to
  // bottom so the inner face is the visible one.
  const depth = Math.min(0.19, topY - K.plinth - 0.1);
  const lip = inset ? 0.0015 : 0;
  const yRim = inset ? counter + lip * 0.5 : topY;
  const wall: [number, number][] = [
    [0, yRim],
    [-0.001, topY - 0.01],
    [-0.002, counter - depth + 0.02],
    [-0.008, counter - depth + 0.006],
    [-0.02, counter - depth],
  ];
  m.fixed(STAINLESS, sweep(wall, bw / 2, bd / 2, br, 0, 0, bz, 5));
  m.fixed(STAINLESS, plate(rrect(bw - 0.03, bd - 0.03, br, 0, bz), 0.002, counter - depth - 0.0015, 10));
  if (o.sink === 'inset') {
    // A thin stainless flange sits on the worktop around the bowl.
    m.fixed(STAINLESS, plate(withHoles(rrect(bw + 0.036, bd + 0.036, br + 0.016, 0, bz), rrect(bw, bd, br, 0, bz)), lip, counter, 16));
  }
  // Drain: a stainless ring around a dark grate, slightly to the back.
  const dz = bz - bd * 0.12;
  m.fixed(STAINLESS, disc(0.045, 0.003, 0, counter - depth, dz, 28));
  m.fixed(SHADOW, disc(0.034, 0.0035, 0, counter - depth, dz, 24));

  // Single-lever tap behind the bowl. Its arc reaches the top of the box.
  const h = H - counter;
  const tz = bz - bd / 2 - Math.min(0.045, (bz - bd / 2 + D / 2) * 0.6);
  const r = Math.min(0.0145, h * 0.06);
  m.part('handles', cyl(0.026, 0.026, 0.008, 0, counter, tz, 'y', 28));
  m.part('handles', cyl(r * 1.25, r * 1.25, h * 0.32, 0, counter + 0.008, tz, 'y', 20));
  const reach = Math.min(bd * 0.62, 0.22);
  const yTop = H - r;
  m.part(
    'handles',
    tube(
      [
        [0, counter + h * 0.3, tz],
        [0, yTop - 0.06, tz],
        [0, yTop - 0.012, tz + 0.025],
        [0, yTop, tz + reach * 0.45],
        [0, yTop - 0.02, tz + reach * 0.85],
        [0, yTop - 0.05, tz + reach],
      ],
      r,
      false,
      12,
    ),
  );
  m.part('handles', cyl(r * 0.9, r * 1.05, 0.03, 0, yTop - 0.075, tz + reach, 'y', 16));
  // Lever on the side of the body.
  m.part('handles', rbox(0.012, 0.012, 0.075, 0.005, r * 1.25 + 0.006, counter + h * 0.24, tz + 0.02, 2));
}

/* ------------------------------------------------------------- wall unit */

/**
 * Wall unit: carcass with doors (or open shelves), an edge pull along the
 * bottom of each door (or bar handles) and a light strip underneath.
 *
 * Params: `rows` (default one row of doors), `handles` 'rail' | 'bar',
 * `hinge`, `open` (open shelving, no doors), `shelves` (open: 2), `light` (true).
 */
export function buildKitchenWall(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const handles = param<Handles>(entry, 'handles', 'rail');
  const open = param(entry, 'open', false);
  const light = param(entry, 'light', true);
  const face = handles === 'bar' && !open ? D / 2 - K.handle : D / 2;
  const back = -D / 2;
  const P = K.panel;
  const inner = open ? face : face - K.front - 0.002;
  // Carcass: two sides, a top, a recessed bottom (the light strip sits in front of it) and a back.
  for (const sx of [-1, 1]) sidePanel(m, sx * (W / 2 - P / 2), 0, H, back, inner);
  m.part('carcass', rbox(W - 2 * P, P, inner - back, 0.0015, 0, H - P, (back + inner) / 2, 1));
  m.part('carcass', rbox(W - 2 * P, P, inner - back - 0.004, 0.0015, 0, 0.004, (back + inner - 0.004) / 2, 1));
  m.part('carcass', box(W - 2 * P, H - 2 * P, 0.008, 0, P, back + 0.004));
  if (light) m.fixed(LED, box(W - 2 * P - 0.03, 0.004, 0.012, 0, 0, inner - 0.03));

  if (open) {
    const n = param(entry, 'shelves', 2);
    for (let i = 1; i <= n; i++) {
      const y = 0.004 + P + ((H - 2 * P - 0.004) * i) / (n + 1);
      m.part('shelves', rbox(W - 2 * P - 0.002, 0.022, inner - back - 0.012, 0.003, 0, y - 0.011, (back + 0.008 + inner) / 2 - 0.002, 2));
    }
    // The bottom and top read as shelves too.
    m.part('shelves', rbox(W - 2 * P - 0.002, 0.022, inner - back - 0.012, 0.003, 0, 0.004 + P, (back + 0.008 + inner) / 2 - 0.002, 2));
    return m.build();
  }
  frontGrid(m, {
    x0: -W / 2,
    x1: W / 2,
    y0: 0,
    y1: H,
    face,
    rows: param<Row[]>(entry, 'rows', defaultRows(W)),
    handles,
    railTop: false,
    edge: 'bottom',
    hinge: param(entry, 'hinge', 'left'),
  });
  return m.build();
}

/* ------------------------------------------------------------- tall unit */

/**
 * Tall unit (larder, appliance housing): plinth, carcass and doors; with
 * rails, a finger rail between the rows. The depth equals a base unit's
 * carcass plus front (580 mm), so its fronts are flush with the base fronts.
 *
 * Params: `rows` (top to bottom, default 0.62/0.38 doors), `handles`, `hinge`.
 */
export function buildKitchenTall(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const handles = param<Handles>(entry, 'handles', 'rail');
  const face = handles === 'bar' ? D / 2 - K.handle : D / 2;
  const pl = Math.min(K.plinth, H * 0.08);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - K.panel / 2);
    sidePanel(m, x, 0, pl, -D / 2, face - K.plinthRecess);
    sidePanel(m, x, pl, H, -D / 2, face - K.front - 0.004);
  }
  const inner = face - K.front - 0.004;
  m.part('carcass', rbox(W - 2 * K.panel, K.panel, inner + D / 2, 0.0015, 0, H - K.panel, (inner - D / 2) / 2, 1));
  plinth(m, -W / 2 + 0.001, W / 2 - 0.001, face, pl);
  frontGrid(m, {
    x0: -W / 2,
    x1: W / 2,
    y0: pl,
    y1: H,
    face,
    rows: param<Row[]>(entry, 'rows', [
      { h: 0.62, cols: W > 0.75 ? 2 : 1, kind: 'door' },
      { h: 0.38, cols: W > 0.75 ? 2 : 1, kind: 'door' },
    ]),
    handles,
    railTop: false,
    hinge: param(entry, 'hinge', 'left'),
  });
  return m.build();
}

/* ----------------------------------------------------------- corner unit */

/**
 * L-shaped inner corner base unit with a bi-fold pair of doors at the inner
 * corner. The walls are at the back (-Z) and on the `hand` side (default
 * 'left', -X); the runs continue from its other end and from its front.
 *
 * Params: `hand` 'left' | 'right', `handles`.
 */
export function buildKitchenCorner(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const s = param<'left' | 'right'>(entry, 'hand', 'left') === 'left' ? -1 : 1;
  const handles = param<Handles>(entry, 'handles', 'rail');
  const L = Math.max(0.3, Math.min(0.6, Math.min(W, D) - 0.2)); // leg depth, like a base unit
  const topY = H - K.top;
  const pl = Math.min(K.plinth, topY * 0.2);
  const xWall = (s * W) / 2;
  const xIn = s * (W / 2 - L); // inner (front) line of the side leg
  const xFar = (-s * W) / 2;
  const zIn = -D / 2 + L; // front line of the back leg
  const zFace = zIn - K.overhang;
  const xFace = xIn + s * K.overhang;

  // Worktop: the corner square, the back leg and the side leg, front edges rounded.
  m.part('worktop', box(L, K.top, L, (xWall + xIn) / 2, topY, -D / 2 + L / 2));
  worktop(m, Math.min(xIn, xFar), Math.max(xIn, xFar), -D / 2, zIn, H);
  const legB = s < 0 ? edgeProfile(xWall, xIn, topY, H, K.topR) : edgeProfile(xIn, xWall, topY, H, 0, K.topR);
  m.part('worktop', alongZ(legB, D / 2 - zIn, (zIn + D / 2) / 2, 3));

  // Back leg: fronts from the corner to the far end, plinth, end panel.
  const a0 = Math.min(xFace, xFar);
  const a1 = Math.max(xFace, xFar);
  frontGrid(m, { x0: a0, x1: a1, y0: pl, y1: topY, face: zFace, rows: [{ h: 1, cols: 1, kind: 'door' }], handles, railTop: true, hinge: s < 0 ? 'left' : 'right' });
  plinth(m, a0, a1, zFace);
  sidePanel(m, xFar + s * (K.panel / 2), 0, topY, -D / 2, zFace - K.front - 0.004);

  // Side leg: the same, turned to face the room (+X for a left-hand unit).
  const leg = new Model(entry, ctx);
  const len = D / 2 - zFace;
  // Built facing +Z centred on the origin, then turned about Y and moved into place.
  frontGrid(leg, { x0: -len / 2, x1: len / 2, y0: pl, y1: topY, face: 0, rows: [{ h: 1, cols: 1, kind: 'door' }], handles, railTop: true, hinge: s < 0 ? 'right' : 'left' });
  plinth(leg, -len / 2, len / 2, 0);
  const turnY = s < 0 ? Math.PI / 2 : -Math.PI / 2;
  const zMid = (zFace + D / 2) / 2;
  for (const [key, list] of partsOf(leg)) {
    for (const g of list) {
      g.rotateY(turnY);
      g.translate(xFace, 0, zMid);
      if (key.startsWith('slot:')) m.part(key.slice(5), g);
      else m.fixed(key.slice(4), g);
    }
  }
  m.part('carcass', rbox(L - K.overhang - K.front - 0.004, topY, K.panel, 0.0015, xWall - (s * (L - K.overhang - K.front - 0.004)) / 2, 0, D / 2 - K.panel / 2, 1));
  return m.build();
}

/** Reads the parts collected by a scratch `Model` (used to build a piece in its own frame and turn it). */
function partsOf(model: Model): Map<string, THREE.BufferGeometry[]> {
  return (model as unknown as { parts: Map<string, THREE.BufferGeometry[]> }).parts;
}

/* -------------------------------------------------------------- end unit */

/**
 * Rounded end unit: quarter-round open shelves under a quarter-round worktop,
 * finishing a run. The neighbouring unit is on the -X side by default
 * (`side: 'right'` rounds towards +X), the wall at the back.
 *
 * Params: `side` 'right' | 'left', `shelves` (1).
 */
export function buildKitchenEnd(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const s = param<'right' | 'left'>(entry, 'side', 'right') === 'right' ? 1 : -1;
  const topY = H - K.top;
  const pl = Math.min(K.plinth, topY * 0.2);
  const cx = (-s * W) / 2;
  const cz = -D / 2;
  const kx = W / D;
  const phi0 = s > 0 ? 0 : -Math.PI / 2;
  const quarter = (g: THREE.BufferGeometry) => g.scale(kx, 1, 1).translate(cx, 0, cz);

  // Worktop: a quarter of a disc with a rounded edge, closed at the joint and the wall.
  const r = K.topR;
  const prof: [number, number][] = [[0, topY]];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * Math.PI / 2;
    prof.push([D - r + r * Math.cos(a), topY + r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * Math.PI / 2;
    prof.push([D - r + r * Math.cos(a), H - r + r * Math.sin(a)]);
  }
  prof.push([0, H]);
  m.part('worktop', quarter(arcLathe(prof, phi0, Math.PI / 2, 24)));
  m.part('worktop', box(0.001, K.top, D, cx + s * 0.0005, topY, 0));
  m.part('worktop', box(W, K.top, 0.001, 0, topY, cz + 0.0005));

  // Shelves: quarter-round boards inside the worktop line, the first one on the plinth.
  const shelf = (y: number, t: number) => {
    const rx = W - K.overhang - 0.012;
    const rz = D - K.overhang - 0.012;
    const sh = new THREE.Shape();
    sh.moveTo(cx, cz);
    sh.lineTo(cx, cz + rz);
    if (s > 0) sh.absellipse(cx, cz, rx, rz, Math.PI / 2, 0, true, 0);
    else sh.absellipse(cx, cz, rx, rz, Math.PI / 2, Math.PI, false, 0);
    sh.lineTo(cx, cz);
    m.part('shelves', plate(sh, t, y, 24));
  };
  shelf(pl, 0.025);
  const n = param(entry, 'shelves', 1);
  for (let i = 1; i <= n; i++) shelf(pl + ((topY - pl) * i) / (n + 1) - 0.0125, 0.025);

  // Carcass: the panel against the neighbour and the back, and a quarter-round plinth.
  sidePanel(m, cx + s * (K.panel / 2), 0, topY, -D / 2, D / 2 - K.overhang - 0.006);
  m.part('carcass', box(W - K.panel - 0.02, topY - pl, K.panel, s * (K.panel / 2 + 0.01), pl, -D / 2 + K.panel / 2));
  const band = new THREE.CylinderGeometry(D - K.overhang - K.plinthRecess, D - K.overhang - K.plinthRecess, pl - 0.002, 20, 1, true, phi0, Math.PI / 2);
  m.fixed(SHADOW, quarter(band.translate(0, (pl - 0.002) / 2, 0)));
  return m.build();
}

/* ------------------------------------------------------------ breakfast bar */

/**
 * Breakfast bar: a raised counter with a body at the back and a knee-space
 * overhang on the seating side (+Z), panelled in the front finish, with a
 * metal footrest.
 *
 * Params: `top` thickness mm (40), `footrest` (true).
 */
export function buildKitchenBar(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const T = param(entry, 'top', 40) / 1000;
  const topY = H - T;
  const knee = Math.min(0.26, D * 0.46);
  const face = D / 2 - knee;
  const pl = Math.min(K.plinth, topY * 0.12);
  worktop(m, -W / 2, W / 2, -D / 2, D / 2, H, T, true);
  for (const sx of [-1, 1]) sidePanel(m, sx * (W / 2 - K.panel / 2), 0, topY, -D / 2, face - K.front - 0.003);
  m.part('carcass', box(W - 2 * K.panel, topY - pl, K.panel, 0, pl, -D / 2 + K.panel / 2));
  plinth(m, -W / 2 + K.panel, W / 2 - K.panel, face, pl);
  m.fixed(SHADOW, rbox(W - 2 * K.panel, pl - 0.002, 0.016, 0.002, 0, 0, -D / 2 + K.plinthRecess - 0.02, 1));
  // Seating side: vertical panels with shadow gaps.
  const cols = Math.max(1, Math.round(W / 0.4));
  const cw = (W - 2 * K.panel) / cols;
  for (let c = 0; c < cols; c++) front(m, -W / 2 + K.panel + cw * (c + 0.5), pl + K.gap / 2, topY - K.gap, cw - K.gap, face);
  // Footrest on two brackets.
  if (param(entry, 'footrest', true)) {
    const fz = face + Math.min(0.14, knee * 0.55);
    const fy = Math.min(0.23, topY * 0.24);
    m.part('handles', tube([[-W / 2 + 0.06, fy, fz], [W / 2 - 0.06, fy, fz]], 0.012, false, 12));
    for (const sx of [-1, 1]) {
      const bx = sx * (W / 2 - 0.12);
      m.part('handles', cyl(0.008, 0.008, fz - face, bx, fy, (fz + face) / 2, 'z', 10));
      m.part('handles', cyl(0.022, 0.022, 0.004, bx, fy, face + 0.002, 'z', 20));
    }
  }
  return m.build();
}

/**
 * End of a breakfast bar: a stone waterfall panel down to the floor on the
 * outer side (`side` 'right' | 'left', default right) and open shelves under
 * the top, facing the seating side.
 */
export function buildKitchenBarEnd(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const s = param<'right' | 'left'>(entry, 'side', 'right') === 'right' ? 1 : -1;
  const T = param(entry, 'top', 40) / 1000;
  const topY = H - T;
  const knee = Math.min(0.26, D * 0.46);
  const face = D / 2 - knee;
  const pl = Math.min(K.plinth, topY * 0.12);
  const wT = Math.min(T, W * 0.2);
  worktop(m, -W / 2, W / 2, -D / 2, D / 2, H, T, true);
  m.part('worktop', rbox(wT, topY + 0.002, D, K.topR, s * (W / 2 - wT / 2), 0, 0, 2));
  // Open shelves between the bar's last panel and the waterfall.
  const sx0 = -W / 2 + (s > 0 ? K.panel : wT);
  const sx1 = W / 2 - (s > 0 ? wT : K.panel);
  sidePanel(m, -s * (W / 2 - K.panel / 2), 0, topY, -D / 2, face);
  m.part('carcass', box(sx1 - sx0, topY - pl, K.panel, (sx0 + sx1) / 2, pl, -D / 2 + K.panel / 2));
  m.fixed(SHADOW, rbox(sx1 - sx0, pl - 0.002, 0.016, 0.002, (sx0 + sx1) / 2, 0, face - K.plinthRecess, 1));
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = pl + ((topY - pl) * i) / n;
    m.part('shelves', rbox(sx1 - sx0 - 0.002, 0.024, face - (-D / 2 + K.panel), 0.003, (sx0 + sx1) / 2, y, (face + (-D / 2 + K.panel)) / 2, 2));
  }
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const KITCHEN_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  kitchenBase: buildKitchenBase,
  kitchenWall: buildKitchenWall,
  kitchenTall: buildKitchenTall,
  kitchenCorner: buildKitchenCorner,
  kitchenEnd: buildKitchenEnd,
  kitchenBar: buildKitchenBar,
  kitchenBarEnd: buildKitchenBarEnd,
};
