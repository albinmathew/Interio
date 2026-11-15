/**
 * Premium generators for the furnishing-package pieces (`entries/essentials.ts`):
 * the pieces a three-bedroom fit-out needs that the other families lack. See
 * `beds.ts` for the conventions. Pieces that are a variant of an existing model
 * (the L-shaped sofa, the beds) call that family's builder with params and add
 * what it lacks; the others are built here and in `essentials.*.ts`.
 */
import type { CatalogEntry } from '@interio/core';
import type * as THREE from 'three';
import { buildBed } from './beds';
import { BLIND_GENERATORS } from './essentials.blinds';
import { BEDROOM_GENERATORS } from './essentials.bedroom';
import { LIVING_GENERATORS } from './essentials.living';
import { absorb, variant } from './essentials.parts';
import { Model, box, rbox, type BuildContext } from './kit';
import { buildSofa } from './seating';

/* --------------------------------------------------------------------- sofa */

/**
 * The L-shaped three-seater with a lounge end: the `sofa` builder with a chaise
 * (right unless `chaise: 'left'`), three seats, four throw cushions and track
 * arms on tapered legs. Every `sofa` param can be overridden.
 */
export function buildLShapeSofa(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  return buildSofa(variant(entry, { chaise: 'right', seats: 3, pillows: 4, arm: 'track', legs: 'taper', bodyDepth: 950 }), ctx);
}

/* --------------------------------------------------------------------- beds */

/**
 * King bed with drawers: the `bed` builder on its storage base (two drawers a
 * side in the side rails), with a bar pull on each drawer front.
 */
export function buildDrawerBed(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const e = variant(entry, { base: 'storage', headboard: 'upholstered', pillows: entry.dims.w >= 1800 ? 3 : 2 });
  const bed = buildBed(e, ctx);
  // The storage base's drawers, as `buildBed` lays them out: add a slim pull to each.
  const m = new Model(e, ctx);
  const { W, D } = m;
  const headT = 0.11;
  const FW = W - 0.07;
  const bedBack = -D / 2 + headT;
  const foot = D / 2 - 0.02;
  const bedLen = foot - bedBack;
  const zMid = bedBack + bedLen / 2;
  const dl = Math.min(0.8, (bedLen - 0.3) / 2);
  const legH = 0.04;
  const dh = 0.3 - 0.08;
  for (const sx of [-1, 1]) {
    for (const k of [-1, 1]) {
      const z = zMid + k * (dl / 2 + 0.02);
      const x = sx * (FW / 2 + 0.016 + 0.005);
      m.part('frame', rbox(0.01, 0.014, Math.min(0.16, dl * 0.3), 0.004, x, legH + 0.03 + dh * 0.42, z, 1));
    }
  }
  return absorb(bed, m.build());
}

/**
 * Queen bed on a box base with a lift-up (hydraulic) storage platform: the
 * `bed` builder on a recessed plinth, with the lid's reveal running round the
 * base and a fabric pull strap at the foot.
 */
export function buildBoxBed(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const e = variant(entry, { base: 'plinth', headboard: 'upholstered' });
  const bed = buildBed(e, ctx);
  const m = new Model(e, ctx);
  const { W, D } = m;
  const headT = 0.11;
  const FW = W - 0.07;
  const bedBack = -D / 2 + headT;
  const foot = D / 2 - 0.02;
  const legH = 0.04;
  const railH = 0.2;
  const len = foot - bedBack;
  const zMid = bedBack + len / 2;
  // The lid's reveal: a dark line round the base, a little below its top edge.
  const ry = legH + railH * 0.62;
  for (const s of [-1, 1]) m.fixed('lacquer.graphite', box(0.003, 0.004, len - 0.03, s * (FW / 2 + 0.0005), ry, zMid));
  m.fixed('lacquer.graphite', box(FW - 0.03, 0.004, 0.003, 0, ry, foot + 0.0005));
  // A short strap of the headboard fabric at the foot, to lift the platform.
  m.part('headboard', rbox(0.07, 0.11, 0.008, 0.003, 0, ry - 0.075, foot + 0.004, 2));
  m.part('frame', rbox(0.08, 0.012, 0.01, 0.003, 0, ry - 0.08, foot + 0.005, 1));
  return absorb(bed, m.build());
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const ESSENTIALS_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsSofaL: buildLShapeSofa,
  essentialsBedDrawers: buildDrawerBed,
  essentialsBedBox: buildBoxBed,
  ...LIVING_GENERATORS,
  ...BEDROOM_GENERATORS,
  ...BLIND_GENERATORS,
};
