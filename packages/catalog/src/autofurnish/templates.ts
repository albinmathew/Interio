/**
 * Room templates. Each one asks the planner for valid poses, most important
 * piece first, and simply leaves a piece out when it does not fit: small or
 * awkward rooms get fewer items rather than a bad layout.
 */
import { vec, type CatalogEntry, type Pt, type RoomType } from '@interio/core';
import { getEntry } from '../catalog';
import { rectCorners, rotationFacing } from './geometry';
import { WALL_GAP, type Placed, type Planner, type Pose, type Run, type WallCandidate } from './planner';

export interface TemplateOptions {
  /** Include wall-mounted and ceiling pieces. */
  mounted: boolean;
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

/** Table with chairs as one block. Returns the table, or null when no size fits. */
function diningSet(p: Planner, opts: TemplateOptions, sizes: string[], target: (centre: Pt) => number): Placed | null {
  const chair = E('chair.dining.cushion');
  if (!chair) return null;
  const main = [...p.runs].sort((a, b) => b.len - a.len)[0];
  if (!main) return null;
  const baseRot = (Math.atan2(main.dir.y, main.dir.x) * 180) / Math.PI;
  const bounds = vec.polygonBounds(p.polygon);
  for (const id of sizes) {
    const table = E(id);
    if (!table) continue;
    const seatDepth = chair.dims.d + 40;
    const walk = 250;
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
    for (let i = 0; i < perSide; i++) {
      const lx = -table.dims.w / 2 + pitch * (i + 0.5);
      p.tryPlace(chair, p.offset(pose, lx, -off, pose.rot + 180), { group: g });
      p.tryPlace(chair, p.offset(pose, lx, off, pose.rot), { group: g });
    }
    if (heads) {
      const hx = table.dims.w / 2 + 40 + chair.dims.d / 2;
      p.tryPlace(chair, p.offset(pose, -hx, 0, pose.rot + 90), { group: g });
      p.tryPlace(chair, p.offset(pose, hx, 0, pose.rot - 90), { group: g });
    }
    ceilingItem(p, opts, 'light.pendant', { x: pose.x, y: pose.y });
    return placedTable;
  }
  return null;
}

/* ---------------------------------------------------------------- rooms */

function bedroom(p: Planner, opts: TemplateOptions): void {
  const order = ['bed.king', 'bed.queen', 'bed.double', 'bed.single'];
  const first = p.area >= 13.5 ? 0 : p.area >= 10.5 ? 1 : p.area >= 8 ? 2 : 3;
  const night = E('nightstand.drawer');
  let bedRun: Run | null = null;

  if (!p.has('bed.')) {
    for (const id of order.slice(first)) {
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
        if (ns && !lampDone) {
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
    const options = p.area >= 12.5 ? ['wardrobe.sliding', 'wardrobe.3door', 'wardrobe.2door'] : p.area >= 9.5 ? ['wardrobe.3door', 'wardrobe.2door'] : ['wardrobe.2door'];
    for (const id of options) {
      const wardrobe = E(id);
      const clear = id === 'wardrobe.sliding' ? 500 : 650;
      const best = p.bestWall(wardrobe, (c) => -c.cornerDist * 1.5 + (c.run === bedRun ? -1500 : 0) + Math.min(c.doorDist, 2000) * 0.1, { clear });
      if (wardrobe && best) {
        p.place(wardrobe, best.pose, { clear });
        break;
      }
    }
  }

  if (p.area >= 9.5 && !p.has('desk')) deskSet(p, bedRun);
  if (p.area >= 15) {
    const dresser = E('dresser');
    const best = p.bestWall(dresser, (c) => -c.cornerDist + (c.run === bedRun ? -800 : 0), { clear: 600 });
    if (dresser && best) p.place(dresser, best.pose, { clear: 600 });
  }
  ceilingItem(p, opts, 'fan.ceiling');
}

function deskSet(p: Planner, avoid: Run | null, chairId = 'chair.office'): Run | null {
  const desk = E('desk');
  const chair = E(chairId);
  if (!desk || !chair) return null;
  const g = p.group();
  const reach = chair.dims.d + 250;
  const seat = (pose: Pose) => p.offset(pose, 0, -(desk.dims.d / 2 + 40 + chair.dims.d / 2), pose.rot + 180);
  // A desk nobody can sit at is not worth placing: only poses with room for the chair count.
  const best = p.bestWall(
    desk,
    (c) => (p.can(chair, seat(c.pose), { group: g }) ? 0 : -Infinity) + (c.underWindow ? 700 : 0) - c.cornerDist * 0.4 + (c.run === avoid ? -400 : 0) + Math.min(c.doorDist, 2000) * 0.2,
    { clear: reach, group: g },
  );
  if (!best) return null;
  p.place(desk, best.pose, { clear: reach, group: g });
  p.tryPlace(chair, seat(best.pose), { group: g });
  return best.run;
}

function living(p: Planner, opts: TemplateOptions, withDining: boolean): void {
  const unit = E('tv.unit');
  const tv = E('tv.wall.55');
  const sofas = [E('sofa.3seat'), E('sofa.2seat')].filter((e): e is CatalogEntry => !!e);
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
          for (const shift of [0, -250, 250, -500, 500]) {
            const centre = vec.add(vec.add(c.run.a, vec.scale(c.run.dir, c.t + shift)), vec.scale(c.run.normal, dist));
            const sofaPose: Pose = { x: centre.x, y: centre.y, rot: rotationFacing(vec.scale(c.run.normal, -1)), z: 0 };
            if (!p.can(sofa, sofaPose, { clear: 450 })) continue;
            const score =
              (tvOk ? 2500 : 0) +
              (sofa.id === 'sofa.3seat' ? 700 : 0) +
              (backed ? 500 : 0) -
              Math.abs(gap - 2700) * 0.35 -
              Math.abs(shift) * 0.8 -
              c.centreOffset * 0.15 -
              (c.underWindow ? 600 : 0) +
              Math.min(p.doorDistance(centre), 2500) * 0.25;
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
      const table = E(best.gap >= 1900 ? 'table.coffee' : 'table.coffee.square');
      let tablePose: Pose | null = null;
      if (table && best.gap >= table.dims.d + 950) {
        tablePose = p.offset(sofaPose, 0, -(best.sofa.dims.d / 2 + 420 + table.dims.d / 2));
        if (!p.tryPlace(table, tablePose, { group: g })) tablePose = null;
      }
      if (tablePose) {
        for (const id of ['rug.rectangle', 'rug.square', 'rug.round']) if (p.tryPlace(E(id), tablePose, { flat: true })) break;
      }

      // Armchair at one end of the coffee table, turned towards it.
      const arm = E('armchair');
      const anchor = tablePose ?? p.offset(sofaPose, 0, -(best.sofa.dims.d / 2 + 700));
      if (arm) {
        const reach = Math.max(best.sofa.dims.w / 2 + 100, (table?.dims.w ?? 0) / 2 + 450) + arm.dims.d / 2;
        const sides = [-1, 1].sort((a, b) => p.doorDistance(p.offset(anchor, b * reach, 0)) - p.doorDistance(p.offset(anchor, a * reach, 0)));
        for (const side of sides) {
          const pose = p.offset(anchor, side * reach, 0, sofaPose.rot - side * 90);
          if (p.tryPlace(arm, pose, { group: g, clear: 300 })) break;
        }
      }
      const lamp = E('lamp.floor.round');
      if (lamp) {
        for (const side of [1, -1]) {
          if (p.tryPlace(lamp, p.offset(sofaPose, side * (best.sofa.dims.w / 2 + 60 + lamp.dims.w / 2), (best.sofa.dims.d - lamp.dims.d) / 2))) break;
        }
      }
      wallItem(p, opts, 'ac.split', undefined, (c) => -c.centreOffset * 0.5 - (c.underWindow ? 300 : 0) - Math.abs(vec.dot(c.run.normal, best.run.normal)) * 600);
      ceilingItem(p, opts, 'fan.ceiling', seatCentre);
    }
  }

  if ((withDining || p.area >= 18) && !p.has('table.dining')) {
    const away = seatCentre;
    const sizes = p.area >= 34 ? ['table.dining8', 'table.dining6', 'table.dining4'] : p.area >= 22 ? ['table.dining6', 'table.dining4'] : ['table.dining4'];
    diningSet(p, opts, sizes, (c) => (away ? Math.min(vec.dist(c, away), 6000) : -vec.dist(c, p.centroid)) + Math.min(p.wallDistance(c), 1500) * 0.3);
  }
  cornerPlant(p);
}

function dining(p: Planner, opts: TemplateOptions): void {
  const sizes = p.area >= 16 ? ['table.dining8', 'table.dining6', 'table.dining4'] : p.area >= 10 ? ['table.dining6', 'table.dining4'] : ['table.dining4', 'table.dining.round'];
  if (!p.has('table.dining')) diningSet(p, opts, sizes, (c) => -vec.dist(c, p.centroid));
  const sideboard = E('sideboard');
  const best = p.bestWall(sideboard, (c) => -c.centreOffset - (c.underWindow ? 200 : 0), { clear: 450 });
  if (sideboard && best) p.place(sideboard, best.pose, { clear: 450 });
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

function utility(p: Planner, opts: TemplateOptions): void {
  const washer = E('washer.front');
  if (washer && !p.has('washer.')) {
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

function study(p: Planner, opts: TemplateOptions): void {
  const deskRun = p.has('desk') ? null : deskSet(p, null);
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
  let consoleRun: Run | null = null;
  for (const id of ['table.console', 'shoe.cabinet']) {
    const entry = E(id);
    const best = p.bestWall(entry, (c) => -c.centreOffset * 0.5 + c.run.len * 0.1 - (c.underWindow ? 200 : 0), { clear: 350 });
    if (!entry || !best) continue;
    p.place(entry, best.pose, { clear: 350 });
    consoleRun = best.run;
    if (id === 'table.console') wallItem(p, opts, 'mirror.round', { run: best.run, t: best.t }, null);
    break;
  }
  if (p.area >= 3.2 && !p.has('shoe.cabinet')) {
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
