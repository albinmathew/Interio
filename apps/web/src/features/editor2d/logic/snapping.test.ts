import { buildLevel } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { lockDirection, resolveSnap } from './snapping';

/** A 4 x 3 m room with its corner at the origin. */
const room = () =>
  buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } },
      { a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 } },
      { a: { x: 4000, y: 3000 }, b: { x: 0, y: 3000 } },
      { a: { x: 0, y: 3000 }, b: { x: 0, y: 0 } },
    ],
  });

const TOL = 100;

describe('resolveSnap', () => {
  it('snaps to a vertex before anything else', () => {
    const level = room();
    const underlay = new Float32Array([4030, 20]);
    const res = resolveSnap(level, { x: 4040, y: 30 }, { tolMm: TOL, underlayPoints: underlay });
    expect(res.kind).toBe('vertex');
    expect(res.point).toEqual({ x: 4000, y: 0 });
    expect(res.hit?.kind).toBe('vertex');
  });

  it('snaps to an underlay point before a wall', () => {
    const level = room();
    const underlay = new Float32Array([2000.5, 80.25, 9000, 9000]);
    const res = resolveSnap(level, { x: 2030, y: 40 }, { tolMm: TOL, underlayPoints: underlay });
    expect(res.kind).toBe('underlay');
    expect(res.point.x).toBeCloseTo(2000.5, 3);
    expect(res.point.y).toBeCloseTo(80.25, 3);
    expect(res.hit).toBeNull();
  });

  it('snaps to the nearest point on a wall and reports the wall', () => {
    const level = room();
    const res = resolveSnap(level, { x: 2030, y: 40 }, { tolMm: TOL });
    expect(res.kind).toBe('wall');
    expect(res.point.x).toBeCloseTo(2030, 6);
    expect(res.point.y).toBeCloseTo(0, 6);
    expect(res.hit).toMatchObject({ kind: 'wall' });
  });

  it('aligns a free point with the x and y of existing vertices and draws guides', () => {
    const level = room();
    // Outside the room, level with the top wall and in line with the right wall.
    const res = resolveSnap(level, { x: 4030, y: 5020 }, { tolMm: TOL, gridStep: 10 });
    expect(res.kind).toBe('align');
    expect(res.point).toEqual({ x: 4000, y: 5020 });
    expect(res.guides).toHaveLength(1);
    expect(res.guides[0]!.from.x).toBe(4000);

    const both = resolveSnap(level, { x: 6000, y: 3040 }, { tolMm: TOL, gridStep: 10, extraPoints: [{ x: 6030, y: 7000 }] });
    expect(both.point).toEqual({ x: 6030, y: 3000 });
    expect(both.guides).toHaveLength(2);
  });

  it('prefers the spot on a wall that lines up with another vertex', () => {
    const level = room();
    const res = resolveSnap(level, { x: 2040, y: 30 }, { tolMm: TOL, extraPoints: [{ x: 2000, y: 1500 }] });
    expect(res.kind).toBe('wall');
    expect(res.point).toEqual({ x: 2000, y: 0 });
    expect(res.guides).toHaveLength(1);
  });

  it('rounds a free point to the grid step', () => {
    const res = resolveSnap(room(), { x: 7013, y: 6988 }, { tolMm: TOL, gridStep: 50 });
    expect(res.kind).toBeNull();
    expect(res.point).toEqual({ x: 7000, y: 7000 });
    expect(res.guides).toEqual([]);
  });

  it('does nothing when snapping is disabled (Alt)', () => {
    const p = { x: 4040.3, y: 30.7 };
    const res = resolveSnap(room(), p, { tolMm: TOL, disabled: true, gridStep: 50, underlayPoints: new Float32Array([4040, 30]) });
    expect(res.point).toEqual(p);
    expect(res.kind).toBeNull();
  });

  it('ignores excluded vertices and walls (the ones being dragged)', () => {
    const level = room();
    const corner = Object.entries(level.vertices).find(([, v]) => v.x === 4000 && v.y === 0)![0];
    const walls = new Set(Object.values(level.walls).filter((w) => w.a === corner || w.b === corner).map((w) => w.id));
    const res = resolveSnap(level, { x: 4020, y: 10 }, { tolMm: TOL, excludeVertices: new Set([corner]), excludeWalls: walls, gridStep: 10 });
    expect(res.kind).not.toBe('vertex');
    expect(res.hit).toBeNull();
  });

  describe('angle lock (Shift)', () => {
    const from = { x: 1000, y: 1000 };

    it('locks to exact multiples of 45 degrees', () => {
      expect(lockDirection(from, { x: 3000, y: 1200 })).toEqual({ x: 1, y: 0 });
      expect(lockDirection(from, { x: 900, y: 4000 })).toEqual({ x: 0, y: 1 });
      expect(lockDirection(from, { x: -3000, y: 1100 })).toEqual({ x: -1, y: 0 });
      const d = lockDirection(from, { x: 2000, y: 2100 });
      expect(d.x).toBeCloseTo(Math.SQRT1_2, 9);
      expect(d.y).toBeCloseTo(Math.SQRT1_2, 9);
    });

    it('keeps the point on the locked ray and rounds its length', () => {
      const res = resolveSnap(room(), { x: 2513, y: 1090 }, { tolMm: TOL, from, lockAngle: true, gridStep: 50 });
      expect(res.point).toEqual({ x: 2500, y: 1000 });
    });

    it('stops the locked ray where it lines up with a vertex', () => {
      const level = room();
      // Drawing up from (6000, 1000): stop level with the top wall at y = 3000.
      const res = resolveSnap(level, { x: 6050, y: 2960 }, { tolMm: TOL, from: { x: 6000, y: 1000 }, lockAngle: true, gridStep: 50 });
      expect(res.kind).toBe('align');
      expect(res.point).toEqual({ x: 6000, y: 3000 });
    });

    it('stops the locked ray on a wall it meets', () => {
      const level = room();
      const res = resolveSnap(level, { x: 3960, y: 1040 }, { tolMm: TOL, from, lockAngle: true, gridStep: 50 });
      expect(res.kind).toBe('wall');
      expect(res.point).toEqual({ x: 4000, y: 1000 });
      expect(res.hit).toMatchObject({ kind: 'wall' });
    });

    it('still locks the angle when snapping is disabled', () => {
      const res = resolveSnap(room(), { x: 2513, y: 1090 }, { tolMm: TOL, from, lockAngle: true, disabled: true });
      expect(res.point).toEqual({ x: 2513, y: 1000 });
    });
  });
});
