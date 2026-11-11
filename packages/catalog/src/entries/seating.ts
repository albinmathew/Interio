/** Catalog entries: seating. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { sofaSlots } from '../premium/seating';
import { gen, glb } from './helpers';

const SOFA_OAK = sofaSlots('fabric.linen.sand', 'fabric.velvet.rust', 'wood.oak');
const SOFA_WALNUT = sofaSlots('fabric.weave.grey', 'fabric.linen.ivory', 'wood.walnut');
const SOFA_IVORY = sofaSlots('fabric.linen.ivory', 'fabric.cotton.sage', 'wood.oak');
const SOFA_METAL = sofaSlots('fabric.weave.grey', 'fabric.cotton.mustard', 'metal.black', 'metal');
const SOFA_LOW = sofaSlots('fabric.boucle.cream', 'fabric.velvet.mocha', 'wood.walnut', 'wood', 'Plinth');
const ARMCHAIR = sofaSlots('fabric.boucle.cream', 'fabric.linen.taupe', 'wood.oak');

export const SEATING_ENTRIES: CatalogEntry[] = [
  gen('sofa.3seat', 'Three-seat sofa', 'seating', ['living'], 'sofa', [2100, 900, 840], ['sofa', 'couch', 'settee', 'lounge'], {
    slots: SOFA_OAK,
    params: { arm: 'track', pillows: 3, throw: true },
  }),
  gen('sofa.2seat', 'Two-seat sofa', 'seating', ['living', 'study', 'bedroom'], 'sofa', [1650, 880, 840], ['sofa', 'couch', 'loveseat', 'settee'], {
    slots: SOFA_WALNUT,
    params: { arm: 'roll', legs: 'block', pillows: 2 },
  }),
  gen('sofa.corner', 'Corner sofa', 'seating', ['living'], 'sofa', [2400, 2000, 840], ['sofa', 'couch', 'sectional', 'l-shaped'], {
    slots: SOFA_IVORY,
    params: { corner: 'left', arm: 'track', pillows: 3, bodyDepth: 920 },
  }),
  gen('sofa.chaise', 'Sofa with chaise', 'seating', ['living'], 'sofa', [2400, 1600, 840], ['sofa', 'couch', 'sectional', 'chaise', 'l-shaped'], {
    slots: SOFA_METAL,
    params: { chaise: 'right', arm: 'track', legs: 'metal', pillows: 2, throw: true, bodyDepth: 920 },
  }),
  gen('sofa.modern.3seat', 'Low modern sofa', 'seating', ['living'], 'sofa', [2250, 980, 720], ['sofa', 'couch', 'modern', 'low'], {
    slots: SOFA_LOW,
    params: { low: true, pillows: 3 },
  }),
  gen('sofa.modern.loveseat', 'Modern loveseat', 'seating', ['living', 'bedroom', 'study'], 'sofa', [1550, 950, 720], ['sofa', 'couch', 'loveseat', 'modern'], {
    slots: SOFA_LOW,
    params: { low: true, pillows: 2 },
  }),
  gen('sofa.modern.corner', 'Low modern corner sofa', 'seating', ['living'], 'sofa', [2800, 2400, 720], ['sofa', 'couch', 'sectional', 'modern', 'l-shaped'], {
    slots: SOFA_LOW,
    params: { low: true, corner: 'left', pillows: 4, bodyDepth: 1000 },
  }),
  glb('ottoman', 'Ottoman', 'seating', ['living', 'bedroom'], 'sofa-ottoman', ['footstool', 'pouf', 'stool']),
  gen('armchair', 'Armchair', 'seating', ['living', 'bedroom', 'study'], 'sofa', [880, 860, 820], ['chair', 'lounge', 'accent chair'], {
    slots: ARMCHAIR,
    params: { arm: 'track', seats: 1, pillows: 1 },
  }),
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
];
