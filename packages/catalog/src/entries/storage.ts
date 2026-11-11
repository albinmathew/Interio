/** Catalog entries: storage. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import {
  BIN_SLOTS,
  BOX_SLOTS,
  CASE_SLOTS,
  COAT_SLOTS,
  LEDGE_SLOTS,
  RACK_SLOTS,
  SHELF_SLOTS,
  WALNUT_SLOTS,
  WARDROBE_SLOTS,
} from '../premium/storage';
import { gen, wall } from './helpers';

const door = (cols: number, h = 1) => ({ h, cols, kind: 'door' });
const drawer = (cols: number, h = 1) => ({ h, cols, kind: 'drawer' });
const open = (cols: number, h = 1, shelves?: number) => ({ h, cols, kind: 'open', ...(shelves === undefined ? {} : { shelves }) });

export const STORAGE_ENTRIES: CatalogEntry[] = [
  gen('nightstand', 'Nightstand', 'storage', ['bedroom'], 'storageCase', [460, 400, 460], ['bedside table', 'side table', 'cabinet'], {
    slots: CASE_SLOTS,
    params: { rows: [drawer(1, 0.42), open(1, 0.58, 0)], plinth: 40, handle: 'recess', contents: true },
  }),
  gen('nightstand.drawer', 'Nightstand with drawers', 'storage', ['bedroom'], 'storageCase', [460, 400, 480], ['bedside table', 'side table', 'drawer'], {
    slots: CASE_SLOTS,
    params: { rows: [drawer(1), drawer(1)], legs: 150, handle: 'knob' },
  }),
  gen('nightstand.table', 'Bedside table', 'storage', ['bedroom'], 'storageCase', [460, 400, 480], ['bedside table', 'side table', 'drawer'], {
    slots: CASE_SLOTS,
    params: { rows: [drawer(1)], legs: 330, handle: 'ledge', undershelf: true, contents: true },
  }),
  gen('wardrobe.2door', 'Two-door wardrobe', 'storage', ['bedroom'], 'storageCase', [1000, 600, 2100], ['wardrobe', 'almirah', 'cupboard', 'closet'], {
    slots: WARDROBE_SLOTS,
    params: { rows: [door(2)], plinth: 80, fronts: 'overlay', handle: 'bar' },
  }),
  gen('wardrobe.3door', 'Three-door wardrobe', 'storage', ['bedroom'], 'storageCase', [1500, 600, 2100], ['wardrobe', 'almirah', 'cupboard', 'closet'], {
    slots: WARDROBE_SLOTS,
    params: { rows: [door(3)], plinth: 80, fronts: 'overlay', handle: 'bar', style: 'shaker' },
  }),
  gen('wardrobe.4door', 'Four-door wardrobe', 'storage', ['bedroom'], 'storageCase', [2000, 600, 2100], ['wardrobe', 'almirah', 'cupboard', 'closet'], {
    slots: WARDROBE_SLOTS,
    params: { rows: [door(4, 0.2), door(4, 0.8)], plinth: 80, fronts: 'overlay', handle: 'bar' },
  }),
  gen('wardrobe.sliding', 'Sliding-door wardrobe', 'storage', ['bedroom'], 'storageCase', [1800, 650, 2100], ['wardrobe', 'almirah', 'closet', 'sliding', 'mirror'], {
    slots: WARDROBE_SLOTS,
    params: { rows: [{ h: 1, cols: 2, kind: 'sliding' }], plinth: 60, mirrorPanel: 1 },
  }),
  gen('wardrobe.open', 'Open wardrobe', 'storage', ['bedroom'], 'storageCase', [1500, 600, 2100], ['wardrobe', 'almirah', 'closet', 'clothes rail', 'walk-in'], {
    slots: WARDROBE_SLOTS,
    params: { rows: [door(3)], plinth: 80, fronts: 'overlay', handle: 'bar', open: true },
  }),
  gen('dresser', 'Chest of drawers', 'storage', ['bedroom'], 'storageCase', [1200, 450, 820], ['dresser', 'drawers', 'commode'], {
    slots: CASE_SLOTS,
    params: { rows: [drawer(2), drawer(2), drawer(2)], legs: 110, handle: 'bar' },
  }),
  gen('dresser.tall', 'Tallboy', 'storage', ['bedroom', 'study', 'storage'], 'storageCase', [600, 450, 1150], ['dresser', 'drawers', 'chest'], {
    slots: CASE_SLOTS,
    params: { rows: [drawer(1), drawer(1), drawer(1), drawer(1), drawer(1)], legs: 80, handle: 'bar' },
  }),
  gen('tv.unit', 'TV unit', 'storage', ['living', 'bedroom'], 'storageCase', [1700, 420, 520], ['tv stand', 'media console', 'entertainment unit'], {
    slots: WALNUT_SLOTS,
    params: { rows: [drawer(3, 0.42), open(3, 0.58, 0)], legs: 120, handle: 'recess', contents: true },
  }),
  gen('tv.unit.doors', 'TV unit with doors', 'storage', ['living', 'bedroom'], 'storageCase', [1700, 420, 520], ['tv stand', 'media console', 'entertainment unit'], {
    slots: WALNUT_SLOTS,
    params: { rows: [door(4)], legs: 120, handle: 'knob', style: 'fluted' },
  }),
  gen('bookcase.open', 'Open bookcase', 'storage', ['living', 'study', 'bedroom'], 'storageCase', [800, 350, 1800], ['shelf', 'shelving', 'bookshelf', 'etagere'], {
    slots: SHELF_SLOTS,
    params: { rows: [open(1), open(1), open(1), open(1), open(1)], plinth: 60, contents: true },
  }),
  gen('bookcase.closed', 'Bookcase', 'storage', ['living', 'study', 'bedroom', 'storage'], 'storageCase', [800, 350, 1800], ['shelf', 'shelving', 'bookshelf'], {
    slots: CASE_SLOTS,
    params: { rows: [open(1), open(1), open(1), door(2, 1.4)], plinth: 60, handle: 'knob', contents: true },
  }),
  gen('bookcase.wide', 'Wide bookcase', 'storage', ['living', 'study'], 'storageCase', [1500, 350, 1500], ['shelf', 'shelving', 'bookshelf', 'display'], {
    slots: CASE_SLOTS,
    params: { rows: [open(3), open(3), open(3), door(3, 1.2)], plinth: 60, handle: 'knob', contents: true },
  }),
  gen('bookcase.low', 'Low open shelf', 'storage', ['living', 'study', 'bedroom', 'foyer'], 'storageCase', [800, 350, 800], ['shelf', 'shelving', 'shoe rack'], {
    slots: SHELF_SLOTS,
    params: { rows: [open(2, 1, 0), open(2, 1, 0)], plinth: 40, contents: true },
  }),
  gen('sideboard', 'Sideboard', 'storage', ['dining', 'living'], 'storageCase', [1600, 450, 780], ['buffet', 'credenza', 'crockery unit'], {
    slots: WALNUT_SLOTS,
    params: { rows: [door(4)], legs: 130, handle: 'knob', style: 'fluted' },
  }),
  gen('shoe.cabinet', 'Shoe cabinet', 'storage', ['foyer', 'corridor'], 'storageCase', [800, 320, 1100], ['shoe rack', 'shoe storage', 'entry'], {
    slots: CASE_SLOTS,
    params: { rows: [{ h: 1, cols: 1, kind: 'flap' }, { h: 1, cols: 1, kind: 'flap' }, { h: 1, cols: 1, kind: 'flap' }], legs: 90, handle: 'ledge' },
  }),
  gen('coat.rack.standing', 'Coat stand', 'storage', ['foyer', 'bedroom'], 'storageCoatStand', [520, 520, 1750], ['coat rack', 'hat stand', 'hanger'], { slots: COAT_SLOTS }),
  gen('coat.rack.wall', 'Wall coat rack', 'storage', ['foyer', 'corridor'], 'storageCoatRack', [800, 240, 900], ['coat hooks', 'hanger', 'key holder'], { ...wall(1050), slots: COAT_SLOTS }),
  gen('shelf.metal', 'Utility shelving', 'storage', ['utility', 'storage', 'balcony'], 'storageShelfRack', [900, 400, 1800], ['rack', 'shelving', 'storage rack'], { slots: RACK_SLOTS }),
  gen('shelf.wall', 'Wall shelf', 'storage', ['study', 'living', 'bedroom', 'kitchen'], 'storageWallShelf', [900, 220, 260], ['floating shelf', 'ledge'], { ...wall(1400), slots: LEDGE_SLOTS }),
  gen('box.cardboard', 'Storage box', 'storage', ['storage', 'utility'], 'storageBox', [400, 400, 400], ['carton', 'moving box'], { slots: BOX_SLOTS }),
  gen('trashcan', 'Pedal bin', 'storage', ['kitchen', 'bathroom', 'utility'], 'storageBin', [300, 340, 620], ['dustbin', 'trash can', 'waste bin'], { slots: BIN_SLOTS }),
];
