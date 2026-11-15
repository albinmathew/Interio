/**
 * Guarantees for package lines: each places the missing pieces of one line in a room the
 * template has already laid out (or that was furnished before), by the same rules as the
 * layout engine (inside the clear floor, nothing overlapping, doors and windows clear),
 * and keeps the room walkable. When a piece cannot go in, the reason is returned.
 */
import { vec, type CatalogEntry, type Id, type PackageItem, type Pt } from '@interio/core';
import { getEntry } from '../catalog';
import { convexOverlap, rectCorners, rotationFacing } from '../autofurnish/geometry';
import { gridPoses, longestRunAngle } from '../autofurnish/placeEntry';
import { APPROACH, WALL_GAP, type PlaceOptions, type Placed, type Planner, type Pose, type Run, type WallCandidate, type Zone } from '../autofurnish/planner';
import { curtainPlans } from '../autofurnish/styling';
import { deskSet, diningSet, slotOf, type Prefer, type PreferSlot } from '../autofurnish/templates';
import { stillWalkable, walkState, type WalkState } from '../autofurnish/walk';
import { treatableWindows } from './check';

const E = (id: string): CatalogEntry | undefined => getEntry(id);
/** Pieces lower than this are in the way when walking. */
const KNEE = 900;
const TRIES = 20;

type WallOpts = PlaceOptions & { z?: number; step?: number; runs?: Run[]; gap?: number };

/** A planner with the walking space tracked, so guaranteed pieces never cut a room in two. */
export class Placer {
  private walk: WalkState | null = null;

  constructor(readonly p: Planner) {}

  private walkNow(): WalkState {
    this.walk ??= walkState(this.p);
    return this.walk;
  }

  /** Places the entry at the pose when it is valid and leaves the room walkable. */
  tryPose(entry: CatalogEntry, pose: Pose, opts: PlaceOptions = {}): Placed | null {
    if (!this.p.can(entry, pose, opts)) return null;
    return this.commit(entry, pose, opts);
  }

  /** Places without the validity check (the caller checked); still keeps the room walkable. */
  commit(entry: CatalogEntry, pose: Pose, opts: PlaceOptions = {}): Placed | null {
    const low = !opts.flat && pose.z < KNEE && entry.anchor !== 'ceiling';
    const before = low ? this.walkNow() : null;
    const mark = this.p.mark();
    const placed = this.p.place(entry, pose, opts);
    if (before) {
      const after = walkState(this.p);
      if (!stillWalkable(before, after, entry.dims.w, entry.dims.d)) {
        this.p.rollback(mark);
        return null;
      }
      this.walk = after;
    }
    return placed;
  }

  /** The best wall poses by score, tried in turn. */
  wall(entry: CatalogEntry | undefined, score: (c: WallCandidate) => number, opts: WallOpts = {}, tries = TRIES): Placed | null {
    if (!entry) return null;
    const z = opts.z ?? (entry.anchor === 'wall' ? (entry.mountHeight ?? 1200) : 0);
    const ranked = this.p
      .wallCandidates(entry, { ...opts, z })
      .map((c, i) => ({ c, s: score(c), i }))
      .filter((r) => Number.isFinite(r.s))
      .sort((a, b) => b.s - a.s || a.i - b.i);
    for (const { c } of ranked.slice(0, tries)) {
      const placed = this.commit(entry, c.pose, opts);
      if (placed) return placed;
    }
    return null;
  }

  /** Open-floor poses nearest to a point. */
  floor(entry: CatalogEntry | undefined, near: Pt, rotations: number[], opts: PlaceOptions = {}, tries = TRIES): Placed | null {
    if (!entry) return null;
    let n = 0;
    for (const pose of gridPoses(this.p, near, rotations)) {
      if (!this.p.can(entry, pose, opts)) continue;
      const placed = this.commit(entry, pose, opts);
      if (placed) return placed;
      if (++n >= tries) break;
    }
    return null;
  }

  /** Forgets the walking state after pieces were taken out. */
  reset(): void {
    this.walk = null;
  }
}

/* ----------------------------------------------------------------- helpers */

export const countOf = (p: Planner, ids: readonly string[]): number => p.placed.filter((q) => ids.includes(q.entry.id)).length;
const find = (p: Planner, re: RegExp): Placed[] => p.placed.filter((q) => re.test(q.entry.id));
const centre = (q: Placed): Pt => ({ x: q.pose.x, y: q.pose.y });

/** The wall run behind a piece standing with its back to a wall, and where along it. */
export function runBehind(p: Planner, item: Placed, reach = 150): { run: Run; t: number } | null {
  const facing = p.facing(item.pose);
  for (const run of p.runs) {
    if (vec.dot(run.normal, facing) < 0.999) continue;
    const rel = vec.sub(centre(item), run.a);
    const dist = vec.dot(rel, run.normal);
    const t = vec.dot(rel, run.dir);
    if (dist < 0 || dist > item.entry.dims.d / 2 + reach || t < 0 || t > run.len) continue;
    return { run, t };
  }
  return null;
}

/** Calls `fn` with some of the planner's zones set aside, then puts them back. */
function without<T>(p: Planner, drop: (z: Zone) => boolean, fn: () => T): T {
  const saved = [...p.zones];
  const keep = saved.filter((z) => !drop(z));
  p.zones.length = 0;
  p.zones.push(...keep);
  try {
    return fn();
  } finally {
    // Zones added meanwhile (clearances of what was placed) are kept.
    const added = p.zones.filter((z) => !keep.includes(z));
    p.zones.length = 0;
    p.zones.push(...saved, ...added);
  }
}

const mm = (n: number) => `${(n / 1000).toFixed(1)} m`;

function noRoomReason(p: Planner, entry: CatalogEntry, what = 'No free wall with room in front of it'): string {
  if (entry.dims.h > p.level.ceilingHeight) return `Taller than the ceiling (${entry.dims.h} mm, ceiling ${p.level.ceilingHeight} mm)`;
  if (Math.max(entry.dims.w, entry.dims.d) > Math.max(...p.runs.map((r) => r.len))) return `Larger than the room (${mm(entry.dims.w)} wide)`;
  return what;
}

/* --------------------------------------------------------------- lines */

export interface LineContext {
  placer: Placer;
  line: PackageItem;
  /** What the section is for: shapes some placements. */
  sectionKind: 'living' | 'dining' | 'bedroom' | 'other';
  /** Lines before this one in the same section (a line whose ids they cover follows them). */
  earlier: PackageItem[];
  /** The section is a dining area inside a living room. */
  combined: boolean;
  /** Planners of balconies that open off the room (for `overflow`). */
  balconies: () => Placer[];
  /** May a piece of the same kind that is not the package's (a queen bed for a king) be swapped? */
  replace: boolean;
  /** Existing items taken out by a swap. */
  removed: Id[];
  /** Type of the room on the other side of a run (a divider), if any. */
  across: (run: Run) => string | undefined;
  /** Catalog ids the room's package lines ask for: never given up for another line. */
  keep: ReadonlySet<string>;
  /** The package's pieces for the room (dining chairs and bench for a dining set). */
  prefer: Prefer;
}

export interface LineOutcome {
  reason?: string;
}

/** Families with one piece per room: the package's choice replaces the template's. */
const SINGLE: ReadonlySet<PreferSlot> = new Set<PreferSlot>(['bed', 'wardrobe', 'sofa', 'tvUnit', 'coffeeTable', 'diningTable']);
const FAMILY: Record<string, RegExp> = {
  bed: /^bed\./,
  wardrobe: /^wardrobe\./,
  sofa: /^sofa\./,
  tvUnit: /^tv\.unit/,
  coffeeTable: /^table\.coffee/,
  diningTable: /^table\.dining/,
};

function setFinishes(q: Placed, line: PackageItem): void {
  if (!line.finishes) return;
  q.fixed = { ...line.finishes };
  q.finishes = { ...q.finishes, ...line.finishes };
}

/**
 * Pieces the template adds of its own accord (an armchair, a floor lamp, a plant, a
 * sideboard): a package line that does not fit takes their place.
 */
const OPTIONAL = /^(armchair|lamp\.floor|plant\.|table\.side|sideboard|dresser|bench\.(low|cushion)|ottoman|tv\.stand|ac\.split|bookcase|shelf\.|table\.console|mirror\.round)/;

const snapshot = (p: Planner) => ({ placed: [...p.placed], zones: [...p.zones] });
function restore(p: Planner, s: ReturnType<typeof snapshot>): void {
  p.placed.length = 0;
  p.placed.push(...s.placed);
  p.zones.length = 0;
  p.zones.push(...s.zones);
}

function putBack(p: Planner, pieces: Placed[]): void {
  for (const q of pieces) {
    p.placed.push(q);
    if (q.zone) p.zones.push(q.zone);
  }
}

/** Places what is missing of one line, giving it the space of the template's optional pieces when it needs it. */
export function guaranteeLine(ctx: LineContext): LineOutcome {
  const p = ctx.placer.p;
  const ids = ctx.line.catalogIds;
  const snap = snapshot(p);
  const removed = ctx.removed.length;
  const first = attempt(ctx);
  if (!first.reason || ctx.line.overflow) return first;
  const extras = p.placed.filter((q) => !q.existing && OPTIONAL.test(q.entry.id) && !ctx.keep.has(q.entry.id));
  if (extras.length === 0) return first;
  const got = countOf(p, ids);
  // Start again from before the attempt, without the optional pieces.
  restore(p, snap);
  ctx.removed.length = removed;
  for (const q of extras) p.remove(q);
  const bare = snapshot(p);
  ctx.placer.reset();
  const second = attempt(ctx);
  if (second.reason && countOf(p, ids) <= got) {
    // No better: put everything back as the first attempt had it.
    restore(p, bare);
    ctx.removed.length = removed;
    putBack(p, extras);
    ctx.placer.reset();
    return attempt(ctx);
  }
  // The optional pieces come back where they still fit.
  for (const q of extras) {
    if (q.flat ? p.can(q.entry, q.pose, { flat: true }) : p.can(q.entry, q.pose, { group: q.group })) putBack(p, [q]);
  }
  ctx.placer.reset();
  return second;
}

function attempt(ctx: LineContext): LineOutcome {
  const { line } = ctx;
  const p = ctx.placer.p;
  const id0 = line.catalogIds[0]!;
  // A line that only lists pieces an earlier line already asks for (cushions that come with the sofa) follows that line.
  const parent = ctx.earlier.find((l) => line.catalogIds.every((id) => l.catalogIds.includes(id)));
  if (parent) {
    if (countOf(p, line.catalogIds) >= (line.count ?? 1)) return {};
    return { reason: `Comes with the ${parent.label.toLowerCase()}, which is not in the room` };
  }
  if (id0.startsWith('blind.')) return windows(ctx, 'blind');
  if (id0.startsWith('curtain.')) return windows(ctx, 'curtain');
  if (id0.startsWith('partition.')) return partition(ctx);
  if (line.overflow === 'adjacentBalcony') return overflow(ctx);
  const need = line.count ?? 1;
  let reason: string | undefined;
  while (countOf(p, line.catalogIds) < need) {
    const out = placeOne(ctx);
    if ('reason' in out) {
      reason = out.reason;
      break;
    }
    setFinishes(out.placed, line);
  }
  return reason ? { reason } : {};
}

type One = { placed: Placed } | { reason: string };

function placeOne(ctx: LineContext): One {
  const { line } = ctx;
  const p = ctx.placer.p;
  const slot = slotOf(line.catalogIds[0]!);
  if (slot && SINGLE.has(slot)) {
    const substitute = p.placed.find((q) => FAMILY[slot]!.test(q.entry.id) && !line.catalogIds.includes(q.entry.id));
    if (substitute && slot === 'diningTable') return swapDining(ctx, substitute);
    if (substitute) return swap(ctx, substitute);
  }
  if ((slot === 'diningChair' || slot === 'bench') && !find(p, /^table\.dining/)[0]) return { reason: 'No dining table to seat them at' };
  let last: string | undefined;
  for (const id of line.catalogIds) {
    const entry = E(id);
    if (!entry) continue;
    const placed = placeEntryFor(ctx, entry, slot);
    if (placed) return { placed };
    const diningSide = entry.id === 'basin.vanity' && find(p, /^sofa\./).length > 0 && find(p, /^table\.dining/).length > 0;
    last ??= noRoomReason(p, entry, diningSide ? 'No free wall on the dining side' : undefined);
  }
  return { reason: last ?? 'Not in the catalog' };
}

/** The package's table with its chairs (and bench), as far from the seating group as the room allows. */
function diningFor(ctx: LineContext): Placed | null {
  const p = ctx.placer.p;
  const sofa = find(p, /^sofa\./)[0];
  const ids = ctx.line.catalogIds;
  const table = diningSet(p, { mounted: false, styled: true, prefer: { ...ctx.prefer, diningTable: ids[0] } }, ids, (c) =>
    (sofa ? Math.min(vec.dist(c, centre(sofa)), 6000) : -vec.dist(c, p.centroid)) + Math.min(p.wallDistance(c), 1500) * 0.3,
  );
  ctx.placer.reset();
  return table;
}

/** Swaps a dining set for the package's: the table and the seats round it go, and the set is laid out again. */
function swapDining(ctx: LineContext, substitute: Placed): One {
  const p = ctx.placer.p;
  const name = substitute.entry.name.toLowerCase();
  if (substitute.existing && !ctx.replace) return { reason: `A ${name} stands here instead` };
  const set = p.placed.filter((q) => q === substitute || (substitute.group !== undefined && q.group === substitute.group && /^(chair\.dining|bench\.dining)/.test(q.entry.id)));
  if (set.some((q) => q.existing) && !ctx.replace) return { reason: `A ${name} stands here instead` };
  for (const q of set) p.remove(q);
  const mark = p.mark();
  const table = diningFor(ctx);
  if (table && ctx.line.catalogIds.includes(table.entry.id)) {
    for (const q of set) if (q.existing && q.itemId) ctx.removed.push(q.itemId);
    return { placed: table };
  }
  p.rollback(mark);
  putBack(p, set);
  ctx.placer.reset();
  return { reason: `Does not fit with its chairs where the ${name} stands; the ${name} was kept` };
}

/** Swaps a piece of the same kind for the package's, keeping its back where it was. */
function swap(ctx: LineContext, substitute: Placed): One {
  const p = ctx.placer.p;
  const name = substitute.entry.name.toLowerCase();
  if (substitute.existing && !ctx.replace) return { reason: `A ${name} stands here instead` };
  for (const id of ctx.line.catalogIds) {
    const entry = E(id);
    if (!entry || entry.anchor !== substitute.entry.anchor) continue;
    const pose = p.offset(substitute.pose, 0, (substitute.entry.dims.d - entry.dims.d) / 2, substitute.pose.rot, substitute.pose.z);
    const index = p.placed.indexOf(substitute);
    p.remove(substitute);
    const mark = p.mark();
    ctx.placer.reset();
    const placed = ctx.placer.tryPose(entry, pose, substitute.zone ? { clear: 550 } : {});
    if (placed) {
      if (substitute.existing && substitute.itemId) ctx.removed.push(substitute.itemId);
      return { placed };
    }
    p.rollback(mark);
    p.placed.splice(index, 0, substitute);
    if (substitute.zone) p.zones.push(substitute.zone);
    ctx.placer.reset();
  }
  // A wardrobe may stand on another wall: take the template's out and look again.
  if (substitute.entry.id.startsWith('wardrobe.') && (!substitute.existing || ctx.replace)) {
    const index = p.placed.indexOf(substitute);
    p.remove(substitute);
    const mark = p.mark();
    ctx.placer.reset();
    for (const id of ctx.line.catalogIds) {
      const entry = E(id);
      const placed = entry ? placeEntryFor(ctx, entry, 'wardrobe') : null;
      if (placed) {
        if (substitute.existing && substitute.itemId) ctx.removed.push(substitute.itemId);
        return { placed };
      }
    }
    p.rollback(mark);
    p.placed.splice(index, 0, substitute);
    if (substitute.zone) p.zones.push(substitute.zone);
    ctx.placer.reset();
  }
  const entry = E(ctx.line.catalogIds[0]!)!;
  const why = entry.dims.h > p.level.ceilingHeight ? noRoomReason(p, entry) : `Does not fit in place of the ${name}`;
  return { reason: substitute.existing ? why : `${why}; the ${name} was kept` };
}

function placeEntryFor(ctx: LineContext, entry: CatalogEntry, slot: PreferSlot | null): Placed | null {
  const placer = ctx.placer;
  const p = placer.p;
  const bed = find(p, /^bed\./)[0];
  const bedRun = bed ? runBehind(p, bed)?.run : undefined;
  const tv = find(p, /^tv\.unit/)[0];
  const tvRun = tv ? runBehind(p, tv)?.run : undefined;
  const sofa = find(p, /^sofa\./)[0];
  const table = find(p, /^table\.dining/)[0];
  const door = (c: WallCandidate, k = 0.3) => Math.min(c.doorDist, 2500) * k;

  switch (slot) {
    case 'bed':
      return placer.wall(entry, (c) => (c.underWindow ? -1200 : 0) + (c.run.openings.some((o) => o.kind !== 'window') ? -900 : 0) + door(c, 0.5) - c.centreOffset * 0.8, { clear: 550 });
    case 'nightstand': {
      if (bed) {
        const at = runBehind(p, bed);
        for (const side of [-1, 1]) {
          if (!at) break;
          const placed = placer.tryPose(entry, p.against(at.run, at.t + side * (bed.entry.dims.w / 2 + 40 + entry.dims.w / 2), entry), { group: bed.group });
          if (placed) return placed;
        }
      }
      return placer.wall(entry, (c) => -(bed ? vec.dist(c.pose, centre(bed)) : c.cornerDist), {});
    }
    case 'wardrobe': {
      const score = (c: WallCandidate) => -c.cornerDist * 1.5 + (c.run === bedRun ? -1500 : 0) + door(c, 0.1) - (c.underWindow ? 3000 : 0);
      return placer.wall(entry, score, { clear: 600 }) ?? placer.wall(entry, score, { clear: 450 });
    }
    case 'desk': {
      const before = p.placed.length;
      deskSet(p, bedRun ?? null, 'chair.office', entry.id);
      const placed = p.placed.slice(before).find((q) => q.entry.id === entry.id);
      if (placed) {
        placer.reset();
        return placed;
      }
      const score = (c: WallCandidate) => (c.underWindow ? 700 : 0) - c.cornerDist * 0.4 + (c.run === bedRun ? -400 : 0);
      return placer.wall(entry, score, { clear: 600 }) ?? placer.wall(entry, score, { clear: 350 });
    }
    case 'dresser': {
      const score = (c: WallCandidate) => -c.cornerDist + (c.run === bedRun ? -800 : 0) - (c.underWindow ? 3000 : 0) + door(c, 0.1);
      return placer.wall(entry, score, { clear: 600 }) ?? placer.wall(entry, score, { clear: 350 });
    }
    case 'tvUnit':
      return placer.wall(entry, (c) => -c.centreOffset * 0.3 - (c.underWindow ? 600 : 0) + (sofa ? -Math.abs(vec.dot(vec.sub(centre(sofa), c.pose), c.run.dir)) * 0.3 : 0), { clear: 900 });
    case 'sofa':
      return placer.wall(entry, (c) => (tvRun ? -Math.abs(vec.dot(c.run.normal, tvRun.normal) + 1) * 2000 : 0) - c.centreOffset * 0.2 + door(c), { clear: 800 });
    case 'coffeeTable': {
      if (sofa) {
        const pose = p.offset(sofa.pose, 0, -(sofa.entry.dims.d / 2 + 420 + entry.dims.d / 2));
        const placed = placer.tryPose(entry, pose, { group: sofa.group });
        if (placed) return placed;
      }
      return placer.floor(entry, sofa ? p.offset(sofa.pose, 0, -(sofa.entry.dims.d / 2 + 800)) : p.centroid, [sofa?.pose.rot ?? longestRunAngle(p)]);
    }
    case 'rug': {
      const target = find(p, /^table\.coffee/)[0] ?? sofa;
      if (!target) return placer.floor(entry, p.centroid, [longestRunAngle(p)], { flat: true });
      return placer.floor(entry, centre(target), [target.pose.rot, target.pose.rot + 90], { flat: true });
    }
    case 'diningTable': {
      const table = diningFor(ctx);
      if (table) return table;
      return placer.floor(entry, p.centroid, [longestRunAngle(p), longestRunAngle(p) + 90], {}, 30);
    }
    case 'diningChair':
    case 'bench':
      // Seats only make sense at the table.
      return table ? aroundTable(placer, table, entry, slot === 'bench') : null;
    default:
      break;
  }

  if (entry.id === 'basin.vanity' || entry.category === 'bathroom') {
    // The common wash: against a wall, tucked into a corner away from the doors and the seating, near the dining table.
    const seat = sofa ? centre(sofa) : null;
    const score = (c: WallCandidate) =>
        -c.cornerDist * 0.6 +
        door(c, 0.3) -
        (table ? vec.dist(c.pose, centre(table)) * 0.5 : 0) -
        // In a living room with a dining area: on the dining side only, never on the TV wall.
        (seat && table && (vec.dist(c.pose, seat) < vec.dist(c.pose, centre(table)) || c.run === tvRun) ? Infinity : 0) -
        (seat && vec.dist(c.pose, seat) < 2500 ? 2000 : 0) -
        (c.run === tvRun ? 3000 : 0) -
        (c.underWindow ? 300 : 0);
    return placer.wall(entry, score, { clear: 550 }) ?? placer.wall(entry, score, { clear: 400 });
  }
  if (entry.anchor === 'wall') {
    // Wall pieces (a clock, a mirror): on a long free wall, not over the screen or the bed, not across a window.
    return placer.wall(
      entry,
      (c) => -c.centreOffset * 0.4 + c.run.len * 0.2 - (c.run === tvRun ? 3000 : 0) - (c.run === bedRun ? 1500 : 0) - (c.underWindow ? 2000 : 0) + door(c, 0.1),
      { z: entry.mountHeight, step: 100 },
    );
  }
  if (entry.id === 'armchair') {
    // A reading chair: in a corner, by a window when there is one.
    const score = (c: WallCandidate) => -c.cornerDist + door(c) + (c.underWindow ? 300 : 0) + (c.run === bedRun ? -500 : 0);
    const placed = placer.wall(entry, score, { clear: 500, gap: 150 }) ?? placer.wall(entry, score, { clear: 250, gap: 60 });
    if (placed) return placed;
    // No wall free: in the open floor near a corner away from the doors, turned to the room.
    const corners = [...p.polygon].sort((a, b) => p.doorDistance(b) - p.doorDistance(a)).slice(0, 4);
    for (const corner of corners) {
      const towards = vec.sub(p.centroid, corner);
      const q = placer.floor(entry, vec.add(corner, vec.scale(vec.norm(towards), 700)), [rotationFacing(towards)], { clear: 300 }, 8);
      if (q) return q;
    }
    return null;
  }
  if (entry.anchor === 'floor' && entry.dims.h <= 30) return placer.floor(entry, p.centroid, [longestRunAngle(p)], { flat: true });
  // Tall storage and the rest: against a wall, out of the walkway, never in front of a window.
  const tall = entry.dims.h > 900;
  // Tall pieces keep clear of the dining chairs, which need room to pull out.
  const nearTable = (c: WallCandidate) => !!table && tall && vec.dist(c.pose, centre(table)) < table.entry.dims.w / 2 + 1500;
  const score = (c: WallCandidate) =>
    door(c, 0.4) - c.cornerDist * 0.25 - (c.underWindow && tall ? 3000 : 0) - (c.run === tvRun ? 1500 : 0) - (c.run === bedRun && tall ? 800 : 0) - (nearTable(c) ? 2000 : 0);
  return placer.wall(entry, score, { clear: 550 }) ?? placer.wall(entry, score, { clear: 350 });
}

/** Seats along the long sides of a dining table: a bench on the side with fewer chairs, chairs where they fit. */
function aroundTable(placer: Placer, table: Placed, entry: CatalogEntry, bench: boolean): Placed | null {
  const p = placer.p;
  const t = table.entry;
  const off = t.dims.d / 2 + 40 + entry.dims.d / 2;
  const seated = (side: number) => p.placed.filter((q) => /^(chair\.dining|bench\.dining)/.test(q.entry.id) && vec.dot(vec.sub(centre(q), centre(table)), p.facing(table.pose)) * -side > 0).length;
  const sides = [-1, 1].sort((a, b) => seated(a) - seated(b));
  for (const side of sides) {
    if (bench) {
      const placed = placer.tryPose(entry, p.offset(table.pose, 0, side * off, table.pose.rot + (side < 0 ? 180 : 0)), { group: table.group });
      if (placed) return placed;
      continue;
    }
    const perSide = Math.max(1, Math.floor(t.dims.w / (entry.dims.w + 80)));
    const pitch = t.dims.w / perSide;
    for (let i = 0; i < perSide; i++) {
      const lx = -t.dims.w / 2 + pitch * (i + 0.5);
      const placed = placer.tryPose(entry, p.offset(table.pose, lx, side * off, table.pose.rot + (side < 0 ? 180 : 0)), { group: table.group });
      if (placed) return placed;
    }
  }
  return null;
}

/* ------------------------------------------------------------- windows */

/** Blinds or curtains on every window that takes them. */
function windows(ctx: LineContext, kind: 'blind' | 'curtain'): LineOutcome {
  const placer = ctx.placer;
  const p = placer.p;
  const ids = ctx.line.catalogIds;
  const spots = treatableWindows(p);
  if (spots.length === 0) return { reason: noWindowReason(p) };
  let missed = 0;
  const covered = (centreAt: Pt) => p.placed.some((q) => ids.includes(q.entry.id) && vec.dist(centre(q), centreAt) < q.entry.dims.d + 120);
  if (kind === 'curtain') {
    for (const plan of curtainPlans(p)) {
      if (covered(plan.centre)) continue;
      const entries = plan.entries.filter((e) => ids.includes(e.id));
      let done = false;
      for (const entry of entries) {
        const placed = placer.tryPose(entry, plan.pose(entry));
        if (placed) {
          setFinishes(placed, ctx.line);
          done = true;
          break;
        }
      }
      if (!done) missed++;
    }
    // Windows `curtainPlans` leaves out (none today) count as missed.
    missed += Math.max(0, spots.length - curtainPlans(p).length);
  } else {
    for (const spot of spots) {
      const at = vec.add(spot.run.a, vec.scale(spot.run.dir, spot.t));
      if (covered(at)) continue;
      // The width closest to the window's, wider first on a tie; the next closest when it does not fit.
      const entries = ids
        .map((id) => E(id))
        .filter((e): e is CatalogEntry => !!e)
        .sort((a, b) => Math.abs(a.dims.w - spot.width) - Math.abs(b.dims.w - spot.width) || b.dims.w - a.dims.w);
      let done = false;
      for (const entry of entries) {
        const h = entry.dims.h;
        // Over the glass: from just under the sill to a little above the head, under the ceiling.
        const z = Math.max(0, Math.min(Math.max(spot.opening.sill - 20, spot.opening.top + 100 - h), p.level.ceilingHeight - h - 20));
        const pose = p.against(spot.run, spot.t, entry, z, 2);
        // A blind hangs flat on the glass: the window's own strip and the standing room in front of furniture do not apply.
        const placed = without(p, (zone) => zone.kind === 'clearance' || (zone.kind === 'window' && zone.zMin < z + h && zone.zMax > z), () => (p.can(entry, pose) ? placer.commit(entry, pose) : null));
        if (placed) {
          setFinishes(placed, ctx.line);
          done = true;
          break;
        }
      }
      if (!done) missed++;
    }
  }
  if (missed === 0) return {};
  return { reason: missed === 1 ? 'No wall space beside one window' : `No wall space beside ${missed} windows` };
}

/** Why a room takes no blind or curtain. */
export function noWindowReason(p: Planner): string {
  const sliding = p.runs.some((r) => r.openings.some((o) => o.kind === 'sliding'));
  return sliding ? 'No window here, only a sliding door, which is kept clear' : 'No window in this room takes one';
}

/* ------------------------------------------------------------- partition */

/**
 * The living-dining partition stands on the boundary between the two zones: on an
 * open-plan divider when the plan has one, otherwise across the open side of the dining
 * area between the seating group and the table, one end at a wall, never across the main
 * walkway.
 */
function partition(ctx: LineContext): LineOutcome {
  const placer = ctx.placer;
  const p = placer.p;
  const need = ctx.line.count ?? 1;
  if (countOf(p, ctx.line.catalogIds) >= need) return {};
  const entry = E(ctx.line.catalogIds[0]!);
  if (!entry) return { reason: 'Not in the catalog' };
  const done = (q: Placed | null): LineOutcome | null => {
    if (!q) return null;
    setFinishes(q, ctx.line);
    return {};
  };

  // On a divider (to the living room first): back to it at one end, leaving the rest of the opening clear.
  const all = p.runs.filter((r) => r.kind === 'divider').sort((a, b) => (ctx.across(b) === 'living' ? 1 : 0) - (ctx.across(a) === 'living' ? 1 : 0) || b.len - a.len || a.index - b.index);
  const onDivider = (run: Run): LineOutcome | null => {
    const others = p.doorPoints.filter((d) => vec.dist(d, vec.add(run.a, vec.scale(run.dir, run.len / 2))) > 10);
    const ends = [entry.dims.w / 2 + 20, run.len - entry.dims.w / 2 - 20].sort((a, b) => {
      const da = Math.min(...others.map((d) => vec.dist(d, vec.add(run.a, vec.scale(run.dir, a)))), 1e9);
      const db = Math.min(...others.map((d) => vec.dist(d, vec.add(run.a, vec.scale(run.dir, b)))), 1e9);
      return db - da;
    });
    // The divider's own clear strip is what the partition stands in; the rest of it stays open.
    const strip = p.stripRect(run, 0, run.len, APPROACH);
    const own = (z: Zone) => z.kind === 'door' && z.rect.every((q, i) => vec.dist(q, strip[i]!) < 1);
    for (const t of ends) {
      const pose = p.against(run, t, entry, 0, WALL_GAP);
      const placed = without(p, own, () => (p.can(entry, pose) ? placer.commit(entry, pose) : null));
      const out = done(placed);
      if (out) return out;
    }
    return null;
  };
  const dividers = all.filter((r) => r.len >= entry.dims.w + 1000);

  // 1. A separate dining room: on its divider to the living room.
  if (!ctx.combined) {
    for (const run of dividers.filter((r) => ctx.across(r) === 'living')) {
      const out = onDivider(run);
      if (out) return out;
    }
  }

  // 2. Between the seating group and the dining table of a combined room.
  const sofa = find(p, /^sofa\./)[0];
  const table = find(p, /^table\.dining/)[0];
  if (sofa && table) {
    const out = done(betweenZones(placer, entry, sofa, table));
    if (out) return out;
  }

  // Otherwise across the open side of the dining area: any other divider.
  for (const run of dividers) {
    if (!ctx.combined && ctx.across(run) === 'living') continue;
    const out = onDivider(run);
    if (out) return out;
  }

  // 3. A dining room open to the living room through a passage: a fin beside the passage.
  for (const run of p.runs) {
    if (run.kind !== 'wall') continue;
    for (const o of run.openings) {
      if (o.kind !== 'passage' || o.s1 - o.s0 < 1200) continue;
      for (const t of [o.s0 - 40 - entry.dims.d / 2, o.s1 + 40 + entry.dims.d / 2]) {
        const base = vec.add(run.a, vec.scale(run.dir, t));
        const c = vec.add(base, vec.scale(run.normal, WALL_GAP + entry.dims.w / 2));
        const pose: Pose = { x: c.x, y: c.y, rot: rotationFacing(run.dir), z: 0 };
        const out = done(placer.tryPose(entry, pose));
        if (out) return out;
      }
    }
  }
  if (!sofa && !table && dividers.length === 0) return { reason: 'No open side between the living and dining areas' };
  return { reason: 'No spot between the living and dining areas that keeps the walkway clear' };
}

function betweenZones(placer: Placer, entry: CatalogEntry, sofa: Placed, table: Placed): Placed | null {
  const p = placer.p;
  const s = centre(sofa);
  const t = centre(table);
  const u = vec.norm(vec.sub(t, s));
  if (!Number.isFinite(u.x)) return null;
  // Square to the room: across whichever of its axes is closer to the line from the sofa to the table.
  const axis = (longestRunAngle(p) * Math.PI) / 180;
  const ax = { x: Math.cos(axis), y: Math.sin(axis) };
  const along = Math.abs(vec.dot(u, ax)) >= Math.abs(vec.dot(u, vec.perp(ax))) ? ax : vec.perp(ax);
  const v = vec.perp(along);
  const rot = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  // Keep clear of the dining chairs and the sofa's front.
  const keepOut = [
    rectCorners(t.x, t.y, table.entry.dims.w + 2 * 700, table.entry.dims.d + 2 * 900, table.pose.rot),
    rectCorners(s.x, s.y, sofa.entry.dims.w + 200, sofa.entry.dims.d + 200, sofa.pose.rot),
  ];
  const span = vec.dist(s, t);
  const candidates: { pose: Pose; score: number }[] = [];
  for (let k0 = 0.3; k0 <= 0.7001; k0 += 0.05) {
    const m = vec.add(s, vec.scale(u, span * k0));
    for (let k = -8000; k <= 8000; k += 100) {
      const c = vec.add(m, vec.scale(v, k));
      if (!vec.pointInPolygon(c, p.polygon)) continue;
      const pose: Pose = { x: c.x, y: c.y, rot, z: 0 };
      const rect = p.footprint(entry, pose);
      if (keepOut.some((r) => convexOverlap(rect, r))) continue;
      // One end against a wall: the gap from its far end to the boundary.
      const ends = [-1, 1].map((side) => vec.add(c, vec.scale(v, side * (entry.dims.w / 2 + 40))));
      const toWall = Math.min(...ends.map((e) => (vec.pointInPolygon(e, p.polygon) ? p.wallDistance(e) : 0)));
      candidates.push({ pose, score: -Math.min(toWall, 3000) * 2 - (toWall > 150 ? 3000 : 0) - Math.abs(k0 - 0.5) * 2000 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let tried = 0;
  for (const { pose } of candidates) {
    if (!p.can(entry, pose)) continue;
    const placed = placer.commit(entry, pose);
    if (placed) return placed;
    if (++tried >= TRIES) break;
  }
  return null;
}

/* ------------------------------------------------------------- overflow */

/** Planters: a few in the room where they are out of the way, the rest on a balcony that opens off it. */
function overflow(ctx: LineContext): LineOutcome {
  const placer = ctx.placer;
  const p = placer.p;
  const ids = ctx.line.catalogIds;
  const need = ctx.line.count ?? 1;
  const balconies = ctx.balconies();
  const have = () => countOf(p, ids) + balconies.reduce((n, b) => n + countOf(b.p, ids), 0);
  const entry = E(ids[0]!);
  if (!entry) return { reason: 'Not in the catalog' };
  // A planter for every 12 m² of floor, in corners and under windows.
  const budget = Math.max(balconies.length ? 0 : 1, Math.floor(p.area / 12));
  while (have() < need && countOf(p, ids) < budget) {
    const placed = placer.wall(entry, (c) => -c.cornerDist * 2 + (c.underWindow ? 800 : 0) + Math.min(c.doorDist, 3000) * 0.3, { step: 100, gap: 40 });
    if (!placed) break;
    setFinishes(placed, ctx.line);
  }
  for (const b of balconies) {
    const railings = b.p.runs.filter((r) => r.kind === 'railing');
    while (have() < need) {
      const score = (c: WallCandidate) => -c.cornerDist * 0.5 + Math.min(c.doorDist, 3000) * 0.3;
      const placed = (railings.length ? b.wall(entry, score, { runs: railings, step: 100, gap: 40 }) : null) ?? b.wall(entry, score, { step: 100, gap: 40 });
      if (!placed) break;
      setFinishes(placed, ctx.line);
    }
  }
  const got = have();
  if (got >= need) return {};
  if (balconies.length === 0) return { reason: `Room for ${got} of ${need}; no balcony opens off this room` };
  return { reason: `Room for ${got} of ${need}, here and on the balcony` };
}
