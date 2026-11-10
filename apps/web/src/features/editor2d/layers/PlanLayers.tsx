/**
 * Plan-space layers. They are drawn in millimetres inside a group that carries
 * the view transform, so panning and zooming only changes one attribute; strokes
 * use non-scaling-stroke to stay a constant width on screen.
 */
import { selectFootprints, selectRooms, usePlanStore, vec, type Id, type Level, type Opening, type Selection } from '@interio/core';
import { memo, useMemo } from 'react';
import { itemFootprint } from '../logic/items';
import { openingSymbol, wallFrame, type OpeningSymbol } from '../logic/openings';
import { wallPieces } from '../logic/walls';
import { useEditor } from '../state';
import { arcPath, INK, linePath, polyPath, ROOM_TINT } from './style';

const NS = { vectorEffect: 'non-scaling-stroke' } as const;

export const RoomsLayer = memo(function RoomsLayer({ level }: { level: Level }) {
  const rooms = selectRooms(level);
  return (
    <g data-layer="rooms">
      {rooms.map((r, i) => {
        const room = r.roomId ? level.rooms[r.roomId] : undefined;
        return <path key={r.roomId ?? i} d={polyPath(r.polygon)} fill={ROOM_TINT[room?.type ?? 'other']} data-room-id={r.roomId ?? undefined} />;
      })}
    </g>
  );
});

function useWallPaths(level: Level) {
  return useMemo(() => {
    const byWall = new Map<Id, Opening[]>();
    for (const o of Object.values(level.openings)) (byWall.get(o.wallId) ?? byWall.set(o.wallId, []).get(o.wallId)!).push(o);
    return selectFootprints(level).map((fp) => {
      const wall = level.walls[fp.wallId]!;
      const a = level.vertices[wall.a]!;
      const pieces = wallPieces(fp, a, wall.thickness, byWall.get(wall.id) ?? []);
      return { id: wall.id, kind: wall.kind, d: pieces.map(polyPath).join(''), centre: linePath([a, level.vertices[wall.b]!]) };
    });
  }, [level.vertices, level.walls, level.openings]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const WallsLayer = memo(function WallsLayer({ level }: { level: Level }) {
  const paths = useWallPaths(level);
  const solid = paths.filter((p) => p.kind === 'wall');
  const low = paths.filter((p) => p.kind === 'low');
  const rail = paths.filter((p) => p.kind === 'railing');
  return (
    <g data-layer="walls">
      {/* Outlines first, fills on top: joined walls of a kind read as one shape. */}
      {low.map((p) => (
        <path key={`o${p.id}`} d={p.d} fill="none" stroke={INK.lowLine} strokeWidth={2.5} strokeLinejoin="round" {...NS} />
      ))}
      {rail.map((p) => (
        <path key={`o${p.id}`} d={p.d} fill="none" stroke={INK.railingLine} strokeWidth={2.5} strokeLinejoin="round" {...NS} />
      ))}
      {low.map((p) => (
        <path key={p.id} d={p.d} fill={INK.low} data-wall-id={p.id} data-wall-kind="low" />
      ))}
      {rail.map((p) => (
        <g key={p.id} data-wall-id={p.id} data-wall-kind="railing">
          <path d={p.d} fill={INK.railing} />
          <path d={p.centre} fill="none" stroke={INK.railingLine} strokeWidth={1} strokeDasharray="5 3" {...NS} />
        </g>
      ))}
      {solid.map((p) => (
        <path key={p.id} d={p.d} fill={INK.wall} stroke={INK.wall} strokeWidth={0.6} strokeLinejoin="round" data-wall-id={p.id} data-wall-kind="wall" {...NS} />
      ))}
    </g>
  );
});

/** Accent overlay on the hovered and the selected wall. */
export function WallHighlight({ level }: { level: Level }) {
  const selection = usePlanStore((s) => s.selection);
  const hover = useEditor((s) => s.hover);
  const paths = useWallPaths(level);
  const pick = (sel: Selection | null) => (sel?.kind === 'wall' ? paths.find((p) => p.id === sel.id) : undefined);
  const selected = pick(selection);
  const hovered = pick(hover);
  return (
    <g data-layer="wall-highlight">
      {hovered && hovered !== selected && <path d={hovered.d} fill={INK.accent} fillOpacity={0.35} />}
      {selected && <path d={selected.d} fill={INK.accent} stroke={INK.accent} strokeWidth={1.5} strokeLinejoin="round" data-testid="selected-wall" {...NS} />}
    </g>
  );
}

export type GlyphTone = 'normal' | 'hover' | 'selected' | 'preview' | 'invalid';

/** The architectural symbol of one opening. */
export function OpeningGlyph({ symbol, tone = 'normal' }: { symbol: OpeningSymbol; tone?: GlyphTone }) {
  const active = tone !== 'normal';
  const colour = tone === 'invalid' ? INK.danger : INK.accent;
  const line = active ? colour : symbol.kind === 'window' || symbol.kind === 'sliding' ? INK.glassLine : INK.door;
  const soft = active ? colour : INK.swing;
  const width = tone === 'selected' ? 2 : 1.25;
  const gap = polyPath(symbol.gap);
  const faces = linePath([symbol.gap[0], symbol.gap[1]]) + linePath([symbol.gap[3], symbol.gap[2]]);
  return (
    <>
      {(tone === 'preview' || tone === 'invalid') && <path d={gap} fill="#ffffff" fillOpacity={0.92} />}
      {active && <path d={gap} fill={colour} fillOpacity={tone === 'hover' ? 0.12 : 0.18} />}
      {symbol.kind === 'window' ? (
        <>
          <path d={symbol.rects.map(polyPath).join('')} fill={active ? '#ffffff' : INK.glass} fillOpacity={active ? 0.6 : 1} stroke={line} strokeWidth={width} {...NS} />
          <path d={symbol.lines.map(linePath).join('')} fill="none" stroke={line} strokeWidth={1} {...NS} />
        </>
      ) : symbol.kind === 'passage' ? (
        <path d={symbol.lines.map(linePath).join('')} fill="none" stroke={soft} strokeWidth={width} strokeDasharray="4 3" {...NS} />
      ) : (
        <>
          <path d={faces} fill="none" stroke={soft} strokeWidth={0.75} strokeOpacity={0.7} {...NS} />
          {symbol.rects.length > 0 && <path d={symbol.rects.map(polyPath).join('')} fill="#ffffff" stroke={line} strokeWidth={width} {...NS} />}
          {symbol.arc && <path d={arcPath(symbol.arc.center, symbol.arc.from, symbol.arc.to, symbol.arc.radius)} fill="none" stroke={soft} strokeWidth={1} {...NS} />}
          {symbol.lines.length > 0 && <path d={symbol.lines.map(linePath).join('')} fill="none" stroke={line} strokeWidth={width + 0.5} strokeLinecap="round" {...NS} />}
        </>
      )}
    </>
  );
}

export const OpeningsLayer = memo(function OpeningsLayer({ level, selectedId, hoverId }: { level: Level; selectedId: Id | null; hoverId: Id | null }) {
  const symbols = useMemo(
    () =>
      Object.values(level.openings).flatMap((o) => {
        const frame = wallFrame(level, o.wallId);
        return frame ? [{ o, symbol: openingSymbol(frame, o) }] : [];
      }),
    [level.vertices, level.walls, level.openings], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <g data-layer="openings">
      {symbols.map(({ o, symbol }) => (
        <g key={o.id} data-opening-id={o.id} data-opening-kind={o.kind} data-hinge={o.hinge} data-swing={o.swing}>
          <OpeningGlyph symbol={symbol} tone={o.id === selectedId ? 'selected' : o.id === hoverId ? 'hover' : 'normal'} />
        </g>
      ))}
    </g>
  );
});

export const ItemsLayer = memo(function ItemsLayer({ level, selectedId, hoverId }: { level: Level; selectedId: Id | null; hoverId: Id | null }) {
  const items = useMemo(() => Object.values(level.items).map((item) => ({ item, fp: itemFootprint(item) })), [level.items]);
  return (
    <g data-layer="items">
      {items.map(({ item, fp }) => {
        const active = item.id === selectedId;
        const stroke = active || item.id === hoverId ? INK.accent : INK.item;
        // A short tick at the middle of the front edge shows which way the item faces.
        const front = vec.mid(fp.corners[0], fp.corners[1]);
        const inward = vec.lerp(front, { x: item.x, y: item.y }, Math.min(0.5, 120 / Math.max(1, fp.d / 2)));
        return (
          <g key={item.id} data-item-id={item.id}>
            <path d={polyPath(fp.corners)} fill={active ? INK.accentSoft : '#ffffff'} fillOpacity={0.8} stroke={stroke} strokeWidth={active ? 1.75 : 1} strokeLinejoin="round" {...NS} />
            <path d={linePath([fp.corners[0], fp.corners[1]]) + linePath([front, inward])} fill="none" stroke={stroke} strokeWidth={active ? 2.5 : 2} {...NS} />
          </g>
        );
      })}
    </g>
  );
});

/** Selected room outline (its clear floor area). */
export function RoomHighlight({ level }: { level: Level }) {
  const selection = usePlanStore((s) => s.selection);
  const hover = useEditor((s) => s.hover);
  const rooms = selectRooms(level);
  const find = (sel: Selection | null) => (sel?.kind === 'room' ? rooms.find((r) => r.roomId === sel.id) : undefined);
  const selected = find(selection);
  const hovered = find(hover);
  return (
    <g data-layer="room-highlight">
      {hovered && hovered !== selected && <path d={polyPath(hovered.interior)} fill={INK.accent} fillOpacity={0.05} />}
      {selected && (
        <path d={polyPath(selected.interior)} fill={INK.accent} fillOpacity={0.08} stroke={INK.accent} strokeWidth={1.5} strokeDasharray="6 4" strokeLinejoin="round" {...NS} />
      )}
    </g>
  );
}

/** Plan-space previews: the wall being drawn at its real thickness and the opening about to be placed. */
export function DraftLayer({ level }: { level: Level }) {
  const draft = useEditor((s) => s.draft);
  const thickness = useEditor((s) => s.wallThickness);
  if (!draft) return null;
  if (draft.kind === 'wall') {
    const from = draft.chain[draft.chain.length - 1]!;
    if (vec.dist(from, draft.cursor) < 1) return null;
    const n = vec.scale(vec.perp(vec.norm(vec.sub(draft.cursor, from))), thickness / 2);
    const band = [vec.add(from, n), vec.add(draft.cursor, n), vec.sub(draft.cursor, n), vec.sub(from, n)];
    return <path d={polyPath(band)} fill={INK.accent} fillOpacity={0.3} stroke={INK.accent} strokeWidth={1} {...NS} />;
  }
  if (draft.kind === 'opening' && draft.placement.width > 0) return <OpeningPreview level={level} />;
  return null;
}

function OpeningPreview({ level }: { level: Level }) {
  const draft = useEditor((s) => s.draft);
  const tool = useEditor((s) => s.tool);
  if (draft?.kind !== 'opening') return null;
  const frame = wallFrame(level, draft.placement.wallId);
  const kind = tool === 'door' || tool === 'sliding' || tool === 'window' || tool === 'passage' ? tool : null;
  if (!frame || !kind) return null;
  const p = draft.placement;
  const symbol = openingSymbol(frame, { offset: p.offset, width: p.width, kind, hinge: p.hinge, swing: p.swing });
  return (
    <g data-testid="opening-preview" data-valid={p.valid}>
      <OpeningGlyph symbol={symbol} tone={p.valid ? 'preview' : 'invalid'} />
    </g>
  );
}
