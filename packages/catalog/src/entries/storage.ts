/** Catalog entries: storage. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { doors, drawers, gen, glb, wall } from './helpers';

export const STORAGE_ENTRIES: CatalogEntry[] = [
  glb('nightstand', 'Nightstand', 'storage', ['bedroom'], 'nightstand', ['bedside table', 'side table', 'cabinet']),
  glb('nightstand.drawer', 'Nightstand with drawer', 'storage', ['bedroom'], 'nightstand-drawer', ['bedside table', 'side table', 'drawer']),
  glb('nightstand.table', 'Bedside table', 'storage', ['bedroom'], 'nightstand-table', ['bedside table', 'side table', 'drawer']),
  glb('wardrobe.2door', 'Two-door wardrobe', 'storage', ['bedroom'], 'wardrobe-2door', ['wardrobe', 'almirah', 'cupboard', 'closet']),
  gen('wardrobe.3door', 'Three-door wardrobe', 'storage', ['bedroom'], 'cabinet', [1500, 600, 2100], ['wardrobe', 'almirah', 'cupboard', 'closet'], {
    params: { rows: [doors(3)], plinth: 80 },
  }),
  gen('wardrobe.4door', 'Four-door wardrobe', 'storage', ['bedroom'], 'cabinet', [2000, 600, 2100], ['wardrobe', 'almirah', 'cupboard', 'closet'], {
    params: { rows: [doors(4, 0.2), doors(4, 0.8)], plinth: 80 },
  }),
  gen('wardrobe.sliding', 'Sliding-door wardrobe', 'storage', ['bedroom'], 'cabinet', [1800, 650, 2100], ['wardrobe', 'almirah', 'closet', 'sliding', 'mirror'], {
    params: { rows: [{ h: 1, cols: 2, kind: 'sliding' }], plinth: 60, mirrorPanel: 1 },
  }),
  gen('dresser', 'Chest of drawers', 'storage', ['bedroom'], 'cabinet', [1200, 450, 820], ['dresser', 'drawers', 'commode'], {
    params: { rows: [drawers(2), drawers(2), drawers(2)], legs: 110 },
  }),
  gen('dresser.tall', 'Tallboy', 'storage', ['bedroom', 'study', 'storage'], 'cabinet', [600, 450, 1150], ['dresser', 'drawers', 'chest'], {
    params: { rows: [drawers(1), drawers(1), drawers(1), drawers(1), drawers(1)], legs: 80 },
  }),
  glb('tv.unit', 'TV unit', 'storage', ['living', 'bedroom'], 'tv-unit', ['tv stand', 'media console', 'entertainment unit']),
  glb('tv.unit.doors', 'TV unit with doors', 'storage', ['living', 'bedroom'], 'tv-unit-doors', ['tv stand', 'media console', 'entertainment unit']),
  glb('bookcase.open', 'Open bookcase', 'storage', ['living', 'study', 'bedroom'], 'bookcase-open', ['shelf', 'shelving', 'bookshelf', 'etagere']),
  glb('bookcase.closed', 'Bookcase', 'storage', ['living', 'study', 'bedroom', 'storage'], 'bookcase-closed', ['shelf', 'shelving', 'bookshelf']),
  glb('bookcase.wide', 'Wide bookcase', 'storage', ['living', 'study'], 'bookcase-wide', ['shelf', 'shelving', 'bookshelf', 'display']),
  glb('bookcase.low', 'Low open shelf', 'storage', ['living', 'study', 'bedroom', 'foyer'], 'bookcase-low', ['shelf', 'shelving', 'shoe rack']),
  gen('sideboard', 'Sideboard', 'storage', ['dining', 'living'], 'cabinet', [1600, 450, 780], ['buffet', 'credenza', 'crockery unit'], {
    params: { rows: [doors(4)], legs: 130 },
  }),
  gen('shoe.cabinet', 'Shoe cabinet', 'storage', ['foyer', 'corridor'], 'cabinet', [800, 320, 1100], ['shoe rack', 'shoe storage', 'entry'], {
    params: { rows: [{ h: 1, cols: 1, kind: 'flap' }, { h: 1, cols: 1, kind: 'flap' }, { h: 1, cols: 1, kind: 'flap' }], legs: 90 },
  }),
  glb('coat.rack.standing', 'Coat stand', 'storage', ['foyer', 'bedroom'], 'coat-rack-standing', ['coat rack', 'hat stand', 'hanger']),
  glb('coat.rack.wall', 'Wall coat rack', 'storage', ['foyer', 'corridor'], 'coat-rack-wall', ['coat hooks', 'hanger', 'key holder'], wall(1500)),
  gen('shelf.metal', 'Utility shelving', 'storage', ['utility', 'storage', 'balcony'], 'shelfRack', [900, 400, 1800], ['rack', 'shelving', 'storage rack']),
  gen('shelf.wall', 'Wall shelf', 'storage', ['study', 'living', 'bedroom', 'kitchen'], 'wallShelf', [900, 220, 220], ['floating shelf', 'ledge'], wall(1400)),
  glb('box.cardboard', 'Storage box', 'storage', ['storage', 'utility'], 'box-cardboard', ['carton', 'moving box']),
  glb('trashcan', 'Pedal bin', 'storage', ['kitchen', 'bathroom', 'utility'], 'trashcan', ['dustbin', 'trash can', 'waste bin']),
];
