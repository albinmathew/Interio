/**
 * Independent placement checks shared by the styling and package tests: none of this
 * reuses the layout engine's code.
 */
import { deriveRooms, openingFrame, vec, type Item, type Level, type Pt } from '@interio/core';
import { expect } from 'vitest';
import { getEntry } from '../src/index';

export type NewItem = Omit<Item, 'id'>;
/* ------------------------------------------------------------------ *
 * Independent checks: none of this reuses the layout engine's code.  *
 * ------------------------------------------------------------------ */

export const rectOf = (x: number, y: number, w: number, d: number, rot: number): Pt[] =>
  [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ].map((p) => vec.add({ x, y }, vec.rotate(p, rot)));

/** Overlap depth of two convex polygons along the best separating axis (0 when apart). */
export function penetration(a: Pt[], b: Pt[]): number {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const axis = vec.norm(vec.perp(vec.sub(poly[(i + 1) % poly.length]!, poly[i]!)));
      const pa = a.map((p) => vec.dot(p, axis));
      const pb = b.map((p) => vec.dot(p, axis));
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 0) return 0;
      least = Math.min(least, overlap);
    }
  }
  return least;
}

export interface Solid {
  rect: Pt[];
  zMin: number;
  zMax: number;
  rod?: boolean;
}

export interface Piece {
  item: NewItem;
  rect: Pt[];
  zMin: number;
  zMax: number;
  flat: boolean;
  solids: Solid[];
}

export const stackOf = (catalogId: string): number => {
  const e = getEntry(catalogId)!;
  return e.model.kind === 'parametric' ? Number(e.model.params?.stack ?? 0) : 0;
};

/** Stacked curtains are two panels (`params.stack` wide) at the ends of a rod in the top 90 mm; everything else is its box. */
export function pieceOf(item: NewItem): Piece {
  const e = getEntry(item.catalogId);
  if (!e) throw new Error(`unknown ${item.catalogId}`);
  const rot = item.rotationDeg ?? 0;
  const z = item.z ?? 0;
  const { w, d, h } = e.dims;
  const rect = rectOf(item.x, item.y, w, d, rot);
  const stack = stackOf(item.catalogId);
  const solids: Solid[] = stack
    ? [
        ...[-1, 1].map((s) => {
          const c = vec.add({ x: item.x, y: item.y }, vec.rotate({ x: s * (w / 2 - stack / 2), y: 0 }, rot));
          return { rect: rectOf(c.x, c.y, stack, d, rot), zMin: z, zMax: z + h };
        }),
        { rect, zMin: z + h - 90, zMax: z + h, rod: true },
      ]
    : [{ rect, zMin: z, zMax: z + h }];
  return { item, rect, zMin: z, zMax: z + h, flat: h <= 30, solids };
}

export interface Opening {
  kind: string;
  /** The opening's own span on the room side of the wall. */
  span: Pt[];
  /** What must stay clear in front of it. */
  rect: Pt[];
  centre: Pt;
  /** Into the room. */
  normal: Pt;
  face: number;
  sill: number;
  top: number;
}

export function openings(level: Level, roomId: string): Opening[] {
  const geom = deriveRooms(level).find((g) => g.roomId === roomId)!;
  const walls = new Set(geom.edgeWalls);
  const out: Opening[] = [];
  for (const o of Object.values(level.openings)) {
    if (!walls.has(o.wallId)) continue;
    const f = openingFrame(level, o.id)!;
    for (const sign of [1, -1]) {
      if (!vec.pointInPolygon(vec.add(f.center, vec.scale(f.normal, sign * (f.thickness / 2 + 120))), geom.interior)) continue;
      const n = vec.scale(f.normal, sign);
      const face = f.thickness / 2;
      const depth = o.kind === 'window' ? 300 : o.kind === 'door' && (o.swing ?? 1) * sign > 0 ? o.width : 600;
      const strip = (dd: number) => [vec.add(f.left, vec.scale(n, face)), vec.add(f.right, vec.scale(n, face)), vec.add(f.right, vec.scale(n, face + dd)), vec.add(f.left, vec.scale(n, face + dd))];
      out.push({ kind: o.kind, span: strip(200), rect: strip(depth), centre: vec.add(f.center, vec.scale(n, face)), normal: n, face, sill: o.sill, top: o.sill + o.height });
    }
  }
  return out;
}

export const shrink = (rect: Pt[], by: number): Pt[] => {
  const c = vec.scale(rect.reduce((s, p) => vec.add(s, p), { x: 0, y: 0 }), 1 / rect.length);
  return rect.map((p) => vec.add(p, vec.scale(vec.norm(vec.sub(c, p)), by)));
};

/** Every placement rule, for `added` on top of the items already in the room. */
export function checkRules(level: Level, roomId: string, added: NewItem[], existing: NewItem[] = []): void {
  const geom = deriveRooms(level).find((g) => g.roomId === roomId)!;
  const label = `${level.rooms[roomId]!.name}:`;
  const pieces = [...existing, ...added].map(pieceOf);
  const fresh = pieces.slice(existing.length);
  for (const b of fresh) {
    for (const p of shrink(b.rect, 3)) expect(vec.pointInPolygon(p, geom.interior), `${label} ${b.item.catalogId} inside`).toBe(true);
    expect(b.zMax, `${label} ${b.item.catalogId} under the ceiling`).toBeLessThanOrEqual(level.ceilingHeight);
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      if (a.flat || b.flat || (i < existing.length && j < existing.length)) continue;
      for (const sa of a.solids) {
        for (const sb of b.solids) {
          if (Math.min(sa.zMax, sb.zMax) - Math.max(sa.zMin, sb.zMin) <= 1) continue;
          expect(penetration(sa.rect, sb.rect), `${label} ${a.item.catalogId} overlaps ${b.item.catalogId}`).toBeLessThanOrEqual(2);
        }
      }
    }
  }
  for (const o of openings(level, roomId)) {
    for (const b of fresh) {
      for (const part of b.solids) {
        const hit = penetration(part.rect, o.rect) > 2;
        if (o.kind === 'window') {
          if (part.rod || b.item.catalogId.startsWith('blind.')) continue;
          const blocks = hit && part.zMin < o.top && part.zMax > (o.sill >= 1700 ? o.sill + 300 : o.sill);
          expect(blocks, `${label} ${b.item.catalogId} stands in front of a window`).toBe(false);
        } else if (part.zMin < o.top) {
          expect(hit, `${label} ${b.item.catalogId} blocks a ${o.kind}`).toBe(false);
        }
      }
    }
  }
  for (const b of fresh) {
    const e = getEntry(b.item.catalogId)!;
    if (e.anchor === 'wall') {
      const back = vec.add({ x: b.item.x, y: b.item.y }, vec.rotate({ x: 0, y: e.dims.d / 2 }, b.item.rotationDeg));
      let nearest = Infinity;
      for (let i = 0; i < geom.interior.length; i++) nearest = Math.min(nearest, vec.projectOnSegment(back, geom.interior[i]!, geom.interior[(i + 1) % geom.interior.length]!).distance);
      expect(nearest, `${label} ${e.id} hangs on a wall`).toBeLessThanOrEqual(15);
      // Blinds hang at the height of their window.
      if (!e.id.startsWith('blind.')) expect(b.zMin, `${label} ${e.id} at its mount height`).toBe(e.mountHeight);
    }
    if (e.anchor === 'floor' && b.zMin > 0) {
      const host = pieces.find((s) => s !== b && Math.abs(s.zMax - b.zMin) <= 1 && penetration(s.rect, b.rect) > 50);
      expect(host, `${label} ${e.id} at z ${b.zMin} rests on something`).toBeDefined();
      // Wholly on its host: nothing overhangs a surface.
      if (host) for (const p of shrink(b.rect, 3)) expect(vec.pointInPolygon(p, host.rect), `${label} ${e.id} stands on its ${host.item.catalogId}`).toBe(true);
    }
  }
}

/* ---------------------------------------------------------- walking */

export const R = 300;
const STEP = 100;

function distToRect(p: Pt, rect: Pt[]): number {
  if (vec.pointInPolygon(p, rect)) return 0;
  let best = Infinity;
  for (let i = 0; i < rect.length; i++) best = Math.min(best, vec.projectOnSegment(p, rect[i]!, rect[(i + 1) % rect.length]!).distance);
  return best;
}

/**
 * Doors of the room (its door, passage and sliding openings) that a person 600 mm wide can
 * walk between, as groups of opening indices, plus the walkable floor reachable from them (m2).
 */
export function walkability(level: Level, roomId: string, items: NewItem[]): { groups: number[]; reach: number } {
  const geom = deriveRooms(level).find((g) => g.roomId === roomId)!;
  const solids = items
    .map(pieceOf)
    .filter((b) => !b.flat)
    .flatMap((b) => b.solids)
    .filter((s) => s.zMin < 900)
    .map((s) => s.rect);
  const xs = geom.interior.map((p) => p.x);
  const ys = geom.interior.map((p) => p.y);
  const cells = new Map<string, Pt>();
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += STEP) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += STEP) {
      const c = { x, y };
      if (!vec.pointInPolygon(c, geom.interior)) continue;
      let wall = Infinity;
      for (let i = 0; i < geom.interior.length; i++) wall = Math.min(wall, vec.projectOnSegment(c, geom.interior[i]!, geom.interior[(i + 1) % geom.interior.length]!).distance);
      if (wall < R - 1 || solids.some((r) => distToRect(c, r) < R - 1)) continue;
      cells.set(`${x},${y}`, c);
    }
  }
  const comp = new Map<string, number>();
  let n = 0;
  for (const key of cells.keys()) {
    if (comp.has(key)) continue;
    const stack = [key];
    comp.set(key, n);
    while (stack.length) {
      const [x, y] = stack.pop()!.split(',').map(Number) as [number, number];
      for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
        const k = `${x + dx},${y + dy}`;
        if (cells.has(k) && !comp.has(k)) {
          comp.set(k, n);
          stack.push(k);
        }
      }
    }
    n++;
  }
  const doors = openings(level, roomId).filter((o) => o.kind !== 'window');
  const groups = doors.map((o) => {
    let best = -1;
    let bestD = R + 450;
    for (const [k, c] of cells) {
      const d = vec.dist(c, o.centre);
      if (d < bestD) {
        bestD = d;
        best = comp.get(k)!;
      }
    }
    return best;
  });
  const reached = new Set(groups.filter((g) => g >= 0));
  let count = 0;
  for (const c of comp.values()) if (doors.length === 0 || reached.has(c)) count++;
  return { groups, reach: (count * STEP * STEP) / 1e6 };
}

