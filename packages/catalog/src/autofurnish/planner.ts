/**
 * Layout engine behind `autoFurnish`. It knows one room: its clear polygon, the
 * walls around it, the openings on them, and what has been placed so far. The
 * room templates ask it for valid poses and commit the ones they like.
 *
 * Plan frame: millimetres, y up. An item at rotation 0 has its width along +x
 * and its front facing -y (see `ItemSchema`).
 */
import { openingFrame, vec, type CatalogEntry, type Id, type Item, type Level, type Opening, type Pt, type Room, type RoomGeom, type Wall } from '@interio/core';
import { getEntry } from '../catalog';
import { convexOverlap, distanceToBoundary, insidePolygon, localToPlan, normaliseDeg, rayToPolygon, rectCorners, rotationFacing } from './geometry';

/** Gap left between an item's back and the wall face, mm. */
export const WALL_GAP = 10;
/** Clear depth kept in front of doors that open away, sliding doors and passages, mm. */
export const APPROACH = 650;
const JAMB_MARGIN = 50;
const WINDOW_DEPTH = 320;
const PERSON = 2000;

export interface RunOpening {
  id: Id;
  kind: Opening['kind'];
  /** Jamb positions along the run. */
  s0: number;
  s1: number;
  sill: number;
  top: number;
  /** Hinged door whose leaf swings into this room. */
  swingsIn: boolean;
}

/** A straight stretch of the room's boundary (collinear wall edges merged). */
export interface Run {
  index: number;
  a: Pt;
  b: Pt;
  dir: Pt;
  /** Unit normal pointing into the room. */
  normal: Pt;
  len: number;
  /** Weakest wall kind along the run: tall pieces need `wall`. */
  kind: Wall['kind'];
  /** Lowest wall height along the run. */
  height: number;
  openings: RunOpening[];
}

export interface Pose {
  x: number;
  y: number;
  /** CCW degrees. */
  rot: number;
  /** Elevation of the underside. */
  z: number;
}

export interface Zone {
  rect: Pt[];
  zMin: number;
  zMax: number;
  kind: 'door' | 'window' | 'clearance';
  group?: number;
}

/** A solid piece of an item for collision tests: a plan rectangle between two heights. */
export interface Part {
  rect: Pt[];
  zMin: number;
  zMax: number;
  /** May pass in front of a window (a curtain rod above the glass). */
  overWindow?: boolean;
}

export interface Placed {
  entry: CatalogEntry;
  pose: Pose;
  rect: Pt[];
  zMin: number;
  zMax: number;
  /**
   * The item's solid pieces when its box is mostly empty: curtains stacked beside a window
   * are two panels and a rod. Absent: the whole box is solid.
   */
  parts?: Part[];
  /** Finish per slot, from the room's colour scheme. */
  finishes?: Record<string, string>;
  /** Added by the styling pass. */
  styled?: boolean;
  /** Floor coverings: other items may stand on them. */
  flat: boolean;
  group?: number;
  /** Already in the level before autoFurnish ran. */
  existing: boolean;
}

export interface PlaceOptions {
  /** Clear floor required in front of the item, mm. */
  clear?: number;
  /** Extra elbow room required on both sides, mm (checked, not occupied). */
  pad?: number;
  /** Items in the same group ignore each other's clearance. */
  group?: number;
  flat?: boolean;
}

export interface WallCandidate {
  run: Run;
  /** Position of the item's centre along the run. */
  t: number;
  pose: Pose;
  /** Distance from the item's nearer end to the nearer end of the run. */
  cornerDist: number;
  /** Distance from the item's centre to the middle of the run. */
  centreOffset: number;
  /** Distance to the nearest door, sliding door or passage of the room. */
  doorDist: number;
  /** The item's span overlaps a window on this run. */
  underWindow: boolean;
}

const isPassage = (o: RunOpening) => o.kind !== 'window';

/** Width of each gathered curtain panel (`params.stack`), or 0 for entries that are not stacked curtains. */
export function stackWidth(entry: CatalogEntry): number {
  const v = entry.model.kind === 'parametric' ? entry.model.params?.stack : undefined;
  return typeof v === 'number' ? v : 0;
}

/** Height of the band at the top of a stacked curtain that holds the rod, mm. */
export const ROD_BAND = 90;

/**
 * Solid pieces of an item at a pose: stacked curtains are two full-height panels at the
 * ends of the rod plus the rod band across the top; everything else is its box.
 */
export function partsOf(entry: CatalogEntry, pose: Pose, pad = 0): Part[] {
  const { w, d, h } = entry.dims;
  const stack = stackWidth(entry);
  if (stack <= 0) return [{ rect: rectCorners(pose.x, pose.y, w + 2 * pad, d, pose.rot), zMin: pose.z, zMax: pose.z + h }];
  const panel = (side: number) => {
    const c = localToPlan(pose.x, pose.y, pose.rot, side * (w / 2 - stack / 2), 0);
    return { rect: rectCorners(c.x, c.y, stack + 2 * pad, d, pose.rot), zMin: pose.z, zMax: pose.z + h };
  };
  return [panel(-1), panel(1), { rect: rectCorners(pose.x, pose.y, w + 2 * pad, d, pose.rot), zMin: pose.z + h - ROD_BAND, zMax: pose.z + h, overWindow: true }];
}

const solids = (p: Placed): Part[] => p.parts ?? [{ rect: p.rect, zMin: p.zMin, zMax: p.zMax }];
const hits = (a: Part, b: Part) => a.zMin < b.zMax - 1 && b.zMin < a.zMax - 1 && convexOverlap(a.rect, b.rect);

export class Planner {
  readonly polygon: Pt[];
  readonly runs: Run[] = [];
  readonly zones: Zone[] = [];
  readonly placed: Placed[] = [];
  /** Clear floor area, m2. */
  readonly area: number;
  readonly centroid: Pt;
  /** Centres of doors, sliding doors and passages, on the room side of the wall. */
  readonly doorPoints: Pt[] = [];
  private nextGroup = 1;

  constructor(
    readonly level: Level,
    readonly room: Room,
    readonly geom: RoomGeom,
  ) {
    this.polygon = geom.interior;
    this.area = geom.interiorArea / 1e6;
    this.centroid = geom.centroid;
    this.buildRuns();
    this.buildZones();
    this.addExisting();
  }

  group(): number {
    return this.nextGroup++;
  }

  /* ------------------------------------------------------------ set-up */

  private buildRuns(): void {
    const poly = this.polygon;
    const n = poly.length;
    interface Edge {
      a: Pt;
      b: Pt;
      dir: Pt;
      len: number;
      wall: Wall | undefined;
    }
    const edges: Edge[] = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      const len = vec.dist(a, b);
      if (len < 1) continue;
      edges.push({ a, b, dir: vec.norm(vec.sub(b, a)), len, wall: this.level.walls[this.geom.edgeWalls[i] ?? ''] });
    }
    if (edges.length < 3) return;
    const sameLine = (p: Edge, q: Edge) => vec.dot(p.dir, q.dir) > 0.9995;
    // Start at a corner so merged runs never wrap around the array end.
    let start = 0;
    for (let i = 0; i < edges.length; i++) {
      if (!sameLine(edges[(i - 1 + edges.length) % edges.length]!, edges[i]!)) {
        start = i;
        break;
      }
    }
    const ordered = [...edges.slice(start), ...edges.slice(0, start)];
    let current: Edge[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const a = current[0]!.a;
      const b = current[current.length - 1]!.b;
      const dir = vec.norm(vec.sub(b, a));
      const run: Run = {
        index: this.runs.length,
        a,
        b,
        dir,
        normal: vec.perp(dir),
        len: vec.dist(a, b),
        kind: current.some((e) => e.wall?.kind === 'divider')
          ? 'divider'
          : current.some((e) => e.wall?.kind === 'railing')
            ? 'railing'
            : current.some((e) => e.wall?.kind === 'low')
              ? 'low'
              : 'wall',
        height: Math.min(...current.map((e) => e.wall?.height ?? this.level.ceilingHeight)),
        openings: [],
      };
      const seen = new Set<Id>();
      for (const e of current) {
        if (!e.wall) continue;
        for (const o of Object.values(this.level.openings)) {
          if (o.wallId !== e.wall.id || seen.has(o.id)) continue;
          const frame = openingFrame(this.level, o.id);
          if (!frame) continue;
          const rel = vec.sub(frame.center, a);
          const s = vec.dot(rel, dir);
          const off = Math.abs(vec.dot(rel, run.normal));
          if (off > e.wall.thickness / 2 + 80 || s < -o.width / 2 || s > run.len + o.width / 2) continue;
          seen.add(o.id);
          run.openings.push({
            id: o.id,
            kind: o.kind,
            s0: s - o.width / 2,
            s1: s + o.width / 2,
            sill: o.sill,
            top: o.sill + o.height,
            swingsIn: o.kind === 'door' && (o.swing ?? 1) * vec.dot(frame.normal, run.normal) > 0,
          });
        }
      }
      run.openings.sort((p, q) => p.s0 - q.s0);
      this.runs.push(run);
      current = [];
    };
    for (const e of ordered) {
      const prev = current[current.length - 1];
      // An open-plan divider is never part of the same run as a real wall, even when collinear.
      if (prev && (!sameLine(prev, e) || (prev.wall?.kind === 'divider') !== (e.wall?.kind === 'divider'))) flush();
      current.push(e);
    }
    flush();
  }

  private buildZones(): void {
    for (const run of this.runs) {
      if (run.kind === 'divider') {
        // The room is open to its neighbour along a divider: keep it clear like a wide passage.
        this.zones.push({ rect: this.stripRect(run, 0, run.len, APPROACH), zMin: 0, zMax: PERSON, kind: 'door' });
        this.doorPoints.push(vec.add(run.a, vec.scale(run.dir, run.len / 2)));
        continue;
      }
      for (const o of run.openings) {
        const mid = vec.add(run.a, vec.scale(run.dir, (o.s0 + o.s1) / 2));
        if (o.kind === 'window') {
          // High ventilator windows tolerate a shower screen or a tall unit reaching just past the sill.
          const zMin = o.sill >= 1700 ? o.sill + 300 : o.sill - 30;
          this.zones.push({ rect: this.stripRect(run, o.s0, o.s1, WINDOW_DEPTH), zMin, zMax: o.top + 30, kind: 'window' });
          continue;
        }
        const width = o.s1 - o.s0;
        const depth = o.swingsIn ? width + 100 : APPROACH;
        this.zones.push({ rect: this.stripRect(run, o.s0 - JAMB_MARGIN, o.s1 + JAMB_MARGIN, depth), zMin: 0, zMax: Math.max(o.top, PERSON), kind: 'door' });
        this.doorPoints.push(mid);
      }
    }
  }

  /** Rectangle standing on a run between s0 and s1, reaching `depth` into the room. */
  stripRect(run: Run, s0: number, s1: number, depth: number): Pt[] {
    const p0 = vec.add(run.a, vec.scale(run.dir, s0));
    const p1 = vec.add(run.a, vec.scale(run.dir, s1));
    const back = vec.scale(run.normal, -20);
    const into = vec.scale(run.normal, depth);
    return [vec.add(p0, back), vec.add(p1, back), vec.add(p1, into), vec.add(p0, into)];
  }

  private addExisting(): void {
    for (const item of Object.values(this.level.items)) {
      const entry = getEntry(item.catalogId);
      if (!entry) continue;
      const here = item.roomId ? item.roomId === this.room.id : vec.pointInPolygon({ x: item.x, y: item.y }, this.geom.polygon);
      if (!here) continue;
      const scale = item.scale ?? 1;
      const pose: Pose = { x: item.x, y: item.y, rot: item.rotationDeg ?? 0, z: item.z ?? 0 };
      this.placed.push({
        entry,
        pose,
        rect: rectCorners(pose.x, pose.y, entry.dims.w * scale, entry.dims.d * scale, pose.rot),
        zMin: pose.z,
        zMax: pose.z + entry.dims.h * scale,
        flat: entry.dims.h <= 30,
        existing: true,
        ...(stackWidth(entry) > 0 && scale === 1 ? { parts: partsOf(entry, pose) } : {}),
      });
    }
  }

  /** True when the room already holds an item whose catalog id starts with one of the prefixes. */
  has(...prefixes: string[]): boolean {
    return this.placed.some((p) => prefixes.some((prefix) => p.entry.id.startsWith(prefix)));
  }

  /* ------------------------------------------------------------- poses */

  /** Pose of an item standing with its back to a run, centred at `t` along it. */
  against(run: Run, t: number, entry: CatalogEntry, z = 0, gap = WALL_GAP): Pose {
    const p = vec.add(vec.add(run.a, vec.scale(run.dir, t)), vec.scale(run.normal, entry.dims.d / 2 + gap));
    return { x: p.x, y: p.y, rot: rotationFacing(run.normal), z };
  }

  /** Pose reached from another pose by an item-local offset (lx along its width, ly along its depth; front is -ly). */
  offset(from: Pose, lx: number, ly: number, rot = from.rot, z = 0): Pose {
    const p = localToPlan(from.x, from.y, from.rot, lx, ly);
    return { x: p.x, y: p.y, rot: normaliseDeg(rot), z };
  }

  /** Unit vector an item at this pose faces. */
  facing(pose: Pose): Pt {
    return vec.rotate({ x: 0, y: -1 }, pose.rot);
  }

  footprint(entry: CatalogEntry, pose: Pose, pad = 0): Pt[] {
    return rectCorners(pose.x, pose.y, entry.dims.w + 2 * pad, entry.dims.d, pose.rot);
  }

  private clearance(entry: CatalogEntry, pose: Pose, clear: number): Pt[] {
    const c = localToPlan(pose.x, pose.y, pose.rot, 0, -(entry.dims.d / 2 + clear / 2));
    return rectCorners(c.x, c.y, entry.dims.w, clear, pose.rot);
  }

  /* ---------------------------------------------------------- validity */

  /** Whether a free rectangle (for example a table with its chairs) is clear between zMin and zMax. */
  rectFree(rect: Pt[], zMin = 0, zMax = PERSON, group?: number): boolean {
    if (!insidePolygon(rect, this.polygon)) return false;
    for (const zone of this.zones) {
      if (zone.group !== undefined && zone.group === group) continue;
      if (zMin < zone.zMax - 1 && zone.zMin < zMax - 1 && convexOverlap(rect, zone.rect)) return false;
    }
    const part: Part = { rect, zMin, zMax };
    for (const p of this.placed) {
      if (p.flat) continue;
      if (solids(p).some((q) => hits(part, q))) return false;
    }
    return true;
  }

  can(entry: CatalogEntry, pose: Pose, opts: PlaceOptions = {}): boolean {
    const rect = this.footprint(entry, pose, opts.pad ?? 0);
    const zMax = pose.z + entry.dims.h;
    if (zMax > this.level.ceilingHeight + 1) return false;
    if (!insidePolygon(rect, this.polygon)) return false;
    if (entry.anchor === 'wall' && !this.wallBehind(entry, pose)) return false;
    const parts = partsOf(entry, pose, opts.pad ?? 0);
    for (const zone of this.zones) {
      if (opts.flat && zone.kind !== 'door') continue;
      if (zone.group !== undefined && zone.group === opts.group) continue;
      for (const part of parts) {
        if (part.overWindow && zone.kind === 'window') continue;
        if (hits(part, zone)) return false;
      }
    }
    if (!opts.flat) {
      for (const p of this.placed) {
        if (p.flat) continue;
        const theirs = solids(p);
        if (parts.some((a) => theirs.some((b) => hits(a, b)))) return false;
      }
    }
    if (opts.clear) {
      const front = this.clearance(entry, pose, opts.clear);
      if (!insidePolygon(front, this.polygon)) return false;
      for (const p of this.placed) {
        if (p.flat || (p.group !== undefined && p.group === opts.group)) continue;
        if (p.zMin < PERSON && convexOverlap(front, p.rect)) return false;
      }
    }
    return true;
  }

  /** Wall-anchored pieces need a full-height wall behind them that reaches above their top. */
  private wallBehind(entry: CatalogEntry, pose: Pose): boolean {
    const back = vec.scale(this.facing(pose), -1);
    const centre = { x: pose.x, y: pose.y };
    for (const run of this.runs) {
      if (vec.dot(run.normal, back) > -0.999) continue;
      const rel = vec.sub(centre, run.a);
      const dist = vec.dot(rel, run.normal);
      const s = vec.dot(rel, run.dir);
      if (dist < 0 || dist > entry.dims.d / 2 + 60) continue;
      if (s < entry.dims.w / 2 - 5 || s > run.len - entry.dims.w / 2 + 5) continue;
      if (run.kind !== 'wall' || run.height < pose.z + entry.dims.h) return false;
      // Never across a door, passage or sliding door. Stacked curtains may frame one: their
      // panels stand clear of the opening and its jambs, and only the rod crosses it, above the head.
      const w = entry.dims.w;
      const stack = stackWidth(entry);
      if (stack <= 0) return !run.openings.some((o) => isPassage(o) && o.s0 < s + w / 2 && o.s1 > s - w / 2 && pose.z < o.top + 50);
      const lo = s - w / 2;
      const hi = s + w / 2;
      return !run.openings.some((o) => {
        if (!isPassage(o) || o.s0 >= hi || o.s1 <= lo) return false;
        const onPanel = o.s0 < lo + stack + JAMB_MARGIN || o.s1 > hi - stack - JAMB_MARGIN;
        return onPanel || pose.z + entry.dims.h - ROD_BAND < o.top + 50;
      });
    }
    return false;
  }

  place(entry: CatalogEntry, pose: Pose, opts: PlaceOptions = {}): Placed {
    const placed: Placed = {
      entry,
      pose: { x: pose.x, y: pose.y, rot: normaliseDeg(pose.rot), z: pose.z },
      rect: this.footprint(entry, pose),
      zMin: pose.z,
      zMax: pose.z + entry.dims.h,
      flat: opts.flat ?? false,
      group: opts.group,
      existing: false,
      ...(stackWidth(entry) > 0 ? { parts: partsOf(entry, pose) } : {}),
    };
    this.placed.push(placed);
    if (opts.clear) this.zones.push({ rect: this.clearance(entry, pose, opts.clear), zMin: 0, zMax: PERSON, kind: 'clearance', group: opts.group });
    return placed;
  }

  /** Snapshot to return to with `rollback` when a group of pieces does not work out. */
  mark(): { placed: number; zones: number } {
    return { placed: this.placed.length, zones: this.zones.length };
  }

  rollback(mark: { placed: number; zones: number }): void {
    this.placed.length = mark.placed;
    this.zones.length = mark.zones;
  }

  /** Places the item if the pose is valid. */
  tryPlace(entry: CatalogEntry | undefined, pose: Pose, opts: PlaceOptions = {}): Placed | null {
    if (!entry || !this.can(entry, pose, opts)) return null;
    return this.place(entry, pose, opts);
  }

  /* ------------------------------------------------------------ search */

  doorDistance(p: Pt): number {
    let best = Infinity;
    for (const d of this.doorPoints) best = Math.min(best, vec.dist(p, d));
    return best === Infinity ? 5000 : best;
  }

  /** Every valid pose for the item against the room's walls, in deterministic order. */
  wallCandidates(entry: CatalogEntry, opts: PlaceOptions & { z?: number; step?: number; runs?: Run[]; gap?: number } = {}): WallCandidate[] {
    const out: WallCandidate[] = [];
    const step = opts.step ?? 50;
    const w = entry.dims.w;
    const pad = opts.pad ?? 0;
    const tall = entry.dims.h + (opts.z ?? 0) > 1300;
    for (const run of opts.runs ?? this.runs) {
      if (tall && entry.anchor !== 'ceiling' && run.kind !== 'wall') continue;
      const lo = w / 2 + pad + 5;
      const hi = run.len - w / 2 - pad - 5;
      if (hi < lo) continue;
      const ts = new Set<number>();
      for (let t = lo; t <= hi; t += step) ts.add(Math.round(t));
      ts.add(Math.round(hi));
      ts.add(Math.round(run.len / 2));
      for (const t of [...ts].filter((v) => v >= lo - 1 && v <= hi + 1).sort((p, q) => p - q)) {
        const pose = this.against(run, t, entry, opts.z ?? 0, opts.gap ?? (entry.anchor === 'wall' ? 2 : WALL_GAP));
        if (!this.can(entry, pose, opts)) continue;
        out.push({
          run,
          t,
          pose,
          cornerDist: Math.min(t - w / 2, run.len - t - w / 2),
          centreOffset: Math.abs(t - run.len / 2),
          doorDist: this.doorDistance({ x: pose.x, y: pose.y }),
          underWindow: run.openings.some((o) => o.kind === 'window' && o.s0 < t + w / 2 && o.s1 > t - w / 2),
        });
      }
    }
    return out;
  }

  /** Best wall pose by score (ties keep the earliest candidate). */
  bestWall(
    entry: CatalogEntry | undefined,
    score: (c: WallCandidate) => number,
    opts: PlaceOptions & { z?: number; step?: number; runs?: Run[]; gap?: number } = {},
  ): WallCandidate | null {
    if (!entry) return null;
    let best: WallCandidate | null = null;
    let bestScore = -Infinity;
    for (const c of this.wallCandidates(entry, opts)) {
      const s = score(c);
      if (s > bestScore + 1e-6) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  }

  /** Free depth of the room in front of a point on a run, mm. */
  depthFrom(run: Run, t: number): number {
    const origin = vec.add(vec.add(run.a, vec.scale(run.dir, t)), vec.scale(run.normal, 1));
    return rayToPolygon(origin, run.normal, this.polygon);
  }

  wallDistance(p: Pt): number {
    return distanceToBoundary(p, this.polygon);
  }

  /** Items added by this run, in placement order. */
  result(): Omit<Item, 'id'>[] {
    return this.placed
      .filter((p) => !p.existing)
      .map((p) => ({
        catalogId: p.entry.id,
        x: Math.round(p.pose.x),
        y: Math.round(p.pose.y),
        z: Math.round(p.pose.z),
        rotationDeg: normaliseDeg(p.pose.rot),
        roomId: this.room.id,
        ...(p.finishes && Object.keys(p.finishes).length > 0 ? { finishes: p.finishes } : {}),
      }));
  }
}
