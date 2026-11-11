/**
 * Finishes of the selected room: floor, walls and ceiling, picked from the palette.
 * Every pick is written straight to the plan, so the 3D view follows and undo steps
 * back one pick at a time.
 */
import { isHexColor, planStore, type Level, type MaterialDef, type Room } from '@interio/core';
import { CopyCheck, PanelLeft, RotateCcw } from 'lucide-react';
import { Button, Kbd, cn, toast } from '../../ui';
import { applyFinishesFrom, resetFinishes, setFinish } from './actions';
import { ColorPick } from './ColorPick';
import { finishSections, surfaceFinishName } from './customise';
import { applyFinishes, currentFinish, finishGroups, hasDefaultFinishes, pluralRoomType, type Surface } from './finishes';
import { Tick } from './ItemFinishes';
import { useViewer } from './state';
import { useSwatch } from './swatch';

const GROUPS = finishGroups();

const HINT: Partial<Record<Surface, string>> = { ceiling: 'in Walk mode' };

function Swatch({ def, surface, active, onPick, testId = 'finish-swatch' }: { def: MaterialDef; surface: Surface; active: boolean; onPick: () => void; testId?: string }) {
  const image = useSwatch(def.id);
  return (
    <button
      type="button"
      data-testid={testId}
      data-surface={surface}
      data-finish-id={def.id}
      data-textured={image ? 'true' : 'false'}
      aria-label={def.name}
      aria-pressed={active}
      title={def.name}
      onClick={onPick}
      className={cn(
        'relative aspect-square w-full rounded-md border bg-cover bg-center transition-shadow',
        active ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-line hover:ring-2 hover:ring-line',
      )}
      style={{ backgroundColor: def.color, backgroundImage: image ? `url(${image})` : undefined }}
    >
      {active && <Tick color={def.color} />}
    </button>
  );
}

/**
 * Every finish of a surface in short labelled sections, then a custom colour. `current`
 * is marked; `onPick` gets a palette id or `#rrggbb`.
 */
export function SurfaceSwatches({
  surface,
  options,
  current,
  onPick,
  testId,
  customTestId,
}: {
  surface: Surface;
  options: readonly MaterialDef[];
  current: string | undefined;
  onPick: (value: string) => void;
  testId?: string;
  customTestId: string;
}) {
  const custom = !!current && isHexColor(current);
  return (
    <div className="flex flex-col gap-1.5">
      {finishSections(surface, options).map((section) => (
        <div key={section.label}>
          <div className="mb-1 text-[11px] text-ink-faint">{section.label}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {section.options.map((def) => (
              <Swatch key={def.id} def={def} surface={surface} testId={testId} active={def.id === current} onPick={() => onPick(def.id)} />
            ))}
          </div>
        </div>
      ))}
      <div>
        <div className="mb-1 text-[11px] text-ink-faint">Custom colour</div>
        <div className="grid grid-cols-7 gap-1.5">
          <ColorPick data-testid={customTestId} data-surface={surface} value={custom ? current : undefined} active={custom} onPick={onPick} />
        </div>
      </div>
    </div>
  );
}

/** Offers the wall face clicked last on its own, or says how to pick one. */
function WallFaceLink({ room }: { room: Room }) {
  const face = useViewer((s) => s.wallFace);
  if (face?.roomId === room.id)
    return (
      <div className="border-b border-line px-3 py-2">
        <Button
          size="sm"
          className="w-full"
          icon={<PanelLeft className="h-4 w-4" />}
          data-testid="room-wall-face"
          title="Give only the wall you clicked its own finish: an accent wall"
          onClick={() => planStore.getState().select({ kind: 'wall', id: face.wallId })}
        >
          Finish this wall only
        </Button>
      </div>
    );
  return (
    <p className="border-b border-line px-3 py-2 text-xs text-ink-faint" data-testid="room-wall-face-hint">
      Click one of the room&apos;s walls to give it a finish of its own. <Kbd>Alt</Kbd>-click goes straight there.
    </p>
  );
}

function plural(n: number): string {
  return n === 1 ? '1 room' : `${n} rooms`;
}

export function FinishesPanel({ level, room }: { level: Level; room: Room }) {
  const others = Object.values(level.rooms).filter((r) => r.id !== room.id);
  const sameType = others.filter((r) => r.type === room.type);
  const typeName = pluralRoomType(room.type);
  const toAll = Object.keys(applyFinishes(level.rooms, room.id, 'all')).length;
  const toType = Object.keys(applyFinishes(level.rooms, room.id, 'type')).length;
  const apply = (scope: 'all' | 'type') => {
    const changed = applyFinishesFrom(room.id, scope);
    toast.success(changed === 0 ? 'Those rooms already match' : `Finishes applied to ${plural(changed)}`);
  };
  return (
    <div data-testid="finishes-panel">
      <WallFaceLink room={room} />
      <div className="flex flex-col gap-3 p-3">
        {GROUPS.map(({ surface, label, options }) => {
          const current = currentFinish(room, surface);
          return (
            <section key={surface} aria-label={label} data-testid={`finish-group-${surface}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="shrink-0 text-xs font-medium whitespace-nowrap text-ink-soft">
                  {label}
                  {HINT[surface] && <span className="ml-1.5 font-normal text-ink-faint">{HINT[surface]}</span>}
                </h3>
                <span className="truncate text-xs text-ink" data-testid={`finish-current-${surface}`}>
                  {surfaceFinishName(current)}
                </span>
              </div>
              <SurfaceSwatches surface={surface} options={options} current={current} customTestId="finish-custom" onPick={(v) => setFinish(room.id, surface, v)} />
            </section>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line p-3">
        <Button
          size="sm"
          icon={<CopyCheck className="h-4 w-4" />}
          data-testid="finish-apply-all"
          disabled={others.length === 0 || toAll === 0}
          title={toAll === 0 ? 'Every room already has these finishes' : 'Gives every room this floor, wall and ceiling finish. One undo step.'}
          onClick={() => apply('all')}
        >
          Apply to all rooms
        </Button>
        {sameType.length > 0 && (
          <Button
            size="sm"
            icon={<CopyCheck className="h-4 w-4" />}
            data-testid="finish-apply-type"
            disabled={toType === 0}
            title={toType === 0 ? `All ${typeName} already have these finishes` : `Gives the other ${typeName} this floor, wall and ceiling finish. One undo step.`}
            onClick={() => apply('type')}
          >
            Apply to all {typeName}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw className="h-4 w-4" />}
          data-testid="finish-reset"
          disabled={hasDefaultFinishes(room)}
          title="Back to the finishes this kind of room starts with"
          onClick={() => resetFinishes(room.id)}
        >
          Reset to default
        </Button>
      </div>
    </div>
  );
}
