/**
 * Mutating operations on a plain `Level`. The store runs them inside immer;
 * the importer and tests call them directly on a fresh level.
 */
import { deriveFaces } from './geometry/faces';
import { dist, interiorPoint, pointInPolygon, projectOnSegment, roundPt, segmentIntersection } from './geometry/vec';
import { DEFAULTS, type Id, type Item, type Level, type Opening, type Pt, type Room, type RoomType, type Wall } from './schema';
import { defaultFloorFor } from './materials';

let counter = 0;
export function newId(prefix: string): Id {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  return `${prefix}_${rand}${counter.toString(36).padStart(2, '0')}`;
}

export function emptyLevel(name = 'Level 1'): Level {
  return {
    id: newId('lvl'),
    name,
    ceilingHeight: DEFAULTS.ceilingHeight,
    vertices: {},
    walls: {},
    openings: {},
    rooms: {},
    items: {},
  };
}

export function wallEnds(level: Level, wall: Wall): { a: Pt; b: Pt } {
  const a = level.vertices[wall.a];
  const b = level.vertices[wall.b];
  if (!a || !b) throw new Error(`Wall ${wall.id} references a missing vertex`);
  return { a, b };
}

export function wallLength(level: Level, wall: Wall): number {
  const { a, b } = wallEnds(level, wall);
  return dist(a, b);
}

export function findVertexNear(level: Level, p: Pt, tol: number, exclude?: ReadonlySet<Id>): Id | null {
  let best: Id | null = null;
  let bestD = tol;
  for (const [id, v] of Object.entries(level.vertices)) {
    if (exclude?.has(id)) continue;
    const d = dist(p, v);
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function findWallNear(
  level: Level,
  p: Pt,
  tol: number,
  exclude?: ReadonlySet<Id>,
): { wallId: Id; t: number; point: Pt; distance: number } | null {
  let best: { wallId: Id; t: number; point: Pt; distance: number } | null = null;
  for (const wall of Object.values(level.walls)) {
    if (exclude?.has(wall.id)) continue;
    const { a, b } = wallEnds(level, wall);
    const pr = projectOnSegment(p, a, b);
    if (pr.distance <= tol && (!best || pr.distance < best.distance)) best = { wallId: wall.id, ...pr };
  }
  return best;
}

/** Splits a wall at the projection of `p`. Returns the vertex at the split (an end vertex if p is at an end). */
export function splitWall(level: Level, wallId: Id, p: Pt): Id | null {
  const wall = level.walls[wallId];
  if (!wall) return null;
  const { a, b } = wallEnds(level, wall);
  const pr = projectOnSegment(p, a, b);
  const point = roundPt(pr.point);
  if (dist(point, a) < 1) return wall.a;
  if (dist(point, b) < 1) return wall.b;
  const vid = newId('v');
  level.vertices[vid] = point;
  const splitAt = dist(a, point);
  const second: Wall = { ...wall, id: newId('w'), a: vid, b: wall.b };
  wall.b = vid;
  level.walls[second.id] = second;
  for (const o of Object.values(level.openings)) {
    if (o.wallId === wallId && o.offset > splitAt) {
      o.wallId = second.id;
      o.offset -= splitAt;
    }
  }
  clampWallOpenings(level, new Set([wallId, second.id]));
  return vid;
}

/** Returns a vertex at `p`: an existing one within `tol`, a new one splitting a wall under `p`, or a free one. */
export function ensureVertex(level: Level, p: Pt, tol = 10): Id {
  const existing = findVertexNear(level, p, tol);
  if (existing) return existing;
  const onWall = findWallNear(level, p, tol);
  if (onWall) {
    const vid = splitWall(level, onWall.wallId, onWall.point);
    if (vid) return vid;
  }
  const id = newId('v');
  level.vertices[id] = roundPt(p);
  return id;
}

function wallBetween(level: Level, u: Id, v: Id): Wall | undefined {
  return Object.values(level.walls).find((w) => (w.a === u && w.b === v) || (w.a === v && w.b === u));
}

export type WallProps = Partial<Pick<Wall, 'thickness' | 'height' | 'kind'>>;

function resolveWallProps(level: Level, props?: WallProps): Pick<Wall, 'thickness' | 'height' | 'kind'> {
  const kind = props?.kind ?? 'wall';
  const height =
    props?.height ??
    (kind === 'railing' ? DEFAULTS.railingHeight : kind === 'low' ? DEFAULTS.lowWallHeight : level.ceilingHeight);
  const thickness = props?.thickness ?? (kind === 'railing' ? DEFAULTS.railingThickness : DEFAULTS.wallThickness);
  return { kind, height, thickness };
}

/**
 * Adds a wall from a to b. Endpoints weld to nearby vertices and split walls they
 * land on; the new wall is itself split at every vertex and crossing along its
 * way, so the wall graph stays planar. Returns the ids of the walls created.
 */
export function addWall(level: Level, a: Pt, b: Pt, props?: WallProps, tol = 10): Id[] {
  const va = ensureVertex(level, a, tol);
  const vb = ensureVertex(level, b, tol);
  if (va === vb) return [];
  const A = level.vertices[va]!;
  const B = level.vertices[vb]!;
  const total = dist(A, B);
  const cuts: { t: number; vid: Id }[] = [];

  for (const w of Object.values({ ...level.walls })) {
    if (w.a === va || w.b === va || w.a === vb || w.b === vb) continue;
    const e = wallEnds(level, w);
    const hit = segmentIntersection(A, B, e.a, e.b);
    if (!hit) continue;
    const minEnd = Math.min(dist(hit.point, e.a), dist(hit.point, e.b));
    if (minEnd <= tol) continue; // touching at an existing vertex, handled below
    if (hit.t * total <= tol || (1 - hit.t) * total <= tol) continue;
    const vid = splitWall(level, w.id, hit.point);
    if (vid) cuts.push({ t: hit.t, vid });
  }
  for (const [vid, v] of Object.entries(level.vertices)) {
    if (vid === va || vid === vb) continue;
    const pr = projectOnSegment(v, A, B);
    if (pr.distance <= tol && pr.t * total > tol && (1 - pr.t) * total > tol) cuts.push({ t: pr.t, vid });
  }
  cuts.sort((m, n) => m.t - n.t);

  const chain: Id[] = [va];
  for (const c of cuts) if (!chain.includes(c.vid)) chain.push(c.vid);
  chain.push(vb);

  const base = resolveWallProps(level, props);
  const created: Id[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const u = chain[i]!;
    const v = chain[i + 1]!;
    if (u === v || wallBetween(level, u, v)) continue;
    const id = newId('w');
    level.walls[id] = { id, a: u, b: v, ...base };
    created.push(id);
  }
  return created;
}

export function removeOrphanVertices(level: Level): void {
  const used = new Set<Id>();
  for (const w of Object.values(level.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(level.vertices)) if (!used.has(id)) delete level.vertices[id];
}

export function removeWall(level: Level, id: Id): void {
  if (!level.walls[id]) return;
  delete level.walls[id];
  for (const o of Object.values(level.openings)) if (o.wallId === id) delete level.openings[o.id];
  removeOrphanVertices(level);
}

/** Re-clamps the openings of the given walls; drops those whose wall became too short to hold them. */
export function clampWallOpenings(level: Level, wallIds: ReadonlySet<Id>): void {
  for (const o of Object.values(level.openings)) {
    if (wallIds.has(o.wallId) && !clampOpening(level, o)) delete level.openings[o.id];
  }
}

export function moveVertex(level: Level, id: Id, p: Pt): void {
  if (!level.vertices[id]) return;
  level.vertices[id] = roundPt(p);
  const touched = new Set(Object.values(level.walls).filter((w) => w.a === id || w.b === id).map((w) => w.id));
  clampWallOpenings(level, touched);
}

/** Merges vertices closer than `tol` and drops the zero-length and duplicate walls that result. */
export function weldVertices(level: Level, tol = 5): void {
  const ids = Object.keys(level.vertices);
  const remap = new Map<Id, Id>();
  for (let i = 0; i < ids.length; i++) {
    const u = ids[i]!;
    if (remap.has(u)) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const v = ids[j]!;
      if (remap.has(v)) continue;
      if (dist(level.vertices[u]!, level.vertices[v]!) <= tol) remap.set(v, u);
    }
  }
  if (remap.size === 0) return;
  const seen = new Set<string>();
  for (const w of Object.values(level.walls)) {
    w.a = remap.get(w.a) ?? w.a;
    w.b = remap.get(w.b) ?? w.b;
    const key = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    if (w.a === w.b || seen.has(key)) removeWall(level, w.id);
    else seen.add(key);
  }
  removeOrphanVertices(level);
}

/** Keeps an opening inside its wall. Returns false when the wall is too short to hold it. */
export function clampOpening(level: Level, o: Opening, margin = 50): boolean {
  const wall = level.walls[o.wallId];
  if (!wall) return false;
  const length = wallLength(level, wall);
  const maxWidth = length - 2 * margin;
  if (maxWidth < 200) return false;
  o.width = Math.round(Math.min(o.width, maxWidth));
  const half = o.width / 2;
  o.offset = Math.round(Math.max(margin + half, Math.min(length - margin - half, o.offset)));
  o.height = Math.min(o.height, wall.height - o.sill);
  return true;
}

export function addOpening(level: Level, o: Omit<Opening, 'id'>): Id | null {
  const opening: Opening = { ...o, id: newId('o') };
  if (!clampOpening(level, opening)) return null;
  level.openings[opening.id] = opening;
  return opening.id;
}

export function addItem(level: Level, item: Omit<Item, 'id'>): Id {
  const id = newId('i');
  level.items[id] = { ...item, id };
  return id;
}

const ROOM_MIN_AREA = 200_000; // mm^2

/**
 * Re-attaches rooms to the faces of the wall graph: each room follows its seed,
 * rooms whose face disappeared are dropped, and new faces get a fresh room.
 * Call after any structural edit.
 */
export function reconcileRooms(level: Level, defaults?: { name?: (n: number) => string; type?: RoomType }): void {
  const faces = deriveFaces(level, ROOM_MIN_AREA);
  const claimed = new Map<number, Id>();
  for (const room of Object.values(level.rooms)) {
    const idx = faces.findIndex((f, i) => !claimed.has(i) && pointInPolygon(room.seed, f.polygon));
    if (idx < 0) {
      delete level.rooms[room.id];
      continue;
    }
    claimed.set(idx, room.id);
    room.seed = roundPt(interiorPoint(faces[idx]!.interior.length >= 3 ? faces[idx]!.interior : faces[idx]!.polygon));
  }
  let n = Object.keys(level.rooms).length;
  faces.forEach((f, i) => {
    if (claimed.has(i)) return;
    n += 1;
    const type = defaults?.type ?? 'other';
    const room: Room = {
      id: newId('r'),
      seed: roundPt(interiorPoint(f.interior.length >= 3 ? f.interior : f.polygon)),
      name: defaults?.name?.(n) ?? `Room ${n}`,
      type,
      floorMaterial: defaultFloorFor(type),
    };
    level.rooms[room.id] = room;
  });
}

/** Builds a level from loose segments. Convenience for the importer, the sample plan and tests. */
export function buildLevel(spec: {
  ceilingHeight?: number;
  walls: { a: Pt; b: Pt; thickness?: number; height?: number; kind?: Wall['kind'] }[];
  openings?: (Omit<Opening, 'id' | 'wallId' | 'offset'> & { at: Pt })[];
  rooms?: { at: Pt; name: string; type: RoomType; floorMaterial?: string; wallMaterial?: string }[];
}): Level {
  const level = emptyLevel();
  if (spec.ceilingHeight) level.ceilingHeight = spec.ceilingHeight;
  for (const w of spec.walls) addWall(level, w.a, w.b, { thickness: w.thickness, height: w.height, kind: w.kind });
  for (const o of spec.openings ?? []) {
    const hit = findWallNear(level, o.at, 300);
    if (!hit) continue;
    const wall = level.walls[hit.wallId]!;
    const { at: _at, ...rest } = o;
    addOpening(level, { ...rest, wallId: wall.id, offset: hit.t * wallLength(level, wall) });
  }
  reconcileRooms(level);
  for (const r of spec.rooms ?? []) {
    const faces = deriveFaces(level, ROOM_MIN_AREA);
    const face = faces.find((f) => pointInPolygon(r.at, f.polygon));
    if (!face) continue;
    const room = Object.values(level.rooms).find((x) => pointInPolygon(x.seed, face.polygon));
    if (!room) continue;
    room.name = r.name;
    room.type = r.type;
    room.floorMaterial = r.floorMaterial ?? defaultFloorFor(r.type);
    if (r.wallMaterial) room.wallMaterial = r.wallMaterial;
  }
  return level;
}
