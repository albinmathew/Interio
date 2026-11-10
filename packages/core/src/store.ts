/**
 * The plan store: one project, undo/redo, and every edit the features make.
 * Features keep their own UI state (tools, camera, panels) in their own stores.
 */
import { produce } from 'immer';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createProject } from './migrate';
import * as ops from './ops';
import type { Id, Item, Level, Opening, PlanDraft, Project, Pt, Room, Wall } from './schema';

export type Selection =
  | { kind: 'wall'; id: Id }
  | { kind: 'vertex'; id: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'room'; id: Id }
  | { kind: 'item'; id: Id };

const HISTORY_LIMIT = 200;

export interface PlanState {
  project: Project | null;
  levelIndex: number;
  selection: Selection | null;
  past: Project[];
  future: Project[];

  /* project */
  loadProject(project: Project): void;
  closeProject(): void;
  /** Turns an import draft into a new project and loads it. */
  applyDraft(draft: PlanDraft, name: string): Project;
  renameProject(name: string): void;
  setProjectSettings(patch: Record<string, unknown>): void;
  setLevelProps(patch: Partial<Pick<Level, 'name' | 'ceilingHeight'>>): void;

  /* walls */
  addWall(a: Pt, b: Pt, props?: ops.WallProps): Id[];
  moveVertex(id: Id, p: Pt): void;
  /** Merges vertices that ended up on top of each other. Call when a drag ends. */
  weldVertices(tol?: number): void;
  splitWall(wallId: Id, at: Pt): Id | null;
  removeWall(id: Id): void;
  setWallProps(id: Id, patch: Partial<Pick<Wall, 'thickness' | 'height' | 'kind'>>): void;

  /* openings */
  addOpening(opening: Omit<Opening, 'id'>): Id | null;
  updateOpening(id: Id, patch: Partial<Omit<Opening, 'id'>>): void;
  removeOpening(id: Id): void;

  /* rooms */
  setRoomProps(id: Id, patch: Partial<Omit<Room, 'id' | 'seed'>>): void;

  /* items */
  addItem(item: Omit<Item, 'id'>): Id;
  updateItem(id: Id, patch: Partial<Omit<Item, 'id'>>): void;
  removeItem(id: Id): void;

  /** Any other edit to the current level, as one undo step (bulk furnish, paste...). */
  mutateLevel(fn: (level: Level) => void, opts?: { reconcileRooms?: boolean }): void;

  select(selection: Selection | null): void;

  /* history */
  /** Runs several edits as a single undo step. */
  transact(fn: () => void): void;
  /** For pointer drags: every edit between begin and end is one undo step. */
  beginGesture(): void;
  endGesture(): void;
  /** Aborts the open gesture: restores the plan as it was at `beginGesture` and records no undo step. */
  cancelGesture(): void;
  undo(): void;
  redo(): void;
}

export type PlanStore = StoreApi<PlanState>;

export function createPlanStore(): PlanStore {
  let depth = 0; // open transactions/gestures
  let snapshot: Project | null = null; // project before the open transaction

  return createStore<PlanState>((set, get) => {
    const commit = (next: Project) => {
      const cur = get().project;
      if (!cur || next === cur) return;
      if (depth > 0) {
        if (!snapshot) snapshot = cur;
        set({ project: next });
        return;
      }
      set((s) => ({ project: next, past: [...s.past, cur].slice(-HISTORY_LIMIT), future: [] }));
    };

    const edit = <T>(fn: (level: Level, project: Project) => T, reconcile = false): T | undefined => {
      const cur = get().project;
      if (!cur) return undefined;
      let result: T | undefined;
      const next = produce(cur, (draft) => {
        const level = draft.levels[get().levelIndex] as Level | undefined;
        if (!level) return;
        result = fn(level, draft as Project);
        if (reconcile) ops.reconcileRooms(level);
        draft.updatedAt = Date.now();
      });
      commit(next);
      return result;
    };

    const open = () => {
      depth += 1;
    };
    const close = () => {
      depth = Math.max(0, depth - 1);
      if (depth > 0 || !snapshot) return;
      const before = snapshot;
      snapshot = null;
      if (before !== get().project) set((s) => ({ past: [...s.past, before].slice(-HISTORY_LIMIT), future: [] }));
    };

    return {
      project: null,
      levelIndex: 0,
      selection: null,
      past: [],
      future: [],

      loadProject(project) {
        depth = 0;
        snapshot = null;
        set({ project, levelIndex: 0, selection: null, past: [], future: [] });
      },
      closeProject() {
        depth = 0;
        snapshot = null;
        set({ project: null, levelIndex: 0, selection: null, past: [], future: [] });
      },
      applyDraft(draft, name) {
        const project = createProject(name, structuredClone(draft.level));
        project.source = draft.source;
        ops.reconcileRooms(project.levels[0]!);
        get().loadProject(project);
        return project;
      },
      renameProject(name) {
        edit((_l, p) => {
          p.name = name;
        });
      },
      setProjectSettings(patch) {
        edit((_l, p) => {
          Object.assign(p.settings, patch);
        });
      },
      setLevelProps(patch) {
        edit((l) => {
          if (patch.name !== undefined) l.name = patch.name;
          if (patch.ceilingHeight !== undefined) {
            const old = l.ceilingHeight;
            l.ceilingHeight = patch.ceilingHeight;
            for (const w of Object.values(l.walls)) if (w.kind === 'wall' && w.height === old) w.height = patch.ceilingHeight;
          }
        });
      },

      addWall: (a, b, props) => edit((l) => ops.addWall(l, a, b, props), true) ?? [],
      moveVertex(id, p) {
        edit((l) => ops.moveVertex(l, id, p), true);
      },
      weldVertices(tol) {
        edit((l) => ops.weldVertices(l, tol), true);
      },
      splitWall: (wallId, at) => edit((l) => ops.splitWall(l, wallId, at)) ?? null,
      removeWall(id) {
        edit((l) => ops.removeWall(l, id), true);
        if (get().selection?.id === id) set({ selection: null });
      },
      setWallProps(id, patch) {
        edit((l) => {
          const w = l.walls[id];
          if (w) Object.assign(w, patch);
        });
      },

      addOpening: (opening) => edit((l) => ops.addOpening(l, opening)) ?? null,
      updateOpening(id, patch) {
        edit((l) => {
          const o = l.openings[id];
          if (!o) return;
          Object.assign(o, patch);
          ops.clampOpening(l, o);
        });
      },
      removeOpening(id) {
        edit((l) => {
          delete l.openings[id];
        });
        if (get().selection?.id === id) set({ selection: null });
      },

      setRoomProps(id, patch) {
        edit((l) => {
          const r = l.rooms[id];
          if (r) Object.assign(r, patch);
        });
      },

      addItem: (item) => edit((l) => ops.addItem(l, item))!,
      updateItem(id, patch) {
        edit((l) => {
          const i = l.items[id];
          if (i) Object.assign(i, patch);
        });
      },
      removeItem(id) {
        edit((l) => {
          delete l.items[id];
        });
        if (get().selection?.id === id) set({ selection: null });
      },

      mutateLevel(fn, opts) {
        edit((l) => fn(l), opts?.reconcileRooms ?? false);
      },

      select(selection) {
        set({ selection });
      },

      transact(fn) {
        open();
        try {
          fn();
        } finally {
          close();
        }
      },
      beginGesture: open,
      endGesture: close,
      cancelGesture() {
        const before = snapshot;
        depth = 0;
        snapshot = null;
        if (before) set({ project: before });
      },
      undo() {
        const { past, project, future } = get();
        const prev = past[past.length - 1];
        if (!prev || !project || depth > 0) return;
        set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selection: null });
      },
      redo() {
        const { past, project, future } = get();
        const next = future[0];
        if (!next || !project || depth > 0) return;
        set({ project: next, past: [...past, project], future: future.slice(1), selection: null });
      },
    };
  });
}

/** The app-wide plan store. */
export const planStore: PlanStore = createPlanStore();

export function usePlanStore<T>(selector: (state: PlanState) => T): T {
  return useStore(planStore, selector);
}

/** Current level, or null when no project is open. */
export const selectLevel = (s: PlanState): Level | null => s.project?.levels[s.levelIndex] ?? null;
export const selectCanUndo = (s: PlanState): boolean => s.past.length > 0;
export const selectCanRedo = (s: PlanState): boolean => s.future.length > 0;

export function useLevel(): Level | null {
  return usePlanStore(selectLevel);
}
