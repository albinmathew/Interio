/**
 * Whole-home furnishing on the open project. Shared by the import flow
 * ("furnish it for me") and the Design view.
 *
 * Furnishing follows the project's furnishing package (`furnish.package`, default the
 * owner's "Essentials, 3 BHK"): every room gets the normal layout with the package's
 * pieces first, every package line is guaranteed where it fits, and rooms that already
 * hold furniture are completed with what their lines miss. "No package" keeps the plain
 * layout and styling.
 */
import { DEFAULT_PACKAGE_ID, applyPackage, autoFurnish, checkPackage, getPackage, lineKey, type ApplyPackageResult, type PackageCheck } from '@interio/catalog';
import { PACKAGE_SETTING, planStore, selectLevel, type BedroomRole, type FurnishingPackage, type Id, type Level, type Project } from '@interio/core';
import { create } from 'zustand';

/** Setting value for furnishing without a package. */
export const NO_PACKAGE = 'none';

/** The package the project is furnished with, or null for "No package". */
export function projectPackage(project: Pick<Project, 'settings'> | null | undefined): FurnishingPackage | null {
  const id = project?.settings?.[PACKAGE_SETTING];
  if (id === NO_PACKAGE) return null;
  return getPackage(typeof id === 'string' ? id : DEFAULT_PACKAGE_ID) ?? getPackage(undefined) ?? null;
}

export interface FurnishSummary {
  /** Items added. */
  added: number;
  /** The package's name and its item count, when one was used. */
  packageName?: string;
  placed?: number;
  needed?: number;
}

interface PackageState {
  /** Why lines are short, from the last furnishing, by `lineKey`. */
  reasons: Record<string, string>;
  /** Summary of the last whole-home furnishing. */
  last: FurnishSummary | null;
}

/** What the last furnishing could not place, and why. Not persisted: after a reload short lines show as missing. */
export const usePackageState = create<PackageState>(() => ({ reasons: {}, last: null }));

/** "Furnished with Essentials, 3 BHK: 52 of 54 items placed". */
export function furnishSummaryText(s: FurnishSummary): string {
  if (s.packageName && s.needed !== undefined) return `Furnished with ${s.packageName}: ${s.placed} of ${s.needed} items placed`;
  return s.added === 1 ? 'Added 1 item' : `Added ${s.added} items`;
}

/** Checklist results are cached per level object: levels in the store are immutable. */
const checks = new WeakMap<Level, Map<string, PackageCheck>>();
export function packageCheck(level: Level, pkg: FurnishingPackage): PackageCheck {
  let byPkg = checks.get(level);
  if (!byPkg) checks.set(level, (byPkg = new Map()));
  let check = byPkg.get(pkg.id);
  if (!check) byPkg.set(pkg.id, (check = checkPackage(level, pkg)));
  return check;
}

/** Writes a package result to the store. Call inside a transaction. */
function write(res: ApplyPackageResult): number {
  const store = planStore.getState();
  for (const id of res.remove) store.removeItem(id);
  for (const [id, patch] of Object.entries(res.rooms)) store.setRoomProps(id, patch);
  for (const [id, patch] of Object.entries(res.walls)) store.setWallProps(id, patch);
  for (const item of res.items) store.addItem(item);
  return res.items.length;
}

function remember(res: ApplyPackageResult, merge: boolean): void {
  const reasons: Record<string, string> = merge ? { ...usePackageState.getState().reasons } : {};
  for (const line of res.report.lines) {
    const key = lineKey(line.section, line.roomId, line.key);
    if (line.reason && line.status !== 'placed' && line.status !== 'included') reasons[key] = line.reason;
    else delete reasons[key];
  }
  usePackageState.setState({ reasons });
}

/**
 * Furnishes the home as one undo step: with the project's package, every room is laid
 * out or completed; without one, every room that has no furniture yet gets a suggested
 * layout. Returns the number of items added; `usePackageState().last` has the summary.
 */
export function furnishHome(): number {
  const state = planStore.getState();
  const level = selectLevel(state);
  if (!level) return 0;
  const pkg = projectPackage(state.project);
  let added = 0;
  if (pkg) {
    const res = applyPackage(level, pkg);
    if (res.items.length || res.remove.length || Object.keys(res.walls).length || Object.keys(res.rooms).length) {
      state.transact(() => {
        added = write(res);
      });
    }
    remember(res, false);
    usePackageState.setState({ last: { added, packageName: pkg.name, placed: res.report.placed, needed: res.report.needed } });
    return added;
  }
  const furnished = new Set(Object.values(level.items).map((i) => i.roomId));
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
  usePackageState.setState({ last: { added } });
  return added;
}

/**
 * Adds what some package lines miss (the checklist's Add, Retry and "Apply missing for
 * this room"), as one undo step. A piece of the same kind that is not the package's may
 * be swapped for it. Returns the result, or null without a package or a level.
 */
export function addPackageLines(lines: { roomId: Id; key: string }[]): ApplyPackageResult | null {
  const state = planStore.getState();
  const level = selectLevel(state);
  const pkg = projectPackage(state.project);
  if (!level || !pkg || lines.length === 0) return null;
  const res = applyPackage(level, pkg, { lines });
  if (res.items.length || res.remove.length || Object.keys(res.rooms).length || Object.keys(res.walls).length) state.transact(() => void write(res));
  remember(res, true);
  return res;
}

/**
 * Clears a room and furnishes it afresh with the package (or the plain layout without
 * one), as one undo step. Used after a bedroom's role changes. Returns the items added.
 */
export function refurnishRoom(roomId: Id): number {
  const state = planStore.getState();
  const level = selectLevel(state);
  if (!level?.rooms[roomId]) return 0;
  const pkg = projectPackage(state.project);
  const cleared = structuredClone(level);
  const ids = Object.values(level.items)
    .filter((i) => i.roomId === roomId)
    .map((i) => i.id);
  for (const id of ids) delete cleared.items[id];
  let added = 0;
  if (pkg) {
    const res = applyPackage(cleared, pkg, { roomIds: [roomId] });
    state.transact(() => {
      planStore.getState().mutateLevel((l) => {
        for (const id of ids) delete l.items[id];
      });
      added = write({ ...res, remove: [] });
    });
    remember(res, true);
    return added;
  }
  const items = autoFurnish(cleared, roomId);
  state.transact(() => {
    planStore.getState().mutateLevel((l) => {
      for (const id of ids) delete l.items[id];
    });
    for (const item of items) planStore.getState().addItem({ ...item, roomId: item.roomId ?? roomId });
  });
  return items.length;
}

/** Sets who a bedroom is for. One undo step. */
export function setBedroomRole(roomId: Id, role: BedroomRole): void {
  const room = selectLevel(planStore.getState())?.rooms[roomId];
  if (room && room.role !== role) planStore.getState().setRoomProps(roomId, { role });
}

/** Chooses the project's package (an id, or `NO_PACKAGE`). */
export function setProjectPackage(id: string): void {
  planStore.getState().setProjectSettings({ [PACKAGE_SETTING]: id });
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
