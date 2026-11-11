/**
 * Finishes of the selected item: one row of swatches per slot of its catalog entry
 * (`entry.slots`), materials of the slot's own kind first, the rest behind "More", plus a
 * custom colour and "Default". Each pick is one undo step. Entries without slots (the
 * first-generation models) show nothing.
 */
import { FURNITURE_MATERIALS, isHexColor, type CatalogEntry, type FinishKind, type FinishSlot, type FurnitureMaterial, type Item, type Level } from '@interio/core';
import { furnitureSwatch } from '@interio/scene3d';
import { Check, ChevronDown, CopyCheck, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, cn, toast } from '../../ui';
import { applyItemFinishesToAll, setItemFinish } from './actions';
import { ColorPick } from './ColorPick';
import { furnitureFinishName, hasOwnFinish, sameEntryCount, sameEntryTargets, slotSwatchGroups, slotValue } from './customise';

/** Perceived lightness of an sRGB hex colour, 0..1: picks a tick colour that shows on the swatch. */
export function lightness(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** The picture of a furniture finish once it is drawn; null for flat finishes and while it loads. */
function useFurnitureSwatch(value: string, kind: FinishKind): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    void furnitureSwatch(value, kind).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [value, kind]);
  return url;
}

export function Tick({ color }: { color: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute right-0.5 bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full',
        lightness(color) > 0.55 ? 'bg-ink/70 text-white' : 'bg-white/85 text-ink',
      )}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
  );
}

function MaterialSwatch({ material, slot, active, onPick }: { material: FurnitureMaterial; slot: FinishSlot; active: boolean; onPick: () => void }) {
  const image = useFurnitureSwatch(material.id, material.kind);
  const glass = material.kind === 'glass';
  return (
    <button
      type="button"
      data-testid="material-swatch"
      data-slot={slot.id}
      data-material-id={material.id}
      data-textured={image ? 'true' : 'false'}
      aria-label={material.name}
      aria-pressed={active}
      title={material.name}
      onClick={onPick}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-md border bg-cover bg-center transition-shadow',
        active ? 'border-accent ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-line hover:ring-2 hover:ring-line',
      )}
      style={{
        backgroundColor: material.color,
        backgroundImage: image
          ? `url(${image})`
          : glass
            ? 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 45%, rgba(255,255,255,0.5) 60%, rgba(255,255,255,0) 75%)'
            : material.metalness > 0.5
              ? 'linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 50%, rgba(0,0,0,0.18))'
              : undefined,
      }}
    >
      {active && <Tick color={material.color} />}
    </button>
  );
}

function SlotRow({ item, entry, slot }: { item: Item; entry: CatalogEntry; slot: FinishSlot }) {
  const value = slotValue(entry.slots, item, slot.id);
  const own = hasOwnFinish(item, slot.id);
  const groups = slotSwatchGroups(slot.kind);
  const chosenKind = value && FURNITURE_MATERIALS[value]?.kind;
  // Open "More" by itself when the current finish is one of the other kinds.
  const [more, setMore] = useState(!!chosenKind && chosenKind !== slot.kind);
  const pick = (v: string | null) => setItemFinish(item.id, slot.id, v);
  const grid = (materials: FurnitureMaterial[]) => (
    <div className="grid grid-cols-8 gap-1">
      {materials.map((m) => (
        <MaterialSwatch key={m.id} material={m} slot={slot} active={m.id === value} onPick={() => pick(m.id)} />
      ))}
    </div>
  );
  return (
    <section aria-label={slot.label} data-testid="item-slot" data-slot={slot.id} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="shrink-0 text-xs font-medium text-ink-soft">{slot.label}</h4>
        <span className="truncate text-xs text-ink" data-testid="slot-current" data-slot={slot.id} data-value={value ?? ''}>
          {furnitureFinishName(value)}
        </span>
      </div>
      {grid(groups.primary.materials)}
      <div className="grid grid-cols-8 items-center gap-1">
        <ColorPick
          data-testid="slot-custom"
          data-slot={slot.id}
          label={`Custom colour for ${slot.label.toLowerCase()}`}
          value={value && isHexColor(value) ? value : undefined}
          active={!!value && isHexColor(value)}
          onPick={(hex) => pick(hex)}
        />
        <button
          type="button"
          data-testid="slot-more"
          data-slot={slot.id}
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="col-span-3 inline-flex h-full items-center gap-1 rounded-md px-1.5 text-xs text-ink-soft hover:bg-sunken hover:text-ink"
        >
          More
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', more && 'rotate-180')} />
        </button>
        <button
          type="button"
          data-testid="slot-default"
          data-slot={slot.id}
          disabled={!own}
          title={own ? `Back to ${furnitureFinishName(slot.default).toLowerCase()}` : 'Already the default finish'}
          onClick={() => pick(null)}
          className="col-span-4 inline-flex h-full items-center justify-end gap-1 rounded-md px-1.5 text-xs text-ink-soft hover:bg-sunken hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-3 w-3" />
          Default
        </button>
      </div>
      {more && (
        <div className="flex flex-col gap-1.5 rounded-md bg-sunken/60 p-1.5" data-testid="slot-more-panel" data-slot={slot.id}>
          {groups.more.map((g) => (
            <div key={g.kind}>
              <div className="mb-1 text-[11px] text-ink-faint">{g.label}</div>
              {grid(g.materials)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** "Bed" -> "beds", "Single bed" -> "single beds". */
function plural(name: string): string {
  const n = name.toLowerCase();
  return /(s|x|ch|sh)$/.test(n) ? `${n}es` : `${n}s`;
}

export function ItemFinishes({ level, item, entry }: { level: Level; item: Item; entry: CatalogEntry }) {
  if (!entry.slots?.length) return null;
  const total = sameEntryCount(level, item.id);
  const targets = sameEntryTargets(level, item.id).length;
  return (
    <div data-testid="item-finishes" className="flex flex-col gap-3 border-t border-line p-3">
      <h3 className="text-xs font-semibold text-ink">Finishes</h3>
      {entry.slots.map((slot) => (
        <SlotRow key={slot.id} item={item} entry={entry} slot={slot} />
      ))}
      {total > 1 && (
        <Button
          size="sm"
          icon={<CopyCheck className="h-4 w-4" />}
          data-testid="item-finish-apply-all"
          disabled={targets === 0}
          title={targets === 0 ? `Every ${entry.name.toLowerCase()} already looks like this` : 'Gives every one of them these finishes. One undo step.'}
          onClick={() => {
            const n = applyItemFinishesToAll(item.id);
            toast.success(n === 1 ? 'Finishes applied to 1 more' : `Finishes applied to ${n} more`);
          }}
        >
          Apply to all {plural(entry.name)} in this home
        </Button>
      )}
    </div>
  );
}
