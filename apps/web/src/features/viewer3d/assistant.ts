/**
 * The design assistant's conversation, as plain data: the turns of a session, what
 * is sent back as context for a follow-up, the example requests offered for a home
 * and whether an answer is still the latest edit. Pure, so it runs in Node.
 */
import { deriveRooms, type DesignTurn, type Level, type Room } from '@interio/core';

/** One line of an answer: something the assistant asked for and whether it could be done. */
export interface TurnChange {
  ok: boolean;
  message: string;
}

/**
 * `pending`: waiting for the answer. `done`: at least one change was made. `nothing`: the
 * assistant answered but nothing changed. `failed`: the request did not complete.
 * `cancelled`: the user (or leaving the view) abandoned it before the answer came.
 */
export type TurnStatus = 'pending' | 'done' | 'nothing' | 'failed' | 'cancelled';

/** The parts of a project an answer can change, by reference: enough to tell whether it is still in place. */
export interface LookRefs {
  levels: unknown;
  settings: unknown;
}

/** The project just before and just after an answer was applied. */
export interface EditMark {
  before: LookRefs;
  after: LookRefs;
}

export interface Turn {
  id: number;
  request: string;
  askedAt: number;
  status: TurnStatus;
  /** The assistant's reply, or the reason for a failure. */
  reply: string;
  changes: TurnChange[];
  model?: string;
  /** Set for answers that changed the home, to offer Undo while they are the latest edit. */
  mark?: EditMark;
  /** The user took this answer back. */
  undone?: boolean;
  /** The variant saved from this answer. */
  variantId?: string;
}

export interface Conversation {
  turns: Turn[];
  nextId: number;
}

export const EMPTY_CONVERSATION: Conversation = { turns: [], nextId: 1 };

export interface Answer {
  status: Exclude<TurnStatus, 'pending' | 'cancelled'>;
  reply: string;
  changes: TurnChange[];
  model?: string;
  mark?: EditMark;
}

export type ConversationAction =
  | { type: 'ask'; text: string; at: number }
  | { type: 'answer'; id: number; answer: Answer }
  | { type: 'cancel'; id: number; reason?: string }
  /** Takes a turn out of the conversation (a request that never reached the assistant). */
  | { type: 'drop'; id: number }
  | { type: 'undone'; id: number; undone: boolean }
  | { type: 'saved'; id: number; variantId: string | undefined }
  | { type: 'clear' };

const patch = (c: Conversation, id: number, fn: (turn: Turn) => Turn): Conversation => {
  const index = c.turns.findIndex((t) => t.id === id);
  const turn = c.turns[index];
  if (!turn) return c;
  const next = fn(turn);
  return next === turn ? c : { ...c, turns: c.turns.map((t, i) => (i === index ? next : t)) };
};

export function conversationReducer(c: Conversation, action: ConversationAction): Conversation {
  switch (action.type) {
    case 'ask': {
      const request = action.text.trim();
      if (!request) return c;
      const turn: Turn = { id: c.nextId, request, askedAt: action.at, status: 'pending', reply: '', changes: [] };
      return { turns: [...c.turns, turn], nextId: c.nextId + 1 };
    }
    case 'answer':
      // An answer for a turn that is no longer waiting (cancelled, cleared) is ignored.
      return patch(c, action.id, (t) =>
        t.status === 'pending'
          ? {
              ...t,
              status: action.answer.status,
              reply: action.answer.reply,
              changes: action.answer.changes.map(({ ok, message }) => ({ ok, message })),
              model: action.answer.model,
              mark: action.answer.status === 'done' ? action.answer.mark : undefined,
            }
          : t,
      );
    case 'cancel':
      return patch(c, action.id, (t) => (t.status === 'pending' ? { ...t, status: 'cancelled', reply: action.reason ?? 'Cancelled. Nothing was changed.' } : t));
    case 'drop':
      return c.turns.some((t) => t.id === action.id) ? { ...c, turns: c.turns.filter((t) => t.id !== action.id) } : c;
    case 'undone':
      return patch(c, action.id, (t) => (t.status === 'done' && !!t.undone !== action.undone ? { ...t, undone: action.undone } : t));
    case 'saved':
      return patch(c, action.id, (t) => (t.variantId === action.variantId ? t : { ...t, variantId: action.variantId }));
    case 'clear':
      // Numbering carries on, so an answer still on its way cannot land on a new turn.
      return c.turns.length ? { turns: [], nextId: c.nextId } : c;
  }
}

export const pendingTurn = (c: Conversation): Turn | undefined => c.turns.find((t) => t.status === 'pending');

const MAX_TURN_TEXT = 2000;
/** Earlier exchanges sent along with a request. */
export const MAX_HISTORY_EXCHANGES = 6;

/**
 * What the assistant is told about the conversation so far, oldest first: each request
 * it answered, with its reply and what became of every change. Requests that never got
 * an answer (failed, cancelled) are left out.
 */
export function historyOf(turns: Turn[], exchanges = MAX_HISTORY_EXCHANGES): DesignTurn[] {
  const answered = turns.filter((t) => t.status === 'done' || t.status === 'nothing').slice(-exchanges);
  return answered.flatMap((t): DesignTurn[] => {
    const lines = [t.reply];
    for (const change of t.changes) lines.push(`${change.ok ? 'Done' : 'Not done'}: ${change.message}`);
    if (t.undone) lines.push('The user then undid these changes.');
    return [
      { role: 'user', text: t.request.slice(0, MAX_TURN_TEXT) },
      { role: 'assistant', text: lines.filter(Boolean).join('\n').slice(0, MAX_TURN_TEXT) },
    ];
  });
}

/** A project's history as far as an answer's Undo is concerned. */
export interface EditHistory {
  project: LookRefs | null;
  past: LookRefs[];
  future: LookRefs[];
}

const sameLook = (a: LookRefs | null | undefined, b: LookRefs): boolean => !!a && a.levels === b.levels && a.settings === b.settings;

/**
 * Where an answer stands now. `latest`: it is the newest edit, so one Undo takes exactly
 * it back. `undone`: it was just taken back (Redo would return it). `stale`: other edits
 * came after it.
 */
export function editState(mark: EditMark, history: EditHistory): 'latest' | 'undone' | 'stale' {
  if (sameLook(history.project, mark.after) && sameLook(history.past[history.past.length - 1], mark.before)) return 'latest';
  if (sameLook(history.project, mark.before) && sameLook(history.future[0], mark.after)) return 'undone';
  return 'stale';
}

/* ---------------------------------------------------------------- examples */

/** "the Utility", but "Bedroom 3": numbered rooms read as names. */
export function theRoom(name: string): string {
  const n = name.trim();
  return /\d$/.test(n) || /^(the|my|our)\s/i.test(n) ? n : `the ${n}`;
}

export interface ExampleOptions {
  /** Lighting preset of the open project. */
  lighting?: string;
  /** Catalog ids that are sofas a corner sofa could replace. */
  isSofa?: (catalogId: string) => boolean;
  /** Room sizes, when the caller already has them (`selectRooms`); derived from the level otherwise. */
  geoms?: { roomId: string | null; interiorArea: number }[];
}

const defaultIsSofa = (catalogId: string): boolean => catalogId.startsWith('sofa.') && !catalogId.includes('corner');

/**
 * A few requests that make sense for this home, using its own room names: a sink for
 * the utility room (or the kitchen), a laundry room out of a service room or the
 * smallest spare bedroom, a lighting change, and a swap or a first layout for the
 * living room.
 */
export function exampleRequests(level: Level, opts: ExampleOptions = {}): string[] {
  const rooms = Object.values(level.rooms);
  const areas = new Map((opts.geoms ?? deriveRooms(level)).map((g) => [g.roomId, g.interiorArea]));
  const smallest = (list: Room[]): Room | undefined => [...list].sort((a, b) => (areas.get(a.id) ?? Infinity) - (areas.get(b.id) ?? Infinity))[0];
  const ofType = (...types: Room['type'][]): Room[] => rooms.filter((r) => types.includes(r.type));
  const items = Object.values(level.items);
  const out: string[] = [];

  const wet = ofType('utility')[0] ?? ofType('kitchen')[0];
  if (wet) out.push(`Add a sink to ${theRoom(wet.name)}`);

  const bedrooms = ofType('bedroom');
  const spare = smallest(ofType('storage', 'other')) ?? (bedrooms.length > 1 ? smallest(bedrooms) : undefined);
  if (spare) out.push(`Make ${theRoom(spare.name)} a laundry room`);

  out.push(opts.lighting === 'evening' ? 'Use daylight' : 'Use warm evening lighting');

  const isSofa = opts.isSofa ?? defaultIsSofa;
  const living = ofType('living')[0];
  if (items.some((i) => isSofa(i.catalogId))) out.push('Swap the sofa for a corner sofa');
  else if (living) out.push(items.some((i) => i.roomId === living.id) ? `Add a floor lamp to ${theRoom(living.name)}` : `Furnish ${theRoom(living.name)}`);

  return out.slice(0, 4);
}

/** A variant name from the request that produced the look: one line, capitalised, cut at a word. */
export function variantNameFromRequest(request: string, max = 40): string {
  const text = request.replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');
  if (!text) return '';
  const name = text[0]!.toUpperCase() + text.slice(1);
  if (name.length <= max) return name;
  const cut = name.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** "The assistant answered: …" for a toast, when the panel is closed. */
export function shortReply(reply: string, max = 90): string {
  const text = reply.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
