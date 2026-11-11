/**
 * One face of a wall: give it a finish of its own (an accent wall) or hand it back to its
 * room's wall finish. Each pick is one undo step (`setWallProps`, `finishLeft` / `finishRight`).
 */
import { DEFAULT_WALL_MATERIAL, planStore, type Level, type Wall } from '@interio/core';
import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { Button, IconButton, PanelHeader } from '../../ui';
import { setWallFaceFinish } from './actions';
import { faceFinish, surfaceFinishName } from './customise';
import { finishOptions } from './finishes';
import { SurfaceSwatches } from './FinishesPanel';
import type { WallFace } from './state';

const OPTIONS = finishOptions('wall');

export function WallFacePanel({ level, wall, face }: { level: Level; wall: Wall; face: WallFace }) {
  const room = face.roomId ? level.rooms[face.roomId] : undefined;
  const own = faceFinish(wall, face.side);
  const roomFinish = room ? (room.wallMaterial ?? DEFAULT_WALL_MATERIAL) : undefined;
  const current = own ?? roomFinish;
  const close = (
    <IconButton label="Deselect" size="sm" onClick={() => planStore.getState().select(null)}>
      <X className="h-4 w-4" />
    </IconButton>
  );
  return (
    <div data-testid="wall-face-panel" data-wall-id={wall.id} data-side={face.side} className="flex min-h-0 flex-col">
      <PanelHeader title={<span data-testid="wall-face-title">{room ? `Wall of ${room.name}` : 'Outside wall'}</span>} actions={close} />
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 text-xs">
        {room ? (
          <button
            type="button"
            data-testid="wall-face-back"
            className="inline-flex items-center gap-1 text-ink-soft hover:text-ink"
            onClick={() => planStore.getState().select({ kind: 'room', id: room.id })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {room.name}
          </button>
        ) : (
          <span className="text-ink-faint">Facing outside</span>
        )}
        <span className="truncate text-ink" data-testid="wall-face-current" data-value={own ?? ''}>
          {current ? surfaceFinishName(current) : 'Facade'}
          {!own && room && <span className="text-ink-faint"> (room)</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <SurfaceSwatches
          surface="wall"
          options={OPTIONS}
          current={own}
          testId="wall-face-swatch"
          customTestId="wall-face-custom"
          onPick={(v) => setWallFaceFinish(wall.id, face.side, v)}
        />
      </div>
      <div className="border-t border-line p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          icon={<RotateCcw className="h-4 w-4" />}
          data-testid="wall-face-clear"
          disabled={!own}
          title={room ? `Back to ${surfaceFinishName(roomFinish).toLowerCase()}, like the rest of the room` : 'Back to the plain facade'}
          onClick={() => setWallFaceFinish(wall.id, face.side, null)}
        >
          {room ? "Use the room's finish" : 'Use the plain facade'}
        </Button>
      </div>
    </div>
  );
}
