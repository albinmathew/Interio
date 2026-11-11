/**
 * UI state of the Design view (tool, camera mode, panels). Plan data stays in the
 * plan store; nothing here is persisted.
 */
import { getEntry } from '@interio/catalog';
import { usePlanStore, type CatalogCategory, type CatalogEntry, type Id } from '@interio/core';
import { detectSoftwareRenderer, lightingFromSettings, type LightingPreset } from '@interio/scene3d';
import { create } from 'zustand';
import { normalizeDeg, type Placement } from './placement';

/** `showcase`: a steep three-quarter view from above, drawn at the best quality, for pictures. */
export type ViewMode = 'orbit' | 'top' | 'showcase';

/** Panels that dock on the right: the design assistant and the saved variants. One at a time. */
export type Dock = 'assistant' | 'variants';

/** Width of the docked panel, in CSS pixels. */
export const DOCK_WIDTH = 304;

/** Sections of the room panel. */
export type RoomTab = 'furnish' | 'finishes';

export interface Placing {
  catalogId: string;
  /** Rotation of the ghost when it is not snapped to a wall. */
  rotationDeg: number;
  /** Started by dragging a card out of the catalog: releasing over the floor places it. */
  fromDrag: boolean;
}

/** One face of a wall: the last one clicked in the view. */
export interface WallFace {
  wallId: Id;
  side: 'left' | 'right';
  /** The room the face looks into; null for an outside face. */
  roomId: Id | null;
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
  /** Rendering quality: `low` drops ambient occlusion and the high pixel ratio when frames get slow. */
  quality: 'high' | 'low';
  /** Section of the room panel that is open; kept while moving from room to room. */
  roomTab: RoomTab;
  /** The docked panel that is open, if any. */
  dock: Dock | null;
  /** The wall face clicked last: the room panel offers to finish just that face, and a wall selection edits it. */
  wallFace: WallFace | null;

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
  setQuality(quality: 'high' | 'low'): void;
  setRoomTab(roomTab: RoomTab): void;
  setDock(dock: Dock | null): void;
  setWallFace(face: WallFace | null): void;
  /** Opens the panel, or closes it when it is the one showing. */
  toggleDock(dock: Dock): void;
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
  quality: 'high',
  roomTab: 'furnish',
  dock: null,
  wallFace: null,

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
  setQuality: (quality) => set({ quality }),
  setRoomTab: (roomTab) => set({ roomTab }),
  setDock: (dock) => set({ dock }),
  setWallFace: (wallFace) => set({ wallFace }),
  toggleDock: (dock) => set((s) => ({ dock: s.dock === dock ? null : dock })),
}));

/**
 * Rendering tier of the Design view: `low` on software renderers (always), `medium` once a
 * GPU could not hold the frame rate, `high` otherwise. See `Effects.tsx`.
 */
export type RenderTier = 'high' | 'medium' | 'low';

export function renderTier(software: boolean, quality: ViewerState['quality']): RenderTier {
  return software ? 'low' : quality === 'high' ? 'high' : 'medium';
}

export function useRenderTier(): RenderTier {
  const quality = useViewer((s) => s.quality);
  return renderTier(detectSoftwareRenderer(), quality);
}

/** The lighting preset saved with the open project (`project.settings`), daylight by default. */
export function useLightingPreset(): LightingPreset {
  return usePlanStore((s) => lightingFromSettings(s.project?.settings));
}

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
