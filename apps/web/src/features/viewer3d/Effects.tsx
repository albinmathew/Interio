/**
 * How the Design view is drawn, by quality tier:
 *
 * - `high` (a capable GPU holding its frame rate): an EffectComposer with a multisampled
 *   HDR target, three's GTAO pass (ambient occlusion: furniture sits on the floor, corners
 *   and the gaps between parts darken) and an OutputPass for tone mapping and sRGB.
 * - `medium` (a GPU that cannot hold the frame rate; `PerformanceMonitor` steps down):
 *   no composer, a cheap baked contact-shadow pass stands in for the occlusion.
 * - `low` (software renderers such as SwiftShader): neither, the plain forward render.
 *
 * The Showcase view uses the composer on any GPU, whatever the frame rate. `?ao=1` / `?ao=0`
 * force the occlusion on or off for comparisons.
 */
import { ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { Box } from './camera';
import { pipeline } from './capture';
import { useRenderTier, useViewer } from './state';

/** Layer for selection outlines, handles and other helpers: drawn by the main camera, ignored by the contact-shadow pass. */
export const HELPER_LAYER = 1;

/** `?ao=1` forces the occlusion pass on and `?ao=0` off, for comparing looks and for screenshots. */
function override(): boolean | null {
  const value = new URLSearchParams(window.location.search).get('ao');
  return value === '1' ? true : value === '0' ? false : null;
}

/**
 * GTAO that leaves out what is not really there: faded walls (their material is hidden or
 * see-through, but the pass's override material would still draw them), glass, the baked
 * contact shading and the helpers.
 */
function sceneGtao(scene: THREE.Scene, camera: THREE.Camera): GTAOPass {
  const pass = new GTAOPass(scene, camera, 1, 1);
  // The pass hides lines and points from its G-buffer itself (`_overrideVisibility`); hide these too.
  const internals = pass as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
  const base = internals._overrideVisibility.bind(pass);
  internals._overrideVisibility = () => {
    base();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const m = mesh.material as THREE.Material | THREE.Material[];
      const list = Array.isArray(m) ? m : [m];
      // Overlays (glass, baked contact shading: see-through, no depth, often no normals) would read as black occluders.
      const overlay = (x: THREE.Material) => !x.visible || (x.transparent && (x.opacity < 0.6 || !x.depthWrite)) || x.type === 'ShadowMaterial';
      const skip = mesh.layers.isEnabled(HELPER_LAYER) || !mesh.geometry.getAttribute('normal') || list.every(overlay);
      if (skip) {
        mesh.visible = false;
        internals._visibilityCache.push(mesh);
      }
    });
  };
  return pass;
}

/** The occlusion pipeline. It takes over drawing the frame (`useFrame` with a priority). */
function AoComposer({ box, strength }: { box: Box; strength: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  const built = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = sceneGtao(scene, camera);
    gtao.output = GTAOPass.OUTPUT.Default;
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    return { composer, gtao };
  }, [gl, scene, camera]);
  const { composer, gtao } = built;

  useEffect(() => {
    // World units are metres: occlusion reaches about half a metre, as in a real room.
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    gtao.blendIntensity = strength;
    invalidate();
  }, [gtao, strength, invalidate]);
  useEffect(() => {
    gtao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(...box.min).addScalar(-1), new THREE.Vector3(...box.max).addScalar(1)));
  }, [gtao, box]);
  useLayoutEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    invalidate();
  }, [composer, size.width, size.height, dpr, invalidate]);
  useEffect(() => {
    const render = () => composer.render();
    const setPixelRatio = (ratio: number) => {
      composer.setPixelRatio(ratio);
      composer.setSize(size.width, size.height);
    };
    pipeline.render = render;
    pipeline.setPixelRatio = setPixelRatio;
    return () => {
      if (pipeline.render === render) pipeline.render = null;
      if (pipeline.setPixelRatio === setPixelRatio) pipeline.setPixelRatio = null;
    };
  }, [composer, size.width, size.height]);
  useEffect(
    () => () => {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      for (const pass of composer.passes) pass.dispose();
    },
    [composer],
  );
  useFrame(() => {
    composer.render();
  }, 1);
  return null;
}

const TONE_MAPPING = {
  agx: THREE.AgXToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
} as const;

/**
 * Tone mapping and exposure. Khronos PBR Neutral keeps finish colours true to their
 * swatches and rolls bright whites off softly instead of clipping them. `?tm=agx|aces|neutral`
 * picks another one for comparisons.
 */
function ToneMapping({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('tm') as keyof typeof TONE_MAPPING | null;
    const before = { mapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = (name && TONE_MAPPING[name]) ?? THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
    invalidate();
    return () => {
      gl.toneMapping = before.mapping;
      gl.toneMappingExposure = before.exposure;
    };
  }, [gl, exposure, invalidate]);
  return null;
}

/** Counts every pass of a frame in `gl.info` (shadow maps, occlusion, the main view), not only the last one. */
function FrameStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => gl.info.reset(), -1000);
  return null;
}

export function Effects({ box }: { box: Box }) {
  const camera = useThree((s) => s.camera);
  const tier = useRenderTier();
  const view = useViewer((s) => s.view);
  const forced = useMemo(override, []);
  const ao = forced ?? (tier === 'high' || (view === 'showcase' && tier !== 'low'));
  const contact = forced === null && !ao && tier === 'medium';
  useEffect(() => {
    camera.layers.enable(HELPER_LAYER);
  }, [camera]);
  const width = box.max[0] - box.min[0] + 2;
  const depth = box.max[2] - box.min[2] + 2;
  const lower = () => useViewer.getState().setQuality('low');
  return (
    <>
      <FrameStats />
      <ToneMapping exposure={1} />
      {forced === null && tier === 'high' && <PerformanceMonitor flipflops={2} onDecline={lower} onFallback={lower} />}
      {ao && <AoComposer box={box} strength={view === 'showcase' ? 1 : 0.85} />}
      {contact && (
        <ContactShadows
          position={[(box.min[0] + box.max[0]) / 2, 0.006, (box.min[2] + box.max[2]) / 2]}
          scale={[width, depth]}
          resolution={1024}
          far={0.9}
          blur={1.1}
          opacity={0.55}
          color="#2a2622"
        />
      )}
    </>
  );
}
