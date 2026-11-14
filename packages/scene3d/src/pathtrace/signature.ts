/**
 * Cheap fingerprints of the live scene and view, compared every frame while photo mode
 * waits or traces, so any edit (an item moved, a finish changed, a lamp switched on, the
 * outside view swapped) is noticed at once and only the affected part is re-uploaded.
 */
import * as THREE from 'three';
import { Hasher, type SceneSignature } from './plan';
import { traceRole } from './proxies';

type Mat = THREE.Material & Partial<THREE.MeshPhysicalMaterial> & { isMeshBasicMaterial?: boolean };

const texId = (h: Hasher, t: THREE.Texture | null | undefined) => (t ? h.str(t.uuid).int(t.version) : h.int(0));
const color = (h: Hasher, c: THREE.Color | undefined) => (c ? h.num(c.r).num(c.g).num(c.b) : h.int(0));

/**
 * The values the tracer reads. Not `material.version`: three bumps it every frame while it
 * draws a transparent double-sided material (back faces, then front faces).
 */
function signMaterial(h: Hasher, m: Mat): void {
  h.str(m.uuid).str(m.name).num(m.opacity).bool(m.transparent).int(m.side).bool(m.visible);
  color(h, m.color);
  color(h, m.emissive);
  h.num(m.roughness ?? -1).num(m.metalness ?? -1).num(m.emissiveIntensity ?? -1);
  h.num(m.clearcoat ?? -1).num(m.sheen ?? -1).num(m.transmission ?? -1).num(m.ior ?? -1);
  texId(h, m.map);
  texId(h, m.normalMap);
  texId(h, m.roughnessMap);
  texId(h, m.metalnessMap);
  texId(h, m.emissiveMap);
  texId(h, m.alphaMap);
}

/** Fingerprints the scene. Run on the live scene, never while stand-in materials are swapped in. */
export function signScene(scene: THREE.Scene): SceneSignature {
  const structure = new Hasher();
  const materials = new Hasher();
  const lights = new Hasher();
  const seen = new Set<THREE.Material>();
  const litItems = new Map<THREE.Object3D, boolean>();

  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      // What the tracer leaves out (baked contact shading, markers) cannot make its picture stale.
      const role = traceRole(mesh, litItems);
      if (role === 'excluded') return;
      const g = mesh.geometry;
      structure.str(mesh.uuid).str(role).str(g.uuid).int(g.index?.version ?? -1);
      const pos = g.getAttribute('position');
      structure.int(pos ? (pos as THREE.BufferAttribute).version ?? 0 : -1).int(pos?.count ?? 0);
      structure.nums(mesh.matrixWorld.elements);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) {
        if (!m) continue;
        structure.str(m.uuid);
        if (!seen.has(m)) {
          seen.add(m);
          signMaterial(materials, m as Mat);
        }
      }
      return;
    }
    const light = o as THREE.Light & Partial<THREE.PointLight & THREE.DirectionalLight & THREE.SpotLight>;
    if (light.isLight) {
      lights.str(light.uuid).str(light.type).num(light.intensity);
      color(lights, light.color);
      lights.nums(light.matrixWorld.elements);
      lights.num(light.distance ?? -1).num(light.decay ?? -1).num(light.angle ?? -1).num(light.penumbra ?? -1);
      if (light.target) lights.nums(light.target.matrixWorld.elements);
    }
  });

  const environment = new Hasher();
  const env = scene.environment;
  texId(environment, env);
  environment.num(scene.environmentIntensity).nums(scene.environmentRotation.toArray().slice(0, 3) as number[]);
  const bg = scene.background as THREE.Color | THREE.Texture | null;
  if (bg && (bg as THREE.Color).isColor) color(environment, bg as THREE.Color);
  else texId(environment, bg as THREE.Texture | null);
  environment.num(scene.backgroundIntensity).num(scene.backgroundBlurriness).nums(scene.backgroundRotation.toArray().slice(0, 3) as number[]);

  return { structure: structure.value, materials: materials.value, lights: lights.value, environment: environment.value };
}

