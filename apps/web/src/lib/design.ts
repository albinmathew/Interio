/**
 * Design requests in plain language: builds the request for the assistant,
 * calls POST /api/design-edit and applies the answer to the open project.
 *
 * Everything an answer changes is one undo step. Operations that cannot be
 * carried out (no free space, an unknown item) are reported, not guessed at.
 */
import { CATALOG, autoFurnish, getEntry, placeEntry } from '@interio/catalog';
import {
  DesignEditResponseSchema,
  MATERIALS,
  defaultFloorFor,
  finishBriefs,
  planStore,
  selectLevel,
  summariseHome,
  type CatalogBrief,
  type DesignEditRequest,
  type DesignOp,
  type DesignTurn,
  type Level,
  type RoomType,
} from '@interio/core';
import { LIGHTING_LABELS, LIGHTING_PRESETS, LIGHTING_SETTING, lightingFromSettings } from '@interio/scene3d';

export interface AppliedOp {
  op: DesignOp;
  ok: boolean;
  /** One line for the user, e.g. "Added Sink unit to Utility". */
  message: string;
}

export interface DesignOutcome {
  /**
   * `done`: at least one change was made. `nothing`: the assistant answered but nothing changed.
   * `unavailable`: no AI provider is configured. `failed`: the request did not complete.
   */
  status: 'done' | 'nothing' | 'unavailable' | 'failed';
  /** The assistant's reply, or the reason for a failure. */
  reply: string;
  changes: AppliedOp[];
  model?: string;
  /** True when the request was abandoned through its `signal`: nothing was applied. */
  cancelled?: boolean;
}

export interface DesignRequestOptions {
  /** Abandons the request when aborted: the answer, if it still arrives, is not applied. */
  signal?: AbortSignal;
}

const CANCELLED = 'The request was cancelled.';

const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  living: 'living room',
  dining: 'dining room',
  bedroom: 'bedroom',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  balcony: 'balcony',
  utility: 'utility / laundry room',
  foyer: 'foyer',
  study: 'study / work space',
  corridor: 'corridor',
  storage: 'store room',
  other: 'room',
};

const entryName = (catalogId: string): string => getEntry(catalogId)?.name ?? catalogId;

function catalogBriefs(): CatalogBrief[] {
  return CATALOG.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    roomTypes: e.roomTypes,
    size: [e.dims.w, e.dims.d, e.dims.h],
    anchor: e.anchor,
  }));
}

/** The request for the open project, or null when no project is open. */
export function buildDesignRequest(instruction: string, history: DesignTurn[] = []): DesignEditRequest | null {
  const state = planStore.getState();
  const level = selectLevel(state);
  if (!level || !state.project) return null;
  return {
    instruction: instruction.trim().slice(0, 2000),
    home: summariseHome(level, entryName, lightingFromSettings(state.project.settings)),
    catalog: catalogBriefs(),
    finishes: finishBriefs(),
    lighting: LIGHTING_PRESETS.map((id) => ({ id, name: LIGHTING_LABELS[id] })),
    ...(history.length ? { history: history.slice(-12) } : {}),
  };
}

const level = (): Level | null => selectLevel(planStore.getState());

function finish(id: string | undefined, surface: 'floor' | 'wall' | 'ceiling'): string | undefined {
  if (!id) return undefined;
  const m = MATERIALS[id];
  // Ceilings may take wall paints: the palette has a single ceiling finish.
  return m && (m.surface === surface || (surface === 'ceiling' && m.surface === 'wall')) ? id : undefined;
}

function applyOne(op: DesignOp): Omit<AppliedOp, 'op'> {
  const store = planStore.getState();
  const l = level();
  if (!l) return { ok: false, message: 'No plan is open' };
  const room = 'roomId' in op ? l.rooms[op.roomId] : undefined;
  if ('roomId' in op && !room) return { ok: false, message: 'That room is not in the plan' };

  switch (op.op) {
    case 'set_room': {
      const patch: Parameters<typeof store.setRoomProps>[1] = {};
      const notes: string[] = [];
      if (op.name && op.name !== room!.name) {
        patch.name = op.name;
        notes.push(`renamed to ${op.name}`);
      }
      if (op.type && op.type !== room!.type) {
        patch.type = op.type;
        notes.push(`now a ${ROOM_TYPE_LABEL[op.type]}`);
        // Follow the type with its usual floor, unless the user (or this request) chose one.
        if (!op.floorMaterial && room!.floorMaterial === defaultFloorFor(room!.type)) patch.floorMaterial = defaultFloorFor(op.type);
      }
      const floor = finish(op.floorMaterial, 'floor');
      const wall = finish(op.wallMaterial, 'wall');
      const ceiling = finish(op.ceilingMaterial, 'ceiling');
      if (floor && floor !== room!.floorMaterial) {
        patch.floorMaterial = floor;
        notes.push(`floor: ${MATERIALS[floor]!.name}`);
      }
      if (wall && wall !== room!.wallMaterial) {
        patch.wallMaterial = wall;
        notes.push(`walls: ${MATERIALS[wall]!.name}`);
      }
      if (ceiling && ceiling !== room!.ceilingMaterial) {
        patch.ceilingMaterial = ceiling;
        notes.push(`ceiling: ${MATERIALS[ceiling]!.name}`);
      }
      if (notes.length === 0) return { ok: false, message: `${room!.name} already looks like that` };
      store.setRoomProps(op.roomId, patch);
      return { ok: true, message: `${room!.name}: ${notes.join(', ')}` };
    }

    case 'clear_room':
    case 'refurnish_room': {
      const ids = Object.values(l.items).filter((i) => i.roomId === op.roomId).map((i) => i.id);
      if (ids.length) {
        store.mutateLevel((draft) => {
          for (const id of ids) delete draft.items[id];
        });
      }
      if (op.op === 'clear_room') {
        return ids.length ? { ok: true, message: `Cleared ${room!.name} (${ids.length} removed)` } : { ok: false, message: `${room!.name} was already empty` };
      }
      const current = level()!;
      const name = current.rooms[op.roomId]!.name;
      const items = autoFurnish(current, op.roomId);
      for (const item of items) store.addItem({ ...item, roomId: op.roomId });
      return items.length
        ? { ok: true, message: `Furnished ${name} afresh (${items.length} items)` }
        : { ok: ids.length > 0, message: `Nothing in the catalog suits ${name}; it was left empty` };
    }

    case 'add_item': {
      const entry = getEntry(op.catalogId);
      if (!entry) return { ok: false, message: `"${op.catalogId}" is not in the catalog` };
      const anchor = op.nearItemId ? l.items[op.nearItemId] : undefined;
      const wanted = op.count ?? 1;
      let added = 0;
      for (let i = 0; i < wanted; i++) {
        const item = placeEntry(level()!, op.roomId, op.catalogId, { place: op.place, near: anchor ? { x: anchor.x, y: anchor.y } : undefined });
        if (!item) break;
        store.addItem({ ...item, roomId: op.roomId });
        added += 1;
      }
      const what = wanted > 1 ? `${added} × ${entry.name}` : entry.name;
      if (added === 0) return { ok: false, message: `No free space for ${entry.name} in ${room!.name}` };
      return { ok: true, message: `Added ${what} to ${room!.name}${added < wanted ? ` (no space for ${wanted - added} more)` : ''}` };
    }

    case 'remove_item': {
      const item = l.items[op.itemId];
      if (!item) return { ok: false, message: 'That item is no longer in the plan' };
      store.removeItem(op.itemId);
      const where = item.roomId ? l.rooms[item.roomId]?.name : undefined;
      return { ok: true, message: `Removed ${entryName(item.catalogId)}${where ? ` from ${where}` : ''}` };
    }

    case 'replace_item': {
      const item = l.items[op.itemId];
      const entry = getEntry(op.catalogId);
      if (!item) return { ok: false, message: 'That item is no longer in the plan' };
      if (!entry) return { ok: false, message: `"${op.catalogId}" is not in the catalog` };
      if (item.catalogId === op.catalogId) return { ok: false, message: `It is already a ${entry.name}` };
      const swapped = `Swapped ${entryName(item.catalogId)} for ${entry.name}`;
      if (!item.roomId || !l.rooms[item.roomId]) {
        store.updateItem(op.itemId, { catalogId: op.catalogId });
        return { ok: true, message: swapped };
      }
      // The new piece may be a different size: find it a proper spot as close as possible to where the old one stood.
      store.removeItem(op.itemId);
      const placed = placeEntry(level()!, item.roomId, op.catalogId, { near: { x: item.x, y: item.y } });
      if (!placed) {
        const { id: _id, ...old } = item;
        store.addItem(old);
        return { ok: false, message: `No free space for ${entry.name} where ${entryName(item.catalogId)} stands` };
      }
      store.addItem({ ...placed, roomId: item.roomId });
      return { ok: true, message: swapped };
    }

    case 'set_lighting': {
      const preset = LIGHTING_PRESETS.find((p) => p === op.preset);
      if (!preset) return { ok: false, message: `"${op.preset}" is not a lighting preset` };
      if (lightingFromSettings(store.project?.settings) === preset) return { ok: false, message: `Lighting is already ${LIGHTING_LABELS[preset]}` };
      store.setProjectSettings({ [LIGHTING_SETTING]: preset });
      return { ok: true, message: `Lighting: ${LIGHTING_LABELS[preset]}` };
    }
  }
}

/** Applies the assistant's operations to the open project as one undo step and reports each one. */
export function applyDesignOps(ops: DesignOp[]): AppliedOp[] {
  const results: AppliedOp[] = [];
  planStore.getState().transact(() => {
    for (const op of ops) results.push({ op, ...applyOne(op) });
  });
  return results;
}

/** Asks the assistant. Does not change the project. */
export async function requestDesign(
  instruction: string,
  history: DesignTurn[] = [],
  timeoutMs = 240_000,
  signal?: AbortSignal,
): Promise<{ status: 'ok' | 'unavailable' | 'failed'; reply: string; ops: DesignOp[]; model?: string; cancelled?: boolean }> {
  const body = buildDesignRequest(instruction, history);
  if (!body) return { status: 'failed', reply: 'Open a project first.', ops: [] };
  if (signal?.aborted) return { status: 'failed', reply: CANCELLED, ops: [], cancelled: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const res = await fetch('/api/design-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed = DesignEditResponseSchema.safeParse(await res.json());
    if (signal?.aborted) return { status: 'failed', reply: CANCELLED, ops: [], cancelled: true };
    if (!parsed.success) return { status: 'failed', reply: 'The assistant sent an answer that could not be read.', ops: [] };
    const data = parsed.data;
    if (!data.available) return { status: 'unavailable', reply: 'The assistant is switched off.', ops: [] };
    if (data.error || !res.ok) return { status: 'failed', reply: data.error ?? 'The assistant could not complete the request.', ops: [] };
    return { status: 'ok', reply: data.reply ?? '', ops: data.ops ?? [], model: data.model };
  } catch (e) {
    if (signal?.aborted) return { status: 'failed', reply: CANCELLED, ops: [], cancelled: true };
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { status: 'failed', reply: aborted ? 'The assistant took too long.' : 'The assistant could not be reached.', ops: [] };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** Asks the assistant and applies its answer. The whole change is one undo step. */
export async function runDesignRequest(instruction: string, history: DesignTurn[] = [], options: DesignRequestOptions = {}): Promise<DesignOutcome> {
  const answer = await requestDesign(instruction, history, undefined, options.signal);
  // A request abandoned while its answer was on the way changes nothing.
  if (answer.cancelled || options.signal?.aborted) return { status: 'failed', reply: CANCELLED, changes: [], cancelled: true };
  if (answer.status !== 'ok') return { status: answer.status, reply: answer.reply, changes: [] };
  const changes = applyDesignOps(answer.ops);
  const done = changes.some((c) => c.ok);
  return {
    status: done ? 'done' : 'nothing',
    reply: answer.reply || (done ? 'Done.' : 'Nothing was changed.'),
    changes,
    model: answer.model,
  };
}

/** Whether an AI provider is configured on the server. */
export async function assistantAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return Boolean(((await res.json()) as { ai?: boolean }).ai);
  } catch {
    return false;
  }
}
