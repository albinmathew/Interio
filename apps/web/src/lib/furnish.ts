/**
 * Whole-home furnishing on the open project. Shared by the import flow
 * ("furnish it for me") and the Design view.
 */
import { autoFurnish } from '@interio/catalog';
import { planStore, selectLevel } from '@interio/core';

/**
 * Adds a suggested layout to every room that has no furniture yet, as one undo
 * step. Returns the number of items added.
 */
export function furnishHome(): number {
  const state = planStore.getState();
  const level = selectLevel(state);
  if (!level) return 0;
  const furnished = new Set(Object.values(level.items).map((i) => i.roomId));
  let added = 0;
  state.transact(() => {
    for (const room of Object.values(level.rooms)) {
      if (furnished.has(room.id)) continue;
      // Plan each room against the latest level so layouts never collide across rooms.
      const current = selectLevel(planStore.getState());
      if (!current) return;
      for (const item of autoFurnish(current, room.id)) {
        planStore.getState().addItem(item);
        added += 1;
      }
    }
  });
  return added;
}

/** Removes every placed item (or only those of one room), as one undo step. Returns the number removed. */
export function clearFurniture(roomId?: string): number {
  const level = selectLevel(planStore.getState());
  if (!level) return 0;
  const ids = Object.values(level.items)
    .filter((i) => !roomId || i.roomId === roomId)
    .map((i) => i.id);
  if (ids.length === 0) return 0;
  planStore.getState().mutateLevel((l) => {
    for (const id of ids) delete l.items[id];
  });
  return ids.length;
}
