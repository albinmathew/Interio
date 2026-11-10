import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  buildLevelMesh,
  createSampleLevel,
  deriveRooms,
  openingFrame,
  ops,
  roomGraph,
  snap,
  tourPath,
  validateLevel,
  wallFootprints,
  type Level,
} from '../src';

const box = (w: number, h: number, t = 200): Level =>
  buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: w, y: 0 }, thickness: t },
      { a: { x: w, y: 0 }, b: { x: w, y: h }, thickness: t },
      { a: { x: w, y: h }, b: { x: 0, y: h }, thickness: t },
      { a: { x: 0, y: h }, b: { x: 0, y: 0 }, thickness: t },
    ],
  });

/** Every triangle must face its stored normal, and nothing may be degenerate or NaN. */
function checkGeometry(level: Level) {
  const mesh = buildLevelMesh(level);
  let tris = 0;
  for (const g of mesh.groups) {
    const { positions: p, normals: n, indices: ix } = g.geometry;
    expect(p.length % 3).toBe(0);
    expect(p.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i]! * 3;
      const b = ix[i + 1]! * 3;
      const c = ix[i + 2]! * 3;
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const facing = cx * n[a]! + cy * n[a + 1]! + cz * n[a + 2]!;
      expect(facing, `${g.key} triangle ${i / 3}`).toBeGreaterThan(-1e-9);
      tris++;
    }
  }
  return { mesh, tris };
}

describe('rooms', () => {
  it('finds one room in a closed box with the clear area inset by the walls', () => {
    const level = box(4000, 3000);
    const rooms = deriveRooms(level);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(4000 * 3000, 0);
    expect(rooms[0]!.interiorArea).toBeCloseTo(3800 * 2800, 0);
    expect(rooms[0]!.width).toBeCloseTo(3800, 0);
    expect(rooms[0]!.depth).toBeCloseTo(2800, 0);
    expect(rooms[0]!.roomId).not.toBeNull();
  });

  it('finds no room in an open chain and ignores dangling walls', () => {
    const open = buildLevel({ walls: [{ a: { x: 0, y: 0 }, b: { x: 3000, y: 0 } }, { a: { x: 3000, y: 0 }, b: { x: 3000, y: 3000 } }] });
    expect(deriveRooms(open)).toHaveLength(0);
    const level = box(4000, 3000);
    ops.addWall(level, { x: 2000, y: 0 }, { x: 2000, y: 1500 });
    expect(deriveRooms(level)).toHaveLength(1);
  });

  it('splits a room when a dividing wall is added and keeps the original name on one side', () => {
    const level = box(6000, 3000);
    const original = Object.values(level.rooms)[0]!;
    original.name = 'Hall';
    ops.addWall(level, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { thickness: 100 });
    ops.reconcileRooms(level);
    const rooms = deriveRooms(level);
    expect(rooms).toHaveLength(2);
    expect(Object.values(level.rooms).map((r) => r.name)).toContain('Hall');
    expect(rooms.every((r) => r.roomId)).toBe(true);
    // The T-junctions split the shell walls.
    expect(Object.keys(level.walls)).toHaveLength(7);
  });

  it('handles crossing walls by splitting both', () => {
    const level = box(6000, 6000);
    ops.addWall(level, { x: 0, y: 3000 }, { x: 6000, y: 3000 });
    ops.addWall(level, { x: 3000, y: 0 }, { x: 3000, y: 6000 });
    ops.reconcileRooms(level);
    expect(deriveRooms(level)).toHaveLength(4);
  });

  it('merges rooms when the dividing wall is removed', () => {
    const level = box(6000, 3000);
    const [mid] = ops.addWall(level, { x: 3000, y: 0 }, { x: 3000, y: 3000 });
    ops.reconcileRooms(level);
    expect(Object.keys(level.rooms)).toHaveLength(2);
    ops.removeWall(level, mid!);
    ops.reconcileRooms(level);
    expect(Object.keys(level.rooms)).toHaveLength(1);
  });
});

describe('footprints', () => {
  it('mitres a right-angle corner', () => {
    const level = box(4000, 3000, 200);
    const fps = wallFootprints(level);
    expect(fps).toHaveLength(4);
    const corners = fps.flatMap((f) => [f.aL, f.aR, f.bL, f.bR]);
    // Outer corners at -100, inner at +100 from the centreline box.
    for (const c of corners) {
      expect([-100, 100, 3900, 4100]).toContain(Math.round(c.x));
      expect([-100, 100, 2900, 3100]).toContain(Math.round(c.y));
    }
  });

  it('squares off a free end', () => {
    const level = buildLevel({ walls: [{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, thickness: 200 }] });
    const [f] = wallFootprints(level);
    expect(f!.aL).toEqual({ x: 0, y: 100 });
    expect(f!.aR).toEqual({ x: 0, y: -100 });
    expect(f!.bL).toEqual({ x: 1000, y: 100 });
  });
});

describe('mesh', () => {
  it('builds outward-facing geometry for a box', () => {
    const { mesh } = checkGeometry(box(4000, 3000));
    expect(mesh.groups.filter((g) => g.kind === 'wallSide')).toHaveLength(8);
    expect(mesh.groups.filter((g) => g.kind === 'floor')).toHaveLength(1);
    expect(mesh.bounds.max[0]).toBeCloseTo(4);
    expect(mesh.bounds.min[2]).toBeCloseTo(-3);
  });

  it('cuts a door and a window out of a wall', () => {
    const level = box(4000, 3000);
    const south = Object.values(level.walls).find((w) => level.vertices[w.a]!.y === 0 && level.vertices[w.b]!.y === 0)!;
    const plain = buildLevelMesh(level).groups.find((g) => g.key === `wall:${south.id}:left`)!.geometry.indices.length;
    ops.addOpening(level, { wallId: south.id, offset: 1000, width: 900, height: 2100, sill: 0, kind: 'door' });
    ops.addOpening(level, { wallId: south.id, offset: 2800, width: 1200, height: 1200, sill: 900, kind: 'window' });
    const { mesh } = checkGeometry(level);
    const side = mesh.groups.find((g) => g.key === `wall:${south.id}:left`)!;
    // 3 solid spans + lintel over the door + sill wall and lintel at the window = 6 quads.
    expect(side.geometry.indices.length).toBe(6 * 6);
    expect(side.geometry.indices.length).toBeGreaterThan(plain);
    expect(mesh.groups.filter((g) => g.kind === 'reveal')).toHaveLength(2);
  });

  it('assigns wall sides to the room they face', () => {
    const level = box(4000, 3000);
    const roomId = Object.keys(level.rooms)[0]!;
    const sides = buildLevelMesh(level).groups.filter((g) => g.kind === 'wallSide');
    expect(sides.filter((g) => g.roomId === roomId)).toHaveLength(4);
    expect(sides.filter((g) => g.roomId === null)).toHaveLength(4);
  });
});

describe('sample plan', () => {
  const level = createSampleLevel();

  it('has ten named rooms and is structurally valid', () => {
    const rooms = deriveRooms(level);
    expect(rooms).toHaveLength(10);
    expect(Object.values(level.rooms).map((r) => r.name).sort()).toEqual(
      ['Balcony', 'Bath 1', 'Bath 2', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Corridor', 'Foyer', 'Kitchen', 'Living / Dining'],
    );
    expect(validateLevel(level).filter((i) => i.severity !== 'info')).toEqual([]);
    expect(Object.keys(level.openings)).toHaveLength(17);
  });

  it('meshes cleanly', () => {
    const { tris } = checkGeometry(level);
    expect(tris).toBeGreaterThan(400);
  });

  it('connects every room and tours all of them from the entrance', () => {
    const graph = roomGraph(level);
    expect(graph.entrances).toHaveLength(1);
    const foyer = Object.values(level.rooms).find((r) => r.name === 'Foyer')!;
    expect(graph.entrances[0]!.roomId).toBe(foyer.id);
    const tour = tourPath(level);
    expect(tour).toHaveLength(10);
    expect(tour[0]!.roomId).toBe(foyer.id);
    expect(new Set(tour.map((s) => s.roomId)).size).toBe(10);
    // Every stop after the first is reached through at least one door.
    expect(tour.slice(1).every((s) => s.via.length >= 1)).toBe(true);
  });

  it('gives opening frames on the wall', () => {
    const o = Object.values(level.openings).find((x) => x.kind === 'sliding')!;
    const f = openingFrame(level, o.id)!;
    expect(Math.round(f.center.x)).toBe(6000);
    expect(Math.round(f.center.y)).toBe(0);
    expect(Math.round(Math.abs(f.right.x - f.left.x))).toBe(3000);
  });
});

describe('snap', () => {
  it('prefers vertices, then underlay points, then walls', () => {
    const level = box(4000, 3000);
    expect(snap(level, { x: 30, y: 20 }, 100)?.kind).toBe('vertex');
    expect(snap(level, { x: 2000, y: 40 }, 100)?.kind).toBe('wall');
    const hit = snap(level, { x: 2000, y: 40 }, 100, { underlayPoints: new Float32Array([2010, 60]) });
    expect(hit).toEqual({ kind: 'underlay', point: { x: 2010, y: 60 } });
    expect(snap(level, { x: 2000, y: 1500 }, 100)).toBeNull();
  });
});
