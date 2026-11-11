/**
 * Beds. The exemplar family of the premium set: read `buildBed` before writing
 * a generator for another family.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import type * as THREE from 'three';
import { Model, box, cushion, cyl, param, pillow, rbox, turn, type BuildContext } from './kit';

/** Finish slots shared by every bed. */
export const BED_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'headboard', label: 'Headboard', kind: 'fabric', default: 'fabric.linen.sand' },
  { id: 'bedding', label: 'Bedding', kind: 'fabric', default: 'fabric.cotton.white' },
  { id: 'throw', label: 'Throw', kind: 'fabric', default: 'fabric.linen.taupe' },
];

/**
 * A made bed: frame on legs or a plinth, upholstered or timber headboard,
 * mattress, pillows, a duvet folded back at the head and a throw across the
 * foot. The headboard stands at the back (-Z), the foot of the bed faces +Z.
 *
 * Params: `headboard` 'upholstered' | 'panel' (default upholstered), `pillows`
 * across (default: 1 below 1.2 m wide, else 2), `rows` of pillows (default 2
 * from 1.4 m wide), `base` 'legs' | 'plinth' (default legs), `throw` (default true).
 */
export function buildBed(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const headboard = param<'upholstered' | 'panel'>(entry, 'headboard', 'upholstered');
  const across = param(entry, 'pillows', W < 1.2 ? 1 : 2);
  const rows = param(entry, 'rows', W >= 1.4 ? 2 : 1);
  const base = param<'legs' | 'plinth'>(entry, 'base', 'legs');
  const hasThrow = param(entry, 'throw', true);

  const headT = headboard === 'upholstered' ? 0.11 : 0.05; // headboard thickness
  const legH = base === 'legs' ? 0.14 : 0.06;
  const railH = 0.2;
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

  // Duvet: over the lower two thirds, hanging a little over the sides and the foot, folded back at the head.
  const duvetStart = bedBack + 0.2 + rows * 0.27;
  const duvetLen = D / 2 - duvetStart;
  const duvetW = FW + 0.04;
  m.part('bedding', cushion(duvetW, 0.1, duvetLen, 0, top - 0.035, duvetStart + duvetLen / 2, 0.35, 0.045));
  m.part('bedding', rbox(duvetW - 0.02, 0.085, 0.3, 0.04, 0, top + 0.035, duvetStart + 0.15, 5));
  // The duvet's sides drape over the edge of the mattress.
  for (const sx of [-1, 1]) m.part('bedding', rbox(0.045, mattH * 0.75, duvetLen - 0.06, 0.02, sx * (duvetW / 2 - 0.02), top - mattH * 0.72, duvetStart + duvetLen / 2));

  // Throw across the foot.
  if (hasThrow) {
    const tz = D / 2 - 0.42;
    m.part('throw', cushion(W - 0.03, 0.035, 0.5, 0, top + 0.075, tz, 0.5, 0.016));
    for (const sx of [-1, 1]) m.part('throw', rbox(0.03, mattH * 0.85, 0.5, 0.012, sx * (W / 2 - 0.015), top - mattH * 0.75, tz));
  }

  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const BED_GENERATORS = { bed: buildBed } as const;
