/**
 * Walk mode's overlays: room list, current-room label, view options, tour bar,
 * caption, hint, resume prompt and the touch joystick. Everything floats over
 * the view and only the controls themselves take pointer events.
 */
import { planStore, usePlanStore, type Id, type RoomType } from '@interio/core';
import { COVE_SETTING, OUTSIDE_LABELS, OUTSIDE_SETTING, OUTSIDE_VIEWS, coveLightsOn, lightingFromSettings, outsideFromSettings, type OutsideView } from '@interio/scene3d';
import {
  Archive,
  Bath,
  BedDouble,
  BookOpen,
  Camera,
  ChevronLeft,
  CookingPot,
  DoorOpen,
  Fence,
  LayoutList,
  Maximize,
  Minimize,
  MousePointerClick,
  MoveHorizontal,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sofa,
  Square,
  Utensils,
  WashingMachine,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { metres, squareMetres } from '../../lib/format';
import { Button, IconButton, Kbd, Panel, PanelHeader, Segmented, Select, cn } from '../../ui';
import type { WalkController } from './controller';
import type { WalkWorld } from './route';
import { EYE_RANGE, FOV_RANGE, TOUR_SPEEDS, useWalkUi, walkUi, type MoveMode } from './store';

const ROOM_ICON: Record<RoomType, LucideIcon> = {
  living: Sofa,
  dining: Utensils,
  bedroom: BedDouble,
  kitchen: CookingPot,
  bathroom: Bath,
  balcony: Fence,
  utility: WashingMachine,
  foyer: DoorOpen,
  study: BookOpen,
  corridor: MoveHorizontal,
  storage: Archive,
  other: Square,
};

export interface RoomInfo {
  id: Id;
  name: string;
  type: RoomType;
  /** Clear floor area, mm2, and its bounding size, mm. */
  area: number;
  width: number;
  depth: number;
}

export function roomInfo(world: WalkWorld, id: Id | null): RoomInfo | null {
  const room = id ? world.level.rooms[id] : undefined;
  const geom = world.rooms.find((r) => r.roomId === id);
  if (!room || !geom) return null;
  return { id: room.id, name: room.name, type: room.type, area: geom.interiorArea, width: geom.width, depth: geom.depth };
}

const sizeText = (r: RoomInfo) => `${(r.width / 1000).toFixed(1)} × ${(r.depth / 1000).toFixed(1)} m · ${squareMetres(r.area)}`;

/* ----------------------------------------------------------------- rooms */

export function RoomsPanel({ rooms, currentId, onJump, onEntrance }: { rooms: RoomInfo[]; currentId: Id | null; onJump: (id: Id) => void; onEntrance: () => void }) {
  const open = useWalkUi((s) => s.roomsOpen);
  if (!open)
    return (
      <Panel className="pointer-events-auto p-0.5">
        <IconButton label="Show rooms" onClick={() => walkUi.set({ roomsOpen: true })} data-testid="walk-rooms-toggle">
          <LayoutList className="h-4 w-4" />
        </IconButton>
      </Panel>
    );
  return (
    <Panel className="pointer-events-auto flex max-h-full w-56 flex-col overflow-hidden max-sm:w-48">
      <PanelHeader
        title="Rooms"
        actions={
          <div className="flex items-center">
            <IconButton label="Go to the entrance" size="sm" onClick={onEntrance}>
              <DoorOpen className="h-4 w-4" />
            </IconButton>
            <IconButton label="Hide rooms" size="sm" onClick={() => walkUi.set({ roomsOpen: false })} data-testid="walk-rooms-toggle">
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          </div>
        }
      />
      <ul className="min-h-0 flex-1 overflow-y-auto p-1" data-testid="walk-room-list">
        {rooms.map((r) => {
          const Icon = ROOM_ICON[r.type];
          const current = r.id === currentId;
          return (
            <li key={r.id}>
              <button
                type="button"
                data-testid="walk-room-item"
                data-room-id={r.id}
                aria-current={current ? 'location' : undefined}
                onClick={() => onJump(r.id)}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors',
                  current ? 'bg-accent-soft text-accent-strong' : 'text-ink hover:bg-sunken',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', current ? 'text-accent-strong' : 'text-ink-faint')} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className={cn('shrink-0 text-xs tabular-nums', current ? 'text-accent-strong' : 'text-ink-faint')}>{squareMetres(r.area)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function CurrentRoom({ room }: { room: RoomInfo | null }) {
  const Icon = room ? ROOM_ICON[room.type] : Square;
  return (
    <div
      className="pointer-events-none flex h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-[var(--shadow-panel)]"
      aria-live="polite"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="truncate" data-testid="walk-room-label" data-room-id={room?.id ?? ''}>
        {room?.name ?? 'Outside'}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- view options */

function Toggle({ label, checked, onChange, testId, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-ink-soft" title={hint}>
      {label}
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={checked}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
          // Hand the keyboard back to walking.
          e.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** The world outside the windows, saved with the project (also offered in the Design toolbar). */
export function OutsidePicker({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const outside = usePlanStore((s) => outsideFromSettings(s.project?.settings));
  return (
    <div data-testid="walk-outside" data-value={outside}>
      <Segmented<OutsideView>
        size={size}
        value={outside}
        onChange={(v) => {
          if (v !== outside) planStore.getState().setProjectSettings({ [OUTSIDE_SETTING]: v });
        }}
        options={OUTSIDE_VIEWS.map((v) => ({ value: v, label: OUTSIDE_LABELS[v], title: `${OUTSIDE_LABELS[v]} outside the windows` }))}
      />
    </div>
  );
}

function Slider({ label, value, text, min, max, step, onChange, testId }: { label: string; value: number; text: string; min: number; max: number; step: number; onChange: (v: number) => void; testId: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
        {label}
        <span className="tabular-nums text-ink">{text}</span>
      </span>
      <input
        type="range"
        className="h-5 w-full accent-accent"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
        // Hand the keyboard back to walking once the slider is let go.
        onPointerUp={(e) => e.currentTarget.blur()}
      />
    </label>
  );
}

export function ViewOptions({ onScreenshot, onFullscreen, canFullscreen }: { onScreenshot: () => void; onFullscreen: () => void; canFullscreen: boolean }) {
  const { fov, eyeHeight, moveMode, settingsOpen, fullscreen, headBob } = useWalkUi();
  const coves = usePlanStore((s) => coveLightsOn(s.project?.settings, lightingFromSettings(s.project?.settings)));
  return (
    <div className="flex flex-col items-end gap-2">
      <Panel className="pointer-events-auto flex items-center gap-0.5 p-0.5">
        <IconButton
          label={moveMode === 'click' ? 'Click to move is on. Switch to mouse look' : 'Click to move'}
          active={moveMode === 'click'}
          onClick={() => walkUi.set({ moveMode: moveMode === 'click' ? 'look' : 'click', released: false })}
          data-testid="walk-click-mode"
        >
          <MousePointerClick className="h-4 w-4" />
        </IconButton>
        <IconButton label="View options" active={settingsOpen} onClick={() => walkUi.set({ settingsOpen: !settingsOpen })} data-testid="walk-options">
          <SlidersHorizontal className="h-4 w-4" />
        </IconButton>
        <IconButton label="Save a picture of this view" onClick={onScreenshot} data-testid="walk-screenshot">
          <Camera className="h-4 w-4" />
        </IconButton>
        {canFullscreen && (
          <IconButton label={fullscreen ? 'Leave full screen' : 'Full screen'} active={fullscreen} onClick={onFullscreen} data-testid="walk-fullscreen">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </IconButton>
        )}
      </Panel>
      {settingsOpen && (
        <Panel className="pointer-events-auto w-60">
          <PanelHeader
            title="View"
            actions={
              <IconButton label="Close view options" size="sm" onClick={() => walkUi.set({ settingsOpen: false })}>
                <X className="h-4 w-4" />
              </IconButton>
            }
          />
          <div className="flex flex-col gap-3 p-3">
            <Slider label="Field of view" text={`${Math.round(fov)}°`} value={fov} min={FOV_RANGE.min} max={FOV_RANGE.max} step={1} onChange={(v) => walkUi.set({ fov: v })} testId="walk-fov" />
            <Slider label="Eye height" text={metres(eyeHeight)} value={eyeHeight} min={EYE_RANGE.min} max={EYE_RANGE.max} step={50} onChange={(v) => walkUi.set({ eyeHeight: v })} testId="walk-eye-height" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Outside the windows</span>
              <OutsidePicker />
            </div>
            <Toggle
              label="Cove lights"
              hint="Hidden warm LED strips round the ceilings of living rooms and bedrooms. On by default for evening and night."
              checked={coves}
              testId="walk-coves"
              onChange={(on) => planStore.getState().setProjectSettings({ [COVE_SETTING]: on })}
            />
            <Toggle label="Head bob" hint="A very slight bob of the head while walking" checked={headBob} testId="walk-head-bob" onChange={(on) => walkUi.set({ headBob: on })} />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Mouse</span>
              <Segmented<MoveMode>
                size="sm"
                className="self-start"
                value={moveMode}
                onChange={(m) => walkUi.set({ moveMode: m, released: false })}
                options={[
                  { value: 'look', label: 'Look around', title: 'Click the view to look with the mouse; Esc releases it' },
                  { value: 'click', label: 'Click to move', title: 'Click a spot on the floor to walk there; drag to look' },
                ]}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tour */

export function TourBar({ controller, world }: { controller: WalkController; world: WalkWorld }) {
  const tour = useWalkUi((s) => s.tour);
  const speed = useWalkUi((s) => s.tourSpeed);
  const active = tour.status === 'playing' || tour.status === 'paused';
  const room = roomInfo(world, tour.roomId);
  // A speed set through the debug hook may not be one of the presets: list it so the control stays truthful.
  const speeds = TOUR_SPEEDS.includes(speed as (typeof TOUR_SPEEDS)[number]) ? TOUR_SPEEDS : [...TOUR_SPEEDS, speed];
  const speedSelect = (
    <Select
      aria-label="Tour speed"
      className="!h-8 !w-20 shrink-0"
      value={String(speed)}
      data-testid="walk-tour-speed"
      onChange={(e) => {
        walkUi.set({ tourSpeed: Number(e.currentTarget.value) });
        e.currentTarget.blur();
      }}
    >
      {speeds.map((s) => (
        <option key={s} value={s}>
          {s}×
        </option>
      ))}
    </Select>
  );

  let caption: ReactNode = null;
  if (active && room) {
    caption =
      tour.phase === 'look' ? (
        <>
          <span className="font-semibold text-ink">{room.name}</span>
          <span className="text-ink-soft">{sizeText(room)}</span>
        </>
      ) : (
        <span className="text-ink-soft">
          On the way to <span className="font-semibold text-ink">{room.name}</span>
        </span>
      );
  } else if (tour.status === 'ended') {
    caption = <span className="text-ink-soft">That was every room. Walk around freely, or take the tour again.</span>;
  }

  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {caption && (
        <div
          className="pointer-events-none flex max-w-full flex-wrap items-baseline justify-center gap-x-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm shadow-[var(--shadow-panel)]"
          data-testid="walk-tour-caption"
          aria-live="polite"
        >
          {caption}
        </div>
      )}
      <Panel className="pointer-events-auto flex max-w-full items-center gap-1 p-1">
        {active ? (
          <>
            <IconButton label="Previous room" size="sm" onClick={() => controller.previousStop()} data-testid="walk-tour-prev">
              <SkipBack className="h-4 w-4" />
            </IconButton>
            {tour.status === 'playing' ? (
              <IconButton label="Pause tour" size="sm" active onClick={() => controller.pauseTour()} data-testid="walk-tour-pause">
                <Pause className="h-4 w-4" />
              </IconButton>
            ) : (
              <IconButton label="Resume tour" size="sm" onClick={() => controller.resumeTour()} data-testid="walk-tour-play">
                <Play className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label="Next room" size="sm" onClick={() => controller.nextStop()} data-testid="walk-tour-next">
              <SkipForward className="h-4 w-4" />
            </IconButton>
            <IconButton label="Stop tour" size="sm" onClick={() => controller.stopTour()} data-testid="walk-tour-stop">
              <Square className="h-3.5 w-3.5" />
            </IconButton>
            <span className="px-1.5 text-xs whitespace-nowrap tabular-nums text-ink-soft" data-testid="walk-tour-progress">
              {tour.index + 1} / {tour.total}
            </span>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              className="whitespace-nowrap"
              icon={tour.status === 'ended' ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              onClick={() => controller.startTour()}
              data-testid="walk-tour-start"
            >
              {tour.status === 'ended' ? 'Tour again' : 'Guided tour'}
            </Button>
            {tour.status === 'ended' && (
              <IconButton label="Dismiss" size="sm" onClick={() => controller.stopTour()} data-testid="walk-tour-stop">
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </>
        )}
        {speedSelect}
      </Panel>
    </div>
  );
}

/* ----------------------------------------------------------- hint, prompt */

export function Hint() {
  const { hintSeen, moveMode, touch, tour } = useWalkUi();
  const hidden = hintSeen || tour.status === 'playing';
  return (
    <div
      aria-hidden={hidden}
      data-testid="walk-hint"
      className={cn(
        'pointer-events-none flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg bg-ink/80 px-3 py-2 text-xs text-white transition-opacity duration-700',
        hidden ? 'opacity-0' : 'opacity-100',
      )}
    >
      {touch ? (
        <>Left thumb to walk · drag to look around · tap the floor to walk there</>
      ) : moveMode === 'click' ? (
        <>
          Click the floor to walk there · drag to look · <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or arrows to move
        </>
      ) : (
        <>
          Click to look around · <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or arrows to move · <Kbd>Shift</Kbd> to go faster · <Kbd>Esc</Kbd> to release
        </>
      )}
    </div>
  );
}

export function ResumePrompt({ onResume }: { onResume: () => void }) {
  const show = useWalkUi((s) => s.released && !s.locked && s.moveMode === 'look' && s.tour.status !== 'playing');
  if (!show) return null;
  return (
    <Panel className="pointer-events-auto flex w-64 flex-col items-center gap-3 p-4 text-center">
      <div>
        <h3 className="text-sm font-semibold text-ink">Mouse released</h3>
        <p className="mt-1 text-xs text-ink-soft">Click the view, or the button below, to look around again.</p>
      </div>
      <Button variant="primary" size="sm" onClick={onResume} data-testid="walk-resume">
        Resume
      </Button>
      <button type="button" className="text-xs text-ink-soft underline hover:text-ink" onClick={() => walkUi.set({ moveMode: 'click', released: false })}>
        Use click-to-move instead
      </button>
    </Panel>
  );
}

/* -------------------------------------------------------------- joystick */

const STICK_TRAVEL = 40; // px

export function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const l = Math.hypot(dx, dy);
    if (l > STICK_TRAVEL) {
      dx *= STICK_TRAVEL / l;
      dy *= STICK_TRAVEL / l;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / STICK_TRAVEL, -dy / STICK_TRAVEL);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      role="application"
      aria-label="Move joystick"
      data-testid="walk-joystick"
      className="pointer-events-auto relative h-28 w-28 touch-none rounded-full border border-white/50 bg-ink/25 select-none"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { id: e.pointerId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety (keeps the stick alive when the thumb slides off it); carry on without.
        }
        walkUi.acted();
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-surface/90 shadow-[var(--shadow-panel)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
