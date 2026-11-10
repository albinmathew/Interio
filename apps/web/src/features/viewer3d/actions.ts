/**
 * Edits the Design view makes to the plan. Each function is one undo step.
 */
import { planStore, selectLevel, selectRooms, type Id, type Item, type Level } from '@interio/core';
import { findOverlaps, itemAxes, normalizeDeg, placeEntry, rotateStep, roomIdAt, type Placement, type Pose } from './placement';
import { entryOrPlaceholder, useViewer } from './state';

function current(): { level: Level; item: Item } | null {
  const state = planStore.getState();
  const level = selectLevel(state);
  const sel = state.selection;
  const item = level && sel?.kind === 'item' ? level.items[sel.id] : undefined;
  return level && item ? { level, item } : null;
}

/** Adds an item where the ghost stands and selects it. */
export function placeItem(catalogId: string, at: Placement): Id {
  const store = planStore.getState();
  const id = store.addItem({ catalogId, x: at.x, y: at.y, z: at.z, rotationDeg: at.rotationDeg, roomId: at.roomId });
  store.select({ kind: 'item', id });
  return id;
}

/** Writes the result of a drag (move or rotate) as a single undo step. */
export function commitPose(id: Id, pose: Pose & { roomId?: Id }): void {
  const store = planStore.getState();
  store.beginGesture();
  try {
    store.updateItem(id, { x: Math.round(pose.x), y: Math.round(pose.y), z: Math.round(pose.z), rotationDeg: pose.rotationDeg, roomId: pose.roomId });
  } finally {
    store.endGesture();
  }
}

/** Turns the selected item (or the entry being placed) by one step: 15 degrees, or 90 with `coarse`. */
export function rotateSelection(direction: 1 | -1, coarse = false): void {
  const step = coarse ? 90 : 15;
  if (useViewer.getState().placing) {
    useViewer.getState().rotatePlacing(direction * step);
    return;
  }
  const cur = current();
  if (cur) planStore.getState().updateItem(cur.item.id, { rotationDeg: rotateStep(cur.item.rotationDeg, step, direction) });
}

export function setRotation(id: Id, deg: number): void {
  planStore.getState().updateItem(id, { rotationDeg: normalizeDeg(deg) });
}

export function setElevation(id: Id, z: number): void {
  const level = selectLevel(planStore.getState());
  planStore.getState().updateItem(id, { z: Math.max(0, Math.min(Math.round(z), level?.ceilingHeight ?? z)) });
}

export function removeSelection(): void {
  const cur = current();
  if (cur) planStore.getState().removeItem(cur.item.id);
}

/** Swaps the selected item's catalog entry, keeping its place. */
export function replaceEntry(id: Id, catalogId: string): void {
  const level = selectLevel(planStore.getState());
  const item = level?.items[id];
  if (!level || !item || item.catalogId === catalogId) return;
  const before = entryOrPlaceholder(item.catalogId);
  const after = entryOrPlaceholder(catalogId);
  const patch: Partial<Item> = { catalogId };
  // A different anchor needs a different elevation; otherwise keep what the user set.
  if (before.anchor !== after.anchor || before.mountHeight !== after.mountHeight) {
    patch.z = placeEntry(level, selectRooms(level), after, item, { rotationDeg: item.rotationDeg, snap: false }).z;
  }
  planStore.getState().updateItem(id, patch);
}

/** Copies the selected item next to itself (on whichever side is free) and selects the copy. */
export function duplicateSelection(): void {
  const cur = current();
  if (!cur) return;
  const { level, item } = cur;
  const entry = entryOrPlaceholder(item.catalogId);
  const rooms = selectRooms(level);
  const { u, front } = itemAxes(item.rotationDeg);
  const s = item.scale ?? 1;
  const stepW = entry.dims.w * s + 100;
  const stepD = entry.dims.d * s + 100;
  const offsets =
    entry.anchor === 'wall'
      ? [
          { x: u.x * stepW, y: u.y * stepW },
          { x: -u.x * stepW, y: -u.y * stepW },
        ]
      : [
          { x: u.x * stepW, y: u.y * stepW },
          { x: -u.x * stepW, y: -u.y * stepW },
          { x: front.x * stepD, y: front.y * stepD },
          { x: -front.x * stepD, y: -front.y * stepD },
        ];
  let chosen: Placement | null = null;
  for (const o of offsets) {
    const at = placeEntry(level, rooms, entry, { x: item.x + o.x, y: item.y + o.y }, { rotationDeg: item.rotationDeg, snap: false, z: item.z, scale: s });
    if (!at.ok) continue;
    chosen ??= at;
    const trial = { ...level, items: { ...level.items, __copy: { ...item, id: '__copy', x: at.x, y: at.y, rotationDeg: at.rotationDeg } } };
    if (!findOverlaps(trial, entryOrPlaceholder).has('__copy')) {
      chosen = at;
      break;
    }
  }
  if (!chosen) return;
  const store = planStore.getState();
  const id = store.addItem({ ...item, x: chosen.x, y: chosen.y, rotationDeg: chosen.rotationDeg, roomId: chosen.roomId });
  store.select({ kind: 'item', id });
}

/** Moves the selected item by a plan vector, keeping it inside its room. */
export function nudgeSelection(dx: number, dy: number): void {
  const cur = current();
  if (!cur) return;
  const { level, item } = cur;
  const entry = entryOrPlaceholder(item.catalogId);
  const rooms = selectRooms(level);
  const at = placeEntry(level, rooms, entry, { x: item.x + dx, y: item.y + dy }, { rotationDeg: item.rotationDeg, snap: false, z: item.z, scale: item.scale });
  if (!at.ok) return;
  // Wall-anchored items slide along their wall and keep facing the room.
  const rotationDeg = entry.anchor === 'wall' ? at.rotationDeg : item.rotationDeg;
  planStore.getState().updateItem(item.id, { x: at.x, y: at.y, rotationDeg, roomId: roomIdAt(rooms, at) ?? at.roomId });
}
