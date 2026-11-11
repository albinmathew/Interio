/**
 * Premium seating: dining chairs, benches and bar stools. Registered through
 * `SEATING_GENERATORS` in `seating.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, turn, type BuildContext } from './kit';
import { Parts, arcBand, beam, clamp, placeBox, ring, rod, softBox, taperRod } from './seating.parts';

/* -------------------------------------------------------------------- slots */

export const CHAIR_TIMBER_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'seat', label: 'Seat', kind: 'woven', default: 'woven.rattan' },
];
export const CHAIR_UPHOLSTERED_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'upholstery', label: 'Upholstery', kind: 'fabric', default: 'fabric.linen.sand' },
];
export const CHAIR_ROUND_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.walnut' },
  { id: 'seat', label: 'Seat', kind: 'leather', default: 'leather.cognac' },
];
export const CHAIR_SHELL_SLOTS: FinishSlot[] = [
  { id: 'shell', label: 'Shell', kind: 'lacquer', default: 'lacquer.white' },
  { id: 'upholstery', label: 'Seat pad', kind: 'fabric', default: 'fabric.boucle.cream' },
  { id: 'legs', label: 'Legs', kind: 'wood', default: 'wood.oak' },
];
export const CHAIR_CANTILEVER_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
  { id: 'upholstery', label: 'Upholstery', kind: 'leather', default: 'leather.tan' },
];

/* ------------------------------------------------------------- dining chair */

type ChairStyle = 'timber' | 'upholstered' | 'round' | 'shell' | 'cantilever';

/**
 * A dining chair facing +Z. `style`:
 * - `timber`: oak frame with raked back posts, two curved back rails, aprons,
 *   an H-stretcher and a woven cane seat (`frame`, `seat`);
 * - `upholstered`: the same joinery with a piped upholstered seat and back pad
 *   (`frame`, `upholstery`);
 * - `round`: a horseshoe back on spindles over a round leather seat, splayed
 *   legs and a ring stretcher (`frame`, `seat`);
 * - `shell`: a moulded shell with a seat pad on splayed dowel legs (`shell`,
 *   `upholstery`, `legs`);
 * - `cantilever`: a bent steel tube frame with seat and back pads (`frame`, `upholstery`).
 */
export function buildDiningChair(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const style = param<ChairStyle>(entry, 'style', 'upholstered');
  const sy = clamp(H * 0.56, 0.4, 0.48); // top of the seat
  if (style === 'round') return roundBack(p, W, D, H, sy);
  if (style === 'shell') return shell(p, W, D, H, sy);
  if (style === 'cantilever') return cantilever(p, W, D, H, sy);

  const F = 'frame';
  const leg = 0.036;
  const lx = W / 2 - 0.03; // leg centres
  const fz = D / 2 - 0.035;
  const footZ = -D / 2 + 0.045;
  const seatT = style === 'timber' ? 0.03 : 0.022;
  const apronY = sy - (style === 'timber' ? seatT : 0.07) - 0.065;
  const rearZ = -D / 2 + 0.085; // rear leg at seat height
  const sag = 0.035;
  const topZ = -D / 2 + sag - 0.012; // post at the top
  const postZ = (y: number) => rearZ + ((topZ - rearZ) * (y - apronY)) / (H - 0.02 - apronY);

  for (const s of [-1, 1]) {
    // Front legs taper a little towards the floor.
    p.part(F, beam([s * lx, 0, fz], [s * lx, apronY + 0.065, fz], leg, leg, 0.006, 1, 0.75));
    // Rear legs kick back at the floor and rise into raked posts.
    p.part(F, beam([s * lx, 0, footZ], [s * lx, apronY + 0.03, rearZ], leg * 0.9, leg * 0.9, 0.005, 1));
    p.part(F, beam([s * lx, apronY, rearZ], [s * lx, H - 0.02, topZ], leg * 0.9, leg * 0.8, 0.006, 1));
    // Side apron and stretcher.
    p.part(F, rbox(0.02, 0.065, fz - rearZ, 0.004, s * lx, apronY, (fz + rearZ) / 2, 1));
    p.part(F, rbox(0.018, 0.022, fz - footZ - 0.03, 0.004, s * lx, 0.15, (fz + footZ + 0.03) / 2, 1));
  }
  p.part(F, rbox(2 * lx, 0.065, 0.02, 0.004, 0, apronY, fz - 0.004, 1));
  p.part(F, rbox(2 * lx, 0.065, 0.02, 0.004, 0, apronY, rearZ + 0.004, 1));
  p.part(F, rbox(2 * lx, 0.02, 0.018, 0.004, 0, 0.15, (fz + footZ) / 2, 1));

  const backW = 2 * lx + leg * 0.6;
  if (style === 'timber') {
    // Seat: a timber frame round a cane panel.
    const s0 = -D / 2 + 0.05;
    const sd = D / 2 - s0;
    const rim = 0.045;
    const y0 = sy - seatT;
    p.part(F, rbox(W, seatT, rim, 0.008, 0, y0, D / 2 - rim / 2, 2));
    p.part(F, rbox(W, seatT, rim, 0.008, 0, y0, s0 + rim / 2, 2));
    for (const s of [-1, 1]) p.part(F, rbox(rim, seatT, sd - 2 * rim + 0.004, 0.006, s * (W / 2 - rim / 2), y0, s0 + sd / 2, 2));
    p.part('seat', rbox(W - 2 * rim + 0.01, seatT - 0.008, sd - 2 * rim + 0.01, 0.003, 0, y0 + 0.002, s0 + sd / 2, 1));
    // Back: a deep curved top rail and a slimmer one below.
    p.part(F, arcBand(backW, sag, 0.024, 0.085, H - 0.085, -D / 2));
    const ly = sy + (H - sy) * 0.42;
    p.part(F, arcBand(backW, sag, 0.02, 0.045, ly, postZ(ly + 0.02) - sag + 0.012));
  } else {
    // Upholstered seat over a thin seat board, piped round its top edge.
    const s0 = -D / 2 + 0.06;
    const sd = D / 2 - s0;
    const ph = 0.075;
    p.part(F, rbox(W - 0.01, seatT, sd - 0.01, 0.006, 0, sy - ph - seatT + 0.012, s0 + sd / 2, 1));
    p.part('upholstery', softBox(W, ph * 0.9, sd, 0, sy - ph, s0 + sd / 2, 0.1, 0.03, 3));
    const py = sy - ph + ph * 0.9 - 0.02;
    const hx = W / 2 - 0.008;
    p.part('upholstery', rod([-hx + 0.03, py, D / 2 - 0.008], [hx - 0.03, py, D / 2 - 0.008], 0.005, 6));
    p.part('upholstery', rod([-hx, py, s0 + 0.03], [-hx, py, D / 2 - 0.03], 0.005, 6));
    p.part('upholstery', rod([hx, py, s0 + 0.03], [hx, py, D / 2 - 0.03], 0.005, 6));
    // Back pad between the posts, following their rake, and a timber top rail.
    p.part(F, arcBand(backW, sag, 0.022, 0.04, H - 0.04, -D / 2));
    const b0 = sy + 0.09;
    const b1 = H - 0.05;
    const rake = Math.atan2(postZ(b1) - postZ(b0), b1 - b0);
    const pad = softBox(2 * lx - leg, 0.05, b1 - b0, 0, 0, 0, 0.35, 0.025, 3).rotateX(Math.PI / 2);
    turn(pad, rake, 0, 0);
    p.part('upholstery', placeBox(pad, { cx: 0, minY: b0, minZ: postZ((b0 + b1) / 2) - 0.015 }));
  }
  return p.build();
}

/** Round-back chair: horseshoe crest on spindles, round seat, splayed legs, ring stretcher. */
function roundBack(p: Parts, W: number, D: number, H: number, sy: number): THREE.Group {
  const R = W / 2 + 0.001;
  const cz = -D / 2 + R; // centre of the horseshoe
  const seatR = Math.min(W / 2 - 0.02, D / 2 - 0.03);
  const seatZ = D / 2 - seatR;
  const seatT = 0.03;
  // Seat: a timber disc under a soft leather cushion.
  p.part('frame', cyl(seatR - 0.01, seatR - 0.02, seatT, 0, sy - 0.06, seatZ, 'y', 36).scale(1, 1, 1));
  const prof: [number, number][] = [
    [0, 0],
    [seatR - 0.004, 0],
    [seatR, 0.012],
    [seatR - 0.004, 0.026],
    [seatR - 0.03, 0.033],
    [0, 0.036],
  ];
  p.part('seat', lathe(prof, 0, sy - 0.036, seatZ, 36));
  // Legs splay out from under the seat.
  const legs: [number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push([sx, sz]);
  const top = sy - 0.06;
  for (const [sx, sz] of legs) {
    const ax = sx * seatR * 0.55;
    const az = seatZ + sz * seatR * 0.55;
    const bx = sx * (W / 2 - 0.035);
    const bz = sz > 0 ? D / 2 - 0.035 : -D / 2 + 0.07;
    p.part('frame', taperRod([bx, 0.005, bz], [ax, top, az], 0.012, 0.018, 12));
  }
  // Ring stretcher at the height where the legs pass through it.
  const ry = 0.2;
  const t = ry / top;
  const rr = Math.hypot(W / 2 - 0.035 + (seatR * 0.55 - (W / 2 - 0.035)) * t, 0) * 0.98;
  p.part('frame', ring(rr, 0.008, 0, ry, seatZ - 0.01, 32, 0.92));
  // Horseshoe crest rail and spindles.
  const bandH = 0.055;
  p.part('frame', arcBand(2 * R, R, 0.026, bandH, H - bandH, -D / 2, 0, 0.18, 28));
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + ((i - (n - 1) / 2) / (n - 1)) * Math.PI * 0.95; // around the back
    const r1 = R - 0.013;
    const r0 = seatR - 0.03;
    p.part('frame', taperRod([Math.sin(a) * r0, sy - 0.02, seatZ + Math.cos(a) * r0], [Math.sin(a) * r1, H - bandH + 0.005, cz + Math.cos(a) * r1], 0.008, 0.007, 8));
  }
  return p.build();
}

/** Moulded shell chair with a seat pad on four splayed dowel legs and a black steel cross brace. */
function shell(p: Parts, W: number, D: number, H: number, sy: number): THREE.Group {
  const seatD = D - 0.08;
  const seatZ = D / 2 - seatD / 2;
  const t = 0.014;
  // Seat pan with a waterfall front, and the curved back, tilted.
  p.part('shell', rbox(W - 0.03, t + 0.01, seatD, 0.012, 0, sy - 0.04, seatZ, 3));
  // The back wraps round from the seat: a deep curved band, lower and tighter at the bottom.
  const back = arcBand(W, 0.13, t, H - sy + 0.04, 0, 0, 0, 0, 24, 0.005);
  turn(back, -0.16, 0, 0);
  p.part('shell', placeBox(back, { cx: 0, maxY: H, minZ: -D / 2 }));
  const lower = arcBand(W * 0.86, 0.1, t + 0.006, 0.07, 0, 0, 0, 0, 20, 0.005);
  p.part('shell', placeBox(lower, { cx: 0, minY: sy - 0.045, minZ: -D / 2 + 0.035 }));
  // Seat pad.
  p.part('upholstery', softBox(W - 0.06, 0.035, seatD - 0.06, 0, sy - 0.03, seatZ + 0.01, 0.25, 0.015, 3));
  // Splayed oak dowels into a steel brace.
  const top = sy - 0.045;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ax = sx * W * 0.2;
      const az = seatZ + sz * seatD * 0.2;
      p.part('legs', taperRod([sx * (W / 2 - 0.03), 0.005, sz > 0 ? D / 2 - 0.035 : -D / 2 + 0.06], [ax, top - 0.02, az], 0.011, 0.016, 12));
    }
  }
  p.fixed('metal.black', rod([-W * 0.2, top - 0.035, seatZ - seatD * 0.2], [W * 0.2, top - 0.035, seatZ + seatD * 0.2], 0.005, 6));
  p.fixed('metal.black', rod([W * 0.2, top - 0.035, seatZ - seatD * 0.2], [-W * 0.2, top - 0.035, seatZ + seatD * 0.2], 0.005, 6));
  p.fixed('metal.black', rbox(W * 0.5, 0.012, seatD * 0.5, 0.004, 0, top - 0.02, seatZ, 1));
  return p.build();
}

/** Cantilever chair: one bent steel tube each side, joined by cross bars, with leather pads. */
function cantilever(p: Parts, W: number, D: number, H: number, sy: number): THREE.Group {
  const r = 0.0115;
  const x = W / 2 - r - 0.001;
  const seatZ0 = -D / 2 + 0.07;
  const front = D / 2 - r - 0.001;
  for (const s of [-1, 1]) {
    const X = s * x;
    const pts: [number, number, number][] = [
      [X, r + 0.003, -D / 2 + 0.11],
      [X, r + 0.003, front - 0.06],
      [X, r + 0.012, front - 0.012],
      [X, 0.07, front],
      [X, sy - 0.11, front],
      [X, sy - 0.06, front - 0.012],
      [X, sy - 0.045, front - 0.07],
      [X, sy - 0.045, seatZ0 + 0.02],
      [X, sy - 0.02, seatZ0 - 0.02],
      [X, H - 0.05, -D / 2 + r + 0.001],
      [X, H - r - 0.001, -D / 2 + r + 0.003],
    ];
    p.part('frame', tubePath(pts, r));
  }
  p.part('frame', rod([-x, r + 0.003, -D / 2 + 0.11], [x, r + 0.003, -D / 2 + 0.11], r, 10));
  p.part('frame', rod([-x, sy - 0.045, D / 2 - 0.09], [x, sy - 0.045, D / 2 - 0.09], r * 0.8, 10));
  p.part('frame', rod([-x - r * 0.6, H - r - 0.001, -D / 2 + r + 0.003], [x + r * 0.6, H - r - 0.001, -D / 2 + r + 0.003], r, 10));
  // Seat and back pads.
  const sd = front - seatZ0 - 0.02;
  p.part('upholstery', softBox(2 * x + 0.004, 0.05, sd, 0, sy - 0.05 - 0.006, seatZ0 + sd / 2 + 0.01, 0.12, 0.02, 3));
  const b0 = sy + 0.12;
  const b1 = H - 0.035;
  const rake = Math.atan2(-D / 2 + r + 0.001 - (seatZ0 - 0.02), H - 0.05 - (sy - 0.02));
  const pad = softBox(2 * x - 0.01, 0.045, b1 - b0, 0, 0, 0, 0.3, 0.02, 3).rotateX(Math.PI / 2);
  turn(pad, rake, 0, 0);
  p.part('upholstery', placeBox(pad, { cx: 0, minY: b0, minZ: -D / 2 + 0.03 }));
  return p.build();
}

/** A bent tube through points with tight, rounded bends. */
export function tubePath(points: [number, number, number][], radius: number, radial = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, points.length * 6, radius, radial, false);
}

/* -------------------------------------------------------------------- bench */

export const BENCH_TIMBER_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top and shelf', kind: 'wood', default: 'wood.oak' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
];
export const BENCH_CUSHION_SLOTS: FinishSlot[] = [
  { id: 'upholstery', label: 'Cushion', kind: 'fabric', default: 'fabric.linen.taupe' },
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
];
export const BENCH_LOW_SLOTS: FinishSlot[] = [
  { id: 'upholstery', label: 'Upholstery', kind: 'fabric', default: 'fabric.velvet.mocha' },
  { id: 'frame', label: 'Legs', kind: 'metal', default: 'metal.brass' },
];

/**
 * Benches. `style`:
 * - `slat`: an oak slatted top and shoe shelf on slim black steel frames (`top`, `frame`);
 * - `cushion`: a piped seat cushion on an oak frame with a slatted shelf (`upholstery`, `frame`);
 * - `low`: an end-of-bed bench, a channel-stitched upholstered top on brass legs (`upholstery`, `frame`).
 */
export function buildBench(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const style = param<'slat' | 'cushion' | 'low'>(entry, 'style', 'slat');
  if (style === 'slat') {
    const topT = 0.03;
    const n = Math.max(3, Math.round(D / 0.075));
    const sw = D / n;
    const gap = 0.008;
    const slat = (D - (n - 1) * gap) / n;
    for (let i = 0; i < n; i++) p.part('top', rbox(W, topT, slat, 0.006, 0, H - topT, -D / 2 + slat / 2 + i * (slat + gap), 2));
    // Shoe shelf.
    const shelfY = H * 0.28;
    for (let i = 0; i < n - 1; i++) p.part('top', rbox(W - 0.12, 0.018, sw - 0.012, 0.004, 0, shelfY, -D / 2 + 0.03 + ((D - 0.06) / (n - 1)) * (i + 0.5), 1));
    // Steel frames: a rectangle at each end, flat bar.
    const fx = W / 2 - 0.05;
    for (const s of [-1, 1]) {
      const x = s * fx;
      for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) p.part('frame', rbox(0.025, H - topT, 0.025, 0.003, x, 0, z, 1));
      p.part('frame', rbox(0.025, 0.02, D - 0.04, 0.003, x, H - topT - 0.02, 0, 1));
      p.part('frame', rbox(0.025, 0.02, D - 0.04, 0.003, x, shelfY - 0.02, 0, 1));
      for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) p.fixed('#1a1a1a', cyl(0.009, 0.009, 0.006, x, 0, z, 'y', 10));
    }
    return p.build();
  }
  if (style === 'cushion') {
    const cushH = clamp(H * 0.17, 0.06, 0.09);
    const puff = 0.12;
    const frameTop = H - cushH * (1 + puff);
    const leg = 0.04;
    const lx = W / 2 - leg / 2;
    const lz = D / 2 - leg / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('frame', rbox(leg, frameTop, leg, 0.006, sx * lx, 0, sz * lz, 2));
    // Top rails and a slatted shelf.
    p.part('frame', rbox(W - 0.004, 0.05, 0.022, 0.004, 0, frameTop - 0.05, D / 2 - 0.011, 1));
    p.part('frame', rbox(W - 0.004, 0.05, 0.022, 0.004, 0, frameTop - 0.05, -D / 2 + 0.011, 1));
    for (const s of [-1, 1]) p.part('frame', rbox(0.022, 0.05, D - 0.004, 0.004, s * (W / 2 - 0.011), frameTop - 0.05, 0, 1));
    p.part('frame', rbox(W - 0.01, 0.018, D - 0.01, 0.004, 0, frameTop - 0.018, 0, 1));
    const shelfY = H * 0.2;
    const n = Math.max(3, Math.round((D - 0.08) / 0.07));
    for (let i = 0; i < n; i++) p.part('frame', rbox(W - 2 * leg, 0.018, (D - 0.08) / n - 0.012, 0.004, 0, shelfY, -D / 2 + 0.04 + ((D - 0.08) / n) * (i + 0.5), 1));
    for (const s of [-1, 1]) p.part('frame', rbox(0.02, 0.03, D - 2 * leg, 0.004, s * (W / 2 - leg - 0.01), shelfY - 0.03, 0, 1));
    // Cushion with piping on its top edge.
    p.part('upholstery', softBox(W - 0.01, cushH, D - 0.01, 0, frameTop, 0, puff, 0.025, 3));
    const py = frameTop + cushH - 0.012;
    const hx = W / 2 - 0.012;
    const hz = D / 2 - 0.012;
    p.part('upholstery', rod([-hx, py, hz], [hx, py, hz], 0.005, 6));
    p.part('upholstery', rod([-hx, py, -hz], [hx, py, -hz], 0.005, 6));
    for (const s of [-1, 1]) p.part('upholstery', rod([s * hx, py, -hz], [s * hx, py, hz], 0.005, 6));
    return p.build();
  }
  // Low end-of-bed bench: upholstered block with stitched channels on slim brass legs.
  const legH = clamp(H * 0.32, 0.1, 0.16);
  const bodyH = H - legH;
  p.part('upholstery', rbox(W, bodyH * 0.55, D, 0.03, 0, legH, 0, 3));
  const n = Math.max(3, Math.round(W / 0.22));
  const cw = W / n;
  const ch = bodyH * 0.45 + 0.01;
  for (let i = 0; i < n; i++) p.part('upholstery', softBox(cw - 0.006, ch / 1.2, D - 0.006, -W / 2 + cw * (i + 0.5), legH + bodyH * 0.55 - 0.01, 0, 0.2, 0.03, 3));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.06);
      const z = sz * (D / 2 - 0.06);
      p.part('frame', cyl(0.016, 0.011, legH + 0.012, x, 0, z, 'y', 14));
      p.part('frame', cyl(0.024, 0.024, 0.008, x, legH, z, 'y', 14));
    }
  }
  return p.build();
}

/* ----------------------------------------------------------------- bar stool */

export const STOOL_ROUND_SLOTS: FinishSlot[] = [
  { id: 'seat', label: 'Seat', kind: 'leather', default: 'leather.cognac' },
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
  { id: 'footrest', label: 'Footrest', kind: 'metal', default: 'metal.brass' },
];
export const STOOL_SQUARE_SLOTS: FinishSlot[] = [
  { id: 'seat', label: 'Seat', kind: 'fabric', default: 'fabric.weave.charcoal' },
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
];

/**
 * Counter and bar stools. `shape: 'round'`: a round piped leather seat on four
 * splayed steel legs with a brass foot ring (`seat`, `frame`, `footrest`).
 * `shape: 'square'`: an oak frame with stretchers, a foot rail and an
 * upholstered square seat with a low back rail (`seat`, `frame`).
 */
export function buildBarStool(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const shape = param<'round' | 'square'>(entry, 'shape', 'round');
  if (shape === 'round') {
    const seatR = Math.min(W, D) / 2 * 0.86;
    const seatH = 0.075;
    const sy = H - seatH;
    const prof: [number, number][] = [
      [0, 0],
      [seatR * 0.9, 0],
      [seatR, seatH * 0.25],
      [seatR, seatH * 0.6],
      [seatR * 0.94, seatH * 0.93],
      [seatR * 0.7, seatH],
      [0, seatH],
    ];
    p.part('seat', lathe(prof, 0, sy, 0, 36));
    p.part('seat', ring(seatR - 0.002, 0.005, 0, sy + seatH * 0.62, 0, 36));
    p.part('frame', cyl(seatR * 0.7, seatR * 0.7, 0.012, 0, sy - 0.012, 0, 'y', 28));
    // Legs, splayed to the corners of the footprint.
    // Legs, splayed out to the corners of the footprint, on rubber glides.
    const fx = W / 2 - 0.014;
    const fz = D / 2 - 0.014;
    const top = seatR * 0.5 * Math.SQRT1_2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        p.part('frame', taperRod([sx * fx, 0.006, sz * fz], [sx * top, sy - 0.01, sz * top], 0.011, 0.014, 12));
        p.fixed('#1a1a1a', cyl(0.012, 0.012, 0.007, sx * fx, 0, sz * fz, 'y', 10));
      }
    }
    // Foot ring where it meets the legs.
    const fy = clamp(H * 0.36, 0.2, 0.32);
    const t = (fy - 0.006) / (sy - 0.016);
    const fr = Math.hypot(fx + (top - fx) * t, fz + (top - fz) * t) - 0.004;
    p.part('footrest', ring(fr, 0.009, 0, fy, 0, 40, (fz + (top - fz) * t) / (fx + (top - fx) * t)));
    return p.build();
  }
  // Square oak stool.
  const seatH = 0.06;
  const backH = clamp(H * 0.12, 0.06, 0.12);
  const sy = H - backH;
  const leg = 0.034;
  const lx = W / 2 - leg / 2;
  const lz = D / 2 - leg / 2;
  const legTop = sy - seatH + 0.005;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.part('frame', beam([sx * lx, 0, sz * lz], [sx * (lx - 0.03), legTop, sz * (lz - 0.03)], leg, leg, 0.005, 1));
      if (sz < 0) p.part('frame', beam([sx * (lx - 0.03), legTop - 0.02, -lz + 0.03], [sx * (lx - 0.03), H, -lz + 0.008], leg * 0.8, leg * 0.8, 0.005, 1));
    }
  }
  const at = (y: number) => 0.03 * (y / legTop);
  for (const y of [0.24, legTop - 0.05]) {
    const ix = lx - at(y);
    const iz = lz - at(y);
    const t = y < 0.5 ? 0.024 : 0.02;
    p.part('frame', rbox(2 * ix, t, 0.022, 0.004, 0, y, iz, 1));
    p.part('frame', rbox(2 * ix, t, 0.022, 0.004, 0, y, -iz, 1));
    for (const s of [-1, 1]) p.part('frame', rbox(0.022, t, 2 * iz, 0.004, s * ix, y, 0, 1));
  }
  // Back rail between the two rear posts.
  p.part('frame', rbox(2 * (lx - 0.03) + leg * 0.4, 0.05, 0.02, 0.005, 0, H - 0.052, -lz + 0.012, 2));
  // Upholstered seat.
  const seatW = 2 * (lx - 0.03) + leg + 0.03;
  const seatD = 2 * (lz - 0.03) + leg + 0.03;
  p.part('seat', softBox(seatW, seatH, seatD, 0, sy - seatH, 0.01, 0.15, 0.022, 3));
  return p.build();
}

/** Generators of this file, listed in `SEATING_GENERATORS`. */
export const CHAIR_GENERATORS = {
  diningChair: buildDiningChair,
  seatBench: buildBench,
  barStool: buildBarStool,
};
