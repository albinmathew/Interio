/**
 * The detected plan drawn over the source drawing. SVG units are plan
 * millimetres with y flipped (plan y is up), so the page image and the vector
 * overlay share one frame.
 *
 * Elements the importer is unsure about are drawn in amber, and the review
 * screen can point the view at the elements an issue refers to.
 */
import { deriveRooms, openingFrame, wallFootprints, type Id, type OpeningKind, type PlanDraft, type Pt, type RoomType } from '@interio/core';
import { isDivider } from '@interio/importer';
import { useEffect, useMemo, useRef, useState } from 'react';

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

/** Walls and openings the importer scored below this are marked for a second look. */
export const LOW_CONFIDENCE = 0.65;
const UNSURE = '#d97706';
const FOCUS = '#f59e0b';

/** What the preview is pointed at: the elements of one issue, and where it happened. */
export interface PreviewFocus {
  refs: Id[];
  at?: Pt;
}

/** Ids of the walls and openings detected with low confidence. Open-plan dividers are assumptions by design and have their own style. */
export function lowConfidenceIds(draft: PlanDraft): { walls: Id[]; openings: Id[] } {
  const { level, confidence } = draft;
  const low = (id: Id) => (confidence[id] ?? 1) < LOW_CONFIDENCE;
  return {
    walls: Object.values(level.walls)
      .filter((w) => !isDivider(w) && low(w.id))
      .map((w) => w.id),
    openings: Object.values(level.openings)
      .filter((o) => !isDivider(level.walls[o.wallId]) && low(o.id))
      .map((o) => o.id),
  };
}

const path = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(0)} ${(-p.y).toFixed(0)}`).join('L')}Z`;

type Box = [x: number, y: number, w: number, h: number];

/** Eases the SVG view box towards `target`, so pointing at an issue reads as a camera move. */
function useEasedBox(target: Box): Box {
  const [box, setBox] = useState(target);
  const current = useRef(target);
  const key = target.join(' ');
  useEffect(() => {
    const from = current.current;
    if (from.join(' ') === key) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduce ? 0 : 260;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const e = 1 - (1 - t) ** 3;
      const next = from.map((v, i) => v + (target[i]! - v) * e) as Box;
      current.current = next;
      setBox(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return box;
}

export interface PlanPreviewProps {
  draft: PlanDraft;
  showDrawing: boolean;
  showPlan: boolean;
  /** Zooms to these elements and outlines them. */
  focus?: PreviewFocus | null;
}

export function PlanPreview({ draft, showDrawing, showPlan, focus }: PlanPreviewProps) {
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
    return { rooms, walls, box: [minX, minY, w, h] as Box, size: Math.max(w, h) };
  }, [level, image]);

  const unsure = useMemo(() => {
    const ids = lowConfidenceIds(draft);
    return { walls: new Set(ids.walls), openings: new Set(ids.openings) };
  }, [draft]);

  /** Outline of an opening in plan mm, grown by `grow` on every side. */
  const openingQuad = (id: Id, grow: number): Pt[] | null => {
    const f = openingFrame(level, id);
    if (!f) return null;
    const along = { x: f.right.x - f.left.x, y: f.right.y - f.left.y };
    const len = Math.hypot(along.x, along.y) || 1;
    const u = { x: (along.x / len) * grow, y: (along.y / len) * grow };
    const n = { x: f.normal.x * (f.thickness / 2 + grow), y: f.normal.y * (f.thickness / 2 + grow) };
    return [
      { x: f.left.x - u.x + n.x, y: f.left.y - u.y + n.y },
      { x: f.right.x + u.x + n.x, y: f.right.y + u.y + n.y },
      { x: f.right.x + u.x - n.x, y: f.right.y + u.y - n.y },
      { x: f.left.x - u.x - n.x, y: f.left.y - u.y - n.y },
    ];
  };

  // What the focus points at, as outlines, and the view box that frames it.
  const focused = useMemo(() => {
    if (!focus) return null;
    const refs = new Set(focus.refs);
    const shapes: { id: Id; kind: 'room' | 'wall' | 'opening'; points: Pt[] }[] = [];
    for (const r of view.rooms) if (r.roomId && refs.has(r.roomId)) shapes.push({ id: r.roomId, kind: 'room', points: r.polygon });
    for (const f of view.walls) if (refs.has(f.wallId)) shapes.push({ id: f.wallId, kind: 'wall', points: f.polygon });
    for (const id of focus.refs) {
      if (!level.openings[id]) continue;
      const quad = openingQuad(id, 60);
      if (quad) shapes.push({ id, kind: 'opening', points: quad });
    }
    const pts = shapes.flatMap((s) => s.points);
    // A bare point is framed with some of its surroundings.
    if (focus.at) pts.push({ x: focus.at.x - 1500, y: focus.at.y - 1500 }, { x: focus.at.x + 1500, y: focus.at.y + 1500 });
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => -p.y);
    let w = Math.max(...xs) - Math.min(...xs);
    let h = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    // Room to see the neighbours, never closer than a small room, never further out than the whole plan.
    w = Math.min(view.box[2], Math.max(w * 1.6, 4500));
    h = Math.min(view.box[3], Math.max(h * 1.6, 4500));
    return { shapes, at: focus.at, box: [cx - w / 2, cy - h / 2, w, h] as Box };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, view, level]);

  const box = useEasedBox(focused?.box ?? view.box);

  // Without a page image the drawing is its line work.
  const lines = useMemo(() => {
    if (image || !showDrawing) return '';
    const s = underlay.segments;
    const parts: string[] = [];
    for (let i = 0; i + 3 < s.length; i += 4) parts.push(`M${s[i]!.toFixed(0)} ${(-s[i + 1]!).toFixed(0)}L${s[i + 2]!.toFixed(0)} ${(-s[i + 3]!).toFixed(0)}`);
    return parts.join('');
  }, [underlay.segments, image, showDrawing]);

  // Label and stroke sizes follow the zoom, so they stay readable when pointed at one room.
  const size = Math.max(box[2], box[3]);
  const font = Math.max(110, size / 60);
  const hair = size / 500;
  return (
    <svg
      viewBox={box.map((v) => v.toFixed(1)).join(' ')}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Detected plan over the drawing"
      data-testid="import-preview"
      data-focused={focused ? 'true' : 'false'}
      data-view-width={Math.round(box[2])}
    >
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
      {lines && <path d={lines} fill="none" stroke="#8b939c" strokeWidth={size / 1400} />}
      {showPlan && (
        <g>
          {view.rooms.map((r, i) => {
            const room = r.roomId ? level.rooms[r.roomId] : undefined;
            return <path key={i} d={path(r.interior)} fill={ROOM_TINT[room?.type ?? 'other']} fillOpacity={0.38} data-room={room?.name} />;
          })}
          {view.walls.map((f) => {
            const wall = level.walls[f.wallId];
            const kind = wall?.kind;
            if (wall && isDivider(wall)) {
              // Open-plan dividers are floor strips: draw them as a dashed line, not a wall.
              const a = level.vertices[wall.a];
              const b = level.vertices[wall.b];
              if (!a || !b) return null;
              return (
                <line
                  key={f.wallId}
                  x1={a.x}
                  y1={-a.y}
                  x2={b.x}
                  y2={-b.y}
                  stroke="#9333a8"
                  strokeWidth={size / 450}
                  strokeDasharray={`${size / 90} ${size / 130}`}
                  data-divider
                />
              );
            }
            if (unsure.walls.has(f.wallId)) {
              return (
                <path
                  key={f.wallId}
                  d={path(f.polygon)}
                  fill={UNSURE}
                  fillOpacity={0.55}
                  stroke={UNSURE}
                  strokeWidth={hair * 1.6}
                  strokeDasharray={`${hair * 5} ${hair * 3}`}
                  data-low-confidence="wall"
                />
              );
            }
            return <path key={f.wallId} d={path(f.polygon)} fill={kind === 'railing' ? '#c2410c' : kind === 'low' ? '#4d7c0f' : '#1f2428'} fillOpacity={kind === 'wall' ? 0.72 : 0.8} />;
          })}
          {Object.values(level.openings).map((o) => {
            const f = openingFrame(level, o.id);
            if (!f || isDivider(level.walls[o.wallId])) return null;
            const quad = openingQuad(o.id, 12);
            if (!quad) return null;
            let swing: string | null = null;
            if (o.kind === 'door' && o.hinge && o.swing) {
              const hinge = o.hinge === 'a' ? f.left : f.right;
              const strike = o.hinge === 'a' ? f.right : f.left;
              const tip = { x: hinge.x + f.normal.x * o.swing * o.width, y: hinge.y + f.normal.y * o.swing * o.width };
              // Leaf plus the quarter circle it sweeps; the arc direction follows the handedness.
              const cross = (strike.x - hinge.x) * (tip.y - hinge.y) - (strike.y - hinge.y) * (tip.x - hinge.x);
              swing = `M${hinge.x} ${-hinge.y}L${tip.x} ${-tip.y}A${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${strike.x} ${-strike.y}`;
            }
            const halo = unsure.openings.has(o.id) ? openingQuad(o.id, 130) : null;
            return (
              <g key={o.id} data-opening={o.kind}>
                <path d={path(quad)} fill={OPENING_COLOUR[o.kind]} />
                {swing && <path d={swing} fill="none" stroke={OPENING_COLOUR.door} strokeWidth={hair} />}
                {halo && (
                  <path
                    d={path(halo)}
                    fill={UNSURE}
                    fillOpacity={0.18}
                    stroke={UNSURE}
                    strokeWidth={hair * 1.6}
                    strokeDasharray={`${hair * 5} ${hair * 3}`}
                    data-low-confidence="opening"
                  />
                )}
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
      {focused && (
        <g data-testid="preview-highlight" pointerEvents="none">
          {focused.shapes.map((s) => (
            <path
              key={`${s.kind}-${s.id}`}
              d={path(s.points)}
              fill={FOCUS}
              fillOpacity={s.kind === 'room' ? 0.22 : 0.35}
              stroke={FOCUS}
              strokeWidth={hair * 3}
              strokeLinejoin="round"
              data-highlight={s.kind}
              data-highlight-id={s.id}
            />
          ))}
          {focused.at && (
            <g data-highlight="point">
              <circle cx={focused.at.x} cy={-focused.at.y} r={size / 28} fill={FOCUS} fillOpacity={0.15} stroke={FOCUS} strokeWidth={hair * 3} className="animate-pulse" />
              <circle cx={focused.at.x} cy={-focused.at.y} r={hair * 4} fill={FOCUS} />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

export function Legend({ unsure = 0 }: { unsure?: number }) {
  const item = (colour: string, label: string) => (
    <span key={label} className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" data-testid="preview-legend">
      {item('#1f2428', 'Wall')}
      {item('#4d7c0f', 'Low wall')}
      {item('#c2410c', 'Railing')}
      {(Object.keys(OPENING_LABEL) as OpeningKind[]).map((k) => item(OPENING_COLOUR[k], OPENING_LABEL[k]))}
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: '#9333a8' }} />
        Open-plan divider
      </span>
      <span className="inline-flex items-center gap-1.5" data-testid="legend-low-confidence" data-count={unsure} title="Walls and openings the import is unsure about. Check them against the drawing.">
        <span className="h-2.5 w-3.5 rounded-sm border border-dashed" style={{ borderColor: UNSURE, background: `${UNSURE}55` }} />
        Low confidence{unsure > 0 ? ` (${unsure})` : ''}
      </span>
    </div>
  );
}
