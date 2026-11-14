/**
 * How much to trace per frame. Tracing is paced by the frame rate the view actually reaches,
 * measured over quarter-second windows the way walk mode's performance monitor measures it:
 * that monitor drops the scene to low quality for good when the frame rate stays under its
 * lower bound (40 fps at 60 Hz, 60 fps above 100 Hz). So tracing speeds up while the frame
 * rate stays comfortably above that bound and backs off as soon as it nears it. The view
 * stays responsive to the next movement either way. Pure, so it is unit tested.
 */

const WINDOW_MS = 250;
/** Frame rates to hold while tracing: clear of the monitor's lower bounds (40 and 60 fps). */
export const TARGET_FPS_60HZ = 50;
export const TARGET_FPS_HIGH = 72;
const MIN_RATE = 2;
const MAX_RATE = 400;
const MAX_TILES_PER_FRAME = 3;

export class FrameBudget {
  /** Typical frame interval while not tracing: the display's refresh interval, near enough. */
  private refreshMs = 1000 / 60;
  /** Tiles per second. */
  private rate = 20;
  private carry = 0;
  private windowMs = 0;
  private windowFrames = 0;

  /** Records a frame interval (ms) seen while not tracing, to learn the display's refresh rate. */
  observeIdle(frameMs: number): void {
    // Smoothed, so one early or late frame does not change the verdict.
    if (frameMs > 2 && frameMs < 100) this.refreshMs += (frameMs - this.refreshMs) * 0.05;
  }

  /** A display above 100 Hz holds frames under 10 ms when idle. */
  get targetFps(): number {
    return this.refreshMs < 10 ? TARGET_FPS_HIGH : TARGET_FPS_60HZ;
  }

  get tilesPerSecond(): number {
    return this.rate;
  }

  /** Records the last frame's duration (ms) while tracing; returns how many tiles to trace this frame. */
  next(frameMs: number): number {
    const ms = Math.max(0, Math.min(frameMs, 250));
    this.windowMs += ms;
    this.windowFrames += 1;
    if (this.windowMs >= WINDOW_MS) {
      const fps = (this.windowFrames / this.windowMs) * 1000;
      const target = this.targetFps;
      // Back off hard below the target, creep up above it.
      if (fps < target) this.rate *= Math.max(0.6, fps / target - 0.05);
      else if (fps > target + 1) this.rate *= 1.12;
      this.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, this.rate));
      this.windowMs = 0;
      this.windowFrames = 0;
    }
    this.carry += (this.rate * ms) / 1000;
    const tiles = Math.min(MAX_TILES_PER_FRAME, Math.floor(this.carry));
    this.carry = Math.min(this.carry - tiles, MAX_TILES_PER_FRAME);
    return tiles;
  }

  /** A new view starts from the last rate that worked, a little more cautiously. */
  reset(): void {
    this.rate = Math.max(MIN_RATE, this.rate * 0.8);
    this.carry = 0;
    this.windowMs = 0;
    this.windowFrames = 0;
  }
}
