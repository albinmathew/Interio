/**
 * Lighting presets: which lights a scene gets at a time of day, and where the interior
 * lamps go. Pure data and maths (no three.js), so it runs in Node; `SceneLighting.tsx`
 * turns the result into lights.
 */
import { vec, type CatalogEntry, type Item, type Level, type RoomGeom } from '@interio/core';

export const LIGHTING_PRESETS = ['daylight', 'evening', 'night'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export const DEFAULT_LIGHTING_PRESET: LightingPreset = 'daylight';

/** Key of the preset in `project.settings`. */
export const LIGHTING_SETTING = 'viewer3d.lighting';

export const LIGHTING_LABELS: Record<LightingPreset, string> = {
  daylight: 'Daylight',
  evening: 'Warm evening',
  night: 'Night',
};

/** Any stored value -> a preset. Unknown or missing values are daylight. */
export function resolveLightingPreset(value: unknown): LightingPreset {
  return LIGHTING_PRESETS.find((p) => p === value) ?? DEFAULT_LIGHTING_PRESET;
}

/** The preset saved with a project (`project.settings`). */
export function lightingFromSettings(settings: Record<string, unknown> | null | undefined): LightingPreset {
  return resolveLightingPreset(settings?.[LIGHTING_SETTING]);
}

export type LightingMode = 'dollhouse' | 'interior';

export interface LightingRig {
  /** Backdrop of the dollhouse view, sky colour seen through windows when walking. */
  background: string;
  /** Strength of the image-based light. */
  environment: number;
  hemisphere: { sky: string; ground: string; intensity: number };
  /** Flat fill. 0 for none. */
  ambient: number;
  /** Light bounced off the floor (shines straight up). 0 for none. */
  bounce: { color: string; intensity: number };
  /** Sun or moon. `direction` points from the scene towards the light. Null: no directional light. */
  sun: { color: string; intensity: number; direction: [number, number, number] } | null;
  /** Lamps inside the rooms. Null: none (the daylight dollhouse). */
  lamps: { color: string; scale: number; fromItems: boolean } | null;
}

/** From the south-west (plan -x, -y), fairly high, so it reaches into rooms through southern and western openings. */
const DAY_SUN: [number, number, number] = [-0.55, 1, 0.45];
/** Low in the west: long shadows and deep streaks through the windows. */
const EVENING_SUN: [number, number, number] = [-1, 0.42, 0.3];
const MOON: [number, number, number] = [-0.4, 1, 0.55];

const DAY_LAMP = '#fff1dc';
const WARM_LAMP = '#ffe0ba';

/**
 * The lights of a preset. `hasEnv` is false while the HDRI is loading or missing: the
 * fill lights are then a little stronger. Daylight is the look the product shipped with.
 */
export function lightingRig(preset: LightingPreset, mode: LightingMode, hasEnv = true): LightingRig {
  if (mode === 'dollhouse') {
    switch (preset) {
      case 'evening':
        return {
          background: '#ecdccb',
          environment: 0.16,
          hemisphere: { sky: '#ffd9b3', ground: '#8f7a69', intensity: hasEnv ? 0.34 : 0.5 },
          ambient: 0,
          bounce: { color: '#ffffff', intensity: 0 },
          sun: { color: '#ffa262', intensity: 1.25, direction: EVENING_SUN },
          lamps: { color: WARM_LAMP, scale: 0.55, fromItems: true },
        };
      case 'night':
        return {
          background: '#171c25',
          environment: 0.035,
          hemisphere: { sky: '#93a8cc', ground: '#20242c', intensity: hasEnv ? 0.2 : 0.26 },
          ambient: 0,
          bounce: { color: '#ffffff', intensity: 0 },
          sun: { color: '#a9c0e8', intensity: 0.28, direction: MOON },
          lamps: { color: WARM_LAMP, scale: 1, fromItems: true },
        };
      default:
        return {
          background: '#f4f2ee',
          environment: 0.4,
          hemisphere: { sky: '#fffaf2', ground: '#cfc6b8', intensity: hasEnv ? 0.55 : 0.9 },
          ambient: 0,
          bounce: { color: '#ffffff', intensity: 0 },
          sun: { color: '#fff2df', intensity: hasEnv ? 1.7 : 1.6, direction: DAY_SUN },
          lamps: null,
        };
    }
  }
  switch (preset) {
    case 'evening':
      return {
        background: '#f0c49c',
        environment: 0.1,
        hemisphere: { sky: '#ffe9d4', ground: '#cdb39a', intensity: hasEnv ? 0.5 : 0.6 },
        ambient: hasEnv ? 0.1 : 0.22,
        bounce: { color: '#ffdfbb', intensity: 0.34 },
        sun: { color: '#ff9d58', intensity: 1.9, direction: EVENING_SUN },
        lamps: { color: WARM_LAMP, scale: 0.6, fromItems: true },
      };
    case 'night':
      return {
        background: '#0d121b',
        environment: 0.02,
        // The warm ground colour and the bounce stand in for lamplight reflected off floors onto the ceilings.
        hemisphere: { sky: '#6f7b90', ground: '#c9a882', intensity: hasEnv ? 0.2 : 0.26 },
        ambient: hasEnv ? 0.04 : 0.08,
        bounce: { color: '#ffd9ad', intensity: 0.3 },
        sun: null,
        lamps: { color: WARM_LAMP, scale: 0.95, fromItems: true },
      };
    default:
      return {
        background: '#dfe9f1',
        environment: 0.22,
        hemisphere: { sky: '#ffffff', ground: '#efe7da', intensity: hasEnv ? 0.75 : 0.9 },
        ambient: hasEnv ? 0.18 : 0.45,
        bounce: { color: '#fff4e4', intensity: 0.6 },
        sun: { color: '#fff0d8', intensity: 2.6, direction: DAY_SUN },
        lamps: { color: DAY_LAMP, scale: 1, fromItems: false },
      };
  }
}

export interface PointLightSpec {
  key: string;
  /** World metres. */
  position: [number, number, number];
  intensity: number;
  distance: number;
  decay: number;
  /** `room`: a ceiling light the room gets by default. `lamp`: a placed catalog item. */
  source: 'room' | 'lamp';
  roomKey: string;
}

/** Most point lights a scene gets from `interiorLights`: every one is paid for by every lit pixel. */
export const MAX_INTERIOR_LIGHTS = 12;

type LampKind = 'ceiling' | 'spot' | 'floor' | 'table' | 'wall';

/** What kind of lamp a catalog entry is, or null when it gives no light. */
export function lampKind(entry: CatalogEntry | undefined): LampKind | null {
  if (!entry || entry.category !== 'lighting') return null;
  if (entry.anchor === 'ceiling') return Math.max(entry.dims.w, entry.dims.d) < 200 ? 'spot' : 'ceiling';
  if (entry.anchor === 'wall') return 'wall';
  return entry.dims.h >= 1000 ? 'floor' : 'table';
}

/** Local pools of light: candela-ish intensity and reach in metres. */
const SMALL_LAMPS: Record<Exclude<LampKind, 'ceiling'>, { intensity: number; distance: number }> = {
  spot: { intensity: 1.6, distance: 4.5 },
  floor: { intensity: 2.4, distance: 5 },
  wall: { intensity: 1.3, distance: 3.8 },
  table: { intensity: 1, distance: 3.2 },
};

function roomKeyOf(room: RoomGeom, index: number): string {
  return room.roomId ?? `face-${index}`;
}

/** Index of the room an item stands in: its own `roomId` when that still exists, else the room around it. */
function roomIndexOf(rooms: RoomGeom[], item: Item): number {
  const own = item.roomId ? rooms.findIndex((r) => r.roomId === item.roomId) : -1;
  return own >= 0 ? own : rooms.findIndex((r) => vec.pointInPolygon(item, r.polygon));
}

export interface InteriorLightOptions {
  /** Multiplier on every light. Default 1. */
  scale?: number;
  /** Lamps from the catalog light their room; without it every room gets a plain ceiling light. */
  resolveEntry?: (catalogId: string) => CatalogEntry | undefined;
  /** Upper bound on the number of lights. Default unlimited (a light per room, as daylight always had). */
  max?: number;
}

/**
 * Point lights for the inside of a home. Every room gets a ceiling light sized to the
 * room. With `resolveEntry`, lamps placed from the catalog take over: a ceiling lamp or
 * pendant replaces the room's default light, floor, table and wall lamps add local
 * pools next to a dimmed default light. When there are more lights than `max`, each
 * room keeps its main light (largest rooms first) and the weakest extras go.
 */
export function interiorLights(
  level: Pick<Level, 'items' | 'ceilingHeight'>,
  rooms: RoomGeom[],
  opts: InteriorLightOptions = {},
): PointLightSpec[] {
  const scale = opts.scale ?? 1;
  const ceilingY = (level.ceilingHeight - 250) / 1000;

  const lamps = new Map<number, { item: Item; entry: CatalogEntry; kind: LampKind }[]>();
  if (opts.resolveEntry) {
    for (const item of Object.values(level.items)) {
      const entry = opts.resolveEntry(item.catalogId);
      const kind = lampKind(entry);
      if (!entry || !kind) continue;
      const index = roomIndexOf(rooms, item);
      if (index < 0) continue;
      const list = lamps.get(index) ?? [];
      list.push({ item, entry, kind });
      lamps.set(index, list);
    }
  }

  const main: { light: PointLightSpec; area: number }[] = [];
  const extra: PointLightSpec[] = [];
  rooms.forEach((room, index) => {
    const roomKey = roomKeyOf(room, index);
    const reach = Math.max(room.width, room.depth) / 1000;
    const base = { intensity: reach * 1.25 * scale, distance: reach * 1.6 + 2, decay: 1.5, roomKey };
    const own = lamps.get(index) ?? [];
    const overhead = own.filter((l) => l.kind === 'ceiling');
    const lights: PointLightSpec[] = [];
    // Several ceiling lamps share the room between them.
    const share = overhead.length > 1 ? 1.5 / overhead.length : 1;
    for (const { item } of overhead) {
      // Below the fitting, and never so close to the ceiling that it burns a hot spot into it.
      const y = Math.min((item.z - 100) / 1000, ceilingY);
      lights.push({ ...base, key: `lamp:${item.id}`, source: 'lamp', position: [item.x / 1000, y, -item.y / 1000], intensity: base.intensity * share });
    }
    if (overhead.length === 0) {
      // Other lamps carry part of the room, so its own light steps back.
      lights.push({
        ...base,
        key: `room:${roomKey}`,
        source: 'room',
        position: [room.centroid.x / 1000, ceilingY, -room.centroid.y / 1000],
        intensity: base.intensity * (own.length ? 0.5 : 1),
      });
    }
    for (const { item, entry, kind } of own) {
      if (kind === 'ceiling') continue;
      const s = item.scale ?? 1;
      const h = entry.dims.h * s;
      const spec = SMALL_LAMPS[kind];
      let { x, y } = item;
      let z = item.z + h * 0.82;
      if (kind === 'spot') z = Math.min(item.z - 100, level.ceilingHeight - 250);
      if (kind === 'wall') {
        // In front of the fitting (the front faces plan -y at 0 degrees), clear of the wall.
        const a = (item.rotationDeg * Math.PI) / 180;
        const out = (entry.dims.d * s) / 2 + 120;
        x += Math.sin(a) * out;
        y -= Math.cos(a) * out;
        z = item.z + h / 2;
      }
      extra.push({
        key: `lamp:${item.id}`,
        source: 'lamp',
        roomKey,
        position: [x / 1000, z / 1000, -y / 1000],
        intensity: spec.intensity * scale,
        distance: spec.distance,
        decay: 2,
      });
    }
    const [first, ...rest] = lights.sort((a, b) => b.intensity - a.intensity);
    if (first) main.push({ light: first, area: room.interiorArea });
    extra.push(...rest);
  });

  main.sort((a, b) => b.area - a.area);
  extra.sort((a, b) => b.intensity - a.intensity);
  const all = [...main.map((m) => m.light), ...extra];
  return opts.max === undefined ? all : all.slice(0, Math.max(0, opts.max));
}

/**
 * Number of light slots to mount for `count` lights: rounded up to a multiple of four
 * (unused slots are dark), so adding or removing one lamp does not recompile every
 * material in the scene.
 */
export function lightSlots(count: number, max = MAX_INTERIOR_LIGHTS): number {
  return Math.min(Math.max(max, 0), Math.ceil(count / 4) * 4);
}
