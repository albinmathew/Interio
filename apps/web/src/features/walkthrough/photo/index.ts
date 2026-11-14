/**
 * Photo mode for the walkthrough: stand still and the view refines into a path-traced,
 * photoreal picture; move and the live view is back at once.
 *
 * - `PhotoMode` goes inside the walk canvas (last child); `PhotoHud` beside the view options.
 * - `stillness.ts`, `budget.ts` and `progress.ts` are pure and unit tested; the tracer
 *   itself lives in `@interio/scene3d` (`pathtrace/`).
 */
export { PhotoMode, type PhotoDebugHook } from './PhotoMode';
export { PhotoHud } from './PhotoHud';
