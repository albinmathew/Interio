import { CATALOG, entriesFor } from '@interio/catalog';
import { CATALOG_CATEGORIES, usePlanStore, type CatalogCategory, type CatalogEntry, type Level, type Room } from '@interio/core';
import { Search, X } from 'lucide-react';
import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { EmptyState, IconButton, Panel, PanelHeader, TextInput, cn } from '../../ui';
import { useViewer } from './state';

/** 1600 -> "160", 425 -> "42.5" */
const cm = (mm: number): string => String(Math.round(mm) / 10);

const LABEL: Record<CatalogCategory, string> = {
  seating: 'Seating',
  tables: 'Tables',
  beds: 'Beds',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  office: 'Office',
  outdoor: 'Outdoor',
};

/** The room the catalog filters by: the selected room, the selected item's room, else the room last under the cursor. */
export function useFocusRoom(level: Level): Room | null {
  const selection = usePlanStore((s) => s.selection);
  const hoverRoomId = useViewer((s) => s.hoverRoomId);
  const id = selection?.kind === 'room' ? selection.id : selection?.kind === 'item' ? level.items[selection.id]?.roomId : hoverRoomId;
  return (id && level.rooms[id]) || null;
}

/** Thumbnail, or a neutral tile with the entry's footprint drawn to scale. */
function Thumb({ entry }: { entry: CatalogEntry }) {
  if (entry.thumbnail) return <img src={entry.thumbnail} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" />;
  const max = Math.max(entry.dims.w, entry.dims.d, 1);
  const w = (entry.dims.w / max) * 56;
  const d = (entry.dims.d / max) * 56;
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full text-ink-faint" aria-hidden="true">
      <rect x={40 - w / 2} y={40 - d / 2} width={w} height={d} rx="3" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.5" />
      <line x1={40 - w / 2 + 4} x2={40 + w / 2 - 4} y1={40 + d / 2 - 4} y2={40 + d / 2 - 4} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EntryCard({ entry, active }: { entry: CatalogEntry; active: boolean }) {
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, dragged: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.dragged || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    // Dragged out of the panel: the ghost follows the pointer and drops where it is released.
    p.dragged = true;
    useViewer.getState().startPlacing(entry.id, true);
  };
  return (
    <button
      type="button"
      data-testid="catalog-entry"
      data-entry-id={entry.id}
      aria-pressed={active}
      title={`${entry.name}: click, then click the floor. Or drag it into the room.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={() => {
        const dragged = press.current?.dragged;
        press.current = null;
        if (dragged) return;
        const ui = useViewer.getState();
        if (ui.placing?.catalogId === entry.id) ui.stopPlacing();
        else ui.startPlacing(entry.id);
      }}
      className={cn(
        'flex touch-none flex-col rounded-lg border p-1.5 text-left transition-colors select-none',
        active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-sunken',
      )}
    >
      <span className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-sunken">
        <Thumb entry={entry} />
      </span>
      <span className="mt-1.5 line-clamp-2 text-[13px] leading-tight font-medium text-ink">{entry.name}</span>
      <span className="mt-0.5 text-[11px] whitespace-nowrap text-ink-faint" title="Width × depth × height">
        {cm(entry.dims.w)} × {cm(entry.dims.d)} × {cm(entry.dims.h)} cm
      </span>
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-7 shrink-0 rounded-full px-2.5 text-[13px] font-medium transition-colors',
        active ? 'bg-accent text-white' : 'bg-sunken text-ink-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function CatalogPanel({ level, className }: { level: Level; className?: string }) {
  const query = useViewer((s) => s.query);
  const category = useViewer((s) => s.category);
  const roomOnly = useViewer((s) => s.roomOnly);
  const placing = useViewer((s) => s.placing);
  const room = useFocusRoom(level);
  const categories = useMemo(() => CATALOG_CATEGORIES.filter((c) => CATALOG.some((e) => e.category === c)), []);
  const entries = entriesFor({
    category: category === 'all' ? undefined : category,
    roomType: roomOnly && room ? room.type : undefined,
    query,
  });
  const ui = useViewer.getState();
  return (
    <Panel className={cn('flex min-h-0 flex-col', className)}>
      <PanelHeader title="Catalog" actions={<span className="text-xs text-ink-faint">{entries.length} items</span>} />
      <div className="flex flex-col gap-2 border-b border-line p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            aria-label="Search the catalog"
            placeholder="Search furniture and appliances"
            className="pr-7 pl-8"
            value={query}
            onChange={(e) => ui.setQuery(e.currentTarget.value)}
          />
          {query && (
            <IconButton label="Clear search" size="sm" className="absolute top-0 right-0" onClick={() => ui.setQuery('')}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </div>
        <div role="tablist" aria-label="Categories" className="flex gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={category === 'all'} onClick={() => ui.setCategory('all')}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => ui.setCategory(c)}>
              {LABEL[c]}
            </Chip>
          ))}
        </div>
        <label className={cn('flex items-center gap-2 text-[13px]', room ? 'text-ink-soft' : 'text-ink-faint')}>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            checked={roomOnly && !!room}
            disabled={!room}
            onChange={(e) => ui.setRoomOnly(e.currentTarget.checked)}
            data-testid="catalog-room-filter"
          />
          {room ? (
            <span className="truncate">
              Suggested for <span className="font-medium text-ink">{room.name}</span>
            </span>
          ) : (
            'Point at a room to filter by it'
          )}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {entries.length === 0 ? (
          <EmptyState title="Nothing matches" body="Try another word, category or room." />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} active={placing?.catalogId === e.id} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
