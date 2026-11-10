/** Quiet helpers: plan issues, shortcut help, the empty-plan hint and the Set scale prompt. */
import { planStore, validateLevel, vec, type Issue, type Level, type Selection } from '@interio/core';
import { CircleHelp, PencilRuler, TriangleAlert, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button, cn, IconButton, Kbd, Panel, PanelHeader, toast } from '../../../ui';
import { useController } from '../context';
import { formatMm, parseLength } from '../logic/units';
import { planToScreen } from '../logic/view';
import { editorStore, useEditor, type Draft } from '../state';
import { TOOLS } from '../tools';

function selectionFor(level: Level, issue: Issue): Selection | null {
  for (const id of issue.refs ?? []) {
    if (level.openings[id]) return { kind: 'opening', id };
    if (level.walls[id]) return { kind: 'wall', id };
    if (level.rooms[id]) return { kind: 'room', id };
    if (level.items[id]) return { kind: 'item', id };
  }
  return null;
}

/** A small chip that only appears when `validateLevel` finds something. */
export function Issues({ level }: { level: Level }) {
  const [open, setOpen] = useState(false);
  const settled = useDeferredValue(level);
  const issues = useMemo(() => validateLevel(settled), [settled]);
  if (issues.length === 0) return null;
  const serious = issues.some((i) => i.severity !== 'info');
  return (
    <div className="relative">
      {open && (
        <Panel className="pointer-events-auto absolute right-0 bottom-full mb-2 w-[280px]">
          <PanelHeader
            title="Plan checks"
            actions={
              <IconButton label="Close" size="sm" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            }
          />
          <ul className="max-h-56 overflow-y-auto p-1.5" data-testid="issue-list">
            {issues.map((issue, i) => {
              const target = selectionFor(settled, issue);
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!target}
                    onClick={() => target && planStore.getState().select(target)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-soft enabled:hover:bg-sunken disabled:cursor-default"
                  >
                    <TriangleAlert className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', issue.severity === 'error' ? 'text-danger' : issue.severity === 'warning' ? 'text-warn' : 'text-ink-faint')} />
                    {issue.message}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <button
        type="button"
        data-testid="issues-chip"
        aria-expanded={open}
        title="Plan checks"
        onClick={() => setOpen(!open)}
        className={cn(
          'pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-[var(--shadow-panel)]',
          serious ? 'border-warn-soft bg-warn-soft text-warn' : 'border-line bg-surface text-ink-soft',
        )}
      >
        <TriangleAlert className="h-3.5 w-3.5" />
        {issues.length} {issues.length === 1 ? 'check' : 'checks'}
      </button>
    </div>
  );
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[3px] text-[13px]">
      <span className="text-ink-soft">{children}</span>
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
    </div>
  );
}

export function Help() {
  const open = useEditor((s) => s.helpOpen);
  const toggle = () => editorStore.setState({ helpOpen: !open });
  return (
    <div className="relative">
      {open && (
        <Panel className="pointer-events-auto absolute right-0 bottom-full mb-2 w-[300px]">
          <PanelHeader
            title="Shortcuts"
            actions={
              <IconButton label="Close" size="sm" onClick={toggle}>
                <X className="h-4 w-4" />
              </IconButton>
            }
          />
          <div className="max-h-[60vh] overflow-y-auto px-3 py-2" data-testid="help-popover">
            <h3 className="mt-1 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Tools</h3>
            {TOOLS.map((t) => (
              <Row key={t.id} keys={<Kbd>{t.key.toUpperCase()}</Kbd>}>
                {t.label}
              </Row>
            ))}
            <h3 className="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Drawing</h3>
            <Row keys={<Kbd>Shift</Kbd>}>Lock to 0 / 45 / 90°</Row>
            <Row keys={<Kbd>Alt</Kbd>}>Turn snapping off</Row>
            <Row
              keys={
                <>
                  <Kbd>3400</Kbd>
                  <Kbd>Enter</Kbd>
                </>
              }
            >
              Exact wall length
            </Row>
            <Row
              keys={
                <>
                  <Kbd>Esc</Kbd>
                  <span className="text-xs text-ink-faint">or double-click</span>
                </>
              }
            >
              Finish a wall chain
            </Row>
            <h3 className="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Editing</h3>
            <Row keys={<Kbd>Del</Kbd>}>Delete selection</Row>
            <Row
              keys={
                <>
                  <Kbd>←</Kbd>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <Kbd>→</Kbd>
                </>
              }
            >
              Nudge 10 mm (Shift 100, Alt 1)
            </Row>
            <Row
              keys={
                <>
                  <Kbd>F</Kbd>
                  <Kbd>⇧F</Kbd>
                </>
              }
            >
              Flip door hinge / swing
            </Row>
            <Row
              keys={
                <>
                  <Kbd>⌘Z</Kbd>
                  <Kbd>⇧⌘Z</Kbd>
                </>
              }
            >
              Undo / redo
            </Row>
            <h3 className="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">View</h3>
            <Row
              keys={
                <>
                  <Kbd>Space</Kbd>
                  <span className="text-xs text-ink-faint">+ drag</span>
                </>
              }
            >
              Pan
            </Row>
            <Row
              keys={
                <>
                  <Kbd>+</Kbd>
                  <Kbd>−</Kbd>
                </>
              }
            >
              Zoom (or scroll wheel, pinch)
            </Row>
            <Row keys={<Kbd>0</Kbd>}>Fit plan to view</Row>
          </div>
        </Panel>
      )}
      <Panel className="pointer-events-auto p-0.5">
        <IconButton label="Shortcuts (?)" size="sm" active={open} data-testid="help-button" onClick={toggle}>
          <CircleHelp className="h-4 w-4" />
        </IconButton>
      </Panel>
    </div>
  );
}

/** Shown on a blank plan until the first wall is started. */
export function EmptyHint({ hasUnderlay }: { hasUnderlay: boolean }) {
  const controller = useController();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <Panel className="pointer-events-auto w-[min(92%,380px)] p-5 text-center">
        <div data-testid="empty-plan">
          <PencilRuler className="mx-auto h-7 w-7 text-accent" />
          <h3 className="mt-2 text-base font-semibold text-ink">{hasUnderlay ? 'Trace your drawing' : 'Start your plan'}</h3>
          <p className="mt-1.5 text-sm text-ink-soft">
            {hasUnderlay
              ? 'Pick the Wall tool and click along the walls of the drawing. Corners of the drawing attract the pointer, so the trace lands exactly on it.'
              : 'Pick the Wall tool and click to place corners one after another. Close the loop and it becomes a room.'}
          </p>
          <ul className="mx-auto mt-3 flex max-w-[300px] flex-col gap-1.5 text-left text-[13px] text-ink-soft">
            <li className="flex items-center gap-2">
              <Kbd>W</Kbd> Draw walls, click by click
            </li>
            <li className="flex items-center gap-2">
              <Kbd>3400</Kbd>
              <Kbd>Enter</Kbd> Type an exact length while drawing
            </li>
            <li className="flex items-center gap-2">
              <Kbd>D</Kbd>
              <Kbd>N</Kbd> Add doors and windows to a wall
            </li>
            {hasUnderlay && (
              <li className="flex items-center gap-2">
                <Kbd>C</Kbd> Set the scale from one known distance
              </li>
            )}
          </ul>
          <Button variant="primary" className="mt-4" onClick={() => controller.setTool('wall')}>
            Draw walls
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** After the second Set scale click: ask for the real distance between the two points. */
export function ScalePrompt() {
  const draft = useEditor((s) => s.draft);
  if (draft?.kind !== 'scale' || !draft.done) return null;
  return <ScaleForm key={`${draft.a.x},${draft.a.y},${draft.b.x},${draft.b.y}`} draft={draft} />;
}

function ScaleForm({ draft }: { draft: Extract<Draft, { kind: 'scale' }> }) {
  const controller = useController();
  const view = useEditor((s) => s.view);
  const size = useEditor((s) => s.size);
  const [text, setText] = useState('');
  const [thickness, setThickness] = useState(false);
  const measured = vec.dist(draft.a, draft.b);
  const real = parseLength(text);
  const anchor = planToScreen(view, draft.b);
  const left = Math.max(8, Math.min(size.w - 268, anchor.x + 14));
  const top = Math.max(8, Math.min(size.h - 190, anchor.y + 14));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!real) return;
    if (controller.applyScale(real, { thickness })) toast.success(`Plan rescaled: ${formatMm(measured)} is now ${formatMm(real)}`);
  };
  return (
    <form className="pointer-events-auto absolute w-[260px]" style={{ left, top }} onSubmit={submit} data-testid="scale-prompt">
      <Panel className="flex flex-col gap-2.5 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-soft">Real distance between the two points</span>
          <input
            autoFocus
            type="text"
            aria-label="Real distance"
            className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-faint"
            placeholder={`e.g. 3400, 3.4m or 11'2"`}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && controller.endDraft()}
          />
          <span className="text-xs text-ink-faint">
            Measures {formatMm(measured)} now{real ? `. Everything scales ×${(real / measured).toFixed(3)}` : ''}
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          <input type="checkbox" className="accent-accent" checked={thickness} onChange={(e) => setThickness(e.currentTarget.checked)} />
          Scale wall thickness too
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => controller.endDraft()}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!real}>
            Apply scale
          </Button>
        </div>
      </Panel>
    </form>
  );
}
