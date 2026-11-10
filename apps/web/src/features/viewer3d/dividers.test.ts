import { buildLevel, deriveRooms, type CatalogEntry } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { findOverlaps, placeEntry, placeOnFloor, placeOnWall, wallRuns } from './placement';

/**
 * An 8 x 4 m open-plan space split into two zones by a divider at x = 4000. A divider
 * bounds rooms but has no body: furniture must not snap to it, be held back by it or
 * be reported as hitting it.
 */
const level = buildLevel({
  walls: [
    { a: { x: 0, y: 0 }, b: { x: 8000, y: 0 }, thickness: 200 },
    { a: { x: 8000, y: 0 }, b: { x: 8000, y: 4000 }, thickness: 200 },
    { a: { x: 8000, y: 4000 }, b: { x: 0, y: 4000 }, thickness: 200 },
    { a: { x: 0, y: 4000 }, b: { x: 0, y: 0 }, thickness: 200 },
    { a: { x: 4000, y: 0 }, b: { x: 4000, y: 4000 }, kind: 'divider' },
  ],
  rooms: [
    { at: { x: 2000, y: 2000 }, name: 'Living', type: 'living' },
    { at: { x: 6000, y: 2000 }, name: 'Dining', type: 'dining' },
  ],
});
const rooms = deriveRooms(level);
const living = rooms.find((r) => level.rooms[r.roomId ?? '']?.name === 'Living')!;
const divider = Object.values(level.walls).find((w) => w.kind === 'divider')!;

const SOFA = { w: 2000, d: 900 };
const entry = (anchor: CatalogEntry['anchor'], w: number, d: number, h: number): CatalogEntry => ({
  id: `${anchor}.test`,
  name: 'test',
  category: 'seating',
  roomTypes: [],
  dims: { w, d, h },
  anchor,
  model: { kind: 'parametric', generator: 'box' },
  licence: 'test',
});

describe('open-plan dividers', () => {
  it('the plan really has two rooms separated by a divider', () => {
    expect(rooms).toHaveLength(2);
    expect(divider).toBeDefined();
    expect(living.edgeWalls).toContain(divider.id);
  });

  it('are not part of the wall runs', () => {
    expect(wallRuns(living)).toHaveLength(4);
    const runs = wallRuns(living, level.walls);
    expect(runs).toHaveLength(3);
    expect(runs.flatMap((r) => r.pieces.map((p) => p[2]))).not.toContain(divider.id);
  });

  it('do not attract furniture', () => {
    // 150 mm from the divider: a real wall would grab the sofa.
    const cursor = { x: 4000 - 450 - 150, y: 2000 };
    expect(placeOnFloor(rooms, SOFA, cursor, { rotationDeg: 0 }).wallId).toBe(divider.id);
    const p = placeOnFloor(rooms, SOFA, cursor, { rotationDeg: 0, walls: level.walls });
    expect(p).toMatchObject({ x: cursor.x, y: cursor.y, rotationDeg: 0, ok: true });
    expect(p.wallId).toBeUndefined();
  });

  it('do not hold furniture back: a piece may straddle the line', () => {
    const p = placeEntry(level, rooms, entry('floor', 2000, 900, 800), { x: 3900, y: 2000 }, { rotationDeg: 0, snap: false });
    expect(p).toMatchObject({ x: 3900, y: 2000 });
    const item = { id: 'a', catalogId: 'floor.test', x: p.x, y: p.y, z: 0, rotationDeg: 0 };
    expect(findOverlaps({ ...level, items: { a: item } }, () => entry('floor', 2000, 900, 800)).size).toBe(0);
  });

  it('are never chosen as the wall for wall-mounted pieces', () => {
    // Right beside the divider, in the middle of its length: the nearest real wall is north or south.
    const p = placeOnWall(rooms, { w: 900, d: 220 }, { x: 3900, y: 2100 }, { walls: level.walls });
    expect(p.ok).toBe(true);
    expect(p.wallId).not.toBe(divider.id);
    expect(level.walls[p.wallId!]?.kind).toBe('wall');
    expect(p.y).toBe(4000 - 100 - 110);
  });
});
