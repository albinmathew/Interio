/**
 * Premium generators: decor. Rugs, framed art, mirrors, plants, books,
 * curtains and throw pillows. See `beds.ts` for the conventions; organic pieces
 * are built at their nominal size and fitted to the entry's box with `Fit`.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { Model, cyl, lathe, param, pillow, rbox, tube, type BuildContext } from './kit';
import { BARK, Fit, GREENS, SOIL, bookRow, bookStack, hash, join, leaf, place, pot, rng, surface, twoSided, type Emit, type G } from './decor.parts';

/* -------------------------------------------------------------------- slots */

const pile = (def: string): FinishSlot => ({ id: 'pile', label: 'Pile', kind: 'fabric', default: def });
const border = (def: string): FinishSlot => ({ id: 'border', label: 'Border', kind: 'fabric', default: def });
export const RUG_SLOTS = {
  cream: [pile('fabric.boucle.cream'), border('fabric.linen.taupe')],
  sand: [pile('fabric.linen.sand'), border('fabric.weave.charcoal')],
  sage: [pile('fabric.cotton.sage'), border('fabric.linen.ivory')],
  oat: [pile('fabric.boucle.cream'), border('fabric.linen.sand')],
  grey: [pile('fabric.weave.grey'), border('fabric.weave.charcoal')],
  coir: [{ id: 'pile', label: 'Mat', kind: 'woven', default: 'woven.jute' } as FinishSlot, border('fabric.weave.charcoal')],
} satisfies Record<string, FinishSlot[]>;

export const ART_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'mount', label: 'Mount', kind: 'lacquer', default: 'lacquer.white' },
  { id: 'canvas', label: 'Background', kind: 'lacquer', default: 'lacquer.cream' },
];
export const ART_SLOTS_WALNUT: FinishSlot[] = [{ ...ART_SLOTS[0]!, default: 'wood.walnut' }, ART_SLOTS[1]!, ART_SLOTS[2]!];
/** A canvas in a black floater frame: no mount. */
export const ART_SLOTS_FLOAT: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' },
  { id: 'canvas', label: 'Background', kind: 'lacquer', default: 'lacquer.cream' },
];

const glass: FinishSlot = { id: 'glass', label: 'Glass', kind: 'glass', default: 'glass.mirror' };
export const MIRROR_SLOTS = {
  black: [{ id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.black' } as FinishSlot, glass],
  brass: [{ id: 'frame', label: 'Frame', kind: 'metal', default: 'metal.brass' } as FinishSlot, glass],
  oak: [{ id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' } as FinishSlot, glass],
} satisfies Record<string, FinishSlot[]>;

const potSlot = (def: string): FinishSlot => ({ id: 'pot', label: 'Pot', kind: 'ceramic', default: def });
export const PLANT_SLOTS = {
  floor: [potSlot('ceramic.white'), { id: 'saucer', label: 'Plant stand', kind: 'wood', default: 'wood.oak' } as FinishSlot],
  terracotta: [potSlot('ceramic.terracotta'), { id: 'saucer', label: 'Saucer', kind: 'ceramic', default: 'ceramic.terracotta' } as FinishSlot],
  white: [potSlot('ceramic.white'), { id: 'saucer', label: 'Saucer', kind: 'wood', default: 'wood.oak' } as FinishSlot],
} satisfies Record<string, FinishSlot[]>;

export const BOOK_SLOTS: FinishSlot[] = [
  { id: 'covers', label: 'Covers', kind: 'fabric', default: 'fabric.linen.taupe' },
  { id: 'pages', label: 'Pages', kind: 'fabric', default: 'fabric.linen.ivory' },
  { id: 'bookend', label: 'Bookend', kind: 'metal', default: 'metal.brass' },
];

export const CURTAIN_SLOTS: FinishSlot[] = [
  { id: 'fabric', label: 'Curtains', kind: 'fabric', default: 'fabric.linen.ivory' },
  { id: 'rod', label: 'Rod', kind: 'metal', default: 'metal.black' },
];

export const PILLOW_SLOTS: FinishSlot[] = [
  { id: 'large', label: 'Large cushions', kind: 'fabric', default: 'fabric.boucle.cream' },
  { id: 'accent', label: 'Accent cushion', kind: 'fabric', default: 'fabric.velvet.rust' },
  { id: 'lumbar', label: 'Lumbar cushion', kind: 'fabric', default: 'fabric.linen.sand' },
];

/* --------------------------------------------------------------------- rugs */

type RugShape = 'rect' | 'round' | 'pill';

/** The rug's outline inset by `k`, in the XY plane (laid down by `slab`). */
function outline(W: number, D: number, shape: RugShape, k: number): THREE.Shape {
  const w = W - 2 * k;
  const d = D - 2 * k;
  if (shape === 'round') {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, d / 2, 0, Math.PI * 2, false, 0);
    return s;
  }
  const r = shape === 'pill' ? Math.min(w, d) / 2 - 1e-4 : Math.max(0.004, 0.025 - k * 0.3);
  return roundedOutline(w, d, r);
}

function roundedOutline(w: number, d: number, r: number): THREE.Shape {
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-5, d / 2 - 1e-5));
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + rr, -d / 2);
  s.lineTo(w / 2 - rr, -d / 2);
  s.absarc(w / 2 - rr, -d / 2 + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, d / 2 - rr);
  s.absarc(w / 2 - rr, d / 2 - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + rr, d / 2);
  s.absarc(-w / 2 + rr, d / 2 - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -d / 2 + rr);
  s.absarc(-w / 2 + rr, -d / 2 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** A ring between two outlines, extruded up from y with a soft top. */
function ring(outer: THREE.Shape, inner: THREE.Shape, h: number, bevel: number, y = 0): G {
  const s = new THREE.Shape(outer.getPoints(24));
  s.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
  return layDown(s, h, bevel, y);
}

/** Extrudes a shape drawn in XY by `h` and lays it on the floor (y up). The bevel stays inside the outline. */
function layDown(shape: THREE.Shape, h: number, bevel: number, y = 0): G {
  const b = Math.min(bevel, h / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, h - 2 * b), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 24, bevelOffset: -b });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  return g.translate(0, y - g.boundingBox!.min.y, 0);
}

/**
 * A rug with a bound edge and a pile standing a little proud of it. Params:
 * `shape` 'rect' | 'round' | 'pill', `band` (a carved line of the border colour
 * inside the pile, default true), `fringe` (tassels on the short ends).
 */
export function buildRug(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const shape = param<RugShape>(entry, 'shape', 'rect');
  const fringe = param(entry, 'fringe', false) && shape === 'rect';
  const band = param(entry, 'band', true);
  // Tassels take the last few centimetres of the short ends.
  const f = fringe ? Math.min(0.06, Math.max(W, D) * 0.03) : 0;
  const alongZ = D >= W;
  const RW = alongZ ? W : W - 2 * f;
  const RD = alongZ ? D - 2 * f : D;
  const b = THREE.MathUtils.clamp(Math.min(RW, RD) * 0.025, 0.018, 0.045);
  const bh = H * 0.72;
  m.part('border', ring(outline(RW, RD, shape, 0), outline(RW, RD, shape, b), bh, Math.min(bh * 0.45, 0.005)));
  const lip = 0.003; // the pile tucks under the binding
  if (band && Math.min(RW, RD) > 0.5) {
    const c = b + THREE.MathUtils.clamp(Math.min(RW, RD) * 0.07, 0.05, 0.16);
    const gw = 0.012;
    m.part('pile', ring(outline(RW, RD, shape, b - lip), outline(RW, RD, shape, c - gw / 2), H, H * 0.35));
    m.part('border', ring(outline(RW, RD, shape, c - gw / 2 - 0.001), outline(RW, RD, shape, c + gw / 2 + 0.001), H * 0.82, 0.002));
    m.part('pile', layDown(outline(RW, RD, shape, c + gw / 2), H, H * 0.35));
  } else {
    m.part('pile', layDown(outline(RW, RD, shape, b - lip), H, H * 0.35));
  }
  if (fringe) {
    const span = alongZ ? RW - 2 * b : RD - 2 * b;
    const n = Math.floor(span / 0.014);
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const u = -span / 2 + (i + 0.5) * (span / n);
        const l = f * (0.86 + ((i * 7919) % 13) / 13 * 0.14);
        const t = cyl(0.0022, 0.0028, l, 0, 0, 0, 'z', 5);
        if (alongZ) m.part('border', t.translate(u + (((i * 31) % 7) - 3) * 0.0006, 0.0028, s * (RD / 2 + l / 2 - 0.002)));
        else m.part('border', t.rotateY(Math.PI / 2).translate(s * (RW / 2 + l / 2 - 0.002), 0.0028, u));
      }
      // The outermost tassels reach the ends exactly.
      const end = alongZ ? box3(span, 0.004, 0.004, 0, 0, s * (D / 2 - 0.002)) : box3(0.004, 0.004, span, s * (W / 2 - 0.002), 0, 0);
      m.part('border', end);
    }
  }
  return m.build();
}

const box3 = (w: number, h: number, d: number, x: number, y: number, z: number): G => rbox(w, h, d, Math.min(w, h, d) * 0.45, x, y, z, 1);

/* ---------------------------------------------------------------------- art */

/**
 * A rectangular frame of four softened bars, centred on x = 0 and y = 0 in the
 * XY plane, from z0 towards +Z. A thinner lip steps down to the opening.
 */
function frameRing(w: number, h: number, inner: number, depth: number, z0: number, bevel: number, lip = 0): G {
  const r = Math.max(0.0008, Math.min(bevel, inner / 4, depth / 4));
  const bars = (bw: number, d: number, z: number): G[] => [
    rbox(w, bw, d, r, 0, h / 2 - bw, z, 2),
    rbox(w, bw, d, r, 0, -h / 2, z, 2),
    rbox(bw, h - 2 * bw + 0.002, d, r, -w / 2 + bw / 2, -h / 2 + bw - 0.001, z, 2),
    rbox(bw, h - 2 * bw + 0.002, d, r, w / 2 - bw / 2, -h / 2 + bw - 0.001, z, 2),
  ];
  const parts = bars(inner - lip, depth, z0 + depth / 2);
  if (lip > 0) {
    const lw = inner;
    const ld = depth * 0.6;
    parts.push(
      rbox(w - 2 * (inner - lip) + 0.002, lip, ld, r, 0, h / 2 - lw, z0 + ld / 2, 1),
      rbox(w - 2 * (inner - lip) + 0.002, lip, ld, r, 0, -h / 2 + lw - lip, z0 + ld / 2, 1),
      rbox(lip, h - 2 * lw + 0.002, ld, r, -w / 2 + lw - lip / 2, -h / 2 + lw - 0.001, z0 + ld / 2, 1),
      rbox(lip, h - 2 * lw + 0.002, ld, r, w / 2 - lw + lip / 2, -h / 2 + lw - 0.001, z0 + ld / 2, 1),
    );
  }
  return join(parts);
}

/** Flat shapes for the artwork, in a [0,1] square, by colour. */
function composition(seed: number, aw: number, ah: number): { colour: string; shape: THREE.Shape }[] {
  const rand = rng(seed * 977 + 13);
  const P = (u: number, v: number) => new THREE.Vector2((u - 0.5) * aw, (v - 0.5) * ah);
  const out: { colour: string; shape: THREE.Shape }[] = [];
  if (seed % 3 === 0) {
    // Layered hills under a low sun.
    const sun = new THREE.Shape();
    sun.absarc(0.22 * aw, 0.12 * ah, Math.min(aw, ah) * 0.13, 0, Math.PI * 2, false);
    out.push({ colour: '#c0714f', shape: sun });
    const layers: [string, number, number][] = [['#cdb79a', 0.5, 0.06], ['#8f9f86', 0.38, 0.08], ['#5f6f52', 0.22, 0.07]];
    layers.forEach(([colour, base, amp], k) => {
      const pts = [P(0, 0)];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        pts.push(P(u, base + amp * Math.sin(u * Math.PI * (1.3 + k * 0.6) + k * 1.7 + rand())));
      }
      pts.push(P(1, 0));
      out.push({ colour, shape: new THREE.Shape(pts) });
    });
  } else if (seed % 3 === 1) {
    // Overlapping arches.
    const arch = (cu: number, wu: number, hv: number, colour: string) => {
      const s = new THREE.Shape();
      const r = (wu * aw) / 2;
      const x0 = (cu - 0.5) * aw;
      const yb = -0.5 * ah + 0.1 * ah;
      const yt = yb + hv * ah - r;
      s.moveTo(x0 - r, yb);
      s.lineTo(x0 + r, yb);
      s.lineTo(x0 + r, yt);
      s.absarc(x0, yt, r, 0, Math.PI, false);
      s.lineTo(x0 - r, yb);
      out.push({ colour, shape: s });
    };
    arch(0.38, 0.42, 0.72, '#e2b8a6');
    arch(0.6, 0.36, 0.55, '#b9694a');
    arch(0.3, 0.2, 0.36, '#c9a050');
    const dot = new THREE.Shape();
    dot.absarc(0.2 * aw, 0.3 * ah, Math.min(aw, ah) * 0.06, 0, Math.PI * 2, false);
    out.push({ colour: '#3b3a38', shape: dot });
  } else {
    // Soft organic forms.
    const blob = (cu: number, cv: number, r: number, colour: string) => {
      const pts: THREE.Vector2[] = [];
      const k = 7;
      const radii = Array.from({ length: k }, () => r * (0.75 + rand() * 0.5));
      const curve = new THREE.SplineCurve(
        Array.from({ length: k + 1 }, (_, i) => {
          const a = (i / k) * Math.PI * 2;
          const rr = radii[i % k]!;
          return P(cu + (Math.cos(a) * rr * ah) / aw, cv + Math.sin(a) * rr);
        }),
      );
      pts.push(...curve.getPoints(40));
      out.push({ colour, shape: new THREE.Shape(pts) });
    };
    blob(0.36, 0.58, 0.24, '#d8c3a5');
    blob(0.62, 0.4, 0.2, '#a5573a');
    blob(0.5, 0.52, 0.11, '#3b3a38');
  }
  return out;
}

/**
 * Framed art: a moulded frame, a bevelled mount (unless the slots leave it
 * out: then a canvas floats in the frame), an abstract composition in earthy
 * colours chosen by `seed`. Back against the wall at -Z.
 */
export function buildArt(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const seed = param(entry, 'seed', 0);
  const mounted = entry.slots?.some((s) => s.id === 'mount') ?? false;
  const f = THREE.MathUtils.clamp(Math.min(W, H) * (mounted ? 0.045 : 0.018), 0.012, 0.04);
  const back = -D / 2;
  m.part('frame', frameRing(W, H, f, D, back, 0.003, mounted ? f * 0.3 : 0).translate(0, H / 2, 0));
  const iw = W - 2 * f;
  const ih = H - 2 * f;
  let aw = iw;
  let ah = ih;
  let artZ: number;
  if (mounted) {
    const mt = Math.min(iw, ih) * 0.14;
    const mz = D / 2 - 0.008;
    m.part('mount', frameRing(iw + 0.004, ih + 0.004, mt, 0.003, mz - 0.003, 0.001).translate(0, H / 2, 0));
    m.part('mount', rbox(iw + 0.004, ih + 0.004, 0.004, 0.001, 0, f - 0.002, back + 0.006, 1));
    aw = iw - 2 * mt + 0.004;
    ah = ih - 2 * mt + 0.004;
    m.part('canvas', rbox(aw + 0.01, ah + 0.01, 0.002, 0.0008, 0, H / 2 - ah / 2 - 0.005, mz - 0.006, 1));
    artZ = mz - 0.0048;
  } else {
    // Floater: the canvas stands proud of the backing, with a shadow gap to the frame.
    const gap = 0.008;
    aw = iw - 2 * gap;
    ah = ih - 2 * gap;
    m.part('frame', rbox(iw + 0.002, ih + 0.002, 0.004, 0.001, 0, f - 0.001, back + 0.003, 1));
    m.part('canvas', rbox(aw, ah, D - 0.012, 0.002, 0, H / 2 - ah / 2, back + 0.004 + (D - 0.012) / 2, 2));
    artZ = back + 0.004 + (D - 0.012);
  }
  for (const [i, { colour, shape }] of composition(seed, aw * 0.94, ah * 0.94).entries()) {
    const g = new THREE.ShapeGeometry(shape, 24);
    m.fixed(colour, g.translate(0, H / 2, artZ + 0.0004 + i * 0.0003));
  }
  return m.build();
}

/* ------------------------------------------------------------------ mirrors */

type MirrorShape = 'rect' | 'round' | 'arch';

function mirrorOutline(w: number, h: number, shape: MirrorShape): THREE.Shape {
  if (shape === 'round') {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return s;
  }
  if (shape === 'arch') {
    const r = w / 2;
    const s = new THREE.Shape();
    s.moveTo(-r, -h / 2);
    s.lineTo(r, -h / 2);
    s.lineTo(r, h / 2 - r);
    s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
    s.lineTo(-r, -h / 2);
    return s;
  }
  return roundedOutline(w, h, Math.min(w, h) * 0.08);
}

/**
 * A mirror in a slim frame. Params: `shape` 'rect' | 'round' | 'arch', `lean`
 * (stands on the floor leaning back against the wall: the depth of the entry
 * sets the angle). Back at -Z.
 */
export function buildMirror(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const shape = param<MirrorShape>(entry, 'shape', 'rect');
  const lean = param(entry, 'lean', false);
  const t = lean ? Math.min(0.035, D * 0.3) : D;
  const f = THREE.MathUtils.clamp(Math.min(W, H) * 0.035, 0.012, 0.035);
  const L = lean ? Math.sqrt(Math.max(H * H - (D - t) * (D - t), H * H * 0.8)) : H;
  const fit = new Fit();
  // Built standing at the origin, back face at z = 0.
  const outer = mirrorOutline(W, L, shape);
  const inner = mirrorOutline(W - 2 * f, L - 2 * f, shape);
  const frame = new THREE.Shape(outer.getPoints(48));
  frame.holes.push(new THREE.Path(inner.getPoints(48).reverse()));
  const b = Math.min(0.004, t / 4);
  fit.part('frame', new THREE.ExtrudeGeometry(frame, { depth: t - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 24, bevelOffset: -b }).translate(0, 0, b));
  fit.part('frame', new THREE.ExtrudeGeometry(mirrorOutline(W - 2 * f + 0.004, L - 2 * f + 0.004, shape), { depth: 0.006, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, 0.002));
  fit.part('glass', new THREE.ExtrudeGeometry(mirrorOutline(W - 2 * f + 0.002, L - 2 * f + 0.002, shape), { depth: 0.004, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, t * 0.55));
  if (lean) {
    // Two felt pads at the foot.
    for (const s of [-1, 1]) fit.fixed('fabric.weave.charcoal', rbox(0.03, 0.01, t * 0.8, 0.003, s * (W / 2 - 0.06), -L / 2 - 0.004, t / 2, 1));
  }
  const angle = lean ? Math.asin(Math.min(0.5, (D - t) / H)) : 0;
  fit.transform(new THREE.Matrix4().makeRotationX(-angle));
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* ------------------------------------------------------------------- plants */

type Species = 'fiddle' | 'palm' | 'snake' | 'bush' | 'cactus' | 'fir';

/**
 * A potted plant. Params: `species` 'fiddle' | 'palm' | 'snake' | 'bush' |
 * 'cactus' | 'fir', `pot` 'taper' | 'cylinder' | 'bowl'. Leaves are folded
 * blades in three greens; the pot is turned ceramic with soil just below its
 * rim, standing on a saucer or a low oak stand.
 */
export function buildPlant(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const species = param<Species>(entry, 'species', 'fiddle');
  const rand = rng(hash(entry.id));
  const floor = H > 0.6;
  const shapePot = param<'taper' | 'cylinder' | 'bowl'>(entry, 'pot', floor ? 'cylinder' : 'taper');
  const fit = new Fit();
  const S = Math.min(W, D);
  // Pot proportions per species.
  const potR = S * (species === 'cactus' || species === 'snake' ? 0.42 : species === 'palm' ? 0.24 : species === 'fiddle' ? 0.3 : 0.38);
  const potH = floor ? Math.min(H * 0.26, potR * 1.9) : H * (species === 'cactus' ? 0.36 : 0.42);
  const saucerH = floor ? Math.min(0.06, H * 0.04) : 0.012;
  const p = pot(potR, potH, shapePot, 0, saucerH, 0);
  fit.part('pot', p.body);
  fit.fixed(SOIL, p.soil);
  if (floor) {
    // A low oak stand on three short feet.
    fit.part('saucer', lathe([[0, saucerH * 0.45], [potR * 1.04, saucerH * 0.45], [potR * 1.06, saucerH * 0.7], [potR * 1.04, saucerH], [0, saucerH]], 0, 0, 0, 36));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      fit.part('saucer', cyl(0.012, 0.009, saucerH * 0.5, Math.cos(a) * potR * 0.75, 0, Math.sin(a) * potR * 0.75, 'y', 10));
    }
  } else {
    fit.part('saucer', lathe([[0, 0], [potR * 0.95, 0], [potR * 1.06, saucerH * 0.4], [potR * 1.1, saucerH], [potR * 1.0, saucerH], [potR * 0.9, saucerH * 0.4], [0, saucerH * 0.4]], 0, 0, 0, 32));
  }
  const y0 = p.soilY;
  const top = H;
  const green = (k: number) => GREENS[Math.min(GREENS.length - 1, Math.max(0, k))]!;
  const shade = () => green(Math.floor(rand() * 3));

  if (species === 'fiddle') {
    // Two or three stems with big, glossy, upturned leaves on their upper part.
    const stems = 3;
    for (let s = 0; s < stems; s++) {
      const a = (s / stems) * Math.PI * 2 + rand();
      const h = (top - y0) * (0.62 + rand() * 0.22);
      const lean = 0.06 + rand() * 0.08;
      const pts: [number, number, number][] = [
        [Math.cos(a) * 0.02, y0 - 0.02, Math.sin(a) * 0.02],
        [Math.cos(a) * lean * 0.5, y0 + h * 0.5, Math.sin(a) * lean * 0.5],
        [Math.cos(a) * lean, y0 + h, Math.sin(a) * lean],
      ];
      fit.fixed(BARK, tube(pts, 0.012, false, 7));
      const n = 17 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const t = 0.28 + (0.72 * i) / n;
        const px = Math.cos(a) * lean * t;
        const pz = Math.sin(a) * lean * t;
        const py = y0 + h * t;
        const size = 0.17 + rand() * 0.09;
        const g = leaf(size * 1.25, size * 0.95, 'broad', 5, 0.18, 0.55);
        fit.fixed(shade(), place(g, px, py, pz, i * 2.4 + rand(), -0.5 - rand() * 0.6, (rand() - 0.5) * 0.4));
      }
      // A crown of young leaves at the tip, pointing up.
      for (let i = 0; i < 3; i++) fit.fixed(green(2), place(leaf(0.14, 0.1, 'broad', 4, 0.3, 0.2), pts[2]![0], pts[2]![1], pts[2]![2], i * 2.1, -1.1, 0));
    }
  } else if (species === 'palm') {
    // Kentia: arching fronds with leaflets on both sides.
    const fronds = 9;
    for (let k = 0; k < fronds; k++) {
      const a = (k / fronds) * Math.PI * 2 + rand() * 0.4;
      const len = (top - y0) * (0.75 + rand() * 0.3);
      const rise = 0.35 + rand() * 0.6; // steep (young) to arching (old)
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const out = len * (0.3 + 0.55 * (1 - rise)) * u ** 1.15;
        const up = len * (0.95 * rise + 0.3) * Math.sin(u * Math.PI * (0.5 + 0.25 * (1 - rise)));
        pts.push(new THREE.Vector3(Math.cos(a) * out, y0 + up, Math.sin(a) * out));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      fit.fixed(green(0), new THREE.TubeGeometry(curve, 16, 0.004, 5, false));
      const n = 18;
      for (let i = 2; i < n; i++) {
        const u = i / n;
        const at = curve.getPoint(u);
        const tan = curve.getTangent(u);
        const yaw = Math.atan2(tan.x, tan.z);
        const pitch = -Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1));
        const l = 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.1)) + 0.06;
        for (const side of [-1, 1]) {
          const g = leaf(l, 0.035, 'lance', 3, 0.35, 0.9);
          fit.fixed(shade(), place(g, at.x, at.y, at.z, yaw + side * 1.15, pitch * 0.5 + 0.25, side * 0.4));
        }
      }
    }
  } else if (species === 'snake') {
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * potR * 0.6;
      const h = (top - y0) * (0.55 + rand() * 0.45);
      const g = leaf(h, 0.05 + rand() * 0.025, 'sword', 6, 0.5, 0.06 + rand() * 0.1);
      // Grow upwards: the blade's +Z axis turned to +Y, leaning out a little.
      fit.fixed(i % 3 === 0 ? green(2) : green(i % 2), place(g, Math.cos(a) * r, y0 - 0.01, Math.sin(a) * r, a, -Math.PI / 2 + 0.08 + rand() * 0.18, rand() * Math.PI));
    }
  } else if (species === 'bush') {
    // A dense mound of small leaves on short stems.
    const n = 170;
    const R = S * 0.5;
    for (let i = 0; i < n; i++) {
      const u = rand();
      const a = rand() * Math.PI * 2;
      const el = Math.acos(1 - u) ; // more towards the top
      const len = R * (0.45 + rand() * 0.35);
      const g = leaf(0.055 + rand() * 0.03, 0.04 + rand() * 0.02, 'oval', 3, 0.2, 0.5);
      const pitch = -(Math.PI / 2 - el) * 0.9;
      const r0 = len * 0.5;
      fit.fixed(shade(), place(g, Math.cos(a) * r0 * Math.sin(el), y0 + 0.01 + r0 * Math.cos(el) * 0.9, Math.sin(a) * r0 * Math.sin(el), Math.PI / 2 - a, pitch, (rand() - 0.5) * 0.6));
    }
  } else if (species === 'cactus') {
    // Ribbed columns: a main stem and two arms.
    const rib = (r: number, h: number, x: number, y: number, z: number, tilt = 0): G => {
      const g = new THREE.CylinderGeometry(1, 1, 1, 48, 10, false);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const v = pos.getY(i) + 0.5;
        const ang = Math.atan2(pz, px);
        const round = v > 0.82 ? Math.sqrt(Math.max(0, 1 - ((v - 0.82) / 0.18) ** 2)) : 1;
        const rr = r * (1 + 0.09 * Math.cos(ang * 9)) * Math.max(round, 0.05);
        pos.setXYZ(i, Math.cos(ang) * rr, v * h, Math.sin(ang) * rr);
      }
      g.computeVertexNormals();
      return place(g, x, y, z, 0, 0, tilt);
    };
    const r = potR * 0.42;
    fit.fixed(green(1), rib(r, top - y0 + 0.01, 0, y0 - 0.01, 0));
    fit.fixed(green(1), rib(r * 0.62, (top - y0) * 0.38, potR * 0.62, y0 + (top - y0) * 0.36, 0, -0.12));
    fit.fixed(green(1), tube([[r * 0.6, y0 + (top - y0) * 0.33, 0], [potR * 0.58, y0 + (top - y0) * 0.36, 0], [potR * 0.62, y0 + (top - y0) * 0.42, 0]], r * 0.6, false, 12));
    fit.fixed(green(2), rib(r * 0.55, (top - y0) * 0.3, -potR * 0.55, y0 + (top - y0) * 0.5, 0.02, 0.12));
    fit.fixed(green(2), tube([[-r * 0.6, y0 + (top - y0) * 0.47, 0.02], [-potR * 0.52, y0 + (top - y0) * 0.5, 0.02], [-potR * 0.55, y0 + (top - y0) * 0.56, 0.02]], r * 0.52, false, 12));
    // Pebble top dressing.
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const rr = r + rand() * (potR * 0.85 - r);
      fit.fixed('#d9d3c9', new THREE.IcosahedronGeometry(0.008 + rand() * 0.006, 0).scale(1, 0.6, 1).translate(Math.cos(a) * rr, y0 + 0.003, Math.sin(a) * rr));
    }
  } else {
    // Fir: a cone of needle tufts around a trunk.
    const trunkH = top - y0;
    fit.fixed(BARK, cyl(0.004, 0.009, trunkH * 0.95, 0, y0 - 0.01, 0, 'y', 8));
    const tiers = 14;
    for (let k = 0; k < tiers; k++) {
      const v = 0.12 + (0.86 * k) / tiers;
      const y = y0 + trunkH * v;
      const R = S * 0.5 * (1 - v) ** 0.9 + 0.01;
      const tufts = Math.max(6, Math.round(R * 130));
      for (let i = 0; i < tufts; i++) {
        const a = (i / tufts) * Math.PI * 2 + k * 0.7 + rand() * 0.3;
        for (let j = 0; j < 6; j++) {
          const g = leaf(R * (0.55 + rand() * 0.5), 0.016, 'lance', 1, 0.6, 0.15);
          fit.fixed(green(k % 3 === 2 ? 2 : j % 2), place(g, 0, y + (rand() - 0.5) * 0.01, 0, Math.PI / 2 - a + (rand() - 0.5) * 0.25, 0.25 + (rand() - 0.3) * 0.5, rand() * Math.PI));
        }
      }
    }
    fit.fixed(green(2), place(leaf(0.05, 0.01, 'lance', 2, 0.5, 0), 0, top - 0.05, 0, 0, -Math.PI / 2, 0));
  }
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* -------------------------------------------------------------------- books */

/** A few books upright against a brass bookend, with one lying on top. */
export function buildBooks(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const rand = rng(hash(entry.id));
  const fit = new Fit();
  const covers = ['covers', 'fabric.weave.charcoal', 'fabric.cotton.sage'] as const;
  const emit: Emit = (role, g) => {
    if (role === 'pages') fit.part('pages', g);
    else if (role % 3 === 0) fit.part('covers', g);
    else fit.fixed(covers[role % 3]!, g);
  };
  // Upright books, the last one leaning on a slim bookend, and one lying in front of the bookend.
  const end = bookRow(emit, rand, 0, W * 0.74, 0, D / 2, H, D * 0.95, false);
  fit.part('bookend', join([rbox(0.004, H * 0.55, D * 0.62, 0.001, end + 0.004, 0, -D * 0.1), rbox(0.06, 0.003, D * 0.62, 0.001, end + 0.033, 0, -D * 0.1)]));
  bookStack(emit, rand, 1, end + 0.06 + W * 0.13, 0.003, D * 0.12, W * 0.6, D * 0.5);
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/* ----------------------------------------------------------------- curtains */

/**
 * A pair of floor-length curtains on a rod with brackets, rings and finials.
 * Wall-anchored: the brackets touch the wall at -Z; the hems touch the bottom
 * of the box. Params: `open` (default true: drawn to the sides, gathered),
 * `fullness` (fold density, default 1).
 */
export function buildCurtains(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const open = param(entry, 'open', true);
  const fullness = param(entry, 'fullness', 1);
  const rodR = 0.011;
  const rodY = H - 0.035;
  const fin = 0.028; // finial radius
  const amp = Math.min(0.05, D * 0.3) * (open ? 1 : 0.7); // fold depth at the hem
  const zRod = D / 2 - amp * 1.12;
  // Rod, finials, brackets.
  m.part('rod', cyl(rodR, rodR, W - 2 * fin, 0, rodY, zRod, 'x', 16));
  for (const s of [-1, 1]) {
    m.part('rod', new THREE.SphereGeometry(fin, 18, 12).scale(0.8, 0.8, 0.8).translate(s * (W / 2 - fin * 0.8), rodY, zRod));
    m.part('rod', cyl(fin * 0.45, fin * 0.45, 0.02, s * (W / 2 - fin * 1.6 - 0.01), rodY, zRod, 'x', 12));
    const bx = s * (W / 2 - Math.min(0.14, W * 0.07));
    m.part('rod', rbox(0.05, H - rodY + 0.035, 0.008, 0.002, bx, rodY - 0.035, -D / 2 + 0.004, 1));
    m.part('rod', cyl(0.006, 0.006, zRod + D / 2, bx, rodY - 0.004, (zRod - D / 2) / 2, 'z', 10));
  }
  // Panels: open ones gathered to the sides, flaring a little towards the hem.
  const inner = W - 2 * (fin * 2 + 0.03);
  const pw = open ? inner * 0.27 : inner / 2 + 0.02;
  const ringsY = rodY - rodR - 0.012;
  for (const s of [-1, 1]) {
    const outerX = s * (inner / 2);
    const folds = Math.max(3, Math.round(((pw / 0.11) * fullness) / (open ? 0.75 : 1)));
    const nu = folds * 8;
    const nv = 18;
    const flare = open ? 0.18 : 0.02;
    const top = ringsY - 0.02;
    const sheet = surface(nu, nv, (u, v) => {
      const k = 1 - v; // 0 at the top, 1 at the hem
      const width = pw * (1 + flare * k * k);
      const x = outerX - s * u * width;
      const a = amp * (0.62 + 0.38 * k);
      const wobble = Math.sin(u * 17.3 + s) * 0.004 * k;
      const z = zRod + a * Math.sin(u * folds * Math.PI * 2 - Math.PI / 2 * s) + wobble;
      const y = top * v + (k > 0.98 ? 0 : 0) + Math.sin(u * folds * Math.PI * 2) * 0.004 * k * k;
      return [x, Math.max(0, y), z];
    });
    m.part('fabric', twoSided(sheet));
    // Heading tape and rings.
    const ringN = folds + 1;
    for (let i = 0; i < ringN; i++) {
      const x = outerX - s * (i / folds) * pw;
      m.part('rod', new THREE.TorusGeometry(rodR + 0.006, 0.0025, 6, 14).translate(x, rodY, zRod).rotateY(0));
      m.part('rod', cyl(0.0015, 0.0015, rodY - top - rodR - 0.004, x, top, zRod, 'y', 4));
    }
  }
  return m.build();
}

/* ------------------------------------------------------------- throw pillows */

/** Throw pillows standing in a row, leaning back: two large, an accent and a lumbar in front. */
export function buildPillows(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const fit = new Fit();
  const stand = (slot: string, w: number, h: number, th: number, x: number, z: number, yaw: number, leanBack: number) => {
    // `pillow` lies flat (thickness along y): stand it up, then lean it back.
    const g = pillow(w, th, h, 0, 0, 0);
    g.translate(0, -th / 2, 0).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
    fit.part(slot, place(g, x, 0, z, yaw, -leanBack, 0));
  };
  stand('large', 0.5, 0.5, 0.17, -0.34, -0.04, 0.18, 0.28);
  stand('large', 0.5, 0.5, 0.17, 0.34, -0.04, -0.18, 0.28);
  stand('accent', 0.45, 0.45, 0.15, -0.12, 0.03, 0.08, 0.22);
  stand('lumbar', 0.56, 0.32, 0.13, 0.12, 0.09, -0.06, 0.16);
  fit.into(m, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  return m.build();
}

/** Generators of this family, registered by `premium/index.ts`. Names carry the family prefix. */
export const DECOR_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  decorRug: buildRug,
  decorArt: buildArt,
  decorMirror: buildMirror,
  decorPlant: buildPlant,
  decorBooks: buildBooks,
  decorCurtains: buildCurtains,
  decorPillows: buildPillows,
};
