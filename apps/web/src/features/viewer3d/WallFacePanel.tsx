/**
 * One face of a wall: give it a finish of its own (an accent wall, a mural, the user's own
 * picture as a mural) or hand it back to its room's wall finish. Each pick is one undo step
 * (`setWallProps`, `finishLeft` / `finishRight`).
 */
import { DEFAULT_WALL_MATERIAL, muralFinishId, parseMuralFinish, planStore, usePlanStore, withMuralDado, type Level, type Wall } from '@interio/core';
import { ArrowLeft, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { saveMuralImage } from '../../lib/murals';
import { Button, IconButton, PanelHeader, toast } from '../../ui';
import { setWallFaceFinish } from './actions';
import { faceFinish, surfaceFinishName, type WallSide } from './customise';
import { finishOptions } from './finishes';
import { SurfaceSwatches } from './FinishesPanel';
import type { WallFace } from './state';

const OPTIONS = finishOptions('wall', undefined, { murals: true });

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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <SurfaceSwatches
          surface="wall"
          options={OPTIONS}
          current={own}
          testId="wall-face-swatch"
          customTestId="wall-face-custom"
          onPick={(v) => setWallFaceFinish(wall.id, face.side, v)}
        />
        <OwnMural wallId={wall.id} side={face.side} own={own} />
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

/**
 * "Use my image as a mural": the picture is stored with the project in this browser
 * (never uploaded) and spread across this face, with beadboard panelling below if wanted.
 * The panelling switch also changes a mural the face already shows.
 */
function OwnMural({ wallId, side, own }: { wallId: string; side: WallSide; own: string | undefined }) {
  const projectId = usePlanStore((s) => s.project?.id);
  const mural = parseMuralFinish(own);
  const [dado, setDado] = useState(mural?.dado ?? true);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The switch follows a mural the face already shows (after undo, or another pick).
  const ownDado = mural ? mural.dado : null;
  useEffect(() => {
    if (ownDado !== null) setDado(ownDado);
  }, [ownDado]);

  const pick = async (file: File | undefined) => {
    if (!file || !projectId) return;
    setBusy(true);
    try {
      const assetId = await saveMuralImage(projectId, file);
      setWallFaceFinish(wallId, side, muralFinishId(assetId, dado));
      toast.success('Your picture is on the wall. It stays on this computer, saved with the project.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That image could not be used.');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (next: boolean) => {
    setDado(next);
    const switched = own ? withMuralDado(own, next) : null;
    if (switched) setWallFaceFinish(wallId, side, switched);
  };

  return (
    <section data-testid="wall-face-mural" className="flex flex-col gap-1.5">
      <div className="text-[11px] text-ink-faint">Your own mural</div>
      <Button
        size="sm"
        className="w-full"
        icon={<ImagePlus className="h-4 w-4" />}
        data-testid="wall-face-mural-pick"
        disabled={busy || !projectId}
        title="Pick a picture from this computer. It covers this wall, cropped to fit, and is saved with the project; nothing is uploaded."
        onClick={() => input.current?.click()}
      >
        {busy ? 'Adding your picture…' : mural?.source.kind === 'asset' ? 'Use another image' : 'Use my image as a mural'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        data-testid="wall-face-mural-file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          void pick(file);
        }}
      />
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          checked={dado}
          onChange={(e) => toggle(e.currentTarget.checked)}
          data-testid="wall-face-mural-dado"
        />
        Beadboard panelling below, to 1.1 m
      </label>
    </section>
  );
}
