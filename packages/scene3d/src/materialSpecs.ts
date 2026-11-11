/**
 * Which tiling texture set each finish id from core's `MATERIALS` uses. Pure data and
 * maths: the three.js side lives in `materials.ts`. Sets are folders under
 * `apps/web/public/textures/<set>/{color,normal,rough}.jpg` (sources and licences in
 * `docs/assets/scene3d.md`).
 */

/** A relief drawn in code over one repeat (see `PATTERNS` in `texturePixels.ts`). */
export interface PatternSpec {
  kind: 'flutes' | 'slats' | 'wainscot';
  /** Flutes, boards or panels across one repeat. */
  count: number;
  /** Wainscot: height of the panelling as a share of the repeat. */
  top?: number;
  /** Strength of the relief in the normal map. Default 1. */
  depth?: number;
}

export interface TextureSpec {
  /** Folder name of the texture set, or null for a pattern drawn in code on a plain colour. */
  set: string | null;
  /** The set has no colour map: the finish colour shows through the normal and roughness maps. */
  noColor?: boolean;
  /** Relief drawn over the set (or over plain colour). */
  pattern?: PatternSpec;
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
  // About 9 cm boards laid in chevron, 1.8 m per repeat.
  chevron: { set: 'chevron', size: 1.8, avg: '#98785b' },
  travertine: { set: 'travertine', size: 1.2, avg: '#decaab', normalScale: 0.5 },
  // Large-format slate tiles.
  slate: { set: 'slate', size: 2.3, avg: '#4d4d4d' },
  marbleBlack: { set: 'marble-black', size: 2.4, avg: '#3d3e3d' },
  // Trowelled plaster: microcement, and the floor a custom colour gets.
  microcement: { set: 'plaster', size: 2, avg: '#d6d2ce', normalScale: 0.5 },
  // Linen weave: no colour map, the finish colour shows through the weave.
  linen: { set: 'fabric-linen', size: 0.27, avg: '#ffffff', noColor: true },
  // 3 cm oak flutes.
  fluted: { set: 'wood-oak', size: 1.2, avg: '#a07d56', pattern: { kind: 'flutes', count: 40, depth: 3 } },
  // Panelled lower wall to 95 cm, painted.
  wainscot: { set: null, size: 3.2, avg: '#ffffff', pattern: { kind: 'wainscot', count: 6, top: 0.3, depth: 4 } },
  // 10 cm boards with a shadow gap.
  slats: { set: 'wood-oak', size: 1.2, avg: '#a07d56', pattern: { kind: 'slats', count: 12, depth: 3 } },
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
  'floor.oak.smoked': SETS.oak,
  'floor.oak.grey': SETS.oak,
  'floor.chevron': SETS.chevron,
  'floor.travertine': SETS.travertine,
  'floor.slate': SETS.slate,
  'floor.marble.black': SETS.marbleBlack,
  'floor.microcement': SETS.microcement,
  'wall.wallpaper.linen': SETS.linen,
  'wall.panel.fluted': SETS.fluted,
  'wall.panel.wainscot': SETS.wainscot,
  'wall.stone.travertine': SETS.travertine,
  'wall.marble': SETS.marble,
  'wall.microcement': SETS.microcement,
  // Hand-made 10 cm square tiles.
  'wall.tile.zellige': { ...SETS.tileSmall, size: 1.2 },
  'ceiling.wood': SETS.slats,
};

/**
 * Finishes that are deliberately one flat colour: the paints and the white ceiling. Every
 * other palette id has a texture set above.
 */
export function isFlatFinish(finishId: string): boolean {
  return finishId.startsWith('wall.paint.') || finishId === 'ceiling.white';
}

/** A custom floor colour gets the trowelled finish; custom wall and ceiling colours are matte paint. */
export const CUSTOM_FLOOR_TEXTURE: TextureSpec = SETS.microcement;

/**
 * The texture set of a finish: a palette id, or a custom colour (`#rrggbb`) on a surface.
 * Undefined for flat finishes.
 */
export function textureSpecFor(finishId: string | undefined, surface?: 'floor' | 'wall' | 'ceiling'): TextureSpec | undefined {
  if (!finishId) return undefined;
  if (/^#[0-9a-fA-F]{6}$/.test(finishId)) return surface === 'floor' ? CUSTOM_FLOOR_TEXTURE : undefined;
  return SURFACE_TEXTURES[finishId];
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
