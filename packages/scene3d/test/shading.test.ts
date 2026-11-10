import { createSampleLevel, deriveRooms } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { contactShading, shadeBuffers, type ShadeQuad } from '../src/shading';

const level = createSampleLevel();
const rooms = deriveRooms(level);
const open = contactShading(level, rooms);
const closed = contactShading(level, rooms, { ceilings: true });

const all = (s: { walls: Map<string, ShadeQuad[]>; flat: ShadeQuad[] }) => [...[...s.walls.values()].flat(), ...s.flat];
const ys = (q: ShadeQuad) => q.corners.map((c) => c[1]);
const contains = (q: ShadeQuad, x: number, z: number, slack = 0.02) => {
  const xs = q.corners.map((c) => c[0]);
  const zs = q.corners.map((c) => c[2]);
  return x > Math.min(...xs) - slack && x < Math.max(...xs) + slack && z > Math.min(...zs) - slack && z < Math.max(...zs) + slack;
};

describe('baked contact shading', () => {
  it('shades full-height walls only, with gentle gradients that fade to nothing', () => {
    expect(open.walls.size).toBeGreaterThan(10);
    for (const id of open.walls.keys()) expect(level.walls[id]?.kind).toBe('wall');
    for (const q of all(closed)) {
      expect(Math.max(...q.alpha)).toBeGreaterThan(0.1);
      expect(Math.max(...q.alpha)).toBeLessThan(0.3);
      expect(Math.min(...q.alpha)).toBe(0);
    }
  });

  it('without ceilings nothing is shaded above the foot of the walls except inside corners', () => {
    const height = level.ceilingHeight / 1000;
    for (const q of open.flat) expect(Math.max(...ys(q))).toBeLessThan(0.01);
    for (const q of [...open.walls.values()].flat()) {
      const top = Math.max(...ys(q));
      // Foot gradients stop low; corner gradients run the full height and fade sideways.
      if (top > 1) expect(top).toBeCloseTo(height, 6);
      else expect(top).toBeLessThan(0.6);
    }
    // With ceilings: wall heads and ceiling edges are added.
    expect(all(closed).length).toBeGreaterThan(all(open).length);
    expect(closed.flat.some((q) => Math.min(...ys(q)) > height - 0.01)).toBe(true);
  });

  it('leaves doorways and passages clear on the walls and on the floor', () => {
    for (const o of Object.values(level.openings)) {
      if (o.sill > 0) continue;
      const wall = level.walls[o.wallId]!;
      const a = level.vertices[wall.a]!;
      const b = level.vertices[wall.b]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const x = (a.x + ((b.x - a.x) / l) * o.offset) / 1000;
      const z = -(a.y + ((b.y - a.y) / l) * o.offset) / 1000;
      // Nothing low passes through the middle of the opening, on either face of the wall.
      const low = [...(closed.walls.get(wall.id) ?? []), ...closed.flat].filter((q) => Math.min(...ys(q)) < 0.1 && Math.max(...ys(q)) < 1);
      const reach = wall.thickness / 2000 + 0.01;
      expect(low.filter((q) => contains(q, x, z, -0.05) || contains(q, x + reach, z, -0.05) || contains(q, x, z + reach, -0.05))).toEqual([]);
    }
  });

  it('packs quads into buffers with an opacity per vertex', () => {
    const quads = closed.flat.slice(0, 3);
    const { positions, colors, indices } = shadeBuffers(quads, [0.1, 0.2, 0.3]);
    expect(positions).toHaveLength(36);
    expect(colors).toHaveLength(48);
    expect(Array.from(indices.subarray(0, 6))).toEqual([0, 1, 2, 0, 2, 3]);
    expect(colors[3]).toBeCloseTo(quads[0]!.alpha[0], 6);
    expect(colors[0]).toBeCloseTo(0.1, 6);
    expect(Array.from(positions.subarray(0, 3))).toEqual(quads[0]!.corners[0].map((v) => Math.fround(v)));
  });
});
