/**
 * UI state of the Design view (tool, camera mode, panels). Plan data stays in the
 * plan store; nothing here is persisted.
 */
import { getEntry } from '@interio/catalog';
import type { CatalogCategory, CatalogEntry, Id } from '@interio/core';
import { create } from 'zustand';
import { normalizeDeg, type Placement } from './placement';

export type ViewMode = 'orbit' | 'top';

export interface Placing {
  catalogId: string;
  /** Rotation of the ghost when it is not snapped to a wall. */
  rotationDeg: number;
  /** Started by dragging a card out of the catalog: releasing over the floor places it. */
  fromDrag: boolean;
}

export interface LiveDrag {
  id: Id;
  mode: 'move' | 'rotate';
  pose: Placement;
}

export interface ViewerState {
  view: ViewMode;
  /** Fade walls between the camera and the rooms. */
  cutaway: boolean;
  /** Bumped to ask the camera to frame the whole plan again. */
  fitRequest: number;
  placing: Placing | null;
  /** Where the entry being placed would land; null while the cursor is off the plan. */
  ghost: Placement | null;
  /** Item being dragged or turned. Written to the plan store once, on release. */
  drag: LiveDrag | null;
  /** Room under the cursor (kept when the cursor leaves the canvas). */
  hoverRoomId: Id | null;
  query: string;
  category: CatalogCategory | 'all';
  /** Show only entries suggested for the room in focus. */
  roomOnly: boolean;

  setView(view: ViewMode): void;
  toggleCutaway(): void;
  requestFit(): void;
  startPlacing(catalogId: string, fromDrag?: boolean): void;
  stopPlacing(): void;
  rotatePlacing(delta: number): void;
  setGhost(ghost: Placement | null): void;
  setDrag(drag: LiveDrag | null): void;
  setHoverRoom(id: Id | null): void;
  setQuery(query: string): void;
  setCategory(category: CatalogCategory | 'all'): void;
  setRoomOnly(roomOnly: boolean): void;
}

export const useViewer = create<ViewerState>((set) => ({
  view: 'orbit',
  cutaway: true,
  fitRequest: 0,
  placing: null,
  ghost: null,
  drag: null,
  hoverRoomId: null,
  query: '',
  category: 'all',
  roomOnly: false,

  setView: (view) => set({ view }),
  toggleCutaway: () => set((s) => ({ cutaway: !s.cutaway })),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  startPlacing: (catalogId, fromDrag = false) =>
    set((s) => ({ placing: { catalogId, rotationDeg: s.placing?.rotationDeg ?? 0, fromDrag }, ghost: null, drag: null })),
  stopPlacing: () => set({ placing: null, ghost: null }),
  rotatePlacing: (delta) => set((s) => (s.placing ? { placing: { ...s.placing, rotationDeg: normalizeDeg(s.placing.rotationDeg + delta) } } : s)),
  setGhost: (ghost) => set({ ghost }),
  setDrag: (drag) => set({ drag }),
  setHoverRoom: (hoverRoomId) => set((s) => (s.hoverRoomId === hoverRoomId ? s : { hoverRoomId })),
  setQuery: (query) => set({ query }),
  setCategory: (category) => set({ category }),
  setRoomOnly: (roomOnly) => set({ roomOnly }),
}));

/** Camera facts the keyboard needs, updated by the camera rig without re-rendering anything. */
export const cameraState: { heading: () => number } = {
  /** Heading in degrees clockwise from plan north. */
  heading: () => 0,
};

/* ----------------------------------------------------------------- entries */

const extra = new Map<string, CatalogEntry>();

/** Registers an entry that is not in the catalog (development and tests: lets a GLB be tried without shipping it). */
export function registerEntry(entry: CatalogEntry): void {
  extra.set(entry.id, entry);
}

/** Catalog lookup used everywhere in the Design view. */
export function resolveEntry(catalogId: string): CatalogEntry | undefined {
  return extra.get(catalogId) ?? getEntry(catalogId);
}

const placeholders = new Map<string, CatalogEntry>();

/** Stand-in for items whose catalog entry no longer exists, so they stay visible and removable. */
export function entryOrPlaceholder(catalogId: string): CatalogEntry {
  const known = resolveEntry(catalogId);
  if (known) return known;
  let entry = placeholders.get(catalogId);
  if (!entry) {
    entry = {
      id: catalogId,
      name: 'Unknown item',
      category: 'decor',
      roomTypes: [],
      dims: { w: 600, d: 600, h: 600 },
      anchor: 'floor',
      model: { kind: 'parametric', generator: 'box' },
      licence: 'n/a',
    };
    placeholders.set(catalogId, entry);
  }
  return entry;
}
