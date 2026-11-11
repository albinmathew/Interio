/** Catalog entries: seating. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { sofaSlots, upholsteredSlots } from '../premium/seating';
import {
  BENCH_CUSHION_SLOTS,
  BENCH_LOW_SLOTS,
  BENCH_TIMBER_SLOTS,
  CHAIR_CANTILEVER_SLOTS,
  CHAIR_ROUND_SLOTS,
  CHAIR_SHELL_SLOTS,
  CHAIR_TIMBER_SLOTS,
  CHAIR_UPHOLSTERED_SLOTS,
  STOOL_ROUND_SLOTS,
  STOOL_SQUARE_SLOTS,
} from '../premium/seating.chairs';
import { gen } from './helpers';

const SOFA_OAK = sofaSlots('fabric.linen.sand', 'fabric.velvet.rust', 'wood.oak');
const SOFA_WALNUT = sofaSlots('fabric.weave.grey', 'fabric.linen.ivory', 'wood.walnut');
const SOFA_IVORY = sofaSlots('fabric.linen.ivory', 'fabric.cotton.sage', 'wood.oak');
const SOFA_METAL = sofaSlots('fabric.weave.grey', 'fabric.cotton.mustard', 'metal.black', 'metal');
const SOFA_LOW = sofaSlots('fabric.boucle.cream', 'fabric.velvet.mocha', 'wood.walnut', 'wood', 'Plinth');
const ARMCHAIR = sofaSlots('fabric.boucle.cream', 'fabric.linen.taupe', 'wood.oak');
const OTTOMAN = upholsteredSlots('fabric.linen.taupe', 'wood.oak');
const POUF = upholsteredSlots('fabric.boucle.cream', 'wood.walnut', 'wood', 'Base');
const RECLINER = upholsteredSlots('leather.cognac', 'metal.black', 'metal', 'Base', 'leather');

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
  gen('ottoman', 'Ottoman', 'seating', ['living', 'bedroom'], 'ottoman', [800, 600, 430], ['footstool', 'pouf', 'stool'], { slots: OTTOMAN }),
  gen('ottoman.pouf', 'Round pouf', 'seating', ['living', 'bedroom'], 'ottoman', [500, 500, 420], ['pouf', 'footstool', 'stool', 'round'], {
    slots: POUF,
    params: { shape: 'round' },
  }),
  gen('armchair', 'Armchair', 'seating', ['living', 'bedroom', 'study'], 'sofa', [880, 860, 820], ['chair', 'lounge', 'accent chair'], {
    slots: ARMCHAIR,
    params: { arm: 'track', seats: 1, pillows: 1 },
  }),
  gen('armchair.recliner', 'Recliner', 'seating', ['living', 'bedroom'], 'recliner', [920, 1350, 1040], ['chair', 'lounge', 'recliner', 'footrest'], { slots: RECLINER }),
  gen('chair.dining', 'Dining chair', 'seating', ['dining', 'living', 'kitchen'], 'diningChair', [460, 520, 820], ['chair', 'wooden'], {
    slots: CHAIR_TIMBER_SLOTS,
    params: { style: 'timber' },
  }),
  gen('chair.dining.cushion', 'Cushioned dining chair', 'seating', ['dining', 'living', 'kitchen'], 'diningChair', [470, 530, 840], ['chair', 'upholstered'], {
    slots: CHAIR_UPHOLSTERED_SLOTS,
    params: { style: 'upholstered' },
  }),
  gen('chair.rounded', 'Round-back chair', 'seating', ['dining', 'kitchen', 'bedroom'], 'diningChair', [520, 520, 780], ['chair', 'wooden'], {
    slots: CHAIR_ROUND_SLOTS,
    params: { style: 'round' },
  }),
  gen('chair.modern', 'Modern chair', 'seating', ['dining', 'study', 'bedroom'], 'diningChair', [480, 530, 810], ['chair', 'upholstered', 'white'], {
    slots: CHAIR_SHELL_SLOTS,
    params: { style: 'shell' },
  }),
  gen('chair.modern.frame', 'Cantilever chair', 'seating', ['dining', 'study'], 'diningChair', [450, 560, 820], ['chair', 'metal', 'visitor'], {
    slots: CHAIR_CANTILEVER_SLOTS,
    params: { style: 'cantilever' },
  }),
  gen('bench', 'Hall bench', 'seating', ['foyer', 'dining', 'corridor'], 'seatBench', [1000, 360, 460], ['bench', 'seat', 'wooden'], {
    slots: BENCH_TIMBER_SLOTS,
    params: { style: 'slat' },
  }),
  gen('bench.cushion', 'Cushioned bench', 'seating', ['foyer', 'dining', 'bedroom'], 'seatBench', [1100, 400, 470], ['bench', 'seat', 'upholstered'], {
    slots: BENCH_CUSHION_SLOTS,
    params: { style: 'cushion' },
  }),
  gen('bench.low', 'Low bench', 'seating', ['bedroom', 'foyer', 'living'], 'seatBench', [1200, 420, 430], ['bench', 'end of bed', 'shoe bench'], {
    slots: BENCH_LOW_SLOTS,
    params: { style: 'low' },
  }),
  gen('stool.bar', 'Bar stool', 'seating', ['kitchen', 'dining'], 'barStool', [440, 440, 760], ['stool', 'counter stool', 'island'], {
    slots: STOOL_ROUND_SLOTS,
    params: { shape: 'round' },
  }),
  gen('stool.bar.square', 'Square bar stool', 'seating', ['kitchen', 'dining'], 'barStool', [420, 420, 750], ['stool', 'counter stool', 'island'], {
    slots: STOOL_SQUARE_SLOTS,
    params: { shape: 'square' },
  }),
];
