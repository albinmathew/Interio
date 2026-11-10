/** Tool palette (left) and the contextual hint bar (top). */
import { DEFAULTS, type WallKind } from '@interio/core';
import { Hand, MousePointer2, Ruler, RulerDimensionLine, Scissors } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { IconButton, Panel, Segmented } from '../../../ui';
import { useController } from '../context';
import { editorStore, useEditor } from '../state';
import { toolDef, TOOLS, type ToolId } from '../tools';
import { CommitNumber } from '../panel/fields';

/** Plan-symbol icons in the lucide style (24 box, 2 px round strokes). */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 className="h-[18px] w-[18px]" />,
  hand: <Hand className="h-[18px] w-[18px]" />,
  wall: (
    <Glyph>
      <path d="M3 8h18v8H3z" />
      <path d="M8 16l4-8M14 16l4-8" strokeWidth={1.5} />
    </Glyph>
  ),
  door: (
    <Glyph>
      <path d="M2 20h4M19 20h3" />
      <path d="M6 20V7" />
      <path d="M6 7a13 13 0 0 1 13 13" strokeWidth={1.5} strokeDasharray="2.5 2.5" />
    </Glyph>
  ),
  sliding: (
    <Glyph>
      <path d="M2 12h3M19 12h3" />
      <path d="M5 10h8M11 14h8" />
      <path d="M16 7l2 0M18 7l-1.5-1.5M18 7l-1.5 1.5" strokeWidth={1.5} />
    </Glyph>
  ),
  window: (
    <Glyph>
      <path d="M2 12h3M19 12h3" />
      <path d="M5 9h14v6H5z" />
      <path d="M5 12h14" strokeWidth={1.5} />
    </Glyph>
  ),
  passage: (
    <Glyph>
      <path d="M2 12h5M17 12h5" />
      <path d="M7 9v6M17 9v6" />
      <path d="M9.5 12h5" strokeWidth={1.5} strokeDasharray="1 3" />
    </Glyph>
  ),
  split: <Scissors className="h-[18px] w-[18px]" />,
  measure: <Ruler className="h-[18px] w-[18px]" />,
  scale: <RulerDimensionLine className="h-[18px] w-[18px]" />,
};

export function Toolbar() {
  const controller = useController();
  const tool = useEditor((s) => s.tool);
  return (
    <Panel className="pointer-events-auto flex flex-col gap-0.5 p-1">
      {TOOLS.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && TOOLS[i - 1]!.group !== t.group && <div className="mx-1 my-0.5 h-px bg-line" />}
          <IconButton
            label={`${t.label} (${t.key.toUpperCase()})`}
            active={tool === t.id}
            data-testid={`tool-${t.id}`}
            onClick={(e) => {
              controller.setTool(t.id);
              e.currentTarget.blur(); // keep Space and letter keys for the canvas
            }}
          >
            {ICONS[t.id]}
          </IconButton>
        </Fragment>
      ))}
    </Panel>
  );
}

const WALL_KINDS: { value: WallKind; label: string; title: string }[] = [
  { value: 'wall', label: 'Wall', title: 'Full-height wall' },
  { value: 'low', label: 'Low', title: 'Low wall or parapet' },
  { value: 'railing', label: 'Railing', title: 'Balcony railing' },
];

const kindThickness = (kind: WallKind): number =>
  kind === 'railing' ? DEFAULTS.railingThickness : kind === 'low' ? DEFAULTS.partitionThickness : DEFAULTS.wallThickness;

/** What the active tool does, plus its options. */
export function HintBar() {
  const tool = useEditor((s) => s.tool);
  const wallKind = useEditor((s) => s.wallKind);
  const wallThickness = useEditor((s) => s.wallThickness);
  if (tool === 'select') return null;
  const def = toolDef(tool);
  return (
    <Panel className="pointer-events-auto flex max-w-full items-center gap-3 px-3 py-1.5">
      <span className="shrink-0 text-[13px] font-semibold text-ink">{def.label}</span>
      {tool === 'wall' && (
        <>
          <Segmented<WallKind>
            size="sm"
            value={wallKind}
            onChange={(kind) => editorStore.setState({ wallKind: kind, wallThickness: kindThickness(kind) })}
            options={WALL_KINDS}
          />
          <div className="w-[104px] shrink-0">
            <CommitNumber ariaLabel="New wall thickness" value={wallThickness} min={20} max={1000} step={10} unit="mm" onCommit={(v) => editorStore.setState({ wallThickness: v })} />
          </div>
        </>
      )}
      <span className="min-w-0 truncate text-xs text-ink-soft" data-testid="tool-hint" title={def.hint}>
        {def.hint}
      </span>
    </Panel>
  );
}
