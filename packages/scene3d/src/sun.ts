/**
 * Where the sun stands for the walk view, per home and per lighting preset: high and a
 * little to the side by day, low and raking at golden hour, always from the side the
 * home's glazing faces, so sunlight actually falls into the rooms that matter (the living
 * room by day, the bedrooms in the evening). Pure: runs in Node.
 */
import { openingFrame, vec, type Id, type Level, type Pt, type RoomGeom, type RoomType } from '@interio/core';
import type { LightingPreset } from './lighting';

/** An opening between a room and the outside (balconies count as outside). */
export interface Glazing {
  openingId: Id;
  roomId: Id;
  roomType: RoomType;
  /** Plan point at the middle of the opening, mm. */
  center: Pt;
  /** Unit plan normal pointing out of the room. */
  outward: Pt;
  /** Along the wall, unit. */
  dir: Pt;
  /** Glass area, mm2. */
  area: number;
  width: number;
  sill: number;
  height: number;
  kind: 'window' | 'sliding' | 'door';
  /** Wall thickness, mm. */
  thickness: number;
}

/**
 * Every window, sliding door and glazed door on an outside wall, with the room it lights
 * and which way is out. Passages and interior openings are left out.
 */
export function exteriorGlazing(level: Level, rooms: RoomGeom[]): Glazing[] {
  const out: Glazing[] = [];
  const roomAt = (p: Pt) => rooms.find((r) => r.roomId !== null && vec.pointInPolygon(p, r.polygon));
  const outdoors = (r: RoomGeom | undefined) => !r || level.rooms[r.roomId!]?.type === 'balcony';
  for (const o of Object.values(level.openings)) {
    if (o.kind === 'passage') continue;
    const f = openingFrame(level, o.id);
    if (!f) continue;
    const probe = f.thickness / 2 + 200;
    const front = roomAt(vec.add(f.center, vec.scale(f.normal, probe)));
    const back = roomAt(vec.sub(f.center, vec.scale(f.normal, probe)));
    let inside: RoomGeom | undefined;
    let outward: Pt;
    if (outdoors(front) && !outdoors(back)) {
      inside = back;
      outward = f.normal;
    } else if (outdoors(back) && !outdoors(front)) {
      inside = front;
      outward = vec.scale(f.normal, -1);
    } else continue;
    const room = inside?.roomId ? level.rooms[inside.roomId] : undefined;
    if (!room) continue;
    out.push({
      openingId: o.id,
      roomId: room.id,
      roomType: room.type,
      center: f.center,
      outward,
      dir: f.dir,
      area: o.width * o.height,
      width: o.width,
      sill: o.sill,
      height: o.height,
      kind: o.kind,
      thickness: f.thickness,
    });
  }
  return out;
}

/** How much each kind of room's glazing counts when aiming the sun, per preset. */
const AIM: Record<'day' | 'evening', Partial<Record<RoomType, number>>> = {
  // By day the sun lands on the living floor, as in the reference's living room.
  day: { living: 1, dining: 1, kitchen: 0.35, study: 0.35, bedroom: 0.25 },
  // At golden hour it rakes across the beds.
  evening: { bedroom: 1, living: 0.45, dining: 0.45, study: 0.2 },
};

/** Height of the sun above the horizon, degrees: high and soft by day, low and warm for golden hour. */
export const SUN_ELEVATION: Record<'day' | 'evening', number> = { day: 42, evening: 13 };

/** World direction towards the sun for an azimuth (radians, `atan2(z, x)`) and elevation (degrees). */
export function sunVector(azimuth: number, elevationDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(azimuth), Math.sin(e), Math.cos(e) * Math.sin(azimuth)];
}

/** World azimuth (`atan2(z, x)`) of a plan direction: world X = plan x, world Z = -plan y. */
export const planAzimuth = (d: Pt): number => Math.atan2(-d.y, d.x);

/**
 * How well light from a horizontal sun direction falls through one opening. Straight in
 * scores less than at an angle: an oblique sun throws a long, raking patch across the
 * floor and up the side wall, which is what reads as sunlight in a picture.
 */
function through(sunPlan: Pt, g: Glazing): number {
  const d = vec.dot(sunPlan, g.outward);
  if (d <= 0) return 0;
  return d * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - d * d)));
}

export interface SunPlan {
  /** Points from the scene towards the sun (world, unit). */
  direction: [number, number, number];
  /** World azimuth of the sun, radians (`atan2(z, x)`). */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
}

/** The fixed directions the views used before the sun followed the plan (south-west by day, low in the west at evening). */
const FALLBACK: Record<'day' | 'evening', [number, number, number]> = {
  day: [-0.55, 1, 0.45],
  evening: [-1, 0.42, 0.3],
};

/**
 * The sun for a home and a preset: the azimuth (sampled every 5 degrees) that sends the
 * most light through the glazing of the rooms that matter at that time of day. Night
 * gets the evening's direction (it only matters for the moon). Without any outside
 * glazing, the old fixed directions.
 */
export function planSun(glazing: Glazing[], preset: LightingPreset): SunPlan {
  const time = preset === 'daylight' ? 'day' : 'evening';
  const weights = AIM[time];
  const elevation = SUN_ELEVATION[time];
  let best = -1;
  let bestScore = 0;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * 2 * Math.PI;
    // Plan direction for world azimuth a: world (cos a, sin a) is plan (cos a, -sin a).
    const sunPlan = { x: Math.cos(a), y: -Math.sin(a) };
    let score = 0;
    for (const g of glazing) score += (weights[g.roomType] ?? 0.1) * g.area * through(sunPlan, g);
    if (score > bestScore + 1e-6) {
      bestScore = score;
      best = a;
    }
  }
  if (best < 0) {
    const [x, y, z] = FALLBACK[time];
    const azimuth = Math.atan2(z, x);
    const l = Math.hypot(x, y, z);
    return { direction: [x / l, y / l, z / l], azimuth, elevation: (Math.asin(y / l) * 180) / Math.PI };
  }
  return { direction: sunVector(best, elevation), azimuth: best, elevation };
}
