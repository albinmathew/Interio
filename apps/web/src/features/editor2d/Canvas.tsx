/**
 * The drawing surface: backdrop canvas, plan SVG, and all pointer and wheel
 * input. Input is translated to canvas-relative pixels and handed to the
 * controller; panning and zooming are handled here.
 */
import { usePlanStore, type Level, type Pt, type Underlay } from '@interio/core';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useController } from './context';
import type { PointerInput } from './controller';
import { Backdrop } from './layers/Backdrop';
import { Overlay } from './layers/Overlay';
import { DraftLayer, ItemsLayer, OpeningsLayer, RoomHighlight, RoomsLayer, WallHighlight, WallsLayer } from './layers/PlanLayers';
import { classifyWheel, panBy, wheelZoomFactor, zoomAt } from './logic/view';
import { editorStore, useEditor } from './state';

function cursorFor(tool: string, panning: boolean, dragging: boolean, hoverKind: string | undefined): string {
  if (panning) return 'grab';
  if (dragging) return 'grabbing';
  if (tool === 'hand') return 'grab';
  if (tool === 'select') return hoverKind && hoverKind !== 'room' ? 'move' : 'default';
  return 'crosshair';
}

export function Canvas({ level, underlay, underlayScale }: { level: Level; underlay: Underlay | null; underlayScale: number }) {
  const controller = useController();
  const ref = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  // Touch points currently down, for two-finger pinch and pan.
  const touches = useRef(new Map<number, Pt>());
  const pinch = useRef<{ distance: number; mid: Pt } | null>(null);
  const view = useEditor((s) => s.view);
  const tool = useEditor((s) => s.tool);
  const spacePan = useEditor((s) => s.spacePan);
  const dragging = useEditor((s) => s.dragging);
  const hover = useEditor((s) => s.hover);
  const selection = usePlanStore((s) => s.selection);

  // Track the container size.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const cur = editorStore.getState().size;
      if (r.width > 0 && r.height > 0 && (cur.w !== r.width || cur.h !== r.height)) editorStore.setState({ size: { w: r.width, h: r.height } });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wheel and pinch. Registered natively because React's wheel listener is passive.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const input = {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        wheelDeltaY: (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
      };
      const { view: v } = editorStore.getState();
      if (classifyWheel(input) === 'zoom') editorStore.setState({ view: zoomAt(v, local(e), wheelZoomFactor(input)) });
      else editorStore.setState({ view: panBy(v, -e.deltaX, -e.deltaY) });
    };
    // Safari reports trackpad pinch as gesture events instead of ctrl+wheel.
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      editorStore.setState({ view: zoomAt(editorStore.getState().view, local(g), g.scale / lastScale) });
      lastScale = g.scale;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, []);

  const toInput = (e: ReactPointerEvent): PointerInput => {
    const r = ref.current!.getBoundingClientRect();
    return { screen: { x: e.clientX - r.left, y: e.clientY - r.top }, shift: e.shiftKey, alt: e.altKey };
  };

  const pinchState = () => {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return null;
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, toInput(e).screen);
      if (touches.current.size === 2) {
        // A second finger turns the gesture into pinch-zoom: finish whatever the first one started.
        controller.pointerUp();
        pan.current = null;
        pinch.current = pinchState();
        return;
      }
    }
    // Commit any field being edited in the panel before the selection changes.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
    e.currentTarget.setPointerCapture(e.pointerId);
    const st = editorStore.getState();
    const wantsPan = e.button === 1 || st.spacePan || st.tool === 'hand';
    if (wantsPan || controller.pointerDown(toInput(e)) === 'pan') pan.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, toInput(e).screen);
    if (pinch.current) {
      const next = pinchState();
      if (!next) return;
      const prev = pinch.current;
      pinch.current = next;
      editorStore.setState((s) => ({ view: zoomAt(panBy(s.view, next.mid.x - prev.mid.x, next.mid.y - prev.mid.y), next.mid, next.distance / prev.distance) }));
      return;
    }
    if (pan.current) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      pan.current = { x: e.clientX, y: e.clientY };
      editorStore.setState((s) => ({ view: panBy(s.view, dx, dy) }));
      return;
    }
    controller.pointerMove(toInput(e));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      return;
    }
    if (pan.current) pan.current = null;
    else controller.pointerUp();
  };

  const panning = spacePan || tool === 'hand';
  return (
    <div
      ref={ref}
      data-testid="plan-canvas"
      data-scale={view.scale}
      data-tx={view.tx}
      data-ty={view.ty}
      data-tool={tool}
      className="absolute inset-0 touch-none overflow-hidden bg-canvas select-none"
      style={{ cursor: cursorFor(tool, panning, dragging, hover?.kind) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => controller.pointerLeave()}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Backdrop underlay={underlay} underlayScale={underlayScale} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" role="img" aria-label="Floor plan editor">
        <g transform={`matrix(${view.scale} 0 0 ${view.scale} ${view.tx} ${view.ty})`}>
          <RoomsLayer level={level} />
          <RoomHighlight level={level} />
          <WallsLayer level={level} />
          <WallHighlight level={level} />
          <ItemsLayer level={level} selectedId={selection?.kind === 'item' ? selection.id : null} hoverId={hover?.kind === 'item' ? hover.id : null} />
          <OpeningsLayer level={level} selectedId={selection?.kind === 'opening' ? selection.id : null} hoverId={hover?.kind === 'opening' ? hover.id : null} />
          <DraftLayer level={level} />
        </g>
        <Overlay level={level} />
      </svg>
    </div>
  );
}
