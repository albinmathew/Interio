/** Catalog entries: seating. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import { glb } from './helpers';

export const SEATING_ENTRIES: CatalogEntry[] = [
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
];
