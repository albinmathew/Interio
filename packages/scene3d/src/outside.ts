/**
 * The world outside the windows: which panorama a project shows, where its files are,
 * and the maths to read a panorama (where its sun is, how bright the sky is in a
 * direction). Pure data and maths (no three.js), so it runs in Node; `Outside.tsx`
 * loads the files and puts them in the scene.
 */
import type { LightingPreset } from './lighting';

export const OUTSIDE_VIEWS = ['greenery', 'city', 'sky'] as const;
export type OutsideView = (typeof OUTSIDE_VIEWS)[number];

/** Trees and a garden at eye level: the owner's choice for every new project. */
export const DEFAULT_OUTSIDE: OutsideView = 'greenery';

/** Key of the outside view in `project.settings`. */
export const OUTSIDE_SETTING = 'scene.outside';

export const OUTSIDE_LABELS: Record<OutsideView, string> = {
  greenery: 'Greenery',
  city: 'City',
  sky: 'Open sky',
};

/** Any stored value -> an outside view. Unknown or missing values are the default (greenery). */
export function resolveOutside(value: unknown): OutsideView {
  return OUTSIDE_VIEWS.find((v) => v === value) ?? DEFAULT_OUTSIDE;
}

/** The outside view saved with a project (`project.settings`). */
export function outsideFromSettings(settings: Record<string, unknown> | null | undefined): OutsideView {
  return resolveOutside(settings?.[OUTSIDE_SETTING]);
}

/** Key of the cove-light switch in `project.settings`: true, false, or absent (follow the preset). */
export const COVE_SETTING = 'scene.coveLights';

/**
 * Whether the hidden LED coves of living rooms and bedrooms are on. A stored true or
 * false wins; otherwise they come on with the evening and night presets.
 */
export function coveLightsOn(settings: Record<string, unknown> | null | undefined, preset: LightingPreset): boolean {
  const stored = settings?.[COVE_SETTING];
  return typeof stored === 'boolean' ? stored : preset !== 'daylight';
}

export interface OutsideAsset {
  /** 1k Radiance HDR: image-based light, the sun's position and the colour of the sky through each window. */
  hdr: string;
  /** 2k tone-mapped JPG of the same panorama: the backdrop seen through the glass (sharper than the 1k HDR). */
  backdrop: string;
  /** Multiplier on the backdrop by day: above 1 it reads bright and slightly overexposed, like a real interior photo. */
  gain: number;
}

/** CC0 panoramas from Poly Haven (sources in docs/assets/scene3d.md). */
export const OUTSIDE_ASSETS: Record<OutsideView, OutsideAsset> = {
  greenery: { hdr: '/env/roof_garden_1k.hdr', backdrop: '/env/roof_garden_2k.jpg', gain: 1.5 },
  city: { hdr: '/env/hotel_rooftop_balcony_1k.hdr', backdrop: '/env/hotel_rooftop_balcony_2k.jpg', gain: 1.35 },
  sky: { hdr: '/env/kloofendal_48d_partly_cloudy_puresky_1k.hdr', backdrop: '/env/kloofendal_48d_partly_cloudy_puresky_2k.jpg', gain: 1.3 },
};

/* ------------------------------------------------------------ panoramas */

/**
 * A small, linear-light copy of an equirectangular panorama: `rgb` holds `width * height`
 * texels, row 0 at the top (the zenith). three's convention: column u (0..1) looks along
 * the direction whose azimuth `atan2(z, x)` is `(u - 0.5) * 2 PI`.
 */
export interface Panorama {
  width: number;
  height: number;
  rgb: Float32Array;
}

/** World direction (unit, Y up) of a point on an equirectangular image; v = 0 is the top row. */
export function panoramaDirection(u: number, v: number): [number, number, number] {
  const azimuth = (u - 0.5) * 2 * Math.PI;
  const elevation = (0.5 - v) * Math.PI;
  const c = Math.cos(elevation);
  return [Math.cos(azimuth) * c, Math.sin(elevation), Math.sin(azimuth) * c];
}

/** Azimuth `atan2(z, x)` of a world direction, radians. */
export const azimuthOf = (d: readonly [number, number, number]): number => Math.atan2(d[2], d[0]);

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The brightest point of a panorama, as image coordinates (0..1, v = 0 at the top): the
 * sun, when it shows. `read(i)` returns the linear RGB of texel i (row-major from the top).
 * Only the upper half is searched: a bright patch on the ground is not the sun.
 */
export function brightestPoint(width: number, height: number, read: (i: number) => [number, number, number]): { u: number; v: number; luminance: number } {
  let best = -1;
  let at = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const [r, g, b] = read(i);
      const l = luminance(r, g, b);
      if (l > best) {
        best = l;
        at = i;
      }
    }
  }
  return { u: ((at % width) + 0.5) / width, v: (Math.floor(at / width) + 0.5) / height, luminance: best };
}

/** Box-filters a panorama down to `width x height` (linear light), for cheap lookups. */
export function shrinkPanorama(srcWidth: number, srcHeight: number, read: (i: number) => [number, number, number], width = 64, height = 32): Panorama {
  const rgb = new Float32Array(width * height * 3);
  const count = new Float32Array(width * height);
  for (let y = 0; y < srcHeight; y++) {
    const ty = Math.min(height - 1, Math.floor((y / srcHeight) * height));
    for (let x = 0; x < srcWidth; x++) {
      const tx = Math.min(width - 1, Math.floor((x / srcWidth) * width));
      const t = ty * width + tx;
      const [r, g, b] = read(y * srcWidth + x);
      rgb[t * 3] += r;
      rgb[t * 3 + 1] += g;
      rgb[t * 3 + 2] += b;
      count[t] += 1;
    }
  }
  for (let t = 0; t < count.length; t++) {
    const n = count[t] || 1;
    rgb[t * 3] /= n;
    rgb[t * 3 + 1] /= n;
    rgb[t * 3 + 2] /= n;
  }
  return { width, height, rgb };
}

/**
 * Light arriving through an opening that looks out along `outward` (a horizontal world
 * direction): the cosine-weighted average radiance of the half of the panorama in front
 * of it, with the panorama turned by `rotationY` (as `scene.backgroundRotation.y`).
 * Linear RGB.
 */
export function radianceThrough(p: Panorama, outward: readonly [number, number, number], rotationY = 0): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  let weight = 0;
  const [ox, oy, oz] = outward;
  for (let y = 0; y < p.height; y++) {
    const v = (y + 0.5) / p.height;
    // Rows near the poles cover less of the sphere.
    const solid = Math.cos((0.5 - v) * Math.PI);
    for (let x = 0; x < p.width; x++) {
      const [dx, dy, dz] = panoramaDirection((x + 0.5) / p.width, v);
      // A texel at image azimuth a is seen at world azimuth a - rotationY.
      const c = Math.cos(-rotationY);
      const s = Math.sin(-rotationY);
      const wx = dx * c - dz * s;
      const wz = dx * s + dz * c;
      const facing = wx * ox + dy * oy + wz * oz;
      if (facing <= 0) continue;
      const w = facing * solid;
      const t = (y * p.width + x) * 3;
      sum[0] += p.rgb[t]! * w;
      sum[1] += p.rgb[t + 1]! * w;
      sum[2] += p.rgb[t + 2]! * w;
      weight += w;
    }
  }
  return weight > 0 ? [sum[0] / weight, sum[1] / weight, sum[2] / weight] : [0, 0, 0];
}

/**
 * `scene.backgroundRotation.y` (and `environmentRotation.y`) that puts a panorama's sun,
 * found at image column `sunU`, in the world azimuth `azimuth` (radians, `atan2(z, x)`).
 * three looks the background up along `R^T * direction`, so an image direction at azimuth
 * a appears at a - rotation.
 */
export function rotationForSun(sunU: number, azimuth: number): number {
  const image = (sunU - 0.5) * 2 * Math.PI;
  const r = image - azimuth;
  return Math.atan2(Math.sin(r), Math.cos(r));
}
