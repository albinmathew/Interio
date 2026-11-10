/** Drawing colours and SVG path helpers. Plan points are drawn at (x, -y). */
import type { Pt, RoomType } from '@interio/core';

/** Same tints as the read-only plan drawing (`lib/PlanSvg`). */
export const ROOM_TINT: Record<RoomType, string> = {
  living: '#f6ecd9',
  dining: '#f6ecd9',
  bedroom: '#e6edf5',
  kitchen: '#f3e3d6',
  bathroom: '#dfeeee',
  balcony: '#e4eedc',
  utility: '#eceae4',
  foyer: '#efe9f3',
  study: '#e9eef0',
  corridor: '#f0eee9',
  storage: '#eceae4',
  other: '#f0eee9',
};

export const INK = {
  wall: '#3a3f45',
  low: '#c3c8ce',
  lowLine: '#6b7178',
  railing: '#ffffff',
  railingLine: '#7f8c93',
  glass: '#dcecf5',
  glassLine: '#4f7f9d',
  door: '#3a3f45',
  swing: '#8b939c',
  item: '#8b939c',
  text: '#1f2428',
  textSoft: '#5b6470',
  halo: '#f4f2ee',
  accent: '#0f766e',
  accentSoft: '#d9efec',
  danger: '#b42318',
  underlay: '#4a6fa5',
  underlaySnap: '#2563eb',
} as const;

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Closed path through plan points. */
export const polyPath = (pts: readonly Pt[]): string => (pts.length ? `M${pts.map((p) => `${n(p.x)} ${n(-p.y)}`).join('L')}Z` : '');
/** Open path through plan points. */
export const linePath = (pts: readonly Pt[]): string => (pts.length ? `M${pts.map((p) => `${n(p.x)} ${n(-p.y)}`).join('L')}` : '');

/** SVG arc between two plan points around `center`, taking the short way. */
export function arcPath(center: Pt, from: Pt, to: Pt, radius: number): string {
  // In drawn coordinates (y flipped) a positive cross product is a clockwise turn, which is sweep-flag 1.
  const ux = from.x - center.x;
  const uy = -(from.y - center.y);
  const vx = to.x - center.x;
  const vy = -(to.y - center.y);
  const sweep = ux * vy - uy * vx > 0 ? 1 : 0;
  return `M${n(from.x)} ${n(-from.y)}A${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(to.x)} ${n(-to.y)}`;
}
