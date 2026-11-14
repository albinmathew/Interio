/**
 * Photo mode's UI state: the toggle (remembered for the browser session), whether this
 * device can path trace, and the tracer's progress for the HUD.
 */
import { create } from 'zustand';
import type { PhotoStatus } from './progress';

const KEY = 'interio.walk.photo';

function remembered(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export interface PhotoUi {
  enabled: boolean;
  /** null until the canvas has been checked. */
  available: boolean | null;
  /** Why photo mode is unavailable, for the tooltip. */
  reason: string;
  status: PhotoStatus;
  samples: number;
}

export const usePhotoUi = create<PhotoUi>(() => ({
  enabled: typeof window === 'undefined' ? false : remembered(),
  available: null,
  reason: '',
  status: 'off',
  samples: 0,
}));

export const photoUi = {
  get: () => usePhotoUi.getState(),
  set: (patch: Partial<PhotoUi>) => usePhotoUi.setState(patch),
  setEnabled(enabled: boolean): void {
    usePhotoUi.setState({ enabled });
    try {
      sessionStorage.setItem(KEY, enabled ? '1' : '0');
    } catch {
      // No session storage: the choice lasts until the page is reloaded.
    }
  },
};
