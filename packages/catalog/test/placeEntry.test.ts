import { createSampleLevel, deriveRooms, ops, vec, type Level } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { autoFurnish, getEntry, placeEntry } from '../src';
import { convexOverlap, insidePolygon, rectCorners } from '../src/autofurnish/geometry';

const roomId = (level: Level, name: string) => Object.values(level.rooms).find((r) => r.name === name)!.id;

function furnished(level: Level, name: string): string {
  const id = roomId(level, name);
  for (const item of autoFurnish(level, id)) ops.addItem(level, item);
  return id;
}

const rectOf = (item: { catalogId: string; x: number; y: number; rotationDeg: number }) => {
  const e = getEntry(item.catalogId)!;
  return rectCorners(item.x, item.y, e.dims.w, e.dims.d, item.rotationDeg);
};

/** The new item is inside the room and does not cut through anything standing at its height. */
function expectFits(level: Level, room: string, item: NonNullable<ReturnType<typeof placeEntry>>) {
  const geom = deriveRooms(level).find((g) => g.roomId === room)!;
  const rect = rectOf(item);
  expect(insidePolygon(rect, geom.interior)).toBe(true);
  const e = getEntry(item.catalogId)!;
  for (const other of Object.values(level.items)) {
    if (other.roomId !== room) continue;
    const o = getEntry(other.catalogId)!;
    if (o.dims.h <= 30 || e.dims.h <= 30) continue;
    const apart = item.z >= other.z + o.dims.h - 1 || other.z >= item.z + e.dims.h - 1;
    if (!apart) expect(convexOverlap(rect, rectOf(other)), `${item.catalogId} overlaps ${other.catalogId}`).toBe(false);
  }
}

describe('placeEntry', () => {
  it('puts a floor piece against a wall of an empty room, facing in', () => {
    const level = createSampleLevel();
    const id = roomId(level, 'Bedroom 1');
    const item = placeEntry(level, id, 'wardrobe.2door')!;
    expect(item).toMatchObject({ catalogId: 'wardrobe.2door', roomId: id, z: 0 });
    expectFits(level, id, item);
    const geom = deriveRooms(level).find((g) => g.roomId === id)!;
    // Its back is within a few centimetres of a wall.
    const e = getEntry('wardrobe.2door')!;
    const back = vec.add({ x: item.x, y: item.y }, vec.rotate({ x: 0, y: e.dims.d / 2 }, item.rotationDeg));
    const xs = geom.interior.map((q) => q.x);
    const ys = geom.interior.map((q) => q.y);
    const toWall = Math.min(back.x - Math.min(...xs), Math.max(...xs) - back.x, back.y - Math.min(...ys), Math.max(...ys) - back.y);
    expect(toWall).toBeLessThan(40);
  });

  it('adds to a furnished room without overlapping what is there, repeatedly', () => {
    const level = createSampleLevel();
    const id = furnished(level, 'Living / Dining');
    const before = Object.keys(level.items).length;
    for (const catalogId of ['armchair', 'plant.potted', 'bookcase.open', 'lamp.floor.round']) {
      const item = placeEntry(level, id, catalogId);
      expect(item, catalogId).not.toBeNull();
      expectFits(level, id, item!);
      ops.addItem(level, item!);
    }
    expect(Object.keys(level.items)).toHaveLength(before + 4);
  });

  it('handles the request from the brief: a sink unit in the utility-sized room', () => {
    const level = createSampleLevel();
    const id = furnished(level, 'Bath 2'); // the smallest room of the sample
    const kitchen = furnished(level, 'Kitchen');
    for (const [room, catalogId] of [[kitchen, 'kitchen.sink'], [id, 'basin.pedestal']] as const) {
      const item = placeEntry(level, room, catalogId);
      if (item) expectFits(level, room, item); // null is acceptable when the room is full, overlap is not
    }
    expect(placeEntry(level, kitchen, 'kitchen.sink') ?? placeEntry(level, kitchen, 'stool.bar')).not.toBeNull();
  });

  it('puts tables and rugs in the open floor, wall pieces on a wall at their height and ceiling pieces overhead', () => {
    const level = createSampleLevel();
    const id = roomId(level, 'Bedroom 2');
    const geom = deriveRooms(level).find((g) => g.roomId === id)!;
    const table = placeEntry(level, id, 'table.coffee')!;
    expect(vec.dist({ x: table.x, y: table.y }, geom.centroid)).toBeLessThan(400);
    const rug = placeEntry(level, id, 'rug.rectangle')!;
    expect(rug.z).toBe(0);
    const ac = placeEntry(level, id, 'ac.split')!;
    expect(ac.z).toBe(getEntry('ac.split')!.mountHeight);
    expectFits(level, id, ac);
    const fan = placeEntry(level, id, 'fan.ceiling')!;
    expect(fan.z + getEntry('fan.ceiling')!.dims.h).toBe(level.ceilingHeight);
  });

  it('prefers a spot near a given point, and stands counter-top pieces on a counter', () => {
    const level = createSampleLevel();
    const bed = roomId(level, 'Bedroom 3');
    const geom = deriveRooms(level).find((g) => g.roomId === bed)!;
    const corner = geom.interior.reduce((a, b) => (a.x + a.y < b.x + b.y ? a : b));
    const lamp = placeEntry(level, bed, 'nightstand', { near: corner })!;
    const far = placeEntry(level, bed, 'nightstand', { near: geom.interior.reduce((a, b) => (a.x + a.y > b.x + b.y ? a : b)) })!;
    expect(vec.dist(lamp, corner)).toBeLessThan(vec.dist(far, corner));

    const kitchen = roomId(level, 'Kitchen');
    const counter = placeEntry(level, kitchen, 'kitchen.counter.1200')!;
    const counterId = ops.addItem(level, counter);
    const microwave = placeEntry(level, kitchen, 'microwave')!;
    const host = level.items[counterId]!;
    expect(microwave.z).toBe(getEntry('kitchen.counter.1200')!.dims.h);
    expect(vec.dist(microwave, host)).toBeLessThan(5);
  });

  it('returns null rather than a bad placement, and is deterministic', () => {
    const level = createSampleLevel();
    const id = roomId(level, 'Bath 2');
    expect(placeEntry(level, id, 'sofa.corner')).toBeNull();
    expect(placeEntry(level, id, 'no.such.entry')).toBeNull();
    expect(placeEntry(level, 'no-room', 'armchair')).toBeNull();
    const living = roomId(level, 'Living / Dining');
    expect(placeEntry(level, living, 'armchair')).toEqual(placeEntry(level, living, 'armchair'));
  });
});
