/**
 * Finds a place for one catalog entry in a room that may already be furnished.
 * Used when an item is asked for by name ("put a sink in the utility") rather
 * than dragged into place.
 */
import { deriveRooms, vec, type Item, type ItemPlacement, type Level, type Pt } from '@interio/core';
import { getEntry } from '../catalog';
import { Planner, type Pose, type WallCandidate } from './planner';

export interface PlaceEntryOptions {
  /**
   * `wall`: back against a wall. `center`: in the open floor. `auto` (default)
   * decides from the entry: tables, rugs and ottomans go in the open floor,
   * everything else against a wall.
   */
  place?: ItemPlacement;
  /** Prefer a spot close to this plan point (for "next to the bed"). */
  near?: Pt;
}

const OPEN_FLOOR = /^(table\.(dining|coffee)|rug\.|ottoman|kitchen\.island|outdoor\.table)/;

function nearest(p: Pose, to: Pt | undefined, fallback: Pt): number {
  return vec.dist({ x: p.x, y: p.y }, to ?? fallback);
}

/**
 * A free pose for the entry in the room, or null when nothing fits. Never
 * mutates the level. Existing items, door swings, passages and windows are
 * respected exactly as in `autoFurnish`. Deterministic.
 */
export function placeEntry(level: Level, roomId: string, catalogId: string, options: PlaceEntryOptions = {}): Omit<Item, 'id'> | null {
  const room = level.rooms[roomId];
  const geom = room && deriveRooms(level).find((g) => g.roomId === roomId);
  const entry = getEntry(catalogId);
  if (!room || !geom || !entry || geom.interior.length < 3) return null;
  const p = new Planner(level, room, geom);
  if (p.runs.length < 3) return null;
  const done = (pose: Pose): Omit<Item, 'id'> => {
    p.place(entry, pose);
    return p.result()[p.result().length - 1]!;
  };
  const flat = entry.dims.h <= 30;

  // Ceiling pieces hang from the ceiling, as close to the middle of the room (or the asked spot) as they fit.
  if (entry.anchor === 'ceiling') {
    const z = level.ceilingHeight - entry.dims.h;
    const target = options.near ?? p.centroid;
    for (const pose of gridPoses(p, target, [0])) if (p.can(entry, { ...pose, z })) return done({ ...pose, z });
    return null;
  }

  const z = entry.mountHeight ?? 0;

  // Counter-top pieces (hob, microwave, monitor) sit on a surface of about their mounting height.
  if (entry.anchor === 'floor' && z > 0) {
    const hosts = p.placed
      .filter((h) => h.existing && Math.abs(h.zMax - z) <= 120 && h.entry.dims.w >= entry.dims.w - 20 && h.entry.dims.d >= entry.dims.d - 20)
      .sort((a, b) => nearest(a.pose, options.near, p.centroid) - nearest(b.pose, options.near, p.centroid));
    for (const host of hosts) {
      const pose: Pose = { x: host.pose.x, y: host.pose.y, rot: host.pose.rot, z: host.zMax };
      if (p.can(entry, pose)) return done(pose);
    }
    // No surface to stand on: fall through and put it against a wall at its mounting height.
  }

  const openFloor = options.place === 'center' || (options.place !== 'wall' && entry.anchor === 'floor' && OPEN_FLOOR.test(entry.id));
  if (openFloor) {
    const along = longestRunAngle(p);
    for (const pose of gridPoses(p, options.near ?? p.centroid, [along, along + 90])) {
      if (p.can(entry, pose, { flat })) return done(pose);
    }
    if (options.place === 'center') return null;
  }

  // Against a wall: with room to stand in front of it first, then without.
  const score = (c: WallCandidate) =>
    options.near
      ? -vec.dist({ x: c.pose.x, y: c.pose.y }, options.near)
      : Math.min(c.doorDist, 2500) * 0.4 - c.cornerDist * 0.25 - (c.underWindow && entry.dims.h + z > 900 ? 3000 : 0);
  for (const clear of entry.anchor === 'wall' ? [0] : [550, 0]) {
    const best = p.bestWall(entry, score, { z, clear: clear || undefined, flat });
    if (best) return done(best.pose);
  }
  // Last resort for floor pieces: anywhere in the open floor.
  if (entry.anchor === 'floor' && !openFloor) {
    const along = longestRunAngle(p);
    for (const pose of gridPoses(p, options.near ?? p.centroid, [along, along + 90])) {
      if (p.can(entry, { ...pose, z }, { flat })) return done({ ...pose, z });
    }
  }
  return null;
}

function longestRunAngle(p: Planner): number {
  const run = p.runs.reduce((best, r) => (r.len > best.len ? r : best));
  return (Math.atan2(run.dir.y, run.dir.x) * 180) / Math.PI;
}

/** Candidate poses on a 100 mm grid over the room, nearest to `target` first. */
function gridPoses(p: Planner, target: Pt, rotations: number[]): Pose[] {
  const xs = p.polygon.map((q) => q.x);
  const ys = p.polygon.map((q) => q.y);
  const step = 100;
  const points: Pt[] = [target];
  for (let x = Math.ceil(Math.min(...xs) / step) * step; x <= Math.max(...xs); x += step) {
    for (let y = Math.ceil(Math.min(...ys) / step) * step; y <= Math.max(...ys); y += step) points.push({ x, y });
  }
  points.sort((a, b) => vec.dist(a, target) - vec.dist(b, target) || a.x - b.x || a.y - b.y);
  const out: Pose[] = [];
  for (const q of points) for (const rot of rotations) out.push({ x: q.x, y: q.y, rot, z: 0 });
  return out;
}
