/**
 * Editor UI state: active tool, camera, in-progress drafts and overlays.
 * Plan data lives in the core plan store; nothing here is persisted.
 */
import { DEFAULTS, type Id, type Pt, type Selection, type WallKind } from '@interio/core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Placement } from './logic/openings';
import type { Guide, SnapKind } from './logic/snapping';
import { DEFAULT_VIEW, type Size, type View } from './logic/view';
import type { ToolId } from './tools';

export interface SnapMark {
  point: Pt;
  kind: SnapKind;
}

export type Draft =
  /** Wall chain: points placed so far and the live end under the cursor. */
  | { kind: 'wall'; chain: Pt[]; cursor: Pt; typed: string }
  /** Door / window / passage preview on the hovered wall. */
  | { kind: 'opening'; placement: Placement }
  | { kind: 'split'; wallId: Id; point: Pt; valid: boolean }
  /** Measure and Set scale: first point, live or fixed second point. */
  | { kind: 'measure'; a: Pt; b: Pt; done: boolean }
  | { kind: 'scale'; a: Pt; b: Pt; done: boolean };

export interface EditorState {
  tool: ToolId;
  view: View;
  size: Size;
  /** Project the view was last fitted for, so reopening Plan mode keeps the camera. */
  fittedFor: string | null;
  wallKind: WallKind;
  wallThickness: number;
  underlayVisible: boolean;
  underlayOpacity: number;
  hover: Selection | null;
  snap: SnapMark | null;
  guides: Guide[];
  draft: Draft | null;
  /** A select-tool drag is moving something. */
  dragging: boolean;
  /** Space is held: the next drag pans. */
  spacePan: boolean;
  helpOpen: boolean;
}

export type EditorStore = StoreApi<EditorState>;

export function createEditorStore(): EditorStore {
  return createStore<EditorState>(() => ({
    tool: 'select',
    view: DEFAULT_VIEW,
    size: { w: 1280, h: 720 },
    fittedFor: null,
    wallKind: 'wall',
    wallThickness: DEFAULTS.wallThickness,
    underlayVisible: true,
    underlayOpacity: 0.6,
    hover: null,
    snap: null,
    guides: [],
    draft: null,
    dragging: false,
    spacePan: false,
    helpOpen: false,
  }));
}

/** The editor's UI store. One per app: Plan mode is mounted once at a time. */
export const editorStore: EditorStore = createEditorStore();

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
