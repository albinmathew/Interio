/**
 * The world outside the windows: a panorama behind the home (`scene.background`), turned
 * so that its sun stands where the scene's sun is. Its HDR copy is read once on load: the
 * position of its sun and a small linear copy for the colour of the sky seen through each
 * window (`WindowLights`).
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useState } from 'react';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { LightingPreset } from './lighting';
import { OUTSIDE_ASSETS, brightestPoint, rotationForSun, shrinkPanorama, type OutsideView, type Panorama } from './outside';

export interface PanoramaInfo {
  /** The HDR, ready for `scene.environment` (three prefilters it on first use). */
  texture: THREE.Texture;
  /** Image point of the sun (0..1, v = 0 at the top) and how bright it is. */
  sun: { u: number; v: number; luminance: number };
  /** 64 x 32 linear copy for cheap lookups. */
  small: Panorama;
}

const hdrs = new Map<string, Promise<PanoramaInfo>>();

/** Loads (once per URL) and reads an equirectangular HDR. */
export function loadPanorama(url: string): Promise<PanoramaInfo> {
  let p = hdrs.get(url);
  if (!p) {
    p = new Promise<PanoramaInfo>((resolve, reject) => {
      new HDRLoader().load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const image = texture.image as { data: Uint16Array | Float32Array; width: number; height: number };
          const { data, width, height } = image;
          const half = data instanceof Uint16Array;
          const at = (k: number) => (half ? THREE.DataUtils.fromHalfFloat(data[k]!) : data[k]!);
          // The texture is flipped on upload (flipY), so row 0 of the data is the top of the image.
          const read = (i: number): [number, number, number] => [at(i * 4), at(i * 4 + 1), at(i * 4 + 2)];
          resolve({ texture, sun: brightestPoint(width, height, read), small: shrinkPanorama(width, height, read) });
        },
        undefined,
        () => reject(new Error(`Panorama not found: ${url}`)),
      );
    });
    hdrs.set(url, p);
  }
  return p;
}

const backdrops = new Map<string, Promise<THREE.Texture>>();

function loadBackdrop(url: string): Promise<THREE.Texture> {
  let p = backdrops.get(url);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 8;
          resolve(texture);
        },
        undefined,
        () => reject(new Error(`Backdrop not found: ${url}`)),
      );
    });
    backdrops.set(url, p);
  }
  return p;
}

/** The panorama of a view, once loaded (null until then or when it cannot be loaded). */
export function usePanorama(view: OutsideView | null): PanoramaInfo | null {
  const [info, setInfo] = useState<PanoramaInfo | null>(null);
  useEffect(() => {
    if (!view) return;
    let alive = true;
    loadPanorama(OUTSIDE_ASSETS[view].hdr)
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [view]);
  return info;
}

/** How bright the backdrop is per preset, as a share of its daylight gain. */
const DIMMING: Record<LightingPreset, number> = { daylight: 1, evening: 0.42, night: 0.022 };

/** The rotation that turns a view's panorama so its sun stands at `sunAzimuth` (world `atan2(z, x)`); 0 while unknown. */
export function panoramaRotation(info: PanoramaInfo | null, sunAzimuth: number | null): number {
  return info && sunAzimuth !== null ? rotationForSun(info.sun.u, sunAzimuth) : 0;
}

export interface OutsideProps {
  view: OutsideView;
  preset: LightingPreset;
  /** Turn of the panorama about the vertical (see `panoramaRotation`). */
  rotation: number;
  /** Colour shown until the backdrop has loaded, and when it cannot be. */
  fallback: string;
  /** Extra multiplier on the backdrop's brightness (the low tier draws it without tone mapping). Default 1. */
  gain?: number;
}

/**
 * Puts the view's panorama behind everything while mounted. Seen through the glazing it is
 * bright and slightly overexposed by day, as in an interior photograph, dim and warm at
 * evening (the grade warms it) and nearly black at night.
 */
export function Outside({ view, preset, rotation, fallback, gain = 1 }: OutsideProps) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const asset = OUTSIDE_ASSETS[view];

  useEffect(() => {
    let alive = true;
    setTexture(null);
    loadBackdrop(asset.backdrop)
      .then((t) => alive && setTexture(t))
      .catch(() => {
        // No backdrop: the fallback colour stays.
      });
    return () => {
      alive = false;
    };
  }, [asset.backdrop]);

  useLayoutEffect(() => {
    const before = { background: scene.background, intensity: scene.backgroundIntensity, rotation: scene.backgroundRotation.clone() };
    scene.background = texture ?? new THREE.Color(fallback);
    scene.backgroundIntensity = texture ? asset.gain * DIMMING[preset] * gain : 1;
    scene.backgroundRotation.set(0, rotation, 0);
    invalidate();
    return () => {
      scene.background = before.background;
      scene.backgroundIntensity = before.intensity;
      scene.backgroundRotation.copy(before.rotation);
    };
  }, [scene, texture, fallback, asset.gain, preset, rotation, gain, invalidate]);
  return null;
}
