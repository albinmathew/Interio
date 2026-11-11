/** Catalog entries: decor. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { DESK, gen, glb, on, wall } from './helpers';

export const DECOR_ENTRIES: CatalogEntry[] = [
  glb('rug.rectangle', 'Rectangular rug', 'decor', ['living', 'bedroom', 'dining', 'study'], 'rug-rectangle', ['rug', 'carpet', 'area rug']),
  glb('rug.rounded', 'Oval rug', 'decor', ['living', 'bedroom'], 'rug-rounded', ['rug', 'carpet', 'area rug']),
  glb('rug.round', 'Round rug', 'decor', ['living', 'bedroom', 'study'], 'rug-round', ['rug', 'carpet', 'area rug']),
  glb('rug.square', 'Square rug', 'decor', ['living', 'bedroom', 'dining'], 'rug-square', ['rug', 'carpet', 'area rug']),
  glb('rug.doormat', 'Doormat', 'decor', ['foyer', 'balcony', 'bathroom'], 'rug-doormat', ['mat', 'entry mat', 'bath mat']),
  glb('plant.potted', 'Tall potted plant', 'decor', ['living', 'bedroom', 'foyer', 'balcony', 'study', 'dining'], 'plant-potted', ['plant', 'indoor plant', 'snake plant', 'greenery']),
  glb('plant.small.fir', 'Small fir in a pot', 'decor', [], 'plant-small-fir', ['plant', 'table plant', 'greenery']),
  glb('plant.small.cactus', 'Cactus', 'decor', [], 'plant-small-cactus', ['plant', 'table plant', 'succulent']),
  glb('plant.small.bush', 'Small shrub in a pot', 'decor', [], 'plant-small-bush', ['plant', 'table plant', 'greenery']),
  glb('books', 'Books', 'decor', ['study', 'living', 'bedroom'], 'books', ['book', 'shelf decor'], on(DESK)),
  gen('mirror.wall', 'Wall mirror', 'decor', ['bathroom', 'bedroom', 'foyer', 'corridor'], 'mirror', [600, 25, 800], ['mirror', 'looking glass', 'vanity mirror'], wall(1050)),
  gen('mirror.round', 'Round mirror', 'decor', ['bathroom', 'bedroom', 'foyer', 'living'], 'mirror', [650, 25, 650], ['mirror', 'looking glass'], {
    ...wall(1150),
    params: { shape: 'round', frame: 'wood' },
  }),
  gen('mirror.floor', 'Full-length mirror', 'decor', ['bedroom', 'foyer'], 'mirror', [500, 35, 1700], ['mirror', 'dressing mirror', 'standing mirror'], { params: { frame: 'wood' } }),
  gen('art.landscape', 'Framed art, landscape', 'decor', [], 'artFrame', [800, 30, 550], ['painting', 'picture', 'wall art', 'frame'], wall(1300)),
  gen('art.portrait', 'Framed art, portrait', 'decor', [], 'artFrame', [500, 30, 700], ['painting', 'picture', 'wall art', 'frame'], { ...wall(1250), params: { seed: 1, frame: 'wood' } }),
  gen('art.large', 'Large framed art', 'decor', ['living', 'dining', 'bedroom'], 'artFrame', [1200, 35, 800], ['painting', 'picture', 'wall art', 'frame'], { ...wall(1250), params: { seed: 2 } }),
];
