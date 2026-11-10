import { createSampleLevel, deriveRooms, vec, type CatalogEntry, type Item, type Level, type RoomGeom } from '@interio/core';
import { describe, expect, it } from 'vitest';
import {
  defaultElevation,
  findOverlaps,
  footprint,
  itemAxes,
  keepInside,
  normalizeDeg,
  nudgeDirection,
  penetration,
  placeEntry,
  placeOnFloor,
  placeOnWall,
  rayHitsBox,
  rotateStep,
  rotationFacing,
  wallRuns,
  wallSolids,
} from './placement';

const entry = (id: string, w: number, d: number, h: number, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id,
  name: id,
  category: 'seating',
  roomTypes: [],
  dims: { w, d, h },
  anchor: 'floor',
  model: { kind: 'parametric', generator: 'box' },
  licence: 'test',
  ...extra,
});

const SOFA = entry('sofa', 2200, 900, 800);
const CHAIR = entry('chair', 500, 500, 900);
const AC = entry('ac', 900, 220, 300, { anchor: 'wall', mountHeight: 2300 });
const LAMP = entry('lamp', 400, 400, 500, { anchor: 'ceiling' });
const ENTRIES: Record<string, CatalogEntry> = { sofa: SOFA, chair: CHAIR, ac: AC, lamp: LAMP };
const resolve = (id: string) => ENTRIES[id];

const level: Level = createSampleLevel();
const rooms: RoomGeom[] = deriveRooms(level);
const roomNamed = (name: string) => {
  const room = Object.values(level.rooms).find((r) => r.name === name)!;
  return { room, geom: rooms.find((g) => g.roomId === room.id)! };
};
const living = roomNamed('Living / Dining');
const kitchen = roomNamed('Kitchen');

/** True when every corner of the footprint is inside the room's clear floor area (1 mm slack). */
function inside(geom: RoomGeom, pose: { x: number; y: number; rotationDeg: number }, size: { w: number; d: number }): boolean {
  const c = { x: pose.x, y: pose.y };
  return footprint(pose, size).every((p) => {
    const inner = { x: p.x + (c.x - p.x) * 0.002, y: p.y + (c.y - p.y) * 0.002 };
    return vec.pointInPolygon(inner, geom.interior);
  });
}

const item = (id: string, catalogId: string, x: number, y: number, rotationDeg = 0, z = 0): Item => ({ id, catalogId, x, y, z, rotationDeg });
const withItems = (...items: Item[]): Level => ({ ...level, items: Object.fromEntries(items.map((i) => [i.id, i])) });

describe('item frame', () => {
  it('at rotation 0 the width runs along +x and the front faces -y', () => {
    const { u, front } = itemAxes(0);
    expect(u.x).toBeCloseTo(1);
    expect(u.y).toBeCloseTo(0);
    expect(front.x).toBeCloseTo(0);
    expect(front.y).toBeCloseTo(-1);
    const f = footprint({ x: 1000, y: 2000, rotationDeg: 0 }, { w: 2200, d: 900 });
    expect(f.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [-100, 1550],
      [2100, 1550],
      [2100, 2450],
      [-100, 2450],
    ]);
  });

  it('rotation is counter-clockwise', () => {
    const { u, front } = itemAxes(90);
    expect(u.y).toBeCloseTo(1);
    expect(front.x).toBeCloseTo(1);
    const f = footprint({ x: 0, y: 0, rotationDeg: 90 }, { w: 2200, d: 900 });
    expect(Math.max(...f.map((p) => p.y))).toBeCloseTo(1100);
    expect(Math.max(...f.map((p) => p.x))).toBeCloseTo(450);
  });

  it('rotationFacing turns the front towards a direction', () => {
    expect(rotationFacing({ x: 0, y: -1 })).toBeCloseTo(0);
    expect(rotationFacing({ x: 1, y: 0 })).toBeCloseTo(90);
    expect(rotationFacing({ x: 0, y: 1 })).toBeCloseTo(180);
    expect(rotationFacing({ x: -1, y: 0 })).toBeCloseTo(270);
    for (const deg of [0, 30, 135, 250]) {
      const { front } = itemAxes(deg);
      expect(rotationFacing(front)).toBeCloseTo(deg, 6);
    }
  });

  it('keyboard steps land on multiples of the step and wrap', () => {
    expect(rotateStep(0, 15, 1)).toBe(15);
    expect(rotateStep(0, 15, -1)).toBe(345);
    expect(rotateStep(350, 15, 1)).toBe(0);
    expect(rotateStep(10, 15, 1)).toBe(15);
    expect(rotateStep(10, 15, -1)).toBe(0);
    expect(rotateStep(45, 90, 1)).toBe(90);
    expect(rotateStep(90, 90, 1)).toBe(180);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(720)).toBe(0);
  });
});

describe('wall runs', () => {
  it('merges collinear wall pieces: the corridor is four runs', () => {
    const corridor = roomNamed('Corridor').geom;
    // Its long walls are split where the bedroom partitions meet them.
    expect(corridor.edgeWalls.length).toBeGreaterThan(4);
    const runs = wallRuns(corridor);
    expect(runs).toHaveLength(4);
    const long = runs.filter((r) => r.length > 11000);
    expect(long).toHaveLength(2);
    expect(long.every((r) => r.pieces.length > 1)).toBe(true);
    // Normals point into the room.
    for (const r of runs) {
      const mid = { x: (r.a.x + r.b.x) / 2 + r.normal.x * 50, y: (r.a.y + r.b.y) / 2 + r.normal.y * 50 };
      expect(vec.pointInPolygon(mid, corridor.interior)).toBe(true);
    }
  });
});

describe('floor placement', () => {
  it('leaves an item in the middle of a room where the cursor is, with the rotation asked for', () => {
    const p = placeOnFloor(rooms, SOFA.dims, { x: 6500, y: 2100 }, { rotationDeg: 30 });
    expect(p).toMatchObject({ x: 6500, y: 2100, rotationDeg: 30, ok: true, roomId: living.room.id });
    expect(p.wallId).toBeUndefined();
  });

  it('snaps the back to a nearby wall and faces into the room', () => {
    // North wall of the living room: centreline y = 4200, 120 thick, so its face is at y = 4140.
    const p = placeOnFloor(rooms, SOFA.dims, { x: 6500, y: 3800 }, { rotationDeg: 30 });
    expect(p.y).toBe(4140 - 450);
    expect(p.x).toBe(6500);
    expect(p.rotationDeg).toBeCloseTo(0);
    expect(level.walls[p.wallId!]).toBeDefined();
    // The back edge lies on the wall face.
    const back = footprint(p, SOFA.dims).slice(2);
    for (const c of back) expect(c.y).toBeCloseTo(4140, 3);
  });

  it('turns the item to suit the wall it snaps to, and slides it clear of the corner', () => {
    // West wall of the living room: face at x = 3060. The sofa is 2200 wide, so near the
    // south-west corner (south face at y = 100) it slides north until it fits.
    const p = placeOnFloor(rooms, SOFA.dims, { x: 3400, y: 800 }, { rotationDeg: 0 });
    expect(p.rotationDeg).toBeCloseTo(90);
    expect(p.x).toBe(3060 + 450);
    expect(p.y).toBe(100 + 1100);
    expect(inside(living.geom, p, SOFA.dims)).toBe(true);
    expect(p.roomId).toBe(living.room.id);
  });

  it('does not snap beyond the snap distance, or when snapping is off', () => {
    const far = placeOnFloor(rooms, SOFA.dims, { x: 6500, y: 3400 }, { rotationDeg: 45 });
    expect(far.wallId).toBeUndefined();
    expect(far.rotationDeg).toBe(45);
    const off = placeOnFloor(rooms, CHAIR.dims, { x: 6500, y: 3850 }, { rotationDeg: 45, snap: 0 });
    expect(off.wallId).toBeUndefined();
    expect(off.rotationDeg).toBe(45);
  });

  it('keeps a free-standing item inside the room', () => {
    // Cursor in the south-east corner of the living room with snapping off and the item at an angle.
    const p = placeOnFloor(rooms, SOFA.dims, { x: 9900, y: 150 }, { rotationDeg: 45, snap: 0 });
    expect(inside(living.geom, p, SOFA.dims)).toBe(true);
    expect(p.rotationDeg).toBe(45);
    const c = keepInside(wallRuns(living.geom), { x: 3000, y: 2000, rotationDeg: 0 }, CHAIR.dims);
    expect(c.x).toBeCloseTo(3060 + 250);
    expect(c.y).toBeCloseTo(2000);
  });

  it('pulls a cursor outside the plan back into the nearest room', () => {
    const p = placeOnFloor(rooms, CHAIR.dims, { x: -5000, y: 2000 }, { rotationDeg: 0 });
    expect(p.ok).toBe(true);
    expect(p.roomId).toBe(kitchen.room.id);
    expect(inside(kitchen.geom, p, CHAIR.dims)).toBe(true);
    // Against the west wall, facing east.
    expect(p.rotationDeg).toBeCloseTo(90);
    expect(p.x).toBe(100 + 250);
  });

  it('reports failure when there is no room at all', () => {
    expect(placeOnFloor([], CHAIR.dims, { x: 0, y: 0 }, { rotationDeg: 0 }).ok).toBe(false);
  });
});

describe('wall and ceiling entries', () => {
  it('wall entries sit flat on the nearest wall of the room at mount height', () => {
    // Bedroom 1: north face at y = 9000 - 100.
    const p = placeEntry(level, rooms, AC, { x: 1900, y: 8000 }, { rotationDeg: 77 });
    expect(p.y).toBe(8900 - 110);
    expect(p.x).toBe(1900);
    expect(p.z).toBe(2300);
    expect(p.rotationDeg).toBeCloseTo(0);
    expect(p.roomId).toBe(roomNamed('Bedroom 1').room.id);
    expect(level.walls[p.wallId!]).toBeDefined();
  });

  it('a pointer hit on a wall face pins the room, so the item lands on that side of the wall', () => {
    // A point on the corridor's north face (y = 5340) with the corridor pinned.
    const corridor = roomNamed('Corridor');
    const p = placeOnWall(rooms, AC.dims, { x: 6000, y: 5340 }, { roomId: corridor.room.id });
    expect(p.y).toBe(5340 - 110);
    expect(p.rotationDeg).toBeCloseTo(0);
    expect(p.roomId).toBe(corridor.room.id);
  });

  it('ceiling entries hang from the ceiling and do not snap to walls', () => {
    const p = placeEntry(level, rooms, LAMP, { x: 6500, y: 4000 }, { rotationDeg: 0 });
    expect(p.z).toBe(level.ceilingHeight - 500);
    expect(p.wallId).toBeUndefined();
    expect(inside(living.geom, p, LAMP.dims)).toBe(true);
  });

  it('default elevations follow the anchor, and a given elevation wins', () => {
    expect(defaultElevation(SOFA, 3000)).toBe(0);
    expect(defaultElevation(entry('hob', 600, 520, 60, { mountHeight: 850 }), 3000)).toBe(850);
    expect(defaultElevation(AC, 2400)).toBe(2100);
    expect(defaultElevation(LAMP, 3000)).toBe(2500);
    expect(placeEntry(level, rooms, SOFA, { x: 6500, y: 2100 }, { rotationDeg: 0, z: 120 }).z).toBe(120);
  });
});

describe('overlap warnings', () => {
  it('penetration is 0 for separate or touching shapes and the overlap depth otherwise', () => {
    const sq = (x: number, y: number, s: number) => [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ];
    expect(penetration(sq(0, 0, 100), sq(200, 0, 100))).toBe(0);
    expect(penetration(sq(0, 0, 100), sq(100, 0, 100))).toBe(0);
    expect(penetration(sq(0, 0, 100), sq(70, 10, 100))).toBeCloseTo(30);
  });

  it('flags items that intersect each other', () => {
    const lv = withItems(item('a', 'sofa', 6500, 2100), item('b', 'chair', 7000, 2200), item('c', 'chair', 9000, 600));
    const o = findOverlaps(lv, resolve);
    expect(o.get('a')?.items).toEqual(['b']);
    expect(o.get('b')?.items).toEqual(['a']);
    expect(o.has('c')).toBe(false);
  });

  it('does not flag items that only touch, or that are at different heights', () => {
    const side = withItems(item('a', 'chair', 6000, 2000), item('b', 'chair', 6500, 2000));
    expect(findOverlaps(side, resolve).size).toBe(0);
    const stacked = withItems(item('a', 'sofa', 6500, 2100), item('b', 'lamp', 6500, 2100, 0, 2500));
    expect(findOverlaps(stacked, resolve).size).toBe(0);
  });

  it('flags an item pushed into a wall but not one snapped flush against it', () => {
    // East of the passage to the corridor, where the wall is solid.
    const snapped = placeOnFloor(rooms, SOFA.dims, { x: 8700, y: 3800 }, { rotationDeg: 0 });
    expect(findOverlaps(withItems(item('a', 'sofa', snapped.x, snapped.y, snapped.rotationDeg)), resolve).size).toBe(0);
    const o = findOverlaps(withItems(item('a', 'sofa', 8700, 3900)), resolve);
    expect(o.get('a')?.walls.length).toBeGreaterThan(0);
    expect(o.get('a')?.walls.every((id) => level.walls[id])).toBe(true);
  });

  it('an item standing in a passage does not count as hitting the wall', () => {
    // Passage in the wall between kitchen and living: x = 3000, y from 1800 to 3000.
    const o = findOverlaps(withItems(item('a', 'chair', 3000, 2400)), resolve);
    expect(o.size).toBe(0);
    const wallId = Object.values(level.openings).find((op) => op.kind === 'passage' && level.vertices[level.walls[op.wallId]!.a]!.x === 3000)!.wallId;
    expect(wallSolids(level, wallId)).toHaveLength(2);
  });
});

describe('picking', () => {
  const size = { w: 2200, d: 900, h: 800 };
  const pose = { x: 6500, y: 2100, z: 0, rotationDeg: 0 };

  it('a ray straight down hits the top of the box', () => {
    expect(rayHitsBox([6.5, 10, -2.1], [0, -1, 0], pose, size)).toBeCloseTo(9.2);
    expect(rayHitsBox([6.5, 10, -2.1], [0, -1, 0], { ...pose, z: 1000 }, size)).toBeCloseTo(8.2);
  });

  it('misses outside the footprint and respects rotation', () => {
    // 1 m east of the centre: inside the 2.2 m width at rotation 0, outside at 90 degrees.
    expect(rayHitsBox([7.5, 10, -2.1], [0, -1, 0], pose, size)).not.toBeNull();
    expect(rayHitsBox([7.5, 10, -2.1], [0, -1, 0], { ...pose, rotationDeg: 90 }, size)).toBeNull();
    // 1 m north (plan +y is world -z): the other way round.
    expect(rayHitsBox([6.5, 10, -3.1], [0, -1, 0], pose, size)).toBeNull();
    expect(rayHitsBox([6.5, 10, -3.1], [0, -1, 0], { ...pose, rotationDeg: 90 }, size)).not.toBeNull();
  });

  it('a level ray hits the near face', () => {
    // From the south (world +z) looking north at mid height: the front face is 0.45 m south of the centre.
    expect(rayHitsBox([6.5, 0.4, 3], [0, 0, -1], pose, size)).toBeCloseTo(3 - (-2.1 + 0.45));
    expect(rayHitsBox([6.5, 0.9, 3], [0, 0, -1], pose, size)).toBeNull();
  });
});

describe('nudging', () => {
  it('arrow keys follow the camera heading in quarter turns', () => {
    expect(nudgeDirection('ArrowUp', 0)).toEqual({ x: 0, y: 1 });
    expect(nudgeDirection('ArrowRight', 0)).toEqual({ x: 1, y: 0 });
    // Looking east: up moves east, right moves south.
    expect(nudgeDirection('ArrowUp', 90)).toEqual({ x: 1, y: 0 });
    expect(nudgeDirection('ArrowRight', 90)).toEqual({ x: 0, y: -1 });
    // Looking south.
    expect(nudgeDirection('ArrowUp', 180)).toEqual({ x: 0, y: -1 });
    expect(nudgeDirection('ArrowLeft', -170)).toEqual({ x: 1, y: 0 });
    // Headings between the axes go to the nearest one.
    expect(nudgeDirection('ArrowUp', 40)).toEqual({ x: 0, y: 1 });
    expect(nudgeDirection('ArrowUp', 50)).toEqual({ x: 1, y: 0 });
  });
});
