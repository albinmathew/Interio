/**
 * Pixel work behind the texture maps: tinting a colour map towards a finish colour,
 * baking cloth shading from a normal map, evening out roughness maps, and the procedural
 * patterns (flutes, slats, wainscot panels). Pure: RGBA byte arrays in, out, no DOM.
 */
import { hexToLinear } from './materialSpecs';

const LIN = Float32Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Linear 0..1 -> sRGB byte. */
export function linearToByte(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
}

/** sRGB byte -> linear 0..1. */
export const byteToLinear = (v: number): number => LIN[v]!;

/** Average colour of RGBA sRGB pixels, in linear RGB. */
export function averageLinear(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.max(1, data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    r += LIN[data[i]!]!;
    g += LIN[data[i + 1]!]!;
    b += LIN[data[i + 2]!]!;
  }
  return [r / n, g / n, b / n];
}

/** Multiplies RGBA sRGB pixels by a linear-light colour, in place. */
export function tintPixels(data: Uint8ClampedArray, multiplier: readonly [number, number, number]): Uint8ClampedArray {
  const luts = multiplier.map((k) => Uint8ClampedArray.from({ length: 256 }, (_, v) => linearToByte(LIN[v]! * k)));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = luts[0]![data[i]!]!;
    data[i + 1] = luts[1]![data[i + 1]!]!;
    data[i + 2] = luts[2]![data[i + 2]!]!;
  }
  return data;
}

/** A soft key light from the upper left, as a unit vector in tangent space. */
const LIGHT = (() => {
  const v = [-0.45, 0.5, 0.74];
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as [number, number, number];
})();

/**
 * Turns a normal map (OpenGL convention) into a colour map of `color` (sRGB hex) shaded
 * by a fixed light: flat texels keep the colour, the sides of a weave or a grain go
 * darker or lighter by up to `strength`. Writes into `out` (RGBA) and returns it.
 */
export function shadeFromNormals(normal: Uint8ClampedArray, color: string, strength: number, out = new Uint8ClampedArray(normal.length)): Uint8ClampedArray {
  const [r, g, b] = hexToLinear(color);
  for (let i = 0; i < normal.length; i += 4) {
    const nx = normal[i]! / 127.5 - 1;
    const ny = normal[i + 1]! / 127.5 - 1;
    const nz = Math.max(0.05, normal[i + 2]! / 127.5 - 1);
    const len = Math.hypot(nx, ny, nz);
    // 1 for a flat texel; lower where the surface turns away from the light.
    const lambert = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len / LIGHT[2];
    // Steep texels (the gaps between threads) also catch less light from anywhere.
    const occlusion = nz / len;
    const k = Math.max(0.35, Math.min(1.3, 1 + strength * (lambert - 1) - strength * 0.6 * (1 - occlusion)));
    out[i] = linearToByte(r * k);
    out[i + 1] = linearToByte(g * k);
    out[i + 2] = linearToByte(b * k);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Rescales a roughness map (green channel) so its mean is `mean` (0..1), in place. three
 * multiplies the material's roughness by the map, so the material keeps roughly the
 * roughness it was given while the map adds the variation.
 */
export function normaliseRoughness(data: Uint8ClampedArray, mean = 0.9): Uint8ClampedArray {
  let sum = 0;
  for (let i = 1; i < data.length; i += 4) sum += data[i]!;
  const avg = sum / Math.max(1, data.length / 4) / 255;
  const k = avg > 0.005 ? mean / avg : 1;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.min(255, Math.round(data[i + 1]! * k));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return data;
}

/* ---------------------------------------------------------------- patterns */

/**
 * A relief drawn procedurally: a height field over one repeat of the texture, turned into
 * a normal map and a shade (darker in the grooves). `u` runs left to right, `v` from the
 * bottom (floor) up, both 0..1 over the repeat.
 */
export type HeightField = (u: number, v: number) => number;

export const PATTERNS = {
  /** Vertical half-round flutes, `count` across the repeat, with a small gap between them. */
  flutes:
    (count: number): HeightField =>
    (u) => {
      const t = (u * count) % 1;
      const x = (t - 0.5) / 0.44;
      return Math.abs(x) >= 1 ? 0 : Math.sqrt(1 - x * x);
    },
  /** Parallel boards along v, `count` across the repeat, with a dark shadow gap. */
  slats:
    (count: number, gap = 0.12): HeightField =>
    (u) => {
      const t = (u * count) % 1;
      const edge = Math.min(t, 1 - t) / gap;
      return Math.min(1, edge * 2);
    },
  /**
   * Panelled wainscot: up to `top` (share of the repeat height) a dado rail over a row
   * of `count` raised panels; plain wall above.
   */
  wainscot:
    (count: number, top: number): HeightField =>
    (u, v) => {
      if (v > top + 0.012) return 0;
      // Dado rail: a rounded moulding along the top of the panelling.
      if (v > top - 0.018) {
        const x = (v - (top - 0.003)) / 0.015;
        return 0.8 + 0.4 * Math.max(0, 1 - x * x);
      }
      // Distance inside the frame (stiles and rails), in repeat units.
      const t = (u * count) % 1;
      const du = (Math.min(t, 1 - t) / count) - 0.018;
      const dv = Math.min(v - 0.05, top - 0.04 - v);
      const d = Math.min(du, dv);
      if (d <= 0) return 0.6;
      // A recessed panel with a bevelled edge.
      return 0.6 - Math.min(0.2, d * 25);
    },
} as const;

/**
 * Normal map (RGBA, OpenGL convention) and shade (0..1 per texel) of a height field on a
 * `size` x `size` canvas. `depth` scales the relief.
 */
export function relief(field: HeightField, size: number, depth = 1): { normal: Uint8ClampedArray; shade: Float32Array } {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    // Canvas rows run top-down; v runs bottom-up (textures are flipped on upload).
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) h[y * size + x] = field((x + 0.5) / size, v);
  }
  const normal = new Uint8ClampedArray(size * size * 4);
  const shade = new Float32Array(size * size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * depth;
      // +y in the normal map points up the texture, which is up the canvas (towards row 0).
      const dy = (at(x, y - 1) - at(x, y + 1)) * depth;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = Math.round((-dx / len + 1) * 127.5);
      normal[i + 1] = Math.round((-dy / len + 1) * 127.5);
      normal[i + 2] = Math.round((1 / len + 1) * 127.5);
      normal[i + 3] = 255;
      // Low and steep texels sit in shadow.
      shade[y * size + x] = Math.max(0.45, Math.min(1, 0.72 + 0.28 * at(x, y) + 0.15 * (1 / len - 1)));
    }
  }
  return { normal, shade };
}

/** Multiplies RGBA sRGB pixels by a per-texel shade (linear), in place. */
export function applyShade(data: Uint8ClampedArray, shade: Float32Array): Uint8ClampedArray {
  for (let p = 0, i = 0; p < shade.length; p++, i += 4) {
    const k = shade[p]!;
    data[i] = linearToByte(LIN[data[i]!]! * k);
    data[i + 1] = linearToByte(LIN[data[i + 1]!]! * k);
    data[i + 2] = linearToByte(LIN[data[i + 2]!]! * k);
  }
  return data;
}
