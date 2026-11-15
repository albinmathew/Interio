/**
 * Storage for the kids' bedroom set (`kids.ts`): the bedside unit with a row of
 * drawers over woven baskets, and the study and storage wall (a hinged wardrobe
 * beside a desk niche with a lit shelf and overhead cupboards). Back against the
 * wall at -Z, front +Z.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { panel, type G } from './decor.parts';
import { lightStrips, type Glow } from './glow';
import { Model, box, cyl, lathe, param, rbox, roundedRect, type BuildContext } from './kit';
import { clamp } from './seating.parts';

/* -------------------------------------------------------------------- slots */

/** Bedside unit: cream carcass and drawer fronts, brass knobs, rattan baskets. */
export const KIDS_BEDSIDE_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass and drawers', kind: 'lacquer', default: 'lacquer.cream' },
  { id: 'knobs', label: 'Knobs', kind: 'metal', default: 'metal.brass' },
  { id: 'baskets', label: 'Baskets', kind: 'woven', default: 'woven.rattan' },
];

/** Study and storage wall: cream carcass and panelling, sage doors and drawers, a light oak desk and shelf, brass handles. */
export const KIDS_STUDY_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass and panelling', kind: 'lacquer', default: 'lacquer.cream' },
  { id: 'fronts', label: 'Doors and drawers', kind: 'lacquer', default: 'lacquer.sage' },
  { id: 'desk', label: 'Desk and shelf', kind: 'wood', default: 'wood.oak.light' },
  { id: 'handles', label: 'Handles and knobs', kind: 'metal', default: 'metal.brass' },
];

/** The reveals behind inset drawer fronts: a shade darker than the cream, so the gaps read. */
const REVEAL = '#8f8676';
/** The LED strips (emissive after build). No other part uses this colour. */
const LED = '#ffe6c2';
/** Warm, like the crockery unit's strips: bright enough to bloom in the walk view. */
const LED_GLOW: Glow = { tint: new THREE.Color('#ffe0b0'), intensity: 5, surface: 1 };

/* ------------------------------------------------------------------- pieces */

/** A small round knob, its face to +Z, reaching `proj` in front of zFace. */
function knob(x: number, y: number, zFace: number, r = 0.014, proj = 0.026): G {
  const p: [number, number][] = [
    [0, 0],
    [r * 0.42, 0],
    [r * 0.42, proj * 0.45],
    [r * 0.85, proj * 0.62],
    [r, proj * 0.8],
    [r * 0.85, proj * 0.96],
    [r * 0.4, proj],
    [0, proj],
  ];
  return lathe(p, 0, 0, 0, 16).rotateX(Math.PI / 2).translate(x, y, zFace);
}

/** A ring outline: the outer rounded rectangle less the inner one, for coil rows. */
function ringShape(w: number, d: number, r: number, wall: number): THREE.Shape {
  const s = roundedRect(w, d, r);
  const hole = roundedRect(w - 2 * wall, d - 2 * wall, Math.max(0.002, r - wall));
  s.holes.push(new THREE.Path(hole.getPoints(3)));
  return s;
}

/** A coil of the basket: the ring extruded `h` high with rounded edges, laid flat with its underside at y. */
function coil(w: number, d: number, r: number, wall: number, h: number, bevel: number, x: number, y: number, z: number): G {
  const b = Math.min(bevel, h / 2 - 1e-4, wall / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(ringShape(w - 2 * b, d - 2 * b, Math.max(0.002, r - b), wall - 2 * b), {
    depth: h - 2 * b,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 1,
    curveSegments: 3,
  });
  g.rotateX(-Math.PI / 2);
  return g.translate(x, y + b, z);
}

/**
 * A woven storage basket: rows of rounded coils, alternate rows set in a hair so
 * the weave reads, a fatter rolled rim and a flat base. Underside at y.
 */
function basket(m: Model, slot: string, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const r = Math.min(0.03, w * 0.1);
  const wall = 0.012;
  const rimH = 0.026;
  const rows = Math.max(4, Math.round((h - rimH) / 0.032));
  const rh = (h - rimH) / rows;
  for (let k = 0; k < rows; k++) {
    const inset = k % 2 === 0 ? 0 : 0.003;
    m.part(slot, coil(w - inset, d - inset, r, wall, rh, rh * 0.38, x, y + k * rh, z));
  }
  m.part(slot, coil(w + 0.004, d + 0.004, r, wall + 0.006, rimH, rimH * 0.45, x, y + h - rimH, z));
  m.part(slot, box(w - 2 * wall, 0.008, d - 2 * wall, x, y + 0.002, z));
}

/* ------------------------------------------------------------- bedside unit */

/**
 * Bedside unit with baskets: a cream carcass on a recessed plinth, a row of inset
 * drawers with small round knobs under the top, and open cubbies below, each
 * holding a woven basket. Columns follow the width (three at 1.1 m). The top is
 * left clear for a lamp and a frame.
 */
export function buildBedsideBaskets(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const proj = 0.024;
  const face = D / 2 - proj; // the carcass's front face; the knobs reach D/2
  const T = 0.018;
  const topT = 0.026;
  const plinthH = Math.min(0.055, H * 0.09);
  const depth = face - back;
  const zc = back + depth / 2;
  const cols = Math.max(1, Math.round(W / 0.37));

  m.part('carcass', rbox(W, topT, depth, 0.004, 0, H - topT, zc, 2));
  for (const s of [-1, 1]) m.part('carcass', panel(T, H - topT, depth, s * (W / 2 - T / 2), 0, zc));
  m.part('carcass', panel(W - 2 * T, T, depth, 0, plinthH, zc));
  m.part('carcass', box(W - 2 * T - 0.01, plinthH, depth - 0.04, 0, 0, zc - 0.02));
  m.part('carcass', box(W - 2 * T, H - topT - plinthH - T, 0.008, 0, plinthH + T, back + 0.004));

  const under = H - topT;
  const drawerH = Math.min(0.19, (under - plinthH) * 0.32);
  const shelfY = under - drawerH - T; // underside of the shelf between drawers and cubbies
  m.part('carcass', panel(W - 2 * T, T, depth, 0, shelfY, zc));
  const inner = W - 2 * T;
  const cw = (inner - (cols - 1) * T) / cols;
  const colX = (i: number) => -inner / 2 + cw / 2 + i * (cw + T);
  for (let i = 1; i < cols; i++) m.part('carcass', panel(T, under - plinthH - T, depth, -inner / 2 + i * (cw + T) - T / 2, plinthH + T, zc));

  const cubbyY0 = plinthH + T;
  const cubbyH = shelfY - cubbyY0;
  for (let i = 0; i < cols; i++) {
    const x = colX(i);
    // Inset drawer: a 3 mm reveal round a front set back 2 mm, a darker backing behind the gap.
    const gap = 0.003;
    m.fixed(REVEAL, box(cw, drawerH, 0.004, x, shelfY + T, face - 0.024));
    m.part('carcass', rbox(cw - 2 * gap, drawerH - 2 * gap, 0.019, 0.004, x, shelfY + T + gap, face - 0.002 - 0.0095, 2));
    m.part('knobs', knob(x, shelfY + T + drawerH / 2, face - 0.002, 0.0135, proj + 0.002));
    // The basket, a finger's width clear of the cubby all round, its front 1 cm in.
    const bw = cw - 0.03;
    const bh = Math.max(0.1, cubbyH - 0.06);
    const bd = depth - 0.008 - 0.03;
    basket(m, 'baskets', bw, bh, bd, x, cubbyY0, face - 0.012 - bd / 2);
  }
  return m.build();
}

/* ------------------------------------------------------------ study wall */

/**
 * A Shaker front: a flat panel framed by stiles and rails 6 mm proud, extra rails
 * at the heights in `rails`. Its face at zFace; x0..x1 and y0..y1 its outline.
 */
function shaker(m: Model, slot: string, xc: number, w: number, y0: number, y1: number, zFace: number, rails: number[] = []): void {
  const h = y1 - y0;
  const t = 0.016;
  const proud = 0.006;
  const f = clamp(Math.min(w, h) * 0.16, 0.035, 0.07);
  m.part(slot, rbox(w, h, t, 0.002, xc, y0, zFace - proud - t / 2, 1));
  const zf = zFace - proud / 2 - 0.001;
  const fd = proud + 0.002;
  for (const s of [-1, 1]) m.part(slot, rbox(f, h, fd, 0.0025, xc + s * (w / 2 - f / 2), y0, zf, 1));
  for (const y of [y0, y1 - f, ...rails.map((r) => r - f / 2)]) m.part(slot, rbox(w - 2 * f + 0.002, f, fd, 0.0025, xc, y, zf, 1));
}

/** A bar pull standing off the door on two posts: vertical, centred on (x, y), reaching zFace + proj. */
function barPull(m: Model, x: number, y: number, len: number, zFace: number, proj: number): void {
  const r = 0.0065;
  m.part('handles', cyl(r, r, len, x, y - len / 2, zFace + proj - r, 'y', 12));
  for (const s of [-1, 1]) m.part('handles', cyl(0.0045, 0.0045, proj - r, x, y + s * (len / 2 - 0.025), zFace + (proj - r) / 2, 'z', 10));
  for (const s of [-1, 1]) m.part('handles', new THREE.SphereGeometry(r, 12, 8).translate(x, y + s * (len / 2), zFace + proj - r));
}

/**
 * Study and storage wall: a full-height hinged wardrobe (two Shaker doors with
 * brass bar pulls) at one end, and a study niche for the rest, framed by the
 * wardrobe's side, an end panel and a fascia along the top: a desk top at 750 mm
 * with knee space and a three-drawer pedestal at the far end, cream beadboard
 * panelling behind it, a floating oak shelf 450 mm above the desk and overhead
 * cupboards above that, up to the wardrobe's top. Warm LED strips under the
 * cupboards and under the shelf. The wardrobe doors carry a rail at the cupboards'
 * underside, so the two halves share their lines.
 *
 * Params: `wardrobe` 'left' | 'right' (default left), the end the wardrobe stands at.
 */
export function buildStudyWall(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  // Laid out with the wardrobe at -X; X() mirrors positions for a wardrobe on the right.
  const flip = param<'left' | 'right'>(entry, 'wardrobe', 'left') === 'right' ? -1 : 1;
  const X = (x: number) => flip * x;
  const back = -D / 2;
  const T = 0.018;
  const pull = 0.03; // the handles' reach in front of the doors
  const face = D / 2 - pull; // door faces
  const frontT = 0.022;
  const body = face - frontT; // carcass front edge
  const plinthH = 0.08;
  const gap = 0.003;

  /* Wardrobe. */
  const ww = clamp(W * 0.42, 0.9, Math.min(1.0, W - 0.6));
  const xw0 = -W / 2;
  const xw1 = xw0 + ww;
  const wz = (back + body) / 2;
  const wd = body - back;
  for (const x of [xw0 + T / 2, xw1 - T / 2]) m.part('carcass', panel(T, H, wd, X(x), 0, wz));
  m.part('carcass', panel(ww - 2 * T, T, wd, X((xw0 + xw1) / 2), H - T, wz));
  m.part('carcass', panel(ww - 2 * T, T, wd, X((xw0 + xw1) / 2), plinthH, wz));
  m.part('carcass', box(ww - 2 * T, H - plinthH - 2 * T, 0.008, X((xw0 + xw1) / 2), plinthH + T, back + 0.004));
  m.part('carcass', box(ww - 2 * T, plinthH, wd - 0.05, X((xw0 + xw1) / 2), 0, wz - 0.025));

  /* Study niche: between the wardrobe and an end panel. */
  const ep = 0.025;
  const sx0 = xw1;
  const sx1 = W / 2 - ep;
  const sw = sx1 - sx0;
  const scx = (sx0 + sx1) / 2;
  m.part('carcass', panel(ep, H, face - back, X(W / 2 - ep / 2), 0, (back + face) / 2));

  const deskTop = Math.min(0.75, H * 0.33);
  const deskT = 0.03;
  const deskD = Math.min(0.55, face - back - 0.02);
  const shelfY = deskTop + 0.45;
  const shelfT = 0.036;
  const shelfD = 0.24;
  const uBot = Math.min(H - 0.55, shelfY + shelfT + 0.36);
  const Du = Math.min(0.35, D * 0.6);
  const fascia = 0.09;
  const uTop = H - fascia;

  // Desk top, its front edge eased; the pedestal at the far end.
  m.part('desk', rbox(sw, deskT, deskD, 0.006, X(scx), deskTop - deskT, back + deskD / 2, 2));
  const pw = clamp(sw * 0.34, 0.3, 0.45);
  const px0 = sx1 - pw;
  const pFace = back + deskD - 0.02;
  const pd = pFace - frontT - back;
  const pTop = deskTop - deskT;
  m.part('carcass', panel(T, pTop, pd, X(px0 + T / 2), 0, back + pd / 2));
  m.part('carcass', box(pw - T, plinthH, pd - 0.04, X(px0 + T + (pw - T) / 2), 0, back + pd / 2 - 0.02));
  m.part('carcass', box(pw - T, pTop - plinthH, 0.008, X(px0 + T + (pw - T) / 2), plinthH, back + 0.004));
  const dh = (pTop - plinthH - 4 * gap) / 3;
  for (let i = 0; i < 3; i++) {
    const y0 = plinthH + gap + i * (dh + gap);
    shaker(m, 'fronts', X(px0 + pw / 2), pw - 2 * gap, y0, y0 + dh, pFace);
    m.part('handles', knob(X(px0 + pw / 2), y0 + dh / 2, pFace, 0.014, 0.026));
  }

  // Beadboard panelling behind the desk, up to the cupboards.
  const boards = Math.max(4, Math.round(sw / 0.1));
  const bw = sw / boards;
  for (let i = 0; i < boards; i++) m.part('carcass', rbox(bw, uBot - deskTop + 0.01, 0.012, 0.0035, X(sx0 + bw * (i + 0.5)), deskTop - 0.005, back + 0.006, 1));

  // The floating shelf, lit underneath along its front.
  m.part('desk', rbox(sw, shelfT, shelfD, 0.004, X(scx), shelfY, back + 0.012 + shelfD / 2, 2));
  m.fixed(LED, box(sw - 0.06, 0.004, 0.01, X(scx), shelfY - 0.004, back + 0.012 + shelfD - 0.035));

  // Overhead cupboards: carcass bottom, Shaker doors with knobs low on the meeting stiles, a strip under.
  m.part('carcass', panel(sw, T, Du, X(scx), uBot, back + Du / 2));
  m.part('carcass', box(sw, uTop - uBot - T, 0.008, X(scx), uBot + T, back + 0.004));
  m.fixed(LED, box(sw - 0.04, 0.005, 0.012, X(scx), uBot - 0.005, back + Du - 0.04));
  const doorsUp = Math.max(2, Math.round(sw / 0.45));
  const dw = sw / doorsUp;
  const oFace = back + Du + frontT;
  for (let i = 0; i < doorsUp; i++) {
    const xc = sx0 + dw * (i + 0.5);
    shaker(m, 'fronts', X(xc), dw - gap, uBot + gap, uTop - gap, oFace);
    // A knob in the middle of the bottom rail: within reach, and tidy along the row.
    m.part('handles', knob(X(xc), uBot + gap + 0.026, oFace, 0.012, 0.022));
  }
  // The top: a fascia across the front of the niche, a soffit behind it closing the box over the cupboards.
  m.part('carcass', panel(sw, fascia, frontT, X(scx), uTop, face - frontT / 2));
  m.part('carcass', panel(sw, T, face - frontT - (back + Du), X(scx), uTop, (back + Du + face - frontT) / 2));
  m.part('carcass', panel(sw, T, Du, X(scx), uTop - T, back + Du / 2));

  /* Wardrobe doors: a pair of Shaker doors, a rail at the cupboards' underside, pulls on the meeting stiles. */
  const wdw = (ww - 3 * gap) / 2;
  for (const k of [0, 1]) {
    const xc = xw0 + gap + wdw / 2 + k * (wdw + gap);
    shaker(m, 'fronts', X(xc), wdw, plinthH + gap, H - gap, face, [uBot]);
    const px = xc + (k === 0 ? 1 : -1) * (wdw / 2 - 0.045);
    barPull(m, X(px), 1.05, 0.26, face, pull);
  }
  return lightStrips(m.build(), LED, LED_GLOW);
}

/** Generators of this part of the family, registered through `kids.ts`. */
export const KIDS_STORAGE_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  kidsBedside: buildBedsideBaskets,
  kidsStudy: buildStudyWall,
};
