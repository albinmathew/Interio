/**
 * PBR surface materials for finishes. A material starts as the finish's flat colour and
 * picks up its tiling textures when (and if) they load, so a missing or slow texture
 * never blocks or breaks the scene.
 */
import { resolveSurfaceFinish, type MaterialDef } from '@interio/core';
import { invalidate } from '@react-three/fiber';
import * as THREE from 'three';
import { textureSpecFor, tintToward, uvTransform, type TextureSpec } from './materialSpecs';
import { PATTERNS, applyShade, relief } from './texturePixels';

let baseUrl = '/textures';

/** Where the texture sets are served from. Default `/textures` (apps/web/public/textures). */
export function setTextureBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '');
}

interface TextureSet {
  color: THREE.Texture | null;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
}

const sets = new Map<string, Promise<TextureSet>>();
const variants = new Map<string, Promise<TextureSet>>();

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, () => reject(new Error(`Texture not found: ${url}`)));
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Texture not found: ${url}`));
    img.src = url;
  });
}

/** The pattern's relief over the set's colour map (or over white), as canvas textures. */
async function patternSet(spec: TextureSpec): Promise<TextureSet> {
  const pattern = spec.pattern!;
  const n = 1024;
  const field =
    pattern.kind === 'flutes' ? PATTERNS.flutes(pattern.count) : pattern.kind === 'slats' ? PATTERNS.slats(pattern.count) : PATTERNS.wainscot(pattern.count, pattern.top ?? 0.3);
  const { normal, shade } = relief(field, n, pattern.depth ?? 1);
  const canvas = (data: Uint8ClampedArray) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, n, n), 0, 0);
    return c;
  };
  const base = document.createElement('canvas');
  base.width = base.height = n;
  const ctx = base.getContext('2d', { willReadFrequently: true })!;
  if (spec.set) ctx.drawImage(await loadImage(`${baseUrl}/${spec.set}/color.jpg`), 0, 0, n, n);
  else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, n, n);
  }
  const pixels = ctx.getImageData(0, 0, n, n);
  applyShade(pixels.data, shade);
  const color = new THREE.CanvasTexture(canvas(pixels.data));
  color.colorSpace = THREE.SRGBColorSpace;
  return { color, normal: new THREE.CanvasTexture(canvas(normal)), rough: null };
}

function loadSet(spec: TextureSpec): Promise<TextureSet> {
  const key = spec.pattern ? `${spec.set}+${spec.pattern.kind}${spec.pattern.count}` : spec.set!;
  let p = sets.get(key);
  if (!p) {
    if (spec.pattern) p = patternSet(spec);
    else {
      const dir = `${baseUrl}/${spec.set}`;
      const optional = (name: string) => loadTexture(`${dir}/${name}.jpg`).catch(() => null);
      p = Promise.all([spec.noColor ? null : loadTexture(`${dir}/color.jpg`), optional('normal'), optional('rough')]).then(([color, normal, rough]) => {
        if (color) color.colorSpace = THREE.SRGBColorSpace;
        return { color, normal, rough };
      });
    }
    sets.set(key, p);
  }
  return p;
}

/** The set's textures with this spec's tiling. Clones share the image, so it uploads once. */
function loadVariant(spec: TextureSpec): Promise<TextureSet> {
  const key = `${spec.set}@${spec.size}@${spec.rotate ?? 0}@${spec.pattern?.kind ?? ''}`;
  let p = variants.get(key);
  if (!p) {
    const { repeat, rotation } = uvTransform(spec);
    const place = (t: THREE.Texture | null) => {
      if (!t) return null;
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat, repeat);
      c.rotation = rotation;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    p = loadSet(spec).then((s) => ({ color: place(s.color), normal: place(s.normal), rough: place(s.rough) }));
    variants.set(key, p);
  }
  return p;
}

export interface SurfaceFallback {
  color: string;
  roughness: number;
}

export interface SurfaceMaterialOptions {
  /** Tiling textures. Default true; flat colours otherwise. */
  textures?: boolean;
  /** The surface the finish is on: decides what a custom colour (`#rrggbb`) looks like. */
  surface?: MaterialDef['surface'];
}

/**
 * A new material for a finish: a palette id (see `MATERIALS` in core) or a custom colour
 * as `#rrggbb` (`resolveSurfaceFinish`). Unknown values use `fallback`. Each call returns
 * its own instance so callers may fade or tint it; textures are shared. The material's
 * `name` is the finish it shows. Dispose it when done.
 */
export function createSurfaceMaterial(finishId: string | undefined, fallback: SurfaceFallback, opts: SurfaceMaterialOptions = {}): THREE.MeshStandardMaterial {
  const def = resolveSurfaceFinish(finishId, opts.surface ?? 'wall');
  const color = def?.color ?? fallback.color;
  const material = new THREE.MeshStandardMaterial({
    name: def?.id ?? '',
    color,
    roughness: def?.roughness ?? fallback.roughness,
    metalness: def?.metalness ?? 0,
  });
  const spec = opts.textures === false ? undefined : textureSpecFor(def?.id, opts.surface);
  if (!spec || typeof document === 'undefined') return material;

  let disposed = false;
  material.addEventListener('dispose', () => {
    disposed = true;
  });
  loadVariant(spec)
    .then((maps) => {
      if (disposed) return;
      if (maps.color) {
        material.map = maps.color;
        material.color.setRGB(...tintToward(color, spec.avg));
      }
      if (maps.normal) {
        material.normalMap = maps.normal;
        material.normalScale.setScalar(spec.normalScale ?? 1);
      }
      if (maps.rough) {
        material.roughnessMap = maps.rough;
        material.roughness = spec.roughness ?? 1;
      }
      material.needsUpdate = true;
      invalidate();
    })
    .catch(() => {
      // Texture missing: the flat finish colour stays.
    });
  return material;
}
