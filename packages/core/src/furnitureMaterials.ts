/**
 * Materials that furniture and appliances can be finished in.
 *
 * Plain data shared by everything: the catalog builds three.js materials from
 * it, the Design view offers it as swatches, and the assistant picks from it.
 * `@interio/scene3d` maps ids to textures; `color` is the flat fallback and the
 * tint. A finish value is either an id from this list or a custom colour as
 * `#rrggbb` (rendered as a matte paint/fabric of that colour).
 */
export const FINISH_KINDS = ['fabric', 'leather', 'wood', 'lacquer', 'stone', 'metal', 'glass', 'ceramic', 'woven'] as const;
export type FinishKind = (typeof FINISH_KINDS)[number];

export interface FurnitureMaterial {
  id: string;
  name: string;
  kind: FinishKind;
  /** sRGB hex. */
  color: string;
  roughness: number;
  metalness: number;
  /** Below 1 the material is see-through (glass). */
  opacity?: number;
  /** Soft sheen for cloth (velvet, bouclé). 0..1. */
  sheen?: number;
  /** Clear coat for lacquer, polished stone and glazed ceramic. 0..1. */
  clearcoat?: number;
}

const f = (id: string, name: string, kind: FinishKind, color: string, roughness: number, extra: Partial<FurnitureMaterial> = {}): FurnitureMaterial => ({
  id,
  name,
  kind,
  color,
  roughness,
  metalness: 0,
  ...extra,
});

export const FURNITURE_MATERIAL_LIST: FurnitureMaterial[] = [
  // woven upholstery and bed linen
  f('fabric.linen.ivory', 'Ivory linen', 'fabric', '#ece6d9', 0.95),
  f('fabric.linen.sand', 'Sand linen', 'fabric', '#cdbfa6', 0.95),
  f('fabric.linen.taupe', 'Taupe linen', 'fabric', '#9c8f80', 0.95),
  f('fabric.weave.grey', 'Grey weave', 'fabric', '#9a9d9f', 0.95),
  f('fabric.weave.charcoal', 'Charcoal weave', 'fabric', '#4c5055', 0.95),
  f('fabric.boucle.cream', 'Cream bouclé', 'fabric', '#efe9dd', 1, { sheen: 0.4 }),
  f('fabric.cotton.white', 'White cotton', 'fabric', '#f6f4ef', 0.9),
  f('fabric.cotton.sage', 'Sage cotton', 'fabric', '#a9b8a3', 0.92),
  f('fabric.cotton.sky', 'Sky cotton', 'fabric', '#a9c0d3', 0.92),
  f('fabric.cotton.blush', 'Blush cotton', 'fabric', '#e3c4bb', 0.92),
  f('fabric.cotton.mustard', 'Mustard cotton', 'fabric', '#c99a3f', 0.92),
  f('fabric.velvet.navy', 'Navy velvet', 'fabric', '#27364d', 0.85, { sheen: 0.8 }),
  f('fabric.velvet.emerald', 'Emerald velvet', 'fabric', '#1f5a4a', 0.85, { sheen: 0.8 }),
  f('fabric.velvet.rust', 'Rust velvet', 'fabric', '#a4532f', 0.85, { sheen: 0.8 }),
  f('fabric.velvet.mocha', 'Mocha velvet', 'fabric', '#6b5446', 0.85, { sheen: 0.8 }),
  // leather
  f('leather.tan', 'Tan leather', 'leather', '#b07a4c', 0.55),
  f('leather.cognac', 'Cognac leather', 'leather', '#8a4f2c', 0.5),
  f('leather.black', 'Black leather', 'leather', '#1f1f21', 0.45),
  f('leather.cream', 'Cream leather', 'leather', '#e4dccb', 0.55),
  // timber
  f('wood.oak', 'Natural oak', 'wood', '#c8a171', 0.6),
  f('wood.oak.light', 'Light oak', 'wood', '#dcc39c', 0.62),
  f('wood.ash', 'Ash', 'wood', '#e4d3b5', 0.62),
  f('wood.teak', 'Teak', 'wood', '#9b6b3f', 0.58),
  f('wood.walnut', 'Walnut', 'wood', '#6e4a32', 0.55),
  f('wood.wenge', 'Dark wenge', 'wood', '#3b2a22', 0.55),
  f('wood.white', 'White-washed wood', 'wood', '#ebe5da', 0.65),
  // painted and laminated panels
  f('lacquer.white', 'Matte white', 'lacquer', '#f5f4f0', 0.55),
  f('lacquer.cream', 'Cream', 'lacquer', '#ece4d3', 0.55),
  f('lacquer.greige', 'Greige', 'lacquer', '#b9b0a2', 0.55),
  f('lacquer.sage', 'Sage', 'lacquer', '#9fae99', 0.55),
  f('lacquer.navy', 'Navy', 'lacquer', '#2c3b52', 0.5),
  f('lacquer.graphite', 'Graphite', 'lacquer', '#3d4146', 0.5),
  f('lacquer.black.gloss', 'Gloss black', 'lacquer', '#141516', 0.18, { clearcoat: 1 }),
  f('lacquer.white.gloss', 'Gloss white', 'lacquer', '#fafaf8', 0.18, { clearcoat: 1 }),
  // stone and worktops
  f('stone.marble.white', 'White marble', 'stone', '#f0eeea', 0.2, { clearcoat: 0.6 }),
  f('stone.marble.black', 'Black marble', 'stone', '#1e1f21', 0.2, { clearcoat: 0.6 }),
  f('stone.quartz.white', 'White quartz', 'stone', '#ebe8e2', 0.3),
  f('stone.granite.black', 'Black granite', 'stone', '#2a2c2e', 0.28),
  f('stone.terrazzo', 'Terrazzo', 'stone', '#d9d3c9', 0.35),
  f('stone.travertine', 'Travertine', 'stone', '#d8c7ad', 0.5),
  f('stone.concrete', 'Concrete', 'stone', '#a09f9b', 0.75),
  // metal
  f('metal.steel', 'Brushed steel', 'metal', '#c3c8cb', 0.35, { metalness: 0.9 }),
  f('metal.chrome', 'Chrome', 'metal', '#e3e6e8', 0.12, { metalness: 1 }),
  f('metal.black', 'Matte black', 'metal', '#1c1d1f', 0.5, { metalness: 0.7 }),
  f('metal.brass', 'Brass', 'metal', '#b8964f', 0.3, { metalness: 0.95 }),
  f('metal.bronze', 'Bronze', 'metal', '#6f5438', 0.4, { metalness: 0.9 }),
  f('metal.white', 'White enamel', 'metal', '#f1f2f1', 0.4, { metalness: 0.15 }),
  // glass and mirror
  f('glass.clear', 'Clear glass', 'glass', '#dfeef0', 0.05, { opacity: 0.22 }),
  f('glass.frosted', 'Frosted glass', 'glass', '#eef3f3', 0.6, { opacity: 0.55 }),
  f('glass.smoked', 'Smoked glass', 'glass', '#4f5659', 0.08, { opacity: 0.45 }),
  f('glass.mirror', 'Mirror', 'glass', '#dfe5e8', 0.04, { metalness: 1 }),
  // sanitary ware and moulded parts
  f('ceramic.white', 'White ceramic', 'ceramic', '#fbfbf9', 0.15, { clearcoat: 1 }),
  f('ceramic.black', 'Black ceramic', 'ceramic', '#1d1e20', 0.2, { clearcoat: 1 }),
  f('ceramic.terracotta', 'Terracotta', 'ceramic', '#b6714f', 0.8),
  // cane and rope
  f('woven.rattan', 'Rattan', 'woven', '#c9a56e', 0.8),
  f('woven.cane.dark', 'Dark cane', 'woven', '#6d4f33', 0.8),
  f('woven.jute', 'Jute', 'woven', '#c2a878', 0.95),
];

export const FURNITURE_MATERIALS: Record<string, FurnitureMaterial> = Object.fromEntries(FURNITURE_MATERIAL_LIST.map((m) => [m.id, m]));

const HEX = /^#[0-9a-fA-F]{6}$/;

/** True for a custom colour written as `#rrggbb`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/**
 * The material a finish value stands for. A `#rrggbb` value becomes a matte
 * material of that colour, of the wanted kind where that matters (a custom
 * colour on a metal slot stays metallic). Unknown ids give null.
 */
export function resolveFurnitureMaterial(value: string | undefined, kind?: FinishKind): FurnitureMaterial | null {
  if (!value) return null;
  const known = FURNITURE_MATERIALS[value];
  if (known) return known;
  if (!isHexColor(value)) return null;
  const k = kind ?? 'lacquer';
  const base: Record<FinishKind, Pick<FurnitureMaterial, 'roughness' | 'metalness'> & Partial<FurnitureMaterial>> = {
    fabric: { roughness: 0.93, metalness: 0 },
    leather: { roughness: 0.5, metalness: 0 },
    wood: { roughness: 0.6, metalness: 0 },
    lacquer: { roughness: 0.5, metalness: 0 },
    stone: { roughness: 0.3, metalness: 0 },
    metal: { roughness: 0.4, metalness: 0.85 },
    glass: { roughness: 0.08, metalness: 0, opacity: 0.35 },
    ceramic: { roughness: 0.18, metalness: 0, clearcoat: 1 },
    woven: { roughness: 0.85, metalness: 0 },
  };
  return { id: value.toLowerCase(), name: `Custom ${value.toLowerCase()}`, kind: k, color: value.toLowerCase(), ...base[k] };
}

/** One customisable part of a catalog entry, e.g. the upholstery of a sofa or the fronts of a wardrobe. */
export interface FinishSlot {
  /** Stable within the entry, e.g. `upholstery`, `frame`, `top`. */
  id: string;
  /** Shown to the user, e.g. "Upholstery". */
  label: string;
  /** Which materials suit this part. Any material may still be chosen. */
  kind: FinishKind;
  /** Material id used when the item has no finish for this slot. */
  default: string;
}

/** The finish of one slot of an item: the item's own choice, else the entry's default. */
export function finishOf(slots: readonly FinishSlot[] | undefined, finishes: Record<string, string> | undefined, slotId: string): string | undefined {
  const slot = slots?.find((s) => s.id === slotId);
  const chosen = finishes?.[slotId];
  if (chosen && (FURNITURE_MATERIALS[chosen] || isHexColor(chosen))) return chosen;
  return slot?.default;
}
