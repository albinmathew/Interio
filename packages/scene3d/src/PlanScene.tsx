import type { CatalogEntry, Id, Level } from '@interio/core';
import { Coves } from './Coves';
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
  /** Clear window glass for views from inside (walk mode). */
  clearGlass?: boolean;
  /** Cove lights in living rooms and bedrooms at this strength (1 the evening glow); null or undefined for none. */
  coves?: number | null;
}

/**
 * The furnished level: walls, floors, ceilings, joinery and items. No lights: pair it
 * with <SceneLighting>. Shared by the 3D view and the walkthrough.
 */
export function PlanScene({ level, resolveEntry, showCeilings, doorsOpen, closedDoors, cutaway, lampsLit, quality = 'high', clearGlass, coves }: PlanSceneProps) {
  return (
    <>
      <LevelMeshes level={level} showCeilings={showCeilings} doorsOpen={doorsOpen} closedDoors={closedDoors} cutaway={cutaway} clearGlass={clearGlass} />
      <ItemsLayer level={level} resolveEntry={resolveEntry} lampsLit={lampsLit} lite={quality === 'low'} />
      {showCeilings && coves != null && <Coves level={level} strength={coves} />}
    </>
  );
}
