import { buildParametric } from '@interio/catalog';
import { planDegToWorldYaw, type CatalogEntry, type Item, type Level } from '@interio/core';
import { useMemo } from 'react';
import * as THREE from 'three';

export interface ItemsLayerProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
}

function placeholder(entry: CatalogEntry): THREE.Object3D {
  return buildParametric({ ...entry, model: { kind: 'parametric', generator: 'box' } });
}

/** One placed item. Baseline: parametric models, and a box stand-in for GLB entries. */
export function ItemObject({ item, entry }: { item: Item; entry: CatalogEntry }) {
  const object = useMemo(
    () => (entry.model.kind === 'parametric' ? buildParametric(entry) : placeholder(entry)),
    [entry],
  );
  const s = item.scale ?? 1;
  return (
    <group
      name={`item:${item.id}`}
      position={[item.x / 1000, item.z / 1000, -item.y / 1000]}
      rotation={[0, planDegToWorldYaw(item.rotationDeg), 0]}
      scale={[s, s, s]}
      userData={{ itemId: item.id }}
    >
      <primitive object={object} />
    </group>
  );
}

export function ItemsLayer({ level, resolveEntry }: ItemsLayerProps) {
  return (
    <group name="items">
      {Object.values(level.items).map((item) => {
        const entry = resolveEntry(item.catalogId);
        return entry ? <ItemObject key={item.id} item={item} entry={entry} /> : null;
      })}
    </group>
  );
}
