/** Catalog entries: bathroom. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { gen, glb, wall } from './helpers';

export const BATHROOM_ENTRIES: CatalogEntry[] = [
  glb('toilet', 'Toilet', 'bathroom', ['bathroom'], 'toilet', ['wc', 'commode', 'water closet', 'ewc']),
  glb('toilet.square', 'Compact toilet', 'bathroom', ['bathroom'], 'toilet-square', ['wc', 'commode', 'water closet', 'ewc']),
  glb('basin.vanity', 'Basin with vanity', 'bathroom', ['bathroom'], 'basin-vanity', ['washbasin', 'sink', 'vanity unit', 'wash basin']),
  glb('basin.pedestal', 'Pedestal basin', 'bathroom', ['bathroom', 'utility'], 'basin-pedestal', ['washbasin', 'sink', 'wash basin']),
  glb('basin.pedestal.square', 'Square pedestal basin', 'bathroom', ['bathroom', 'utility'], 'basin-pedestal-square', ['washbasin', 'sink', 'wash basin']),
  glb('bathroom.cabinet', 'Mirror cabinet', 'bathroom', ['bathroom'], 'bathroom-cabinet', ['medicine cabinet', 'mirror', 'storage'], wall(1250)),
  glb('bathroom.mirror', 'Mirror with shelf', 'bathroom', ['bathroom'], 'bathroom-mirror', ['mirror', 'vanity mirror'], wall(1050)),
  glb('shower', 'Shower enclosure', 'bathroom', ['bathroom'], 'shower', ['shower cubicle', 'shower cabin', 'glass']),
  glb('shower.corner', 'Corner shower', 'bathroom', ['bathroom'], 'shower-corner', ['shower cubicle', 'quadrant', 'glass']),
  glb('bathtub', 'Bathtub', 'bathroom', ['bathroom'], 'bathtub', ['bath', 'tub']),
  gen('towel.rail', 'Towel rail', 'bathroom', ['bathroom', 'utility'], 'towelRail', [600, 90, 450], ['towel bar', 'towel holder'], wall(850)),
];
