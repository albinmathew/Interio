/** Catalog entries: lighting. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { ceiling, gen, glb, on, wall } from './helpers';
import { MODELS } from '../models';

export const LIGHTING_ENTRIES: CatalogEntry[] = [
  glb('lamp.floor.round', 'Floor lamp', 'lighting', ['living', 'bedroom', 'study'], 'lamp-floor-round', ['floor lamp', 'standing lamp', 'reading']),
  glb('lamp.floor.square', 'Column floor lamp', 'lighting', ['living', 'bedroom', 'study'], 'lamp-floor-square', ['floor lamp', 'standing lamp']),
  glb('lamp.table.round', 'Table lamp', 'lighting', ['bedroom', 'living', 'study'], 'lamp-table-round', ['table lamp', 'bedside lamp', 'desk lamp'], on(470)),
  glb('lamp.table.square', 'Square table lamp', 'lighting', ['bedroom', 'living', 'study'], 'lamp-table-square', ['table lamp', 'bedside lamp'], on(470)),
  glb('lamp.pendant.square', 'Square pendant lamp', 'lighting', ['dining', 'living', 'bedroom'], 'lamp-pendant-square', ['ceiling lamp', 'pendant', 'hanging'], ceiling(MODELS['lamp-pendant-square'].dims.h)),
  glb('lamp.wall', 'Wall sconce', 'lighting', ['bedroom', 'living', 'corridor', 'bathroom'], 'lamp-wall', ['wall light', 'sconce', 'uplighter'], wall(1750)),
  gen('light.ceiling.flush', 'Flush ceiling light', 'lighting', [], 'lightFlush', [380, 380, 90], ['ceiling light', 'surface light', 'dome'], ceiling(90)),
  gen('light.pendant', 'Pendant light', 'lighting', ['dining', 'kitchen', 'living'], 'lightPendant', [360, 360, 800], ['ceiling light', 'pendant', 'hanging', 'island light'], ceiling(800)),
  gen('light.downlight', 'Recessed downlight', 'lighting', [], 'lightDown', [110, 110, 25], ['ceiling light', 'spot', 'led', 'can light'], ceiling(25)),
  gen('light.batten', 'LED batten', 'lighting', ['kitchen', 'utility', 'bathroom', 'balcony', 'storage'], 'lightBatten', [1200, 55, 36], ['tube light', 'led', 'strip', 'wall light'], wall(2400)),
];
