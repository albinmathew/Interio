/**
 * Catalog entries: pieces a furnishing package needs that the families above lack
 * (prayer unit, Roman-numeral clock, Roman blinds, ceiling-height and mirror-shutter
 * wardrobes, beds with drawers or storage, a living-dining partition...).
 *
 * Ids, names, sizes and anchors here are the contract the package furnishing codes
 * against. The models start as the `essentialsPlaceholder` block and are replaced by
 * premium generators in `premium/essentials.ts`; keep the ids and the anchors when doing so.
 */
import type { CatalogEntry } from '@interio/core';
import { BED_SLOTS } from '../premium/beds';
import { ESS_BLIND_SLOTS } from '../premium/essentials.parts';
import { sofaSlots } from '../premium/seating';
import { gen, wall } from './helpers';

const BLIND_WIDTHS = [900, 1200, 1500, 1800, 2100, 2400];

export const ESSENTIALS_ENTRIES: CatalogEntry[] = [
  /* foyer */
  gen('shoe.rack.ledges', 'Shoe rack with ledges', 'storage', ['foyer', 'corridor'], 'essentialsPlaceholder', [1000, 350, 1900], ['shoe rack', 'shoe cabinet', 'ledge', 'entryway', 'foyer']),
  gen('mirror.sunburst', 'Brass sunburst mirror', 'decor', ['foyer', 'living', 'dining', 'corridor'], 'essentialsPlaceholder', [800, 60, 800], ['mirror', 'wall art', 'brass', 'sunburst', 'decorative mirror'], wall(1350)),

  /* living */
  gen('tv.unit.glass', 'TV unit with black glass shutters', 'storage', ['living', 'bedroom'], 'essentialsPlaceholder', [1800, 420, 500], ['tv unit', 'media unit', 'glass shutters', 'black glass', 'entertainment unit']),
  gen('prayer.unit', 'Prayer unit', 'storage', ['living', 'dining', 'foyer', 'other'], 'essentialsPlaceholder', [900, 450, 1800], ['pooja unit', 'mandir', 'temple', 'prayer', 'puja']),
  gen('clock.roman', 'Roman-numeral wall clock', 'decor', ['living', 'dining', 'foyer', 'study'], 'essentialsPlaceholder', [600, 60, 600], ['clock', 'wall clock', 'roman', 'decorative clock'], wall(1800)),
  gen('sofa.lshape', 'L-shaped sofa, 3 seater + lounge', 'seating', ['living'], 'essentialsSofaL', [2700, 1650, 820], ['sofa', 'couch', 'l-shaped', 'lounger', 'chaise', 'sectional', 'fiori'], {
    slots: sofaSlots('fabric.linen.sand', 'fabric.velvet.mocha', 'wood.walnut'),
    params: { chaise: 'right', seats: 3, pillows: 4 },
  }),
  gen('table.coffee.large', 'Large centre table', 'tables', ['living'], 'essentialsPlaceholder', [1300, 750, 400], ['centre table', 'center table', 'coffee table', 'large']),
  gen('partition.slatted', 'Living-dining partition', 'decor', ['living', 'dining'], 'essentialsPlaceholder', [1200, 60, 2400], ['partition', 'divider', 'screen', 'slatted', 'room divider', 'jaali']),

  /* dining */
  gen('bench.dining', 'Three-seater dining bench', 'seating', ['dining', 'living'], 'essentialsPlaceholder', [1500, 400, 460], ['bench', 'dining bench', 'three seater', 'upholstered']),

  /* bedrooms */
  gen('wardrobe.ceiling', 'Ceiling-height hinged wardrobe', 'storage', ['bedroom'], 'essentialsPlaceholder', [1800, 600, 2850], ['wardrobe', 'almirah', 'closet', 'hinged', 'soft-close', 'loft', 'floor to ceiling']),
  gen('wardrobe.mirror', 'Wardrobe with mirror shutters', 'storage', ['bedroom'], 'essentialsPlaceholder', [1500, 600, 2400], ['wardrobe', 'almirah', 'closet', 'hinged', 'soft-close', 'mirror', 'aluminium frame']),
  gen('dressing.unit', 'Dressing unit', 'storage', ['bedroom'], 'essentialsPlaceholder', [900, 450, 1700], ['dressing table', 'vanity', 'dresser', 'mirror', 'makeup']),
  gen('desk.writing', 'Writing table', 'office', ['bedroom', 'study'], 'essentialsPlaceholder', [1200, 550, 750], ['desk', 'study table', 'writing table', 'work table']),
  gen('bed.king.drawers', 'King bed with bottom drawers', 'beds', ['bedroom'], 'essentialsBedDrawers', [1950, 2150, 1150], ['bed', 'king', 'master', 'storage', 'drawers'], {
    slots: BED_SLOTS,
    params: { pillows: 3 },
  }),
  gen('bed.queen.storage', 'Queen bed with bottom storage', 'beds', ['bedroom'], 'essentialsBedBox', [1700, 2150, 1100], ['bed', 'queen', 'storage', 'hydraulic', 'box bed'], { slots: BED_SLOTS }),
  ...BLIND_WIDTHS.map((w) =>
    gen(`blind.roman.${w}`, `Roman blind, ${(w / 1000).toFixed(1)} m`, 'decor', ['bedroom', 'living', 'study', 'dining', 'kitchen'], 'essentialsRomanBlind', [w, 80, 1500], ['blind', 'roman blind', 'window', 'shade'], { ...wall(850), slots: ESS_BLIND_SLOTS }),
  ),
];
