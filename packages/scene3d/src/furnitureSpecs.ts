/**
 * Which texture set each furniture material uses, and at what real size. Pure data (no
 * three.js, no DOM), so it runs in Node; `furnitureTextures.ts` turns it into maps.
 *
 * Sets are folders under `apps/web/public/textures/<set>/` (sources in
 * `docs/assets/scene3d.md`). Model UVs are metres, so `size` is the metres of surface one
 * repeat of the set covers: a plank a hand wide, a weave of a few millimetres.
 */
import { FURNITURE_MATERIALS, isHexColor, type FinishKind, type FurnitureMaterial } from '@interio/core';

export interface FurnitureTextureSpec {
  /** Folder name of the texture set. */
  set: string;
  /** Metres of surface covered by one repeat. */
  size: number;
  /** The set has a colour map (`color.jpg`): it is tinted towards the finish colour. */
  color: boolean;
  /** Average colour of `color.jpg` (sRGB hex), the reference for the tint. */
  avg?: string;
  /** The set has `normal.jpg` / `rough.jpg`. */
  normal: boolean;
  rough: boolean;
  /** Strength of the normal map. Default 1. */
  normalScale?: number;
  /**
   * Sets without a colour map (cloth, leather): shading baked from the normal map into a
   * colour map of the finish colour, so the weave still reads where the light is flat.
   * 0 for none.
   */
  cavity?: number;
  /** Mean of the roughness map after normalising, as a share of the material's roughness. Default 0.9. */
  roughMean?: number;
  /** Metres of material a palette swatch shows. */
  swatch: number;
}

const cloth = (set: string, size: number, extra: Partial<FurnitureTextureSpec> = {}): FurnitureTextureSpec => ({
  set,
  size,
  color: false,
  normal: true,
  rough: true,
  cavity: 0.55,
  swatch: 0.06,
  ...extra,
});

const grain = (set: string, size: number, avg: string, extra: Partial<FurnitureTextureSpec> = {}): FurnitureTextureSpec => ({
  set,
  size,
  color: true,
  avg,
  normal: false,
  rough: false,
  swatch: 0.25,
  ...extra,
});

/** The texture sets, at the real size of the material they show. */
export const FURNITURE_SETS = {
  linen: cloth('fabric-linen', 0.27),
  cotton: cloth('fabric-linen', 0.2, { normalScale: 0.6, cavity: 0.35 }),
  weave: cloth('fabric-weave', 0.25),
  boucle: cloth('fabric-boucle', 0.3, { cavity: 0.8 }),
  velvet: cloth('fabric-velvet', 0.28, { normalScale: 0.6, cavity: 0.4 }),
  leather: cloth('leather', 0.4, { cavity: 0.35, swatch: 0.1 }),
  brushed: { set: 'metal-brushed', size: 0.5, color: false, normal: true, rough: true, normalScale: 0.5, roughMean: 1, swatch: 0.1 },
  oak: grain('wood-oak', 1.2, '#a07d56'),
  ash: grain('wood-ash', 1, '#ab937c'),
  teak: grain('wood-teak', 1, '#ae8056'),
  walnut: grain('wood-walnut', 1.2, '#89684f'),
  wenge: grain('wood-dark', 1, '#696056'),
  marble: grain('marble', 1.2, '#abacb5', { normal: true, rough: false, normalScale: 0.4, swatch: 0.3 }),
  marbleBlack: grain('marble-black', 1.2, '#3d3e3d', { swatch: 0.3 }),
  quartz: grain('terrazzo', 1.4, '#d5dbda', { swatch: 0.2 }),
  granite: grain('granite', 0.8, '#b4b0ac', { swatch: 0.2 }),
  terrazzo: grain('terrazzo-chips', 0.8, '#c3beba', { swatch: 0.3 }),
  travertine: grain('travertine', 1.2, '#decaab', { normal: true, normalScale: 0.5, swatch: 0.3 }),
  concrete: grain('concrete', 2, '#8c846e', { normal: true, rough: true, normalScale: 0.6, swatch: 0.4 }),
  matte: grain('plaster', 0.8, '#d6d2ce', { normal: true, normalScale: 0.5, swatch: 0.3 }),
  cane: grain('cane', 0.25, '#927252', { normal: true, swatch: 0.12 }),
  jute: grain('jute', 0.27, '#8b7758', { normal: true, swatch: 0.08 }),
} satisfies Record<string, FurnitureTextureSpec>;

const S = FURNITURE_SETS;

/** Material id -> set. Ids that are not listed (lacquers, polished metal, glass, glazed ceramic) are deliberately flat. */
export const FURNITURE_TEXTURES: Record<string, FurnitureTextureSpec | null> = {
  'fabric.linen.ivory': S.linen,
  'fabric.linen.sand': S.linen,
  'fabric.linen.taupe': S.linen,
  'fabric.weave.grey': S.weave,
  'fabric.weave.charcoal': S.weave,
  'fabric.boucle.cream': S.boucle,
  'fabric.cotton.white': S.cotton,
  'fabric.cotton.sage': S.cotton,
  'fabric.cotton.sky': S.cotton,
  'fabric.cotton.blush': S.cotton,
  'fabric.cotton.mustard': S.cotton,
  'fabric.velvet.navy': S.velvet,
  'fabric.velvet.emerald': S.velvet,
  'fabric.velvet.rust': S.velvet,
  'fabric.velvet.mocha': S.velvet,
  'leather.tan': S.leather,
  'leather.cognac': S.leather,
  'leather.black': S.leather,
  'leather.cream': S.leather,
  'wood.oak': S.oak,
  'wood.oak.light': S.oak,
  'wood.ash': S.ash,
  'wood.teak': S.teak,
  'wood.walnut': S.walnut,
  'wood.wenge': S.wenge,
  'wood.white': S.ash,
  // Painted panels: an even, flat finish.
  'lacquer.white': null,
  'lacquer.cream': null,
  'lacquer.greige': null,
  'lacquer.sage': null,
  'lacquer.navy': null,
  'lacquer.graphite': null,
  'lacquer.black.gloss': null,
  'lacquer.white.gloss': null,
  'stone.marble.white': S.marble,
  'stone.marble.black': S.marbleBlack,
  'stone.quartz.white': S.quartz,
  'stone.granite.black': S.granite,
  'stone.terrazzo': S.terrazzo,
  'stone.travertine': S.travertine,
  'stone.concrete': S.concrete,
  'metal.steel': S.brushed,
  'metal.black': S.brushed,
  'metal.brass': S.brushed,
  'metal.bronze': S.brushed,
  // Polished chrome and enamel: smooth, the environment does the work.
  'metal.chrome': null,
  'metal.white': null,
  // Glass and mirror read through transparency and reflections, not maps.
  'glass.clear': null,
  'glass.frosted': null,
  'glass.smoked': null,
  'glass.mirror': null,
  // Glazed ceramic is smooth; terracotta is a matte clay.
  'ceramic.white': null,
  'ceramic.black': null,
  'ceramic.terracotta': S.matte,
  'woven.rattan': S.cane,
  'woven.cane.dark': S.cane,
  'woven.jute': S.jute,
};

/** The surface character a custom colour takes on each kind of slot. */
export const CUSTOM_TEXTURES: Record<FinishKind, FurnitureTextureSpec | null> = {
  fabric: S.linen,
  leather: S.leather,
  wood: S.oak,
  lacquer: null,
  stone: S.quartz,
  metal: S.brushed,
  glass: null,
  ceramic: null,
  woven: S.cane,
};

/** The texture set for a resolved furniture material (a palette id, or a custom colour of a kind), or null for a flat finish. */
export function furnitureTextureSpec(material: Pick<FurnitureMaterial, 'id' | 'kind'>): FurnitureTextureSpec | null {
  if (FURNITURE_MATERIALS[material.id]) return FURNITURE_TEXTURES[material.id] ?? null;
  if (isHexColor(material.id)) return CUSTOM_TEXTURES[material.kind] ?? null;
  return null;
}

/** Texture sets the furniture materials use, without repeats. */
export function furnitureSets(): string[] {
  return [...new Set(Object.values(FURNITURE_SETS).map((s) => s.set))].sort();
}
