/**
 * Stage 6: analysis (page units) -> PlanDraft (plan millimetres, y up, origin
 * at the plan's lower-left). Builds the level through the core ops, names the
 * rooms, and records confidence and issues.
 */
import {
  DEFAULTS,
  defaultFloorFor,
  deriveFaces,
  deriveRooms,
  ops,
  vec,
  type Id,
  type Issue,
  type Level,
  type Mat2x3,
  type Opening,
  type PlanDraft,
  type Pt,
  type RoomGeom,
  type RoomType,
  type Underlay,
  type VisionResult,
} from '@interio/core';
import type { Analysis } from './analyse';
import type { Extracted } from './extract';
import { isKitchenLayer } from './roles';
import { chooseScale, clearSpans, dimensionScale, polygonSpans, MM_PER_PT, nearestStandardWall, parseScaleText, type ScaleCandidates, type WallSeg } from './scale';
import type { P2 } from './strips';
import { runEnds } from './topology';

export interface BuildOptions {
  fileName?: string;
  vision?: VisionResult | null;
  mmPerPdfUnit?: number;
}

/** What the importer measured for one labelled room. Used by the wizard and the golden tests. */
export interface RoomCheck {
  name: string;
  roomId: Id | null;
  labelled?: [number, number];
  /** Bounding size of the clear floor area (what `deriveRooms` reports). */
  bbox?: [number, number];
  /** Clear spans through the label point. */
  spans?: [number | null, number | null];
  /** True when the labelled size matches the bounding size, the spans at the label, or a pair of clear widths of the room. */
  ok: boolean;
  /** True when the bounding size alone matches (the strict reading). */
  bboxOk?: boolean;
  /** Other labels that fell in the same closed room (open-plan areas). */
  sharedWith?: string[];
}

export interface BuildResult {
  draft: PlanDraft;
  checks: RoomCheck[];
  candidates: ScaleCandidates;
  /** Page-frame position of the plan origin, page units. */
  origin: P2;
}

const round5 = (v: number): number => Math.round(v / 5) * 5;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Tolerance of the acceptance check: 2 %, or 60 mm for small dimensions. */
export const sizeTolerance = (labelled: number): number => Math.max(0.02 * labelled, 60);

export function sizesMatch(labelled: [number, number], measured: [number | null, number | null]): boolean {
  const ok = (l: number, m: number | null) => m !== null && Math.abs(l - m) <= sizeTolerance(l);
  return (ok(labelled[0], measured[0]) && ok(labelled[1], measured[1])) || (ok(labelled[0], measured[1]) && ok(labelled[1], measured[0]));
}

function distToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, vec.projectOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!).distance);
  return best;
}

function titleScale(ex: Extracted, vision?: VisionResult | null): number | null {
  for (const t of ex.texts) {
    if (/scale/i.test(t.str)) {
      const n = parseScaleText(t.str);
      if (n) return n;
    }
  }
  const joined = ex.texts.map((t) => t.str).join(' ');
  const m = joined.match(/scale[^0-9]{0,12}(1\s*[:/]\s*\d{1,4})/i);
  return parseScaleText(m?.[1]) ?? parseScaleText(vision?.scaleText);
}

function buildUnderlay(ex: Extracted, an: Analysis, toPlan: (p: P2) => Pt): Underlay {
  const keep = new Set(['wall', 'lowWall', 'door', 'window', 'furniture', 'fixture', 'dimension', 'text', 'tag']);
  const structural = new Set(['wall', 'lowWall', 'door', 'window']);
  const all = an.mode !== 'layers';
  const { crop } = an;
  const inside = (x: number, y: number) => x >= crop.minX && x <= crop.maxX && y >= crop.minY && y <= crop.maxY;
  const out: number[] = [];
  const snaps = new Map<string, [number, number]>();
  const addSnap = (p: Pt) => {
    const key = `${Math.round(p.x / 5)},${Math.round(p.y / 5)}`;
    if (!snaps.has(key)) snaps.set(key, [Math.round(p.x), Math.round(p.y)]);
  };
  for (const s of ex.segs) {
    const role = an.roles[s.layer]!;
    if (!all && !keep.has(role)) continue;
    if (!inside(s.x1, s.y1) || !inside(s.x2, s.y2)) continue;
    const a = toPlan({ x: s.x1, y: s.y1 });
    const b = toPlan({ x: s.x2, y: s.y2 });
    out.push(a.x, a.y, b.x, b.y);
    if (all ? s.width > 0 && snaps.size < 20000 : structural.has(role)) {
      addSnap(a);
      addSnap(b);
    }
  }
  for (const c of ex.curves) {
    const role = an.roles[c.layer]!;
    if (!all && !keep.has(role)) continue;
    if (!inside(c.p[0], c.p[1]) || !inside(c.p[6], c.p[7])) continue;
    let prev = toPlan({ x: c.p[0], y: c.p[1] });
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const m = 1 - t;
      const x = m * m * m * c.p[0] + 3 * m * m * t * c.p[2] + 3 * m * t * t * c.p[4] + t * t * t * c.p[6];
      const y = m * m * m * c.p[1] + 3 * m * m * t * c.p[3] + 3 * m * t * t * c.p[5] + t * t * t * c.p[7];
      const cur = toPlan({ x, y });
      out.push(prev.x, prev.y, cur.x, cur.y);
      prev = cur;
    }
  }
  // Wall-face corners that are not segment ends: where wall edges cross.
  const wallSegs = ex.segs.filter((s) => an.roles[s.layer] === 'wall' && inside(s.x1, s.y1) && inside(s.x2, s.y2)).slice(0, 600);
  for (let i = 0; i < wallSegs.length; i++) {
    for (let j = i + 1; j < wallSegs.length; j++) {
      const s = wallSegs[i]!;
      const o = wallSegs[j]!;
      const hit = vec.segmentIntersection({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
      if (hit) addSnap(toPlan(hit.point));
    }
  }
  return { segments: Float32Array.from(out), snapPoints: Float32Array.from([...snaps.values()].flat()) };
}

/**
 * Drops short wall tails that end outside every room: the stubs a flat's outer
 * walls leave where they carry on into the neighbouring flat. Free-standing
 * walls inside a room stay, and so does anything long enough to matter when a
 * room failed to close.
 */
export function pruneOutsideTails(level: Level, maxLength = 1500): void {
  const faces = deriveFaces(level);
  if (faces.length === 0) return;
  const inRoom = (p: Pt) => faces.some((f) => vec.pointInPolygon(p, f.polygon));
  for (let pass = 0; pass < 3; pass++) {
    const degree = new Map<Id, number>();
    for (const w of Object.values(level.walls)) {
      degree.set(w.a, (degree.get(w.a) ?? 0) + 1);
      degree.set(w.b, (degree.get(w.b) ?? 0) + 1);
    }
    let removed = false;
    for (const w of Object.values(level.walls)) {
      const freeA = degree.get(w.a) === 1;
      const freeB = degree.get(w.b) === 1;
      if (!freeA && !freeB) continue;
      const { a, b } = ops.wallEnds(level, w);
      if (vec.dist(a, b) > maxLength) continue;
      if (Object.values(level.openings).some((o) => o.wallId === w.id)) continue;
      const tip = freeA ? a : b;
      if (inRoom(tip) || inRoom(vec.mid(a, b))) continue;
      ops.removeWall(level, w.id);
      removed = true;
    }
    if (!removed) break;
  }
}

const TYPE_NAMES: Record<RoomType, string> = {
  living: 'Living',
  dining: 'Dining',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  balcony: 'Balcony',
  utility: 'Utility',
  foyer: 'Foyer',
  study: 'Study',
  corridor: 'Corridor',
  storage: 'Store',
  other: 'Room',
};

export function buildDraft(ex: Extracted, an: Analysis, opts: BuildOptions = {}): BuildResult {
  const issues: Issue[] = [];
  const confidence: Record<Id, number> = {};
  const level = ops.emptyLevel();
  const vision = opts.vision ?? null;

  /* ----------------------------------------------------------------- scale */
  const titleN = titleScale(ex, vision);
  const titleBlock = titleN ? titleN * MM_PER_PT : null;
  let wallThickness: number | null = null;
  if (an.T > 0) {
    const nominal = an.nominalWall ?? (titleBlock ? nearestStandardWall(an.T * titleBlock) : null);
    if (nominal) wallThickness = nominal / an.T;
  }
  const principal = [...new Set(an.runs.map((r) => r.dir))]
    .map((dir) => ({ dir, len: an.runs.filter((r) => r.dir === dir).reduce((s, r) => s + (r.u2 - r.u1), 0) }))
    .sort((a, b) => b.len - a.len);
  const axis0 = an.dirs.list[principal[0]?.dir ?? 0]!.d;
  const axes: [P2, P2] = [axis0, { x: -axis0.y, y: axis0.x }];
  const pageWalls: WallSeg[] = an.runs.map((r) => ({ ...runEnds(r, an.dirs), t: r.t }));
  const labelPage = (lp: { x: number; y: number }): P2 => ({ x: lp.x * ex.width, y: (1 - lp.y) * ex.height });
  let dimension: number | null = null;
  if (vision && pageWalls.length > 0) {
    const labels = vision.rooms
      .filter((r) => r.dims)
      .map((r) => ({ dims: r.dims as [number, number], spans: clearSpans(labelPage(r.labelPoint), pageWalls, axes) }));
    dimension = dimensionScale(labels, wallThickness ?? titleBlock)?.value ?? null;
  }
  const candidates: ScaleCandidates = { dimension, wallThickness, titleBlock };
  const scale = chooseScale(candidates, opts.mmPerPdfUnit);
  const s = scale.mmPerPdfUnit;
  if (scale.spreadPct > 1) {
    const parts = [
      dimension ? `labelled dimensions ${dimension.toFixed(3)}` : null,
      wallThickness ? `wall thickness ${wallThickness.toFixed(3)}` : null,
      titleBlock ? `title block ${titleBlock.toFixed(3)}` : null,
    ].filter(Boolean);
    issues.push({
      severity: 'warning',
      code: 'scale-disagreement',
      message: `Scale estimates differ by ${scale.spreadPct.toFixed(1)}% (${parts.join(', ')} mm per unit). Using ${scale.source}. Check a known dimension.`,
    });
  }
  if (!opts.mmPerPdfUnit && !dimension && !wallThickness && !titleBlock) {
    issues.push({
      severity: 'warning',
      code: 'scale-unknown',
      message: 'No scale could be read from the drawing. 1:100 is assumed: set the scale before trusting any size.',
    });
  }

  /* ------------------------------------------------------------ plan frame */
  let ox = an.crop.minX;
  let oy = an.crop.minY;
  if (an.runs.length > 0) {
    ox = Infinity;
    oy = Infinity;
    for (const r of an.runs) {
      const { a, b } = runEnds(r, an.dirs);
      ox = Math.min(ox, a.x - r.t / 2, b.x - r.t / 2);
      oy = Math.min(oy, a.y - r.t / 2, b.y - r.t / 2);
    }
  } else if (an.mode === 'none') {
    ox = 0;
    oy = 0;
  }
  const toPlan = (p: P2): Pt => ({ x: (p.x - ox) * s, y: (p.y - oy) * s });

  /* ----------------------------------------------------------------- walls */
  const ordered = [...an.runs].sort((a, b) => (a.kind === 'wall' ? 0 : 1) - (b.kind === 'wall' ? 0 : 1) || b.u2 - b.u1 - (a.u2 - a.u1));
  for (const run of ordered) {
    const ends = runEnds(run, an.dirs);
    const mm = run.t * s;
    const thickness = run.kind === 'railing' ? clamp(round5(mm), 40, 120) : run.kind === 'low' ? clamp(round5(mm), 60, 250) : clamp(round5(mm), 50, 600);
    const ids = ops.addWall(level, toPlan(ends.a), toPlan(ends.b), { thickness, kind: run.kind });
    for (const id of ids) confidence[id] = run.confidence;
  }

  /* -------------------------------------------------------------- openings */
  let passages = 0;
  for (const run of an.runs) {
    const dir = an.dirs.list[run.dir]!;
    for (const o of run.openings) {
      const centre = toPlan(an.dirs.point(run.dir, (o.u1 + o.u2) / 2, run.c));
      const width = (o.u2 - o.u1) * s;
      let best: { id: Id; t: number; d: number } | null = null;
      for (const w of Object.values(level.walls)) {
        const { a, b } = ops.wallEnds(level, w);
        const len = vec.dist(a, b);
        if (len < 1) continue;
        const along = Math.abs(((b.x - a.x) * dir.d.x + (b.y - a.y) * dir.d.y) / len);
        if (along < 0.98) continue;
        const pr = vec.projectOnSegment(centre, a, b);
        if (pr.distance <= 25 && (!best || pr.distance < best.d)) best = { id: w.id, t: pr.t, d: pr.distance };
      }
      if (!best) {
        issues.push({ severity: 'warning', code: 'opening-unplaced', message: `A ${o.kind} could not be placed on a wall.`, at: vec.roundPt(centre) });
        continue;
      }
      const wall = level.walls[best.id]!;
      const { a, b } = ops.wallEnds(level, wall);
      const forward = (b.x - a.x) * dir.d.x + (b.y - a.y) * dir.d.y > 0;
      const base = { wallId: wall.id, offset: best.t * vec.dist(a, b), width: Math.max(300, Math.round(width / 5) * 5) };
      let spec: Omit<Opening, 'id'>;
      if (o.kind === 'door') {
        const hingeLow = (o.hingeU ?? o.u1) < (o.u1 + o.u2) / 2;
        // +n of the run is the wall's left side when the wall runs forward along the run.
        const left = (o.swingSide ?? 1) === 1 ? forward : !forward;
        spec = { ...base, kind: 'door', height: DEFAULTS.doorHeight, sill: 0, hinge: hingeLow === forward ? 'a' : 'b', swing: left ? 1 : -1 };
      } else if (o.kind === 'glazed') {
        spec = { ...base, kind: 'sliding', height: DEFAULTS.slidingHeight, sill: 0 };
      } else if (o.kind === 'window') {
        spec = width < 750 ? { ...base, kind: 'window', height: 600, sill: 1500 } : { ...base, kind: 'window', height: DEFAULTS.windowHeight, sill: DEFAULTS.windowSill };
      } else {
        passages++;
        spec = { ...base, kind: 'passage', height: width > 1500 ? DEFAULTS.slidingHeight : DEFAULTS.doorHeight, sill: 0 };
      }
      const id = ops.addOpening(level, spec);
      if (id) confidence[id] = o.confidence;
      else issues.push({ severity: 'info', code: 'opening-dropped', message: `A ${o.kind} did not fit its wall and was left out.`, at: vec.roundPt(centre) });
    }
  }
  if (passages > 0) {
    issues.push({
      severity: 'info',
      code: 'passages-assumed',
      message: `${passages} gap${passages === 1 ? '' : 's'} between walls had no door or window drawn and became open passages.`,
    });
  }

  /* ----------------------------------------------------------------- rooms */
  pruneOutsideTails(level);
  // Pruning can move the plan's lower-left corner: put the origin back on it.
  if (Object.keys(level.walls).length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    for (const w of Object.values(level.walls)) {
      const { a, b } = ops.wallEnds(level, w);
      minX = Math.min(minX, a.x - w.thickness / 2, b.x - w.thickness / 2);
      minY = Math.min(minY, a.y - w.thickness / 2, b.y - w.thickness / 2);
    }
    const dx = Math.round(minX);
    const dy = Math.round(minY);
    if (dx !== 0 || dy !== 0) {
      for (const v of Object.values(level.vertices)) {
        v.x -= dx;
        v.y -= dy;
      }
      ox += dx / s;
      oy += dy / s;
    }
  }
  ops.reconcileRooms(level);
  const geoms = deriveRooms(level);
  const geomOf = (roomId: Id): RoomGeom | undefined => geoms.find((g) => g.roomId === roomId);
  const planWalls: WallSeg[] = Object.values(level.walls).map((w) => ({ ...ops.wallEnds(level, w), t: w.thickness }));
  const edgeKinds = (g: RoomGeom) => {
    let rail = 0;
    let low = 0;
    let total = 0;
    g.polygon.forEach((p, i) => {
      const len = vec.dist(p, g.polygon[(i + 1) % g.polygon.length]!);
      const kind = level.walls[g.edgeWalls[i]!]?.kind;
      total += len;
      if (kind === 'railing') rail += len;
      if (kind === 'low') low += len;
    });
    return { rail: rail / total, low: low / total };
  };

  const checks: RoomCheck[] = [];
  const named = new Set<Id>();
  if (vision) {
    const byRoom = new Map<Id, { label: VisionResult['rooms'][number]; at: Pt }[]>();
    for (const label of vision.rooms) {
      const at = toPlan(labelPage(label.labelPoint));
      let g = geoms.find((x) => vec.pointInPolygon(at, x.polygon));
      if (!g) {
        const near = geoms.map((x) => ({ x, d: distToPolygon(at, x.polygon) })).sort((m, n) => m.d - n.d)[0];
        if (near && near.d <= 400) g = near.x;
      }
      if (!g?.roomId) {
        checks.push({ name: label.name, roomId: null, labelled: label.dims, ok: false });
        issues.push({
          severity: 'warning',
          code: 'room-not-closed',
          message: `"${label.name}" is labelled on the drawing but its walls do not close. Trace the missing wall in the editor.`,
          at: vec.roundPt(at),
        });
        continue;
      }
      const list = byRoom.get(g.roomId);
      if (list) list.push({ label, at });
      else byRoom.set(g.roomId, [{ label, at }]);
    }
    for (const [roomId, list] of byRoom) {
      const room = level.rooms[roomId]!;
      const g = geomOf(roomId)!;
      const area = (l: VisionResult['rooms'][number]) => (l.dims ? l.dims[0] * l.dims[1] : 0);
      list.sort((m, n) => area(n.label) - area(m.label));
      const primary = list[0]!.label;
      const partner = list.find((x) => x.label !== primary && ['living', 'dining'].includes(x.label.type))?.label;
      const joined = partner && ['living', 'dining'].includes(primary.type) && !primary.name.includes('/') ? `${primary.name} / ${partner.name}` : primary.name;
      room.name = joined;
      room.type = primary.type;
      room.floorMaterial = defaultFloorFor(primary.type);
      named.add(roomId);
      let allOk = true;
      for (const { label, at } of list) {
        const bbox: [number, number] = [Math.round(g.width), Math.round(g.depth)];
        const raw = clearSpans(at, planWalls, [{ x: axes[0].x, y: axes[0].y }, { x: axes[1].x, y: axes[1].y }]);
        const spans: [number | null, number | null] = [raw[0] === null ? null : Math.round(raw[0]), raw[1] === null ? null : Math.round(raw[1])];
        const [across, up] = polygonSpans(g.interior, axes);
        const tol = (l: number, list: number[]) => list.some((m) => Math.abs(l - m) <= sizeTolerance(l));
        const band = !!label.dims && ((tol(label.dims[0], across) && tol(label.dims[1], up)) || (tol(label.dims[0], up) && tol(label.dims[1], across)));
        const ok = !label.dims || sizesMatch(label.dims, bbox) || sizesMatch(label.dims, spans) || band;
        if (!ok) allOk = false;
        const others = list.filter((x) => x.label !== label).map((x) => x.label.name);
        checks.push({ name: label.name, roomId, labelled: label.dims, bbox, spans, ok, bboxOk: !!label.dims && sizesMatch(label.dims, bbox), sharedWith: others.length ? others : undefined });
        if (!ok && list.length === 1) {
          issues.push({
            severity: 'warning',
            code: 'room-size-mismatch',
            message: `"${label.name}" is labelled ${label.dims![0]} x ${label.dims![1]} mm but measures ${bbox[0]} x ${bbox[1]} mm.`,
            refs: [roomId],
            at: room.seed,
          });
        }
      }
      if (list.length > 1) {
        issues.push({
          severity: 'info',
          code: 'open-plan',
          message: `${list.map((x) => `"${x.label.name}"`).join(', ')} have no wall between them and were imported as one room named "${joined}".`,
          refs: [roomId],
          at: room.seed,
        });
      }
      confidence[roomId] = list.length > 1 ? 0.7 : allOk ? 0.95 : 0.6;
    }
  }

  // Rooms without a label: guess from what is drawn inside them.
  const unnamed = Object.values(level.rooms).filter((r) => !named.has(r.id));
  if (unnamed.length > 0) {
    const marks: { p: Pt; kitchen: boolean }[] = [];
    ex.segs.forEach((seg, i) => {
      if (i % 3 !== 0 || an.roles[seg.layer] !== 'fixture') return;
      marks.push({ p: toPlan({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }), kitchen: isKitchenLayer(ex.layers[seg.layer]!) });
    });
    const info = unnamed
      .map((room) => {
        const g = geomOf(room.id);
        if (!g) return null;
        let wet = 0;
        let kitchen = 0;
        for (const m of marks) {
          if (!vec.pointInPolygon(m.p, g.polygon)) continue;
          if (m.kitchen) kitchen++;
          else wet++;
        }
        return { room, g, wet, kitchen, edges: edgeKinds(g), area: g.interiorArea / 1e6 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const hasLiving = Object.values(level.rooms).some((r) => named.has(r.id) && r.type === 'living');
    const largest = [...info].filter((x) => x.edges.rail < 0.15 && x.edges.low < 0.15).sort((m, n) => n.area - m.area)[0];
    const counters = new Map<RoomType, number>();
    for (const x of info.sort((m, n) => n.area - m.area)) {
      let type: RoomType = 'other';
      if (x.edges.rail >= 0.15) type = 'balcony';
      else if (x.edges.low >= 0.15) type = x.wet + x.kitchen > 5 || x.area < 4.5 ? 'utility' : 'balcony';
      else if (x.kitchen >= 8 && x.kitchen >= x.wet) type = 'kitchen';
      else if (x.wet >= 12 && x.area < 8) type = 'bathroom';
      else if (!hasLiving && x === largest && x.area >= 9) type = 'living';
      else if (x.area >= 7) type = 'bedroom';
      else if (x.area < 2.5) type = 'storage';
      const shaft = Math.min(x.g.width, x.g.depth) < 600;
      if (shaft) type = 'other';
      const n = (counters.get(type) ?? 0) + 1;
      counters.set(type, n);
      x.room.type = type;
      x.room.name = shaft ? `Shaft ${n}` : type === 'living' || type === 'kitchen' ? TYPE_NAMES[type] : `${TYPE_NAMES[type]} ${n}`;
      x.room.floorMaterial = defaultFloorFor(type);
      confidence[x.room.id] = type === 'other' ? 0.3 : 0.5;
    }
    // The room a utility opens from is the kitchen.
    const openWalls = new Set(Object.values(level.openings).map((o) => o.wallId));
    for (const u of info.filter((x) => x.room.type === 'utility')) {
      const shared = new Set(u.g.edgeWalls.filter((id) => openWalls.has(id)));
      const next = info.find((x) => x !== u && x.room.type === 'bedroom' && x.area < 14 && x.g.edgeWalls.some((id) => shared.has(id)));
      const taken = Object.values(level.rooms).some((r) => r.type === 'kitchen');
      if (next && !taken) {
        next.room.type = 'kitchen';
        next.room.name = TYPE_NAMES.kitchen;
        next.room.floorMaterial = defaultFloorFor('kitchen');
      }
    }
    if (vision) {
      issues.push({
        severity: 'info',
        code: 'rooms-unlabelled',
        message: `${unnamed.length} closed area${unnamed.length === 1 ? ' has' : 's have'} no label on the drawing; ${unnamed.length === 1 ? 'its type was' : 'their types were'} guessed.`,
        refs: unnamed.map((r) => r.id),
      });
    }
  }

  // Door and window tags read from the drawing ("D2", "W1"): attach each to the nearest opening.
  if (vision?.tags.length) {
    const frames = Object.values(level.openings).map((o) => {
      const w = level.walls[o.wallId]!;
      const { a, b } = ops.wallEnds(level, w);
      return { o, at: vec.lerp(a, b, o.offset / Math.max(1, vec.dist(a, b))) };
    });
    for (const tag of vision.tags) {
      if (tag.kind === 'other') continue;
      const at = toPlan(labelPage(tag.point));
      const want = tag.kind === 'door' ? ['door', 'sliding', 'passage'] : ['window', 'sliding'];
      const near = frames
        .filter((f) => !f.o.tag && want.includes(f.o.kind))
        .map((f) => ({ f, d: vec.dist(f.at, at) }))
        .sort((m, n) => m.d - n.d)[0];
      if (!near || near.d > 900) continue;
      near.f.o.tag = tag.text;
      // A tagged door with no swing drawn (pocket or sliding leaf) was read as a bare gap.
      if (tag.kind === 'door' && near.f.o.kind === 'passage' && near.f.o.width <= 1300) {
        near.f.o.kind = 'door';
        near.f.o.hinge = 'a';
        near.f.o.swing = 1;
        near.f.o.height = DEFAULTS.doorHeight;
      }
    }
  }

  // A wide glazed opening onto a balcony is a sliding door, not a window.
  const balconyWalls = new Set<Id>();
  for (const g of geoms) {
    const room = g.roomId ? level.rooms[g.roomId] : undefined;
    if (room?.type === 'balcony') for (const id of g.edgeWalls) balconyWalls.add(id);
  }
  for (const o of Object.values(level.openings)) {
    if (o.kind === 'window' && o.width >= 1500 && balconyWalls.has(o.wallId)) {
      o.kind = 'sliding';
      o.sill = 0;
      o.height = Math.min(DEFAULTS.slidingHeight, level.walls[o.wallId]!.height);
    }
  }

  /* ---------------------------------------------------------------- issues */
  if (an.mode === 'none') {
    issues.push({
      severity: 'warning',
      code: 'no-vectors',
      message: 'This PDF has no usable line work (it looks like a scan). The page is attached as a backdrop: trace the plan over it in the editor.',
    });
  } else {
    if (an.mode === 'weights') {
      issues.push({
        severity: 'warning',
        code: 'no-layers',
        message: 'The PDF has no CAD layers that identify walls. Walls were guessed from the heaviest lines; doors and windows may be missing.',
      });
    }
    if (Object.keys(level.walls).length === 0) {
      issues.push({ severity: 'warning', code: 'no-walls', message: 'No walls were recognised. Pick the wall layer in the layer table, or trace the plan in the editor.' });
    } else if (Object.keys(level.rooms).length === 0) {
      issues.push({ severity: 'warning', code: 'no-rooms', message: 'Walls were found but none of them close a room. Close the gaps in the editor.' });
    }
  }
  if (!vision && an.mode !== 'none') {
    issues.push({ severity: 'info', code: 'vector-only', message: 'Room names and types were guessed from the line work alone.' });
  }

  // plan mm -> page frame -> PDF user space.
  const u = ex.userFromPage ?? [1, 0, 0, 1, 0, 0];
  const planToPdf: Mat2x3 = [u[0] / s, u[1] / s, u[2] / s, u[3] / s, u[0] * ox + u[2] * oy + u[4], u[1] * ox + u[3] * oy + u[5]];
  const draft: PlanDraft = {
    level,
    scale,
    confidence,
    issues,
    layers: an.layers,
    underlay: buildUnderlay(ex, an, toPlan),
    suggestedItems: [],
    source: { fileName: opts.fileName, mmPerPdfUnit: s, planToPdf },
  };
  return { draft, checks, candidates, origin: { x: ox, y: oy } };
}

/** Plan mm from pixels of a page raster of the given size (origin top-left). */
export function planFromImage(origin: P2, mmPerUnit: number, page: { width: number; height: number }, widthPx: number, heightPx: number): Mat2x3 {
  const s = mmPerUnit;
  return [(s * page.width) / widthPx, 0, 0, (-s * page.height) / heightPx, -origin.x * s, (page.height - origin.y) * s];
}
