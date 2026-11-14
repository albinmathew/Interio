import { createSampleLevel, deriveRooms, vec } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { COVE_WIDTH, coves, insetPolygon } from '../src/cove';

const square = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

describe('cove geometry', () => {
  it('insets a room evenly, or per edge', () => {
    const all = insetPolygon(square, [300, 300, 300, 300])!;
    expect(all.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [300, 300],
      [3700, 300],
      [3700, 2700],
      [300, 2700],
    ]);
    // An open side (a divider) keeps its edge.
    const open = insetPolygon(square, [300, 0, 300, 300])!;
    expect(open.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [300, 300],
      [4000, 300],
      [4000, 2700],
      [300, 2700],
    ]);
  });

  it('gives up on rooms too small for a soffit', () => {
    expect(insetPolygon(square, [1600, 1600, 1600, 1600])).toBeNull();
    expect(insetPolygon(square.slice().reverse(), [100, 100, 100, 100])).toBeNull();
  });

  it('runs round the living room and every bedroom of the sample home, and nowhere else', () => {
    const level = createSampleLevel();
    const rooms = deriveRooms(level);
    const list = coves(level, rooms);
    const names = list.map((c) => level.rooms[c.roomId]!.name).sort();
    expect(names).toEqual(['Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Living / Dining']);
    for (const c of list) {
      expect(c.inner).toHaveLength(c.outer.length);
      // The soffit's inner edge stays inside the room, a soffit's width from the walls.
      for (const p of c.inner) expect(vec.pointInPolygon(p, c.outer)).toBe(true);
      expect(Math.abs(vec.polygonArea(c.outer)) - Math.abs(vec.polygonArea(c.inner))).toBeGreaterThan(0);
      for (const p of c.wash) expect(vec.pointInPolygon(p, c.inner)).toBe(true);
    }
    const bedroom = list.find((c) => level.rooms[c.roomId]!.name === 'Bedroom 2')!;
    const xs = bedroom.inner.map((p) => p.x);
    const outerXs = bedroom.outer.map((p) => p.x);
    expect(Math.min(...xs) - Math.min(...outerXs)).toBeCloseTo(COVE_WIDTH, 0);
  });
});
