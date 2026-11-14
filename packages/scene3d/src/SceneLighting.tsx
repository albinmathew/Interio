import { selectLevelMesh, selectRooms, type CatalogEntry, type Level } from '@interio/core';
import type { RenderQuality } from './quality';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadPanorama } from './Backdrop';
import { OUTSIDE_ASSETS } from './outside';
import { DEFAULT_LIGHTING_PRESET, MAX_INTERIOR_LIGHTS, interiorLights, lightSlots, lightingRig, type LightingMode, type LightingPreset, type PointLightSpec } from './lighting';

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
  mode: LightingMode;
  /** Points from the scene towards the sun; overrides the preset's fixed direction (see `planSun`). */
  sunDirection?: [number, number, number];
  /** Turn of the image-based light about the vertical, radians (matches the outside backdrop). */
  environmentRotation?: number;
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
  // The outside panoramas are read for their sun as they load: share that copy.
  if (!p && Object.values(OUTSIDE_ASSETS).some((a) => a.hdr === url)) {
    p = loadPanorama(url).then((info) => info.texture);
    environments.set(url, p);
  }
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
function useEnvironment(url: string | null, intensity: number, rotation: number): boolean {
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
  useEffect(() => {
    const previous = scene.environmentRotation.y;
    scene.environmentRotation.y = rotation;
    invalidate();
    return () => {
      scene.environmentRotation.y = previous;
    };
  }, [scene, rotation, invalidate]);
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
  /** Darkness of the shadow, 0..1. */
  darkness: number;
}

function Sun({ level, intensity, color, direction, shadows, mapSize, softness, darkness }: SunProps) {
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
    shadow.intensity = darkness;
    invalidate();
  }, [light, invalidate, intensity, color, dx, dy, dz, shadows, mapSize, softness, darkness, x0, x1, z0, z1, y1]);
  useEffect(() => () => light.dispose(), [light]);
  return <primitive object={light} />;
}

interface LampsProps {
  level: Level;
  color: string;
  scale: number;
  roomScale?: number;
  /** Physical falloff (inverse square) with a brighter source: pools of light instead of an even wash. */
  pools?: boolean;
  resolveEntry?: (catalogId: string) => CatalogEntry | undefined;
  max?: number;
}

/**
 * Ceiling lights as soft downward spots: a pool on the table and the floor, walls lit from
 * above, a ceiling that stays calm instead of burning a hot spot above every fitting.
 */
function DownLights({ lights, slots, color }: { lights: PointLightSpec[]; slots: number; color: string }) {
  const spots = useMemo(
    () =>
      Array.from({ length: slots }, () => {
        const spot = new THREE.SpotLight(color, 0, 0, 1.15, 0.85, 2);
        spot.target.matrixAutoUpdate = false;
        return spot;
      }),
    [slots], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useLayoutEffect(() => {
    spots.forEach((spot, i) => {
      const l = lights[i];
      spot.color.set(color);
      spot.intensity = l ? l.intensity * 4.2 : 0;
      spot.distance = l ? l.distance : 1;
      const [x, y, z] = l?.position ?? [0, 0, 0];
      spot.position.set(x, y, z);
      spot.target.position.set(x, 0, z);
      spot.target.updateMatrixWorld();
    });
  }, [spots, lights, color]);
  useEffect(() => () => spots.forEach((s) => s.dispose()), [spots]);
  return (
    <>
      {spots.map((spot, i) => (
        <primitive key={i} object={spot} />
      ))}
    </>
  );
}

/** The lights inside the rooms: one per room, or the lamps placed from the catalog. */
function Lamps({ level, color, scale, roomScale, pools, resolveEntry, max }: LampsProps) {
  const { items, ceilingHeight } = level;
  const rooms = selectRooms(level);
  const all = useMemo(
    () => interiorLights({ items, ceilingHeight }, rooms, { scale, resolveEntry, max, roomScale }),
    [items, ceilingHeight, rooms, scale, resolveEntry, max, roomScale],
  );
  // With pools, overhead lights become downward spots and only shaded lamps stay point lights.
  const down = useMemo(() => (pools ? all.filter((l) => l.overhead) : []), [all, pools]);
  const lights = useMemo(() => (pools ? all.filter((l) => !l.overhead) : all), [all, pools]);
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
            intensity={(light?.intensity ?? 0) * (pools ? 1.6 : 1)}
            distance={light?.distance ?? 1}
            decay={pools ? 2 : (light?.decay ?? 2)}
            color={color}
          />
        );
      })}
      {pools && <DownLights lights={down} slots={max === undefined ? down.length : lightSlots(down.length, max)} color={color} />}
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
  sunDirection,
  environmentRotation = 0,
}: SceneLightingProps) {
  const low = quality === 'low';
  const hasEnv = useEnvironment(envUrl, lightingRig(preset, mode).environment, environmentRotation);
  const rig = lightingRig(preset, mode, hasEnv);
  const cinematic = mode === 'cinematic';
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
      {sun && (
        <Sun
          level={level}
          intensity={sun.intensity}
          color={sun.color}
          direction={sunDirection ?? sun.direction}
          shadows={shadows && !low}
          mapSize={shadowMapSize}
          softness={shadowSoftness}
          darkness={cinematic ? 1 : 0.8}
        />
      )}
      {lamps && !low && (
        <Lamps
          level={level}
          color={lamps.color}
          scale={lamps.scale}
          roomScale={lamps.room}
          pools={cinematic}
          resolveEntry={lamps.fromItems ? resolveEntry : undefined}
          max={lamps.fromItems ? maxLamps : undefined}
        />
      )}
    </>
  );
}
