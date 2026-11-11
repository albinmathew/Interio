/** Catalog entries: bathroom. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import {
  MIRROR_CABINET_SLOTS,
  MIRROR_SHELF_SLOTS,
  SANITARY_SLOTS,
  SHOWER_SLOTS,
  TOWEL_RAIL_SLOTS,
  VANITY_SLOTS,
  WALL_TOILET_SLOTS,
} from '../premium/bathroom';
import { gen, wall } from './helpers';

/** Basins stand 850 mm to the rim; the mixer reaches 1000 mm, below a mirror hung at 1050. */
const BASIN_H = 1000;

export const BATHROOM_ENTRIES: CatalogEntry[] = [
  gen('toilet', 'Close-coupled toilet', 'bathroom', ['bathroom'], 'bathToilet', [400, 700, 780], ['wc', 'commode', 'water closet', 'ewc'], {
    slots: SANITARY_SLOTS,
  }),
  gen('toilet.square', 'Compact square toilet', 'bathroom', ['bathroom'], 'bathToilet', [380, 620, 780], ['wc', 'commode', 'water closet', 'ewc'], {
    slots: SANITARY_SLOTS,
    params: { style: 'square' },
  }),
  gen('toilet.wall', 'Wall-hung toilet', 'bathroom', ['bathroom'], 'bathToilet', [600, 700, 1100], ['wc', 'commode', 'water closet', 'ewc', 'wall hung', 'concealed cistern'], {
    slots: WALL_TOILET_SLOTS,
    params: { mount: 'wall' },
  }),
  gen('basin.vanity', 'Basin with vanity', 'bathroom', ['bathroom'], 'bathVanity', [800, 520, BASIN_H], ['washbasin', 'sink', 'vanity unit', 'wash basin'], {
    slots: VANITY_SLOTS,
  }),
  gen('basin.vanity.double', 'Double vanity', 'bathroom', ['bathroom'], 'bathVanity', [1200, 520, BASIN_H], ['washbasin', 'sink', 'vanity unit', 'wash basin', 'double'], {
    slots: VANITY_SLOTS,
    params: { basins: 2 },
  }),
  gen('basin.pedestal', 'Pedestal basin', 'bathroom', ['bathroom', 'utility'], 'bathPedestalBasin', [560, 460, BASIN_H], ['washbasin', 'sink', 'wash basin'], {
    slots: SANITARY_SLOTS,
  }),
  gen('basin.pedestal.square', 'Square pedestal basin', 'bathroom', ['bathroom', 'utility'], 'bathPedestalBasin', [600, 460, BASIN_H], ['washbasin', 'sink', 'wash basin'], {
    slots: SANITARY_SLOTS,
    params: { style: 'square' },
  }),
  gen('bathroom.cabinet', 'Mirror cabinet', 'bathroom', ['bathroom'], 'bathMirrorCabinet', [450, 200, 760], ['medicine cabinet', 'mirror', 'storage'], {
    ...wall(1250),
    slots: MIRROR_CABINET_SLOTS,
  }),
  gen('bathroom.mirror', 'Mirror with shelf', 'bathroom', ['bathroom'], 'bathMirrorShelf', [600, 160, 870], ['mirror', 'vanity mirror'], {
    ...wall(1050),
    slots: MIRROR_SHELF_SLOTS,
  }),
  gen('shower', 'Shower enclosure', 'bathroom', ['bathroom'], 'bathShower', [900, 900, 2050], ['shower cubicle', 'shower cabin', 'glass'], {
    slots: SHOWER_SLOTS,
  }),
  gen('shower.corner', 'Corner shower', 'bathroom', ['bathroom'], 'bathCornerShower', [900, 900, 2050], ['shower cubicle', 'quadrant', 'glass'], {
    slots: SHOWER_SLOTS,
  }),
  gen('shower.walkin', 'Walk-in shower', 'bathroom', ['bathroom'], 'bathShower', [1400, 900, 2050], ['shower cubicle', 'walk-in', 'wet room', 'glass'], {
    slots: SHOWER_SLOTS,
    params: { type: 'walkin' },
  }),
  gen('bathtub', 'Bathtub', 'bathroom', ['bathroom'], 'bathTub', [1700, 750, 580], ['bath', 'tub'], { slots: SANITARY_SLOTS }),
  gen('towel.rail', 'Towel rail', 'bathroom', ['bathroom', 'utility'], 'bathTowelRail', [600, 90, 450], ['towel bar', 'towel holder'], {
    ...wall(850),
    slots: TOWEL_RAIL_SLOTS,
  }),
];
