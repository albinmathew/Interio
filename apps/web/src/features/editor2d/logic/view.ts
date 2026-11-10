/**
 * Viewport maths. Plan space is millimetres with y up; screen space is CSS
 * pixels with y down. A view maps plan (x, y) to screen (tx + x*s, ty - y*s).
 */
import type { Level, Pt } from '@interio/core';

export interface View {
  /** Pixels per millimetre. */
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const MIN_SCALE = 0.002;
export const MAX_SCALE = 4;
/** The zoom shown as 100%: one pixel per 10 mm. */
export const NOMINAL_SCALE = 0.1;
export const DEFAULT_VIEW: View = { scale: 0.08, tx: 320, ty: 520 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const planToScreen = (v: View, p: Pt): Pt => ({ x: v.tx + p.x * v.scale, y: v.ty - p.y * v.scale });
export const screenToPlan = (v: View, s: Pt): Pt => ({ x: (s.x - v.tx) / v.scale, y: (v.ty - s.y) / v.scale });

/** Zooms by `factor` keeping the plan point under `screen` fixed. */
export function zoomAt(v: View, screen: Pt, factor: number): View {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / v.scale;
  return { scale, tx: screen.x - (screen.x - v.tx) * k, ty: screen.y - (screen.y - v.ty) * k };
}

export const panBy = (v: View, dx: number, dy: number): View => ({ scale: v.scale, tx: v.tx + dx, ty: v.ty + dy });

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Bounds of everything drawn on a level, or null when it is empty. */
export function levelBounds(level: Level): Bounds | null {
  let b: Bounds | null = null;
  const grow = (x: number, y: number, r = 0) => {
    b = unionBounds(b, { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r });
  };
  for (const v of Object.values(level.vertices)) grow(v.x, v.y);
  for (const i of Object.values(level.items)) grow(i.x, i.y, 500);
  return b;
}

/** The view that shows `b` centred inside the viewport minus `insets`. */
export function fitBounds(b: Bounds, size: Size, insets: Insets = { left: 0, top: 0, right: 0, bottom: 0 }): View {
  // Chrome that would leave too little room is ignored rather than squeezing the plan to nothing.
  const ix = insets.left + insets.right < size.w * 0.6 ? insets : { ...insets, left: 16, right: 16 };
  const iy = insets.top + insets.bottom < size.h * 0.6 ? insets : { ...insets, top: 16, bottom: 16 };
  const availW = Math.max(40, size.w - ix.left - ix.right);
  const availH = Math.max(40, size.h - iy.top - iy.bottom);
  const w = Math.max(b.maxX - b.minX, 1000);
  const h = Math.max(b.maxY - b.minY, 1000);
  const scale = clamp(Math.min(availW / w, availH / h), MIN_SCALE, MAX_SCALE);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { scale, tx: ix.left + availW / 2 - cx * scale, ty: iy.top + availH / 2 + cy * scale };
}

export function visibleBounds(v: View, size: Size): Bounds {
  const a = screenToPlan(v, { x: 0, y: size.h });
  const b = screenToPlan(v, { x: size.w, y: 0 });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

export interface GridLevel {
  /** Line spacing in mm (a power of ten). */
  step: number;
  /** 0..1 line strength: grows as the spacing grows on screen, so levels fade in and out. */
  alpha: number;
}

/** Decimal grid levels worth drawing at this zoom, finest first. */
export function gridLevels(scale: number, minPx = 7): GridLevel[] {
  const out: GridLevel[] = [];
  let step = 10 ** Math.ceil(Math.log10(minPx / scale));
  step = Math.max(step, 10);
  for (let i = 0; i < 3; i++, step *= 10) {
    const px = step * scale;
    if (px < minPx) continue;
    out.push({ step, alpha: clamp((px - minPx) / 90, 0.12, 1) });
  }
  return out;
}

/** Free points are rounded to this step: the coarsest tidy step that stays under ~4 px. */
export function snapStep(scale: number): number {
  let best = 1;
  for (const s of [5, 10, 50, 100, 500]) if (s * scale <= 4) best = s;
  return best;
}

export interface ScaleBar {
  mm: number;
  px: number;
  label: string;
}

/** A round length (1, 2 or 5 times a power of ten) about `targetPx` wide. */
export function scaleBar(scale: number, targetPx = 110): ScaleBar {
  const raw = targetPx / scale;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const lead = raw / pow;
  const mm = (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * pow;
  return { mm, px: mm * scale, label: mm >= 1000 ? `${mm / 1000} m` : `${mm} mm` };
}

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey?: boolean;
  /** Legacy `wheelDeltaY`: multiples of 120 for a stepped mouse wheel. */
  wheelDeltaY?: number;
}

/**
 * Wheel events are both zoom (mouse wheel, pinch) and pan (two-finger scroll).
 * Pinch arrives with ctrlKey. A stepped wheel has no x component and a legacy
 * delta in multiples of 120 that is not simply -3 x deltaY (which is how
 * browsers derive it for trackpad pixels); Firefox reports wheels in lines.
 */
export function classifyWheel(e: WheelInput): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom';
  if (e.deltaMode !== 0) return 'zoom';
  if (e.deltaX !== 0) return 'pan';
  const legacy = e.wheelDeltaY;
  if (legacy !== undefined && legacy !== 0 && Math.abs(legacy) % 120 === 0 && legacy !== -3 * e.deltaY) return 'zoom';
  return 'pan';
}

/** Zoom factor for a wheel event. Pinch deltas are small, so they get a stronger gain. */
export function wheelZoomFactor(e: WheelInput): number {
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
  const d = clamp(e.deltaY * unit, -240, 240);
  return Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0022));
}
