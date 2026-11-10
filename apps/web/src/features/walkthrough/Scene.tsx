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
import { useWalkUi } from './store';

export interface SceneBridge {
  canvas: HTMLCanvasElement;
  /** Plan point under a screen position, or null when it is sky or ceiling. */
  pick(clientX: number, clientY: number): Pt | null;
  /** PNG data URL of the current view. */
  capture(): string;
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
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      },
    };
    return () => {
      target.current = null;
    };
  }, [gl, scene, camera, raycaster, target]);
  return null;
}
