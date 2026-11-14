/**
 * The styling pass: what an interior designer adds once the main pieces stand.
 * Curtains framing the windows, lamps on the bedside tables, a rug under the
 * bed, art over the sofa and the bed, plants in the corners by the windows, a
 * few objects on the sideboard and the media unit.
 *
 * It works on any planner, whether its main pieces were just placed or were
 * already in the room, and follows the same rules as the templates: inside the
 * clear floor, nothing overlapping, doors and windows clear, wall pieces on a
 * wall. On top of that every floor piece must leave the room walkable (see
 * `walk.ts`), and the number of pieces is capped by the floor area.
 */
import { vec, type CatalogEntry, type Pt, type RoomType } from '@interio/core';
import { getEntry } from '../catalog';
import { CURTAIN_STACK, CURTAIN_WIDTHS } from '../entries/accessories';
import { convexOverlap } from './geometry';
import { partsOf, stackWidth, type PlaceOptions, type Placed, type Planner, type Pose, type Run, type WallCandidate, type Zone } from './planner';
import { schemeFinishes, type Scheme } from './schemes';
import type { RoomSeed } from './seed';
import { stillWalkable, walkState, type WalkState } from './walk';

export type StylingLevel = 'none' | 'light' | 'full';

const E = (id: string): CatalogEntry | undefined => getEntry(id);

/** Rooms whose windows get curtains. */
const CURTAINED = new Set<RoomType>(['living', 'dining', 'bedroom', 'study']);
/** Pieces lower than this are in the way when walking. */
const KNEE = 900;

/** The most styling pieces a room of this floor area takes. */
export function stylingCap(area: number, level: Exclude<StylingLevel, 'none'>): number {
  return level === 'full' ? Math.min(18, 3 + Math.floor(area * 0.55)) : Math.min(8, 2 + Math.floor(area * 0.25));
}

interface Behind {
  run: Run;
  /** Position of the item's centre along the run. */
  t: number;
}

class Stylist {
  count = 0;
  readonly cap: number;
  readonly full: boolean;
  private walk: WalkState;

  constructor(
    readonly p: Planner,
    readonly seed: RoomSeed,
    level: Exclude<StylingLevel, 'none'>,
    readonly mounted: boolean,
  ) {
    this.cap = stylingCap(p.area, level);
    this.full = level === 'full';
    this.walk = walkState(p);
  }

  get type(): RoomType {
    return this.p.room.type;
  }

  /** Places a styling piece when the pose is valid, the budget allows it and the room stays walkable. */
  add(entry: CatalogEntry | undefined, pose: Pose, opts: PlaceOptions = {}): Placed | null {
    if (!entry || this.count >= this.cap) return null;
    if (entry.anchor !== 'floor' && !this.mounted) return null;
    const DBG = (globalThis as { STYLE_DEBUG?: boolean }).STYLE_DEBUG;
    if (!this.p.can(entry, pose, opts)) {
      if (DBG) console.log('reject can', entry.id, Math.round(pose.x), Math.round(pose.y), pose.z);
      return null;
    }
    if (DBG) console.log('try', entry.id);
    const mark = this.p.mark();
    const placed = this.p.place(entry, pose, opts);
    if (!placed.flat && placed.zMin < KNEE) {
      const after = walkState(this.p);
      if (!stillWalkable(this.walk, after, entry.dims.w, entry.dims.d)) {
        if (DBG) console.log('reject walk', entry.id, this.walk, after);
        this.p.rollback(mark);
        return null;
      }
      this.walk = after;
    }
    placed.styled = true;
    this.count++;
    return placed;
  }

  /** Tries wall poses best first until one is accepted. */
  addBest(entry: CatalogEntry | undefined, score: (c: WallCandidate) => number, opts: PlaceOptions & { z?: number; step?: number; runs?: Run[]; gap?: number } = {}, tries = 8): Placed | null {
    if (!entry || this.count >= this.cap) return null;
    if (entry.anchor !== 'floor' && !this.mounted) return null;
    const ranked = this.p
      .wallCandidates(entry, opts)
      .map((c, i) => ({ c, s: score(c), i }))
      .filter((r) => Number.isFinite(r.s))
      .sort((a, b) => b.s - a.s || a.i - b.i);
    for (const { c } of ranked.slice(0, tries)) {
      const placed = this.add(entry, c.pose, opts);
      if (placed) return placed;
    }
    return null;
  }

  /* ----------------------------------------------------------- queries */

  find(re: RegExp): Placed[] {
    return this.p.placed.filter((q) => re.test(q.entry.id));
  }

  /** Plants standing on the floor (not the small ones on a surface). */
  floorPlants(): Placed[] {
    return this.find(/^plant\./).filter((q) => q.zMin === 0);
  }

  /** Pieces standing on top of a host. */
  onTop(host: Placed): Placed[] {
    return this.p.placed.filter((q) => q !== host && Math.abs(q.zMin - host.zMax) <= 1 && convexOverlap(q.rect, host.rect));
  }

  /** The wall run behind a piece standing with its back to a wall. */
  behind(item: Placed, reach = 120): Behind | null {
    const facing = this.p.facing(item.pose);
    const centre = { x: item.pose.x, y: item.pose.y };
    for (const run of this.p.runs) {
      if (vec.dot(run.normal, facing) < 0.999) continue;
      const rel = vec.sub(centre, run.a);
      const dist = vec.dot(rel, run.normal);
      const t = vec.dot(rel, run.dir);
      if (dist < 0 || dist > item.entry.dims.d / 2 + reach || t < 0 || t > run.len) continue;
      return { run, t };
    }
    return null;
  }

  /** Centres of the room's windows and glazed doors. */
  glazing(): Pt[] {
    const out: Pt[] = [];
    for (const run of this.p.runs) {
      for (const o of run.openings) {
        if (o.kind === 'window' || o.kind === 'sliding') out.push(vec.add(run.a, vec.scale(run.dir, (o.s0 + o.s1) / 2)));
      }
    }
    return out;
  }

  windowDistance(p: Pt): number {
    let best = Infinity;
    for (const g of this.glazing()) best = Math.min(best, vec.dist(p, g));
    return best;
  }

  /* ------------------------------------------------------------ pieces */

  /** Something standing on a host's top, `lx` along its width and `ly` towards its back. */
  onHost(host: Placed, entry: CatalogEntry | undefined, lx: number, ly: number): Placed | null {
    if (!entry) return null;
    const hw = host.entry.dims.w / 2;
    const hd = host.entry.dims.d / 2;
    if (Math.abs(lx) + entry.dims.w / 2 > hw - 10 || Math.abs(ly) + entry.dims.d / 2 > hd - 5) return null;
    return this.add(entry, this.p.offset(host.pose, lx, ly, host.pose.rot, host.zMax));
  }

  /** Small pieces at the ends of a long surface against a wall: the first at one end, the next at the other. */
  dressEnds(host: Placed, ids: (string | undefined)[], inset = 70): number {
    let done = 0;
    const sides = this.seed.order(`ends:${host.entry.id}`, [-1, 1]);
    for (const [k, id] of ids.entries()) {
      const entry = id ? E(id) : undefined;
      if (!entry) continue;
      const side = sides[k % 2]!;
      const lx = side * (host.entry.dims.w / 2 - entry.dims.w / 2 - inset);
      const ly = (host.entry.dims.d - entry.dims.d) / 2 - 20;
      if (this.onHost(host, entry, lx, ly)) done++;
    }
    return done;
  }

  /** Floor-length curtains centred on every window and glazed door that has wall beside it. */
  curtains(): void {
    if (!this.mounted || !CURTAINED.has(this.type)) return;
    const existing = this.p.placed.filter((q) => stackWidth(q.entry) > 0);
    for (const plan of curtainPlans(this.p)) {
      if (existing.some((c) => vec.dist(plan.centre, c.pose) < c.entry.dims.d + 60)) continue;
      for (const entry of plan.entries) if (this.add(entry, plan.pose(entry))) break;
    }
  }

  /** A big plant in a free corner, near a window when there is one. */
  plant(ids: string[], opts: { window?: boolean; tries?: number } = {}): Placed | null {
    for (const id of ids) {
      const entry = E(id);
      const placed = this.addBest(
        entry,
        (c) =>
          c.cornerDist > 450
            ? -Infinity
            : -c.cornerDist * 3 + Math.min(c.doorDist, 2500) * 0.4 + (opts.window === false ? 0 : Math.max(0, 2500 - this.windowDistance({ x: c.pose.x, y: c.pose.y })) * 0.5),
        { step: 100, gap: 60 },
        opts.tries ?? 10,
      );
      if (placed) return placed;
    }
    return null;
  }

  /** Art centred over a piece standing against a wall (a sofa, a bed, a sideboard). */
  artOver(host: Placed, choices: string[]): Placed[] {
    if (!this.mounted) return [];
    const at = this.behind(host);
    if (!at) return [];
    for (const choice of choices) {
      const placed = this.artAt(at.run, at.t, choice, host.entry.dims.w);
      if (placed.length) return placed;
    }
    return [];
  }

  /** One artwork, or a pair (`pair:<id>`), centred at `t` on a run; never wider than `maxW`. */
  artAt(run: Run, t: number, choice: string, maxW = Infinity): Placed[] {
    const pair = choice.startsWith('pair:');
    const entry = E(pair ? choice.slice(5) : choice);
    if (!entry) return [];
    const gap = 80;
    const total = pair ? entry.dims.w * 2 + gap : entry.dims.w;
    if (total > maxW + 100 || this.count + (pair ? 2 : 1) > this.cap) return [];
    const z = entry.mountHeight ?? 1300;
    const ts = pair ? [t - (entry.dims.w + gap) / 2, t + (entry.dims.w + gap) / 2] : [t];
    const poses = ts.map((v) => this.p.against(run, v, entry, z, 2));
    if (!poses.every((pose) => this.p.can(entry, pose))) return [];
    const out: Placed[] = [];
    const mark = this.p.mark();
    const before = this.count;
    for (const pose of poses) {
      const placed = this.add(entry, pose);
      if (!placed) {
        this.p.rollback(mark);
        this.count = before;
        return [];
      }
      out.push(placed);
    }
    return out;
  }

  /** Art on the longest free stretch of wall, away from the given runs. */
  artOnWall(choices: string[], avoid: Run[] = []): Placed[] {
    if (!this.mounted) return [];
    for (const choice of choices) {
      const pair = choice.startsWith('pair:');
      const entry = E(pair ? choice.slice(5) : choice);
      if (!entry) continue;
      const span = pair ? entry.dims.w * 2 + 80 : entry.dims.w;
      // Search with a stand-in as wide as the whole arrangement.
      const probe: CatalogEntry = { ...entry, dims: { ...entry.dims, w: span } };
      const ranked = this.p
        .wallCandidates(probe, { z: entry.mountHeight ?? 1300, step: 100 })
        .map((c, i) => ({ c, i, s: -c.centreOffset * 0.6 + c.run.len * 0.3 - (avoid.includes(c.run) ? 4000 : 0) + Math.min(c.doorDist, 2000) * 0.2 }))
        .sort((a, b) => b.s - a.s || a.i - b.i);
      for (const { c } of ranked.slice(0, 6)) {
        const placed = this.artAt(c.run, c.t, choice);
        if (placed.length) return placed;
      }
    }
    return [];
  }

  /** Pendant lights over a dining table: two over a long table, one over a short one. */
  pendants(table: Placed): void {
    if (!this.mounted) return;
    const overhead = this.p.placed.some((q) => q.entry.anchor === 'ceiling' && q.entry.id !== 'fan.ceiling' && convexOverlap(q.rect, table.rect));
    if (overhead) return;
    const entry = E(this.seed.pick('pendant', ['light.pendant', 'lamp.pendant.square']));
    if (!entry) return;
    const z = this.p.level.ceilingHeight - entry.dims.h;
    const xs = table.entry.dims.w >= 1600 ? [-table.entry.dims.w / 4, table.entry.dims.w / 4] : [0];
    const poses = xs.map((lx) => this.p.offset(table.pose, lx, 0, table.pose.rot, z));
    if (poses.every((pose) => this.p.can(entry, pose))) for (const pose of poses) this.add(entry, pose);
    else this.add(entry, this.p.offset(table.pose, 0, 0, table.pose.rot, z));
  }

  /** A rug under the lower part of the bed, reaching a little past its foot; or runners along its sides. */
  bedRug(bed: Placed): void {
    if (this.p.placed.some((q) => q.flat && q.entry.id.startsWith('rug.') && convexOverlap(q.rect, bed.rect))) return;
    const L = bed.entry.dims.d;
    for (const id of this.seed.order('bed-rug', ['rug.large', 'rug.rectangle', 'rug.rounded'])) {
      const rug = E(id);
      if (!rug || rug.dims.w < bed.entry.dims.w + 300) continue;
      const depth = rug.dims.d;
      // Under the lower two-thirds of the bed, or less when that would leave too little at the foot.
      for (const past of [450, 300]) {
        const head = Math.min(L / 6, -L / 2 - past + depth);
        const pose = this.p.offset(bed.pose, 0, head - depth / 2, bed.pose.rot);
        if (this.add(rug, pose, { flat: true })) return;
      }
    }
    // No room for one rug: a runner along each free side, tucked under the bed.
    const runner = E('rug.runner');
    if (!runner || this.full === false) return;
    for (const side of [-1, 1]) {
      const pose = this.p.offset(bed.pose, side * (bed.entry.dims.w / 2 + runner.dims.w / 2 - 200), -L / 2 + runner.dims.d / 2 - 300, bed.pose.rot);
      this.add(runner, pose, { flat: true });
    }
  }

  /** A bench or an ottoman across the foot of the bed, with room to walk past it. */
  footOfBed(bed: Placed): void {
    if (bed.entry.dims.w < 1400 || this.find(/^(bench|ottoman)/).length > 0) return;
    for (const id of this.seed.order('bench', ['bench.low', 'bench.cushion', 'ottoman'])) {
      const entry = E(id);
      if (!entry || entry.dims.w > bed.entry.dims.w - 150) continue;
      const pose = this.p.offset(bed.pose, 0, -(bed.entry.dims.d / 2 + 60 + entry.dims.d / 2), bed.pose.rot);
      if (this.add(entry, pose, { group: bed.group, clear: 650 })) return;
    }
  }

  /** A lamp on every bedside table, matching the one already there. */
  bedsideLamps(): void {
    const stands = this.find(/^nightstand/);
    const lamps = stands.flatMap((s) => this.onTop(s)).filter((q) => q.entry.id.startsWith('lamp.table'));
    const id = lamps[0]?.entry.id ?? this.seed.pick('bed-lamp', ['lamp.table.round', 'lamp.table.square']);
    for (const stand of stands) {
      if (this.onTop(stand).length > 0) continue;
      const lamp = E(id);
      if (lamp) this.onHost(stand, lamp, 0, Math.max(0, (stand.entry.dims.d - lamp.dims.d) / 2 - 25));
    }
  }

  /** Small objects on a sideboard, console or dresser, if it is bare. */
  dressSurface(host: Placed | undefined, ids: string[]): void {
    if (!host || this.onTop(host).length > 0) return;
    this.dressEnds(host, ids);
  }
}

/* ---------------------------------------------------------- curtains */

interface CurtainPlan {
  centre: Pt;
  /** A glazed door rather than a window. */
  door: boolean;
  /** Curtains that frame the opening, narrowest first. */
  entries: CatalogEntry[];
  pose: (entry: CatalogEntry) => Pose;
}

/** Windows (not high ventilators) and glazed doors on full walls, with the curtain widths that frame them. */
function curtainPlans(p: Planner): CurtainPlan[] {
  const out: CurtainPlan[] = [];
  for (const run of p.runs) {
    if (run.kind !== 'wall') continue;
    for (const o of run.openings) {
      if (!(o.kind === 'window' ? o.sill < 1700 : o.kind === 'sliding')) continue;
      const mid = (o.s0 + o.s1) / 2;
      // The panels stack beside the opening, clear of its jambs.
      const need = o.s1 - o.s0 + 2 * CURTAIN_STACK + (o.kind === 'window' ? 40 : 2 * 70);
      const entries = CURTAIN_WIDTHS.filter((v) => v >= need)
        .slice(0, 3)
        .map((w) => E(`curtain.pair.${w}`))
        .filter((e): e is CatalogEntry => !!e);
      out.push({ centre: vec.add(run.a, vec.scale(run.dir, mid)), door: o.kind !== 'window', entries, pose: (entry) => p.against(run, mid, entry, entry.mountHeight ?? 20, 2) });
    }
  }
  return out;
}

/**
 * Keeps the wall beside each window free for its curtains while the main pieces are laid
 * out, the way a designer plans the window treatment first. Glazed doors are left out: the
 * media wall of a living room often shares their wall, and the seating plan matters more;
 * they get curtains when the wall beside them is free. Returns the reservations, to be
 * lifted with `releaseCurtains` before the styling pass hangs the curtains.
 */
export function reserveCurtains(p: Planner, mounted: boolean): Zone[] {
  if (!mounted || !CURTAINED.has(p.room.type)) return [];
  const zones: Zone[] = [];
  for (const plan of curtainPlans(p)) {
    if (plan.door) continue;
    const entry = plan.entries.find((e) => p.can(e, plan.pose(e)));
    if (!entry) continue;
    for (const part of partsOf(entry, plan.pose(entry))) {
      if (part.overWindow) continue;
      zones.push({ rect: part.rect, zMin: 0, zMax: p.level.ceilingHeight, kind: 'clearance' });
    }
  }
  p.zones.push(...zones);
  return zones;
}

export function releaseCurtains(p: Planner, zones: Zone[]): void {
  const drop = new Set(zones);
  const keep = p.zones.filter((z) => !drop.has(z));
  p.zones.length = 0;
  p.zones.push(...keep);
}

/* ------------------------------------------------------------- rooms */

const PLANTS = ['plant.palm', 'plant.potted', 'plant.snake'];
const SMALL_PLANTS = ['plant.small.bush', 'plant.small.fir', 'plant.small.cactus'];
const ARTS = ['art.large', 'pair:art.portrait', 'art.landscape'];

function living(s: Stylist): void {
  const sofa = s.find(/^sofa\./)[0];
  const unit = s.find(/^tv\.unit/)[0];
  const table = s.find(/^table\.dining/)[0];
  s.curtains();
  // A side table with a lamp at the free end of the sofa.
  if (sofa) {
    const side = E('table.side');
    if (side && s.find(/^table\.side/).length === 0) {
      for (const k of [1, -1]) {
        const pose = s.p.offset(sofa.pose, k * (sofa.entry.dims.w / 2 + 50 + side.dims.w / 2), (sofa.entry.dims.d - side.dims.d) / 2 - 60);
        const placed = s.add(side, pose);
        if (placed) {
          const lamp = E(s.seed.pick('side-lamp', ['lamp.table.square', 'lamp.table.round']));
          if (lamp) s.onHost(placed, lamp, 0, 0);
          break;
        }
      }
    }
  }
  // Art over the sofa when it stands against a wall, otherwise on the longest free wall.
  const arts = [...s.seed.order('living-art', ['art.large', 'pair:art.portrait']), 'art.landscape'];
  if (s.find(/^art\./).length === 0) {
    const over = sofa ? s.artOver(sofa, arts) : [];
    if (over.length === 0) s.artOnWall(arts, [unit && s.behind(unit)?.run].filter((r): r is Run => !!r));
  }
  // The media unit: a small plant at one end, books or vases at the other.
  if (s.full) s.dressSurface(unit, [s.seed.pick('unit-plant', SMALL_PLANTS), s.seed.pick('unit-object', ['books.stack', 'vase.trio'])]);
  if (table) dining(s, table);
  // A second big plant, by the glazing.
  if (s.full && s.p.area >= 16 && s.floorPlants().length < 2) s.plant(s.seed.order('living-plant', PLANTS).filter((id) => !s.floorPlants().some((q) => q.entry.id === id)));
  if (!s.full && s.floorPlants().length === 0) s.plant(s.seed.order('living-plant', PLANTS));
}

function dining(s: Stylist, table = s.find(/^table\.dining/)[0]): void {
  if (s.type === 'dining') s.curtains();
  if (!table) return;
  s.pendants(table);
  let board = s.find(/^sideboard/)[0];
  if (!board && s.full && s.p.area >= (s.type === 'dining' ? 9 : 24)) {
    const entry = E('sideboard');
    board =
      s.addBest(entry, (c) => -c.centreOffset * 0.3 - (c.underWindow ? 400 : 0) - vec.dist({ x: c.pose.x, y: c.pose.y }, table.pose) * 0.4 + Math.min(c.doorDist, 2000) * 0.3, {
        clear: 600,
      }) ?? undefined;
  }
  if (board) {
    if (s.full) s.dressSurface(board, [s.seed.pick('board-lamp', ['lamp.table.round', 'lamp.table.square']), s.seed.pick('board-object', ['vase.branches', 'vase.trio', 'bowl.wood'])]);
    if (s.find(/^art\./).length < (s.type === 'living' ? 2 : 1)) s.artOver(board, s.seed.order('board-art', ['art.landscape', 'pair:art.portrait', 'art.large']));
  }
  if (s.type === 'dining' && s.floorPlants().length === 0) s.plant(s.seed.order('dining-plant', PLANTS));
  if (s.type === 'dining' && s.find(/^art\./).length === 0) s.artOnWall(s.seed.order('dining-art', ARTS));
}

function bedroom(s: Stylist): void {
  const bed = s.find(/^bed\./)[0];
  s.curtains();
  s.bedsideLamps();
  if (bed) {
    s.bedRug(bed);
    if (s.find(/^art\./).length === 0) s.artOver(bed, s.seed.order('bed-art', ARTS));
    if (s.full) s.footOfBed(bed);
  }
  if (s.floorPlants().length === 0) s.plant(s.seed.order('bed-plant', PLANTS));
  if (!s.full) return;
  const dresser = s.find(/^dresser/)[0];
  s.dressSurface(dresser, [s.seed.pick('dresser-object', ['tray.candles', 'vase.trio']), 'books.stack']);
  // A mirror on a free wall: over the dresser, or leaning against a wall.
  if (s.find(/^mirror\./).length === 0) {
    const at = dresser && s.behind(dresser);
    const placed = at ? s.artAt(at.run, at.t, 'mirror.round') : [];
    if (placed.length === 0) {
      const id = s.seed.pick('bed-mirror', ['mirror.floor', 'mirror.wall']);
      const entry = E(id);
      const bedRun = bed ? s.behind(bed)?.run : undefined;
      s.addBest(entry, (c) => (c.run === bedRun ? -Infinity : -c.cornerDist * 0.5 + Math.min(c.doorDist, 2000) * 0.2), entry?.anchor === 'floor' ? { clear: 600, step: 100 } : { z: entry?.mountHeight, step: 100 });
    }
  }
}

function study(s: Stylist): void {
  s.curtains();
  const desk = s.find(/^desk/)[0];
  if (desk && s.onTop(desk).length === 0) s.dressEnds(desk, ['lamp.table.square', s.full ? 'books.stack' : undefined], 90);
  if (s.find(/^art\./).length === 0) s.artOnWall(s.seed.order('study-art', ['art.landscape', 'pair:art.portrait', 'art.large']));
  if (s.floorPlants().length === 0) s.plant(s.seed.order('study-plant', PLANTS));
}

function kitchen(s: Stylist): void {
  if (!s.full) return;
  const bases = s.find(/^kitchen\.(base|counter)/).filter((b) => s.onTop(b).length === 0);
  if (bases.length === 0) return;
  const hob = s.find(/^(hob|range)\./)[0];
  const sink = s.find(/^kitchen\.sink/)[0];
  const near = (b: Placed, q: Placed | undefined) => (q ? vec.dist(b.pose, q.pose) : 5000);
  // The crock by the hob, the fruit bowl and a plant on the free stretches away from the hob and the sink.
  const used = new Set<Placed>();
  const put = (id: string, order: Placed[]) => {
    const entry = E(id);
    if (!entry) return;
    for (const b of order) {
      if (used.has(b)) continue;
      // Towards the back of the worktop; towards the front where a window sill comes down behind it.
      const back = (b.entry.dims.d - entry.dims.d) / 2 - 50;
      if (s.onHost(b, entry, 0, back) || s.onHost(b, entry, 0, -back + 60)) {
        used.add(b);
        return;
      }
    }
  };
  if (hob) put('utensil.crock', [...bases].sort((a, b) => near(a, hob) - near(b, hob)));
  const away = [...bases].sort((a, b) => Math.min(near(b, hob), near(b, sink)) - Math.min(near(a, hob), near(a, sink)));
  put('bowl.fruit', away);
  if (s.p.area >= 7) put(s.seed.pick('kitchen-plant', SMALL_PLANTS), away);
}

function bathroom(s: Stylist): void {
  // A mirror over every basin.
  for (const basin of s.find(/^basin\./)) {
    const at = s.behind(basin);
    const mirror = E('mirror.wall');
    if (!at || !mirror || !s.mounted) continue;
    const over = s.p.placed.some((q) => q.entry.anchor === 'wall' && q.zMin >= basin.zMax - 1 && convexOverlap(q.rect, s.p.footprint(mirror, s.p.against(at.run, at.t, mirror, mirror.mountHeight ?? 1050, 2))));
    if (!over) s.add(mirror, s.p.against(at.run, at.t, mirror, mirror.mountHeight ?? 1050, 2));
  }
  if (s.mounted && s.find(/^towel\./).length === 0) {
    const basin = s.find(/^(basin\.|shower|bathtub)/)[0];
    const rail = E('towel.rail');
    s.addBest(rail, (c) => -(basin ? vec.dist({ x: c.pose.x, y: c.pose.y }, basin.pose) : c.centreOffset) - (c.underWindow ? 500 : 0), { z: rail?.mountHeight, step: 100 });
  }
  if (s.full && s.p.area >= 3.5 && s.floorPlants().length === 0) s.plant(['plant.snake'], { window: false });
}

function foyer(s: Stylist): void {
  const console = s.find(/^table\.console/)[0];
  s.dressSurface(console, [s.seed.pick('console-lamp', ['lamp.table.square', 'lamp.table.round']), s.full ? s.seed.pick('console-object', ['vase.branches', 'bowl.wood', 'vase.trio']) : undefined].filter((v): v is string => !!v));
  if (s.find(/^(art|mirror)\./).length === 0) s.artOnWall(s.seed.order('foyer-art', ['art.portrait', 'art.landscape']));
  if (s.full) runner(s);
  if (s.full && s.p.area >= 3.5 && s.floorPlants().length === 0) s.plant(s.seed.order('foyer-plant', ['plant.snake', 'plant.potted']), { window: false });
}

function corridor(s: Stylist): void {
  if (s.full) runner(s);
  // Art along the longest wall, spaced out between the doors.
  if (s.mounted && s.find(/^art\./).length === 0) {
    const longest = [...s.p.runs].filter((r) => r.kind === 'wall').sort((a, b) => b.len - a.len || a.index - b.index)[0];
    const pieces = longest ? Math.min(3, Math.floor(longest.len / 3000)) : 0;
    const kinds = s.seed.order('corridor-art', ['art.landscape', 'art.portrait']);
    for (let i = 0; longest && i < pieces; i++) {
      const target = (longest.len * (i + 0.5)) / pieces;
      const entry = E(kinds[i % kinds.length]!);
      // The free spot nearest to an even spacing along the wall.
      const near = entry ? s.p.wallCandidates(entry, { z: entry.mountHeight, step: 100, runs: [longest] }).sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))[0] : undefined;
      if (near && Math.abs(near.t - target) < longest.len / pieces / 2) s.artAt(longest, near.t, entry!.id);
    }
  }
  if (s.full && s.p.area >= 6 && s.floorPlants().length === 0) s.plant(['plant.snake'], { window: false, tries: 20 });
}

/** A runner along the longest stretch of floor that is clear of door swings. */
function runner(s: Stylist): void {
  const rug = E('rug.runner');
  if (!rug || s.find(/^rug\./).length > 0) return;
  const runs = [...s.p.runs].filter((r) => r.kind !== 'divider').sort((a, b) => b.len - a.len || a.index - b.index);
  for (const run of runs.slice(0, 2)) {
    const depth = s.p.depthFrom(run, run.len / 2);
    if (depth < rug.dims.w + 300) continue;
    const rot = (Math.atan2(run.dir.y, run.dir.x) * 180) / Math.PI + 90;
    const offsets = [depth / 2, Math.min(depth / 2, rug.dims.w / 2 + 250)];
    for (const off of offsets) {
      for (let t = rug.dims.d / 2 + 150; t <= run.len - rug.dims.d / 2 - 150; t += 100) {
        const c = vec.add(vec.add(run.a, vec.scale(run.dir, t)), vec.scale(run.normal, off));
        if (s.add(rug, { x: c.x, y: c.y, rot, z: 0 }, { flat: true })) return;
      }
    }
  }
}

function balcony(s: Stylist): void {
  // Pots along the railing.
  const railings = s.p.runs.filter((r) => r.kind === 'railing').sort((a, b) => b.len - a.len || a.index - b.index);
  const total = railings.reduce((sum, r) => sum + r.len, 0);
  // One pot for every 1.8 m of railing, at most four, counting what stands there already.
  const wanted = Math.min(s.full ? 4 : 2, Math.floor(total / 1800));
  const ids = s.seed.order('balcony-plants', ['plant.snake', 'outdoor.planter', 'plant.snake']);
  let done = s.find(/^(plant\.|outdoor\.planter)/).length;
  for (const id of [...ids, ...ids]) {
    if (done >= wanted) break;
    if (s.addBest(E(id), (c) => -c.cornerDist * 2 + Math.min(c.doorDist, 3000) * 0.3, { runs: railings, step: 100, gap: 40 })) done++;
  }
}

const ROOMS: Partial<Record<RoomType, (s: Stylist) => void>> = {
  living,
  dining: (s) => dining(s),
  bedroom,
  study,
  kitchen,
  bathroom,
  foyer,
  corridor,
  balcony,
};

/** Runs the styling pass for the planner's room. */
export function stylePass(p: Planner, seed: RoomSeed, level: Exclude<StylingLevel, 'none'>, mounted: boolean): void {
  const fn = ROOMS[p.room.type];
  if (fn) fn(new Stylist(p, seed, level, mounted));
}

/** Gives every piece added by this run the room's scheme finishes. */
export function applyScheme(p: Planner, scheme: Scheme, seed: RoomSeed): void {
  for (const q of p.placed) {
    if (q.existing) continue;
    const finishes = schemeFinishes(q.entry, scheme, seed);
    if (finishes) q.finishes = finishes;
  }
}
