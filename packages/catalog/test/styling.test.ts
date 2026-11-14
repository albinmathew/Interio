import { FURNITURE_MATERIALS, buildLevel, createSampleLevel, deriveRooms, ops, openingFrame, vec, type Item, type Level, type Pt, type RoomType } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { autoFurnish, getEntry, styleRoom } from '../src/index';
import { SCHEMES } from '../src/autofurnish';
import { stylingCap } from '../src/autofurnish/styling';

type NewItem = Omit<Item, 'id'>;

/* ------------------------------------------------------------------ *
 * Independent checks: none of this reuses the layout engine's code.  *
 * ------------------------------------------------------------------ */

const rectOf = (x: number, y: number, w: number, d: number, rot: number): Pt[] =>
  [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ].map((p) => vec.add({ x, y }, vec.rotate(p, rot)));

/** Overlap depth of two convex polygons along the best separating axis (0 when apart). */
function penetration(a: Pt[], b: Pt[]): number {
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

interface Solid {
  rect: Pt[];
  zMin: number;
  zMax: number;
  rod?: boolean;
}

interface Piece {
  item: NewItem;
  rect: Pt[];
  zMin: number;
  zMax: number;
  flat: boolean;
  solids: Solid[];
}

const stackOf = (catalogId: string): number => {
  const e = getEntry(catalogId)!;
  return e.model.kind === 'parametric' ? Number(e.model.params?.stack ?? 0) : 0;
};

/** Stacked curtains are two panels (`params.stack` wide) at the ends of a rod in the top 90 mm; everything else is its box. */
function pieceOf(item: NewItem): Piece {
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

interface Opening {
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

function openings(level: Level, roomId: string): Opening[] {
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

const shrink = (rect: Pt[], by: number): Pt[] => {
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
          if (part.rod) continue;
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
      expect(b.zMin, `${label} ${e.id} at its mount height`).toBe(e.mountHeight);
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

const R = 300;
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
function walkability(level: Level, roomId: string, items: NewItem[]): { groups: number[]; reach: number } {
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

/** Styling leaves every connection between doors that the main pieces left, and does not wall off part of the room. */
function expectWalkable(level: Level, roomId: string, main: NewItem[], all: NewItem[], styled: NewItem[]): void {
  const label = level.rooms[roomId]!.name;
  const before = walkability(level, roomId, main);
  const after = walkability(level, roomId, all);
  for (let a = 0; a < before.groups.length; a++) {
    if (before.groups[a]! >= 0) expect(after.groups[a], `${label}: door ${a} still reachable`).toBeGreaterThanOrEqual(0);
    for (let b = a + 1; b < before.groups.length; b++) {
      if (before.groups[a]! >= 0 && before.groups[a] === before.groups[b]) expect(after.groups[a], `${label}: doors ${a} and ${b} still connected`).toBe(after.groups[b]);
    }
  }
  // The walkable floor shrinks by about the styled floor pieces' own reach, no more.
  const own = styled
    .map(pieceOf)
    .filter((b) => !b.flat && b.zMin < 900)
    .reduce((s, b) => {
      const e = getEntry(b.item.catalogId)!;
      return s + ((e.dims.w + 2 * R) * (e.dims.d + 2 * R)) / 1e6;
    }, 0);
  expect(after.reach, `${label}: walkable floor`).toBeGreaterThanOrEqual(before.reach - own * 1.4 - 0.2);
}

/** Styles a room furnished with its main pieces only and checks that people can still walk through it. */
export function expectStyleWalkable(source: Level, roomId: string): void {
  const level = structuredClone(source);
  const main = autoFurnish(level, roomId, { styling: 'none' });
  for (const item of main) ops.addItem(level, item);
  const styled = styleRoom(level, roomId);
  checkRules(level, roomId, styled, main);
  expectWalkable(level, roomId, main, [...main, ...styled], styled);
}

/* --------------------------------------------------------- fixtures */

const T = 150;
const door = (x: number, y: number, swing: 1 | -1 = 1, width = 900) => ({ at: { x, y }, kind: 'door' as const, width, height: 2100, sill: 0, hinge: 'a' as const, swing });
const windowAt = (x: number, y: number, width = 1500, sill = 900, height = 1200) => ({ at: { x, y }, kind: 'window' as const, width, height, sill });
const slider = (x: number, y: number, width = 2400) => ({ at: { x, y }, kind: 'sliding' as const, width, height: 2400, sill: 0 });

function boxRoom(w: number, h: number, type: RoomType, openingsList: Parameters<typeof buildLevel>[0]['openings']): { level: Level; roomId: string } {
  const level = buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: w, y: 0 }, thickness: T },
      { a: { x: w, y: 0 }, b: { x: w, y: h }, thickness: T },
      { a: { x: w, y: h }, b: { x: 0, y: h }, thickness: T },
      { a: { x: 0, y: h }, b: { x: 0, y: 0 }, thickness: T },
    ],
    openings: openingsList,
    rooms: [{ at: { x: w / 2, y: h / 2 }, name: `${type} ${w}x${h}`, type }],
  });
  return { level, roomId: Object.keys(level.rooms)[0]! };
}

function lRoom(type: RoomType): { level: Level; roomId: string } {
  const level = buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 7000, y: 0 }, thickness: T },
      { a: { x: 7000, y: 0 }, b: { x: 7000, y: 3600 }, thickness: T },
      { a: { x: 7000, y: 3600 }, b: { x: 3600, y: 3600 }, thickness: T },
      { a: { x: 3600, y: 3600 }, b: { x: 3600, y: 6500 }, thickness: T },
      { a: { x: 3600, y: 6500 }, b: { x: 0, y: 6500 }, thickness: T },
      { a: { x: 0, y: 6500 }, b: { x: 0, y: 0 }, thickness: T },
    ],
    openings: [door(6000, 0), windowAt(0, 4500, 1800), slider(1800, 6500, 2000), windowAt(5300, 3600, 1500)],
    rooms: [{ at: { x: 1500, y: 1500 }, name: `L ${type}`, type }],
  });
  return { level, roomId: Object.keys(level.rooms)[0]! };
}

const SYNTHETIC: [string, () => { level: Level; roomId: string }][] = [
  ['small bedroom', () => boxRoom(2800, 3000, 'bedroom', [door(600, 0), windowAt(1400, 3000, 1200)])],
  ['bedroom', () => boxRoom(3400, 3800, 'bedroom', [door(600, 0), windowAt(1700, 3800, 1800)])],
  ['big bedroom', () => boxRoom(4600, 4800, 'bedroom', [door(600, 0), windowAt(2300, 4800, 2100), windowAt(4600, 2400, 1200)])],
  ['living', () => boxRoom(4200, 5200, 'living', [door(700, 0), slider(4200, 2600, 2400), windowAt(2100, 5200, 1800)])],
  ['big living', () => boxRoom(6200, 7400, 'living', [door(700, 0), windowAt(3100, 7400, 2400), windowAt(6200, 3700, 1500)])],
  ['dining', () => boxRoom(3600, 4200, 'dining', [door(600, 0), windowAt(1800, 4200, 1500)])],
  ['study', () => boxRoom(3000, 3400, 'study', [door(600, 0), windowAt(1500, 3400)])],
  ['kitchen', () => boxRoom(2800, 3600, 'kitchen', [door(1400, 0), windowAt(0, 1800, 1200, 1050, 1050)])],
  ['bathroom', () => boxRoom(2200, 2600, 'bathroom', [door(600, 0, 1, 750), windowAt(1100, 2600, 600, 1800, 600)])],
  ['tiny bathroom', () => boxRoom(1300, 1500, 'bathroom', [door(650, 0, 1, 700)])],
  ['foyer', () => boxRoom(2200, 2600, 'foyer', [door(1100, 0, 1, 1000), { at: { x: 2200, y: 1300 }, kind: 'passage', width: 1200, height: 2400, sill: 0 }])],
  ['corridor', () => boxRoom(7000, 1300, 'corridor', [door(1200, 0), door(3500, 1300, -1), door(5800, 0), { at: { x: 7000, y: 650 }, kind: 'passage', width: 1000, height: 2400, sill: 0 }])],
  ['balcony', () => buildRailBalcony()],
  ['L living', () => lRoom('living')],
  ['L bedroom', () => lRoom('bedroom')],
];

function buildRailBalcony(): { level: Level; roomId: string } {
  const level = buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, thickness: T },
      { a: { x: 5000, y: 0 }, b: { x: 5000, y: -1600 }, kind: 'railing' },
      { a: { x: 5000, y: -1600 }, b: { x: 0, y: -1600 }, kind: 'railing' },
      { a: { x: 0, y: -1600 }, b: { x: 0, y: 0 }, kind: 'railing' },
    ],
    openings: [slider(2500, 0, 2400)],
    rooms: [{ at: { x: 2500, y: -800 }, name: 'Balcony', type: 'balcony' }],
  });
  return { level, roomId: Object.keys(level.rooms)[0]! };
}

const ids = (items: NewItem[]) => items.map((i) => i.catalogId);
const added = (full: NewItem[], none: NewItem[]) => full.slice(0).filter((i) => !none.some((n) => JSON.stringify({ ...n, finishes: undefined }) === JSON.stringify({ ...i, finishes: undefined })));

/** Items of `full` that the styling pass added: everything not also in the plain layout. */
function styledPart(level: Level, roomId: string): { none: NewItem[]; full: NewItem[]; styled: NewItem[] } {
  const none = autoFurnish(level, roomId, { styling: 'none' });
  const full = autoFurnish(level, roomId);
  return { none, full, styled: added(full, none) };
}

/* ------------------------------------------------------------ tests */

describe('styling on the sample home', () => {
  const level = createSampleLevel();
  const rooms = Object.values(level.rooms);
  const layouts = new Map(rooms.map((r) => [r.id, styledPart(level, r.id)]));
  const byName = (name: string) => layouts.get(rooms.find((r) => r.name === name)!.id)!;

  it.each(rooms.map((r) => [r.name, r.id] as const))('%s: styled items keep every placement rule and the walkways', (_n, id) => {
    const { full, none } = layouts.get(id)!;
    checkRules(level, id, full);
    expectStyleWalkable(level, id);
    expect(none.length).toBeLessThanOrEqual(full.length);
  });

  it('dresses every bedroom: curtains, a lamp on every nightstand, art and a plant', () => {
    for (const name of ['Bedroom 1', 'Bedroom 2', 'Bedroom 3']) {
      const { full } = byName(name);
      const stands = full.filter((i) => i.catalogId.startsWith('nightstand'));
      expect(stands.length, name).toBeGreaterThanOrEqual(1);
      for (const s of stands) {
        const top = getEntry(s.catalogId)!.dims.h;
        const lamp = full.find((i) => i.catalogId.startsWith('lamp.table') && i.z === top && vec.dist(i, s) < 200);
        expect(lamp, `${name}: lamp on the nightstand at ${s.x},${s.y}`).toBeDefined();
      }
      expect(full.some((i) => i.catalogId.startsWith('curtain.')), `${name} curtains`).toBe(true);
      expect(full.some((i) => i.catalogId.startsWith('art.')), `${name} art`).toBe(true);
      expect(full.some((i) => i.catalogId.startsWith('plant.') && i.z === 0), `${name} plant`).toBe(true);
    }
  });

  it('gives the living room a rug under the front of the seating and the coffee table', () => {
    const { full } = byName('Living / Dining');
    expectRugUnderSeating(full, 'Living / Dining');
    expect(full.filter((i) => i.catalogId.startsWith('rug.'))).toHaveLength(1);
  });

  it('is deterministic, also on a fresh copy of the plan with new ids, and never mutates the level', () => {
    const before = JSON.stringify(level);
    for (const r of rooms) expect(autoFurnish(level, r.id)).toEqual(layouts.get(r.id)!.full);
    expect(JSON.stringify(level)).toBe(before);
    const again = createSampleLevel();
    const strip = (list: NewItem[]) => list.map(({ roomId: _r, ...rest }) => rest);
    for (const r of Object.values(again.rooms)) {
      const original = rooms.find((o) => o.name === r.name)!;
      expect(strip(autoFurnish(again, r.id)), r.name).toEqual(strip(layouts.get(original.id)!.full));
    }
  });

  it('dresses the home in one colour scheme of valid furniture materials', () => {
    const all = [...layouts.values()].flatMap((l) => l.full);
    let dressed = 0;
    const metals = new Set<string>();
    for (const item of all) {
      if (!item.finishes) continue;
      dressed++;
      const slots = getEntry(item.catalogId)!.slots ?? [];
      for (const [slot, value] of Object.entries(item.finishes)) {
        const def = slots.find((s) => s.id === slot);
        expect(def, `${item.catalogId} has slot ${slot}`).toBeDefined();
        const material = FURNITURE_MATERIALS[value];
        expect(material, `${item.catalogId}.${slot} = ${value}`).toBeDefined();
        expect(material!.kind, `${item.catalogId}.${slot} kind`).toBe(def!.kind);
        if (def!.kind === 'metal') metals.add(value);
      }
    }
    expect(dressed).toBeGreaterThan(30);
    // One metal through the whole home.
    expect(metals.size).toBe(1);
    for (const scheme of SCHEMES) {
      const values = [scheme.wood, scheme.woodDark, scheme.sofa, scheme.chair, scheme.dining, scheme.headboard, scheme.linen, scheme.metal, scheme.fronts, scheme.stone, ...scheme.cushions, ...scheme.bedThrow, ...scheme.ceramics, ...scheme.rugs.flat()];
      for (const v of values) expect(FURNITURE_MATERIALS[v], `${scheme.id} ${v}`).toBeDefined();
    }
  });

  it('varies the pieces between rooms of the same type', () => {
    const signature = (name: string) => {
      const items = byName(name).full;
      const first = (prefix: string) => items.find((i) => i.catalogId.startsWith(prefix))?.catalogId;
      return [first('lamp.table'), first('art.'), items.find((i) => i.catalogId.startsWith('plant.') && i.z === 0)?.catalogId, first('rug.'), JSON.stringify(items.find((i) => i.catalogId.startsWith('bed.'))?.finishes)].join('|');
    };
    const sigs = new Set(['Bedroom 1', 'Bedroom 2', 'Bedroom 3'].map(signature));
    expect(sigs.size).toBe(3);
  });

  it('keeps the plain layout with styling none: no accessories and no finishes', () => {
    for (const { none } of layouts.values()) {
      expect(none.every((i) => !i.finishes)).toBe(true);
      expect(ids(none).some((id) => /^(curtain\.|art\.|vase\.|tray\.|bowl\.|books\.stack|utensil\.)/.test(id))).toBe(false);
    }
  });

  it('leaves out wall and ceiling pieces when asked', () => {
    for (const r of rooms) {
      const items = autoFurnish(level, r.id, { mounted: false });
      expect(items.every((i) => getEntry(i.catalogId)!.anchor === 'floor'), r.name).toBe(true);
      checkRules(level, r.id, items);
    }
  });
});

function expectRugUnderSeating(items: NewItem[], label: string): void {
  const sofa = items.find((i) => i.catalogId.startsWith('sofa.'));
  const rug = items.find((i) => i.catalogId.startsWith('rug.'));
  expect(sofa, `${label} sofa`).toBeDefined();
  expect(rug, `${label} rug`).toBeDefined();
  const s = pieceOf(sofa!);
  const r = pieceOf(rug!);
  // Under the front legs: the rug reaches under the sofa, but not all the way to its back.
  const depth = penetration(s.rect, r.rect);
  expect(depth, `${label} rug under the sofa`).toBeGreaterThan(80);
  const back = vec.add({ x: sofa!.x, y: sofa!.y }, vec.rotate({ x: 0, y: getEntry(sofa!.catalogId)!.dims.d / 2 - 20 }, sofa!.rotationDeg));
  expect(vec.pointInPolygon(back, r.rect), `${label} rug stops short of the sofa back`).toBe(false);
  const table = items.find((i) => i.catalogId.startsWith('table.coffee'));
  if (table) for (const p of pieceOf(table).rect) expect(vec.pointInPolygon(p, shrink(r.rect, -5)), `${label} coffee table on the rug`).toBe(true);
}

describe('styling on rooms of many sizes and shapes', () => {
  it.each(SYNTHETIC)('%s: keeps every rule and the walkways', (_name, make) => {
    const { level, roomId } = make();
    const { full } = styledPart(level, roomId);
    checkRules(level, roomId, full);
    expectStyleWalkable(level, roomId);
  });

  it('hangs curtains centred on each window with wall beside it, against the window wall and clear of the glass', () => {
    let hung = 0;
    for (const [name, make] of SYNTHETIC) {
      const { level, roomId } = make();
      const items = autoFurnish(level, roomId);
      for (const c of items.filter((i) => stackOf(i.catalogId) > 0)) {
        hung++;
        const e = getEntry(c.catalogId)!;
        const back = vec.add({ x: c.x, y: c.y }, vec.rotate({ x: 0, y: e.dims.d / 2 }, c.rotationDeg));
        const facing = vec.rotate({ x: 0, y: -1 }, c.rotationDeg);
        // The opening it frames: same wall, centred on it.
        const o = openings(level, roomId).find((op) => (op.kind === 'window' || op.kind === 'sliding') && vec.dot(op.normal, facing) > 0.999 && Math.abs(vec.dot(vec.sub(back, op.centre), op.normal)) <= 15);
        expect(o, `${name}: ${c.catalogId} on a window wall`).toBeDefined();
        const along = vec.perp(o!.normal);
        expect(Math.abs(vec.dot(vec.sub({ x: c.x, y: c.y }, o!.centre), along)), `${name}: ${c.catalogId} centred`).toBeLessThanOrEqual(5);
        // The stacked panels stand beside the opening, not over it.
        for (const part of pieceOf(c).solids.filter((s) => !s.rod)) expect(penetration(part.rect, o!.span), `${name}: ${c.catalogId} panel over the glass`).toBeLessThanOrEqual(2);
        // Wide enough to frame the opening with its panels, by about 300 mm a side.
        const width = vec.dist(o!.span[0]!, o!.span[1]!);
        expect(e.dims.w - width, `${name}: ${c.catalogId} for a ${Math.round(width)} opening`).toBeGreaterThanOrEqual(600);
        expect(e.dims.w - width, `${name}: ${c.catalogId} for a ${Math.round(width)} opening`).toBeLessThanOrEqual(1300);
      }
      // Every curtained room type with a free window wall gets curtains.
      if (['bedroom', 'big bedroom', 'small bedroom', 'study', 'dining'].includes(name)) expect(items.some((i) => stackOf(i.catalogId) > 0), `${name} curtains`).toBe(true);
    }
    expect(hung).toBeGreaterThanOrEqual(6);
  });

  it('puts lamps on every nightstand and a rug under the seating, in every bedroom and living room', () => {
    for (const [name, make] of SYNTHETIC) {
      const { level, roomId } = make();
      const items = autoFurnish(level, roomId);
      const type = level.rooms[roomId]!.type;
      if (type === 'bedroom') {
        for (const s of items.filter((i) => i.catalogId.startsWith('nightstand'))) {
          expect(items.some((i) => i.catalogId.startsWith('lamp.table') && i.z === getEntry(s.catalogId)!.dims.h && vec.dist(i, s) < 200), `${name}: lamp on nightstand`).toBe(true);
        }
      }
      if (type === 'living' && items.some((i) => i.catalogId.startsWith('sofa.'))) expectRugUnderSeating(items, name);
    }
  });

  it('scales the accessories with the floor area and never passes the cap', () => {
    const counts: number[] = [];
    for (const [w, h] of [
      [2600, 2800],
      [3200, 3400],
      [3800, 4000],
      [4600, 4800],
    ] as const) {
      const { level, roomId } = boxRoom(w, h, 'bedroom', [door(600, 0), windowAt(w / 2, h, 1500)]);
      const { full, none } = styledPart(level, roomId);
      const area = deriveRooms(level).find((g) => g.roomId === roomId)!.interiorArea / 1e6;
      expect(full.length - none.length, `${w}x${h}`).toBeLessThanOrEqual(stylingCap(area, 'full'));
      counts.push(full.length - none.length);
    }
    expect(counts[3]).toBeGreaterThan(counts[0]!);
    for (const [name, make] of SYNTHETIC) {
      const { level, roomId } = make();
      const area = deriveRooms(level).find((g) => g.roomId === roomId)!.interiorArea / 1e6;
      const { full, none } = styledPart(level, roomId);
      expect(full.length - none.length, name).toBeLessThanOrEqual(stylingCap(area, 'full'));
      const light = autoFurnish(level, roomId, { styling: 'light' }).length - none.length;
      expect(light, `${name} light`).toBeLessThanOrEqual(stylingCap(area, 'light'));
      expect(light, `${name} light`).toBeLessThanOrEqual(full.length - none.length);
    }
    // The cap itself grows with the area and stays bounded.
    expect(stylingCap(4, 'full')).toBeLessThan(stylingCap(12, 'full'));
    expect(stylingCap(200, 'full')).toBeLessThanOrEqual(18);
  });

  it('picks the scheme per home and keeps small bathrooms bare', () => {
    const schemes = new Set<string>();
    for (const [w, h] of [
      [3000, 3200],
      [3400, 3600],
      [3800, 4000],
      [4200, 4400],
      [4600, 4800],
    ] as const) {
      const { level, roomId } = boxRoom(w, h, 'bedroom', [door(600, 0), windowAt(w / 2, h, 1500)]);
      const bed = autoFurnish(level, roomId).find((i) => i.catalogId.startsWith('bed.'))!;
      schemes.add(bed.finishes?.frame ?? '');
    }
    expect(schemes.size).toBeGreaterThanOrEqual(2);
    const { level, roomId } = boxRoom(1300, 1500, 'bathroom', [door(650, 0, 1, 700)]);
    expect(autoFurnish(level, roomId).filter((i) => getEntry(i.catalogId)!.anchor === 'floor').length).toBeLessThanOrEqual(2);
  });
});

describe('styleRoom', () => {
  it('adds only the styling layer to a furnished room, keeps every rule, and adds little the second time', () => {
    const level = createSampleLevel();
    for (const room of Object.values(level.rooms)) {
      const main = autoFurnish(level, room.id, { styling: 'none' });
      for (const item of main) ops.addItem(level, item);
      const existing = Object.values(level.items).filter((i) => i.roomId === room.id);
      const styled = styleRoom(level, room.id);
      checkRules(level, room.id, styled, existing);
      expect(styled.every((i) => !/^(bed|sofa|wardrobe|table\.dining|kitchen\.base|toilet)\b/.test(i.catalogId)), room.name).toBe(true);
      for (const item of styled) ops.addItem(level, item);
      expect(styleRoom(level, room.id).length, `${room.name} second time`).toBeLessThanOrEqual(1);
    }
  });

  it('returns nothing for an unknown room or an empty one of type other', () => {
    const level = createSampleLevel();
    expect(styleRoom(level, 'nope')).toEqual([]);
    const { level: other, roomId } = boxRoom(3000, 3000, 'other', [door(600, 0)]);
    expect(styleRoom(other, roomId)).toEqual([]);
  });
});
