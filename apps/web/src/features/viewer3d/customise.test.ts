import { FINISH_KINDS, FURNITURE_MATERIAL_LIST, MATERIAL_LIST, createPlanStore, createSampleProject, type FinishSlot, type Item } from '@interio/core';
import { describe, expect, it } from 'vitest';
import {
  faceFinish,
  facePatch,
  finishSections,
  finishesAfterPick,
  furnitureFinishName,
  hasOwnFinish,
  sameEntryCount,
  sameEntryTargets,
  slotSwatchGroups,
  slotValue,
  surfaceFinishName,
} from './customise';
import { captureRatio, exportScale } from './capture';
import { finishOptions } from './finishes';
import { renderTier } from './state';

const SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame', kind: 'wood', default: 'wood.oak' },
  { id: 'bedding', label: 'Bedding', kind: 'fabric', default: 'fabric.cotton.white' },
];

describe('slot swatches', () => {
  it('offers the slot kind first, then every other kind, each material exactly once in palette order', () => {
    for (const kind of FINISH_KINDS) {
      const { primary, more } = slotSwatchGroups(kind);
      expect(primary.kind).toBe(kind);
      expect(primary.materials.every((m) => m.kind === kind)).toBe(true);
      expect(more.map((g) => g.kind)).not.toContain(kind);
      const all = [primary, ...more].flatMap((g) => g.materials.map((m) => m.id));
      expect(new Set(all).size).toBe(FURNITURE_MATERIAL_LIST.length);
      expect(primary.materials.map((m) => m.id)).toEqual(FURNITURE_MATERIAL_LIST.filter((m) => m.kind === kind).map((m) => m.id));
    }
    expect(slotSwatchGroups('fabric').more[0]!.kind).toBe('leather');
  });

  it('reads the current finish: own choice, else the default', () => {
    expect(slotValue(SLOTS, {}, 'frame')).toBe('wood.oak');
    expect(slotValue(SLOTS, { finishes: { frame: 'wood.walnut' } }, 'frame')).toBe('wood.walnut');
    expect(slotValue(SLOTS, { finishes: { frame: '#aa3300' } }, 'frame')).toBe('#aa3300');
    expect(hasOwnFinish({ finishes: { frame: 'wood.walnut' } }, 'frame')).toBe(true);
    expect(hasOwnFinish({ finishes: { frame: 'nonsense' } }, 'frame')).toBe(false);
    expect(hasOwnFinish({}, 'frame')).toBe(false);
    expect(furnitureFinishName('fabric.velvet.navy')).toBe('Navy velvet');
    expect(furnitureFinishName('#AA3300')).toBe('Custom #aa3300');
    expect(furnitureFinishName(undefined)).toBe('Default');
  });
});

describe('finish picks', () => {
  it('sets, replaces and clears one slot; no-ops give null', () => {
    const item: Pick<Item, 'finishes'> = {};
    expect(finishesAfterPick(item, 'frame', 'wood.walnut')).toEqual({ frame: 'wood.walnut' });
    expect(finishesAfterPick({ finishes: { frame: 'wood.walnut' } }, 'bedding', '#AABBCC')).toEqual({ frame: 'wood.walnut', bedding: '#aabbcc' });
    expect(finishesAfterPick({ finishes: { frame: 'wood.walnut' } }, 'frame', 'wood.walnut')).toBeNull();
    expect(finishesAfterPick({ finishes: { frame: 'wood.walnut' } }, 'frame', null)).toBeUndefined();
    expect(finishesAfterPick({ finishes: { frame: 'wood.walnut', bedding: '#aabbcc' } }, 'frame', null)).toEqual({ bedding: '#aabbcc' });
    expect(finishesAfterPick({}, 'frame', null)).toBeNull();
    expect(finishesAfterPick({}, 'frame', 'not.a.material')).toBeNull();
  });

  it('a pick is one undo step in the store; apply to all is one more', () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const s = store.getState();
    const a = s.addItem({ catalogId: 'bed.single', x: 1000, y: 7000, z: 0, rotationDeg: 0 });
    const b = s.addItem({ catalogId: 'bed.single', x: 2600, y: 7000, z: 0, rotationDeg: 0 });
    s.addItem({ catalogId: 'bed.double', x: 2600, y: 3000, z: 0, rotationDeg: 0 });
    const level = () => store.getState().project!.levels[0]!;
    const steps = () => store.getState().past.length;
    const before = steps();
    store.getState().updateItem(a, { finishes: finishesAfterPick(level().items[a]!, 'frame', 'wood.walnut')! });
    expect(steps()).toBe(before + 1);
    expect(sameEntryCount(level(), a)).toBe(2);
    expect(sameEntryTargets(level(), a)).toEqual([b]);
    store.getState().transact(() => {
      for (const id of sameEntryTargets(level(), a)) store.getState().updateItem(id, { finishes: { ...level().items[a]!.finishes } });
    });
    expect(steps()).toBe(before + 2);
    expect(level().items[b]!.finishes).toEqual({ frame: 'wood.walnut' });
    expect(sameEntryTargets(level(), a)).toEqual([]);
    store.getState().undo();
    expect(level().items[b]!.finishes).toBeUndefined();
  });
});

describe('wall faces', () => {
  it('reads and writes the finish of one face', () => {
    expect(faceFinish({ finishLeft: 'wall.marble' }, 'left')).toBe('wall.marble');
    expect(faceFinish({ finishLeft: 'wall.marble' }, 'right')).toBeUndefined();
    expect(facePatch('left', 'wall.marble')).toEqual({ finishLeft: 'wall.marble' });
    expect(facePatch('right', '#AA0000')).toEqual({ finishRight: '#aa0000' });
    expect(facePatch('right', null)).toEqual({ finishRight: undefined });
  });
});

describe('surface sections', () => {
  it('splits every surface into labelled sections that keep every option once, in palette order', () => {
    for (const surface of ['floor', 'wall', 'ceiling'] as const) {
      const options = finishOptions(surface);
      const sections = finishSections(surface, options);
      expect(sections.length).toBeGreaterThan(1);
      const ids = sections.flatMap((s) => s.options.map((o) => o.id));
      expect([...ids].sort()).toEqual(options.map((o) => o.id).sort());
      for (const s of sections) {
        const order = s.options.map((o) => options.indexOf(o));
        expect(order).toEqual([...order].sort((x, y) => x - y));
      }
    }
    const walls = finishSections('wall', finishOptions('wall'));
    expect(walls[0]!.label).toBe('Paint');
    expect(walls[0]!.options.every((o) => o.id.startsWith('wall.paint.'))).toBe(true);
    expect(walls.find((s) => s.label === 'Panelling and paper')!.options.map((o) => o.id)).toContain('wall.panel.fluted');
    expect(finishSections('floor', finishOptions('floor'))[0]!.options.map((o) => o.id)).toContain('floor.chevron');
    expect(MATERIAL_LIST.length).toBeGreaterThan(40);
  });

  it('names custom colours', () => {
    expect(surfaceFinishName('#ABCDEF')).toBe('Custom #abcdef');
    expect(surfaceFinishName('wall.marble')).toBe('Marble cladding');
    expect(surfaceFinishName('gone')).toBe('Custom');
  });
});

describe('render tiers and pictures', () => {
  it('software renderers always get the low tier; a GPU steps down to medium when slow', () => {
    expect(renderTier(true, 'high')).toBe('low');
    expect(renderTier(true, 'low')).toBe('low');
    expect(renderTier(false, 'high')).toBe('high');
    expect(renderTier(false, 'low')).toBe('medium');
  });

  it('Showcase pictures are larger than the other views, within the size limit', () => {
    expect(exportScale('showcase')).toBeGreaterThan(exportScale('orbit'));
    expect(exportScale('top')).toBe(2);
    expect(captureRatio(1280, 800, exportScale('showcase'))).toBe(3);
    expect(captureRatio(2000, 1200, exportScale('showcase')) * 2000).toBeLessThanOrEqual(4096);
  });
});
