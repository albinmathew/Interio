/** Properties of the selection, or of the level when nothing is selected. */
import { getEntry } from '@interio/catalog';
import {
  DEFAULT_WALL_MATERIAL,
  MATERIAL_LIST,
  MATERIALS,
  OPENING_KINDS,
  ROOM_TYPES,
  ops,
  planStore,
  selectRooms,
  usePlanStore,
  type Id,
  type Item,
  type Level,
  type Opening,
  type OpeningKind,
  type Room,
  type RoomType,
  type Wall,
  type WallKind,
} from '@interio/core';
import { FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { dims, squareFeet, squareMetres } from '../../../lib/format';
import { Button, Field, IconButton, Panel, PanelHeader, Segmented, Select } from '../../../ui';
import { useController } from '../context';
import { defaultOpening } from '../logic/openings';
import { levelTotals, ROOM_TYPE_LABEL, roomTypePatch } from '../logic/rooms';
import { endForLength, incidentWalls, wallKindDefaults } from '../logic/walls';
import { Fact, NumField, Section, TextField } from './fields';

const store = () => planStore.getState();

function DeleteButton({ what }: { what: string }) {
  const controller = useController();
  return (
    <IconButton label={`Delete ${what} (Del)`} size="sm" onClick={() => controller.deleteSelection()}>
      <Trash2 className="h-4 w-4" />
    </IconButton>
  );
}

const WALL_KIND_OPTIONS: { value: WallKind; label: string }[] = [
  { value: 'wall', label: 'Wall' },
  { value: 'low', label: 'Low' },
  { value: 'railing', label: 'Railing' },
  { value: 'divider', label: 'Divider' },
];

function WallPanel({ level, wall }: { level: Level; wall: Wall }) {
  const controller = useController();
  const { a, b } = ops.wallEnds(level, wall);
  const length = ops.wallLength(level, wall);
  const setLength = (next: number) =>
    store().transact(() => {
      store().moveVertex(wall.b, endForLength(a, b, next));
      store().weldVertices();
      controller.keepOpeningsInWalls();
    });
  return (
    <>
      <PanelHeader title="Wall" actions={<DeleteButton what="wall" />} />
      <Section>
        <Field label="Kind">
          <Segmented<WallKind>
            size="sm"
            className="self-start"
            value={wall.kind}
            onChange={(kind) => kind !== wall.kind && store().setWallProps(wall.id, wallKindDefaults(kind, level.ceilingHeight))}
            options={WALL_KIND_OPTIONS}
          />
        </Field>
        <NumField label="Length" value={length} min={50} unit="mm" onCommit={setLength} hint="Moves the far end along the wall" />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Thickness" value={wall.thickness} min={20} max={1000} unit="mm" onCommit={(thickness) => store().setWallProps(wall.id, { thickness })} />
          <NumField label="Height" value={wall.height} min={100} max={10000} step={50} unit="mm" onCommit={(height) => store().setWallProps(wall.id, { height })} />
        </div>
      </Section>
    </>
  );
}

const OPENING_LABEL: Record<OpeningKind, string> = { door: 'Door', sliding: 'Sliding door', window: 'Window', passage: 'Passage' };

function OpeningPanel({ level, opening }: { level: Level; opening: Opening }) {
  const controller = useController();
  const wall = level.walls[opening.wallId];
  const update = (patch: Partial<Omit<Opening, 'id'>>) => store().updateOpening(opening.id, patch);
  const setKind = (kind: OpeningKind) => {
    if (kind === opening.kind) return;
    const def = defaultOpening(kind);
    update({
      kind,
      sill: def.sill,
      height: def.height,
      ...(kind === 'door' ? { hinge: opening.hinge ?? 'a', swing: opening.swing ?? 1 } : {}),
    });
  };
  return (
    <>
      <PanelHeader title={OPENING_LABEL[opening.kind]} actions={<DeleteButton what="opening" />} />
      <Section>
        <Field label="Kind">
          <Select value={opening.kind} onChange={(e) => setKind(e.currentTarget.value as OpeningKind)}>
            {OPENING_KINDS.map((k) => (
              <option key={k} value={k}>
                {OPENING_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <NumField label="Width" value={opening.width} min={200} unit="mm" onCommit={(width) => update({ width })} />
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Height" value={opening.height} min={100} max={wall?.height ?? 10000} step={50} unit="mm" onCommit={(height) => update({ height })} />
          <NumField label="Sill" value={opening.sill} min={0} max={wall ? wall.height - 100 : 10000} step={50} unit="mm" onCommit={(sill) => update({ sill })} />
        </div>
        {opening.kind === 'door' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Hinge">
                <Segmented<'a' | 'b'>
                  size="sm"
                  value={opening.hinge ?? 'a'}
                  onChange={(hinge) => hinge !== (opening.hinge ?? 'a') && update({ hinge })}
                  options={[
                    { value: 'a', label: 'Start', title: 'Hinge at the end nearer the wall start' },
                    { value: 'b', label: 'End', title: 'Hinge at the end nearer the wall end' },
                  ]}
                />
              </Field>
              <Field label="Swing">
                <Segmented<'1' | '-1'>
                  size="sm"
                  value={opening.swing === -1 ? '-1' : '1'}
                  onChange={(v) => v !== (opening.swing === -1 ? '-1' : '1') && update({ swing: v === '-1' ? -1 : 1 })}
                  options={[
                    { value: '1', label: 'Left', title: 'Opens to the left of the wall direction' },
                    { value: '-1', label: 'Right', title: 'Opens to the right of the wall direction' },
                  ]}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" icon={<FlipHorizontal2 className="h-4 w-4" />} title="Flip hinge side (F)" onClick={() => controller.flipDoor('hinge')}>
                Flip hinge
              </Button>
              <Button size="sm" icon={<FlipVertical2 className="h-4 w-4" />} title="Flip swing side (Shift+F)" onClick={() => controller.flipDoor('swing')}>
                Flip swing
              </Button>
            </div>
          </>
        )}
        <TextField label="Tag" value={opening.tag ?? ''} placeholder="e.g. D1, W2" allowEmpty onCommit={(tag) => update({ tag: tag || undefined })} />
      </Section>
    </>
  );
}

function Swatch({ id }: { id: string | undefined }) {
  const colour = id ? MATERIALS[id]?.color : undefined;
  return <span className="h-8 w-8 shrink-0 rounded-md border border-line" style={{ background: colour ?? 'transparent' }} aria-hidden="true" />;
}

const FLOORS = MATERIAL_LIST.filter((m) => m.surface === 'floor');
const WALLS = MATERIAL_LIST.filter((m) => m.surface === 'wall');

function RoomPanel({ level, room }: { level: Level; room: Room }) {
  const geom = selectRooms(level).find((r) => r.roomId === room.id);
  const set = (patch: Partial<Omit<Room, 'id' | 'seed'>>) => store().setRoomProps(room.id, patch);
  return (
    <>
      <PanelHeader title="Room" />
      <Section>
        <TextField label="Name" value={room.name} onCommit={(name) => set({ name })} />
        <Field label="Type">
          <Select
            value={room.type}
            onChange={(e) => set(roomTypePatch(room, e.currentTarget.value as RoomType))}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Floor finish">
          <span className="flex gap-2">
            <Swatch id={room.floorMaterial} />
            <Select value={room.floorMaterial} onChange={(e) => set({ floorMaterial: e.currentTarget.value })}>
              {!MATERIALS[room.floorMaterial] && <option value={room.floorMaterial}>{room.floorMaterial}</option>}
              {FLOORS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </span>
        </Field>
        <Field label="Wall finish">
          <span className="flex gap-2">
            <Swatch id={room.wallMaterial ?? DEFAULT_WALL_MATERIAL} />
            <Select value={room.wallMaterial ?? DEFAULT_WALL_MATERIAL} onChange={(e) => set({ wallMaterial: e.currentTarget.value })}>
              {WALLS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </span>
        </Field>
      </Section>
      {geom && (
        <Section className="border-t border-line">
          <Fact label="Clear size">{dims(geom.width, geom.depth)} mm</Fact>
          <Fact label="Floor area">
            {squareMetres(geom.interiorArea)} · {squareFeet(geom.interiorArea)}
          </Fact>
        </Section>
      )}
    </>
  );
}

function VertexPanel({ level, id }: { level: Level; id: Id }) {
  const controller = useController();
  const v = level.vertices[id]!;
  const move = (p: { x: number; y: number }) =>
    store().transact(() => {
      store().moveVertex(id, p);
      store().weldVertices();
      controller.keepOpeningsInWalls();
    });
  const count = incidentWalls(level, id).length;
  return (
    <>
      <PanelHeader title="Corner" actions={<DeleteButton what="corner" />} />
      <Section>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={v.x} min={-1e7} max={1e7} unit="mm" onCommit={(x) => move({ x, y: v.y })} />
          <NumField label="Y" value={v.y} min={-1e7} max={1e7} unit="mm" onCommit={(y) => move({ x: v.x, y })} />
        </div>
        <Fact label="Walls meeting here">{count}</Fact>
        <p className="text-xs text-ink-faint">Drag the corner to reshape the walls joined to it. Deleting a corner between two walls joins them.</p>
      </Section>
    </>
  );
}

function ItemPanel({ item }: { item: Item }) {
  const entry = getEntry(item.catalogId);
  const update = (patch: Partial<Omit<Item, 'id'>>) => store().updateItem(item.id, patch);
  return (
    <>
      <PanelHeader title={entry?.name ?? 'Item'} actions={<DeleteButton what="item" />} />
      <Section>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={item.x} min={-1e7} max={1e7} unit="mm" onCommit={(x) => update({ x })} />
          <NumField label="Y" value={item.y} min={-1e7} max={1e7} unit="mm" onCommit={(y) => update({ y })} />
        </div>
        <NumField label="Rotation" value={item.rotationDeg} min={-360} max={360} step={15} unit="°" onCommit={(rotationDeg) => update({ rotationDeg })} />
        {entry && <Fact label="Size">{dims(entry.dims.w, entry.dims.d)} mm</Fact>}
      </Section>
    </>
  );
}

function LevelPanel({ level }: { level: Level }) {
  const totals = levelTotals(level);
  return (
    <>
      <PanelHeader title="Plan" />
      <Section>
        <NumField
          label="Ceiling height"
          value={level.ceilingHeight}
          min={1800}
          max={10000}
          step={50}
          unit="mm"
          onCommit={(ceilingHeight) => store().setLevelProps({ ceilingHeight })}
          hint="Full-height walls follow this"
        />
      </Section>
      <Section className="border-t border-line">
        <Fact label="Rooms">
          <span data-testid="total-rooms">{totals.rooms}</span>
        </Fact>
        <Fact label="Floor area">
          <span data-testid="total-area">
            {squareMetres(totals.area)} · {squareFeet(totals.area)}
          </span>
        </Fact>
        <Fact label="Walls">{totals.walls}</Fact>
        <Fact label="Doors and windows">{totals.openings}</Fact>
      </Section>
      <p className="border-t border-line p-3 text-xs text-ink-faint">Select a wall, opening or room to edit it.</p>
    </>
  );
}

export function PropertiesPanel({ level }: { level: Level }) {
  const selection = usePlanStore((s) => s.selection);
  let body: ReactNode = null;
  if (selection?.kind === 'wall' && level.walls[selection.id]) body = <WallPanel key={selection.id} level={level} wall={level.walls[selection.id]!} />;
  else if (selection?.kind === 'opening' && level.openings[selection.id]) body = <OpeningPanel key={selection.id} level={level} opening={level.openings[selection.id]!} />;
  else if (selection?.kind === 'room' && level.rooms[selection.id]) body = <RoomPanel key={selection.id} level={level} room={level.rooms[selection.id]!} />;
  else if (selection?.kind === 'vertex' && level.vertices[selection.id]) body = <VertexPanel key={selection.id} level={level} id={selection.id} />;
  else if (selection?.kind === 'item' && level.items[selection.id]) body = <ItemPanel key={selection.id} item={level.items[selection.id]!} />;
  return (
    <Panel className="pointer-events-auto max-h-full w-[264px] overflow-y-auto">
      <div data-testid="properties-panel" data-selection={body ? selection?.kind : 'level'}>
        {body ?? <LevelPanel level={level} />}
      </div>
    </Panel>
  );
}
