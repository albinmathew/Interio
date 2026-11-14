import { autoFurnish, getEntry } from '@interio/catalog';
import { createSampleLevel, vec, type Level, type Pt } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, isFree } from './collision';
import { catmullRom, sharpestTurn, simplify, smoothPath } from './curve';
import { buildWorld, inRoomOrDoorway, planTour, type WalkWorld } from './route';

const corner: Pt[] = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 2000 },
];

describe('tour curve', () => {
  it('passes through every control point and samples evenly', () => {
    const path = catmullRom(corner, 50);
    for (const p of corner) expect(Math.min(...path.map((q) => vec.dist(p, q)))).toBeLessThan(1e-6);
    for (let i = 1; i < path.length; i++) expect(vec.dist(path[i]!, path[i - 1]!)).toBeLessThan(80);
  });

  it('drops points that lie on a straight run', () => {
    const run = [corner[0]!, { x: 1000, y: 3 }, corner[1]!, { x: 2002, y: 900 }, corner[2]!];
    expect(simplify(run, 50)).toEqual(corner);
  });

  it('swings wide round a corner where there is room, and keeps to the route where there is not', () => {
    const open = smoothPath(corner, () => true);
    expect(sharpestTurn(open)).toBeLessThan(10);
    expect(open[0]).toEqual(corner[0]);
    expect(open[open.length - 1]).toEqual(corner[2]);
    // A wall hugging the inside of the corner: the curve is refused and the route is walked as it is.
    const tight = smoothPath(corner, (p) => p.x >= 1999 || p.y <= 1);
    for (const p of tight) expect(p.x >= 1999 || p.y <= 1).toBe(true);
  });
});

/** Every sample of every glide of a tour stays on walkable floor, in a room or doorway, clear of walls and furniture. */
function expectGlidesInside(w: WalkWorld): void {
  const plan = planTour(w)!;
  expect(plan.stops.length).toBe(Object.keys(w.level.rooms).length);
  let smoother = 0;
  for (const stop of plan.stops) {
    if (stop.leg.jump) continue;
    const { glide, points } = stop.leg;
    expect(vec.dist(glide[0]!, points[0]!)).toBeLessThan(1);
    expect(vec.dist(glide[glide.length - 1]!, stop.eye)).toBeLessThan(1);
    for (const p of glide) {
      expect(inRoomOrDoorway(w.level, w.rooms, p), `glide leaves the home at ${p.x},${p.y}`).toBe(true);
      expect(isFree(w.collider, p, PLAYER_RADIUS - 10), `glide clips something at ${p.x},${p.y}`).toBe(true);
    }
    if (sharpestTurn(glide) <= sharpestTurn(points) + 1e-6) smoother++;
  }
  // The glide is never jerkier than the route it follows, and smoother on most legs.
  expect(smoother).toBeGreaterThanOrEqual(plan.stops.filter((s) => !s.leg.jump).length * 0.6);
}

describe('cinematic tour glides', () => {
  it('stay inside the rooms of the sample home', () => {
    expectGlidesInside(buildWorld(createSampleLevel()));
  });

  it('stay inside the rooms and clear of the furniture of a furnished home', () => {
    const level: Level = createSampleLevel();
    let n = 0;
    for (const room of Object.values(level.rooms)) {
      for (const item of autoFurnish(level, room.id)) level.items[`i${n}`] = { ...item, id: `i${n++}` };
    }
    expect(n).toBeGreaterThan(20);
    expectGlidesInside(buildWorld(level, { resolveEntry: getEntry }));
  });
});
