/**
 * Fitting an arbitrary model to a catalog entry's dimensions. Pure maths, no three.js:
 * the result is applied as nested transforms `scale > offset > yaw > model`.
 */

export type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface ModelFit {
  /** Rotation about +Y (radians) applied to the model first, so its front faces +Z. */
  yaw: number;
  /** Translation applied after the yaw: moves the bottom-centre of the rotated bounds to the origin. */
  offset: Vec3;
  /** Per-axis scale applied last: stretches the rotated bounds to `dims`. */
  scale: Vec3;
}

const EPS = 1e-6;

/** Axis-aligned bounds of `b` after a rotation about +Y. Exact for multiples of 90 degrees. */
export function rotateBoundsY(b: Bounds, yaw: number): Bounds {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const x of [b.min[0], b.max[0]]) {
    for (const z of [b.min[2], b.max[2]]) {
      // Rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos.
      const rx = x * c + z * s;
      const rz = -x * s + z * c;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minZ = Math.min(minZ, rz);
      maxZ = Math.max(maxZ, rz);
    }
  }
  return { min: [minX, b.min[1], minZ], max: [maxX, b.max[1], maxZ] };
}

/**
 * Fits a model with bounding box `bounds` (any unit, any origin) to `dims` (mm):
 * after the fit the box is exactly w x h x d metres, its bottom face sits on y = 0
 * and its footprint is centred on the origin. `yawDeg` corrects models whose front
 * does not face +Z. Flat or empty axes keep a scale of 1.
 */
export function fitModel(bounds: Bounds, dims: { w: number; d: number; h: number }, yawDeg = 0): ModelFit {
  const yaw = (yawDeg * Math.PI) / 180;
  const r = rotateBoundsY(bounds, yaw);
  const size: Vec3 = [r.max[0] - r.min[0], r.max[1] - r.min[1], r.max[2] - r.min[2]];
  const target: Vec3 = [dims.w / 1000, dims.h / 1000, dims.d / 1000];
  const scale = size.map((v, i) => (Number.isFinite(v) && v > EPS ? target[i]! / v : 1)) as Vec3;
  const finite = size.every((v) => Number.isFinite(v));
  const offset: Vec3 = finite ? [-(r.min[0] + r.max[0]) / 2, -r.min[1], -(r.min[2] + r.max[2]) / 2] : [0, 0, 0];
  return { yaw, offset, scale };
}

/** Applies a fit to a point of the original model. Mirrors the transform nesting used by the renderer. */
export function applyFit(fit: ModelFit, p: Vec3): Vec3 {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  const x = p[0] * c + p[2] * s;
  const z = -p[0] * s + p[2] * c;
  return [(x + fit.offset[0]) * fit.scale[0], (p[1] + fit.offset[1]) * fit.scale[1], (z + fit.offset[2]) * fit.scale[2]];
}
