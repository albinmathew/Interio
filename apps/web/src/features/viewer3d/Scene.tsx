/**
 * Everything inside the Design view's canvas: the lit level, the placed items with
 * their selection and warning states, the placement ghost, and the camera.
 */
import { planStore, selectLevelMesh, usePlanStore, type Item, type Level } from '@interio/core';
import { ItemObject, LevelMeshes, SceneLighting, type ItemAppearance } from '@interio/scene3d';
import { Line, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { clampTarget, fitOrbit, fitTop, freeView, type Box, type CameraPose } from './camera';
import { findOverlaps, itemSize, type Overlap } from './placement';
import { cameraState, entryOrPlaceholder, registerEntry, useViewer, type ViewMode } from './state';
import { HANDLE_RADIUS, handlePosition, usePointerTool } from './tool';

const ACCENT = '#0f766e';
const WARN = '#dc4a2d';

/** The level's items with the live drag applied, so warnings and gizmos follow the pointer. */
export function useLiveItems(level: Level): Record<string, Item> {
  const drag = useViewer((s) => s.drag);
  return useMemo(() => {
    const item = drag && level.items[drag.id];
    if (!drag || !item) return level.items;
    const { x, y, z, rotationDeg, roomId } = drag.pose;
    return { ...level.items, [drag.id]: { ...item, x, y, z, rotationDeg, roomId } };
  }, [level.items, drag]);
}

export function useOverlaps(level: Level, items: Record<string, Item>): Map<string, Overlap> {
  const { walls, vertices, openings } = level;
  return useMemo(() => findOverlaps({ items, walls, vertices, openings }, entryOrPlaceholder), [items, walls, vertices, openings]);
}

const WARNING: ItemAppearance = { emissive: WARN, emissiveIntensity: 0.55 };

function Items({ items, overlaps }: { items: Record<string, Item>; overlaps: Map<string, Overlap> }) {
  return (
    <group name="items">
      {Object.values(items).map((item) => (
        <ItemObject key={item.id} item={item} entry={entryOrPlaceholder(item.catalogId)} appearance={overlaps.has(item.id) ? WARNING : undefined} />
      ))}
    </group>
  );
}

/** Edges of an item's bounding box and a plate under it. */
function Outline({ item, color, handle }: { item: Item; color: string; handle: boolean }) {
  const size = itemSize(entryOrPlaceholder(item.catalogId), item);
  const w = size.w / 1000 + 0.03;
  const d = size.d / 1000 + 0.03;
  const h = size.h / 1000 + 0.015;
  const points = useMemo(() => {
    const c = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as const;
    const out: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = c[i]!;
      const [x1, z1] = c[(i + 1) % 4]!;
      out.push([x0, 0, z0], [x1, 0, z1], [x0, h, z0], [x1, h, z1], [x0, 0, z0], [x0, h, z0]);
    }
    return out;
  }, [w, d, h]);
  const knob = handlePosition(item, size.d);
  const yaw = (item.rotationDeg * Math.PI) / 180;
  return (
    <>
      <group position={[item.x / 1000, item.z / 1000, -item.y / 1000]} rotation={[0, yaw, 0]}>
        <Line points={points} segments color={color} lineWidth={2.2} depthTest={false} renderOrder={20} transparent />
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={19}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
        </mesh>
        {handle && (
          <Line
            points={[
              [0, 0.03, d / 2],
              [0, 0.03, d / 2 + 0.45 - HANDLE_RADIUS],
            ]}
            color={color}
            lineWidth={2}
            depthTest={false}
            renderOrder={20}
            transparent
          />
        )}
      </group>
      {handle && (
        <mesh name="rotate-handle" position={knob} renderOrder={21}>
          <sphereGeometry args={[HANDLE_RADIUS, 24, 16]} />
          <meshBasicMaterial color={color} depthTest={false} transparent />
        </mesh>
      )}
    </>
  );
}

function Selection({ items, overlaps }: { items: Record<string, Item>; overlaps: Map<string, Overlap> }) {
  const selection = usePlanStore((s) => s.selection);
  const item = selection?.kind === 'item' ? items[selection.id] : undefined;
  if (!item) return null;
  return <Outline item={item} color={overlaps.has(item.id) ? WARN : ACCENT} handle />;
}

function Ghost({ level }: { level: Level }) {
  const placing = useViewer((s) => s.placing);
  const ghost = useViewer((s) => s.ghost);
  const item = useMemo<Item | null>(
    () => (placing && ghost ? { id: '__ghost', catalogId: placing.catalogId, x: ghost.x, y: ghost.y, z: ghost.z, rotationDeg: ghost.rotationDeg } : null),
    [placing, ghost],
  );
  const { items, walls, vertices, openings } = level;
  const blocked = useMemo(
    () => !!item && findOverlaps({ items: { ...items, [item.id]: item }, walls, vertices, openings }, entryOrPlaceholder).has(item.id),
    [item, items, walls, vertices, openings],
  );
  const appearance = useMemo<ItemAppearance>(() => ({ opacity: 0.62, emissive: blocked ? WARN : ACCENT, emissiveIntensity: blocked ? 0.6 : 0.25 }), [blocked]);
  if (!item) return null;
  return (
    <>
      <ItemObject item={item} entry={entryOrPlaceholder(item.catalogId)} appearance={appearance} />
      <Outline item={item} color={blocked ? WARN : ACCENT} handle={false} />
    </>
  );
}

/** A soft shadow catcher around the home, so the outer walls sit on something. */
function Ground({ box }: { box: Box }) {
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  return (
    <mesh name="ground" position={[cx, -0.02, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[box.max[0] - box.min[0] + 80, box.max[2] - box.min[2] + 80]} />
      <shadowMaterial transparent opacity={0.16} />
    </mesh>
  );
}

/** Field of view per mode. The top view uses a long lens so it reads almost like a plan. */
const FOV: Record<ViewMode, number> = { orbit: 38, top: 15 };

interface Viewport {
  width: number;
  height: number;
}

/** Canvas area hidden by the catalog (left), toolbar (top) and hint (bottom). */
function insetsFor(size: Viewport) {
  return { left: size.width > 900 ? 304 : 0, right: 8, top: 58, bottom: 44 };
}

function poseFor(view: ViewMode, box: Box, size: Viewport): CameraPose {
  const free = freeView(size.width, size.height, FOV[view], insetsFor(size));
  return view === 'top' ? fitTop(box, free.fov, free.aspect) : fitOrbit(box, free.fov, free.aspect);
}

/** Orbit, pan and zoom with limits; animated moves between the dollhouse and the top view. */
function CameraRig({ box }: { box: Box }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const view = useViewer((s) => s.view);
  const fitRequest = useViewer((s) => s.fitRequest);
  const anim = useRef<{
    from: THREE.Spherical;
    to: THREE.Spherical;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromFov: number;
    toFov: number;
    t: number;
  } | null>(null);
  const first = useRef(true);
  const latest = useRef({ box, size });
  latest.current = { box, size };
  const lens = camera as THREE.PerspectiveCamera;

  // Heading clockwise from plan north (-Z), for camera-relative arrow keys.
  useEffect(() => {
    const forward = new THREE.Vector3();
    cameraState.heading = () => {
      camera.getWorldDirection(forward);
      return (Math.atan2(forward.x, -forward.z) * 180) / Math.PI;
    };
    return () => {
      cameraState.heading = () => 0;
    };
  }, [camera]);

  // Shift the image so the home is centred in the area the panels leave free.
  useLayoutEffect(() => {
    const free = freeView(size.width, size.height, lens.fov, insetsFor(size));
    lens.setViewOffset(size.width, size.height, -free.offsetX, -free.offsetY, size.width, size.height);
    invalidate();
    return () => lens.clearViewOffset();
  }, [lens, size, invalidate]);

  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const pose = poseFor(view, latest.current.box, latest.current.size);
    const toTarget = new THREE.Vector3(...pose.target);
    const to = new THREE.Spherical().setFromVector3(new THREE.Vector3(...pose.position).sub(toTarget));
    if (first.current) {
      first.current = false;
      lens.fov = FOV[view];
      lens.updateProjectionMatrix();
      camera.position.set(...pose.position);
      c.target.copy(toTarget);
      c.update();
    } else {
      const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
      // Turn the short way round.
      const turn = THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
      // Straight down has no heading of its own: keep the current one until the camera tilts.
      if (from.phi < 0.02) from.theta = to.theta;
      else to.theta = from.theta + turn;
      anim.current = { from, to, fromTarget: c.target.clone(), toTarget, fromFov: lens.fov, toFov: FOV[view], t: 0 };
      c.enabled = false;
    }
    invalidate();
  }, [view, fitRequest, camera, lens, invalidate]);

  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + Math.min(dt, 0.05) / 0.45);
    const k = a.t * a.t * (3 - 2 * a.t);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(a.from.radius, a.to.radius, k),
      THREE.MathUtils.lerp(a.from.phi, a.to.phi, k),
      THREE.MathUtils.lerp(a.from.theta, a.to.theta, k),
    );
    c.target.lerpVectors(a.fromTarget, a.toTarget, k);
    camera.position.setFromSpherical(s).add(c.target);
    camera.lookAt(c.target);
    if (a.fromFov !== a.toFov) {
      // Interpolate the focal length, not the angle, so the home keeps its size on screen while the lens changes.
      const f0 = 1 / Math.tan(THREE.MathUtils.degToRad(a.fromFov) / 2);
      const f1 = 1 / Math.tan(THREE.MathUtils.degToRad(a.toFov) / 2);
      lens.fov = THREE.MathUtils.radToDeg(2 * Math.atan(1 / THREE.MathUtils.lerp(f0, f1, k)));
      lens.updateProjectionMatrix();
    }
    if (a.t >= 1) {
      anim.current = null;
      c.enabled = true;
      c.update();
    }
    invalidate();
  });

  const reach = Math.hypot(box.max[0] - box.min[0], box.max[2] - box.min[2]);
  const top = view === 'top';
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate={!top}
      minPolarAngle={0}
      maxPolarAngle={top ? 0.002 : 1.45}
      minDistance={2}
      maxDistance={Math.max(30, reach * (top ? 12 : 4))}
      zoomSpeed={0.9}
      screenSpacePanning={false}
      mouseButtons={{ LEFT: top ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      onChange={() => {
        const c = controls.current;
        if (!c) return;
        if (anim.current) return;
        const t = c.target;
        const [x, y, z] = clampTarget([t.x, t.y, t.z], latest.current.box);
        if (x === t.x && y === t.y && z === t.z) return;
        // Carry the camera with the target so the view does not swing.
        camera.position.add(new THREE.Vector3(x - t.x, y - t.y, z - t.z));
        t.set(x, y, z);
      }}
    />
  );
}

/**
 * `window.__interio` in development builds: lets tests and the console read the plan,
 * drive the UI state and find where a plan point is on screen.
 */
function DebugHook() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hook = {
      ready: true,
      store: planStore,
      ui: useViewer,
      registerEntry,
      /** Client coordinates of a plan point (mm) at elevation z (mm). */
      project(x: number, y: number, z = 0): { x: number; y: number } {
        camera.updateMatrixWorld();
        const v = new THREE.Vector3(x / 1000, z / 1000, -y / 1000).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      /** World bounds (metres) and mesh names of a placed item as it is drawn right now. */
      describeItem(id: string): { min: number[]; max: number[]; meshes: string[] } | null {
        const object = scene.getObjectByName(`item:${id}`);
        if (!object) return null;
        object.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(object);
        const meshes: string[] = [];
        object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o.name);
        });
        return { min: box.min.toArray(), max: box.max.toArray(), meshes };
      },
    };
    window.__interio = hook;
    return () => {
      if (window.__interio === hook) delete window.__interio;
    };
  }, [camera, gl, scene]);
  return null;
}

export function Scene({ level }: { level: Level }) {
  usePointerTool();
  const view = useViewer((s) => s.view);
  const cutaway = useViewer((s) => s.cutaway);
  const items = useLiveItems(level);
  const overlaps = useOverlaps(level, items);
  const bounds = selectLevelMesh(level).bounds;
  const [x0, , z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  const box = useMemo<Box>(() => ({ min: [x0, 0, z0], max: [x1, y1, z1] }), [x0, z0, x1, y1, z1]);
  return (
    <>
      <color attach="background" args={['#f4f2ee']} />
      <SceneLighting level={level} mode="dollhouse" />
      <LevelMeshes level={level} cutaway={cutaway && view === 'orbit'} />
      <Ground box={box} />
      <Items items={items} overlaps={overlaps} />
      <Ghost level={level} />
      <Selection items={items} overlaps={overlaps} />
      <CameraRig box={box} />
      <DebugHook />
    </>
  );
}

declare global {
  interface Window {
    __interio?: {
      ready: boolean;
      store: typeof planStore;
      ui: typeof useViewer;
      registerEntry: typeof registerEntry;
      project(x: number, y: number, z?: number): { x: number; y: number };
      describeItem(id: string): { min: number[]; max: number[]; meshes: string[] } | null;
    };
  }
}
