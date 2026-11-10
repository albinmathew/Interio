import type { CatalogEntry, Level } from '@interio/core';
import { ItemsLayer } from './ItemsLayer';
import { LevelMeshes } from './LevelMeshes';

export interface PlanSceneProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
  /** Ceilings are hidden in the dollhouse view and shown when walking. */
  showCeilings?: boolean;
  /** Hinged doors stand open and sliding doors are parked. Default true. */
  doorsOpen?: boolean;
  /** Fade walls between the camera and a room (dollhouse view). Default false. */
  cutaway?: boolean;
}

/**
 * The furnished level: walls, floors, ceilings, joinery and items. No lights: pair it
 * with <SceneLighting>. Shared by the 3D view and the walkthrough.
 */
export function PlanScene({ level, resolveEntry, showCeilings, doorsOpen, cutaway }: PlanSceneProps) {
  return (
    <>
      <LevelMeshes level={level} showCeilings={showCeilings} doorsOpen={doorsOpen} cutaway={cutaway} />
      <ItemsLayer level={level} resolveEntry={resolveEntry} />
    </>
  );
}
