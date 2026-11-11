import { buildParametric } from '@interio/catalog';
import { planDegToWorldYaw, type CatalogEntry, type Item, type Level } from '@interio/core';
import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fitModel } from './fit';

/** How an item is drawn on top of its own materials: placement ghosts, warnings, hover. */
export interface ItemAppearance {
  /** 0..1. Below 1 the item is translucent and casts no shadow. */
  opacity?: number;
  /** Colour added to every material (a tint that survives any texture). */
  emissive?: string;
  emissiveIntensity?: number;
}

export interface ItemObjectProps {
  item: Item;
  entry: CatalogEntry;
  appearance?: ItemAppearance;
  /** Lamps are switched on: the bulbs of lighting entries glow (evening and night). */
  lit?: boolean;
  /**
   * Cheaper shading for software renderers: physical materials (sheen, clear coat) are
   * drawn as standard ones with the same colour, map and roughness.
   */
  lite?: boolean;
}

export interface ItemsLayerProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
  /** Optional per-item appearance (selection, warnings). */
  appearanceFor?: (item: Item) => ItemAppearance | undefined;
  /** Lamps are switched on: the bulbs of lighting entries glow. */
  lampsLit?: boolean;
  /** Cheaper shading for software renderers (see `ItemObjectProps.lite`). */
  lite?: boolean;
}

type Tintable = THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number };

/** Swaps every material under `root` for a tinted/translucent copy. Returns the undo function. */
function applyAppearance(root: THREE.Object3D, a: ItemAppearance): () => void {
  const undo: (() => void)[] = [];
  const opacity = a.opacity ?? 1;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const cast = mesh.castShadow;
    const copy = (m: THREE.Material): THREE.Material => {
      const c = m.clone() as Tintable;
      if (opacity < 1) {
        c.transparent = true;
        c.opacity = m.opacity * opacity;
        c.depthWrite = false;
      }
      if (a.emissive && c.emissive) {
        c.emissive.set(a.emissive);
        c.emissiveIntensity = a.emissiveIntensity ?? 0.35;
      }
      return c;
    };
    const copies = Array.isArray(original) ? original.map(copy) : copy(original);
    mesh.material = copies;
    if (opacity < 1) mesh.castShadow = false;
    undo.push(() => {
      mesh.material = original;
      mesh.castShadow = cast;
      (Array.isArray(copies) ? copies : [copies]).forEach((c) => c.dispose());
    });
  });
  return () => undo.forEach((f) => f());
}

function useAppearance(root: THREE.Object3D, a: ItemAppearance | undefined): void {
  const opacity = a?.opacity;
  const emissive = a?.emissive;
  const intensity = a?.emissiveIntensity;
  useLayoutEffect(() => {
    if ((opacity === undefined || opacity >= 1) && !emissive) return;
    return applyAppearance(root, { opacity, emissive, emissiveIntensity: intensity });
  }, [root, opacity, emissive, intensity]);
}

/** Material of a lamp's bulb in the premium set (a fixed part of every lighting model). */
export const BULB_MATERIAL = 'lacquer.white.gloss';

const glowing = new THREE.MeshStandardMaterial({
  name: `${BULB_MATERIAL}:lit`,
  color: '#fff4e2',
  emissive: '#ffd59a',
  emissiveIntensity: 2.4,
  roughness: 0.4,
});

/** While `lit`, the bulbs of a lighting model glow. Only lighting entries are touched: gloss white elsewhere stays gloss white. */
function useBulbs(root: THREE.Object3D, entry: CatalogEntry, lit: boolean): void {
  useLayoutEffect(() => {
    if (!lit || entry.category !== 'lighting') return;
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.Material | undefined;
      if (mesh.isMesh && m && !Array.isArray(m) && m.name === BULB_MATERIAL) {
        swapped.push([mesh, m]);
        mesh.material = glowing;
        mesh.castShadow = false;
      }
    });
    return () => {
      for (const [mesh, m] of swapped) {
        mesh.material = m;
        mesh.castShadow = true;
      }
    };
  }, [root, entry, lit]);
}

/**
 * Glass and mirrors in flat, top-down light: plain transparency makes clear glass all but
 * vanish, so glass takes more of the environment's reflections (which transparency would
 * otherwise scale down) and a faint body tint. Materials are shared, so each is tuned once.
 */
function tuneGlass(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as THREE.MeshPhysicalMaterial | undefined;
    if (!mesh.isMesh || !m || Array.isArray(m) || !m.isMeshPhysicalMaterial || m.userData.glassTuned || !m.name.startsWith('glass.')) return;
    m.userData.glassTuned = true;
    if (m.name === 'glass.mirror') {
      m.envMapIntensity = 1.6;
      m.roughness = Math.min(m.roughness, 0.02);
    } else {
      m.envMapIntensity = 3.2;
      m.opacity = Math.max(m.opacity, m.name === 'glass.clear' ? 0.3 : m.opacity);
      m.specularIntensity = 1;
      m.clearcoat = 1;
      m.clearcoatRoughness = 0.04;
    }
    m.needsUpdate = true;
  });
}

const standIns = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

/** A standard material that looks like `m` without the physical extras. Shared per source material. */
function standIn(m: THREE.MeshPhysicalMaterial): THREE.MeshStandardMaterial {
  let s = standIns.get(m);
  if (!s) {
    s = new THREE.MeshStandardMaterial({
      name: m.name,
      color: m.color,
      map: m.map,
      roughness: m.roughness,
      metalness: m.metalness,
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
      depthWrite: m.depthWrite,
      envMapIntensity: m.envMapIntensity,
    });
    standIns.set(m, s);
  }
  return s;
}

/** On software renderers, draws physical materials as standard ones (see `ItemObjectProps.lite`). */
function useLite(root: THREE.Object3D, lite: boolean): void {
  useLayoutEffect(() => {
    if (!lite) return;
    const swapped: [THREE.Mesh, THREE.Material][] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshPhysicalMaterial | undefined;
      if (mesh.isMesh && m && !Array.isArray(m) && m.isMeshPhysicalMaterial) {
        swapped.push([mesh, m]);
        mesh.material = standIn(m);
      }
    });
    return () => {
      for (const [mesh, m] of swapped) mesh.material = m;
    };
  }, [root, lite]);
}

/** Frees the geometry of a generated model. Its materials are shared by every item of that finish and stay. */
function disposeGeometry(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

function ParametricModel({
  entry,
  finishes,
  appearance,
  lit = false,
  lite = false,
}: {
  entry: CatalogEntry;
  finishes?: Record<string, string>;
  appearance?: ItemAppearance;
  lit?: boolean;
  lite?: boolean;
}) {
  // Rebuild when the item's own finishes change (a new upholstery, another wood).
  const finishKey = finishes ? JSON.stringify(finishes) : '';
  const object = useMemo(() => {
    const built = buildParametric(entry, finishes);
    tuneGlass(built);
    return built;
  }, [entry, finishKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => disposeGeometry(object), [object]);
  useLite(object, lite);
  useBulbs(object, entry, lit);
  useAppearance(object, appearance);
  return <primitive object={object} />;
}

/** The box stand-in used while a GLB loads, or when it cannot be loaded. */
function BoxModel({ entry, appearance }: { entry: CatalogEntry; appearance?: ItemAppearance }) {
  const box = useMemo<CatalogEntry>(() => ({ ...entry, model: { kind: 'parametric', generator: 'box' } }), [entry]);
  return <ParametricModel entry={box} appearance={appearance} />;
}

interface GlbProps {
  entry: CatalogEntry;
  url: string;
  yawDeg?: number;
  appearance?: ItemAppearance;
}

/** One instance of a loaded GLB scene, fitted to the entry's dimensions. */
function GlbInstance({ scene, entry, yawDeg, appearance }: Omit<GlbProps, 'url'> & { scene: THREE.Object3D }) {
  const { w, d, h } = entry.dims;
  const { object, fit } = useMemo(() => {
    // One clone per placed item: the loader cache keeps the original, materials and geometry are shared.
    const instance = cloneSkinned(scene);
    instance.updateMatrixWorld(true);
    instance.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    // Exact bounds from the vertices: a model that is already baked to `dims` must come out untouched.
    const box = new THREE.Box3().setFromObject(instance, true);
    const bounds = { min: box.min.toArray(), max: box.max.toArray() };
    return { object: instance, fit: fitModel(bounds, { w, d, h }, yawDeg) };
  }, [scene, w, d, h, yawDeg]);
  useAppearance(object, appearance);
  return (
    <group scale={fit.scale}>
      <group position={fit.offset}>
        <group rotation={[0, fit.yaw, 0]}>
          <primitive object={object} />
        </group>
      </group>
    </group>
  );
}

const failed = new Set<string>();

/** Loads the GLB (suspending while it downloads). A file that cannot be loaded renders as the box. */
function GlbModel({ url, ...rest }: GlbProps) {
  let scene: THREE.Object3D;
  try {
    scene = useGLTF(url).scene;
  } catch (thrown) {
    // Still loading: let Suspense show the fallback.
    if (thrown instanceof Promise) throw thrown;
    if (!failed.has(url)) {
      failed.add(url);
      console.warn(`Model ${url} could not be loaded; showing a box instead.`, thrown);
    }
    return <BoxModel entry={rest.entry} appearance={rest.appearance} />;
  }
  return <GlbInstance scene={scene} {...rest} />;
}

/** Last line of defence: shows `fallback` if a model throws while rendering, instead of taking the scene down. */
interface BoundaryProps {
  resetKey: string;
  fallback: ReactNode;
  children: ReactNode;
}
interface BoundaryState {
  failed: boolean;
  key: string;
}

class ModelBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  override componentDidCatch(error: unknown): void {
    console.warn(`Model ${this.props.resetKey} failed to render; showing a box instead.`, error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ItemModel({ entry, finishes, appearance, lit, lite }: { entry: CatalogEntry; finishes?: Record<string, string>; appearance?: ItemAppearance; lit?: boolean; lite?: boolean }) {
  if (entry.model.kind !== 'glb') return <ParametricModel entry={entry} finishes={finishes} appearance={appearance} lit={lit} lite={lite} />;
  const box = <BoxModel entry={entry} appearance={appearance} />;
  return (
    <ModelBoundary resetKey={entry.model.url} fallback={box}>
      <Suspense fallback={box}>
        <GlbModel entry={entry} url={entry.model.url} yawDeg={entry.model.yawDeg} appearance={appearance} />
      </Suspense>
    </ModelBoundary>
  );
}

/**
 * One placed item. Parametric entries are built by the catalog; GLB entries are loaded,
 * cloned per instance and fitted to `entry.dims` with their bottom-centre on the item
 * position (a box stands in while loading or when the file is missing).
 */
export function ItemObject({ item, entry, appearance, lit, lite }: ItemObjectProps) {
  const s = item.scale ?? 1;
  return (
    <group
      name={`item:${item.id}`}
      position={[item.x / 1000, item.z / 1000, -item.y / 1000]}
      rotation={[0, planDegToWorldYaw(item.rotationDeg), 0]}
      scale={[s, s, s]}
      userData={{ itemId: item.id }}
    >
      <ItemModel entry={entry} finishes={item.finishes} appearance={appearance} lit={lit} lite={lite} />
    </group>
  );
}

export function ItemsLayer({ level, resolveEntry, appearanceFor, lampsLit, lite }: ItemsLayerProps) {
  return (
    <group name="items">
      {Object.values(level.items).map((item) => {
        const entry = resolveEntry(item.catalogId);
        return entry ? <ItemObject key={item.id} item={item} entry={entry} appearance={appearanceFor?.(item)} lit={lampsLit} lite={lite} /> : null;
      })}
    </group>
  );
}
