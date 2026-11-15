/**
 * Furnishing a home with a package: the normal layout and styling, with the package's
 * pieces taking priority and every line guaranteed where it fits.
 *
 * Per room, in one planner: the template lays out the main pieces with the package's
 * choices first (a king bed with drawers for the master bedroom, an L-shaped sofa for
 * the living room); then every line that is still short is placed (the prayer unit, the
 * clock, blinds on each window, the partition, planters spilling onto the balcony); then
 * the styling pass fills around them and the colour scheme is applied. Rooms that already
 * hold furniture are completed: only what their lines miss is added.
 */
import {
  deriveRooms,
  vec,
  type FurnishingPackage,
  type Id,
  type Item,
  type Level,
  type PackageSurface,
  type Room,
  type RoomGeom,
  type RoomPackage,
} from '@interio/core';
import { finishRoom, layoutRoom, plannerFor, type LayoutOptions, type StylingLevel } from '../autofurnish';
import { rectCorners } from '../autofurnish/geometry';
import type { Planner } from '../autofurnish/planner';
import { RoomSeed } from '../autofurnish/seed';
import { applyScheme } from '../autofurnish/styling';
import { homeScheme } from '../autofurnish/schemes';
import { slotOf, type Prefer } from '../autofurnish/templates';
import { buildCheck, overflowBalconies, lineKey, matchSections, roomFaces, faceFinish, type PackageCheck, type PackageSection, type RoomFace } from './check';
import { Placer, guaranteeLine, runBehind } from './place';
import { bedroomRoles, missingBedroomRoles } from './roles';

export interface ApplyPackageOptions {
  /** Rooms to furnish or complete. Default: every room. */
  roomIds?: Id[];
  /**
   * Only these lines (by room and line key): "Add" and "Retry" in the checklist. Nothing
   * else is laid out or styled, and a piece of the same kind that is not the package's
   * (a queen bed where the line asks for a king) may be swapped for it.
   */
  lines?: { roomId: Id; key: string }[];
  /** Include wall-mounted and ceiling pieces. Default true. */
  mounted?: boolean;
  /** Styling of rooms furnished from empty. Default `full`. */
  styling?: StylingLevel;
}

export type RoomPatch = Partial<Pick<Room, 'role' | 'wallMaterial' | 'floorMaterial' | 'ceilingMaterial'>>;
export type WallPatch = { finishLeft?: string; finishRight?: string };

export interface ApplyPackageResult {
  /** Items to add. */
  items: Omit<Item, 'id'>[];
  /** Existing items to take out (swapped for the package's piece). */
  remove: Id[];
  /** Room changes: bedroom roles and finishes. */
  rooms: Record<Id, RoomPatch>;
  /** Wall-face finishes: feature walls. */
  walls: Record<Id, WallPatch>;
  /** The checklist after the change, with reasons for what could not be placed. */
  report: PackageCheck;
}

interface RoomWork {
  planner: Planner;
  seed: RoomSeed;
  placer: Placer;
  /** Laid out from empty in this run (styled at the end). */
  fresh: boolean;
  layout: LayoutOptions;
}

/** The package's choices for the roles pieces play in a room (bed, sofa, wardrobe...). */
export function preferencesFor(sections: RoomPackage[]): Prefer {
  const prefer: Prefer = {};
  for (const section of sections) {
    for (const line of section.items) {
      const id = line.catalogIds[0];
      const slot = id ? slotOf(id) : null;
      if (slot && !prefer[slot]) prefer[slot] = id;
    }
  }
  return prefer;
}

const hasBlinds = (sections: RoomPackage[]) => sections.some((s) => s.items.some((l) => l.catalogIds.some((id) => id.startsWith('blind.'))));

/**
 * Furnishes the home (or some rooms of it) with a package. Pure: returns the changes and
 * never mutates the level. Deterministic for a plan.
 */
export function applyPackage(level: Level, pkg: FurnishingPackage, options: ApplyPackageOptions = {}): ApplyPackageResult {
  const mounted = options.mounted ?? true;
  const styling = options.styling ?? 'full';
  const rooms: Record<Id, RoomPatch> = {};
  const walls: Record<Id, WallPatch> = {};
  const remove: Id[] = [];
  const reasons = new Map<string, string>();

  // Bedrooms without a role get one by size, written with the furnishing.
  const work: Level = structuredClone(level);
  let geoms = deriveRooms(work);
  for (const [id, role] of Object.entries(missingBedroomRoles(work, geoms))) {
    rooms[id] = { role };
    work.rooms[id]!.role = role;
  }
  geoms = deriveRooms(work);
  const roles = bedroomRoles(work, geoms);

  const lineMode = options.lines !== undefined;
  const scope = new Set(lineMode ? options.lines!.map((l) => l.roomId) : (options.roomIds ?? Object.keys(work.rooms)));
  const wanted = (roomId: Id, key: string) => !lineMode || options.lines!.some((l) => l.roomId === roomId && l.key === key);

  const rooms0 = Object.values(work.rooms);
  const furnished = new Set(Object.values(work.items).map((i) => i.roomId));
  const works = new Map<Id, RoomWork | null>();
  const workFor = (roomId: Id): RoomWork | null => {
    if (!works.has(roomId)) {
      const planner = plannerFor(work, roomId, geoms);
      if (planner) keepClearOfExisting(planner);
      works.set(roomId, planner ? { planner, seed: new RoomSeed(work, planner.room), placer: new Placer(planner), fresh: false, layout: { mounted, styling } } : null);
    }
    return works.get(roomId) ?? null;
  };

  // Which sections each room will take, before anything is placed: a living room in a home
  // without a dining room is laid out with the dining section's pieces too.
  const noDiningRoom = !rooms0.some((r) => r.type === 'dining');
  const early = matchSections(work, pkg, roles, (id) => noDiningRoom && work.rooms[id]?.type === 'living');
  const sectionsOf = (matches: PackageSection[], roomId: Id) => matches.filter((m) => m.roomIds.includes(roomId)).map((m) => pkg.rooms[m.index]!);

  // 1. The main pieces of every empty room in scope, with the package's choices first.
  if (!lineMode) {
    for (const room of rooms0) {
      if (!scope.has(room.id) || furnished.has(room.id)) continue;
      const w = workFor(room.id);
      if (!w) continue;
      const own = sectionsOf(early, room.id);
      w.fresh = true;
      w.layout = { mounted, styling, prefer: preferencesFor(own), curtained: !hasBlinds(own) };
      layoutRoom(w.planner, w.seed, w.layout);
      w.placer.reset();
    }
  }

  // 2. Every line of every matched section, in the rooms in scope.
  const hasTable = (id: Id) => {
    const w = works.get(id);
    if (w) return w.planner.placed.some((q) => q.entry.id.startsWith('table.dining'));
    return Object.values(work.items).some((i) => i.roomId === id && i.catalogId.startsWith('table.dining'));
  };
  const sections = matchSections(work, pkg, roles, hasTable);
  const takenFaces = new Set<string>();
  for (const match of sections) {
    const section = pkg.rooms[match.index]!;
    for (const roomId of match.roomIds) {
      if (!scope.has(roomId)) continue;
      const w = workFor(roomId);
      if (!w) {
        for (const line of section.items) if (wanted(roomId, line.key)) reasons.set(lineKey(match.index, roomId, line.key), 'The room has no usable floor');
        continue;
      }
      const room = work.rooms[roomId]!;
      const combined = section.room.kind === 'type' && section.room.type === 'dining' && room.type === 'living';
      const kind = section.room.kind === 'bedroom' ? 'bedroom' : section.room.type === 'living' || section.room.type === 'dining' ? section.room.type : 'other';
      const own = sectionsOf(sections, roomId);
      const keep = new Set(own.flatMap((x) => x.items.flatMap((l) => l.catalogIds)));
      const prefer = preferencesFor(own);
      section.items.forEach((line, i) => {
        if (!wanted(roomId, line.key)) return;
        const out = guaranteeLine({
          placer: w.placer,
          line,
          sectionKind: kind,
          earlier: section.items.slice(0, i),
          combined,
          // Balconies off the room; for a dining room without one, those off the living room.
          balconies: () =>
            overflowBalconies(work, roomId)
              .map((id) => workFor(id))
              .filter((b): b is RoomWork => !!b)
              .sort((a, b) => b.planner.area - a.planner.area)
              .map((b) => b.placer),
          replace: lineMode,
          keep,
          prefer,
          across: (run) => {
            const mid = vec.add(vec.add(run.a, vec.scale(run.dir, run.len / 2)), vec.scale(run.normal, -400));
            const g = geoms.find((x) => x.roomId && x.roomId !== roomId && vec.pointInPolygon(mid, x.polygon));
            return g?.roomId ? work.rooms[g.roomId]?.type : undefined;
          },
          removed: remove,
        });
        if (out.reason) reasons.set(lineKey(match.index, roomId, line.key), out.reason);
      });
      for (const surface of section.surfaces ?? []) {
        if (!wanted(roomId, surface.key)) continue;
        const reason = applySurface(work, w.planner, room, surface, kind, combined, rooms, walls, takenFaces);
        if (reason) reasons.set(lineKey(match.index, roomId, surface.key), reason);
      }
    }
  }

  // 3. Styling around everything for rooms laid out from empty; the scheme's finishes for the rest.
  for (const w of works.values()) {
    if (!w) continue;
    if (w.fresh) finishRoom(w.planner, w.seed, w.layout);
    else if (w.planner.placed.some((q) => !q.existing) && styling !== 'none') applyScheme(w.planner, homeScheme(w.seed), w.seed);
  }

  const items: Omit<Item, 'id'>[] = [];
  for (const w of works.values()) if (w) items.push(...w.planner.result());

  // The checklist of the result, with the reasons for what is short.
  const result: Level = structuredClone(work);
  for (const id of remove) delete result.items[id];
  items.forEach((item, i) => {
    const id = `package-${i}`;
    result.items[id] = { ...item, id } as Item;
  });
  for (const [id, patch] of Object.entries(rooms)) Object.assign(result.rooms[id]!, patch);
  for (const [id, patch] of Object.entries(walls)) Object.assign(result.walls[id]!, patch);
  const resultGeoms: RoomGeom[] = deriveRooms(result);
  const ctx = { level: result, geoms: resultGeoms, planners: new Map<Id, Planner | null>() };
  const report = buildCheck(ctx, pkg, matchSections(result, pkg, bedroomRoles(result, resultGeoms), (id) => Object.values(result.items).some((i) => i.roomId === id && i.catalogId.startsWith('table.dining'))));
  for (const line of report.lines) {
    const why = reasons.get(lineKey(line.section, line.roomId, line.key));
    if (!why || line.status === 'placed' || line.status === 'included') continue;
    line.reason = why;
    if (line.status === 'missing') line.status = 'noSpace';
  }
  return { items, remove, rooms, walls, report };
}

/** Standing room in front of pieces already in a room, as the template keeps it for its own. */
const FRONT: [RegExp, number][] = [
  [/^bed\./, 550],
  [/^wardrobe\./, 600],
  [/^desk/, 600],
  [/^(dresser|dressing\.)/, 500],
  [/^sofa\./, 450],
  [/^(kitchen\.(base|counter|sink)|fridge\.)/, 800],
  [/^(bookcase|shoe\.|prayer\.|basin\.|sideboard)/, 450],
];

function keepClearOfExisting(p: Planner): void {
  for (const q of p.placed) {
    if (!q.existing || q.zMin > 0) continue;
    const clear = FRONT.find(([re]) => re.test(q.entry.id))?.[1];
    if (!clear) continue;
    const c = p.offset(q.pose, 0, -(q.entry.dims.d / 2 + clear / 2), q.pose.rot);
    q.zone = { rect: rectCorners(c.x, c.y, q.entry.dims.w, clear, q.pose.rot), zMin: 0, zMax: 2000, kind: 'clearance' };
    p.zones.push(q.zone);
  }
}

/* ---------------------------------------------------------------- surfaces */

const faceKey = (f: { wallId: Id; side: string }) => `${f.wallId}:${f.side}`;

/** Gives a room or a wall face a package finish. Returns a reason when it could not. */
function applySurface(
  level: Level,
  p: Planner,
  room: Room,
  surface: PackageSurface,
  kind: 'living' | 'dining' | 'bedroom' | 'other',
  combined: boolean,
  rooms: Record<Id, RoomPatch>,
  walls: Record<Id, WallPatch>,
  taken: Set<string>,
): string | undefined {
  const patchRoom = (patch: RoomPatch) => {
    rooms[room.id] = { ...rooms[room.id], ...patch };
  };
  if (surface.target === 'walls') {
    if (room.wallMaterial !== surface.finish) patchRoom({ wallMaterial: surface.finish });
    return undefined;
  }
  if (surface.target === 'floor') {
    if (room.floorMaterial !== surface.finish) patchRoom({ floorMaterial: surface.finish });
    return undefined;
  }
  if (surface.target === 'ceiling') {
    if (room.ceilingMaterial !== surface.finish) patchRoom({ ceilingMaterial: surface.finish });
    return undefined;
  }
  const all = roomFaces(p);
  const current = (f: RoomFace) => {
    const patch = walls[f.wallId];
    const pending = f.side === 'left' ? patch?.finishLeft : patch?.finishRight;
    return pending ?? faceFinish(level, f);
  };
  const already = all.filter((f) => current(f) === surface.finish);
  if (already.length) {
    for (const f of already) taken.add(faceKey(f));
    return undefined;
  }
  const faces = featureFaces(p, all, kind, combined, taken);
  if (!faces.length) return 'No solid wall free for it';
  for (const f of faces) {
    taken.add(faceKey(f));
    walls[f.wallId] = { ...walls[f.wallId], ...(f.side === 'left' ? { finishLeft: surface.finish } : { finishRight: surface.finish }) };
  }
  return undefined;
}

/**
 * The feature wall: behind the room's main piece (the bed's headboard, the TV unit, the
 * sofa), otherwise the longest wall without windows; in a dining area inside a living
 * room, the window-free wall nearest the table that is not already a feature.
 */
function featureFaces(p: Planner, all: RoomFace[], kind: 'living' | 'dining' | 'bedroom' | 'other', combined: boolean, taken: Set<string>): RoomFace[] {
  const free = all.filter((f) => !taken.has(faceKey(f)));
  const mains = kind === 'bedroom' ? [/^bed\./] : kind === 'living' ? [/^tv\.unit/, /^sofa\./] : [];
  for (const re of mains) {
    const main = p.placed.find((q) => re.test(q.entry.id));
    const at = main && runBehind(p, main);
    if (!main || !at || at.run.kind !== 'wall') continue;
    const lo = at.t - main.entry.dims.w / 2;
    const hi = at.t + main.entry.dims.w / 2;
    const faces = free.filter((f) => f.run === at.run && f.s0 < hi - 1 && f.s1 > lo + 1);
    if (faces.length) return faces;
  }
  const table = combined ? p.placed.find((q) => q.entry.id.startsWith('table.dining')) : undefined;
  const runs = [...new Set(free.map((f) => f.run))].filter((r) => !r.openings.some((o) => o.kind === 'window'));
  const mid = (r: (typeof runs)[number]) => vec.add(r.a, vec.scale(r.dir, r.len / 2));
  const score = (r: (typeof runs)[number]) =>
    (table ? -vec.dist(mid(r), table.pose) : r.len) - (r.openings.length ? 800 : 0) - (r.len < 1500 ? 5000 : 0);
  runs.sort((a, b) => score(b) - score(a) || a.index - b.index);
  const best = runs[0];
  return best ? free.filter((f) => f.run === best) : [];
}
