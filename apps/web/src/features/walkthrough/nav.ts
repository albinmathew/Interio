/**
 * Walkable-area grid and path finding for the guided tour and room jumps.
 * Pure: runs in Node.
 *
 * A cell is walkable when its centre is inside a room polygon and a capsule
 * standing there is clear of the collider. Paths are found with A* (weighted to
 * keep away from walls), pulled straight where there is room, and rounded at
 * corners, so every point of a path is inside a room or in a door opening.
 */
import { openingFrame, vec, type Id, type Level, type Pt, type RoomGeom } from '@interio/core';
import { isFree, type Collider } from './collision';

export const NAV_CELL = 100; // mm
const NAV_MARGIN = 30; // extra clearance beyond the capsule, mm
const COMFORT = 45; // chamfer units (tenths of a cell): keep this far from blocked cells when straightening

export interface NavGrid {
  cell: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** 1 where a walker can stand. */
  free: Uint8Array;
  /** Index into `rooms` of the room polygon containing the cell centre, or -1. */
  room: Int16Array;
  /** Chamfer distance to the nearest non-walkable cell, in tenths of a cell. */
  clearance: Uint16Array;
  /** Connected-component label per walkable cell (-1 elsewhere) and each component's size in cells. */
  component: Int32Array;
  componentSize: number[];
  rooms: RoomGeom[];
}

export function cellIndex(g: NavGrid, p: Pt): number {
  const cx = Math.floor((p.x - g.minX) / g.cell);
  const cy = Math.floor((p.y - g.minY) / g.cell);
  return cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows ? -1 : cy * g.cols + cx;
}

export function cellCentre(g: NavGrid, index: number): Pt {
  return { x: g.minX + ((index % g.cols) + 0.5) * g.cell, y: g.minY + (Math.floor(index / g.cols) + 0.5) * g.cell };
}

export function buildNavGrid(level: Level, collider: Collider, rooms: RoomGeom[], cell = NAV_CELL): NavGrid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    const b = vec.polygonBounds(r.polygon);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) minX = minY = maxX = maxY = 0;
  minX = Math.floor(minX / cell) * cell - cell;
  minY = Math.floor(minY / cell) * cell - cell;
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const n = cols * rows;
  const g: NavGrid = {
    cell,
    minX,
    minY,
    cols,
    rows,
    free: new Uint8Array(n),
    room: new Int16Array(n).fill(-1),
    clearance: new Uint16Array(n),
    component: new Int32Array(n).fill(-1),
    componentSize: [],
    rooms,
  };

  rooms.forEach((r, ri) => {
    const b = vec.polygonBounds(r.polygon);
    const x0 = Math.max(0, Math.floor((b.minX - minX) / cell));
    const x1 = Math.min(cols - 1, Math.floor((b.maxX - minX) / cell));
    const y0 = Math.max(0, Math.floor((b.minY - minY) / cell));
    const y1 = Math.min(rows - 1, Math.floor((b.maxY - minY) / cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const i = cy * cols + cx;
        if (g.room[i] !== -1) continue;
        const p = { x: minX + (cx + 0.5) * cell, y: minY + (cy + 0.5) * cell };
        if (!vec.pointInPolygon(p, r.polygon)) continue;
        g.room[i] = ri;
        if (isFree(collider, p, collider.radius + NAV_MARGIN)) g.free[i] = 1;
      }
    }
  });

  // Doorways narrower than the comfortable band can fall between cell centres:
  // open the cells along each door's axis wherever the bare capsule fits.
  for (const o of Object.values(level.openings)) {
    if (o.kind === 'window') continue;
    const f = openingFrame(level, o.id);
    if (!f) continue;
    const reach = f.thickness / 2 + collider.radius + NAV_MARGIN + cell * 1.5;
    for (let s = -reach; s <= reach; s += cell / 4) {
      const p = vec.add(f.center, vec.scale(f.normal, s));
      const i = cellIndex(g, p);
      if (i < 0 || g.room[i] === -1 || g.free[i]) continue;
      if (isFree(collider, p, collider.radius - 5) && isFree(collider, cellCentre(g, i), collider.radius - 5)) g.free[i] = 1;
    }
  }

  chamfer(g);
  label(g);
  return g;
}

function chamfer(g: NavGrid): void {
  const { cols, rows, free, clearance } = g;
  const BIG = 60000;
  for (let i = 0; i < free.length; i++) clearance[i] = free[i] ? BIG : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : clearance[y * cols + x]!);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!clearance[i]) continue;
      clearance[i] = Math.min(clearance[i]!, at(x - 1, y) + 10, at(x, y - 1) + 10, at(x - 1, y - 1) + 14, at(x + 1, y - 1) + 14);
    }
  for (let y = rows - 1; y >= 0; y--)
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (!clearance[i]) continue;
      clearance[i] = Math.min(clearance[i]!, at(x + 1, y) + 10, at(x, y + 1) + 10, at(x + 1, y + 1) + 14, at(x - 1, y + 1) + 14);
    }
}

function label(g: NavGrid): void {
  const { cols, rows, free, component } = g;
  const stack: number[] = [];
  for (let start = 0; start < free.length; start++) {
    if (!free[start] || component[start] !== -1) continue;
    const id = g.componentSize.length;
    let size = 0;
    component[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % cols;
      const y = (i - x) / cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!free[j] || component[j] !== -1) continue;
        component[j] = id;
        stack.push(j);
      }
    }
    g.componentSize.push(size);
  }
}

export function isWalkable(g: NavGrid, p: Pt): boolean {
  const i = cellIndex(g, p);
  return i >= 0 && g.free[i] === 1;
}

export interface NearestOptions {
  /** Only cells of this room (index into `grid.rooms`). */
  room?: number;
  /** Only cells of this connected component. */
  component?: number;
  /** Skip pockets smaller than this many cells (a gap behind a wardrobe is not a place to land). */
  minComponent?: number;
  /** Search radius in mm. */
  within?: number;
}

/** Centre of the walkable cell nearest to `p`, or null. */
export function nearestWalkable(g: NavGrid, p: Pt, opts: NearestOptions = {}): Pt | null {
  const within = opts.within ?? Infinity;
  const cx = Math.floor((p.x - g.minX) / g.cell);
  const cy = Math.floor((p.y - g.minY) / g.cell);
  const maxRing = Math.min(Math.max(g.cols, g.rows), Number.isFinite(within) ? Math.ceil(within / g.cell) + 1 : Infinity);
  let best = -1;
  let bestD = Infinity;
  for (let ring = 0; ring <= maxRing; ring++) {
    // A cell on ring k is at least (k - 1) cells away, so stop once nothing nearer can turn up.
    if (best >= 0 && (ring - 1) * g.cell > bestD) break;
    for (let dy = -ring; dy <= ring; dy++) {
      const edge = Math.abs(dy) === ring;
      for (let dx = -ring; dx <= ring; dx += edge || ring === 0 ? 1 : 2 * ring) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue;
        const i = y * g.cols + x;
        if (!g.free[i]) continue;
        if (opts.room !== undefined && g.room[i] !== opts.room) continue;
        if (opts.component !== undefined && g.component[i] !== opts.component) continue;
        if (opts.minComponent !== undefined && g.componentSize[g.component[i]!]! < opts.minComponent) continue;
        const d = vec.dist(p, cellCentre(g, i));
        if (d < bestD && d <= within) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best < 0 ? null : cellCentre(g, best);
}

/** Straight segment a-b stays on cells accepted by `ok`. */
function clear(g: NavGrid, a: Pt, b: Pt, ok: (i: number) => boolean): boolean {
  const n = Math.max(1, Math.ceil(vec.dist(a, b) / (g.cell / 4)));
  for (let k = 0; k <= n; k++) {
    const i = cellIndex(g, vec.lerp(a, b, k / n));
    if (i < 0 || !ok(i)) return false;
  }
  return true;
}

class Heap {
  private items: number[] = [];
  constructor(private readonly score: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(v: number): void {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score[a[parent]!]! <= this.score[a[i]!]!) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]!]! < this.score[a[m]!]!) m = l;
        if (r < a.length && this.score[a[r]!]! < this.score[a[m]!]!) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

function astar(g: NavGrid, start: number, goal: number): number[] | null {
  const { cols, rows, free, clearance } = g;
  const n = cols * rows;
  const cost = new Float64Array(n).fill(Infinity);
  const score = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = goal % cols;
  const gy = (goal - gx) / cols;
  const h = (i: number) => {
    const dx = Math.abs((i % cols) - gx);
    const dy = Math.abs(Math.floor(i / cols) - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new Heap(score);
  cost[start] = 0;
  score[start] = h(start);
  heap.push(start);
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % cols;
    const y = (cur - x) / cols;
    for (const [dx, dy, d] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!free[j] || closed[j]) continue;
      if (dx !== 0 && dy !== 0 && (!free[y * cols + nx] || !free[ny * cols + x])) continue; // no cutting corners
      // Walking near a wall costs more, so routes run down the middle of doors and corridors.
      const near = Math.max(0, 60 - clearance[j]!) / 60;
      const c = cost[cur]! + d * (1 + 3 * near);
      if (c >= cost[j]!) continue;
      cost[j] = c;
      from[j] = cur;
      score[j] = c + h(j);
      heap.push(j);
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const path = [goal];
  for (let i = goal; i !== start; ) {
    i = from[i]!;
    path.push(i);
  }
  return path.reverse();
}

/** Replaces sharp corners with short arcs where the arc stays walkable. */
function roundCorners(g: NavGrid, pts: Pt[], radius = 350): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const d = Math.min(radius, vec.dist(a, b) / 2, vec.dist(b, c) / 2);
    if (d < 40) {
      out.push(b);
      continue;
    }
    const p = vec.add(b, vec.scale(vec.norm(vec.sub(a, b)), d));
    const q = vec.add(b, vec.scale(vec.norm(vec.sub(c, b)), d));
    const arc: Pt[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      arc.push(vec.lerp(vec.lerp(p, b, t), vec.lerp(b, q, t), t));
    }
    const walkable = arc.every((v, k) => k === 0 || clear(g, arc[k - 1]!, v, (j) => g.free[j] === 1));
    if (walkable) out.push(...arc);
    else out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/**
 * A walkable polyline from `from` to `to` (plan mm), or null when there is no
 * way through. Both ends are snapped to the nearest walkable cell.
 */
export function findPath(g: NavGrid, from: Pt, to: Pt): Pt[] | null {
  const a = isWalkable(g, from) ? from : nearestWalkable(g, from, { within: 1500 });
  const b = isWalkable(g, to) ? to : nearestWalkable(g, to, { within: 1500 });
  if (!a || !b) return null;
  const start = cellIndex(g, a);
  const goal = cellIndex(g, b);
  if (g.component[start] !== g.component[goal]) return null;
  const cells = astar(g, start, goal);
  if (!cells) return null;
  if (cells.length === 1) return vec.dist(a, b) < 1 ? [a] : [a, b];

  const onPath = new Uint8Array(g.cols * g.rows);
  for (const i of cells) onPath[i] = 1;
  const roomy = (i: number) => g.free[i] === 1 && (onPath[i] === 1 || g.clearance[i]! >= COMFORT);
  const raw = cells.map((i) => cellCentre(g, i));
  raw[0] = a;
  raw[raw.length - 1] = b;

  // String pulling: skip ahead to the furthest point still in comfortable line of sight.
  const pulled: Pt[] = [raw[0]!];
  for (let i = 0; i < raw.length - 1; ) {
    let j = i + 1;
    for (let k = raw.length - 1; k > i + 1; k--) {
      if (clear(g, raw[i]!, raw[k]!, roomy)) {
        j = k;
        break;
      }
    }
    pulled.push(raw[j]!);
    i = j;
  }
  return roundCorners(g, pulled);
}

export function pathLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += vec.dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** Point at distance `s` along a polyline, clamped to its ends. */
export function pointAlong(pts: Pt[], s: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const d = vec.dist(pts[i - 1]!, pts[i]!);
    if (left <= d && d > 0) return vec.lerp(pts[i - 1]!, pts[i]!, left / d);
    left -= d;
  }
  return pts[pts.length - 1]!;
}

/** Longest clear line of sight from `p` over walkable cells, as a plan angle in degrees. */
export function longestView(g: NavGrid, p: Pt, room?: number): number {
  let best = 0;
  let bestScore = -1;
  const reach = (deg: number): number => {
    const d = vec.rotate({ x: 1, y: 0 }, deg);
    let s = 0;
    for (; s < 15000; s += g.cell / 2) {
      const i = cellIndex(g, vec.add(p, vec.scale(d, s)));
      if (i < 0 || !g.free[i] || (room !== undefined && g.room[i] !== room)) break;
    }
    return s;
  };
  const reaches: number[] = [];
  for (let k = 0; k < 36; k++) reaches.push(reach(k * 10));
  for (let k = 0; k < 36; k++) {
    // Favour directions that are open on both sides too, not a glimpse through a gap.
    const score = reaches[k]! + 0.5 * (reaches[(k + 1) % 36]! + reaches[(k + 35) % 36]!);
    if (score > bestScore) {
      bestScore = score;
      best = k * 10;
    }
  }
  return best;
}

export function roomIndexOf(g: NavGrid, roomId: Id): number {
  return g.rooms.findIndex((r) => r.roomId === roomId);
}
