/**
 * Swatch images for the finishes palette: a small cut of the finish's texture, tinted
 * the way the 3D view tints it. Finishes without a texture have no image (the caller
 * shows their flat colour).
 */
import { MATERIALS } from '@interio/core';
import { textureSpecFor, tintToward } from '@interio/scene3d';
import { useEffect, useState } from 'react';
import { tintPixels } from './finishes';

const SIZE = 96;
const ready = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function build(id: string): Promise<string | null> {
  const spec = textureSpecFor(id);
  const def = MATERIALS[id];
  if (!spec || !def) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const pixels = ctx.getImageData(0, 0, SIZE, SIZE);
        tintPixels(pixels.data, tintToward(def.color, spec.avg));
        ctx.putImageData(pixels, 0, 0);
        const url = canvas.toDataURL('image/jpeg', 0.85);
        ready.set(id, url);
        resolve(url);
      } catch {
        resolve(null);
      }
    };
    // Missing file: the flat colour stays.
    img.onerror = () => resolve(null);
    img.src = `/textures/${spec.set}/swatch.jpg`;
  });
}

/** Data URL of the finish's swatch once it is ready; null for flat colours and while it loads. */
export function useSwatch(id: string): string | null {
  const [url, setUrl] = useState<string | null>(() => ready.get(id) ?? null);
  useEffect(() => {
    let alive = true;
    setUrl(ready.get(id) ?? null);
    if (ready.has(id) || !textureSpecFor(id)) return;
    let p = pending.get(id);
    if (!p) {
      p = build(id);
      pending.set(id, p);
    }
    void p.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}
