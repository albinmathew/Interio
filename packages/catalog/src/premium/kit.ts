/**
 * Modelling kit for the premium furniture set.
 *
 * Conventions (same as the rest of the catalog): metres, origin at the
 * bottom-centre of the footprint, front facing +Z, overall size equal to
 * `entry.dims` (w along X, h along Y, d along Z).
 *
 * A model is built from parts. Each part belongs either to a finish SLOT of
 * the entry (`upholstery`, `frame`, `top`...), whose material the user can
 * change per item, or to a FIXED material that never changes (a rubber foot, a
 * screen). Parts of one slot are merged into a single mesh, so an item costs a
 * handful of draw calls, and the mesh carries `userData.slot`.
 *
 * Geometry keeps world-scaled UVs (1 UV unit = 1 metre, box-projected), so
 * fabric, wood and stone textures tile at their real size on every piece.
 */
import {
  finishOf,
  resolveFurnitureMaterial,
  type CatalogEntry,
  type FinishKind,
  type FurnitureMaterial,
} from '@interio/core';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** What a generator is told about the item it builds for. */
export interface BuildContext {
  /** The item's own finishes by slot id. Missing slots use the entry's defaults. */
  finishes?: Record<string, string>;
}

/* ---------------------------------------------------------------- materials */

/** Texture maps for a furniture material, supplied by the renderer (see `setFurnitureTextureResolver`). */
export interface FurnitureTextures {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  /** False when `map` already carries the colour, so the material colour must be white. Default true. */
  tint?: boolean;
}

type Resolver = (material: FurnitureMaterial) => FurnitureTextures | null;

let resolver: Resolver | null = null;
const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/**
 * Lets the renderer add texture maps to furniture materials. Call it once
 * before any model is built; calling it again drops the cached materials.
 * Without a resolver (Node, tests, thumbnails) materials are flat colours.
 */
export function setFurnitureTextureResolver(fn: Resolver | null): void {
  resolver = fn;
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

/**
 * The shared three.js material for a finish value: a furniture material id or
 * a custom colour as `#rrggbb` (rendered as a material of `kind`). Do not
 * mutate the result. Unknown values fall back to matte white lacquer.
 */
export function furnitureMaterial(value: string, kind?: FinishKind): THREE.MeshPhysicalMaterial {
  const spec = resolveFurnitureMaterial(value, kind) ?? resolveFurnitureMaterial('lacquer.white')!;
  const key = `${spec.id}|${spec.kind}`;
  let mat = cache.get(key);
  if (mat) return mat;
  const blend = spec.opacity !== undefined && spec.opacity < 1;
  mat = new THREE.MeshPhysicalMaterial({
    name: spec.id,
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: blend,
    opacity: spec.opacity ?? 1,
    side: blend ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !blend,
    sheen: spec.sheen ?? 0,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(spec.color).lerp(new THREE.Color('#ffffff'), 0.35),
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: 0.12,
  });
  const textures = resolver?.(spec);
  if (textures) {
    if (textures.map) mat.map = textures.map;
    if (textures.normalMap) mat.normalMap = textures.normalMap;
    if (textures.roughnessMap) mat.roughnessMap = textures.roughnessMap;
    if (textures.map && textures.tint === false) mat.color.set('#ffffff');
  }
  cache.set(key, mat);
  return mat;
}

/* ----------------------------------------------------------------- geometry */

export type Axis = 'x' | 'y' | 'z';

/** Entry size in metres. */
export function size(entry: CatalogEntry): { W: number; D: number; H: number } {
  return { W: entry.dims.w / 1000, D: entry.dims.d / 1000, H: entry.dims.h / 1000 };
}

/** A generator parameter from the entry (`model.params`), or the fallback. */
export function param<T>(entry: CatalogEntry, name: string, fallback: T): T {
  const params = entry.model.kind === 'parametric' ? entry.model.params : undefined;
  const value = params?.[name];
  return value === undefined ? fallback : (value as T);
}

/**
 * Replaces a geometry's UVs with a box projection in metres: each triangle is
 * mapped on the plane it faces most. Returns a non-indexed geometry.
 */
export function boxUv(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      // Facing up/down: (x, z). Facing front/back: (x, y). Facing sideways: (z, y).
      const u = ay >= ax && ay >= az ? p.x : az >= ax ? p.x : p.z;
      const v = ay >= ax && ay >= az ? p.z : p.y;
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Box centred on (x, z) with its underside at y. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)).translate(x, y + h / 2, z);
}

/** Box with rounded edges, centred on (x, z) with its underside at y. `r` is clamped to fit. */
export function rbox(w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0, segments = 3): THREE.BufferGeometry {
  const radius = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return new RoundedBoxGeometry(w, h, d, segments, radius).translate(x, y + h / 2, z);
}

/**
 * A soft cushion: a rounded box whose top (and a little of its front) bulges.
 * `puff` is the extra height at the centre as a fraction of `h` (0.15 is a firm
 * seat, 0.4 a plump back cushion). Underside at y.
 */
export function cushion(w: number, h: number, d: number, x = 0, y = 0, z = 0, puff = 0.2, r = Math.min(w, h, d) * 0.3): THREE.BufferGeometry {
  const g = rbox(w, h, d, r, 0, 0, 0, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) / (w / 2);
    const py = pos.getY(i) / h; // 0 at the underside, 1 at the top
    const pz = pos.getZ(i) / (d / 2);
    const dome = Math.max(0, 1 - px * px) * Math.max(0, 1 - pz * pz);
    if (py > 0.5) pos.setY(i, pos.getY(i) + puff * h * dome * (py - 0.5) * 2);
  }
  g.computeVertexNormals();
  return g.translate(x, y, z);
}

/** A pillow: plump in the middle, pinched towards its seam. Centred on (x, z), underside at y. */
export function pillow(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 28, 18);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // Squarer outline than an ellipse, thin at the rim.
    const sx = Math.sign(pos.getX(i)) * Math.abs(pos.getX(i)) ** 0.55;
    const sz = Math.sign(pos.getZ(i)) * Math.abs(pos.getZ(i)) ** 0.55;
    const rim = Math.max(0, 1 - Math.max(Math.abs(sx), Math.abs(sz)) ** 6);
    pos.setXYZ(i, (sx * w) / 2, (pos.getY(i) * h * (0.25 + 0.75 * rim)) / 2, (sz * d) / 2);
  }
  g.computeVertexNormals();
  return g.translate(x, y + h / 2, z);
}

/**
 * Cylinder, cone or frustum along `axis`. For the y axis (x, y, z) is the centre
 * of its base; for x and z it is the centre of the solid.
 */
export function cyl(rTop: number, rBottom: number, length: number, x = 0, y = 0, z = 0, axis: Axis = 'y', segments = 24): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, Math.max(length, 1e-4), segments);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, axis === 'y' ? y + length / 2 : y, z);
}

/** A round bar through the given points (handles, frames, rails). */
export function tube(points: [number, number, number][], radius: number, closed = false, segments = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.05);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, segments, closed);
}

/** Solid of revolution about the y axis. `profile` is [radius, height] pairs from bottom to top. */
export function lathe(profile: [number, number][], x = 0, y = 0, z = 0, segments = 32): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)), segments);
  return g.translate(x, y, z);
}

/** A rectangle with rounded corners in the XY plane, for extrusions. */
export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const radius = Math.max(0, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5));
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + radius, -h / 2);
  s.lineTo(w / 2 - radius, -h / 2);
  s.absarc(w / 2 - radius, -h / 2 + radius, radius, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - radius);
  s.absarc(w / 2 - radius, h / 2 - radius, radius, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + radius, h / 2);
  s.absarc(-w / 2 + radius, h / 2 - radius, radius, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + radius);
  s.absarc(-w / 2 + radius, -h / 2 + radius, radius, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * Extrudes a flat shape (drawn in XY) and lays it down: the shape lies in the
 * XZ plane, `thickness` goes up from y. A small bevel softens the edges.
 */
export function slab(shape: THREE.Shape, thickness: number, x = 0, y = 0, z = 0, bevel = 0): THREE.BufferGeometry {
  const b = Math.min(bevel, thickness / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * Math.max(b, 0),
    bevelEnabled: b > 0,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 16,
  });
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  return g.translate(x, y - g.boundingBox!.min.y, z);
}

/** Rotates a geometry about a pivot point. Angles in radians. */
export function turn(g: THREE.BufferGeometry, rx: number, ry: number, rz: number, px = 0, py = 0, pz = 0): THREE.BufferGeometry {
  g.translate(-px, -py, -pz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g.translate(px, py, pz);
}

/* -------------------------------------------------------------------- model */

/**
 * Collects the parts of one model and merges them into one mesh per slot or
 * fixed material.
 */
export class Model {
  readonly W: number;
  readonly D: number;
  readonly H: number;
  private readonly parts = new Map<string, THREE.BufferGeometry[]>();

  constructor(
    readonly entry: CatalogEntry,
    readonly ctx: BuildContext = {},
  ) {
    const s = size(entry);
    this.W = s.W;
    this.D = s.D;
    this.H = s.H;
  }

  private push(key: string, geometry: THREE.BufferGeometry): this {
    const g = boxUv(geometry);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const list = this.parts.get(key);
    if (list) list.push(g);
    else this.parts.set(key, [g]);
    return this;
  }

  /** Adds a part to a finish slot of the entry. The slot must be declared in `entry.slots`. */
  part(slot: string, geometry: THREE.BufferGeometry): this {
    return this.push(`slot:${slot}`, geometry);
  }

  /** Adds a part in a fixed furniture material (id from `FURNITURE_MATERIALS`, or `#rrggbb`). */
  fixed(material: string, geometry: THREE.BufferGeometry): this {
    return this.push(`mat:${material}`, geometry);
  }

  /** Merges the parts. Meshes cast and receive shadows; see-through materials draw last. */
  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = this.entry.id;
    const meshes: THREE.Mesh[] = [];
    for (const [key, geometries] of this.parts) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const isSlot = key.startsWith('slot:');
      const id = key.slice(key.indexOf(':') + 1);
      const slot = isSlot ? this.entry.slots?.find((s) => s.id === id) : undefined;
      const value = isSlot ? (finishOf(this.entry.slots, this.ctx.finishes, id) ?? 'lacquer.white') : id;
      const mat = furnitureMaterial(value, slot?.kind);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = id;
      if (isSlot) mesh.userData.slot = id;
      mesh.castShadow = !mat.transparent;
      mesh.receiveShadow = true;
      if (mat.transparent) mesh.renderOrder = 1;
      meshes.push(mesh);
    }
    meshes.sort((a, b) => a.renderOrder - b.renderOrder);
    group.add(...meshes);
    return group;
  }
}
