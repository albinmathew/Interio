import { buildLevel, createSampleLevel, vec, type CatalogEntry, type Item, type Level, type Pt } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, insideItem, isFree, overlaps } from './collision';
import { findPath, isWalkable, nearestWalkable, pathLength, pointAlong } from './nav';
import { buildWorld, inRoomOrDoorway, landingNear, planTour, roomAtPoint, roomPose, standPoint, startPose, type TourPlan, type WalkWorld } from './route';

const level = createSampleLevel();
const world = buildWorld(level);
const name = (id: string | null | undefined) => (id ? level.rooms[id]?.name : undefined);
const roomId = (roomName: string) => Object.values(level.rooms).find((r) => r.name === roomName)!.id;

/** Points every 50 mm along a polyline, ends included. */
function samples(points: Pt[], step = 50): Pt[] {
  const out: Pt[] = [];
  const total = pathLength(points);
  for (let s = 0; s < total; s += step) out.push(pointAlong(points, s));
  out.push(points[points.length - 1]!);
  return out;
}

function expectLegsWalkable(w: WalkWorld, plan: TourPlan): void {
  let from: Pt = plan.start;
  for (const stop of plan.stops) {
    if (!stop.leg.jump) {
      const pts = stop.leg.points;
      expect(vec.dist(pts[0]!, from)).toBeLessThan(1);
      expect(vec.dist(pts[pts.length - 1]!, stop.eye)).toBeLessThan(1);
      for (const p of samples(pts)) {
        expect(inRoomOrDoorway(w.level, w.rooms, p), `leg to ${name(stop.roomId)} leaves the home at ${p.x},${p.y}`).toBe(true);
        expect(isFree(w.collider, p, PLAYER_RADIUS - 10), `leg to ${name(stop.roomId)} clips something at ${p.x},${p.y}`).toBe(true);
      }
    }
    from = stop.eye;
  }
}

describe('start pose', () => {
  it('is just inside the entrance door, in the foyer, facing into the home', () => {
    const pose = startPose(world)!;
    expect(name(roomAtPoint(world, pose)?.roomId)).toBe('Foyer');
    // Entrance is on the east wall at (12000, 1100): inward is -x.
    expect(pose.y).toBeCloseTo(1100, 0);
    expect(12000 - pose.x).toBeGreaterThan(100 + PLAYER_RADIUS);
    expect(12000 - pose.x).toBeLessThan(1000);
    expect(Math.cos((pose.yawDeg * Math.PI) / 180)).toBeCloseTo(-1, 5);
    expect(Math.sin((pose.yawDeg * Math.PI) / 180)).toBeCloseTo(0, 5);
    expect(overlaps(world.collider, pose)).toBe(false);
  });

  it('falls back to the largest room when there is no entrance', () => {
    const sealed: Level = structuredClone(level);
    for (const o of Object.values(sealed.openings)) if (o.kind === 'door' && o.width === 1000) delete sealed.openings[o.id];
    const w = buildWorld(sealed);
    expect(w.graph.entrances).toHaveLength(0);
    const pose = startPose(w)!;
    expect(name(roomAtPoint(w, pose)?.roomId)).toBe('Living / Dining');
    expect(isFree(w.collider, pose)).toBe(true);
  });

  it('is null for an empty level', () => {
    const empty = buildLevel({ walls: [] });
    expect(startPose(buildWorld(empty))).toBeNull();
    expect(planTour(buildWorld(empty))).toBeNull();
  });
});

describe('viewpoints', () => {
  it('finds open floor in every room', () => {
    for (const r of Object.values(level.rooms)) {
      const p = standPoint(world, r.id)!;
      expect(name(roomAtPoint(world, p)?.roomId)).toBe(r.name);
      expect(isFree(world.collider, p, 400), r.name).toBe(true);
    }
  });

  it('views each room from a corner, looking across the open floor', () => {
    for (const r of Object.values(level.rooms)) {
      const pose = roomPose(world, r.id)!;
      const middle = standPoint(world, r.id)!;
      expect(name(roomAtPoint(world, pose)?.roomId), r.name).toBe(r.name);
      expect(isFree(world.collider, pose, 300), r.name).toBe(true);
      // Nothing between the camera and the middle of the room.
      expect(findPath(world.nav, pose, middle), r.name).not.toBeNull();
      const facing = vec.rotate({ x: 1, y: 0 }, pose.yawDeg);
      const toMiddle = vec.sub(middle, pose);
      if (vec.len(toMiddle) > 1) expect(vec.dot(facing, vec.norm(toMiddle)), r.name).toBeGreaterThan(0.999);
    }
    // Big rooms are seen from well back; the corridor is seen along its length.
    const living = roomPose(world, roomId('Living / Dining'))!;
    expect(vec.dist(living, standPoint(world, roomId('Living / Dining'))!)).toBeGreaterThan(2500);
    const corridor = roomPose(world, roomId('Corridor'))!;
    expect(Math.abs(Math.cos((corridor.yawDeg * Math.PI) / 180))).toBeGreaterThan(0.95);
  });

  it('lands minimap clicks on walkable floor', () => {
    expect(landingNear(world, { x: 6500, y: 2100 })).toEqual({ x: 6500, y: 2100 });
    const inWall = landingNear(world, { x: 3000, y: 1000 })!;
    expect(isWalkable(world.nav, inWall)).toBe(true);
    expect(vec.dist(inWall, { x: 3000, y: 1000 })).toBeLessThan(500);
    const outside = landingNear(world, { x: 13500, y: 6000 })!;
    expect(name(roomAtPoint(world, outside)?.roomId)).toBe('Bedroom 3');
    expect(landingNear(world, { x: 40_000, y: 40_000 })).toBeNull();
  });
});

describe('paths', () => {
  it('goes round walls through the doors', () => {
    // Bedroom 1 to the kitchen: out of the bedroom door, along the corridor, through the living room.
    const from = standPoint(world, roomId('Bedroom 1'))!;
    const to = standPoint(world, roomId('Kitchen'))!;
    const path = findPath(world.nav, from, to)!;
    expect(pathLength(path)).toBeGreaterThan(vec.dist(from, to) * 1.5);
    const visited = new Set(samples(path).map((p) => name(roomAtPoint(world, p)?.roomId)));
    expect([...visited].sort()).toEqual(['Bedroom 1', 'Corridor', 'Kitchen', 'Living / Dining']);
  });

  it('is a straight line across open floor', () => {
    const path = findPath(world.nav, { x: 4000, y: 1000 }, { x: 9000, y: 3500 })!;
    expect(pathLength(path)).toBeLessThan(vec.dist(path[0]!, path[path.length - 1]!) * 1.02);
  });

  it('snaps blocked ends to the nearest walkable cell and gives up when there is none', () => {
    const path = findPath(world.nav, { x: 6500, y: 2100 }, { x: 150, y: 2000 })!;
    expect(isWalkable(world.nav, path[path.length - 1]!)).toBe(true);
    expect(findPath(world.nav, { x: 6500, y: 2100 }, { x: 30_000, y: 2000 })).toBeNull();
    expect(nearestWalkable(world.nav, { x: 30_000, y: 2000 }, { within: 1000 })).toBeNull();
  });
});

describe('guided tour', () => {
  const plan = planTour(world)!;

  it('visits all ten rooms exactly once, starting in the foyer', () => {
    expect(plan.stops).toHaveLength(10);
    expect(new Set(plan.stops.map((s) => s.roomId)).size).toBe(10);
    expect(plan.stops.map((s) => name(s.roomId)).sort()).toEqual(Object.values(level.rooms).map((r) => r.name).sort());
    expect(name(plan.stops[0]!.roomId)).toBe('Foyer');
    for (const s of plan.stops) expect(name(roomAtPoint(world, s.eye)?.roomId)).toBe(name(s.roomId));
  });

  it('walks every leg: no jumps in a fully connected home', () => {
    expect(plan.stops.filter((s) => s.leg.jump)).toEqual([]);
    for (const s of plan.stops.slice(1)) expect(s.leg.length).toBeGreaterThan(500);
  });

  it('keeps every sampled point of every leg inside a room or a door opening, clear of the walls', () => {
    expectLegsWalkable(world, plan);
  });

  it('does not turn sharply: corners are rounded', () => {
    for (const s of plan.stops) {
      const pts = s.leg.points;
      for (let i = 1; i + 1 < pts.length; i++) {
        const a = vec.norm(vec.sub(pts[i]!, pts[i - 1]!));
        const b = vec.norm(vec.sub(pts[i + 1]!, pts[i]!));
        if (vec.len(a) === 0 || vec.len(b) === 0) continue;
        expect(vec.dot(a, b), `leg to ${name(s.roomId)} at ${i}`).toBeGreaterThan(0.5);
      }
    }
  });

  it('routes around furniture', () => {
    const entries: Record<string, CatalogEntry> = {
      sofa: {
        id: 'sofa',
        name: 'Sofa',
        category: 'seating',
        roomTypes: [],
        dims: { w: 2200, d: 900, h: 800 },
        anchor: 'floor',
        model: { kind: 'parametric', generator: 'box' },
        licence: 'test',
      },
    };
    const item = (id: string, x: number, y: number, rotationDeg: number): Item => ({ id, catalogId: 'sofa', x, y, z: 0, rotationDeg });
    const furnished: Level = {
      ...level,
      // One across the line from the foyer passage, one in front of the corridor passage, one mid-bedroom.
      items: { a: item('a', 8600, 1100, 90), b: item('b', 6500, 2900, 0), c: item('c', 1900, 7200, 0) },
    };
    const w = buildWorld(furnished, { resolveEntry: (id) => entries[id] });
    const p = planTour(w)!;
    expect(p.stops).toHaveLength(10);
    expect(p.stops.filter((s) => s.leg.jump)).toEqual([]);
    expectLegsWalkable(w, p);
    for (const s of p.stops) {
      expect(insideItem(w.collider, s.eye)).toBe(false);
      for (const q of samples(s.leg.points)) expect(insideItem(w.collider, q)).toBe(false);
    }
  });

  it('jumps to a room that has no door, and still visits it once', () => {
    const sealed: Level = structuredClone(level);
    // Brick up Bedroom 3 (door at x = 10500 on the corridor wall).
    for (const o of Object.values(sealed.openings)) {
      if (o.kind !== 'door') continue;
      const wall = sealed.walls[o.wallId]!;
      const a = sealed.vertices[wall.a]!;
      const b = sealed.vertices[wall.b]!;
      const at = vec.add(a, vec.scale(vec.norm(vec.sub(b, a)), o.offset));
      if (Math.abs(at.x - 10500) < 5 && Math.abs(at.y - 5400) < 5) delete sealed.openings[o.id];
    }
    const w = buildWorld(sealed);
    const p = planTour(w)!;
    expect(p.stops).toHaveLength(10);
    expect(new Set(p.stops.map((s) => s.roomId)).size).toBe(10);
    const jumps = p.stops.filter((s) => s.leg.jump);
    expect(jumps.map((s) => name(s.roomId))).toEqual(['Bedroom 3']);
    expect(name(p.stops[p.stops.length - 1]!.roomId)).toBe('Bedroom 3');
    expectLegsWalkable(w, p);
  });

  it('can start from wherever the walker is', () => {
    const from = { ...standPoint(world, roomId('Kitchen'))!, yawDeg: 0 };
    const p = planTour(world, from)!;
    expect(name(p.stops[0]!.roomId)).toBe('Kitchen');
    expect(p.stops).toHaveLength(10);
    expectLegsWalkable(world, p);
  });
});
