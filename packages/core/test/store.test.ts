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
