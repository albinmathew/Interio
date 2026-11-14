/**
 * Photo mode inside the walk canvas. While it is on and the view has been still for a
 * moment, a path tracer built from the live scene takes over the canvas: it refines in
 * tiles (a reduced-size preview first), fades in over the live frame and converges.
 * Any movement, resize or scene edit hands the canvas straight back to live rendering.
 *
 * The tracer is loaded and built the first time photo mode is turned on, kept for the rest
 * of the walk, and freed when walk mode closes.
 */
import { loadPhotoTracer, pathTracingSupport, type PhotoTracer } from '@interio/scene3d';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type * as THREE from 'three';
import type { SceneBridge } from '../Scene';
import { useWalkUi } from '../store';
import { FrameBudget } from './budget';
import { MAX_SAMPLES, photoStatus, type PhotoStatus } from './progress';
import { Stillness, stillDelay } from './stillness';
import { photoUi, usePhotoUi } from './store';

/** Fade from the live frame to the traced one, ms. */
const FADE_MS = 450;

/** Dev and test hook: what photo mode is doing. Dev builds only. */
export interface PhotoDebugHook {
  /** Tunes the tracer (dev only): bounces, sizes, a fixed exposure. */
  tune(options: Parameters<PhotoTracer['configure']>[0]): void;
  state(): {
    status: PhotoStatus;
    samples: number;
    passSamples: number;
    engaged: boolean;
    opacity: number;
    lastCapture: 'traced' | 'live' | null;
    tilesPerSecond: number;
    timeToFirstImage: number | null;
    why: string;
    textures: number;
    geometries: number;
    /** False once walk mode has dropped to low quality (its performance monitor). */
    shadows: boolean;
  };
}

declare global {
  interface Window {
    __interioPhoto?: PhotoDebugHook;
  }
}

/** Mount as the last child of the walk canvas. `bridge` is the walk view's capture bridge (screenshots). */
export function PhotoMode({ bridge }: { bridge: RefObject<SceneBridge | null> }) {
  const gl = useThree((s) => s.gl);
  const available = usePhotoUi((s) => s.available);
  const enabled = usePhotoUi((s) => s.enabled);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const support = pathTracingSupport(gl);
    photoUi.set({ available: support.ok, reason: support.reason ?? '', ...(support.ok ? {} : { status: 'unavailable' as const }) });
  }, [gl]);

  useEffect(() => {
    if (failed) photoUi.set({ available: false, reason: 'Photo mode could not start on this device', status: 'unavailable' });
  }, [failed]);

  if (!available || failed) return null;
  // Not loaded until first turned on; then kept for the rest of the walk.
  return <Engine enabled={enabled} bridge={bridge} onFail={() => setFailed(true)} />;
}

/**
 * The tracer, loaded the first time photo mode is wanted and then kept (turning photo mode off
 * and on again reuses it: no new build, no new shader compile). Freed when the canvas goes.
 */
function useLoadedTracer(gl: THREE.WebGLRenderer, wanted: boolean, onFail: () => void): PhotoTracer | null {
  const [tracer, setTracer] = useState<PhotoTracer | null>(null);
  const held = useRef<PhotoTracer | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      held.current?.dispose();
      held.current = null;
      setTracer(null);
    };
  }, [gl]);

  useEffect(() => {
    // One tracer at a time: a load in flight (React's development double mount) is waited for, not repeated.
    if (!wanted || held.current || loading.current) return;
    loading.current = loadPhotoTracer()
      .then((mod) => {
        if (!mounted.current || held.current) return;
        held.current = new mod.PhotoTracer(gl);
        setTracer(held.current);
      })
      .catch(() => {
        if (mounted.current) failRef.current();
      })
      .finally(() => {
        loading.current = null;
      });
  }, [gl, wanted, tracer]);
  return tracer;
}

function Engine({ enabled, bridge, onFail }: { enabled: boolean; bridge: RefObject<SceneBridge | null>; onFail: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const tracer = useLoadedTracer(gl, enabled, onFail);
  const tracerRef = useRef(tracer);
  tracerRef.current = tracer;
  const [engaged, setEngaged] = useState(false);
  const state = useRef({
    engaged: false,
    fadeStart: -1,
    opacity: 0,
    stillness: new Stillness(),
    budget: new FrameBudget(),
    view: new Float64Array(35),
    published: { status: 'off' as PhotoStatus, samples: -1, at: 0 },
    lastCapture: null as 'traced' | 'live' | null,
    engagedAt: 0,
    timeToFirstImage: null as number | null,
    why: '',
  });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const disengage = (why: string) => {
    const s = state.current;
    if (!s.engaged) return;
    s.why = why;
    s.engaged = false;
    s.opacity = 0;
    s.fadeStart = -1;
    setEngaged(false);
  };

  // Build as soon as the tracer is there, so it is ready by the time the walker stops.
  useEffect(() => {
    if (tracer && enabled) tracer.sync(scene);
  }, [tracer, enabled, scene]);

  useEffect(() => {
    if (!enabled) disengage('off');
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => photoUi.set({ status: 'off', samples: 0 }), []);

  useFrame((root, delta) => {
    const s = state.current;
    const now = performance.now();
    if (!s.engaged) s.budget.observeIdle(delta * 1000);
    if (!tracer || !enabledRef.current) {
      publish(enabledRef.current ? 'preparing' : 'off', 0, now);
      return;
    }
    if (tracer.error) {
      onFail();
      return;
    }
    const v = s.view;
    v.set(camera.matrixWorld.elements, 0);
    v.set(camera.projectionMatrix.elements, 16);
    v[32] = root.size.width;
    v[33] = root.size.height;
    v[34] = root.viewport.dpr;
    const still = s.stillness.observe(v, now);
    if (s.engaged && still === 0) disengage('moved');

    const delay = stillDelay(useWalkUi.getState().tour.status === 'playing');
    if (still >= delay || s.engaged || !tracer.ready) {
      const { stale, update } = tracer.sync(scene);
      if (stale) {
        disengage(`scene ${JSON.stringify(update)}`);
        s.stillness.restart(now);
      }
    }
    if (!s.engaged && still >= delay && tracer.ready && !tracer.compiling) {
      tracer.start(camera, root.size.width, root.size.height);
      s.engaged = true;
      s.budget.reset();
      s.engagedAt = now;
      s.timeToFirstImage = null;
      s.fadeStart = -1;
      s.opacity = 0;
      setEngaged(true);
    }
    const prepared = tracer.ready && !tracer.compiling;
    publish(photoStatus({ enabled: true, available: true, prepared: prepared || s.engaged, tracing: s.engaged, samples: tracer.samples }), tracer.samples, now);
  });

  function publish(status: PhotoStatus, samples: number, now: number): void {
    const p = state.current.published;
    // A few updates a second are plenty for the HUD.
    if (p.status === status && (p.samples === samples || now - p.at < 250)) return;
    p.status = status;
    p.samples = samples;
    p.at = now;
    photoUi.set({ status, samples });
  }

  // Screenshots: while a traced image is on screen, the walk view's capture saves it.
  useFrame(() => {
    const b = bridge.current;
    if (!b || (b.capture as { photo?: boolean }).photo) return;
    const live = b.capture;
    const capture = Object.assign(
      () => {
        const s = state.current;
        const t = tracerRef.current;
        const shot = t && s.engaged && t.hasImage ? t.capture() : null;
        s.lastCapture = shot ? 'traced' : 'live';
        return shot ?? live();
      },
      { photo: true, live },
    );
    b.capture = capture;
  });
  useEffect(
    () => () => {
      const b = bridge.current;
      const live = (b?.capture as { live?: () => string } | undefined)?.live;
      if (b && live) b.capture = live;
    },
    [bridge],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hook: PhotoDebugHook = {
      tune: (options) => tracer?.configure(options),
      state: () => {
        const s = state.current;
        return {
          status: photoUi.get().status,
          samples: tracer?.samples ?? 0,
          passSamples: tracer?.passSamples ?? 0,
          engaged: s.engaged,
          opacity: s.opacity,
          lastCapture: s.lastCapture,
          tilesPerSecond: s.budget.tilesPerSecond,
          timeToFirstImage: s.timeToFirstImage,
          why: s.why,
          textures: gl.info.memory.textures,
          geometries: gl.info.memory.geometries,
          shadows: gl.shadowMap.enabled,
        };
      },
    };
    window.__interioPhoto = hook;
    return () => {
      if (window.__interioPhoto === hook) delete window.__interioPhoto;
    };
  }, [gl, tracer]);

  return tracer && engaged ? <TakeOver tracer={tracer} state={state} /> : null;
}

interface EngineState {
  engaged: boolean;
  fadeStart: number;
  opacity: number;
  budget: FrameBudget;
  engagedAt: number;
  timeToFirstImage: number | null;
}

/**
 * Mounted only while the tracer has the canvas: a render-priority frame callback, so
 * R3F stops drawing the live frame itself and this draws the traced one (over the live
 * frame while fading in).
 */
function TakeOver({ tracer, state }: { tracer: PhotoTracer; state: RefObject<EngineState> }) {
  useFrame((root, delta) => {
    const s = state.current;
    const { gl, scene, camera } = root;
    // Another render-priority callback (post-processing) draws the live frame; otherwise this does.
    const othersDraw = root.internal.priority > 1;
    if (!s.engaged) {
      if (!othersDraw) gl.render(scene, camera);
      return;
    }
    const now = performance.now();
    if (tracer.passSamples < MAX_SAMPLES || tracer.previewing) tracer.step(s.budget.next(delta * 1000));
    if (tracer.hasImage && s.fadeStart < 0) {
      s.fadeStart = now;
      s.timeToFirstImage = now - s.engagedAt;
    }
    s.opacity = s.fadeStart < 0 ? 0 : Math.min(1, (now - s.fadeStart) / FADE_MS);
    tracer.draw(s.opacity, othersDraw ? null : { scene, camera });
  }, 2);
  return null;
}
