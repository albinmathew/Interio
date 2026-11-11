/**
 * Small building blocks shared by the storage, decor, lighting and bed
 * generators: chamfered panels, thin two-sided sheets, leaves, pots, books and
 * other shelf objects, and a helper that fits free-form parts into the entry's
 * bounding box.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, lathe, rbox, type Model } from './kit';

export type G = THREE.BufferGeometry;

/** A board or panel with a fine chamfer on every edge. Cheap: 108 triangles. Underside at y. */
export const panel = (w: number, h: number, d: number, x = 0, y = 0, z = 0, r = 0.002): G => rbox(w, h, d, r, x, y, z, 1);

/** Deterministic pseudo-random numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number from a string, to seed `rng` per entry. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Keeps only position and normal, un-indexed, so differently built parts can be merged. */
function plain(g: G): G {
  const out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  return out;
}

/** Merges parts into one geometry (position and normal only). */
export function join(parts: G[]): G {
  return mergeGeometries(parts.map(plain), false)!;
}

/** Both faces of a thin sheet (a shade, a leaf, a curtain): furniture materials draw front faces only. */
export function twoSided(g: G): G {
  const front = plain(g);
  const back = front.clone();
  const pos = back.getAttribute('position') as THREE.BufferAttribute;
  const nor = back.getAttribute('normal') as THREE.BufferAttribute;
  const p = pos.array as Float32Array;
  const n = nor.array as Float32Array;
  for (let i = 0; i + 8 < p.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = p[i + 3 + k]!;
      p[i + 3 + k] = p[i + 6 + k]!;
      p[i + 6 + k] = t;
      const u = n[i + 3 + k]!;
      n[i + 3 + k] = n[i + 6 + k]!;
      n[i + 6 + k] = u;
    }
  }
  for (let i = 0; i < n.length; i++) n[i] = -n[i]!;
  return mergeGeometries([front, back], false)!;
}

/** Moves a geometry built at the origin: yaw about Y, then pitch about X, then roll about Z (applied roll first). */
export function place(g: G, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): G {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
}

/**
 * A grid surface from a function of (u, v) in [0, 1]. Smooth normals. One-sided:
 * wrap in `twoSided` for a sheet seen from both sides.
 */
export function surface(nu: number, nv: number, at: (u: number, v: number) => [number, number, number]): G {
  const pos: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...at(i / nu, j / nv));
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/* ------------------------------------------------------------------ fitting */

/**
 * Collects free-form parts (foliage, cushions, a lamp) and adds them to the
 * model scaled and moved so that together they fill a box exactly. This is how
 * organic pieces meet the rule that the bounding box equals the entry's size.
 */
export class Fit {
  private readonly items: { slot: boolean; key: string; g: G }[] = [];

  part(slot: string, g: G): this {
    this.items.push({ slot: true, key: slot, g });
    return this;
  }

  fixed(material: string, g: G): this {
    this.items.push({ slot: false, key: material, g });
    return this;
  }

  /** Current bounds of everything collected. */
  bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const it of this.items) {
      it.g.computeBoundingBox();
      b.union(it.g.boundingBox!);
    }
    return b;
  }

  /**
   * Fits the parts into [min, max] and hands them to the model. `axes` limits
   * which axes are stretched; the others keep their size and position.
   */
  into(m: Model, min: [number, number, number], max: [number, number, number], axes = 'xyz'): void {
    const b = this.bounds();
    const size = b.getSize(new THREE.Vector3());
    const s = new THREE.Vector3(1, 1, 1);
    const t = new THREE.Vector3(0, 0, 0);
    const names = ['x', 'y', 'z'] as const;
    for (let i = 0; i < 3; i++) {
      const a = names[i]!;
      if (!axes.includes(a) || size[a] < 1e-6) continue;
      s[a] = (max[i]! - min[i]!) / size[a];
      t[a] = min[i]! - b.min[a] * s[a];
    }
    const mat = new THREE.Matrix4().compose(t, new THREE.Quaternion(), s);
    for (const it of this.items) {
      it.g.applyMatrix4(mat);
      if (it.slot) m.part(it.key, it.g);
      else m.fixed(it.key, it.g);
    }
  }
}

/* ------------------------------------------------------------------- plants */

export type LeafShape = 'oval' | 'lance' | 'broad' | 'sword';

const LEAF_PROFILE: Record<LeafShape, number[]> = {
  oval: [0.12, 0.62, 0.92, 1, 0.86, 0.52, 0.06],
  lance: [0.2, 0.75, 1, 0.9, 0.62, 0.3, 0.04],
  broad: [0.5, 0.95, 1, 0.9, 0.7, 0.42, 0.05],
  sword: [0.7, 1, 1, 0.95, 0.8, 0.5, 0.05],
};

/**
 * A leaf blade: starts at the origin, grows along +Z, faces +Y. `fold` lifts the
 * edges into a shallow V, `droop` bends the tip down (radians over its length).
 */
export function leaf(length: number, width: number, shape: LeafShape = 'oval', segments = 5, fold = 0.25, droop = 0.5): G {
  const profile = LEAF_PROFILE[shape];
  const widthAt = (t: number) => {
    const f = t * (profile.length - 1);
    const i = Math.min(profile.length - 2, Math.floor(f));
    return (profile[i]! + (profile[i + 1]! - profile[i]!) * (f - i)) * (width / 2);
  };
  const centre: [number, number][] = [[0, 0]];
  for (let i = 1; i <= segments; i++) {
    const a = -droop * ((i - 0.5) / segments) ** 1.4;
    const [py, pz] = centre[i - 1]!;
    centre.push([py + Math.sin(a) * (length / segments), pz + Math.cos(a) * (length / segments)]);
  }
  return twoSided(
    surface(2, segments, (u, v) => {
      const i = Math.round(v * segments);
      const [cy, cz] = centre[i]!;
      const side = u * 2 - 1;
      const w = widthAt(v);
      return [side * w * Math.cos(fold), cy + Math.abs(side) * w * Math.sin(fold), cz];
    }),
  );
}

/** Greens for foliage, dark to light. Custom colours: the material list has no leaves. */
export const GREENS = ['#2f5a37', '#3f7446', '#5c8f4c'] as const;
export const SOIL = '#3a2e25';
export const BARK = '#6a503a';

/**
 * A planter turned on the lathe: `shape` 'taper' (classic pot), 'cylinder' or
 * 'bowl'. Returns the pot (with a hollow rim) and the soil just below it.
 */
export function pot(radius: number, height: number, shape: 'taper' | 'cylinder' | 'bowl' = 'taper', x = 0, y = 0, z = 0): { body: G; soil: G; soilY: number } {
  const r = radius;
  const h = height;
  const wall = Math.max(0.006, r * 0.07);
  const outer: [number, number][] =
    shape === 'cylinder'
      ? [[0, 0], [r - 0.012, 0], [r, 0.012], [r, h - 0.006], [r - 0.003, h]]
      : shape === 'bowl'
        ? [[0, 0], [r * 0.5, 0], [r * 0.78, h * 0.18], [r * 0.96, h * 0.5], [r, h * 0.8], [r * 0.97, h]]
        : [[0, 0], [r * 0.66, 0], [r * 0.7, 0.01], [r * 0.97, h * 0.86], [r, h * 0.88], [r, h - 0.004], [r - 0.003, h]];
  const soilY = h - Math.min(0.03, h * 0.12);
  const body = lathe([...outer, [r - wall, h], [r - wall - 0.002, soilY - 0.01]], x, y, z, 36);
  const soil = lathe([[0, soilY + 0.006], [(r - wall) * 0.6, soilY + 0.004], [r - wall, soilY - 0.004]], x, y, z, 24);
  return { body, soil, soilY: y + soilY };
}

/* ------------------------------------------------------------ shelf objects */

/** Where a shelf object's geometry goes: its page block, or a cover in one of a few colours. */
export type Emit = (role: 'pages' | number, g: G) => void;

/** Fixed materials for objects on shelves when the entry does not make them slots. */
export const PAGES = 'fabric.linen.ivory';
export const COVERS = ['fabric.linen.ivory', 'fabric.linen.taupe', 'fabric.weave.charcoal', 'fabric.cotton.sage'] as const;

/** Emits shelf objects as fixed materials of the model, using the first `colours` cover colours. */
export function fixedEmit(m: Model, colours = 3): Emit {
  return (role, g) => m.fixed(role === 'pages' ? PAGES : COVERS[role % Math.min(colours, COVERS.length)]!, g);
}

/**
 * One book standing upright at the origin: thickness along X, spine facing +Z.
 * Returns its cover (two boards and a spine) and its page block.
 */
export function book(t: number, h: number, d: number): { cover: G; pages: G } {
  const c = Math.min(0.0028, t * 0.14);
  const cover = join([box(c, h, d, -t / 2 + c / 2, 0, 0), box(c, h, d, t / 2 - c / 2, 0, 0), box(t - 2 * c, h, c, 0, 0, d / 2 - c / 2)]);
  const pages = box(t - 2 * c, h - 0.006, d - c - 0.004, 0, 0.003, -c / 2 - 0.002);
  return { cover, pages };
}

/**
 * A row of upright books from x0 towards x1 on a surface at y, spines towards
 * +Z ending at `zFront`. Stops at x1; the last book may lean. Returns the x where the row ends.
 */
export function bookRow(emit: Emit, rand: () => number, x0: number, x1: number, y: number, zFront: number, hMax: number, dMax: number, lean = true): number {
  let x = x0;
  let i = 0;
  const hTop = Math.min(hMax, 0.3);
  while (true) {
    const t = 0.016 + rand() * 0.026;
    const h = hTop * (0.68 + rand() * 0.32);
    const d = Math.min(dMax, 0.13 + rand() * 0.07);
    if (x + t > x1) break;
    const { cover, pages } = book(t, h, d);
    const colour = Math.floor(rand() * 4);
    const last = lean && x + t + 0.05 > x1 - h * 0.25 && i > 1;
    if (last) {
      // The last book leans on the row.
      const a = 0.22;
      for (const g of [cover, pages]) g.translate(t / 2, 0, 0).rotateZ(a).translate(x + h * Math.sin(a), y, zFront - d / 2);
      emit(colour, cover);
      emit('pages', pages);
      return x + t + h * Math.sin(a);
    }
    for (const g of [cover, pages]) g.translate(x + t / 2, y, zFront - d / 2);
    emit(colour, cover);
    emit('pages', pages);
    x += t + 0.0008;
    i++;
  }
  return x;
}

/** A stack of books lying flat, centred on (x, z) at y, long side along X. Returns the height of the stack. */
export function bookStack(emit: Emit, rand: () => number, count: number, x: number, y: number, z: number, wMax: number, dMax: number, hMax = Infinity): number {
  let top = 0;
  for (let i = 0; i < count; i++) {
    const t = 0.02 + rand() * 0.022;
    if (top + t > hMax) break;
    const w = wMax * (0.82 + rand() * 0.18) * (1 - i * 0.04);
    const d = dMax * (0.82 + rand() * 0.18) * (1 - i * 0.04);
    const { cover, pages } = book(t, w, d);
    const yaw = (rand() - 0.5) * 0.24;
    for (const g of [cover, pages]) {
      // Lay it down: thickness becomes height.
      g.translate(0, -w / 2, 0).rotateZ(Math.PI / 2).translate(0, t / 2, 0);
      place(g, x, y + top, z, yaw);
    }
    emit(Math.floor(rand() * 4), cover);
    emit('pages', pages);
    top += t;
  }
  return top;
}

/** A turned vase, base centred on (x, z) at y. */
export function vase(h: number, r: number, x = 0, y = 0, z = 0): G {
  return lathe(
    [[0, 0], [r * 0.55, 0], [r * 0.62, h * 0.02], [r, h * 0.34], [r * 0.9, h * 0.56], [r * 0.4, h * 0.84], [r * 0.36, h * 0.92], [r * 0.48, h], [r * 0.4, h * 0.99], [r * 0.3, h * 0.9], [0, h * 0.88]],
    x,
    y,
    z,
    28,
  );
}

/** A lidded storage box, centred on (x, z) at y. Returns the body and the lid. */
export function lidBox(w: number, h: number, d: number, x = 0, y = 0, z = 0): { body: G; lid: G } {
  const lidH = Math.min(0.045, h * 0.24);
  return {
    body: rbox(w - 0.008, h - lidH - 0.002, d - 0.008, 0.008, x, y, z, 2),
    lid: rbox(w, lidH, d, 0.008, x, y + h - lidH, z, 2),
  };
}
