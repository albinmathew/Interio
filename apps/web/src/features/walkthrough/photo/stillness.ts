/**
 * Stillness detection for photo mode: how long the view (camera pose, lens and canvas
 * size, as a list of numbers) has stayed the same. Pure, so it is unit tested.
 */

/** Still for this long before the tracer takes over. */
export const STILL_DELAY_MS = 300;
/**
 * While the guided tour plays, a stop holds still for only half a second (less at higher
 * speeds): too short to show a traced picture. Waiting longer keeps the tracer out of the
 * tour's way unless the tour really pauses.
 */
export const TOUR_STILL_DELAY_MS = 900;

export class Stillness {
  private last: Float64Array | null = null;
  private since = 0;

  /** `epsilon`: changes smaller than this (relative to the value, at least absolute 1e-9) are not movement. */
  constructor(private readonly epsilon = 1e-6) {}

  /** Records the view at time `now` (ms). Returns how long it has been still, 0 when it just moved. */
  observe(view: ArrayLike<number>, now: number): number {
    const last = this.last;
    if (!last || last.length !== view.length) {
      this.last = Float64Array.from(view as ArrayLike<number>);
      this.since = now;
      return 0;
    }
    let moved = false;
    for (let i = 0; i < view.length; i++) {
      const a = last[i]!;
      const b = view[i]!;
      if (Math.abs(a - b) > Math.max(1e-9, this.epsilon * Math.max(1, Math.abs(a)))) {
        moved = true;
        break;
      }
    }
    if (moved) {
      last.set(view as ArrayLike<number>);
      this.since = now;
      return 0;
    }
    return now - this.since;
  }

  /** Starts the stillness clock again (after a scene edit, say) without a new view. */
  restart(now: number): void {
    this.since = now;
  }
}

/** The delay before tracing: longer while the guided tour plays. */
export function stillDelay(tourPlaying: boolean): number {
  return tourPlaying ? TOUR_STILL_DELAY_MS : STILL_DELAY_MS;
}
