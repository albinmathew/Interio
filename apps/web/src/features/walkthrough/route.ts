/**
 * Where to stand and how to get around: the start pose, a good viewpoint per
 * room, and the guided-tour route. Pure: runs in Node.
 */
import {
  deriveRooms,
  openingFrame,
  roomGraph,
  vec,
  type CatalogEntry,
  type Id,
  type Level,
  type LevelMesh,
  type Pt,
  type RoomGeom,
  type RoomGraph,
} from '@interio/core';
import { buildCollider, overlaps, type Collider } from './collision';
import {
  buildNavGrid,
  cellCentre,
  cellIndex,
  findPath,
  isWalkable,
  longestView,
  nearestWalkable,
  pathLength,
  roomIndexOf,
  type NavGrid,
} from './nav';

/** Plan position in mm and heading in plan degrees (counter-clockwise from +x). */
export interface Pose {
  x: number;
  y: number;
  yawDeg: number;
}

/** Everything walk mode derives from a level. Rebuilt when the level changes. */
export interface WalkWorld {
  level: Level;
  rooms: RoomGeom[];
  collider: Collider;
  nav: NavGrid;
  graph: RoomGraph;
}

export function buildWorld(
  level: Level,
  opts: { resolveEntry?: (catalogId: string) => CatalogEntry | undefined; mesh?: LevelMesh; rooms?: RoomGeom[] } = {},
): WalkWorld {
  const rooms = opts.rooms ?? deriveRooms(level);
  const collider = buildCollider(level, { resolveEntry: opts.resolveEntry, mesh: opts.mesh, rooms });
  return { level, rooms, collider, nav: buildNavGrid(level, collider, rooms), graph: roomGraph(level) };
}

/** The named room whose polygon contains `p`. */
export function roomAtPoint(world: WalkWorld, p: Pt): RoomGeom | null {
  return world.rooms.find((r) => r.roomId !== null && vec.pointInPolygon(p, r.polygon)) ?? null;
}

/** True when `p` is inside a room polygon or within a door, sliding-door or passage opening. */
export function inRoomOrDoorway(level: Level, rooms: RoomGeom[], p: Pt, tolerance = 1): boolean {
  if (rooms.some((r) => vec.pointInPolygon(p, r.polygon))) return true;
  for (const o of Object.values(level.openings)) {
    if (o.kind === 'window') continue;
    const f = openingFrame(level, o.id);
    if (!f) continue;
    const d = vec.sub(p, f.center);
    if (Math.abs(vec.dot(d, f.dir)) <= o.width / 2 + tolerance && Math.abs(vec.dot(d, f.normal)) <= f.thickness / 2 + tolerance) return true;
  }
  return false;
}

/** Pockets smaller than this many cells (0.4 m2) are not offered as places to land. */
const MIN_LANDING = 40;

interface RoomFloor {
  /** Room index in the grid. */
  room: number;
  /**
   * Per cell: chamfer distance (10 = one cell) to the edge of the room's own
   * walkable floor, 0 outside it. Doorways count as edges, so deep cells are in
   * the body of the room, not on a threshold.
   */
  depth: Uint16Array;
}

/**
 * The walkable floor of a room. A room split by furniture has several pieces:
 * the one connected to `component` (where the walker is) is used when it is a
 * real share of the room, otherwise the largest.
 */
function roomFloor(world: WalkWorld, roomId: Id, component?: number): RoomFloor | null {
  const g = world.nav;
  const ri = roomIndexOf(g, roomId);
  if (ri < 0) return null;
  const pieces = new Map<number, number>();
  for (let i = 0; i < g.free.length; i++) {
    if (g.free[i] && g.room[i] === ri) pieces.set(g.component[i]!, (pieces.get(g.component[i]!) ?? 0) + 1);
  }
  if (pieces.size === 0) return null;
  const [largest, size] = [...pieces.entries()].sort((m, n) => n[1] - m[1])[0]!;
  const target = component !== undefined && (pieces.get(component) ?? 0) >= Math.max(4, size / 4) ? component : largest;

  const depth = new Uint16Array(g.free.length);
  for (let i = 0; i < depth.length; i++) depth[i] = g.free[i] === 1 && g.room[i] === ri && g.component[i] === target ? 60000 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.cols || y >= g.rows ? 0 : depth[y * g.cols + x]!);
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x;
      if (depth[i]) depth[i] = Math.min(depth[i]!, at(x - 1, y) + 10, at(x, y - 1) + 10, at(x - 1, y - 1) + 14, at(x + 1, y - 1) + 14);
    }
  for (let y = g.rows - 1; y >= 0; y--)
    for (let x = g.cols - 1; x >= 0; x--) {
      const i = y * g.cols + x;
      if (depth[i]) depth[i] = Math.min(depth[i]!, at(x + 1, y) + 10, at(x, y + 1) + 10, at(x + 1, y + 1) + 14, at(x - 1, y + 1) + 14);
    }
  return { room: ri, depth };
}

function middleOf(world: WalkWorld, floor: RoomFloor): Pt | null {
  const g = world.nav;
  const centre = world.rooms[floor.room]!.centroid;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < floor.depth.length; i++) {
    if (!floor.depth[i]) continue;
    // 1 unit is 10 mm of clearance; a metre off-centre costs as much as 200 mm of clearance.
    const score = Math.min(floor.depth[i]!, 120) - 0.02 * vec.dist(cellCentre(g, i), centre);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? null : cellCentre(g, best);
}

/**
 * The best place to stand and look around a room: open floor, well clear of
 * walls and furniture, not far from the middle. Prefers the part of the room
 * connected to `component` (where the walker is coming from).
 */
export function standPoint(world: WalkWorld, roomId: Id, component?: number): Pt | null {
  const floor = roomFloor(world, roomId, component);
  return floor ? middleOf(world, floor) : null;
}

/**
 * A viewpoint for jumping into a room, the way a room is photographed: back in
 * the corner furthest from the middle of the open floor, looking across it.
 * Falls back to the middle, looking down the longest view.
 */
export function roomPose(world: WalkWorld, roomId: Id, component?: number): Pose | null {
  const floor = roomFloor(world, roomId, component);
  const middle = floor && middleOf(world, floor);
  if (!floor || !middle) return null;
  const g = world.nav;
  const inRoom = (i: number) => floor.depth[i]! > 0;
  const sees = (from: Pt): boolean => {
    const n = Math.max(1, Math.ceil(vec.dist(from, middle) / (g.cell / 2)));
    for (let k = 0; k <= n; k++) {
      const i = cellIndex(g, vec.lerp(from, middle, k / n));
      if (i < 0 || !inRoom(i)) return false;
    }
    return true;
  };
  let eye: Pt | null = null;
  let far = 600; // closer than this there is no room to look across: stay in the middle
  for (let i = 0; i < floor.depth.length; i++) {
    if (floor.depth[i]! < 24) continue; // third ring in: off the wall, and never in a door opening
    const p = cellCentre(g, i);
    const d = vec.dist(p, middle);
    if (d > far && sees(p)) {
      far = d;
      eye = p;
    }
  }
  if (!eye) return { ...middle, yawDeg: longestView(g, middle, floor.room) };
  return { ...eye, yawDeg: (Math.atan2(middle.y - eye.y, middle.x - eye.x) * 180) / Math.PI };
}

/** A walkable point at or near `p` for UI jumps (minimap clicks), avoiding dead pockets. */
export function landingNear(world: WalkWorld, p: Pt): Pt | null {
  const g = world.nav;
  const i = cellIndex(g, p);
  if (i >= 0 && g.free[i] && g.componentSize[g.component[i]!]! >= MIN_LANDING && !overlaps(world.collider, p)) return p;
  const room = i >= 0 && g.room[i]! >= 0 ? g.room[i]! : undefined;
  return (
    (room !== undefined ? nearestWalkable(g, p, { room, minComponent: MIN_LANDING, within: 4000 }) : null) ??
    nearestWalkable(g, p, { minComponent: MIN_LANDING, within: 4000 }) ??
    nearestWalkable(g, p, { within: 4000 })
  );
}

function largestRoom(world: WalkWorld): RoomGeom | null {
  return world.rooms.filter((r) => r.roomId !== null).sort((a, b) => b.interiorArea - a.interiorArea)[0] ?? null;
}

/**
 * Where a visit begins: just inside the entrance door, facing into the home.
 * Falls back to the largest room when there is no usable entrance.
 */
export function startPose(world: WalkWorld): Pose | null {
  const { level, nav, graph, collider } = world;
  const entrances = [...graph.entrances].sort(
    (a, b) => Number(level.rooms[b.roomId]?.type === 'foyer') - Number(level.rooms[a.roomId]?.type === 'foyer'),
  );
  for (const e of entrances) {
    const f = openingFrame(level, e.openingId);
    const room = world.rooms.find((r) => r.roomId === e.roomId);
    if (!f || !room) continue;
    const probe = f.thickness / 2 + 150;
    const inward = vec.pointInPolygon(vec.add(f.center, vec.scale(f.normal, probe)), room.polygon) ? f.normal : vec.scale(f.normal, -1);
    const ri = roomIndexOf(nav, e.roomId);
    for (let d = 450; d <= 2000; d += 50) {
      const p = vec.add(f.center, vec.scale(inward, f.thickness / 2 + d));
      const i = cellIndex(nav, p);
      if (i < 0 || !nav.free[i] || nav.room[i] !== ri || overlaps(collider, p)) continue;
      return { x: p.x, y: p.y, yawDeg: (Math.atan2(inward.y, inward.x) * 180) / Math.PI };
    }
  }
  const room = largestRoom(world);
  return room?.roomId ? roomPose(world, room.roomId) : null;
}

export interface TourLeg {
  /** Polyline from the previous stop to this one, plan mm. Empty for a jump. */
  points: Pt[];
  length: number;
  /** No walkable connection: fade and jump instead of walking. */
  jump: boolean;
}

export interface TourStop {
  roomId: Id;
  /** Where the camera stands to look around. */
  eye: Pt;
  /** Direction of the room's longest view, plan degrees. */
  viewDeg: number;
  /** How to get here from the previous stop (from the start pose for the first stop). */
  leg: TourLeg;
}

export interface TourPlan {
  start: Pose;
  stops: TourStop[];
}

function tourOrder(world: WalkWorld, startRoom: Id, startAt: Pt): Id[] {
  const { graph } = world;
  const order: Id[] = [];
  const seen = new Set<Id>();
  const visit = (id: Id, cameFrom: Pt) => {
    seen.add(id);
    order.push(id);
    // Depth first, always taking the nearest door not yet used, measured from the
    // door we last came through, so the walk does not criss-cross the room.
    let at = cameFrom;
    for (;;) {
      const next = graph.edges
        .filter((e) => (e.a === id && !seen.has(e.b)) || (e.b === id && !seen.has(e.a)))
        .sort((m, n) => vec.dist(at, m.door) - vec.dist(at, n.door))[0];
      if (!next) break;
      visit(next.a === id ? next.b : next.a, next.door);
      at = next.door;
    }
  };
  visit(startRoom, startAt);
  // Rooms with no door to the rest of the home come last, each reached by a jump.
  for (const n of graph.nodes) if (!seen.has(n.roomId)) visit(n.roomId, n.centroid);
  return order;
}

/**
 * The guided tour: every named room exactly once, starting where a visit starts.
 * Legs follow the walkable grid through door openings; a room that cannot be
 * walked to gets a jump leg.
 */
export function planTour(world: WalkWorld, from?: Pose): TourPlan | null {
  const start = from ?? startPose(world);
  if (!start) return null;
  const startRoom = roomAtPoint(world, start)?.roomId ?? world.graph.nodes[0]?.roomId;
  if (!startRoom) return null;
  const g = world.nav;
  const stops: TourStop[] = [];
  let at: Pt = { x: start.x, y: start.y };
  for (const roomId of tourOrder(world, startRoom, at)) {
    const here = cellIndex(g, isWalkable(g, at) ? at : (nearestWalkable(g, at, { within: 1500 }) ?? at));
    const eye = standPoint(world, roomId, here >= 0 ? g.component[here] : undefined);
    if (!eye) continue; // no floor to stand on (a room packed solid): nothing to show
    const points = findPath(g, at, eye);
    const leg: TourLeg = points ? { points, length: pathLength(points), jump: false } : { points: [], length: 0, jump: true };
    stops.push({ roomId, eye, viewDeg: longestView(g, eye, roomIndexOf(g, roomId)), leg });
    at = eye;
  }
  return { start, stops };
}
