import { describe, expect, it } from 'vitest';
import { clampTarget, fitOrbit, fitTop, freeView, halfAngles, type Box, type CameraPose, type Vec3 } from './camera';

const box: Box = { min: [0, 0, -9], max: [12, 3, 1.5] };

/** Angles (radians) of a point off the camera's axis, horizontally and vertically. */
function offAxis(pose: CameraPose, p: Vec3): { h: number; v: number } {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(...a);
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const forward = unit(sub(pose.target, pose.position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(p, pose.position);
  const depth = dot(d, forward);
  return { h: Math.atan2(Math.abs(dot(d, right)), depth), v: Math.atan2(Math.abs(dot(d, up)), depth) };
}

function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

describe('camera framing', () => {
  it.each([
    [38, 16 / 9],
    [38, 0.7],
    [15, 1.4],
  ])('fitOrbit keeps the whole home in view (fov %d, aspect %d)', (fov, aspect) => {
    const pose = fitOrbit(box, fov, aspect);
    const { v, h } = halfAngles(fov, aspect);
    for (const c of corners(box)) {
      const a = offAxis(pose, c);
      expect(a.h).toBeLessThan(h);
      expect(a.v).toBeLessThan(v);
    }
    // Looks at the middle of the plan from above, from the south-east.
    expect(pose.target).toEqual([6, 0, -3.75]);
    expect(pose.position[1]).toBeGreaterThan(5);
    expect(pose.position[0]).toBeGreaterThan(pose.target[0]);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
  });

  it.each([
    ['the sample', box],
    ['a long narrow plan', { min: [0, 0, -24], max: [7, 3, 0] } as Box],
    ['a wide shallow plan', { min: [-15, 0, -4], max: [15, 3, 0] } as Box],
  ])('fitOrbit is tight on %s: the plan fills the view instead of floating in it', (_name, plan) => {
    const fov = 38;
    const aspect = 1.4;
    const pose = fitOrbit(plan, fov, aspect);
    const { v, h } = halfAngles(fov, aspect);
    const used = corners(plan).map((c) => {
      const a = offAxis(pose, c);
      return Math.max(Math.tan(a.h) / Math.tan(h), Math.tan(a.v) / Math.tan(v));
    });
    // Everything is inside, and the outermost corner is within the margin of the edge.
    expect(Math.max(...used)).toBeLessThan(1);
    expect(Math.max(...used)).toBeGreaterThan(0.9);
  });

  it('fitTop looks straight down with north up and fits the plan rectangle', () => {
    const pose = fitTop(box, 15, 1.5);
    const { v, h } = halfAngles(15, 1.5);
    expect(pose.position[0]).toBe(pose.target[0]);
    // Just south of the target, so the top of the screen is north (-Z).
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
    expect(pose.position[2] - pose.target[2]).toBeLessThan(0.01 * pose.position[1]);
    const height = pose.position[1] - box.max[1];
    expect(Math.atan2(6, height)).toBeLessThan(h);
    expect(Math.atan2(5.25, height)).toBeLessThan(v);
    // A narrower screen needs more height.
    expect(fitTop(box, 15, 0.6).position[1]).toBeGreaterThan(pose.position[1]);
  });

  it('freeView describes the canvas area the panels leave free', () => {
    const none = freeView(1200, 800, 38, { left: 0, right: 0, top: 0, bottom: 0 });
    expect(none.fov).toBeCloseTo(38, 9);
    expect(none.aspect).toBeCloseTo(1.5, 9);
    expect(none.offsetX).toBe(0);
    expect(none.offsetY).toBe(0);
    const free = freeView(1200, 800, 38, { left: 300, right: 0, top: 60, bottom: 40 });
    expect(free.aspect).toBeCloseTo(900 / 700, 9);
    // Same focal length: the half-height shrinks in proportion.
    expect(Math.tan((free.fov * Math.PI) / 360)).toBeCloseTo(Math.tan((38 * Math.PI) / 360) * (700 / 800), 9);
    expect(free.offsetX).toBe(150);
    expect(free.offsetY).toBe(10);
  });

  it('clampTarget keeps the orbit target near the plan', () => {
    expect(clampTarget([6, 0, -4], box)).toEqual([6, 0, -4]);
    expect(clampTarget([40, 9, 30], box)).toEqual([14, 3, 3.5]);
    expect(clampTarget([-40, -2, -30], box)).toEqual([-2, 0, -11]);
  });
});
