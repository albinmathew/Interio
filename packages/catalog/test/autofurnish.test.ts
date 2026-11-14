import { buildLevel, createSampleLevel, deriveRooms, newId, openingFrame, vec, type Item, type Level, type Pt, type RoomType } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { autoFurnish, getEntry } from '../src/index';

type NewItem = Omit<Item, 'id'>;

/* ------------------------------------------------------------------ *
 * Independent checks: none of this reuses the layout engine's code.  *
 * ------------------------------------------------------------------ */

interface Solid {
  rect: Pt[];
  zMin: number;
  zMax: number;
  /** A curtain rod: it may run across the top of a window. */
  rod?: boolean;
}

interface Box {
  item: NewItem;
  rect: Pt[];
  zMin: number;
  zMax: number;
  flat: boolean;
  anchor: 'floor' | 'wall' | 'ceiling';
  /** What is really solid inside the box: curtains stacked beside a window are two panels and a rod. */
  solids: Solid[];
}

function rectOf(x: number, y: number, w: number, d: number, rotDeg: number): Pt[] {
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ].map((p) => vec.add({ x, y }, vec.rotate(p, rotDeg)));
}

/** Stacked curtains: each gathered panel is `params.stack` mm wide at an end of the rod; the rod fills the top 90 mm. */
const ROD = 90;

function boxOf(item: NewItem): Box {
  const entry = getEntry(item.catalogId);
  if (!entry) throw new Error(`unknown catalog id ${item.catalogId}`);
  const rot = item.rotationDeg ?? 0;
  const z = item.z ?? 0;
  const { w, d, h } = entry.dims;
  const rect = rectOf(item.x, item.y, w, d, rot);
  const stack = entry.model.kind === 'parametric' ? Number(entry.model.params?.stack ?? 0) : 0;
  const solids: Solid[] =
    stack > 0
      ? [
          ...[-1, 1].map((side) => {
            const c = vec.add({ x: item.x, y: item.y }, vec.rotate({ x: side * (w / 2 - stack / 2), y: 0 }, rot));
            return { rect: rectOf(c.x, c.y, stack, d, rot), zMin: z, zMax: z + h };
          }),
          { rect, zMin: z + h - ROD, zMax: z + h, rod: true },
        ]
      : [{ rect, zMin: z, zMax: z + h }];
  return { item, rect, zMin: z, zMax: z + h, flat: h <= 30, anchor: entry.anchor, solids };
}

/** Overlap depth of two convex polygons along the best separating axis (0 when they are apart). */
function penetration(a: Pt[], b: Pt[]): number {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const edge = vec.sub(poly[(i + 1) % poly.length]!, poly[i]!);
      const axis = vec.norm(vec.perp(edge));
      const span = (pts: Pt[]) => pts.map((p) => vec.dot(p, axis));
      const pa = span(a);
      const pb = span(b);
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 0) return 0;
      least = Math.min(least, overlap);
    }
  }
  return least;
}

const shrinkTowardsCentre = (rect: Pt[], by: number): Pt[] => {
  const c = vec.scale(rect.reduce((s, p) => vec.add(s, p), { x: 0, y: 0 }), 1 / rect.length);
  return rect.map((p) => vec.add(p, vec.scale(vec.norm(vec.sub(c, p)), by)));
};

interface RoomOpening {
  kind: string;
  /** Rectangle on the room side of the opening that must stay clear. */
  rect: Pt[];
  sill: number;
  top: number;
}

function roomOpenings(level: Level, interior: Pt[], wallIds: Set<string>): RoomOpening[] {
  const out: RoomOpening[] = [];
  for (const o of Object.values(level.openings)) {
    if (!wallIds.has(o.wallId)) continue;
    const frame = openingFrame(level, o.id)!;
    for (const sign of [1, -1]) {
      const probe = vec.add(frame.center, vec.scale(frame.normal, sign * (frame.thickness / 2 + 120)));
      if (!vec.pointInPolygon(probe, interior)) continue;
      const swingsIn = o.kind === 'door' && (o.swing ?? 1) * sign > 0;
      const depth = o.kind === 'window' ? 300 : swingsIn ? o.width : 600;
      const n = vec.scale(frame.normal, sign);
      const face = frame.thickness / 2;
      out.push({
        kind: o.kind,
        rect: [
          vec.add(frame.left, vec.scale(n, face)),
          vec.add(frame.right, vec.scale(n, face)),
          vec.add(frame.right, vec.scale(n, face + depth)),
          vec.add(frame.left, vec.scale(n, face + depth)),
        ],
        sill: o.sill,
        top: o.sill + o.height,
      });
    }
  }
  return out;
}

/** Asserts every placement rule on a proposed layout. `existing` are items already in the room. */
function checkLayout(level: Level, roomId: string, added: NewItem[], existing: NewItem[] = []): void {
  const geom = deriveRooms(level).find((g) => g.roomId === roomId)!;
  const label = `${level.rooms[roomId]!.name}:`;
  const boxes = [...existing, ...added].map(boxOf);

  for (const item of added) {
    expect(item.roomId, `${label} roomId`).toBe(roomId);
    for (const v of [item.x, item.y, item.z ?? 0]) expect(Number.isInteger(v), `${label} ${item.catalogId} integer mm`).toBe(true);
    expect(item.rotationDeg).toBeGreaterThanOrEqual(0);
    expect(item.rotationDeg).toBeLessThan(360);
    expect(item.z).toBeGreaterThanOrEqual(0);
  }

  // Inside the clear floor polygon.
  for (const b of boxes.slice(existing.length)) {
    for (const p of shrinkTowardsCentre(b.rect, 3)) expect(vec.pointInPolygon(p, geom.interior), `${label} ${b.item.catalogId} at ${b.item.x},${b.item.y} inside the room`).toBe(true);
    for (const v of geom.interior) expect(vec.pointInPolygon(v, shrinkTowardsCentre(b.rect, 3)), `${label} ${b.item.catalogId} straddles a wall corner`).toBe(false);
    expect(b.zMax, `${label} ${b.item.catalogId} under the ceiling`).toBeLessThanOrEqual(level.ceilingHeight);
  }

  // No two items overlap (rugs may lie under furniture; pieces may stack).
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.flat || b.flat) continue;
      for (const sa of a.solids) {
        for (const sb of b.solids) {
          if (Math.min(sa.zMax, sb.zMax) - Math.max(sa.zMin, sb.zMin) <= 1) continue;
          expect(penetration(sa.rect, sb.rect), `${label} ${a.item.catalogId} overlaps ${b.item.catalogId}`).toBeLessThanOrEqual(2);
        }
      }
    }
  }

  // Doors, sliding doors and passages stay clear; windows are not blocked (a curtain rod may cross the top of one).
  for (const o of roomOpenings(level, geom.interior, new Set(geom.edgeWalls))) {
    for (const b of boxes.slice(existing.length)) {
      for (const part of b.solids) {
        const hit = penetration(part.rect, o.rect) > 2;
        if (o.kind === 'window') {
          if (part.rod) continue;
          const ventilator = o.sill >= 1700;
          const blocks = hit && part.zMin < o.top && part.zMax > (ventilator ? o.sill + 300 : o.sill);
          expect(blocks, `${label} ${b.item.catalogId} blocks a window`).toBe(false);
        } else if (part.zMin < o.top) {
          expect(hit, `${label} ${b.item.catalogId} blocks a ${o.kind}`).toBe(false);
        }
      }
    }
  }

  // Anchors: wall pieces touch a wall, ceiling pieces hang from the ceiling, stacked pieces rest on something.
  for (const b of boxes.slice(existing.length)) {
    const entry = getEntry(b.item.catalogId)!;
    if (b.anchor === 'ceiling') expect(b.zMax, `${label} ${entry.id} hangs from the ceiling`).toBe(level.ceilingHeight);
    if (b.anchor === 'wall') {
      const back = vec.add({ x: b.item.x, y: b.item.y }, vec.rotate({ x: 0, y: entry.dims.d / 2 }, b.item.rotationDeg ?? 0));
      let nearest = Infinity;
      for (let i = 0; i < geom.interior.length; i++) nearest = Math.min(nearest, vec.projectOnSegment(back, geom.interior[i]!, geom.interior[(i + 1) % geom.interior.length]!).distance);
      expect(nearest, `${label} ${entry.id} is fixed to a wall`).toBeLessThanOrEqual(15);
      expect(b.zMin, `${label} ${entry.id} mount height`).toBe(entry.mountHeight);
    }
    if (b.anchor === 'floor' && b.zMin > 0) {
      const support = boxes.some((s) => s !== b && Math.abs(s.zMax - b.zMin) <= 1 && penetration(s.rect, b.rect) > 50);
      expect(support, `${label} ${entry.id} at z ${b.zMin} rests on something`).toBe(true);
    }
  }
}

/* --------------------------------------------------------- fixtures */

const T = 150;

function boxLevel(w: number, h: number, type: RoomType, openings: Parameters<typeof buildLevel>[0]['openings'] = []): { level: Level; roomId: string } {
  const level = buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: w, y: 0 }, thickness: T },
      { a: { x: w, y: 0 }, b: { x: w, y: h }, thickness: T },
      { a: { x: w, y: h }, b: { x: 0, y: h }, thickness: T },
      { a: { x: 0, y: h }, b: { x: 0, y: 0 }, thickness: T },
    ],
    openings,
    rooms: [{ at: { x: w / 2, y: h / 2 }, name: `${type} ${w}x${h}`, type }],
  });
  return { level, roomId: Object.keys(level.rooms)[0]! };
}

const door = (x: number, y: number, swing: 1 | -1 = 1, width = 900) => ({ at: { x, y }, kind: 'door' as const, width, height: 2100, sill: 0, hinge: 'a' as const, swing });
const windowAt = (x: number, y: number, width = 1500, sill = 900, height = 1200) => ({ at: { x, y }, kind: 'window' as const, width, height, sill });

const ids = (items: NewItem[]) => items.map((i) => i.catalogId);
const count = (items: NewItem[], prefix: string) => items.filter((i) => i.catalogId.startsWith(prefix)).length;

/* ------------------------------------------------------------ tests */

describe('autoFurnish on the sample home', () => {
  const level = createSampleLevel();
  const rooms = Object.values(level.rooms);
  const layouts = new Map(rooms.map((r) => [r.id, autoFurnish(level, r.id)]));
  const byName = (name: string) => layouts.get(rooms.find((r) => r.name === name)!.id)!;

  it.each(rooms.map((r) => [r.name, r.id] as const))('%s: items are inside, apart and clear of openings', (_name, id) => {
    checkLayout(level, id, layouts.get(id)!);
  });

  it('furnishes every room type that has a template', () => {
    for (const room of rooms) {
      const floor = layouts.get(room.id)!.filter((i) => getEntry(i.catalogId)!.anchor === 'floor');
      if (room.type === 'corridor' || room.type === 'other') continue;
      expect(floor.length, room.name).toBeGreaterThanOrEqual(2);
    }
  });

  it('bedrooms get a bed, nightstands and a wardrobe', () => {
    for (const name of ['Bedroom 1', 'Bedroom 2', 'Bedroom 3']) {
      const items = byName(name);
      expect(count(items, 'bed.'), name).toBe(1);
      expect(count(items, 'nightstand'), name).toBeGreaterThanOrEqual(1);
      expect(count(items, 'wardrobe.'), name).toBe(1);
      expect(ids(items)).toContain('ac.split');
      expect(ids(items)).toContain('fan.ceiling');
    }
    // The largest bedroom gets the bigger pieces.
    expect(ids(byName('Bedroom 1'))).toContain('bed.queen');
    expect(ids(byName('Bedroom 3'))).toContain('bed.double');
  });

  it('the living room gets a sofa facing a TV unit, with a dining set in the spare space', () => {
    const items = byName('Living / Dining');
    const sofa = items.find((i) => i.catalogId.startsWith('sofa.'))!;
    const unit = items.find((i) => i.catalogId === 'tv.unit')!;
    expect(sofa).toBeDefined();
    expect(unit).toBeDefined();
    // The sofa's front points at the unit, and the unit's front points back.
    const sofaFront = vec.rotate({ x: 0, y: -1 }, sofa.rotationDeg);
    const toUnit = vec.sub(unit, sofa);
    expect(vec.dot(sofaFront, vec.norm(toUnit))).toBeGreaterThan(0.9);
    expect(vec.dot(vec.rotate({ x: 0, y: -1 }, unit.rotationDeg), sofaFront)).toBeLessThan(-0.99);
    expect(vec.len(toUnit)).toBeGreaterThan(2000);
    expect(vec.len(toUnit)).toBeLessThan(5000);
    for (const id of ['table.coffee', 'armchair', 'plant.potted', 'tv.wall.55']) expect(ids(items), id).toContain(id);
    expect(count(items, 'rug.')).toBe(1);
    expect(count(items, 'table.dining')).toBe(1);
    expect(count(items, 'chair.dining')).toBeGreaterThanOrEqual(4);
  });

  it('the kitchen gets a counter with sink, hob, chimney and refrigerator along the walls', () => {
    const items = byName('Kitchen');
    expect(count(items, 'fridge.')).toBe(1);
    expect(ids(items)).toContain('kitchen.sink');
    expect(ids(items)).toContain('hob.4burner');
    expect(ids(items)).toContain('hood.chimney');
    expect(count(items, 'kitchen.base')).toBeGreaterThanOrEqual(2);
    // The chimney hangs over the hob.
    const hob = items.find((i) => i.catalogId === 'hob.4burner')!;
    const hood = items.find((i) => i.catalogId === 'hood.chimney')!;
    expect(vec.dist(hob, hood)).toBeLessThan(120);
    expect(hood.z).toBeGreaterThan(hob.z + 600);
  });

  it('bathrooms get a toilet and a basin, and a shower where there is room', () => {
    for (const name of ['Bath 1', 'Bath 2']) {
      const items = byName(name);
      expect(count(items, 'toilet'), name).toBe(1);
      expect(count(items, 'basin.'), name).toBe(1);
    }
    expect(count(byName('Bath 1'), 'shower')).toBe(1);
  });

  it('the balcony gets chairs and a small table, the foyer a console or shoe cabinet', () => {
    const balcony = byName('Balcony');
    expect(count(balcony, 'outdoor.chair')).toBe(2);
    expect(count(balcony, 'outdoor.table')).toBe(1);
    const foyer = ids(byName('Foyer'));
    expect(foyer.includes('table.console') || foyer.includes('shoe.cabinet')).toBe(true);
  });

  it('is deterministic and never mutates the level', () => {
    const before = JSON.stringify(level);
    for (const room of rooms) expect(autoFurnish(level, room.id)).toEqual(layouts.get(room.id));
    expect(JSON.stringify(level)).toBe(before);
    expect(Object.keys(level.items)).toHaveLength(0);
    // A fresh copy of the same plan (new random ids) gives the same layout.
    const again = createSampleLevel();
    for (const room of Object.values(again.rooms)) {
      const original = rooms.find((r) => r.name === room.name)!;
      const strip = (list: NewItem[]) => list.map(({ roomId: _roomId, ...rest }) => rest);
      expect(strip(autoFurnish(again, room.id))).toEqual(strip(layouts.get(original.id)!));
    }
  });

  it('can leave out wall-mounted and ceiling pieces', () => {
    for (const room of rooms) {
      const items = autoFurnish(level, room.id, { mounted: false });
      expect(items.every((i) => getEntry(i.catalogId)!.anchor === 'floor')).toBe(true);
      checkLayout(level, room.id, items);
    }
  });

  it('returns nothing for an unknown room', () => {
    expect(autoFurnish(level, 'nope')).toEqual([]);
  });

  it('treats items already in the room as obstacles and does not duplicate the main piece', () => {
    const bedroom = rooms.find((r) => r.name === 'Bedroom 1')!;
    const geom = deriveRooms(level).find((g) => g.roomId === bedroom.id)!;
    const existing: Item = { id: newId('i'), catalogId: 'bed.single', x: Math.round(geom.centroid.x), y: Math.round(geom.centroid.y), z: 0, rotationDeg: 30, roomId: bedroom.id };
    const withBed: Level = { ...level, items: { [existing.id]: existing } };
    const added = autoFurnish(withBed, bedroom.id);
    expect(count(added, 'bed.')).toBe(0);
    expect(count(added, 'wardrobe.')).toBe(1);
    checkLayout(withBed, bedroom.id, added, [existing]);
  });
});

describe('autoFurnish scales with the room', () => {
  const run = (w: number, h: number, type: RoomType, openings: Parameters<typeof boxLevel>[3] = [door(w / 2, 0)]) => {
    const { level, roomId } = boxLevel(w, h, type, openings);
    const items = autoFurnish(level, roomId);
    checkLayout(level, roomId, items);
    return items;
  };

  it('picks the bed for the bedroom size', () => {
    expect(ids(run(2500, 2900, 'bedroom', [door(600, 0)]))).toContain('bed.single');
    expect(ids(run(3000, 3200, 'bedroom', [door(600, 0)]))).toContain('bed.double');
    expect(ids(run(3400, 3600, 'bedroom', [door(600, 0)]))).toContain('bed.queen');
    const big = run(4500, 4500, 'bedroom', [door(600, 0), windowAt(2250, 4500)]);
    expect(ids(big)).toContain('bed.king');
    expect(ids(big)).toContain('wardrobe.sliding');
    expect(ids(big)).toContain('desk');
    expect(ids(big)).toContain('chair.office');
  });

  it('gives small or awkward rooms fewer items instead of bad placement', () => {
    const tinyBath = run(1300, 1500, 'bathroom', [door(650, 0, 1, 700)]);
    expect(tinyBath.filter((i) => getEntry(i.catalogId)!.anchor === 'floor').length).toBeLessThanOrEqual(2);
    const closet = run(1100, 1200, 'bedroom', [door(550, 0, 1, 700)]);
    expect(count(closet, 'bed.')).toBe(0);
    const sliver = run(900, 4000, 'living', [door(450, 0, 1, 700)]);
    expect(count(sliver, 'sofa.')).toBe(0);
    expect(run(3000, 3000, 'other')).toEqual([]);
  });

  it('furnishes a large bathroom, a study, a dining room, a utility room and a store', () => {
    const bath = run(2600, 3200, 'bathroom', [door(600, 0, 1, 750), windowAt(1300, 3200, 600, 1800, 600)]);
    for (const prefix of ['toilet', 'basin.']) expect(count(bath, prefix), prefix).toBe(1);
    expect(count(bath, 'bathtub') + count(bath, 'shower'), 'bathtub or shower').toBe(1);
    expect(ids(bath)).toContain('basin.vanity');
    const study = run(3000, 3400, 'study', [door(600, 0), windowAt(1500, 3400)]);
    for (const id of ['desk', 'chair.office']) expect(ids(study)).toContain(id);
    expect(count(study, 'bookcase.')).toBe(1);
    const dining = run(3600, 4200, 'dining', [door(600, 0)]);
    expect(count(dining, 'table.dining')).toBe(1);
    expect(count(dining, 'chair.dining')).toBeGreaterThanOrEqual(4);
    expect(ids(dining)).toContain('sideboard');
    const utility = run(1800, 2200, 'utility', [door(500, 0, 1, 750)]);
    expect(count(utility, 'washer.')).toBe(1);
    const store = run(1800, 2000, 'storage', [door(500, 0, 1, 750)]);
    expect(ids(store)).toContain('shelf.metal');
    const foyer = run(2200, 2400, 'foyer', [door(1100, 0, 1, 1000)]);
    expect(ids(foyer).some((id) => id === 'table.console' || id === 'shoe.cabinet')).toBe(true);
  });

  it('keeps tall pieces away from windows and puts the desk under one', () => {
    const { level, roomId } = boxLevel(3600, 3800, 'bedroom', [door(600, 0), windowAt(1800, 3800, 1800)]);
    const items = autoFurnish(level, roomId);
    checkLayout(level, roomId, items);
    const desk = items.find((i) => i.catalogId === 'desk');
    if (desk) expect(desk.y).toBeGreaterThan(3000);
  });

  it('handles an L-shaped living room', () => {
    const level = buildLevel({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 7000, y: 0 }, thickness: T },
        { a: { x: 7000, y: 0 }, b: { x: 7000, y: 3500 }, thickness: T },
        { a: { x: 7000, y: 3500 }, b: { x: 3500, y: 3500 }, thickness: T },
        { a: { x: 3500, y: 3500 }, b: { x: 3500, y: 6500 }, thickness: T },
        { a: { x: 3500, y: 6500 }, b: { x: 0, y: 6500 }, thickness: T },
        { a: { x: 0, y: 6500 }, b: { x: 0, y: 0 }, thickness: T },
      ],
      openings: [door(6000, 0), windowAt(0, 4500, 1800), { at: { x: 1700, y: 6500 }, kind: 'sliding', width: 2000, height: 2400, sill: 0 }],
      rooms: [{ at: { x: 1500, y: 1500 }, name: 'L living', type: 'living' }],
    });
    const roomId = Object.keys(level.rooms)[0]!;
    const items = autoFurnish(level, roomId);
    checkLayout(level, roomId, items);
    expect(count(items, 'sofa.')).toBe(1);
    expect(ids(items)).toContain('tv.unit');
    expect(count(items, 'table.dining')).toBe(1);
  });

  it('handles rooms on a rotated plan', () => {
    const rot = (p: Pt) => vec.roundPt(vec.rotate(p, 27));
    const corners = [{ x: 0, y: 0 }, { x: 4200, y: 0 }, { x: 4200, y: 3600 }, { x: 0, y: 3600 }].map(rot);
    const level = buildLevel({
      walls: corners.map((a, i) => ({ a, b: corners[(i + 1) % 4]!, thickness: T })),
      openings: [{ ...door(0, 0), at: rot({ x: 700, y: 0 }) }, { ...windowAt(0, 0), at: rot({ x: 2100, y: 3600 }) }],
      rooms: [{ at: rot({ x: 2100, y: 1800 }), name: 'Rotated bedroom', type: 'bedroom' }],
    });
    const roomId = Object.keys(level.rooms)[0]!;
    const items = autoFurnish(level, roomId);
    checkLayout(level, roomId, items);
    expect(count(items, 'bed.')).toBe(1);
    expect(count(items, 'wardrobe.')).toBe(1);
  });
});
