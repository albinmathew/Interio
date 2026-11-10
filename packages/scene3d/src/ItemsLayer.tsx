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
}

export interface ItemsLayerProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
  /** Optional per-item appearance (selection, warnings). */
  appearanceFor?: (item: Item) => ItemAppearance | undefined;
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

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
  });
}

function ParametricModel({ entry, appearance }: { entry: CatalogEntry; appearance?: ItemAppearance }) {
  const object = useMemo(() => buildParametric(entry), [entry]);
  useEffect(() => () => disposeObject(object), [object]);
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

function ItemModel({ entry, appearance }: { entry: CatalogEntry; appearance?: ItemAppearance }) {
  if (entry.model.kind !== 'glb') return <ParametricModel entry={entry} appearance={appearance} />;
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
export function ItemObject({ item, entry, appearance }: ItemObjectProps) {
  const s = item.scale ?? 1;
  return (
    <group
      name={`item:${item.id}`}
      position={[item.x / 1000, item.z / 1000, -item.y / 1000]}
      rotation={[0, planDegToWorldYaw(item.rotationDeg), 0]}
      scale={[s, s, s]}
      userData={{ itemId: item.id }}
    >
      <ItemModel entry={entry} appearance={appearance} />
    </group>
  );
}

export function ItemsLayer({ level, resolveEntry, appearanceFor }: ItemsLayerProps) {
  return (
    <group name="items">
      {Object.values(level.items).map((item) => {
        const entry = resolveEntry(item.catalogId);
        return entry ? <ItemObject key={item.id} item={item} entry={entry} appearance={appearanceFor?.(item)} /> : null;
      })}
    </group>
  );
}
