import type { CatalogEntry, Id, Level } from '@interio/core';
import { ItemsLayer } from './ItemsLayer';
import { LevelMeshes } from './LevelMeshes';
import type { RenderQuality } from './quality';

export interface PlanSceneProps {
  level: Level;
  resolveEntry: (catalogId: string) => CatalogEntry | undefined;
  /** Ceilings are hidden in the dollhouse view and shown when walking. */
  showCeilings?: boolean;
  /** Hinged doors stand open and sliding doors are parked. Default true. */
  doorsOpen?: boolean;
  /** Openings that stay shut while the others stand open, e.g. the front door when walking. */
  closedDoors?: readonly Id[];
  /** Fade walls between the camera and a room (dollhouse view). Default false. */
  cutaway?: boolean;
  /** Lamps are switched on: their bulbs glow (evening and night). */
  lampsLit?: boolean;
  /** `low`: cheaper furniture shading for software renderers. Default `high`. */
  quality?: RenderQuality;
}

/**
 * The furnished level: walls, floors, ceilings, joinery and items. No lights: pair it
 * with <SceneLighting>. Shared by the 3D view and the walkthrough.
 */
export function PlanScene({ level, resolveEntry, showCeilings, doorsOpen, closedDoors, cutaway, lampsLit, quality = 'high' }: PlanSceneProps) {
  return (
    <>
      <LevelMeshes level={level} showCeilings={showCeilings} doorsOpen={doorsOpen} closedDoors={closedDoors} cutaway={cutaway} />
      <ItemsLayer level={level} resolveEntry={resolveEntry} lampsLit={lampsLit} lite={quality === 'low'} />
    </>
  );
}
