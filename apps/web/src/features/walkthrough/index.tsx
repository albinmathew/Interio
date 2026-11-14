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
import {
  OUTSIDE_ASSETS,
  Outside,
  PlanScene,
  SceneLighting,
  WindowLights,
  coveLightsOn,
  detectSoftwareRenderer,
  exteriorGlazing,
  installFurnitureTextures,
  lightingFromSettings,
  lightingRig,
  outsideFromSettings,
  panoramaRotation,
  planSun,
  usePanorama,
  type RenderQuality,
} from '@interio/scene3d';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, cn, toast } from '../../ui';
import { WalkController, type TourState, type WalkState } from './controller';
import { CinematicEffects } from './Effects';
import { CurrentRoom, Hint, Joystick, ResumePrompt, RoomsPanel, TourBar, ViewOptions, roomInfo, type RoomInfo } from './Hud';
import { Minimap } from './Minimap';
import { PhotoHud, PhotoMode } from './photo';
import { buildWorld, planTour, startPose } from './route';
import { Bridge, CameraRig, TargetMarker, type FrameStats, type SceneBridge } from './Scene';
import { loadPose, savePose, useWalkUi, walkUi } from './store';
import { declineTier, initialTier, tierOverride, walkLook, type TierState, type WalkTier } from './tier';
import { usePhotoUi } from './photo/store';
import { useWalkInput } from './useWalkInput';

/** Dev and test hook: drive the walker without pointer lock. Dev builds only. */
export interface WalkDebugHook {
  getState(): WalkState;
  /** Puts the walker at a plan point, optionally turned to a heading (plan degrees). */
  teleport(p: Pt, yawDeg?: number): WalkState;
  /** Tilts the view up (positive) or down, degrees. */
  pitch(deg: number): void;
  /** Moves by a plan-space offset in mm through the same collision code as walking. */
  move(dxMm: number, dyMm: number): WalkState & { blocked: boolean };
  startTour(opts?: { speed?: number }): boolean;
  tourState(): TourState;
  /** Rendering tier in use. */
  tier(): WalkTier;
  /** Pins a rendering tier (`medium` step 1 halves the shadow map), for comparisons and frame-cost measurements. */
  setTier(tier: WalkTier, step?: number): void;
  /** Cost of a frame through the full pipeline (shadow maps and post-processing included). */
  stats(): FrameStats | null;
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
  installFurnitureTextures();
  const level = useLevel();
  const projectId = usePlanStore((s) => s.project?.id);
  // The lighting preset is picked in Design mode and saved with the project.
  const lighting = usePlanStore((s) => lightingFromSettings(s.project?.settings));
  const outside = usePlanStore((s) => outsideFromSettings(s.project?.settings));
  const coves = usePlanStore((s) => coveLightsOn(s.project?.settings, lighting));
  const container = useRef<HTMLDivElement>(null);
  const bridge = useRef<SceneBridge | null>(null);
  const fadeEl = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  // Software renderers get the cheap look; GPUs that cannot hold the frame rate step down (see tier.ts).
  const [tierState, setTierState] = useState<TierState>(() => tierOverride(window.location.search) ?? initialTier(detectSoftwareRenderer()));
  const tracing = usePhotoUi((s) => s.status === 'refining' || s.status === 'ready' || s.status === 'preparing');
  const [pinned, setPinned] = useState(() => tierOverride(window.location.search) !== null);
  const look = walkLook(tierState);
  const quality: RenderQuality = tierState.tier === 'low' ? 'low' : 'high';
  const cinematic = look.lighting === 'cinematic';
  const rig = lightingRig(lighting, look.lighting);
  const glazing = useMemo(() => (level ? exteriorGlazing(level, selectRooms(level)) : []), [level]);
  const sun = useMemo(() => planSun(glazing, lighting), [glazing, lighting]);
  const panorama = usePanorama(outside);
  const rotation = panoramaRotation(panorama, sun.azimuth);
  // Shader compilation and texture uploads make the first seconds slow: judge the frame rate after that.
  const [warm, setWarm] = useState(false);
  // Each step down recompiles materials too: give the monitor the same grace after every change of tier.
  useEffect(() => {
    setWarm(false);
    const t = window.setTimeout(() => setWarm(true), 4000);
    return () => window.clearTimeout(t);
  }, [tierState]);

  const world = useMemo(
    () => (level ? buildWorld(level, { resolveEntry: getEntry, mesh: selectLevelMesh(level), rooms: selectRooms(level) }) : null),
    [level],
  );
  const walkable = useMemo(() => world !== null && startPose(world) !== null, [world]);
  // The front door stays shut: its open leaf would stand in the foyer, right where the walk starts.
  const frontDoors = useMemo(() => world?.graph.entrances.map((e) => e.openingId), [world]);

  // One controller per project; a changed level is handed to it rather than starting over.
  const held = useRef<{ projectId: string; controller: WalkController } | null>(null);
  const controller = useMemo(() => {
    if (!world || !walkable || !projectId) return null;
    if (held.current?.projectId !== projectId) held.current = { projectId, controller: new WalkController(world, loadPose(projectId)) };
    return held.current.controller;
  }, [world, walkable, projectId]);

  const tierRef = useRef<WalkTier>(tierState.tier);
  tierRef.current = tierState.tier;

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
      teleport: (p, yawDeg) => controller.teleport(p, yawDeg),
      pitch: (deg) => {
        controller.pitch = (deg * Math.PI) / 180;
      },
      move: (dx, dy) => controller.moveBy(dx, dy),
      startTour: (opts) => {
        if (opts?.speed !== undefined) walkUi.set({ tourSpeed: opts.speed });
        return controller.startTour(opts);
      },
      tourState: () => controller.tourState(),
      tier: () => tierRef.current,
      setTier: (tier, step = 0) => {
        setPinned(true);
        setTierState({ tier, step });
      },
      stats: () => bridge.current?.stats() ?? null,
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

  // Depth of field while the tour lingers: keep the room's main piece sharp.
  const focus = useCallback(() => {
    const f = controller?.tourFocus();
    if (!controller || !f) return null;
    return Math.hypot((f.x - controller.x) / 1000, (f.y - controller.y) / 1000);
  }, [controller]);

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
        shadows={look.shadows ? 'percentage' : false}
        dpr={look.dpr}
        // Multisampling is the costliest part of a frame on a software rasteriser; the canvas keeps the setting it starts with.
        // With the composer the multisampling happens in its own target.
        gl={{ antialias: !detectSoftwareRenderer() }}
        style={{ touchAction: 'none' }}
        camera={{ position: [start.x / 1000, walkUi.get().eyeHeight / 1000, -start.y / 1000], fov, near: 0.05, far: 200 }}
        onCreated={({ gl }) => setCanvas(gl.domElement)}
      >
        <Outside view={outside} preset={lighting} rotation={rotation} fallback={rig.background} mode={cinematic ? 'background' : 'dome'} />
        {tierState.tier !== 'low' && warm && !pinned && (
          // Only slow frames lower the quality: drei counts every "frames are fine" incline towards its
          // fall-back, which dropped a smooth 60 fps walk to the low tier after a few seconds. Paused while
          // photo mode traces, since tracing spends frame time on purpose.
          !tracing && <PerformanceMonitor onDecline={() => setTierState(declineTier)} />
        )}
        <SceneLighting
          level={level}
          mode={look.lighting}
          preset={lighting}
          resolveEntry={getEntry}
          quality={quality}
          envUrl={cinematic ? OUTSIDE_ASSETS[outside].hdr : undefined}
          sunDirection={cinematic ? sun.direction : undefined}
          environmentRotation={cinematic ? rotation : 0}
          shadows={look.shadows}
          shadowMapSize={look.shadowMapSize}
          shadowSoftness={look.shadowSoftness}
        />
        {look.windowLights > 0 && <WindowLights glazing={glazing} count={look.windowLights} panorama={panorama?.small ?? null} rotation={rotation} strength={rig.windows ?? 0} />}
        <PlanScene level={level} resolveEntry={getEntry} showCeilings closedDoors={frontDoors} lampsLit={lighting !== 'daylight'} quality={quality} clearGlass coves={coves ? (lighting === 'daylight' ? 0.5 : 1) : null} reflections={look.reflections} />
        <CameraRig controller={controller} />
        <TargetMarker controller={controller} />
        <Bridge target={bridge} />
        {look.composer && <CinematicEffects look={look} preset={lighting} exposure={rig.exposure ?? 1} focus={focus} />}
        <PhotoMode bridge={bridge} />
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
          <PhotoHud />
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
