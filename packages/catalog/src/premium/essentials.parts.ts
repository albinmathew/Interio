/**
 * Shared pieces of the furnishing-package family (`essentials*.ts`): the finish
 * slot sets, building an existing generator with extra params or another size,
 * and merging extra parts into a model that is already built.
 */
import type { CatalogEntry, FinishSlot } from '@interio/core';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* -------------------------------------------------------------------- slots */

/** Both wardrobes: oak carcass, greige doors, black aluminium profiles and mirror frames. */
export const ESS_WARDROBE_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass', kind: 'wood', default: 'wood.oak' },
  { id: 'fronts', label: 'Doors', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Profiles and frames', kind: 'metal', default: 'metal.black' },
];

/** Bedroom cabinetry (dressing unit, writing table): oak, greige fronts, brass pulls. */
export const ESS_BEDROOM_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Frame and top', kind: 'wood', default: 'wood.oak' },
  { id: 'fronts', label: 'Drawer fronts', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Handles', kind: 'metal', default: 'metal.brass' },
];

/** The dressing unit adds the stool's cushion. */
export const ESS_DRESSING_SLOTS: FinishSlot[] = [...ESS_BEDROOM_SLOTS, { id: 'upholstery', label: 'Stool cushion', kind: 'fabric', default: 'fabric.boucle.cream' }];

/** Shoe cabinet and ledges: oak carcass and ledges, greige fluted flaps, brass pulls and lips. */
export const ESS_SHOE_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass and ledges', kind: 'wood', default: 'wood.oak' },
  { id: 'fronts', label: 'Flaps', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'handles', label: 'Pulls and lips', kind: 'metal', default: 'metal.brass' },
];

/** TV unit: walnut carcass, black glass shutters, brass frames and legs. */
export const ESS_TV_SLOTS: FinishSlot[] = [
  { id: 'carcass', label: 'Carcass', kind: 'wood', default: 'wood.walnut' },
  { id: 'shutters', label: 'Glass shutters', kind: 'lacquer', default: 'lacquer.black.gloss' },
  { id: 'metal', label: 'Frames and legs', kind: 'metal', default: 'metal.brass' },
];

/** Prayer unit: teak, a cream jaali and brass details. */
export const ESS_PRAYER_SLOTS: FinishSlot[] = [
  { id: 'wood', label: 'Wood', kind: 'wood', default: 'wood.teak' },
  { id: 'jaali', label: 'Jaali and niche', kind: 'lacquer', default: 'lacquer.cream' },
  { id: 'brass', label: 'Brass details', kind: 'metal', default: 'metal.brass' },
];

/** Christian prayer unit (altar wall): teak flutes, shelves and top; a backlit ivory niche; greige cabinet fronts. */
export const ESS_ALTAR_SLOTS: FinishSlot[] = [
  { id: 'wood', label: 'Fluted panels and shelves', kind: 'wood', default: 'wood.teak' },
  { id: 'niche', label: 'Backlit niche', kind: 'lacquer', default: 'lacquer.cream' },
  { id: 'fronts', label: 'Cabinet fronts', kind: 'lacquer', default: 'lacquer.greige' },
];

/** Crockery unit: greige carcass and doors; walnut fluted panel, drawers, interiors and plinth; a white quartz counter; brass frames and channels. */
export const ESS_CROCKERY_SLOTS: FinishSlot[] = [
  { id: 'fronts', label: 'Carcass and doors', kind: 'lacquer', default: 'lacquer.greige' },
  { id: 'wood', label: 'Fluted panel, drawers, shelves and plinth', kind: 'wood', default: 'wood.walnut' },
  { id: 'counter', label: 'Counter top', kind: 'stone', default: 'stone.quartz.white' },
  { id: 'metal', label: 'Door frames, pulls and channels', kind: 'metal', default: 'metal.brass' },
];

/** Every Roman blind width: linen shade, a contrast border, brass hardware. */
export const ESS_BLIND_SLOTS: FinishSlot[] = [
  { id: 'fabric', label: 'Shade', kind: 'fabric', default: 'fabric.linen.sand' },
  { id: 'trim', label: 'Border', kind: 'fabric', default: 'fabric.linen.taupe' },
  { id: 'hardware', label: 'Headrail and cord', kind: 'metal', default: 'metal.brass' },
];

export const ESS_CLOCK_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Frame and numerals', kind: 'metal', default: 'metal.black' },
  { id: 'hands', label: 'Hands', kind: 'metal', default: 'metal.brass' },
];

export const ESS_SUNBURST_SLOTS: FinishSlot[] = [
  { id: 'frame', label: 'Rays', kind: 'metal', default: 'metal.brass' },
  { id: 'glass', label: 'Glass', kind: 'glass', default: 'glass.mirror' },
];

export const ESS_PARTITION_SLOTS: FinishSlot[] = [
  { id: 'slats', label: 'Slats', kind: 'wood', default: 'wood.oak' },
  { id: 'frame', label: 'Frame and plinth', kind: 'metal', default: 'metal.black' },
];

export const ESS_COFFEE_SLOTS: FinishSlot[] = [
  { id: 'top', label: 'Top', kind: 'stone', default: 'stone.travertine' },
  { id: 'base', label: 'Base', kind: 'wood', default: 'wood.walnut' },
  { id: 'accent', label: 'Plinth band', kind: 'metal', default: 'metal.brass' },
];

/* ---------------------------------------------------------------- variants */

/**
 * The same entry for another generator's eyes: `defaults` under the entry's own
 * params, and optionally another size (mm). Slots and finishes stay the entry's.
 */
export function variant(entry: CatalogEntry, defaults: Record<string, unknown>, dims?: Partial<CatalogEntry['dims']>): CatalogEntry {
  const own = entry.model.kind === 'parametric' ? (entry.model.params ?? {}) : {};
  const generator = entry.model.kind === 'parametric' ? entry.model.generator : 'box';
  return { ...entry, dims: { ...entry.dims, ...dims }, model: { kind: 'parametric', generator, params: { ...defaults, ...own } } };
}

/**
 * Moves the meshes of `extra` by (dx, dy, dz) and merges them into the meshes of
 * `base` that carry the same slot or material, so a finished model gains parts
 * without gaining draw calls. Meshes without a match are moved over as they are.
 */
export function absorb(base: THREE.Object3D, extra: THREE.Object3D, dx = 0, dy = 0, dz = 0): THREE.Object3D {
  const meshes: THREE.Mesh[] = [];
  extra.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const g = mesh.geometry.clone().translate(dx, dy, dz);
    const twin = base.children.find((c) => (c as THREE.Mesh).isMesh && c.name === mesh.name && c.userData.slot === mesh.userData.slot) as THREE.Mesh | undefined;
    if (twin) {
      const merged = mergeGeometries([twin.geometry, g], false);
      if (!merged) throw new Error(`absorb: cannot merge ${mesh.name}`);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      twin.geometry.dispose();
      twin.geometry = merged;
    } else {
      g.computeBoundingBox();
      g.computeBoundingSphere();
      const copy = new THREE.Mesh(g, mesh.material);
      copy.name = mesh.name;
      copy.userData = { ...mesh.userData };
      copy.castShadow = mesh.castShadow;
      copy.receiveShadow = mesh.receiveShadow;
      copy.renderOrder = mesh.renderOrder;
      base.add(copy);
    }
  }
  base.children.sort((a, b) => a.renderOrder - b.renderOrder);
  return base;
}

/** Moves every mesh of a built model by (dx, dy, dz). */
export function shift(object: THREE.Object3D, dx: number, dy: number, dz: number): THREE.Object3D {
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const g = (o as THREE.Mesh).geometry.translate(dx, dy, dz);
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
  });
  return object;
}
