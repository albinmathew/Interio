/**
 * PBR surface materials for finishes. A material starts as the finish's flat colour and
 * picks up its tiling textures when (and if) they load, so a missing or slow texture
 * never blocks or breaks the scene.
 */
import { MATERIALS } from '@interio/core';
import { invalidate } from '@react-three/fiber';
import * as THREE from 'three';
import { textureSpecFor, tintToward, uvTransform, type TextureSpec } from './materialSpecs';

let baseUrl = '/textures';

/** Where the texture sets are served from. Default `/textures` (apps/web/public/textures). */
export function setTextureBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '');
}

interface TextureSet {
  color: THREE.Texture;
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

function loadSet(set: string): Promise<TextureSet> {
  let p = sets.get(set);
  if (!p) {
    const dir = `${baseUrl}/${set}`;
    const optional = (name: string) => loadTexture(`${dir}/${name}.jpg`).catch(() => null);
    p = Promise.all([loadTexture(`${dir}/color.jpg`), optional('normal'), optional('rough')]).then(([color, normal, rough]) => {
      color.colorSpace = THREE.SRGBColorSpace;
      return { color, normal, rough };
    });
    sets.set(set, p);
  }
  return p;
}

/** The set's textures with this spec's tiling. Clones share the image, so it uploads once. */
function loadVariant(spec: TextureSpec): Promise<TextureSet> {
  const key = `${spec.set}@${spec.size}@${spec.rotate ?? 0}`;
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
    p = loadSet(spec.set).then((s) => ({ color: place(s.color)!, normal: place(s.normal), rough: place(s.rough) }));
    variants.set(key, p);
  }
  return p;
}

export interface SurfaceFallback {
  color: string;
  roughness: number;
}

/**
 * A new material for a finish id (see `MATERIALS` in core). Unknown ids use `fallback`.
 * Each call returns its own instance so callers may fade or tint it; textures are shared.
 * Dispose it when done.
 */
export function createSurfaceMaterial(
  finishId: string | undefined,
  fallback: SurfaceFallback,
  opts: { textures?: boolean } = {},
): THREE.MeshStandardMaterial {
  const def = finishId ? MATERIALS[finishId] : undefined;
  const color = def?.color ?? fallback.color;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: def?.roughness ?? fallback.roughness,
    metalness: def?.metalness ?? 0,
  });
  const spec = opts.textures === false ? undefined : textureSpecFor(def?.id);
  if (!spec || typeof document === 'undefined') return material;

  let disposed = false;
  material.addEventListener('dispose', () => {
    disposed = true;
  });
  loadVariant(spec)
    .then((maps) => {
      if (disposed) return;
      material.map = maps.color;
      material.color.setRGB(...tintToward(color, spec.avg));
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
