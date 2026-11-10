import { buildLevel, buildLevelMesh, deriveRooms } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { skirtingBoxes, stubBoxes } from '../src/parts';
import { contactShading } from '../src/shading';
import { fadeWalls } from '../src/wallFade';

/**
 * An open-plan space split into two zones by a divider at x = 4000. Dividers bound
 * rooms but have no body, so nothing may be drawn for them.
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
const mesh = buildLevelMesh(level);
const rooms = deriveRooms(level);
const dividers = Object.values(level.walls).filter((w) => w.kind === 'divider');
const real = Object.values(level.walls).filter((w) => w.kind === 'wall');

/** True for a box lying along the divider line x = 4 m (running north-south, away from the outer walls). */
const onDivider = (b: { position: number[]; rotationY?: number }) => Math.abs(b.position[0]! - 4) < 0.15 && Math.abs(Math.abs(b.rotationY ?? 0) - Math.PI / 2) < 0.01;

describe('dividers have no body', () => {
  it('the plan has a divider between two rooms', () => {
    expect(dividers).toHaveLength(1);
    expect(rooms).toHaveLength(2);
  });

  it('no skirting and no cutaway stub runs along a divider', () => {
    expect(skirtingBoxes(level, mesh).filter(onDivider)).toEqual([]);
    const stubs = stubBoxes(level);
    expect(stubs).toHaveLength(real.length);
    expect(stubs.filter(onDivider)).toEqual([]);
  });

  it('dividers take no part in the cutaway or the contact shading', () => {
    const ids = new Set(dividers.map((w) => w.id));
    expect(fadeWalls(level, mesh).some((w) => ids.has(w.id))).toBe(false);
    const shading = contactShading(level, rooms, { ceilings: true });
    expect([...shading.walls.keys()].some((id) => ids.has(id))).toBe(false);
    // No floor or ceiling gradient hugs the divider line either.
    for (const q of shading.flat) {
      const xs = q.corners.map((c) => c[0]);
      const along = Math.max(...xs) - Math.min(...xs) < 0.6 && Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 4) < 0.5;
      expect(along).toBe(false);
    }
  });
});
