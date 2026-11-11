/**
 * Beds. The exemplar family of the premium set: read `buildBed` before writing
 * a generator for another family.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import type * as THREE from 'three';
import { Model, box, cushion, cyl, param, pillow, rbox, turn, type BuildContext } from './kit';
import { surface, twoSided, type G } from './decor.parts';

/** Finish slots shared by every bed. */
export const BED_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'headboard', label: 'Headboard and cushions', kind: 'fabric', default: 'fabric.linen.sand' },
  { id: 'bedding', label: 'Bedding', kind: 'fabric', default: 'fabric.cotton.white' },
  { id: 'throw', label: 'Throw', kind: 'fabric', default: 'fabric.linen.taupe' },
];

/** Bunk beds: an oak frame, white linen and coloured duvets. */
export const BUNK_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'bedding', label: 'Mattresses and pillows', kind: 'fabric', default: 'fabric.cotton.white' },
  { id: 'throw', label: 'Duvets', kind: 'fabric', default: 'fabric.cotton.sky' },
];

/**
 * A duvet laid over a mattress: flat and gently puffed on top, rolling over the
 * sides and the foot and hanging down to `hem` (a height). `x` across is
 * ±w/2, the length runs from z0 (head end, folded back separately) to z1 (foot).
 */
export function duvet(w: number, z0: number, z1: number, top: number, hem: number, puff = 0.035, roll = 0.06): G {
  const drop = top - hem;
  const path = (len: number) => {
    // Distance along the cross-section: drape, roll, flat, roll, drape.
    const arc = (Math.PI / 2) * roll;
    const flat = Math.max(0.01, len - 2 * roll);
    const side = Math.max(0, drop - roll);
    const total = 2 * (side + arc) + flat;
    return (u: number): [number, number, number] => {
      // Returns [offset across, drop below top, 0..1 how far onto the flat top].
      let s = u * total;
      const sign = s < total / 2 ? -1 : 1;
      if (sign > 0) s = total - s;
      if (s < side) return [sign * (len / 2), drop - s, 0];
      s -= side;
      if (s < arc) {
        const a = s / roll; // 0 at the vertical, pi/2 at the top
        return [sign * (len / 2 - roll + roll * Math.cos(a)), roll - roll * Math.sin(a), 0];
      }
      s -= arc;
      return [sign * (flat / 2 - s), 0, 1 - Math.abs(flat / 2 - s) / (flat / 2)];
    };
  };
  const across = path(w);
  // Along the length only the foot rolls over.
  const lenFlat = z1 - z0 - roll;
  const arcL = (Math.PI / 2) * roll;
  const sideL = Math.max(0, drop - roll);
  const totalL = lenFlat + arcL + sideL;
  const along = (v: number): [number, number, number] => {
    let s = v * totalL;
    if (s < lenFlat) return [z0 + s, 0, Math.min(1, s / 0.15, (lenFlat - s) / 0.25 + 0.2)];
    s -= lenFlat;
    if (s < arcL) {
      const a = s / roll;
      return [z0 + lenFlat + roll * Math.sin(a), roll - roll * Math.cos(a), 0];
    }
    s -= arcL;
    return [z1, roll + s, 0];
  };
  const sheet = surface(34, 30, (u, v) => {
    const [x, dx, fx] = across(u);
    const [z, dz, fz] = along(v);
    const dome = puff * Math.sin((Math.PI / 2) * fx) * Math.min(1, fz * 1.5);
    // Soft creases running from the sides.
    const crease = 0.006 * Math.sin(z * 9 + x * 3) * Math.sin(Math.PI * Math.min(1, fx * 1.3));
    const y = top - dx - dz + dome + crease;
    // Corners: where the sides and the foot both hang, pull in a little.
    const pinch = dx > 0.02 && dz > 0.02 ? 0.97 : 1;
    return [x * pinch, Math.max(hem, y), z];
  });
  return twoSided(sheet);
}

/**
 * A made bed: frame on legs, a plinth or a storage base, upholstered, panel or
 * slatted timber headboard, mattress, pillows and a lumbar cushion, a duvet
 * rolling softly over the sides and the foot, folded back at the head, and a
 * throw across the foot. The headboard stands at the back (-Z), the foot of the
 * bed faces +Z.
 *
 * Params: `headboard` 'upholstered' | 'panel' | 'slats' (default upholstered),
 * `pillows` across (default: 1 below 1.2 m wide, else 2), `rows` of pillows
 * (default 2 from 1.4 m wide), `base` 'legs' | 'plinth' | 'storage' (default
 * legs; storage has two drawers a side), `throw` (default true).
 */
export function buildBed(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const headboard = param<'upholstered' | 'panel' | 'slats'>(entry, 'headboard', 'upholstered');
  const across = param(entry, 'pillows', W < 1.2 ? 1 : 2);
  const rows = param(entry, 'rows', W >= 1.4 ? 2 : 1);
  const base = param<'legs' | 'plinth' | 'storage'>(entry, 'base', 'legs');
  const hasThrow = param(entry, 'throw', true);

  const headT = headboard === 'upholstered' ? 0.11 : headboard === 'slats' ? 0.07 : 0.05; // headboard thickness
  const legH = base === 'legs' ? 0.14 : 0.04;
  const railH = base === 'storage' ? 0.3 : 0.2;
  const railT = 0.035;
  const frameTop = legH + railH;
  // The bedding hangs over the frame, so the frame is narrower and shorter than the overall size.
  const FW = W - 0.07; // frame width
  const foot = D / 2 - 0.02; // front face of the foot rail
  const back = -D / 2; // rear face of the headboard
  const bedBack = back + headT; // where the sleeping surface starts
  const bedLen = foot - bedBack;
  const zMid = bedBack + bedLen / 2;

  // Frame: four rails around a recessed platform.
  m.part('frame', rbox(railT, railH, bedLen, 0.008, -FW / 2 + railT / 2, legH, zMid));
  m.part('frame', rbox(railT, railH, bedLen, 0.008, FW / 2 - railT / 2, legH, zMid));
  m.part('frame', rbox(FW, railH, railT, 0.008, 0, legH, foot - railT / 2));
  m.part('frame', box(FW - 2 * railT, 0.02, bedLen - railT, 0, legH + railH - 0.07, zMid - railT / 2));
  if (base === 'legs') {
    for (const sx of [-1, 1]) {
      for (const z of [bedBack + 0.09, foot - 0.09]) m.part('frame', cyl(0.028, 0.02, legH, sx * (FW / 2 - 0.09), 0, z, 'y', 16));
    }
  } else {
    m.fixed('lacquer.graphite', box(FW - 0.12, legH, bedLen - 0.12, 0, 0, zMid));
  }
  if (base === 'storage') {
    // Two drawers a side, set in the side rails, with a finger groove along their top.
    const dl = Math.min(0.8, (bedLen - 0.3) / 2);
    const dh = railH - 0.08;
    for (const sx of [-1, 1]) {
      for (const k of [-1, 1]) {
        const z = zMid + k * (dl / 2 + 0.02);
        m.part('frame', rbox(0.016, dh, dl, 0.003, sx * (FW / 2 + 0.008), legH + 0.03, z, 1));
        m.fixed('lacquer.graphite', box(0.004, 0.012, dl * 0.9, sx * (FW / 2 + 0.014), legH + 0.03 + dh - 0.022, z));
      }
    }
  }

  // Headboard.
  if (headboard === 'upholstered') {
    m.part('frame', box(W, H, 0.03, 0, 0, back + 0.015));
    const channels = Math.max(2, Math.round(W / 0.45));
    const cw = (W - 0.02) / channels;
    const padH = H - frameTop + 0.06;
    for (let i = 0; i < channels; i++) {
      // Vertical channels, a touch lower than the backing board so its edge frames them.
      m.part('headboard', rbox(cw - 0.012, padH - 0.02, headT - 0.03, 0.03, -(W - 0.02) / 2 + cw * (i + 0.5), frameTop - 0.08, back + 0.03 + (headT - 0.03) / 2, 5));
    }
  } else if (headboard === 'slats') {
    // Timber slats with shadow gaps in front of a dark backing panel, capped by a rail.
    m.fixed('lacquer.graphite', rbox(W - 0.06, H - 0.08, 0.012, 0.003, 0, 0.04, back + 0.006, 1));
    const n = Math.max(6, Math.round(W / 0.055));
    const pitch = W / n;
    for (let i = 0; i < n; i++) m.part('frame', rbox(pitch - 0.012, H - 0.03, headT - 0.025, 0.004, -W / 2 + pitch * (i + 0.5), 0, back + 0.012 + (headT - 0.025) / 2, 2));
    m.part('frame', rbox(W, 0.03, headT, 0.006, 0, H - 0.03, back + headT / 2, 2));
  } else {
    m.part('frame', rbox(W, H, headT, 0.012, 0, 0, back + headT / 2));
  }

  // Mattress, sitting 6 cm into the frame.
  const mattW = FW - 2 * railT - 0.02;
  const mattH = 0.24;
  const mattY = frameTop - 0.06;
  const mattLen = bedLen - railT - 0.02;
  const mattZ = bedBack + 0.01 + mattLen / 2;
  m.part('bedding', rbox(mattW, mattH, mattLen, 0.06, 0, mattY, mattZ, 4));
  const top = mattY + mattH;

  // Pillows, leaning on the headboard; the back row stands a little taller.
  const pw = Math.min(0.72, (mattW - 0.06) / across - 0.04);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < across; i++) {
      const x = (i - (across - 1) / 2) * (pw + 0.05);
      const z = bedBack + 0.2 + r * 0.26;
      const g = pillow(pw, r === 0 ? 0.17 : 0.15, 0.44, x, top - 0.02, z);
      m.part(r === rows - 1 && rows > 1 ? 'headboard' : 'bedding', turn(g, r === 0 ? -0.5 : -0.28, 0, 0, x, top, z));
    }
  }
  // A lumbar cushion in front of the pillows.
  const lw = Math.min(0.6, mattW * 0.42);
  const lz = bedBack + 0.2 + rows * 0.26 + 0.02;
  m.part('headboard', turn(pillow(lw, 0.12, 0.3, 0, top + 0.01, lz), -1.2, 0, 0, 0, top, lz));

  // Duvet: over the lower two thirds, rolling over the sides and the foot, folded back at the head.
  const duvetStart = bedBack + 0.2 + rows * 0.27;
  const duvetW = FW + 0.04;
  const hem = Math.max(legH + 0.04, top - mattH * 0.85);
  m.part('bedding', duvet(duvetW, duvetStart + 0.12, D / 2, top + 0.035, hem, 0.04, 0.06));
  m.part('bedding', cushion(duvetW - 0.02, 0.07, 0.3, 0, top + 0.02, duvetStart + 0.15, 0.4, 0.035));

  // Throw across the foot, draped over the duvet.
  if (hasThrow) {
    const tz0 = D / 2 - 0.62;
    m.part('throw', duvet(W, tz0, D / 2 - 0.005, top + 0.085, top - mattH * 0.55, 0.012, 0.05));
  }

  return m.build();
}

/**
 * Bunk bed: two beds on four square posts, guard rails all round the top bunk,
 * a ladder built into the foot end, slatted head ends. Each bunk has a
 * mattress, a pillow and a duvet. Head at -Z, ladder at the foot (+Z).
 */
export function buildBunk(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const post = Math.min(0.06, W * 0.06);
  const r = 0.008;
  const xP = W / 2 - post / 2;
  const zP = D / 2 - post / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.part('frame', rbox(post, H, post, r, sx * xP, 0, sz * zP, 2));
  const levels = [Math.min(0.22, H * 0.14), H * 0.6];
  const railH = 0.14;
  const railT = 0.03;
  const innerW = W - 2 * post;
  const innerD = D - 2 * post;
  for (const y of levels) {
    for (const sx of [-1, 1]) m.part('frame', rbox(railT, railH, innerD + 0.01, 0.006, sx * (W / 2 - railT / 2 - 0.006), y, 0, 2));
    for (const sz of [-1, 1]) m.part('frame', rbox(innerW + 0.01, railH, railT, 0.006, 0, y, sz * (D / 2 - railT / 2 - 0.006), 2));
    // Slatted base.
    const n = Math.round(innerD / 0.12);
    for (let i = 0; i < n; i++) m.part('frame', box(innerW - 0.02, 0.018, 0.07, 0, y + 0.03, -innerD / 2 + (i + 0.5) * (innerD / n)));
    // Mattress, pillow, duvet.
    const mt = 0.16;
    const my = y + 0.048;
    const mw = innerW - 0.02;
    const ml = innerD - 0.02;
    m.part('bedding', rbox(mw, mt, ml, 0.045, 0, my, 0, 4));
    const top = my + mt;
    const pz = -ml / 2 + 0.22;
    m.part('bedding', turn(pillow(Math.min(0.62, mw - 0.12), 0.15, 0.42, 0, top - 0.02, pz), -0.45, 0, 0, 0, top, pz));
    m.part('throw', duvet(mw + 0.02, -ml / 2 + 0.55, ml / 2 + 0.01, top + 0.03, top - mt * 0.7, 0.03, 0.05));
    m.part('throw', cushion(mw, 0.06, 0.24, 0, top + 0.004, -ml / 2 + 0.6, 0.4, 0.03));
  }
  // Guard rails on the top bunk: two rails on each long side and at the head.
  const gy = [levels[1]! + railH + 0.14, levels[1]! + railH + 0.3];
  for (const y of gy) {
    if (y + 0.05 > H) continue;
    for (const sx of [-1, 1]) m.part('frame', rbox(railT, 0.05, innerD + 0.01, 0.006, sx * (W / 2 - railT / 2 - 0.006), y, 0, 2));
    m.part('frame', rbox(innerW + 0.01, 0.05, railT, 0.006, 0, y, -(D / 2 - railT / 2 - 0.006), 2));
  }
  // Head end: vertical slats between the bunks and above the top one.
  const slats = Math.max(3, Math.round(innerW / 0.14));
  for (let i = 0; i < slats; i++) {
    const x = -innerW / 2 + (i + 0.5) * (innerW / slats);
    m.part('frame', rbox(0.04, levels[1]! - levels[0]! - railH - 0.42, 0.02, 0.004, x, levels[0]! + railH + 0.42, -(D / 2 - 0.016), 1));
  }
  // Ladder at the foot: two stiles set inside the posts and round rungs.
  const lx0 = innerW / 2 - 0.36;
  const lx1 = innerW / 2 - 0.02;
  const lz = D / 2 - 0.02;
  for (const x of [lx0, lx1]) m.part('frame', rbox(0.035, H - levels[0]! - 0.02, 0.03, 0.006, x, levels[0]!, lz - 0.003, 2));
  for (let y = levels[0]! + railH + 0.12; y < levels[1]! + railH + 0.3 && y < H - 0.05; y += 0.27) m.part('frame', cyl(0.014, 0.014, lx1 - lx0, (lx0 + lx1) / 2, y, lz, 'x', 12));
  // A rail across the foot of the top bunk beside the ladder.
  for (const y of gy) if (y + 0.05 <= H) m.part('frame', rbox(lx0 - (-innerW / 2) - 0.02, 0.05, railT, 0.006, (-innerW / 2 + lx0) / 2 - 0.01, y, D / 2 - railT / 2 - 0.006, 2));
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const BED_GENERATORS = { bed: buildBed, bedBunk: buildBunk } as const;
