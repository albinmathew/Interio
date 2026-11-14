/**
 * Glossy floors: one planar reflection for the whole home. Every floor lies at height 0, so
 * a single mirrored view of the scene (rendered at half resolution, floors hidden) serves
 * all of them; each floor material blends it in by its finish (`floorReflection`) and its
 * own roughness map, blurred through the mip chain so it reads as polished stone rather
 * than a mirror, and faded by Fresnel. Rooms, lamps and the bright windows show in it.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FloorReflection } from './reflectance';

/** Uniforms shared by the pass and every reflective floor material. */
const shared = {
  tReflect: { value: null as THREE.Texture | null },
  reflectMatrix: { value: new THREE.Matrix4() },
  reflectOn: { value: 0 },
};

/** What the mirrored view leaves out: the floors themselves and their baked edge shading. */
const hidden = new Set<THREE.Object3D>();

/** Registers an object to hide while the mirrored view is drawn. Returns the unregister function. */
export function hideFromMirror(object: THREE.Object3D): () => void {
  hidden.add(object);
  return () => hidden.delete(object);
}

const KEY = 'floor-mirror';

/**
 * Makes a floor's standard material take the shared reflection. Applied once per material;
 * `strength` and `blur` stay per material. Returns the undo function.
 */
export function makeReflective(material: THREE.MeshStandardMaterial, r: FloorReflection): () => void {
  const own = { reflectStrength: { value: r.strength }, reflectBlur: { value: r.blur } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 reflectMatrix;\nvarying vec4 vReflectCoord;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflectCoord = reflectMatrix * modelMatrix * vec4( transformed, 1.0 );');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D tReflect;\nuniform float reflectOn;\nuniform float reflectStrength;\nuniform float reflectBlur;\nvarying vec4 vReflectCoord;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        if ( reflectOn > 0.5 ) {
          // The floor's own relief (grout lines, planks) ripples the image a little.
          vec2 ruv = vReflectCoord.xy / vReflectCoord.w + ( normal.xy - nonPerturbedNormal.xy ) * 0.04;
          float soft = clamp( reflectBlur * ( 0.6 + roughnessFactor ), 0.0, 1.0 );
          float lod = soft * 6.5;
          vec2 texel = exp2( lod ) / vec2( textureSize( tReflect, 0 ) );
          vec3 mirrored = 0.25 * (
            textureLod( tReflect, ruv + vec2( 0.5, 0.5 ) * texel, lod ).rgb +
            textureLod( tReflect, ruv + vec2( -0.5, 0.5 ) * texel, lod ).rgb +
            textureLod( tReflect, ruv + vec2( 0.5, -0.5 ) * texel, lod ).rgb +
            textureLod( tReflect, ruv + vec2( -0.5, -0.5 ) * texel, lod ).rgb );
          float NdotV = clamp( dot( nonPerturbedNormal, normalize( vViewPosition ) ), 0.0, 1.0 );
          float fresnel = 0.04 + 0.96 * pow( 1.0 - NdotV, 5.0 );
          outgoingLight = mix( outgoingLight, mirrored, clamp( reflectStrength * fresnel * 2.0, 0.0, 1.0 ) );
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = () => {};
    material.customProgramCacheKey = () => '';
    material.needsUpdate = true;
  };
}

/** The mirrored view of the current frame, while a `<FloorMirror>` is mounted: frame-cost probes call it with the main render. */
export const mirrorPass: { render: (() => void) | null } = { render: null };

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Renders the mirrored view every frame, before the main one. Mount once per canvas. */
export function FloorMirror({ scale = 0.5 }: { scale?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const target = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
      }),
    [],
  );
  const mirror = useMemo(() => new THREE.PerspectiveCamera(), []);
  useEffect(() => {
    target.setSize(Math.max(1, Math.round(size.width * dpr * scale)), Math.max(1, Math.round(size.height * dpr * scale)));
  }, [target, size.width, size.height, dpr, scale]);
  useEffect(() => {
    shared.tReflect.value = target.texture;
    shared.reflectOn.value = 1;
    return () => {
      shared.reflectOn.value = 0;
      shared.tReflect.value = null;
      target.dispose();
    };
  }, [target]);

  const tmp = useMemo(() => ({ eye: new THREE.Vector3(), look: new THREE.Vector3(), rot: new THREE.Matrix4() }), []);
  const camera = useThree((s) => s.camera);
  const draw = useMemo(
    () => () => {
      const cam = camera as THREE.PerspectiveCamera;
      cam.updateMatrixWorld();
      const { eye, look, rot } = tmp;
      eye.setFromMatrixPosition(cam.matrixWorld);
      if (eye.y <= 0.01) {
        shared.reflectOn.value = 0;
        return;
      }
      shared.reflectOn.value = 1;
      // The camera mirrored in the floor plane, looking at the mirrored point it looks at.
      rot.extractRotation(cam.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(eye);
      mirror.position.set(eye.x, -eye.y, eye.z);
      mirror.up.set(0, 1, 0).applyMatrix4(rot).reflect(UP);
      mirror.lookAt(look.x, -look.y, look.z);
      mirror.near = cam.near;
      mirror.far = cam.far;
      mirror.updateMatrixWorld();
      mirror.projectionMatrix.copy(cam.projectionMatrix);
      mirror.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
      shared.reflectMatrix.value.copy(BIAS).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

      const restore: THREE.Object3D[] = [];
      for (const o of hidden) {
        if (o.visible) {
          o.visible = false;
          restore.push(o);
        }
      }
      const autoUpdate = gl.shadowMap.autoUpdate;
      // Shadow maps were drawn for this frame's main view already (or will be): do not draw them twice.
      gl.shadowMap.autoUpdate = false;
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, mirror);
      gl.setRenderTarget(previous);
      gl.shadowMap.autoUpdate = autoUpdate;
      for (const o of restore) o.visible = true;
    },
    [camera, gl, scene, target, mirror, tmp],
  );
  useEffect(() => {
    mirrorPass.render = draw;
    return () => {
      if (mirrorPass.render === draw) mirrorPass.render = null;
    };
  }, [draw]);
  useFrame(draw, -1);
  return null;
}
