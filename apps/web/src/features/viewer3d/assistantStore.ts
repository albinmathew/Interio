/**
 * The design assistant's session state: one conversation per project (kept until the
 * page is closed, never saved), the request that is waiting for its answer, and the
 * actions the panel offers. The plan itself is only changed through `lib/design`.
 */
import { planStore } from '@interio/core';
import { create } from 'zustand';
import { assistantAvailable, runDesignRequest, type DesignOutcome } from '../../lib/design';
import { toast } from '../../ui';
import {
  EMPTY_CONVERSATION,
  conversationReducer,
  editState,
  historyOf,
  shortReply,
  type Conversation,
  type ConversationAction,
  type EditMark,
  type Turn,
} from './assistant';
import { takeThumbnail } from './capture';
import { useViewer } from './state';

export interface PendingRequest {
  projectId: string;
  turnId: number;
  startedAt: number;
}

export interface AssistantState {
  /** Conversations by project id. */
  conversations: Record<string, Conversation>;
  /** What is typed but not sent, by project id: survives closing the panel. */
  drafts: Record<string, string>;
  pending: PendingRequest | null;
  /** Whether the server has an AI provider. Null until it was asked. */
  available: boolean | null;
  checking: boolean;
}

export const useAssistant = create<AssistantState>(() => ({ conversations: {}, drafts: {}, pending: null, available: null, checking: false }));

const conversationOf = (projectId: string): Conversation => useAssistant.getState().conversations[projectId] ?? EMPTY_CONVERSATION;

function dispatch(projectId: string, action: ConversationAction): void {
  useAssistant.setState((s) => {
    const current = s.conversations[projectId] ?? EMPTY_CONVERSATION;
    const next = conversationReducer(current, action);
    return next === current ? s : { conversations: { ...s.conversations, [projectId]: next } };
  });
}

export function setDraft(projectId: string, text: string): void {
  useAssistant.setState((s) => (s.drafts[projectId] === text ? s : { drafts: { ...s.drafts, [projectId]: text } }));
}

/** Asks the server whether the assistant is switched on. */
export async function checkAvailability(): Promise<boolean> {
  useAssistant.setState({ checking: true });
  const available = await assistantAvailable();
  useAssistant.setState({ available, checking: false });
  return available;
}

let controller: AbortController | null = null;

/** The project as an answer's Undo sees it, just before and just after the answer was applied. */
function markLatestEdit(): EditMark | undefined {
  const { project, past } = planStore.getState();
  const before = past[past.length - 1];
  if (!project || !before) return undefined;
  return { before: { levels: before.levels, settings: before.settings }, after: { levels: project.levels, settings: project.settings } };
}

/**
 * Sends a request for the open project and applies the answer. Returns false when it
 * was not sent: nothing typed, another request is waiting, or the assistant is off.
 */
export async function ask(text: string): Promise<boolean> {
  const request = text.trim();
  const projectId = planStore.getState().project?.id;
  if (!request || !projectId || useAssistant.getState().pending) return false;
  // Known to be off: look again (it may have been switched on since) before showing a request that cannot be answered.
  if (useAssistant.getState().available === false && !(await checkAvailability())) return false;
  if (useAssistant.getState().pending || planStore.getState().project?.id !== projectId) return false;

  const before = conversationOf(projectId);
  const history = historyOf(before.turns);
  const turnId = before.nextId;
  dispatch(projectId, { type: 'ask', text: request, at: Date.now() });
  setDraft(projectId, '');
  const abort = new AbortController();
  controller = abort;
  useAssistant.setState({ pending: { projectId, turnId, startedAt: Date.now() } });
  // The answer is applied to whatever project is open: never let it land on another one.
  const unsubscribe = planStore.subscribe((s) => {
    if (s.project?.id !== projectId) abort.abort();
  });

  let outcome: DesignOutcome;
  try {
    outcome = await runDesignRequest(request, history, { signal: abort.signal });
  } catch {
    outcome = { status: 'failed', reply: 'Something went wrong while applying the answer.', changes: [] };
  } finally {
    unsubscribe();
    if (controller === abort) controller = null;
  }
  const waiting = useAssistant.getState().pending;
  if (waiting?.projectId === projectId && waiting.turnId === turnId) useAssistant.setState({ pending: null });

  if (outcome.cancelled) {
    dispatch(projectId, { type: 'cancel', id: turnId });
    return true;
  }
  if (outcome.status === 'unavailable') {
    // Not an answer: take the request back into the input and explain how to switch the assistant on.
    dispatch(projectId, { type: 'drop', id: turnId });
    if (!useAssistant.getState().drafts[projectId]) setDraft(projectId, request);
    useAssistant.setState({ available: false });
    return false;
  }
  useAssistant.setState({ available: true });
  dispatch(projectId, {
    type: 'answer',
    id: turnId,
    answer: { status: outcome.status, reply: outcome.reply, changes: outcome.changes, model: outcome.model, mark: outcome.status === 'done' ? markLatestEdit() : undefined },
  });
  if (useViewer.getState().dock !== 'assistant') {
    const said = shortReply(outcome.reply);
    if (outcome.status === 'failed') toast.error(`The assistant could not help: ${said}`);
    else toast.info(`Assistant: ${said}`);
  }
  return true;
}

/** Abandons the request that is waiting: its answer, if it still comes, is not applied. */
export function cancelRequest(reason?: string): void {
  const waiting = useAssistant.getState().pending;
  if (!waiting) return;
  controller?.abort();
  dispatch(waiting.projectId, { type: 'cancel', id: waiting.turnId, reason });
  useAssistant.setState({ pending: null });
}

/** Sends a request that failed or was cancelled once more, in place of the old turn. */
export async function retry(turnId: number): Promise<boolean> {
  const projectId = planStore.getState().project?.id;
  const turn = projectId ? conversationOf(projectId).turns.find((t) => t.id === turnId) : undefined;
  if (!projectId || !turn || (turn.status !== 'failed' && turn.status !== 'cancelled') || useAssistant.getState().pending) return false;
  dispatch(projectId, { type: 'drop', id: turnId });
  const sent = await ask(turn.request);
  // Not sent after all (the assistant is off): keep the request in the input instead.
  if (!sent && !useAssistant.getState().drafts[projectId]) setDraft(projectId, turn.request);
  return sent;
}

/** Forgets the conversation of the open project (and abandons a waiting request). */
export function clearConversation(): void {
  const projectId = planStore.getState().project?.id;
  if (!projectId) return;
  if (useAssistant.getState().pending?.projectId === projectId) cancelRequest();
  dispatch(projectId, { type: 'clear' });
}

/** Takes an answer back, when it is still the latest edit: one undo step. */
export function undoAnswer(turn: Turn): boolean {
  const state = planStore.getState();
  if (!turn.mark || editState(turn.mark, state) !== 'latest') return false;
  state.undo();
  return true;
}

/** Saves the current look as a variant named after the request that produced it. */
export function saveAnswerAsVariant(turn: Turn, name: string): string | null {
  const state = planStore.getState();
  const projectId = state.project?.id;
  if (!projectId) return null;
  const id = state.saveVariant({ name, note: turn.request, thumbnail: takeThumbnail() });
  if (!id) return null;
  dispatch(projectId, { type: 'saved', id: turn.id, variantId: id });
  return id;
}

// Undo and Redo anywhere in the app (the header, the keyboard) keep "Undone" on an answer truthful.
planStore.subscribe((state) => {
  const projectId = state.project?.id;
  const conversation = projectId ? useAssistant.getState().conversations[projectId] : undefined;
  if (!projectId || !conversation) return;
  for (const turn of conversation.turns) {
    if (turn.status !== 'done' || !turn.mark) continue;
    const now = editState(turn.mark, state);
    if (now === 'undone' && !turn.undone) dispatch(projectId, { type: 'undone', id: turn.id, undone: true });
    else if (now === 'latest' && turn.undone) dispatch(projectId, { type: 'undone', id: turn.id, undone: false });
  }
});
