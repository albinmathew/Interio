/**
 * One material palette for the whole catalog. The normalise script recolours the
 * CC0 kit models with it and the parametric generators build from it, so real
 * models and generated ones read as a single set.
 *
 * Plain data on purpose (no three.js): the Node scripts import it too.
 */
export interface MaterialSpec {
  /** sRGB hex. */
  color: string;
  roughness: number;
  metalness: number;
  /** Below 1 the material is alpha-blended and double sided. */
  opacity?: number;
  /** sRGB hex. */
  emissive?: string;
  emissiveIntensity?: number;
}

const m = (color: string, roughness: number, metalness = 0, extra: Partial<MaterialSpec> = {}): MaterialSpec => ({
  color,
  roughness,
  metalness,
  ...extra,
});

export const PALETTE = {
  // timber
  wood: m('#c9a57c', 0.72),
  woodDark: m('#a07c56', 0.72),
  teak: m('#94704c', 0.7),
  // upholstery and textiles
  fabric: m('#8e9aa5', 0.95),
  fabricDark: m('#6f7c88', 0.95),
  fabricBlue: m('#6d87a1', 0.95),
  fabricSage: m('#93a58f', 0.95),
  fabricSageDark: m('#788a75', 0.95),
  fabricSand: m('#cdbfa8', 0.95),
  fabricSandDark: m('#b3a48c', 0.95),
  fabricClay: m('#bd8468', 0.95),
  fabricClayDark: m('#a06c53', 0.95),
  fabricCharcoal: m('#5a6068', 0.95),
  fabricCream: m('#e6dfd1', 0.95),
  linen: m('#f0ede6', 0.9),
  // painted and moulded surfaces
  white: m('#f4f4f1', 0.6),
  ceramic: m('#f8f8f6', 0.22),
  worktop: m('#e6e3dd', 0.35),
  panelDark: m('#3b4146', 0.55),
  plastic: m('#eef0ef', 0.45),
  rubber: m('#2c2f32', 0.9),
  terracotta: m('#b9795b', 0.85),
  soil: m('#54402f', 1),
  // metals
  steel: m('#c2c8cb', 0.4, 0.45),
  steelLight: m('#eceeed', 0.45, 0.1),
  steelMid: m('#7d878c', 0.45, 0.5),
  steelDark: m('#474f54', 0.5, 0.5),
  brushed: m('#c0c6c9', 0.36, 0.55),
  chrome: m('#dde2e5', 0.2, 0.6),
  blackMetal: m('#2a2d30', 0.45, 0.6),
  // glass and screens
  glass: m('#c4dde2', 0.06, 0, { opacity: 0.32 }),
  glassDark: m('#15181b', 0.1, 0.3),
  glassSmoke: m('#30363b', 0.08, 0.1, { opacity: 0.55 }),
  screen: m('#0e1115', 0.14, 0.3),
  mirror: m('#dce8ec', 0.06, 0.4),
  water: m('#9ccfe0', 0.08, 0, { opacity: 0.6 }),
  // light and life
  lampShade: m('#fbefd2', 0.8, 0, { emissive: '#ffdf9e', emissiveIntensity: 0.45 }),
  glow: m('#fff6e2', 0.6, 0, { emissive: '#fff0cc', emissiveIntensity: 0.9 }),
  led: m('#7fe0a0', 0.4, 0, { emissive: '#58d68a', emissiveIntensity: 1 }),
  ledBlue: m('#9fd4ff', 0.4, 0, { emissive: '#6fbcff', emissiveIntensity: 1 }),
  flame: m('#3d6fd9', 0.5, 0, { emissive: '#3d6fd9', emissiveIntensity: 0.6 }),
  plant: m('#6c9f76', 0.85),
  plantDark: m('#4f8560', 0.85),
  fur: m('#b08c66', 1),
} as const satisfies Record<string, MaterialSpec>;

export type PaletteKey = keyof typeof PALETTE;

/** Default palette entry for each material name used by the Kenney Furniture Kit. */
export const KENNEY_MATERIALS: Record<string, PaletteKey> = {
  wood: 'wood',
  woodDark: 'woodDark',
  carpet: 'fabric',
  carpetDarker: 'fabricDark',
  carpetBlue: 'fabricBlue',
  carpetWhite: 'linen',
  _defaultMat: 'white',
  metal: 'steel',
  metalLight: 'steelLight',
  metalMedium: 'steelMid',
  metalDark: 'steelDark',
  glass: 'glass',
  lamp: 'lampShade',
  plant: 'plant',
  fur: 'fur',
};

/** sRGB hex -> linear RGB components (0..1), as glTF stores colour factors. */
export function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}
