/**
 * Real textures for furniture materials. `installFurnitureTextures()` registers a resolver
 * with the catalog (`setFurnitureTextureResolver`) that gives every material of
 * `FURNITURE_MATERIAL_LIST`, and every custom colour, the maps of its texture set
 * (`furnitureSpecs.ts`).
 *
 * The catalog asks for maps synchronously while it builds a model, so each map starts
 * as a canvas of its final size painted with a neutral stand-in (the finish colour, a
 * flat normal), and is redrawn in place once the image has loaded and been processed. Same
 * size, so the GPU texture is updated rather than reallocated; the view is invalidated
 * so it draws again.
 *
 * Colour maps are tinted towards the finish colour on the CPU (`tint: false`), which keeps
 * a wood's grain or a marble's veins while matching the palette swatch. Cloth and leather
 * have no colour map: their weave is shaded from the normal map into one. Maps are shared
 * between every material that uses the same set, colour and scale.
 */
import { setFurnitureTextureResolver, type FurnitureTextures } from '@interio/catalog';
import { resolveFurnitureMaterial, type FinishKind, type FurnitureMaterial } from '@interio/core';
import { invalidate } from '@react-three/fiber';
import * as THREE from 'three';
import { furnitureTextureSpec, type FurnitureTextureSpec } from './furnitureSpecs';
import { tintToward } from './materialSpecs';
import { detectSoftwareRenderer } from './quality';
import { normaliseRoughness, shadeFromNormals, tintPixels } from './texturePixels';

let baseUrl = '/textures';
let installed = false;
/** Size of the furniture maps in pixels, and whether normal and roughness maps are used. */
let size = 512;
let detail = true;

/** Colour maps may brighten their texture this much towards a light finish (marble, white oak). */
const TINT_CAP = 2.2;

export interface FurnitureTextureOptions {
  /** `lite`: small colour maps only, for software renderers. Default: chosen from the renderer. */
  quality?: 'full' | 'lite';
  /** Where the texture sets are served from. Default `/textures`. */
  baseUrl?: string;
}

/**
 * Registers the texture resolver. Browser only, once, before the first model is built.
 * Later calls do nothing (a second registration would drop materials live models use).
 */
export function installFurnitureTextures(opts: FurnitureTextureOptions = {}): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  if (opts.baseUrl) baseUrl = opts.baseUrl.replace(/\/$/, '');
  const lite = (opts.quality ?? (detectSoftwareRenderer() ? 'lite' : 'full')) === 'lite';
  size = lite ? 256 : 512;
  detail = !lite;
  setFurnitureTextureResolver(resolveTextures);
}

/** True once the resolver is registered. */
export function furnitureTexturesInstalled(): boolean {
  return installed;
}

/* ------------------------------------------------------------------ images */

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

/** Pixels of (a centred share `crop` of) an image, drawn at n x n. */
function pixels(img: HTMLImageElement, n: number, crop = 1): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = img.naturalWidth * crop;
  const h = img.naturalHeight * crop;
  ctx.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, n, n);
  return ctx.getImageData(0, 0, n, n);
}

/** Scales the slope of a normal map, in place. */
function scaleNormals(data: Uint8ClampedArray, k: number): void {
  if (k === 1) return;
  for (let i = 0; i < data.length; i += 4) {
    const x = (data[i]! / 127.5 - 1) * k;
    const y = (data[i + 1]! / 127.5 - 1) * k;
    const z = Math.max(0.05, data[i + 2]! / 127.5 - 1);
    const l = Math.hypot(x, y, z);
    data[i] = Math.round((x / l + 1) * 127.5);
    data[i + 1] = Math.round((y / l + 1) * 127.5);
    data[i + 2] = Math.round((z / l + 1) * 127.5);
  }
}

/* -------------------------------------------------------------------- maps */

interface SharedMap {
  canvas: HTMLCanvasElement;
  /** Every texture drawing this canvas (one per repeat size). */
  textures: Map<number, THREE.Texture>;
  colorSpace: THREE.ColorSpace;
}

const maps = new Map<string, SharedMap>();
const queue: (() => Promise<void>)[] = [];
let draining = false;

/** Runs the image work one map at a time, between frames. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      await job();
    } catch {
      // A map that cannot be made keeps its stand-in.
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  draining = false;
}

/**
 * The shared map under `key`, created on first use with the stand-in `fill` and redrawn by
 * `make` once its pixels are ready. Returns a texture repeating every `repeatSize` metres.
 */
function sharedMap(key: string, fill: string, colorSpace: THREE.ColorSpace, repeatSize: number, make: (n: number) => Promise<ImageData | null>): THREE.Texture {
  let shared = maps.get(key);
  if (!shared) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size, size);
    const entry: SharedMap = { canvas, textures: new Map(), colorSpace };
    shared = entry;
    maps.set(key, entry);
    queue.push(async () => {
      const data = await make(size);
      if (!data) return;
      canvas.getContext('2d')!.putImageData(data, 0, 0);
      for (const t of entry.textures.values()) t.needsUpdate = true;
      invalidate();
    });
    void drain();
  }
  let texture = shared.textures.get(repeatSize);
  if (!texture) {
    texture = new THREE.CanvasTexture(shared.canvas);
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.setScalar(1 / repeatSize);
    texture.anisotropy = 8;
    texture.name = key;
    shared.textures.set(repeatSize, texture);
  }
  return texture;
}

const url = (spec: FurnitureTextureSpec, map: 'color' | 'normal' | 'rough') => `${baseUrl}/${spec.set}/${map}.jpg`;

/** The colour map of a finish: its set's colour map tinted towards it, or its colour shaded by the set's weave. */
async function colourPixels(spec: FurnitureTextureSpec, color: string, n: number, crop = 1): Promise<ImageData | null> {
  if (spec.color) {
    const img = await loadImage(url(spec, 'color'));
    if (!img) return null;
    const data = pixels(img, n, crop);
    tintPixels(data.data, tintToward(color, spec.avg ?? '#808080', TINT_CAP));
    return data;
  }
  const img = await loadImage(url(spec, 'normal'));
  if (!img) return null;
  const data = pixels(img, n, crop);
  shadeFromNormals(data.data, color, spec.cavity ?? 0.3, data.data);
  return data;
}

function colourMap(spec: FurnitureTextureSpec, color: string): THREE.Texture {
  return sharedMap(`${spec.set}|color|${spec.cavity ?? 0}|${color}`, color, THREE.SRGBColorSpace, spec.size, (n) => colourPixels(spec, color, n));
}

function normalMap(spec: FurnitureTextureSpec): THREE.Texture {
  const k = spec.normalScale ?? 1;
  return sharedMap(`${spec.set}|normal|${k}`, 'rgb(128,128,255)', THREE.NoColorSpace, spec.size, async (n) => {
    const img = await loadImage(url(spec, 'normal'));
    if (!img) return null;
    const data = pixels(img, n);
    scaleNormals(data.data, k);
    return data;
  });
}

function roughMap(spec: FurnitureTextureSpec): THREE.Texture {
  const mean = spec.roughMean ?? 0.9;
  const fill = Math.round(mean * 255);
  return sharedMap(`${spec.set}|rough|${mean}`, `rgb(${fill},${fill},${fill})`, THREE.NoColorSpace, spec.size, async (n) => {
    const img = await loadImage(url(spec, 'rough'));
    if (!img) return null;
    const data = pixels(img, n);
    normaliseRoughness(data.data, mean);
    return data;
  });
}

/** What the catalog gets for a material: see `FurnitureTextures`. */
export function resolveTextures(material: FurnitureMaterial): FurnitureTextures | null {
  const spec = furnitureTextureSpec(material);
  if (!spec) return null;
  const out: FurnitureTextures = {};
  if (spec.color || spec.cavity) {
    out.map = colourMap(spec, material.color.toLowerCase());
    out.tint = false;
  }
  if (detail && spec.normal) out.normalMap = normalMap(spec);
  if (detail && spec.rough) out.roughnessMap = roughMap(spec);
  return out.map || out.normalMap || out.roughnessMap ? out : null;
}

/* ---------------------------------------------------------------- swatches */

const SWATCH = 72;
const swatches = new Map<string, Promise<string | null>>();

/**
 * A small picture (data URL) of a furniture finish as the 3D view draws it: a cut of its
 * texture at a readable scale, tinted to the finish. Null for flat finishes (lacquer,
 * glass, polished metal), which a swatch shows as their colour.
 */
export function furnitureSwatch(value: string, kind?: FinishKind): Promise<string | null> {
  const key = `${value}|${kind ?? ''}`;
  let p = swatches.get(key);
  if (!p) {
    p = (async () => {
      const material = resolveFurnitureMaterial(value, kind);
      const spec = material && furnitureTextureSpec(material);
      if (!material || !spec || typeof document === 'undefined') return null;
      const crop = Math.min(1, spec.swatch / spec.size);
      let data: ImageData | null;
      if (spec.color || spec.cavity) data = await colourPixels(spec, material.color.toLowerCase(), SWATCH, crop);
      else {
        // Brushed metal: its colour, streaked by the normal map.
        const img = await loadImage(url(spec, 'normal'));
        data = img ? pixels(img, SWATCH, crop) : null;
        if (data) shadeFromNormals(data.data, material.color.toLowerCase(), 0.5, data.data);
      }
      if (!data) return null;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SWATCH;
      canvas.getContext('2d')!.putImageData(data, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.85);
    })().catch(() => null);
    swatches.set(key, p);
  }
  return p;
}
