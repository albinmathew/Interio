/**
 * The right-hand dock of the Design view: the buttons that open the assistant and the
 * variants, and the panel they open. One panel at a time, beside the catalog and the
 * selected item or room, never over them.
 */
import { usePlanStore, type Level } from '@interio/core';
import { ClipboardList, GalleryVerticalEnd, MessageSquareText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel, Spinner, cn } from '../../ui';
import { AssistantPanel } from './AssistantPanel';
import { useAssistant } from './assistantStore';
import { PackagePanel } from './PackagePanel';
import { usePackageCheck } from './packageView';
import { DOCK_WIDTH, useViewer, type Dock } from './state';
import { VariantsPanel } from './VariantsPanel';

/** Top edge of the dock and of the item / room panel: below the row of toolbars. */
export const DOCK_TOP = 60;

function DockButton({ dock, label, title, icon, children, testId }: { dock: Dock; label: string; title: string; icon: ReactNode; children?: ReactNode; testId: string }) {
  const open = useViewer((s) => s.dock === dock);
  return (
    <button
      type="button"
      aria-pressed={open}
      title={`${label}: ${title}`}
      data-testid={testId}
      onClick={() => useViewer.getState().toggleDock(dock)}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors select-none',
        open ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft hover:bg-sunken hover:text-ink',
      )}
    >
      {icon}
      {/* On a narrow window the label gives way to the toolbar beside it; the name stays for screen readers and the tooltip. */}
      <span className="max-[1140px]:sr-only">{label}</span>
      {children}
    </button>
  );
}

/** "Package 52/54": the furnishing package's checklist, with how much of it is placed. */
function PackageButton({ level }: { level: Level }) {
  const check = usePackageCheck(level);
  const complete = check !== null && check.placed >= check.needed;
  return (
    <DockButton dock="package" label="Package" title="the furnishing package's checklist" testId="open-package" icon={<ClipboardList className="h-4 w-4" />}>
      {check && (
        <span
          className={cn('inline-flex h-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums', complete ? 'bg-accent text-white' : 'bg-sunken text-ink-soft')}
          data-testid="package-count"
          data-placed={check.placed}
          data-needed={check.needed}
          aria-label={`${check.placed} of ${check.needed} items placed`}
        >
          {check.placed}/{check.needed}
        </span>
      )}
    </DockButton>
  );
}

/** "Package", "Assistant" and "Variants 3" at the top right, above the panel they open. */
export function DockButtons({ level }: { level: Level }) {
  const variants = usePlanStore((s) => s.project?.variants.length ?? 0);
  const projectId = usePlanStore((s) => s.project?.id);
  const waiting = useAssistant((s) => s.pending !== null && s.pending.projectId === projectId);
  return (
    <div className="absolute top-3 right-3" data-testid="dock-buttons">
      <Panel className="flex items-center gap-1 p-1">
        <PackageButton level={level} />
        <DockButton
          dock="assistant"
          label="Assistant"
          title="ask for a change in plain words"
          testId="open-assistant"
          icon={waiting ? <Spinner className="text-current" /> : <MessageSquareText className="h-4 w-4" />}
        />
        <DockButton dock="variants" label="Variants" title="saved looks of this home" testId="open-variants" icon={<GalleryVerticalEnd className="h-4 w-4" />}>
          <span
            className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums', variants > 0 ? 'bg-accent text-white' : 'bg-sunken text-ink-faint')}
            data-testid="variant-count"
            data-count={variants}
            aria-label={variants === 1 ? '1 saved' : `${variants} saved`}
          >
            {variants}
          </span>
        </DockButton>
      </Panel>
    </div>
  );
}

/** The open panel. The assistant keeps its full height so answers never move the input; the variants take what they need. */
export function DockPanel({ level }: { level: Level }) {
  const dock = useViewer((s) => s.dock);
  if (!dock) return null;
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col" style={{ top: DOCK_TOP, width: DOCK_WIDTH }} data-testid="design-dock" data-dock={dock}>
      <Panel className={cn('pointer-events-auto flex min-h-0 flex-col overflow-hidden', dock !== 'variants' && 'flex-1')}>
        {dock === 'assistant' ? <AssistantPanel level={level} /> : dock === 'package' ? <PackagePanel level={level} /> : <VariantsPanel level={level} />}
      </Panel>
    </div>
  );
}
