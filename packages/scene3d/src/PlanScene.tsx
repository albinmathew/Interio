import type { CatalogEntry, Level } from '@interio/core';
import { ItemsLayer } from './ItemsLayer';
import { LevelMeshes } from './LevelMeshes';

export interface PlanSceneProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
  /** Ceilings are hidden in the dollhouse view and shown when walking. */
  showCeilings?: boolean;
}

/**
 * The furnished level: walls, floors, ceilings and items. No lights: pair it
 * with <SceneLighting>. Shared by the 3D view and the walkthrough.
 */
export function PlanScene({ level, resolveEntry, showCeilings }: PlanSceneProps) {
  return (
    <>
      <LevelMeshes level={level} showCeilings={showCeilings} />
      <ItemsLayer level={level} resolveEntry={resolveEntry} />
    </>
  );
}
