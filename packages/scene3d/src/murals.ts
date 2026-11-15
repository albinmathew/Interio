/**
 * Mural materials: one picture mapped across a wall face (see `muralSpecs.ts` for the
 * maths). Built-in murals are painted in code at the face's shape (`muralArt.ts`); a
 * user's own picture comes from the app through `setMuralImageLoader`, so the image never
 * leaves the browser. Like every surface material, a mural starts as its flat colour and
 * picks up the picture when it is ready.
 */
import { resolveSurfaceFinish, parseMuralFinish, type MuralSource } from '@interio/core';
import { invalidate } from '@react-three/fiber';
import * as THREE from 'three';
import { paintMural } from './muralArt';
import { faceExtent, faceRunsLeftward, muralRegion, muralTransform, paintAspect } from './muralSpecs';

/** Reads the image behind a user's mural asset (a Blob), or null when the project has none. */
export type MuralImageLoader = (assetId: string) => Promise<Blob | null>;

let loader: MuralImageLoader | null = null;
/** Images handed over directly (a picture the user just chose), before storage has them. */
const provided = new Map<string, Blob>();
const textures = new Map<string, Promise<THREE.Texture | null>>();

/** Where user murals come from: the app reads them from the open project's stored assets. */
export function setMuralImageLoader(fn: MuralImageLoader | null): void {
  loader = fn;
}

/** Makes a mural asset's image available at once (it is also being saved with the project). */
export function provideMuralImage(assetId: string, image: Blob): void {
  provided.set(assetId, image);
  textures.delete(`asset:${assetId}`);
}

/** The longest side a mural texture gets: plenty for a wall, and within every GPU's limit. */
const MAX_SIDE = 4096;

function canvasTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

async function decode(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Mural image could not be read'));
      el.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The shared texture of a mural (one per picture; built-in art one per painted shape). */
function muralTexture(source: MuralSource, aspect: number): Promise<THREE.Texture | null> {
  const key = source.kind === 'builtin' ? `builtin:${source.art}@${aspect}` : `asset:${source.assetId}`;
  let p = textures.get(key);
  if (!p) {
    if (source.kind === 'builtin') {
      const height = 1600;
      const width = Math.round(Math.min(MAX_SIDE, height * aspect));
      // Painting takes a moment: let the frame with the flat colour go out first.
      p = new Promise<THREE.Texture | null>((resolve) => {
        setTimeout(() => {
          try {
            resolve(canvasTexture(paintMural(source.art, width, Math.round(width / aspect))));
          } catch {
            resolve(null);
          }
        }, 0);
      });
    } else {
      const id = source.assetId;
      const blob = provided.get(id) ? Promise.resolve(provided.get(id)!) : (loader?.(id) ?? Promise.resolve(null));
      p = blob.then((b) => (b ? decode(b).then(canvasTexture) : null)).catch(() => null);
      // A missing picture may turn up later (storage was still writing it): try again next time.
      void p.then((t) => {
        if (!t) textures.delete(key);
      });
    }
    textures.set(key, p);
  }
  return p;
}

/** Geometry of the face a mural is put on, as `geometryFromMesh` builds it. */
export interface MuralFace {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  uvs: ArrayLike<number>;
  indices?: ArrayLike<number>;
}

/**
 * A new material showing mural `finishId` across one wall face, or null when the id is not
 * a mural. Each call returns its own material and its own placement of the shared picture;
 * dispose it when done.
 */
export function createMuralMaterial(finishId: string, face: MuralFace): THREE.MeshStandardMaterial | null {
  const mural = parseMuralFinish(finishId);
  const def = resolveSurfaceFinish(finishId, 'wall');
  if (!mural || !def) return null;
  const material = new THREE.MeshStandardMaterial({ name: def.id, color: def.color, roughness: def.roughness, metalness: 0 });
  if (typeof document === 'undefined') return material;

  const region = muralRegion(faceExtent(face.uvs), mural.dado);
  const mirror = faceRunsLeftward(face.positions, face.normals, face.uvs, face.indices);
  let disposed = false;
  let placed: THREE.Texture | null = null;
  material.addEventListener('dispose', () => {
    disposed = true;
    // The clone only carries the placement: three frees the shared picture once no texture uses it.
    placed?.dispose();
  });
  void muralTexture(mural.source, paintAspect(region)).then((texture) => {
    if (disposed || !texture) return;
    const image = texture.image as { width: number; height: number };
    const t = texture.clone();
    const { repeat, offset } = muralTransform(region, image.width / image.height, mirror);
    t.repeat.set(repeat[0], repeat[1]);
    t.offset.set(offset[0], offset[1]);
    // No `needsUpdate`: that would upload the shared picture again. The clone is new, so it uploads once.
    placed = t;
    material.map = t;
    material.color.set('#ffffff');
    material.needsUpdate = true;
    invalidate();
  });
  return material;
}
