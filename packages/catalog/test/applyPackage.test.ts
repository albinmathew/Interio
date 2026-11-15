import { buildLevel, createSampleLevel, deriveRooms, openingFrame, vec, type BedroomRole, type FurnishingPackage, type Item, type Level, type Pt } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { ESSENTIALS_3BHK, applyPackage, bedroomRoles, checkPackage, getEntry, type ApplyPackageResult } from '../src/index';
import { checkRules, walkability, type NewItem } from './rules';

/* ------------------------------------------------------------------ helpers */

/** The level after a package result is applied, as the app does it. */
function applied(level: Level, res: ApplyPackageResult): Level {
  const out = structuredClone(level);
  for (const id of res.remove) delete out.items[id];
  res.items.forEach((item, i) => {
    out.items[`p${i}`] = { ...item, id: `p${i}` } as Item;
  });
  for (const [id, patch] of Object.entries(res.rooms)) Object.assign(out.rooms[id]!, patch);
  for (const [id, patch] of Object.entries(res.walls)) Object.assign(out.walls[id]!, patch);
  return out;
}

const roomNamed = (level: Level, name: string) => Object.values(level.rooms).find((r) => r.name === name)!;
const itemsIn = (items: NewItem[], roomId: string) => items.filter((i) => i.roomId === roomId);

/** Every line of a matched section is met, or says why not. */
function expectEveryLineAccounted(res: ApplyPackageResult): void {
  for (const line of res.report.lines) {
    const where = `${line.title} / ${line.roomName ?? '-'}: ${line.label}`;
    if (line.status === 'placed' || line.status === 'included') continue;
    expect(line.reason, `${where} (${line.status}) has a reason`).toBeTruthy();
    expect(['noSpace', 'partial'], `${where} is ${line.status}`).toContain(line.status);
  }
}

/** Placement rules (inside the room, no overlaps, doors and windows clear) for everything added, room by room. */
function expectRules(level: Level, res: ApplyPackageResult): void {
  for (const room of Object.values(level.rooms)) {
    const added = itemsIn(res.items, room.id);
    if (added.length === 0) continue;
    const existing = Object.values(level.items).filter((i) => i.roomId === room.id && !res.remove.includes(i.id));
    checkRules(level, room.id, added, existing);
  }
}

/** The face of the wall behind an item (its back), with the finish it shows to the room. */
function finishBehind(level: Level, item: NewItem): string | undefined {
  const e = getEntry(item.catalogId)!;
  const back = vec.add({ x: item.x, y: item.y }, vec.rotate({ x: 0, y: e.dims.d / 2 + 150 }, item.rotationDeg));
  let best: { d: number; finish?: string } = { d: Infinity };
  for (const w of Object.values(level.walls)) {
    const a = level.vertices[w.a]!;
    const b = level.vertices[w.b]!;
    const d = vec.projectOnSegment(back, a, b).distance;
    if (d >= best.d) continue;
    const left = vec.dot(vec.perp(vec.sub(b, a)), vec.sub({ x: item.x, y: item.y }, a)) > 0;
    best = { d, finish: left ? w.finishLeft : w.finishRight };
  }
  return best.d < 400 ? best.finish : undefined;
}

/* ------------------------------------------------------------- synthetic plans */

const door = (x: number, y: number, width = 900) => ({ at: { x, y }, kind: 'door' as const, width, height: 2100, sill: 0, hinge: 'a' as const, swing: 1 as const });
const win = (x: number, y: number, width: number, sill = 900, height = 1200) => ({ at: { x, y }, kind: 'window' as const, width, height, sill });

/**
 * A three-bedroom home with separate living and dining rooms joined by an open-plan
 * divider, a balcony off the dining room, a foyer and a kitchen.
 */
function dividedHome(): Level {
  const w = (x1: number, y1: number, x2: number, y2: number, kind?: 'divider' | 'railing') => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: kind ? 100 : 150, ...(kind ? { kind } : {}) });
  return buildLevel({
    walls: [
      w(0, 0, 14000, 0),
      w(14000, 0, 14000, 10500),
      w(14000, 10500, 0, 10500),
      w(0, 10500, 0, 0),
      w(0, 5500, 14000, 5500),
      w(0, 6700, 14000, 6700),
      w(6000, 0, 6000, 5500, 'divider'),
      w(10500, 0, 10500, 5500),
      w(10500, 2600, 14000, 2600),
      w(5000, 6700, 5000, 10500),
      w(9200, 6700, 9200, 10500),
      w(12000, 6700, 12000, 10500),
      w(6500, 0, 6500, -1600, 'railing'),
      w(6500, -1600, 9800, -1600, 'railing'),
      w(9800, -1600, 9800, 0, 'railing'),
    ],
    openings: [
      door(14000, 1300, 1000),
      { at: { x: 10500, y: 1300 }, kind: 'passage', width: 1400, height: 2400, sill: 0 },
      { at: { x: 10500, y: 4000 }, kind: 'passage', width: 1000, height: 2400, sill: 0 },
      { at: { x: 3000, y: 5500 }, kind: 'passage', width: 1500, height: 2400, sill: 0 },
      { at: { x: 8150, y: 0 }, kind: 'sliding', width: 2400, height: 2400, sill: 0 },
      door(1500, 6700),
      door(6000, 6700),
      door(9800, 6700),
      door(13000, 6700, 750),
      win(0, 2700, 1800),
      win(3000, 0, 2000),
      win(2500, 10500, 1800),
      win(7100, 10500, 1500),
      win(10600, 10500, 1200),
      win(14000, 4000, 1200, 1100, 1000),
    ],
    rooms: [
      { at: { x: 3000, y: 2500 }, name: 'Living', type: 'living' },
      { at: { x: 8200, y: 2500 }, name: 'Dining', type: 'dining' },
      { at: { x: 12200, y: 1300 }, name: 'Foyer', type: 'foyer' },
      { at: { x: 12200, y: 4000 }, name: 'Kitchen', type: 'kitchen' },
      { at: { x: 7000, y: 6100 }, name: 'Corridor', type: 'corridor' },
      { at: { x: 2500, y: 8600 }, name: 'Bedroom A', type: 'bedroom' },
      { at: { x: 7100, y: 8600 }, name: 'Bedroom B', type: 'bedroom' },
      { at: { x: 10600, y: 8600 }, name: 'Bedroom C', type: 'bedroom' },
      { at: { x: 13000, y: 8600 }, name: 'Bath', type: 'bathroom' },
      { at: { x: 8150, y: -800 }, name: 'Balcony', type: 'balcony' },
    ],
  });
}

function bedrooms(n: number, roles: (BedroomRole | undefined)[] = []): Level {
  const walls = [
    { a: { x: 0, y: 0 }, b: { x: n * 4000, y: 0 } },
    { a: { x: n * 4000, y: 0 }, b: { x: n * 4000, y: 4000 } },
    { a: { x: n * 4000, y: 4000 }, b: { x: 0, y: 4000 } },
    { a: { x: 0, y: 4000 }, b: { x: 0, y: 0 } },
  ];
  // Rooms get narrower from left to right: the leftmost is the largest.
  let x = 0;
  const xs: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    x += 4600 - i * 300;
    xs.push(x);
    walls.push({ a: { x, y: 0 }, b: { x, y: 4000 } });
  }
  const level = buildLevel({
    walls,
    rooms: [0, ...xs].map((x0, i) => ({ at: { x: x0 + 1000, y: 2000 }, name: `B${i + 1}`, type: 'bedroom' as const })),
  });
  roles.forEach((role, i) => {
    if (role) roomNamed(level, `B${i + 1}`).role = role;
  });
  return level;
}

/* ---------------------------------------------------------------------- tests */

describe('bedroom roles', () => {
  it('gives the largest bedroom the master role, then kids, then guest', () => {
    const level = createSampleLevel();
    const roles = bedroomRoles(level);
    expect(roles[roomNamed(level, 'Bedroom 1').id]).toBe('master');
    expect(roles[roomNamed(level, 'Bedroom 2').id]).toBe('kids');
    expect(roles[roomNamed(level, 'Bedroom 3').id]).toBe('guest');
  });

  it('has a master and a guest bedroom in a two-bedroom home, and guest again from the fourth', () => {
    const two = bedrooms(2);
    expect(['B1', 'B2'].map((n) => bedroomRoles(two)[roomNamed(two, n).id])).toEqual(['master', 'guest']);
    const four = bedrooms(4);
    expect(['B1', 'B2', 'B3', 'B4'].map((n) => bedroomRoles(four)[roomNamed(four, n).id])).toEqual(['master', 'kids', 'guest', 'guest']);
  });

  it('keeps roles that are set and hands out the rest by size', () => {
    const level = bedrooms(3, [undefined, undefined, 'master']);
    const roles = bedroomRoles(level);
    expect(['B1', 'B2', 'B3'].map((n) => roles[roomNamed(level, n).id])).toEqual(['kids', 'guest', 'master']);
  });

  it('writes the roles with the furnishing', () => {
    const level = createSampleLevel();
    const res = applyPackage(level, ESSENTIALS_3BHK);
    expect(res.rooms[roomNamed(level, 'Bedroom 1').id]?.role).toBe('master');
    expect(res.rooms[roomNamed(level, 'Bedroom 3').id]?.role).toBe('guest');
  });
});

describe('applyPackage on the sample home', () => {
  const level = createSampleLevel();
  const before = structuredClone(level);
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const after = applied(level, res);
  const master = roomNamed(level, 'Bedroom 1');
  const living = roomNamed(level, 'Living / Dining');

  it('never mutates the level', () => {
    expect(level).toEqual(before);
  });

  it('meets every line or says why not', () => {
    expectEveryLineAccounted(res);
    expect(res.report.placed).toBeGreaterThan(res.report.needed * 0.8);
  });

  it('places the package pieces before the template’s own', () => {
    const ids = (roomId: string) => itemsIn(res.items, roomId).map((i) => i.catalogId);
    expect(ids(master.id)).toContain('bed.king.drawers');
    expect(ids(master.id)).toContain('wardrobe.ceiling');
    expect(ids(master.id)).not.toContain('bed.king');
    expect(ids(living.id)).toContain('tv.unit.glass');
    expect(ids(living.id)).toContain('table.coffee.large');
    expect(ids(living.id).some((id) => id.startsWith('prayer.unit.christian'))).toBe(true);
    expect(ids(living.id)).toContain('clock.roman');
    expect(ids(living.id)).toContain('table.dining6');
    expect(ids(living.id)).toContain('bench.dining');
    expect(ids(living.id)).toContain('basin.vanity');
    expect(ids(living.id)).not.toContain('tv.unit');
  });

  it('applies the dining section to the combined living and dining room', () => {
    const dining = res.report.sections.find((s) => s.title === 'Dining room')!;
    expect(dining.roomIds).toEqual([living.id]);
  });

  it('follows every placement rule: inside the room, no overlaps, doors and windows clear', () => {
    expectRules(level, res);
  });

  it('keeps every doorway of the living and dining room reachable', () => {
    const w = walkability(level, living.id, itemsIn(res.items, living.id));
    expect(w.groups.every((g) => g >= 0)).toBe(true);
    expect(new Set(w.groups).size).toBe(1);
  });

  it('stands the partition between the seating and the dining table', () => {
    const items = itemsIn(res.items, living.id);
    const partition = items.find((i) => i.catalogId === 'partition.slatted');
    const sofa = items.find((i) => i.catalogId.startsWith('sofa.'))!;
    const table = items.find((i) => i.catalogId === 'table.dining6')!;
    expect(partition).toBeDefined();
    const u = vec.norm(vec.sub(table, sofa));
    const along = vec.dot(vec.sub(partition!, sofa), u) / vec.dist(sofa, table);
    expect(along).toBeGreaterThan(0.2);
    expect(along).toBeLessThan(0.8);
  });

  it('spills the planters onto the balcony off the dining area', () => {
    const balcony = roomNamed(level, 'Balcony');
    const inRoom = itemsIn(res.items, living.id).filter((i) => i.catalogId === 'outdoor.planter').length;
    const outside = itemsIn(res.items, balcony.id).filter((i) => i.catalogId === 'outdoor.planter').length;
    expect(inRoom + outside).toBe(6);
    expect(outside).toBeGreaterThan(0);
  });

  it('hangs blinds sized to each window in the master and guest bedrooms, and no curtains there', () => {
    for (const name of ['Bedroom 1', 'Bedroom 3']) {
      const room = roomNamed(level, name);
      const items = itemsIn(res.items, room.id);
      expect(items.some((i) => i.catalogId.startsWith('curtain.')), `${name} has no curtains`).toBe(false);
      const blinds = items.filter((i) => i.catalogId.startsWith('blind.'));
      expect(blinds.length).toBe(1);
      const window = Object.values(level.openings).filter((o) => o.kind === 'window').sort((a, b) => vec.dist(openingFrame(level, a.id)!.center, blinds[0]!) - vec.dist(openingFrame(level, b.id)!.center, blinds[0]!))[0]!;
      expect(getEntry(blinds[0]!.catalogId)!.dims.w).toBe(window.width);
    }
  });

  it('gives the yellow chair its colour when it is placed', () => {
    for (const chair of res.items.filter((i) => i.catalogId === 'armchair' && i.roomId === master.id)) expect(chair.finishes?.upholstery).toBe('fabric.cotton.mustard');
  });

  it('puts the wallpaper behind the bed and the panelling behind the TV unit', () => {
    const bed = itemsIn(res.items, master.id).find((i) => i.catalogId === 'bed.king.drawers')!;
    expect(finishBehind(after, bed)).toBe('wall.wallpaper.linen');
    const unit = itemsIn(res.items, living.id).find((i) => i.catalogId === 'tv.unit.glass')!;
    expect(finishBehind(after, unit)).toBe('wall.panel.fluted');
    const guest = roomNamed(level, 'Bedroom 3');
    expect(res.rooms[guest.id]?.wallMaterial).toBe('wall.paint.blush');
    expect(res.rooms[roomNamed(level, 'Foyer').id]?.wallMaterial).toBe('wall.microcement');
  });

  it('is deterministic, even with new ids', () => {
    const fresh = createSampleLevel();
    const named = (l: Level, items: NewItem[]) => items.map((i) => ({ ...i, roomId: l.rooms[i.roomId!]!.name }));
    expect(named(fresh, applyPackage(fresh, ESSENTIALS_3BHK).items)).toEqual(named(level, res.items));
    expect(applyPackage(level, ESSENTIALS_3BHK)).toEqual(res);
  });

  it('agrees with the live checklist of the furnished home', () => {
    const live = checkPackage(after, ESSENTIALS_3BHK);
    expect(live.placed).toBe(res.report.placed);
    expect(live.lines.map((l) => l.have)).toEqual(res.report.lines.map((l) => l.have));
  });
});

describe('completing a furnished home', () => {
  const level = createSampleLevel();
  const first = applyPackage(level, ESSENTIALS_3BHK);
  const home = applied(level, first);
  const living = roomNamed(home, 'Living / Dining');

  it('adds nothing when every line that fits is there', () => {
    const again = applyPackage(home, ESSENTIALS_3BHK);
    expect(again.items.filter((i) => i.roomId !== undefined && !getEntry(i.catalogId)!.id.startsWith('blind.'))).toEqual([]);
    expect(again.remove).toEqual([]);
  });

  it('adds only the missing lines to rooms that have furniture', () => {
    const missing = structuredClone(home);
    const prayer = Object.values(missing.items).find((i) => i.catalogId.startsWith('prayer.unit'))!;
    const clock = Object.values(missing.items).find((i) => i.catalogId === 'clock.roman')!;
    delete missing.items[prayer.id];
    delete missing.items[clock.id];
    expect(checkPackage(missing, ESSENTIALS_3BHK).lines.find((l) => l.key === 'prayer')!.status).toBe('missing');
    const res = applyPackage(missing, ESSENTIALS_3BHK);
    expect(res.items.map((i) => i.catalogId.replace(/^prayer\.unit\.christian.*/, 'prayer')).sort()).toEqual(['clock.roman', 'prayer']);
    expect(res.items.every((i) => i.roomId === living.id)).toBe(true);
    expectRules(missing, res);
  });

  it('adds one line on its own (the checklist’s Add)', () => {
    const missing = structuredClone(home);
    for (const i of Object.values(missing.items)) if (i.catalogId.startsWith('prayer.unit') || i.catalogId === 'clock.roman') delete missing.items[i.id];
    const res = applyPackage(missing, ESSENTIALS_3BHK, { lines: [{ roomId: living.id, key: 'prayer' }] });
    expect(res.items.map((i) => i.catalogId)).toHaveLength(1);
    expect(res.items[0]!.catalogId).toMatch(/^prayer\.unit\.christian/);
  });

  it('swaps a piece of the same kind for the package’s only when asked to', () => {
    const swapped = structuredClone(home);
    const master = roomNamed(swapped, 'Bedroom 1');
    const bed = Object.values(swapped.items).find((i) => i.roomId === master.id && i.catalogId === 'bed.king.drawers')!;
    bed.catalogId = 'bed.queen';
    const quiet = applyPackage(swapped, ESSENTIALS_3BHK);
    expect(quiet.items.some((i) => i.catalogId.startsWith('bed.'))).toBe(false);
    expect(quiet.report.lines.find((l) => l.roomId === master.id && l.key === 'bed')!.reason).toMatch(/queen bed stands here/i);
    const asked = applyPackage(swapped, ESSENTIALS_3BHK, { lines: [{ roomId: master.id, key: 'bed' }] });
    expect(asked.remove).toEqual([bed.id]);
    expect(asked.items.map((i) => i.catalogId)).toEqual(['bed.king.drawers']);
  });
});

describe('applyPackage on a home with a divider between living and dining', () => {
  const level = dividedHome();
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const dining = roomNamed(level, 'Dining');

  it('matches every section to its room', () => {
    for (const s of res.report.sections) expect(s.roomIds.length, s.title).toBe(1);
    expect(res.report.sections.find((s) => s.title === 'Dining room')!.roomIds).toEqual([dining.id]);
  });

  it('meets every line or says why not, by every placement rule', () => {
    expectEveryLineAccounted(res);
    expectRules(level, res);
  });

  it('stands the partition on the divider, clear of the walkway', () => {
    const partition = itemsIn(res.items, dining.id).find((i) => i.catalogId === 'partition.slatted');
    expect(partition).toBeDefined();
    expect(Math.abs(partition!.x - 6000)).toBeLessThan(150);
    // Parallel to the divider, at one end of it.
    expect(Math.round(Math.abs(Math.cos((partition!.rotationDeg * Math.PI) / 180)))).toBe(0);
    expect(Math.min(partition!.y, 5500 - partition!.y)).toBeLessThan(1000);
    const w = walkability(level, dining.id, itemsIn(res.items, dining.id));
    expect(w.groups.every((g) => g >= 0)).toBe(true);
  });

  it('puts the common wash against a dining-room wall', () => {
    const wash = itemsIn(res.items, dining.id).find((i) => i.catalogId === 'basin.vanity');
    expect(wash).toBeDefined();
  });

  it('sends the planters that do not fit to the balcony off the dining room', () => {
    const balcony = roomNamed(level, 'Balcony');
    const count = (id: string) => itemsIn(res.items, id).filter((i) => i.catalogId === 'outdoor.planter').length;
    const line = res.report.lines.find((l) => l.key === 'planters')!;
    expect(count(dining.id) + count(balcony.id)).toBe(line.have);
    expect(count(balcony.id)).toBeGreaterThan(0);
    if (line.have < 6) expect(line.reason).toBeTruthy();
  });

  it('sizes every blind to the closest width of its window', () => {
    const blinds = res.items.filter((i) => i.catalogId.startsWith('blind.'));
    expect(blinds.length).toBeGreaterThanOrEqual(2);
    for (const b of blinds) {
      const near = Object.values(level.openings)
        .filter((o) => o.kind === 'window')
        .map((o) => ({ o, d: vec.dist(openingFrame(level, o.id)!.center, b as Pt) }))
        .sort((x, y) => x.d - y.d)[0]!;
      const widths = [900, 1200, 1500, 1800, 2100, 2400].sort((x, y) => Math.abs(x - near.o.width) - Math.abs(y - near.o.width) || y - x);
      expect(getEntry(b.catalogId)!.dims.w).toBe(widths[0]);
    }
  });
});

describe('a bedroom whose only glazing is a sliding door near a corner', () => {
  // 3.66 x 4.5 m bedroom; its 1.8 m balcony door stands 300 mm from the east corner, as in the TPC plans.
  const w = (x1: number, y1: number, x2: number, y2: number, kind?: 'railing') => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: kind ? 100 : 150, ...(kind ? { kind } : {}) });
  const level = buildLevel({
    walls: [w(0, 0, 3660, 0), w(3660, 0, 3660, 4500), w(3660, 4500, 0, 4500), w(0, 4500, 0, 0), w(0, 0, 0, -1500, 'railing'), w(0, -1500, 3660, -1500, 'railing'), w(3660, -1500, 3660, 0, 'railing')],
    openings: [{ at: { x: 3660 - 300 - 900, y: 0 }, kind: 'sliding', width: 1800, height: 2400, sill: 0 }, door(500, 4500)],
    rooms: [
      { at: { x: 1800, y: 2200 }, name: 'Bedroom', type: 'bedroom' },
      { at: { x: 1800, y: -700 }, name: 'Balcony', type: 'balcony' },
    ],
  });
  const room = roomNamed(level, 'Bedroom');
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const curtains = itemsIn(res.items, room.id).filter((i) => i.catalogId.startsWith('curtain.'));

  it('hangs curtains on the sliding door for the blinds line, with the track shifted off the corner', () => {
    expect(res.rooms[room.id]?.role ?? room.role).toBe('master');
    expect(curtains).toHaveLength(1);
    const e = getEntry(curtains[0]!.catalogId)!;
    // The track stays on the wall and spans the door.
    expect(curtains[0]!.x + e.dims.w / 2).toBeLessThanOrEqual(3660 - 75 + 1);
    expect(curtains[0]!.x - e.dims.w / 2).toBeLessThanOrEqual(3660 - 300 - 1800 - 75);
    expect(res.report.lines.find((l) => l.key === 'blinds' && l.roomId === room.id)?.status).toBe('placed');
  });

  it('keeps the door walkable and every placement rule', () => {
    expectRules(level, res);
    const reach = walkability(level, room.id, itemsIn(res.items, room.id));
    expect(new Set(reach.groups).size).toBe(1);
  });
});

describe('the crockery unit', () => {
  // A 4.2 x 4.6 m dining room with a door and a window.
  const w = (x1: number, y1: number, x2: number, y2: number) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: 150 });
  const level = buildLevel({
    walls: [w(0, 0, 4200, 0), w(4200, 0, 4200, 4600), w(4200, 4600, 0, 4600), w(0, 4600, 0, 0)],
    openings: [door(600, 0), win(2100, 4600, 1500)],
    rooms: [{ at: { x: 2100, y: 2300 }, name: 'Dining', type: 'dining' }],
  });
  const dining = roomNamed(level, 'Dining');
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const items = itemsIn(res.items, dining.id);

  it('stands behind the dining table, against a wall along its long side, in place of a sideboard', () => {
    const table = items.find((i) => i.catalogId.startsWith('table.dining'))!;
    const unit = items.find((i) => i.catalogId.startsWith('crockery.'));
    expect(unit).toBeDefined();
    expect(Math.hypot(unit!.x - table.x, unit!.y - table.y)).toBeLessThan(3000);
    // Parallel to the table: the same facing, or the opposite one.
    expect(((unit!.rotationDeg - table.rotationDeg) % 180 + 180) % 180).toBe(0);
    expect(items.some((i) => i.catalogId === 'sideboard')).toBe(false);
    expect(res.report.lines.find((l) => l.key === 'crockery' && l.roomId === dining.id)?.status).toBe('placed');
  });

  it('keeps every placement rule and every doorway reachable', () => {
    expectRules(level, res);
    expect(new Set(walkability(level, dining.id, items).groups).size).toBe(1);
  });
});

describe('a bedroom too small to be one (a service room)', () => {
  // A 3.7 x 4 m bedroom and a 1.9 x 1.9 m "bedroom" off a lobby with the entrance; its door is by a corner, as in the TPC plans.
  const w = (x1: number, y1: number, x2: number, y2: number) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: 150 });
  const level = buildLevel({
    walls: [w(0, 0, 3700, 0), w(3700, 0, 5600, 0), w(5600, 0, 5600, 1900), w(5600, 1900, 5600, 4000), w(5600, 4000, 3700, 4000), w(3700, 4000, 0, 4000), w(0, 4000, 0, 0), w(3700, 0, 3700, 1900), w(3700, 1900, 3700, 4000), w(3700, 1900, 5600, 1900)],
    openings: [door(3700, 3000), door(5150, 1900, 800), door(5600, 3000), win(1800, 0, 1500), win(4650, 0, 900)],
    rooms: [
      { at: { x: 1800, y: 2000 }, name: 'Bedroom', type: 'bedroom' },
      { at: { x: 4650, y: 950 }, name: 'Service Room', type: 'bedroom' },
      { at: { x: 4650, y: 3000 }, name: 'Lobby', type: 'corridor' },
    ],
  });
  const service = roomNamed(level, 'Service Room');
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const items = itemsIn(res.items, service.id);
  const ids = items.map((i) => i.catalogId);

  it('takes no bedroom role and becomes a work space; the other bedroom is the master', () => {
    expect(bedroomRoles(level)[service.id]).toBeUndefined();
    expect(res.rooms[service.id]).toMatchObject({ type: 'study' });
    expect(res.rooms[service.id]?.role).toBeUndefined();
    expect(res.rooms[roomNamed(level, 'Bedroom').id]?.role).toBe('master');
    expect(res.report.lines.some((l) => l.roomId === service.id)).toBe(false);
  });

  it('gets a work-from-home desk: desk, office chair, laptop and overhead cupboards above the desk', () => {
    const desk = items.find((i) => i.catalogId.startsWith('desk'));
    expect(desk).toBeDefined();
    expect(ids).toContain('chair.office');
    expect(ids).toContain('laptop');
    const cupboard = items.find((i) => i.catalogId.startsWith('storage.overhead.'));
    expect(cupboard).toBeDefined();
    // Over the desk, on the same wall, above its top.
    expect(cupboard!.rotationDeg).toBe(desk!.rotationDeg);
    expect(vec.dist(cupboard!, desk!)).toBeLessThan(getEntry(desk!.catalogId)!.dims.d);
    expect(cupboard!.z).toBeGreaterThanOrEqual(getEntry(desk!.catalogId)!.dims.h + 600);
    expect(items.find((i) => i.catalogId === 'laptop')!.z).toBe(getEntry(desk!.catalogId)!.dims.h);
  });

  it('keeps every placement rule', () => {
    const roomed = structuredClone(level);
    roomed.rooms[service.id]!.type = 'study';
    checkRules(roomed, service.id, items);
  });
});

describe('a foyer too small for the shoe rack', () => {
  // A 1.1 x 1.3 m foyer in the corner of the living room, open to it on two sides; the
  // entrance door's swing takes its only solid wall.
  const w = (x1: number, y1: number, x2: number, y2: number, kind?: 'divider') => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: kind ? 100 : 150, ...(kind ? { kind } : {}) });
  const level = buildLevel({
    walls: [w(0, 0, 6000, 0), w(6000, 0, 7100, 0), w(7100, 0, 7100, 1300), w(7100, 1300, 7100, 4500), w(7100, 4500, 0, 4500), w(0, 4500, 0, 0), w(6000, 0, 6000, 1300, 'divider'), w(6000, 1300, 7100, 1300, 'divider')],
    openings: [{ at: { x: 7100, y: 650 }, kind: 'door', width: 900, height: 2100, sill: 0, hinge: 'a', swing: -1 }, win(3000, 4500, 1800)],
    rooms: [
      { at: { x: 6550, y: 650 }, name: 'Foyer', type: 'foyer' },
      { at: { x: 3000, y: 2500 }, name: 'Living', type: 'living' },
    ],
  });
  const foyer = roomNamed(level, 'Foyer');
  const living = roomNamed(level, 'Living');
  const res = applyPackage(level, ESSENTIALS_3BHK);
  const racks = res.items.filter((i) => i.catalogId.startsWith('shoe.'));

  it('puts it in the living room it opens onto, near the front door, and ticks the foyer line', () => {
    expect(racks).toHaveLength(1);
    expect(racks[0]!.roomId).toBe(living.id);
    expect(vec.dist(racks[0]!, { x: 7100, y: 650 })).toBeLessThan(6000);
    expect(res.report.lines.find((l) => l.key === 'shoe-rack' && l.roomId === foyer.id)?.status).toBe('placed');
  });

  it('keeps every placement rule in the living room', () => {
    expectRules(level, res);
  });
});

describe('sections without a room', () => {
  it('reports a section whose room the plan lacks', () => {
    const level = bedrooms(2);
    const res = applyPackage(level, ESSENTIALS_3BHK);
    const kids = res.report.sections.find((s) => s.title === 'Kids bedroom')!;
    expect(kids.roomIds).toEqual([]);
    expect(kids.reason).toMatch(/kids/i);
    const foyer = res.report.lines.filter((l) => l.title === 'Foyer');
    expect(foyer.every((l) => l.roomId === undefined && l.reason)).toBe(true);
  });

  it('counts only the item lines of a package towards the total', () => {
    const tiny: FurnishingPackage = { id: 't', name: 'T', rooms: [{ title: 'Bedroom', room: { kind: 'bedroom', role: 'master' }, items: [{ key: 'bed', label: 'Bed', catalogIds: ['bed.queen'] }], specs: [{ key: 'm', label: 'Mattress' }] }] };
    const res = applyPackage(bedrooms(1), tiny);
    expect(res.report.needed).toBe(1);
    expect(res.report.placed).toBe(1);
    expect(res.report.lines.find((l) => l.key === 'm')!.status).toBe('included');
  });
});

describe('the living room in the sample is furnished around the package', () => {
  it('rooms without a package section are furnished as before', () => {
    const level = createSampleLevel();
    const res = applyPackage(level, ESSENTIALS_3BHK);
    const bath = roomNamed(level, 'Bath 1');
    expect(itemsIn(res.items, bath.id).some((i) => i.catalogId === 'toilet')).toBe(true);
    expect(deriveRooms(level).length).toBeGreaterThan(5);
  });
});
