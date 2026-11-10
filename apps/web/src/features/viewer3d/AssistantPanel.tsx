/**
 * The design assistant: type a request in plain words and the home changes. Shows the
 * conversation of this session with what each answer did, line by line, and lets an
 * answer be taken back or saved as a variant.
 */
import { selectRooms, usePlanStore, type Level } from '@interio/core';
import { ArrowUp, BookmarkPlus, Check, Undo2, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton, PanelHeader, Spinner, TextInput, cn, toast } from '../../ui';
import { EMPTY_CONVERSATION, editState, exampleRequests, variantNameFromRequest, type Turn } from './assistant';
import { ask, cancelRequest, checkAvailability, clearConversation, retry, saveAnswerAsVariant, setDraft, undoAnswer, useAssistant } from './assistantStore';
import { useLightingPreset, useViewer } from './state';

const LINK = 'font-medium text-accent underline underline-offset-2 hover:text-accent-strong disabled:text-ink-faint disabled:no-underline';
const CODE = 'rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink';

/** How to switch the assistant on. Calm: the rest of the Design view works without it. */
function Unavailable() {
  const checking = useAssistant((s) => s.checking);
  const line = cn(CODE, 'mt-1 block w-fit max-w-full break-all');
  return (
    <div className="rounded-lg bg-sunken px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft" data-testid="assistant-unavailable">
      <p className="font-medium text-ink">The assistant is switched off</p>
      <p className="mt-0.5">
        Everything else in Design mode works without it. To switch it on, add one of these lines to the <code className={CODE}>.env</code> file in the Interio folder, then restart{' '}
        <code className={CODE}>pnpm dev</code>:
      </p>
      <ul className="mt-1.5 flex flex-col gap-2">
        <li>
          Your Anthropic API key
          <code className={line}>ANTHROPIC_API_KEY=…</code>
        </li>
        <li>
          Or the Claude Code login on this computer (no key)
          <code className={line}>INTERIO_AI_PROVIDER=claude-code</code>
        </li>
      </ul>
      <button
        type="button"
        className={cn(LINK, 'mt-2')}
        disabled={checking}
        data-testid="assistant-recheck"
        onClick={() =>
          void checkAvailability().then((on) => {
            if (on) toast.success('The assistant is on');
            else toast.info('The assistant is still switched off');
          })
        }
      >
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}

/** Shown while the answer is on its way: requests can take up to a minute. */
function Busy({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div className="mt-2 rounded-lg bg-sunken px-2.5 py-2 text-[13px] text-ink-soft" data-testid="assistant-busy">
      <div className="flex items-center gap-2">
        <Spinner className="shrink-0" />
        <span role="status">Working on it…</span>
        <span className="text-ink-faint tabular-nums" aria-hidden="true" data-testid="assistant-elapsed" data-seconds={seconds}>
          {seconds} s
        </span>
        <button type="button" className={cn(LINK, 'ml-auto')} data-testid="assistant-cancel" onClick={() => cancelRequest()}>
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">An answer can take up to a minute.</p>
    </div>
  );
}

function ChangeList({ turn }: { turn: Turn }) {
  if (turn.changes.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5" data-testid="turn-changes">
      {turn.changes.map((change, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug" data-testid="turn-change" data-ok={change.ok}>
          <span
            aria-hidden="true"
            className={cn('mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full', change.ok ? 'bg-accent text-white' : 'bg-warn-soft text-warn')}
          >
            {change.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className={change.ok ? 'text-ink' : 'text-ink-soft'}>
            <span className="sr-only">{change.ok ? 'Done: ' : 'Not done: '}</span>
            {change.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Undo and "Save as variant" under an answer that changed the home. */
function AnswerActions({ turn }: { turn: Turn }) {
  const state = usePlanStore((s) => (turn.mark ? editState(turn.mark, s) : 'stale'));
  const savedAs = usePlanStore((s) => (turn.variantId ? s.project?.variants.find((v) => v.id === turn.variantId)?.name : undefined));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const fieldId = useId();

  if (turn.undone)
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint" data-testid="turn-undone">
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
        Undone. Redo brings it back.
      </p>
    );

  const save = (e: FormEvent) => {
    e.preventDefault();
    const chosen = name.trim() || variantNameFromRequest(turn.request);
    if (saveAnswerAsVariant(turn, chosen)) toast.success(`Saved “${chosen}” to Variants`);
    setNaming(false);
  };

  if (naming)
    return (
      <form className="mt-2 flex flex-col gap-1.5" onSubmit={save} data-testid="turn-save-form">
        <label htmlFor={fieldId} className="text-xs font-medium text-ink-soft">
          Save this look as
        </label>
        <TextInput
          id={fieldId}
          value={name}
          maxLength={60}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setNaming(false);
            }
          }}
          data-testid="turn-variant-name"
        />
        <div className="flex gap-1.5">
          <Button type="submit" variant="primary" size="sm" data-testid="turn-save-confirm">
            Save variant
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );

  return (
    <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1.5">
      {state === 'latest' && (
        <Button
          size="sm"
          icon={<Undo2 className="h-4 w-4" />}
          title="Takes this answer back in one step"
          data-testid="turn-undo"
          onClick={() => {
            if (undoAnswer(turn)) toast.info('Took that answer back');
          }}
        >
          Undo
        </Button>
      )}
      {savedAs ? (
        <button type="button" className={cn(LINK, 'text-xs')} data-testid="turn-saved" onClick={() => useViewer.getState().setDock('variants')}>
          Saved as “{savedAs}”
        </button>
      ) : (
        <Button
          size="sm"
          variant={state === 'latest' ? 'secondary' : 'ghost'}
          icon={<BookmarkPlus className="h-4 w-4" />}
          title="Keeps the home as it looks now, to come back to or compare"
          data-testid="turn-save"
          onClick={() => {
            setName(variantNameFromRequest(turn.request));
            setNaming(true);
          }}
        >
          Save as variant
        </Button>
      )}
    </div>
  );
}

function TurnView({ turn, startedAt, busy }: { turn: Turn; startedAt?: number; busy: boolean }) {
  let answer: ReactNode;
  if (turn.status === 'pending') {
    answer = <Busy startedAt={startedAt ?? turn.askedAt} />;
  } else if (turn.status === 'failed' || turn.status === 'cancelled') {
    const failed = turn.status === 'failed';
    answer = (
      <div className={cn('mt-2 rounded-lg px-2.5 py-2 text-[13px] leading-snug', failed ? 'bg-danger-soft text-ink' : 'bg-sunken text-ink-soft')} data-testid="turn-problem">
        {failed && <p className="font-medium text-danger">That did not work</p>}
        <p data-testid="turn-reply">{turn.reply}</p>
        <button type="button" className={cn(LINK, 'mt-1')} disabled={busy} data-testid="turn-retry" onClick={() => void retry(turn.id)}>
          Try again
        </button>
      </div>
    );
  } else {
    answer = (
      <div className="mt-2" data-model={turn.model}>
        {turn.status === 'nothing' && <p className="mb-0.5 text-xs font-medium text-ink-faint">Nothing was changed</p>}
        <p className={cn('text-[13px] leading-snug whitespace-pre-wrap', turn.status === 'nothing' ? 'text-ink-soft' : 'text-ink')} data-testid="turn-reply">
          <span className="sr-only">Assistant: </span>
          {turn.reply}
        </p>
        <ChangeList turn={turn} />
        {turn.status === 'done' && <AnswerActions turn={turn} />}
      </div>
    );
  }
  return (
    <li className="border-t border-line pt-3 first:border-t-0 first:pt-0" data-testid="assistant-turn" data-status={turn.status} data-turn-id={turn.id}>
      <p className="ml-auto w-fit max-w-[92%] rounded-xl rounded-br-sm bg-accent-soft px-2.5 py-1.5 text-[13px] leading-snug break-words whitespace-pre-wrap text-ink" data-testid="turn-request">
        <span className="sr-only">You asked: </span>
        {turn.request}
      </p>
      {answer}
    </li>
  );
}

export function AssistantPanel({ level }: { level: Level }) {
  const projectId = usePlanStore((s) => s.project?.id) ?? '';
  const conversation = useAssistant((s) => s.conversations[projectId]) ?? EMPTY_CONVERSATION;
  const pending = useAssistant((s) => (s.pending?.projectId === projectId ? s.pending : null));
  const available = useAssistant((s) => s.available);
  const draft = useAssistant((s) => s.drafts[projectId]) ?? '';
  const lighting = useLightingPreset();
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const turns = conversation.turns;
  const empty = turns.length === 0;
  const examples = useMemo(() => (empty ? exampleRequests(level, { lighting, geoms: selectRooms(level) }) : []), [empty, level, lighting]);
  const busy = pending !== null;

  // Ask once per visit whether the assistant is on, so the explanation is there before a request is typed.
  useEffect(() => {
    if (useAssistant.getState().available === null) void checkAvailability();
    input.current?.focus();
  }, []);

  // New turns and answers come into view at the bottom.
  const last = turns[turns.length - 1];
  useLayoutEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, last?.status, available]);

  // When an answer arrives, typing carries on in the input (unless the user moved on to another part of the app).
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const active = document.activeElement;
      if (!active || active === document.body || root.current?.contains(active)) input.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  const send = () => {
    if (busy || !draft.trim()) return;
    void ask(draft);
    input.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const fillExample = (text: string) => {
    setDraft(projectId, text);
    const el = input.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => el.setSelectionRange(text.length, text.length));
  };

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col" data-testid="assistant-panel" data-available={available === null ? 'unknown' : String(available)}>
      <PanelHeader
        title="Assistant"
        actions={
          <div className="flex items-center">
            {!empty && (
              <Button variant="ghost" size="sm" className="px-2 text-xs" aria-label="Clear conversation" title="Clear conversation" data-testid="assistant-clear" onClick={clearConversation}>
                Clear
              </Button>
            )}
            <IconButton label="Close assistant" size="sm" data-testid="assistant-close" onClick={() => useViewer.getState().setDock(null)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
      />
      <div ref={log} className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="assistant-log">
        {empty && available === false && <Unavailable />}
        {empty && available !== false && (
          <div data-testid="assistant-intro">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              Say what you want changed and the home follows: add, swap or remove furniture, rename a room or change what it is, pick finishes, set the lighting. Walls, doors and
              windows stay as drawn.
            </p>
            {examples.length > 0 && (
              <>
                <p className="mt-3 mb-1.5 text-xs font-medium text-ink-faint">Try one of these</p>
                <ul className="flex flex-col items-start gap-1.5">
                  {examples.map((text) => (
                    <li key={text} className="max-w-full">
                      <button
                        type="button"
                        className="max-w-full rounded-full bg-sunken px-3 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent-strong"
                        data-testid="assistant-example"
                        title="Puts this request in the box below"
                        onClick={() => fillExample(text)}
                      >
                        {text}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {!empty && (
          <ol className="flex flex-col gap-3" aria-label="Conversation" aria-live="polite">
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} startedAt={pending?.turnId === turn.id ? pending.startedAt : undefined} busy={busy} />
            ))}
          </ol>
        )}
        {!empty && available === false && (
          <div className="mt-4">
            <Unavailable />
          </div>
        )}
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Ask the assistant
        </label>
        <textarea
          id={inputId}
          ref={input}
          rows={3}
          maxLength={2000}
          value={draft}
          placeholder="Ask for a change, e.g. add a reading chair to the bedroom"
          className="block w-full resize-none rounded-md border border-line bg-surface px-2.5 py-2 text-sm leading-snug text-ink placeholder:text-ink-faint"
          data-testid="assistant-input"
          onChange={(e) => setDraft(projectId, e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-faint">Shift+Enter for a new line</span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={<ArrowUp className="h-4 w-4" />}
            disabled={busy || !draft.trim()}
            title={busy ? 'Wait for the answer, or cancel it' : undefined}
            data-testid="assistant-send"
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
