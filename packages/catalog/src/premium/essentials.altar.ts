/**
 * The Christian prayer unit: a Kerala (Syro-Malabar) style home altar wall. Floor
 * to ceiling teak flutes on both sides of a recessed, backlit ivory niche; a
 * glowing dove of the Holy Spirit at the top; the Sacred Heart of Jesus on the
 * back panel; a floating shelf with St Joseph and the Child, the St Thomas cross
 * and Our Lady of Grace; a small shelf with a rosary over an open Bible on its
 * stand; a low cabinet with handle-less fronts, and pampas grass at both ends.
 *
 * The statues are painted resin: cream robes with gold trim, built from lathe,
 * tube and ellipsoid parts at real proportions so they read from across the room.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { Fit, panel, place, rng, surface, twoSided, type G } from './decor.parts';
import { Model, box, cyl, rbox, type BuildContext } from './kit';
import { taperRod } from './seating.parts';

/* ---------------------------------------------------------------- materials */

/** The fixed materials. The family allows eight meshes: three slots and these five. */
const STATUE = '#efe1c4'; // painted resin, cream; also the Bible's pages and the cream vase
const GOLD = 'metal.brass';
const RED = '#a3171d'; // the Sacred Heart, the red vase, the Bible's cover and ribbon
const SILVER = 'metal.steel'; // the cross and the rosary
const GLOW = '#fff6e6'; // the dove and the LED strips (emissive)
/** Faces, hands and feet: the statues are cream all over, with gold trim. */
const SKIN = STATUE;
/** Hair, beards and painted eyes take the panels' wood (a warm brown): the family's 8-mesh budget has no room for another colour. */
const HAIR = 'wood';
/** Dried pampas: the same warm wood tone reads as the reference's tan plumes. */
const PLUME = 'wood';

/**
 * How the lit parts glow. The niche panel is backlit: most of its look is the
 * light coming through it (a warm cream, tinted by the panel's own finish), so
 * its surface colour is dimmed and the glow carries it. It stays under the walk
 * view's bloom threshold; the dove and the LED strips are well above it.
 */
export interface Glow {
  tint: THREE.Color;
  intensity: number;
  /** Scales the surface colour. */
  surface: number;
}
const PANEL: Glow = { tint: new THREE.Color('#ffd27f'), intensity: 1.1, surface: 0.3 };
const LED: Glow = { tint: new THREE.Color('#fff4e4'), intensity: 1.6, surface: 1 };

const glowCopies = new WeakMap<THREE.Material, THREE.Material>();

/**
 * A glowing copy of a built part's material, shared per source material. The
 * source is the catalog's shared material for that finish: never touch it, or
 * every cream item in the home would glow.
 */
export function glowOf(source: THREE.Material, glow: Glow): THREE.Material {
  let m = glowCopies.get(source);
  if (!m) {
    // A standard material, not a physical clone: the renderer's lite mode swaps physical
    // materials for plain ones without emissive, which would leave a dim, unlit panel.
    const src = source as THREE.MeshStandardMaterial;
    const base = src.color?.clone() ?? new THREE.Color('#ffffff');
    m = new THREE.MeshStandardMaterial({
      name: source.name,
      color: base.clone().multiplyScalar(glow.surface),
      map: src.map ?? null,
      normalMap: src.normalMap ?? null,
      roughnessMap: src.roughnessMap ?? null,
      roughness: src.roughness ?? 0.5,
      metalness: src.metalness ?? 0,
      emissive: base.lerp(new THREE.Color('#ffffff'), 0.3).multiply(glow.tint),
      emissiveIntensity: glow.intensity,
    });
    glowCopies.set(source, m);
  }
  return m;
}

/** Lights the niche's back panel, the dove and the LED strips. They cast no shadow. */
function light(group: THREE.Group): THREE.Group {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (mesh.userData.slot === 'niche') mesh.material = glowOf(mesh.material, PANEL);
    else if (!mesh.userData.slot && mesh.material.name === GLOW) mesh.material = glowOf(mesh.material, LED);
    else return;
    mesh.castShadow = false;
  });
  return group;
}

/* ------------------------------------------------------------------ helpers */

type V3 = [number, number, number];

/** An ellipsoid centred on (x, y, z), turned by yaw/pitch/roll. */
function ell(rx: number, ry: number, rz: number, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, ws = 12, hs = 8): G {
  return place(new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz), x, y, z, yaw, pitch, roll);
}

/**
 * A solid of revolution about the y axis, its depth squashed by `sz`. With
 * `gap` (radians) it is open at the front (+Z), like a mantle: two-sided then.
 * `folds` ripples the surface below `foldTop` into that many vertical folds,
 * deepening towards the hem (`foldDepth` is a fraction of the radius).
 */
function rev(profile: [number, number][], segs: number, sz = 1, gap = 0, folds = 0, foldTop = 0, foldDepth = 0.06): G {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  // A closed solid has its seam at the back, out of sight.
  const g = gap > 0 ? new THREE.LatheGeometry(pts, segs, gap / 2, Math.PI * 2 - gap) : new THREE.LatheGeometry(pts, segs, Math.PI);
  if (folds > 0) {
    const pos = g.getAttribute('position');
    const y0 = profile[0]![1];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= foldTop) continue;
      const depth = foldDepth * ((foldTop - y) / Math.max(foldTop - y0, 1e-6)) ** 0.8;
      let phi = Math.atan2(pos.getX(i), pos.getZ(i));
      if (phi < 0) phi += Math.PI * 2;
      // An open shell's folds die out at its two edges, so the gold trim follows them.
      const arg = gap > 0 ? (Math.PI * folds * (phi - gap / 2)) / (Math.PI * 2 - gap) : phi * folds;
      const f = 1 + depth * Math.sin(arg);
      pos.setX(i, pos.getX(i) * f);
      pos.setZ(i, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
  }
  g.scale(1, 1, sz);
  return gap > 0 ? twoSided(g) : g;
}

/** Where a point on an open-front `rev` profile lies, at the opening's edge on side `s` (-1 left, +1 right). */
function edgeAt(r: number, y: number, gap: number, sz: number, s: number): V3 {
  return [s * Math.sin(gap / 2) * r, y, Math.cos(gap / 2) * r * sz];
}

/** A thin round cord through the points: cheaper than the kit's `tube` (a few segments per point). */
function cord(points: V3[], radius: number, radial = 4, per = 3): G {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(4, (points.length - 1) * per), radius, radial, false);
}

/** A flat shape (XY) extruded `depth` towards +Z from z = 0. */
function flat(shape: THREE.Shape, depth: number, curveSegments = 6): G {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
}

/** A pointed oval (a feather, a leaf, a petal) `len` long and `w` wide, from the origin along +Y. */
function lens(len: number, w: number, bias = 0.5): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w, len * bias, 0, len);
  s.quadraticCurveTo(-w, len * bias, 0, 0);
  return s;
}

/** Hands a set of parts built about the origin to the model, moved to (x, y, z). */
function put(m: Model, f: Fit, x: number, y: number, z: number): void {
  f.transform(new THREE.Matrix4().makeTranslation(x, y, z)).into(m, [0, 0, 0], [0, 0, 0], '');
}

/* ------------------------------------------------------------------ statues */

/**
 * The robed body every statue shares, feet at the origin, facing +Z, `h` from
 * the soles to the top of the head: a robe to the feet with a gold belt and hem,
 * neck and head. Returns where the head is.
 */
function robedBody(f: Fit, h: number, opts: { feet?: boolean; slim?: number } = {}): { head: V3; rh: number; front: (y: number) => number } {
  const k = opts.slim ?? 1;
  const SZ = 0.74;
  const robe: [number, number][] = [
    [0, 0.03],
    [0.108, 0.03],
    [0.108, 0.05],
    [0.098, 0.15],
    [0.088, 0.3],
    [0.08, 0.45],
    [0.074, 0.56],
    [0.082, 0.65],
    [0.096, 0.74],
    [0.1, 0.79],
    [0.082, 0.83],
    [0.04, 0.855],
    [0, 0.86],
  ];
  const at = (y: number) => {
    for (let i = 1; i < robe.length; i++) {
      const [r1, y1] = robe[i]!;
      const [r0, y0] = robe[i - 1]!;
      if (y / h <= y1) return (r0 + ((r1 - r0) * (y / h - y0)) / Math.max(y1 - y0, 1e-6)) * k * h;
    }
    return 0;
  };
  // The robe falls in soft folds from the belt.
  f.fixed(STATUE, rev(robe.map(([r, y]) => [r * k * h, y * h]), 27, SZ, 0, 9, 0.56 * h, 0.07));
  // A gold belt.
  f.fixed(GOLD, new THREE.TorusGeometry(0.075 * k * h, 0.006 * h, 4, 22).rotateX(Math.PI / 2).scale(1, 1, SZ).translate(0, 0.56 * h, 0));
  // Neck and head.
  const rh = 0.062 * h;
  const head: V3 = [0, h - rh * 1.04, 0.006 * h];
  f.fixed(SKIN, cyl(0.026 * h, 0.03 * h, 0.06 * h, 0, 0.83 * h, 0, 'y', 10));
  f.fixed(SKIN, ell(rh * 0.86, rh * 1.04, rh * 0.92, ...head, 0, 0, 0, 14, 10));
  // Painted eyes, small.
  for (const s of [-1, 1]) f.part(HAIR, ell(rh * 0.11, rh * 0.07, rh * 0.05, head[0] + s * rh * 0.33, head[1] + rh * 0.08, head[2] + rh * 0.85, 0, 0, 0, 6, 4));
  // Bare feet showing below the hem.
  if (opts.feet) for (const s of [-1, 1]) f.fixed(SKIN, ell(0.026 * h, 0.018 * h, 0.05 * h, s * 0.035 * h, 0.018 * h, 0.04 * h, s * 0.12, 0, 0, 8, 6));
  return { head, rh, front: (y: number) => at(y) * SZ };
}

/** Shoulder-length hair (and a beard) on a head of radius `rh` at `c`. */
function hair(f: Fit, c: V3, rh: number, beard: number, long = 1): void {
  const shell: [number, number][] = [
    [0.72 * rh, -1.75 * rh * long],
    [0.96 * rh, -1.05 * rh * long],
    [1.06 * rh, -0.25 * rh],
    [1.04 * rh, 0.35 * rh],
    [0.82 * rh, 0.82 * rh],
    [0.42 * rh, 1.06 * rh],
    [0, 1.12 * rh],
  ];
  f.part(HAIR, rev(shell, 16, 0.95, 2.3).translate(c[0], c[1], c[2] - 0.08 * rh));
  if (beard > 0) {
    // A short beard along the jaw and chin, and a moustache.
    f.part(HAIR, ell(0.56 * rh, 0.4 * rh * beard, 0.36 * rh, c[0], c[1] - 0.74 * rh, c[2] + 0.5 * rh, 0, 0.4, 0, 10, 6));
    f.part(HAIR, ell(0.3 * rh, 0.06 * rh, 0.1 * rh, c[0], c[1] - 0.36 * rh, c[2] + 0.86 * rh, 0, 0, 0, 8, 4));
  }
}

/** An arm in a bell sleeve: shoulder, elbow, wrist; the hand carries on `hand` further along `dir`. */
function arm(f: Fit, h: number, sh: V3, el: V3, wr: V3, handDir: V3, palmYaw = 0, thick = 1): void {
  const t = thick * h;
  f.fixed(STATUE, taperRod(sh, el, 0.034 * t, 0.03 * t, 10));
  f.fixed(STATUE, new THREE.SphereGeometry(0.03 * t, 10, 6).translate(...el));
  f.fixed(STATUE, taperRod(el, wr, 0.03 * t, 0.044 * t, 10));
  const d = new THREE.Vector3(...handDir).normalize();
  const c = new THREE.Vector3(...wr).addScaledVector(d, 0.04 * h);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  f.fixed(SKIN, ell(0.022 * h, 0.044 * h, 0.012 * h, c.x, c.y, c.z, e.y + palmYaw, e.x, e.z, 8, 6));
}

/** A mantle: an open-front shell from the shoulders (or over the head) to the hem, edged in gold. */
function mantle(f: Fit, h: number, profile: [number, number][], gap: number, sz: number): void {
  const p = profile.map(([r, y]) => [r * h, y * h] as [number, number]);
  f.fixed(STATUE, rev(p, 26, sz, gap, 11, 0.74 * h, 0.07));
  for (const s of [-1, 1]) {
    const pts = p.filter(([r]) => r > 0.02 * h).map(([r, y]) => edgeAt(r + 0.002 * h, y, gap, sz, s));
    f.fixed(GOLD, cord(pts, 0.0045 * h, 4));
  }
  const [r0, y0] = p[0]!;
  const hem: V3[] = [];
  for (let i = 0; i <= 33; i++) {
    const a = gap / 2 + ((Math.PI * 2 - gap) * i) / 33;
    // Following the folds at the hem (see `rev`).
    const r = r0 * (1 + 0.07 * Math.sin((Math.PI * 11 * i) / 33)) + 0.002 * h;
    hem.push([Math.sin(a) * r, y0 + 0.004 * h, Math.cos(a) * r * sz]);
  }
  f.fixed(GOLD, cord(hem, 0.0045 * h, 4));
}

/** Our Lady of Grace: veiled, her hands lowered and open, on a domed base. `H` overall. */
function mary(H: number): Fit {
  const f = new Fit();
  const bh = 0.08 * H;
  const h = H - bh;
  robedBody(f, h, { slim: 0.94 });
  mantle(
    f,
    h,
    [
      [0.118, 0.035],
      [0.112, 0.14],
      [0.098, 0.32],
      [0.09, 0.5],
      [0.096, 0.66],
      [0.11, 0.76],
      [0.108, 0.8],
      [0.084, 0.845],
      [0.07, 0.885],
      [0.072, 0.93],
      [0.062, 0.975],
      [0.034, 1.005],
      [0, 1.012],
    ],
    1.45,
    0.86,
  );
  for (const s of [-1, 1]) arm(f, h, [s * 0.085 * h, 0.78 * h, 0], [s * 0.12 * h, 0.6 * h, 0.04 * h], [s * 0.155 * h, 0.47 * h, 0.085 * h], [s * 0.35, -1, 0.3], 0, 0.9);
  // Stand her on a domed base with a gold rim.
  f.transform(new THREE.Matrix4().makeTranslation(0, bh, 0));
  f.fixed(STATUE, rev([[0, 0], [0.13 * h, 0], [0.13 * h, 0.022 * h], [0.115 * h, 0.05 * h], [0.07 * h, bh * 0.92], [0, bh]], 24));
  f.fixed(GOLD, new THREE.TorusGeometry(0.13 * h, 0.005 * h, 4, 24).rotateX(Math.PI / 2).translate(0, 0.022 * h, 0));
  return f;
}

/** St Joseph holding the Child on his left arm, lilies in his right hand, on a square base. `H` overall. */
function joseph(H: number): Fit {
  const b = new Fit();
  const bh = 0.07 * H;
  const h = H - bh;
  const { head, rh } = robedBody(b, h);
  hair(b, head, rh, 1.25, 0.75);
  mantle(
    b,
    h,
    [
      [0.114, 0.08],
      [0.106, 0.2],
      [0.094, 0.4],
      [0.088, 0.56],
      [0.098, 0.68],
      [0.112, 0.77],
      [0.104, 0.81],
      [0.07, 0.84],
      [0.045, 0.85],
    ],
    1.9,
    0.86,
  );
  // Left arm (on his left, +X) cradling the Child.
  arm(b, h, [0.09 * h, 0.78 * h, 0], [0.14 * h, 0.6 * h, 0.04 * h], [0.06 * h, 0.6 * h, 0.12 * h], [-1, 0.1, 0.2], 0.6);
  // The Child, seated on the arm, his head beside Joseph's.
  const cx = 0.1 * h;
  const cz = 0.075 * h;
  const cy = 0.6 * h;
  b.fixed(STATUE, rev([[0, 0], [0.05 * h, 0], [0.056 * h, 0.05 * h], [0.046 * h, 0.12 * h], [0.036 * h, 0.17 * h], [0.016 * h, 0.195 * h], [0, 0.2 * h]], 14, 0.85).translate(cx, cy, cz));
  const ch: V3 = [cx + 0.005 * h, cy + 0.235 * h, cz + 0.005 * h];
  b.fixed(SKIN, ell(0.04 * h, 0.044 * h, 0.04 * h, ...ch, 0, 0, 0, 12, 8));
  b.part(HAIR, rev([[0.03 * h, -0.005 * h], [0.042 * h, 0.012 * h], [0.036 * h, 0.03 * h], [0.018 * h, 0.044 * h], [0, 0.047 * h]], 12, 1, 2.6).translate(ch[0], ch[1], ch[2] - 0.004 * h));
  // The Child's right hand raised in blessing.
  b.fixed(STATUE, taperRod([cx - 0.03 * h, cy + 0.16 * h, cz + 0.02 * h], [cx - 0.05 * h, cy + 0.2 * h, cz + 0.05 * h], 0.014 * h, 0.016 * h, 8));
  b.fixed(SKIN, ell(0.011 * h, 0.018 * h, 0.007 * h, cx - 0.056 * h, cy + 0.225 * h, cz + 0.055 * h, 0, 0, 0.3, 6, 5));
  // Right arm, bent, holding the lily stem.
  const hand: V3 = [-0.075 * h, 0.55 * h, 0.1 * h];
  arm(b, h, [-0.09 * h, 0.78 * h, 0], [-0.14 * h, 0.6 * h, 0.03 * h], [hand[0], hand[1] - 0.03 * h, hand[2] - 0.02 * h], [0.6, 0.3, 0.4], 0.4);
  const top: V3 = [-0.12 * h, 0.93 * h, 0.07 * h];
  b.fixed(GOLD, cord([[hand[0] + 0.01 * h, 0.4 * h, hand[2] + 0.02 * h], hand, [-0.1 * h, 0.75 * h, 0.09 * h], top], 0.004 * h, 4));
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.7;
    const at: V3 = [top[0] + Math.sin(a) * 0.03 * h, top[1] - 0.02 * h + Math.cos(a) * 0.02 * h - (i === 1 ? 0 : 0.03 * h), top[2] + 0.01 * h];
    b.fixed(STATUE, place(new THREE.ConeGeometry(0.018 * h, 0.05 * h, 7, 1, true).rotateX(Math.PI), ...at, 0, 0, a));
  }
  // Stand him on a square base with a gold band.
  b.transform(new THREE.Matrix4().makeTranslation(0, bh, 0));
  b.fixed(STATUE, rbox(0.25 * h, bh, 0.19 * h, 0.006 * h, 0, 0, 0, 1));
  b.fixed(GOLD, box(0.252 * h, 0.008 * h, 0.192 * h, 0, bh * 0.62, 0));
  return b;
}

/** The Sacred Heart of Jesus: arms raised outward, the mantle falling from them, a red heart on the chest. `h` overall (feet to raised hands). */
function sacredHeart(H: number): Fit {
  const f = new Fit();
  const h = H / 1.02;
  const { head, rh, front } = robedBody(f, h, { feet: true });
  hair(f, head, rh, 1, 1.05);
  // Arms raised outward, palms forward.
  for (const s of [-1, 1]) arm(f, h, [s * 0.09 * h, 0.79 * h, 0], [s * 0.2 * h, 0.72 * h, 0.03 * h], [s * 0.26 * h, 0.9 * h, 0.05 * h], [s * 0.15, 1, 0.1], 0, 0.85);
  // The mantle: over the shoulders and along the forearms, falling behind him to below
  // the feet; its sides hang from the forearms, drawn in at the knees and wrapping forward.
  const topPath = new THREE.CatmullRomCurve3(
    [
      [-0.235, 0.8, 0.045],
      [-0.2, 0.715, 0.02],
      [-0.1, 0.8, -0.04],
      [0, 0.83, -0.065],
      [0.1, 0.8, -0.04],
      [0.2, 0.715, 0.02],
      [0.235, 0.8, 0.045],
    ].map(([x, y, z]) => new THREE.Vector3(x! * h, y! * h, z! * h)),
  );
  const sheet = (u: number, v: number): V3 => {
    const t = topPath.getPoint(u);
    const side = 2 * u - 1;
    const edge = Math.abs(side) ** 3; // 1 at the sides
    const bx = side * 0.22 * h;
    const by = -0.025 * h + 0.012 * h * Math.sin(u * Math.PI * 7);
    const bz = (-0.11 + 0.11 * edge) * h;
    // Drawn in a little at the knees, then flaring to the hem.
    const x = t.x + (bx - t.x) * v - side * 0.035 * h * Math.sin(Math.PI * v) * edge;
    const y = t.y + (by - t.y) * v;
    // Bowed out behind the body, with folds that deepen towards the hem.
    const z = t.z + (bz - t.z) * v - 0.025 * h * Math.sin(Math.PI * v) * (1 - edge) + 0.016 * h * Math.sin(u * Math.PI * 11) * v ** 0.7;
    return [x, y, z];
  };
  f.fixed(STATUE, twoSided(surface(30, 14, sheet)));
  // Gold edges down both sides and along the hem.
  for (const u of [0, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) pts.push(sheet(u, i / 8));
    f.fixed(GOLD, cord(pts, 0.005 * h, 4));
  }
  const hemPts: V3[] = [];
  for (let i = 0; i <= 28; i++) hemPts.push(sheet(i / 28, 1));
  f.fixed(GOLD, cord(hemPts, 0.005 * h, 4));
  // The Sacred Heart: red, with a gold flame and a ring of thorns.
  const hy = 0.69 * h;
  const hz = front(hy) + 0.002 * h;
  const heart = new THREE.Shape();
  const w = 0.04 * h;
  heart.moveTo(0, -w * 1.05);
  heart.bezierCurveTo(-w * 0.3, -w * 0.6, -w * 1.05, -w * 0.15, -w * 0.9, w * 0.35);
  heart.bezierCurveTo(-w * 0.75, w * 0.8, -w * 0.15, w * 0.85, 0, w * 0.4);
  heart.bezierCurveTo(w * 0.15, w * 0.85, w * 0.75, w * 0.8, w * 0.9, w * 0.35);
  heart.bezierCurveTo(w * 1.05, -w * 0.15, w * 0.3, -w * 0.6, 0, -w * 1.05);
  f.fixed(RED, flat(heart, 0.012 * h, 5).translate(0, hy, hz));
  f.fixed(GOLD, new THREE.TorusGeometry(w * 0.55, 0.004 * h, 4, 14).scale(1.3, 0.75, 1).translate(0, hy + w * 0.05, hz + 0.013 * h));
  f.fixed(GOLD, new THREE.ConeGeometry(0.012 * h, 0.04 * h, 6).translate(0, hy + w * 0.6 + 0.02 * h, hz + 0.004 * h));
  f.transform(new THREE.Matrix4().makeScale(1, 1, 0.85));
  return f;
}

/* ----------------------------------------------------------- dove and cross */

/** The dove of the Holy Spirit with an olive branch: a flat cut-out, `w` wide, facing right, wings raised. Centred on the origin. */
function dove(w: number): G[] {
  const parts: G[] = [];
  const T = 0.006;
  const s = w / 1.0; // drawn 1.0 wide
  const add = (shape: THREE.Shape, x: number, y: number, rot: number) => parts.push(flat(shape, T / s, 5).scale(s, s, s).rotateZ(rot).translate(x * s, y * s, 0));
  // Body: a long teardrop from the tail (left) to the breast (right).
  const body = new THREE.Shape();
  body.moveTo(-0.22 * s, -0.12 * s);
  body.bezierCurveTo(-0.05 * s, -0.2 * s, 0.14 * s, -0.16 * s, 0.2 * s, -0.04 * s);
  body.bezierCurveTo(0.24 * s, 0.04 * s, 0.2 * s, 0.1 * s, 0.13 * s, 0.08 * s);
  body.bezierCurveTo(0.02 * s, 0.04 * s, -0.12 * s, -0.04 * s, -0.22 * s, -0.12 * s);
  parts.push(flat(body, T, 6));
  // Head and beak.
  const headS = new THREE.Shape().absarc(0.22 * s, 0.1 * s, 0.065 * s, 0, Math.PI * 2, false);
  parts.push(flat(headS, T, 6));
  const beak = new THREE.Shape();
  beak.moveTo(0.27 * s, 0.13 * s);
  beak.lineTo(0.35 * s, 0.09 * s);
  beak.lineTo(0.27 * s, 0.07 * s);
  parts.push(flat(beak, T));
  // Wings: two fans of long feathers raised up and back.
  for (const [ox, oy, a0, len] of [
    [0.02, 0.02, 0.15, 0.42],
    [-0.04, 0.0, 0.55, 0.36],
  ] as const) {
    for (let i = 0; i < 5; i++) add(lens(len * (1 - i * 0.1), 0.05 + 0.01 * (i === 0 ? 1 : 0)), ox - i * 0.035, oy + i * 0.01, a0 + i * 0.22);
  }
  // Tail feathers, fanned down and left.
  for (let i = 0; i < 3; i++) add(lens(0.22 - i * 0.03, 0.045), -0.18, -0.1, 1.9 + i * 0.32);
  // Olive branch from the beak: a twig with leaves.
  const twig: V3[] = [
    [0.33 * s, 0.1 * s, T / 2],
    [0.42 * s, 0.15 * s, T / 2],
    [0.5 * s, 0.22 * s, T / 2],
  ];
  parts.push(cord(twig, 0.006 * s, 4));
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.17;
    const x = 0.33 + 0.17 * t;
    const y = 0.1 + 0.12 * t;
    add(lens(0.075, 0.022), x, y, i % 2 ? -0.5 : 0.9 - 0.3 * i);
  }
  return parts;
}

/** The St Thomas (Mar Thoma) cross on its stepped base, `h` tall, centred on x = 0, underside at y = 0. */
function stThomasCross(f: Fit, h: number): void {
  const u = h / 0.2;
  // A dark wooden plinth, a silver stepped base with two curling leaves.
  f.part('wood', rbox(0.075 * u, 0.012 * u, 0.045 * u, 0.002 * u, 0, 0, 0, 1));
  f.fixed(SILVER, rbox(0.06 * u, 0.008 * u, 0.036 * u, 0.002 * u, 0, 0.012 * u, 0, 1));
  f.fixed(SILVER, rbox(0.044 * u, 0.008 * u, 0.028 * u, 0.002 * u, 0, 0.02 * u, 0, 1));
  f.fixed(SILVER, rbox(0.028 * u, 0.01 * u, 0.02 * u, 0.002 * u, 0, 0.028 * u, 0, 1));
  for (const s of [-1, 1])
    f.fixed(
      SILVER,
      cord(
        [
          [0, 0.04 * u, 0],
          [s * 0.02 * u, 0.045 * u, 0],
          [s * 0.032 * u, 0.06 * u, 0],
          [s * 0.026 * u, 0.072 * u, 0],
          [s * 0.016 * u, 0.066 * u, 0],
        ],
        0.0028 * u,
        5,
      ),
    );
  // The cross: bars ending in three buds each.
  const bw = 0.011 * u;
  const t = 0.007 * u;
  const cy = 0.14 * u; // where the arms cross
  const y0 = 0.038 * u;
  const top = 0.19 * u;
  const arm = 0.04 * u;
  f.fixed(SILVER, box(bw, top - y0 - 0.012 * u, t, 0, y0, 0));
  f.fixed(SILVER, box(2 * arm - 0.024 * u, bw, t, 0, cy - bw / 2, 0));
  const buds = (x: number, y: number, dx: number, dy: number) => {
    const r = 0.0068 * u;
    const px = -dy;
    const py = dx;
    for (const [a, b] of [
      [1.0, 0],
      [0.35, 1],
      [0.35, -1],
    ] as const) {
      f.fixed(SILVER, cyl(r, r, t * 1.2, x + dx * a * r * 1.4 + px * b * r * 1.1, y + dy * a * r * 1.4 + py * b * r * 1.1, 0, 'z', 10));
    }
  };
  buds(0, top - 0.012 * u, 0, 1);
  buds(-arm + 0.012 * u, cy, -1, 0);
  buds(arm - 0.012 * u, cy, 1, 0);
  // A small silver ring where the arms cross.
  f.fixed(SILVER, new THREE.TorusGeometry(0.009 * u, 0.0018 * u, 4, 16).translate(0, cy, t / 2 + 0.001 * u));
}

/* -------------------------------------------------------------- rosary, Bible */

/** A chain of beads along a curve: a bead every `pitch`, every eleventh a larger one. */
function beads(f: Fit, curve: THREE.Curve<THREE.Vector3>, pitch: number, r: number): void {
  const n = Math.max(2, Math.round(curve.getLength() / pitch));
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    f.fixed(SILVER, new THREE.IcosahedronGeometry(i % 11 === 0 ? r * 1.5 : r, 0).translate(p.x, p.y, p.z));
  }
}

/**
 * An open Bible on a wooden X-stand (rehal) standing on y, centred on (x, z),
 * `w` wide. Seen from the front the two boards cross in an X; the book lies open
 * in the upper V, a half on each board, its red ribbon falling over the front.
 */
function bibleOnStand(m: Model, w: number, x: number, y: number, z: number): void {
  const a = 1.0; // each board's lean from the vertical, radians
  const L = w * 0.78; // board length
  const lower = L * 0.42; // below the crossing: the legs
  const bd = w * 0.5; // board depth (along z)
  const t = 0.01;
  const cy = y + lower * Math.cos(a);
  for (const s of [-1, 1]) {
    m.part('wood', rbox(t, L, bd, 0.003, 0, -lower, 0, 1).rotateZ(s * a).translate(x, cy, z));
  }
  // The open book: each half lies on its board's inner face, from the spine in the V.
  const pageT = 0.014;
  const half = w * 0.5; // page width, along the board
  const depth = w * 0.72; // page height, along z
  for (const s of [-1, 1]) {
    const ang = s * a;
    const up = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0); // along the board, upwards
    const n = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(s); // its inner face's normal
    const base = new THREE.Vector3(x, cy, z).addScaledVector(up, t * 0.6);
    const cover = rbox(0.004, half + 0.006, depth + 0.008, 0.0015, 0, -(half + 0.006) / 2, 0, 1)
      .rotateZ(ang)
      .translate(...base.clone().addScaledVector(n, t / 2 + 0.002).addScaledVector(up, half / 2).toArray());
    // The pages: thickest at the spine, curling down to the fore-edge.
    const pages = rbox(pageT, half, depth, 0.005, 0, -half / 2, 0, 2)
      .rotateZ(ang)
      .translate(...base.clone().addScaledVector(n, t / 2 + 0.004 + pageT / 2).addScaledVector(up, half / 2).toArray());
    m.fixed(RED, cover);
    m.fixed(STATUE, pages);
  }
  // A red ribbon from the spine, over the front edge.
  const sy = cy + t + 0.02;
  m.fixed(
    RED,
    cord(
      [
        [x, sy, z],
        [x + 0.004, sy + 0.004, z + depth * 0.3],
        [x + 0.008, sy, z + depth / 2 + 0.004],
        [x + 0.01, sy - 0.05, z + depth / 2 + 0.008],
      ],
      0.0022,
      4,
    ),
  );
}

/* ---------------------------------------------------------------- pampas */

/** A vase of pampas grass: the vase given, and a fan of fluffy plumes that stays inside `maxX` either side of x. */
function pampas(m: Model, vase: G, vaseMat: string, vaseH: number, x: number, y: number, z: number, outward: number, reachX: number, seed: number): void {
  m.fixed(vaseMat, vase.translate(x, y, z));
  const r = rng(seed);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    // Fan from leaning inward a little to leaning outward, more upright at the middle.
    const lean = (-0.25 + 0.75 * f) * outward + (r() - 0.5) * 0.12;
    const lz = (r() - 0.5) * 0.5;
    const stem = 0.18 + r() * 0.08;
    const plume = 0.2 + r() * 0.07;
    const dir = new THREE.Vector3(Math.sin(lean), Math.cos(lean) * Math.cos(lz), Math.sin(lz) * 0.6).normalize();
    // Keep the plume inside the unit's width.
    const room = Math.abs(dir.x) > 1e-3 ? (reachX - Math.abs(x)) / Math.abs(dir.x) : Infinity;
    const scale = Math.min(1, room / (stem + plume));
    const base = new THREE.Vector3(x, y + vaseH - 0.01, z);
    const tip = base.clone().addScaledVector(dir, stem * scale);
    m.part(PLUME, taperRod(base.toArray() as V3, tip.toArray() as V3, 0.002, 0.0015, 4));
    const prof: [number, number][] = [
      [0, 0],
      [0.012, 0.025],
      [0.024, 0.08],
      [0.027, 0.13],
      [0.019, 0.18],
      [0.008, 0.21],
      [0, 0.22],
    ].map(([rr, yy]) => [rr! * scale * (0.9 + r() * 0.3), (yy! * plume * scale) / 0.22]);
    const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 9);
    // Feathery: jitter the surface.
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const j = 1 + (r() - 0.5) * 0.8;
      pos.setX(k, pos.getX(k) * j);
      pos.setZ(k, pos.getZ(k) * j);
    }
    g.computeVertexNormals();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    m.part(PLUME, g.translate(tip.x, tip.y, tip.z));
  }
}

/* -------------------------------------------------------------- the flutes */

/**
 * A fluted face `w` wide and `h` tall: slats `slat` wide with rounded fronts,
 * `gap` apart, standing `depth` proud of a thin backing. One extrusion, so a
 * whole panel costs a few hundred triangles. Centred on x = 0, from y = 0, its
 * back at z = 0 and its front at z = depth.
 */
export function flutes(w: number, h: number, depth: number, slat: number, gap: number): G {
  const n = Math.max(3, Math.round((w + gap) / (slat + gap)));
  const pitch = (w - slat) / (n - 1);
  const r = Math.min(slat / 2 - 1e-4, depth * 0.45, slat * 0.32);
  const back = 0.004;
  // Drawn in (x, -z): the extrusion along +Z becomes the height after the turn.
  const s = new THREE.Shape();
  s.moveTo(-w / 2, back);
  for (let i = 0; i < n; i++) {
    const xl = -w / 2 + i * pitch;
    const xr = xl + slat;
    s.lineTo(xl, 0);
    s.lineTo(xl, -(depth - r));
    s.absarc(xl + r, -(depth - r), r, Math.PI, Math.PI * 1.5, false);
    s.lineTo(xr - r, -depth);
    s.absarc(xr - r, -(depth - r), r, Math.PI * 1.5, Math.PI * 2, false);
    s.lineTo(xr, 0);
  }
  s.lineTo(w / 2, back);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 3 });
  return g.rotateX(-Math.PI / 2);
}

/* -------------------------------------------------------------- the altar */

/**
 * Christian prayer unit (altar wall), front +Z, back against the wall at -Z.
 * The cabinet takes the full depth; the wall above it is shallow.
 */
export function buildAltar(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;

  /* Base cabinet: a recessed plinth, handle-less doors with a finger-pull recess under the wood top. */
  const topT = 0.032;
  const cabH = Math.min(0.55, H * 0.23);
  const plinth = 0.08;
  const groove = 0.032;
  const carcassD = D - 0.025;
  const cz = back + carcassD / 2;
  m.part('fronts', panel(W - 0.02, plinth, carcassD - 0.06, 0, 0, cz - 0.03, 0.001));
  m.part('fronts', panel(W, cabH - topT - plinth, carcassD - 0.02, 0, plinth, cz - 0.01, 0.002));
  const doors = Math.max(2, Math.round(W / 0.5));
  const gap = 0.003;
  const dw = (W - (doors + 1) * gap) / doors;
  const doorH = cabH - topT - groove - plinth - 2 * gap;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + gap + dw / 2 + i * (dw + gap);
    m.part('fronts', rbox(dw, doorH, 0.018, 0.0025, x, plinth + gap, back + carcassD + 0.005, 1));
  }
  m.part('wood', rbox(W, topT, D, 0.004, 0, cabH - topT, 0, 2));

  /* The wall: a fluted panel each side of a recessed niche. */
  const y0 = cabH;
  const wallH = H - y0;
  const NW = W * 0.55;
  const SW = (W - NW) / 2;
  const boxD = 0.075; // the panels' body: its inner side is the niche's jamb
  const slatD = 0.03;
  const nicheZ = back + 0.02; // back of the niche panel
  const nicheT = 0.015;
  const nicheFace = nicheZ + nicheT;
  m.part('wood', box(W, wallH, 0.01, 0, y0, back + 0.005));
  m.part('niche', box(NW + 0.02, wallH, nicheT, 0, y0, nicheZ + nicheT / 2));
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 - SW / 2);
    m.part('wood', box(SW, wallH, boxD, cx, y0, back + boxD / 2));
    m.part('wood', flutes(SW, wallH, slatD, 0.03, 0.014).translate(cx, y0, back + boxD));
    // LED strip down the niche's edge, on the back panel.
    m.fixed(GLOW, box(0.008, wallH - 0.02, 0.004, s * (NW / 2 - 0.012), y0 + 0.01, nicheFace + 0.002));
  }
  // And across the top.
  m.fixed(GLOW, box(NW - 0.03, 0.008, 0.004, 0, H - 0.02, nicheFace + 0.002));

  /* Shelves: the statues' shelf with an LED strip under its front, and a small one lower down for the rosary. */
  const k = Math.min(NW / 0.825, wallH / 1.85); // the statues' scale: sized for a 1500 x 2400 unit
  const shelfY = y0 + wallH * 0.3;
  const shelfT = 0.045;
  const shelfD = Math.min(0.24, D * 0.55);
  const shelfTop = shelfY + shelfT;
  m.part('wood', rbox(NW + 0.03, shelfT, shelfD, 0.004, 0, shelfY, nicheFace + shelfD / 2, 2));
  m.fixed(GLOW, box(NW - 0.06, 0.004, 0.01, 0, shelfY - 0.004, nicheFace + shelfD - 0.03));
  const lowY = y0 + wallH * 0.145;
  const lowT = 0.035;
  const lowW = Math.min(0.5, NW * 0.62);
  const lowD = Math.min(0.15, D * 0.34);
  m.part('wood', rbox(lowW, lowT, lowD, 0.004, 0, lowY, nicheFace + lowD / 2, 2));

  /* The statues on the shelf: St Joseph and the Child (left), the cross, Our Lady (right). */
  const sz = nicheFace + shelfD * 0.48;
  put(m, joseph(0.4 * k), -NW * 0.33, shelfTop, sz);
  put(m, mary(0.4 * k), NW * 0.33, shelfTop, sz);
  const cross = new Fit();
  stThomasCross(cross, 0.19 * k);
  put(m, cross, 0, shelfTop, sz);

  /* The Sacred Heart, on the back panel above the shelf, floating clear of it. */
  const jH = 0.6 * k;
  const jesus = sacredHeart(jH);
  const jb = jesus.bounds();
  const feet = shelfTop + 0.21 * k;
  put(m, jesus, 0, feet, nicheFace - jb.min.z + 0.004);

  /* The dove at the top, a backlit cut-out on the panel. */
  const dw0 = Math.min(0.42 * k, NW * 0.55);
  const dy = Math.min(H - 0.2 * k, feet + jH + 0.24 * k);
  for (const g of dove(dw0)) m.fixed(GLOW, g.translate(0.02 * k, dy, nicheFace + 0.004));

  /* Rosary over the small shelf, its loop hanging down towards the Bible. */
  const rz = nicheFace + lowD - 0.012;
  const ry = lowY + lowT + 0.004;
  const ends = lowW / 2 - 0.03;
  const rosary = new Fit();
  beads(rosary, new THREE.LineCurve3(new THREE.Vector3(-ends, ry, rz), new THREE.Vector3(ends, ry, rz)), 0.013, 0.0042);
  const drop = Math.min(0.11 * k, (lowY - y0) * 0.45);
  const loop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-ends, ry, rz),
    new THREE.Vector3(-ends - 0.01, lowY - 0.005, nicheFace + lowD + 0.008),
    new THREE.Vector3(-ends * 0.55, lowY - drop * 0.7, nicheFace + lowD + 0.012),
    new THREE.Vector3(0, lowY - drop, nicheFace + lowD + 0.014),
    new THREE.Vector3(ends * 0.55, lowY - drop * 0.7, nicheFace + lowD + 0.012),
    new THREE.Vector3(ends + 0.01, lowY - 0.005, nicheFace + lowD + 0.008),
    new THREE.Vector3(ends, ry, rz),
  ]);
  beads(rosary, loop, 0.013, 0.0042);
  // The pendant: a short tail and a small crucifix.
  const py = lowY - drop;
  const pz = nicheFace + lowD + 0.014;
  beads(rosary, new THREE.LineCurve3(new THREE.Vector3(0, py, pz), new THREE.Vector3(0, py - 0.035, pz)), 0.012, 0.0042);
  rosary.fixed(SILVER, box(0.004, 0.034, 0.003, 0, py - 0.075, pz));
  rosary.fixed(SILVER, box(0.022, 0.004, 0.003, 0, py - 0.052, pz));
  rosary.into(m, [0, 0, 0], [0, 0, 0], '');

  /* The open Bible on its stand, on the cabinet top below the small shelf. */
  bibleOnStand(m, Math.min(0.26, NW * 0.32), 0, y0, nicheFace + 0.13);

  /* Pampas grass at both ends: a red vase on the left, a carved cream one on the right. */
  const vx = W / 2 - SW * 0.5;
  const vz = Math.min(0.0, D / 2 - 0.1);
  const redVase = new THREE.LatheGeometry(
    [
      [0, 0],
      [0.035, 0],
      [0.05, 0.025],
      [0.056, 0.06],
      [0.046, 0.1],
      [0.024, 0.13],
      [0.019, 0.15],
      [0.025, 0.16],
      [0.016, 0.16],
      [0, 0.12],
    ].map(([a, b]) => new THREE.Vector2(a, b)),
    18,
  );
  pampas(m, redVase, RED, 0.16, -vx, y0, vz, -1, W / 2 - 0.01, 7);
  const creamVase = new THREE.LatheGeometry(
    [
      [0, 0],
      [0.045, 0],
      [0.048, 0.012],
      [0.03, 0.04],
      [0.026, 0.1],
      [0.032, 0.16],
      [0.05, 0.2],
      [0.058, 0.215],
      [0.046, 0.215],
      [0, 0.17],
    ].map(([a, b]) => new THREE.Vector2(a, b)),
    18,
  );
  // Carved leaves in relief on the cream vase.
  for (let i = 0; i < 5; i++) {
    const a = -1.1 + i * 0.55;
    const leaf = flat(lens(0.11, 0.022), 0.006, 4).rotateZ(i % 2 ? 0.25 : -0.25).translate(0, 0.06, 0.028).rotateY(a);
    m.fixed(STATUE, leaf.translate(vx, y0, vz));
  }
  pampas(m, creamVase, STATUE, 0.215, vx, y0, vz, 1, W / 2 - 0.01, 11);

  return light(m.build());
}

/** Generators of this family, registered through `essentials.ts`. */
export const ALTAR_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsAltar: buildAltar,
};
