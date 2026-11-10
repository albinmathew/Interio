import { getEntry } from '@interio/catalog';
import { createSampleLevel, deriveRooms, type Item, type Level } from '@interio/core';
import { describe, expect, it } from 'vitest';
import {
  LIGHTING_PRESETS,
  LIGHTING_SETTING,
  MAX_INTERIOR_LIGHTS,
  interiorLights,
  lampKind,
  lightSlots,
  lightingFromSettings,
  lightingRig,
  resolveLightingPreset,
} from '../src/lighting';
import { openingParts } from '../src/parts';

const level = createSampleLevel();
const rooms = deriveRooms(level);
const roomNamed = (name: string) => {
  const room = Object.values(level.rooms).find((r) => r.name === name)!;
  return { room, geom: rooms.find((g) => g.roomId === room.id)! };
};

let n = 0;
const item = (catalogId: string, x: number, y: number, extra: Partial<Item> = {}): Item => {
  const entry = getEntry(catalogId)!;
  return { id: `i${++n}`, catalogId, x, y, z: entry.mountHeight ?? 0, rotationDeg: 0, ...extra };
};
const withItems = (...items: Item[]): Pick<Level, 'items' | 'ceilingHeight'> => ({
  ceilingHeight: level.ceilingHeight,
  items: Object.fromEntries(items.map((i) => [i.id, i])),
});

describe('preset resolution', () => {
  it('accepts the three presets and falls back to daylight for anything else', () => {
    for (const p of LIGHTING_PRESETS) expect(resolveLightingPreset(p)).toBe(p);
    for (const bad of [undefined, null, '', 'dusk', 3, {}, ['night']]) expect(resolveLightingPreset(bad)).toBe('daylight');
  });

  it('reads the preset from project settings under the viewer3d key', () => {
    expect(LIGHTING_SETTING).toBe('viewer3d.lighting');
    expect(lightingFromSettings({ 'viewer3d.lighting': 'night' })).toBe('night');
    expect(lightingFromSettings({ lighting: 'night' })).toBe('daylight');
    expect(lightingFromSettings({})).toBe('daylight');
    expect(lightingFromSettings(undefined)).toBe('daylight');
  });
});

describe('lighting rigs', () => {
  it('daylight keeps the look both views shipped with', () => {
    const dollhouse = lightingRig('daylight', 'dollhouse');
    expect(dollhouse).toMatchObject({ background: '#f4f2ee', environment: 0.4, ambient: 0, lamps: null });
    expect(dollhouse.hemisphere).toEqual({ sky: '#fffaf2', ground: '#cfc6b8', intensity: 0.55 });
    expect(dollhouse.sun).toMatchObject({ color: '#fff2df', intensity: 1.7 });
    expect(lightingRig('daylight', 'dollhouse', false).sun!.intensity).toBe(1.6);
    expect(lightingRig('daylight', 'dollhouse', false).hemisphere.intensity).toBe(0.9);

    const interior = lightingRig('daylight', 'interior');
    expect(interior).toMatchObject({ background: '#dfe9f1', environment: 0.22, ambient: 0.18 });
    expect(interior.hemisphere).toEqual({ sky: '#ffffff', ground: '#efe7da', intensity: 0.75 });
    expect(interior.bounce).toEqual({ color: '#fff4e4', intensity: 0.6 });
    expect(interior.sun).toMatchObject({ color: '#fff0d8', intensity: 2.6 });
    // One plain light per room, whatever furniture there is.
    expect(interior.lamps).toEqual({ color: '#fff1dc', scale: 1, fromItems: false });
    expect(lightingRig('daylight', 'interior', false).ambient).toBe(0.45);
  });

  it.each(['dollhouse', 'interior'] as const)('%s: the sky dims from day to evening to night and the lamps come on', (mode) => {
    const [day, evening, night] = LIGHTING_PRESETS.map((p) => lightingRig(p, mode));
    expect(evening!.environment).toBeLessThan(day!.environment);
    expect(night!.environment).toBeLessThan(evening!.environment);
    expect(evening!.hemisphere.intensity).toBeLessThan(day!.hemisphere.intensity);
    expect(night!.hemisphere.intensity).toBeLessThan(evening!.hemisphere.intensity);
    expect(evening!.sun!.intensity).toBeLessThan(day!.sun!.intensity);
    expect(night!.sun?.intensity ?? 0).toBeLessThan(evening!.sun!.intensity);
    expect(evening!.lamps?.fromItems).toBe(true);
    expect(night!.lamps?.fromItems).toBe(true);
    expect(night!.lamps!.scale).toBeGreaterThan(evening!.lamps!.scale);
    // Three different backdrops.
    expect(new Set([day!.background, evening!.background, night!.background]).size).toBe(3);
  });

  it('the evening sun is low and every sun direction points up', () => {
    const height = (d: [number, number, number]) => d[1] / Math.hypot(...d);
    expect(height(lightingRig('evening', 'interior').sun!.direction)).toBeLessThan(0.5);
    expect(height(lightingRig('daylight', 'interior').sun!.direction)).toBeGreaterThan(0.7);
    for (const p of LIGHTING_PRESETS) for (const m of ['dollhouse', 'interior'] as const) expect(lightingRig(p, m).sun?.direction[1] ?? 1).toBeGreaterThan(0);
  });
});

describe('interior lights', () => {
  it('an unfurnished home gets one ceiling light per room, sized to the room', () => {
    const lights = interiorLights(withItems(), rooms);
    expect(lights).toHaveLength(rooms.length);
    expect(new Set(lights.map((l) => l.roomKey)).size).toBe(rooms.length);
    const { room, geom } = roomNamed('Living / Dining');
    const living = lights.find((l) => l.roomKey === room.id)!;
    const reach = Math.max(geom.width, geom.depth) / 1000;
    expect(living).toMatchObject({ source: 'room', intensity: reach * 1.25, distance: reach * 1.6 + 2, decay: 1.5 });
    expect(living.position).toEqual([geom.centroid.x / 1000, (level.ceilingHeight - 250) / 1000, -geom.centroid.y / 1000]);
    // Largest room first.
    expect(lights[0]!.roomKey).toBe(room.id);
  });

  it('classifies catalog lamps', () => {
    expect(lampKind(getEntry('light.pendant'))).toBe('ceiling');
    expect(lampKind(getEntry('light.ceiling.flush'))).toBe('ceiling');
    expect(lampKind(getEntry('light.downlight'))).toBe('spot');
    expect(lampKind(getEntry('lamp.floor.round'))).toBe('floor');
    expect(lampKind(getEntry('lamp.table.round'))).toBe('table');
    expect(lampKind(getEntry('lamp.wall'))).toBe('wall');
    expect(lampKind(getEntry('sofa.3seat'))).toBeNull();
    expect(lampKind(undefined)).toBeNull();
  });

  it('a pendant takes over from the room light and hangs its light below the shade', () => {
    const { room } = roomNamed('Living / Dining');
    const pendant = item('light.pendant', 5000, 2000, { roomId: room.id });
    const plain = interiorLights(withItems(), rooms).find((l) => l.roomKey === room.id)!;
    const lights = interiorLights(withItems(pendant), rooms, { resolveEntry: getEntry }).filter((l) => l.roomKey === room.id);
    expect(lights).toHaveLength(1);
    expect(lights[0]).toMatchObject({ key: `lamp:${pendant.id}`, source: 'lamp', intensity: plain.intensity });
    expect(lights[0]!.position[0]).toBe(5);
    expect(lights[0]!.position[2]).toBe(-2);
    expect(lights[0]!.position[1]).toBeCloseTo((pendant.z - 100) / 1000, 6);
    // Without a resolver the lamp is furniture like any other.
    expect(interiorLights(withItems(pendant), rooms).find((l) => l.roomKey === room.id)!.source).toBe('room');
  });

  it('a flush ceiling light is never closer to the ceiling than the room light', () => {
    const { room } = roomNamed('Kitchen');
    const flush = item('light.ceiling.flush', 1500, 2100, { roomId: room.id });
    const [light] = interiorLights(withItems(flush), rooms, { resolveEntry: getEntry }).filter((l) => l.roomKey === room.id);
    expect(light!.position[1]).toBeCloseTo((level.ceilingHeight - 250) / 1000, 6);
  });

  it('floor, table and wall lamps add pools of light and dim the room light', () => {
    const { room } = roomNamed('Bedroom 1');
    const floor = item('lamp.floor.round', 600, 6000, { roomId: room.id });
    const table = item('lamp.table.round', 3000, 8500);
    const sconce = item('lamp.wall', 1900, 8800, { roomId: room.id, rotationDeg: 0 });
    const plain = interiorLights(withItems(), rooms).find((l) => l.roomKey === room.id)!;
    const lights = interiorLights(withItems(floor, table, sconce), rooms, { resolveEntry: getEntry }).filter((l) => l.roomKey === room.id);
    expect(lights.map((l) => l.source).sort()).toEqual(['lamp', 'lamp', 'lamp', 'room']);
    expect(lights.find((l) => l.source === 'room')!.intensity).toBeCloseTo(plain.intensity / 2, 6);
    const of = (i: Item) => lights.find((l) => l.key === `lamp:${i.id}`)!;
    // The floor lamp shines from near its top, the table lamp (found by position, it has no roomId) from above the table.
    expect(of(floor).position[1]).toBeCloseTo((getEntry('lamp.floor.round')!.dims.h * 0.82) / 1000, 6);
    expect(of(table).position[1]).toBeGreaterThan(0.47);
    expect(of(floor).intensity).toBeGreaterThan(of(table).intensity);
    // The sconce's light sits in front of it (front faces plan -y, world +z), off the wall.
    expect(of(sconce).position[2]).toBeGreaterThan(-8.8);
    expect(of(sconce).position[0]).toBeCloseTo(1.9, 6);
  });

  it('scales every light and ignores lamps outside every room', () => {
    const outside = item('lamp.floor.round', -5000, -5000);
    const base = interiorLights(withItems(outside), rooms, { resolveEntry: getEntry });
    const half = interiorLights(withItems(outside), rooms, { resolveEntry: getEntry, scale: 0.5 });
    expect(base).toHaveLength(rooms.length);
    half.forEach((l, i) => expect(l.intensity).toBeCloseTo(base[i]!.intensity / 2, 6));
  });

  it('when capped, every room keeps a light before any room gets a second', () => {
    const { room } = roomNamed('Living / Dining');
    const lamps = Array.from({ length: 8 }, (_, i) => item('lamp.floor.round', 4000 + i * 600, 2000, { roomId: room.id }));
    const all = interiorLights(withItems(...lamps), rooms, { resolveEntry: getEntry });
    expect(all).toHaveLength(rooms.length + lamps.length);
    const capped = interiorLights(withItems(...lamps), rooms, { resolveEntry: getEntry, max: MAX_INTERIOR_LIGHTS });
    expect(capped).toHaveLength(MAX_INTERIOR_LIGHTS);
    expect(new Set(capped.map((l) => l.roomKey)).size).toBe(rooms.length);
    // Fewer slots than rooms: the largest rooms win.
    const few = interiorLights(withItems(...lamps), rooms, { resolveEntry: getEntry, max: 3 });
    const byArea = [...rooms].sort((a, b) => b.interiorArea - a.interiorArea).slice(0, 3).map((r) => r.roomId);
    expect(few.map((l) => l.roomKey)).toEqual(byArea);
    expect(interiorLights(withItems(), rooms, { max: 0 })).toEqual([]);
  });

  it('light slots come in fours, up to the cap', () => {
    expect(lightSlots(0)).toBe(0);
    expect(lightSlots(1)).toBe(4);
    expect(lightSlots(4)).toBe(4);
    expect(lightSlots(9)).toBe(12);
    expect(lightSlots(40)).toBe(MAX_INTERIOR_LIGHTS);
    expect(lightSlots(5, 6)).toBe(6);
  });
});

describe('a door kept shut', () => {
  it('stays inside the wall, clear of the room', () => {
    const entrance = Object.values(level.openings).find((o) => o.kind === 'door' && o.width === 1000)!;
    const wall = level.walls[entrance.wallId]!;
    const shut = openingParts(entrance, wall.thickness, wall.height, false)!;
    const open = openingParts(entrance, wall.thickness, wall.height, true)!;
    const reach = (parts: typeof shut) => Math.max(...parts.leaf.map((b) => Math.abs(b.position[2]) + Math.hypot(b.size[0], b.size[2]) / 2));
    // Shut: the leaf lies along the wall. Open: it stands most of a door width into the room.
    expect(Math.max(...shut.leaf.map((b) => Math.abs(b.position[2]) + b.size[2] / 2))).toBeLessThan(wall.thickness / 2000 + 0.02);
    expect(reach(open)).toBeGreaterThan(0.8);
  });
});
