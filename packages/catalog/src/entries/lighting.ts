/** Catalog entries: lighting. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import {
  BATTEN_SLOTS,
  COLUMN_LAMP_SLOTS,
  DOWNLIGHT_SLOTS,
  FLOOR_LAMP_SLOTS,
  FLUSH_SLOTS,
  PENDANT_DOME_SLOTS,
  PENDANT_FABRIC_SLOTS,
  SCONCE_SLOTS,
  TABLE_LAMP_SLOTS,
  TABLE_LAMP_STONE_SLOTS,
} from '../premium/lighting';
import { ceiling, gen, on, wall } from './helpers';

export const LIGHTING_ENTRIES: CatalogEntry[] = [
  gen('lamp.floor.round', 'Floor lamp', 'lighting', ['living', 'bedroom', 'study'], 'lightingFloorLamp', [400, 400, 1600], ['floor lamp', 'standing lamp', 'reading'], {
    slots: FLOOR_LAMP_SLOTS,
  }),
  gen('lamp.floor.square', 'Column floor lamp', 'lighting', ['living', 'bedroom', 'study'], 'lightingFloorLamp', [320, 320, 1600], ['floor lamp', 'standing lamp'], {
    slots: COLUMN_LAMP_SLOTS,
    params: { shade: 'square', column: true },
  }),
  gen('lamp.table.round', 'Table lamp', 'lighting', ['bedroom', 'living', 'study'], 'lightingTableLamp', [320, 320, 520], ['table lamp', 'bedside lamp', 'desk lamp'], {
    ...on(470),
    slots: TABLE_LAMP_SLOTS,
  }),
  gen('lamp.table.square', 'Square table lamp', 'lighting', ['bedroom', 'living', 'study'], 'lightingTableLamp', [260, 260, 480], ['table lamp', 'bedside lamp'], {
    ...on(470),
    slots: TABLE_LAMP_STONE_SLOTS,
    params: { shade: 'square', base: 'block' },
  }),
  gen('lamp.pendant.square', 'Square pendant lamp', 'lighting', ['dining', 'living', 'bedroom'], 'lightingPendant', [380, 380, 700], ['ceiling lamp', 'pendant', 'hanging'], {
    ...ceiling(700),
    slots: PENDANT_FABRIC_SLOTS,
    params: { shade: 'square' },
  }),
  gen('lamp.wall', 'Wall sconce', 'lighting', ['bedroom', 'living', 'corridor', 'bathroom'], 'lightingSconce', [200, 280, 320], ['wall light', 'sconce', 'uplighter', 'reading'], {
    ...wall(1350),
    slots: SCONCE_SLOTS,
  }),
  gen('light.ceiling.flush', 'Flush ceiling light', 'lighting', [], 'lightingFlush', [380, 380, 90], ['ceiling light', 'surface light', 'dome'], { ...ceiling(90), slots: FLUSH_SLOTS }),
  gen('light.pendant', 'Pendant light', 'lighting', ['dining', 'kitchen', 'living'], 'lightingPendant', [360, 360, 800], ['ceiling light', 'pendant', 'hanging', 'island light'], {
    ...ceiling(800),
    slots: PENDANT_DOME_SLOTS,
  }),
  gen('light.downlight', 'Downlight', 'lighting', [], 'lightingDownlight', [110, 110, 25], ['ceiling light', 'spot', 'led', 'can light'], { ...ceiling(25), slots: DOWNLIGHT_SLOTS }),
  gen('light.batten', 'LED batten', 'lighting', ['kitchen', 'utility', 'bathroom', 'balcony', 'storage'], 'lightingBatten', [1200, 55, 36], ['tube light', 'led', 'strip', 'wall light'], {
    ...wall(2400),
    slots: BATTEN_SLOTS,
  }),
];
