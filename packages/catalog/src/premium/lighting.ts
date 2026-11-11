/**
 * Premium generators: lighting. Shades are thin shells (an outer and an inner
 * skin) with wire rings and a bulb inside; stems are slender, bases weighted.
 * See `beds.ts` for the conventions. Ceiling pieces hang down from their top
 * (y = H is the ceiling); wall pieces have their back at -Z.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, tube, type BuildContext } from './kit';
import { Fit, join, surface, twoSided, type G } from './decor.parts';

/* -------------------------------------------------------------------- slots */

const linen: FinishSlot = { id: 'shade', label: 'Shade', kind: 'fabric', default: 'fabric.linen.ivory' };
export const FLOOR_LAMP_SLOTS: FinishSlot[] = [
  linen,
  { id: 'stem', label: 'Stem', kind: 'metal', default: 'metal.black' },
  { id: 'base', label: 'Base', kind: 'stone', default: 'stone.travertine' },
];
export const COLUMN_LAMP_SLOTS: FinishSlot[] = [
  linen,
  { id: 'stem', label: 'Column', kind: 'wood', default: 'wood.oak' },
  { id: 'base', label: 'Base', kind: 'metal', default: 'metal.black' },
];
export const TABLE_LAMP_SLOTS: FinishSlot[] = [
  linen,
  { id: 'base', label: 'Base', kind: 'ceramic', default: 'ceramic.white' },
  { id: 'stem', label: 'Fittings', kind: 'metal', default: 'metal.brass' },
];
export const TABLE_LAMP_STONE_SLOTS: FinishSlot[] = [
  linen,
  { id: 'base', label: 'Base', kind: 'stone', default: 'stone.travertine' },
  { id: 'stem', label: 'Fittings', kind: 'metal', default: 'metal.brass' },
];
export const PENDANT_FABRIC_SLOTS: FinishSlot[] = [
  { id: 'shade', label: 'Shade', kind: 'fabric', default: 'fabric.linen.sand' },
  { id: 'stem', label: 'Canopy and cord', kind: 'metal', default: 'metal.black' },
];
export const PENDANT_DOME_SLOTS: FinishSlot[] = [
  { id: 'shade', label: 'Shade', kind: 'metal', default: 'metal.black' },
  { id: 'stem', label: 'Canopy and cord', kind: 'metal', default: 'metal.brass' },
];
export const SCONCE_SLOTS: FinishSlot[] = [linen, { id: 'stem', label: 'Arm and back plate', kind: 'metal', default: 'metal.brass' }];
export const FLUSH_SLOTS: FinishSlot[] = [
  { id: 'diffuser', label: 'Diffuser', kind: 'glass', default: 'glass.frosted' },
  { id: 'trim', label: 'Trim', kind: 'metal', default: 'metal.brass' },
];
export const DOWNLIGHT_SLOTS: FinishSlot[] = [
  { id: 'trim', label: 'Trim', kind: 'metal', default: 'metal.white' },
  { id: 'reflector', label: 'Reflector', kind: 'metal', default: 'metal.chrome' },
];
export const BATTEN_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.white' },
  { id: 'diffuser', label: 'Diffuser', kind: 'glass', default: 'glass.frosted' },
];

/** The lamp itself: a warm white bulb. */
const BULB = 'lacquer.white.gloss';

/* ------------------------------------------------------------------- shades */

export type ShadeKind = 'drum' | 'taper' | 'pleated' | 'square';

/**
 * A lampshade from y0 up by h: two skins 2 mm apart (so it reads from inside
 * and out), bottom radius rb, top radius rt. Square shades have rb/rt as half-widths.
 */
function shadeShell(kind: ShadeKind, rb: number, rt: number, h: number, y0: number): G {
  const t = 0.002;
  if (kind === 'pleated') {
    const pleats = Math.max(24, Math.round((Math.PI * (rb + rt)) / 0.022));
    const skin = (inset: number) =>
      surface(pleats * 2, 3, (u, v) => {
        const a = u * Math.PI * 2;
        const zig = (u * pleats * 2) % 2 < 1 ? (u * pleats * 2) % 1 : 1 - ((u * pleats * 2) % 1);
        const r = (rb + (rt - rb) * v) * (1 - 0.035 * (1 - zig)) - inset;
        return [Math.cos(a) * r, y0 + v * h, -Math.sin(a) * r];
      });
    return join([twoSided(skin(0)), skin(t)]);
  }
  const square = kind === 'square';
  const k = square ? Math.SQRT2 : 1;
  const seg = square ? 4 : 48;
  const outer = lathe([[rb * k, 0], [rt * k, h]], 0, y0, 0, seg);
  const inner = lathe([[rt * k - t, h], [rb * k - t, 0]], 0, y0, 0, seg);
  const g = join([outer, inner]);
  if (square) g.rotateY(Math.PI / 4);
  return g;
}

/** Thin wire rings at the top and bottom of a shade, with a spider to the centre at the top. */
function shadeWires(kind: ShadeKind, rb: number, rt: number, h: number, y0: number): G {
  const parts: G[] = [];
  if (kind === 'square') {
    for (const [r, y] of [[rb, y0], [rt, y0 + h]] as const) {
      for (const s of [-1, 1]) {
        parts.push(cyl(0.0022, 0.0022, 2 * r, 0, y, s * (r - 0.001), 'x', 6));
        parts.push(cyl(0.0022, 0.0022, 2 * r, s * (r - 0.001), y, 0, 'z', 6));
      }
    }
  } else {
    parts.push(new THREE.TorusGeometry(rb - 0.001, 0.0022, 6, 48).rotateX(Math.PI / 2).translate(0, y0, 0));
    parts.push(new THREE.TorusGeometry(rt - 0.001, 0.0022, 6, 48).rotateX(Math.PI / 2).translate(0, y0 + h, 0));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const r = kind === 'square' ? rt : rt - 0.002;
    parts.push(tube([[0, y0 + h - 0.02, 0], [Math.cos(a) * r * 0.98, y0 + h, Math.sin(a) * r * 0.98]], 0.0018, false, 5));
  }
  parts.push(cyl(0.012, 0.012, 0.03, 0, y0 + h - 0.045, 0, 'y', 12));
  return join(parts);
}

/* -------------------------------------------------------------------- lamps */

/**
 * Floor lamps. Params: `shade` 'drum' | 'square' (default drum), `column`
 * (a square timber column instead of a metal rod, on a square base).
 */
export function buildFloorLamp(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  // Built round, then fitted to the footprint (an oval lamp when w and d differ).
  const f = new Fit();
  const kind = param<ShadeKind>(entry, 'shade', 'drum');
  const column = param(entry, 'column', false);
  const S = Math.min(W, D);
  const shadeH = Math.min(0.36, H * 0.22);
  const rb = S / 2;
  const rt = kind === 'square' ? S * 0.4 : S / 2;
  const sy = H - shadeH;
  f.part('shade', shadeShell(kind, rb, rt, shadeH, sy));
  f.part('stem', shadeWires(kind, rb, rt, shadeH, sy));
  f.fixed(BULB, new THREE.SphereGeometry(0.032, 16, 12).scale(1, 1.25, 1).translate(0, sy + shadeH * 0.45, 0));
  if (column) {
    const bw = S * 0.78;
    f.part('base', rbox(bw, 0.022, bw, 0.006, 0, 0, 0, 2));
    f.part('base', rbox(bw * 0.92, 0.006, bw * 0.92, 0.002, 0, 0.022, 0, 1));
    f.part('stem', rbox(0.03, sy + shadeH * 0.5 - 0.028, 0.03, 0.004, 0, 0.028, 0, 2));
  } else {
    const br = S * 0.34;
    f.part('base', lathe([[0, 0], [br - 0.004, 0], [br, 0.006], [br, 0.024], [br - 0.012, 0.034], [0, 0.036]], 0, 0, 0, 40));
    f.part('stem', cyl(0.009, 0.01, sy + shadeH * 0.5 - 0.03, 0, 0.034, 0, 'y', 12));
    // A small switch collar, a third of the way up.
    f.part('stem', cyl(0.014, 0.014, 0.03, 0, H * 0.3, 0, 'y', 14));
  }
  f.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Table lamps. Params: `shade` 'pleated' | 'drum' | 'taper' | 'square', `base` 'gourd' | 'block'. */
export function buildTableLamp(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  // Built round, then fitted to the footprint (an oval lamp when w and d differ).
  const f = new Fit();
  const kind = param<ShadeKind>(entry, 'shade', 'pleated');
  const base = param<'gourd' | 'block'>(entry, 'base', 'gourd');
  const S = Math.min(W, D);
  const shadeH = H * (kind === 'square' ? 0.36 : 0.42);
  const rb = S / 2;
  const rt = kind === 'drum' ? S / 2 : S * 0.36;
  const sy = H - shadeH;
  f.part('shade', shadeShell(kind, rb, rt, shadeH, sy));
  f.part('stem', shadeWires(kind === 'pleated' ? 'taper' : kind, rb - 0.003, rt - 0.003, shadeH, sy));
  f.fixed(BULB, new THREE.SphereGeometry(0.026, 16, 12).scale(1, 1.25, 1).translate(0, sy + shadeH * 0.38, 0));
  const bodyH = sy * 0.78;
  if (base === 'block') {
    const bw = S * 0.48;
    f.part('base', rbox(bw, bodyH, bw, 0.01, 0, 0, 0, 3));
  } else {
    const r = S * 0.3;
    f.part('base', lathe([[0, 0], [r * 0.55, 0], [r * 0.6, 0.006], [r * 0.92, bodyH * 0.25], [r, bodyH * 0.5], [r * 0.85, bodyH * 0.75], [r * 0.4, bodyH * 0.94], [r * 0.32, bodyH], [0, bodyH]], 0, 0, 0, 40));
  }
  f.part('stem', cyl(0.016, 0.02, 0.012, 0, bodyH, 0, 'y', 16));
  f.part('stem', cyl(0.006, 0.006, sy + shadeH * 0.3 - bodyH, 0, bodyH + 0.012, 0, 'y', 10));
  f.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Wall sconce: a back plate, a swan-neck arm and a drum shade. Back at -Z. */
export function buildSconce(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  // Built round, then fitted to the footprint (an oval lamp when w and d differ).
  const f = new Fit();
  const r = Math.min(W / 2, D * 0.45);
  const shadeH = Math.min(H * 0.5, r * 1.5);
  const zc = D / 2 - r;
  const sy = H - shadeH;
  f.part('shade', shadeShell('drum', r, r, shadeH, sy).translate(0, 0, zc));
  f.fixed(BULB, new THREE.SphereGeometry(0.022, 14, 10).translate(0, sy + shadeH * 0.4, zc));
  const plateH = Math.min(H * 0.5, 0.16);
  f.part('stem', rbox(Math.min(0.07, W * 0.4), plateH, 0.012, 0.004, 0, 0, -D / 2 + 0.006, 2));
  f.part('stem', tube([[0, plateH * 0.5, -D / 2 + 0.012], [0, plateH * 0.55, zc * 0.4], [0, sy - 0.03, zc - 0.01], [0, sy + shadeH * 0.3, zc]], 0.0055, false, 8));
  f.part('stem', cyl(0.012, 0.012, 0.03, 0, sy + shadeH * 0.3 - 0.015, zc, 'y', 12));
  f.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Pendants: a canopy at the ceiling, a cord, and a fabric (`shade` 'drum' | 'square') or metal dome (`shade` 'dome') shade. */
export function buildPendant(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  // Built round, then fitted to the footprint (an oval lamp when w and d differ).
  const f = new Fit();
  const kind = param<ShadeKind | 'dome'>(entry, 'shade', 'dome');
  const S = Math.min(W, D);
  const canopyR = Math.min(0.06, S * 0.2);
  f.part('stem', lathe([[0, 0], [canopyR * 0.9, 0], [canopyR, 0.006], [canopyR, 0.022], [0, 0.022]], 0, H - 0.022, 0, 32));
  if (kind === 'dome') {
    const R = S / 2;
    const dh = Math.min(R * 0.75, H * 0.4);
    const prof: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      prof.push([R * Math.cos(a) * (1 - 0.82 * (i / 10) ** 3) + 0.018 * (i / 10) ** 3, dh * Math.sin(a)]);
    }
    f.part('shade', lathe(prof, 0, 0, 0, 48));
    // Inside: white enamel, facing down and in.
    f.fixed('metal.white', lathe(prof.map(([r, y]) => [Math.max(0.001, r - 0.0025), Math.max(0, y - 0.0025)] as [number, number]).reverse(), 0, 0, 0, 48));
    f.part('shade', new THREE.TorusGeometry(R - 0.0015, 0.0018, 6, 48).rotateX(Math.PI / 2).translate(0, 0.0018, 0));
    f.part('stem', cyl(0.022, 0.022, 0.05, 0, dh - 0.004, 0, 'y', 16));
    f.fixed(BULB, new THREE.SphereGeometry(0.04, 16, 12).translate(0, dh * 0.42, 0));
    f.part('stem', cyl(0.0025, 0.0025, H - 0.022 - dh - 0.04, 0, dh + 0.04, 0, 'y', 6));
  } else {
    const shadeH = Math.min(H * 0.45, S * 0.85);
    f.part('shade', shadeShell(kind, S / 2, kind === 'square' ? S / 2 : S / 2, shadeH, 0));
    f.part('stem', shadeWires(kind, S / 2, S / 2, shadeH, 0));
    f.fixed(BULB, new THREE.SphereGeometry(0.035, 16, 12).scale(1, 1.2, 1).translate(0, shadeH * 0.45, 0));
    f.part('stem', cyl(0.0025, 0.0025, H - 0.022 - shadeH + 0.03, 0, shadeH - 0.03, 0, 'y', 6));
  }
  f.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Flush ceiling light: a brass-trimmed disc with an opal dome. */
export function buildFlush(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const R = Math.min(W, D) / 2;
  const plate = Math.min(0.016, H * 0.2);
  m.part('trim', lathe([[0, 0], [R * 0.96, 0], [R, 0.004], [R, plate], [0, plate]], 0, H - plate, 0, 48).scale(W / 2 / R, 1, D / 2 / R));
  const dome: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    dome.push([R * 0.9 * Math.cos(a), (H - plate) * (1 - Math.sin(a))]);
  }
  m.part('diffuser', lathe(dome.reverse(), 0, 0, 0, 48).scale(W / 2 / R, 1, D / 2 / R));
  m.fixed(BULB, new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.004, 32).scale(W / 2 / R, 1, D / 2 / R).translate(0, H - plate - 0.004, 0));
  return m.build();
}

/** A slim surface downlight: trim body, a polished reflector cone and an opal lens set up inside it. */
export function buildDownlight(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const R = Math.min(W, D) / 2;
  const s = (g: G) => g.scale(W / 2 / R, 1, D / 2 / R);
  m.part('trim', s(lathe([[R * 0.7, 0], [R * 0.96, 0], [R, H * 0.15], [R, H], [R * 0.7, H]], 0, 0, 0, 40)));
  // Reflector: seen from below, so its profile runs downwards (faces inward).
  m.part('reflector', s(lathe([[R * 0.42, H * 0.85], [R * 0.7, 0.0005]], 0, 0, 0, 40)));
  m.fixed('glass.frosted', s(new THREE.CylinderGeometry(R * 0.42, R * 0.42, 0.002, 28).translate(0, H * 0.8, 0)));
  m.fixed(BULB, s(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.002, 24).translate(0, H * 0.86, 0)));
  return m.build();
}

/** LED batten: an aluminium channel with end caps and an opal diffuser. Wall-mounted, back at -Z. */
export function buildBatten(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const cap = Math.min(0.014, W * 0.02);
  m.part('body', rbox(W - 2 * cap, H, D * 0.42, 0.003, 0, 0, -D / 2 + D * 0.21, 2));
  for (const s of [-1, 1]) m.part('body', rbox(cap, H, D, 0.004, s * (W / 2 - cap / 2), 0, 0, 2));
  const len = W - 2 * cap + 0.002;
  // An opal tube whose back half sits inside the channel.
  m.part('diffuser', cyl(1, 1, len, 0, 0, 0, 'x', 24).scale(1, (H / 2) * 0.94, D / 2).translate(0, H / 2, 0));
  m.fixed(BULB, rbox(len - 0.01, H * 0.25, 0.004, 0.001, 0, H * 0.375, -D / 2 + D * 0.42 + 0.002, 1));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const LIGHTING_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  lightingFloorLamp: buildFloorLamp,
  lightingTableLamp: buildTableLamp,
  lightingSconce: buildSconce,
  lightingPendant: buildPendant,
  lightingFlush: buildFlush,
  lightingDownlight: buildDownlight,
  lightingBatten: buildBatten,
};
