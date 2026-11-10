/**
 * Box layouts for the joinery the wall mesh does not contain: door and window
 * assemblies, railings and skirting boards. Pure maths in metres; `boxes.ts` turns the
 * specs into geometry.
 *
 * Opening and railing parts use a LOCAL frame: origin on the wall centreline at floor
 * level (opening centre / wall midpoint), +X along the wall from vertex a to b, +Y up,
 * +Z towards the wall's RIGHT side (so the left side is -Z). Rotating the frame by the
 * wall's plan angle about world +Y puts it in the world.
 */
import type { Level, LevelMesh, Opening, Wall } from '@interio/core';

export interface BoxSpec {
  /** Size along x, y, z in metres. */
  size: [number, number, number];
  /** Centre of the box. */
  position: [number, number, number];
  /** Rotation about +Y in radians, applied about the box centre. */
  rotationY?: number;
}

export interface OpeningParts {
  kind: Opening['kind'];
  /** Fixed frame: jambs, head, sill, mullions. */
  frame: BoxSpec[];
  /** Door leaves and sliding-panel frames. */
  leaf: BoxSpec[];
  glass: BoxSpec[];
  /** Handles. */
  metal: BoxSpec[];
}

/** How far a hinged door stands open, in degrees. */
export const DOOR_OPEN_DEG = 80;

const DOOR_FRAME = 0.045;
const LEAF_T = 0.04;

/** Rotates a local (x, z) offset about +Y. */
function rotY(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Signed opening angle of a hinged leaf (radians about +Y) that swings the free edge
 * into the requested side: `swing` +1 is the wall's left side (-Z), -1 its right (+Z).
 */
export function doorLeafAngle(hinge: 'a' | 'b', swing: 1 | -1, openDeg = DOOR_OPEN_DEG): number {
  const e = hinge === 'a' ? 1 : -1;
  return (e * swing * openDeg * Math.PI) / 180;
}

function hingedDoor(o: Opening, t: number, h: number, open: boolean): OpeningParts {
  const w = o.width / 1000;
  const f = DOOR_FRAME;
  const depth = t + 0.024; // the lining stands proud of both wall faces
  const frame: BoxSpec[] = [
    { size: [f, h, depth], position: [-w / 2 + f / 2, h / 2, 0] },
    { size: [f, h, depth], position: [w / 2 - f / 2, h / 2, 0] },
    { size: [w - 2 * f, f, depth], position: [0, h - f / 2, 0] },
  ];
  const hinge = o.hinge ?? 'a';
  const swing = o.swing ?? 1;
  const e = hinge === 'a' ? 1 : -1; // direction from the hinge to the latch along +X
  const angle = open ? doorLeafAngle(hinge, swing) : 0;
  const lw = w - 2 * f - 0.006;
  const lh = h - f - 0.01;
  // The leaf hangs flush with the wall face on the side it swings into.
  const pivot: [number, number] = [-e * (w / 2 - f - 0.003), -swing * (depth / 2 - LEAF_T / 2)];
  const at = (x: number, z: number): [number, number] => {
    const [rx, rz] = rotY(x, z, angle);
    return [pivot[0] + rx, pivot[1] + rz];
  };
  const [cx, cz] = at((e * lw) / 2, 0);
  const leaf: BoxSpec[] = [{ size: [lw, lh, LEAF_T], position: [cx, lh / 2 + 0.005, cz], rotationY: angle }];
  const metal: BoxSpec[] = [-1, 1].map((side) => {
    const [hx, hz] = at(e * (lw - 0.09), side * (LEAF_T / 2 + 0.022));
    return { size: [0.13, 0.022, 0.022], position: [hx, 1.0, hz], rotationY: angle } satisfies BoxSpec;
  });
  return { kind: 'door', frame, leaf, glass: [], metal };
}

/** A framed glass panel in the XY plane centred on (cx, cy) at depth z. */
function glazedPanel(cx: number, cy: number, z: number, w: number, h: number, stile: number, depth: number): { frame: BoxSpec[]; glass: BoxSpec } {
  return {
    frame: [
      { size: [stile, h, depth], position: [cx - w / 2 + stile / 2, cy, z] },
      { size: [stile, h, depth], position: [cx + w / 2 - stile / 2, cy, z] },
      { size: [w - 2 * stile, stile, depth], position: [cx, cy + h / 2 - stile / 2, z] },
      { size: [w - 2 * stile, stile, depth], position: [cx, cy - h / 2 + stile / 2, z] },
    ],
    glass: { size: [w - 2 * stile, h - 2 * stile, 0.008], position: [cx, cy, z] },
  };
}

function slidingDoor(o: Opening, t: number, h: number, open: boolean): OpeningParts {
  const w = o.width / 1000;
  const f = 0.05;
  const depth = Math.min(t + 0.02, 0.14);
  const frame: BoxSpec[] = [
    { size: [f, h, depth], position: [-w / 2 + f / 2, h / 2, 0] },
    { size: [f, h, depth], position: [w / 2 - f / 2, h / 2, 0] },
    { size: [w - 2 * f, f, depth], position: [0, h - f / 2, 0] },
    { size: [w - 2 * f, 0.02, depth], position: [0, 0.01, 0] },
  ];
  const clear = w - 2 * f;
  const overlap = 0.05;
  const pw = clear / 2 + overlap / 2;
  const ph = h - f - 0.02;
  const cy = 0.02 + ph / 2;
  const track = 0.022;
  const fixed = glazedPanel(-clear / 2 + pw / 2, cy, -track, pw, ph, 0.05, 0.035);
  // The sliding panel parks over the fixed one when open, leaving half the opening clear.
  const slideX = clear / 2 - pw / 2 - (open ? (clear / 2) * 0.82 : 0);
  const sliding = glazedPanel(slideX, cy, track, pw, ph, 0.05, 0.035);
  const metal: BoxSpec[] = [{ size: [0.02, 0.22, 0.03], position: [slideX - pw / 2 + 0.025, 1.0, track + 0.03] }];
  return { kind: 'sliding', frame, leaf: [...fixed.frame, ...sliding.frame], glass: [fixed.glass, sliding.glass], metal };
}

function windowParts(o: Opening, t: number, sill: number, h: number): OpeningParts {
  const w = o.width / 1000;
  const f = 0.05;
  const depth = Math.min(0.07, t);
  const cy = sill + h / 2;
  const outer = glazedPanel(0, cy, 0, w, h, f, depth);
  const frame = [...outer.frame];
  // One mullion per ~0.9 m of width, so wide windows read as several sashes.
  const bays = Math.max(1, Math.round(w / 0.9));
  for (let i = 1; i < bays; i++) frame.push({ size: [0.04, h - 2 * f, depth], position: [-w / 2 + (w * i) / bays, cy, 0] });
  // Inside window board, just proud of both faces.
  frame.push({ size: [w + 0.06, 0.025, t + 0.05], position: [0, sill - 0.0085, 0] });
  return { kind: 'window', frame, leaf: [], glass: [outer.glass], metal: [] };
}

/**
 * Joinery for one opening in its local frame. `wallThickness` and `wallHeight` are mm.
 * Passages get nothing. `doorsOpen` draws hinged doors swung open and sliding doors parked.
 */
export function openingParts(o: Opening, wallThickness: number, wallHeight: number, doorsOpen = true): OpeningParts | null {
  const t = wallThickness / 1000;
  const sill = Math.min(o.sill, wallHeight) / 1000;
  const h = Math.min(o.sill + o.height, wallHeight) / 1000 - sill;
  if (h < 0.05 || o.width < 100) return null;
  switch (o.kind) {
    case 'door':
      return hingedDoor(o, t, h, doorsOpen);
    case 'sliding':
      return slidingDoor(o, t, h, doorsOpen);
    case 'window':
      return windowParts(o, t, sill, h);
    default:
      return null;
  }
}

export interface RailingParts {
  /** Posts, handrail and bottom rail. */
  metal: BoxSpec[];
  glass: BoxSpec[];
}

/** A glass balustrade along a wall of `length` and `height` (mm), in the wall's local frame (origin at its midpoint). */
export function railingParts(length: number, height: number, maxBay = 1250): RailingParts {
  const l = length / 1000;
  const h = height / 1000;
  const post = 0.045;
  const bays = Math.max(1, Math.ceil(l / (maxBay / 1000)));
  const metal: BoxSpec[] = [];
  const glass: BoxSpec[] = [];
  for (let i = 0; i <= bays; i++) metal.push({ size: [post, h - 0.04, post], position: [-l / 2 + (l * i) / bays, (h - 0.04) / 2, 0] });
  metal.push({ size: [l + post, 0.04, 0.065], position: [0, h - 0.02, 0] });
  metal.push({ size: [l, 0.03, 0.03], position: [0, 0.075, 0] });
  const bay = l / bays;
  for (let i = 0; i < bays; i++) {
    glass.push({ size: [bay - post - 0.02, h - 0.2, 0.012], position: [-l / 2 + bay * (i + 0.5), 0.09 + (h - 0.2) / 2, 0] });
  }
  return { metal, glass };
}

export const SKIRTING_HEIGHT = 0.08;
const SKIRTING_DEPTH = 0.012;

/**
 * Skirting boards in WORLD space: a strip along the foot of every full-height wall face
 * that looks into a room, broken at doors and passages.
 */
export function skirtingBoxes(level: Level, mesh: LevelMesh): BoxSpec[] {
  const boxes: BoxSpec[] = [];
  const openings = Object.values(level.openings);
  for (const g of mesh.groups) {
    if (g.kind !== 'wallSide' || !g.wallId || !g.roomId || g.wallKind !== 'wall') continue;
    if (level.rooms[g.roomId]?.type === 'balcony') continue;
    const wall: Wall | undefined = level.walls[g.wallId];
    const a = wall && level.vertices[wall.a];
    const b = wall && level.vertices[wall.b];
    if (!wall || !a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const sign = g.side === 'left' ? 1 : -1;
    // Extent of this face along the wall, read from the mesh so mitred corners are respected.
    let s0 = Infinity;
    let s1 = -Infinity;
    const p = g.geometry.positions;
    for (let i = 0; i < p.length; i += 3) {
      const s = (p[i]! * 1000 - a.x) * dx + (-p[i + 2]! * 1000 - a.y) * dy;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
    }
    if (!(s1 - s0 > 1)) continue;
    const gaps = openings
      .filter((o) => o.wallId === wall.id && o.sill < SKIRTING_HEIGHT * 1000)
      .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
      .sort((m, n) => m[0] - n[0]);
    const runs: [number, number][] = [];
    let cursor = s0;
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) runs.push([cursor, Math.min(g0, s1)]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < s1) runs.push([cursor, s1]);
    const off = sign * (wall.thickness / 2 + (SKIRTING_DEPTH * 1000) / 2);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 20) continue;
      const mid = (r0 + r1) / 2;
      const x = a.x + dx * mid - dy * off;
      const y = a.y + dy * mid + dx * off;
      boxes.push({
        size: [(r1 - r0) / 1000, SKIRTING_HEIGHT, SKIRTING_DEPTH],
        position: [x / 1000, SKIRTING_HEIGHT / 2, -y / 1000],
        rotationY: Math.atan2(dy, dx),
      });
    }
  }
  return boxes;
}

export const STUB_HEIGHT = 0.1;

/**
 * Low plinths in WORLD space along every full-height wall, broken at doors and
 * passages. They sit just inside the wall, so they only show when the wall above is
 * cut away, and then read as the plan's wall lines.
 */
export function stubBoxes(level: Pick<Level, 'walls' | 'vertices' | 'openings'>): BoxSpec[] {
  const degree = new Map<string, number>();
  for (const w of Object.values(level.walls)) {
    degree.set(w.a, (degree.get(w.a) ?? 0) + 1);
    degree.set(w.b, (degree.get(w.b) ?? 0) + 1);
  }
  const openings = Object.values(level.openings);
  const boxes: BoxSpec[] = [];
  for (const wall of Object.values(level.walls)) {
    if (wall.kind !== 'wall') continue;
    const a = level.vertices[wall.a];
    const b = level.vertices[wall.b];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    // Run into the corner where other walls meet this one, so stubs join up.
    const from = (degree.get(wall.a) ?? 0) > 1 ? -wall.thickness / 2 : 0;
    const to = len + ((degree.get(wall.b) ?? 0) > 1 ? wall.thickness / 2 : 0);
    const gaps = openings
      .filter((o) => o.wallId === wall.id && o.sill <= 0)
      .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
      .sort((m, n) => m[0] - n[0]);
    let cursor = from;
    const runs: [number, number][] = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cursor) runs.push([cursor, Math.min(g0, to)]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < to) runs.push([cursor, to]);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 10) continue;
      const mid = (r0 + r1) / 2;
      boxes.push({
        size: [(r1 - r0) / 1000, STUB_HEIGHT, Math.max(0.01, wall.thickness / 1000 - 0.006)],
        position: [(a.x + dx * mid) / 1000, STUB_HEIGHT / 2, -(a.y + dy * mid) / 1000],
        rotationY: Math.atan2(dy, dx),
      });
    }
  }
  return boxes;
}
