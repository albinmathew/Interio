/**
 * Walk mode. Baseline: first-person look and move with no collision.
 * The walkthrough workstream adds collision, room jumps, the guided tour and the minimap.
 */
import { getEntry } from '@interio/catalog';
import { DEFAULTS, planToWorld, selectRooms, tourPath, useLevel } from '@interio/core';
import { PlanScene, SceneLighting } from '@interio/scene3d';
import { PointerLockControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EmptyState, Kbd } from '../../ui';

const SPEED = 2.2; // m/s

function Walker() {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (!f && !r) return;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    camera.position.addScaledVector(forward, f * SPEED * Math.min(dt, 0.1));
    camera.position.addScaledVector(right, r * SPEED * Math.min(dt, 0.1));
  });
  return null;
}

export default function Walkthrough() {
  const level = useLevel();
  const start = useMemo(() => {
    if (!level) return null;
    const stop = tourPath(level)[0];
    const eye = stop?.eye ?? selectRooms(level)[0]?.centroid;
    if (!eye) return null;
    return { position: planToWorld(eye, DEFAULTS.eyeHeight), lookAt: planToWorld(stop?.lookAt ?? eye, DEFAULTS.eyeHeight) };
  }, [level]);
  if (!level) return null;
  if (!start) return <EmptyState title="Nothing to walk through yet" body="Close a room in Plan mode first." />;
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{ position: start.position, fov: 70, near: 0.05, far: 200 }}
        onCreated={({ camera }) => camera.lookAt(...start.lookAt)}
      >
        <color attach="background" args={['#dfe9f1']} />
        <SceneLighting level={level} mode="interior" />
        <PlanScene level={level} resolveEntry={getEntry} showCeilings />
        <PointerLockControls makeDefault />
        <Walker />
      </Canvas>
      <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-surface/90 px-3 py-2 text-xs text-ink-soft shadow-[var(--shadow-panel)]">
        Click to look around · <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> to move · <Kbd>Esc</Kbd> to release
      </div>
    </div>
  );
}
