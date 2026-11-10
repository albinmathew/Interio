import { describe, expect, it } from 'vitest';
import { createPlanStore, createProject, createSampleProject, deriveRooms, migrate, selectLevel, serializeProject } from '../src';

describe('plan store', () => {
  it('undoes and redoes edits back to identical JSON', () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const before = JSON.stringify(selectLevel(store.getState()));
    const s = store.getState();
    const wallId = Object.keys(selectLevel(store.getState())!.walls)[0]!;
    s.addWall({ x: 1000, y: 6000 }, { x: 3000, y: 6000 });
    s.setWallProps(wallId, { thickness: 250 });
    const vid = Object.keys(selectLevel(store.getState())!.vertices)[3]!;
    s.moveVertex(vid, { x: 123, y: 456 });
    s.addItem({ catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 0 });
    expect(store.getState().past).toHaveLength(4);
    for (let i = 0; i < 4; i++) store.getState().undo();
    expect(JSON.stringify(selectLevel(store.getState()))).toBe(before);
    for (let i = 0; i < 4; i++) store.getState().redo();
    expect(Object.keys(selectLevel(store.getState())!.items)).toHaveLength(1);
  });

  it('groups a gesture into one undo step', () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const s = store.getState();
    const vid = Object.keys(selectLevel(store.getState())!.vertices)[0]!;
    const start = selectLevel(store.getState())!.vertices[vid]!;
    s.beginGesture();
    for (let i = 1; i <= 10; i++) s.moveVertex(vid, { x: start.x + i * 10, y: start.y });
    s.endGesture();
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(selectLevel(store.getState())!.vertices[vid]).toEqual(start);
  });

  it('creates and names rooms as walls close', () => {
    const store = createPlanStore();
    store.getState().loadProject(createProject('Empty'));
    const s = store.getState();
    s.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    s.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 });
    s.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 });
    expect(Object.keys(selectLevel(store.getState())!.rooms)).toHaveLength(0);
    s.addWall({ x: 0, y: 3000 }, { x: 0, y: 0 });
    const level = selectLevel(store.getState())!;
    expect(Object.keys(level.rooms)).toHaveLength(1);
    const roomId = Object.keys(level.rooms)[0]!;
    s.setRoomProps(roomId, { name: 'Studio', type: 'living' });
    expect(deriveRooms(selectLevel(store.getState())!)[0]!.roomId).toBe(roomId);
  });

  it('round-trips a project through serialisation', () => {
    const project = createSampleProject();
    const copy = migrate(JSON.parse(serializeProject(project)));
    expect(copy).toEqual(project);
    expect(() => migrate({ schema: 99 })).toThrow(/Unsupported/);
  });
});

describe('gestures', () => {
  it('cancels a gesture without leaving an undo step', () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const before = store.getState().project;
    const vid = Object.keys(selectLevel(store.getState())!.vertices)[0]!;
    store.getState().beginGesture();
    store.getState().moveVertex(vid, { x: 777, y: 777 });
    store.getState().cancelGesture();
    expect(store.getState().project).toBe(before);
    expect(store.getState().past).toHaveLength(0);
    store.getState().renameProject('After');
    expect(store.getState().past).toHaveLength(1);
  });
});

describe('variants', () => {
  const setup = () => {
    const store = createPlanStore();
    store.getState().loadProject(createSampleProject());
    const level = () => selectLevel(store.getState())!;
    const living = Object.values(level().rooms).find((r) => r.name === 'Living / Dining')!;
    return { store, level, living };
  };

  it('saves a look and brings it back as one undo step', () => {
    const { store, level, living } = setup();
    const s = store.getState();
    s.addItem({ catalogId: 'sofa.3seat', x: 6000, y: 2000, z: 0, rotationDeg: 0, roomId: living.id });
    s.setRoomProps(living.id, { floorMaterial: 'floor.walnut' });
    s.setProjectSettings({ 'viewer3d.lighting': 'evening' });
    const a = s.saveVariant({ name: 'Warm', note: 'first look' })!;
    expect(store.getState().project!.variants).toHaveLength(1);

    s.mutateLevel((l) => {
      l.items = {};
    });
    s.setRoomProps(living.id, { floorMaterial: 'floor.marble', name: 'Lounge', type: 'study' });
    s.setProjectSettings({ 'viewer3d.lighting': 'night' });
    const b = s.saveVariant({ name: '' })!;
    expect(store.getState().project!.variants.map((v) => v.name)).toEqual(['Warm', 'Variant 2']);

    const steps = store.getState().past.length;
    s.applyVariant(a);
    expect(store.getState().past).toHaveLength(steps + 1);
    expect(Object.values(level().items).map((i) => i.catalogId)).toEqual(['sofa.3seat']);
    expect(level().rooms[living.id]).toMatchObject({ name: 'Living / Dining', type: 'living', floorMaterial: 'floor.walnut' });
    expect(store.getState().project!.settings['viewer3d.lighting']).toBe('evening');

    s.applyVariant(b);
    expect(Object.keys(level().items)).toHaveLength(0);
    expect(level().rooms[living.id]).toMatchObject({ name: 'Lounge', type: 'study', floorMaterial: 'floor.marble' });
  });

  it('keeps saved variants through undo and redo, and can rename, overwrite and delete them', () => {
    const { store, living } = setup();
    const s = store.getState();
    s.setRoomProps(living.id, { floorMaterial: 'floor.walnut' });
    const id = s.saveVariant({ name: 'A' })!;
    store.getState().undo();
    expect(store.getState().project!.variants).toHaveLength(1);
    store.getState().redo();
    expect(store.getState().project!.variants).toHaveLength(1);

    s.renameVariant(id, '  Evening look ');
    s.setRoomProps(living.id, { floorMaterial: 'floor.ash' });
    s.updateVariant(id, { thumbnail: 'data:image/jpeg;base64,xx' });
    const v = store.getState().project!.variants[0]!;
    expect(v).toMatchObject({ name: 'Evening look', thumbnail: 'data:image/jpeg;base64,xx' });
    expect(v.rooms[living.id]!.floorMaterial).toBe('floor.ash');
    s.deleteVariant(id);
    expect(store.getState().project!.variants).toHaveLength(0);
  });

  it('skips furniture of rooms that no longer exist and reads projects saved before variants existed', () => {
    const { store, level, living } = setup();
    const s = store.getState();
    s.addItem({ catalogId: 'sofa.3seat', x: 6000, y: 2000, z: 0, rotationDeg: 0, roomId: living.id });
    s.addItem({ catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 0, roomId: 'gone' });
    const id = s.saveVariant({ name: 'A' })!;
    s.applyVariant(id);
    expect(Object.values(level().items).map((i) => i.catalogId)).toEqual(['sofa.3seat']);

    const legacy = JSON.parse(serializeProject(createSampleProject())) as Record<string, unknown>;
    delete legacy.variants;
    expect(migrate(legacy).variants).toEqual([]);
  });
});
