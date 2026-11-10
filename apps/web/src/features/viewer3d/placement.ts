/**
 * Placement maths for the Design view. Pure functions over plan data (mm, y up,
 * CCW degrees): where an entry lands for a cursor position, how it snaps to walls,
 * and what it overlaps. No three.js, no store.
 *
 * Item convention (see core `Item`): at rotation 0 the width runs along plan +x and
 * the front faces plan -y, so the back is towards +y.
 */
import type { CatalogEntry, Id, Item, Level, Pt, RoomGeom, Wall } from '@interio/core';

export interface Pose {
  x: number;
  y: number;
  z: number;
  rotationDeg: number;
}

export interface Placement extends Pose {
  /** Room under the item's centre. */
  roomId?: Id;
  /** Wall the item's back snapped to, if any. */
  wallId?: Id;
  /** False when there is no room to put the item in (empty plan). */
  ok: boolean;
}

export interface Size {
  w: number;
  d: number;
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return Math.abs(d < 0 ? d + 360 : d);
}

/** Rotation after one keyboard step. Results land on multiples of `step`. */
export function rotateStep(deg: number, step: number, direction: 1 | -1): number {
  const snapped = direction > 0 ? Math.floor(deg / step + 1e-6) * step : Math.ceil(deg / step - 1e-6) * step;
  return normalizeDeg(snapped + direction * step);
}

/** Unit vectors of an item's width axis and front direction. */
export function itemAxes(rotationDeg: number): { u: Pt; front: Pt } {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { u: { x: c, y: s }, front: { x: s, y: -c } };
}

/** Rotation that makes an item's front point along `dir`. */
export function rotationFacing(dir: Pt): number {
  return normalizeDeg((Math.atan2(dir.y, dir.x) * 180) / Math.PI + 90);
}

/** Footprint corners in plan mm, counter-clockwise: front-left, front-right, back-right, back-left. */
export function footprint(pose: { x: number; y: number; rotationDeg: number }, size: Size): Pt[] {
  const { u, front } = itemAxes(pose.rotationDeg);
  const hw = mul(u, size.w / 2);
  const hd = mul(front, size.d / 2);
  const c = { x: pose.x, y: pose.y };
  return [add(sub(c, hw), hd), add(add(c, hw), hd), sub(add(c, hw), hd), sub(sub(c, hw), hd)];
}

/** Outer size of an item on the floor, with its optional scale. */
export function itemSize(entry: CatalogEntry, item?: Pick<Item, 'scale'>): Size & { h: number } {
  const s = item?.scale ?? 1;
  return { w: entry.dims.w * s, d: entry.dims.d * s, h: entry.dims.h * s };
}

/* ------------------------------------------------------------- wall runs */

/** A straight stretch of a room's clear-floor boundary (collinear wall pieces merged). */
export interface WallRun {
  a: Pt;
  b: Pt;
  dir: Pt;
  /** Unit normal pointing into the room. */
  normal: Pt;
  length: number;
  /** Wall pieces along the run: [start, end, wallId] measured from `a`. */
  pieces: [number, number, Id][];
}

/** Walls by id, to tell real walls from open-plan dividers. */
export type WallKinds = Record<Id, Pick<Wall, 'kind'>>;

/**
 * The stretches of a room's boundary that are real walls. Edges along a `divider` (the
 * line between zones of an open-plan space) are left out: furniture neither snaps to
 * them nor is held back by them.
 */
export function wallRuns(room: Pick<RoomGeom, 'interior' | 'edgeWalls'>, walls?: WallKinds): WallRun[] {
  const poly = room.interior;
  const n = poly.length;
  const runs: WallRun[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) continue;
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const wallId = room.edgeWalls[i] ?? '';
    if (walls?.[wallId]?.kind === 'divider') continue;
    const last = runs[runs.length - 1];
    // Counter-clockwise polygon: the interior is on the left of every edge.
    if (last && Math.abs(last.dir.x * dir.y - last.dir.y * dir.x) < 1e-3 && dot(last.dir, dir) > 0 && Math.hypot(last.b.x - a.x, last.b.y - a.y) < 1) {
      last.pieces.push([last.length, last.length + length, wallId]);
      last.b = b;
      last.length += length;
    } else {
      runs.push({ a, b, dir, normal: { x: -dir.y, y: dir.x }, length, pieces: [[0, length, wallId]] });
    }
  }
  // The polygon is closed: the last run may continue into the first.
  const first = runs[0];
  const last = runs[runs.length - 1];
  const joined = first && last && Math.hypot(last.b.x - first.a.x, last.b.y - first.a.y) < 1;
  if (first && last && first !== last && joined && Math.abs(last.dir.x * first.dir.y - last.dir.y * first.dir.x) < 1e-3 && dot(last.dir, first.dir) > 0) {
    last.pieces.push(...first.pieces.map(([s, e, id]) => [s + last.length, e + last.length, id] as [number, number, Id]));
    last.b = first.b;
    last.length += first.length;
    runs.shift();
  }
  return runs;
}

function wallAt(run: WallRun, t: number): Id | undefined {
  return (run.pieces.find(([s, e]) => t >= s && t <= e) ?? run.pieces[0])?.[2] || undefined;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(p: Pt, poly: Pt[]): { distance: number; point: Pt } {
  let best = { distance: Infinity, point: p };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const t = l2 < 1e-9 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
    const q = add(a, mul(ab, t));
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.distance) best = { distance: d, point: q };
  }
  return best;
}

/** The room containing `p`, or the nearest one when `p` is outside the plan. */
export function roomFor(rooms: RoomGeom[], p: Pt): { room: RoomGeom; point: Pt } | null {
  const inside = rooms.find((r) => pointInPolygon(p, r.polygon));
  if (inside) return { room: inside, point: p };
  let best: { room: RoomGeom; point: Pt } | null = null;
  let bestD = Infinity;
  for (const room of rooms) {
    const hit = distanceToPolygon(p, room.interior);
    if (hit.distance < bestD) {
      bestD = hit.distance;
      best = { room, point: hit.point };
    }
  }
  return best;
}

export function roomIdAt(rooms: RoomGeom[], p: Pt): Id | undefined {
  return rooms.find((r) => pointInPolygon(p, r.polygon))?.roomId ?? undefined;
}

/**
 * Pushes a footprint back inside the room: every corner that pokes through a wall run
 * moves the item along that run's inward normal. Exact for convex rooms, and good
 * enough for L-shapes because runs far from the item are ignored.
 */
export function keepInside(runs: WallRun[], pose: { x: number; y: number; rotationDeg: number }, size: Size): Pt {
  let c = { x: pose.x, y: pose.y };
  const reach = Math.max(size.w, size.d);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const run of runs) {
      let push = 0;
      for (const corner of footprint({ ...c, rotationDeg: pose.rotationDeg }, size)) {
        const rel = sub(corner, run.a);
        const t = dot(rel, run.dir);
        const depth = -dot(rel, run.normal);
        if (t < -1 || t > run.length + 1 || depth <= 0.01 || depth > reach + 400) continue;
        push = Math.max(push, depth);
      }
      if (push > 0) {
        c = add(c, mul(run.normal, push));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return c;
}

export interface FloorOptions {
  /** Rotation used when the item does not snap to a wall. */
  rotationDeg: number;
  /** Distance (mm) between the item's back and a wall within which it snaps. Default 250; 0 disables snapping. */
  snap?: number;
  /** The level's walls, so open-plan dividers can be told from real walls. */
  walls?: WallKinds;
}

/**
 * Where a floor item lands for a cursor position: inside the room under the cursor (or
 * the nearest room), with its back against a wall and facing into the room when close
 * enough to one.
 */
export function placeOnFloor(rooms: RoomGeom[], size: Size, cursor: Pt, opts: FloorOptions): Placement {
  const found = roomFor(rooms, cursor);
  if (!found) return { x: cursor.x, y: cursor.y, z: 0, rotationDeg: opts.rotationDeg, ok: false };
  const runs = wallRuns(found.room, opts.walls);
  const p = found.point;
  const snap = opts.snap ?? 250;

  let best: { run: WallRun; gap: number; t: number } | null = null;
  if (snap > 0) {
    for (const run of runs) {
      const rel = sub(p, run.a);
      const t = dot(rel, run.dir);
      if (t < -100 || t > run.length + 100) continue;
      // Gap between the wall and the item's back if the item were turned to face away from it.
      const gap = dot(rel, run.normal) - size.d / 2;
      if (gap > snap || gap < -size.d / 2 - 400) continue;
      if (!best || gap < best.gap) best = { run, gap, t };
    }
  }

  let pose: { x: number; y: number; rotationDeg: number };
  let wallId: Id | undefined;
  if (best) {
    const { run } = best;
    const t = run.length >= size.w ? clamp(best.t, size.w / 2, run.length - size.w / 2) : run.length / 2;
    const c = add(add(run.a, mul(run.dir, t)), mul(run.normal, size.d / 2));
    pose = { x: c.x, y: c.y, rotationDeg: rotationFacing(run.normal) };
    wallId = wallAt(run, t);
  } else {
    pose = { x: p.x, y: p.y, rotationDeg: normalizeDeg(opts.rotationDeg) };
  }
  const c = keepInside(runs, pose, size);
  return {
    x: Math.round(c.x),
    y: Math.round(c.y),
    z: 0,
    rotationDeg: pose.rotationDeg,
    roomId: roomIdAt(rooms, c) ?? found.room.roomId ?? undefined,
    wallId,
    ok: true,
  };
}

/** Where a wall-anchored item lands: flat against the nearest wall of the room, facing into it. */
export function placeOnWall(rooms: RoomGeom[], size: Size, cursor: Pt, opts: { roomId?: Id | null; walls?: WallKinds } = {}): Placement {
  const pinned = opts.roomId ? rooms.find((r) => r.roomId === opts.roomId) : undefined;
  const found = pinned ? { room: pinned, point: cursor } : roomFor(rooms, cursor);
  if (!found) return { x: cursor.x, y: cursor.y, z: 0, rotationDeg: 0, ok: false };
  let best: { run: WallRun; t: number; distance: number } | null = null;
  for (const run of wallRuns(found.room, opts.walls)) {
    const rel = sub(found.point, run.a);
    const t = clamp(dot(rel, run.dir), 0, run.length);
    const q = add(run.a, mul(run.dir, t));
    const distance = Math.hypot(found.point.x - q.x, found.point.y - q.y);
    if (!best || distance < best.distance) best = { run, t, distance };
  }
  if (!best) return { x: cursor.x, y: cursor.y, z: 0, rotationDeg: 0, ok: false };
  const { run } = best;
  const t = run.length >= size.w ? clamp(best.t, size.w / 2, run.length - size.w / 2) : run.length / 2;
  const c = add(add(run.a, mul(run.dir, t)), mul(run.normal, size.d / 2));
  return {
    x: Math.round(c.x),
    y: Math.round(c.y),
    z: 0,
    rotationDeg: rotationFacing(run.normal),
    roomId: found.room.roomId ?? undefined,
    wallId: wallAt(run, t),
    ok: true,
  };
}

export interface PlaceOptions {
  rotationDeg: number;
  /** Snap floor items to walls. Default true. */
  snap?: boolean;
  /** Room whose wall the cursor is on (from a pointer hit on a wall face). */
  wallRoomId?: Id | null;
  /** Keep this elevation instead of the entry's default (moving an item the user raised). */
  z?: number;
  scale?: number;
}

/** Default elevation of an entry's underside. */
export function defaultElevation(entry: CatalogEntry, ceilingHeight: number, scale = 1): number {
  const h = entry.dims.h * scale;
  if (entry.anchor === 'ceiling') return Math.max(0, ceilingHeight - h);
  if (entry.anchor === 'wall') return clamp(entry.mountHeight ?? 1200, 0, Math.max(0, ceilingHeight - h));
  return entry.mountHeight ?? 0;
}

/** Placement of a catalog entry for a cursor position, by anchor: floor, wall or ceiling. */
export function placeEntry(
  level: Pick<Level, 'ceilingHeight'> & Partial<Pick<Level, 'walls'>>,
  rooms: RoomGeom[],
  entry: CatalogEntry,
  cursor: Pt,
  opts: PlaceOptions,
): Placement {
  const scale = opts.scale ?? 1;
  const size = { w: entry.dims.w * scale, d: entry.dims.d * scale };
  const z = opts.z ?? defaultElevation(entry, level.ceilingHeight, scale);
  if (entry.anchor === 'wall') return { ...placeOnWall(rooms, size, cursor, { roomId: opts.wallRoomId, walls: level.walls }), z };
  const snap = entry.anchor === 'floor' && opts.snap !== false ? undefined : 0;
  return { ...placeOnFloor(rooms, size, cursor, { rotationDeg: opts.rotationDeg, snap, walls: level.walls }), z };
}

/* ---------------------------------------------------------------- overlap */

/**
 * Penetration depth of two convex polygons (separating-axis test): 0 when apart, else
 * the smallest distance one would have to move to separate them.
 */
export function penetration(a: Pt[], b: Pt[]): number {
  let min = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const l = Math.hypot(q.x - p.x, q.y - p.y);
      if (l < 1e-6) continue;
      const axis = { x: -(q.y - p.y) / l, y: (q.x - p.x) / l };
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const v of a) {
        const s = dot(v, axis);
        a0 = Math.min(a0, s);
        a1 = Math.max(a1, s);
      }
      for (const v of b) {
        const s = dot(v, axis);
        b0 = Math.min(b0, s);
        b1 = Math.max(b1, s);
      }
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap <= 0) return 0;
      min = Math.min(min, overlap);
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** Solid pieces of a wall in plan: its rectangle minus the openings that reach the floor. */
export function wallSolids(level: Pick<Level, 'walls' | 'vertices' | 'openings'>, wallId: Id): Pt[][] {
  const wall = level.walls[wallId];
  const a = wall && level.vertices[wall.a];
  const b = wall && level.vertices[wall.b];
  if (!wall || !a || !b) return [];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1) return [];
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const n = { x: -dir.y * (wall.thickness / 2), y: dir.x * (wall.thickness / 2) };
  const gaps = Object.values(level.openings)
    .filter((o) => o.wallId === wallId && o.sill <= 0)
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
    .sort((m, k) => m[0] - k[0]);
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor) spans.push([cursor, Math.min(g0, length)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < length) spans.push([cursor, length]);
  return spans
    .filter(([s0, s1]) => s1 - s0 > 1)
    .map(([s0, s1]) => {
      const p = add(a, mul(dir, s0));
      const q = add(a, mul(dir, s1));
      return [sub(p, n), sub(q, n), add(q, n), add(p, n)];
    });
}

export interface Overlap {
  items: Id[];
  walls: Id[];
}

/**
 * Items that intersect another item or a wall, keyed by item id. Touching does not
 * count: `tolerance` (mm) lets items sit flush against walls and each other.
 */
export function findOverlaps(
  level: Pick<Level, 'items' | 'walls' | 'vertices' | 'openings'>,
  resolveEntry: (catalogId: string) => CatalogEntry | undefined,
  tolerance = 15,
): Map<Id, Overlap> {
  const boxes = Object.values(level.items).flatMap((item) => {
    const entry = resolveEntry(item.catalogId);
    if (!entry) return [];
    const size = itemSize(entry, item);
    return [{ item, poly: footprint(item, size), z0: item.z, z1: item.z + size.h, radius: Math.hypot(size.w, size.d) / 2 }];
  });
  // Dividers have no body: nothing to bump into.
  const walls = Object.values(level.walls)
    .filter((wall) => wall.kind !== 'divider')
    .map((wall) => ({ id: wall.id, height: wall.height, solids: wallSolids(level, wall.id) }));
  const out = new Map<Id, Overlap>();
  const entry = (id: Id): Overlap => out.get(id) ?? out.set(id, { items: [], walls: [] }).get(id)!;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= 10) continue;
      if (Math.hypot(a.item.x - b.item.x, a.item.y - b.item.y) > a.radius + b.radius) continue;
      if (penetration(a.poly, b.poly) > tolerance) {
        entry(a.item.id).items.push(b.item.id);
        entry(b.item.id).items.push(a.item.id);
      }
    }
    for (const w of walls) {
      if (a.z0 >= w.height - 10) continue;
      if (w.solids.some((solid) => penetration(a.poly, solid) > tolerance)) entry(a.item.id).walls.push(w.id);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- picking */

export type Vec3 = [number, number, number];

/**
 * Distance along a world-space ray to an item's bounding box, or null when it misses.
 * World frame: metres, Y up, X = x/1000, Z = -y/1000; plan rotation is rotation about +Y.
 */
export function rayHitsBox(origin: Vec3, direction: Vec3, pose: Pose, size: Size & { h: number }): number | null {
  const r = (pose.rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Into the box frame: translate to the box centre on the floor, rotate by -yaw about +Y.
  const ox = origin[0] - pose.x / 1000;
  const oy = origin[1] - pose.z / 1000;
  const oz = origin[2] + pose.y / 1000;
  const o: Vec3 = [ox * c - oz * s, oy, ox * s + oz * c];
  const d: Vec3 = [direction[0] * c - direction[2] * s, direction[1], direction[0] * s + direction[2] * c];
  const min: Vec3 = [-size.w / 2000, 0, -size.d / 2000];
  const max: Vec3 = [size.w / 2000, size.h / 1000, size.d / 2000];
  let t0 = 0;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (o[i]! < min[i]! || o[i]! > max[i]!) return null;
      continue;
    }
    const a = (min[i]! - o[i]!) / d[i]!;
    const b = (max[i]! - o[i]!) / d[i]!;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return null;
  }
  return t0;
}

/** Plan direction of an arrow key for a camera at `azimuthDeg` (0 = looking north), snapped to the plan axes. */
export function nudgeDirection(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', azimuthDeg: number): Pt {
  const quarter = ((Math.round(azimuthDeg / 90) % 4) + 4) % 4;
  const base: Record<string, Pt> = {
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  let v = base[key]!;
  for (let i = 0; i < quarter; i++) v = { x: v.y, y: -v.x };
  // `|| 0` turns -0 into 0.
  return { x: Math.round(v.x) || 0, y: Math.round(v.y) || 0 };
}
