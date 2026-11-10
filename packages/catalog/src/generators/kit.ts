/**
 * Building blocks for parametric generators. Everything is in metres with the
 * catalog conventions: origin at the bottom-centre of the footprint, front +Z.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type MaterialSpec, type PaletteKey } from '../palette';

const materials = new Map<PaletteKey, THREE.MeshStandardMaterial>();

/** Shared material for a palette entry. Do not mutate the result. */
export function material(key: PaletteKey): THREE.MeshStandardMaterial {
  let mat = materials.get(key);
  if (!mat) {
    const spec: MaterialSpec = PALETTE[key];
    const blend = spec.opacity !== undefined && spec.opacity < 1;
    mat = new THREE.MeshStandardMaterial({
      name: key,
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: blend,
      opacity: spec.opacity ?? 1,
      side: blend ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !blend,
      emissive: spec.emissive ?? '#000000',
      emissiveIntensity: spec.emissiveIntensity ?? 1,
    });
    materials.set(key, mat);
  }
  return mat;
}

/** Entry size in metres. */
export function size(entry: CatalogEntry): { W: number; D: number; H: number } {
  return { W: entry.dims.w / 1000, D: entry.dims.d / 1000, H: entry.dims.h / 1000 };
}

export function param<T>(entry: CatalogEntry, name: string, fallback: T): T {
  const params = entry.model.kind === 'parametric' ? entry.model.params : undefined;
  const value = params?.[name];
  return value === undefined ? fallback : (value as T);
}

export type Axis = 'x' | 'y' | 'z';

/**
 * Collects primitives, then merges them into one mesh per material so a placed
 * item costs a handful of draw calls.
 */
export class Builder {
  private readonly parts = new Map<PaletteKey, THREE.BufferGeometry[]>();

  /** Adds a geometry already positioned in model space. */
  add(key: PaletteKey, geometry: THREE.BufferGeometry): this {
    const list = this.parts.get(key);
    const clean = geometry.index ? geometry.toNonIndexed() : geometry;
    clean.deleteAttribute('uv');
    if (list) list.push(clean);
    else this.parts.set(key, [clean]);
    return this;
  }

  /** Box centred on (x, z) with its underside at y. */
  box(key: PaletteKey, w: number, h: number, d: number, x = 0, y = 0, z = 0): this {
    if (w <= 0 || h <= 0 || d <= 0) return this;
    return this.add(key, new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  }

  /**
   * Cylinder (or cone/frustum) whose axis runs along `axis`. (x, y, z) is the
   * centre of its base for the y axis, and the centre of the solid otherwise.
   */
  cyl(key: PaletteKey, rTop: number, rBottom: number, length: number, x = 0, y = 0, z = 0, axis: Axis = 'y', segments = 24): this {
    if (length <= 0) return this;
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, segments);
    if (axis === 'x') g.rotateZ(-Math.PI / 2);
    else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.add(key, g.translate(x, axis === 'y' ? y + length / 2 : y, z));
  }

  /** Ellipsoid centred on (x, y, z). */
  ball(key: PaletteKey, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, detail = 16): this {
    return this.add(key, new THREE.SphereGeometry(1, detail, Math.max(8, detail / 2)).scale(rx, ry, rz).translate(x, y, z));
  }

  /** Upper half of an ellipsoid, flat side down at y. */
  dome(key: PaletteKey, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0, flip = false): this {
    const g = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(rx, ry, rz);
    if (flip) g.rotateX(Math.PI);
    return this.add(key, g.translate(x, y, z));
  }

  /**
   * Prism with a rounded-rectangle cross-section, extruded along `axis`.
   * `a` and `b` are the cross-section sizes: (x, y) for z, (x, z) for y, (z, y) for x.
   * Centred on its axis; (x, y, z) is the centre of the solid.
   */
  rounded(key: PaletteKey, a: number, b: number, length: number, radius: number, x = 0, y = 0, z = 0, axis: Axis = 'z'): this {
    const r = Math.min(radius, a / 2 - 1e-5, b / 2 - 1e-5);
    const shape = new THREE.Shape();
    shape.moveTo(-a / 2 + r, -b / 2);
    shape.lineTo(a / 2 - r, -b / 2);
    shape.absarc(a / 2 - r, -b / 2 + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(a / 2, b / 2 - r);
    shape.absarc(a / 2 - r, b / 2 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-a / 2 + r, b / 2);
    shape.absarc(-a / 2 + r, b / 2 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-a / 2, -b / 2 + r);
    shape.absarc(-a / 2 + r, -b / 2 + r, r, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -length / 2);
    if (axis === 'y') g.rotateX(-Math.PI / 2);
    else if (axis === 'x') g.rotateY(Math.PI / 2);
    return this.add(key, g.translate(x, y, z));
  }

  /** Extrudes a closed profile drawn in the (z, y) side plane across the width (x). Centred on x. */
  profile(key: PaletteKey, points: [number, number][], width: number, x = 0): this {
    // Shape coordinates (u, v) = (-z, y); rotating the extrusion a quarter turn about +Y maps u to -z and its depth to x.
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(0, 0, -width / 2).rotateY(Math.PI / 2);
    return this.add(key, g.translate(x, 0, 0));
  }

  /** Merges by material. Meshes cast and receive shadows; blended materials draw last. */
  build(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    const keys = [...this.parts.keys()].sort((a, b) => Number(material(a).transparent) - Number(material(b).transparent));
    for (const key of keys) {
      const merged = mergeGeometries(this.parts.get(key)!, false);
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mat = material(key);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      mesh.castShadow = !mat.transparent;
      mesh.receiveShadow = true;
      if (mat.transparent) mesh.renderOrder = 1;
      group.add(mesh);
    }
    return group;
  }
}
