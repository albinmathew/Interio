import { ROLE_LABELS, bedroomRoles, entriesFor } from '@interio/catalog';
import { BEDROOM_ROLES, planStore, selectRooms, usePlanStore, type BedroomRole, type Item, type Level, type Room } from '@interio/core';
import { Copy, RotateCcw, RotateCw, Sparkles, Trash2, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { refurnishRoom, setBedroomRole } from '../../lib/furnish';
import { dims, squareMetres } from '../../lib/format';
import { Badge, Button, Field, IconButton, NumberInput, Panel, PanelHeader, Segmented, Select, cn, toast } from '../../ui';
import { autoFurnishRoom, clearRoom, duplicateSelection, removeSelection, replaceEntry, rotateSelection, setElevation, setRotation } from './actions';
import { currentFinish, finishName } from './finishes';
import { FinishesPanel } from './FinishesPanel';
import { ItemFinishes } from './ItemFinishes';
import { WallFacePanel } from './WallFacePanel';
import type { Overlap } from './placement';
import { entryOrPlaceholder, useViewer, type RoomTab } from './state';

const close = (
  <IconButton label="Deselect" size="sm" onClick={() => planStore.getState().select(null)}>
    <X className="h-4 w-4" />
  </IconButton>
);

function overlapText(level: Level, overlap: Overlap): string {
  const names = overlap.items.map((id) => {
    const other = level.items[id];
    return other ? entryOrPlaceholder(other.catalogId).name.toLowerCase() : 'another item';
  });
  if (overlap.walls.length) names.push('a wall');
  return `Overlaps ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and more' : ''}`;
}

function ItemPanel({ level, item, overlap }: { level: Level; item: Item; overlap?: Overlap }) {
  const entry = entryOrPlaceholder(item.catalogId);
  const room = item.roomId ? level.rooms[item.roomId] : undefined;
  const alternatives = entriesFor({ category: entry.category }).filter((e) => e.anchor === entry.anchor);
  const s = item.scale ?? 1;
  return (
    <div data-testid="item-panel">
      <PanelHeader title={<span data-testid="item-name">{entry.name}</span>} actions={close} />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          <span data-testid="item-dims">
            {dims(entry.dims.w * s, entry.dims.d * s)} × {Math.round(entry.dims.h * s)} mm
          </span>
          {room && <Badge>{room.name}</Badge>}
        </div>
        {overlap && (
          <div data-testid="item-overlap">
            <Badge tone="warn">{overlapText(level, overlap)}</Badge>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rotation">
            <NumberInput
              aria-label="Rotation"
              data-testid="item-rotation"
              value={Math.round(item.rotationDeg * 10) / 10}
              onChange={(v) => setRotation(item.id, v)}
              step={15}
              unit="°"
            />
          </Field>
          <Field label="Elevation">
            <NumberInput
              aria-label="Elevation"
              data-testid="item-elevation"
              value={Math.round(item.z)}
              onChange={(v) => setElevation(item.id, v)}
              step={50}
              min={0}
              unit="mm"
            />
          </Field>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Rotate left 15° (R)" onClick={(e) => rotateSelection(1, e.altKey)}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rotate right 15° (Shift+R)" onClick={(e) => rotateSelection(-1, e.altKey)}>
            <RotateCw className="h-4 w-4" />
          </IconButton>
          <IconButton label="Duplicate (⌘D)" onClick={duplicateSelection}>
            <Copy className="h-4 w-4" />
          </IconButton>
        </div>
        <Field label="Replace with">
          <Select aria-label="Replace with" data-testid="item-replace" value={entry.id} onChange={(e) => replaceEntry(item.id, e.currentTarget.value)}>
            {!alternatives.some((e) => e.id === entry.id) && <option value={entry.id}>{entry.name}</option>}
            {alternatives.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ItemFinishes level={level} item={item} entry={entry} />
      <div className="flex flex-col border-t border-line p-3">
        <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={removeSelection} data-testid="item-remove">
          Remove
        </Button>
      </div>
    </div>
  );
}

/** "Bedroom for: Master / Kids / Guest". After a change it offers to refurnish the room for its new role. */
function BedroomRoleField({ level, room }: { level: Level; room: Room }) {
  const [changedFor, setChangedFor] = useState<string | null>(null);
  const role = room.role ?? bedroomRoles(level)[room.id] ?? 'master';
  const changed = changedFor === room.id;
  return (
    <div className="flex flex-col gap-2 border-t border-line p-3" data-testid="room-role" data-role={role} data-set={room.role ? 'true' : 'false'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-soft">Bedroom for</span>
        <Segmented<BedroomRole>
          size="sm"
          value={role}
          onChange={(next) => {
            if (next === role && room.role) return;
            setBedroomRole(room.id, next);
            setChangedFor(room.id);
          }}
          options={BEDROOM_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], title: `Furnish as the ${ROLE_LABELS[r].toLowerCase()} bedroom` }))}
        />
      </div>
      {!room.role && <p className="text-xs text-ink-faint">Set from its size; furnishing writes it down.</p>}
      {changed && (
        <Button
          size="sm"
          icon={<Sparkles className="h-4 w-4" />}
          data-testid="room-refurnish"
          title="Clears this room and furnishes it for its role. Undo brings the previous furniture back."
          onClick={() => {
            const added = refurnishRoom(room.id);
            setChangedFor(null);
            toast.success(`Refurnished ${room.name} as the ${ROLE_LABELS[role].toLowerCase()} bedroom (${added === 1 ? '1 item' : `${added} items`})`);
          }}
        >
          Refurnish to match
        </Button>
      )}
    </div>
  );
}

function RoomPanel({ level, room }: { level: Level; room: Room }) {
  const tab = useViewer((s) => s.roomTab);
  const geom = selectRooms(level).find((r) => r.roomId === room.id);
  const count = Object.values(level.items).filter((i) => i.roomId === room.id).length;
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
  return (
    <div data-testid="room-panel" className="flex min-h-0 flex-col">
      <PanelHeader title={<span data-testid="room-name">{room.name}</span>} actions={close} />
      {geom && (
        <p className="px-3 pt-2.5 text-xs text-ink-soft" data-testid="room-size">
          {squareMetres(geom.interiorArea)} · {dims(geom.width, geom.depth)} mm
        </p>
      )}
      <div className="px-3 pt-2.5">
        <Segmented<RoomTab>
          size="sm"
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          value={tab}
          onChange={useViewer.getState().setRoomTab}
          options={[
            { value: 'furnish', label: 'Furnish', title: 'Furniture in this room' },
            { value: 'finishes', label: 'Finishes', title: 'Floor, wall and ceiling finishes' },
          ]}
        />
      </div>
      <div className={cn('min-h-0 flex-1', tab === 'finishes' ? 'flex flex-col' : 'overflow-y-auto')}>
        {tab === 'finishes' ? (
          <FinishesPanel level={level} room={room} />
        ) : (
          <div data-testid="furnish-panel">
            <dl className="flex flex-col gap-1.5 p-3 text-[13px]">
              {row('Floor', finishName(currentFinish(room, 'floor')))}
              {row('Walls', finishName(currentFinish(room, 'wall')))}
              {row('Furniture', count === 1 ? '1 item' : `${count} items`)}
            </dl>
            {room.type === 'bedroom' && <BedroomRoleField level={level} room={room} />}
            <div className="flex flex-col gap-2 border-t border-line p-3">
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles className="h-4 w-4" />}
                data-testid="room-autofurnish"
                title="Adds a suggested layout for this kind of room. Undo removes it in one step."
                onClick={() => {
                  const added = autoFurnishRoom(room.id);
                  if (added === 0) toast.info(count > 0 ? 'No space left for more furniture here' : 'Nothing to suggest for this room');
                  else toast.success(added === 1 ? 'Added 1 item' : `Added ${added} items`);
                }}
              >
                Auto-furnish room
              </Button>
              {count > 0 && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} data-testid="room-clear" onClick={() => clearRoom(room.id)}>
                  Clear this room
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Details of the selected item or room. Renders nothing when neither is selected. */
export function SidePanel({
  level,
  items,
  overlaps,
  className,
  style,
}: {
  level: Level;
  items: Record<string, Item>;
  overlaps: Map<string, Overlap>;
  className?: string;
  style?: CSSProperties;
}) {
  const selection = usePlanStore((s) => s.selection);
  const face = useViewer((s) => s.wallFace);
  const item = selection?.kind === 'item' ? items[selection.id] : undefined;
  const room = selection?.kind === 'room' ? level.rooms[selection.id] : undefined;
  const wall = selection?.kind === 'wall' && face?.wallId === selection.id ? level.walls[selection.id] : undefined;
  if (!item && !room && !wall) return null;
  return (
    <div data-testid="side-panel" className={cn('flex flex-col', className)} style={style}>
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        {item ? (
          <div className="min-h-0 overflow-y-auto">
            <ItemPanel level={level} item={item} overlap={overlaps.get(item.id)} />
          </div>
        ) : room ? (
          <RoomPanel level={level} room={room} />
        ) : wall && face ? (
          <WallFacePanel level={level} wall={wall} face={face} />
        ) : null}
      </Panel>
    </div>
  );
}
