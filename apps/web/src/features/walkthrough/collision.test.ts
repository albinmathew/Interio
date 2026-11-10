import { createSampleLevel, deriveRooms, openingFrame, vec, type CatalogEntry, type Item, type Level, type Pt } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, buildCollider, isFree, moveCapsule, overlaps, resolvePosition, sweep } from './collision';

const R = PLAYER_RADIUS;
const level = createSampleLevel();
const rooms = deriveRooms(level);
const collider = buildCollider(level);

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
const ENTRIES: Record<string, CatalogEntry> = {
  sofa: entry('sofa', 2200, 900, 800),
  rug: entry('rug', 2400, 1700, 20),
  ac: entry('ac', 900, 220, 300, { anchor: 'wall', mountHeight: 2300 }),
};
const furnished = (...items: Omit<Item, 'id'>[]): Level => ({
  ...level,
  items: Object.fromEntries(items.map((item, i) => [`item${i}`, { ...item, id: `item${i}` }])),
});
const withItems = (...items: Omit<Item, 'id'>[]) => buildCollider(furnished(...items), { resolveEntry: (id) => ENTRIES[id] });

const roomNamed = (name: string) => rooms.find((r) => r.roomId && level.rooms[r.roomId]!.name === name)!;
const inAnyRoom = (p: Pt) => rooms.some((r) => vec.pointInPolygon(p, r.polygon));

describe('walls', () => {
  it('stops the capsule a radius away from the wall face', () => {
    // Living room, south wall (exterior, 200 thick: inner face at y = 100), east of the balcony door.
    const { pos, blocked } = moveCapsule(collider, { x: 8800, y: 2000 }, { x: 0, y: -3000 });
    expect(blocked).toBe(true);
    expect(pos.x).toBeCloseTo(8800, 0);
    expect(pos.y).toBeGreaterThan(100 + R - 3);
    expect(pos.y).toBeLessThan(100 + R + 3);
  });

  it('slides along the wall when pushed into it at an angle', () => {
    const start = moveCapsule(collider, { x: 9200, y: 2000 }, { x: 0, y: -3000 }).pos;
    const { pos, blocked } = moveCapsule(collider, start, { x: -600, y: -600 });
    expect(blocked).toBe(true);
    expect(pos.x).toBeCloseTo(start.x - 600, 0);
    expect(pos.y).toBeCloseTo(start.y, 0);
  });

  it('wedges into a corner without passing through it', () => {
    // Kitchen south-west corner: faces at x = 100 and y = 100.
    const { pos } = moveCapsule(collider, { x: 1500, y: 1500 }, { x: -4000, y: -4000 });
    expect(pos.x).toBeCloseTo(100 + R, 0);
    expect(pos.y).toBeCloseTo(100 + R, 0);
  });

  it('does not tunnel when a single move is far longer than the wall is thick', () => {
    const { pos } = moveCapsule(collider, { x: 6500, y: 2000 }, { x: 0, y: 60_000 });
    // Straight north through the corridor passage, then the corridor's far wall (face at y = 5340).
    expect(pos.y).toBeCloseTo(5340 - R, 0);
    const west = moveCapsule(collider, { x: 1500, y: 2000 }, { x: -60_000, y: 0 }).pos;
    expect(west.x).toBeCloseTo(100 + R, 0);
  });

  it('never leaves the home, whichever way it is pushed', () => {
    for (const r of rooms) {
      for (let deg = 0; deg < 360; deg += 15) {
        const dir = vec.rotate({ x: 1, y: 0 }, deg);
        const { pos } = moveCapsule(collider, r.centroid, vec.scale(dir, 20_000));
        const inDoorway = Object.values(level.openings).some((o) => {
          const f = openingFrame(level, o.id)!;
          const d = vec.sub(pos, f.center);
          return o.kind === 'door' && Math.abs(vec.dot(d, f.dir)) < o.width / 2 && Math.abs(vec.dot(d, f.normal)) < f.thickness / 2 + 60;
        });
        expect(inAnyRoom(pos) || inDoorway, `from ${level.rooms[r.roomId!]!.name} heading ${deg}`).toBe(true);
      }
    }
  });
});

describe('openings', () => {
  const sides = (id: string) => {
    const f = openingFrame(level, id)!;
    const probe = f.thickness / 2 + 150;
    return {
      f,
      left: inAnyRoom(vec.add(f.center, vec.scale(f.normal, probe))),
      right: inAnyRoom(vec.add(f.center, vec.scale(f.normal, -probe))),
    };
  };

  it('walks through the centre of every door, sliding door and passage', () => {
    const through = Object.values(level.openings).filter((o) => o.kind !== 'window');
    expect(through).toHaveLength(10);
    let interior = 0;
    for (const o of through) {
      const { f, left, right } = sides(o.id);
      const reach = f.thickness / 2 + 600;
      if (left && right) {
        interior++;
        for (const sign of [1, -1]) {
          const from = vec.add(f.center, vec.scale(f.normal, sign * reach));
          const { pos, blocked } = moveCapsule(collider, from, vec.scale(f.normal, -sign * 2 * reach));
          expect(blocked, `${o.kind} ${o.id}`).toBe(false);
          expect(vec.dist(pos, vec.add(f.center, vec.scale(f.normal, -sign * reach)))).toBeLessThan(1);
        }
      } else {
        // The entrance: stand in the doorway, but there is nothing to walk out to.
        const inward = left ? 1 : -1;
        const from = vec.add(f.center, vec.scale(f.normal, inward * reach));
        const atDoor = moveCapsule(collider, from, vec.scale(f.normal, -inward * reach));
        expect(atDoor.blocked).toBe(false);
        expect(vec.dist(atDoor.pos, f.center)).toBeLessThan(1);
        const beyond = moveCapsule(collider, atDoor.pos, vec.scale(f.normal, -inward * 5000)).pos;
        expect(vec.dot(vec.sub(beyond, f.center), vec.scale(f.normal, -inward))).toBeLessThan(f.thickness / 2 + 60);
      }
    }
    expect(interior).toBe(9);
  });

  it('cannot leave through a window', () => {
    const windows = Object.values(level.openings).filter((o) => o.kind === 'window');
    expect(windows).toHaveLength(7);
    for (const o of windows) {
      const { f, left } = sides(o.id);
      const inward = left ? 1 : -1;
      const from = vec.add(f.center, vec.scale(f.normal, inward * (f.thickness / 2 + 800)));
      const { pos, blocked } = moveCapsule(collider, from, vec.scale(f.normal, -inward * 4000));
      expect(blocked).toBe(true);
      expect(vec.dot(vec.sub(pos, f.center), vec.scale(f.normal, inward))).toBeGreaterThan(f.thickness / 2 + R - 3);
    }
  });

  it('blocks a floor-to-ceiling window too', () => {
    const tall: Level = structuredClone(level);
    const o = Object.values(tall.openings).find((x) => x.kind === 'window')!;
    o.sill = 0;
    o.height = 2400;
    const c = buildCollider(tall);
    const f = openingFrame(tall, o.id)!;
    const inward = inAnyRoom(vec.add(f.center, vec.scale(f.normal, f.thickness / 2 + 150))) ? 1 : -1;
    const from = vec.add(f.center, vec.scale(f.normal, inward * 900));
    const { pos } = moveCapsule(c, from, vec.scale(f.normal, -inward * 4000));
    expect(vec.dot(vec.sub(pos, f.center), vec.scale(f.normal, inward))).toBeGreaterThan(f.thickness / 2 + R - 3);
  });

  it('cannot leave the balcony over the railing', () => {
    const balcony = roomNamed('Balcony');
    // Railing centrelines at x = 3500, x = 8500 and y = -1500, 60 thick.
    const south = moveCapsule(collider, balcony.centroid, { x: 0, y: -5000 }).pos;
    expect(south.y).toBeCloseTo(-1500 + 30 + R, 0);
    const west = moveCapsule(collider, balcony.centroid, { x: -9000, y: 0 }).pos;
    expect(west.x).toBeCloseTo(3500 + 30 + R, 0);
    const east = moveCapsule(collider, balcony.centroid, { x: 9000, y: 0 }).pos;
    expect(east.x).toBeCloseTo(8500 - 30 - R, 0);
    for (const p of [south, west, east]) expect(vec.pointInPolygon(p, balcony.polygon)).toBe(true);
  });

  it('treats a low wall as solid', () => {
    const low: Level = structuredClone(level);
    for (const w of Object.values(low.walls)) {
      if (w.kind === 'railing') {
        w.kind = 'low';
        w.height = 1000;
        w.thickness = 100;
      }
    }
    const c = buildCollider(low);
    const south = moveCapsule(c, roomNamed('Balcony').centroid, { x: 0, y: -5000 }).pos;
    expect(south.y).toBeCloseTo(-1500 + 50 + R, 0);
  });
});

describe('furniture', () => {
  it('blocks, as an oriented box', () => {
    // 2200 x 900 sofa in the middle of the living room.
    const straight = withItems({ catalogId: 'sofa', x: 6500, y: 2100, z: 0, rotationDeg: 0 });
    const north = moveCapsule(straight, { x: 6500, y: 3600 }, { x: 0, y: -3000 });
    expect(north.blocked).toBe(true);
    expect(north.pos.y).toBeCloseTo(2100 + 450 + R, 0);
    // Past its end there is nothing in the way.
    expect(moveCapsule(straight, { x: 8200, y: 3600 }, { x: 0, y: -3000 }).blocked).toBe(false);

    const turned = withItems({ catalogId: 'sofa', x: 6500, y: 2100, z: 0, rotationDeg: 90 });
    const east = moveCapsule(turned, { x: 8500, y: 2100 }, { x: -4000, y: 0 });
    expect(east.pos.x).toBeCloseTo(6500 + 450 + R, 0);
    expect(moveCapsule(turned, { x: 6500, y: 3600 }, { x: 0, y: -3000 }).pos.y).toBeCloseTo(2100 + 1100 + R, 0);

    const diagonal = withItems({ catalogId: 'sofa', x: 6500, y: 2100, z: 0, rotationDeg: 45 });
    const hit = moveCapsule(diagonal, { x: 6500, y: 3900 }, { x: 0, y: -3000 });
    expect(hit.blocked).toBe(true);
    // Deflected along the slanted face rather than stopped dead or let through.
    expect(Math.abs(hit.pos.x - 6500)).toBeGreaterThan(100);
    expect(isFree(diagonal, { x: 6500, y: 2100 })).toBe(false);
  });

  it('lets the walker step over rugs and under wall-mounted items', () => {
    const c = withItems(
      { catalogId: 'rug', x: 6500, y: 2100, z: 0, rotationDeg: 0 },
      { catalogId: 'ac', x: 6500, y: 3900, z: 2300, rotationDeg: 0 },
      { catalogId: 'unknown-entry', x: 6500, y: 2100, z: 0, rotationDeg: 0 },
    );
    expect(c.boxes).toHaveLength(0);
    const { pos, blocked } = moveCapsule(c, { x: 6500, y: 3900 }, { x: 0, y: -3000 });
    expect(blocked).toBe(false);
    expect(pos.y).toBeCloseTo(900, 0);
  });

  it('never traps a walker who is inside a piece of furniture', () => {
    const c = withItems({ catalogId: 'sofa', x: 6500, y: 2100, z: 0, rotationDeg: 0 });
    const inside = { x: 6500, y: 2100 };
    expect(isFree(c, inside)).toBe(false);
    for (let deg = 0; deg < 360; deg += 30) {
      const out = moveCapsule(c, inside, vec.scale(vec.rotate({ x: 1, y: 0 }, deg), 1900)).pos;
      expect(isFree(c, out), `heading ${deg}`).toBe(true);
    }
    // Once out, it is solid again.
    const out = moveCapsule(c, inside, { x: 0, y: 1500 }).pos;
    expect(out.y).toBeGreaterThanOrEqual(2100 + 450 + R - 1);
    expect(moveCapsule(c, out, { x: 0, y: -1500 }).pos.y).toBeCloseTo(2100 + 450 + R, 0);
  });

  it('refuses to squeeze through a gap narrower than the walker', () => {
    // Sofa (x 6400..8600) 300 mm off the corridor wall of the living room (inner face at y = 4140).
    const c = withItems({ catalogId: 'sofa', x: 7500, y: 4140 - 300 - 450, z: 0, rotationDeg: 0 });
    // Slide north along the sofa's end to the wall, then push west into the gap.
    const corner = moveCapsule(c, { x: 8600 + R, y: 3000 }, { x: 0, y: 3000 }).pos;
    expect(corner.y).toBeCloseTo(4140 - R, 0);
    const { pos } = moveCapsule(c, corner, { x: -3000, y: 300 });
    expect(pos.x).toBeGreaterThan(8600 + 200);
    expect(overlaps(c, pos)).toBe(false);
    expect(isFree(c, pos, R - 5)).toBe(true);
  });
});

describe('queries', () => {
  it('finds free floor and rejects walls', () => {
    expect(isFree(collider, { x: 6500, y: 2100 })).toBe(true);
    expect(isFree(collider, { x: 6500, y: 4200 })).toBe(true); // in the corridor passage
    expect(isFree(collider, { x: 3000, y: 1000 })).toBe(false); // in the kitchen wall
    expect(isFree(collider, { x: 8800, y: 250 })).toBe(false); // too close to the south wall
  });

  it('pushes a capsule that overlaps a wall back out', () => {
    const { pos, ok } = resolvePosition(collider, { x: 8800, y: 200 });
    expect(ok).toBe(true);
    expect(pos.y).toBeCloseTo(100 + R, 0);
  });

  it('sweeps a straight line up to the first obstacle', () => {
    const open = sweep(collider, { x: 6500, y: 2000 }, { x: 8000, y: 3000 });
    expect(open.blocked).toBe(false);
    expect(open.end).toEqual({ x: 8000, y: 3000 });
    const wall = sweep(collider, { x: 8800, y: 2000 }, { x: 8800, y: -2000 });
    expect(wall.blocked).toBe(true);
    expect(wall.end.y).toBeGreaterThanOrEqual(100 + R - 5);
    expect(wall.end.y).toBeLessThan(100 + R + 60);
  });
});
