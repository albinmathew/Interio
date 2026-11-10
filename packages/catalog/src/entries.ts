/**
 * The catalog. Ids are stable: saved projects reference them.
 *
 * Two kinds of entry:
 * - `glb`: a model from `models.ts`, cut from a CC0 kit and baked to `dims`.
 * - `gen`: a parametric model built by a generator from `generators/`.
 *
 * `mountHeight` is the default elevation of the underside: wall and ceiling
 * pieces, and things that normally sit on a worktop, desk or bedside table.
 * Ceiling pieces assume the default 3000 mm ceiling; placement should use
 * `level.ceilingHeight - dims.h` when it knows the level.
 */
import type { CatalogCategory, CatalogEntry, RoomType } from '@interio/core';
import type { GeneratorName } from './generators';
import { MODELS, PACKS, modelUrl, type ModelId } from './models';

type Extra = Partial<Pick<CatalogEntry, 'anchor' | 'mountHeight'>>;

const INTERIO_LICENCE = 'CC0-1.0 (Interio parametric)';
const thumb = (id: string) => `/catalog/thumbs/${id}.webp`;

const glb = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  model: ModelId,
  tags: string[],
  extra: Extra = {},
): CatalogEntry => ({
  id,
  name,
  category,
  roomTypes,
  dims: { ...MODELS[model].dims },
  anchor: 'floor',
  model: { kind: 'glb', url: modelUrl(model) },
  thumbnail: thumb(id),
  licence: `${PACKS[MODELS[model].pack].licence} (${PACKS[MODELS[model].pack].name})`,
  tags,
  ...extra,
});

const gen = (
  id: string,
  name: string,
  category: CatalogCategory,
  roomTypes: RoomType[],
  generator: GeneratorName,
  [w, d, h]: [number, number, number],
  tags: string[],
  extra: Extra & { params?: Record<string, unknown> } = {},
): CatalogEntry => {
  const { params, ...rest } = extra;
  return {
    id,
    name,
    category,
    roomTypes,
    dims: { w, d, h },
    anchor: 'floor',
    model: { kind: 'parametric', generator, ...(params ? { params } : {}) },
    thumbnail: thumb(id),
    licence: INTERIO_LICENCE,
    tags,
    ...rest,
  };
};

const WORKTOP = 870;
const DESK = 750;
const CEILING = 3000;
const wall = (mountHeight: number): Extra => ({ anchor: 'wall', mountHeight });
const ceiling = (h: number): Extra => ({ anchor: 'ceiling', mountHeight: CEILING - h });
const on = (mountHeight: number): Extra => ({ mountHeight });

const drawers = (cols: number, h = 1) => ({ h, cols, kind: 'drawer' });
const doors = (cols: number, h = 1) => ({ h, cols, kind: 'door' });
const KITCHEN_TOP = { thickness: 30, finish: 'worktop', front: 20 };

export const ENTRIES: CatalogEntry[] = [
  /* ------------------------------------------------------------ seating */
  glb('sofa.3seat', 'Three-seat sofa', 'seating', ['living'], 'sofa-3seat', ['sofa', 'couch', 'settee', 'lounge']),
  glb('sofa.2seat', 'Two-seat sofa', 'seating', ['living', 'study', 'bedroom'], 'sofa-2seat', ['sofa', 'couch', 'loveseat', 'settee']),
  glb('sofa.corner', 'Corner sofa', 'seating', ['living'], 'sofa-corner', ['sofa', 'couch', 'sectional', 'l-shaped']),
  glb('sofa.chaise', 'Sofa with chaise', 'seating', ['living'], 'sofa-chaise', ['sofa', 'couch', 'sectional', 'chaise', 'l-shaped']),
  glb('sofa.modern.3seat', 'Low modern sofa', 'seating', ['living'], 'sofa-modern-3seat', ['sofa', 'couch', 'modern', 'low']),
  glb('sofa.modern.loveseat', 'Modern loveseat', 'seating', ['living', 'bedroom', 'study'], 'sofa-modern-loveseat', ['sofa', 'couch', 'loveseat', 'modern']),
  glb('sofa.modern.corner', 'Low modern corner sofa', 'seating', ['living'], 'sofa-modern-corner', ['sofa', 'couch', 'sectional', 'modern', 'l-shaped']),
  glb('ottoman', 'Ottoman', 'seating', ['living', 'bedroom'], 'sofa-ottoman', ['footstool', 'pouf', 'stool']),
  glb('armchair', 'Armchair', 'seating', ['living', 'bedroom', 'study'], 'armchair', ['chair', 'lounge', 'accent chair']),
  glb('armchair.recliner', 'Recliner', 'seating', ['living', 'bedroom'], 'armchair-recliner', ['chair', 'lounge', 'recliner', 'footrest']),
  glb('chair.dining', 'Dining chair', 'seating', ['dining', 'living', 'kitchen'], 'chair-dining', ['chair', 'wooden']),
  glb('chair.dining.cushion', 'Cushioned dining chair', 'seating', ['dining', 'living', 'kitchen'], 'chair-dining-cushion', ['chair', 'upholstered']),
  glb('chair.rounded', 'Round-back chair', 'seating', ['dining', 'kitchen', 'bedroom'], 'chair-rounded', ['chair', 'wooden']),
  glb('chair.modern', 'Modern chair', 'seating', ['dining', 'study', 'bedroom'], 'chair-modern', ['chair', 'upholstered', 'white']),
  glb('chair.modern.frame', 'Cantilever chair', 'seating', ['dining', 'study'], 'chair-modern-frame', ['chair', 'metal', 'visitor']),
  glb('bench', 'Hall bench', 'seating', ['foyer', 'dining', 'corridor'], 'bench', ['bench', 'seat', 'wooden']),
  glb('bench.cushion', 'Cushioned bench', 'seating', ['foyer', 'dining', 'bedroom'], 'bench-cushion', ['bench', 'seat', 'upholstered']),
  glb('bench.low', 'Low bench', 'seating', ['bedroom', 'foyer', 'living'], 'bench-low', ['bench', 'end of bed', 'shoe bench']),
  glb('stool.bar', 'Bar stool', 'seating', ['kitchen', 'dining'], 'stool-bar', ['stool', 'counter stool', 'island']),
  glb('stool.bar.square', 'Square bar stool', 'seating', ['kitchen', 'dining'], 'stool-bar-square', ['stool', 'counter stool', 'island']),

  /* ------------------------------------------------------------- tables */
  glb('table.coffee', 'Coffee table', 'tables', ['living'], 'table-coffee', ['centre table', 'center table', 'wooden']),
  glb('table.coffee.glass', 'Glass coffee table', 'tables', ['living'], 'table-coffee-glass', ['centre table', 'center table', 'glass']),
  glb('table.coffee.square', 'Square coffee table', 'tables', ['living'], 'table-coffee-square', ['centre table', 'center table', 'wooden']),
  glb('table.coffee.glass.square', 'Square glass coffee table', 'tables', ['living'], 'table-coffee-glass-square', ['centre table', 'center table', 'glass']),
  gen('table.side', 'Round side table', 'tables', ['living', 'bedroom', 'study'], 'sideTable', [450, 450, 520], ['end table', 'accent table', 'lamp table']),
  glb('table.console', 'Console table', 'tables', ['foyer', 'living', 'corridor'], 'table-console', ['hall table', 'entry table', 'sofa table']),
  glb('table.console.drawers', 'Console table with drawers', 'tables', ['foyer', 'living', 'bedroom'], 'table-console-drawers', ['hall table', 'entry table', 'dressing table']),
  glb('table.dining4', 'Dining table for four', 'tables', ['dining', 'kitchen', 'living'], 'table-dining-4', ['dining', '4 seater', 'wooden']),
  glb('table.dining6', 'Dining table for six', 'tables', ['dining', 'living'], 'table-dining-6', ['dining', '6 seater', 'wooden']),
  glb('table.dining8', 'Dining table for eight', 'tables', ['dining', 'living'], 'table-dining-8', ['dining', '8 seater', 'wooden']),
  glb('table.dining.trestle', 'Trestle dining table', 'tables', ['dining', 'living', 'balcony'], 'table-dining-trestle', ['dining', '6 seater', 'farmhouse']),
  glb('table.dining.glass', 'Glass dining table', 'tables', ['dining', 'living'], 'table-dining-glass', ['dining', '6 seater', 'glass']),
  glb('table.dining.round', 'Round dining table', 'tables', ['dining', 'kitchen', 'living'], 'table-dining-round', ['dining', '4 seater', 'pedestal']),

  /* --------------------------------------------------------------- beds */
  glb('bed.single', 'Single bed', 'beds', ['bedroom'], 'bed-single', ['bed', 'twin', 'kids', 'guest']),
  glb('bed.double', 'Double bed', 'beds', ['bedroom'], 'bed-double', ['bed', 'full']),
  glb('bed.queen', 'Queen bed', 'beds', ['bedroom'], 'bed-queen', ['bed', 'queen', 'master']),
  glb('bed.king', 'King bed', 'beds', ['bedroom'], 'bed-king', ['bed', 'king', 'master']),
  glb('bed.bunk', 'Bunk bed', 'beds', ['bedroom'], 'bed-bunk', ['bed', 'kids', 'twin']),

  /* ------------------------------------------------------------ storage */
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

  /* ------------------------------------------------------------ kitchen */
  glb('kitchen.base', 'Base cabinet', 'kitchen', ['kitchen'], 'kitchen-base', ['base unit', 'counter', 'modular']),
  glb('kitchen.base.drawers', 'Base cabinet with drawers', 'kitchen', ['kitchen'], 'kitchen-base-drawers', ['base unit', 'counter', 'drawer unit', 'modular']),
  glb('kitchen.base.corner', 'Corner base cabinet', 'kitchen', ['kitchen'], 'kitchen-base-corner', ['base unit', 'counter', 'corner', 'modular']),
  glb('kitchen.base.end', 'Rounded end cabinet', 'kitchen', ['kitchen'], 'kitchen-base-end', ['base unit', 'counter', 'end unit', 'modular']),
  glb('kitchen.sink', 'Sink unit', 'kitchen', ['kitchen', 'utility'], 'kitchen-sink', ['sink', 'tap', 'faucet', 'basin']),
  glb('kitchen.wall', 'Wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall', ['upper cabinet', 'overhead', 'modular'], wall(1450)),
  glb('kitchen.wall.double', 'Two-door wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall-double', ['upper cabinet', 'overhead', 'modular'], wall(1450)),
  glb('kitchen.wall.low', 'Low wall cabinet', 'kitchen', ['kitchen'], 'kitchen-wall-low', ['upper cabinet', 'overhead', 'bridge unit'], wall(1810)),
  glb('kitchen.wall.end', 'Open end shelf', 'kitchen', ['kitchen'], 'kitchen-wall-end', ['upper cabinet', 'overhead', 'open shelf'], wall(1450)),
  gen('kitchen.counter.1200', 'Counter run 1.2 m', 'kitchen', ['kitchen'], 'cabinet', [1200, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(2, 0.22), doors(2, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.counter.1800', 'Counter run 1.8 m', 'kitchen', ['kitchen'], 'cabinet', [1800, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(3, 0.22), doors(3, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.counter.2400', 'Counter run 2.4 m', 'kitchen', ['kitchen'], 'cabinet', [2400, 600, WORKTOP], ['counter', 'worktop', 'platform', 'base units'], {
    params: { rows: [drawers(4, 0.22), doors(4, 0.78)], plinth: 100, top: KITCHEN_TOP },
  }),
  gen('kitchen.island', 'Kitchen island', 'kitchen', ['kitchen'], 'cabinet', [1800, 900, 900], ['island', 'counter', 'breakfast bar'], {
    params: { rows: [drawers(3, 0.22), doors(3, 0.78)], plinth: 100, top: { thickness: 40, finish: 'worktop', front: 20, back: 280, sides: 20 } },
  }),
  glb('kitchen.bar', 'Breakfast bar', 'kitchen', ['kitchen', 'dining'], 'kitchen-bar', ['bar counter', 'peninsula']),
  glb('kitchen.bar.end', 'Breakfast bar end', 'kitchen', ['kitchen', 'dining'], 'kitchen-bar-end', ['bar counter', 'peninsula', 'end panel']),
  gen('kitchen.tall', 'Tall pantry unit', 'kitchen', ['kitchen', 'utility'], 'cabinet', [600, 600, 2100], ['pantry', 'larder', 'tall unit'], {
    params: { rows: [doors(1, 0.62), doors(1, 0.38)], plinth: 100 },
  }),

  /* ----------------------------------------------------------- bathroom */
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

  /* --------------------------------------------------------- appliances */
  glb('fridge.single', 'Single-door refrigerator', 'appliances', ['kitchen', 'dining'], 'fridge-single', ['fridge', 'refrigerator', 'single door']),
  glb('fridge.topfreezer', 'Top-freezer refrigerator', 'appliances', ['kitchen', 'dining'], 'fridge-top-freezer', ['fridge', 'refrigerator', 'double door', 'frost free']),
  glb('fridge.double', 'Double-door refrigerator', 'appliances', ['kitchen', 'dining'], 'fridge-double', ['fridge', 'refrigerator', 'double door', 'side by side', 'french door']),
  glb('fridge.mini', 'Mini refrigerator', 'appliances', ['kitchen', 'bedroom', 'study'], 'fridge-mini', ['fridge', 'refrigerator', 'bar fridge', 'minibar']),
  glb('fridge.integrated', 'Integrated refrigerator', 'appliances', ['kitchen'], 'fridge-integrated', ['fridge', 'refrigerator', 'built-in', 'panelled']),
  gen('hob.4burner', 'Four-burner hob', 'appliances', ['kitchen'], 'hob', [600, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner'], { ...on(WORKTOP), params: { burners: 4 } }),
  gen('hob.2burner', 'Two-burner hob', 'appliances', ['kitchen'], 'hob', [300, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner', 'domino'], { ...on(WORKTOP), params: { burners: 2 } }),
  gen('hob.5burner', 'Five-burner hob', 'appliances', ['kitchen'], 'hob', [900, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner'], { ...on(WORKTOP), params: { burners: 5 } }),
  gen('hob.induction', 'Induction hob', 'appliances', ['kitchen'], 'hob', [590, 520, 12], ['hob', 'cooktop', 'induction', 'electric'], { ...on(WORKTOP), params: { burners: 4, type: 'induction' } }),
  glb('range.gas', 'Gas cooking range', 'appliances', ['kitchen'], 'range-gas', ['cooker', 'stove', 'oven', 'range']),
  glb('range.electric', 'Electric cooking range', 'appliances', ['kitchen'], 'range-electric', ['cooker', 'stove', 'oven', 'range', 'ceramic']),
  gen('oven.builtin', 'Built-in oven', 'appliances', ['kitchen'], 'builtinOven', [600, 600, WORKTOP], ['oven', 'built-in', 'otg', 'baking'], { params: { housing: 'base' } }),
  gen('oven.tower', 'Oven and microwave tower', 'appliances', ['kitchen'], 'builtinOven', [600, 600, 2100], ['oven', 'built-in', 'microwave', 'tall unit'], { params: { housing: 'tall' } }),
  glb('hood.chimney', 'Chimney hood', 'appliances', ['kitchen'], 'hood-chimney', ['chimney', 'extractor', 'cooker hood', 'exhaust'], wall(1600)),
  glb('hood.canopy', 'Canopy hood', 'appliances', ['kitchen'], 'hood-canopy', ['chimney', 'extractor', 'cooker hood', 'exhaust'], wall(1550)),
  glb('microwave', 'Microwave oven', 'appliances', ['kitchen'], 'microwave', ['microwave', 'oven', 'countertop'], on(WORKTOP)),
  gen('dishwasher', 'Dishwasher', 'appliances', ['kitchen', 'utility'], 'dishwasher', [600, 600, 850], ['dish washer', 'freestanding']),
  glb('washer.front', 'Front-load washing machine', 'appliances', ['utility', 'bathroom', 'balcony'], 'washer', ['washer', 'washing machine', 'laundry', 'front load']),
  gen('washer.top', 'Top-load washing machine', 'appliances', ['utility', 'bathroom', 'balcony'], 'washerTop', [560, 580, 950], ['washer', 'washing machine', 'laundry', 'top load']),
  glb('dryer', 'Tumble dryer', 'appliances', ['utility', 'bathroom', 'balcony'], 'dryer', ['dryer', 'laundry', 'clothes dryer']),
  glb('washer.dryer.stack', 'Stacked washer and dryer', 'appliances', ['utility', 'bathroom'], 'washer-dryer-stack', ['washer', 'dryer', 'laundry', 'stacked']),
  gen('tv.wall.43', 'Wall-mounted TV 43"', 'appliances', ['bedroom', 'living', 'study'], 'tvWall', [960, 60, 560], ['tv', 'television', 'led tv', 'wall mount'], wall(1100)),
  gen('tv.wall.55', 'Wall-mounted TV 55"', 'appliances', ['living', 'bedroom'], 'tvWall', [1230, 60, 710], ['tv', 'television', 'led tv', 'wall mount'], wall(1000)),
  gen('tv.wall.65', 'Wall-mounted TV 65"', 'appliances', ['living'], 'tvWall', [1450, 65, 830], ['tv', 'television', 'led tv', 'wall mount'], wall(950)),
  glb('tv.stand', 'TV on stand 55"', 'appliances', ['living', 'bedroom'], 'tv-stand', ['tv', 'television', 'led tv', 'table top'], on(520)),
  gen('ac.split', 'Split air conditioner', 'appliances', ['bedroom', 'living', 'study', 'dining'], 'acSplit', [900, 220, 300], ['ac', 'air conditioner', 'aircon', 'indoor unit', 'cooling'], wall(2300)),
  glb('fan.ceiling', 'Ceiling fan', 'appliances', ['bedroom', 'living', 'dining', 'study', 'kitchen'], 'fan-ceiling', ['fan', 'ceiling fan', 'cooling'], ceiling(MODELS['fan-ceiling'].dims.h)),
  gen('geyser', 'Water heater (geyser)', 'appliances', ['bathroom', 'utility', 'kitchen'], 'geyser', [400, 440, 600], ['geyser', 'water heater', 'storage heater', 'boiler'], wall(1900)),
  gen('geyser.instant', 'Instant water heater', 'appliances', ['bathroom', 'kitchen', 'utility'], 'geyserInstant', [280, 130, 420], ['geyser', 'water heater', 'instant', 'tankless'], wall(1700)),
  gen('purifier', 'Water purifier', 'appliances', ['kitchen', 'dining', 'utility'], 'purifier', [320, 250, 500], ['ro', 'water filter', 'purifier', 'aquaguard', 'drinking water'], wall(1300)),
  glb('coffee.machine', 'Coffee machine', 'appliances', ['kitchen', 'dining'], 'coffee-machine', ['coffee maker', 'espresso', 'countertop'], on(WORKTOP)),
  glb('toaster', 'Toaster', 'appliances', ['kitchen'], 'toaster', ['toaster', 'countertop'], on(WORKTOP)),
  glb('blender', 'Blender', 'appliances', ['kitchen'], 'blender', ['mixer', 'grinder', 'juicer', 'countertop'], on(WORKTOP)),
  glb('speaker.floor', 'Floor speaker', 'appliances', ['living', 'bedroom'], 'speaker-floor', ['speaker', 'audio', 'tower speaker', 'hi-fi']),

  /* ----------------------------------------------------------- lighting */
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

  /* -------------------------------------------------------------- decor */
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

  /* ------------------------------------------------------------- office */
  glb('desk', 'Desk', 'office', ['study', 'bedroom'], 'desk', ['study table', 'work desk', 'writing desk', 'computer table']),
  glb('desk.corner', 'Corner desk', 'office', ['study'], 'desk-corner', ['study table', 'work desk', 'l-shaped']),
  glb('chair.office', 'Office chair', 'office', ['study', 'bedroom'], 'chair-office', ['desk chair', 'swivel chair', 'task chair']),
  glb('monitor', 'Monitor', 'office', ['study', 'bedroom'], 'monitor', ['computer', 'screen', 'display'], on(DESK)),
  glb('laptop', 'Laptop', 'office', ['study', 'bedroom', 'living'], 'laptop', ['computer', 'notebook'], on(DESK)),
  glb('keyboard', 'Keyboard', 'office', ['study', 'bedroom'], 'keyboard', ['computer', 'keys'], on(DESK)),
  gen('cabinet.filing', 'Filing cabinet', 'office', ['study'], 'cabinet', [460, 560, 700], ['pedestal', 'drawers', 'file storage'], {
    params: { rows: [drawers(1), drawers(1), drawers(1)], finish: 'steelLight', insideFinish: 'steelMid', handleFinish: 'steelDark', plinth: 40 },
  }),

  /* ------------------------------------------------------------ outdoor */
  glb('outdoor.chair', 'Balcony chair', 'outdoor', ['balcony'], 'outdoor-chair', ['patio chair', 'garden chair', 'outdoor']),
  glb('outdoor.table', 'Bistro table', 'outdoor', ['balcony'], 'outdoor-table', ['patio table', 'garden table', 'outdoor', 'tea table']),
  glb('outdoor.table.coffee', 'Outdoor coffee table', 'outdoor', ['balcony'], 'outdoor-coffee-table', ['patio table', 'garden table', 'outdoor']),
  glb('outdoor.bench', 'Garden bench', 'outdoor', ['balcony'], 'outdoor-bench', ['patio bench', 'outdoor', 'teak']),
  gen('outdoor.planter', 'Planter box', 'outdoor', ['balcony', 'foyer'], 'planter', [800, 300, 700], ['plants', 'planter', 'greenery', 'hedge']),
  gen('drying.rack', 'Clothes drying rack', 'outdoor', ['balcony', 'utility'], 'dryingRack', [1400, 560, 950], ['laundry', 'clothes stand', 'drying stand', 'airer']),
];
