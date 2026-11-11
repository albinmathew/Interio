/**
 * Premium generators: appliances around the home. Laundry (front and top
 * loaders, dryer, stacked pair), televisions, split air conditioner, ceiling
 * fan, water heaters, water purifier and small kitchen appliances, and a
 * floor-standing speaker. Shared slots and parts are in `appliances.parts.ts`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { CAST, DISPLAY, GASKET, GLOSS, STEEL, display, feet, knob } from './appliances.parts';
import { alongX, disc, ellipse, ringFront, rrect, sweep } from './kitchen.kit';
import { Model, box, cyl, lathe, param, rbox, turn, type BuildContext } from './kit';

const { PI } = Math;

export const L_BODY: FinishSlot = { id: 'body', label: 'Body', kind: 'metal', default: 'metal.white' };
export const L_DOOR: FinishSlot = { id: 'door', label: 'Door ring and dial', kind: 'metal', default: 'metal.chrome' };
export const L_GLASS: FinishSlot = { id: 'glass', label: 'Door glass', kind: 'glass', default: 'glass.smoked' };
export const LAUNDRY_SLOTS: FinishSlot[] = [L_BODY, L_DOOR, L_GLASS];

export const TV_FRAME: FinishSlot = { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' };
export const TV_SCREEN: FinishSlot = { id: 'screen', label: 'Screen', kind: 'lacquer', default: 'lacquer.black.gloss' };
export const TV_STAND: FinishSlot = { id: 'stand', label: 'Stand', kind: 'metal', default: 'metal.steel' };
export const TV_WALL_SLOTS: FinishSlot[] = [TV_FRAME, TV_SCREEN];
export const TV_STAND_SLOTS: FinishSlot[] = [TV_FRAME, TV_SCREEN, TV_STAND];

export const WHITE_BODY: FinishSlot = { id: 'body', label: 'Body', kind: 'lacquer', default: 'lacquer.white' };
export const AC_SLOTS: FinishSlot[] = [{ id: 'panel', label: 'Front panel', kind: 'lacquer', default: 'lacquer.white.gloss' }, WHITE_BODY];
export const FAN_SLOTS: FinishSlot[] = [{ id: 'body', label: 'Motor and rod', kind: 'metal', default: 'metal.white' }, { id: 'blades', label: 'Blades', kind: 'wood', default: 'wood.oak' }];
export const HEATER_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'lacquer', default: 'lacquer.white.gloss' },
  { id: 'controls', label: 'Control panel and pipes', kind: 'metal', default: 'metal.steel' },
];
export const PURIFIER_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'lacquer', default: 'lacquer.white.gloss' },
  { id: 'panel', label: 'Front panel', kind: 'lacquer', default: 'lacquer.black.gloss' },
  { id: 'controls', label: 'Tap', kind: 'metal', default: 'metal.chrome' },
];
export const SMALL_SLOTS: FinishSlot[] = [
  { id: 'body', label: 'Body', kind: 'metal', default: 'metal.steel' },
  { id: 'trim', label: 'Trim', kind: 'metal', default: 'metal.black' },
];
export const BLENDER_SLOTS: FinishSlot[] = [...SMALL_SLOTS, { id: 'jar', label: 'Jar', kind: 'glass', default: 'glass.clear' }];
export const SPEAKER_SLOTS: FinishSlot[] = [
  { id: 'cabinet', label: 'Cabinet', kind: 'wood', default: 'wood.walnut' },
  { id: 'baffle', label: 'Front baffle', kind: 'lacquer', default: 'lacquer.graphite' },
];

const RED = '#ff5a3c';
const LAMP = '#fff4dc';

/** A lathe about the z axis (profile [radius, depth] from the back), standing at (x, y) from z. */
function latheZ(profile: [number, number][], x: number, y: number, z: number, segments = 40): THREE.BufferGeometry {
  return lathe(profile, 0, 0, 0, segments).rotateX(PI / 2).translate(x, y, z);
}

/* ---------------------------------------------------------------- laundry */

/** One front-loading machine filling y0..y0+h: a porthole you can see the drum through, a control fascia and a kick panel. */
function frontLoader(m: Model, y0: number, h: number, kind: 'washer' | 'dryer', onFloor: boolean): void {
  const { W, D } = m;
  const foot = onFloor ? 0.012 : 0.002;
  const proj = 0.054;
  const face = D / 2 - proj;
  const drum = Math.min(0.26, D * 0.42);
  const panelH = Math.min(0.13, h * 0.15);
  const yb = y0 + foot;
  const top = y0 + h;
  // Cabinet behind the drum, then a front block with the drum opening cut through it.
  m.part('body', rbox(W, top - yb, face - drum + D / 2 + 0.004, 0.01, 0, yb, (face - drum - D / 2 + 0.004) / 2, 3));
  const rd = Math.min(W * 0.25, (h - panelH) * 0.3);
  const yc = yb + (h - foot - panelH) * 0.5;
  const b = 0.004;
  const front = rrect(W - 2 * b, top - yb - 2 * b, 0.01, 0, (yb + top) / 2);
  front.holes.push(ellipse(rd + b, rd + b, 0, yc));
  const block = new THREE.ExtrudeGeometry(front, { depth: drum - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 40 });
  m.part('body', block.translate(0, 0, face - drum + b));
  if (onFloor) feet(m, W, D - proj, foot + 0.001, -proj / 2);
  // Fascia seam, detergent (or water tank) drawer, dial, display.
  const py = top - panelH;
  m.fixed(GASKET, box(W - 0.006, 0.003, 0.002, 0, py - 0.0015, face + 0.0002));
  const dw = W * 0.3;
  m.part('body', rbox(dw, panelH * 0.62, 0.012, 0.004, -W / 2 + 0.02 + dw / 2, py + panelH * 0.2, face + 0.005, 2));
  m.fixed(GASKET, rbox(dw * 0.5, 0.012, 0.002, 0.003, -W / 2 + 0.02 + dw / 2, py + panelH * 0.24, face + 0.0115, 1));
  const kx = kind === 'washer' ? W * 0.04 : -W * 0.02;
  knob(m, 'door', kx, py + panelH * 0.5, face, Math.min(0.03, panelH * 0.27), 0.022);
  m.fixed(DISPLAY, annulus2(m, kx, py + panelH * 0.5, face + 0.0008, Math.min(0.03, panelH * 0.27) * 1.45));
  display(m, W * 0.27, py + panelH * 0.62, face, W * 0.22, panelH * 0.32, 4);
  for (let i = 0; i < 4; i++) m.part('door', rbox(0.016, 0.008, 0.004, 0.002, W * 0.19 + i * 0.026, py + panelH * 0.22, face + 0.001, 1));
  // Drum: a steel sleeve seen through the glass, a perforated back and three lifters.
  const zBack = face - drum;
  m.fixed(STEEL, latheZ([[rd - 0.002, drum - 0.004], [rd - 0.002, 0.006]], 0, yc, zBack, 40));
  m.fixed(STEEL, disc(rd, 0.003, 0, 0, 0, 40).rotateX(PI / 2).translate(0, yc, zBack + 0.006));
  for (let ring = 1; ring <= 2; ring++) {
    const n = ring * 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const r = rd * ring * 0.33;
      m.fixed(GASKET, disc(0.005, 0.001, 0, 0, 0, 8).rotateX(PI / 2).translate(r * Math.cos(a), yc + r * Math.sin(a), zBack + 0.0095));
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i * 2 * PI) / 3;
    const g = rbox(0.03, 0.022, drum - 0.03, 0.008, 0, -0.011, 0, 2).translate(0, -(rd - 0.012), 0);
    m.fixed(STEEL, g.rotateZ(a - PI / 2 - PI).translate(0, yc, zBack + drum / 2));
  }
  m.fixed(GASKET, ringFront(rd + 0.002, 0.012, 0, yc, face + 0.004, 10, 48));
  // Door: a thick ring, a domed glass and a grip on its opening side.
  const R = rd + 0.05;
  const rg = rd - 0.008;
  const ring: [number, number][] = [
    [rg + 0.012, 0],
    [R - 0.006, 0],
    [R, 0.008],
    [R, 0.03],
    [R - 0.014, proj - 0.004],
    [rg + 0.016, proj - 0.002],
    [rg + 0.006, proj - 0.012],
    [rg, proj - 0.022],
  ];
  m.part('door', latheZ(ring, 0, yc, face + 0.002, 48));
  m.part('glass', latheZ([[rg + 0.002, proj - 0.026], [rg, proj - 0.018], [rg * 0.55, proj - 0.006], [0, proj - 0.003]], 0, yc, face + 0.002, 40));
  m.fixed(GASKET, rbox(0.02, rd * 0.7, 0.012, 0.006, R - 0.006, yc - rd * 0.35, face + 0.02, 2));
  // Kick panel with a service hatch.
  m.fixed(GASKET, box(W * 0.18 + 0.004, 0.064, 0.001, W * 0.32, yb + 0.012, face + 0.00055));
  m.part('body', rbox(W * 0.18, 0.06, 0.004, 0.003, W * 0.32, yb + 0.014, face + 0.0012, 2));
  if (kind === 'dryer') {
    for (let i = 0; i < 6; i++) m.fixed(GASKET, box(W * 0.28, 0.004, 0.001, -W * 0.22, yb + 0.02 + i * 0.012, face + 0.0006));
  }
}

/** A thin lit ring standing on the front face round a dial. */
function annulus2(_m: Model, x: number, y: number, z: number, r: number): THREE.BufferGeometry {
  const s = ellipse(r, r);
  s.holes.push(ellipse(r - 0.0025, r - 0.0025));
  return new THREE.ExtrudeGeometry(s, { depth: 0.001, bevelEnabled: false, curveSegments: 32 }).translate(x, y, z);
}

/**
 * Laundry: `type` 'washer' | 'dryer' (front loaders with a porthole), 'stack'
 * (a washer with a dryer on it) or 'top' (a top loader with a glass lid and a
 * rear console).
 */
export function buildLaundry(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const type = param<'washer' | 'dryer' | 'stack' | 'top'>(entry, 'type', 'washer');
  if (type === 'stack') {
    const h = H / 2;
    frontLoader(m, 0, h - 0.004, 'washer', true);
    m.fixed(GASKET, rbox(W - 0.004, 0.008, D - 0.06, 0.002, 0, h - 0.004, -0.03, 1));
    frontLoader(m, h + 0.004, h - 0.004, 'dryer', false);
    return m.build();
  }
  if (type !== 'top') {
    frontLoader(m, 0, H, type, true);
    return m.build();
  }
  const foot = 0.012;
  const consoleH = Math.min(0.1, H * 0.11);
  const deck = H - consoleH;
  m.part('body', rbox(W, deck - foot, D, 0.012, 0, foot, 0, 3));
  feet(m, W, D, foot + 0.001);
  m.fixed(GASKET, box(W - 0.04, 0.05, 0.001, 0, foot + 0.01, D / 2 + 0.0002));
  // Rear console with a dial and display.
  const cd = Math.min(0.12, D * 0.22);
  const g = rbox(W, consoleH + 0.01, cd, 0.012, 0, deck - 0.01, -D / 2 + cd / 2, 3);
  m.part('body', g);
  const cz = -D / 2 + cd;
  m.fixed(GLOSS, box(W * 0.7, consoleH * 0.6, 0.002, 0, deck + consoleH * 0.2, cz + 0.0005));
  knob(m, 'door', -W * 0.22, deck + consoleH * 0.5, cz, Math.min(0.026, consoleH * 0.3), 0.018);
  display(m, W * 0.15, deck + consoleH * 0.6, cz + 0.001, W * 0.22, consoleH * 0.28, 4);
  // Glass lid in a frame on the deck.
  const lw = W - 0.06;
  const ld = D - cd - 0.06;
  const lz = cz + 0.03 + ld / 2;
  m.part('door', rbox(lw, 0.01, ld, 0.006, 0, deck - 0.001, lz, 2));
  m.part('glass', rbox(lw - 0.05, 0.006, ld - 0.05, 0.02, 0, deck + 0.006, lz, 2));
  m.fixed(GASKET, rbox(lw * 0.3, 0.004, 0.02, 0.002, 0, deck + 0.008, lz + ld / 2 - 0.014, 1));
  m.fixed(STEEL, cyl(lw * 0.28, lw * 0.28, 0.001, 0, deck + 0.004, lz, 'y', 40));
  return m.build();
}

/* -------------------------------------------------------------- television */

/**
 * Television: a thin panel with a narrow bezel and a black glass screen, the
 * electronics in a slimmer housing behind. On the wall (`stand` false) or on
 * a pedestal stand.
 */
export function buildTv(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const stand = param(entry, 'stand', false);
  const standH = stand ? Math.min(0.07, H * 0.09) : 0;
  const panelT = 0.012;
  const zf = stand ? Math.min(0.03, D * 0.15) : D / 2;
  const ph = H - standH;
  const bez = Math.max(0.005, Math.min(0.009, W * 0.006));
  const chin = bez + 0.004;
  m.part('frame', rbox(W, ph, panelT, 0.003, 0, standH, zf - panelT / 2, 2));
  m.part('screen', box(W - 2 * bez, ph - bez - chin, 0.001, 0, standH + chin, zf + 0.0002));
  m.fixed(RED, box(0.004, 0.0015, 0.001, W * 0.3, standH + 0.002, zf + 0.0001));
  const backD = stand ? 0.035 : D - panelT;
  m.part('frame', rbox(W * 0.72, ph * 0.66, backD, 0.02, 0, standH + ph * 0.14, zf - panelT - backD / 2 + 0.002, 3));
  if (!stand) {
    m.fixed(CAST, rbox(W * 0.3, ph * 0.3, 0.01, 0.003, 0, standH + ph * 0.3, -D / 2 + 0.005, 1));
    return m.build();
  }
  // Pedestal: a low plate and a neck behind the panel.
  m.part('stand', rbox(Math.min(W * 0.36, 0.45), 0.012, D, 0.006, 0, 0, 0, 2));
  m.part('stand', rbox(0.07, standH + ph * 0.25, 0.022, 0.006, 0, 0.006, zf - panelT - 0.03, 2));
  return m.build();
}

/* ---------------------------------------------------------- air and water */

/** Split air conditioner indoor unit: a soft-edged gloss front, a louvre flap, a top intake grille and a small display. */
export function buildSplitAc(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const yb = Math.min(0.045, H * 0.15);
  const section = (k: number) => {
    const s = new THREE.Shape();
    const z0 = -D / 2;
    const z1 = D / 2 - (1 - k) * 0.01;
    const y1 = H - (1 - k) * 0.008;
    const y0 = yb + (1 - k) * 0.004;
    s.moveTo(z0, y0);
    s.lineTo(z0, y1 - 0.02);
    s.quadraticCurveTo(z0, y1, z0 + 0.03, y1);
    s.lineTo(z1 - 0.07, y1);
    s.quadraticCurveTo(z1, y1, z1, y1 - 0.09);
    s.lineTo(z1, y0 + 0.08);
    s.quadraticCurveTo(z1, y0, z1 - 0.07, y0);
    s.lineTo(z0, y0);
    return s;
  };
  const cap = 0.012;
  m.part('panel', alongX(section(1), W - 2 * cap, 0, 10));
  for (const s of [-1, 1]) m.part('body', alongX(section(0.97), cap, s * (W / 2 - cap / 2), 10));
  // Intake slats on top, the outlet and its louvre underneath.
  for (let i = 0; i < 6; i++) m.fixed(GASKET, box(W - 0.08, 0.0006, 0.006, 0, H - 0.0006, -D / 2 + 0.05 + i * 0.014));
  m.fixed(GASKET, box(W - 0.06, 0.002, 0.09, 0, yb - 0.002, D / 2 - 0.08));
  const flap = turn(rbox(W - 0.08, 0.008, 0.075, 0.003, 0, 0, 0, 2), -0.45, 0, 0);
  flap.computeBoundingBox();
  m.part('body', flap.translate(0, -flap.boundingBox!.min.y, D / 2 - 0.05));
  display(m, W * 0.32, yb + (H - yb) * 0.3, D / 2 - 0.0045, 0.05, 0.02, 2);
  return m.build();
}

/** Ceiling fan: canopy, down-rod, motor with a light bowl underneath and four pitched blades on blade irons. */
export function buildCeilingFan(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  m.part('body', lathe([[0.012, H - 0.06], [0.05, H - 0.055], [0.066, H - 0.014], [0.064, H], [0, H]], 0, 0, 0, 32));
  const lightH = Math.min(0.05, H * 0.2);
  const motorH = Math.min(0.1, H * 0.38);
  const my = lightH;
  m.fixed('glass.frosted', lathe([[0, 0], [0.04, 0.006], [0.07, 0.022], [0.08, lightH]], 0, 0, 0, 32));
  m.part(
    'body',
    lathe(
      [
        [0.078, my],
        [0.1, my + 0.012],
        [0.108, my + motorH * 0.45],
        [0.098, my + motorH * 0.8],
        [0.05, my + motorH],
        [0.014, my + motorH + 0.004],
      ],
      0,
      0,
      0,
      40,
    ),
  );
  m.part('body', cyl(0.011, 0.011, H - 0.055 - (my + motorH), 0, my + motorH, 0, 'y', 14));
  const by = my + motorH * 0.42;
  for (let k = 0; k < 4; k++) {
    const reach = (k % 2 === 0 ? W : D) / 2;
    const root = 0.17;
    const len = reach - root;
    const bw = Math.min(0.13, len * 0.26);
    // Built along +X, pitched about its own axis, then turned into place.
    const blade = rbox(len, 0.007, bw, 0.003, root + len / 2, -0.0035, 0, 2);
    const pos = blade.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getX(i) - root) / len;
      pos.setZ(i, pos.getZ(i) * (0.82 + 0.3 * Math.sin(Math.min(1, Math.max(0, t)) * PI * 0.9)));
    }
    blade.computeVertexNormals();
    turn(blade, 0.16, 0, 0);
    const iron = rbox(root - 0.06, 0.008, 0.035, 0.003, 0.06 + (root - 0.06) / 2, -0.004, 0, 2);
    const a = (k * PI) / 2;
    m.part('blades', blade.rotateY(a).translate(0, by, 0));
    m.part('body', iron.rotateY(a).translate(0, by + 0.004, 0));
  }
  return m.build();
}

/**
 * Water heater on the wall: `type` 'storage' (a rounded tank with a control
 * panel, indicator lights and a thermostat knob) or 'instant' (a slim unit).
 * Pipes and valves underneath reach the bottom of the box.
 */
export function buildGeyser(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const instant = param<'storage' | 'instant'>(entry, 'type', 'storage') === 'instant';
  const pipeL = Math.min(0.07, H * 0.14);
  const gapWall = Math.min(0.025, D * 0.08);
  const knobL = Math.min(0.016, D * 0.1);
  const bd = D - gapWall - knobL;
  const bz = -D / 2 + gapWall + bd / 2;
  const r = instant ? Math.min(0.025, W * 0.1) : Math.min(W, bd) * 0.3;
  m.part('body', rbox(W, H - pipeL, bd, r, 0, pipeL, bz, instant ? 3 : 6));
  m.fixed(CAST, rbox(W * 0.5, (H - pipeL) * 0.5, gapWall, 0.002, 0, pipeL + (H - pipeL) * 0.4, -D / 2 + gapWall / 2, 1));
  // Control panel on the front, a thermostat knob and two lights.
  const pw = W * (instant ? 0.62 : 0.46);
  const ph = (H - pipeL) * (instant ? 0.42 : 0.3);
  const py = pipeL + (H - pipeL) * (instant ? 0.25 : 0.14);
  const fz = bz + bd / 2;
  m.part('controls', rbox(pw, ph, 0.01, Math.min(0.02, pw * 0.15), 0, py, fz - 0.002, 3));
  knob(m, 'controls', 0, py + ph * 0.42, fz + 0.003, Math.min(0.026, pw * 0.16), D / 2 - fz - 0.004, GLOSS);
  m.fixed(RED, disc(0.0045, 0.0015, 0, 0, 0, 14).rotateX(PI / 2).translate(-pw * 0.22, py + ph * 0.82, fz + 0.003));
  m.fixed(DISPLAY, disc(0.0045, 0.0015, 0, 0, 0, 14).rotateX(PI / 2).translate(pw * 0.22, py + ph * 0.82, fz + 0.003));
  // Inlet, outlet and a safety valve below.
  const pz = bz + bd * 0.1;
  for (const s of [-1, 1]) {
    const x = s * W * 0.18;
    m.part('controls', cyl(0.009, 0.009, pipeL + 0.02, x, 0, pz, 'y', 14));
    m.part('controls', cyl(0.016, 0.016, 0.012, x, pipeL * 0.4, pz, 'y', 14));
  }
  if (!instant) m.part('controls', rbox(0.03, 0.03, 0.03, 0.006, W * 0.18, pipeL * 0.62, pz + 0.025, 2));
  return m.build();
}

/** Wall-mounted RO water purifier: gloss body, a black glass front with lit status icons, a dispensing niche with a tap and a drip tray. */
export function buildPurifier(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const niche = Math.min(0.12, H * 0.26);
  const tray = Math.min(0.035, H * 0.07);
  const nd = Math.min(0.09, D * 0.36);
  const r = Math.min(0.03, W * 0.1);
  m.part('body', rbox(W, H - tray - niche, D - 0.006, r, 0, tray + niche, -0.003, 4));
  m.part('body', rbox(W, niche + 0.02, D - nd, r * 0.5, 0, tray - 0.01, -nd / 2, 3));
  m.part('body', rbox(W, tray, D, Math.min(r, tray / 2 - 0.001), 0, 0, 0, 3));
  m.fixed(GASKET, rbox(W - 0.06, 0.002, nd - 0.02, 0.001, 0, tray, D / 2 - nd / 2, 1));
  for (let i = 0; i < 5; i++) m.part('body', rbox(W - 0.08, 0.003, 0.004, 0.001, 0, tray, D / 2 - 0.02 - i * (nd - 0.04) / 4, 1));
  // Front panel with status lights.
  const ph = (H - tray - niche) * 0.72;
  const py = H - 0.02 - ph;
  m.part('panel', rbox(W - 0.03, ph, 0.008, 0.012, 0, py, D / 2 - 0.004, 2));
  for (let i = 0; i < 4; i++) m.fixed(DISPLAY, disc(0.006, 0.001, 0, 0, 0, 14).rotateX(PI / 2).translate(-W * 0.24 + i * W * 0.16, py + ph * 0.2, D / 2 - 0.0012));
  m.fixed(DISPLAY, box(W * 0.3, 0.003, 0.001, 0, py + ph * 0.7, D / 2 - 0.0004));
  // Tap under the body.
  const tz = D / 2 - nd * 0.5;
  m.part('controls', cyl(0.01, 0.012, 0.03, 0, tray + niche - 0.03, tz, 'y', 16));
  m.part('controls', rbox(0.012, 0.01, 0.045, 0.004, 0, tray + niche - 0.012, tz + 0.02, 2));
  return m.build();
}

/* --------------------------------------------------------- small appliances */

/** Capsule coffee machine: a steel body with a water tank at the back, a brew head over a drip tray with a cup, a lever and lit buttons. */
export function buildCoffeeMachine(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const tankD = D * 0.28;
  m.fixed('glass.frosted', rbox(W * 0.78, H * 0.88, tankD, 0.012, 0, 0.006, -D / 2 + tankD / 2, 3));
  m.part('trim', rbox(W * 0.8, 0.012, tankD - 0.002, 0.005, 0, H * 0.88, -D / 2 + tankD / 2 + 0.001, 2));
  const bodyZ0 = -D / 2 + tankD - 0.01;
  const bodyZ1 = D / 2 - D * 0.3;
  m.part('body', rbox(W, H - 0.012, bodyZ1 - bodyZ0, 0.02, 0, 0, (bodyZ0 + bodyZ1) / 2, 4));
  const headY = H * 0.62;
  m.part('body', rbox(W * 0.9, H - headY - 0.012, D / 2 - bodyZ1 + 0.02, 0.02, 0, headY, (bodyZ1 - 0.02 + D / 2) / 2, 4));
  m.part('trim', rbox(W * 0.6, 0.012, D * 0.22, 0.005, 0, H - 0.012, D / 2 - D * 0.16, 2));
  m.part('trim', cyl(0.012, 0.009, 0.02, 0, headY - 0.02, D / 2 - D * 0.13, 'y', 14));
  // Drip tray with a grate and a cup.
  m.part('trim', rbox(W * 0.86, 0.022, D / 2 - bodyZ1 + 0.01, 0.006, 0, 0, (bodyZ1 - 0.01 + D / 2) / 2, 2));
  for (let i = 0; i < 4; i++) m.fixed(STEEL, rbox(W * 0.7, 0.003, 0.006, 0.0015, 0, 0.022, bodyZ1 + 0.02 + i * 0.018, 1));
  m.fixed('ceramic.white', lathe([[0, 0], [0.026, 0], [0.03, 0.006], [0.034, 0.055], [0.031, 0.056], [0.028, 0.008], [0, 0.009]], 0, 0.024, D / 2 - D * 0.13, 28));
  for (const s of [-1, 1]) m.fixed(DISPLAY, disc(0.008, 0.002, s * W * 0.18, H - 0.002, D / 2 - D * 0.08, 16));
  return m.build();
}

/** Two-slot toaster: a rounded steel body on a black base, slots on top, lever, browning knob and buttons on the end. */
export function buildToaster(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const base = Math.min(0.016, H * 0.1);
  const r = Math.min(0.035, D * 0.22);
  m.part('trim', rbox(W, base, D, Math.min(0.008, base / 2 - 0.001), 0, 0, 0, 2));
  m.part('body', rbox(W - 0.008, H - base, D - 0.008, r, 0, base, 0, 5));
  for (const s of [-1, 1]) m.fixed(GASKET, rbox(W - 2 * r - 0.04, 0.002, Math.min(0.03, D * 0.17), 0.006, 0, H - 0.0019, s * D * 0.18, 2));
  // Lever in a slot, knob and buttons on the +X end.
  const ex = W / 2 - 0.004;
  m.fixed(GASKET, box(0.001, (H - base) * 0.6, 0.012, ex + 0.0004, base + (H - base) * 0.2, 0));
  m.part('trim', rbox(0.022, 0.016, 0.04, 0.006, ex + 0.004 - 0.011, base + (H - base) * 0.68, 0, 2));
  m.part('trim', cyl(0.014, 0.014, 0.012, ex + 0.004 - 0.006, base + (H - base) * 0.3, D * 0.26, 'x', 20));
  m.fixed(DISPLAY, box(0.001, 0.006, 0.014, ex + 0.0006, base + (H - base) * 0.3, -D * 0.26));
  return m.build();
}

/** Blender: a tapered motor base with a dial, a glass jar with a lid, handle and blades. */
export function buildBlender(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const baseH = Math.min(0.13, H * 0.34);
  m.part('body', sweep([[-0.02, 0], [0, 0.004], [0, 0.02], [-0.012, baseH - 0.012], [-0.02, baseH], [-W, baseH]], W / 2, D / 2, Math.min(0.04, D * 0.25), 0, 0, 0, 5));
  knob(m, 'trim', 0, baseH * 0.45, D / 2 - 0.012, Math.min(0.022, W * 0.1), 0.014);
  m.fixed(DISPLAY, annulus2(m, 0, baseH * 0.45, D / 2 - 0.0125, Math.min(0.022, W * 0.1) * 1.5));
  // Jar: a tapered square glass with a thin wall, so its inside shows.
  const jw = W / 2 - 0.04;
  const jd = D / 2 - 0.02;
  const lid = Math.min(0.025, H * 0.07);
  const y0 = baseH + 0.004;
  const y1 = H - lid;
  m.part('trim', rbox(jw * 2 - 0.02, 0.012, jd * 2 - 0.02, 0.01, -0.01, baseH - 0.004, 0, 2));
  m.part('jar', sweep([[-0.025, y0], [-0.02, y0 + 0.02], [0, y1], [-0.004, y1], [-0.008, y0 + 0.03], [-0.03, y0 + 0.012], [-jw, y0 + 0.012]], jw, jd, 0.03, -0.01, 0, 0, 5));
  m.part('trim', rbox(jw * 2 + 0.004, lid, jd * 2 + 0.004, 0.008, -0.01, y1 - 0.004, 0, 2));
  m.part('trim', cyl(0.018, 0.018, 0.01, -0.01, H - 0.01, 0, 'y', 20));
  m.part('trim', rbox(0.014, (y1 - y0) * 0.7, 0.03, 0.006, W / 2 - 0.007, y0 + (y1 - y0) * 0.15, 0, 2));
  for (const s of [-1, 1]) m.part('trim', rbox(W / 2 - 0.007 - (jw - 0.01), 0.014, 0.024, 0.005, (W / 2 - 0.007 + jw - 0.01) / 2, y0 + (y1 - y0) * (s > 0 ? 0.8 : 0.18), 0, 2));
  m.fixed(STEEL, turn(rbox(jw * 1.1, 0.002, 0.012, 0.001, -0.01, y0 + 0.02, 0, 1), 0, 0.6, 0.12, -0.01, y0 + 0.02, 0));
  m.fixed(STEEL, turn(rbox(jw * 1.1, 0.002, 0.012, 0.001, -0.01, y0 + 0.024, 0, 1), 0, -0.9, -0.12, -0.01, y0 + 0.024, 0));
  return m.build();
}

/** Floor-standing speaker: a wooden cabinet with a matte baffle, a tweeter and two woofers in steel trim rings, a bass port, on a plinth with spikes. */
export function buildSpeaker(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const plinthH = Math.min(0.035, H * 0.04);
  m.fixed(CAST, rbox(W, plinthH - 0.012, D, 0.006, 0, 0.012, 0, 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.fixed(STEEL, cyl(0.008, 0.002, 0.012, sx * (W / 2 - 0.025), 0, sz * (D / 2 - 0.03), 'y', 12));
  const bt = 0.014;
  m.part('cabinet', rbox(W, H - plinthH, D - bt, 0.008, 0, plinthH, -bt / 2, 3));
  const fz = D / 2 - 0.008;
  m.part('baffle', rbox(W - 0.004, H - plinthH - 0.004, bt - 0.006, 0.004, 0, plinthH + 0.002, fz - (bt - 0.006) / 2, 2));
  const driver = (y: number, r: number) => {
    m.fixed(STEEL, latheZ([[r + 0.006, 0], [r + 0.008, 0.002], [r + 0.006, 0.004], [r, 0.003]], 0, y, fz - 0.002, 40));
    m.fixed(GASKET, latheZ([[r, 0.003], [r * 0.92, 0.008], [r * 0.84, 0.003]], 0, y, fz - 0.002, 40));
    m.fixed(CAST, latheZ([[r * 0.84, 0.003], [r * 0.36, -0.012], [r * 0.3, -0.013]], 0, y, fz - 0.002, 36));
    m.fixed(STEEL, latheZ([[r * 0.3, -0.013], [r * 0.22, -0.006], [0, -0.003]], 0, y, fz - 0.002, 24));
  };
  const rw = Math.min(0.075, W * 0.32);
  driver(H - 0.1, Math.min(0.022, W * 0.1));
  driver(H - 0.24, rw);
  driver(H - 0.42, rw);
  m.fixed(GASKET, latheZ([[0.025, -0.02], [0.025, 0.002], [0.03, 0.002]], 0, plinthH + 0.12, fz - 0.002, 28));
  return m.build();
}

/** Generators of this part of the family. */
export const HOME_APPLIANCE_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  applLaundry: buildLaundry,
  applTv: buildTv,
  applSplitAc: buildSplitAc,
  applCeilingFan: buildCeilingFan,
  applGeyser: buildGeyser,
  applPurifier: buildPurifier,
  applCoffee: buildCoffeeMachine,
  applToaster: buildToaster,
  applBlender: buildBlender,
  applSpeaker: buildSpeaker,
};
