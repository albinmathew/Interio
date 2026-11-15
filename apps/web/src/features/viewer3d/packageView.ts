/**
 * The furnishing package as the Design view shows it: the live checklist, what is left to
 * add, the plain-text checklist to copy, and framing a placed piece.
 */
import { lineKey, type PackageCheck, type PackageLine } from '@interio/catalog';
import { planStore, usePlanStore, type FurnishingPackage, type Id, type Level } from '@interio/core';
import { packageCheck, projectPackage, usePackageState } from '../../lib/furnish';
import { entryOrPlaceholder, useViewer } from './state';

export function useProjectPackage(): FurnishingPackage | null {
  const settings = usePlanStore((s) => s.project?.settings);
  return projectPackage(settings ? { settings } : null);
}

/** The package's checklist for the level as it stands, or null without a package. */
export function usePackageCheck(level: Level): PackageCheck | null {
  const pkg = useProjectPackage();
  return pkg ? packageCheck(level, pkg) : null;
}

/** A line is short and furnishing has not yet tried and failed to add it. */
export function isOpen(line: PackageLine, reasons: Record<string, string>): boolean {
  if (line.kind === 'spec' || !line.roomId) return false;
  if (line.status !== 'missing' && line.status !== 'partial') return false;
  return !reasons[lineKey(line.section, line.roomId, line.key)];
}

/** How many lines "Furnish home" could still add. */
export function usePackageGaps(level: Level): number {
  const check = usePackageCheck(level);
  const reasons = usePackageState((s) => s.reasons);
  return check ? check.lines.filter((l) => isOpen(l, reasons)).length : 0;
}

/** The reason a short line gives: from the last furnishing, or the checklist's own. */
export function reasonOf(line: PackageLine, reasons: Record<string, string>): string | undefined {
  return line.reason ?? reasons[lineKey(line.section, line.roomId, line.key)];
}

const mark = (line: PackageLine): string => {
  if (line.status === 'included') return '[✓]';
  if (line.status === 'placed') return '[✓]';
  if (line.status === 'partial') return '[~]';
  return '[ ]';
};

/** The checklist as plain text, laid out like the owner's list, with ticks. */
export function checklistText(check: PackageCheck, reasons: Record<string, string>): string {
  const out = [`${check.packageName}: ${check.placed} of ${check.needed} items placed`, ''];
  const groups = new Map<string, PackageLine[]>();
  for (const line of check.lines) {
    const key = `${line.section}:${line.roomId ?? '-'}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  for (const lines of groups.values()) {
    const first = lines[0]!;
    out.push(first.roomName && first.roomName.toLowerCase() !== first.title.toLowerCase() ? `${first.title} (${first.roomName})` : first.title);
    for (const line of lines) {
      const count = line.kind === 'item' && line.need > 1 ? ` (${Math.min(line.have, line.need)} of ${line.need})` : '';
      const note = line.status === 'included' ? ` — included${line.note ? `, ${line.note}` : ''}` : line.note ? ` — ${line.note}` : '';
      const why = line.status === 'placed' || line.status === 'included' ? '' : reasonOf(line, reasons) ? ` — not placed: ${reasonOf(line, reasons)}` : ' — missing';
      out.push(`  ${mark(line)} ${line.label}${count}${note}${why}`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}

/** Selects a placed item and closes the camera in on it. */
export function showItem(level: Level, itemId: Id): void {
  const item = level.items[itemId];
  if (!item) return;
  planStore.getState().select({ kind: 'item', id: itemId });
  const e = entryOrPlaceholder(item.catalogId);
  const r = Math.max(e.dims.w, e.dims.d) / 2000 + 0.6;
  const x = item.x / 1000;
  const z = -item.y / 1000;
  const y0 = (item.z ?? 0) / 1000;
  useViewer.getState().focusOn({ min: [x - r, 0, z - r], max: [x + r, Math.max(y0 + e.dims.h / 1000, 1.2), z + r] });
}
