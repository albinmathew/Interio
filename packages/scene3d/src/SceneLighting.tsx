import { selectLevelMesh, selectRooms, type CatalogEntry, type Level } from '@interio/core';
import type { RenderQuality } from './quality';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DEFAULT_LIGHTING_PRESET, MAX_INTERIOR_LIGHTS, interiorLights, lightSlots, lightingRig, type LightingPreset } from './lighting';

/** Default image-based light: a soft overcast sky (CC0, Poly Haven). See docs/assets/scene3d.md. */
export const DEFAULT_ENVIRONMENT_URL = '/env/kloofendal_overcast_puresky_1k.hdr';

/**
 * `envUrl` value for a neutral studio room (three's `RoomEnvironment`, built on the GPU, no
 * download): soft, even, slightly warm reflections that make glass, mirrors, metal and
 * lacquer read as such indoors.
 */
export const ROOM_ENVIRONMENT = 'room';

export interface SceneLightingProps {
  level: Level;
  /**
   * `dollhouse`: sun from above with shadows, for the open-top 3D view.
   * `interior`: lit from inside each room, for walking under ceilings.
   */
  mode: 'dollhouse' | 'interior';
  /** Equirectangular .hdr used for image-based lighting. `null` turns it off. */
  envUrl?: string | null;
  /** The sun casts shadows. Default true. */
  shadows?: boolean;
  /** Shadow map size in pixels. Default 2048. */
  shadowMapSize?: number;
  /** Blur radius of the sun's shadow edge (PCF), in shadow-map texels. Default 2.5. */
  shadowSoftness?: number;
  /** Time of day. Default `daylight`, the look both views always had. */
  preset?: LightingPreset;
  /** Lets lamps placed from the catalog light their rooms in the evening and night presets. */
  resolveEntry?: (catalogId: string) => CatalogEntry | undefined;
  /** Most lamps lit at once in the evening and night presets. Default 12. */
  maxLamps?: number;
  /**
   * `low` is for software renderers and slow devices: no shadow pass and no per-room
   * point lights (a flat fill stands in for them). Default `high`.
   */
  quality?: RenderQuality;
}

const environments = new Map<string, Promise<THREE.Texture>>();

const rooms = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** A prefiltered neutral room for image-based light, built once per renderer. */
function roomEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  let texture = rooms.get(gl);
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    texture = pmrem.fromScene(room, 0.035).texture;
    room.dispose();
    pmrem.dispose();
    rooms.set(gl, texture);
  }
  return texture;
}

function loadEnvironment(url: string): Promise<THREE.Texture> {
  let p = environments.get(url);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      new HDRLoader().load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          resolve(texture);
        },
        undefined,
        () => reject(new Error(`Environment map not found: ${url}`)),
      );
    });
    environments.set(url, p);
  }
  return p;
}

/** Sets `scene.environment` while mounted. Returns true once the map is in place. */
function useEnvironment(url: string | null, intensity: number): boolean {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const previous = scene.environment;
    (url === ROOM_ENVIRONMENT ? Promise.resolve(roomEnvironment(gl)) : loadEnvironment(url))
      .then((texture) => {
        if (!alive) return;
        scene.environment = texture;
        setLoaded(true);
        invalidate();
      })
      .catch(() => {
        // No environment map: the fill lights below carry the scene.
      });
    return () => {
      alive = false;
      scene.environment = previous;
      setLoaded(false);
    };
  }, [url, scene, gl, invalidate]);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => {
      scene.environmentIntensity = previous;
    };
  }, [scene, intensity, invalidate, loaded]);
  return loaded;
}

interface SunProps {
  level: Level;
  intensity: number;
  color: string;
  /** Points from the scene towards the light. */
  direction: [number, number, number];
  shadows: boolean;
  mapSize: number;
  softness: number;
}

function Sun({ level, intensity, color, direction, shadows, mapSize, softness }: SunProps) {
  const light = useMemo(() => new THREE.DirectionalLight(), []);
  const invalidate = useThree((s) => s.invalidate);
  const { min, max } = selectLevelMesh(level).bounds;
  const [x0, , z0] = min;
  const [x1, y1, z1] = max;
  const [dx, dy, dz] = direction;
  useLayoutEffect(() => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const radius = Math.hypot(x1 - x0, z1 - z0) / 2 + 2;
    const distance = radius + 14;
    const towards = new THREE.Vector3(dx, dy, dz).normalize();
    light.color.set(color);
    light.intensity = intensity;
    light.position.set(cx + towards.x * distance, towards.y * distance, cz + towards.z * distance);
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    light.castShadow = shadows;
    const shadow = light.shadow;
    if (shadow.mapSize.x !== mapSize) {
      shadow.mapSize.set(mapSize, mapSize);
      shadow.map?.dispose();
      shadow.map = null;
    }
    const cam = shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = distance + radius + y1 + 2;
    cam.updateProjectionMatrix();
    shadow.bias = -0.0004;
    shadow.normalBias = 0.03;
    shadow.radius = softness;
    shadow.blurSamples = 12;
    shadow.intensity = 0.8;
    invalidate();
  }, [light, invalidate, intensity, color, dx, dy, dz, shadows, mapSize, softness, x0, x1, z0, z1, y1]);
  useEffect(() => () => light.dispose(), [light]);
  return <primitive object={light} />;
}

interface LampsProps {
  level: Level;
  color: string;
  scale: number;
  resolveEntry?: (catalogId: string) => CatalogEntry | undefined;
  max?: number;
}

/** The lights inside the rooms: one per room, or the lamps placed from the catalog. */
function Lamps({ level, color, scale, resolveEntry, max }: LampsProps) {
  const { items, ceilingHeight } = level;
  const rooms = selectRooms(level);
  const lights = useMemo(() => interiorLights({ items, ceilingHeight }, rooms, { scale, resolveEntry, max }), [items, ceilingHeight, rooms, scale, resolveEntry, max]);
  // A steady number of slots (the spare ones are dark) keeps materials from recompiling whenever a lamp comes or goes.
  const slots = max === undefined ? lights.length : lightSlots(lights.length, max);
  return (
    <>
      {Array.from({ length: slots }, (_, i) => {
        const light = lights[i];
        return (
          <pointLight
            key={i}
            position={light?.position ?? [0, 0, 0]}
            intensity={light?.intensity ?? 0}
            distance={light?.distance ?? 1}
            decay={light?.decay ?? 2}
            color={color}
          />
        );
      })}
    </>
  );
}

/**
 * Lighting for both camera modes: image-based light from a small HDRI, a shadow-casting
 * sun, and fill lights that take over when the HDRI is unavailable. `preset` picks the
 * time of day: evening and night dim the sky and switch the lamps on.
 */
export function SceneLighting({
  level,
  mode,
  envUrl = DEFAULT_ENVIRONMENT_URL,
  shadows = true,
  shadowMapSize = 2048,
  shadowSoftness = 2.5,
  preset = DEFAULT_LIGHTING_PRESET,
  resolveEntry,
  maxLamps = MAX_INTERIOR_LIGHTS,
  quality = 'high',
}: SceneLightingProps) {
  const low = quality === 'low';
  const hasEnv = useEnvironment(envUrl, lightingRig(preset, mode).environment);
  const rig = lightingRig(preset, mode, hasEnv);
  const { hemisphere, bounce, sun, lamps } = rig;
  return (
    <>
      {/* Little flat fill, so surfaces keep their shading. */}
      {(rig.ambient > 0 || (low && lamps)) && <ambientLight intensity={rig.ambient + (low && lamps ? 0.55 : 0)} color={low && lamps ? lamps.color : undefined} />}
      {/* The ground colour lights what faces down: ceilings, door heads. */}
      <hemisphereLight color={hemisphere.sky} groundColor={hemisphere.ground} intensity={hemisphere.intensity} />
      {/* Light bounced off the floor: keeps ceilings, door heads and the undersides of furniture from going grey. */}
      {bounce.intensity > 0 && <directionalLight position={[0, -1, 0]} intensity={bounce.intensity} color={bounce.color} />}
      {/* Under ceilings the sun only gets in through windows (ceilings cast shadows), so the rooms have lamps of their own. */}
      {sun && <Sun level={level} intensity={sun.intensity} color={sun.color} direction={sun.direction} shadows={shadows && !low} mapSize={shadowMapSize} softness={shadowSoftness} />}
      {lamps && !low && (
        <Lamps
          level={level}
          color={lamps.color}
          scale={lamps.scale}
          resolveEntry={lamps.fromItems ? resolveEntry : undefined}
          max={lamps.fromItems ? maxLamps : undefined}
        />
      )}
    </>
  );
}
