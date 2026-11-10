/**
 * Top-down plan with the walker's position and heading. Click to jump there.
 * Drawn in plan millimetres with y flipped, like the shell's PlanSvg, but owned
 * by walk mode: it highlights the current room, tracks the walker every frame
 * without re-rendering, and can show the tour route.
 */
import { openingFrame, selectFootprints, vec, type Id, type Pt, type RoomType } from '@interio/core';
import { ChevronDown, Map as MapIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { IconButton, Panel, cn } from '../../ui';
import type { WalkController } from './controller';
import type { WalkWorld } from './route';

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

const path = (pts: Pt[]) => `M${pts.map((p) => `${p.x} ${-p.y}`).join('L')}Z`;

export interface MinimapProps {
  world: WalkWorld;
  controller: WalkController;
  roomId: Id | null;
  /** Tour legs to draw, when a tour is running. */
  route?: Pt[][];
  open: boolean;
  onToggle: (open: boolean) => void;
  className?: string;
}

export function Minimap({ world, controller, roomId, route, open, onToggle, className }: MinimapProps) {
  const { level } = world;
  const marker = useRef<SVGGElement>(null);

  const view = useMemo(() => {
    const pts = world.rooms.flatMap((r) => r.polygon);
    const b = vec.polygonBounds(pts.length ? pts : [{ x: 0, y: 0 }, { x: 4000, y: 3000 }]);
    const pad = 350;
    const w = b.maxX - b.minX + 2 * pad;
    const h = b.maxY - b.minY + 2 * pad;
    const openings = Object.values(level.openings).flatMap((o) => {
      const f = openingFrame(level, o.id);
      if (!f) return [];
      const n = vec.scale(f.normal, f.thickness / 2 + 6);
      return [{ id: o.id, kind: o.kind, quad: [vec.add(f.left, n), vec.add(f.right, n), vec.sub(f.right, n), vec.sub(f.left, n)], left: f.left, right: f.right }];
    });
    return { viewBox: `${b.minX - pad} ${-b.maxY - pad} ${w} ${h}`, aspect: h / w, size: Math.max(w, h), walls: selectFootprints(level), openings };
  }, [level, world.rooms]);

  // Follow the walker without re-rendering React every frame.
  useEffect(() => {
    if (!open) return;
    const place = () => marker.current?.setAttribute('transform', `translate(${controller.x.toFixed(0)} ${(-controller.y).toFixed(0)}) rotate(${((-controller.yaw * 180) / Math.PI).toFixed(1)})`);
    place();
    return controller.onFrame(place);
  }, [controller, open]);

  if (!open)
    return (
      <Panel className={cn('pointer-events-auto p-0.5', className)}>
        <IconButton label="Show map" onClick={() => onToggle(true)} data-testid="walk-map-toggle">
          <MapIcon className="h-4 w-4" />
        </IconButton>
      </Panel>
    );

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    controller.jumpNear({ x: p.x, y: -p.y });
  };
  const unit = view.size / 100; // 1% of the map: keeps strokes and the marker legible at any plan size

  return (
    <Panel className={cn('pointer-events-auto relative overflow-hidden', className)}>
      <svg
        viewBox={view.viewBox}
        className={cn('block h-auto cursor-pointer', view.aspect > 1.15 ? 'w-24 sm:w-36' : 'w-28 sm:w-[200px]')}
        role="img"
        aria-label="Map of the home. Click to jump to a spot."
        data-testid="walk-minimap"
        onClick={onClick}
      >
        {world.rooms.map((r, i) => {
          const room = r.roomId ? level.rooms[r.roomId] : undefined;
          const current = r.roomId !== null && r.roomId === roomId;
          return <path key={r.roomId ?? i} d={path(r.polygon)} fill={current ? 'var(--color-accent-soft)' : ROOM_TINT[room?.type ?? 'other']} />;
        })}
        {view.walls.map((f) => {
          const kind = level.walls[f.wallId]?.kind;
          return <path key={f.wallId} d={path(f.polygon)} fill={kind === 'railing' ? '#9aa7ad' : kind === 'low' ? '#7c8187' : '#3a3f45'} />;
        })}
        {view.openings.map((o) => (
          <g key={o.id}>
            <path d={path(o.quad)} fill={o.kind === 'window' ? '#cfe6f3' : '#ffffff'} />
            {(o.kind === 'window' || o.kind === 'sliding') && (
              <line x1={o.left.x} y1={-o.left.y} x2={o.right.x} y2={-o.right.y} stroke="#5b8fb0" strokeWidth={unit * 0.35} />
            )}
          </g>
        ))}
        {route?.map((leg, i) => (
          <polyline
            key={i}
            points={leg.map((p) => `${p.x},${-p.y}`).join(' ')}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity={0.55}
            strokeWidth={unit * 0.5}
            strokeDasharray={`${unit * 1.2} ${unit * 1.2}`}
            strokeLinecap="round"
          />
        ))}
        <g ref={marker} pointerEvents="none">
          <path d={`M0 0L${unit * 9} ${-unit * 5}A${unit * 10.3} ${unit * 10.3} 0 0 1 ${unit * 9} ${unit * 5}Z`} fill="var(--color-accent)" fillOpacity={0.22} />
          <circle r={unit * 1.9} fill="var(--color-accent)" stroke="#ffffff" strokeWidth={unit * 0.6} />
        </g>
      </svg>
      <IconButton label="Hide map" size="sm" className="absolute top-0.5 right-0.5 h-6 w-6 bg-surface/80" onClick={() => onToggle(false)} data-testid="walk-map-toggle">
        <ChevronDown className="h-3.5 w-3.5" />
      </IconButton>
    </Panel>
  );
}
