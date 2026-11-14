/**
 * Walk mode's own UI state: view options, panel visibility, and a mirror of the
 * controller's discrete state (current room, tour) for React to render.
 * Plan data stays in the plan store.
 */
import type { Id } from '@interio/core';
import { create } from 'zustand';
import type { TourState } from './controller';
import type { Pose } from './route';

/** `look`: click locks the pointer for mouse look. `click`: click a floor point to walk there, drag to look. */
export type MoveMode = 'look' | 'click';

export const FOV_RANGE = { min: 40, max: 110, initial: 70 } as const;
/** A gentle eye height: a touch below a standing adult's eyes, as interior photographers shoot. */
export const EYE_RANGE = { min: 1000, max: 1900, initial: 1550 } as const;
export const TOUR_SPEEDS = [0.5, 1, 2, 4] as const;

const IDLE_TOUR: TourState = { status: 'idle', index: 0, total: 0, phase: null, roomId: null, visited: [], speed: 1 };

export interface WalkUi {
  fov: number;
  eyeHeight: number;
  tourSpeed: number;
  /** A very slight bob of the head while walking. */
  headBob: boolean;
  moveMode: MoveMode;
  roomsOpen: boolean;
  mapOpen: boolean;
  settingsOpen: boolean;
  /** A touch has been seen: show the joystick. */
  touch: boolean;
  /** Pointer is locked to the canvas. */
  locked: boolean;
  /** Pointer lock was released with Esc: show the resume prompt. */
  released: boolean;
  /** The walker has moved or looked at least once: the hint can go. */
  hintSeen: boolean;
  fullscreen: boolean;
  roomId: Id | null;
  tour: TourState;
}

const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
const wide = typeof window === 'undefined' || window.innerWidth >= 900;

export const useWalkUi = create<WalkUi>(() => ({
  fov: FOV_RANGE.initial,
  eyeHeight: EYE_RANGE.initial,
  tourSpeed: 1,
  headBob: true,
  moveMode: coarse ? 'click' : 'look',
  roomsOpen: wide,
  mapOpen: wide,
  settingsOpen: false,
  touch: coarse,
  locked: false,
  released: false,
  hintSeen: false,
  fullscreen: false,
  roomId: null,
  tour: IDLE_TOUR,
}));

export const walkUi = {
  set: (patch: Partial<WalkUi>) => useWalkUi.setState(patch),
  get: () => useWalkUi.getState(),
  /** First movement or look: fade the hint out for good. */
  acted: () => {
    if (!useWalkUi.getState().hintSeen) useWalkUi.setState({ hintSeen: true });
  },
};

/* ---------------------------------------------------- last pose per project */

const KEY = (projectId: string) => `interio.walk.pose.${projectId}`;
const memory = new Map<string, Pose>();

/** Remembers where the walker was, for this browser session. */
export function savePose(projectId: string, pose: Pose): void {
  memory.set(projectId, pose);
  try {
    sessionStorage.setItem(KEY(projectId), JSON.stringify(pose));
  } catch {
    // Storage can be unavailable (private mode, quota): the in-memory copy still covers mode switches.
  }
}

export function loadPose(projectId: string): Pose | null {
  const held = memory.get(projectId);
  if (held) return held;
  try {
    const raw = sessionStorage.getItem(KEY(projectId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pose>;
    if (typeof p.x === 'number' && typeof p.y === 'number' && typeof p.yawDeg === 'number' && [p.x, p.y, p.yawDeg].every(Number.isFinite)) {
      return { x: p.x, y: p.y, yawDeg: p.yawDeg };
    }
  } catch {
    // Unreadable entry: start from the entrance.
  }
  return null;
}
