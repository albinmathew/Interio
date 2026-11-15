/**
 * Room templates. Each one asks the planner for valid poses, most important
 * piece first, and simply leaves a piece out when it does not fit: small or
 * awkward rooms get fewer items rather than a bad layout.
 */
import { vec, type CatalogEntry, type Pt, type RoomType } from '@interio/core';
import { getEntry } from '../catalog';
import { rectCorners, rotationFacing } from './geometry';
import { WALL_GAP, type Placed, type Planner, type Pose, type Run, type WallCandidate, type Zone } from './planner';
import type { RoomSeed } from './seed';
import { stillWalkable, walkState, type WalkState } from './walk';

/**
 * Pieces a furnishing package asks for, by the role they play in a room. A template that
 * would place a piece of that role tries the package's choice first and falls back to its
 * own when it does not fit.
 */
export type PreferSlot =
  | 'bed'
  | 'nightstand'
  | 'wardrobe'
  | 'desk'
  | 'dresser'
  | 'sofa'
  | 'tvUnit'
  | 'coffeeTable'
  | 'rug'
  | 'diningTable'
  | 'diningChair'
  | 'bench'
  | 'shoe'
  | 'mirror'
  | 'crockery'
  | 'prayer';
export type Prefer = Partial<Record<PreferSlot, string>>;

/** The role a catalog id plays in a room, for package preferences. */
export function slotOf(catalogId: string): PreferSlot | null {
  const rules: [RegExp, PreferSlot][] = [
    [/^bed\./, 'bed'],
    [/^nightstand/, 'nightstand'],
    [/^wardrobe\./, 'wardrobe'],
    [/^desk/, 'desk'],
    [/^(dresser|dressing\.)/, 'dresser'],
    [/^sofa\./, 'sofa'],
    [/^tv\.unit/, 'tvUnit'],
    [/^table\.coffee/, 'coffeeTable'],
    [/^rug\./, 'rug'],
    [/^table\.dining/, 'diningTable'],
    [/^chair\.dining/, 'diningChair'],
    [/^bench\.dining/, 'bench'],
    [/^shoe\./, 'shoe'],
    [/^mirror\./, 'mirror'],
    [/^crockery\./, 'crockery'],
    [/^prayer\./, 'prayer'],
  ];
  return rules.find(([re]) => re.test(catalogId))?.[1] ?? null;
}

/** `list` with the preferred id first. */
const first = (prefer: string | undefined, list: string[]): string[] => (prefer ? [prefer, ...list.filter((id) => id !== prefer)] : list);

export interface TemplateOptions {
  /** Include wall-mounted and ceiling pieces. */
  mounted: boolean;
  /**
   * A styling pass follows: leave the pieces it chooses (bedside lamps, pendants over the
   * table) to it, and pick the rug and floor lamp for the room.
   */
  styled?: boolean;
  seed?: RoomSeed;
  /** A furnishing package's pieces, tried before the template's own. */
  prefer?: Prefer;
  /**
   * In a living room with a dining area, plan the package's prayer unit and crockery unit
   * with the dining set: the prayer unit first, then the set, then the crockery unit behind
   * the table, moving the set a little when that makes room. A second try, for rooms where
   * the package's lines one by one leave the crockery unit out.
   */
  jointDining?: boolean;
}

const E = (id: string): CatalogEntry | undefined => getEntry(id);

function ceilingItem(p: Planner, opts: TemplateOptions, id: string, at: Pt = p.centroid): void {
  const entry = E(id);
  if (!opts.mounted || !entry) return;
  p.tryPlace(entry, { x: at.x, y: at.y, rot: 0, z: p.level.ceilingHeight - entry.dims.h });
}

/**
 * Wall-mounted piece: at the preferred spot when it is free, otherwise at the best free wall
 * position. Pass `score: null` to give up when the preferred spot is taken.
 */
function wallItem(p: Planner, opts: TemplateOptions, id: string, prefer?: { run: Run; t: number }, score?: ((c: WallCandidate) => number) | null): Placed | null {
  const entry = E(id);
  if (!opts.mounted || !entry) return null;
  const z = entry.mountHeight ?? 1200;
  if (prefer) {
    const placed = p.tryPlace(entry, p.against(prefer.run, prefer.t, entry, z, 2));
    if (placed) return placed;
  }
  if (score === null) return null;
  const best = p.bestWall(entry, score ?? ((c) => -c.centreOffset - (c.underWindow ? 400 : 0)), { z, step: 100 });
  return best ? p.place(entry, best.pose) : null;
}

function cornerPlant(p: Planner, id = 'plant.potted'): void {
  const entry = E(id);
  if (!entry) return;
  const best = p.bestWall(entry, (c) => -c.cornerDist * 3 + Math.min(c.doorDist, 2500) * 0.4, { step: 100, gap: 120 });
  if (best && best.cornerDist < 400) p.place(entry, best.pose);
}

/**
 * Slides the dining set (the table and the seats round it) a little at a time, across the
 * table first and then along it, until `attempt` places its piece. Leaves the set where it
 * was when no slide works. A set already in the home is never moved.
 */
export function slideDiningSet<T>(p: Planner, table: Placed, attempt: () => T | null): T | null {
  const set = p.placed.filter((q) => q === table || (table.group !== undefined && q.group === table.group));
  if (set.some((q) => q.existing)) return null;
  const facing = p.facing(table.pose);
  const along = vec.perp(facing);
  const slides = [
    ...[150, 300, 450, 600, 750, 900].flatMap((s) => [vec.scale(facing, s), vec.scale(facing, -s)]),
    ...[300, 450, 600, 750, 900].flatMap((s) => [vec.scale(along, s), vec.scale(along, -s)]),
  ];
  // Zones the set keeps for itself (the walkway round the block) move with it.
  const own = new Set(set.map((q) => q.zone));
  const groupZones = p.zones.filter((z) => z.group !== undefined && z.group === table.group && !own.has(z));
  const dropZones = (zones: Zone[]) => {
    for (const z of zones) {
      const i = p.zones.indexOf(z);
      if (i >= 0) p.zones.splice(i, 1);
    }
  };
  const putBack = () => {
    for (const q of set) {
      p.placed.push(q);
      if (q.zone) p.zones.push(q.zone);
    }
    p.zones.push(...groupZones);
  };
  for (const d of slides) {
    for (const q of set) p.remove(q);
    dropZones(groupZones);
    const shifted = groupZones.map((z) => ({ ...z, rect: z.rect.map((pt) => vec.add(pt, d)) }));
    p.zones.push(...shifted);
    const moved: Placed[] = [];
    for (const q of set) {
      const pose = { ...q.pose, x: q.pose.x + d.x, y: q.pose.y + d.y };
      if (!p.can(q.entry, pose, { group: table.group, flat: q.flat })) break;
      const n = p.place(q.entry, pose, { group: table.group });
      Object.assign(n, { finishes: q.finishes, fixed: q.fixed });
      if (q.zone) {
        n.zone = { ...q.zone, rect: q.zone.rect.map((pt) => vec.add(pt, d)) };
        p.zones.push(n.zone);
      }
      moved.push(n);
    }
    const placed = moved.length === set.length ? attempt() : null;
    if (placed) return placed;
    for (const n of moved) p.remove(n);
    dropZones(shifted);
    putBack();
  }
  return null;
}

/** Every doorway that could be reached in `before` still can, and the ones that were connected still are. */
function doorsStillConnected(p: Planner, before: WalkState): boolean {
  // Only the doors matter here: the reach check is for single pieces.
  return stillWalkable(before, walkState(p), 1e5, 1e5);
}

/** Places a piece when it leaves the room's doorways reachable; null (nothing placed) otherwise. */
function placeWalkable(p: Planner, entry: CatalogEntry, pose: Pose, opts: { clear?: number; group?: number }, before: WalkState): Placed | null {
  const placed = p.place(entry, pose, opts);
  if (doorsStillConnected(p, before)) return placed;
  p.remove(placed);
  return null;
}

/**
 * A package's prayer unit before the dining set: on a solid wall away from the seating, off
 * the windows and the walls with glazing, with room to stand in front of it; the narrower
 * one when the wide one does not fit.
 */
function prayerWall(p: Planner, id: string, away: Pt | null): Placed | null {
  const before = walkState(p);
  for (const one of first(id, ['prayer.unit.christian', 'prayer.unit.christian.compact'])) {
    const entry = E(one);
    if (!entry) continue;
    const best = p.bestWall(
      entry,
      (c) =>
        (away ? Math.min(vec.dist(c.pose, away), 4000) * 0.3 : 0) +
        Math.min(c.doorDist, 2500) * 0.3 -
        c.cornerDist * 0.2 -
        (c.underWindow ? 3000 : 0) -
        (c.run.openings.some((o) => o.kind === 'sliding' || o.kind === 'window') ? 1500 : 0),
      { clear: 550 },
    );
    const placed = best ? placeWalkable(p, entry, best.pose, { clear: 550 }, before) : null;
    if (placed) return placed;
  }
  return null;
}

/** How far from the table's centre a crockery unit still stands behind it, mm. */
const BEHIND_TABLE = 3000;

/**
 * A package's crockery unit behind the dining table: on the wall nearest the table, square
 * to it, with room in front to pull the chairs out; the dining set slides a little when that
 * is what it takes. The narrower unit when the wide one does not fit.
 */
export function crockeryBehind(p: Planner, id: string, table: Placed, avoid?: Run, ids = first(id, ['crockery.unit', 'crockery.unit.compact']), slide = false): Placed | null {
  const before = walkState(p);
  // `square`: only the walls along the table's long sides, behind a row of seats.
  const attempt = (square: boolean) => (): Placed | null => {
    const now = p.placed.find((q) => q.entry.id === table.entry.id && q.group === table.group) ?? table;
    const centre = { x: now.pose.x, y: now.pose.y };
    const facing = p.facing(now.pose);
    for (const one of ids) {
      const entry = E(one);
      if (!entry) continue;
      const best = p.bestWall(
        entry,
        (c) =>
          (square && Math.abs(vec.dot(c.run.normal, facing)) < 0.7 ? -Infinity : 0) -
          vec.dist(c.pose, centre) -
          (c.underWindow ? 3000 : 0) -
          (c.run === avoid ? 3000 : 0),
        { clear: 600 },
      );
      // Behind the table means close to it: not across the room.
      const placed = best && vec.dist(best.pose, centre) < BEHIND_TABLE ? placeWalkable(p, entry, best.pose, { clear: 600 }, before) : null;
      if (placed) return placed;
    }
    return null;
  };
  if (!slide) return attempt(true)() ?? attempt(false)();
  return attempt(true)() ?? slideDiningSet(p, table, attempt(true)) ?? attempt(false)() ?? slideDiningSet(p, table, attempt(false));
}

/**
 * Table with chairs as one block. Returns the table, or null when no size fits. A package's
 * table may stand with a narrower walkway round the block before a smaller table is taken.
 */
export function diningSet(p: Planner, opts: TemplateOptions, sizes: string[], target: (centre: Pt) => number): Placed | null {
  const chair = E(opts.prefer?.diningChair ?? 'chair.dining.cushion') ?? E('chair.dining.cushion');
  // A package with a bench seats one long side on it.
  const bench = opts.prefer?.bench ? E(opts.prefer.bench) : undefined;
  if (!chair) return null;
  const main = [...p.runs].sort((a, b) => b.len - a.len)[0];
  if (!main) return null;
  const baseRot = (Math.atan2(main.dir.y, main.dir.x) * 180) / Math.PI;
  const bounds = vec.polygonBounds(p.polygon);
  const tries = first(opts.prefer?.diningTable, sizes).flatMap((id) => (id === opts.prefer?.diningTable ? [250, 120] : [250]).map((walk) => ({ id, walk })));
  for (const { id, walk } of tries) {
    const table = E(id);
    if (!table) continue;
    const seatDepth = chair.dims.d + 40;
    const heads = table.dims.w >= 2200;
    const blockW = table.dims.w + (heads ? 2 * seatDepth : 0) + 2 * walk;
    const blockD = table.dims.d + 2 * seatDepth + 2 * walk;
    let best: { x: number; y: number; rot: number } | null = null;
    let bestScore = -Infinity;
    for (const rot of [baseRot, baseRot + 90]) {
      for (let x = Math.ceil(bounds.minX / 100) * 100; x <= bounds.maxX; x += 100) {
        for (let y = Math.ceil(bounds.minY / 100) * 100; y <= bounds.maxY; y += 100) {
          if (!p.rectFree(rectCorners(x, y, blockW, blockD, rot), 0, 1000)) continue;
          const s = target({ x, y }) - (rot === baseRot ? 0 : 1);
          if (s > bestScore + 1e-6) {
            best = { x, y, rot };
            bestScore = s;
          }
        }
      }
    }
    if (!best) continue;
    const g = p.group();
    const pose: Pose = { ...best, z: 0 };
    const placedTable = p.place(table, pose, { group: g });
    const perSide = table.dims.w >= 1600 ? 3 : 2;
    const pitch = table.dims.w / perSide;
    const off = table.dims.d / 2 + 40 + chair.dims.d / 2;
    const benchPose = bench && bench.dims.w <= table.dims.w + 100 ? p.offset(pose, 0, table.dims.d / 2 + 40 + bench.dims.d / 2, pose.rot) : null;
    const benched = benchPose !== null && p.tryPlace(bench, benchPose, { group: g }) !== null;
    for (let i = 0; i < perSide; i++) {
      const lx = -table.dims.w / 2 + pitch * (i + 0.5);
      p.tryPlace(chair, p.offset(pose, lx, -off, pose.rot + 180), { group: g });
      if (!benched) p.tryPlace(chair, p.offset(pose, lx, off, pose.rot), { group: g });
    }
    if (heads) {
      const hx = table.dims.w / 2 + 40 + chair.dims.d / 2;
      p.tryPlace(chair, p.offset(pose, -hx, 0, pose.rot + 90), { group: g });
      p.tryPlace(chair, p.offset(pose, hx, 0, pose.rot - 90), { group: g });
    }
    if (!opts.styled) ceilingItem(p, opts, 'light.pendant', { x: pose.x, y: pose.y });
    return placedTable;
  }
  return null;
}

/* ---------------------------------------------------------------- rooms */

function bedroom(p: Planner, opts: TemplateOptions): void {
  const order = ['bed.king', 'bed.queen', 'bed.double', 'bed.single'];
  const from = p.area >= 13.5 ? 0 : p.area >= 10.5 ? 1 : p.area >= 8 ? 2 : 3;
  const prefer = opts.prefer ?? {};
  const night = E(prefer.nightstand ?? 'nightstand.drawer') ?? E('nightstand.drawer');
  let bedRun: Run | null = null;

  if (!p.has('bed.')) {
    for (const id of first(prefer.bed, order.slice(from))) {
      const bed = E(id);
      if (!bed) continue;
      const single = id === 'bed.single';
      const sideFits = (c: WallCandidate, side: number) =>
        night ? p.can(night, p.against(c.run, c.t + side * (bed.dims.w / 2 + 40 + night.dims.w / 2), night)) : false;
      const best = p.bestWall(
        bed,
        (c) =>
          (c.underWindow ? -1200 : 0) +
          (c.run.openings.some((o) => o.kind !== 'window') ? -900 : 0) +
          Math.min(c.doorDist, 3500) * 0.5 +
          (single ? -c.cornerDist * 1.2 : -c.centreOffset * 0.8 + (sideFits(c, -1) ? 500 : 0) + (sideFits(c, 1) ? 500 : 0)),
        { clear: 550 },
      );
      if (!best) continue;
      const g = p.group();
      p.place(bed, best.pose, { clear: 550, group: g });
      bedRun = best.run;
      let lampDone = false;
      for (const side of single ? [1, -1] : [-1, 1]) {
        if (!night) break;
        const ns = p.tryPlace(night, p.against(best.run, best.t + side * (bed.dims.w / 2 + 40 + night.dims.w / 2), night), { group: g });
        if (ns && !lampDone && !opts.styled) {
          const lamp = E('lamp.table.round');
          if (lamp) lampDone = p.tryPlace(lamp, { ...ns.pose, z: night.dims.h }) !== null;
        }
        if (ns && single) break;
      }
      wallItem(p, opts, 'ac.split', { run: best.run, t: best.t });
      break;
    }
  }

  if (!p.has('wardrobe.')) {
    const sized = p.area >= 12.5 ? ['wardrobe.sliding', 'wardrobe.3door', 'wardrobe.2door'] : p.area >= 9.5 ? ['wardrobe.3door', 'wardrobe.2door'] : ['wardrobe.2door'];
    for (const id of first(prefer.wardrobe, sized)) {
      const wardrobe = E(id);
      const clear = id === 'wardrobe.sliding' ? 500 : 650;
      const best = p.bestWall(wardrobe, (c) => -c.cornerDist * 1.5 + (c.run === bedRun ? -1500 : 0) + Math.min(c.doorDist, 2000) * 0.1, { clear });
      if (wardrobe && best) {
        p.place(wardrobe, best.pose, { clear });
        break;
      }
    }
  }

  if (p.area >= 9.5 && !p.has('desk')) deskSet(p, bedRun, 'chair.office', prefer.desk);
  if (p.area >= 15 && !p.has('dresser', 'dressing.')) {
    const dresser = E(prefer.dresser ?? 'dresser');
    const best = p.bestWall(dresser, (c) => -c.cornerDist + (c.run === bedRun ? -800 : 0), { clear: 600 });
    if (dresser && best) p.place(dresser, best.pose, { clear: 600 });
  }
  ceilingItem(p, opts, 'fan.ceiling');
}

/**
 * A desk with its chair against a wall, and storage over it: a lit floating shelf and
 * overhead cupboards. The desk prefers a solid wall so the storage has somewhere to go;
 * under a window it goes without. Returns the desk's wall.
 */
export function deskSet(p: Planner, avoid: Run | null, chairId = 'chair.office', deskId = 'desk'): Run | null {
  const desk = E(deskId) ?? E('desk');
  const chair = E(chairId);
  if (!desk || !chair) return null;
  const g = p.group();
  const reach = chair.dims.d + 250;
  const seat = (pose: Pose) => p.offset(pose, 0, -(desk.dims.d / 2 + 40 + chair.dims.d / 2), pose.rot + 180);
  // A desk nobody can sit at is not worth placing: only poses with room for the chair count.
  const best = p.bestWall(
    desk,
    (c) =>
      (p.can(chair, seat(c.pose), { group: g }) ? 0 : -Infinity) -
      (c.underWindow ? 1500 : 0) -
      c.cornerDist * 0.4 +
      (c.run === avoid ? -400 : 0) +
      Math.min(c.doorDist, 2000) * 0.2,
    { clear: reach, group: g },
  );
  if (!best) return null;
  const placed = p.place(desk, best.pose, { clear: reach, group: g });
  p.tryPlace(chair, seat(best.pose), { group: g });
  deskStorage(p, placed, best.run);
  return best.run;
}

/** Overhead cupboards and a lit floating shelf centred over a desk, each as wide as the desk allows. */
export function deskStorage(p: Planner, desk: Placed, run: Run): void {
  const t = vec.dot(vec.sub({ x: desk.pose.x, y: desk.pose.y }, run.a), run.dir);
  for (const prefix of ['storage.overhead', 'shelf.floating']) {
    for (const w of [1200, 900]) {
      const entry = E(`${prefix}.${w}`);
      if (!entry || entry.dims.w > desk.entry.dims.w + 100) continue;
      if (p.tryPlace(entry, p.against(run, t, entry, entry.mountHeight ?? 1500, 2), { group: desk.group })) break;
    }
  }
}

function living(p: Planner, opts: TemplateOptions, withDining: boolean): void {
  const prefer = opts.prefer ?? {};
  const unit = E(prefer.tvUnit ?? 'tv.unit') ?? E('tv.unit');
  const tv = E('tv.wall.55');
  const sofas = first(prefer.sofa, ['sofa.3seat', 'sofa.2seat'])
    .map(E)
    .filter((e): e is CatalogEntry => !!e);
  // A package's dining set in the same room comes before the armchair, the lamp and the
  // rest; when it does not fit, the seating group moves towards one end of the room.
  const packageDining = !!prefer.diningTable && !p.has('table.dining');
  let extras: (() => void) | null = null;

  const seating = (bias: number): Pt | null => {
  let seatCentre: Pt | null = null;
  if (unit && tv && sofas.length > 0 && !p.has('sofa.')) {
    interface Plan {
      run: Run;
      t: number;
      unitPose: Pose;
      sofa: CatalogEntry;
      sofaPose: Pose;
      gap: number;
      tvOk: boolean;
      score: number;
    }
    let best: Plan | null = null;
    for (const c of p.wallCandidates(unit, { step: 100 })) {
      if (c.run.kind !== 'wall') continue;
      const tvPose = p.against(c.run, c.t, tv, tv.mountHeight ?? 1000, 2);
      const tvOk = opts.mounted && p.can(tv, tvPose);
      const depth = p.depthFrom(c.run, c.t);
      for (const sofa of sofas) {
        const toWall = depth - WALL_GAP - unit.dims.d - sofa.dims.d - WALL_GAP;
        const gaps = new Set<number>();
        for (let gap = 3300; gap >= 1650; gap -= 150) gaps.add(gap);
        if (toWall >= 1650 && toWall <= 4200) gaps.add(Math.floor(toWall));
        for (const gap of gaps) {
          if (gap > toWall + 1) continue;
          const dist = WALL_GAP + unit.dims.d + gap + sofa.dims.d / 2;
          const backed = Math.abs(gap - Math.floor(toWall)) < 2;
          // The sofa may sit a little off the screen's axis when a doorway is in the way.
          const shifts = sofa.id === prefer.sofa ? [0, -250, 250, -500, 500, -750, 750, -1000, 1000] : [0, -250, 250, -500, 500];
          for (const shift of shifts) {
            const centre = vec.add(vec.add(c.run.a, vec.scale(c.run.dir, c.t + shift)), vec.scale(c.run.normal, dist));
            const sofaPose: Pose = { x: centre.x, y: centre.y, rot: rotationFacing(vec.scale(c.run.normal, -1)), z: 0 };
            if (!p.can(sofa, sofaPose, { clear: 450 })) continue;
            const score =
              (tvOk ? 2500 : 0) +
              (sofa.id === prefer.sofa ? 1500 : sofa.id === 'sofa.3seat' ? 700 : 0) +
              (backed ? 500 : 0) -
              Math.abs(gap - 2700) * 0.35 -
              Math.abs(shift) * 0.8 -
              c.centreOffset * 0.15 -
              (c.underWindow ? 600 : 0) +
              Math.min(p.doorDistance(centre), 2500) * 0.25 +
              bias * vec.dist(centre, p.centroid) * 0.8;
            if (!best || score > best.score + 1e-6) best = { run: c.run, t: c.t, unitPose: c.pose, sofa, sofaPose, gap, tvOk, score };
          }
        }
      }
    }
    const plan = best as Plan | null;
    if (plan) {
      const best = plan;
      const g = p.group();
      p.place(unit, best.unitPose, { group: g });
      if (best.tvOk) p.place(tv, p.against(best.run, best.t, tv, tv.mountHeight ?? 1000, 2));
      else {
        const stand = E('tv.stand');
        if (stand) p.tryPlace(stand, { ...best.unitPose, z: unit.dims.h });
      }
      p.place(best.sofa, best.sofaPose, { group: g });
      const sofaPose = best.sofaPose;
      seatCentre = { x: (sofaPose.x + best.unitPose.x) / 2, y: (sofaPose.y + best.unitPose.y) / 2 };

      // Coffee table and rug between the sofa and the screen.
      let table: CatalogEntry | undefined;
      let tablePose: Pose | null = null;
      for (const id of first(prefer.coffeeTable, [best.gap >= 1900 ? 'table.coffee' : 'table.coffee.square'])) {
        table = E(id);
        if (!table || best.gap < table.dims.d + 950) continue;
        const pose = p.offset(sofaPose, 0, -(best.sofa.dims.d / 2 + 420 + table.dims.d / 2));
        if (p.tryPlace(table, pose, { group: g })) {
          tablePose = pose;
          break;
        }
      }
      if (opts.styled && opts.seed) seatingRug(p, opts.seed, best.sofa, sofaPose, tablePose, prefer.rug);
      else if (tablePose) {
        for (const id of ['rug.rectangle', 'rug.square', 'rug.round']) if (p.tryPlace(E(id), tablePose, { flat: true })) break;
      }

      const sofaFinal = best.sofa;
      const runOfUnit = best.run;
      const fanAt = seatCentre;
      extras = () => {
      // Armchair at one end of the coffee table, turned towards it.
      const arm = E('armchair');
      const anchor = tablePose ?? p.offset(sofaPose, 0, -(best.sofa.dims.d / 2 + 700));
      if (arm) {
        const reach = Math.max(sofaFinal.dims.w / 2 + 100, (table?.dims.w ?? 0) / 2 + 450) + arm.dims.d / 2;
        const sides = [-1, 1].sort((a, b) => p.doorDistance(p.offset(anchor, b * reach, 0)) - p.doorDistance(p.offset(anchor, a * reach, 0)));
        for (const side of sides) {
          const pose = p.offset(anchor, side * reach, 0, sofaPose.rot - side * 90);
          if (p.tryPlace(arm, pose, { group: g, clear: 300 })) break;
        }
      }
      const lamp = E(opts.styled && opts.seed ? opts.seed.pick('floor-lamp', ['lamp.floor.round', 'lamp.floor.square']) : 'lamp.floor.round');
      if (lamp) {
        for (const side of [1, -1]) {
          if (p.tryPlace(lamp, p.offset(sofaPose, side * (sofaFinal.dims.w / 2 + 60 + lamp.dims.w / 2), (sofaFinal.dims.d - lamp.dims.d) / 2))) break;
        }
      }
      wallItem(p, opts, 'ac.split', undefined, (c) => -c.centreOffset * 0.5 - (c.underWindow ? 300 : 0) - Math.abs(vec.dot(c.run.normal, runOfUnit.normal)) * 600);
      ceilingItem(p, opts, 'fan.ceiling', fanAt);
      };
      if (!packageDining) {
        extras();
        extras = null;
      }
    }
  }
  return seatCentre;
  };

  const sizes = p.area >= 34 ? ['table.dining8', 'table.dining6', 'table.dining4'] : p.area >= 22 ? ['table.dining6', 'table.dining4'] : ['table.dining4'];
  const layDining = (away: Pt | null) => diningSet(p, opts, sizes, (c) => (away ? Math.min(vec.dist(c, away), 6000) : -vec.dist(c, p.centroid)) + Math.min(p.wallDistance(c), 1500) * 0.3);
  // A package's crockery unit goes up first, so the dining set is laid out in front of it;
  // it is left out when it would cost the package's table.
  // The joint plan: the prayer unit, the set, then the crockery unit behind the table (sliding
  // the set when that makes room); the set alone when that does not give the package's table.
  const diningNear = (away: Pt | null): Placed | null => {
    if (!opts.jointDining || !prefer.crockery || p.has('crockery.')) return layDining(away);
    const mark = p.mark();
    if (prefer.prayer && !p.has('prayer.')) prayerWall(p, prefer.prayer, away);
    const table = layDining(away);
    if (table && (!prefer.diningTable || table.entry.id === prefer.diningTable) && crockeryBehind(p, prefer.crockery, table, undefined, undefined, true)) return table;
    p.rollback(mark);
    return layDining(away);
  };
  const start = p.mark();
  const seatCentre = seating(0);
  if (packageDining) {
    const table = diningNear(seatCentre);
    if (table?.entry.id !== prefer.diningTable && seatCentre) {
      // Move the seating group towards one end; keep that only if it makes room for the package's table.
      p.rollback(start);
      extras = null;
      const moved = diningNear(seating(1));
      if (!(moved?.entry.id === prefer.diningTable || (!table && moved))) {
        p.rollback(start);
        extras = null;
        diningNear(seating(0));
      }
    }
    const rest = extras as (() => void) | null;
    rest?.();
  } else if ((withDining || p.area >= 18) && !p.has('table.dining')) {
    diningNear(seatCentre);
  }
  cornerPlant(p);
}

/**
 * The rug of a seating group: under the front legs of the sofa, reaching past the coffee
 * table towards the screen. The shape varies from home to home; the first that fits wins.
 */
function seatingRug(p: Planner, seed: RoomSeed, sofa: CatalogEntry, sofaPose: Pose, tablePose: Pose | null, prefer?: string): void {
  const shapes = first(prefer, seed.order('living-rug', ['rug.large', 'rug.rectangle', 'rug.rounded', 'rug.square']));
  // Slide along the sofa towards the middle of the room when a doorway is in the way.
  const towards = vec.dot(vec.sub(p.centroid, sofaPose), vec.rotate({ x: 1, y: 0 }, sofaPose.rot)) >= 0 ? 1 : -1;
  for (const id of [...shapes, 'rug.round']) {
    const rug = E(id);
    if (!rug) continue;
    const reach = rug.dims.d;
    for (const under of [220, 120]) {
      // Long side along the sofa, running `under` mm under its front legs.
      const ly = -(sofa.dims.d / 2 - under + reach / 2);
      for (const shift of [0, 150, 300, 450]) {
        const pose = p.offset(sofaPose, towards * shift, ly, sofaPose.rot);
        // The rug takes in the coffee table, when there is one.
        if (tablePose && vec.dist({ x: pose.x, y: pose.y }, tablePose) + 350 > reach / 2) continue;
        if (p.tryPlace(rug, pose, { flat: true })) return;
      }
    }
  }
  if (tablePose) for (const id of ['rug.rectangle', 'rug.square', 'rug.round']) if (p.tryPlace(E(id), tablePose, { flat: true })) return;
}

function dining(p: Planner, opts: TemplateOptions): void {
  const sizes = p.area >= 16 ? ['table.dining8', 'table.dining6', 'table.dining4'] : p.area >= 10 ? ['table.dining6', 'table.dining4'] : ['table.dining4', 'table.dining.round'];
  if (!p.has('table.dining')) diningSet(p, opts, sizes, (c) => -vec.dist(c, p.centroid));
  // A package's crockery unit (placed with its lines) does the sideboard's job.
  if (!opts.prefer?.crockery && !p.has('crockery.')) {
    const sideboard = E('sideboard');
    const best = p.bestWall(sideboard, (c) => -c.centreOffset - (c.underWindow ? 200 : 0), { clear: 450 });
    if (sideboard && best) p.place(sideboard, best.pose, { clear: 450 });
  }
  cornerPlant(p);
}

function kitchen(p: Planner, opts: TemplateOptions): void {
  const base = E('kitchen.base');
  const drawers = E('kitchen.base.drawers');
  const sink = E('kitchen.sink');
  const hob = E('hob.4burner');
  const hood = E('hood.chimney');
  const upper = E('kitchen.wall');
  if (!base || !drawers || !sink || !hob) return;
  const module = base.dims.w;
  const g = p.group();
  const aisle = 800;

  // The counter goes on the longest stretch of wall without a door or passage. Windows with a
  // sill above the worktop are fine: the sink likes them.
  interface Span {
    run: Run;
    s0: number;
    s1: number;
  }
  const spans: Span[] = [];
  for (const run of p.runs) {
    if (run.kind !== 'wall') continue;
    let cursor = 0;
    const blockers = run.openings.filter((o) => o.kind !== 'window' || o.sill < base.dims.h + 80);
    for (const o of blockers) {
      if (o.s0 - 60 > cursor) spans.push({ run, s0: cursor, s1: o.s0 - 60 });
      cursor = Math.max(cursor, o.s1 + 60);
    }
    if (run.len > cursor) spans.push({ run, s0: cursor, s1: run.len });
  }
  spans.sort((a, b) => b.s1 - b.s0 - (a.s1 - a.s0) || a.run.index - b.run.index);
  const fridges = (p.area >= 9 ? ['fridge.double', 'fridge.topfreezer', 'fridge.single'] : ['fridge.topfreezer', 'fridge.single']).map(E).filter((e): e is CatalogEntry => !!e);

  let counterRun: Run | null = null;
  for (const span of spans) {
    const { run } = span;
    const length = span.s1 - span.s0;
    if (length < module * 2) break;
    const windows = run.openings.filter((o) => o.kind === 'window');
    const underWindow = (t: number) => windows.some((o) => o.s0 < t + module / 2 && o.s1 > t - module / 2);
    // Fridge at the end of the span that is further from the window.
    const windowMid = windows.length ? (windows[0]!.s0 + windows[0]!.s1) / 2 : span.s0;
    const fridgeAtEnd = Math.abs(span.s1 - windowMid) >= Math.abs(span.s0 - windowMid);
    let fridgeW = 0;
    if (!p.has('fridge.')) {
      for (const fridge of fridges) {
        if (length - fridge.dims.w - 20 < module * 2) continue;
        const t = fridgeAtEnd ? span.s1 - 15 - fridge.dims.w / 2 : span.s0 + 15 + fridge.dims.w / 2;
        if (p.tryPlace(fridge, p.against(run, t, fridge), { clear: aisle, group: g })) {
          fridgeW = fridge.dims.w + 25;
          break;
        }
      }
    }
    const from = fridgeAtEnd ? span.s0 + 10 : span.s0 + fridgeW + 10;
    const count = Math.min(6, Math.floor((length - fridgeW - 20) / module));
    const centres = Array.from({ length: count }, (_, i) => (fridgeAtEnd ? span.s1 - fridgeW - 10 - module * (count - i - 0.5) : from + module * (i + 0.5)));
    const usable = centres.filter((t) => p.can(base, p.against(run, t, base), { clear: aisle, group: g }));
    if (usable.length === 0) continue;

    // Sink under the window when there is one, hob on solid wall a module or two away.
    const sinkAt = windows.length
      ? usable.reduce((near, t) => (Math.abs(t - windowMid) < Math.abs(near - windowMid) ? t : near))
      : usable[Math.min(1, usable.length - 1)]!;
    const hobChoices = usable.filter((t) => t !== sinkAt && !underWindow(t));
    const fridgeT = fridgeW ? (fridgeAtEnd ? span.s1 : span.s0) : null;
    const hobAt = hobChoices.sort(
      (a, b) =>
        Math.abs(Math.abs(a - sinkAt) - module * 2) - Math.abs(Math.abs(b - sinkAt) - module * 2) ||
        (fridgeT === null ? 0 : Math.abs(b - fridgeT) - Math.abs(a - fridgeT)) ||
        a - b,
    )[0];

    let spare: number | null = null;
    for (const [i, t] of usable.entries()) {
      const isSink = t === sinkAt;
      const isHob = t === hobAt;
      const entry = isSink ? sink : isHob ? base : i % 2 === 0 ? drawers : base;
      if (!p.tryPlace(entry, p.against(run, t, entry), { clear: aisle, group: g })) continue;
      if (isHob) {
        p.tryPlace(hob, p.against(run, t, hob, hob.mountHeight ?? base.dims.h, WALL_GAP + 50), { group: g });
        if (opts.mounted && hood) p.tryPlace(hood, p.against(run, t, hood, hood.mountHeight ?? 1600, 2), { group: g });
      } else if (!isSink) {
        if (opts.mounted && upper) p.tryPlace(upper, p.against(run, t, upper, upper.mountHeight ?? 1450, 2), { group: g });
        if (spare === null || Math.abs(t - sinkAt) > Math.abs(spare - sinkAt)) spare = t;
      } else if (opts.mounted && upper && !underWindow(t)) {
        p.tryPlace(upper, p.against(run, t, upper, upper.mountHeight ?? 1450, 2), { group: g });
      }
    }
    const microwave = E('microwave');
    if (microwave && spare !== null && usable.length >= 4) p.tryPlace(microwave, p.against(run, spare, microwave, microwave.mountHeight ?? base.dims.h, WALL_GAP + 60), { group: g });
    counterRun = run;
    break;
  }

  // Anything the counter could not take goes wherever a wall is free.
  if (!p.has('fridge.')) {
    for (const fridge of fridges) {
      const best = p.bestWall(fridge, (c) => -c.cornerDist + (c.run === counterRun ? 300 : 0), { clear: aisle, group: g });
      if (best) {
        p.place(fridge, best.pose, { clear: aisle, group: g });
        break;
      }
    }
  }
  if (!p.has('kitchen.sink')) {
    const best = p.bestWall(sink, (c) => (c.underWindow ? 500 : 0) - c.cornerDist, { clear: aisle, group: g });
    if (best) p.place(sink, best.pose, { clear: aisle, group: g });
  }
  if (!p.has('hob.', 'range.')) {
    const best = p.bestWall(base, (c) => (c.underWindow ? -2000 : 0) - c.cornerDist, { clear: aisle, group: g });
    if (best) {
      p.place(base, best.pose, { clear: aisle, group: g });
      p.tryPlace(hob, p.against(best.run, best.t, hob, hob.mountHeight ?? base.dims.h, WALL_GAP + 50), { group: g });
      if (opts.mounted && hood) p.tryPlace(hood, p.against(best.run, best.t, hood, hood.mountHeight ?? 1600, 2), { group: g });
    }
  }
  ceilingItem(p, opts, 'light.ceiling.flush');
}

function bathroom(p: Planner, opts: TemplateOptions): void {
  const wet = (): Placed | null => {
    if (p.area < 2.8 || p.has('shower', 'bathtub')) return null;
    // In the corner furthest from the door.
    for (const id of p.area >= 7 ? ['bathtub', 'shower'] : ['shower', 'shower.corner']) {
      const entry = E(id);
      const best = p.bestWall(entry, (c) => -c.cornerDist * 6 + Math.min(c.doorDist, 4000), { clear: 450 });
      if (entry && best && best.cornerDist < 60) return p.place(entry, best.pose, { clear: 450 });
    }
    return null;
  };
  const toilet = (tight: boolean): boolean => {
    if (p.has('toilet')) return true;
    for (const id of p.area >= 3 && !tight ? ['toilet', 'toilet.square'] : ['toilet.square']) {
      const entry = E(id);
      const clear = tight ? 400 : 450;
      const best = p.bestWall(entry, (c) => Math.min(c.doorDist, 3000) * 0.6 - c.cornerDist * 0.3, { clear, pad: tight ? 80 : 130 });
      if (entry && best) {
        p.place(entry, best.pose, { clear });
        return true;
      }
    }
    return false;
  };
  const basin = (tight: boolean): boolean => {
    if (p.has('basin.')) return true;
    for (const id of p.area >= 3.6 && !tight ? ['basin.vanity', 'basin.pedestal'] : ['basin.pedestal']) {
      const entry = E(id);
      const clear = tight ? 400 : 500;
      const best = p.bestWall(entry, (c) => -Math.min(c.doorDist, 3000) * 0.5 - (c.underWindow ? 300 : 0) - c.cornerDist * 0.1, { clear, pad: tight ? 20 : 60 });
      if (entry && best) {
        p.place(entry, best.pose, { clear });
        wallItem(p, opts, 'mirror.wall', { run: best.run, t: best.t }, null);
        return true;
      }
    }
    return false;
  };

  // Toilet and basin are essential: the shower gives way before either of them does.
  const start = p.mark();
  let shower = wet();
  if (!(toilet(false) && basin(false))) {
    p.rollback(start);
    shower = wet();
    if (!(toilet(true) && basin(true))) {
      p.rollback(start);
      if (!(toilet(false) && basin(false))) {
        p.rollback(start);
        toilet(true);
        basin(true);
      }
      shower = wet();
    }
  }
  if (shower) {
    const at = { x: shower.pose.x, y: shower.pose.y };
    wallItem(p, opts, 'geyser', undefined, (c) => -vec.dist(at, { x: c.pose.x, y: c.pose.y }) - (c.underWindow ? 500 : 0));
  }
  ceilingItem(p, opts, 'light.ceiling.flush');
}

/**
 * A utility counter: the sink unit in a corner and a stone slab beside it at the same
 * height, with the front-load washing machine under the slab. Returns false when no wall
 * takes the run.
 */
function utilityCounter(p: Planner): boolean {
  const sink = E('utility.sink');
  const slab = E('utility.slab');
  const washer = E('washer.front');
  if (!sink || !slab || !washer) return false;
  const total = sink.dims.w + slab.dims.w;
  const run: CatalogEntry = { ...sink, id: 'utility.run', dims: { ...sink.dims, w: total } };
  const best = p.bestWall(run, (c) => -c.cornerDist * 2 + Math.min(c.doorDist, 2000) * 0.2 - (c.underWindow ? 300 : 0), { clear: 650 });
  if (!best) return false;
  // The sink at the end nearer a corner.
  const lo = best.t - total / 2;
  const hi = best.t + total / 2;
  const sinkFirst = lo <= best.run.len - hi;
  const sinkT = sinkFirst ? lo + sink.dims.w / 2 : hi - sink.dims.w / 2;
  const slabT = sinkFirst ? hi - slab.dims.w / 2 : lo + slab.dims.w / 2;
  const g = p.group();
  const placed = [
    p.tryPlace(sink, p.against(best.run, sinkT, sink), { clear: 650, group: g }),
    p.tryPlace(slab, p.against(best.run, slabT, slab, slab.mountHeight ?? 880), { group: g }),
    p.tryPlace(washer, p.against(best.run, slabT, washer), { clear: 650, group: g }),
  ];
  if (placed.every(Boolean)) return true;
  for (const q of placed) if (q) p.remove(q);
  return false;
}

function utility(p: Planner, opts: TemplateOptions): void {
  const washer = E('washer.front');
  // The sink counter with the washer under its slab; else the washer (and a dryer) on its own.
  const counter = !p.has('washer.') && !p.has('utility.') && utilityCounter(p);
  if (washer && !counter && !p.has('washer.')) {
    const best = p.bestWall(washer, (c) => -c.cornerDist + Math.min(c.doorDist, 2000) * 0.2, { clear: 600 });
    if (best) {
      const g = p.group();
      p.place(washer, best.pose, { clear: 600, group: g });
      const dryer = E('dryer');
      if (dryer && p.area >= 3.5) {
        for (const side of [1, -1]) if (p.tryPlace(dryer, p.against(best.run, best.t + side * (washer.dims.w / 2 + 20 + dryer.dims.w / 2), dryer), { clear: 600, group: g })) break;
      }
    }
  }
  if (p.area >= 3) {
    const shelf = E('shelf.metal');
    const best = p.bestWall(shelf, (c) => -c.cornerDist, { clear: 500 });
    if (shelf && best) p.place(shelf, best.pose, { clear: 500 });
  }
  ceilingItem(p, opts, 'light.ceiling.flush');
}

function balcony(p: Planner): void {
  const chair = E('outdoor.chair');
  if (!chair) return;
  const g = p.group();
  // Two chairs facing each other across a small table, backs to a free edge. Take the table
  // that seats more; the bistro table wins a tie.
  let set: { table: CatalogEntry; pose: Pose; chairs: Pose[] } | null = null;
  for (const id of ['outdoor.table', 'outdoor.table.coffee']) {
    const table = E(id);
    if (!table) continue;
    const reach = table.dims.w / 2 + 120 + chair.dims.d / 2;
    const pair = (c: WallCandidate): Pose[] =>
      [-1, 1]
        .map((side) => {
          const centre = vec.add(vec.add(c.run.a, vec.scale(c.run.dir, c.t + side * reach)), vec.scale(c.run.normal, WALL_GAP + chair.dims.w / 2));
          return { x: centre.x, y: centre.y, rot: rotationFacing(vec.scale(c.run.dir, -side)), z: 0 };
        })
        .filter((pose) => p.can(chair, pose));
    const best = p.bestWall(table, (c) => pair(c).length * 2000 - c.centreOffset * 0.2 + Math.min(c.doorDist, 2500) * 0.3 + c.run.len * 0.05, { group: g });
    if (!best) continue;
    const chairs = pair(best);
    if (chairs.length > (set?.chairs.length ?? 0)) set = { table, pose: best.pose, chairs };
  }
  if (set) {
    p.place(set.table, set.pose, { group: g });
    for (const pose of set.chairs) p.tryPlace(chair, pose, { group: g });
  } else {
    // Too tight for the set: a single chair still makes the balcony usable.
    const best = p.bestWall(chair, (c) => -c.cornerDist + Math.min(c.doorDist, 2000) * 0.3);
    if (best) p.place(chair, best.pose);
  }
  const planter = E('outdoor.planter');
  const best = p.bestWall(planter, (c) => -c.cornerDist * 2 + Math.min(c.doorDist, 3000) * 0.3 - c.run.len * 0.1);
  if (planter && best && p.area >= 3.5) p.place(planter, best.pose);
}

/**
 * A work-from-home desk: the desk and its chair on a solid wall with storage over it
 * (`deskSet`), and a laptop, a monitor and a keyboard on it. Returns the desk's wall.
 */
function wfhDesk(p: Planner): Run | null {
  let run: Run | null = null;
  for (const id of ['desk', 'desk.writing']) {
    run = deskSet(p, null, 'chair.office', id);
    if (run) break;
  }
  const desk = p.placed.filter((q) => q.entry.id.startsWith('desk')).at(-1);
  if (!run || !desk) return run;
  const top = desk.zMax;
  const back = (e: CatalogEntry | undefined) => (e ? desk.entry.dims.d / 2 - e.dims.d / 2 - 40 : 0);
  const monitor = E('monitor');
  const keyboard = E('keyboard');
  const laptop = E('laptop');
  const half = desk.entry.dims.w / 2;
  p.tryPlace(monitor, p.offset(desk.pose, 0, back(monitor), desk.pose.rot, top), { group: desk.group });
  p.tryPlace(keyboard, p.offset(desk.pose, 0, -desk.entry.dims.d / 2 + 160, desk.pose.rot, top), { group: desk.group });
  // The laptop to one side of the keyboard: the left, else the right.
  const lx = laptop ? Math.min(half - laptop.dims.w / 2 - 40, 420) : 0;
  for (const side of [-1, 1]) if (p.tryPlace(laptop, p.offset(desk.pose, side * lx, -40, desk.pose.rot, top), { group: desk.group })) break;
  return run;
}

function study(p: Planner, opts: TemplateOptions): void {
  const deskRun = p.has('desk') ? null : wfhDesk(p);
  const shelf = E(p.area >= 8 ? 'bookcase.wide' : 'bookcase.open') ?? E('bookcase.open');
  for (const entry of [shelf, E('bookcase.open')]) {
    const best = p.bestWall(entry, (c) => -c.cornerDist + (c.run === deskRun ? -600 : 0), { clear: 500 });
    if (entry && best) {
      p.place(entry, best.pose, { clear: 500 });
      break;
    }
  }
  if (p.area >= 9) {
    const arm = E('armchair');
    const best = p.bestWall(arm, (c) => -c.cornerDist + Math.min(c.doorDist, 2500) * 0.3 + (c.run === deskRun ? -500 : 0), { clear: 500, gap: 150 });
    if (arm && best) p.place(arm, best.pose, { clear: 500 });
  }
  cornerPlant(p);
  ceilingItem(p, opts, 'fan.ceiling');
}

function foyer(p: Planner, opts: TemplateOptions): void {
  const prefer = opts.prefer ?? {};
  let consoleRun: Run | null = null;
  // A package's shoe rack comes first; the console and its mirror follow when there is room.
  if (prefer.shoe && !p.has('shoe.')) {
    const rack = E(prefer.shoe);
    const best = p.bestWall(rack, (c) => -c.cornerDist * 0.5 + Math.min(c.doorDist, 2000) * 0.2 - (c.underWindow ? 2000 : 0), { clear: 400 });
    if (rack && best) p.place(rack, best.pose, { clear: 400 });
  }
  for (const id of prefer.shoe ? ['table.console'] : ['table.console', 'shoe.cabinet']) {
    const entry = E(id);
    const best = p.bestWall(entry, (c) => -c.centreOffset * 0.5 + c.run.len * 0.1 - (c.underWindow ? 200 : 0), { clear: 350 });
    if (!entry || !best) continue;
    p.place(entry, best.pose, { clear: 350 });
    consoleRun = best.run;
    if (id === 'table.console') {
      const mirror = prefer.mirror && E(prefer.mirror) ? prefer.mirror : 'mirror.round';
      if (!wallItem(p, opts, mirror, { run: best.run, t: best.t }, null) && mirror !== 'mirror.round') wallItem(p, opts, 'mirror.round', { run: best.run, t: best.t }, null);
    }
    break;
  }
  if (p.area >= 3.2 && !p.has('shoe.')) {
    const shoe = E('shoe.cabinet');
    const best = p.bestWall(shoe, (c) => (c.run === consoleRun ? -1000 : 0) - c.cornerDist * 0.5, { clear: 400 });
    if (shoe && best) p.place(shoe, best.pose, { clear: 400 });
  }
  if (p.area >= 5) cornerPlant(p);
  ceilingItem(p, opts, 'light.ceiling.flush');
}

function storage(p: Planner, opts: TemplateOptions): void {
  const shelf = E('shelf.metal');
  for (let i = 0; i < (p.area >= 4 ? 2 : 1); i++) {
    const best = p.bestWall(shelf, (c) => -c.cornerDist + Math.min(c.doorDist, 2000) * 0.2, { clear: 500 });
    if (shelf && best) p.place(shelf, best.pose, { clear: 500 });
  }
  const box = E('box.cardboard');
  const best = p.bestWall(box, (c) => -c.cornerDist * 2 + Math.min(c.doorDist, 2000) * 0.2, { gap: 60 });
  if (box && best) p.place(box, best.pose);
  ceilingItem(p, opts, 'light.ceiling.flush');
}

function corridor(p: Planner, opts: TemplateOptions): void {
  ceilingItem(p, opts, 'light.ceiling.flush');
}

export const TEMPLATES: Record<RoomType, (p: Planner, opts: TemplateOptions) => void> = {
  living: (p, o) => living(p, o, false),
  dining,
  bedroom,
  kitchen,
  bathroom,
  balcony: (p) => balcony(p),
  utility,
  foyer,
  study,
  corridor,
  storage,
  other: () => {},
};
