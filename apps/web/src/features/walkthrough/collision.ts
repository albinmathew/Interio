/**
 * Walk-mode collision. Pure: no React, no DOM, runs in Node.
 *
 * The collider is a three-mesh-bvh over every vertical face a person can bump
 * into: wall sides, ends and opening reveals from the core level mesh (so doors
 * and passages are real holes), panes across windows, a barrier just outside
 * doors that lead nowhere, and furniture as oriented boxes. The walker is an
 * upright capsule that never moves vertically, so the narrow phase is exact in
 * plan: each face is cut to the walker's height band and the walker is pushed
 * away from the nearest point of what is left. That gives sliding along walls.
 *
 * Faces are one-sided: a walker whose axis is behind a face is not pushed by it.
 * Someone who ends up inside a piece of furniture (it was placed on top of them,
 * or they were teleported there) therefore walks straight out instead of being
 * trapped, and nothing outside a solid can get in.
 *
 * The public API speaks plan millimetres; the BVH is in world metres.
 */
import {
  DEFAULTS,
  buildLevelMesh,
  deriveRooms,
  openingFrame,
  vec,
  type CatalogEntry,
  type Id,
  type Level,
  type LevelMesh,
  type Pt,
  type RoomGeom,
} from '@interio/core';
import { Box3, BufferAttribute, BufferGeometry, Vector3, type Triangle } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** Capsule radius, mm. */
export const PLAYER_RADIUS = 250;
/** Anything whose top is at or below this is stepped over (rugs, mats). */
export const STEP_OVER_HEIGHT = 250;
/** Longest distance moved between two collision checks, mm. Well under the radius, so nothing tunnels. */
export const MAX_STEP = 100;

export interface ColliderOptions {
  /** Capsule radius in mm. */
  radius?: number;
  /** Eye height of the walker in mm; the capsule reaches a little above it. */
  eyeHeight?: number;
  /** Catalog lookup for furniture boxes. Without it items do not collide. */
  resolveEntry?: (catalogId: string) => CatalogEntry | undefined;
  /** Reuse an already built level mesh (e.g. `selectLevelMesh(level)`). */
  mesh?: LevelMesh;
  /** Reuse already derived rooms (e.g. `selectRooms(level)`). */
  rooms?: RoomGeom[];
}

/** Plan-frame footprint of a colliding item. */
export interface ItemBox {
  itemId: Id;
  cx: number;
  cy: number;
  /** Unit axes of the item's width and depth. */
  ux: Pt;
  uy: Pt;
  hw: number;
  hd: number;
}

export interface Collider {
  bvh: MeshBVH;
  /** Capsule radius, mm. */
  radius: number;
  /** Height band the walker occupies, world metres. Faces outside it do not collide. */
  bottom: number;
  top: number;
  boxes: ItemBox[];
  triangles: number;
}

export interface MoveResult {
  pos: Pt;
  /** A face pushed the capsule back at some point of the move. */
  blocked: boolean;
}

class Soup {
  readonly positions: number[] = [];

  /** Vertical quad between plan points p and q from z0 to z1 (mm), facing plan direction n. */
  wall(p: Pt, q: Pt, z0: number, z1: number, n: Pt): void {
    const a = [p.x / 1000, z0 / 1000, -p.y / 1000] as const;
    const b = [q.x / 1000, z0 / 1000, -q.y / 1000] as const;
    const c = [q.x / 1000, z1 / 1000, -q.y / 1000] as const;
    const d = [p.x / 1000, z1 / 1000, -p.y / 1000] as const;
    // (b - a) x (c - a) is (-dz, 0, dx) * h in world; plan n is (n.x, 0, -n.y) there. Flip if they oppose.
    const facing = -(b[2] - a[2]) * n.x - (b[0] - a[0]) * n.y;
    if (facing >= 0) this.positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    else this.positions.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
}

function addLevelFaces(soup: Soup, mesh: LevelMesh): void {
  for (const g of mesh.groups) {
    if (g.kind !== 'wallSide' && g.kind !== 'wallEnd' && g.kind !== 'reveal') continue;
    const { positions, normals, indices } = g.geometry;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i]!;
      // Vertical faces only: sills and door heads cannot push a walker sideways.
      if (Math.abs(normals[ia * 3 + 1]!) > 0.5) continue;
      for (let k = 0; k < 3; k++) {
        const v = indices[i + k]! * 3;
        soup.positions.push(positions[v]!, positions[v + 1]!, positions[v + 2]!);
      }
    }
  }
}

/** Glass across windows, and a barrier outside doors that do not lead into another room. */
function addOpeningFaces(soup: Soup, level: Level, rooms: RoomGeom[], radius: number): void {
  for (const o of Object.values(level.openings)) {
    const f = openingFrame(level, o.id);
    const wall = level.walls[o.wallId];
    if (!f || !wall) continue;
    const half = f.thickness / 2;
    if (o.kind === 'window') {
      const z0 = Math.min(o.sill, wall.height);
      const z1 = Math.min(o.sill + o.height, wall.height);
      if (z1 - z0 < 1) continue;
      for (const sign of [1, -1]) {
        const off = vec.scale(f.normal, sign * half);
        soup.wall(vec.add(f.left, off), vec.add(f.right, off), z0, z1, vec.scale(f.normal, sign));
      }
      continue;
    }
    const reach = half + 150;
    const inRoom = (sign: number) => rooms.some((r) => vec.pointInPolygon(vec.add(f.center, vec.scale(f.normal, sign * reach)), r.polygon));
    for (const sign of [1, -1]) {
      if (inRoom(sign)) continue;
      // Outside. Let the walker stand in the doorway but not step out into the void.
      const off = vec.scale(f.normal, sign * (half + radius + 50));
      const side = vec.scale(f.dir, o.width / 2 + radius);
      const c = vec.add(f.center, off);
      soup.wall(vec.sub(c, side), vec.add(c, side), 0, wall.height, vec.scale(f.normal, -sign));
    }
  }
}

function addItemBoxes(soup: Soup, level: Level, resolveEntry: NonNullable<ColliderOptions['resolveEntry']>, top: number): ItemBox[] {
  const boxes: ItemBox[] = [];
  for (const item of Object.values(level.items)) {
    const entry = resolveEntry(item.catalogId);
    if (!entry) continue;
    const s = item.scale ?? 1;
    const z0 = item.z;
    const z1 = item.z + entry.dims.h * s;
    if (entry.anchor === 'floor' && entry.dims.h * s <= STEP_OVER_HEIGHT) continue; // rugs, mats
    if (z1 <= STEP_OVER_HEIGHT || z0 >= top) continue; // underfoot or overhead
    const ux = vec.rotate({ x: 1, y: 0 }, item.rotationDeg);
    const uy = vec.rotate({ x: 0, y: 1 }, item.rotationDeg);
    const hw = (entry.dims.w * s) / 2;
    const hd = (entry.dims.d * s) / 2;
    if (hw < 1 || hd < 1) continue;
    const c = { x: item.x, y: item.y };
    const corner = (sx: number, sy: number) => vec.add(c, vec.add(vec.scale(ux, sx * hw), vec.scale(uy, sy * hd)));
    const p = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const normals = [vec.scale(uy, -1), ux, uy, vec.scale(ux, -1)];
    for (let i = 0; i < 4; i++) soup.wall(p[i]!, p[(i + 1) % 4]!, z0, z1, normals[i]!);
    boxes.push({ itemId: item.id, cx: c.x, cy: c.y, ux, uy, hw, hd });
  }
  return boxes;
}

export function buildCollider(level: Level, opts: ColliderOptions = {}): Collider {
  const radius = opts.radius ?? PLAYER_RADIUS;
  const eye = opts.eyeHeight ?? DEFAULTS.eyeHeight;
  const top = eye + 100; // crown of the head
  const soup = new Soup();
  addLevelFaces(soup, opts.mesh ?? buildLevelMesh(level));
  addOpeningFaces(soup, level, opts.rooms ?? deriveRooms(level), radius);
  const boxes = opts.resolveEntry ? addItemBoxes(soup, level, opts.resolveEntry, top) : [];
  if (soup.positions.length === 0) soup.positions.push(1e6, 0, 1e6, 1e6, 1, 1e6, 1e6 + 1, 0, 1e6); // a BVH needs a triangle
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(soup.positions), 3));
  const count = soup.positions.length / 3;
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) index[i] = i;
  geometry.setIndex(new BufferAttribute(index, 1));
  return { bvh: new MeshBVH(geometry), radius, bottom: 0.03, top: top / 1000, boxes, triangles: count / 3 };
}

/* ------------------------------------------------------------ narrow phase */

const bounds = new Box3();
const normal = new Vector3();

/** Plan view of the last face passed to `footprint`: unit normal n, direction u, and its extent along u from vertex a. */
const face = { nx: 0, nz: 0, ux: 0, uz: 0, min: 0, max: 0 };

function clipEdge(p: Vector3, q: Vector3, o: Vector3, lo: number, hi: number): void {
  let t0 = 0;
  let t1 = 1;
  const dy = q.y - p.y;
  if (Math.abs(dy) < 1e-9) {
    if (p.y < lo || p.y > hi) return;
  } else {
    const ta = (lo - p.y) / dy;
    const tb = (hi - p.y) / dy;
    t0 = Math.max(0, Math.min(ta, tb));
    t1 = Math.min(1, Math.max(ta, tb));
    if (t0 > t1) return;
  }
  for (const t of [t0, t1]) {
    const s = (p.x + (q.x - p.x) * t - o.x) * face.ux + (p.z + (q.z - p.z) * t - o.z) * face.uz;
    if (s < face.min) face.min = s;
    if (s > face.max) face.max = s;
  }
}

/**
 * A vertical triangle seen from above is a line. Finds the stretch of that line
 * covered by the part of the triangle between heights lo and hi. False when the
 * triangle misses the band (or is not vertical).
 */
function footprint(tri: Triangle, lo: number, hi: number): boolean {
  tri.getNormal(normal);
  const l = Math.hypot(normal.x, normal.z);
  if (l < 0.5) return false;
  face.nx = normal.x / l;
  face.nz = normal.z / l;
  face.ux = -face.nz;
  face.uz = face.nx;
  face.min = Infinity;
  face.max = -Infinity;
  clipEdge(tri.a, tri.b, tri.a, lo, hi);
  clipEdge(tri.b, tri.c, tri.a, lo, hi);
  clipEdge(tri.c, tri.a, tri.a, lo, hi);
  return face.max >= face.min;
}

function setBounds(c: Collider, x: number, z: number, pad: number): void {
  bounds.min.set(x - pad, c.bottom, z - pad);
  bounds.max.set(x + pad, c.top, z + pad);
}

/**
 * Pushes the walker at world (x, z) out of the face it overlaps most deeply.
 * Returns that overlap in metres (0 when it touches nothing). Resolving the
 * deepest contact first keeps the seam between two coplanar faces from catching
 * a walker who is sliding along them.
 */
function pushOut(c: Collider, at: { x: number; z: number }): number {
  const r = c.radius / 1000;
  setBounds(c, at.x, at.z, r);
  let nearest = r;
  let px = 0;
  let pz = 0;
  c.bvh.shapecast({
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (tri) => {
      if (!footprint(tri, c.bottom, c.top)) return false;
      const rx = at.x - tri.a.x;
      const rz = at.z - tri.a.z;
      if (rx * face.nx + rz * face.nz <= 0) return false; // behind the face
      const s = Math.max(face.min, Math.min(face.max, rx * face.ux + rz * face.uz));
      const hx = rx - face.ux * s;
      const hz = rz - face.uz * s;
      const h = Math.hypot(hx, hz);
      if (h >= nearest || h < 1e-9) return false;
      nearest = h;
      px = hx / h;
      pz = hz / h;
      return false;
    },
  });
  const push = r - nearest;
  at.x += px * push;
  at.z += pz * push;
  return push;
}

const TOLERANCE = 0.004; // metres of overlap left after resolving that still counts as resolved

/**
 * Pushes the walker at `p` out of whatever it overlaps. `ok` is false when it
 * could not be freed (wedged between two faces closer together than its width).
 */
export function resolvePosition(c: Collider, p: Pt): { pos: Pt; touched: boolean; ok: boolean } {
  const at = { x: p.x / 1000, z: -p.y / 1000 };
  let touched = false;
  let residual = 0;
  for (let pass = 0; pass < 8; pass++) {
    residual = pushOut(c, at);
    if (residual <= 1e-6) break;
    touched = true;
  }
  if (residual > 1e-6) residual = pushOut(c, { ...at });
  return { pos: { x: at.x * 1000, y: -at.z * 1000 }, touched, ok: residual <= TOLERANCE };
}

/**
 * Moves the walker from `from` by `delta` (plan mm), sliding along whatever it
 * meets. The move is cut into steps shorter than the radius so a long frame
 * cannot tunnel through a wall. No vertical motion.
 */
export function moveCapsule(c: Collider, from: Pt, delta: Pt, maxStep = MAX_STEP): MoveResult {
  const length = Math.hypot(delta.x, delta.y);
  if (length < 1e-6) return { pos: from, blocked: false };
  const steps = Math.max(1, Math.ceil(length / Math.min(maxStep, c.radius * 0.5)));
  let pos = from;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    const next = resolvePosition(c, { x: pos.x + delta.x / steps, y: pos.y + delta.y / steps });
    if (next.touched) blocked = true;
    if (!next.ok) break; // wedged: stay where we were rather than squeeze into a face
    pos = next.pos;
  }
  return { pos, blocked };
}

/** True when a walker standing at `p` would be pushed by a face (same one-sided test as movement). */
export function overlaps(c: Collider, p: Pt): boolean {
  return pushOut(c, { x: p.x / 1000, z: -p.y / 1000 }) > TOLERANCE;
}

/**
 * Straight walk from `from` towards `to`: the furthest point reached before the
 * walker would touch something. Used by click-to-move.
 */
export function sweep(c: Collider, from: Pt, to: Pt, step = 50): { end: Pt; blocked: boolean } {
  const length = vec.dist(from, to);
  if (length < 1) return { end: from, blocked: false };
  const n = Math.ceil(length / step);
  let end = from;
  for (let i = 1; i <= n; i++) {
    const p = vec.lerp(from, to, i / n);
    if (overlaps(c, p)) return { end, blocked: true };
    end = p;
  }
  return { end, blocked: false };
}

export function insideItem(c: Collider, p: Pt): boolean {
  for (const b of c.boxes) {
    const dx = p.x - b.cx;
    const dy = p.y - b.cy;
    if (Math.abs(dx * b.ux.x + dy * b.ux.y) < b.hw && Math.abs(dx * b.uy.x + dy * b.uy.y) < b.hd) return true;
  }
  return false;
}

/**
 * True when a walker of `radius` mm at `p` is clear of every face, from either
 * side, and not inside a piece of furniture. Used to find places to stand.
 */
export function isFree(c: Collider, p: Pt, radius = c.radius): boolean {
  if (insideItem(c, p)) return false;
  const r = radius / 1000;
  const x = p.x / 1000;
  const z = -p.y / 1000;
  setBounds(c, x, z, r);
  const hit = c.bvh.shapecast({
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (tri) => {
      if (!footprint(tri, c.bottom, c.top)) return false;
      const rx = x - tri.a.x;
      const rz = z - tri.a.z;
      const s = Math.max(face.min, Math.min(face.max, rx * face.ux + rz * face.uz));
      return Math.hypot(rx - face.ux * s, rz - face.uz * s) < r;
    },
  });
  return !hit;
}
