/**
 * What the path tracer sees in place of each live material. The tracer reads plain
 * MeshStandardMaterial / MeshPhysicalMaterial fields, so every live material gets a
 * physical stand-in tuned for light transport rather than for a rasteriser:
 *
 * - opaque surfaces are double sided: ceilings and floors are single planes, and a
 *   single-sided plane lets the tracer's shadow rays (and so the sun and sky) through
 *   its back;
 * - glass transmits (thin, with real Fresnel) instead of fading with opacity;
 * - lit lamp shades glow and let their lamp's light through; bulbs cast no shadow;
 * - unlit materials (a painted backdrop outside the windows) become emitters of their colour.
 *
 * The live scene is never changed for longer than one synchronous call: `swapIn` puts the
 * stand-ins on the meshes, the caller builds, `swapOut` puts the originals back.
 */
import * as THREE from 'three';

/** How a mesh takes part in the traced image. */
export type TraceRole = 'default' | 'litShade' | 'excluded';

/** The material the live scene uses for a glowing bulb ends with this (see `ItemsLayer`). */
const LIT_SUFFIX = ':lit';

/** Warm glow of a lit fabric shade, linear. */
const SHADE_GLOW = new THREE.Color('#ffd7a8');
const SHADE_GLOW_INTENSITY = 0.55;

type AnyMaterial = THREE.Material & Partial<THREE.MeshPhysicalMaterial> & { isMeshBasicMaterial?: boolean; isMeshStandardMaterial?: boolean };
export type TraceMaterial = THREE.MeshPhysicalMaterial & { castShadow: boolean };

function hasLitBulb(root: THREE.Object3D): boolean {
  let lit = false;
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!lit && (o as THREE.Mesh).isMesh && m && !Array.isArray(m) && m.name.endsWith(LIT_SUFFIX)) lit = true;
  });
  return lit;
}

/** The placed item (a group carrying `userData.itemId`) a mesh belongs to. */
function itemRoot(mesh: THREE.Object3D): THREE.Object3D | null {
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (o.userData?.itemId) return o;
  return null;
}

/** Name of a group above `o` (inclusive) that the tracer leaves out. */
function inExcludedGroup(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    // Baked contact shading: the tracer makes real contact shadows.
    if (p.name === 'contact-shade') return true;
    // Anyone can opt an object out (helpers, markers, animated decorations).
    if (p.userData?.pathTrace === false) return true;
  }
  return false;
}

/** Decides a mesh's role. `litItems` caches lamp roots already checked for a glowing bulb. */
export function traceRole(mesh: THREE.Mesh, litItems: Map<THREE.Object3D, boolean>): TraceRole {
  if (inExcludedGroup(mesh)) return 'excluded';
  const material = mesh.material as AnyMaterial | AnyMaterial[];
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) {
    if (!m) return 'excluded';
    if (m.isMeshStandardMaterial) continue;
    // Translucent unlit overlays (markers, decals) are not surfaces; opaque unlit ones are painted backdrops.
    if (m.isMeshBasicMaterial && (!m.transparent || (m.opacity ?? 1) >= 0.5) && m.depthWrite !== false) continue;
    if ((m as THREE.Material & { isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean }).isMeshLambertMaterial) continue;
    if ((m as THREE.Material & { isMeshPhongMaterial?: boolean }).isMeshPhongMaterial) continue;
    return 'excluded';
  }
  if (mesh.userData?.slot === 'shade') {
    const root = itemRoot(mesh);
    if (root) {
      let lit = litItems.get(root);
      if (lit === undefined) {
        lit = hasLitBulb(root);
        litItems.set(root, lit);
      }
      if (lit) return 'litShade';
    }
  }
  return 'default';
}

const isGlassName = (name: string) => name.startsWith('glass.') && name !== 'glass.mirror';

/** Window panes and other see-through glass that the live view draws as faint transparency. */
function looksLikeGlass(m: AnyMaterial): boolean {
  if (isGlassName(m.name)) return true;
  return m.transparent === true && (m.opacity ?? 1) <= 0.5 && (m.roughness ?? 1) <= 0.15 && (m.metalness ?? 0) < 0.5 && !m.map;
}

/** Copies the fields the tracer reads from `src` onto `out`, then tunes them for tracing. */
export function writeTraceMaterial(material: THREE.Material, role: TraceRole, out: TraceMaterial): TraceMaterial {
  const src = material as AnyMaterial;
  out.name = src.name;
  out.color.copy(src.color ?? WHITE);
  out.map = src.map ?? null;
  out.vertexColors = src.vertexColors === true;
  out.flatShading = src.flatShading === true;
  out.alphaMap = src.alphaMap ?? null;
  out.alphaTest = src.alphaTest ?? 0;
  out.opacity = src.opacity ?? 1;
  out.transparent = src.transparent === true;
  out.castShadow = true;

  if (src.isMeshStandardMaterial) {
    out.roughness = src.roughness ?? 1;
    out.roughnessMap = src.roughnessMap ?? null;
    out.metalness = src.metalness ?? 0;
    out.metalnessMap = src.metalnessMap ?? null;
    out.normalMap = src.normalMap ?? null;
    out.normalScale.copy(src.normalScale ?? ONE2);
    out.emissive.copy(src.emissive ?? BLACK);
    out.emissiveIntensity = src.emissiveIntensity ?? 1;
    out.emissiveMap = src.emissiveMap ?? null;
  } else if (src.isMeshBasicMaterial) {
    // Unlit: it shows its colour whatever the light, so in a traced world it emits that colour.
    out.roughness = 1;
    out.roughnessMap = null;
    out.metalness = 0;
    out.metalnessMap = null;
    out.normalMap = null;
    out.emissive.copy(src.color ?? WHITE);
    out.emissiveMap = src.map ?? null;
    out.emissiveIntensity = 1;
    out.color.setRGB(0, 0, 0);
    out.map = null;
    out.castShadow = false;
  } else {
    // Lambert and Phong: a rough dielectric of the same colour.
    out.roughness = 0.8;
    out.roughnessMap = null;
    out.metalness = 0;
    out.metalnessMap = null;
    out.normalMap = src.normalMap ?? null;
    out.emissive.copy(src.emissive ?? BLACK);
    out.emissiveIntensity = src.emissiveIntensity ?? 1;
    out.emissiveMap = src.emissiveMap ?? null;
  }

  const physical = (src as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial === true;
  out.clearcoat = physical ? src.clearcoat ?? 0 : 0;
  out.clearcoatRoughness = physical ? src.clearcoatRoughness ?? 0 : 0;
  out.sheen = physical ? src.sheen ?? 0 : 0;
  out.sheenRoughness = physical ? src.sheenRoughness ?? 1 : 1;
  out.sheenColor.copy(physical && src.sheenColor ? src.sheenColor : BLACK);
  out.specularIntensity = physical ? src.specularIntensity ?? 1 : 1;
  out.specularColor.copy(physical && src.specularColor ? src.specularColor : WHITE);
  out.ior = physical ? src.ior ?? 1.5 : 1.5;
  out.transmission = physical ? src.transmission ?? 0 : 0;
  out.thickness = physical ? src.thickness ?? 0 : 0;
  out.attenuationDistance = physical ? src.attenuationDistance ?? Infinity : Infinity;
  out.attenuationColor.copy(physical && src.attenuationColor ? src.attenuationColor : WHITE);

  // The tracer's clear coat lobe renders black here (three-gpu-pathtracer 0.0.28, WebGL on ANGLE Metal):
  // fold the coat into the base layer instead, as a glossier dielectric.
  if (out.clearcoat > 0) {
    out.roughness = Math.min(out.roughness, out.roughness + (out.clearcoatRoughness - out.roughness) * out.clearcoat * 0.6);
    out.clearcoat = 0;
  }

  if (out.transmission === 0 && looksLikeGlass(src)) tuneGlass(src, out);
  else if (src.name === 'glass.mirror') {
    out.metalness = 1;
    out.roughness = Math.min(out.roughness, 0.02);
  }

  if (src.name.endsWith(LIT_SUFFIX)) {
    // A glowing bulb: the point light next to it does the lighting, the bulb must not shadow it.
    out.castShadow = false;
  }
  if (role === 'litShade') {
    // Lamplight through the fabric: the shade glows, and its lamp shines through it as in the live view.
    out.emissive.copy(SHADE_GLOW).multiply(out.color);
    out.emissiveIntensity = SHADE_GLOW_INTENSITY;
    out.castShadow = false;
  }

  // Single planes (ceilings, floors) must block light from behind; see the file comment.
  out.side = out.transmission > 0 ? THREE.FrontSide : THREE.DoubleSide;
  out.needsUpdate = true;
  return out;
}

function tuneGlass(src: AnyMaterial, out: TraceMaterial): void {
  const frosted = src.name === 'glass.frosted';
  const smoked = src.name === 'glass.smoked';
  out.transmission = 1;
  out.transparent = false;
  out.opacity = 1;
  out.metalness = 0;
  out.ior = 1.5;
  out.roughness = frosted ? 0.35 : 0.02;
  out.clearcoat = 0;
  // Thin panes: light goes straight through, tinted a little by the glass colour.
  out.thickness = 0;
  out.attenuationDistance = Infinity;
  const tint = new THREE.Color(src.color ?? WHITE);
  out.color.copy(WHITE).lerp(tint, smoked ? 0.85 : 0.25);
  out.map = null;
}

const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);
const ONE2 = new THREE.Vector2(1, 1);

/**
 * Stand-in materials, one per (live material, role), reused across builds so the
 * tracer's material list stays stable (and its material index need not be rebuilt).
 */
export class TraceMaterials {
  private readonly made = new Map<THREE.Material, Partial<Record<TraceRole, TraceMaterial>>>();
  private readonly swapped: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; visible: boolean }[] = [];

  get(src: THREE.Material, role: TraceRole): TraceMaterial {
    let byRole = this.made.get(src);
    if (!byRole) {
      byRole = {};
      this.made.set(src, byRole);
    }
    let out = byRole[role];
    if (!out) {
      out = new THREE.MeshPhysicalMaterial() as TraceMaterial;
      // The tracer reads this deprecated field; an own value keeps three's deprecation warning quiet.
      Object.defineProperty(out, 'iridescenceThicknessRange', { value: [100, 400], writable: true });
      writeTraceMaterial(src, role, out);
      byRole[role] = out;
    }
    return out;
  }

  /** Re-reads every live material (after a finish, texture or lamp change). */
  refresh(): void {
    for (const [src, byRole] of this.made) {
      for (const role of Object.keys(byRole) as TraceRole[]) writeTraceMaterial(src, role, byRole[role]!);
    }
  }

  /** Live materials the last `swapIn` replaced. */
  readonly lastUsed = new Set<THREE.Material>();

  /** Puts the stand-ins on the scene's meshes and hides the excluded ones. Undo with `swapOut`, in the same task. */
  swapIn(scene: THREE.Object3D): void {
    const litItems = new Map<THREE.Object3D, boolean>();
    this.lastUsed.clear();
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const role = traceRole(mesh, litItems);
      this.swapped.push({ mesh, material: mesh.material, visible: mesh.visible });
      if (role === 'excluded') {
        mesh.visible = false;
        return;
      }
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((m) => this.lastUsed.add(m));
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.get(m, role)) : this.get(mesh.material, role);
    });
  }

  /**
   * Meshes the denoiser's guide buffers leave out: what the tracer skips, and glass (the
   * guides should describe what is seen through a window, not the pane).
   */
  guideHidden(scene: THREE.Object3D): THREE.Object3D[] {
    const litItems = new Map<THREE.Object3D, boolean>();
    const hidden: THREE.Object3D[] = [];
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const role = traceRole(mesh, litItems);
      if (role === 'excluded') hidden.push(mesh);
      else {
        const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (first && this.get(first, role).transmission > 0) hidden.push(mesh);
      }
    });
    return hidden;
  }

  swapOut(): void {
    for (const s of this.swapped) {
      s.mesh.material = s.material;
      s.mesh.visible = s.visible;
    }
    this.swapped.length = 0;
  }

  /** Forgets stand-ins whose live material is no longer used. */
  prune(used: Set<THREE.Material>): void {
    for (const [src, byRole] of this.made) {
      if (used.has(src)) continue;
      for (const m of Object.values(byRole)) m?.dispose();
      this.made.delete(src);
    }
  }

  dispose(): void {
    this.swapOut();
    for (const byRole of this.made.values()) for (const m of Object.values(byRole)) m?.dispose();
    this.made.clear();
  }
}
