/**
 * Case goods: one builder for every cabinet-like piece of the storage family
 * (nightstands, dressers, sideboards, TV units, bookcases, shoe cabinets and
 * wardrobes).
 *
 * Construction: a carcass of boards with real thickness (sides, top, bottom,
 * rebated back panel, dividers between rows and columns), on a recessed plinth
 * or on legs. Each cell of the grid is a door, a drawer, a tilting flap or an
 * open compartment. Fronts are inset in the carcass (its edges frame them) or
 * overlay it, always with 2.5 mm shadow gaps. Wardrobes can show their inside:
 * hanging rails with clothes, shelves of folded clothes and inner drawers.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, type BuildContext } from './kit';
import { bookRow, bookStack, fixedEmit, hash, lidBox, panel, place, rng, vase, type G } from './decor.parts';

/* -------------------------------------------------------------------- slots */

/** Bedroom pieces: oak carcass, greige lacquer fronts, black metal handles. */
export const CASE_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass', kind: 'wood', default: 'wood.oak' },
  { id: 'fronts', label: 'Doors and drawers', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.black' },
];

/** Living-room pieces: walnut throughout with brass handles. */
export const WALNUT_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass', kind: 'wood', default: 'wood.walnut' },
  { id: 'fronts', label: 'Doors and drawers', kind: 'wood', default: 'wood.walnut' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.brass' },
];

/** Wardrobes: oak carcass and inner fittings, greige fronts, black metal handles and rails. */
export const WARDROBE_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass', kind: 'wood', default: 'wood.oak' },
  { id: 'fronts', label: 'Doors', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Handles and rails', kind: 'metal', default: 'metal.black' },
];

/** Open shelving: oak boards against a greige back panel. */
export const SHELF_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Frame and shelves', kind: 'wood', default: 'wood.oak' },
  { id: 'back', label: 'Back panel', kind: 'lacquer', default: 'lacquer.greige' },
];

/* ------------------------------------------------------------------- params */

export type CellKind = 'door' | 'drawer' | 'flap' | 'open';
export type Handle = 'bar' | 'knob' | 'recess' | 'ledge';
export type FrontStyle = 'flat' | 'fluted' | 'shaker';

/** One row of the grid, listed from the top. `h` is a weight, `kinds` sets each column apart. */
export interface RowSpec {
  h?: number;
  cols?: number;
  kind?: CellKind | 'sliding';
  kinds?: CellKind[];
  /** Extra shelves inside open cells (default: one per 32 cm). */
  shelves?: number;
}

const HANDLE_DEPTH: Record<Handle, number> = { bar: 0.032, knob: 0.026, recess: 0, ledge: 0.014 };
/** Clothes and folded linen, as fixed materials. */
const CLOTHES = ['fabric.linen.sand', 'fabric.weave.grey', 'fabric.cotton.white', 'fabric.weave.charcoal'] as const;
const GAP = 0.0025;

interface Cell {
  kind: CellKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  row: number;
  col: number;
  cols: number;
  sliding: boolean;
}

/**
 * Params: `rows` (RowSpec[], top first; default one door), `plinth` or `legs`
 * (height in mm), `legStyle` 'wood' | 'metal', `handle` 'bar' | 'knob' |
 * 'recess' | 'ledge', `style` 'flat' | 'fluted' | 'shaker', `fronts` 'inset' |
 * 'overlay', `contents` (books and boxes in open cells), `undershelf` (a shelf
 * between the legs), `open` (wardrobes: no doors, the inside on show), `top`
 * (default: not when open, so the inside reads from above), `mirrorPanel`
 * (sliding doors with a mirror insert).
 */
export function buildCase(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const declared = new Set((entry.slots ?? []).map((s) => s.id));
  const slot = (id: string, fallback = 'carcass') => (declared.has(id) ? id : fallback);
  const rows = param<RowSpec[]>(entry, 'rows', [{ h: 1, cols: 1, kind: 'door' }]);
  const handle = param<Handle>(entry, 'handle', 'bar');
  const style = param<FrontStyle>(entry, 'style', 'flat');
  const overlay = param<string>(entry, 'fronts', 'inset') === 'overlay';
  const open = param(entry, 'open', false);
  const contents = param(entry, 'contents', false);
  const hasTop = param(entry, 'top', !open);
  const legStyle = param<'wood' | 'metal'>(entry, 'legStyle', 'wood');
  const undershelf = param(entry, 'undershelf', false);
  const mirrors = param(entry, 'mirrorPanel', 0);
  const rand = rng(hash(entry.id));

  const sliding = rows.some((r) => r.kind === 'sliding');
  const kindsOf = (r: RowSpec): CellKind[] => {
    const cols = Math.max(1, r.cols ?? r.kinds?.length ?? 1);
    return Array.from({ length: cols }, (_, i) => r.kinds?.[i] ?? (r.kind === 'sliding' ? 'door' : (r.kind ?? 'door')));
  };
  // Fronts that are drawn: open wardrobes leave their hinged doors off.
  const hasFronts = sliding || rows.some((r) => kindsOf(r).some((k) => k === 'drawer' || k === 'flap' || (k === 'door' && !open)));

  // Depth: handles and (overlay or sliding) fronts stand in front of the carcass.
  const t = THREE.MathUtils.clamp(Math.min(W, H) * 0.035, 0.012, 0.019); // board
  const ft = Math.min(0.019, D * 0.05); // front thickness
  const hp = hasFronts && !sliding ? HANDLE_DEPTH[handle] : 0;
  const zone = sliding ? 2 * ft + 0.01 : overlay && hasFronts ? ft : 0;
  const zBack = -D / 2;
  const zFront = D / 2 - hp - zone; // front edge of the carcass
  const cd = zFront - zBack;
  const zc = (zFront + zBack) / 2;

  // Height: plinth or legs, then the carcass.
  const legH = Math.min(param(entry, 'legs', 0) / 1000, H * 0.62);
  const plinthH = legH > 0 ? 0 : Math.min(param(entry, 'plinth', 0) / 1000, H * 0.14);
  const y0 = legH || plinthH;
  const tt = legH > 0 ? Math.min(t * 1.35, 0.026) : t; // a thicker top on pieces on legs
  const sideFrom = legH > 0 ? legH : 0;
  const yIn0 = y0 + t;
  const yIn1 = H - tt;

  const C = 'carcass';
  m.part(C, panel(t, (hasTop ? H - tt : H) - sideFrom, cd, -W / 2 + t / 2, sideFrom, zc));
  m.part(C, panel(t, (hasTop ? H - tt : H) - sideFrom, cd, W / 2 - t / 2, sideFrom, zc));
  if (hasTop) m.part(C, rbox(W, tt, cd, Math.min(0.004, tt / 3), 0, H - tt, zc, 2));
  m.part(C, panel(W - 2 * t, t, cd, 0, y0, zc));
  m.part(slot('back'), panel(W - 2 * t + 0.008, yIn1 - yIn0 + 0.008, 0.008, 0, yIn0 - 0.004, zBack + 0.012, 0.001));
  const zInBack = zBack + 0.016;

  // Base.
  if (plinthH > 0) {
    m.part(slot('fronts'), panel(W - 2 * t, plinthH - 0.002, 0.018, 0, 0, zFront - 0.05));
    m.part(C, panel(W - 2 * t, plinthH - 0.002, 0.018, 0, 0, zBack + 0.05));
  } else if (legH > 0) {
    const lx = W / 2 - Math.min(0.05, W * 0.08);
    const lz = cd / 2 - Math.min(0.05, cd * 0.12);
    const metal = legStyle === 'metal';
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (metal) m.part(slot('handles'), cyl(0.008, 0.007, legH, sx * (lx + 0.01), 0, zc + sz * lz, 'y', 12));
        else m.part(C, cyl(0.019, 0.012, legH, sx * lx, 0, zc + sz * lz, 'y', 16));
      }
    }
    if (undershelf) {
      const sy = legH * 0.32;
      m.part(C, panel(2 * lx + 0.012, 0.016, 2 * lz + 0.012, 0, sy, zc));
      if (contents) addShelfObjects(m, rand, -lx + 0.03, lx - 0.03, sy + 0.016, legH - 0.02, zc - lz + 0.02, zc + lz - 0.02, 1, 0);
    }
  }

  // The grid.
  const weights = rows.map((r) => r.h ?? 1);
  const total = weights.reduce((s, v) => s + v, 0);
  const availY = yIn1 - yIn0 - (rows.length - 1) * t;
  const cells: Cell[] = [];
  let y = yIn1;
  rows.forEach((row, r) => {
    const kinds = kindsOf(row);
    const rowH = (availY * weights[r]!) / total;
    const ya = y - rowH;
    const cols = kinds.length;
    const cw = (W - 2 * t - (cols - 1) * t) / cols;
    for (let c = 0; c < cols; c++) {
      const x0 = -W / 2 + t + c * (cw + t);
      cells.push({ kind: kinds[c]!, x0, x1: x0 + cw, y0: ya, y1: y, row: r, col: c, cols, sliding: row.kind === 'sliding' });
      if (c > 0) m.part(C, panel(t, rowH, cd - 0.012, x0 - t / 2, ya, zc + 0.006));
    }
    // Open cells get extra shelves.
    for (const cell of cells.filter((k) => k.row === r && k.kind === 'open')) {
      const n = row.shelves ?? Math.max(0, Math.round(rowH / 0.34) - 1);
      const pitch = rowH / (n + 1);
      for (let i = 1; i <= n; i++) m.part(C, panel(cell.x1 - cell.x0, t * 0.9, cd - 0.03, (cell.x0 + cell.x1) / 2, ya + pitch * i - t / 2, zc + 0.002));
    }
    if (r < rows.length - 1) m.part(C, panel(W - 2 * t, t, cd - 0.012, 0, ya - t, zc + 0.006));
    y = ya - t;
  });

  // Contents of open compartments.
  if (contents) {
    for (const cell of cells.filter((k) => k.kind === 'open')) {
      const row = rows[cell.row]!;
      const rowH = cell.y1 - cell.y0;
      const n = row.shelves ?? Math.max(0, Math.round(rowH / 0.34) - 1);
      const pitch = rowH / (n + 1);
      for (let i = 0; i <= n; i++) {
        const bottom = cell.y0 + pitch * i + (i > 0 ? t * 0.45 : 0);
        const top = cell.y0 + pitch * (i + 1) - (i < n ? t * 0.45 : 0);
        addShelfObjects(m, rand, cell.x0 + 0.012, cell.x1 - 0.012, bottom, top, zInBack + 0.01, zFront - 0.015, cells.length, cell.col + i);
      }
    }
  }

  // Fronts.
  const doorCells = cells.filter((c) => c.kind === 'door' && !c.sliding);
  if (sliding) addSlidingDoors(m, cells.filter((c) => c.sliding), { W, t, ft, zFront, open, mirrors, slot });
  for (const cell of cells) {
    if (cell.kind === 'open' || cell.sliding) continue;
    if (cell.kind === 'door' && open) continue;
    const rect = frontRect(cell, { W, t, overlay, yBottom: y0, yTop: yIn1, cells });
    const z0 = overlay ? zFront : zFront - ft;
    const orient = cell.kind === 'door' ? 'v' : 'h';
    // Door handles pair up at the meeting edges.
    const doorsInRow = doorCells.filter((d) => d.row === cell.row);
    const idx = doorsInRow.indexOf(cell);
    const edge: 1 | -1 = cell.kind !== 'door' ? 1 : doorsInRow.length === 1 ? 1 : idx % 2 === 0 && idx < doorsInRow.length - 1 ? 1 : -1;
    addFront(m, rect, z0, ft, style, handle, orient, edge, slot('fronts'), slot('handles'), H);
  }

  // Wardrobe interiors, on show when the doors are off (or slid aside).
  if (open) {
    const hidden = sliding ? slidingCover(cells.filter((c) => c.sliding), W) : null;
    const inside = { zIn0: zInBack, zIn1: zFront - (overlay || sliding ? 0 : ft) - 0.004, t };
    const doors = cells.filter((c) => c.kind === 'door');
    for (const cell of doors) {
      if (hidden && (cell.x0 + cell.x1) / 2 > hidden) continue;
      const bays = cell.cols;
      const layout = cell.y1 - cell.y0 < 1.1 ? 'folded' : bayLayout(cell.col, bays);
      addInterior(m, rand, cell, layout, inside, slot, hasTop);
    }
  }

  return m.build();
}

/* ------------------------------------------------------------------- fronts */

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function frontRect(cell: Cell, o: { W: number; t: number; overlay: boolean; yBottom: number; yTop: number; cells: Cell[] }): Rect {
  if (!o.overlay) return { x0: cell.x0 + GAP, x1: cell.x1 - GAP, y0: cell.y0 + GAP, y1: cell.y1 - GAP };
  // Overlay: the front covers half of each divider it meets, and the outer boards entirely.
  const half = o.t / 2;
  const x0 = cell.col === 0 ? -o.W / 2 + GAP / 2 : cell.x0 - half + GAP / 2;
  const x1 = cell.col === cell.cols - 1 ? o.W / 2 - GAP / 2 : cell.x1 + half - GAP / 2;
  const lastRow = Math.max(...o.cells.map((c) => c.row));
  const y0 = cell.row === lastRow ? o.yBottom + GAP : cell.y0 - half + GAP / 2;
  const y1 = cell.row === 0 ? o.yTop - GAP : cell.y1 + half - GAP / 2;
  return { x0, x1, y0, y1 };
}

/**
 * One door, drawer or flap front with its handle. `z0` is the back face of the
 * front; `orient` 'v' puts a door handle upright at the `edge` side.
 */
function addFront(m: Model, r: Rect, z0: number, ft: number, style: FrontStyle, handle: Handle, orient: 'v' | 'h', edge: 1 | -1, fronts: string, handles: string, H: number): void {
  let { x0, x1, y0, y1 } = r;
  const face = z0 + ft;
  // A recessed pull is a metal channel cut into the front's top edge (drawers) or its opening edge (doors).
  if (handle === 'recess') {
    const ch = Math.min(0.026, (orient === 'h' ? y1 - y0 : x1 - x0) * 0.3);
    if (orient === 'h') {
      m.part(handles, panel(x1 - x0, ch - 0.002, 0.012, (x0 + x1) / 2, y1 - ch + 0.001, face - 0.014, 0.001));
      y1 -= ch;
    } else if (edge > 0) {
      m.part(handles, panel(ch - 0.002, y1 - y0, 0.012, x1 - ch / 2, y0, face - 0.014, 0.001));
      x1 -= ch;
    } else {
      m.part(handles, panel(ch - 0.002, y1 - y0, 0.012, x0 + ch / 2, y0, face - 0.014, 0.001));
      x0 += ch;
    }
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  if (style === 'fluted') {
    const rr = Math.min(0.009, ft * 0.45);
    m.part(fronts, panel(w, h, ft - rr, cx, y0, z0 + (ft - rr) / 2));
    const n = Math.max(3, Math.round(w / 0.024));
    const pitch = w / n;
    for (let i = 0; i < n; i++) m.part(fronts, cyl(rr, rr, h - 0.004, x0 + pitch * (i + 0.5), y0 + 0.002, face - rr, 'y', 8));
  } else if (style === 'shaker' && w > 0.16 && h > 0.12) {
    const rail = Math.min(0.055, w * 0.16, h * 0.2);
    m.part(fronts, panel(w, h, ft * 0.55, cx, y0, z0 + ft * 0.275));
    m.part(fronts, panel(rail, h, ft * 0.45, x0 + rail / 2, y0, face - ft * 0.225));
    m.part(fronts, panel(rail, h, ft * 0.45, x1 - rail / 2, y0, face - ft * 0.225));
    m.part(fronts, panel(w - 2 * rail, rail, ft * 0.45, cx, y0, face - ft * 0.225));
    m.part(fronts, panel(w - 2 * rail, rail, ft * 0.45, cx, y1 - rail, face - ft * 0.225));
  } else {
    m.part(fronts, rbox(w, h, ft, 0.0025, cx, y0, z0 + ft / 2, 1));
  }
  if (handle === 'recess') return;

  // Handle position: drawers in the middle (upper part of deep ones); doors at the opening edge.
  let hx = cx;
  let hy: number;
  let len: number;
  if (orient === 'h') {
    len = Math.min(0.32, w * 0.42);
    hy = h > 0.26 ? y1 - 0.075 : (y0 + y1) / 2;
  } else {
    len = THREE.MathUtils.clamp(h * 0.24, 0.1, 0.46);
    hx = edge > 0 ? x1 - 0.04 : x0 + 0.04;
    // Low doors: near their top. Tall doors: at about a metre.
    hy = y1 < 1.15 ? y1 - 0.07 - len / 2 : y0 > 1.2 ? y0 + 0.07 + len / 2 : THREE.MathUtils.clamp(Math.min(1.05, H * 0.5), y0 + len / 2 + 0.05, y1 - len / 2 - 0.05);
  }
  addHandle(m, handles, handle, hx, hy, face, orient, len, x1 - x0, y1);
}

function addHandle(m: Model, slot: string, handle: Handle, x: number, y: number, face: number, orient: 'v' | 'h', len: number, frontW: number, frontTop: number): void {
  const hp = HANDLE_DEPTH[handle];
  if (handle === 'knob') {
    const k = lathe([[0, 0], [0.006, 0], [0.006, hp * 0.45], [0.012, hp * 0.7], [0.0145, hp * 0.86], [0.012, hp], [0, hp]], 0, 0, 0, 20);
    k.rotateX(Math.PI / 2);
    // Drawers: one knob in the middle; doors: at the edge.
    m.part(slot, k.translate(x, y, face));
    return;
  }
  if (handle === 'ledge') {
    // A thin brass ledge over the top edge (drawers) or the opening edge (doors).
    const l = Math.min(0.16, frontW * 0.5);
    if (orient === 'h') m.part(slot, rbox(l, 0.004, hp + 0.01, 0.0015, x, frontTop - 0.004, face + (hp - 0.01) / 2, 1));
    else m.part(slot, rbox(0.004, len, hp + 0.01, 0.0015, x, y - len / 2, face + (hp - 0.01) / 2, 1));
    return;
  }
  // Bar on two stand-offs.
  const r = 0.0065;
  const stand = hp - r;
  if (orient === 'h') {
    m.part(slot, cyl(r, r, len, x, y, face + stand, 'x', 12));
    for (const s of [-1, 1]) m.part(slot, cyl(0.0045, 0.0045, stand, x + s * (len / 2 - 0.012), y, face + stand / 2, 'z', 10));
  } else {
    m.part(slot, cyl(r, r, len, x, y - len / 2, face + stand, 'y', 12));
    for (const s of [-1, 1]) m.part(slot, cyl(0.0045, 0.0045, stand, x, y + s * (len / 2 - 0.012), face + stand / 2, 'z', 10));
  }
}

/** The x beyond which open sliding doors hide the inside (doors stacked to the right). */
function slidingCover(cells: Cell[], W: number): number {
  const n = Math.max(2, cells.length);
  return W / 2 - (W / n) * 1.02;
}

/** Sliding doors on two tracks in front of the carcass, with full-height edge profiles. Open: stacked to the right. */
function addSlidingDoors(
  m: Model,
  cells: Cell[],
  o: { W: number; t: number; ft: number; zFront: number; open: boolean; mirrors: number; slot: (id: string, f?: string) => string },
): void {
  if (cells.length === 0) return;
  const n = Math.max(2, cells.length);
  const y0 = Math.min(...cells.map((c) => c.y0)) - o.t;
  const y1 = Math.max(...cells.map((c) => c.y1)) + o.t;
  const overlap = 0.03;
  const dw = (o.W - 0.006 + overlap * (n - 1)) / n;
  const fronts = o.slot('fronts');
  const metal = o.slot('handles');
  // Tracks: top and bottom rails across the front.
  const depth = 2 * o.ft + 0.01;
  m.part(metal, panel(o.W - 0.004, 0.016, depth, 0, y1 - 0.016, o.zFront + depth / 2, 0.001));
  m.part(metal, panel(o.W - 0.004, 0.012, depth, 0, y0, o.zFront + depth / 2, 0.001));
  for (let i = 0; i < n; i++) {
    const front = i % 2 === 0;
    const z = o.zFront + (front ? o.ft + 0.008 : 0.002);
    let x = -o.W / 2 + 0.003 + dw / 2 + i * (dw - overlap);
    if (o.open) x = o.W / 2 - 0.003 - dw / 2 - (front ? 0 : 0.0);
    const yb = y0 + 0.014;
    const h = y1 - 0.018 - yb;
    if (i < o.mirrors) {
      // Mirror insert in a slim frame.
      const fr = Math.min(0.06, dw * 0.1);
      m.part(fronts, panel(dw, fr, o.ft, x, yb, z + o.ft / 2));
      m.part(fronts, panel(dw, fr, o.ft, x, yb + h - fr, z + o.ft / 2));
      m.part(fronts, panel(fr, h - 2 * fr, o.ft, x - dw / 2 + fr / 2, yb + fr, z + o.ft / 2));
      m.part(fronts, panel(fr, h - 2 * fr, o.ft, x + dw / 2 - fr / 2, yb + fr, z + o.ft / 2));
      m.fixed('glass.mirror', panel(dw - 2 * fr + 0.004, h - 2 * fr + 0.004, 0.006, x, yb + fr - 0.002, z + o.ft * 0.6, 0.001));
    } else {
      m.part(fronts, rbox(dw, h, o.ft, 0.0025, x, yb, z + o.ft / 2, 1));
    }
    // Edge profiles double as pulls.
    for (const s of [-1, 1]) m.part(metal, panel(0.012, h, o.ft + 0.002, x + s * (dw / 2 - 0.006), yb, z + o.ft / 2, 0.001));
  }
}

/* ---------------------------------------------------------------- interiors */

type Layout = 'long' | 'double' | 'shelves' | 'folded';

function bayLayout(col: number, cols: number): Layout {
  if (cols === 1) return 'long';
  if (cols === 2) return col === 0 ? 'long' : 'double';
  if (cols === 3) return (['long', 'shelves', 'double'] as const)[col]!;
  return (['long', 'double', 'shelves', 'long'] as const)[col % 4]!;
}

function addInterior(m: Model, rand: () => number, cell: Cell, layout: Layout, o: { zIn0: number; zIn1: number; t: number }, slot: (id: string, f?: string) => string, hasTop: boolean): void {
  const { x0, x1, y0, y1 } = cell;
  const zMid = (o.zIn0 + o.zIn1) / 2;
  const depth = o.zIn1 - o.zIn0;
  const w = x1 - x0;
  const metal = slot('handles');
  const shelf = (y: number) => m.part('carcass', panel(w, o.t * 0.9, depth - 0.01, (x0 + x1) / 2, y, zMid));
  if (layout === 'folded') {
    addFolded(m, rand, x0, x1, y0, y1 - 0.02, zMid, depth);
    return;
  }
  if (layout === 'shelves') {
    // Two inner drawers below, shelves of folded clothes above.
    const dh = Math.min(0.2, (y1 - y0) * 0.11);
    for (let i = 0; i < 2; i++) {
      const yb = y0 + 0.004 + i * (dh + 0.004);
      m.part(slot('fronts'), rbox(w - 0.01, dh, 0.016, 0.002, (x0 + x1) / 2, yb, o.zIn1 - 0.03, 1));
      m.part(metal, panel(Math.min(0.14, w * 0.4), 0.012, 0.01, (x0 + x1) / 2, yb + dh - 0.03, o.zIn1 - 0.017, 0.001));
    }
    const base = y0 + 2 * (dh + 0.004) + 0.004;
    shelf(base);
    const n = Math.max(2, Math.round((y1 - base) / 0.34));
    const pitch = (y1 - base) / n;
    for (let i = 0; i < n; i++) {
      const yb = base + o.t + pitch * i;
      if (i > 0) shelf(yb - o.t);
      addFolded(m, rand, x0, x1, yb, Math.min(yb + pitch - o.t - 0.02, yb + 0.26), zMid, depth);
    }
    return;
  }
  // Hanging: a hat shelf, one or two rails, clothes.
  // With the top off (a cut-away for the plan view) there is no hat shelf, so the rail and clothes read from above.
  const hatY = hasTop ? y1 - THREE.MathUtils.clamp((y1 - y0) * 0.17, 0.22, 0.34) : y1 - 0.02;
  if (hasTop) {
    shelf(hatY);
    addFolded(m, rand, x0, x1, hatY + o.t, y1 - 0.02, zMid, depth);
  }
  const rails = layout === 'double' ? [hatY - 0.06, y0 + (hatY - y0) * 0.48] : [hatY - 0.06];
  rails.forEach((ry, i) => {
    m.part(metal, cyl(0.0125, 0.0125, w - 0.004, (x0 + x1) / 2, ry, zMid, 'x', 14));
    const room = i === 0 && rails.length === 2 ? ry - rails[1]! - 0.05 : ry - y0 - 0.08;
    addClothes(m, rand, x0 + 0.03, x1 - 0.03, ry, zMid, Math.min(0.5, depth * 0.84), room, metal);
  });
}

/** Garments on hangers along a rail at height `ry`, from x0 to x1. */
function addClothes(m: Model, rand: () => number, x0: number, x1: number, ry: number, z: number, width: number, room: number, metal: string): void {
  let x = x0;
  while (true) {
    const th = 0.022 + rand() * 0.03;
    if (x + th > x1) break;
    const kind = rand();
    const len = Math.min(room, kind < 0.25 ? 1.05 + rand() * 0.15 : kind < 0.75 ? 0.72 + rand() * 0.12 : 0.55 + rand() * 0.08);
    const gw = width * (kind > 0.75 ? 0.72 : 0.92 + rand() * 0.08);
    const top = ry - 0.045;
    const g = rbox(th, len, gw, Math.min(th * 0.45, 0.014), 0, -len, 0, 1);
    // Shoulders: narrower at the top, a little flare at the hem.
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = -pos.getY(i) / len; // 0 at the top
      const s = v < 0.2 ? 0.7 + 1.5 * v : 1 + 0.05 * (v - 0.2);
      pos.setZ(i, pos.getZ(i) * s);
    }
    g.computeVertexNormals();
    m.fixed(CLOTHES[Math.floor(rand() * CLOTHES.length)]!, place(g, x + th / 2, top, z + (rand() - 0.5) * 0.02, (rand() - 0.5) * 0.12, 0, 0));
    // Hanger and hook.
    m.part('carcass', rbox(0.01, 0.01, gw * 0.86, 0.003, x + th / 2, top - 0.006, z, 1));
    m.part(metal, cyl(0.002, 0.002, 0.04, x + th / 2, top, z, 'y', 6));
    x += th + 0.006 + rand() * 0.02;
  }
}

/** Stacks of folded clothes and a lidded box between x0 and x1, from y0 up to at most y1. */
function addFolded(m: Model, rand: () => number, x0: number, x1: number, y0: number, y1: number, z: number, depth: number): void {
  const room = y1 - y0;
  if (room < 0.05) return;
  const sw = Math.min(0.32, (x1 - x0) * 0.42);
  const sd = Math.min(0.34, depth * 0.8);
  let x = x0 + 0.02;
  while (x + sw <= x1 - 0.015) {
    if (rand() < 0.28 && room > 0.14) {
      const bh = Math.min(room - 0.01, 0.2 + rand() * 0.06);
      const b = lidBox(sw, bh, sd, x + sw / 2, y0, z);
      m.fixed('woven.jute', b.body);
      m.fixed('woven.jute', b.lid);
    } else {
      const n = Math.max(1, Math.min(5, Math.floor((Math.min(room, 0.26) - 0.01) / 0.05)));
      let yy = y0;
      for (let i = 0; i < n; i++) {
        const h = 0.04 + rand() * 0.015;
        if (yy + h > y1) break;
        m.fixed(CLOTHES[Math.floor(rand() * CLOTHES.length)]!, rbox(sw * (0.94 + rand() * 0.06), h, sd * (0.94 + rand() * 0.06), 0.016, x + sw / 2 + (rand() - 0.5) * 0.01, yy, z + (rand() - 0.5) * 0.01, 2));
        yy += h;
      }
    }
    x += sw + 0.03;
  }
}

/* ------------------------------------------------------------ shelf objects */

/**
 * Styles one compartment: a row of books with a vase, a stack with a box, a
 * pair of baskets, or a single object, leaving some air. Covers come in three
 * colours; boxes are jute, vases terracotta.
 */
export function addShelfObjects(m: Model, rand: () => number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, _cells: number, k: number): void {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  if (w < 0.1 || h < 0.1 || d < 0.08) return;
  const emit = fixedEmit(m, 3);
  const pick = (k * 0.37 + rand()) % 1;
  const zf = z1 - 0.01;
  if (pick < 0.5) {
    const end = bookRow(emit, rand, x0 + 0.005, x0 + w * (0.55 + rand() * 0.3), y0, zf, h - 0.02, d - 0.01);
    if (x1 - end > 0.1 && h > 0.14 && rand() < 0.55) m.fixed('ceramic.terracotta', vase(Math.min(h - 0.02, 0.22), Math.min(0.05, (x1 - end) / 3), (end + x1) / 2 + 0.01, y0, (z0 + z1) / 2));
  } else if (pick < 0.78) {
    const sw = Math.min(0.26, w * 0.5);
    bookStack(emit, rand, 2 + Math.floor(rand() * 3), x0 + sw / 2 + 0.02, y0, (z0 + z1) / 2, sw, Math.min(0.2, d - 0.02), h - 0.02);
    if (w - sw > 0.16 && rand() < 0.5) {
      const bw = Math.min(0.24, w - sw - 0.06);
      const b = lidBox(bw, Math.min(h - 0.02, 0.15), Math.min(0.24, d - 0.02), x1 - bw / 2 - 0.02, y0, (z0 + z1) / 2);
      m.fixed('woven.jute', b.body);
      m.fixed('woven.jute', b.lid);
    } else if (w - sw > 0.12 && h > 0.14) {
      m.fixed('ceramic.terracotta', vase(Math.min(h - 0.02, 0.2), Math.min(0.05, (w - sw) / 4), x0 + sw + (w - sw) / 2 + 0.02, y0, (z0 + z1) / 2));
    }
  } else if (pick < 0.88) {
    const n = w > 0.5 ? 2 : 1;
    const bw = Math.min(0.34, (w - 0.02 * (n + 1)) / n);
    for (let i = 0; i < n; i++) {
      const b = lidBox(bw, Math.min(h - 0.015, 0.2), Math.min(0.3, d - 0.01), x0 + 0.02 + bw / 2 + i * (bw + 0.02), y0, (z0 + z1) / 2);
      m.fixed('woven.jute', b.body);
      m.fixed('woven.jute', b.lid);
    }
  } else if (h > 0.14) {
    m.fixed('ceramic.terracotta', vase(Math.min(h - 0.02, 0.24), Math.min(0.06, w / 4), x0 + w * 0.6, y0, (z0 + z1) / 2));
  }
}

export type { G };
