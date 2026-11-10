/** Parsing and formatting of lengths and angles. All lengths are millimetres. */
import type { Pt } from '@interio/core';

const MM_PER_INCH = 25.4;

/**
 * Reads a typed length. Accepts "3400", "3400mm", "340 cm", "3.4m", `11'6"`,
 * "11ft 6in" and `138"`. A bare number below 100 is read as metres: nobody
 * draws a 3.4 mm wall.
 */
export function parseLength(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  const imperial = /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches|''))?$/.exec(s);
  if (imperial && (imperial[1] !== undefined || imperial[2] !== undefined)) {
    const mm = (Number(imperial[1] ?? 0) * 12 + Number(imperial[2] ?? 0)) * MM_PER_INCH;
    return mm > 0 ? mm : null;
  }
  const metric = /^(\d+(?:\.\d+)?|\.\d+)\s*(mm|cm|m)?$/.exec(s);
  if (!metric) return null;
  const n = Number(metric[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  switch (metric[2]) {
    case 'mm':
      return n;
    case 'cm':
      return n * 10;
    case 'm':
      return n * 1000;
    default:
      return n < 100 ? n * 1000 : n;
  }
}

/** Characters accepted while typing a length on the canvas. */
export const isLengthChar = (key: string, typedSoFar: string): boolean =>
  /^[0-9.,]$/.test(key) || (typedSoFar.length > 0 && /^[mcftin'" ]$/i.test(key));

/** 3400 -> "3400 mm" */
export const formatMm = (mm: number): string => `${Math.round(mm).toLocaleString('en-US').replace(/,/g, ' ')} mm`;
/** 3400 -> "3400" (dimension text on the drawing) */
export const formatDim = (mm: number): string => String(Math.round(mm));

/** Direction of a -> b in degrees, counter-clockwise from +x, in [0, 360). */
export function angleDeg(a: Pt, b: Pt): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const r = Math.round(((deg % 360) + 360) % 360 * 10) / 10;
  return r === 360 ? 0 : r;
}

export const formatAngle = (deg: number): string => `${Number.isInteger(deg) ? deg : deg.toFixed(1)}°`;
