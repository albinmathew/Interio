/**
 * Photo mode's controls on the walk view: the "Photo" toggle, placed in the view-options
 * toolbar beside the screenshot button, and a small progress pill while the tracer works.
 */
import { Aperture } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton, cn } from '../../../ui';
import { progressText } from './progress';
import { photoUi, usePhotoUi } from './store';

/** The walk view's toolbar (the panel holding the screenshot button), found once it is on the page. */
function useToolbar(): { toolbar: HTMLElement | null; view: HTMLElement | null } {
  const [found, setFound] = useState<{ toolbar: HTMLElement | null; view: HTMLElement | null }>({ toolbar: null, view: null });
  useLayoutEffect(() => {
    const shot = document.querySelector<HTMLElement>('[data-testid="walkthrough"] [data-testid="walk-screenshot"]');
    setFound({ toolbar: shot?.parentElement ?? null, view: document.querySelector<HTMLElement>('[data-testid="walkthrough"]') });
  }, []);
  return found;
}

export function PhotoHud() {
  const { enabled, available, reason, status, samples } = usePhotoUi();
  const { toolbar, view } = useToolbar();
  if (available === null || !toolbar || !view) return null;

  const button = (
    <IconButton
      label={available ? (enabled ? 'Photo mode is on: stand still for a photoreal view' : 'Photo: stand still for a photoreal view') : reason || 'Photo mode is not available here'}
      active={enabled && !!available}
      disabled={!available}
      onClick={() => photoUi.setEnabled(!enabled)}
      data-testid="walk-photo"
      data-status={status}
    >
      <Aperture className="h-4 w-4" />
    </IconButton>
  );

  const text = available && enabled ? progressText(status, samples) : null;
  const pill = (
    <div className={cn('pointer-events-none absolute inset-x-0 top-14 flex justify-center px-14 max-sm:top-[6.5rem]', !text && 'hidden')} aria-live="polite">
      {text && (
        <div
          className="flex h-7 items-center gap-2 rounded-full bg-ink/75 px-3 text-xs text-white shadow-[var(--shadow-panel)] backdrop-blur-sm"
          data-testid="walk-photo-progress"
          data-status={status}
          data-samples={samples}
        >
          <Aperture className={cn('h-3.5 w-3.5 shrink-0', status === 'refining' || status === 'preparing' ? 'animate-spin [animation-duration:3s]' : '')} />
          <span className="font-medium whitespace-nowrap">{text.label}</span>
          {text.detail && <span className="whitespace-nowrap tabular-nums text-white/70">{text.detail}</span>}
          {status === 'refining' && (
            <span className="h-1 w-12 overflow-hidden rounded-full bg-white/20" aria-hidden>
              <span className="block h-full rounded-full bg-white/80 transition-[width] duration-300" style={{ width: `${Math.round(text.fraction * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {createPortal(button, toolbar)}
      {createPortal(pill, view)}
    </>
  );
}
