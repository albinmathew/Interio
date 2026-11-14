/**
 * The cinematic image of walk mode on a GPU (`walkLook(tier).composer`):
 *
 * multisampled HDR render -> ambient occlusion (GTAO, as in the Design view) -> depth of
 * field (only while the tour lingers) -> bloom on light sources and bright windows ->
 * warm colour grade and vignette -> filmic tone mapping (ACES) and sRGB. ACES rather than AgX:
 * AgX bleaches bright greenery seen through the glass towards white and flattens the darks.
 *
 * The low tier never mounts this: it draws the plain forward render as walk mode always did.
 * `?tm=aces|agx|neutral` picks the tone mapping for comparisons.
 */
import { GRADES, clampPass, gradePass, sceneGtao, setGrade, type LightingPreset } from '@interio/scene3d';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { WalkLook } from './tier';

/**
 * A look-development switch: `?name=value` in the address bar, or (development builds) the
 * same pair in `sessionStorage` under `interio.walk.<name>`, which survives in-app navigation.
 */
function devFlag(name: string): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get(name);
  if (fromUrl !== null || !import.meta.env.DEV) return fromUrl;
  try {
    return sessionStorage.getItem(`interio.walk.${name}`);
  } catch {
    return null;
  }
}

/** How the current frame is drawn: through the composer when it is mounted. Used by capture and the frame-cost probe. */
export const walkPipeline: { render: (() => void) | null } = { render: null };

const TONE_MAPPING = {
  agx: THREE.AgXToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
} as const;

export interface CinematicEffectsProps {
  look: WalkLook;
  preset: LightingPreset;
  exposure: number;
  /** Distance in metres to keep sharp, or null for no depth of field. Read every frame. */
  focus: () => number | null;
}

export function CinematicEffects({ look, preset, exposure, focus }: CinematicEffectsProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const built = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: look.samples });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = look.ao ? sceneGtao(scene, camera) : null;
    if (gtao) {
      gtao.output = devFlag('ao') === 'only' ? GTAOPass.OUTPUT.AO : GTAOPass.OUTPUT.Default;
      composer.addPass(gtao);
    }
    composer.addPass(clampPass(16));
    const bokeh = look.dof ? new BokehPass(scene, camera, { focus: 3, aperture: 0.006, maxblur: 0.005 }) : null;
    if (bokeh) {
      bokeh.enabled = false;
      composer.addPass(bokeh);
    }
    // Threshold in linear light, before exposure: lamp shades, bulbs, cove strips and the brightest sky
    // through the glass bloom; lit walls (well below it) do not.
    const bloom = look.bloom ? new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 2.6) : null;
    if (bloom) composer.addPass(bloom);
    const grade = gradePass();
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    return { composer, gtao, bokeh, bloom, grade };
  }, [gl, scene, camera, look.samples, look.ao, look.dof, look.bloom]);
  const { composer, gtao, bokeh, grade } = built;

  useEffect(() => {
    if (!gtao) return;
    // World units are metres: occlusion reaches about half a metre, as in a real room.
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1.5, scale: 1.6, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    gtao.blendIntensity = 1;
  }, [gtao]);

  useEffect(() => {
    setGrade(grade, GRADES[preset], size.width / Math.max(1, size.height));
  }, [grade, preset, size.width, size.height]);

  useEffect(() => {
    const name = devFlag('tm') as keyof typeof TONE_MAPPING | null;
    const before = { mapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = (name && TONE_MAPPING[name]) ?? THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMapping = before.mapping;
      gl.toneMappingExposure = before.exposure;
    };
  }, [gl, exposure]);

  useLayoutEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    if (bokeh) (bokeh.uniforms as Record<string, THREE.IUniform<number>>)['aspect']!.value = size.width / Math.max(1, size.height);
  }, [composer, bokeh, size.width, size.height, dpr]);

  useEffect(() => {
    const render = () => composer.render();
    walkPipeline.render = render;
    return () => {
      if (walkPipeline.render === render) walkPipeline.render = null;
    };
  }, [composer]);

  useEffect(
    () => () => {
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      for (const pass of composer.passes) pass.dispose();
    },
    [composer],
  );

  useFrame(() => {
    if (bokeh) {
      const f = focus();
      bokeh.enabled = f !== null;
      if (f !== null) {
        const u = bokeh.uniforms as Record<string, THREE.IUniform<number>>;
        // Ease the focus so a pull from one piece to the next is gentle.
        u['focus']!.value += (f - u['focus']!.value) * 0.08;
        u['nearClip']!.value = camera.near;
        u['farClip']!.value = camera.far;
      }
    }
    composer.render();
  }, 1);
  return null;
}
