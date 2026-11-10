/**
 * The detected plan drawn over the source drawing. SVG units are plan
 * millimetres with y flipped (plan y is up), so the page image and the vector
 * overlay share one frame.
 */
import { deriveRooms, openingFrame, wallFootprints, type OpeningKind, type PlanDraft, type Pt, type RoomType } from '@interio/core';
import { useEffect, useMemo, useState } from 'react';

const ROOM_TINT: Record<RoomType, string> = {
  living: '#f2c66d',
  dining: '#f2c66d',
  bedroom: '#7ea6d8',
  kitchen: '#e59a63',
  bathroom: '#62b8b4',
  balcony: '#8fc46b',
  utility: '#a9a393',
  foyer: '#b493d1',
  study: '#7fb0bd',
  corridor: '#b9b2a2',
  storage: '#a9a393',
  other: '#b9b2a2',
};

const OPENING_COLOUR: Record<OpeningKind, string> = {
  door: '#b42318',
  sliding: '#0f766e',
  window: '#1d6fd1',
  passage: '#9333a8',
};

export const OPENING_LABEL: Record<OpeningKind, string> = {
  door: 'Door',
  sliding: 'Sliding door',
  window: 'Window',
  passage: 'Open passage',
};

const path = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(0)} ${(-p.y).toFixed(0)}`).join('L')}Z`;

export function PlanPreview({ draft, showDrawing, showPlan }: { draft: PlanDraft; showDrawing: boolean; showPlan: boolean }) {
  const { level, underlay } = draft;
  const image = underlay.image;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(image.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image?.blob]);

  const view = useMemo(() => {
    const rooms = deriveRooms(level);
    const walls = wallFootprints(level);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const v of Object.values(level.vertices)) {
      xs.push(v.x);
      ys.push(-v.y);
    }
    if (xs.length === 0 && image) {
      // Nothing detected: show the whole page.
      const m = image.planFromImage;
      xs.push(m[4], m[4] + m[0] * image.widthPx);
      ys.push(-m[5], -(m[5] + m[3] * image.heightPx));
    }
    if (xs.length === 0) {
      xs.push(0, 8000);
      ys.push(-6000, 0);
    }
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const pad = xs.length > 2 ? Math.max(600, 0.06 * span) : 0;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return { rooms, walls, viewBox: `${minX} ${minY} ${w} ${h}`, size: Math.max(w, h) };
  }, [level, image]);

  // Without a page image the drawing is its line work.
  const lines = useMemo(() => {
    if (image || !showDrawing) return '';
    const s = underlay.segments;
    const parts: string[] = [];
    for (let i = 0; i + 3 < s.length; i += 4) parts.push(`M${s[i]!.toFixed(0)} ${(-s[i + 1]!).toFixed(0)}L${s[i + 2]!.toFixed(0)} ${(-s[i + 3]!).toFixed(0)}`);
    return parts.join('');
  }, [underlay.segments, image, showDrawing]);

  const font = Math.max(150, view.size / 60);
  return (
    <svg viewBox={view.viewBox} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Detected plan over the drawing" data-testid="import-preview">
      <rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="#ffffff" />
      {showDrawing && image && url && (
        <image
          href={url}
          x={image.planFromImage[4]}
          y={-image.planFromImage[5]}
          width={image.planFromImage[0] * image.widthPx}
          height={-image.planFromImage[3] * image.heightPx}
          preserveAspectRatio="none"
          opacity={showPlan ? 0.55 : 1}
        />
      )}
      {lines && <path d={lines} fill="none" stroke="#8b939c" strokeWidth={view.size / 1400} />}
      {showPlan && (
        <g>
          {view.rooms.map((r, i) => {
            const room = r.roomId ? level.rooms[r.roomId] : undefined;
            return <path key={i} d={path(r.interior)} fill={ROOM_TINT[room?.type ?? 'other']} fillOpacity={0.38} data-room={room?.name} />;
          })}
          {view.walls.map((f) => {
            const kind = level.walls[f.wallId]?.kind;
            return <path key={f.wallId} d={path(f.polygon)} fill={kind === 'railing' ? '#c2410c' : kind === 'low' ? '#4d7c0f' : '#1f2428'} fillOpacity={kind === 'wall' ? 0.72 : 0.8} />;
          })}
          {Object.values(level.openings).map((o) => {
            const f = openingFrame(level, o.id);
            if (!f) return null;
            const n = { x: f.normal.x * (f.thickness / 2 + 12), y: f.normal.y * (f.thickness / 2 + 12) };
            const quad = [
              { x: f.left.x + n.x, y: f.left.y + n.y },
              { x: f.right.x + n.x, y: f.right.y + n.y },
              { x: f.right.x - n.x, y: f.right.y - n.y },
              { x: f.left.x - n.x, y: f.left.y - n.y },
            ];
            let swing: string | null = null;
            if (o.kind === 'door' && o.hinge && o.swing) {
              const hinge = o.hinge === 'a' ? f.left : f.right;
              const strike = o.hinge === 'a' ? f.right : f.left;
              const tip = { x: hinge.x + f.normal.x * o.swing * o.width, y: hinge.y + f.normal.y * o.swing * o.width };
              // Leaf plus the quarter circle it sweeps; the arc direction follows the handedness.
              const cross = (strike.x - hinge.x) * (tip.y - hinge.y) - (strike.y - hinge.y) * (tip.x - hinge.x);
              swing = `M${hinge.x} ${-hinge.y}L${tip.x} ${-tip.y}A${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${strike.x} ${-strike.y}`;
            }
            return (
              <g key={o.id} data-opening={o.kind}>
                <path d={path(quad)} fill={OPENING_COLOUR[o.kind]} />
                {swing && <path d={swing} fill="none" stroke={OPENING_COLOUR.door} strokeWidth={view.size / 500} />}
              </g>
            );
          })}
          {view.rooms.map((r, i) => {
            const room = r.roomId ? level.rooms[r.roomId] : undefined;
            if (!room || r.interiorArea < 1_200_000) return null;
            return (
              <text
                key={i}
                x={r.centroid.x}
                y={-r.centroid.y}
                fontSize={font}
                fontWeight={600}
                textAnchor="middle"
                fill="#1f2428"
                stroke="#ffffff"
                strokeWidth={font / 5}
                paintOrder="stroke"
              >
                {room.name}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

export function Legend() {
  const item = (colour: string, label: string) => (
    <span key={label} className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      {item('#1f2428', 'Wall')}
      {item('#4d7c0f', 'Low wall')}
      {item('#c2410c', 'Railing')}
      {(Object.keys(OPENING_LABEL) as OpeningKind[]).map((k) => item(OPENING_COLOUR[k], OPENING_LABEL[k]))}
    </div>
  );
}
