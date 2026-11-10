/**
 * Design mode: furnish and style the home in 3D. Orbit the dollhouse or look straight
 * down, place entries from the catalog, then move, turn, duplicate and remove them.
 */
import { planStore, useLevel, usePlanStore, type Level } from '@interio/core';
import { Canvas } from '@react-three/fiber';
import { PencilRuler } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Kbd, Panel } from '../../ui';
import { duplicateSelection, nudgeSelection, removeSelection, rotateSelection } from './actions';
import { CatalogPanel } from './CatalogPanel';
import { nudgeDirection } from './placement';
import { Scene, useLiveItems, useOverlaps } from './Scene';
import { SidePanel } from './SidePanel';
import { cameraState, entryOrPlaceholder, useViewer } from './state';
import { Toolbar } from './Toolbar';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const ui = useViewer.getState();
      const selected = planStore.getState().selection?.kind === 'item';
      const key = e.key;
      if (key === 'Escape') {
        if (ui.placing) ui.stopPlacing();
        else planStore.getState().select(null);
      } else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && (ui.placing || selected)) {
        rotateSelection(e.shiftKey ? -1 : 1, e.altKey);
      } else if ((key === 'Delete' || key === 'Backspace') && selected) {
        removeSelection();
      } else if (e.code === 'KeyD' && (e.metaKey || e.ctrlKey) && selected) {
        duplicateSelection();
      } else if ((key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') && selected) {
        const step = e.shiftKey ? 10 : 50;
        const d = nudgeDirection(key, cameraState.heading());
        nudgeSelection(d.x * step, d.y * step);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Hint({ level }: { level: Level }) {
  const placing = useViewer((s) => s.placing);
  const selection = usePlanStore((s) => s.selection);
  let body: ReactNode;
  if (placing) {
    body = (
      <>
        Click the floor to place <span className="font-medium text-ink">{entryOrPlaceholder(placing.catalogId).name}</span> · <Kbd>R</Kbd> turn ·{' '}
        <Kbd>Alt</Kbd> no snapping · <Kbd>Esc</Kbd> cancel
      </>
    );
  } else if (selection?.kind === 'item' && level.items[selection.id]) {
    body = (
      <>
        Drag to move · <Kbd>R</Kbd> turn · arrows nudge · <Kbd>⌘D</Kbd> duplicate · <Kbd>Del</Kbd> remove
      </>
    );
  } else {
    body = <>Pick something from the catalog, or click a room · drag to orbit · scroll to zoom</>;
  }
  return (
    <div
      data-testid="viewer-hint"
      className="pointer-events-none absolute bottom-3 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-lg bg-surface/90 px-3 py-1.5 text-xs whitespace-nowrap text-ink-soft shadow-[var(--shadow-panel)]"
    >
      {body}
    </div>
  );
}

/** Shown instead of the hint when the walls do not close a single room yet. */
function NoRooms() {
  return (
    <Panel className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 py-2 pr-2 pl-3.5">
      <p className="text-[13px] text-ink-soft" data-testid="viewer-no-rooms">
        <span className="font-medium text-ink">No rooms yet.</span> Close the walls into rooms in Plan mode to furnish and style them.
      </p>
      <PlanModeButton />
    </Panel>
  );
}

function PlanModeButton() {
  const navigate = useNavigate();
  const projectId = usePlanStore((s) => s.project?.id);
  return (
    <Button
      variant="primary"
      size="sm"
      className="shrink-0"
      icon={<PencilRuler className="h-4 w-4" />}
      data-testid="open-plan-mode"
      onClick={() => projectId && navigate(`/p/${projectId}/plan`)}
    >
      Open Plan mode
    </Button>
  );
}

function Overlay({ level }: { level: Level }) {
  const items = useLiveItems(level);
  const overlaps = useOverlaps(level, items);
  return (
    <>
      <CatalogPanel level={level} className="absolute top-3 bottom-3 left-3 w-72" />
      <Toolbar level={level} />
      <SidePanel level={level} items={items} overlaps={overlaps} className="absolute top-3 right-3 max-h-[calc(100%-1.5rem)] w-64" />
      {Object.keys(level.rooms).length === 0 ? <NoRooms /> : <Hint level={level} />}
    </>
  );
}

export default function Viewer3D() {
  const level = useLevel();
  const quality = useViewer((s) => s.quality);
  useKeyboard();
  // Leaving the view drops any half-finished placement.
  useEffect(() => () => useViewer.setState({ placing: null, ghost: null, drag: null }), []);
  if (!level) return null;
  if (Object.keys(level.walls).length === 0)
    return (
      <div className="h-full w-full" data-testid="viewer-empty">
        <EmptyState
          icon={<PencilRuler className="h-8 w-8" />}
          title="Nothing to furnish yet"
          body="This home has no walls. Draw them in Plan mode, or import a floor plan, and the 3D view appears here."
          action={<PlanModeButton />}
        />
      </div>
    );
  return (
    <div className="relative h-full w-full" data-testid="viewer3d">
      <Canvas
        shadows="percentage"
        frameloop="demand"
        dpr={quality === 'high' ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 38, near: 0.1, far: 600, position: [12, 14, 12] }}
      >
        <Scene level={level} />
      </Canvas>
      <Overlay level={level} />
    </div>
  );
}
