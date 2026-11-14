/**
 * What lives inside the <Canvas>: the camera rig that follows the controller,
 * the click-to-move marker, and a bridge that lets the DOM layer pick floor
 * points and capture the frame.
 */
import { worldToPlan, type Pt } from '@interio/core';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { WalkController } from './controller';
import { walkPipeline } from './Effects';
import { useWalkUi } from './store';

export interface SceneBridge {
  canvas: HTMLCanvasElement;
  /** Plan point under a screen position, or null when it is sky or ceiling. */
  pick(clientX: number, clientY: number): Pt | null;
  /** PNG data URL of the current view. */
  capture(): string;
  /** Cost of a frame: draw calls and triangles of the last one, and the time to draw one again. */
  stats(): FrameStats;
  lights(): string[];
}

export interface FrameStats {
  calls: number;
  triangles: number;
  /** Milliseconds to draw a frame, every pass included, measured with the GPU finishing each one (average of five). */
  ms: number;
}

/** Runs the controller once per frame and puts the camera at its eyes. */
export function CameraRig({ controller }: { controller: WalkController }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const fov = useWalkUi((s) => s.fov);
  const eyeHeight = useWalkUi((s) => s.eyeHeight);
  const eye = useRef(eyeHeight);

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  useFrame((_, dt) => {
    controller.update(dt);
    // Glide to a new eye height instead of snapping.
    eye.current += (eyeHeight - eye.current) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.12));
    camera.position.set(controller.x / 1000, eye.current / 1000, -controller.y / 1000);
    // The camera looks down -Z; plan heading 0 is +X, so yaw is offset by a quarter turn.
    camera.rotation.set(controller.pitch, controller.yaw - Math.PI / 2, 0, 'YXZ');
  });
  return null;
}

/** A ring on the floor where click-to-move is heading. */
export function TargetMarker({ controller }: { controller: WalkController }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = controller.target;
    mesh.visible = t !== null;
    if (!t) return;
    mesh.position.set(t.x / 1000, 0.012, -t.y / 1000);
    mesh.scale.setScalar(1 + 0.12 * Math.sin(performance.now() / 160));
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} visible={false} raycast={() => null} renderOrder={2}>
      <ringGeometry args={[0.13, 0.18, 40]} />
      <meshBasicMaterial color="#0f766e" transparent opacity={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  );
}

/** Publishes picking and capture to the DOM layer. */
export function Bridge({ target }: { target: RefObject<SceneBridge | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    const ndc = new THREE.Vector2();
    target.current = {
      canvas: gl.domElement,
      pick(clientX, clientY) {
        const rect = gl.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(scene.children, true)[0];
        // Nothing, or something above eye level (ceiling, the top of a wall): not a place to walk to.
        if (!hit || hit.point.y > camera.position.y - 0.05) return null;
        return worldToPlan(hit.point.x, hit.point.z);
      },
      capture() {
        // Render and read back in the same task: the drawing buffer is not preserved between frames.
        if (walkPipeline.render) walkPipeline.render();
        else gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      },
      // TEMP-DEBUG
      lights() {
        const out: string[] = [];
        scene.traverse((o) => {
          const l = o as THREE.Light;
          if (l.isLight) out.push(`${l.type} ${l.intensity.toFixed(2)} #${l.color.getHexString()} ${o.position.toArray().map((n) => n.toFixed(1)).join(',')}`);
        });
        out.push(`env ${scene.environmentIntensity} bg ${scene.backgroundIntensity} tm ${gl.toneMapping} exp ${gl.toneMappingExposure}`);
        return out;
      },
      stats() {
        const calls = gl.info.render.calls;
        const triangles = gl.info.render.triangles;
        const ctx = gl.getContext();
        const px = new Uint8Array(4);
        const draw = () => {
          gl.info.reset();
          if (walkPipeline.render) walkPipeline.render();
          else gl.render(scene, camera);
          ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
        };
        draw();
        const t0 = performance.now();
        for (let i = 0; i < 5; i++) draw();
        const ms = Math.round(((performance.now() - t0) / 5) * 10) / 10;
        return { calls, triangles, ms };
      },
    };
    return () => {
      target.current = null;
    };
  }, [gl, scene, camera, raycaster, target]);
  // Count every pass of a frame in `gl.info` (shadow maps, post-processing), not only the last one.
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => gl.info.reset(), -1000);
  return null;
}
