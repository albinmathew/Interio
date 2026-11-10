/**
 * Walk mode: a first-person walk through the home with collision, room jumps,
 * a minimap and a guided tour.
 *
 * - `collision.ts`, `nav.ts`, `route.ts`, `controller.ts` are pure (no React) and unit tested.
 * - `Scene.tsx` is the part inside the canvas; `Hud.tsx` and `Minimap.tsx` are the overlays.
 * - `useWalkInput.ts` maps keyboard, mouse and touch onto the controller.
 */
import { getEntry } from '@interio/catalog';
import { selectLevelMesh, selectRooms, useLevel, usePlanStore, type Pt } from '@interio/core';
import { PlanScene, SceneLighting } from '@interio/scene3d';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, cn, toast } from '../../ui';
import { WalkController, type TourState, type WalkState } from './controller';
import { CurrentRoom, Hint, Joystick, ResumePrompt, RoomsPanel, TourBar, ViewOptions, roomInfo, type RoomInfo } from './Hud';
import { Minimap } from './Minimap';
import { buildWorld, planTour, startPose } from './route';
import { Bridge, CameraRig, TargetMarker, type SceneBridge } from './Scene';
import { loadPose, savePose, useWalkUi, walkUi } from './store';
import { useWalkInput } from './useWalkInput';

/** Dev and test hook: drive the walker without pointer lock. Dev builds only. */
export interface WalkDebugHook {
  getState(): WalkState;
  teleport(p: Pt): WalkState;
  /** Moves by a plan-space offset in mm through the same collision code as walking. */
  move(dxMm: number, dyMm: number): WalkState & { blocked: boolean };
  startTour(opts?: { speed?: number }): boolean;
  tourState(): TourState;
}

declare global {
  interface Window {
    __interioWalk?: WalkDebugHook;
  }
}

function download(dataUrl: string, name: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function Walkthrough() {
  const level = useLevel();
  const projectId = usePlanStore((s) => s.project?.id);
  const container = useRef<HTMLDivElement>(null);
  const bridge = useRef<SceneBridge | null>(null);
  const fadeEl = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  const world = useMemo(
    () => (level ? buildWorld(level, { resolveEntry: getEntry, mesh: selectLevelMesh(level), rooms: selectRooms(level) }) : null),
    [level],
  );
  const walkable = useMemo(() => world !== null && startPose(world) !== null, [world]);

  // One controller per project; a changed level is handed to it rather than starting over.
  const held = useRef<{ projectId: string; controller: WalkController } | null>(null);
  const controller = useMemo(() => {
    if (!world || !walkable || !projectId) return null;
    if (held.current?.projectId !== projectId) held.current = { projectId, controller: new WalkController(world, loadPose(projectId)) };
    return held.current.controller;
  }, [world, walkable, projectId]);

  const fov = useWalkUi((s) => s.fov);
  const roomId = useWalkUi((s) => s.roomId);
  const tourSpeed = useWalkUi((s) => s.tourSpeed);
  const tourStatus = useWalkUi((s) => s.tour.status);
  const mapOpen = useWalkUi((s) => s.mapOpen);
  const roomsOpen = useWalkUi((s) => s.roomsOpen);
  const touch = useWalkUi((s) => s.touch);
  const input = useWalkInput(controller, canvas, bridge);

  useEffect(() => {
    if (!controller || !world || !projectId) return;
    if (controller.world !== world) controller.setWorld(world);
    const sync = () => walkUi.set({ roomId: controller.roomId, tour: controller.tourState() });
    const remember = () => savePose(projectId, controller.pose());
    sync();
    const offChange = controller.subscribe(() => {
      sync();
      remember();
    });
    const offFrame = controller.onFrame(() => {
      if (fadeEl.current) fadeEl.current.style.opacity = String(controller.fade);
    });
    window.addEventListener('pagehide', remember);
    return () => {
      offChange();
      offFrame();
      window.removeEventListener('pagehide', remember);
      remember();
    };
  }, [controller, world, projectId]);

  // Leaving walk mode ends the tour; the pose is kept for coming back.
  useEffect(
    () => () => {
      held.current?.controller.stopTour();
    },
    [],
  );

  useEffect(() => {
    if (controller) controller.tourSpeed = tourSpeed;
  }, [controller, tourSpeed]);

  // The tour drives the camera: give the pointer back while it plays.
  useEffect(() => {
    if (tourStatus === 'playing') input.unlock();
  }, [tourStatus, input]);

  useEffect(() => {
    const onChange = () => walkUi.set({ fullscreen: document.fullscreenElement === container.current });
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !controller) return;
    const hook: WalkDebugHook = {
      getState: () => controller.getState(),
      teleport: (p) => controller.teleport(p),
      move: (dx, dy) => controller.moveBy(dx, dy),
      startTour: (opts) => {
        if (opts?.speed !== undefined) walkUi.set({ tourSpeed: opts.speed });
        return controller.startTour(opts);
      },
      tourState: () => controller.tourState(),
    };
    window.__interioWalk = hook;
    return () => {
      if (window.__interioWalk === hook) delete window.__interioWalk;
    };
  }, [controller]);

  const tourPlan = useMemo(() => (world && walkable ? planTour(world) : null), [world, walkable]);
  const rooms = useMemo<RoomInfo[]>(() => {
    if (!world) return [];
    const order = tourPlan?.stops.map((s) => s.roomId) ?? [];
    const rest = Object.keys(world.level.rooms).filter((id) => !order.includes(id));
    return [...order, ...rest].flatMap((id) => roomInfo(world, id) ?? []);
  }, [world, tourPlan]);
  const route = useMemo(() => (tourStatus === 'playing' || tourStatus === 'paused' ? tourPlan?.stops.map((s) => s.leg.points) : undefined), [tourPlan, tourStatus]);

  const screenshot = useCallback(() => {
    const shot = bridge.current?.capture();
    if (!shot || !world) return;
    const room = roomInfo(world, walkUi.get().roomId)?.name ?? 'home';
    const slug = room.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    download(shot, `interio-${slug}-${stamp}.png`);
    toast.success('Picture saved to your downloads');
  }, [world]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.current?.requestFullscreen?.().catch(() => toast.error('Full screen is not available here'));
  }, []);

  if (!level) return null;
  if (!world || !controller) return <EmptyState title="Nothing to walk through yet" body="Close a room in Plan mode first." />;
  const start = controller.pose();

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden bg-canvas select-none" data-testid="walkthrough">
      <Canvas
        shadows
        dpr={[1, 2]}
        style={{ touchAction: 'none' }}
        camera={{ position: [start.x / 1000, walkUi.get().eyeHeight / 1000, -start.y / 1000], fov, near: 0.05, far: 200 }}
        onCreated={({ gl }) => setCanvas(gl.domElement)}
      >
        <color attach="background" args={['#dfe9f1']} />
        <SceneLighting level={level} mode="interior" />
        <PlanScene level={level} resolveEntry={getEntry} showCeilings />
        <CameraRig controller={controller} />
        <TargetMarker controller={controller} />
        <Bridge target={bridge} />
      </Canvas>

      <div ref={fadeEl} className="pointer-events-none absolute inset-0 bg-ink" style={{ opacity: 0 }} aria-hidden />

      {/* Overlays: the wrappers ignore the pointer so the view stays clickable between controls. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3">
        <div className="flex min-h-0 flex-1 items-start justify-between gap-2">
          <div className="flex max-h-full min-h-0">
            <RoomsPanel
              rooms={rooms}
              currentId={roomId}
              onJump={(id) => controller.jumpToRoom(id)}
              onEntrance={() => {
                const pose = startPose(world);
                if (pose) controller.jumpTo(pose);
              }}
            />
          </div>
          <ViewOptions onScreenshot={screenshot} onFullscreen={toggleFullscreen} canFullscreen={document.fullscreenEnabled === true} />
        </div>
        {/* Phones: joystick and map on one row, tour controls on their own row underneath. */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex shrink-0 items-end sm:w-52">{touch && <Joystick onChange={input.setStick} />}</div>
          <div className="order-last flex w-full min-w-0 flex-col items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
            <Hint />
            <TourBar controller={controller} world={world} />
          </div>
          <div className="flex shrink-0 justify-end sm:w-52">
            <Minimap world={world} controller={controller} roomId={roomId} route={route} open={mapOpen} onToggle={(open) => walkUi.set({ mapOpen: open })} />
          </div>
        </div>
      </div>

      <div className={cn('pointer-events-none absolute inset-x-0 top-3.5 flex justify-center px-14 max-sm:top-[3.75rem]', roomsOpen && 'max-sm:hidden')}>
        <CurrentRoom room={roomInfo(world, roomId)} />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <ResumePrompt onResume={input.lock} />
      </div>
    </div>
  );
}
