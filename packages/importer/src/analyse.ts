/**
 * Runs the geometry stages on an extracted page: roles -> crop -> strips ->
 * doors and glazing -> connected runs. Output stays in page units.
 */
import type { LayerInfo, LayerRole } from '@interio/core';
import { findDoors, type DoorSymbol } from './doors';
import type { Curve, Extracted, Seg } from './extract';
import { assignRoles, lowWallKind, nominalThickness } from './roles';
import { Dirs, dominantThickness, mergeStacked, pairStrips, type Strip } from './strips';
import { buildRuns, makeWallSupport, type Run } from './topology';

export type AnalysisMode = 'layers' | 'weights' | 'none';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Analysis {
  mode: AnalysisMode;
  roles: LayerRole[];
  layers: LayerInfo[];
  dirs: Dirs;
  /** Dominant wall thickness in page units (0 when no walls were found). */
  T: number;
  /** Wall thickness named by the wall layer, mm. */
  nominalWall: number | null;
  runs: Run[];
  doors: DoorSymbol[];
  /** Region of the page that holds the plan. */
  crop: Box;
  wallStrips: Strip[];
}

const inBox = (s: { x1: number; y1: number; x2: number; y2: number }, b: Box): boolean =>
  Math.min(s.x1, s.x2) >= b.minX && Math.max(s.x1, s.x2) <= b.maxX && Math.min(s.y1, s.y2) >= b.minY && Math.max(s.y1, s.y2) <= b.maxY;

const curveInBox = (c: Curve, b: Box): boolean =>
  c.p[0] >= b.minX && c.p[0] <= b.maxX && c.p[1] >= b.minY && c.p[1] <= b.maxY && c.p[6] >= b.minX && c.p[6] <= b.maxX && c.p[7] >= b.minY && c.p[7] <= b.maxY;

function boundsOf(segs: Seg[]): Box {
  const b: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of segs) {
    b.minX = Math.min(b.minX, s.x1, s.x2);
    b.minY = Math.min(b.minY, s.y1, s.y2);
    b.maxX = Math.max(b.maxX, s.x1, s.x2);
    b.maxY = Math.max(b.maxY, s.y1, s.y2);
  }
  return b;
}

const segLen = (s: Seg): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Keeps the heavy pen: segments at least `ratio` times as wide as the width carrying the most length. */
function heavyOnly(segs: Seg[], ratio = 0.6): Seg[] {
  const byWidth = new Map<number, number>();
  for (const s of segs) {
    const k = Math.round(s.width * 100);
    byWidth.set(k, (byWidth.get(k) ?? 0) + segLen(s));
  }
  let dominant = 0;
  let most = -1;
  for (const [k, l] of byWidth) {
    if (l > most) {
      most = l;
      dominant = k / 100;
    }
  }
  return dominant > 0 ? segs.filter((s) => s.width >= ratio * dominant) : segs;
}

/** No usable layers: walls are whatever is drawn with the heaviest pen that carries real length. */
function heaviestClass(segs: Seg[], page: { width: number; height: number }): Seg[] {
  // Sheet borders and title-block rules run most of the page.
  const body = segs.filter((s) => {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    return dx < 0.7 * page.width && dy < 0.7 * page.height && s.width > 0;
  });
  const total = body.reduce((sum, s) => sum + segLen(s), 0);
  if (total === 0) return [];
  const byWidth = new Map<number, number>();
  for (const s of body) {
    const k = Math.round(s.width * 100);
    byWidth.set(k, (byWidth.get(k) ?? 0) + segLen(s));
  }
  const classes = [...byWidth].filter(([, l]) => l >= 0.04 * total).sort((a, b) => b[0] - a[0]);
  if (classes.length < 2) return body;
  const heavy = classes[0]![0] / 100;
  return body.filter((s) => s.width >= 0.8 * heavy);
}

export function analyse(ex: Extracted, overrides?: Record<string, LayerRole>): Analysis {
  const roles = assignRoles(ex.layers, overrides);
  const counts = ex.layers.map(() => 0);
  for (const s of ex.segs) counts[s.layer]!++;
  for (const c of ex.curves) counts[c.layer]!++;
  const layers: LayerInfo[] = ex.layers
    .map((name, i) => ({ name, role: roles[i]!, segments: counts[i]! }))
    .filter((l) => l.segments > 0 && l.name !== '');

  const dirs = new Dirs();
  const empty = (mode: AnalysisMode): Analysis => ({
    mode,
    roles,
    layers,
    dirs,
    T: 0,
    nominalWall: null,
    runs: [],
    doors: [],
    crop: { minX: 0, minY: 0, maxX: ex.width, maxY: ex.height },
    wallStrips: [],
  });
  if (ex.segs.length < 12) return empty('none');

  const byRole = (role: LayerRole): Seg[] => ex.segs.filter((s) => roles[s.layer] === role);
  let mode: AnalysisMode = 'layers';
  let wallSegs = heavyOnly(byRole('wall'));
  if (wallSegs.length < 8) {
    mode = 'weights';
    const known = new Set<LayerRole>(['dimension', 'text', 'tag', 'hatch', 'furniture', 'fixture', 'overhead']);
    wallSegs = heaviestClass(
      ex.segs.filter((s) => !known.has(roles[s.layer]!) || overrides?.[ex.layers[s.layer]!] === 'wall'),
      ex,
    );
    if (wallSegs.length < 8) return empty('none');
  }

  const wb = boundsOf(wallSegs);
  const margin = 0.08 * Math.max(wb.maxX - wb.minX, wb.maxY - wb.minY);
  const crop: Box = { minX: wb.minX - margin, minY: wb.minY - margin, maxX: wb.maxX + margin, maxY: wb.maxY + margin };
  if (mode === 'layers') {
    // Balconies hang outside the walls: let railings, doors and windows near the plan widen the crop.
    const reach = 0.3 * Math.max(wb.maxX - wb.minX, wb.maxY - wb.minY);
    const near: Box = { minX: wb.minX - reach, minY: wb.minY - reach, maxX: wb.maxX + reach, maxY: wb.maxY + reach };
    const pad = 0.25 * margin;
    for (const s of ex.segs) {
      const role = roles[s.layer];
      if ((role !== 'lowWall' && role !== 'window' && role !== 'door') || !inBox(s, near)) continue;
      crop.minX = Math.min(crop.minX, Math.min(s.x1, s.x2) - pad);
      crop.minY = Math.min(crop.minY, Math.min(s.y1, s.y2) - pad);
      crop.maxX = Math.max(crop.maxX, Math.max(s.x1, s.x2) + pad);
      crop.maxY = Math.max(crop.maxY, Math.max(s.y1, s.y2) + pad);
    }
  }
  const diag = Math.hypot(wb.maxX - wb.minX, wb.maxY - wb.minY);

  const paired = pairStrips(wallSegs, dirs, { maxT: diag / 35, oriented: 'auto' });
  const T = dominantThickness(paired.strips);
  if (!T) return { ...empty(mode), crop };
  const sized = paired.strips.filter((s) => s.t >= 0.4 * T && s.t <= 2.4 * T);
  const walls = sized.filter((s) => s.u2 - s.u1 >= 0.9 * s.t);
  const stubs = sized.filter((s) => s.u2 - s.u1 < 0.9 * s.t && s.u2 - s.u1 >= 0.3 * T);

  let nominalWall: number | null = null;
  if (mode === 'layers') {
    const votes = new Map<number, number>();
    for (const s of wallSegs) {
      const n = nominalThickness(ex.layers[s.layer]!);
      if (n) votes.set(n, (votes.get(n) ?? 0) + segLen(s));
    }
    let most = 0;
    for (const [n, l] of votes) {
      if (l > most) {
        most = l;
        nominalWall = n;
      }
    }
  }

  // Glazing: window and frame layers draw three or four lines across the wall gap.
  const glazing: { strip: Strip; kind: 'window' | 'glazed' }[] = [];
  const lineStrips = (segs: Seg[], minT: number, minLen: number): Strip[] =>
    mergeStacked(pairStrips(segs, dirs, { maxT: 2.4 * T, oriented: false, minLen: 1.5 * T }).strips, 0.05).filter(
      (s) => s.t >= minT && s.t <= 2.4 * T && s.u2 - s.u1 >= minLen,
    );
  const doorSegs = mode === 'layers' ? byRole('door').filter((s) => inBox(s, crop)) : [];
  if (mode === 'layers') {
    for (const strip of lineStrips(byRole('window').filter((s) => inBox(s, crop)), 0.45 * T, 2 * T)) glazing.push({ strip, kind: 'window' });
    for (const strip of lineStrips(doorSegs, 0.6 * T, 4 * T)) glazing.push({ strip, kind: 'glazed' });
  } else {
    // No layers: light lines that start at a wall end and run on along the wall's line are glazing.
    const heavy = new Set(wallSegs);
    const inGap = ex.segs.filter((s) => {
      if (heavy.has(s) || !inBox(s, crop)) return false;
      const len = segLen(s);
      if (len < 1.5 * T) return false;
      const dir = dirs.index(s.x2 - s.x1, s.y2 - s.y1);
      const c = dirs.c(dir, { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
      const ua = dirs.u(dir, { x: s.x1, y: s.y1 });
      const ub = dirs.u(dir, { x: s.x2, y: s.y2 });
      const lo = Math.min(ua, ub);
      const hi = Math.max(ua, ub);
      return walls.some(
        (w) =>
          w.dir === dir &&
          Math.abs(w.c - c) <= w.t / 2 + 0.25 * T &&
          ((lo >= w.u2 - 0.5 * T && lo <= w.u2 + 1.5 * T) || (hi <= w.u1 + 0.5 * T && hi >= w.u1 - 1.5 * T)),
      );
    });
    for (const strip of lineStrips(inGap, 0.45 * T, 2 * T)) glazing.push({ strip, kind: 'window' });
  }

  const doorCurves = (mode === 'layers' ? ex.curves.filter((c) => roles[c.layer] === 'door') : ex.curves).filter((c) => curveInBox(c, crop));
  const leafLines = mode === 'layers' ? doorSegs : ex.segs.filter((s) => inBox(s, crop));
  const doors = findDoors(doorCurves, leafLines, {
    minR: 2.2 * T,
    maxR: 9 * T,
    wallSupport: makeWallSupport(dirs, T, walls, stubs, glazing.map((g) => g.strip)),
  }).filter((d) => mode === 'layers' || d.confidence >= 0.7);

  const low: { strip: Strip; kind: 'low' | 'railing' }[] = [];
  if (mode === 'layers') {
    for (const kind of ['railing', 'low'] as const) {
      const segs = ex.segs.filter((s) => roles[s.layer] === 'lowWall' && lowWallKind(ex.layers[s.layer]!) === kind && inBox(s, crop));
      if (segs.length === 0) continue;
      const res = pairStrips(segs, dirs, { maxT: 1.6 * T, oriented: false, minLen: 2 * T });
      const strips = mergeStacked(res.strips, 0.05).filter((s) => s.u2 - s.u1 >= 2 * T);
      for (const strip of strips) low.push({ strip, kind });
      for (const single of res.singles) {
        if (single.u2 - single.u1 < 4 * T) continue;
        const covered = strips.some(
          (s) => s.dir === single.dir && Math.abs(s.c - single.c) <= s.t / 2 + 0.75 * T && Math.min(s.u2, single.u2) - Math.max(s.u1, single.u1) > 0,
        );
        if (!covered) low.push({ strip: { dir: single.dir, c: single.c, t: 0.4 * T, u1: single.u1, u2: single.u2 }, kind });
      }
    }
  }

  const centre = { x: (wb.minX + wb.maxX) / 2, y: (wb.minY + wb.maxY) / 2 };
  const runs = buildRuns({ dirs, T, walls, stubs, glazing, doors, low, centre });
  return { mode, roles, layers, dirs, T, nominalWall, runs, doors, crop, wallStrips: walls };
}
