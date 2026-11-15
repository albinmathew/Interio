/**
 * The crockery unit: a dining-wall display cabinet as an Indian apartment fit-out
 * draws it. A base cabinet with handle-less doors and a row of drawers (brass
 * finger channels), a quartz serving counter, a fluted wood panel above the
 * counter lit by an LED strip under the upper unit, and an upper display cabinet
 * with slim brass-framed glass doors, edge-lit glass shelves and a warm LED
 * profile down each side. Wide units add an open, lit niche at each end.
 *
 * The cabinet is dressed: white dinner plates standing at the back of the
 * shelves, stacks of plates and bowls, cups on saucers, wine glasses, and blue
 * glazed serving pieces (a teapot, a covered bowl, a charger, a vase). Bays and
 * dressing follow the width: two glass doors on the compact unit, two doors
 * between two niches on the 1.5 m one.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { panel, vase } from './decor.parts';
import { flutes, glowOf, type Glow } from './essentials.altar';
import { Model, box, lathe, rbox, type BuildContext } from './kit';
import { taperRod } from './seating.parts';

type G = THREE.BufferGeometry;
type P = [number, number][];

/* ---------------------------------------------------------------- materials */

/** The fixed materials. The family allows eight meshes: four slots and these four. */
const CHINA = 'ceramic.white';
/** Glazed serving pieces: a deep blue, after Jaipur blue pottery. */
const GLAZE = '#2f5b78';
const GLASS = 'glass.clear';
/** The LED strips (emissive after build). No other fixed part uses this colour. */
const LED = '#ffe8c4';

/** Like a lamp's opal diffuser: bright enough to bloom in the walk view with the room lights low. */
const LED_GLOW: Glow = { tint: new THREE.Color('#ffe0b0'), intensity: 5, surface: 1 };

const tinted = new WeakMap<THREE.Material, THREE.Material>();

/**
 * Copies of the catalog's shared materials, never the shared ones themselves:
 * - the display glass, bronze-tinted. Still a physical material named `glass.clear`,
 *   so the app tunes it like any other glass.
 * - the blue glaze, glossy where a custom colour is matte lacquer.
 * - the white china, with a faint warm glow: the cabinet's LEDs lighting it. A
 *   standard material, so the lite renderer keeps the glow.
 */
function retint(source: THREE.Material, kind: 'glass' | 'glaze' | 'china'): THREE.Material {
  let m = tinted.get(source);
  if (!m) {
    const src = source as THREE.MeshPhysicalMaterial;
    if (kind === 'china') {
      m = new THREE.MeshStandardMaterial({
        name: src.name,
        color: src.color.clone(),
        map: src.map ?? null,
        roughness: 0.14,
        metalness: 0,
        emissive: new THREE.Color('#ffe2b8'),
        emissiveIntensity: 0.28,
      });
    } else {
      const c = src.clone();
      if (kind === 'glass') c.color.set('#6b5a46');
      else {
        c.roughness = 0.2;
        c.clearcoat = 1;
        c.clearcoatRoughness = 0.08;
      }
      m = c;
    }
    tinted.set(source, m);
  }
  return m;
}

/** Lights the LED strips and gives the glass, the glaze and the china their own looks. */
function finish(group: THREE.Group): THREE.Group {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.slot) return;
    const name = mesh.material.name;
    if (name === LED) {
      mesh.material = glowOf(mesh.material, LED_GLOW);
      mesh.castShadow = false;
    } else if (name === GLASS) mesh.material = retint(mesh.material, 'glass');
    else if (name === GLAZE) mesh.material = retint(mesh.material, 'glaze');
    else if (name === CHINA) mesh.material = retint(mesh.material, 'china');
  });
  return group;
}

/* ---------------------------------------------------------------- crockery */

const scaleP = (p: P, s: number): P => p.map(([r, y]) => [r * s, y * s]);

/** A dinner plate of radius r, lying flat, its underside at y = 0. */
function plateProfile(r: number): P {
  return [
    [0, 0.003],
    [0.46 * r, 0.003],
    [0.48 * r, 0],
    [0.54 * r, 0],
    [0.58 * r, 0.005],
    [0.93 * r, 0.016],
    [r, 0.02],
    [0.97 * r, 0.022],
    [0.58 * r, 0.009],
    [0, 0.008],
  ];
}

/** `n` plates stacked, as one turned solid with a rim per plate. */
function plateStack(r: number, n: number): P {
  const pitch = 0.012;
  const out: P = [
    [0, 0],
    [0.5 * r, 0],
    [0.56 * r, 0.004],
    [0.93 * r, 0.014],
  ];
  for (let i = 0; i < n; i++) out.push([r, i * pitch + 0.017], [0.95 * r, i * pitch + 0.02]);
  const top = (n - 1) * pitch;
  out.push([0.6 * r, top + 0.009], [0, top + 0.008]);
  return out;
}

/** `n` bowls nested, `h` tall each, rim radius R. */
function bowlStack(R: number, h: number, n: number): P {
  const pitch = h * 0.3;
  const out: P = [
    [0, 0],
    [0.42 * R, 0],
    [0.44 * R, 0.006],
    [0.78 * R, h * 0.35],
    [0.96 * R, h * 0.8],
    [R, h],
  ];
  for (let i = 1; i < n; i++) out.push([0.97 * R, h + (i - 1) * pitch + 0.002], [R, h + i * pitch]);
  const top = h + (n - 1) * pitch;
  out.push([0.95 * R, top], [0.8 * R, top - h * 0.35], [0.42 * R, top - h * 0.8], [0, top - h * 0.82]);
  return out;
}

/**
 * A plate standing on its rim, leaning back against the cabinet: its face to +Z,
 * its lowest point on y and its back on zBack. An optional rim (the `metal` slot).
 */
function uprightPlate(m: Model, material: string, r: number, x: number, y: number, zBack: number, rim: boolean, lean = 0.2): void {
  const parts: G[] = [lathe(plateProfile(r), 0, 0, 0, 22)];
  if (rim) parts.push(new THREE.TorusGeometry(r * 0.985, 0.0016, 3, 36).rotateX(Math.PI / 2).translate(0, 0.0212, 0));
  const turn = new THREE.Matrix4().makeRotationX(Math.PI / 2 - lean);
  for (const g of parts) g.applyMatrix4(turn);
  parts[0]!.computeBoundingBox();
  // Copied: translating the plate updates its bounding box in place.
  const b = parts[0]!.boundingBox!.min.clone();
  for (const g of parts) g.translate(x, y - b.y, zBack - b.z);
  m.fixed(material, parts[0]!);
  if (parts[1]) m.part('metal', parts[1]);
}

/** A cup on its saucer, scaled by s; the handle points along `yaw` (0 = +X). */
function cupAndSaucer(m: Model, x: number, y: number, z: number, s: number, yaw: number): void {
  const saucer: P = [
    [0, 0],
    [0.03, 0],
    [0.032, 0.003],
    [0.066, 0.011],
    [0.068, 0.014],
    [0.064, 0.014],
    [0.034, 0.007],
    [0, 0.007],
  ];
  m.fixed(CHINA, lathe(scaleP(saucer, s), x, y, z, 14));
  const cup: P = [
    [0, 0],
    [0.02, 0],
    [0.022, 0.004],
    [0.03, 0.02],
    [0.038, 0.052],
    [0.04, 0.06],
    [0.037, 0.06],
    [0.034, 0.05],
    [0.027, 0.018],
    [0, 0.014],
  ];
  const cy = y + 0.007 * s;
  m.fixed(CHINA, lathe(scaleP(cup, s), x, cy, z, 12));
  const handle = new THREE.TorusGeometry(0.013 * s, 0.0035 * s, 4, 8, Math.PI).rotateZ(-Math.PI / 2).translate(0.037 * s, 0.034 * s, 0).rotateY(yaw);
  m.fixed(CHINA, handle.translate(x, cy, z));
}

/** A wine glass, scaled by s. */
function wineGlass(m: Model, x: number, y: number, z: number, s: number): void {
  const p: P = [
    [0, 0],
    [0.032, 0],
    [0.032, 0.003],
    [0.005, 0.006],
    [0.0035, 0.012],
    [0.0035, 0.085],
    [0.012, 0.095],
    [0.034, 0.125],
    [0.037, 0.16],
    [0.034, 0.19],
    [0.032, 0.19],
    [0.034, 0.16],
    [0.031, 0.128],
    [0.012, 0.1],
    [0, 0.098],
  ];
  m.fixed(GLASS, lathe(scaleP(p, s), x, y, z, 12));
}

/** A tumbler, scaled by s. */
function tumbler(m: Model, x: number, y: number, z: number, s: number): void {
  const p: P = [
    [0, 0],
    [0.031, 0],
    [0.034, 0.1],
    [0.032, 0.1],
    [0.029, 0.008],
    [0, 0.008],
  ];
  m.fixed(GLASS, lathe(scaleP(p, s), x, y, z, 12));
}

/** A glazed teapot, scaled by s; its spout points along `dir` (+1 = +X). */
function teapot(m: Model, x: number, y: number, z: number, s: number, dir: number): void {
  const p: P = [
    [0, 0],
    [0.045, 0],
    [0.05, 0.004],
    [0.072, 0.03],
    [0.078, 0.06],
    [0.07, 0.092],
    [0.046, 0.11],
    [0.044, 0.114],
    [0.034, 0.124],
    [0.014, 0.13],
    [0.011, 0.142],
    [0.006, 0.148],
    [0, 0.149],
  ];
  m.fixed(GLAZE, lathe(scaleP(p, s), x, y, z, 24));
  m.fixed(GLAZE, taperRod([x + dir * 0.06 * s, y + 0.035 * s, z], [x + dir * 0.118 * s, y + 0.108 * s, z], 0.015 * s, 0.006 * s, 10));
  const handle = new THREE.TorusGeometry(0.034 * s, 0.0065 * s, 5, 12, Math.PI).rotateZ(-Math.PI / 2).translate(0.07 * s, 0.065 * s, 0);
  if (dir > 0) handle.rotateY(Math.PI);
  m.fixed(GLAZE, handle.translate(x, y, z));
}

/** A glazed covered serving bowl with a brass knob, scaled by s. */
function coveredBowl(m: Model, x: number, y: number, z: number, s: number): void {
  const p: P = [
    [0, 0],
    [0.05, 0],
    [0.052, 0.008],
    [0.092, 0.04],
    [0.102, 0.07],
    [0.1, 0.076],
    [0.09, 0.082],
    [0.06, 0.105],
    [0.02, 0.114],
    [0, 0.116],
  ];
  m.fixed(GLAZE, lathe(scaleP(p, s), x, y, z, 26));
  m.part('metal', lathe(scaleP([[0, 0], [0.012, 0], [0.016, 0.01], [0.01, 0.018], [0, 0.019]], s), x, y + 0.113 * s, z, 12));
}

/** A white jug, scaled by s; the handle on the side `dir`. */
function jug(m: Model, x: number, y: number, z: number, s: number, dir: number): void {
  const p: P = [
    [0, 0],
    [0.04, 0],
    [0.046, 0.01],
    [0.05, 0.06],
    [0.042, 0.12],
    [0.036, 0.16],
    [0.042, 0.19],
    [0.039, 0.19],
    [0.032, 0.16],
    [0.036, 0.12],
    [0, 0.115],
  ];
  m.fixed(CHINA, lathe(scaleP(p, s), x, y, z, 22));
  const handle = new THREE.TorusGeometry(0.055 * s, 0.007 * s, 5, 12, Math.PI).rotateZ(-Math.PI / 2).scale(0.75, 1, 1).translate(0.04 * s, 0.11 * s, 0);
  if (dir < 0) handle.rotateY(Math.PI);
  m.fixed(CHINA, handle.translate(x, y, z));
}

/* ------------------------------------------------------------- dressing */

/** One shelf of a display bay: what stands on it, from x0 to x1, on y, between the back zb and the front zf, under a clear height h. */
interface Shelf {
  x0: number;
  x1: number;
  y: number;
  zb: number;
  zf: number;
  h: number;
}

type Arrangement = 'glasses' | 'plates' | 'charger' | 'stacks' | 'serving';

/** Dresses a shelf of the glass cabinet. `flip` mirrors it, so neighbouring bays differ. */
function dressShelf(m: Model, s: Shelf, kind: Arrangement, flip: boolean): void {
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const sx = (f: number) => cx + (flip ? -1 : 1) * f * w;
  const d = s.zf - s.zb;
  const k = Math.min(1, s.h / 0.25, w / 0.44, d / 0.28);
  switch (kind) {
    case 'plates': {
      // Two dinner plates on their rims at the back, cups in front of them.
      const r = Math.min(0.125, (s.h - 0.03) / 2, w * 0.23);
      uprightPlate(m, CHINA, r, sx(-0.23), s.y, s.zb + 0.004, true);
      uprightPlate(m, CHINA, r, sx(0.23), s.y, s.zb + 0.004, true);
      cupAndSaucer(m, sx(-0.2), s.y, s.zf - 0.075 * k, 0.9 * k, 0.5);
      cupAndSaucer(m, sx(0.2), s.y, s.zf - 0.075 * k, 0.9 * k, 0.5);
      break;
    }
    case 'charger': {
      // A blue charger in the middle, white side plates either side, a cup in front.
      const R = Math.min(0.15, (s.h - 0.025) / 2, w * 0.3);
      uprightPlate(m, GLAZE, R, cx, s.y, s.zb + 0.004, true, 0.16);
      const r = Math.min(0.085, R * 0.62);
      uprightPlate(m, CHINA, r, sx(-0.36), s.y, s.zb + 0.03, true);
      uprightPlate(m, CHINA, r, sx(0.36), s.y, s.zb + 0.03, true);
      cupAndSaucer(m, sx(0.3), s.y, s.zf - 0.07 * k, 0.85 * k, 2.2);
      break;
    }
    case 'glasses': {
      // Wine glasses in two staggered rows, a glazed teapot beside them.
      const g = Math.min(1, (s.h - 0.02) / 0.19);
      for (let i = 0; i < 3; i++) wineGlass(m, sx(-0.36 + i * 0.16), s.y, s.zb + d * 0.32, g);
      for (let i = 0; i < 2; i++) wineGlass(m, sx(-0.28 + i * 0.16), s.y, s.zb + d * 0.7, g);
      teapot(m, sx(0.27), s.y, s.zb + d * 0.5, Math.min(1, k * 1.05), flip ? 1 : -1);
      break;
    }
    case 'serving': {
      // A covered serving bowl and tumblers.
      coveredBowl(m, sx(-0.2), s.y, s.zb + d * 0.48, Math.min(1, k));
      const t = Math.min(1, (s.h - 0.02) / 0.1);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) tumbler(m, sx(0.17 + i * 0.16), s.y, s.zb + d * (0.3 + j * 0.38), t);
      break;
    }
    case 'stacks': {
      // A stack of dinner plates and a stack of bowls, side plates between them.
      const r = Math.min(0.125, w * 0.22, d * 0.42);
      const n = Math.max(3, Math.min(7, Math.floor((s.h - 0.06) / 0.012)));
      m.fixed(CHINA, lathe(plateStack(r, n), sx(-0.25), s.y, s.zb + d * 0.42, 22));
      const R = Math.min(0.085, w * 0.16);
      m.fixed(CHINA, lathe(bowlStack(R, R * 0.75, 3), sx(0.27), s.y, s.zb + d * 0.42, 22));
      const rs = Math.min(0.055, w * 0.12, d * 0.18);
      m.fixed(CHINA, lathe(plateStack(rs, Math.max(2, n - 2)), sx(0.02), s.y, s.zb + d * 0.8, 20));
      break;
    }
  }
}

/** Dresses a shelf of an open niche: a vase, a jug and cups, bowls. */
function dressNiche(m: Model, s: Shelf, level: number, side: number): void {
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const d = s.zf - s.zb;
  const k = Math.min(1, s.h / 0.25, w / 0.26, d / 0.26);
  const pick = (level + (side > 0 ? 1 : 0)) % 3;
  if (pick === 0) {
    const vh = Math.min(0.24, s.h - 0.02);
    m.fixed(GLAZE, vase(vh, vh * 0.3, cx, s.y, s.zb + d * 0.45));
  } else if (pick === 1) {
    jug(m, cx - side * w * 0.12, s.y, s.zb + d * 0.42, Math.min(1, (s.h - 0.02) / 0.19, k), side);
    cupAndSaucer(m, cx + side * w * 0.2, s.y, s.zb + d * 0.78, 0.8 * k, side > 0 ? 0.6 : 2.5);
  } else {
    const R = Math.min(0.08, w * 0.3);
    m.fixed(CHINA, lathe(bowlStack(R, R * 0.75, 3), cx, s.y, s.zb + d * 0.48, 22));
  }
}

/* -------------------------------------------------------------- the unit */

/** Crockery unit, front +Z, back against the wall at -Z. The counter takes the full depth; the upper cabinet is shallower. */
export function buildCrockery(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const T = 0.018; // panel thickness
  const gap = 0.003;

  /* Columns: an open niche at each end when the unit is wide enough, glass doors between. */
  const nw = W >= 1.25 ? Math.min(0.34, Math.max(0.24, W * 0.2)) : 0;
  const cx0 = -W / 2 + (nw > 0 ? nw + T / 2 : T);
  const cx1 = -cx0;
  const doors = Math.max(1, Math.round((cx1 - cx0) / 0.5));

  /* Base cabinet: recessed plinth, handle-less fronts on brass finger channels, quartz counter. */
  const plinthH = 0.1;
  const topT = 0.03;
  const baseH = Math.min(0.85, H * 0.42);
  const face = D / 2 - 0.018; // fronts' outer face, under the counter's nosing
  const frontT = 0.019;
  const rail = 0.03;
  const bodyZ0 = back;
  const bodyZ1 = face - frontT;
  m.part('wood', box(W - 0.04, plinthH, bodyZ1 - bodyZ0 - 0.05, 0, 0, (bodyZ0 + bodyZ1 - 0.05) / 2));
  m.part('fronts', box(W, baseH - topT - plinthH, bodyZ1 - bodyZ0, 0, plinthH, (bodyZ0 + bodyZ1) / 2));
  m.part('counter', rbox(W, topT, D, 0.005, 0, baseH - topT, 0, 2));
  const channel = (x0: number, x1: number, y: number) => m.part('metal', box(x1 - x0, rail - 0.004, 0.006, (x0 + x1) / 2, y + 0.002, bodyZ1 + 0.003));
  const frontAt = (x0: number, x1: number, y0: number, y1: number, slot = 'fronts') => m.part(slot, rbox(x1 - x0 - gap, y1 - y0, frontT, 0.002, (x0 + x1) / 2, y0, face - frontT / 2, 1));
  const railY = baseH - topT - rail;
  channel(-W / 2 + 0.002, W / 2 - 0.002, railY);
  const drawerH = 0.165;
  const doorTop = railY - drawerH - rail;
  const fy0 = plinthH + gap;
  if (nw > 0) {
    // Tall doors under the niches.
    frontAt(-W / 2, -W / 2 + nw, fy0, railY);
    frontAt(W / 2 - nw, W / 2, fy0, railY);
  }
  const bx0 = nw > 0 ? -W / 2 + nw : -W / 2;
  const bx1 = -bx0;
  channel(bx0 + gap / 2, bx1 - gap / 2, doorTop);
  const bw = (bx1 - bx0) / doors;
  for (let i = 0; i < doors; i++) {
    const x0 = bx0 + i * bw;
    // The drawers in the wood, a band under the counter that answers the fluted panel.
    frontAt(x0, x0 + bw, railY - drawerH + gap / 2, railY, 'wood');
    frontAt(x0, x0 + bw, fy0, doorTop);
  }

  /* The fluted panel over the counter, up to the upper cabinet. */
  const gapH = Math.min(0.52, Math.max(0.3, (H - baseH) * 0.36));
  const uBot = baseH + gapH;
  // Its backing is 4 mm thick behind z = 0.
  m.part('wood', flutes(W, uBot - baseH, 0.012, 0.022, 0.008).translate(0, baseH, back + 0.004));

  /* Set for serving: a brass tray with a carafe and two tumblers, a footed blue bowl. */
  const tr = Math.min(0.17, W * 0.12);
  const tx = W * 0.26;
  const tz = back + 0.04 + tr;
  m.part('metal', lathe(scaleP([[0, 0], [0.97, 0], [1, 0.012], [1, 0.1], [0.96, 0.1], [0.95, 0.025], [0, 0.025]], tr), tx, baseH, tz, 32));
  const ty = baseH + 0.025 * tr;
  const carafe: P = [
    [0, 0],
    [0.05, 0],
    [0.055, 0.01],
    [0.055, 0.12],
    [0.03, 0.17],
    [0.018, 0.2],
    [0.021, 0.24],
    [0.017, 0.24],
    [0.015, 0.2],
    [0.027, 0.17],
    [0.05, 0.12],
    [0.05, 0.012],
    [0, 0.01],
  ];
  const ks = tr / 0.17;
  m.fixed(GLASS, lathe(scaleP(carafe, ks), tx - tr * 0.35, ty, tz - tr * 0.15, 16));
  tumbler(m, tx + tr * 0.38, ty, tz - tr * 0.3, 0.9 * ks);
  tumbler(m, tx + tr * 0.25, ty, tz + tr * 0.4, 0.9 * ks);
  const footed: P = [
    [0, 0],
    [0.05, 0],
    [0.05, 0.006],
    [0.022, 0.014],
    [0.02, 0.045],
    [0.05, 0.056],
    [0.115, 0.092],
    [0.125, 0.106],
    [0.119, 0.107],
    [0.05, 0.068],
    [0, 0.066],
  ];
  m.fixed(GLAZE, lathe(scaleP(footed, Math.min(1, W / 1.4)), -W * 0.27, baseH, back + 0.045 + 0.125 * Math.min(1, W / 1.4), 28));

  /* Upper cabinet: lacquer shell, wood interior back. */
  const Du = Math.min(0.34, D * 0.76);
  const uFront = back + Du;
  const sh = 0.025;
  const inBot = uBot + sh;
  const inTop = H - sh;
  const ih = inTop - inBot;
  m.part('fronts', panel(W, sh, Du, 0, H - sh, back + Du / 2));
  m.part('fronts', panel(W, sh, Du, 0, uBot, back + Du / 2));
  for (const s of [-1, 1]) {
    m.part('fronts', panel(T, ih, Du, s * (W / 2 - T / 2), inBot, back + Du / 2));
    if (nw > 0) m.part('fronts', panel(T, ih, Du, s * (W / 2 - nw), inBot, back + Du / 2));
  }
  const ib = 0.012; // interior back
  m.part('wood', box(W - 2 * T, ih, ib, 0, inBot, back + ib / 2 + 0.002));
  const zb = back + ib + 0.002;

  // The LED strip under the cabinet, lighting the counter.
  m.fixed(LED, box(W - 2 * T - 0.04, 0.006, 0.012, 0, uBot - 0.004, uFront - 0.035));

  /* Shelves: glass in the cabinet, edge-lit; wood in the niches, lit underneath. */
  const levels = Math.max(2, Math.min(4, Math.round(ih / 0.26)));
  const levelH = ih / levels;
  const shelfT = 0.008;
  const zf = uFront - 0.04; // clear of the doors
  for (let k = 1; k < levels; k++) {
    const y = inBot + levelH * k;
    m.fixed(GLASS, box(cx1 - cx0 - 0.004, shelfT, zf - zb, 0, y - shelfT, (zb + zf) / 2));
    m.fixed(LED, box(cx1 - cx0 - 0.02, 0.003, 0.004, 0, y - shelfT + 0.0025, zf + 0.0025));
  }
  // LED profiles up the back corners of the cabinet (clear of the door stiles), and across its top behind the doors.
  for (const x of [cx0 + 0.012, cx1 - 0.012]) m.fixed(LED, box(0.008, ih - 0.02, 0.008, x, inBot + 0.01, zb + 0.005));
  m.fixed(LED, box(cx1 - cx0 - 0.03, 0.005, 0.012, 0, inTop - 0.006, uFront - 0.045));

  /* Glass doors: slim brass frames, bronze-tinted glass, long pulls on the meeting stiles. */
  const fw = 0.022;
  const fd = 0.02;
  const dwid = (cx1 - cx0) / doors;
  const dy0 = inBot + gap;
  const dy1 = inTop - gap;
  const dh = dy1 - dy0;
  const dz = uFront - fd / 2 - 0.001;
  for (let i = 0; i < doors; i++) {
    const x0 = cx0 + i * dwid + gap / 2;
    const x1 = x0 + dwid - gap;
    const xc = (x0 + x1) / 2;
    const w = x1 - x0;
    m.part('metal', rbox(fw, dh, fd, 0.002, x0 + fw / 2, dy0, dz, 1));
    m.part('metal', rbox(fw, dh, fd, 0.002, x1 - fw / 2, dy0, dz, 1));
    m.part('metal', rbox(w - 2 * fw, fw, fd, 0.002, xc, dy0, dz, 1));
    m.part('metal', rbox(w - 2 * fw, fw, fd, 0.002, xc, dy1 - fw, dz, 1));
    m.fixed(GLASS, box(w - 2 * fw + 0.008, dh - 2 * fw + 0.008, 0.005, xc, dy0 + fw - 0.004, dz));
    // The pull: on the meeting stile of a pair, on the free side of a single door.
    const right = doors === 1 || i % 2 === 0;
    const px = right ? x1 - fw / 2 : x0 + fw / 2;
    const plen = Math.min(0.3, dh * 0.4);
    m.part('metal', rbox(0.01, plen, 0.012, 0.003, px, dy0 + 0.06, uFront + 0.012, 1));
    for (const py of [dy0 + 0.075, dy0 + 0.045 + plen]) m.part('metal', box(0.006, 0.006, 0.012, px, py - 0.003, uFront + 0.003));
  }

  /* Dressing the cabinet: each shelf from the top, mirrored in alternate bays. */
  const plan: Arrangement[][] =
    levels === 2
      ? [['plates', 'charger'], ['stacks', 'serving']]
      : levels === 3
        ? [['glasses', 'glasses'], ['plates', 'charger'], ['stacks', 'serving']]
        : [['glasses', 'glasses'], ['plates', 'charger'], ['serving', 'stacks'], ['stacks', 'serving']];
  for (let b = 0; b < doors; b++) {
    const x0 = cx0 + b * dwid + 0.01;
    const x1 = x0 + dwid - 0.02;
    for (let k = 0; k < levels; k++) {
      const y = inTop - levelH * (k + 1);
      const shelf: Shelf = { x0, x1, y, zb, zf: zf - 0.005, h: levelH - shelfT - 0.006 };
      dressShelf(m, shelf, plan[k]![b % 2]!, b % 2 === 1);
    }
  }

  /* The open niches: wood shelves lit from underneath, dressed differently on each side. */
  if (nw > 0) {
    for (const side of [-1, 1]) {
      const nx0 = side < 0 ? -W / 2 + T : W / 2 - nw + T / 2;
      const nx1 = side < 0 ? -W / 2 + nw - T / 2 : W / 2 - T;
      const ncx = (nx0 + nx1) / 2;
      const st = 0.022;
      for (let k = 1; k < levels; k++) {
        const y = inBot + levelH * k;
        m.part('wood', panel(nx1 - nx0, st, Du - ib - 0.002, ncx, y - st, zb + (Du - ib - 0.002) / 2 - 0.002));
        m.fixed(LED, box(nx1 - nx0 - 0.02, 0.004, 0.008, ncx, y - st - 0.004, uFront - 0.03));
      }
      for (let k = 0; k < levels; k++) {
        const floor = inBot + levelH * k;
        const ceil = k === levels - 1 ? inTop : floor + levelH - st;
        dressNiche(m, { x0: nx0 + 0.01, x1: nx1 - 0.01, y: floor, zb, zf: uFront - 0.02, h: ceil - floor - 0.006 }, levels - 1 - k, side);
      }
    }
  }

  return finish(m.build());
}

/** Generators of this family, registered through `essentials.ts`. */
export const CROCKERY_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsCrockery: buildCrockery,
};
