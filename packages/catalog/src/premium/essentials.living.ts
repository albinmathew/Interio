/**
 * Living and dining pieces of the furnishing package: the black-glass TV unit,
 * the prayer unit, the Roman-numeral clock, the brass sunburst mirror, the large
 * centre table, the slatted partition and the dining bench.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { Fit, panel, type G } from './decor.parts';
import { archShape } from './essentials.bedroom';
import { Model, cyl, lathe, param, rbox, roundedRect, slab, type BuildContext } from './kit';
import { beam, rod, softBox, taperRod } from './seating.parts';

const GAP = 0.003;

/** A flat shape drawn in XY, extruded `depth` towards +Z from z = 0; the bevel stays inside the outline. */
function upright(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 16): G {
  const b = Math.min(bevel, depth / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * Math.max(b, 0), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments, bevelOffset: -b });
  return g.translate(0, 0, Math.max(b, 0));
}

const circle = (r: number, x = 0, y = 0): THREE.Path => new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, false);

/** A flat ring in the XY plane, `r0` to `r1`, extruded `depth` from z0. */
function annulus(r0: number, r1: number, depth: number, z0: number, segments = 64): G {
  const s = new THREE.Shape().absarc(0, 0, r1, 0, Math.PI * 2, false);
  s.holes.push(circle(r0));
  return upright(s, depth, Math.min(0.002, depth / 4), segments).translate(0, 0, z0);
}

/* ------------------------------------------------------------------ TV unit */

/**
 * A low, slim TV unit: a walnut case with a thick top on slim brass legs, a row
 * of black glass shutters each in a slim brass frame, with a brass finger pull
 * at the top of each. Params: `shutters` (default one per 45 cm).
 */
export function buildGlassTvUnit(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const n = Math.max(2, param(entry, 'shutters', Math.round(W / 0.45)));
  const legH = Math.min(0.11, H * 0.22);
  const topT = 0.028;
  const t = 0.02;
  const back = -D / 2;
  const cw = W - 0.016; // the case, a little inside the top
  const cd = D - 0.012;
  const cz = back + cd / 2;
  const y0 = legH;
  const y1 = H - topT;
  m.part('carcass', rbox(W, topT, D, 0.005, 0, y1, 0, 2));
  for (const s of [-1, 1]) m.part('carcass', panel(t, y1 - y0, cd, s * (cw / 2 - t / 2), y0, cz));
  m.part('carcass', panel(cw - 2 * t, t, cd, 0, y0, cz));
  m.part('carcass', panel(cw - 2 * t, y1 - y0 - t, 0.008, 0, y0 + t, back + 0.006, 0.001));
  // Slim tapered brass legs, set in from the corners; a fifth pair in the middle of long units.
  const lx = cw / 2 - 0.06;
  const lz = cd / 2 - 0.05;
  const xs = W > 1.4 ? [-lx, 0, lx] : [-lx, lx];
  for (const x of xs) for (const sz of [-1, 1]) m.part('metal', taperRod([x, 0, cz + sz * lz], [x, legH + 0.002, cz + sz * lz], 0.008, 0.013, 12));
  // Shutters: black glass in a slim brass frame, inset between the sides.
  const zFace = back + cd;
  const ft = 0.02;
  const inner = cw - 2 * t;
  const sw = (inner - GAP * (n + 1)) / n;
  const sy0 = y0 + t + GAP;
  const sh = y1 - GAP - sy0;
  const f = 0.01;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + GAP + sw / 2 + i * (sw + GAP);
    m.part('metal', panel(sw, f, ft, x, sy0, zFace - ft / 2, 0.0015));
    m.part('metal', panel(sw, f, ft, x, sy0 + sh - f, zFace - ft / 2, 0.0015));
    for (const s of [-1, 1]) m.part('metal', panel(f, sh - 2 * f, ft, x + s * (sw / 2 - f / 2), sy0 + f, zFace - ft / 2, 0.0015));
    m.part('shutters', panel(sw - 2 * f + 0.004, sh - 2 * f + 0.004, 0.006, x, sy0 + f - 0.002, zFace - 0.006, 0.001));
    m.fixed('lacquer.graphite', panel(sw - 2 * f, sh - 2 * f, 0.004, x, sy0 + f, zFace - ft + 0.002, 0.001));
    // Finger pull: a short brass lip over the top rail, at the meeting edge of each pair.
    const px = i % 2 === 0 ? x + sw / 2 - 0.07 : x - sw / 2 + 0.07;
    m.part('metal', rbox(0.07, 0.004, 0.026, 0.0015, n === 1 ? x : px, sy0 + sh - 0.004, zFace - 0.006, 1));
  }
  return m.build();
}

/* -------------------------------------------------------------- prayer unit */

/**
 * Points along a cusped (scalloped) arch of radius `r` springing at y = `spring`,
 * left to right: `lobes` round lobes meeting in points that reach in by a tenth
 * of the radius. `out` offsets the curve outwards.
 */
function cuspedArch(r: number, spring: number, lobes = 7, out = 0): [number, number][] {
  const cusp = r * 0.1;
  const steps = lobes * 8;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    const f = ((i / steps) * lobes) % 1;
    const rr = r - cusp * (1 - Math.sin(Math.PI * f)) ** 1.6 + out;
    pts.push([Math.cos(a) * rr, spring + Math.sin(a) * rr]);
  }
  return pts;
}

/** A panel `w` x `h` (XY plane, from y = 0) with a cusped arch opening `aw` wide and `ah` tall cut from its bottom edge. */
function archedPanel(w: number, h: number, aw: number, ah: number): THREE.Shape {
  const r = aw / 2;
  const spring = ah - r; // where the arch starts
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-r, 0);
  for (const [x, y] of cuspedArch(r, spring)) s.lineTo(x, y);
  s.lineTo(r, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  return s;
}

/** A jaali screen: a `w` x `h` panel pierced by a lattice of diamonds, in the XY plane from (−w/2, 0). */
function jaali(w: number, h: number, pitch: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const nx = Math.max(2, Math.floor((w - pitch * 0.4) / pitch));
  const ny = Math.max(2, Math.floor((h - pitch * 0.4) / pitch));
  const ox = -((nx - 1) * pitch) / 2;
  const oy = (h - (ny - 1) * pitch) / 2;
  const d = pitch * 0.36; // half-diagonal of a diamond
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = ox + i * pitch;
      const y = oy + j * pitch;
      const hole = new THREE.Path();
      hole.moveTo(x, y - d);
      hole.lineTo(x + d, y);
      hole.lineTo(x, y + d);
      hole.lineTo(x - d, y);
      hole.closePath();
      s.holes.push(hole);
      // A small round piercing between the diamonds.
      if (i < nx - 1 && j < ny - 1) s.holes.push(new THREE.Path().absarc(x + pitch / 2, y + pitch / 2, pitch * 0.08, 0, Math.PI * 2, true));
    }
  }
  return s;
}

/**
 * A pooja unit (mandir): a teak cabinet on a recessed plinth with two drawers
 * over two doors, a counter, and above it an open niche behind a cusped arch,
 * its back a backlit cream jaali. Inside: a stepped shelf for the deity (left
 * empty), a brass diya with its flame and two brass bells hanging from the
 * niche's ceiling. A stepped cornice crowns it, with a brass band. Front +Z.
 */
export function buildPrayerUnit(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const t = 0.022;
  const plinth = Math.min(0.07, H * 0.04);
  const counterY = H * 0.44; // underside of the counter
  const counterT = 0.03;
  const cornice = Math.min(0.11, H * 0.06);
  const WOOD = 'wood';
  const BRASS = 'brass';

  // Lower cabinet: sides, bottom, back, plinth.
  const cd = D - 0.02;
  const cz = back + cd / 2;
  for (const s of [-1, 1]) m.part(WOOD, panel(t, counterY, cd, s * (W / 2 - 0.01 - t / 2), 0, cz));
  m.part(WOOD, panel(W - 0.02 - 2 * t, t, cd, 0, plinth, cz));
  m.part(WOOD, panel(W - 0.02 - 2 * t, counterY - plinth - t, 0.008, 0, plinth + t, back + 0.006, 0.001));
  m.fixed('lacquer.graphite', panel(W - 0.02 - 2 * t, plinth, 0.016, 0, 0, back + cd - 0.04, 0.001));
  const zFront = back + cd;
  const inner = W - 0.02 - 2 * t;
  const dh = Math.min(0.15, (counterY - plinth - t) * 0.26);
  const yDoors = plinth + t + GAP;
  const yDrawers = counterY - GAP - dh;
  const half = (inner - 3 * GAP) / 2;
  for (const s of [-1, 1]) {
    const x = s * (half / 2 + GAP / 2);
    // Drawers with a raised panel and a brass knob.
    m.part(WOOD, rbox(half, dh, 0.018, 0.003, x, yDrawers, zFront - 0.009, 1));
    m.part(BRASS, knob(x, yDrawers + dh / 2, zFront));
    // Doors: a frame and a recessed panel, a brass knob at the meeting edge.
    const doorH = yDrawers - GAP - yDoors;
    const rail = Math.min(0.06, half * 0.16);
    m.part(WOOD, panel(half, doorH, 0.01, x, yDoors, zFront - 0.014));
    for (const k of [-1, 1]) m.part(WOOD, panel(rail, doorH, 0.012, x + k * (half / 2 - rail / 2), yDoors, zFront - 0.006));
    for (const y of [yDoors, yDoors + doorH - rail]) m.part(WOOD, panel(half - 2 * rail, rail, 0.012, x, y, zFront - 0.006));
    m.part(BRASS, knob(x - s * (half / 2 - 0.045), yDoors + doorH * 0.78, zFront));
  }
  // Counter, a little proud on three sides, with a brass inlay along its front.
  m.part(WOOD, rbox(W, counterT, D, 0.006, 0, counterY, 0, 2));
  m.part(BRASS, rbox(W - 0.06, 0.005, 0.003, 0.001, 0, counterY + counterT * 0.45, D / 2 - 0.0005, 1));

  // Upper niche: sides, top and back, shallower than the cabinet.
  const ny0 = counterY + counterT;
  const ny1 = H - cornice;
  const nd = D * 0.8;
  const nz = back + nd / 2;
  const nh = ny1 - ny0;
  for (const s of [-1, 1]) m.part(WOOD, panel(t, nh, nd, s * (W / 2 - 0.02 - t / 2), ny0, nz));
  m.part(WOOD, panel(W - 0.04, t, nd, 0, ny1 - t, nz));
  // The jaali in front of a warm glow, set at the back of the niche.
  const jw = W - 0.04 - 2 * t;
  const jh = nh - t;
  m.fixed('#e7b56a', panel(jw, jh, 0.006, 0, ny0, back + 0.003, 0.001));
  m.part('jaali', upright(jaali(jw, jh, Math.min(0.075, jw / 9)), 0.012, 0, 4).translate(0, ny0, back + 0.012));
  // The arched front frame, with a brass bead following the arch.
  const ft = 0.024;
  const aw = jw - 0.1;
  const ah = nh - t - 0.08;
  const zf = back + nd - ft;
  m.part(WOOD, upright(archedPanel(W - 0.04, nh, aw, ah), ft, 0.003).translate(0, ny0, zf));
  // The brass bead runs on the frame's face, a finger's width outside the opening.
  const zb = zf + ft + 0.002;
  const bead = [[-aw / 2 - 0.014, 0.004] as [number, number], ...cuspedArch(aw / 2, ah - aw / 2, 7, 0.014), [aw / 2 + 0.014, 0.004] as [number, number]];
  m.part(BRASS, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bead.map(([x, y]) => new THREE.Vector3(x, ny0 + y, zb)), false, 'catmullrom', 0.2), 160, 0.0045, 6, false));

  // Deity shelf: two steps at the back of the niche, left empty.
  const sw = jw * 0.62;
  m.part(WOOD, rbox(sw, 0.06, nd * 0.62, 0.004, 0, ny0, back + 0.02 + nd * 0.31, 2));
  m.part(WOOD, rbox(sw * 0.7, 0.05, nd * 0.36, 0.004, 0, ny0 + 0.06, back + 0.02 + nd * 0.18, 2));
  m.part(BRASS, rbox(sw, 0.006, 0.004, 0.001, 0, ny0 + 0.045, back + 0.02 + nd * 0.62, 1));
  // A brass diya on the front of the lower step, its flame lit.
  const dz = back + 0.02 + nd * 0.62 + 0.05;
  m.part(BRASS, lathe([[0, 0], [0.022, 0], [0.03, 0.006], [0.042, 0.018], [0.04, 0.02], [0.028, 0.012], [0, 0.01]], 0, ny0, dz, 24));
  m.part(BRASS, lathe([[0.014, 0], [0.02, 0], [0.012, -0.012], [0.004, -0.014]], 0, ny0 + 0.014, dz, 12));
  m.fixed('#ffc35a', lathe([[0, 0], [0.007, 0.006], [0.006, 0.018], [0.002, 0.03], [0, 0.034]], 0, ny0 + 0.014, dz, 12));
  // Two small brass bells hanging on chains from the niche's ceiling.
  // They hang inside the arch, just above where it springs, so they show through the opening.
  for (const s of [-1, 1]) {
    const k = 1.25; // bell size
    const bx = s * (aw / 2 - 0.085);
    const bz = back + nd * 0.6;
    const by = ny0 + ah - aw / 2 - 0.02;
    m.part(BRASS, cyl(0.0022, 0.0022, ny1 - t - by - 0.05, bx, by + 0.05, bz, 'y', 6));
    m.part(BRASS, lathe([[0, 0.056], [0.008, 0.055], [0.011, 0.05], [0.016, 0.031], [0.022, 0.01], [0.028, 0.003], [0.029, 0], [0.024, 0.001], [0, 0.005]].map(([r, h]) => [r! * k, h!] as [number, number]), bx, by, bz, 20));
    m.part(BRASS, new THREE.SphereGeometry(0.008, 10, 6).translate(bx, by - 0.004, bz));
  }

  // Stepped cornice with a brass band, and a pair of brass finials.
  m.part(WOOD, rbox(W - 0.03, cornice * 0.35, nd + 0.01, 0.004, 0, ny1, back + (nd + 0.01) / 2, 2));
  m.part(BRASS, rbox(W - 0.036, cornice * 0.12, 0.004, 0.001, 0, ny1 + cornice * 0.12, back + nd + 0.012, 1));
  m.part(WOOD, rbox(W, cornice * 0.3, nd + 0.04, 0.006, 0, ny1 + cornice * 0.35, back + (nd + 0.04) / 2, 2));
  m.part(WOOD, rbox(W * 0.86, cornice * 0.35, nd * 0.85, 0.008, 0, ny1 + cornice * 0.65, back + (nd * 0.85) / 2, 2));
  return m.build();
}

/** A round brass knob on a front whose face is at z. */
function knob(x: number, y: number, z: number): G {
  return lathe([[0, 0], [0.006, 0], [0.006, 0.01], [0.013, 0.016], [0.015, 0.021], [0.012, 0.026], [0, 0.027]], 0, 0, 0, 16).rotateX(Math.PI / 2).translate(x, y, z);
}

/* -------------------------------------------------------------------- clock */

/** The strokes of a Roman numeral, in a box 1 tall: [x0, y0, x1, y1] bars, and the width it takes. */
function numeral(text: string): { bars: [number, number, number, number][]; width: number } {
  const bars: [number, number, number, number][] = [];
  const gap = 0.16;
  let x = 0;
  for (const ch of text) {
    if (ch === 'I') {
      bars.push([x, 0, x, 1]);
      x += gap;
    } else if (ch === 'V') {
      bars.push([x, 1, x + 0.24, 0], [x + 0.24, 0, x + 0.48, 1]);
      x += 0.48 + gap;
    } else {
      bars.push([x, 0, x + 0.46, 1], [x, 1, x + 0.46, 0]);
      x += 0.46 + gap;
    }
  }
  return { bars, width: x - gap };
}

/**
 * A large Roman-numeral wall clock with an open frame: an outer and an inner
 * ring joined by the numerals themselves (serifed I, V and X strokes reading
 * outward, IIII at four), four spokes to a centre boss, and filigree hands at
 * ten past ten. Back at -Z, against the wall.
 */
export function buildRomanClock(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fit = new Fit();
  // Built 1 unit across; the depth in the same units, then fitted to the box.
  const dz = D / Math.min(W, H);
  const zr = dz * 0.35; // back of the rings
  const rt = dz * 0.2; // ring thickness
  fit.part('frame', annulus(0.47, 0.5, rt, zr));
  fit.part('frame', annulus(0.27, 0.295, rt, zr));
  // A stand-off behind the boss, against the wall.
  fit.part('frame', cyl(0.05, 0.05, zr, 0, 0, zr / 2, 'z', 24));
  // Spokes and boss.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    fit.part('frame', rod([Math.cos(a) * 0.05, Math.sin(a) * 0.05, zr + rt / 2], [Math.cos(a) * 0.28, Math.sin(a) * 0.28, zr + rt / 2], 0.007, 8));
  }
  fit.part('frame', cyl(0.06, 0.06, rt, 0, 0, zr + rt / 2, 'z', 32));
  // Numerals between the rings, their feet towards the centre.
  const r0 = 0.3;
  const r1 = 0.465;
  const nh = r1 - r0;
  const stroke = 0.012;
  const names = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  names.forEach((name, i) => {
    const { bars, width } = numeral(name);
    const serif = 0.011;
    const scale = nh - 2 * serif + 0.004; // glyph height: its serifs sit on the rings
    const parts: G[] = [];
    const w = width * scale * 0.82;
    for (const [x0, y0, x1, y1] of bars) {
      const a: [number, number, number] = [x0 * scale * 0.82 - w / 2, r0 + serif - 0.002 + y0 * scale, zr + rt / 2];
      const b: [number, number, number] = [x1 * scale * 0.82 - w / 2, r0 + serif - 0.002 + y1 * scale, zr + rt / 2];
      parts.push(beam(a, b, stroke, rt * 0.9, 0.002, 1));
    }
    // Serifs: bars across the foot and head of the numeral, standing on the rings.
    const sw = w + stroke * 2.4;
    const zs = zr + rt / 2 - (rt * 0.9) / 2;
    parts.push(rbox(sw, serif + 0.006, rt * 0.9, 0.002, 0, r0 - 0.006, zs, 1).translate(0, 0, 0));
    parts.push(rbox(sw, serif + 0.006, rt * 0.9, 0.002, 0, r1 - serif, zs, 1));
    const angle = -(i * Math.PI) / 6; // clockwise from twelve
    for (const g of parts) fit.part('frame', g.rotateZ(angle));
  });
  // Minute studs on the outer ring between the numerals.
  for (let k = 0; k < 60; k++) {
    if (k % 5 === 0) continue;
    const a = (k * Math.PI) / 30;
    fit.part('frame', cyl(0.006, 0.006, rt * 0.4, Math.sin(a) * 0.485, Math.cos(a) * 0.485, zr + rt * 1.2, 'z', 8));
  }
  // Hands at ten past ten: spade hour hand, long minute hand, thin seconds hand.
  const zh = zr + rt + dz * 0.06;
  const hand = (len: number, wid: number, tip: number, angle: number, z: number): G => {
    const s = new THREE.Shape();
    s.moveTo(-wid * 0.5, -len * 0.18);
    s.lineTo(wid * 0.5, -len * 0.18);
    s.lineTo(wid * 0.35, len * 0.62);
    s.lineTo(tip, len * 0.72);
    s.lineTo(wid * 0.25, len * 0.86);
    s.lineTo(0, len);
    s.lineTo(-wid * 0.25, len * 0.86);
    s.lineTo(-tip, len * 0.72);
    s.lineTo(-wid * 0.35, len * 0.62);
    s.closePath();
    s.holes.push(new THREE.Path().absarc(0, len * 0.72, tip * 0.45, 0, Math.PI * 2, true));
    return upright(s, dz * 0.05, 0, 8).rotateZ(angle).translate(0, 0, z);
  };
  fit.part('hands', hand(0.3, 0.03, 0.035, (Math.PI * 2 * (10 + 10 / 60)) / -12, zh));
  fit.part('hands', hand(0.43, 0.022, 0.026, (Math.PI * 2 * 10) / -60, zh + dz * 0.06));
  fit.part('hands', rod([-Math.sin(0.9) * 0.08, -Math.cos(0.9) * 0.08, zh + dz * 0.13], [Math.sin(0.9) * 0.44, Math.cos(0.9) * 0.44, zh + dz * 0.13], 0.003, 6));
  fit.part('hands', cyl(0.022, 0.026, dz * 0.12, 0, 0, zh + dz * 0.14, 'z', 24));
  fit.part('frame', cyl(0.012, 0.012, dz - (zh + dz * 0.2), 0, 0, (dz + zh + dz * 0.2) / 2, 'z', 16));
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* ------------------------------------------------------------------- mirror */

/**
 * A brass sunburst mirror: a round convex-edged mirror in a brass bezel on a
 * ring of brass rods in three lengths, the longest tipped with brass beads.
 * Back at -Z. Params: `rays` (default 36, a multiple of 4).
 */
export function buildSunburstMirror(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fit = new Fit();
  const dz = D / Math.min(W, H);
  const n = Math.max(12, Math.round(param(entry, 'rays', 36) / 4) * 4);
  const R = 0.5;
  const rm = 0.215; // mirror radius
  // Backing disc and the bezel.
  const zb = dz * 0.35; // front of the backing disc
  fit.part('frame', cyl(rm + 0.02, rm + 0.02, zb, 0, 0, zb / 2, 'z', 48));
  fit.part('frame', lathe([[rm - 0.006, 0], [rm + 0.032, 0], [rm + 0.036, dz * 0.3], [rm + 0.028, dz * 0.55], [rm + 0.012, dz * 0.65], [rm - 0.002, dz * 0.56], [rm - 0.006, dz * 0.4]], 0, 0, 0, 64).rotateX(Math.PI / 2).translate(0, 0, zb));
  // The glass, gently domed.
  fit.part('glass', lathe([[0, dz * 0.6], [rm * 0.6, dz * 0.57], [rm * 0.95, dz * 0.48], [rm - 0.003, dz * 0.45], [rm - 0.003, 0], [0, 0]], 0, 0, 0, 64).rotateX(Math.PI / 2).translate(0, 0, zb));
  // Rays: long, short, medium, short...
  const zc = dz * 0.22;
  for (let k = 0; k < n; k++) {
    const a = (k * Math.PI * 2) / n;
    const kind = k % 4; // 0 long, 2 medium, odd short
    const len = kind === 0 ? R - 0.018 : kind === 2 ? R * 0.82 : R * 0.66;
    const r0 = rm + 0.028;
    const dir: [number, number] = [Math.cos(a), Math.sin(a)];
    const rr = kind === 0 ? 0.0075 : kind === 2 ? 0.006 : 0.005;
    fit.part('frame', taperRod([dir[0] * r0, dir[1] * r0, zc], [dir[0] * len, dir[1] * len, zc], rr * 1.3, rr, 8));
    if (kind === 0) fit.part('frame', new THREE.SphereGeometry(0.018, 14, 10).translate(dir[0] * (R - 0.018), dir[1] * (R - 0.018), zc));
    else if (kind === 2) fit.part('frame', new THREE.SphereGeometry(0.011, 10, 8).translate(dir[0] * (len + 0.004), dir[1] * (len + 0.004), zc));
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* -------------------------------------------------------------- centre table */

/**
 * A large centre table: a soft-cornered travertine top over a fluted walnut
 * pedestal of the same outline, standing on a recessed brass plinth band.
 */
export function buildLargeCentreTable(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const topT = Math.min(0.035, H * 0.09);
  const cr = Math.min(W, D) * 0.22; // corner radius
  m.part('top', slab(roundedRect(W - 0.016, D - 0.016, cr - 0.008), topT, 0, H - topT, 0, 0.008));
  // A shadow-gap reveal under the top.
  const inset = Math.min(W, D) * 0.12;
  const bw = W - 2 * inset;
  const bd = D - 2 * inset;
  const br = Math.max(0.02, cr - inset);
  const band = 0.03;
  m.part('base', slab(roundedRect(bw - 0.04, bd - 0.04, Math.max(0.01, br - 0.02)), 0.02, 0, H - topT - 0.02, 0, 0.003));
  // Pedestal core and its flutes, following the rounded outline.
  const coreW = bw - 0.03;
  const coreD = bd - 0.03;
  const coreR = Math.max(0.01, br - 0.015);
  const y0 = band;
  const y1 = H - topT - 0.02;
  m.part('base', slab(roundedRect(coreW, coreD, coreR), y1 - y0, 0, y0, 0, 0.002));
  const outline = roundedRect(coreW + 0.004, coreD + 0.004, coreR + 0.002);
  const pts = outline.getSpacedPoints(Math.max(40, Math.round((2 * (coreW + coreD)) / 0.034)));
  const fr = 0.011;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    // Shape y is -z once laid down.
    m.part('base', cyl(fr, fr, y1 - y0 - 0.012, p.x, y0 + 0.006, -p.y, 'y', 8));
  }
  // Recessed brass plinth band.
  m.part('accent', slab(roundedRect(coreW - 0.02, coreD - 0.02, Math.max(0.01, coreR - 0.01)), band, 0, 0, 0, 0.002));
  return m.build();
}

/* ---------------------------------------------------------------- partition */

/**
 * A freestanding living-dining partition: vertical oak slats with shadow gaps
 * in a slim black steel frame, on a low plinth, with a slim steel rail at
 * dado height tying the slats. Params: `slat` (width in mm, default 32), `gap` (mm, default 22).
 */
export function buildSlattedPartition(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const post = Math.min(0.04, W * 0.035);
  const plinth = Math.min(0.1, H * 0.045);
  const rail = Math.min(0.04, H * 0.017);
  m.part('frame', rbox(W, plinth, D, 0.004, 0, 0, 0, 2));
  m.part('frame', rbox(W, rail, D, 0.004, 0, H - rail, 0, 2));
  for (const s of [-1, 1]) m.part('frame', rbox(post, H - plinth - rail + 0.004, D, 0.004, s * (W / 2 - post / 2), plinth - 0.002, 0, 2));
  // Slats, a little shallower than the frame so it reads round them.
  const slat = param(entry, 'slat', 32) / 1000;
  const gap = param(entry, 'gap', 22) / 1000;
  const span = W - 2 * post;
  const n = Math.max(3, Math.round((span - gap) / (slat + gap)));
  const g = (span - n * slat) / (n + 1);
  const sd = D * 0.82;
  const y0 = plinth;
  const y1 = H - rail;
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + g + slat / 2 + i * (slat + g);
    m.part('slats', rbox(slat, y1 - y0, sd, 0.006, x, y0, 0, 2));
  }
  // The dado rail, through the slats.
  const ry = Math.min(0.9, H * 0.38);
  m.part('frame', rbox(span + 0.004, 0.012, D * 0.3, 0.003, 0, ry, 0, 1));
  return m.build();
}

/* -------------------------------------------------------------------- bench */

/**
 * A three-seater dining bench to match the upholstered dining chairs: tapered
 * oak legs, aprons and an H-stretcher, a thin seat board under a piped
 * upholstered seat in three channels.
 */
export function buildDiningBench(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const F = 'frame';
  const leg = 0.04;
  const lx = W / 2 - 0.04;
  const lz = D / 2 - 0.04;
  const ph = Math.min(0.075, H * 0.17); // cushion
  const seatT = 0.022;
  const seatY = H - ph; // top of the seat board
  const apronH = 0.065;
  const apronY = seatY - seatT - apronH + 0.004;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.part(F, beam([sx * lx, 0, sz * lz], [sx * lx, seatY - seatT + 0.002, sz * lz], leg, leg, 0.006, 1, 0.75));
  for (const sz of [-1, 1]) m.part(F, rbox(2 * lx - leg + 0.004, apronH, 0.02, 0.004, 0, apronY, sz * (lz - 0.004), 1));
  for (const sx of [-1, 1]) m.part(F, rbox(0.02, apronH, 2 * lz - leg + 0.004, 0.004, sx * (lx - 0.004), apronY, 0, 1));
  // H-stretcher.
  const sy = Math.min(0.15, H * 0.32);
  for (const sx of [-1, 1]) m.part(F, rbox(0.018, 0.022, 2 * lz - leg + 0.004, 0.004, sx * lx, sy, 0, 1));
  m.part(F, rbox(2 * lx - leg + 0.004, 0.022, 0.018, 0.004, 0, sy, 0, 1));
  // Seat board and three upholstered channels with piping along the front and back.
  m.part(F, rbox(W - 0.01, seatT, D - 0.01, 0.006, 0, seatY - seatT, 0, 1));
  const seats = Math.max(2, param(entry, 'seats', 3));
  const cw = W / seats;
  for (let i = 0; i < seats; i++) {
    const x = -W / 2 + cw * (i + 0.5);
    m.part('upholstery', softBox(cw - 0.006, ph * 0.9, D, x, seatY, 0, 0.1, 0.03, 3));
    const py = seatY + ph * 0.9 - 0.02;
    for (const sz of [-1, 1]) m.part('upholstery', rod([x - cw / 2 + 0.03, py, sz * (D / 2 - 0.008)], [x + cw / 2 - 0.03, py, sz * (D / 2 - 0.008)], 0.005, 6));
  }
  return m.build();
}

/** Generators of this file, registered through `premium/essentials.ts`. */
export const LIVING_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsTvGlass: buildGlassTvUnit,
  essentialsPrayer: buildPrayerUnit,
  essentialsClock: buildRomanClock,
  essentialsSunburst: buildSunburstMirror,
  essentialsCentreTable: buildLargeCentreTable,
  essentialsPartition: buildSlattedPartition,
  essentialsBench: buildDiningBench,
};
