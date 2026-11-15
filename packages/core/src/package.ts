/**
 * Furnishing packages: a minimum specification per room, like an interior designer's
 * quotation ("Living room: TV unit with black glass shutters, prayer unit, L-shaped sofa
 * with lounge, 4 extra cushions, carpet, large centre table, panelled TV wall...").
 *
 * Furnishing a home with a package guarantees every listed item and finish where it fits,
 * on top of the normal layout and styling, and reports what could not be placed.
 * Specification lines with nothing to draw (fittings, brands, mattresses) are listed in
 * the checklist as included.
 */
import type { BedroomRole, RoomType } from './schema';

/** What a package line applies to: a room type, or a bedroom of a given role. */
export type PackageRoom =
  | { kind: 'type'; type: RoomType }
  | { kind: 'bedroom'; role: BedroomRole };

export interface PackageItem {
  /** Stable within the package. */
  key: string;
  /** As written in the specification, e.g. "Sofa Fiori L shape 3 seater + lounge". */
  label: string;
  /**
   * Catalog ids that satisfy this line, best first. The first is placed when none is
   * present; an item of any listed id already in the room counts.
   */
  catalogIds: string[];
  /** How many are needed. Default 1. */
  count?: number;
  /** Finishes to give the placed item, by slot id (e.g. a yellow chair). */
  finishes?: Record<string, string>;
  /** Brand or detail that the model cannot show, e.g. "Faber", "soft-close". */
  note?: string;
  /**
   * Where to put it when the room itself has no space: a balcony that opens off the room
   * (for planters), or nowhere (default).
   */
  overflow?: 'adjacentBalcony';
}

export interface PackageSurface {
  key: string;
  label: string;
  /** `walls`: every wall of the room. `feature`: the wall behind the room's main piece
   * (bed, TV unit or sofa, else the longest free wall). `floor`, `ceiling`: the room's. */
  target: 'walls' | 'feature' | 'floor' | 'ceiling';
  /** A surface finish id (`MATERIALS`) or a colour as `#rrggbb`. */
  finish: string;
  note?: string;
}

/** A line with nothing to draw, shown in the checklist as included. */
export interface PackageSpec {
  key: string;
  label: string;
  note?: string;
}

export interface RoomPackage {
  /** Section title, e.g. "Master bedroom". */
  title: string;
  room: PackageRoom;
  items: PackageItem[];
  surfaces?: PackageSurface[];
  specs?: PackageSpec[];
}

export interface FurnishingPackage {
  id: string;
  name: string;
  description?: string;
  rooms: RoomPackage[];
}

/** Project setting holding the id of the package the home is furnished with. */
export const PACKAGE_SETTING = 'furnish.package';

/** Checklist status of one package line in one room. */
export type PackageLineStatus = 'placed' | 'partial' | 'missing' | 'noSpace' | 'included';
