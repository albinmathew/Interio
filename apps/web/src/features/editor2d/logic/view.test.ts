import { createSampleLevel } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { angleDeg, formatAngle, formatMm, isLengthChar, parseLength } from './units';
import {
  classifyWheel,
  fitBounds,
  gridLevels,
  levelBounds,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  planToScreen,
  scaleBar,
  screenToPlan,
  snapStep,
  visibleBounds,
  wheelZoomFactor,
  zoomAt,
  type View,
} from './view';

const view: View = { scale: 0.08, tx: 320, ty: 520 };

describe('viewport maths', () => {
  it('maps plan to screen with y flipped, and back', () => {
    expect(planToScreen(view, { x: 0, y: 0 })).toEqual({ x: 320, y: 520 });
    expect(planToScreen(view, { x: 1000, y: 1000 })).toEqual({ x: 400, y: 440 });
    const p = { x: 3417, y: -2250 };
    const back = screenToPlan(view, planToScreen(view, p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('zooms about the cursor: the plan point under it does not move', () => {
    const cursor = { x: 711, y: 233 };
    const before = screenToPlan(view, cursor);
    for (const factor of [1.25, 0.5, 3, 0.01]) {
      const next = zoomAt(view, cursor, factor);
      const after = screenToPlan(next, cursor);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it('clamps zoom to its limits', () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 1e9).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, { x: 0, y: 0 }, 1e-9).scale).toBe(MIN_SCALE);
  });

  it('pans by screen pixels', () => {
    const next = panBy(view, 40, -25);
    expect(planToScreen(next, { x: 0, y: 0 })).toEqual({ x: 360, y: 495 });
    expect(next.scale).toBe(view.scale);
  });

  it('fits bounds inside the viewport minus insets, centred', () => {
    const b = { minX: 0, minY: -1500, maxX: 12000, maxY: 9000 };
    const size = { w: 1280, h: 752 };
    const insets = { left: 84, top: 72, right: 300, bottom: 76 };
    const v = fitBounds(b, size, insets);
    const tl = planToScreen(v, { x: b.minX, y: b.maxY });
    const br = planToScreen(v, { x: b.maxX, y: b.minY });
    expect(tl.x).toBeGreaterThanOrEqual(insets.left - 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(insets.top - 1e-6);
    expect(br.x).toBeLessThanOrEqual(size.w - insets.right + 1e-6);
    expect(br.y).toBeLessThanOrEqual(size.h - insets.bottom + 1e-6);
    // Centred in the free area.
    expect((tl.x + br.x) / 2).toBeCloseTo((insets.left + size.w - insets.right) / 2, 6);
    expect((tl.y + br.y) / 2).toBeCloseTo((insets.top + size.h - insets.bottom) / 2, 6);
  });

  it('finds the bounds of a level and of the visible area', () => {
    expect(levelBounds(createSampleLevel())).toEqual({ minX: 0, minY: -1500, maxX: 12000, maxY: 9000 });
    const vb = visibleBounds({ scale: 0.1, tx: 100, ty: 500 }, { w: 1000, h: 600 });
    expect(vb).toEqual({ minX: -1000, minY: -1000, maxX: 9000, maxY: 5000 });
  });

  it('picks decimal grid levels that stay readable at any zoom', () => {
    for (const scale of [0.004, 0.02, 0.08, 0.3, 1.5]) {
      const levels = gridLevels(scale);
      expect(levels.length).toBeGreaterThan(0);
      for (const g of levels) {
        expect(Math.log10(g.step) % 1).toBe(0);
        expect(g.step * scale).toBeGreaterThanOrEqual(7);
        expect(g.alpha).toBeGreaterThan(0);
        expect(g.alpha).toBeLessThanOrEqual(1);
      }
      // Coarser levels are never fainter than finer ones.
      for (let i = 1; i < levels.length; i++) expect(levels[i]!.alpha).toBeGreaterThanOrEqual(levels[i - 1]!.alpha);
    }
    expect(gridLevels(0.08)[0]!.step).toBe(100);
  });

  it('rounds free points to a step that is small on screen', () => {
    expect(snapStep(0.08)).toBe(50);
    expect(snapStep(0.5)).toBe(5);
    expect(snapStep(2)).toBe(1);
    for (const s of [0.01, 0.08, 0.4, 3]) expect(snapStep(s) * s).toBeLessThanOrEqual(4);
  });

  it('sizes the scale bar to a round length', () => {
    expect(scaleBar(0.08)).toEqual({ mm: 1000, px: 80, label: '1 m' });
    expect(scaleBar(0.5).label).toBe('200 mm');
    for (const s of [0.003, 0.05, 0.7, 3]) {
      const bar = scaleBar(s);
      expect(bar.px).toBeGreaterThan(40);
      expect(bar.px).toBeLessThanOrEqual(110);
      expect([1, 2, 5]).toContain(Number(String(bar.mm).replace(/0+$/, '')) || 1);
    }
  });

  it('tells wheel zoom from two-finger pan', () => {
    const base = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false };
    expect(classifyWheel({ ...base, deltaY: 100, wheelDeltaY: -120 })).toBe('zoom'); // stepped mouse wheel
    expect(classifyWheel({ ...base, deltaY: 3, deltaMode: 1 })).toBe('zoom'); // Firefox lines
    expect(classifyWheel({ ...base, deltaY: 2.5, ctrlKey: true })).toBe('zoom'); // pinch
    expect(classifyWheel({ ...base, deltaY: -4.000244140625, wheelDeltaY: 120 })).toBe('zoom'); // mouse wheel on macOS
    expect(classifyWheel({ ...base, deltaY: 7, wheelDeltaY: -21 })).toBe('pan'); // trackpad scroll
    expect(classifyWheel({ ...base, deltaY: 40, wheelDeltaY: -120 })).toBe('pan'); // fast trackpad scroll
    expect(classifyWheel({ ...base, deltaY: 12 })).toBe('pan'); // pixel deltas without a legacy value
    expect(classifyWheel({ ...base, deltaX: 12, deltaY: 100, wheelDeltaY: -120 })).toBe('pan');
    expect(wheelZoomFactor({ ...base, deltaY: -100 })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ ...base, deltaY: 100 })).toBeLessThan(1);
    expect(wheelZoomFactor({ ...base, deltaY: 100 }) * wheelZoomFactor({ ...base, deltaY: -100 })).toBeCloseTo(1, 9);
  });
});

describe('lengths and angles', () => {
  it('parses typed lengths in the units people use', () => {
    expect(parseLength('3400')).toBe(3400);
    expect(parseLength(' 3400 mm ')).toBe(3400);
    expect(parseLength('340cm')).toBe(3400);
    expect(parseLength('3.4m')).toBe(3400);
    expect(parseLength('3,4 m')).toBe(3400);
    expect(parseLength('3.4')).toBe(3400); // a bare small number is metres
    expect(parseLength('150')).toBe(150);
    expect(parseLength(`11'6"`)).toBeCloseTo(3505.2, 6);
    expect(parseLength('11ft 6in')).toBeCloseTo(3505.2, 6);
    expect(parseLength(`10'`)).toBeCloseTo(3048, 6);
    expect(parseLength(`138"`)).toBeCloseTo(3505.2, 6);
  });

  it('rejects what is not a length', () => {
    for (const bad of ['', '  ', 'abc', '-5', '0', '12 parsecs', '3..4', 'm']) expect(parseLength(bad)).toBeNull();
  });

  it('accepts unit letters only after a digit was typed', () => {
    expect(isLengthChar('3', '')).toBe(true);
    expect(isLengthChar('.', '')).toBe(true);
    expect(isLengthChar('m', '')).toBe(false); // M is the Measure shortcut
    expect(isLengthChar('m', '3.4')).toBe(true);
    expect(isLengthChar("'", '11')).toBe(true);
    expect(isLengthChar('Enter', '11')).toBe(false);
  });

  it('formats lengths and angles', () => {
    expect(formatMm(3400.4)).toBe('3 400 mm');
    expect(formatMm(900)).toBe('900 mm');
    expect(angleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -10, y: -10 })).toBe(225);
    expect(angleDeg({ x: 0, y: 0 }, { x: 10, y: -1e-9 })).toBe(0);
    expect(formatAngle(90)).toBe('90°');
    expect(formatAngle(33.7)).toBe('33.7°');
  });
});
