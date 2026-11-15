/**
 * Catalog entries: pieces a furnishing package needs that the families above lack
 * (prayer unit, Roman-numeral clock, Roman blinds, ceiling-height and mirror-shutter
 * wardrobes, beds with drawers or storage, a living-dining partition...).
 *
 * Ids, names, sizes and anchors here are the contract the package furnishing codes
 * against. Their premium generators live in `premium/essentials.ts` and `premium/essentials.*.ts`;
 * keep the ids, sizes and anchors when changing a model.
 */
import type { CatalogEntry } from '@interio/core';
import { BED_SLOTS } from '../premium/beds';
import {
  ESS_ALTAR_SLOTS,
  ESS_BEDROOM_SLOTS,
  ESS_BLIND_SLOTS,
  ESS_CLOCK_SLOTS,
  ESS_COFFEE_SLOTS,
  ESS_CROCKERY_SLOTS,
  ESS_DRESSING_SLOTS,
  ESS_PARTITION_SLOTS,
  ESS_PRAYER_SLOTS,
  ESS_SHOE_SLOTS,
  ESS_SUNBURST_SLOTS,
  ESS_TV_SLOTS,
  ESS_WARDROBE_SLOTS,
} from '../premium/essentials.parts';
import { sofaSlots } from '../premium/seating';
import { CHAIR_UPHOLSTERED_SLOTS } from '../premium/seating.chairs';
import { gen, wall } from './helpers';

const BLIND_WIDTHS = [900, 1200, 1500, 1800, 2100, 2400];

export const ESSENTIALS_ENTRIES: CatalogEntry[] = [
  /* foyer */
  gen('shoe.rack.ledges', 'Shoe rack with ledges', 'storage', ['foyer', 'corridor'], 'essentialsShoeRack', [1000, 350, 1900], ['shoe rack', 'shoe cabinet', 'ledge', 'entryway', 'foyer'], { slots: ESS_SHOE_SLOTS }),
  gen('mirror.sunburst', 'Brass sunburst mirror', 'decor', ['foyer', 'living', 'dining', 'corridor'], 'essentialsSunburst', [800, 60, 800], ['mirror', 'wall art', 'brass', 'sunburst', 'decorative mirror'], { ...wall(1350), slots: ESS_SUNBURST_SLOTS }),

  /* living */
  gen('tv.unit.glass', 'TV unit with black glass shutters', 'storage', ['living', 'bedroom'], 'essentialsTvGlass', [1800, 420, 500], ['tv unit', 'media unit', 'glass shutters', 'black glass', 'entertainment unit'], { slots: ESS_TV_SLOTS }),
  gen('prayer.unit', 'Prayer unit', 'storage', ['living', 'dining', 'foyer', 'other'], 'essentialsPrayer', [900, 450, 1800], ['pooja unit', 'mandir', 'temple', 'prayer', 'puja'], { slots: ESS_PRAYER_SLOTS }),
  gen('prayer.unit.christian', 'Christian prayer unit', 'storage', ['living', 'dining', 'foyer', 'other'], 'essentialsAltar', [1500, 450, 2400], ['prayer', 'altar', 'christian', 'church', 'cross', 'pooja', 'pooja unit', 'prayer unit', 'home altar', 'catholic'], { slots: ESS_ALTAR_SLOTS }),
  // The same altar for a shorter wall: narrower flutes and niche, the statues scaled with it.
  gen('prayer.unit.christian.compact', 'Christian prayer unit, compact', 'storage', ['living', 'dining', 'foyer', 'other'], 'essentialsAltar', [1100, 450, 2400], ['prayer', 'altar', 'christian', 'church', 'cross', 'pooja', 'pooja unit', 'prayer unit', 'home altar', 'catholic', 'compact', 'small'], { slots: ESS_ALTAR_SLOTS }),
  gen('clock.roman', 'Roman-numeral wall clock', 'decor', ['living', 'dining', 'foyer', 'study'], 'essentialsClock', [600, 60, 600], ['clock', 'wall clock', 'roman', 'decorative clock'], { ...wall(1800), slots: ESS_CLOCK_SLOTS }),
  gen('sofa.lshape', 'L-shaped sofa, 3 seater + lounge', 'seating', ['living'], 'essentialsSofaL', [2700, 1650, 820], ['sofa', 'couch', 'l-shaped', 'lounger', 'chaise', 'sectional', 'fiori'], {
    slots: sofaSlots('fabric.linen.sand', 'fabric.velvet.mocha', 'wood.walnut'),
    params: { chaise: 'right', seats: 3, pillows: 4 },
  }),
  gen('table.coffee.large', 'Large centre table', 'tables', ['living'], 'essentialsCentreTable', [1300, 750, 400], ['centre table', 'center table', 'coffee table', 'large'], { slots: ESS_COFFEE_SLOTS }),
  gen('partition.slatted', 'Living-dining partition', 'decor', ['living', 'dining'], 'essentialsPartition', [1200, 60, 2400], ['partition', 'divider', 'screen', 'slatted', 'room divider', 'jaali'], { slots: ESS_PARTITION_SLOTS }),

  /* dining */
  gen('crockery.unit', 'Crockery unit', 'storage', ['dining', 'living', 'kitchen'], 'essentialsCrockery', [1500, 450, 2100], ['crockery', 'crockery unit', 'display', 'display cabinet', 'cabinet', 'dining', 'glass', 'bar', 'cutlery', 'buffet'], { slots: ESS_CROCKERY_SLOTS }),
  // The same unit for a shorter wall: two glass doors, no open niches.
  gen('crockery.unit.compact', 'Crockery unit, compact', 'storage', ['dining', 'living', 'kitchen'], 'essentialsCrockery', [1000, 450, 2100], ['crockery', 'crockery unit', 'display', 'display cabinet', 'cabinet', 'dining', 'glass', 'bar', 'cutlery', 'compact', 'small'], { slots: ESS_CROCKERY_SLOTS }),
  gen('bench.dining', 'Three-seater dining bench', 'seating', ['dining', 'living'], 'essentialsBench', [1500, 400, 460], ['bench', 'dining bench', 'three seater', 'upholstered'], { slots: CHAIR_UPHOLSTERED_SLOTS }),

  /* bedrooms */
  gen('wardrobe.ceiling', 'Ceiling-height hinged wardrobe', 'storage', ['bedroom'], 'essentialsWardrobe', [1800, 600, 2850], ['wardrobe', 'almirah', 'closet', 'hinged', 'soft-close', 'loft', 'floor to ceiling'], {
    slots: ESS_WARDROBE_SLOTS,
    params: { doors: 4, loft: 0.25 },
  }),
  gen('wardrobe.mirror', 'Wardrobe with mirror shutters', 'storage', ['bedroom'], 'essentialsWardrobe', [1500, 600, 2400], ['wardrobe', 'almirah', 'closet', 'hinged', 'soft-close', 'mirror', 'aluminium frame'], {
    slots: ESS_WARDROBE_SLOTS,
    params: { doors: 3, loft: 0.17, mirror: true },
  }),
  gen('dressing.unit', 'Dressing unit', 'storage', ['bedroom'], 'essentialsDressing', [900, 450, 1700], ['dressing table', 'vanity', 'dresser', 'mirror', 'makeup'], { slots: ESS_DRESSING_SLOTS }),
  gen('desk.writing', 'Writing table', 'office', ['bedroom', 'study'], 'essentialsWritingDesk', [1200, 550, 750], ['desk', 'study table', 'writing table', 'work table'], { slots: ESS_BEDROOM_SLOTS }),
  gen('bed.king.drawers', 'King bed with bottom drawers', 'beds', ['bedroom'], 'essentialsBedDrawers', [1950, 2150, 1150], ['bed', 'king', 'master', 'storage', 'drawers'], {
    slots: BED_SLOTS,
    params: { pillows: 3 },
  }),
  gen('bed.queen.storage', 'Queen bed with bottom storage', 'beds', ['bedroom'], 'essentialsBedBox', [1700, 2150, 1100], ['bed', 'queen', 'storage', 'hydraulic', 'box bed'], { slots: BED_SLOTS }),
  ...BLIND_WIDTHS.map((w) =>
    gen(`blind.roman.${w}`, `Roman blind, ${(w / 1000).toFixed(1)} m`, 'decor', ['bedroom', 'living', 'study', 'dining', 'kitchen'], 'essentialsRomanBlind', [w, 80, 1500], ['blind', 'roman blind', 'window', 'shade'], { ...wall(850), slots: ESS_BLIND_SLOTS }),
  ),
];
