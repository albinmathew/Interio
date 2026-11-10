/**
 * `cabinet`: one generator for every piece of case furniture the kit lacks
 * (wardrobes, dressers, sideboards, shoe cabinets, kitchen runs, islands, tall units).
 *
 * The carcass is built from panels so open rows read as real niches; fronts sit
 * proud of it with small gaps, which gives door and drawer seams without textures.
 */
import type { CatalogEntry } from '@interio/core';
import type { PaletteKey } from '../palette';
import { Builder, param, size } from './kit';

export type FrontKind = 'door' | 'drawer' | 'open' | 'sliding' | 'flap';

export interface CabinetRow {
  /** Relative height of the row. */
  h: number;
  /** Number of fronts across the row. */
  cols: number;
  kind: FrontKind;
}

export interface CabinetParams {
  /** Rows of fronts from top to bottom. */
  rows?: CabinetRow[];
  finish?: PaletteKey;
  frontFinish?: PaletteKey;
  /** Colour seen in the gaps and inside open niches. */
  insideFinish?: PaletteKey;
  handleFinish?: PaletteKey;
  handle?: 'bar' | 'knob' | 'none';
  /** Recessed plinth height, mm. */
  plinth?: number;
  /** Leg height, mm (instead of a plinth). */
  legs?: number;
  /** Separate top slab: thickness and overhangs, mm. */
  top?: { thickness: number; finish?: PaletteKey; front?: number; back?: number; sides?: number };
  /** Index of the sliding panel that carries a mirror. */
  mirrorPanel?: number;
}

const T = 0.018; // panel thickness
const GAP = 0.006; // gap between fronts
const FRONT = 0.018; // front thickness
const HANDLE = 0.026; // handle projection beyond the front

export function buildCabinet(entry: CatalogEntry): ReturnType<Builder['build']> {
  const { W, D, H } = size(entry);
  const rows = param<CabinetRow[]>(entry, 'rows', [{ h: 1, cols: 2, kind: 'door' }]);
  const finish = param<PaletteKey>(entry, 'finish', 'wood');
  const frontFinish = param<PaletteKey>(entry, 'frontFinish', finish);
  const inside = param<PaletteKey>(entry, 'insideFinish', 'woodDark');
  const handleFinish = param<PaletteKey>(entry, 'handleFinish', 'steel');
  const handle = param<'bar' | 'knob' | 'none'>(entry, 'handle', 'bar');
  const plinth = param<number>(entry, 'plinth', 0) / 1000;
  const legs = param<number>(entry, 'legs', 0) / 1000;
  const top = param<CabinetParams['top'] | undefined>(entry, 'top', undefined);

  const b = new Builder();
  const topT = (top?.thickness ?? 0) / 1000;
  const oFront = (top?.front ?? 0) / 1000;
  const oBack = (top?.back ?? 0) / 1000;
  const oSides = (top?.sides ?? 0) / 1000;
  const hasHandles = handle !== 'none' && rows.some((r) => r.kind !== 'open' && r.kind !== 'sliding');
  const hasFronts = rows.some((r) => r.kind !== 'open');

  // Extents. The front-most thing (handle or top overhang) touches z = D/2.
  const proud = Math.max(hasHandles ? HANDLE : 0, oFront);
  const frontFace = D / 2 - proud; // outer face of the fronts
  const carcassFront = frontFace - (hasFronts ? FRONT : 0);
  const carcassBack = -D / 2 + oBack;
  const cw = W - 2 * oSides;
  const cd = carcassFront - carcassBack;
  const cz = (carcassFront + carcassBack) / 2;
  const base = Math.max(plinth, legs);
  const bodyTop = H - topT;
  const bodyH = bodyTop - base;

  // Base.
  if (plinth > 0) b.box(inside, cw - 0.02, plinth, cd - 0.05, 0, 0, cz - 0.015);
  if (legs > 0) {
    const s = 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(finish, s, legs, s, sx * (cw / 2 - s / 2 - 0.02), 0, cz + sz * (cd / 2 - s / 2 - 0.02));
  }

  // Carcass panels.
  b.box(finish, T, bodyH, cd, -cw / 2 + T / 2, base, cz);
  b.box(finish, T, bodyH, cd, cw / 2 - T / 2, base, cz);
  b.box(finish, cw - 2 * T, T, cd, 0, base, cz);
  b.box(finish, cw - 2 * T, T, cd, 0, bodyTop - T, cz);
  b.box(inside, cw - 2 * T, bodyH - 2 * T, 0.006, 0, base + T, carcassBack + 0.003);
  if (top) b.box(top.finish ?? 'worktop', W, topT, D, 0, bodyTop, 0);

  // Rows.
  const totalWeight = rows.reduce((s, r) => s + r.h, 0);
  let y = bodyTop;
  rows.forEach((row, ri) => {
    const rh = (bodyH * row.h) / totalWeight;
    const y0 = y - rh;
    // Shelf under every row but the last, set back behind the fronts.
    if (ri < rows.length - 1) b.box(finish, cw - 2 * T, T, cd - 0.004, 0, y0 - T / 2, cz - 0.002);
    const colW = cw / row.cols;

    if (row.kind === 'open') {
      for (let c = 1; c < row.cols; c++) b.box(finish, T, rh, cd - 0.004, -cw / 2 + c * colW, y0, cz - 0.002);
    } else if (row.kind === 'sliding') {
      // Overlapping panels on two tracks, with slim full-height pulls.
      const overlap = 0.03;
      const pw = (cw + overlap * (row.cols - 1)) / row.cols;
      const mirror = param<number>(entry, 'mirrorPanel', -1);
      b.box(inside, cw - 2 * T, rh, 0.004, 0, y0, carcassFront - 0.002);
      for (let c = 0; c < row.cols; c++) {
        const x = -cw / 2 + pw / 2 + c * (pw - overlap);
        const forward = c % 2 === 0;
        const zc = carcassFront + (forward ? FRONT * 0.75 : FRONT * 0.25);
        b.box(c === mirror ? 'mirror' : frontFinish, pw, rh - 2 * GAP, FRONT / 2, x, y0 + GAP, zc);
        const edge = c % 2 === 0 ? x + pw / 2 - 0.035 : x - pw / 2 + 0.035;
        b.box(handleFinish, 0.012, Math.min(rh * 0.5, 1.1), 0.004, edge, y0 + rh / 2 - Math.min(rh * 0.5, 1.1) / 2, zc + FRONT / 4 - 0.001);
      }
    } else {
      // Dark backing shows through the gaps so door and drawer seams read at any size.
      b.box(inside, cw - 0.002, rh, 0.003, 0, y0, carcassFront + 0.0015);
      for (let c = 0; c < row.cols; c++) {
        const x = -cw / 2 + colW * (c + 0.5);
        const fw = colW - GAP;
        const fh = rh - GAP;
        b.box(frontFinish, fw, fh, FRONT, x, y0 + GAP / 2, carcassFront + FRONT / 2);
        if (handle === 'none') continue;
        const hz = frontFace + HANDLE / 2;
        if (row.kind === 'drawer' || row.kind === 'flap') {
          if (handle === 'knob') b.cyl(handleFinish, 0.014, 0.011, HANDLE, x, y0 + fh * (row.kind === 'flap' ? 0.82 : 0.5), hz, 'z', 12);
          else {
            const len = Math.min(0.22, fw * 0.4);
            b.box(handleFinish, len, 0.012, HANDLE, x, y0 + fh * (row.kind === 'flap' ? 0.82 : 0.5) - 0.006, hz);
          }
        } else {
          // Doors: handle on the edge where a pair meets (or the right edge of a single door).
          const meetsRight = row.cols === 1 ? true : c % 2 === 0 ? c < row.cols - 1 : false;
          const hx = x + (meetsRight ? 1 : -1) * (fw / 2 - 0.04);
          // Tall doors are pulled at hand height, wall units near the bottom, base units near the top.
          const len = Math.min(0.2, fh * 0.5);
          const centre = fh > 1.3 ? Math.min(Math.max(1.02 - y0, len), fh - len) : entry.anchor === 'wall' ? len / 2 + 0.05 : fh - len / 2 - 0.05;
          if (handle === 'knob') b.cyl(handleFinish, 0.014, 0.011, HANDLE, hx, y0 + centre, hz, 'z', 12);
          else b.box(handleFinish, 0.012, len, HANDLE, hx, y0 + centre - len / 2, hz);
        }
      }
    }
    y = y0;
  });

  return b.build(`cabinet:${entry.id}`);
}
