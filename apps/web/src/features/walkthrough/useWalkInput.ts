/**
 * Keyboard, mouse and touch for walk mode. Translates DOM events into calls on
 * the controller; holds no walking logic of its own.
 *
 * - Mouse look mode: click the view to lock the pointer, Esc to release.
 * - Click-to-move mode (and touch): tap a floor point to walk there, drag to look.
 * - W/A/S/D and arrows move, Q/E turn, Shift walks faster. Without pointer lock
 *   the left and right arrows turn instead of strafing, so the keyboard alone is enough.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { WalkController } from './controller';
import type { SceneBridge } from './Scene';
import { walkUi } from './store';

const LOCK_SENSITIVITY = 0.0022; // rad per pixel of mouse travel
const DRAG_SENSITIVITY = 0.0045;
const TAP_SLOP = 6; // px
const TAP_TIME = 450; // ms

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export interface WalkInputApi {
  /** Joystick deflection, each -1..1: x strafes right, y walks forward. */
  setStick(x: number, y: number): void;
  /** Locks the pointer to the view (must be called from a user gesture). */
  lock(): void;
  unlock(): void;
}

export function useWalkInput(controller: WalkController | null, canvas: HTMLCanvasElement | null, bridge: RefObject<SceneBridge | null>): WalkInputApi {
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  /** Live while the listeners are attached; no-ops before the canvas exists. */
  const live = useRef({ apply: () => {}, lock: () => {}, unlock: () => {} });

  useEffect(() => {
    if (!controller || !canvas) return;
    const k = keys.current;
    const locked = () => document.pointerLockElement === canvas;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const has = (code: string) => (k.has(code) ? 1 : 0);

    const apply = () => {
      const side = has('ArrowRight') - has('ArrowLeft');
      const input = controller.input;
      input.forward = clamp(has('KeyW') + has('ArrowUp') - has('KeyS') - has('ArrowDown') + stick.current.y);
      input.strafe = clamp(has('KeyD') - has('KeyA') + (locked() ? side : 0) + stick.current.x);
      input.turn = clamp(has('KeyQ') - has('KeyE') - (locked() ? 0 : side));
      input.run = k.has('ShiftLeft') || k.has('ShiftRight');
      if (input.forward || input.strafe || input.turn) walkUi.acted();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || !MOVE_KEYS.has(e.code)) return;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      k.add(e.code);
      apply();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (k.delete(e.code)) apply();
    };
    const release = () => {
      k.clear();
      apply();
    };

    const lock = () => {
      if (locked()) return;
      // Browsers refuse a re-lock for about a second after Esc; the prompt stays up so the user can try again.
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
    };
    const unlock = () => {
      if (locked()) document.exitPointerLock();
    };
    const onLockChange = () => {
      const now = locked();
      const was = walkUi.get().locked;
      // Released without our asking (Esc): offer to resume. A tour releases it on purpose.
      walkUi.set({ locked: now, released: was && !now && controller.tourState().status !== 'playing' });
      if (now) walkUi.acted();
      apply();
    };

    /** Pointers currently down on the view. */
    const down = new Map<number, { x: number; y: number; startX: number; startY: number; at: number; dragged: boolean }>();

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !walkUi.get().touch) walkUi.set({ touch: true });
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (locked()) return;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, at: performance.now(), dragged: false });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Without capture a drag simply ends when the pointer leaves the view.
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (locked()) {
        controller.look(-e.movementX * LOCK_SENSITIVITY, -e.movementY * LOCK_SENSITIVITY);
        return;
      }
      const p = down.get(e.pointerId);
      if (!p) return;
      if (!p.dragged && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > TAP_SLOP) p.dragged = true;
      if (p.dragged) {
        // Grab-and-drag: the scene follows the finger.
        controller.look((e.clientX - p.x) * DRAG_SENSITIVITY, (e.clientY - p.y) * DRAG_SENSITIVITY);
        walkUi.acted();
      }
      p.x = e.clientX;
      p.y = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const p = down.get(e.pointerId);
      down.delete(e.pointerId);
      if (!p || e.type === 'pointercancel' || p.dragged || performance.now() - p.at > TAP_TIME) return;
      if (controller.tourState().status === 'playing') return;
      if (e.pointerType === 'mouse' && walkUi.get().moveMode === 'look') {
        lock();
        return;
      }
      const point = bridge.current?.pick(e.clientX, e.clientY);
      if (point) {
        controller.walkTo(point);
        walkUi.acted();
      }
    };

    live.current = { apply, lock, unlock };
    apply(); // pick up a stick that was already held when the view came up

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      unlock();
      live.current = { apply: () => {}, lock: () => {}, unlock: () => {} };
      k.clear();
      controller.input.forward = controller.input.strafe = controller.input.turn = 0;
      controller.input.run = false;
      walkUi.set({ locked: false, released: false });
    };
  }, [controller, canvas, bridge]);

  // Stable handles: safe to pass as props and list in effect dependencies.
  return useMemo(
    () => ({
      setStick: (x, y) => {
        stick.current = { x, y };
        live.current.apply();
      },
      lock: () => live.current.lock(),
      unlock: () => live.current.unlock(),
    }),
    [],
  );
}
