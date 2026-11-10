import { autoFurnish } from '@interio/catalog';
import { DesignEditRequestSchema, createSampleProject, planStore, selectLevel, type DesignOp } from '@interio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDesignOps, buildDesignRequest, runDesignRequest } from './design';

const level = () => selectLevel(planStore.getState())!;
const room = (name: string) => Object.values(level().rooms).find((r) => r.name === name)!;
const itemsIn = (roomId: string) => Object.values(level().items).filter((i) => i.roomId === roomId);

beforeEach(() => {
  planStore.getState().loadProject(createSampleProject());
  // Furnish the kitchen so there is something to remove and replace.
  const kitchen = room('Kitchen');
  planStore.getState().transact(() => {
    for (const item of autoFurnish(level(), kitchen.id)) planStore.getState().addItem(item);
  });
});

describe('design request', () => {
  it('describes the home, the catalog and the options, and passes the wire schema', () => {
    const request = buildDesignRequest('  add a sink to the kitchen  ', [{ role: 'user', text: 'hello' }])!;
    expect(DesignEditRequestSchema.safeParse(request).success).toBe(true);
    expect(request.instruction).toBe('add a sink to the kitchen');
    expect(request.home.rooms).toHaveLength(10);
    const kitchen = request.home.rooms.find((r) => r.name === 'Kitchen')!;
    expect(kitchen).toMatchObject({ type: 'kitchen', width: 2840, depth: 4040, area: 11.5 });
    expect(kitchen.items.length).toBeGreaterThan(0);
    expect(kitchen.items[0]).toHaveProperty('name');
    expect(request.catalog.length).toBeGreaterThan(100);
    expect(request.catalog.find((c) => c.id === 'kitchen.sink')).toMatchObject({ anchor: 'floor' });
    expect(request.finishes.some((f) => f.id === 'floor.oak' && f.surface === 'floor')).toBe(true);
    expect(request.lighting.map((l) => l.id)).toEqual(['daylight', 'evening', 'night']);
    expect(request.history).toEqual([{ role: 'user', text: 'hello' }]);
  });
});

describe('applying design operations', () => {
  it('turns a room into another kind of room and furnishes it afresh, as one undo step', () => {
    const bed3 = room('Bedroom 3');
    const steps = planStore.getState().past.length;
    const results = applyDesignOps([
      { op: 'set_room', roomId: bed3.id, name: 'Work Room', type: 'study' },
      { op: 'refurnish_room', roomId: bed3.id },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(results[0]!.message).toBe('Bedroom 3: renamed to Work Room, now a study / work space');
    expect(level().rooms[bed3.id]).toMatchObject({ name: 'Work Room', type: 'study' });
    expect(itemsIn(bed3.id).some((i) => i.catalogId.startsWith('desk'))).toBe(true);
    expect(planStore.getState().past).toHaveLength(steps + 1);
    planStore.getState().undo();
    expect(level().rooms[bed3.id]).toMatchObject({ name: 'Bedroom 3', type: 'bedroom' });
    expect(itemsIn(bed3.id)).toHaveLength(0);
  });

  it('follows a type change with the usual floor unless a finish was chosen', () => {
    const bed1 = room('Bedroom 1');
    applyDesignOps([{ op: 'set_room', roomId: bed1.id, type: 'utility' }]);
    expect(level().rooms[bed1.id]!.floorMaterial).toBe('floor.tile.antiskid');
    const bed2 = room('Bedroom 2');
    applyDesignOps([{ op: 'set_room', roomId: bed2.id, type: 'utility', floorMaterial: 'floor.walnut', wallMaterial: 'wall.paint.sage', ceilingMaterial: 'not-a-finish' }]);
    expect(level().rooms[bed2.id]).toMatchObject({ floorMaterial: 'floor.walnut', wallMaterial: 'wall.paint.sage' });
    expect(level().rooms[bed2.id]!.ceilingMaterial).toBeUndefined();
  });

  it('adds, removes and swaps items, and says when something cannot be done', () => {
    const kitchen = room('Kitchen');
    const bath = room('Bath 2');
    const before = itemsIn(kitchen.id).length;
    const swap = itemsIn(kitchen.id).find((i) => i.catalogId.startsWith('fridge'))!;
    const victim = itemsIn(kitchen.id).find((i) => i.id !== swap.id)!;
    const other = swap.catalogId === 'fridge.single' ? 'fridge.double' : 'fridge.single';
    const ops: DesignOp[] = [
      { op: 'add_item', roomId: room('Living / Dining').id, catalogId: 'armchair', count: 2 },
      { op: 'add_item', roomId: bath.id, catalogId: 'sofa.corner' },
      { op: 'add_item', roomId: kitchen.id, catalogId: 'no.such.thing' },
      { op: 'remove_item', itemId: victim.id },
      { op: 'replace_item', itemId: swap.id, catalogId: other },
      { op: 'remove_item', itemId: 'missing' },
      { op: 'set_room', roomId: 'missing', name: 'X' },
      { op: 'set_lighting', preset: 'evening' },
      { op: 'set_lighting', preset: 'disco' },
    ];
    const results = applyDesignOps(ops);
    expect(results.map((r) => r.ok)).toEqual([true, false, false, true, true, false, false, true, false]);
    expect(results[0]!.message).toBe('Added 2 × Armchair to Living / Dining');
    expect(results[1]!.message).toMatch(/No free space for .* in Bath 2/);
    expect(itemsIn(room('Living / Dining').id).filter((i) => i.catalogId === 'armchair')).toHaveLength(2);
    expect(itemsIn(kitchen.id)).toHaveLength(before - 1);
    // The swapped piece is placed afresh near the old spot, so it never ends up through a wall.
    expect(level().items[swap.id]).toBeUndefined();
    const fridges = itemsIn(kitchen.id).filter((i) => i.catalogId.startsWith('fridge'));
    expect(fridges.map((i) => i.catalogId)).toEqual([other]);
    expect(Math.hypot(fridges[0]!.x - swap.x, fridges[0]!.y - swap.y)).toBeLessThan(400);
    expect(planStore.getState().project!.settings['viewer3d.lighting']).toBe('evening');
  });

  it('keeps the old piece when its replacement does not fit', () => {
    const bath = room('Bath 2');
    planStore.getState().addItem({ catalogId: 'basin.pedestal', x: bath.seed.x, y: bath.seed.y, z: 0, rotationDeg: 0, roomId: bath.id });
    const basin = itemsIn(bath.id)[0]!;
    const [result] = applyDesignOps([{ op: 'replace_item', itemId: basin.id, catalogId: 'sofa.corner' }]);
    expect(result).toMatchObject({ ok: false, message: 'No free space for Corner sofa where Pedestal basin stands' });
    expect(itemsIn(bath.id).map((i) => i.catalogId)).toEqual(['basin.pedestal']);
  });

  it('leaves no undo step when nothing could be applied', () => {
    const steps = planStore.getState().past.length;
    const results = applyDesignOps([{ op: 'remove_item', itemId: 'missing' }, { op: 'clear_room', roomId: room('Bedroom 1').id }]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(planStore.getState().past).toHaveLength(steps);
  });
});

describe('asking the assistant', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body }) as Response));

  it('applies the answer and reports the changes', async () => {
    const utility = room('Bath 1');
    answer({ available: true, reply: 'Added a basin.', model: 'm', ops: [{ op: 'add_item', roomId: utility.id, catalogId: 'basin.pedestal' }] });
    const outcome = await runDesignRequest('add a basin in bath 1');
    expect(outcome).toMatchObject({ status: 'done', reply: 'Added a basin.', model: 'm' });
    expect(outcome.changes[0]).toMatchObject({ ok: true, message: 'Added Pedestal basin to Bath 1' });
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { instruction: string };
    expect(sent.instruction).toBe('add a basin in bath 1');
  });

  it('distinguishes an answer that changes nothing, a switched-off assistant and a failure', async () => {
    answer({ available: true, reply: 'Walls cannot be moved here.', ops: [] });
    expect(await runDesignRequest('move the wall')).toMatchObject({ status: 'nothing', reply: 'Walls cannot be moved here.' });
    answer({ available: false });
    expect(await runDesignRequest('x')).toMatchObject({ status: 'unavailable' });
    answer({ available: true, error: 'The Claude plan limit was reached.' }, false);
    expect(await runDesignRequest('x')).toMatchObject({ status: 'failed', reply: 'The Claude plan limit was reached.' });
    answer({ nonsense: true });
    expect((await runDesignRequest('x')).status).toBe('failed');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network'))));
    expect(await runDesignRequest('x')).toMatchObject({ status: 'failed', reply: 'The assistant could not be reached.' });
  });
});
