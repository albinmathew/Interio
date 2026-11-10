/**
 * Plan -> triangle meshes, with no three.js dependency. Output is in the WORLD
 * frame (metres, Y up; see `frames.ts`) as plain typed arrays, grouped so a
 * renderer can assign one material per group.
 */
import earcut from 'earcut';
import type { Id, Level, Opening, Pt, WallKind } from '../schema';
import { wallFootprints, type WallFootprint } from './footprints';
import { memoLevel } from './memo';
import { deriveRooms, type RoomGeom } from './rooms';
import { add, dot, pointInPolygon, scale, sub } from './vec';

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export type MeshGroupKind = 'wallSide' | 'wallTop' | 'wallEnd' | 'reveal' | 'floor' | 'ceiling';

export interface MeshGroup {
  /** Stable key, unique within the level mesh. */
  key: string;
  kind: MeshGroupKind;
  wallId?: Id;
  wallKind?: WallKind;
  /** Wall sides only: which side of the wall (relative to a -> b). */
  side?: 'left' | 'right';
  /** Floors, ceilings, and wall sides that face a room (null when the side faces outdoors). */
  roomId?: Id | null;
  openingId?: Id;
  geometry: Geometry;
}

export interface LevelMesh {
  groups: MeshGroup[];
  /** World-space bounds in metres. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

type V3 = [number, number, number]; // plan frame: x, y, z (up), millimetres

class Builder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];

  get empty(): boolean {
    return this.indices.length === 0;
  }

  /** Adds a triangle, flipping it if needed so its front faces `n`. UVs are in metres. */
  tri(p0: V3, p1: V3, p2: V3, n: V3, uv: (p: V3) => [number, number]): void {
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const order = facing >= 0 ? [p0, p1, p2] : [p0, p2, p1];
    const base = this.positions.length / 3;
    for (const p of order) {
      // Plan (x, y, z-up) mm -> world (X, Y-up, Z) m. The map preserves handedness.
      this.positions.push(p[0] / 1000, p[2] / 1000, -p[1] / 1000);
      this.normals.push(n[0], n[2], -n[1]);
      const t = uv(p);
      this.uvs.push(t[0], t[1]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  quad(p0: V3, p1: V3, p2: V3, p3: V3, n: V3, uv: (p: V3) => [number, number]): void {
    this.tri(p0, p1, p2, n, uv);
    this.tri(p0, p2, p3, n, uv);
  }

  /** Horizontal polygon at height z, facing up (`up = true`) or down. */
  polygon(poly: Pt[], z: number, up: boolean): void {
    const flat: number[] = [];
    for (const p of poly) flat.push(p.x, p.y);
    const tris = earcut(flat);
    const n: V3 = [0, 0, up ? 1 : -1];
    const uv = (p: V3): [number, number] => [p[0] / 1000, p[1] / 1000];
    for (let i = 0; i + 2 < tris.length; i += 3) {
      const a = poly[tris[i]!]!;
      const b = poly[tris[i + 1]!]!;
      const c = poly[tris[i + 2]!]!;
      this.tri([a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z], n, uv);
    }
  }

  build(): Geometry {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}

interface Cut {
  id: Id;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/** Openings of a wall as non-overlapping intervals along its centreline, clamped to the wall. */
function wallCuts(level: Level, fp: WallFootprint, height: number): Cut[] {
  const a = level.vertices[level.walls[fp.wallId]!.a]!;
  // Stay clear of the mitred corners at both ends.
  const lo = Math.max(dot(sub(fp.aL, a), fp.dir), dot(sub(fp.aR, a), fp.dir), 0) + 10;
  const hi = Math.min(dot(sub(fp.bL, a), fp.dir), dot(sub(fp.bR, a), fp.dir), fp.length) - 10;
  const list: Opening[] = Object.values(level.openings).filter((o) => o.wallId === fp.wallId);
  list.sort((m, n) => m.offset - n.offset);
  const cuts: Cut[] = [];
  let cursor = lo;
  for (const o of list) {
    const s0 = Math.max(cursor, o.offset - o.width / 2);
    const s1 = Math.min(hi, o.offset + o.width / 2);
    if (s1 - s0 < 50) continue;
    const z0 = Math.max(0, Math.min(o.sill, height));
    const z1 = Math.max(z0, Math.min(o.sill + o.height, height));
    if (z1 - z0 < 50) continue;
    cuts.push({ id: o.id, s0, s1, z0, z1 });
    cursor = s1 + 1;
  }
  return cuts;
}

function buildWall(
  level: Level,
  fp: WallFootprint,
  rooms: RoomGeom[],
  groups: MeshGroup[],
): void {
  const wall = level.walls[fp.wallId]!;
  const a = level.vertices[wall.a]!;
  const b = level.vertices[wall.b]!;
  const h = wall.height;
  const half = wall.thickness / 2;
  const cuts = wallCuts(level, fp, h);
  const common = { wallId: wall.id, wallKind: wall.kind } as const;

  const sideOf = (sign: 1 | -1) => {
    const start = sign === 1 ? fp.aL : fp.aR;
    const end = sign === 1 ? fp.bL : fp.bR;
    const s0 = dot(sub(start, a), fp.dir);
    const s1 = dot(sub(end, a), fp.dir);
    const at = (s: number, z: number): V3 => {
      const p = add(add(a, scale(fp.dir, s)), scale(fp.normal, sign * half));
      return [p.x, p.y, z];
    };
    return { s0, s1, at };
  };

  // Long faces, split into rectangles around the openings.
  for (const sign of [1, -1] as const) {
    const side = sideOf(sign);
    const n: V3 = [fp.normal.x * sign, fp.normal.y * sign, 0];
    const uv = (p: V3): [number, number] => [dot({ x: p[0] - a.x, y: p[1] - a.y }, fp.dir) / 1000, p[2] / 1000];
    const g = new Builder();
    const rect = (sa: number, sb: number, za: number, zb: number) => {
      if (sb - sa < 0.5 || zb - za < 0.5) return;
      g.quad(side.at(sa, za), side.at(sb, za), side.at(sb, zb), side.at(sa, zb), n, uv);
    };
    let cursor = side.s0;
    for (const c of cuts) {
      rect(cursor, c.s0, 0, h);
      rect(c.s0, c.s1, 0, c.z0);
      rect(c.s0, c.s1, c.z1, h);
      cursor = c.s1;
    }
    rect(cursor, side.s1, 0, h);
    if (g.empty) continue;
    const probe = add(add(a, scale(fp.dir, fp.length / 2)), scale(fp.normal, sign * (half + 40)));
    const room = rooms.find((r) => pointInPolygon(probe, r.polygon));
    groups.push({
      key: `wall:${wall.id}:${sign === 1 ? 'left' : 'right'}`,
      kind: 'wallSide',
      side: sign === 1 ? 'left' : 'right',
      roomId: room ? room.roomId : null,
      ...common,
      geometry: g.build(),
    });
  }

  // Reveals: the faces inside each opening (jambs, head, sill).
  const L = sideOf(1);
  const R = sideOf(-1);
  for (const c of cuts) {
    const g = new Builder();
    const uv = (p: V3): [number, number] => [
      dot({ x: p[0] - a.x, y: p[1] - a.y }, fp.normal) / 1000,
      (p[2] + dot({ x: p[0] - a.x, y: p[1] - a.y }, fp.dir)) / 1000,
    ];
    g.quad(L.at(c.s0, c.z0), R.at(c.s0, c.z0), R.at(c.s0, c.z1), L.at(c.s0, c.z1), [fp.dir.x, fp.dir.y, 0], uv);
    g.quad(L.at(c.s1, c.z0), R.at(c.s1, c.z0), R.at(c.s1, c.z1), L.at(c.s1, c.z1), [-fp.dir.x, -fp.dir.y, 0], uv);
    if (c.z1 < h - 0.5) g.quad(L.at(c.s0, c.z1), L.at(c.s1, c.z1), R.at(c.s1, c.z1), R.at(c.s0, c.z1), [0, 0, -1], uv);
    if (c.z0 > 0.5) g.quad(L.at(c.s0, c.z0), L.at(c.s1, c.z0), R.at(c.s1, c.z0), R.at(c.s0, c.z0), [0, 0, 1], uv);
    groups.push({ key: `reveal:${c.id}`, kind: 'reveal', openingId: c.id, ...common, geometry: g.build() });
  }

  // Top: the footprint, cut where an opening runs the full height of the wall.
  const top = new Builder();
  const through = cuts.filter((c) => c.z1 >= h - 0.5);
  const pl = (s: number): Pt => add(add(a, scale(fp.dir, s)), scale(fp.normal, half));
  const pr = (s: number): Pt => add(add(a, scale(fp.dir, s)), scale(fp.normal, -half));
  if (through.length === 0) top.polygon(fp.polygon, h, true);
  else {
    let from: number | null = null;
    for (const c of through) {
      top.polygon(from === null ? [fp.aR, pr(c.s0), pl(c.s0), fp.aL, a] : [pr(from), pr(c.s0), pl(c.s0), pl(from)], h, true);
      from = c.s1;
    }
    top.polygon([pr(from!), fp.bR, b, fp.bL, pl(from!)], h, true);
  }
  groups.push({ key: `wall:${wall.id}:top`, kind: 'wallTop', ...common, geometry: top.build() });

  // End faces. Hidden inside junctions, visible on free ends and where a taller wall meets a lower one.
  const ends = new Builder();
  const centre = add(a, scale(fp.dir, fp.length / 2));
  const endFace = (p: Pt, q: Pt) => {
    const e = sub(q, p);
    const l = Math.hypot(e.x, e.y);
    if (l < 0.5) return;
    let n = { x: e.y / l, y: -e.x / l };
    if (dot(n, sub(p, centre)) < 0) n = { x: -n.x, y: -n.y };
    const uv = (v: V3): [number, number] => [Math.hypot(v[0] - p.x, v[1] - p.y) / 1000, v[2] / 1000];
    ends.quad([p.x, p.y, 0], [q.x, q.y, 0], [q.x, q.y, h], [p.x, p.y, h], [n.x, n.y, 0], uv);
  };
  endFace(fp.aL, a);
  endFace(a, fp.aR);
  endFace(fp.bR, b);
  endFace(b, fp.bL);
  if (!ends.empty) groups.push({ key: `wall:${wall.id}:ends`, kind: 'wallEnd', ...common, geometry: ends.build() });
}

function compute(level: Level): LevelMesh {
  const groups: MeshGroup[] = [];
  const rooms = deriveRooms(level);
  for (const fp of wallFootprints(level)) {
    if (level.walls[fp.wallId]?.kind !== 'divider') buildWall(level, fp, rooms, groups);
  }

  rooms.forEach((room, i) => {
    const key = room.roomId ?? `face${i}`;
    const floor = new Builder();
    floor.polygon(room.polygon, 0, true);
    groups.push({ key: `floor:${key}`, kind: 'floor', roomId: room.roomId, geometry: floor.build() });
    const ceiling = new Builder();
    ceiling.polygon(room.polygon, level.ceilingHeight, false);
    groups.push({ key: `ceiling:${key}`, kind: 'ceiling', roomId: room.roomId, geometry: ceiling.build() });
  });

  const min: [number, number, number] = [Infinity, 0, Infinity];
  const max: [number, number, number] = [-Infinity, level.ceilingHeight / 1000, -Infinity];
  for (const v of Object.values(level.vertices)) {
    min[0] = Math.min(min[0], v.x / 1000);
    max[0] = Math.max(max[0], v.x / 1000);
    min[2] = Math.min(min[2], -v.y / 1000);
    max[2] = Math.max(max[2], -v.y / 1000);
  }
  if (!Number.isFinite(min[0])) return { groups, bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
  return { groups, bounds: { min, max } };
}

/** Triangle meshes for walls (with openings cut), floors and ceilings. Pure and uncached. */
export const buildLevelMesh: (level: Level) => LevelMesh = compute;

/**
 * Cached `buildLevelMesh` for IMMUTABLE levels (anything read from the plan store).
 * Furniture edits do not rebuild it.
 */
export const selectLevelMesh: (level: Level) => LevelMesh = memoLevel(
  (l) => [l.vertices, l.walls, l.openings, l.rooms, l.ceilingHeight],
  compute,
);
