/**
 * Screen-space layer: everything that keeps a constant size on screen. Labels,
 * handles, dimensions, snap feedback and tool drafts are positioned in pixels
 * from the current view.
 */
import { ops, selectRooms, usePlanStore, vec, type Level, type Pt, type Selection } from '@interio/core';
import { memo, useMemo } from 'react';
import { dims, squareMetres } from '../../../lib/format';
import { itemFootprint } from '../logic/items';
import { angleDeg, formatAngle, formatDim, formatMm } from '../logic/units';
import { levelBounds, planToScreen, type Size, type View } from '../logic/view';
import { incidentWalls } from '../logic/walls';
import { useEditor, type Draft, type SnapMark } from '../state';
import type { Guide } from '../logic/snapping';
import { INK } from './style';

const HALO = { paintOrder: 'stroke', stroke: INK.halo, strokeWidth: 3.5, strokeLinejoin: 'round' } as const;
const TEXT = { fontSize: 11, fontFamily: 'inherit', style: { userSelect: 'none' } } as const;

interface DimProps {
  /** Screen points. */
  a: Pt;
  b: Pt;
  /** Signed offset of the dimension line from a-b, in pixels. */
  offset: number;
  label: string;
  colour?: string;
}

/** A dimension line with end ticks and its text along the line, always upright. */
function Dim({ a, b, offset, label, colour = INK.accent }: DimProps) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 14) return null;
  const nx = -dy / len;
  const ny = dx / len;
  const p = { x: a.x + nx * offset, y: a.y + ny * offset };
  const q = { x: b.x + nx * offset, y: b.y + ny * offset };
  const tick = 4 * Math.sign(offset || 1);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle >= 90 || angle < -90) angle -= 180;
  const fits = len > label.length * 6.2 + 10;
  return (
    <g pointerEvents="none">
      <path
        d={`M${a.x + nx * (offset - tick)} ${a.y + ny * (offset - tick)}L${a.x + nx * (offset + tick)} ${a.y + ny * (offset + tick)}M${b.x + nx * (offset - tick)} ${b.y + ny * (offset - tick)}L${b.x + nx * (offset + tick)} ${b.y + ny * (offset + tick)}M${p.x} ${p.y}L${q.x} ${q.y}`}
        fill="none"
        stroke={colour}
        strokeWidth={1}
      />
      {fits && (
        <text {...TEXT} {...HALO} transform={`translate(${(p.x + q.x) / 2} ${(p.y + q.y) / 2}) rotate(${angle})`} textAnchor="middle" dy={-4} fill={colour} fontWeight={600}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A filled pill with white text: the live readout while drawing. */
function Pill({ at, label, colour = INK.accent }: { at: Pt; label: string; colour?: string }) {
  const w = label.length * 6.4 + 16;
  return (
    <g pointerEvents="none" transform={`translate(${at.x} ${at.y})`} data-testid="readout">
      <rect x={-w / 2} y={-10} width={w} height={20} rx={10} fill={colour} />
      <text {...TEXT} textAnchor="middle" dy={4} fill="#ffffff" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

const RoomLabels = memo(function RoomLabels({ level, view, size }: { level: Level; view: View; size: Size }) {
  const rooms = selectRooms(level);
  return (
    <g data-layer="room-labels" pointerEvents="none">
      {rooms.map((r) => {
        const room = r.roomId ? level.rooms[r.roomId] : undefined;
        if (!room) return null;
        const c = planToScreen(view, r.centroid);
        const w = r.width * view.scale;
        const h = r.depth * view.scale;
        if (c.x < -80 || c.y < -40 || c.x > size.w + 80 || c.y > size.h + 40) return null;
        if (w < 34 || h < 16) return null;
        const detail = `${dims(r.width, r.depth)} · ${squareMetres(r.interiorArea)}`;
        const full = w > detail.length * 5.7 + 8 && h > 36;
        const maxChars = Math.max(3, Math.floor((w - 6) / 7.2));
        const name = room.name.length > maxChars ? `${room.name.slice(0, maxChars - 1)}…` : room.name;
        return (
          <text key={room.id} x={c.x} y={c.y} textAnchor="middle" {...TEXT} data-room-label={room.id}>
            <tspan x={c.x} dy={full ? -2 : 4} fontSize={12.5} fontWeight={600} fill={INK.text}>
              {name}
            </tspan>
            {full && (
              <tspan x={c.x} dy={14} fontSize={10.5} fill={INK.textSoft}>
                {detail}
              </tspan>
            )}
          </text>
        );
      })}
    </g>
  );
});

const ItemLabels = memo(function ItemLabels({ level, view }: { level: Level; view: View }) {
  const items = useMemo(() => Object.values(level.items).map((item) => ({ item, fp: itemFootprint(item) })), [level.items]);
  return (
    <g data-layer="item-labels" pointerEvents="none">
      {items.map(({ item, fp }) => {
        const span = Math.max(fp.w, fp.d) * view.scale;
        if (span < 44) return null;
        const c = planToScreen(view, item);
        const maxChars = Math.max(3, Math.floor(span / 6));
        const name = fp.name.length > maxChars ? `${fp.name.slice(0, maxChars - 1)}…` : fp.name;
        return (
          <text key={item.id} x={c.x} y={c.y} dy={3.5} textAnchor="middle" {...TEXT} fontSize={10} fill={INK.textSoft}>
            {name}
          </text>
        );
      })}
    </g>
  );
});

function VertexHandles({ level, view, size, selection, hover }: { level: Level; view: View; size: Size; selection: Selection | null; hover: Selection | null }) {
  const sel = selection?.kind === 'vertex' ? selection.id : null;
  const hov = hover?.kind === 'vertex' ? hover.id : null;
  // Ends of the selected wall are emphasised too: they are what you drag to reshape it.
  const wall = selection?.kind === 'wall' ? level.walls[selection.id] : undefined;
  return (
    <g data-layer="vertices" pointerEvents="none">
      {Object.entries(level.vertices).map(([id, v]) => {
        const p = planToScreen(view, v);
        if (p.x < -8 || p.y < -8 || p.x > size.w + 8 || p.y > size.h + 8) return null;
        const selected = id === sel;
        const strong = selected || id === hov || id === wall?.a || id === wall?.b;
        const r = selected ? 5.5 : strong ? 5 : 3;
        return (
          <circle
            key={id}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={selected ? INK.accent : '#ffffff'}
            stroke={strong ? INK.accent : INK.wall}
            strokeWidth={strong ? 2 : 1.25}
            data-vertex-id={id}
            data-selected={selected || undefined}
          />
        );
      })}
    </g>
  );
}

/** Offset side for a wall's dimension: away from the middle of the plan. */
function outwardSign(level: Level, a: Pt, b: Pt): number {
  const bounds = levelBounds(level);
  if (!bounds) return 1;
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  // Screen normal used by <Dim> is (-dy, dx) in pixels, which is the plan's right-hand normal.
  const right = vec.scale(vec.perp(vec.sub(b, a)), -1);
  return vec.dot(right, vec.sub(vec.mid(a, b), centre)) >= 0 ? 1 : -1;
}

function SelectionDims({ level, view, selection }: { level: Level; view: View; selection: Selection | null }) {
  if (!selection) return null;
  const wallDim = (id: string) => {
    const w = level.walls[id];
    const a = w && level.vertices[w.a];
    const b = w && level.vertices[w.b];
    if (!w || !a || !b) return null;
    const offset = ((w.thickness / 2) * view.scale + 16) * outwardSign(level, a, b);
    return <Dim key={id} a={planToScreen(view, a)} b={planToScreen(view, b)} offset={offset} label={formatDim(vec.dist(a, b))} />;
  };
  if (selection.kind === 'wall') return <g data-testid="wall-dimension">{wallDim(selection.id)}</g>;
  if (selection.kind === 'vertex' && level.vertices[selection.id]) return <g>{incidentWalls(level, selection.id).map((w) => wallDim(w.id))}</g>;
  if (selection.kind === 'opening') {
    const o = level.openings[selection.id];
    const w = o && level.walls[o.wallId];
    if (!o || !w) return null;
    const { a, b } = ops.wallEnds(level, w);
    const dir = vec.norm(vec.sub(b, a));
    const at = (s: number) => planToScreen(view, vec.add(a, vec.scale(dir, s)));
    const length = vec.dist(a, b);
    const s0 = o.offset - o.width / 2;
    const s1 = o.offset + o.width / 2;
    // Dimension on the side opposite the door swing so they do not overlap.
    const offset = ((w.thickness / 2) * view.scale + 16) * (o.kind === 'door' && o.swing !== -1 ? 1 : -1);
    return (
      <g data-testid="opening-dimensions">
        <Dim a={at(0)} b={at(s0)} offset={offset} label={formatDim(s0)} colour={INK.textSoft} />
        <Dim a={at(s0)} b={at(s1)} offset={offset} label={formatDim(o.width)} />
        <Dim a={at(s1)} b={at(length)} offset={offset} label={formatDim(length - s1)} colour={INK.textSoft} />
      </g>
    );
  }
  return null;
}

function Guides({ guides, view }: { guides: Guide[]; view: View }) {
  return (
    <g pointerEvents="none" data-layer="guides">
      {guides.map((g, i) => {
        const a = planToScreen(view, g.from);
        const b = planToScreen(view, g.to);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ext = 28 / len;
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x + (b.x - a.x) * ext} y2={b.y + (b.y - a.y) * ext} stroke={INK.accent} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.8} />
            <path d={`M${a.x - 4} ${a.y - 4}L${a.x + 4} ${a.y + 4}M${a.x - 4} ${a.y + 4}L${a.x + 4} ${a.y - 4}`} stroke={INK.accent} strokeWidth={1.25} />
          </g>
        );
      })}
    </g>
  );
}

function SnapIndicator({ snap, view }: { snap: SnapMark; view: View }) {
  const p = planToScreen(view, snap.point);
  const common = { fill: '#ffffff', strokeWidth: 1.75 } as const;
  return (
    <g pointerEvents="none" data-testid="snap-mark" data-kind={snap.kind} transform={`translate(${p.x} ${p.y})`}>
      {snap.kind === 'vertex' || snap.kind === 'point' ? (
        <rect x={-5.5} y={-5.5} width={11} height={11} {...common} stroke={INK.accent} />
      ) : snap.kind === 'underlay' ? (
        <path d="M0 -7L7 0L0 7L-7 0Z" {...common} stroke={INK.underlaySnap} />
      ) : snap.kind === 'wall' ? (
        <circle r={5} {...common} stroke={INK.accent} />
      ) : (
        <path d="M-5 -5L5 5M-5 5L5 -5" fill="none" stroke={INK.accent} strokeWidth={1.75} />
      )}
    </g>
  );
}

function TwoPoint({ draft, view }: { draft: Extract<Draft, { kind: 'measure' | 'scale' }>; view: View }) {
  const a = planToScreen(view, draft.a);
  const b = planToScreen(view, draft.b);
  const length = vec.dist(draft.a, draft.b);
  const colour = draft.kind === 'scale' ? INK.underlaySnap : INK.accent;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 18 };
  return (
    <g pointerEvents="none" data-testid={`${draft.kind}-line`} data-length={Math.round(length)}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeWidth={1.5} strokeDasharray={draft.done ? undefined : '5 4'} />
      {[a, b].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#ffffff" stroke={colour} strokeWidth={1.75} />
      ))}
      {length >= 1 && <Pill at={mid} label={draft.kind === 'scale' ? `${formatMm(length)} now` : `${formatMm(length)} · ${formatAngle(angleDeg(draft.a, draft.b))}`} colour={colour} />}
    </g>
  );
}

function WallDraft({ draft, view }: { draft: Extract<Draft, { kind: 'wall' }>; view: View }) {
  const from = draft.chain[draft.chain.length - 1]!;
  const a = planToScreen(view, from);
  const b = planToScreen(view, draft.cursor);
  const length = vec.dist(from, draft.cursor);
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  // Readout beside the middle of the segment, pushed off the wall band.
  const nx = px ? -(b.y - a.y) / px : 0;
  const ny = px ? (b.x - a.x) / px : -1;
  const side = ny > 0 ? -1 : 1;
  const mid = { x: (a.x + b.x) / 2 + nx * 24 * side, y: (a.y + b.y) / 2 + ny * 24 * side };
  const label = draft.typed ? `${draft.typed}▏` : formatMm(length);
  return (
    <g pointerEvents="none" data-testid="wall-draft" data-length={Math.round(length)}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK.accent} strokeWidth={1.5} />
      {draft.chain.map((p, i) => {
        const s = planToScreen(view, p);
        return <circle key={i} cx={s.x} cy={s.y} r={i === 0 ? 5 : 3.5} fill={i === 0 ? INK.accent : '#ffffff'} stroke={INK.accent} strokeWidth={1.75} />;
      })}
      {(length >= 1 || draft.typed) && <Pill at={mid} label={length >= 1 ? `${label} · ${formatAngle(angleDeg(from, draft.cursor))}` : label} />}
    </g>
  );
}

function SplitMark({ draft, level, view }: { draft: Extract<Draft, { kind: 'split' }>; level: Level; view: View }) {
  const w = level.walls[draft.wallId];
  if (!w) return null;
  const { a, b } = ops.wallEnds(level, w);
  const n = vec.perp(vec.norm(vec.sub(b, a)));
  const half = w.thickness / 2 + 9 / view.scale;
  const p = planToScreen(view, vec.add(draft.point, vec.scale(n, half)));
  const q = planToScreen(view, vec.sub(draft.point, vec.scale(n, half)));
  const colour = draft.valid ? INK.accent : INK.danger;
  const sa = planToScreen(view, a);
  const sb = planToScreen(view, b);
  const sp = planToScreen(view, draft.point);
  const offset = (w.thickness / 2) * view.scale + 16;
  return (
    <g pointerEvents="none" data-testid="split-mark" data-valid={draft.valid}>
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colour} strokeWidth={2.5} strokeLinecap="round" />
      <Dim a={sa} b={sp} offset={offset} label={formatDim(vec.dist(a, draft.point))} colour={colour} />
      <Dim a={sp} b={sb} offset={offset} label={formatDim(vec.dist(draft.point, b))} colour={colour} />
    </g>
  );
}

function OpeningPreviewDims({ draft, level, view }: { draft: Extract<Draft, { kind: 'opening' }>; level: Level; view: View }) {
  const p = draft.placement;
  const w = level.walls[p.wallId];
  if (!w || p.width <= 0) return null;
  const { a, b } = ops.wallEnds(level, w);
  const dir = vec.norm(vec.sub(b, a));
  const at = (s: number) => planToScreen(view, vec.add(a, vec.scale(dir, s)));
  const length = vec.dist(a, b);
  const s0 = p.offset - p.width / 2;
  const s1 = p.offset + p.width / 2;
  const offset = -((w.thickness / 2) * view.scale + 16) * p.swing;
  const colour = p.valid ? INK.accent : INK.danger;
  return (
    <g>
      <Dim a={at(0)} b={at(s0)} offset={offset} label={formatDim(s0)} colour={colour} />
      <Dim a={at(s1)} b={at(length)} offset={offset} label={formatDim(length - s1)} colour={colour} />
    </g>
  );
}

export function Overlay({ level }: { level: Level }) {
  const view = useEditor((s) => s.view);
  const size = useEditor((s) => s.size);
  const tool = useEditor((s) => s.tool);
  const draft = useEditor((s) => s.draft);
  const snap = useEditor((s) => s.snap);
  const guides = useEditor((s) => s.guides);
  const hover = useEditor((s) => s.hover);
  const selection = usePlanStore((s) => s.selection);
  const showHandles = tool === 'select' || tool === 'split' || selection?.kind === 'vertex' || selection?.kind === 'wall';
  return (
    <g data-layer="overlay">
      <RoomLabels level={level} view={view} size={size} />
      <ItemLabels level={level} view={view} />
      <SelectionDims level={level} view={view} selection={selection} />
      {showHandles && <VertexHandles level={level} view={view} size={size} selection={selection} hover={hover} />}
      <Guides guides={guides} view={view} />
      {draft?.kind === 'wall' && <WallDraft draft={draft} view={view} />}
      {draft?.kind === 'split' && <SplitMark draft={draft} level={level} view={view} />}
      {draft?.kind === 'opening' && <OpeningPreviewDims draft={draft} level={level} view={view} />}
      {(draft?.kind === 'measure' || draft?.kind === 'scale') && <TwoPoint draft={draft} view={view} />}
      {snap && <SnapIndicator snap={snap} view={view} />}
    </g>
  );
}
