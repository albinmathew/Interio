import { planToWorld, selectLevelMesh, selectRooms, type Level } from '@interio/core';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/** Default image-based light: a soft overcast sky (CC0, Poly Haven). See docs/assets/scene3d.md. */
export const DEFAULT_ENVIRONMENT_URL = '/env/kloofendal_overcast_puresky_1k.hdr';

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
}

const environments = new Map<string, Promise<THREE.Texture>>();

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
  const invalidate = useThree((s) => s.invalidate);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const previous = scene.environment;
    loadEnvironment(url)
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
  }, [url, scene, invalidate]);
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

/** Direction towards the sun: from the south-west (plan -x, -y), fairly high, so it reaches into rooms through southern and western openings. */
const SUN_DIRECTION = new THREE.Vector3(-0.55, 1, 0.45).normalize();

function Sun({ level, intensity, color, shadows, mapSize }: { level: Level; intensity: number; color: string; shadows: boolean; mapSize: number }) {
  const light = useMemo(() => new THREE.DirectionalLight(), []);
  const invalidate = useThree((s) => s.invalidate);
  const { min, max } = selectLevelMesh(level).bounds;
  const [x0, , z0] = min;
  const [x1, y1, z1] = max;
  useLayoutEffect(() => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const radius = Math.hypot(x1 - x0, z1 - z0) / 2 + 2;
    const distance = radius + 14;
    light.color.set(color);
    light.intensity = intensity;
    light.position.set(cx + SUN_DIRECTION.x * distance, SUN_DIRECTION.y * distance, cz + SUN_DIRECTION.z * distance);
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
    shadow.radius = 2.5;
    shadow.intensity = 0.8;
    invalidate();
  }, [light, invalidate, intensity, color, shadows, mapSize, x0, x1, z0, z1, y1]);
  useEffect(() => () => light.dispose(), [light]);
  return <primitive object={light} />;
}

/**
 * Lighting for both camera modes: image-based light from a small HDRI, a shadow-casting
 * sun, and fill lights that take over when the HDRI is unavailable.
 */
export function SceneLighting({ level, mode, envUrl = DEFAULT_ENVIRONMENT_URL, shadows = true, shadowMapSize = 2048 }: SceneLightingProps) {
  const dollhouse = mode === 'dollhouse';
  const hasEnv = useEnvironment(envUrl, dollhouse ? 0.4 : 0.3);
  if (dollhouse)
    return (
      <>
        <hemisphereLight args={['#fffaf2', '#cfc6b8', hasEnv ? 0.55 : 0.9]} />
        <Sun level={level} intensity={hasEnv ? 1.7 : 1.6} color="#fff2df" shadows={shadows} mapSize={shadowMapSize} />
      </>
    );
  // Under ceilings: the sun only gets in through windows (ceilings cast shadows), so each room has its own soft lamp.
  const y = (level.ceilingHeight - 250) / 1000;
  return (
    <>
      <ambientLight intensity={hasEnv ? 0.45 : 0.75} />
      <hemisphereLight args={['#ffffff', '#cfc8bb', hasEnv ? 0.35 : 0.6]} />
      <Sun level={level} intensity={2.6} color="#fff0d8" shadows={shadows} mapSize={shadowMapSize} />
      {selectRooms(level).map((room, i) => {
        const [x, , z] = planToWorld(room.centroid);
        const reach = Math.max(room.width, room.depth) / 1000;
        return (
          <pointLight
            key={room.roomId ?? i}
            position={[x, y, z]}
            intensity={reach * 1.8}
            distance={reach * 1.6 + 2}
            decay={1.4}
            color="#fff1dc"
          />
        );
      })}
    </>
  );
}
