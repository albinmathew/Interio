/**
 * Package: the furnishing package's checklist, room by room, with the owner's lines as
 * written. Each line shows a tick, a partial count, or a warning with its reason;
 * specification lines (brands, fittings) are marked as included. Missing lines can be
 * added one by one or for a whole room; clicking a placed line shows its piece.
 */
import { PACKAGES, lineKey, type PackageCheck, type PackageLine } from '@interio/catalog';
import { type Level } from '@interio/core';
import { AlertTriangle, Check, CircleDashed, ClipboardCopy, Info, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';
import { NO_PACKAGE, addPackageLines, setProjectPackage, usePackageState } from '../../lib/furnish';
import { Button, IconButton, PanelHeader, Select, cn, toast } from '../../ui';
import { checklistText, isOpen, reasonOf, showItem, usePackageCheck, useProjectPackage } from './packageView';
import { useViewer } from './state';

const LINK = 'text-xs font-medium text-accent hover:text-accent-strong hover:underline disabled:opacity-50';

function StatusIcon({ line, open }: { line: PackageLine; open: boolean }) {
  if (line.status === 'placed') return <Check className="h-3.5 w-3.5 text-accent" aria-label="Placed" />;
  if (line.status === 'included') return <Info className="h-3.5 w-3.5 text-ink-faint" aria-label="Included" />;
  if (line.status === 'partial') return <CircleDashed className="h-3.5 w-3.5 text-warn" aria-label="Partly placed" />;
  return open ? <CircleDashed className="h-3.5 w-3.5 text-ink-faint" aria-label="Missing" /> : <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-label="Not placed" />;
}

function addLines(lines: PackageLine[], what: string): void {
  const targets = lines.filter((l) => l.roomId).map((l) => ({ roomId: l.roomId!, key: l.key }));
  const res = addPackageLines(targets);
  if (!res) return;
  const done = res.report.lines.filter((l) => targets.some((t) => t.roomId === l.roomId && t.key === l.key));
  const met = done.filter((l) => l.status === 'placed').length;
  if (res.items.length === 0 && met < targets.length) {
    const why = done.find((l) => l.reason)?.reason;
    toast.info(`Could not add ${what}${why ? `: ${why}` : ''}`);
  } else if (met === targets.length) toast.success(res.items.length === 1 ? `Added ${what}` : `Added ${what} (${res.items.length} pieces)`);
  else toast.info(`Added ${res.items.length === 1 ? '1 piece' : `${res.items.length} pieces`}; ${targets.length - met} still short`);
}

function LineRow({ level, line, reasons }: { level: Level; line: PackageLine; reasons: Record<string, string> }) {
  const open = isOpen(line, reasons);
  const reason = line.status === 'placed' || line.status === 'included' ? undefined : reasonOf(line, reasons);
  const short = line.kind !== 'spec' && line.roomId && (line.status === 'missing' || line.status === 'partial' || line.status === 'noSpace');
  const canShow = line.itemIds.length > 0;
  const count = line.kind === 'item' && line.need > 1 ? `${Math.min(line.have, line.need)}/${line.need}` : null;
  const action = short && line.need > 0 ? (open || line.status === 'partial' ? 'Add' : 'Retry') : null;
  return (
    <li
      className="group flex items-start gap-2 px-3 py-1.5"
      data-testid="package-line"
      data-key={line.key}
      data-room={line.roomId ?? ''}
      data-status={line.status}
      data-open={open ? 'true' : 'false'}
    >
      <span className="mt-0.5 shrink-0">
        <StatusIcon line={line} open={open} />
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!canShow}
          onClick={() => canShow && showItem(level, line.itemIds[0]!)}
          title={canShow ? 'Show it in the view' : undefined}
          data-testid="package-line-label"
          className={cn('block text-left text-[13px] leading-snug', line.status === 'included' ? 'text-ink-soft' : 'text-ink', canShow && 'hover:text-accent-strong hover:underline')}
        >
          {line.label}
          {count && <span className={cn('ml-1 text-xs tabular-nums', line.status === 'placed' ? 'text-ink-faint' : 'text-warn')}>{count}</span>}
        </button>
        {(line.status === 'included' || line.note || reason) && (
          <p className={cn('text-xs leading-snug', reason ? 'text-warn' : 'text-ink-faint')} data-testid={reason ? 'package-line-reason' : undefined}>
            {reason ?? (line.status === 'included' ? `Included spec${line.note ? ` · ${line.note}` : ''}` : line.note)}
          </p>
        )}
      </div>
      {action && (
        <button type="button" className={cn(LINK, 'mt-0.5 inline-flex shrink-0 items-center gap-0.5')} data-testid="package-line-add" onClick={() => addLines([line], line.label.toLowerCase())}>
          {action === 'Add' ? <Plus className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
          {action}
        </button>
      )}
    </li>
  );
}

interface Group {
  key: string;
  title: string;
  roomName?: string;
  roomId?: string;
  lines: PackageLine[];
}

function groups(check: PackageCheck): Group[] {
  const out = new Map<string, Group>();
  for (const line of check.lines) {
    const key = `${line.section}:${line.roomId ?? '-'}`;
    const g = out.get(key) ?? { key, title: line.title, roomName: line.roomName, roomId: line.roomId, lines: [] };
    g.lines.push(line);
    out.set(key, g);
  }
  return [...out.values()];
}

function RoomGroup({ level, group, reasons }: { level: Level; group: Group; reasons: Record<string, string> }) {
  const short = group.lines.filter((l) => l.kind !== 'spec' && l.roomId && l.need > 0 && l.status !== 'placed' && l.status !== 'included');
  const sectionReason = !group.roomId ? group.lines[0]?.reason : undefined;
  const items = group.lines.filter((l) => l.kind === 'item');
  const met = items.filter((l) => l.status === 'placed').length;
  return (
    <section className="border-b border-line last:border-b-0" data-testid="package-room" data-room={group.roomId ?? ''} data-title={group.title}>
      <div className="flex items-center gap-2 bg-sunken/60 px-3 py-1.5">
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-ink uppercase">
          {group.title}
          {group.roomName && group.roomName.toLowerCase() !== group.title.toLowerCase() && <span className="ml-1 font-normal tracking-normal text-ink-soft normal-case">· {group.roomName}</span>}
        </h3>
        {group.roomId && (
          <span className="shrink-0 text-xs text-ink-faint tabular-nums" data-testid="package-room-count">
            {met}/{items.length}
          </span>
        )}
      </div>
      {sectionReason ? (
        <p className="flex items-start gap-1.5 px-3 py-2 text-xs text-warn" data-testid="package-room-reason">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {sectionReason}
        </p>
      ) : (
        <>
          <ul className="py-0.5">
            {group.lines.map((line) => (
              <LineRow key={lineKey(line.section, line.roomId, line.key)} level={level} line={line} reasons={reasons} />
            ))}
          </ul>
          {short.length > 1 && (
            <div className="px-3 pb-2">
              <button type="button" className={LINK} data-testid="package-room-apply" onClick={() => addLines(short, `the missing lines of the ${group.title.toLowerCase()}`)}>
                Apply missing for this room
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PackagePanel({ level }: { level: Level }) {
  const pkg = useProjectPackage();
  const check = usePackageCheck(level);
  const reasons = usePackageState((s) => s.reasons);
  const list = useMemo(() => (check ? groups(check) : []), [check]);

  const copy = async () => {
    if (!check) return;
    try {
      await navigator.clipboard.writeText(checklistText(check, reasons));
      toast.success('Checklist copied');
    } catch {
      toast.error('Could not copy the checklist');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="package-panel">
      <PanelHeader
        title="Furnishing package"
        actions={
          <IconButton label="Close package" size="sm" data-testid="package-close" onClick={() => useViewer.getState().setDock(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        }
      />
      <div className="flex flex-col gap-1.5 border-b border-line p-3">
        <Select aria-label="Furnishing package" data-testid="package-select" value={pkg?.id ?? NO_PACKAGE} onChange={(e) => setProjectPackage(e.currentTarget.value)}>
          {PACKAGES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NO_PACKAGE}>No package</option>
        </Select>
        {check ? (
          <p className="text-xs text-ink-soft" data-testid="package-summary" data-placed={check.placed} data-needed={check.needed}>
            <span className="font-semibold text-ink tabular-nums">
              {check.placed} of {check.needed}
            </span>{' '}
            items placed
          </p>
        ) : (
          <p className="text-xs text-ink-soft" data-testid="package-summary">
            Furnish home lays out each room and styles it, with no minimum list.
          </p>
        )}
      </div>
      {check && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="package-list">
            {list.map((g) => (
              <RoomGroup key={g.key} level={level} group={g} reasons={reasons} />
            ))}
          </div>
          <div className="flex items-center justify-end border-t border-line p-2">
            <Button size="sm" variant="ghost" className="whitespace-nowrap" icon={<ClipboardCopy className="h-4 w-4" />} data-testid="package-copy" onClick={() => void copy()}>
              Copy checklist
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
