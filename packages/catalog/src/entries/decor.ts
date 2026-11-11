/** Catalog entries: decor. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { ART_SLOTS, ART_SLOTS_FLOAT, ART_SLOTS_WALNUT, BOOK_SLOTS, CURTAIN_SLOTS, MIRROR_SLOTS, PILLOW_SLOTS, PLANT_SLOTS, RUG_SLOTS } from '../premium/decor';
import { DESK, gen, on, wall } from './helpers';

export const DECOR_ENTRIES: CatalogEntry[] = [
  gen('rug.rectangle', 'Rectangular rug', 'decor', ['living', 'bedroom', 'dining', 'study'], 'decorRug', [2400, 1700, 15], ['rug', 'carpet', 'area rug'], { slots: RUG_SLOTS.cream }),
  gen('rug.rounded', 'Rounded rug', 'decor', ['living', 'bedroom'], 'decorRug', [2400, 1400, 15], ['rug', 'carpet', 'area rug', 'oval'], { slots: RUG_SLOTS.oat, params: { shape: 'pill' } }),
  gen('rug.round', 'Round rug', 'decor', ['living', 'bedroom', 'study'], 'decorRug', [1600, 1600, 15], ['rug', 'carpet', 'area rug'], { slots: RUG_SLOTS.sage, params: { shape: 'round' } }),
  gen('rug.square', 'Square rug', 'decor', ['living', 'bedroom', 'dining'], 'decorRug', [2000, 2000, 15], ['rug', 'carpet', 'area rug'], { slots: RUG_SLOTS.sand }),
  gen('rug.runner', 'Runner rug', 'decor', ['corridor', 'foyer', 'kitchen', 'bedroom'], 'decorRug', [800, 2400, 12], ['rug', 'runner', 'hall rug', 'carpet'], {
    slots: RUG_SLOTS.grey,
    params: { fringe: true, band: false },
  }),
  gen('rug.doormat', 'Doormat', 'decor', ['foyer', 'balcony', 'bathroom'], 'decorRug', [750, 450, 18], ['mat', 'entry mat', 'bath mat'], { slots: RUG_SLOTS.coir, params: { band: false } }),
  gen('plant.potted', 'Fiddle-leaf fig', 'decor', ['living', 'bedroom', 'foyer', 'balcony', 'study', 'dining'], 'decorPlant', [480, 480, 1450], ['plant', 'indoor plant', 'snake plant', 'greenery', 'fig'], {
    slots: PLANT_SLOTS.floor,
    params: { species: 'fiddle' },
  }),
  gen('plant.palm', 'Kentia palm', 'decor', ['living', 'bedroom', 'dining', 'study', 'foyer'], 'decorPlant', [800, 800, 1600], ['plant', 'indoor plant', 'palm', 'greenery'], {
    slots: PLANT_SLOTS.floor,
    params: { species: 'palm' },
  }),
  gen('plant.snake', 'Snake plant', 'decor', ['living', 'bedroom', 'bathroom', 'study', 'foyer'], 'decorPlant', [340, 340, 820], ['plant', 'indoor plant', 'snake plant', 'sansevieria', 'greenery'], {
    slots: PLANT_SLOTS.white,
    params: { species: 'snake', pot: 'cylinder' },
  }),
  gen('plant.small.fir', 'Small fir in a pot', 'decor', [], 'decorPlant', [240, 240, 380], ['plant', 'table plant', 'greenery', 'tree'], { slots: PLANT_SLOTS.terracotta, params: { species: 'fir' } }),
  gen('plant.small.cactus', 'Cactus', 'decor', [], 'decorPlant', [200, 200, 330], ['plant', 'table plant', 'succulent'], { slots: PLANT_SLOTS.white, params: { species: 'cactus', pot: 'cylinder' } }),
  gen('plant.small.bush', 'Small leafy plant', 'decor', [], 'decorPlant', [280, 280, 300], ['plant', 'table plant', 'greenery'], { slots: PLANT_SLOTS.terracotta, params: { species: 'bush', pot: 'bowl' } }),
  gen('books', 'Books', 'decor', ['study', 'living', 'bedroom'], 'decorBooks', [260, 165, 220], ['book', 'shelf decor'], { ...on(DESK), slots: BOOK_SLOTS }),
  gen('mirror.wall', 'Wall mirror', 'decor', ['bathroom', 'bedroom', 'foyer', 'corridor'], 'decorMirror', [600, 25, 800], ['mirror', 'looking glass', 'vanity mirror'], {
    ...wall(1050),
    slots: MIRROR_SLOTS.black,
  }),
  gen('mirror.round', 'Round mirror', 'decor', ['bathroom', 'bedroom', 'foyer', 'living'], 'decorMirror', [650, 25, 650], ['mirror', 'looking glass'], {
    ...wall(1150),
    slots: MIRROR_SLOTS.brass,
    params: { shape: 'round' },
  }),
  gen('mirror.floor', 'Full-length mirror', 'decor', ['bedroom', 'foyer'], 'decorMirror', [600, 220, 1700], ['mirror', 'dressing mirror', 'standing mirror', 'leaning mirror'], {
    slots: MIRROR_SLOTS.oak,
    params: { shape: 'arch', lean: true },
  }),
  gen('art.landscape', 'Framed art, landscape', 'decor', [], 'decorArt', [800, 30, 550], ['painting', 'picture', 'wall art', 'frame'], { ...wall(1300), slots: ART_SLOTS }),
  gen('art.portrait', 'Framed art, portrait', 'decor', [], 'decorArt', [500, 30, 700], ['painting', 'picture', 'wall art', 'frame'], { ...wall(1250), slots: ART_SLOTS_WALNUT, params: { seed: 1 } }),
  gen('art.large', 'Large framed art', 'decor', ['living', 'dining', 'bedroom'], 'decorArt', [1200, 40, 800], ['painting', 'picture', 'wall art', 'frame', 'canvas'], {
    ...wall(1250),
    slots: ART_SLOTS_FLOAT,
    params: { seed: 2 },
  }),
  gen('curtain.pair', 'Curtains', 'decor', ['living', 'bedroom', 'dining', 'study'], 'decorCurtains', [2400, 180, 2700], ['curtains', 'drapes', 'window', 'linen'], {
    ...wall(20),
    slots: CURTAIN_SLOTS,
  }),
  gen('pillow.set', 'Throw pillows', 'decor', ['living', 'bedroom'], 'decorPillows', [1150, 320, 480], ['cushions', 'throw pillows', 'sofa cushions'], { ...on(430), slots: PILLOW_SLOTS }),
];
