/** Two-click scale: resize a whole level about the plan origin. */
import { ops, type Level } from '@interio/core';

export interface RescaleOptions {
  /** Also scale wall thickness (for plans imported at the wrong scale, not for traced ones). */
  thickness?: boolean;
}

/**
 * Multiplies every plan position by `k`: vertices, opening offsets and widths,
 * room seeds and item positions. Heights are untouched. Mutates the level: run
 * it inside `mutateLevel` with `reconcileRooms`.
 */
export function rescaleLevel(level: Level, k: number, opts: RescaleOptions = {}): void {
  if (!Number.isFinite(k) || k <= 0 || k === 1) return;
  for (const v of Object.values(level.vertices)) {
    v.x = Math.round(v.x * k);
    v.y = Math.round(v.y * k);
  }
  if (opts.thickness) for (const w of Object.values(level.walls)) w.thickness = Math.max(10, Math.round(w.thickness * k));
  for (const o of Object.values(level.openings)) {
    o.offset = Math.round(o.offset * k);
    o.width = Math.max(1, Math.round(o.width * k));
    if (!ops.clampOpening(level, o)) delete level.openings[o.id];
  }
  for (const r of Object.values(level.rooms)) {
    r.seed = { x: Math.round(r.seed.x * k), y: Math.round(r.seed.y * k) };
  }
  for (const i of Object.values(level.items)) {
    i.x = Math.round(i.x * k);
    i.y = Math.round(i.y * k);
  }
  ops.weldVertices(level, 1);
}

/** Key in `project.settings` holding the factor applied to the stored underlay so it follows a rescale. */
export const UNDERLAY_SCALE_KEY = 'editor2d.underlayScale';

export function underlayScaleOf(settings: Record<string, unknown> | undefined): number {
  const v = settings?.[UNDERLAY_SCALE_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1;
}
