/**
 * Colour schemes for the styling pass. A home gets one scheme (seeded by its
 * first room), so every room shares the same timbers, metals and textiles; the
 * accent fabrics, ceramics and rugs vary from room to room within it.
 *
 * Finishes are chosen per slot from the slot's kind and role. Only furniture
 * and decor are dressed: kitchen units, sanitaryware, appliances and outdoor
 * pieces keep their catalog finishes.
 */
import type { CatalogEntry } from '@interio/core';
import type { RoomSeed } from './seed';

export interface Scheme {
  id: string;
  name: string;
  /** Main timber: tables, bed frames, chairs, frames. */
  wood: string;
  /** Darker accent timber: media units, sideboards, consoles. */
  woodDark: string;
  /** Sofa upholstery. */
  sofa: string;
  /** Armchairs, benches and ottomans. */
  chair: string;
  /** Dining chair upholstery. */
  dining: string;
  /** Throw pillows and blankets on sofas and armchairs; one per room. */
  cushions: readonly string[];
  headboard: string;
  /** Bed throws; one per room. */
  bedThrow: readonly string[];
  /** Curtains and lamp shades. */
  linen: string;
  /** Handles, lamp fittings, rods and frames. */
  metal: string;
  /** Lacquered doors and drawer fronts. */
  fronts: string;
  /** Plant pots, lamp bases and vases; varied per piece. */
  ceramics: readonly string[];
  /** Rug pile and border pairs; one per room. */
  rugs: readonly (readonly [string, string])[];
  stone: string;
}

export const SCHEMES: readonly Scheme[] = [
  {
    id: 'oak-linen',
    name: 'Warm oak and linen',
    wood: 'wood.oak',
    woodDark: 'wood.walnut',
    sofa: 'fabric.weave.charcoal',
    chair: 'fabric.boucle.cream',
    dining: 'fabric.linen.sand',
    cushions: ['fabric.linen.sand', 'fabric.velvet.rust', 'fabric.linen.ivory'],
    headboard: 'fabric.linen.sand',
    bedThrow: ['fabric.linen.taupe', 'fabric.velvet.rust', 'fabric.linen.sand'],
    linen: 'fabric.linen.ivory',
    metal: 'metal.black',
    fronts: 'lacquer.greige',
    ceramics: ['ceramic.terracotta', 'ceramic.white', 'ceramic.white'],
    rugs: [
      ['fabric.boucle.cream', 'fabric.linen.taupe'],
      ['fabric.linen.sand', 'fabric.weave.charcoal'],
    ],
    stone: 'stone.travertine',
  },
  {
    id: 'walnut-cream-brass',
    name: 'Walnut and cream with brass',
    wood: 'wood.walnut',
    woodDark: 'wood.walnut',
    sofa: 'fabric.boucle.cream',
    chair: 'fabric.velvet.mocha',
    dining: 'fabric.boucle.cream',
    cushions: ['fabric.velvet.mocha', 'fabric.cotton.mustard', 'fabric.linen.sand'],
    headboard: 'fabric.boucle.cream',
    bedThrow: ['fabric.velvet.mocha', 'fabric.cotton.mustard', 'fabric.linen.taupe'],
    linen: 'fabric.linen.ivory',
    metal: 'metal.brass',
    fronts: 'lacquer.cream',
    ceramics: ['ceramic.white', 'ceramic.black', 'ceramic.white'],
    rugs: [
      ['fabric.linen.sand', 'fabric.velvet.mocha'],
      ['fabric.boucle.cream', 'fabric.linen.sand'],
    ],
    stone: 'stone.marble.white',
  },
  {
    id: 'white-oak-sage',
    name: 'White oak and sage',
    wood: 'wood.oak.light',
    woodDark: 'wood.oak',
    sofa: 'fabric.linen.taupe',
    chair: 'fabric.boucle.cream',
    dining: 'fabric.cotton.sage',
    cushions: ['fabric.cotton.sage', 'fabric.linen.ivory', 'fabric.linen.sand'],
    headboard: 'fabric.cotton.sage',
    bedThrow: ['fabric.cotton.sage', 'fabric.linen.sand', 'fabric.linen.taupe'],
    linen: 'fabric.linen.ivory',
    metal: 'metal.black',
    fronts: 'lacquer.sage',
    ceramics: ['ceramic.white', 'ceramic.terracotta', 'ceramic.white'],
    rugs: [
      ['fabric.boucle.cream', 'fabric.cotton.sage'],
      ['fabric.linen.ivory', 'fabric.linen.sand'],
    ],
    stone: 'stone.travertine',
  },
];

const DRESSED = new Set(['seating', 'tables', 'beds', 'storage', 'decor', 'lighting', 'office']);
/** Utility pieces that keep their own finishes even in a dressed category. */
const PLAIN = /^(shelf\.metal|box\.|trashcan|light\.(ceiling|downlight|batten)|chair\.office|monitor|laptop|keyboard|cabinet\.filing)/;
/** Pieces in the darker accent timber. */
const DARK = /^(tv\.unit|sideboard|table\.console|table\.side)/;

/**
 * Finishes for one item in the room's scheme, by slot. Undefined when the entry
 * keeps its catalog finishes. Every value is a furniture material of the slot's kind.
 */
export function schemeFinishes(entry: CatalogEntry, scheme: Scheme, seed: RoomSeed): Record<string, string> | undefined {
  if (!entry.slots?.length || !DRESSED.has(entry.category) || PLAIN.test(entry.id)) return undefined;
  const id = entry.id;
  const out: Record<string, string> = {};
  const rug = seed.pick('rug-colour', scheme.rugs);
  for (const slot of entry.slots) {
    let value: string | undefined;
    switch (slot.kind) {
      case 'wood':
        value = DARK.test(id) || (id.startsWith('table.coffee') && slot.id === 'legs') ? scheme.woodDark : scheme.wood;
        break;
      case 'metal':
        // Pendant domes and mirror frames keep their character; fittings, handles, rods and frames follow the scheme.
        if (slot.id === 'shade') break;
        value = scheme.metal;
        break;
      case 'lacquer':
        if (slot.id === 'fronts' || slot.id === 'back') value = scheme.fronts;
        break;
      case 'ceramic':
        value = seed.pick(`ceramic:${id}:${slot.id}`, scheme.ceramics);
        break;
      case 'stone':
        value = scheme.stone;
        break;
      case 'fabric':
        value = fabricFor(id, slot.id, scheme, seed, rug);
        break;
      default:
        break;
    }
    if (value) out[slot.id] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function fabricFor(id: string, slot: string, scheme: Scheme, seed: RoomSeed, rug: readonly [string, string]): string | undefined {
  switch (slot) {
    case 'upholstery':
      if (id.startsWith('sofa.')) return scheme.sofa;
      if (id.startsWith('chair.')) return scheme.dining;
      return scheme.chair;
    case 'cushions':
    case 'accent':
      return seed.pick('cushions', scheme.cushions);
    case 'large':
      return scheme.linen;
    case 'lumbar':
      return scheme.headboard;
    case 'headboard':
      return scheme.headboard;
    case 'throw':
      return seed.pick('throw', scheme.bedThrow);
    case 'shade':
    case 'fabric':
      return scheme.linen;
    case 'pile':
      return rug[0];
    case 'border':
      return rug[1];
    default:
      return undefined;
  }
}

/** The home's scheme. */
export function homeScheme(seed: RoomSeed): Scheme {
  return SCHEMES[seed.home % SCHEMES.length]!;
}
