/** Bottom-left bar: scale bar, zoom, and underlay visibility and opacity. */
import { Eye, EyeOff, Maximize, Minus, Plus } from 'lucide-react';
import { IconButton, Panel } from '../../../ui';
import { useController } from '../context';
import { NOMINAL_SCALE, scaleBar } from '../logic/view';
import { editorStore, useEditor } from '../state';

function ScaleBar() {
  const scale = useEditor((s) => s.view.scale);
  const bar = scaleBar(scale);
  return (
    <div className="flex flex-col items-start gap-0.5 pb-1.5 pl-1" data-testid="scale-bar" data-mm={bar.mm}>
      <span className="text-[11px] font-medium text-ink-soft tabular-nums">{bar.label}</span>
      <span className="block h-1.5 border-x border-b border-ink-soft" style={{ width: bar.px }} />
    </div>
  );
}

export function ViewControls({ hasUnderlay }: { hasUnderlay: boolean }) {
  const controller = useController();
  const scale = useEditor((s) => s.view.scale);
  const visible = useEditor((s) => s.underlayVisible);
  const opacity = useEditor((s) => s.underlayOpacity);
  return (
    <div className="flex items-end gap-2">
      <Panel className="pointer-events-auto flex items-center gap-0.5 p-1">
        <IconButton label="Zoom out (-)" size="sm" onClick={() => controller.zoomBy(0.8)}>
          <Minus className="h-4 w-4" />
        </IconButton>
        <span className="w-12 text-center text-xs font-medium text-ink-soft tabular-nums" data-testid="zoom-level">
          {Math.round((scale / NOMINAL_SCALE) * 100)}%
        </span>
        <IconButton label="Zoom in (+)" size="sm" onClick={() => controller.zoomBy(1.25)}>
          <Plus className="h-4 w-4" />
        </IconButton>
        <IconButton label="Fit plan to view (0)" size="sm" onClick={() => controller.fit()}>
          <Maximize className="h-4 w-4" />
        </IconButton>
      </Panel>
      {hasUnderlay && (
        <Panel className="pointer-events-auto flex items-center gap-1.5 p-1 pr-3">
          <IconButton label={visible ? 'Hide source drawing' : 'Show source drawing'} size="sm" active={visible} onClick={() => editorStore.setState({ underlayVisible: !visible })}>
            {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </IconButton>
          <span className="text-xs text-ink-soft">Drawing</span>
          <input
            type="range"
            aria-label="Source drawing opacity"
            className="h-1 w-24 accent-accent"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            disabled={!visible}
            onChange={(e) => editorStore.setState({ underlayOpacity: e.currentTarget.valueAsNumber })}
          />
        </Panel>
      )}
      <ScaleBar />
    </div>
  );
}
