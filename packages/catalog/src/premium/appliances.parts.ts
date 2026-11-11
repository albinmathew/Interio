/**
 * Slots, fixed materials and small parts shared by the appliance generators
 * (`appliances.ts`, `appliances.home.ts`).
 */
import type { FinishSlot } from '@interio/core';
import type * as THREE from 'three';
import { KITCHEN_BASE_SLOTS, KITCHEN_WALL_SLOTS, SHADOW } from './kitchen';
import { type Model, box, cyl, rbox } from './kit';

/* ------------------------------------------------------------------ slots */

export const A_BODY: FinishSlot = { id: 'body', label: 'Body', kind: 'metal', default: 'metal.steel' };
export const A_HANDLES: FinishSlot = { id: 'handles', label: 'Handles and knobs', kind: 'metal', default: 'metal.chrome' };
export const A_TOP: FinishSlot = { id: 'top', label: 'Glass top', kind: 'lacquer', default: 'lacquer.black.gloss' };
export const A_SUPPORTS: FinishSlot = { id: 'supports', label: 'Pan supports', kind: 'metal', default: 'metal.black' };
export const A_CONTROLS: FinishSlot = { id: 'controls', label: 'Knobs and trim', kind: 'metal', default: 'metal.steel' };

export const FRIDGE_SLOTS: FinishSlot[] = [A_BODY, A_HANDLES];
export const GAS_HOB_SLOTS: FinishSlot[] = [A_TOP, A_SUPPORTS, A_CONTROLS];
export const INDUCTION_SLOTS: FinishSlot[] = [A_TOP, A_CONTROLS];
export const RANGE_SLOTS: FinishSlot[] = [A_BODY, A_HANDLES, A_TOP];
export const APPLIANCE_SLOTS: FinishSlot[] = [A_BODY, A_HANDLES];
export const HOOD_SLOTS: FinishSlot[] = [A_BODY, { id: 'controls', label: 'Controls', kind: 'metal', default: 'metal.black' }];
/** Built-in appliances wear the kitchen's own fronts, worktop, carcass and rails. */
export const BUILT_IN_BASE_SLOTS = KITCHEN_BASE_SLOTS;
export const BUILT_IN_TALL_SLOTS = KITCHEN_WALL_SLOTS;

/** Fixed materials shared by the appliances. */
export const GASKET = SHADOW;
export const GLOSS = 'lacquer.black.gloss';
export const STEEL = 'metal.steel';
export const CAST = 'metal.black';
export const DISPLAY = '#8fd9ff';

/* ---------------------------------------------------------------- pieces */

/** A lit display on a black glass window, centred on (x, y), its face at z. */
export function display(m: Model, x: number, y: number, z: number, w: number, h: number, digits = 4): void {
  m.fixed(GLOSS, rbox(w, h, 0.003, 0.001, x, y - h / 2, z + 0.0015, 1));
  const dw = (w * 0.7) / digits;
  for (let i = 0; i < digits; i++) {
    const dx = x - (w * 0.7) / 2 + dw * (i + 0.5);
    // A seven-segment-ish digit: two uprights and three bars.
    for (const s of [-1, 1]) m.fixed(DISPLAY, box(dw * 0.12, h * 0.5, 0.001, dx + (s * dw * 0.28), y - h * 0.25, z + 0.0034));
    for (const k of [-1, 0, 1]) m.fixed(DISPLAY, box(dw * 0.56, h * 0.07, 0.001, dx, y + k * h * 0.22 - h * 0.035, z + 0.0034));
  }
}

/** A round control knob facing +Z from z: skirt, grip, indicator line. */
export function knob(m: Model, slot: string, x: number, y: number, z: number, r: number, len: number, mark = GASKET): void {
  // A slot name, or `mat:<id>` for a knob in a fixed material.
  const put = (g: THREE.BufferGeometry) => (slot.startsWith('mat:') ? m.fixed(slot.slice(4), g) : m.part(slot, g));
  put(cyl(r * 1.12, r * 1.15, len * 0.25, x, y, z + len * 0.125, 'z', 24));
  put(cyl(r * 0.95, r, len * 0.8, x, y, z + len * 0.6, 'z', 24));
  m.fixed(mark, box(r * 0.16, r * 0.8, 0.001, x, y + r * 0.05, z + len + 0.0004));
}

/** A bar handle on two stand-offs, proud of z by `proj`. Vertical or horizontal, centred on (x, y). */
export function barPull(m: Model, slot: string, x: number, y: number, len: number, z: number, vertical: boolean, proj = 0.035, t = 0.016): void {
  const zc = z + proj - t / 2;
  if (vertical) {
    m.part(slot, rbox(t, len, t, t * 0.45, x, y - len / 2, zc, 3));
    for (const s of [-1, 1]) m.part(slot, cyl(t * 0.32, t * 0.32, proj - t + 0.002, x, y + s * (len / 2 - 0.03), z + (proj - t) / 2, 'z', 12));
  } else {
    m.part(slot, rbox(len, t, t, t * 0.45, x, y - t / 2, zc, 3));
    for (const s of [-1, 1]) m.part(slot, cyl(t * 0.32, t * 0.32, proj - t + 0.002, x + s * (len / 2 - 0.03), y, z + (proj - t) / 2, 'z', 12));
  }
}

/** A door panel (x0..x1, y0..y1) whose face is at z, `t` thick, with a dark gasket behind its edges. */
export function door(m: Model, slot: string, x0: number, x1: number, y0: number, y1: number, z: number, t: number, r = 0.008): void {
  m.part(slot, rbox(x1 - x0, y1 - y0, t, r, (x0 + x1) / 2, y0, z - t / 2, 3));
  m.fixed(GASKET, rbox(x1 - x0 + 0.002, y1 - y0 + 0.002, 0.006, 0.002, (x0 + x1) / 2, y0 - 0.001, z - t - 0.002, 1));
}

/** Adjustable feet under the corners of a footprint. */
export function feet(m: Model, w: number, d: number, h: number, zc = 0): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.fixed(GASKET, cyl(0.016, 0.018, h, sx * (w / 2 - 0.04), 0, zc + sz * (d / 2 - 0.05), 'y', 14));
}

