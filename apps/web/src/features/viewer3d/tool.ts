/**
 * Pointer tool of the Design view: place from the catalog, select, drag to move, turn
 * with the handle, click a room. It listens on the canvas ahead of the orbit controls
 * and does its own picking, so faded walls and joinery never get in the way.
 */
import { planStore, selectLevel, selectRooms, vec, worldToPlan, type Item, type Level, type MeshGroup, type Pt } from '@interio/core';
import { isFaded } from '@interio/scene3d';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { commitPose, placeItem } from './actions';
import { itemAxes, itemSize, placeEntry, rayHitsBox, rotationFacing, type Placement } from './placement';
import { entryOrPlaceholder, resolveEntry, useViewer } from './state';

/** Pointer travel (px) that turns a press into a drag. */
const DRAG_THRESHOLD = 4;
/** Distance of the rotate handle in front of an item, and its pick radius (m). */
export const HANDLE_OFFSET = 0.45;
export const HANDLE_RADIUS = 0.13;

/** World position of an item's rotate handle. */
export function handlePosition(pose: { x: number; y: number; z: number; rotationDeg: number }, depth: number): THREE.Vector3 {
  const { front } = itemAxes(pose.rotationDeg);
  const reach = depth / 2 + HANDLE_OFFSET * 1000;
  return new THREE.Vector3((pose.x + front.x * reach) / 1000, pose.z / 1000 + 0.03, -(pose.y + front.y * reach) / 1000);
}

interface LevelHit {
  group: MeshGroup;
  point: THREE.Vector3;
  distance: number;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  kind: 'item' | 'handle' | 'place' | 'empty';
  item?: Item;
  /** Height of the horizontal plane the drag slides on, and the grab offset from the item centre (plan mm). */
  planeY?: number;
  offset?: Pt;
}

export function usePointerTool(): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    let press: Press | null = null;

    const level = (): Level | null => selectLevel(planStore.getState());
    const setControls = (enabled: boolean) => {
      const controls = get().controls as { enabled: boolean } | null;
      if (controls) controls.enabled = enabled;
    };
    const aim = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    /** Plan point where the current ray crosses the horizontal plane at world height `y`. */
    const planAt = (y: number): Pt | null => {
      plane.constant = -y;
      return raycaster.ray.intersectPlane(plane, point) ? worldToPlan(point.x, point.z) : null;
    };
    /** Nearest wall, floor or ceiling the ray hits, ignoring faded walls and hidden meshes. */
    const hitLevel = (): LevelHit | null => {
      const root = scene.getObjectByName('level');
      if (!root) return null;
      for (const hit of raycaster.intersectObject(root, true)) {
        const group = hit.object.userData.group as MeshGroup | undefined;
        if (!group || !hit.object.visible || group.kind === 'ceiling' || isFaded(hit.object)) continue;
        return { group, point: hit.point, distance: hit.distance };
      }
      return null;
    };
    const hitItem = (lv: Level): { item: Item; distance: number } | null => {
      const o = raycaster.ray.origin.toArray();
      const d = raycaster.ray.direction.toArray();
      let best: { item: Item; distance: number } | null = null;
      for (const item of Object.values(lv.items)) {
        const t = rayHitsBox(o, d, item, itemSize(entryOrPlaceholder(item.catalogId), item));
        if (t !== null && (!best || t < best.distance)) best = { item, distance: t };
      }
      return best;
    };
    const hitHandle = (lv: Level): Item | null => {
      const sel = planStore.getState().selection;
      const item = sel?.kind === 'item' ? lv.items[sel.id] : undefined;
      if (!item) return null;
      const centre = handlePosition(item, itemSize(entryOrPlaceholder(item.catalogId), item).d);
      return raycaster.ray.distanceSqToPoint(centre) < (HANDLE_RADIUS * 1.4) ** 2 ? item : null;
    };

    /** Where `catalogId` lands for the current ray. Wall entries follow the wall under the cursor. */
    const placementFor = (lv: Level, catalogId: string, rotationDeg: number, opts: { snap: boolean; z?: number; scale?: number; planeY?: number; offset?: Pt }): Placement | null => {
      const entry = entryOrPlaceholder(catalogId);
      const rooms = selectRooms(lv);
      if (entry.anchor === 'wall') {
        const hit = hitLevel();
        if (hit && hit.group.kind === 'wallSide' && hit.group.roomId) {
          return placeEntry(lv, rooms, entry, worldToPlan(hit.point.x, hit.point.z), { rotationDeg, wallRoomId: hit.group.roomId, z: opts.z, scale: opts.scale });
        }
      }
      const p = planAt(opts.planeY ?? 0);
      if (!p) return null;
      const cursor = opts.offset ? { x: p.x + opts.offset.x, y: p.y + opts.offset.y } : p;
      return placeEntry(lv, rooms, entry, cursor, { rotationDeg, snap: opts.snap, z: opts.z, scale: opts.scale });
    };

    const updateGhost = (e: PointerEvent) => {
      const ui = useViewer.getState();
      const lv = level();
      if (!ui.placing || !lv) return;
      aim(e);
      const ghost = placementFor(lv, ui.placing.catalogId, ui.placing.rotationDeg, { snap: !e.altKey });
      ui.setGhost(ghost?.ok ? ghost : null);
      invalidate();
    };
    const hover = (e: PointerEvent) => {
      const lv = level();
      if (!lv) return;
      aim(e);
      const p = planAt(0);
      if (p) {
        const room = selectRooms(lv).find((r) => r.roomId && vec.pointInPolygon(p, r.polygon));
        if (room?.roomId) useViewer.getState().setHoverRoom(room.roomId);
      }
      canvas.style.cursor = hitHandle(lv) ? 'alias' : hitItem(lv) ? 'grab' : '';
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || press) return;
      const lv = level();
      if (!lv) return;
      aim(e);
      const base = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (useViewer.getState().placing) {
        press = { ...base, kind: 'place' };
        return;
      }
      const handle = hitHandle(lv);
      const picked = handle ? null : hitItem(lv);
      const wall = picked ? hitLevel() : null;
      if (handle) {
        press = { ...base, kind: 'handle', item: handle };
      } else if (picked && !(wall && wall.distance < picked.distance - 0.01)) {
        const { item } = picked;
        planStore.getState().select({ kind: 'item', id: item.id });
        const planeY = raycaster.ray.origin.y + raycaster.ray.direction.y * picked.distance;
        const p = planAt(planeY);
        press = { ...base, kind: 'item', item, planeY, offset: p ? { x: item.x - p.x, y: item.y - p.y } : { x: 0, y: 0 } };
      } else {
        press = { ...base, kind: 'empty' };
        return;
      }
      // Our drag, not the camera's.
      setControls(false);
      canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
      invalidate();
    };

    const dragMove = (e: PointerEvent, p: Press) => {
      const lv = level();
      const item = p.item && lv?.items[p.item.id];
      if (!lv || !item) return;
      aim(e);
      if (p.kind === 'handle') {
        const at = planAt(item.z / 1000 + 0.03);
        if (!at || Math.hypot(at.x - item.x, at.y - item.y) < 50) return;
        const raw = rotationFacing({ x: at.x - item.x, y: at.y - item.y });
        const rotationDeg = e.shiftKey ? Math.round(raw) % 360 : (Math.round(raw / 15) * 15) % 360;
        useViewer.getState().setDrag({ id: item.id, mode: 'rotate', pose: { x: item.x, y: item.y, z: item.z, rotationDeg, roomId: item.roomId, ok: true } });
      } else {
        const pose = placementFor(lv, item.catalogId, item.rotationDeg, { snap: !e.altKey, z: item.z, scale: item.scale, planeY: p.planeY, offset: p.offset });
        if (pose?.ok) useViewer.getState().setDrag({ id: item.id, mode: 'move', pose });
      }
      canvas.style.cursor = 'grabbing';
      invalidate();
    };

    /** Dragging a catalog card: the card holds the pointer, so the ghost follows it from the window. */
    const overCanvas = (e: PointerEvent) => document.elementFromPoint(e.clientX, e.clientY) === canvas;

    const onMove = (e: PointerEvent) => {
      if (!press) {
        const ui = useViewer.getState();
        if (ui.placing?.fromDrag) {
          if (overCanvas(e)) updateGhost(e);
          else if (ui.ghost) ui.setGhost(null);
        } else if (e.target === canvas) {
          if (ui.placing) updateGhost(e);
          else hover(e);
        }
        return;
      }
      if (e.pointerId !== press.pointerId) return;
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
      press.moved = true;
      if (press.kind === 'item' || press.kind === 'handle') dragMove(e, press);
    };

    const release = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      setControls(true);
      press = null;
      canvas.style.cursor = '';
      invalidate();
    };

    const placeNow = (e: PointerEvent, lv: Level): boolean => {
      const ui = useViewer.getState();
      if (!ui.placing || !resolveEntry(ui.placing.catalogId)) return false;
      aim(e);
      const at = placementFor(lv, ui.placing.catalogId, ui.placing.rotationDeg, { snap: !e.altKey });
      if (!at?.ok) return false;
      placeItem(ui.placing.catalogId, at);
      // Shift keeps the entry armed for another copy.
      if (e.shiftKey && !ui.placing.fromDrag) ui.setGhost(at);
      else ui.stopPlacing();
      return true;
    };

    const onUp = (e: PointerEvent) => {
      const ui = useViewer.getState();
      const lv = level();
      const p = press;
      if (!p) {
        // End of a drag out of the catalog: drop on the floor, or stay armed for a click.
        if (ui.placing?.fromDrag && lv && !(overCanvas(e) && placeNow(e, lv))) ui.startPlacing(ui.placing.catalogId, false);
        return;
      }
      if (e.pointerId !== p.pointerId) return;
      if ((p.kind === 'item' || p.kind === 'handle') && p.moved) {
        const drag = ui.drag;
        ui.setDrag(null);
        if (drag) commitPose(drag.id, drag.pose);
      } else if (p.kind === 'place' && !p.moved && lv) {
        placeNow(e, lv);
      } else if (p.kind === 'empty' && !p.moved && lv) {
        aim(e);
        const hit = hitLevel();
        const roomId = hit && (hit.group.kind === 'floor' || hit.group.kind === 'wallSide') ? hit.group.roomId : null;
        planStore.getState().select(roomId ? { kind: 'room', id: roomId } : null);
      }
      release(e);
    };

    const onCancel = (e: PointerEvent) => {
      if (!press) return;
      useViewer.getState().setDrag(null);
      release(e);
    };

    /** Esc during a drag puts the item back. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !press || (press.kind !== 'item' && press.kind !== 'handle')) return;
      useViewer.getState().setDrag(null);
      press.kind = 'empty';
      press.moved = true;
      e.stopImmediatePropagation();
      invalidate();
    };

    // Presses start on the canvas, ahead of the orbit controls. Moves and releases are read from the
    // window because the controls (or a catalog card) may hold the pointer capture.
    canvas.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('keydown', onKey, true);
      setControls(true);
      canvas.style.cursor = '';
    };
  }, [gl, camera, scene, invalidate, get]);
}
