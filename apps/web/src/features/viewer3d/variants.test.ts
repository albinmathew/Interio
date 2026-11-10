import { createPlanStore, createSampleProject, selectLevel, type Variant } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, fitEncoding, thumbnailCrop } from './capture';
import { currentVariantIds, dataUrlBytes, defaultVariantName, newestFirst, variantItemCount, variantMatches, wantsFirstLayout } from './variants';

function setup() {
  const store = createPlanStore();
  store.getState().loadProject(createSampleProject());
  const level = () => selectLevel(store.getState())!;
  const project = () => store.getState().project!;
  const room = (name: string) => Object.values(level().rooms).find((r) => r.name === name)!;
  const variant = (id: string): Variant => project().variants.find((v) => v.id === id)!;
  const matches = (id: string) => variantMatches(variant(id), level(), project().settings);
  const living = room('Living / Dining');
  const sofa = store.getState().addItem({ catalogId: 'sofa.3seat', x: 6000, y: 2000, z: 0, rotationDeg: 0, roomId: living.id });
  return { store, level, project, room, variant, matches, living, sofa };
}

describe('the variant the home looks like now', () => {
  it('matches right after saving and after applying, and stops matching on any change of look', () => {
    const { store, matches, living, sofa, room } = setup();
    const s = store.getState();
    const a = s.saveVariant({ name: 'A' })!;
    expect(matches(a)).toBe(true);

    s.updateItem(sofa, { x: 6100 });
    expect(matches(a)).toBe(false);
    store.getState().undo();
    expect(matches(a)).toBe(true);

    for (const edit of [
      () => s.updateItem(sofa, { rotationDeg: 90 }),
      () => s.updateItem(sofa, { catalogId: 'sofa.corner' }),
      () => s.removeItem(sofa),
      () => s.addItem({ catalogId: 'ottoman', x: 6000, y: 3000, z: 0, rotationDeg: 0, roomId: living.id }),
      () => s.setRoomProps(living.id, { name: 'Lounge' }),
      () => s.setRoomProps(living.id, { type: 'study' }),
      () => s.setRoomProps(living.id, { floorMaterial: 'floor.walnut' }),
      () => s.setRoomProps(room('Kitchen').id, { wallMaterial: 'wall.paint.sage' }),
      () => s.setRoomProps(room('Kitchen').id, { ceilingMaterial: 'wall.paint.sage' }),
      () => s.setProjectSettings({ 'viewer3d.lighting': 'night' }),
    ]) {
      edit();
      expect(matches(a)).toBe(false);
      s.applyVariant(a);
      expect(matches(a)).toBe(true);
    }
  });

  it('marks the saved look that is on screen, and none once the home was changed', () => {
    const { store, project, level, living } = setup();
    const s = store.getState();
    const a = s.saveVariant({ name: 'A' })!;
    s.setRoomProps(living.id, { floorMaterial: 'floor.walnut' });
    s.setProjectSettings({ 'viewer3d.lighting': 'evening' });
    const b = s.saveVariant({ name: 'B' })!;
    const current = () => [...currentVariantIds(project().variants, level(), project().settings)];
    expect(current()).toEqual([b]);
    s.applyVariant(a);
    expect(current()).toEqual([a]);
    s.setRoomProps(living.id, { name: 'Lounge' });
    expect(current()).toEqual([]);
    // Two saves of the same look are both the current one.
    const c = s.saveVariant({ name: 'C' })!;
    const d = s.saveVariant({ name: 'D' })!;
    expect(current()).toEqual([c, d]);
  });

  it('treats a project that never chose a lighting as daylight, and other settings as part of the look', () => {
    const { store, matches, project } = setup();
    const s = store.getState();
    const a = s.saveVariant({ name: 'A' })!;
    expect(project().settings).toEqual({});
    s.setProjectSettings({ 'viewer3d.lighting': 'daylight' });
    expect(matches(a)).toBe(true);
    s.setProjectSettings({ 'viewer3d.lighting': 'evening' });
    expect(matches(a)).toBe(false);
    s.setProjectSettings({ 'viewer3d.lighting': 'daylight', 'walk.speed': { fast: true } });
    expect(matches(a)).toBe(false);
    const b = s.saveVariant({ name: 'B' })!;
    s.setProjectSettings({ 'walk.speed': { fast: true } });
    expect(matches(b)).toBe(true);
    s.setProjectSettings({ 'walk.speed': { fast: false } });
    expect(matches(b)).toBe(false);
  });

  it('ignores rooms that were removed from the plan since the variant was saved, like applying does', () => {
    const { store, matches, level, room } = setup();
    const s = store.getState();
    const bedroom = room('Bedroom 1');
    s.addItem({ catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 0, roomId: bedroom.id });
    const a = s.saveVariant({ name: 'A' })!;
    s.mutateLevel((l) => {
      delete l.rooms[bedroom.id];
      for (const item of Object.values(l.items)) if (item.roomId === bedroom.id) delete l.items[item.id];
    });
    expect(Object.keys(level().items)).toHaveLength(1);
    expect(matches(a)).toBe(true);
  });
});

describe('variant lists and names', () => {
  const named = (name: string, createdAt = 0): Variant => ({ id: name, name, createdAt, items: {}, rooms: {}, settings: {} });

  it('lists the newest first', () => {
    const list = [named('a', 10), named('b', 30), named('c', 20), named('d', 30)];
    expect(newestFirst(list).map((v) => v.name)).toEqual(['d', 'b', 'c', 'a']);
    expect(list.map((v) => v.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('suggests the next "Variant N" that is free', () => {
    expect(defaultVariantName([])).toBe('Variant 1');
    expect(defaultVariantName([named('First layout')])).toBe('Variant 2');
    expect(defaultVariantName([named('First layout'), named('variant 3 ')])).toBe('Variant 4');
    // After a delete the count goes down: never offer a name that is in use.
    expect(defaultVariantName([named('Variant 2'), named('Variant 3')])).toBe('Variant 4');
  });

  it('counts the items of a variant and sizes a preview', () => {
    const { store, variant } = setup();
    const id = store.getState().saveVariant({ name: 'A' })!;
    expect(variantItemCount(variant(id))).toBe(1);
    expect(dataUrlBytes(`data:image/jpeg;base64,${'A'.repeat(4000)}`)).toBe(3000);
  });
});

describe('the automatic first layout', () => {
  const project = (items: number, variants: number) => ({ variants: Array.from({ length: variants }), levels: [{ items: Object.fromEntries(Array.from({ length: items }, (_, i) => [`i${i}`, {}])) }] });

  it('is wanted once, for a furnished home with nothing saved', () => {
    expect(wantsFirstLayout(project(12, 0), 0, false)).toBe(true);
    expect(wantsFirstLayout(project(0, 0), 0, false)).toBe(false);
    expect(wantsFirstLayout(project(12, 1), 0, false)).toBe(false);
    expect(wantsFirstLayout(project(12, 0), 0, true)).toBe(false);
    expect(wantsFirstLayout(project(12, 0), 3, false)).toBe(false);
    expect(wantsFirstLayout(null, 0, false)).toBe(false);
  });
});

describe('variant previews', () => {
  it('keeps the middle of the view in the proportions of a preview', () => {
    const crop = thumbnailCrop(1280, 672);
    expect(crop.w).toBeCloseTo(1280 * 0.74, 6);
    expect(crop.w / crop.h).toBeCloseTo(THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT, 6);
    expect(crop.x + crop.w / 2).toBeCloseTo(640, 6);
    expect(crop.y + crop.h / 2).toBeCloseTo(336, 6);
    // A wide, short view is limited by its height.
    const wide = thumbnailCrop(2000, 400);
    expect(wide.h).toBe(400);
    expect(wide.w).toBeCloseTo(640, 6);
    expect(wide.x).toBeCloseTo(680, 6);
  });

  it('lowers the quality until the preview is small enough for the project file', () => {
    const sizes: Record<string, number> = { '0.7': 60_000, '0.55': 40_000, '0.4': 20_000, '0.28': 9_000 };
    const tried: number[] = [];
    const encode = (q: number) => {
      tried.push(q);
      return `data:image/jpeg;base64,${'A'.repeat(Math.ceil((sizes[String(q)]! * 4) / 3))}`;
    };
    expect(dataUrlBytes(fitEncoding(encode))).toBe(20_000);
    expect(tried).toEqual([0.7, 0.55, 0.4]);
    // Nothing fits: the smallest one tried is used.
    const big = fitEncoding((q) => `data:image/jpeg;base64,${'A'.repeat(Math.round(80_000 * q))}`, 1000);
    expect(big.length).toBe('data:image/jpeg;base64,'.length + Math.round(80_000 * 0.28));
  });
});
