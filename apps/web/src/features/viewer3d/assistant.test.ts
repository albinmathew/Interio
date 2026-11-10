import { autoFurnish } from '@interio/catalog';
import { createSampleProject, planStore, selectLevel, type Level } from '@interio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_CONVERSATION,
  conversationReducer,
  editState,
  exampleRequests,
  historyOf,
  pendingTurn,
  shortReply,
  theRoom,
  variantNameFromRequest,
  type Answer,
  type Conversation,
  type ConversationAction,
} from './assistant';
import { ask, cancelRequest, clearConversation, retry, saveAnswerAsVariant, undoAnswer, useAssistant } from './assistantStore';

const run = (actions: ConversationAction[], from: Conversation = EMPTY_CONVERSATION): Conversation => actions.reduce(conversationReducer, from);
const done = (reply: string, changes: Answer['changes'] = [{ ok: true, message: 'Added Sink unit to Kitchen' }]): Answer => ({ status: 'done', reply, changes, model: 'm' });

describe('conversation', () => {
  it('adds a waiting turn for a request and fills it in when the answer arrives', () => {
    let c = run([{ type: 'ask', text: '  add a sink  ', at: 10 }]);
    expect(c.turns).toEqual([{ id: 1, request: 'add a sink', askedAt: 10, status: 'pending', reply: '', changes: [] }]);
    expect(pendingTurn(c)?.id).toBe(1);
    c = run([{ type: 'answer', id: 1, answer: done('Added a sink.') }], c);
    expect(c.turns[0]).toMatchObject({ status: 'done', reply: 'Added a sink.', changes: [{ ok: true, message: 'Added Sink unit to Kitchen' }], model: 'm' });
    expect(pendingTurn(c)).toBeUndefined();
    // An empty request is not a turn.
    expect(run([{ type: 'ask', text: '   ', at: 11 }], c)).toBe(c);
  });

  it('keeps only what the panel shows of each change', () => {
    const changes = [{ ok: false, message: 'No free space', op: { op: 'clear_room', roomId: 'r' } }] as unknown as Answer['changes'];
    const c = run([
      { type: 'ask', text: 'a', at: 1 },
      { type: 'answer', id: 1, answer: { status: 'nothing', reply: 'Nothing fits.', changes } },
    ]);
    expect(c.turns[0]!.changes).toEqual([{ ok: false, message: 'No free space' }]);
    expect(c.turns[0]!.mark).toBeUndefined();
  });

  it('ignores an answer for a request that was cancelled or cleared', () => {
    let c = run([
      { type: 'ask', text: 'a', at: 1 },
      { type: 'cancel', id: 1 },
    ]);
    expect(c.turns[0]).toMatchObject({ status: 'cancelled', reply: 'Cancelled. Nothing was changed.' });
    const late = run([{ type: 'answer', id: 1, answer: done('late') }], c);
    expect(late).toBe(c);
    // Cancelling something that already has its answer changes nothing either.
    c = run([
      { type: 'ask', text: 'b', at: 2 },
      { type: 'answer', id: 2, answer: done('ok') },
    ], c);
    expect(run([{ type: 'cancel', id: 2 }], c).turns[1]!.status).toBe('done');

    const cleared = run([{ type: 'ask', text: 'c', at: 3 }, { type: 'clear' }], c);
    expect(cleared.turns).toEqual([]);
    expect(run([{ type: 'answer', id: 3, answer: done('late') }], cleared)).toBe(cleared);
    // Numbering carries on after a clear, so a late answer can never land on a new turn.
    expect(run([{ type: 'ask', text: 'd', at: 4 }], cleared).turns[0]!.id).toBe(4);
    expect(run([{ type: 'clear' }], EMPTY_CONVERSATION)).toBe(EMPTY_CONVERSATION);
  });

  it('drops a turn, and notes an undo and a saved variant on an answer', () => {
    let c = run([
      { type: 'ask', text: 'a', at: 1 },
      { type: 'answer', id: 1, answer: done('ok') },
      { type: 'ask', text: 'b', at: 2 },
    ]);
    c = run([{ type: 'drop', id: 2 }], c);
    expect(c.turns.map((t) => t.id)).toEqual([1]);
    c = run([{ type: 'undone', id: 1, undone: true }, { type: 'saved', id: 1, variantId: 'var_1' }], c);
    expect(c.turns[0]).toMatchObject({ undone: true, variantId: 'var_1' });
    expect(run([{ type: 'undone', id: 1, undone: true }], c)).toBe(c);
    expect(run([{ type: 'undone', id: 1, undone: false }], c).turns[0]!.undone).toBe(false);
    expect(run([{ type: 'drop', id: 99 }], c)).toBe(c);
  });
});

describe('history for follow-ups', () => {
  it('sends each answered request with its reply and what became of every change', () => {
    const c = run([
      { type: 'ask', text: 'make bedroom 3 a laundry room', at: 1 },
      {
        type: 'answer',
        id: 1,
        answer: done('Bedroom 3 is now a laundry room.', [
          { ok: true, message: 'Bedroom 3: renamed to Laundry' },
          { ok: false, message: 'No free space for Sink unit in Laundry' },
        ]),
      },
      { type: 'ask', text: 'move the wall', at: 2 },
      { type: 'answer', id: 2, answer: { status: 'nothing', reply: 'Walls cannot be moved here.', changes: [] } },
      { type: 'ask', text: 'warmer', at: 3 },
      { type: 'answer', id: 3, answer: { status: 'failed', reply: 'The assistant could not be reached.', changes: [] } },
      { type: 'ask', text: 'cooler', at: 4 },
      { type: 'cancel', id: 4 },
      { type: 'ask', text: 'still waiting', at: 5 },
    ]);
    expect(historyOf(c.turns)).toEqual([
      { role: 'user', text: 'make bedroom 3 a laundry room' },
      { role: 'assistant', text: 'Bedroom 3 is now a laundry room.\nDone: Bedroom 3: renamed to Laundry\nNot done: No free space for Sink unit in Laundry' },
      { role: 'user', text: 'move the wall' },
      { role: 'assistant', text: 'Walls cannot be moved here.' },
    ]);
  });

  it('says when an answer was undone, keeps the latest exchanges and stays within the wire limits', () => {
    let c = run([
      { type: 'ask', text: 'add a sofa', at: 1 },
      { type: 'answer', id: 1, answer: done('Added.') },
      { type: 'undone', id: 1, undone: true },
    ]);
    expect(historyOf(c.turns)[1]!.text).toBe('Added.\nDone: Added Sink unit to Kitchen\nThe user then undid these changes.');
    for (let i = 2; i <= 9; i++) c = run([{ type: 'ask', text: `request ${i}`, at: i }, { type: 'answer', id: i, answer: done('x'.repeat(3000)) }], c);
    const history = historyOf(c.turns);
    expect(history).toHaveLength(12);
    expect(history[0]).toEqual({ role: 'user', text: 'request 4' });
    expect(history.every((t) => t.text.length <= 2000)).toBe(true);
  });
});

describe('whether an answer is still the latest edit', () => {
  const look = (n: number) => ({ levels: [`levels ${n}`], settings: { n } });
  const before = look(0);
  const after = look(1);
  const mark = { before, after };

  it('is the latest right after it was applied, also when only the variant list changed since', () => {
    expect(editState(mark, { project: after, past: [before], future: [] })).toBe('latest');
    // Saving a variant makes a new project object around the same levels and settings.
    expect(editState(mark, { project: { ...after }, past: [{ ...before }], future: [] })).toBe('latest');
  });

  it('is undone after one undo, and the latest again after redo', () => {
    expect(editState(mark, { project: before, past: [], future: [after] })).toBe('undone');
    expect(editState(mark, { project: after, past: [before], future: [] })).toBe('latest');
  });

  it('is stale once anything else was edited, before or after an undo', () => {
    const later = look(2);
    expect(editState(mark, { project: later, past: [before, after], future: [] })).toBe('stale');
    expect(editState(mark, { project: later, past: [before], future: [] })).toBe('stale');
    expect(editState(mark, { project: before, past: [], future: [] })).toBe('stale');
    expect(editState(mark, { project: null, past: [], future: [] })).toBe('stale');
  });
});

describe('example requests', () => {
  const sample = (): Level => createSampleProject().levels[0]!;
  const withRoom = (level: Level, name: string, patch: Partial<Level['rooms'][string]>): Level => {
    const room = Object.values(level.rooms).find((r) => r.name === name)!;
    return { ...level, rooms: { ...level.rooms, [room.id]: { ...room, ...patch } } };
  };

  it('uses the real room names of the home', () => {
    // No utility room: the sink goes to the kitchen; the smallest spare bedroom becomes the laundry.
    expect(exampleRequests(sample())).toEqual(['Add a sink to the Kitchen', 'Make Bedroom 3 a laundry room', 'Use warm evening lighting', 'Furnish the Living / Dining']);
  });

  it('prefers a utility room for the sink and a service room for the laundry', () => {
    let level = withRoom(sample(), 'Bath 2', { name: 'Utility', type: 'utility' });
    level = withRoom(level, 'Foyer', { name: 'Service room', type: 'other' });
    const examples = exampleRequests(level);
    expect(examples[0]).toBe('Add a sink to the Utility');
    expect(examples[1]).toBe('Make the Service room a laundry room');
  });

  it('follows the furniture and the lighting of the home', () => {
    const level = sample();
    const living = Object.values(level.rooms).find((r) => r.type === 'living')!;
    const sofa = { id: 'i1', catalogId: 'sofa.3seat', x: 6500, y: 2000, z: 0, rotationDeg: 0, roomId: living.id };
    expect(exampleRequests({ ...level, items: { i1: sofa } }, { lighting: 'evening' }).slice(2)).toEqual(['Use daylight', 'Swap the sofa for a corner sofa']);
    // A corner sofa is not offered a swap for a corner sofa.
    expect(exampleRequests({ ...level, items: { i1: { ...sofa, catalogId: 'sofa.corner' } } })[3]).toBe('Add a floor lamp to the Living / Dining');
  });

  it('copes with a home that has a single room, or none', () => {
    const level = sample();
    const bedroom = Object.values(level.rooms).find((r) => r.name === 'Bedroom 1')!;
    expect(exampleRequests({ ...level, rooms: { [bedroom.id]: bedroom } })).toEqual(['Use warm evening lighting']);
    expect(exampleRequests({ ...level, rooms: {} })).toEqual(['Use warm evening lighting']);
  });

  it('reads room names naturally', () => {
    expect(theRoom('Utility')).toBe('the Utility');
    expect(theRoom('Bedroom 3')).toBe('Bedroom 3');
    expect(theRoom('The den')).toBe('The den');
  });
});

describe('names and summaries', () => {
  it('names a variant after the request: one line, capitalised, cut at a word', () => {
    expect(variantNameFromRequest('  make the service room\n a laundry room.  ')).toBe('Make the service room a laundry room');
    expect(variantNameFromRequest('warmer lighting!!')).toBe('Warmer lighting');
    const long = variantNameFromRequest('swap the three-seat sofa in the living room for a corner sofa and add two floor lamps');
    expect(long).toBe('Swap the three-seat sofa in the living…');
    expect(long.length).toBeLessThanOrEqual(40);
    expect(variantNameFromRequest('x'.repeat(80))).toBe(`${'X'}${'x'.repeat(38)}…`);
    expect(variantNameFromRequest('   ')).toBe('');
  });

  it('shortens a reply for a toast', () => {
    expect(shortReply('Done.\n  Added a sink.')).toBe('Done. Added a sink.');
    expect(shortReply('a'.repeat(200))).toHaveLength(90);
  });
});

describe('asking from the panel', () => {
  const level = () => selectLevel(planStore.getState())!;
  const room = (name: string) => Object.values(level().rooms).find((r) => r.name === name)!;
  const conversation = () => useAssistant.getState().conversations[planStore.getState().project!.id]!;
  const answer = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body }) as Response));
  const sent = (call = 0) => JSON.parse((vi.mocked(fetch).mock.calls[call]![1] as RequestInit).body as string) as { instruction: string; history?: unknown[] };

  beforeEach(() => {
    planStore.getState().loadProject(createSampleProject());
    const kitchen = room('Kitchen');
    planStore.getState().transact(() => {
      for (const item of autoFurnish(level(), kitchen.id)) planStore.getState().addItem(item);
    });
    useAssistant.setState({ conversations: {}, drafts: {}, pending: null, available: null, checking: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies an answer, offers Undo while it is the latest edit and carries the exchange into the next request', async () => {
    const bath = room('Bath 1');
    answer({ available: true, reply: 'Added a basin.', model: 'm', ops: [{ op: 'add_item', roomId: bath.id, catalogId: 'basin.pedestal' }] });
    const items = Object.keys(level().items).length;
    expect(await ask('add a basin in bath 1')).toBe(true);
    expect(Object.keys(level().items)).toHaveLength(items + 1);
    const turn = conversation().turns[0]!;
    expect(turn).toMatchObject({ status: 'done', reply: 'Added a basin.', changes: [{ ok: true, message: 'Added Pedestal basin to Bath 1' }] });
    expect(editState(turn.mark!, planStore.getState())).toBe('latest');
    expect(sent().history).toBeUndefined();

    // Saving a variant is not an edit: Undo is still on offer, and takes exactly the answer back.
    expect(saveAnswerAsVariant(turn, 'With a basin')).toBeTruthy();
    expect(planStore.getState().project!.variants[0]).toMatchObject({ name: 'With a basin', note: 'add a basin in bath 1' });
    expect(conversation().turns[0]!.variantId).toBe(planStore.getState().project!.variants[0]!.id);
    expect(undoAnswer(conversation().turns[0]!)).toBe(true);
    expect(Object.keys(level().items)).toHaveLength(items);
    expect(conversation().turns[0]!.undone).toBe(true);
    expect(undoAnswer(conversation().turns[0]!)).toBe(false);
    // Redo anywhere in the app brings it back, and the turn follows.
    planStore.getState().redo();
    expect(conversation().turns[0]!.undone).toBe(false);
    planStore.getState().undo();

    answer({ available: true, reply: 'Walls stay as drawn.', ops: [] });
    await ask('and move the wall');
    expect(sent().history).toEqual([
      { role: 'user', text: 'add a basin in bath 1' },
      { role: 'assistant', text: 'Added a basin.\nDone: Added Pedestal basin to Bath 1\nThe user then undid these changes.' },
    ]);
    expect(conversation().turns[1]).toMatchObject({ status: 'nothing', reply: 'Walls stay as drawn.' });
  });

  it('no longer offers Undo once something else was edited', async () => {
    answer({ available: true, reply: 'Evening it is.', ops: [{ op: 'set_lighting', preset: 'evening' }] });
    await ask('warmer lighting');
    const turn = conversation().turns[0]!;
    planStore.getState().setRoomProps(room('Kitchen').id, { name: 'Galley' });
    expect(editState(turn.mark!, planStore.getState())).toBe('stale');
    expect(undoAnswer(turn)).toBe(false);
    expect(room('Galley')).toBeDefined();
  });

  it('leaves the home alone when the request is cancelled before the answer arrives', async () => {
    const bath = room('Bath 1');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return { ok: true, json: async () => ({ available: true, reply: 'Added a basin.', ops: [{ op: 'add_item', roomId: bath.id, catalogId: 'basin.pedestal' }] }) } as Response;
      }),
    );
    const before = planStore.getState().project;
    const asking = ask('add a basin');
    expect(useAssistant.getState().pending).toMatchObject({ turnId: 1 });
    // A second request has to wait.
    expect(await ask('and another')).toBe(false);
    cancelRequest();
    expect(useAssistant.getState().pending).toBeNull();
    expect(conversation().turns[0]!.status).toBe('cancelled');
    release();
    await asking;
    expect(planStore.getState().project).toBe(before);
    expect(conversation().turns).toHaveLength(1);
    expect(conversation().turns[0]!.status).toBe('cancelled');

    // Try again sends the same request in place of the cancelled turn.
    answer({ available: true, reply: 'Added a basin.', ops: [{ op: 'add_item', roomId: bath.id, catalogId: 'basin.pedestal' }] });
    expect(await retry(1)).toBe(true);
    expect(sent().instruction).toBe('add a basin');
    expect(conversation().turns.map((t) => [t.request, t.status])).toEqual([['add a basin', 'done']]);
  });

  it('never applies an answer to another project', async () => {
    const bath = room('Bath 1');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return { ok: true, json: async () => ({ available: true, reply: 'Added.', ops: [{ op: 'add_item', roomId: bath.id, catalogId: 'basin.pedestal' }] }) } as Response;
      }),
    );
    const asking = ask('add a basin');
    const other = createSampleProject('Another home');
    planStore.getState().loadProject(other);
    release();
    await asking;
    expect(planStore.getState().project).toBe(other);
    expect(useAssistant.getState().pending).toBeNull();
  });

  it('keeps the request in the input when the assistant turns out to be switched off, and reports failures with their reason', async () => {
    const id = planStore.getState().project!.id;
    answer({ available: false });
    expect(await ask('add a plant')).toBe(false);
    expect(useAssistant.getState()).toMatchObject({ available: false, pending: null, drafts: { [id]: 'add a plant' } });
    expect(conversation().turns).toEqual([]);
    // Known to be off: the next try asks the server first and sends nothing while it still is.
    answer({ ok: true, ai: false });
    expect(await ask('add a plant')).toBe(false);
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual(['/api/health']);

    useAssistant.setState({ available: true });
    answer({ available: true, error: 'The Claude plan limit was reached.' }, false);
    expect(await ask('add a plant')).toBe(true);
    expect(conversation().turns[0]).toMatchObject({ status: 'failed', reply: 'The Claude plan limit was reached.' });

    clearConversation();
    expect(conversation().turns).toEqual([]);
  });
});
