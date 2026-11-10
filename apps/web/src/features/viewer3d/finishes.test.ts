import {
  DEFAULT_CEILING_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  MATERIAL_LIST,
  ROOM_TYPES,
  createPlanStore,
  createSampleProject,
  defaultFloorFor,
  defaultWallFor,
  type Room,
} from '@interio/core';
import { describe, expect, it } from 'vitest';
import { captureFileName, captureRatio } from './capture';
import {
  applyFinishes,
  currentFinish,
  defaultFinishes,
  finishGroups,
  finishName,
  finishOptions,
  finishPatch,
  hasDefaultFinishes,
  pluralRoomType,
  resetPatch,
  tintPixels,
} from './finishes';

const sample = () => createSampleProject().levels[0]!.rooms;
const named = (rooms: Record<string, Room>, name: string) => Object.values(rooms).find((r) => r.name === name)!;

describe('material grouping', () => {
  it('groups the palette by surface, in palette order', () => {
    const groups = finishGroups();
    expect(groups.map((g) => g.surface)).toEqual(['floor', 'wall', 'ceiling']);
    expect(groups.map((g) => g.label)).toEqual(['Floor', 'Walls', 'Ceiling']);
    expect(finishOptions('floor')).toEqual(MATERIAL_LIST.filter((m) => m.surface === 'floor'));
    expect(finishOptions('wall')).toEqual(MATERIAL_LIST.filter((m) => m.surface === 'wall'));
    // Floors and walls never mix.
    expect(finishOptions('floor').every((m) => m.id.startsWith('floor.'))).toBe(true);
    expect(finishOptions('wall').every((m) => m.id.startsWith('wall.'))).toBe(true);
  });

  it('a ceiling takes the ceiling finishes first, then the wall paints, and no textured finish', () => {
    const ids = finishOptions('ceiling').map((m) => m.id);
    expect(ids[0]).toBe(DEFAULT_CEILING_MATERIAL);
    expect(ids).toContain('wall.paint.sky');
    expect(ids).not.toContain('wall.brick');
    expect(ids).not.toContain('wall.tile.white');
    expect(ids.filter((id) => id.startsWith('wall.paint.'))).toEqual(MATERIAL_LIST.filter((m) => m.id.startsWith('wall.paint.')).map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('works on any palette', () => {
    const list = [
      { id: 'floor.x', name: 'X', surface: 'floor', color: '#000000', roughness: 1 },
      { id: 'ceiling.y', name: 'Y', surface: 'ceiling', color: '#ffffff', roughness: 1 },
    ] as const;
    expect(finishGroups(list).map((g) => g.options.map((m) => m.id))).toEqual([['floor.x'], [], ['ceiling.y']]);
  });

  it('reads the finish a room shows, with the renderer defaults for unset surfaces', () => {
    const room = { floorMaterial: 'floor.oak' } as Room;
    expect(currentFinish(room, 'floor')).toBe('floor.oak');
    expect(currentFinish(room, 'wall')).toBe(DEFAULT_WALL_MATERIAL);
    expect(currentFinish(room, 'ceiling')).toBe(DEFAULT_CEILING_MATERIAL);
    expect(currentFinish({ ...room, wallMaterial: 'wall.brick', ceilingMaterial: 'wall.paint.sky' }, 'wall')).toBe('wall.brick');
    expect(finishName('floor.oak')).toBe('Oak planks');
    expect(finishName('floor.gone')).toBe('Custom');
  });

  it('writes each surface to its own room property', () => {
    expect(finishPatch('floor', 'floor.marble')).toEqual({ floorMaterial: 'floor.marble' });
    expect(finishPatch('wall', 'wall.brick')).toEqual({ wallMaterial: 'wall.brick' });
    expect(finishPatch('ceiling', 'wall.paint.sky')).toEqual({ ceilingMaterial: 'wall.paint.sky' });
  });
});

describe('defaults', () => {
  it('match core for every room type', () => {
    for (const type of ROOM_TYPES) {
      expect(defaultFinishes(type)).toEqual({ floorMaterial: defaultFloorFor(type), wallMaterial: defaultWallFor(type), ceilingMaterial: DEFAULT_CEILING_MATERIAL });
      expect(pluralRoomType(type)).toMatch(/s$/);
    }
    expect(pluralRoomType('balcony')).toBe('balconies');
    expect(pluralRoomType('living')).toBe('living rooms');
  });

  it('reset puts the floor and walls on the defaults and clears the ceiling', () => {
    const rooms = sample();
    const living = named(rooms, 'Living / Dining');
    // The sample gives the living room an oak floor; its type default is white tile.
    expect(hasDefaultFinishes(living)).toBe(false);
    const patch = resetPatch({ ...living, ceilingMaterial: 'wall.paint.sky' });
    expect(patch).toEqual({ floorMaterial: 'floor.tile.white', wallMaterial: 'wall.paint.white', ceilingMaterial: undefined });
    expect('ceilingMaterial' in patch).toBe(true);
    expect(hasDefaultFinishes({ ...living, ...patch })).toBe(true);
    expect(hasDefaultFinishes(named(rooms, 'Bath 1'))).toBe(true);
    expect(hasDefaultFinishes(named(rooms, 'Bedroom 1'))).toBe(true);
  });
});

describe('apply to all', () => {
  it('copies all three finishes to every other room that differs', () => {
    const rooms = sample();
    const source = named(rooms, 'Bedroom 1');
    source.wallMaterial = 'wall.paint.sage';
    source.ceilingMaterial = 'wall.paint.ivory';
    const patches = applyFinishes(rooms, source.id, 'all');
    expect(Object.keys(patches).sort()).toEqual(Object.keys(rooms).filter((id) => id !== source.id).sort());
    for (const patch of Object.values(patches)) expect(patch).toEqual({ floorMaterial: 'floor.oak', wallMaterial: 'wall.paint.sage', ceilingMaterial: 'wall.paint.ivory' });
  });

  it('only touches rooms of the same type when asked', () => {
    const rooms = sample();
    const source = named(rooms, 'Bedroom 1');
    source.floorMaterial = 'floor.walnut';
    const patches = applyFinishes(rooms, source.id, 'type');
    expect(Object.keys(patches).sort()).toEqual([named(rooms, 'Bedroom 2').id, named(rooms, 'Bedroom 3').id].sort());
    expect(patches[named(rooms, 'Bedroom 2').id]).toEqual({ floorMaterial: 'floor.walnut', wallMaterial: undefined, ceilingMaterial: undefined });
  });

  it('skips rooms that already look the same, and unknown sources', () => {
    const rooms = sample();
    const source = named(rooms, 'Bedroom 1');
    // The other bedrooms start with the same finishes; an explicit default equals an unset one.
    named(rooms, 'Bedroom 2').wallMaterial = DEFAULT_WALL_MATERIAL;
    expect(applyFinishes(rooms, source.id, 'type')).toEqual({});
    expect(applyFinishes(rooms, 'nope', 'all')).toEqual({});
  });

  it('is one undo step when run through the store', () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const rooms = () => store.getState().project!.levels[0]!.rooms;
    const source = named(rooms(), 'Kitchen');
    store.getState().setRoomProps(source.id, finishPatch('floor', 'floor.terrazzo'));
    const patches = applyFinishes(rooms(), source.id, 'all');
    store.getState().transact(() => {
      for (const [id, patch] of Object.entries(patches)) store.getState().setRoomProps(id, patch);
    });
    expect(store.getState().past).toHaveLength(2);
    expect(Object.values(rooms()).every((r) => r.floorMaterial === 'floor.terrazzo')).toBe(true);
    store.getState().undo();
    expect(named(rooms(), 'Bedroom 1').floorMaterial).toBe('floor.oak');
    expect(named(rooms(), 'Kitchen').floorMaterial).toBe('floor.terrazzo');
    store.getState().undo();
    expect(named(rooms(), 'Kitchen').floorMaterial).toBe('floor.tile.grey');
  });
});

describe('swatch tint', () => {
  it('multiplies in linear light, leaves alpha alone and clips at white', () => {
    const px = new Uint8ClampedArray([128, 128, 128, 200, 0, 0, 0, 255, 255, 255, 255, 10]);
    tintPixels(px, [1, 0.5, 2]);
    // sRGB 128 is 0.2158 linear: halved it is 0.1079 (sRGB 92), doubled 0.4317 (sRGB 176).
    expect(Array.from(px.slice(0, 4))).toEqual([128, 92, 176, 200]);
    expect(Array.from(px.slice(4, 8))).toEqual([0, 0, 0, 255]);
    expect(Array.from(px.slice(8, 12))).toEqual([255, 188, 255, 10]);
  });
});

describe('picture export', () => {
  it('doubles the resolution unless the picture would be too large', () => {
    expect(captureRatio(1280, 720)).toBe(2);
    expect(captureRatio(1280, 720, 3)).toBe(3);
    expect(captureRatio(3000, 1500)).toBeCloseTo(4096 / 3000, 9);
    expect(captureRatio(800, 600, 2, 1000)).toBe(1.25);
  });

  it('names the file after the project and the time', () => {
    expect(captureFileName('Sample 3-bedroom apartment', new Date('2026-11-10T14:03:22Z'))).toBe('interio-sample-3-bedroom-apartment-2026-11-10-14-03-22.png');
    expect(captureFileName('  ', new Date('2026-01-02T03:04:05Z'))).toBe('interio-home-2026-01-02-03-04-05.png');
  });
});
