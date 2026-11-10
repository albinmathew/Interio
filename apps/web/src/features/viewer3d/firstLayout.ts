/**
 * The first furnished look of a home is saved by itself as the variant "First layout",
 * so there is always something to go back to once the user (or the assistant) starts
 * changing things. It happens once per project and never for an unfurnished home.
 */
import { planStore } from '@interio/core';
import { toast } from '../../ui';
import { sceneSettled, takeThumbnail } from './capture';
import { FIRST_LAYOUT_NAME, wantsFirstLayout } from './variants';

const done = new Set<string>();
const key = (projectId: string): string => `interio.firstLayout.${projectId}`;

function isDone(projectId: string): boolean {
  if (done.has(projectId)) return true;
  try {
    return window.localStorage.getItem(key(projectId)) === '1';
  } catch {
    return false;
  }
}

/** Remembers that this project has had its first look saved (or has variants of its own), so it is never saved again. */
export function markFirstLayoutDone(projectId: string): void {
  if (done.has(projectId)) return;
  done.add(projectId);
  try {
    window.localStorage.setItem(key(projectId), '1');
  } catch {
    // Private windows may refuse storage: the session-long memory above still holds.
  }
}

let running: string | null = null;

/**
 * Saves the current look as "First layout" when the open home is furnished and nothing
 * was saved for it yet. Waits for the scene to draw so the preview shows the furniture.
 * Returns whether a variant was saved.
 */
export async function saveFirstLayout(): Promise<boolean> {
  const state = planStore.getState();
  const projectId = state.project?.id;
  if (!state.project || !projectId || running === projectId) return false;
  if (state.project.variants.length > 0) markFirstLayoutDone(projectId);
  if (!wantsFirstLayout(state.project, state.levelIndex, isDone(projectId))) return false;
  running = projectId;
  try {
    const settled = await sceneSettled();
    const now = planStore.getState();
    if (!settled || now.project?.id !== projectId || !wantsFirstLayout(now.project, now.levelIndex, isDone(projectId))) return false;
    if (!now.saveVariant({ name: FIRST_LAYOUT_NAME, thumbnail: takeThumbnail() })) return false;
    markFirstLayoutDone(projectId);
    toast.success(`Saved this look as “${FIRST_LAYOUT_NAME}”. Find it under Variants.`);
    return true;
  } finally {
    if (running === projectId) running = null;
  }
}
