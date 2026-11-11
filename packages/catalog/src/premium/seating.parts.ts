/**
 * Shared parts for the living, dining, office and outdoor families of the
 * premium set: lighter soft shapes than the kit's (the segment count is a
 * parameter), a mirror for left/right variants, placement by bounding box, and
 * a collector that adds parts to a model once all of them are known.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl, type Model } from './kit';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Grid coordinate k of n (0..n) across a side of half-size `half`, with `e` steps in each rounded edge of radius `r`. */
function gridAt(k: number, n: number, e: number, half: number, r: number): number {
  if (k <= e) return -half + (r * k) / e;
  if (k >= n - e) return half - (r * (n - k)) / e;
  const inner = half - r;
  return -inner + ((k - e) / (n - 2 * e)) * 2 * inner;
}

/**
 * A soft upholstered block: a rounded box whose top bulges by `puff * h` at the
 * centre, smooth-shaded. Unlike the kit's `cushion` (built on RoundedBoxGeometry,
 * whose flat faces have no inner vertices, so the dome only lifts the edges) the
 * faces are subdivided, so the bulge is real. `segs` steps round each edge;
 * 3 costs about 900 triangles. Underside at y.
 */
export function softBox(w: number, h: number, d: number, x = 0, y = 0, z = 0, puff = 0.15, r = Math.min(w, h, d) * 0.3, segs = 3, inner = 4): THREE.BufferGeometry {
  const radius = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const n = 2 * segs + inner;
  const box = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  box.deleteAttribute('uv');
  box.deleteAttribute('normal');
  const g = mergeVertices(box, 1e-6);
  const pos = g.getAttribute('position');
  const half = [w / 2, h / 2, d / 2];
  const lim = half.map((v) => v - radius);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const c = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((t, a) => gridAt(Math.round((t + 0.5) * n), n, segs, half[a]!, radius));
    p.set(c[0]!, c[1]!, c[2]!);
    q.set(clamp(p.x, -lim[0]!, lim[0]!), clamp(p.y, -lim[1]!, lim[1]!), clamp(p.z, -lim[2]!, lim[2]!));
    const dir = p.clone().sub(q);
    if (dir.lengthSq() > 1e-12) p.copy(q).addScaledVector(dir.normalize(), radius);
    // Dome on the upper half.
    const px = p.x / half[0]!;
    const py = (p.y + half[1]!) / h;
    const pz = p.z / half[2]!;
    const dome = Math.max(0, 1 - px * px) * Math.max(0, 1 - pz * pz);
    if (py > 0.5) p.y += puff * h * dome * (py - 0.5) * 2;
    pos.setXYZ(i, p.x, p.y + h / 2, p.z);
  }
  g.computeVertexNormals();
  return g.translate(x, y, z);
}

/** A throw pillow lying flat: `w` x `d` outline, `h` thick, pinched at the seam. Underside at y. */
export function softPillow(w: number, h: number, d: number, x = 0, y = 0, z = 0, segs = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segs, Math.max(8, Math.round(segs * 0.6)));
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const sx = Math.sign(pos.getX(i)) * Math.abs(pos.getX(i)) ** 0.55;
    const sz = Math.sign(pos.getZ(i)) * Math.abs(pos.getZ(i)) ** 0.55;
    const rim = Math.max(0, 1 - Math.max(Math.abs(sx), Math.abs(sz)) ** 6);
    pos.setXYZ(i, (sx * w) / 2, (pos.getY(i) * h * (0.25 + 0.75 * rim)) / 2, (sz * d) / 2);
  }
  g.computeVertexNormals();
  return g.translate(x, y + h / 2, z);
}

/** A pillow standing up, its face towards +Z, leaning back by `lean` radians and turned by `yaw`. Centred on the origin. */
export function uprightPillow(size: number, thick: number, lean = 0.3, yaw = 0, segs = 16): THREE.BufferGeometry {
  const g = softPillow(size, thick, size * 0.96, 0, -thick / 2, 0, segs);
  g.rotateX(Math.PI / 2 - lean);
  if (yaw) g.rotateY(yaw);
  return g;
}

/** Mirrors a geometry across x = 0, keeping its faces outward. Returns a non-indexed geometry. */
export function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.scale(-1, 1, 1);
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const s = a.itemSize;
    const arr = a.array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = arr[(i + 1) * s + k]!;
        arr[(i + 1) * s + k] = arr[(i + 2) * s + k]!;
        arr[(i + 2) * s + k] = t;
      }
    }
    a.needsUpdate = true;
  }
  return g;
}

export interface Place {
  minX?: number;
  maxX?: number;
  cx?: number;
  minY?: number;
  maxY?: number;
  minZ?: number;
  maxZ?: number;
  cz?: number;
}

/** Moves a geometry so its bounding box meets the given sides (one per axis is used). */
export function placeBox(g: THREE.BufferGeometry, p: Place): THREE.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const dx = p.minX !== undefined ? p.minX - b.min.x : p.maxX !== undefined ? p.maxX - b.max.x : p.cx !== undefined ? p.cx - (b.min.x + b.max.x) / 2 : 0;
  const dy = p.minY !== undefined ? p.minY - b.min.y : p.maxY !== undefined ? p.maxY - b.max.y : 0;
  const dz = p.minZ !== undefined ? p.minZ - b.min.z : p.maxZ !== undefined ? p.maxZ - b.max.z : p.cz !== undefined ? p.cz - (b.min.z + b.max.z) / 2 : 0;
  return g.translate(dx, dy, dz);
}

/** A thin round bar between two points, for piping, rails and stretchers. */
export function rod(a: [number, number, number], b: [number, number, number], r: number, segs = 8): THREE.BufferGeometry {
  return taperRod(a, b, r, r, segs);
}

/** A round bar from `a` (radius `ra`) to `b` (radius `rb`): splayed legs, dowels. */
export function taperRod(a: [number, number, number], b: [number, number, number], ra: number, rb: number, segs = 12): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(rb, ra, Math.max(len, 1e-4), segs, 1, false);
  const dir = vb.clone().sub(va).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = va.add(vb).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

/** A square-section member with rounded edges between two points (legs, posts, rails). `sx` across x, `sz` across the other side. */
export function beam(a: [number, number, number], b: [number, number, number], sx: number, sz: number, r = 0.004, segs = 1, taperA = 1): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const radius = Math.max(1e-4, Math.min(r, sx / 2 - 1e-4, sz / 2 - 1e-4, len / 2 - 1e-4));
  const g = new RoundedBoxGeometry(sx, len, sz, segs, radius);
  if (taperA !== 1) {
    // Thinner towards `a`.
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const f = taperA + (1 - taperA) * (pos.getY(i) / len + 0.5);
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
    }
  }
  const dir = vb.clone().sub(va).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = va.add(vb).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

/**
 * A curved band standing upright: an arc in plan whose back-most point is at
 * z = `zBack`, `chord` wide, bowing `sag` towards -Z, `t` thick and `h` tall
 * from y. For chair back rails and shell backs. `sweep` widens the arc beyond
 * the chord (radians each side, for a horseshoe).
 */
export function arcBand(chord: number, sag: number, t: number, h: number, y: number, zBack: number, x = 0, sweep = 0, curveSegments = 20, bevel = 0.003): THREE.BufferGeometry {
  const R = (chord * chord) / 4 / Math.max(sag, 1e-3) / 2 + sag / 2;
  // The bevel grows the outline, the ends included: keep them inside the chord.
  const alpha = Math.asin(Math.min(1, (chord / 2 - bevel) / R)) + sweep;
  // Shape coordinates: (x, -z). The arc centre is in front of the back point.
  const cy = -(zBack + R);
  const s = new THREE.Shape();
  s.absarc(x, cy, R - bevel, Math.PI / 2 - alpha, Math.PI / 2 + alpha, false);
  s.absarc(x, cy, R - t + bevel, Math.PI / 2 + alpha, Math.PI / 2 - alpha, true);
  s.closePath();
  const b = Math.min(bevel, t / 3, h / 3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(h - 2 * b, 1e-4), bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 1, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  return g.translate(0, y - g.boundingBox!.min.y, 0);
}

/** A horizontal ring (torus) around the y axis: footrests, piping round a pouf. */
export function ring(R: number, r: number, x: number, y: number, z: number, segs = 32, scaleZ = 1): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, 8, segs).rotateX(Math.PI / 2).scale(1, 1, scaleZ).translate(x, y, z);
}

/** A tapered round leg standing at (x, z), from y up `h`, `rBottom` at the floor. */
export function taperLeg(x: number, z: number, h: number, rTop = 0.022, rBottom = 0.015, y = 0, segs = 14): THREE.BufferGeometry {
  return cyl(rTop, rBottom, h, x, y, z, 'y', segs);
}

/**
 * Collects parts by slot or fixed material and hands them to the model at the
 * end, mirrored across x = 0 when `mirror` is set (left-handed variants).
 */
export class Parts {
  private readonly list: { slot: boolean; key: string; g: THREE.BufferGeometry }[] = [];

  constructor(
    readonly m: Model,
    readonly mirror = false,
  ) {}

  part(slot: string, g: THREE.BufferGeometry): this {
    this.list.push({ slot: true, key: slot, g });
    return this;
  }

  fixed(material: string, g: THREE.BufferGeometry): this {
    this.list.push({ slot: false, key: material, g });
    return this;
  }

  build(): THREE.Group {
    for (const { slot, key, g } of this.list) {
      const geo = this.mirror ? mirrorX(g) : g;
      if (slot) this.m.part(key, geo);
      else this.m.fixed(key, geo);
    }
    return this.m.build();
  }
}
