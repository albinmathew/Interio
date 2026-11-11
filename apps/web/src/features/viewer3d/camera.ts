/** Camera framing maths for the Design view. Pure: world metres, Y up. */

export type Vec3 = [number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/** Direction from the target to the camera in the default dollhouse view: from the south-east, about 45 degrees up. */
export const DOLLHOUSE_DIRECTION: Vec3 = [0.34, 0.72, 0.6];

/** The Showcase view: steep, from the south-east, about 75 degrees above the horizon, like an architect's presentation render. */
export const SHOWCASE_DIRECTION: Vec3 = [0.13, 0.97, 0.21];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Half-angles of the view frustum: vertical from the field of view, horizontal from the aspect ratio. */
export function halfAngles(fovDeg: number, aspect: number): { v: number; h: number } {
  const v = rad(fovDeg) / 2;
  return { v, h: Math.atan(Math.tan(v) * aspect) };
}

/**
 * A dollhouse pose that keeps the whole box in view from `direction`: the camera looks
 * at the middle of the plan and backs off just far enough for every corner of the box
 * to be inside the frustum. Exact, so long or narrow plans still fill the view.
 */
export function fitOrbit(box: Box, fovDeg: number, aspect: number, direction: Vec3 = DOLLHOUSE_DIRECTION, margin = 1.08): CameraPose {
  const target: Vec3 = [(box.min[0] + box.max[0]) / 2, 0, (box.min[2] + box.max[2]) / 2];
  const { v, h } = halfAngles(fovDeg, aspect);
  const l = Math.hypot(...direction) || 1;
  const back: Vec3 = [direction[0] / l, direction[1] / l, direction[2] / l];
  // Camera axes: it looks along -back; right = forward x up, up = right x forward.
  const rl = Math.hypot(back[2], back[0]) || 1;
  const right: Vec3 = [back[2] / rl, 0, -back[0] / rl];
  const up: Vec3 = [-back[1] * right[2], back[0] * right[2] - back[2] * right[0], back[1] * right[0]];
  let distance = 1;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const c: Vec3 = [x - target[0], y - target[1], z - target[2]];
        const along = c[0] * back[0] + c[1] * back[1] + c[2] * back[2];
        const across = Math.abs(c[0] * right[0] + c[2] * right[2]);
        const upward = Math.abs(c[0] * up[0] + c[1] * up[1] + c[2] * up[2]);
        // A corner at depth (distance - along) is in view when its offsets fit the half-angles there.
        distance = Math.max(distance, along + (across * margin) / Math.tan(h), along + (upward * margin) / Math.tan(v));
      }
    }
  }
  return { position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance], target };
}

/** A straight-down pose with plan north at the top of the screen that keeps the plan rectangle in view. */
export function fitTop(box: Box, fovDeg: number, aspect: number, margin = 1.12): CameraPose {
  const target: Vec3 = [(box.min[0] + box.max[0]) / 2, 0, (box.min[2] + box.max[2]) / 2];
  const { v, h } = halfAngles(fovDeg, aspect);
  const halfX = Math.max((box.max[0] - box.min[0]) / 2, 1) * margin;
  const halfZ = Math.max((box.max[2] - box.min[2]) / 2, 1) * margin;
  const height = Math.max(halfZ / Math.tan(v), halfX / Math.tan(h)) + box.max[1];
  // A hair off vertical so the up vector stays defined; the camera's top edge points north (-Z).
  return { position: [target[0], height, target[2] + height * 1e-3], target };
}

/** Keeps an orbit target inside the plan (with a margin) so the user cannot pan the home out of sight. */
export function clampTarget(target: Vec3, box: Box, margin = 2): Vec3 {
  return [
    Math.max(box.min[0] - margin, Math.min(box.max[0] + margin, target[0])),
    Math.max(0, Math.min(box.max[1], target[1])),
    Math.max(box.min[2] - margin, Math.min(box.max[2] + margin, target[2])),
  ];
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FreeView {
  /** Vertical field of view (degrees) and aspect ratio of the part of the canvas not covered by panels. */
  fov: number;
  aspect: number;
  /** How far (px) the centre of that part is right of and below the canvas centre. */
  offsetX: number;
  offsetY: number;
}

/**
 * The part of a `width` x `height` canvas left free by overlay panels, as a smaller
 * view sharing the camera's focal length. Framing for this view and shifting the
 * image by the offset keeps the home clear of the panels.
 */
export function freeView(width: number, height: number, fovDeg: number, insets: Insets): FreeView {
  const w = Math.max(1, width - insets.left - insets.right);
  const h = Math.max(1, height - insets.top - insets.bottom);
  const fov = (2 * Math.atan(Math.tan(rad(fovDeg) / 2) * (h / Math.max(1, height))) * 180) / Math.PI;
  return { fov, aspect: w / h, offsetX: (insets.left - insets.right) / 2, offsetY: (insets.top - insets.bottom) / 2 };
}
