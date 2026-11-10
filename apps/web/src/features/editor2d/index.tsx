/**
 * Plan mode: the 2D plan editor.
 *
 * Layout of this feature:
 * - `logic/`      pure maths: viewport, snapping, hit testing, openings, walls, rescale
 * - `controller`  tool behaviour on top of the plan store and the editor UI store
 * - `layers/`     drawing: backdrop canvas (grid, underlay), plan SVG, screen overlay
 * - `panel/`      properties of the selection
 * - `chrome/`     toolbar, view controls, help, prompts
 */
import { planStore, useLevel, usePlanStore } from '@interio/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnderlay } from '../../lib/useUnderlay';
import { toast } from '../../ui';
import { Canvas } from './Canvas';
import { EmptyHint, Help, Issues, ScalePrompt } from './chrome/Assist';
import { HintBar, Toolbar } from './chrome/Toolbar';
import { ViewControls } from './chrome/ViewControls';
import { ControllerContext } from './context';
import { createController } from './controller';
import { installDevHooks } from './dev';
import { underlayScaleOf } from './logic/rescale';
import { scalePoints, underlayBounds } from './logic/underlay';
import { PropertiesPanel } from './panel/PropertiesPanel';
import { editorStore, useEditor } from './state';

if (import.meta.env.DEV) installDevHooks();

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export default function Editor2D() {
  const level = useLevel();
  const projectId = usePlanStore((s) => s.project?.id);
  const settings = usePlanStore((s) => s.project?.settings);
  const underlay = useUnderlay(projectId);
  const underlayScale = underlayScaleOf(settings);
  const tool = useEditor((s) => s.tool);
  const drafting = useEditor((s) => s.draft !== null);

  // The stored underlay follows Set scale through a factor kept with the project.
  const derived = useMemo(
    () => (underlay ? { points: scalePoints(underlay.snapPoints, underlayScale), bounds: underlayBounds(underlay, underlayScale) } : null),
    [underlay, underlayScale],
  );
  const derivedRef = useRef(derived);
  derivedRef.current = derived;

  const [controller] = useState(() =>
    createController({
      plan: planStore,
      ui: editorStore,
      underlayPoints: () => derivedRef.current?.points ?? null,
      underlayBounds: () => derivedRef.current?.bounds ?? null,
      notify: toast.info,
    }),
  );

  useEffect(() => {
    const disconnect = controller.connect();
    return () => {
      disconnect();
      editorStore.setState({ draft: null, snap: null, guides: [], hover: null, dragging: false, spacePan: false, helpOpen: false });
    };
  }, [controller]);

  // Fit once per project; coming back to Plan mode keeps the camera.
  useEffect(() => {
    if (!projectId || editorStore.getState().fittedFor === projectId) return;
    controller.setTool('select');
    controller.fit();
    editorStore.setState({ fittedFor: projectId });
  }, [projectId, controller]);

  // A drawing that arrives for a plan with nothing traced yet: show it.
  const hasWalls = !!level && Object.keys(level.walls).length > 0;
  useEffect(() => {
    if (underlay && !hasWalls) controller.fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlay, controller]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === ' ') {
        // Space is the pan modifier here, never "press the focused button".
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
        if (!editorStore.getState().spacePan) editorStore.setState({ spacePan: true });
        return;
      }
      if (controller.keyDown({ key: e.key, shift: e.shiftKey, alt: e.altKey, mod: e.metaKey || e.ctrlKey })) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') editorStore.setState({ spacePan: false });
    };
    const onBlur = () => editorStore.setState({ spacePan: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [controller]);

  if (!level) return null;
  const showEmpty = !hasWalls && !drafting && tool === 'select';
  return (
    <ControllerContext.Provider value={controller}>
      <div className="relative h-full w-full overflow-hidden" data-testid="editor2d" data-underlay={underlay ? 'ready' : 'none'}>
        <Canvas level={level} underlay={underlay} underlayScale={underlayScale} />
        {showEmpty && <EmptyHint hasUnderlay={!!underlay} />}
        <ScalePrompt />
        <div className="pointer-events-none absolute top-3 left-3">
          <Toolbar />
        </div>
        <div className="pointer-events-none absolute top-3 right-[288px] left-[68px] flex justify-center">
          <HintBar />
        </div>
        <div className="pointer-events-none absolute top-3 right-3 bottom-16 flex flex-col">
          <PropertiesPanel level={level} />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3">
          <ViewControls hasUnderlay={!!underlay} />
        </div>
        <div className="pointer-events-none absolute right-3 bottom-3 flex items-end gap-2">
          <Issues level={level} />
          <Help />
        </div>
      </div>
    </ControllerContext.Provider>
  );
}
