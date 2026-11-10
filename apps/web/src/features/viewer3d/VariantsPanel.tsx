/**
 * Variants: saved looks of the home (furniture, room names, types and finishes,
 * lighting) to come back to and compare. The walls are shared by every variant.
 */
import { planStore, usePlanStore, type Level, type Variant } from '@interio/core';
import { BookmarkPlus, ImageOff, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { timeAgo } from '../../lib/format';
import { Badge, Button, Dialog, IconButton, PanelHeader, TextInput, cn, toast } from '../../ui';
import { takeThumbnail } from './capture';
import { markFirstLayoutDone } from './firstLayout';
import { useViewer } from './state';
import { currentVariantIds, defaultVariantName, newestFirst, variantItemCount } from './variants';

const NO_VARIANTS: Variant[] = [];
const NO_SETTINGS: Record<string, unknown> = {};

const items = (n: number): string => (n === 1 ? '1 item' : `${n} items`);
const plain = (text: string): string => text.replace(/[\s.!?…]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sameText = (a: string, b: string): boolean => plain(a) === plain(b);

/** Saves the home as it looks now, with a preview of the current view. Returns the variant's id. */
function saveLook(name: string): string | null {
  const state = planStore.getState();
  const id = state.saveVariant({ name, thumbnail: takeThumbnail() });
  if (id && state.project) markFirstLayoutDone(state.project.id);
  return id;
}

function applyLook(variant: Variant): void {
  planStore.getState().applyVariant(variant.id);
  toast.success(`Switched to “${variant.name}”. Undo brings the previous look back.`);
}

function Thumbnail({ variant }: { variant: Variant }) {
  return (
    <div className="h-[66px] w-[104px] shrink-0 overflow-hidden rounded-md border border-line bg-sunken">
      {variant.thumbnail ? (
        <img src={variant.thumbnail} alt="" draggable={false} className="h-full w-full object-cover" data-testid="variant-thumbnail" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-faint" title="No preview">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

interface CardProps {
  variant: Variant;
  current: boolean;
  onApply: (variant: Variant) => void;
  onDelete: (variant: Variant) => void;
}

function VariantCard({ variant, current, onApply, onDelete }: CardProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(variant.name);
  const count = variantItemCount(variant);
  // The request that produced the look, unless the name already says it.
  const note = variant.note && sameText(variant.note, variant.name) ? undefined : variant.note;

  // Leaving the field keeps the new name; Escape does not (the field loses focus on its way out either way).
  const abandoned = useRef(false);
  const commit = () => {
    setRenaming(false);
    const next = name.trim();
    if (!abandoned.current && next && next !== variant.name) planStore.getState().renameVariant(variant.id, next);
  };

  return (
    <li
      className={cn('rounded-lg border p-2 transition-colors', current ? 'border-accent bg-accent-soft/40' : 'border-line')}
      data-testid="variant-card"
      data-variant-id={variant.id}
      data-current={current}
      aria-current={current ? 'true' : undefined}
    >
      <div className="flex gap-2.5">
        <Thumbnail variant={variant} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {renaming ? (
            <TextInput
              aria-label={`New name for ${variant.name}`}
              className="h-7 text-[13px]"
              value={name}
              maxLength={60}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') {
                  e.stopPropagation();
                  abandoned.current = true;
                  setRenaming(false);
                }
              }}
              data-testid="variant-rename-input"
            />
          ) : (
            <h3 className="line-clamp-2 py-0.5 text-[13px] leading-snug font-semibold break-words text-ink" title={variant.name} data-testid="variant-name">
              {variant.name}
            </h3>
          )}
          <p className="truncate text-xs text-ink-faint" data-testid="variant-meta">
            <span title={new Date(variant.createdAt).toLocaleString()}>{timeAgo(variant.createdAt)}</span> · <span data-testid="variant-items">{items(count)}</span>
          </p>
        </div>
      </div>
      {note && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-ink-soft" title={note} data-testid="variant-note">
          “{note}”
        </p>
      )}
      <div className="mt-2 flex items-center gap-0.5">
        <div className="mr-auto flex h-8 items-center">
          {current ? (
            <span data-testid="variant-current" title="The home looks like this now">
              <Badge tone="accent">Current</Badge>
            </span>
          ) : (
            <Button size="sm" variant="primary" title="Makes the home look like this again. One undo step." data-testid="variant-apply" onClick={() => onApply(variant)}>
              Apply
            </Button>
          )}
        </div>
        <IconButton
          label={`Rename ${variant.name}`}
          size="sm"
          data-testid="variant-rename"
          onClick={() => {
            abandoned.current = false;
            setName(variant.name);
            setRenaming(true);
          }}
        >
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={`Update ${variant.name} with the current look`}
          size="sm"
          disabled={current}
          data-testid="variant-update"
          onClick={() => {
            planStore.getState().updateVariant(variant.id, { thumbnail: takeThumbnail() });
            toast.success(`Updated “${variant.name}” with the current look`);
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Delete ${variant.name}`} size="sm" data-testid="variant-delete" onClick={() => onDelete(variant)}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  );
}

export function VariantsPanel({ level }: { level: Level }) {
  const variants = usePlanStore((s) => s.project?.variants) ?? NO_VARIANTS;
  const settings = usePlanStore((s) => s.project?.settings) ?? NO_SETTINGS;
  const current = useMemo(() => currentVariantIds(variants, level, settings), [variants, level, settings]);
  const ordered = useMemo(() => newestFirst(variants), [variants]);
  const suggested = useMemo(() => defaultVariantName(variants), [variants]);
  // Null until the user types: the field follows the suggested name.
  const [typed, setTyped] = useState<string | null>(null);
  const [switching, setSwitching] = useState<{ id: string; saveAs: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const nameId = useId();
  const saveAsId = useId();
  const name = typed ?? suggested;
  const saved = ordered.find((v) => current.has(v.id));
  const target = switching ? variants.find((v) => v.id === switching.id) : undefined;
  const doomed = deleting ? variants.find((v) => v.id === deleting) : undefined;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const chosen = name.trim() || suggested;
    if (saveLook(chosen)) toast.success(`Saved “${chosen}”`);
    setTyped(null);
  };

  const apply = (variant: Variant) => {
    // The look on screen would be lost: offer to keep it first.
    if (current.size === 0) setSwitching({ id: variant.id, saveAs: suggested });
    else applyLook(variant);
  };

  return (
    <div className="flex min-h-0 flex-col" data-testid="variants-panel">
      <PanelHeader
        title={
          <>
            Variants{' '}
            <span className="ml-1 font-normal text-ink-faint" data-testid="variants-total">
              {variants.length}
            </span>
          </>
        }
        actions={
          <IconButton label="Close variants" size="sm" data-testid="variants-close" onClick={() => useViewer.getState().setDock(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        }
      />
      <form className="flex flex-col gap-2 border-b border-line p-3" onSubmit={save}>
        <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
          Save the home as it looks now
        </label>
        <div className="flex gap-2">
          <TextInput
            id={nameId}
            value={name}
            maxLength={60}
            placeholder={suggested}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTyped(e.currentTarget.value)}
            data-testid="variant-name-input"
          />
          <Button type="submit" variant="primary" size="sm" className="shrink-0" icon={<BookmarkPlus className="h-4 w-4" />} data-testid="variant-save">
            Save current look
          </Button>
        </div>
        <p className="truncate text-xs text-ink-faint" data-testid="variants-hint" data-saved={saved ? 'true' : 'false'}>
          {saved ? `This look is saved as “${saved.name}”.` : 'Keeps furniture, room looks and lighting.'}
        </p>
      </form>
      {ordered.length === 0 ? (
        <p className="p-3 text-[13px] leading-relaxed text-ink-soft" data-testid="variants-empty">
          No variants yet. Save a look before you try something new, then switch between the looks to compare them.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3" data-testid="variants-list" aria-label="Saved variants">
          {ordered.map((variant) => (
            <VariantCard key={variant.id} variant={variant} current={current.has(variant.id)} onApply={apply} onDelete={(v) => setDeleting(v.id)} />
          ))}
        </ul>
      )}

      {switching && target && (
        <Dialog
          title="Save the current look first?"
          onClose={() => setSwitching(null)}
          footer={
            <>
              <Button size="sm" variant="ghost" onClick={() => setSwitching(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                data-testid="switch-without-saving"
                onClick={() => {
                  setSwitching(null);
                  applyLook(target);
                }}
              >
                Switch without saving
              </Button>
              <Button
                size="sm"
                variant="primary"
                data-autofocus
                data-testid="save-and-switch"
                onClick={() => {
                  const chosen = switching.saveAs.trim() || suggested;
                  setSwitching(null);
                  setTyped(null);
                  saveLook(chosen);
                  applyLook(target);
                }}
              >
                Save and switch
              </Button>
            </>
          }
        >
          <p>
            The home as it looks now is not saved as a variant. Switching to <span className="font-medium text-ink">“{target.name}”</span> replaces its furniture, room looks and
            lighting.
          </p>
          <label htmlFor={saveAsId} className="mt-3 mb-1 block text-xs font-medium text-ink-soft">
            Save the current look as
          </label>
          <TextInput
            id={saveAsId}
            value={switching.saveAs}
            maxLength={60}
            placeholder={suggested}
            onChange={(e) => setSwitching({ ...switching, saveAs: e.currentTarget.value })}
            data-testid="switch-save-name"
          />
        </Dialog>
      )}

      {doomed && (
        <Dialog
          title="Delete variant"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button size="sm" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                data-autofocus
                data-testid="variant-delete-confirm"
                onClick={() => {
                  setDeleting(null);
                  planStore.getState().deleteVariant(doomed.id);
                  toast.success(`Deleted “${doomed.name}”`);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          Delete <span className="font-medium text-ink">“{doomed.name}”</span>? The home stays as it looks now, but this saved look cannot be brought back.
        </Dialog>
      )}
    </div>
  );
}
