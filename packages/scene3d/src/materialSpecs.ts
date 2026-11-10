/**
 * Which tiling texture set each finish id from core's `MATERIALS` uses. Pure data and
 * maths: the three.js side lives in `materials.ts`. Sets are folders under
 * `apps/web/public/textures/<set>/{color,normal,rough}.jpg` (sources and licences in
 * `docs/assets/scene3d.md`).
 */

export interface TextureSpec {
  /** Folder name of the texture set. */
  set: string;
  /** Metres of surface covered by one repeat of the texture. Mesh UVs are in metres. */
  size: number;
  /** Rotation of the pattern in degrees. */
  rotate?: number;
  /** Average colour of the set's colour map (sRGB hex), used to tint it towards the finish colour. */
  avg: string;
  /** Multiplier on the roughness map. Default 1. */
  roughness?: number;
  /** Strength of the normal map. Default 1. */
  normalScale?: number;
}

const SETS = {
  oak: { set: 'oak-planks', size: 1.7, avg: '#9c8164' },
  walnut: { set: 'walnut-planks', size: 1.7, avg: '#816043' },
  herringbone: { set: 'herringbone', size: 2.6, avg: '#94704e' },
  deck: { set: 'deck', size: 1.5, avg: '#79593a' },
  concrete: { set: 'concrete', size: 2.7, avg: '#8d8570', normalScale: 0.6 },
  brick: { set: 'brick', size: 1.4, avg: '#906752' },
  // 8 x 8 tiles per repeat.
  tileLarge: { set: 'tile-large', size: 4.8, avg: '#f8f8f8', normalScale: 0.7 },
  // 12 x 12 tiles per repeat.
  tileSmall: { set: 'tile-small', size: 3.6, avg: '#d2dee1' },
  subway: { set: 'tile-subway', size: 1.2, avg: '#c0bfbf' },
  marble: { set: 'marble', size: 2.4, avg: '#adaeb7', normalScale: 0.4 },
  terrazzo: { set: 'terrazzo', size: 1.6, avg: '#d8dddc', normalScale: 0.5 },
  carpet: { set: 'carpet', size: 1.4, avg: '#bcb094' },
} satisfies Record<string, TextureSpec>;

/** Finish id -> texture set. Finishes that are not listed (paints, ceilings) render as flat colour. */
export const SURFACE_TEXTURES: Record<string, TextureSpec> = {
  'floor.oak': SETS.oak,
  'floor.ash': SETS.oak,
  'floor.walnut': SETS.walnut,
  'floor.herringbone': SETS.herringbone,
  'floor.tile.white': SETS.tileLarge,
  'floor.tile.grey': SETS.tileLarge,
  'floor.tile.antiskid': { ...SETS.tileSmall, roughness: 2.2 },
  'floor.marble': SETS.marble,
  'floor.terrazzo': SETS.terrazzo,
  'floor.concrete': SETS.concrete,
  'floor.carpet.beige': SETS.carpet,
  'floor.carpet.grey': SETS.carpet,
  'floor.deck': SETS.deck,
  // 300 mm wall tiles.
  'wall.tile.white': { ...SETS.tileLarge, size: 2.4 },
  'wall.tile.subway': SETS.subway,
  'wall.brick': SETS.brick,
  'wall.concrete': SETS.concrete,
  'wall.wood': SETS.walnut,
};

export function textureSpecFor(finishId: string | undefined): TextureSpec | undefined {
  return finishId ? SURFACE_TEXTURES[finishId] : undefined;
}

/** sRGB hex (#rrggbb) -> linear RGB in 0..1. */
export function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/**
 * Linear RGB multiplier that moves a texture with average colour `avg` towards the
 * finish colour `target`, so one set can serve several finishes and the 3D view agrees
 * with the palette swatches. The multiplier keeps its hue but never brightens by more
 * than `cap`, which would wash out the texture.
 */
export function tintToward(target: string, avg: string, cap = 1.6): [number, number, number] {
  const t = hexToLinear(target);
  const a = hexToLinear(avg);
  const ratio = t.map((v, i) => v / Math.max(a[i]!, 0.02)) as [number, number, number];
  const max = Math.max(...ratio);
  const k = max > cap ? cap / max : 1;
  return ratio.map((v) => Math.max(0.04, v * k)) as [number, number, number];
}

/** UV transform for a spec: mesh UVs are metres, so one repeat spans `size` metres. */
export function uvTransform(spec: TextureSpec): { repeat: number; rotation: number } {
  return { repeat: 1 / spec.size, rotation: ((spec.rotate ?? 0) * Math.PI) / 180 };
}
