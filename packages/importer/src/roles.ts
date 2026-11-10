/**
 * Stage 2: what each CAD layer means. Layer names survive PDF export as
 * optional-content groups ("TYPE D2$0$a-160 strl"); xref prefixes vary inside
 * one file, so only the part after the last `$` is classified.
 */
import type { LayerRole } from '@interio/core';

export function layerKey(name: string): string {
  const i = name.lastIndexOf('$');
  return (i >= 0 ? name.slice(i + 1) : name).trim().toLowerCase();
}

const RULES: [RegExp, LayerRole][] = [
  [/\bdim|dimension/, 'dimension'],
  [/dw sch|schedule|\btag/, 'tag'],
  [/text|txt|\banno|\bnote|label/, 'text'],
  [/title|\bttl\b|border|viewport|defpoints|logo|stamp/, 'ignore'],
  [/tile|hatch|\bhat\b|pattern|sinking|\bfill\b/, 'hatch'],
  [/folding|\bthin\b|\bgrid\b|column grid|section|level mark/, 'ignore'],
  [/chajja|beam|slab|ac ledge|elev|hvac|cutout|cent(er|re)|gfrc|above|ceiling|overhead|proj|\bsill\b|\bnib\b|duct|shaft/, 'overhead'],
  [/railing|\brail\b|handrail|balustrade|parapet|ledge|lhwall|low\s*wall|low ht|half wall/, 'lowWall'],
  [/aluframe|window|glaz|\bwin\b|\bdwv\b|ventilator|curtain wall/, 'window'],
  [/door/, 'door'],
  [/furn|casework|wardrobe/, 'furniture'],
  [/fixture|sanit|plumb|kitchen|counter|granite|appliance|equip/, 'fixture'],
  [/strl|struct|wall|masonry|brick|block|column|partition|\brcc\b/, 'wall'],
];

export function classifyLayer(name: string): LayerRole {
  const key = layerKey(name);
  if (!key || key === '0') return 'ignore';
  for (const [re, role] of RULES) if (re.test(key)) return role;
  return 'ignore';
}

/** Railings stay railings in 3D; every other low-wall layer becomes a parapet. */
export function lowWallKind(name: string): 'railing' | 'low' {
  return /rail|balustrade/.test(layerKey(name)) ? 'railing' : 'low';
}

/** Kitchen fixtures get their own bucket when guessing room types. */
export function isKitchenLayer(name: string): boolean {
  return /kitchen|counter|granite|hob|sink/.test(layerKey(name));
}

/** Nominal wall thickness when the layer name carries one ("a-160 strl", "wall 230"). */
export function nominalThickness(name: string): number | null {
  const m = layerKey(name).match(/(?:^|[^\d.])(\d{2,3})(?:\s*mm)?(?:[^\d.]|$)/);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 60 && v <= 450 ? v : null;
}

export function assignRoles(layers: string[], overrides?: Record<string, LayerRole>): LayerRole[] {
  return layers.map((name) => overrides?.[name] ?? classifyLayer(name));
}
