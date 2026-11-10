/**
 * The Design toolbar: camera mode, whole-home furnishing, lighting preset and picture export.
 */
import { planStore, selectLevel, type Level } from '@interio/core';
import { LIGHTING_LABELS, LIGHTING_PRESETS, LIGHTING_SETTING, type LightingPreset } from '@interio/scene3d';
import { Box, Camera, Eraser, Layers, Maximize, Moon, ScanLine, Sparkles, Sun, Sunset } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { clearFurniture, furnishHome } from '../../lib/furnish';
import { Button, Dialog, IconButton, Panel, Segmented, toast } from '../../ui';
import { captureBridge, captureFileName, downloadDataUrl } from './capture';
import { saveFirstLayout } from './firstLayout';
import { useLightingPreset, useViewer, type ViewMode } from './state';

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />;

const LIGHTING_ICON: Record<LightingPreset, ReactNode> = {
  daylight: <Sun className="h-4 w-4" />,
  evening: <Sunset className="h-4 w-4" />,
  night: <Moon className="h-4 w-4" />,
};

const itemCount = (n: number): string => (n === 1 ? '1 item' : `${n} items`);
const roomCount = (n: number): string => (n === 1 ? '1 room' : `${n} rooms`);

/** Ids of the rooms that have at least one item. */
function furnishedRooms(level: Level | null): Set<string | undefined> {
  return new Set(Object.values(level?.items ?? {}).map((i) => i.roomId));
}

function exportPicture(): void {
  const capture = captureBridge.capture;
  if (!capture) return;
  try {
    downloadDataUrl(capture(2), captureFileName(planStore.getState().project?.name ?? 'home'));
    toast.success('Picture saved to your downloads');
  } catch {
    toast.error('Could not save a picture of this view');
  }
}

function furnishWholeHome(): void {
  const before = furnishedRooms(selectLevel(planStore.getState()));
  const added = furnishHome();
  if (added === 0) {
    toast.info('Nothing to suggest for the rooms that are still empty');
    return;
  }
  const after = furnishedRooms(selectLevel(planStore.getState()));
  const filled = [...after].filter((id) => !before.has(id)).length;
  toast.success(`Added ${itemCount(added)} to ${roomCount(filled)}`);
  // The first furnished look of a home is kept as a variant to come back to.
  void saveFirstLayout();
}

export function Toolbar({ level }: { level: Level }) {
  const view = useViewer((s) => s.view);
  const cutaway = useViewer((s) => s.cutaway);
  const lighting = useLightingPreset();
  const [confirmClear, setConfirmClear] = useState(false);
  const ui = useViewer.getState();
  const count = Object.keys(level.items).length;
  const rooms = Object.values(level.rooms);
  const furnished = furnishedRooms(level);
  const empty = rooms.filter((r) => !furnished.has(r.id)).length;

  return (
    <>
      <div data-testid="design-toolbar" className="absolute top-3 left-1/2 -translate-x-1/2">
        <Panel className="flex items-center gap-1 p-1">
        <Segmented<ViewMode>
          size="sm"
          className="shrink-0"
          value={view}
          onChange={ui.setView}
          options={[
            {
              value: 'orbit',
              title: 'Dollhouse view',
              label: (
                <>
                  <Box className="h-4 w-4" />
                  3D
                </>
              ),
            },
            {
              value: 'top',
              title: 'Look straight down',
              label: (
                <>
                  <ScanLine className="h-4 w-4" />
                  Top
                </>
              ),
            },
          ]}
        />
        <IconButton label="Fit the home in view" size="sm" className="shrink-0" onClick={ui.requestFit}>
          <Maximize className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Hide walls that block the view"
          size="sm"
          className="shrink-0"
          active={cutaway}
          disabled={view === 'top'}
          onClick={ui.toggleCutaway}
        >
          <Layers className="h-4 w-4" />
        </IconButton>
        <Divider />
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 whitespace-nowrap"
          icon={<Sparkles className="h-4 w-4" />}
          data-testid="furnish-home"
          disabled={empty === 0}
          title={
            rooms.length === 0
              ? 'There are no rooms to furnish yet'
              : empty === 0
                ? 'Every room already has furniture'
                : 'Adds a suggested layout to every room that is still empty. Undo removes it in one step.'
          }
          onClick={furnishWholeHome}
        >
          Furnish home
        </Button>
        <IconButton label="Clear furniture" size="sm" className="shrink-0" disabled={count === 0} data-testid="clear-furniture" onClick={() => setConfirmClear(true)}>
          <Eraser className="h-4 w-4" />
        </IconButton>
        <Divider />
        <div data-testid="lighting-preset" data-preset={lighting} className="flex shrink-0">
          <Segmented<LightingPreset>
            size="sm"
            value={lighting}
            onChange={(preset) => {
              if (preset !== lighting) planStore.getState().setProjectSettings({ [LIGHTING_SETTING]: preset });
            }}
            options={LIGHTING_PRESETS.map((preset) => ({ value: preset, title: LIGHTING_LABELS[preset], label: LIGHTING_ICON[preset] }))}
          />
        </div>
        <IconButton label="Save a picture of this view" size="sm" className="shrink-0" data-testid="export-picture" onClick={exportPicture}>
          <Camera className="h-4 w-4" />
        </IconButton>
        <Divider />
        <span className="shrink-0 pr-2 pl-1 text-xs whitespace-nowrap text-ink-faint" data-testid="item-count" data-count={count}>
          {itemCount(count)}
        </span>
        </Panel>
      </div>
      {confirmClear && (
        <Dialog
          title="Clear furniture"
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <Button size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                data-testid="clear-furniture-confirm"
                onClick={() => {
                  setConfirmClear(false);
                  const removed = clearFurniture();
                  if (removed > 0) toast.success(`Removed ${itemCount(removed)}`);
                }}
              >
                Clear furniture
              </Button>
            </>
          }
        >
          Remove all {itemCount(count)} from every room? Walls, rooms and finishes stay as they are, and Undo brings the furniture back.
        </Dialog>
      )}
    </>
  );
}
