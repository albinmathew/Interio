/**
 * Photo mode's progress: the states the tracer goes through and the words the HUD shows
 * for them. Pure, so it is unit tested.
 */

/**
 * - `off`: the toggle is off.
 * - `unavailable`: this device cannot path trace (software renderer, no float targets, failed start).
 * - `preparing`: loading the tracer, building its scene or compiling its shader.
 * - `live`: ready, the walker is moving (or has just stopped).
 * - `refining`: the traced image is converging.
 * - `ready`: clean enough to keep; it keeps improving until `MAX_SAMPLES`.
 */
export type PhotoStatus = 'off' | 'unavailable' | 'preparing' | 'live' | 'refining' | 'ready';

/** Samples per pixel at which the picture counts as clean. */
export const READY_SAMPLES = 96;
/** Tracing stops here: the picture no longer visibly changes. */
export const MAX_SAMPLES = 1024;

export function photoStatus(opts: { enabled: boolean; available: boolean; prepared: boolean; tracing: boolean; samples: number }): PhotoStatus {
  if (!opts.available) return 'unavailable';
  if (!opts.enabled) return 'off';
  if (!opts.prepared) return 'preparing';
  if (!opts.tracing) return 'live';
  return opts.samples >= READY_SAMPLES ? 'ready' : 'refining';
}

export interface ProgressText {
  label: string;
  detail: string;
  /** 0..1 towards `READY_SAMPLES`, for a progress bar. */
  fraction: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the HUD says, or null when it should say nothing. */
export function progressText(status: PhotoStatus, samples: number): ProgressText | null {
  switch (status) {
    case 'preparing':
      return { label: 'Preparing photo mode…', detail: '', fraction: 0 };
    case 'refining':
      return { label: 'Refining…', detail: samples > 0 ? plural(samples, 'sample') : '', fraction: Math.min(1, samples / READY_SAMPLES) };
    case 'ready':
      return { label: 'Ready', detail: plural(samples, 'sample'), fraction: 1 };
    default:
      return null;
  }
}
