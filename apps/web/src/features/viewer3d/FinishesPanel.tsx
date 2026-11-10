/**
 * Finishes of the selected room: floor, walls and ceiling, picked from the palette.
 * Every pick is written straight to the plan, so the 3D view follows and undo steps
 * back one pick at a time.
 */
import type { Level, MaterialDef, Room } from '@interio/core';
import { Check, CopyCheck, RotateCcw } from 'lucide-react';
import { Button, cn, toast } from '../../ui';
import { applyFinishesFrom, resetFinishes, setFinish } from './actions';
import { applyFinishes, currentFinish, finishGroups, finishName, hasDefaultFinishes, pluralRoomType, type Surface } from './finishes';
import { useSwatch } from './swatch';

const GROUPS = finishGroups();

const HINT: Partial<Record<Surface, string>> = { ceiling: 'in Walk mode' };

/** Perceived lightness of an sRGB hex colour, 0..1: picks a tick colour that shows on the swatch. */
function lightness(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function Swatch({ def, surface, active, onPick }: { def: MaterialDef; surface: Surface; active: boolean; onPick: () => void }) {
  const image = useSwatch(def.id);
  return (
    <button
      type="button"
      data-testid="finish-swatch"
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
      {active && (
        <span
          className={cn(
            'absolute right-0.5 bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full',
            lightness(def.color) > 0.55 ? 'bg-ink/70 text-white' : 'bg-white/85 text-ink',
          )}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      )}
    </button>
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
                  {finishName(current)}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {options.map((def) => (
                  <Swatch key={def.id} def={def} surface={surface} active={def.id === current} onPick={() => setFinish(room.id, surface, def.id)} />
                ))}
              </div>
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
