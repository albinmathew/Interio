/**
 * The checklist of a furnishing package against a home as it stands: which rooms each
 * section applies to, and per line what is there. Pure; never mutates the level.
 */
import {
  deriveRooms,
  roomGraph,
  vec,
  type FurnishingPackage,
  type Id,
  type Level,
  type PackageItem,
  type PackageLineStatus,
  type PackageSurface,
  type Pt,
  type Room,
  type RoomGeom,
} from '@interio/core';
import { plannerFor } from '../autofurnish';
import type { Planner, Run, RunOpening } from '../autofurnish/planner';
import { noWindowReason } from './place';
import { bedroomRoles, ROLE_LABELS } from './roles';

export interface PackageLine {
  /** Index of the section in the package. */
  section: number;
  /** Section title, e.g. "Master bedroom". */
  title: string;
  /** The room the line is checked in; absent when no room matches the section. */
  roomId?: Id;
  roomName?: string;
  kind: 'item' | 'surface' | 'spec';
  key: string;
  /** As written in the package. */
  label: string;
  note?: string;
  status: PackageLineStatus;
  /** Pieces (or windows) needed and found. */
  need: number;
  have: number;
  /** Items in the room that satisfy the line. */
  itemIds: Id[];
  /** Why the line is not met, when known. */
  reason?: string;
}

export interface PackageSection {
  index: number;
  title: string;
  roomIds: Id[];
  /** Set when no room matches. */
  reason?: string;
}

export interface PackageCheck {
  packageId: string;
  packageName: string;
  sections: PackageSection[];
  lines: PackageLine[];
  /** Pieces placed and needed over every item line. */
  placed: number;
  needed: number;
}

/** Stable key of a line in a room, for UI state and reasons. */
export const lineKey = (section: number, roomId: string | undefined, key: string): string => `${section}:${roomId ?? '-'}:${key}`;

/* ---------------------------------------------------------------- windows */

/** Glazing that takes a blind or curtains: windows on a full wall (not high ventilators) and sliding doors. */
export interface WindowSpot {
  run: Run;
  opening: RunOpening;
  /** Centre along the run. */
  t: number;
  width: number;
}

export function treatableWindows(p: Planner): WindowSpot[] {
  const out: WindowSpot[] = [];
  for (const run of p.runs) {
    if (run.kind !== 'wall') continue;
    for (const o of run.openings) {
      if (o.kind !== 'sliding' && (o.kind !== 'window' || o.sill >= 1700)) continue;
      out.push({ run, opening: o, t: (o.s0 + o.s1) / 2, width: o.s1 - o.s0 });
    }
  }
  return out;
}

/** A line hung on every window (blinds, curtains) rather than placed a set number of times. */
export const isWindowLine = (line: PackageItem): boolean => line.catalogIds.every((id) => /^(blind|curtain)\./.test(id));

/* ---------------------------------------------------------------- wall faces */

export interface RoomFace {
  wallId: Id;
  side: 'left' | 'right';
  run: Run;
  s0: number;
  s1: number;
}

/** Which face of a wall looks along `normal` (into a room). */
export function sideFacing(level: Level, wallId: Id, normal: { x: number; y: number }): 'left' | 'right' {
  const wall = level.walls[wallId];
  const a = wall && level.vertices[wall.a];
  const b = wall && level.vertices[wall.b];
  if (!a || !b) return 'left';
  return vec.dot(vec.perp(vec.sub(b, a)), normal) >= 0 ? 'left' : 'right';
}

/** The faces of real walls (not dividers, railings or parapets) that the room sees. */
export function roomFaces(p: Planner): RoomFace[] {
  const out: RoomFace[] = [];
  for (const run of p.runs) {
    if (run.kind !== 'wall') continue;
    for (const e of run.edges) {
      const wall = e.wallId ? p.level.walls[e.wallId] : undefined;
      if (!wall || wall.kind !== 'wall') continue;
      out.push({ wallId: wall.id, side: sideFacing(p.level, wall.id, run.normal), run, s0: e.s0, s1: e.s1 });
    }
  }
  return out;
}

export function faceFinish(level: Level, face: { wallId: Id; side: 'left' | 'right' }): string | undefined {
  const wall = level.walls[face.wallId];
  return face.side === 'left' ? wall?.finishLeft : wall?.finishRight;
}

/** Where a room's `adjacentBalcony` overflow goes: its own balconies, else those off the living room. */
export function overflowBalconies(level: Level, roomId: Id): Id[] {
  const own = adjacentBalconies(level, roomId);
  if (own.length) return own;
  return Object.values(level.rooms)
    .filter((r) => r.type === 'living' && r.id !== roomId)
    .flatMap((r) => adjacentBalconies(level, r.id));
}

/** Room types an `adjacentRoom` overflow may use through any opening: the shared parts of the home. */
const SHARED = new Set<string>(['living', 'dining', 'corridor', 'foyer']);
/** Room types it never uses, even when open to the room. */
const PRIVATE = new Set<string>(['bedroom', 'bathroom', 'kitchen', 'utility', 'balcony', 'storage']);

/**
 * Where a room's `adjacentRoom` overflow goes: the living, dining or passage spaces it opens
 * onto (and any other non-private space it is open to, such as a work nook), then the shared
 * spaces those open onto, nearest first. `at` is the point to stay near: the room's entrance
 * door when it has one (a foyer), else the way in from the room.
 */
export function overflowRooms(level: Level, roomId: Id): { roomId: Id; at: Pt }[] {
  const graph = roomGraph(level);
  const entrance = graph.entrances.find((e) => e.roomId === roomId)?.door;
  const out = new Map<Id, Pt>();
  let frontier: Id[] = [roomId];
  for (let hop = 0; hop < 2 && frontier.length; hop++) {
    const next: Id[] = [];
    const found: { id: Id; at: Pt }[] = [];
    for (const from of frontier) {
      for (const e of graph.edges) {
        const other = e.a === from ? e.b : e.b === from ? e.a : null;
        const type = level.rooms[other ?? '']?.type ?? '';
        if (!other || other === roomId || out.has(other) || found.some((f) => f.id === other)) continue;
        if (!(SHARED.has(type) || (e.via === 'divider' && !PRIVATE.has(type)))) continue;
        found.push({ id: other, at: entrance ?? e.door });
        next.push(other);
      }
    }
    for (const f of found) out.set(f.id, f.at);
    frontier = next;
  }
  return [...out].map(([id, at]) => ({ roomId: id, at }));
}

/* ---------------------------------------------------------------- matching */

const DINING_NAME = /dining/i;

/** Balconies that open off a room (through a door, a sliding door or a passage). */
export function adjacentBalconies(level: Level, roomId: Id): Id[] {
  const out = new Set<Id>();
  for (const e of roomGraph(level).edges) {
    const other = e.a === roomId ? e.b : e.b === roomId ? e.a : null;
    if (other && level.rooms[other]?.type === 'balcony') out.add(other);
  }
  return [...out];
}

/**
 * The rooms each section applies to. A section for a room type takes every room of that
 * type; a bedroom role takes the bedrooms with that role. A home without a dining room
 * has its dining section applied to the living room that holds the dining table (or is
 * named for dining).
 */
export function matchSections(
  level: Level,
  pkg: FurnishingPackage,
  roles: Record<string, string>,
  hasDiningTable: (roomId: Id) => boolean,
): PackageSection[] {
  const rooms = Object.values(level.rooms);
  return pkg.rooms.map((section, index) => {
    let matched: Room[] = [];
    let reason: string | undefined;
    if (section.room.kind === 'bedroom') {
      const role = section.room.role;
      matched = rooms.filter((r) => r.type === 'bedroom' && roles[r.id] === role);
      if (matched.length === 0) {
        const n = rooms.filter((r) => r.type === 'bedroom').length;
        reason = n === 0 ? 'This plan has no bedrooms' : `No bedroom is set as ${ROLE_LABELS[role].toLowerCase()} (${n === 1 ? '1 bedroom' : `${n} bedrooms`} in this plan)`;
      }
    } else {
      const type = section.room.type;
      matched = rooms.filter((r) => r.type === type);
      if (matched.length === 0 && type === 'dining') {
        matched = rooms.filter((r) => r.type === 'living' && (hasDiningTable(r.id) || DINING_NAME.test(r.name)));
        if (matched.length === 0) reason = 'This plan has no dining room, and no living room with a dining area';
      } else if (matched.length === 0) {
        reason = `This plan has no ${section.title.toLowerCase()}`;
      }
    }
    return { index, title: section.title, roomIds: matched.map((r) => r.id), ...(reason ? { reason } : {}) };
  });
}

/* ---------------------------------------------------------------- checking */

function statusOf(have: number, need: number): PackageLineStatus {
  return have >= need ? 'placed' : have > 0 ? 'partial' : 'missing';
}

export interface CheckContext {
  level: Level;
  geoms: RoomGeom[];
  planners: Map<Id, Planner | null>;
}

export function plannerIn(ctx: CheckContext, roomId: Id): Planner | null {
  if (!ctx.planners.has(roomId)) ctx.planners.set(roomId, plannerFor(ctx.level, roomId, ctx.geoms));
  return ctx.planners.get(roomId) ?? null;
}

function itemLine(ctx: CheckContext, line: PackageItem, roomId: Id): Pick<PackageLine, 'status' | 'need' | 'have' | 'itemIds' | 'reason'> {
  const level = ctx.level;
  const ids = new Set([...line.catalogIds, ...Object.keys(line.alsoCounts ?? {})]);
  const inRoom = (rid: Id) => Object.values(level.items).filter((i) => i.roomId === rid && ids.has(i.catalogId));
  // A piece the line also counts may stand for more than one (a bedside unit between twin beds).
  const weight = (i: { catalogId: string }) => line.alsoCounts?.[i.catalogId] ?? 0;
  let found = inRoom(roomId);
  if (line.overflow === 'adjacentBalcony') found = [...found, ...overflowBalconies(level, roomId).flatMap(inRoom)];
  if (line.overflow === 'adjacentRoom') found = [...found, ...overflowRooms(level, roomId).flatMap((r) => inRoom(r.roomId))];
  let need = line.count ?? 1;
  if (isWindowLine(line)) {
    const p = plannerIn(ctx, roomId);
    need = p ? treatableWindows(p).length : 0;
    if (need === 0) return { status: 'noSpace', need: 0, have: found.length, itemIds: found.map((i) => i.id), reason: noWindowReason() };
  }
  // The line's own pieces count as they are; the others only up to what is still needed.
  const own = found.filter((i) => line.catalogIds.includes(i.catalogId)).length;
  const also = found.reduce((n, i) => n + (line.catalogIds.includes(i.catalogId) ? 0 : weight(i)), 0);
  const have = own + Math.min(also, Math.max(0, need - own));
  return { status: statusOf(have, need), need, have, itemIds: found.map((i) => i.id) };
}

function surfaceLine(ctx: CheckContext, surface: PackageSurface, room: Room): Pick<PackageLine, 'status' | 'need' | 'have' | 'itemIds'> {
  let done = false;
  if (surface.target === 'walls') done = room.wallMaterial === surface.finish;
  else if (surface.target === 'floor') done = room.floorMaterial === surface.finish;
  else if (surface.target === 'ceiling') done = room.ceilingMaterial === surface.finish;
  else {
    const p = plannerIn(ctx, room.id);
    done = !!p && roomFaces(p).some((f) => faceFinish(ctx.level, f) === surface.finish);
  }
  return { status: done ? 'placed' : 'missing', need: 1, have: done ? 1 : 0, itemIds: [] };
}

/**
 * The package's checklist for the home as it stands. `noSpace` appears only where the
 * plan itself rules a line out (no window for a blind); reasons for pieces that did not
 * fit come from `applyPackage`.
 */
export function checkPackage(level: Level, pkg: FurnishingPackage, geoms: RoomGeom[] = deriveRooms(level)): PackageCheck {
  const ctx: CheckContext = { level, geoms, planners: new Map() };
  const roles = bedroomRoles(level, geoms);
  const hasTable = (id: Id) => Object.values(level.items).some((i) => i.roomId === id && i.catalogId.startsWith('table.dining'));
  const sections = matchSections(level, pkg, roles, hasTable);
  return buildCheck(ctx, pkg, sections);
}

export function buildCheck(ctx: CheckContext, pkg: FurnishingPackage, sections: PackageSection[]): PackageCheck {
  const lines: PackageLine[] = [];
  for (const s of sections) {
    const section = pkg.rooms[s.index]!;
    const targets: (Room | undefined)[] = s.roomIds.length ? s.roomIds.map((id) => ctx.level.rooms[id]) : [undefined];
    for (const room of targets) {
      const base = { section: s.index, title: s.title, ...(room ? { roomId: room.id, roomName: room.name } : {}) };
      for (const item of section.items) {
        const row = room
          ? itemLine(ctx, item, room.id)
          : { status: 'missing' as const, need: item.count ?? 1, have: 0, itemIds: [], reason: s.reason };
        lines.push({ ...base, kind: 'item', key: item.key, label: item.label, ...(item.note ? { note: item.note } : {}), ...row });
      }
      for (const surface of section.surfaces ?? []) {
        const row = room ? surfaceLine(ctx, surface, room) : { status: 'missing' as const, need: 1, have: 0, itemIds: [], reason: s.reason };
        lines.push({ ...base, kind: 'surface', key: surface.key, label: surface.label, ...(surface.note ? { note: surface.note } : {}), ...row });
      }
      for (const spec of section.specs ?? []) {
        lines.push({ ...base, kind: 'spec', key: spec.key, label: spec.label, ...(spec.note ? { note: spec.note } : {}), status: 'included', need: 0, have: 0, itemIds: [] });
      }
    }
  }
  let placed = 0;
  let needed = 0;
  for (const l of lines) {
    if (l.kind !== 'item') continue;
    needed += l.need;
    placed += Math.min(l.have, l.need);
  }
  return { packageId: pkg.id, packageName: pkg.name, sections, lines, placed, needed };
}
