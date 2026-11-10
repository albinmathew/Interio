import { deriveRooms, openingFrame, wallFootprints, type Level, type RoomType } from '@interio/core';
import { useMemo } from 'react';
import { dims, squareMetres } from './format';

const ROOM_TINT: Record<RoomType, string> = {
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

/**
 * Read-only plan drawing. SVG units are millimetres with y flipped (plan y is up).
 * Used for dashboard thumbnails and as the baseline plan view.
 */
export function PlanSvg({ level, labels = true, className }: { level: Level; labels?: boolean; className?: string }) {
  const view = useMemo(() => {
    const rooms = deriveRooms(level);
    const walls = wallFootprints(level);
    const xs = Object.values(level.vertices).map((v) => v.x);
    const ys = Object.values(level.vertices).map((v) => -v.y);
    const pad = 600;
    const minX = (xs.length ? Math.min(...xs) : 0) - pad;
    const minY = (ys.length ? Math.min(...ys) : 0) - pad;
    const w = (xs.length ? Math.max(...xs) : 4000) - minX + pad;
    const h = (ys.length ? Math.max(...ys) : 3000) - minY + pad;
    return { rooms, walls, viewBox: `${minX} ${minY} ${w} ${h}`, size: Math.max(w, h) };
  }, [level]);
  const path = (pts: { x: number; y: number }[]) => `M${pts.map((p) => `${p.x} ${-p.y}`).join('L')}Z`;
  const font = Math.max(140, view.size / 55);

  return (
    <svg viewBox={view.viewBox} className={className} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan">
      {view.rooms.map((r, i) => {
        const room = r.roomId ? level.rooms[r.roomId] : undefined;
        return <path key={i} d={path(r.polygon)} fill={ROOM_TINT[room?.type ?? 'other']} />;
      })}
      {view.walls.map((f) => {
        const kind = level.walls[f.wallId]?.kind;
        return <path key={f.wallId} d={path(f.polygon)} fill={kind === 'railing' ? '#9aa7ad' : kind === 'low' ? '#7c8187' : '#3a3f45'} />;
      })}
      {Object.values(level.openings).map((o) => {
        const f = openingFrame(level, o.id);
        if (!f) return null;
        const n = { x: f.normal.x * (f.thickness / 2 + 4), y: f.normal.y * (f.thickness / 2 + 4) };
        const quad = [
          { x: f.left.x + n.x, y: f.left.y + n.y },
          { x: f.right.x + n.x, y: f.right.y + n.y },
          { x: f.right.x - n.x, y: f.right.y - n.y },
          { x: f.left.x - n.x, y: f.left.y - n.y },
        ];
        return (
          <g key={o.id}>
            <path d={path(quad)} fill={o.kind === 'window' ? '#cfe6f3' : '#ffffff'} />
            {(o.kind === 'window' || o.kind === 'sliding') && (
              <line x1={f.left.x} y1={-f.left.y} x2={f.right.x} y2={-f.right.y} stroke="#5b8fb0" strokeWidth={24} />
            )}
          </g>
        );
      })}
      {labels &&
        view.rooms.map((r, i) => {
          const room = r.roomId ? level.rooms[r.roomId] : undefined;
          if (!room) return null;
          return (
            <text key={i} x={r.centroid.x} y={-r.centroid.y} textAnchor="middle" fontSize={font} fill="#1f2428" style={{ userSelect: 'none' }}>
              <tspan x={r.centroid.x} dy={-font * 0.2} fontWeight={600}>
                {room.name}
              </tspan>
              <tspan x={r.centroid.x} dy={font * 1.15} fill="#5b6470" fontSize={font * 0.8}>
                {dims(r.width, r.depth)} · {squareMetres(r.interiorArea)}
              </tspan>
            </text>
          );
        })}
    </svg>
  );
}
