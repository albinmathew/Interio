/** Registers every parametric generator. Imported for its side effect by the package entry point. */
import { registerGenerator } from '../parametric';
import {
  buildBuiltinOven,
  buildDishwasher,
  buildGeyser,
  buildHob,
  buildInstantGeyser,
  buildPurifier,
  buildSplitAc,
  buildTopLoadWasher,
  buildWallTv,
} from './appliances';
import { buildCabinet } from './casegoods';
import {
  buildArtFrame,
  buildBatten,
  buildDownlight,
  buildDryingRack,
  buildFlushLight,
  buildMirror,
  buildPendant,
  buildPlanter,
  buildShelfRack,
  buildSideTable,
  buildTowelRail,
  buildWallShelf,
} from './fixtures';

export const GENERATORS = {
  cabinet: buildCabinet,
  hob: buildHob,
  builtinOven: buildBuiltinOven,
  dishwasher: buildDishwasher,
  washerTop: buildTopLoadWasher,
  tvWall: buildWallTv,
  acSplit: buildSplitAc,
  geyser: buildGeyser,
  geyserInstant: buildInstantGeyser,
  purifier: buildPurifier,
  sideTable: buildSideTable,
  shelfRack: buildShelfRack,
  wallShelf: buildWallShelf,
  mirror: buildMirror,
  towelRail: buildTowelRail,
  artFrame: buildArtFrame,
  lightFlush: buildFlushLight,
  lightPendant: buildPendant,
  lightDown: buildDownlight,
  lightBatten: buildBatten,
  planter: buildPlanter,
  dryingRack: buildDryingRack,
} as const;

export type GeneratorName = keyof typeof GENERATORS;

for (const [name, fn] of Object.entries(GENERATORS)) registerGenerator(name, fn);
