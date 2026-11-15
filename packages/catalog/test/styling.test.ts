import { FURNITURE_MATERIALS, buildLevel, createSampleLevel, deriveRooms, ops, vec, type Level, type RoomType } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { autoFurnish, getEntry, styleRoom } from '../src/index';
import { SCHEMES } from '../src/autofurnish';
import { stylingCap } from '../src/autofurnish/styling';

import { R, checkRules, openings, penetration, pieceOf, shrink, stackOf, walkability, type NewItem } from './rules';

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
function expectStyleWalkable(source: Level, roomId: string): void {
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
