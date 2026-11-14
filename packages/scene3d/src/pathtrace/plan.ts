/**
 * Which tracer update a scene change needs. Pure: no three.js, so it is unit tested.
 *
 * The scene is summarised by four hashes (see `signature.ts`):
 * - `structure`: which meshes are drawn, their geometry, transforms and material assignment;
 * - `materials`: the values of every material in use (colours, maps, roughness...);
 * - `lights`: every light's type, colour, strength and placement;
 * - `environment`: the environment map, the background and their strengths.
 */
export interface SceneSignature {
  structure: number;
  materials: number;
  lights: number;
  environment: number;
}

export interface SceneUpdate {
  /** Geometry or material assignment changed: rebuild the tracer's scene (`setScene`, BVH in a worker). */
  rebuild: boolean;
  /** Material values changed: `updateMaterials`. */
  materials: boolean;
  /** Lights changed: `updateLights`. */
  lights: boolean;
  /** Environment or background changed: `updateEnvironment`. */
  environment: boolean;
}

export const NO_UPDATE: SceneUpdate = Object.freeze({ rebuild: false, materials: false, lights: false, environment: false });

/** The updates that bring a tracer built from `traced` up to `now`. Nothing traced yet: everything. */
export function planSceneUpdate(traced: SceneSignature | null, now: SceneSignature): SceneUpdate {
  if (!traced) return { rebuild: true, materials: true, lights: true, environment: true };
  const rebuild = traced.structure !== now.structure;
  return {
    rebuild,
    // A rebuild re-reads materials, lights and the environment as part of it.
    materials: !rebuild && traced.materials !== now.materials,
    lights: !rebuild && traced.lights !== now.lights,
    environment: !rebuild && traced.environment !== now.environment,
  };
}

export const needsUpdate = (u: SceneUpdate): boolean => u.rebuild || u.materials || u.lights || u.environment;

/* -------------------------------------------------------------------- tiles */

/** About this many pixels per tile: big enough to keep the GPU busy, small enough to fit in a frame. */
export const TILE_PIXELS = 64_000;

/** Tiles per side for an image of `pixels` pixels (the image is traced in `grid` x `grid` tiles per sample). */
export function tileGrid(pixels: number, tilePixels = TILE_PIXELS): number {
  return Math.max(1, Math.min(24, Math.round(Math.sqrt(pixels / tilePixels))));
}

/* ------------------------------------------------------------------ hashing */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** FNV-1a style running hash over numbers and strings: cheap enough to run every frame. */
export class Hasher {
  private h = 0x811c9dc5;

  num(n: number): this {
    f32[0] = n;
    this.h = Math.imul(this.h ^ u32[0]!, 16777619);
    return this;
  }

  /** Numbers that may exceed float32 precision (ids, versions). */
  int(n: number): this {
    this.h = Math.imul(this.h ^ (n | 0), 16777619);
    this.h = Math.imul(this.h ^ ((n / 4294967296) | 0), 16777619);
    return this;
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.h = Math.imul(this.h ^ s.charCodeAt(i), 16777619);
    this.h = Math.imul(this.h ^ 0xff, 16777619);
    return this;
  }

  bool(b: boolean): this {
    return this.int(b ? 1 : 2);
  }

  nums(list: ArrayLike<number>): this {
    for (let i = 0; i < list.length; i++) this.num(list[i]!);
    return this;
  }

  get value(): number {
    return this.h >>> 0;
  }
}
