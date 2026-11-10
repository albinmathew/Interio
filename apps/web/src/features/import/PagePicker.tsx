/**
 * Page picker for PDFs with more than one page: a strip of thumbnails above the
 * preview. Picking a page reads that page from scratch.
 */
import { renderPdfPage } from '@interio/importer';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, NumberInput, Spinner, cn } from '../../ui';

/** Drawing sets can run to hundreds of sheets: thumbnails stop here and a page number takes over. */
export const MAX_THUMBS = 24;
const THUMB_PX = 220;

/** Renders a thumbnail per page, one after another. Returns page number -> object URL as they arrive. */
export function usePageThumbs(data: ArrayBuffer | null, pageCount: number): Record<number, string> {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  useEffect(() => {
    setThumbs({});
    if (!data || pageCount < 2) return;
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      for (let n = 1; n <= Math.min(pageCount, MAX_THUMBS) && alive; n++) {
        try {
          const blob = await renderPdfPage(data, THUMB_PX, n);
          if (!alive) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setThumbs((t) => ({ ...t, [n]: url }));
        } catch {
          // The numbered placeholder stays; the page can still be picked.
        }
      }
    })();
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [data, pageCount]);
  return thumbs;
}

export interface PagePickerProps {
  pageCount: number;
  /** 1-based page being reviewed. */
  page: number;
  thumbs: Record<number, string>;
  disabled?: boolean;
  onPick: (page: number) => void;
}

export function PagePicker({ pageCount, page, thumbs, disabled, onPick }: PagePickerProps) {
  const shown = Math.min(pageCount, MAX_THUMBS);
  const [jump, setJump] = useState(page);
  useEffect(() => setJump(page), [page]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.round(jump);
    if (n >= 1 && n <= pageCount) onPick(n);
  };
  return (
    <div className="border-b border-line bg-surface px-3 py-2" data-testid="page-picker" data-page={page} data-page-count={pageCount}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-ink-soft">
        <span>
          This PDF has {pageCount} pages. Pick the one with the floor plan: <span className="font-medium text-ink">page {page}</span> is shown.
        </span>
        {pageCount > MAX_THUMBS && (
          <form onSubmit={submit} className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="import-page-number">Go to page</label>
            <span className="w-16">
              <NumberInput id="import-page-number" value={jump} onChange={setJump} min={1} max={pageCount} step={1} disabled={disabled} className="h-7" />
            </span>
            <Button type="submit" size="sm" disabled={disabled}>
              Go
            </Button>
          </form>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Pages of this PDF">
        {Array.from({ length: shown }, (_, i) => i + 1).map((n) => {
          const active = n === page;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              aria-label={`Page ${n}`}
              title={active ? `Page ${n} (shown)` : `Read page ${n}`}
              disabled={disabled}
              onClick={() => onPick(n)}
              data-testid="page-thumb"
              data-page={n}
              data-ready={thumbs[n] ? 'true' : 'false'}
              className={cn(
                'relative flex h-[72px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white transition-shadow disabled:opacity-60',
                active ? 'border-accent ring-2 ring-accent' : 'border-line hover:shadow-[var(--shadow-panel)]',
              )}
            >
              {thumbs[n] ? <img src={thumbs[n]} alt="" className="h-full w-full object-contain" draggable={false} /> : <Spinner />}
              <span className={cn('absolute right-1 bottom-1 rounded px-1 text-[11px] font-medium', active ? 'bg-accent text-white' : 'bg-ink/70 text-white')}>{n}</span>
            </button>
          );
        })}
        {pageCount > shown && <span className="flex shrink-0 items-center px-2 text-xs text-ink-faint">+ {pageCount - shown} more</span>}
      </div>
    </div>
  );
}
