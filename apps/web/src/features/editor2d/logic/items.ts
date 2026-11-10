/** Plan footprints of furniture items. */
import { getEntry } from '@interio/catalog';
import { vec, type Item, type Pt } from '@interio/core';

export interface ItemFootprint {
  /** Corners in plan mm: front-left, front-right, back-right, back-left. */
  corners: [Pt, Pt, Pt, Pt];
  w: number;
  d: number;
  name: string;
}

const FALLBACK = { w: 600, d: 600 };

/**
 * Rotated footprint rectangle of an item. At 0 degrees the width runs along
 * plan x and the front faces plan -y.
 */
export function itemFootprint(item: Item): ItemFootprint {
  const entry = getEntry(item.catalogId);
  const k = item.scale ?? 1;
  const w = (entry?.dims.w ?? FALLBACK.w) * k;
  const d = (entry?.dims.d ?? FALLBACK.d) * k;
  const corner = (lx: number, ly: number): Pt => vec.add({ x: item.x, y: item.y }, vec.rotate({ x: lx, y: ly }, item.rotationDeg));
  return {
    corners: [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)],
    w,
    d,
    name: entry?.name ?? item.catalogId,
  };
}

export function pointInItem(item: Item, p: Pt, pad = 0): boolean {
  const f = itemFootprint(item);
  const local = vec.rotate(vec.sub(p, { x: item.x, y: item.y }), -item.rotationDeg);
  return Math.abs(local.x) <= f.w / 2 + pad && Math.abs(local.y) <= f.d / 2 + pad;
}
