/**
 * Premium generators: seating. Sofas (straight, chaise, corner, low modern),
 * armchairs, recliner, ottoman, dining chairs, benches and bar stools. See
 * `beds.ts` for the conventions; shared parts live in `seating.parts.ts`.
 */
import type { CatalogEntry, FinishKind, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, rbox, turn, type BuildContext } from './kit';
import { CHAIR_GENERATORS } from './seating.chairs';
import { Parts, beam, clamp, placeBox, ring, rod, softBox, taperLeg, uprightPillow } from './seating.parts';

/* -------------------------------------------------------------------- slots */

/** Sofa and armchair finishes: body, throw pillows (and blanket), legs or plinth. */
export function sofaSlots(upholstery: string, pillows: string, legs: string, legKind: FinishKind = 'wood', legLabel = 'Legs'): FinishSlot[] {
  return [
    { id: 'upholstery', label: 'Upholstery', kind: 'fabric', default: upholstery },
    { id: 'cushions', label: 'Pillows and throw', kind: 'fabric', default: pillows },
    { id: 'legs', label: legLabel, kind: legKind, default: legs },
  ];
}

/* --------------------------------------------------------------------- sofa */

type ArmStyle = 'track' | 'roll' | 'wide' | 'none';
type LegStyle = 'taper' | 'block' | 'metal' | 'plinth';

/** One straight stretch of seats, in a local frame: u along the back, v from the back face forward. */
interface Seg {
  a: number;
  b: number;
  /** Front of the deck, from the back face. */
  depth: number;
  seats: number;
  /** Back cushions across this stretch (default `seats`). */
  backs?: number;
  /** False for a stretch that only carries back cushions (the corner of an L). */
  deck?: boolean;
}

interface Run {
  /** Local to world: rotate about y, then move. */
  face: number;
  ox: number;
  oz: number;
  frame: [number, number];
  segs: Seg[];
  armL?: number;
  armR?: number;
}

/**
 * A sofa or armchair: legs or a recessed plinth, deck, back frame, arms, seat
 * and back cushions with seams between them, piping on the seat fronts, throw
 * pillows and an optional blanket over an arm. The back is at -Z, the seats
 * open towards +Z.
 *
 * Params: `seats` (default from the width), `arm` 'track' | 'roll' | 'wide' |
 * 'none', `legs` 'taper' | 'block' | 'metal' | 'plinth', `low` (a low, deep
 * modern sofa), `chaise` 'left' | 'right', `corner` 'left' | 'right' (an L
 * whose return runs forward on that side), `bodyDepth` in mm for chaise and
 * corner sofas, `pillows` (number of throw pillows), `throw` (blanket over an arm).
 */
export function buildSofa(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const low = param<boolean>(entry, 'low', false);
  const arm = param<ArmStyle>(entry, 'arm', low ? 'wide' : 'track');
  const legs = param<LegStyle>(entry, 'legs', low ? 'plinth' : 'taper');
  const chaise = param<'left' | 'right' | 'none'>(entry, 'chaise', 'none');
  const corner = param<'left' | 'right' | 'none'>(entry, 'corner', 'none');
  const nPillows = param<number>(entry, 'pillows', 2);
  const hasThrow = param<boolean>(entry, 'throw', false);
  // Built with the chaise on the right and the corner return on the left; the other hands are mirrored.
  const p = new Parts(m, chaise === 'left' || corner === 'right');
  const L = 'legs';

  const legH = legs === 'plinth' ? clamp(H * 0.06, 0.03, 0.06) : clamp(H * 0.15, 0.08, 0.16);
  const seatTop = H * (low ? 0.53 : 0.52);
  const seatH = clamp(H * 0.17, 0.1, 0.17);
  const seatPuff = 0.12;
  const deckY = seatTop - seatH * (1 + seatPuff);
  const armW = arm === 'none' ? 0 : arm === 'wide' ? clamp(W * 0.1, 0.15, 0.26) : clamp(W * 0.075, 0.1, 0.19);
  const armTop = seatTop + (H - seatTop) * (arm === 'wide' ? 0.42 : 0.5);
  const sectional = chaise !== 'none' || corner !== 'none';
  const bodyD = sectional ? clamp(param<number>(entry, 'bodyDepth', 0) / 1000 || Math.min(D * 0.6, low ? 1.0 : 0.94), 0.6, D * 0.7) : D;
  const backT = clamp(bodyD * 0.16, 0.11, 0.18);
  const backTop = H - (low ? 0.05 : 0.08);
  const bt = clamp(bodyD * 0.2, 0.14, 0.2); // back cushion thickness
  const lean = 0.13;
  const seatsFor = (len: number) => Math.max(1, Math.round(len / (low ? 0.7 : 0.62)));

  // ---- layout of the runs
  const runs: Run[] = [];
  if (corner !== 'none') {
    const mainLen = W / 2 - armW - (-W / 2 + bodyD);
    runs.push({
      face: 0,
      ox: 0,
      oz: -D / 2,
      frame: [-W / 2, W / 2],
      segs: [
        { a: -W / 2 + backT, b: -W / 2 + bodyD, depth: bodyD, seats: 1 },
        { a: -W / 2 + bodyD, b: W / 2 - armW, depth: bodyD, seats: param<number>(entry, 'seats', seatsFor(mainLen)) },
      ],
      armR: bodyD,
    });
    // The return: its back along -X, seats facing +X. Local u runs towards -Z.
    const retLen = D / 2 - armW - (-D / 2 + bodyD);
    runs.push({
      face: Math.PI / 2,
      ox: -W / 2,
      oz: 0,
      frame: [-D / 2, D / 2],
      segs: [
        { a: -(D / 2 - armW), b: D / 2 - bodyD, depth: bodyD, seats: seatsFor(retLen) },
        { a: D / 2 - bodyD, b: D / 2 - backT - bt * 0.9, depth: bodyD, seats: 0, backs: 1, deck: false },
      ],
      armL: bodyD,
    });
  } else if (chaise !== 'none') {
    const cw = clamp(W * 0.36, 0.65, 0.95);
    const mainLen = W / 2 - cw - (-W / 2 + armW);
    runs.push({
      face: 0,
      ox: 0,
      oz: -D / 2,
      frame: [-W / 2, W / 2],
      segs: [
        { a: -W / 2 + armW, b: W / 2 - cw, depth: bodyD, seats: param<number>(entry, 'seats', seatsFor(mainLen)) },
        { a: W / 2 - cw, b: W / 2 - armW, depth: D, seats: 1 },
      ],
      armL: bodyD,
      armR: D,
    });
  } else {
    const len = W - 2 * armW;
    runs.push({
      face: 0,
      ox: 0,
      oz: -D / 2,
      frame: [-W / 2, W / 2],
      segs: [{ a: -W / 2 + armW, b: W / 2 - armW, depth: D, seats: param<number>(entry, 'seats', seatsFor(len)) }],
      armL: arm === 'none' ? undefined : D,
      armR: arm === 'none' ? undefined : D,
    });
  }

  const toWorld = (r: Run, g: THREE.BufferGeometry) => g.rotateY(r.face).translate(r.ox, 0, r.oz);

  for (const r of runs) {
    const add = (slot: string, g: THREE.BufferGeometry) => p.part(slot, toWorld(r, g));
    // Back frame, a little lower than the cushions.
    const fl = r.frame[1] - r.frame[0];
    add('upholstery', rbox(fl, backTop - legH, backT, 0.035, (r.frame[0] + r.frame[1]) / 2, legH, backT / 2, 3));
    for (const s of r.segs) {
      const len = s.b - s.a;
      if (s.deck !== false) {
        // Deck under the seat cushions, with a thin welt along its top front edge.
        add('upholstery', rbox(len + 0.004, deckY - legH, s.depth - backT + 0.02, 0.025, (s.a + s.b) / 2, legH, backT - 0.02 + (s.depth - backT + 0.02) / 2, 2));
        add('upholstery', rod([s.a + 0.01, deckY - 0.008, s.depth - 0.006], [s.b - 0.01, deckY - 0.008, s.depth - 0.006], 0.006, 6));
        // Seat cushions with a seam between them, piped along the front.
        const v0 = backT + bt * 0.55;
        const v1 = s.depth - 0.015;
        const cw = len / s.seats;
        for (let i = 0; i < s.seats; i++) {
          const u = s.a + cw * (i + 0.5);
          const w = cw - 0.012;
          const r0 = Math.min(0.045, seatH * 0.4);
          add('upholstery', softBox(w, seatH, v1 - v0, u, deckY, (v0 + v1) / 2, seatPuff, r0, 2));
          const py = deckY + seatH - r0 + r0 * 0.72;
          const pz = v1 - r0 + r0 * 0.72;
          add('upholstery', rod([u - w / 2 + r0, py, pz], [u + w / 2 - r0, py, pz], 0.0055, 6));
        }
      }
      // Back cushions, leaning on the frame.
      const backs = s.backs ?? s.seats;
      const bw = len / backs;
      for (let i = 0; i < backs; i++) {
        const u = s.a + bw * (i + 0.5);
        const hb = H - seatTop + 0.07;
        const g = softBox(bw - 0.014, bt, hb, 0, 0, 0, 0.24, 0.05, 2);
        g.translate(0, 0, 0).rotateX(Math.PI / 2).rotateX(-lean);
        add('upholstery', placeBox(g, { cx: u, maxY: H, minZ: backT - 0.025 }));
      }
    }
    // Arms.
    const armAt = (u: number, len: number) => {
      if (arm === 'track') {
        add('upholstery', rbox(armW, armTop - legH, len, Math.min(0.035, armW * 0.25), u, legH, len / 2, 3));
        for (const s of [-1, 1]) add('upholstery', rod([u + s * (armW / 2 - 0.012), armTop - 0.012, 0.02], [u + s * (armW / 2 - 0.012), armTop - 0.012, len - 0.012], 0.0055, 6));
      } else if (arm === 'roll') {
        const rr = armW / 2;
        add('upholstery', rbox(armW * 0.84, armTop - rr - legH + 0.02, len, 0.025, u, legH, len / 2, 2));
        add('upholstery', cyl(rr, rr, len - 0.01, u, armTop - rr, len / 2, 'z', 20));
        // Scroll face at the front.
        add('upholstery', cyl(rr * 0.82, rr * 0.82, 0.02, u, armTop - rr, len - 0.016, 'z', 20));
      } else if (arm === 'wide') {
        add('upholstery', softBox(armW, armTop - legH, len, u, legH, len / 2, 0.02, Math.min(0.07, armW * 0.35), 2));
      }
    };
    const a0 = Math.min(...r.segs.map((s) => s.a));
    const b0 = Math.max(...r.segs.map((s) => s.b));
    if (r.armL && armW > 0) armAt(a0 - armW / 2, r.armL);
    if (r.armR && armW > 0) armAt(b0 + armW / 2, r.armR);

    // Legs or a recessed plinth.
    const uMin = r.armL ? a0 - armW : r.frame[0];
    const uMax = r.armR ? b0 + armW : r.frame[1];
    const minDepth = Math.min(...r.segs.filter((s) => s.deck !== false).map((s) => s.depth));
    const ins = legs === 'plinth' ? 0.06 : 0.07;
    if (legs === 'plinth') {
      add(L, rbox(uMax - uMin - 2 * ins, legH + 0.01, minDepth - 2 * ins, 0.01, (uMin + uMax) / 2, 0, minDepth / 2, 1));
      for (const s of r.segs) {
        if (s.deck === false || s.depth <= minDepth + 0.01) continue;
        add(L, rbox(s.b - s.a + armW - 2 * ins, legH + 0.01, s.depth - minDepth, 0.01, (s.a + s.b + armW) / 2, 0, minDepth + (s.depth - minDepth) / 2 - ins, 1));
      }
    } else {
      const spots: [number, number][] = [
        [uMin + ins, ins],
        [uMax - ins, ins],
      ];
      for (const s of r.segs) {
        if (s.deck === false) continue;
        const left = s === r.segs[0] && r.armL ? uMin : s.a;
        const right = s === r.segs[r.segs.length - 1] && r.armR ? uMax : s.b;
        spots.push([left + ins, s.depth - ins], [right - ins, s.depth - ins]);
      }
      if (uMax - uMin > 1.9 && corner === 'none') spots.push([(uMin + uMax) / 2, ins], [(uMin + uMax) / 2, minDepth - ins]);
      const seen = new Set<string>();
      for (const [u, v] of spots) {
        const key = `${u.toFixed(2)}:${v.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (legs === 'taper') add(L, taperLeg(u, v, legH + 0.01, 0.022, 0.014));
        else if (legs === 'block') add(L, rbox(0.05, legH + 0.01, 0.05, 0.008, u, 0, v, 2));
        else add(L, rbox(0.03, legH + 0.01, 0.03, 0.004, u, 0, v, 1));
      }
    }
  }

  // ---- throw pillows: pairs at the ends, against the back cushions
  const ps = clamp((H - seatTop) * 0.95, 0.3, 0.48);
  const pillowAt = (r: Run, u: number, scale: number, yaw: number, lean2 = 0.32) => {
    const g = uprightPillow(ps * scale, 0.13 * scale, lean2, yaw);
    placeBox(g, { cx: u, minY: seatTop - 0.035, minZ: backT + bt * 0.62 });
    p.part('cushions', toWorld(r, g));
  };
  const main = runs[0]!;
  const ends = (r: Run): [number, number] => [Math.min(...r.segs.filter((s) => s.deck !== false).map((s) => s.a)), Math.max(...r.segs.filter((s) => s.deck !== false).map((s) => s.b))];
  const [ma, mb] = ends(main);
  if (nPillows > 0) {
    if (corner !== 'none') {
      const ret = runs[1]!;
      const [ra] = ends(ret);
      pillowAt(main, mb - ps * 0.6, 1, -0.12);
      if (nPillows > 1) pillowAt(ret, ra + ps * 0.6, 1, 0.12);
      if (nPillows > 2) pillowAt(main, -W / 2 + backT + bt + ps * 0.55, 1, 0.5);
      if (nPillows > 3) pillowAt(main, mb - ps * 1.25, 0.85, 0.05);
    } else {
      const span = mb - ma;
      const one = nPillows === 1 || span < ps * 2.6;
      if (one) pillowAt(main, ma + ps * 0.62, 1, 0.12);
      else {
        pillowAt(main, ma + ps * 0.6, 1, 0.12);
        pillowAt(main, (chaise !== 'none' ? W / 2 - clamp(W * 0.36, 0.65, 0.95) : mb) - ps * 0.6, 1, -0.12);
        if (nPillows > 2) pillowAt(main, ma + ps * 1.25, 0.84, 0.02, 0.38);
        if (nPillows > 3) pillowAt(main, mb - ps * 1.25, 0.84, -0.04, 0.38);
      }
    }
  }

  // ---- a folded blanket over the right arm (or across the seat without arms)
  if (hasThrow) {
    const r = runs[0]!;
    const tw = 0.42;
    const tz = Math.min(r.segs[r.segs.length - 1]!.depth, bodyD) * 0.58;
    if (r.armR && armW > 0 && arm !== 'none') {
      const u = mb + armW / 2;
      const add = (g: THREE.BufferGeometry) => p.part('cushions', toWorld(r, g));
      add(softBox(armW + 0.004 - 0.01, 0.028, tw, u - 0.003, armTop - 0.006, tz, 0.4, 0.012, 2));
      // It hangs down the inside of the arm onto the seat.
      add(rbox(0.026, armTop - seatTop + 0.03, tw - 0.01, 0.012, mb - 0.012, seatTop - 0.01, tz, 2));
    } else {
      const add = (g: THREE.BufferGeometry) => p.part('cushions', toWorld(r, g));
      add(softBox(0.5, 0.03, tw, mb - 0.35, seatTop - 0.01, tz, 0.4, 0.012, 2));
    }
  }

  return p.build();
}

/* ------------------------------------------------------- ottoman and pouf */

/** An upholstered piece on legs or a base: `upholstery` and `legs`. */
export function upholsteredSlots(upholstery: string, legs: string, legKind: FinishKind = 'wood', legLabel = 'Legs', kind: FinishKind = 'fabric'): FinishSlot[] {
  return [
    { id: 'upholstery', label: 'Upholstery', kind, default: upholstery },
    { id: 'legs', label: legLabel, kind: legKind, default: legs },
  ];
}

/**
 * An ottoman: a buttoned, piped cushion top on an upholstered body and tapered
 * legs; or (`shape: 'round'`) a drum pouf with piped seams on a recessed base.
 */
export function buildOttoman(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const shape = param<'square' | 'round'>(entry, 'shape', 'square');
  if (shape === 'round') {
    const baseH = clamp(H * 0.07, 0.02, 0.035);
    const R = W / 2;
    const sz = D / W;
    const h = H - baseH;
    p.part('legs', cyl(R * 0.8, R * 0.76, baseH + 0.01, 0, 0, 0, 'y', 32).scale(1, 1, sz));
    const prof: [number, number][] = [
      [0, 0],
      [R * 0.86, 0],
      [R * 0.95, h * 0.06],
      [R * 0.99, h * 0.25],
      [R, h * 0.5],
      [R * 0.99, h * 0.75],
      [R * 0.955, h * 0.92],
      [R * 0.86, h * 0.985],
      [R * 0.5, h * 1.0],
      [0, h],
    ];
    p.part('upholstery', lathe(prof, 0, baseH, 0, 40).scale(1, 1, sz));
    p.part('upholstery', ring(R * 0.94, 0.0065, 0, baseH + h * 0.94, 0, 40, sz));
    p.part('upholstery', ring(R * 0.94, 0.0065, 0, baseH + h * 0.05, 0, 40, sz));
    // A covered button in the dip of the top.
    p.part('upholstery', new THREE.SphereGeometry(0.014, 10, 6).scale(1, 0.5, 1).translate(0, H - 0.006, 0));
    return p.build();
  }
  const legH = clamp(H * 0.22, 0.06, 0.12);
  const topH = clamp(H * 0.3, 0.08, 0.14);
  const puff = 0.12;
  const topY = H - topH * (1 + puff);
  p.part('upholstery', rbox(W, topY - legH + 0.012, D, 0.03, 0, legH, 0, 3));
  p.part('upholstery', softBox(W - 0.006, topH, D - 0.006, 0, topY, 0, puff, 0.04, 3));
  const e = 0.0058;
  const y = topY + 0.006;
  const hx = W / 2 - 0.008;
  const hz = D / 2 - 0.008;
  p.part('upholstery', rod([-hx, y, hz], [hx, y, hz], e, 6));
  p.part('upholstery', rod([-hx, y, -hz], [hx, y, -hz], e, 6));
  p.part('upholstery', rod([hx, y, -hz], [hx, y, hz], e, 6));
  p.part('upholstery', rod([-hx, y, -hz], [-hx, y, hz], e, 6));
  // Buttons, sunk into the top.
  const nx = W > D * 1.3 ? 3 : 2;
  for (let i = 0; i < nx; i++) {
    for (const sz of [-1, 1]) {
      const bx = (i - (nx - 1) / 2) * (W / (nx + 0.6));
      const bz = (sz * D) / 4;
      const dome = Math.max(0, 1 - (bx / (W / 2)) ** 2) * Math.max(0, 1 - (bz / (D / 2)) ** 2);
      const sy = topY + topH * (1 + puff * dome);
      p.part('upholstery', new THREE.SphereGeometry(0.009, 8, 6).scale(1, 0.6, 1).translate(bx, sy - 0.003, bz));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.part('legs', taperLeg(sx * (W / 2 - 0.07), sz * (D / 2 - 0.07), legH + 0.012, 0.02, 0.013));
  return p.build();
}

/* ----------------------------------------------------------------- recliner */

/**
 * A recliner with its footrest out: padded arms, a seat cushion, a tall back
 * of three stacked pillow rolls leaning back, the footrest on a scissor
 * mechanism, all on a recessed base. `footrest: false` closes it (the depth is
 * then the chair alone). Slots `upholstery` and `legs` (the base and mechanism).
 */
export function buildRecliner(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const p = new Parts(m);
  const open = param<boolean>(entry, 'footrest', true);
  const bodyD = open ? clamp(D * 0.72, 0.7, 1.0) : D;
  const baseH = 0.05;
  const seatTop = clamp(H * 0.45, 0.4, 0.5);
  const seatH = 0.13;
  const armW = clamp(W * 0.17, 0.12, 0.2);
  const armTop = seatTop + 0.2;
  const z0 = -D / 2;
  const innerW = W - 2 * armW;

  p.part('legs', rbox(W - 0.14, baseH + 0.01, bodyD - 0.16, 0.012, 0, 0, z0 + bodyD / 2 - 0.02, 1));
  // Deck and seat cushion.
  const deckY = seatTop - seatH * 1.12;
  p.part('upholstery', rbox(innerW + 0.01, deckY - baseH + 0.01, bodyD - 0.12, 0.03, 0, baseH, z0 + 0.12 + (bodyD - 0.12) / 2, 2));
  const sd = bodyD - 0.22;
  p.part('upholstery', softBox(innerW - 0.01, seatH, sd, 0, deckY, z0 + bodyD - 0.01 - sd / 2, 0.12, 0.045, 2));
  // Padded arms with a pillow top.
  for (const s of [-1, 1]) {
    const ax = s * (W / 2 - armW / 2);
    p.part('upholstery', softBox(armW, armTop - baseH - 0.07, bodyD - 0.02, ax, baseH, z0 + 0.01 + (bodyD - 0.02) / 2, 0.02, 0.05, 2));
    p.part('upholstery', softBox(armW - 0.004, 0.08, bodyD - 0.05, ax, armTop - 0.08 - 0.08 * 0.25, z0 + 0.03 + (bodyD - 0.05) / 2, 0.25, 0.035, 2));
    p.part('upholstery', rod([ax - s * (armW / 2 - 0.02), armTop - 0.085, z0 + bodyD - 0.02], [ax - s * (armW / 2 - 0.02), armTop - 0.085, z0 + 0.06], 0.005, 6));
  }
  // The back: a shell with three pillow rolls, leaning back.
  const tilt = 0.24;
  const t = 0.16;
  const hb = (H - baseH - 0.02 - t * Math.sin(tilt)) / Math.cos(tilt);
  const back: THREE.BufferGeometry[] = [rbox(innerW + 0.1, hb, t, 0.05, 0, 0, 0, 3)];
  const rollsFrom = seatTop - baseH + 0.02;
  const rollH = (hb - rollsFrom - 0.07) / 3;
  const rolls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = softBox(innerW - 0.02, 0.11, rollH + 0.02, 0, 0, 0, 0.4, 0.05, 3).rotateX(Math.PI / 2);
    placeBox(g, { cx: 0, minY: rollsFrom + i * rollH, minZ: t / 2 - 0.02 });
    rolls.push(g);
  }
  const all = [...back, ...rolls];
  for (const g of all) g.rotateX(-tilt);
  const box = new THREE.Box3();
  for (const g of all) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  for (const g of all) g.translate(0, H - box.max.y, z0 - box.min.z);
  for (const g of back) p.part('upholstery', g);
  for (const g of rolls) p.part('upholstery', g);
  // Footrest on its scissor arms.
  if (open) {
    const fd = D - bodyD + 0.02;
    const fy = seatTop - 0.16;
    const g = softBox(innerW - 0.03, 0.1, fd, 0, 0, 0, 0.2, 0.04, 2);
    turn(g, -0.08, 0, 0);
    p.part('upholstery', placeBox(g, { cx: 0, minY: fy, maxZ: D / 2 }));
    for (const s of [-1, 1]) {
      const x = s * (innerW / 2 - 0.08);
      p.part('legs', beam([x, baseH + 0.03, z0 + bodyD - 0.2], [x, fy + 0.02, D / 2 - fd * 0.45], 0.018, 0.03, 0.004));
      p.part('legs', beam([x + s * 0.02, fy - 0.07, z0 + bodyD - 0.12], [x + s * 0.02, fy + 0.03, D / 2 - fd * 0.8], 0.018, 0.03, 0.004));
    }
  }
  return p.build();
}

/** Generators of this family, registered by `premium/index.ts`. */
export const SEATING_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  sofa: buildSofa,
  ottoman: buildOttoman,
  recliner: buildRecliner,
  ...CHAIR_GENERATORS,
};
