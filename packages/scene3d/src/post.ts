/**
 * Shared pieces of the post-processing chains: ambient occlusion that skips what is not
 * really there, and a colour grade with a vignette. Used by the walk view's cinematic
 * composer (the Design view keeps its own, older copy of the occlusion pass).
 */
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { LightingPreset } from './lighting';

/** Meshes with `userData.noAo` (glows, helpers) are left out of the occlusion pass. */
export const NO_AO = 'noAo';

/**
 * GTAO that leaves out see-through overlays (glass, baked contact shading), glows and
 * helpers: the pass's override material would otherwise draw them as solid occluders.
 */
export function sceneGtao(scene: THREE.Scene, camera: THREE.Camera): GTAOPass {
  const pass = new GTAOPass(scene, camera, 1, 1);
  const internals = pass as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
  const base = internals._overrideVisibility.bind(pass);
  internals._overrideVisibility = () => {
    base();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const m = mesh.material as THREE.Material | THREE.Material[];
      const list = Array.isArray(m) ? m : [m];
      const overlay = (x: THREE.Material) => !x.visible || (x.transparent && (x.opacity < 0.6 || !x.depthWrite)) || x.type === 'ShadowMaterial';
      if (mesh.userData[NO_AO] || !mesh.geometry.getAttribute('normal') || list.every(overlay)) {
        mesh.visible = false;
        internals._visibilityCache.push(mesh);
      }
    });
  };
  return pass;
}

export interface Grade {
  /** White balance: multiplies linear RGB. */
  balance: [number, number, number];
  /** 1 leaves colour as is. */
  saturation: number;
  /** Contrast about middle grey, in log space: 1 leaves it, above 1 deepens the darks. */
  contrast: number;
  /** Colour the darkest tones lean towards (split toning). */
  shadows: [number, number, number];
  /** Darkening of the corners, 0..1. */
  vignette: number;
}

/** A warm grade per preset: a sunny interior by day, honey at golden hour, amber lamps against cool night shadows at night. */
export const GRADES: Record<LightingPreset, Grade> = {
  daylight: { balance: [1.02, 1, 0.965], saturation: 1.06, contrast: 1.08, shadows: [0.98, 0.98, 1.02], vignette: 0.22 },
  evening: { balance: [1.08, 0.99, 0.86], saturation: 1.1, contrast: 1.12, shadows: [1.02, 0.94, 0.88], vignette: 0.3 },
  night: { balance: [1.05, 0.98, 0.9], saturation: 1.05, contrast: 1.14, shadows: [0.86, 0.92, 1.08], vignette: 0.34 },
};

const GradeShader = {
  name: 'InterioGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    balance: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    contrast: { value: 1 },
    shadowTint: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 balance;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 shadowTint;
    uniform float vignette;
    uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = max(texel.rgb, vec3(0.0)) * balance;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, saturation), vec3(0.0));
      // Contrast about middle grey in log space: highlights and darks spread evenly, nothing clips here.
      c = 0.18 * pow(c / 0.18 + 1e-6, vec3(contrast));
      float shade = 1.0 - smoothstep(0.0, 0.2, l);
      c *= mix(vec3(1.0), shadowTint, shade);
      vec2 d = vUv - 0.5;
      d.x *= aspect;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d) * 1.2);
      gl_FragColor = vec4(c, texel.a);
    }`,
};

/** The grade as a composer pass (linear HDR in, linear HDR out: put it before the tone mapping). */
export function gradePass(): ShaderPass {
  return new ShaderPass(GradeShader);
}

export function setGrade(pass: ShaderPass, grade: Grade, aspect: number): void {
  const u = pass.uniforms as typeof GradeShader.uniforms;
  u.balance.value.set(...grade.balance);
  u.saturation.value = grade.saturation;
  u.contrast.value = grade.contrast;
  u.shadowTint.value.set(...grade.shadows);
  u.vignette.value = grade.vignette;
  u.aspect.value = aspect;
}

const ClampShader = {
  name: 'InterioClamp',
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, maxLuminance: { value: 24 } },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float maxLuminance;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float l = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(texel.rgb * min(1.0, maxLuminance / max(l, 1e-4)), texel.a);
    }`,
};

/**
 * Caps the brightest pixels (the sun's glint in a mirror, a bulb seen point-blank) so they
 * bloom as a soft glow instead of a blown-out disc. Linear HDR in and out.
 */
export function clampPass(maxLuminance = 24): ShaderPass {
  const pass = new ShaderPass(ClampShader);
  (pass.uniforms as typeof ClampShader.uniforms).maxLuminance.value = maxLuminance;
  return pass;
}
