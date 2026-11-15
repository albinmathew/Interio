/**
 * Glowing parts: LED strips and lit panels. A built part's material is the catalog's shared
 * material for its finish, so a glowing copy is made per source material and swapped in on
 * the part only; every other item with that finish stays unlit.
 */
import * as THREE from 'three';

export interface Glow {
  tint: THREE.Color;
  intensity: number;
  /** Scales the surface colour. */
  surface: number;
}

/** A warm LED strip: well above the walk view's bloom threshold. */
export const LED_GLOW: Glow = { tint: new THREE.Color('#fff4e4'), intensity: 1.6, surface: 1 };

const copies = new WeakMap<THREE.Material, Map<Glow, THREE.Material>>();

/** A glowing copy of a material, shared per source material and glow. */
export function glowOf(source: THREE.Material, glow: Glow): THREE.Material {
  let byGlow = copies.get(source);
  if (!byGlow) copies.set(source, (byGlow = new Map()));
  let m = byGlow.get(glow);
  if (!m) {
    // A standard material, not a physical clone: the renderer's lite mode swaps physical
    // materials for plain ones without emissive, which would leave the strip unlit.
    const src = source as THREE.MeshStandardMaterial;
    const base = src.color?.clone() ?? new THREE.Color('#ffffff');
    m = new THREE.MeshStandardMaterial({
      name: source.name,
      color: base.clone().multiplyScalar(glow.surface),
      map: src.map ?? null,
      normalMap: src.normalMap ?? null,
      roughnessMap: src.roughnessMap ?? null,
      roughness: src.roughness ?? 0.5,
      metalness: src.metalness ?? 0,
      emissive: base.lerp(new THREE.Color('#ffffff'), 0.3).multiply(glow.tint),
      emissiveIntensity: glow.intensity,
    });
    byGlow.set(glow, m);
  }
  return m;
}

/** Lights the fixed-material parts named `name` (an LED colour) in a built model. They cast no shadow. */
export function lightStrips<T extends THREE.Object3D>(object: T, name: string, glow: Glow = LED_GLOW): T {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.slot || mesh.material.name !== name) return;
    mesh.material = glowOf(mesh.material, glow);
    mesh.castShadow = false;
  });
  return object;
}
