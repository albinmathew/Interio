/**
 * The owner's minimum specification for a three-bedroom apartment, as quoted by an
 * interior designer. Every line is guaranteed by "Furnish home" where it fits.
 */
import type { FurnishingPackage } from '@interio/core';

/** Stacked curtains of every width (the styling pass hangs these), and the older flat pair. */
const CURTAINS = [...[1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900].map((w) => `curtain.pair.${w}`), 'curtain.pair'];
/**
 * A kids' room may be done as twin single beds with a basket unit between them and a study
 * and storage wall: two singles count as the bed, the unit as both bedside tables, and the
 * wall (a wardrobe, a writing table and a lit shelf) as the wardrobe, desk and bookshelf.
 */
const KIDS_STUDY_WALLS: Record<string, number> = Object.fromEntries(['study.storage.kids.2100', 'study.storage.kids.2400', 'study.storage.kids.2100.r', 'study.storage.kids.2400.r'].map((id) => [id, 1]));
const BLINDS = ['blind.roman.1800', 'blind.roman.1500', 'blind.roman.2100', 'blind.roman.1200', 'blind.roman.2400', 'blind.roman.900'];

export const ESSENTIALS_3BHK: FurnishingPackage = {
  id: 'essentials-3bhk',
  name: 'Essentials, 3 BHK',
  description: 'The minimum fit-out for a three-bedroom apartment: built-ins, furniture, soft furnishings and feature walls in every room.',
  rooms: [
    {
      title: 'Foyer',
      room: { kind: 'type', type: 'foyer' },
      items: [
        { key: 'shoe-rack', label: 'Shoe rack and ledges', catalogIds: ['shoe.rack.ledges', 'shoe.cabinet'], overflow: 'adjacentRoom', note: 'By the entrance; just past the foyer when it has no free wall' },
        { key: 'mirror-art', label: 'Brass finish mirror wall art', catalogIds: ['mirror.sunburst'] },
      ],
      surfaces: [{ key: 'cement', label: 'Cement texture', target: 'walls', finish: 'wall.microcement' }],
    },
    {
      title: 'Living room',
      room: { kind: 'type', type: 'living' },
      items: [
        { key: 'tv-unit', label: 'TV unit with black glass shutters', catalogIds: ['tv.unit.glass'] },
        { key: 'prayer', label: 'Prayer unit', catalogIds: ['prayer.unit.christian', 'prayer.unit.christian.compact'], note: 'Christian altar: backlit niche with the dove, Sacred Heart, St Joseph, Mother Mary, the St Thomas cross and the Bible' },
        { key: 'curtains', label: 'Curtain with lining', catalogIds: CURTAINS, note: 'Lined; on every window and sliding door with wall space' },
        { key: 'clock', label: 'Decorative roman clock', catalogIds: ['clock.roman'] },
        { key: 'sofa', label: 'Sofa Fiori L shape 3 seater + lounge', catalogIds: ['sofa.lshape', 'sofa.chaise'], note: 'Fiori' },
        { key: 'cushions', label: 'Additional cushions for sofa', catalogIds: ['sofa.lshape', 'sofa.chaise'], count: 1, note: '4 cushions on the sofa' },
        { key: 'carpet', label: 'Carpet', catalogIds: ['rug.large', 'rug.rectangle'] },
        { key: 'centre-table', label: 'Centre table (Large)', catalogIds: ['table.coffee.large'] },
      ],
      surfaces: [{ key: 'panelling', label: 'Costae wall paneling', target: 'feature', finish: 'wall.panel.fluted', note: 'Behind the TV unit' }],
    },
    {
      title: 'Kitchen',
      room: { kind: 'type', type: 'kitchen' },
      items: [
        { key: 'top', label: 'Top cabinet', catalogIds: ['kitchen.wall.double', 'kitchen.wall', 'kitchen.wall.low', 'kitchen.wall.end'] },
        { key: 'bottom', label: 'Bottom cabinet', catalogIds: ['kitchen.counter.2400', 'kitchen.counter.1800', 'kitchen.counter.1200', 'kitchen.base', 'kitchen.base.drawers', 'kitchen.sink'] },
        { key: 'hood', label: 'Hood', catalogIds: ['hood.chimney', 'hood.canopy'], note: 'Faber' },
        { key: 'hob', label: 'Hob', catalogIds: ['hob.4burner', 'hob.5burner', 'hob.2burner', 'hob.induction'], note: 'Faber' },
      ],
      specs: [{ key: 'hettich', label: 'Hettich accessories (German, 15 years warranty)', note: '6 Nos' }],
    },
    {
      title: 'Dining room',
      room: { kind: 'type', type: 'dining' },
      items: [
        { key: 'table', label: '6 Seater dining table', catalogIds: ['table.dining6', 'table.dining.trestle', 'table.dining.glass'] },
        { key: 'chairs', label: 'Briano dining chair', catalogIds: ['chair.dining.cushion'], count: 3, note: 'Briano' },
        { key: 'bench', label: '3 Seater dining bench', catalogIds: ['bench.dining'] },
        { key: 'partition', label: 'Custom-made living-dining partition', catalogIds: ['partition.slatted'] },
        { key: 'wash', label: 'Common wash', catalogIds: ['basin.vanity'] },
        { key: 'crockery', label: 'Crockery unit', catalogIds: ['crockery.unit', 'crockery.unit.compact'], note: 'Behind the dining table, against the wall; plants give way to it' },
        { key: 'planters', label: 'Planter box', catalogIds: ['outdoor.planter'], count: 6, overflow: 'adjacentBalcony' },
      ],
      surfaces: [{ key: 'cement', label: 'Cement texture', target: 'feature', finish: 'wall.microcement' }],
    },
    {
      title: 'Master bedroom',
      room: { kind: 'bedroom', role: 'master' },
      items: [
        { key: 'wardrobe', label: 'Soft-close hinged wardrobe up to ceiling', catalogIds: ['wardrobe.ceiling'], note: 'Soft-close' },
        { key: 'dressing', label: 'Dressing unit', catalogIds: ['dressing.unit'] },
        { key: 'desk', label: 'Custom-made writing table', catalogIds: ['desk.writing', 'desk'] },
        { key: 'bookshelf', label: 'Bookshelf with open storage', catalogIds: ['bookcase.open', 'bookcase.low', 'bookcase.wide'] },
        { key: 'bed', label: 'King size bed with bottom drawer', catalogIds: ['bed.king.drawers'] },
        { key: 'bedside', label: 'Bed side table', catalogIds: ['nightstand.drawer', 'nightstand', 'nightstand.table'], count: 2 },
        { key: 'blinds', label: 'Premium Roman Blinds', catalogIds: [...BLINDS, ...CURTAINS], note: 'On every window; curtains on sliding doors' },
        { key: 'chair', label: 'Single chair yellow', catalogIds: ['armchair'], finishes: { upholstery: 'fabric.cotton.mustard' } },
      ],
      surfaces: [{ key: 'wallpaper', label: 'Wall paper', target: 'feature', finish: 'wall.wallpaper.linen', note: '3 rolls, behind the bed' }],
      specs: [
        { key: 'mattress', label: 'Mattress', note: 'Peps' },
        { key: 'bed-setting', label: 'Bed setting', note: 'Linen, pillows and throw' },
      ],
    },
    {
      title: 'Kids bedroom',
      room: { kind: 'bedroom', role: 'kids' },
      items: [
        { key: 'bed', label: 'Queen size bed without bottom storage', catalogIds: ['bed.queen'], alsoCounts: { 'bed.single.kids': 1 } },
        { key: 'bedside', label: 'Bed side table', catalogIds: ['nightstand.drawer', 'nightstand', 'nightstand.table'], count: 2, alsoCounts: { 'nightstand.baskets': 2 } },
        { key: 'wardrobe', label: 'Soft-close hinged wardrobe with mirror aluminium frame shutter', catalogIds: ['wardrobe.mirror'], note: 'Soft-close', alsoCounts: KIDS_STUDY_WALLS },
        { key: 'desk', label: 'Custom-made writing table', catalogIds: ['desk.writing', 'desk'], alsoCounts: KIDS_STUDY_WALLS },
        { key: 'bookshelf', label: 'Bookshelf with open storage', catalogIds: ['bookcase.open', 'bookcase.low', 'bookcase.wide'], alsoCounts: KIDS_STUDY_WALLS },
      ],
      specs: [
        { key: 'mattress', label: 'Mattress', note: 'Peps' },
        { key: 'bed-setting', label: 'Bed setting' },
      ],
    },
    {
      title: 'Guest bedroom',
      room: { kind: 'bedroom', role: 'guest' },
      items: [
        { key: 'bed', label: 'Queen size bed with bottom storage', catalogIds: ['bed.queen.storage'] },
        { key: 'bedside', label: 'Bed side table', catalogIds: ['nightstand.drawer', 'nightstand', 'nightstand.table'], count: 2 },
        { key: 'blinds', label: 'Premium Roman Blinds', catalogIds: [...BLINDS, ...CURTAINS], note: 'On every window; curtains on sliding doors' },
        { key: 'wardrobe', label: 'Soft-close hinged wardrobe with mirror aluminium frame shutter', catalogIds: ['wardrobe.mirror'], note: 'Soft-close' },
      ],
      surfaces: [
        { key: 'wallpaper', label: 'Wall paper', target: 'feature', finish: 'wall.wallpaper.linen', note: '3 rolls, behind the bed' },
        { key: 'pastel', label: 'Pastel shade highlights', target: 'walls', finish: 'wall.paint.blush' },
      ],
      specs: [
        { key: 'mattress', label: 'Mattress', note: 'Peps' },
        { key: 'bed-setting', label: 'Bed setting' },
      ],
    },
  ],
};
