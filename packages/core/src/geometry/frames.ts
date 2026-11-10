import type { Pt } from '../schema';

/** Plan mm (x, y, elevation z) -> world metres [X, Y, Z] with Y up. */
export function planToWorld(p: Pt, z = 0): [number, number, number] {
  return [p.x / 1000, z / 1000, -p.y / 1000];
}

/** World metres (X, Z) -> plan mm. */
export function worldToPlan(x: number, z: number): Pt {
  return { x: x * 1000, y: -z * 1000 };
}

/** Plan rotation (CCW degrees) -> rotation about world +Y in radians. */
export function planDegToWorldYaw(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function worldYawToPlanDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
