/**
 * Tool logic. Turns pointer and key input into plan-store edits and editor-UI
 * state. No React and no DOM here, so every tool can be driven from a unit test
 * with a fresh pair of stores.
 */
import { ops, selectLevel, snap, vec, type Level, type OpeningKind, type PlanStore, type Pt, type Selection } from '@interio/core';
import { hitTest, sameSelection } from './logic/hit';
import { defaultOpening, offsetOnWall, overlaps, placeOpening, type Placement } from './logic/openings';
import { rescaleLevel, UNDERLAY_SCALE_KEY, underlayScaleOf, type RescaleOptions } from './logic/rescale';
import { resolveSnap, type SnapContext, type SnapResult } from './logic/snapping';
import { isLengthChar, parseLength } from './logic/units';
import {
  DEFAULT_VIEW,
  fitBounds,
  levelBounds,
  MAX_SCALE,
  MIN_SCALE,
  screenToPlan,
  snapStep,
  unionBounds,
  zoomAt,
  type Bounds,
  type Insets,
} from './logic/view';
import { dissolveVertex, incidentWalls, perpendicularDelta } from './logic/walls';
import type { Draft, EditorStore } from './state';
import { OPENING_TOOLS, toolByKey, type ToolId } from './tools';

const { add, sub, dist, scale, norm, roundPt } = vec;

/** Snap radius and drag threshold in screen pixels. */
export const SNAP_PX = 10;
export const DRAG_PX = 4;
/** Room the floating toolbar, panel and bottom bar take, kept clear when fitting. */
export const FIT_INSETS: Insets = { left: 84, top: 72, right: 300, bottom: 76 };

export interface PointerInput {
  /** Position in CSS pixels relative to the canvas. */
  screen: Pt;
  shift?: boolean;
  alt?: boolean;
}

export interface KeyInput {
  key: string;
  shift?: boolean;
  alt?: boolean;
  /** Cmd or Ctrl is held: the editor leaves these to the app shell. */
  mod?: boolean;
}

export interface ControllerDeps {
  plan: PlanStore;
  ui: EditorStore;
  /** Underlay snap points in plan mm, when an underlay is loaded. */
  underlayPoints?: () => Float32Array | null;
  /** Underlay extent, included when fitting the view. */
  underlayBounds?: () => Bounds | null;
  notify?: (message: string) => void;
}

interface Press {
  screen: Pt;
  plan: Pt;
  target: Selection;
  moved: boolean;
  vertexStart?: Pt;
  wallStart?: { aId: string; bId: string; a: Pt; b: Pt };
  openingGrab?: number;
  itemStart?: Pt;
  lastHit?: SnapResult['hit'];
}

export type Controller = ReturnType<typeof createController>;

export function createController(deps: ControllerDeps) {
  const { plan, ui } = deps;
  let press: Press | null = null;

  const level = (): Level | null => selectLevel(plan.getState());
  const tol = (px = SNAP_PX): number => px / ui.getState().view.scale;
  const toPlan = (screen: Pt): Pt => screenToPlan(ui.getState().view, screen);
  const draftOf = <K extends Draft['kind']>(kind: K): Extract<Draft, { kind: K }> | null => {
    const d = ui.getState().draft;
    return d && d.kind === kind ? (d as Extract<Draft, { kind: K }>) : null;
  };
  const clearOverlays = () => ui.setState({ snap: null, guides: [] });

  function snapAt(input: PointerInput, extra: Partial<SnapContext> = {}): SnapResult | null {
    const lv = level();
    if (!lv) return null;
    const st = ui.getState();
    const res = resolveSnap(lv, toPlan(input.screen), {
      tolMm: tol(),
      underlayPoints: st.underlayVisible ? deps.underlayPoints?.() : null,
      lockAngle: input.shift,
      disabled: input.alt,
      gridStep: snapStep(st.view.scale),
      ...extra,
    });
    ui.setState({ snap: res.kind ? { point: res.point, kind: res.kind } : null, guides: res.guides });
    return res;
  }

  /* ------------------------------------------------------------------ wall */

  const wallContext = (): Partial<SnapContext> => {
    const d = draftOf('wall');
    return d ? { from: d.chain[d.chain.length - 1]!, extraPoints: d.chain } : {};
  };

  function endDraft() {
    ui.setState({ draft: null, snap: null, guides: [] });
  }

  /** Adds the next wall of the chain, ending it when the point closes the loop or lands on the plan. */
  function placeWallPoint(point: Pt, landsOnPlan: boolean, keepCursor = false) {
    const d = draftOf('wall');
    if (!d) return;
    const from = d.chain[d.chain.length - 1]!;
    if (dist(point, from) < Math.max(1, tol(3))) {
      endDraft();
      return;
    }
    const st = ui.getState();
    plan.getState().addWall(from, point, { kind: st.wallKind, thickness: st.wallThickness });
    const end = roundPt(point);
    const closes = d.chain.length >= 2 && dist(end, d.chain[0]!) < 1;
    if (landsOnPlan || closes) endDraft();
    else ui.setState({ draft: { kind: 'wall', chain: [...d.chain, end], cursor: keepCursor ? d.cursor : end, typed: '' } });
  }

  function wallDown(input: PointerInput) {
    const res = snapAt(input, wallContext());
    if (!res) return;
    if (!draftOf('wall')) {
      ui.setState({ draft: { kind: 'wall', chain: [roundPt(res.point)], cursor: res.point, typed: '' } });
      return;
    }
    placeWallPoint(res.point, res.hit !== null);
  }

  function wallMove(input: PointerInput) {
    const res = snapAt(input, wallContext());
    const d = draftOf('wall');
    if (res && d) ui.setState({ draft: { ...d, cursor: res.point } });
  }

  /** Enter with a typed length: a wall of exactly that length towards the cursor. */
  function commitTyped(): boolean {
    const d = draftOf('wall');
    if (!d || !d.typed) return false;
    const length = parseLength(d.typed);
    if (!length) {
      deps.notify?.(`“${d.typed}” is not a length. Try 3400, 3.4m or 11'6"`);
      ui.setState({ draft: { ...d, typed: '' } });
      return true;
    }
    const from = d.chain[d.chain.length - 1]!;
    let dir = norm(sub(d.cursor, from));
    if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
    const point = roundPt(add(from, scale(dir, length)));
    const lv = level();
    const under = lv ? snap(lv, point, 1.5) : null;
    placeWallPoint(point, under !== null, true);
    return true;
  }

  /* -------------------------------------------------------------- openings */

  function openingHover(input: PointerInput, kind: OpeningKind): Placement | null {
    const lv = level();
    if (!lv) return null;
    const placement = placeOpening(lv, toPlan(input.screen), defaultOpening(kind).width, tol(14));
    ui.setState({ draft: placement ? { kind: 'opening', placement } : null, snap: null, guides: [] });
    return placement;
  }

  function openingDown(input: PointerInput, kind: OpeningKind) {
    const placement = openingHover(input, kind);
    const lv = level();
    if (!placement || !lv) return;
    if (!placement.valid) {
      if (placement.reason) deps.notify?.(placement.reason);
      return;
    }
    const def = defaultOpening(kind);
    const wall = lv.walls[placement.wallId]!;
    const sill = def.sill + 200 > wall.height ? 0 : def.sill;
    const id = plan.getState().addOpening({
      wallId: placement.wallId,
      offset: placement.offset,
      width: placement.width,
      height: def.height,
      sill,
      kind,
      ...(kind === 'door' ? { hinge: placement.hinge, swing: placement.swing } : {}),
    });
    if (id) plan.getState().select({ kind: 'opening', id });
    ui.setState({ draft: null });
  }

  /* ----------------------------------------------------------------- split */

  function splitHover(input: PointerInput) {
    const lv = level();
    const res = snapAt(input);
    if (!lv || !res) return;
    const near = res.hit?.kind === 'wall' ? { wallId: res.hit.wallId, point: res.point } : ops.findWallNear(lv, toPlan(input.screen), tol(14) + 100);
    if (!near) {
      ui.setState({ draft: null, snap: null, guides: [] });
      return;
    }
    const { a, b } = ops.wallEnds(lv, lv.walls[near.wallId]!);
    let point = vec.projectOnSegment(near.point, a, b).point;
    const middle = vec.mid(a, b);
    const atMiddle = !input.alt && dist(point, middle) <= tol();
    if (atMiddle) point = middle;
    const valid = dist(point, a) > 20 && dist(point, b) > 20;
    ui.setState({ draft: { kind: 'split', wallId: near.wallId, point, valid }, ...(atMiddle ? { snap: { point, kind: 'wall' as const }, guides: [] } : {}) });
  }

  function splitDown(input: PointerInput) {
    splitHover(input);
    const d = draftOf('split');
    if (!d?.valid) return;
    const vid = plan.getState().splitWall(d.wallId, d.point);
    if (vid) plan.getState().select({ kind: 'vertex', id: vid });
    endDraft();
  }

  /* ------------------------------------------------------- measure / scale */

  function twoPointDown(input: PointerInput, kind: 'measure' | 'scale') {
    const d = draftOf(kind);
    const live = d && !d.done ? d : null;
    const res = snapAt(input, live ? { from: live.a } : {});
    if (!res) return;
    if (!live) ui.setState({ draft: { kind, a: res.point, b: res.point, done: false } });
    else if (dist(live.a, res.point) >= 1) ui.setState({ draft: { ...live, b: res.point, done: true }, snap: null, guides: [] });
  }

  function twoPointMove(input: PointerInput, kind: 'measure' | 'scale') {
    const d = draftOf(kind);
    if (d?.done) return;
    const res = snapAt(input, d ? { from: d.a } : {});
    if (res && d) ui.setState({ draft: { ...d, b: res.point } });
  }

  /**
   * Finishes Set scale: the two picked points become `realMm` apart. The level
   * and the underlay factor change in one undo step, and the camera compensates
   * so the drawing does not jump.
   */
  function applyScale(realMm: number, opts: RescaleOptions = {}): boolean {
    const d = draftOf('scale');
    if (!d?.done) return false;
    const measured = dist(d.a, d.b);
    if (measured < 1 || !(realMm > 0)) return false;
    const k = realMm / measured;
    const s = plan.getState();
    const prev = underlayScaleOf(s.project?.settings);
    s.transact(() => {
      s.mutateLevel((l) => rescaleLevel(l, k, opts), { reconcileRooms: true });
      s.setProjectSettings({ [UNDERLAY_SCALE_KEY]: prev * k });
    });
    const view = ui.getState().view;
    const next = view.scale / k;
    ui.setState({ draft: null, snap: null, guides: [], tool: 'select' });
    if (next >= MIN_SCALE && next <= MAX_SCALE) ui.setState({ view: { ...view, scale: next } });
    else fit();
    return true;
  }

  /* ---------------------------------------------------------------- select */

  function selectDown(input: PointerInput): 'drag' | 'pan' {
    const lv = level();
    press = null;
    if (!lv) return 'pan';
    const p = toPlan(input.screen);
    const target = hitTest(lv, p, tol());
    plan.getState().select(target);
    if (!target || target.kind === 'room') return 'pan';
    press = { screen: input.screen, plan: p, target, moved: false };
    if (target.kind === 'vertex') press.vertexStart = lv.vertices[target.id];
    else if (target.kind === 'wall') {
      const w = lv.walls[target.id]!;
      press.wallStart = { aId: w.a, bId: w.b, ...ops.wallEnds(lv, w) };
    } else if (target.kind === 'opening') {
      const o = lv.openings[target.id]!;
      press.openingGrab = o.offset - (offsetOnWall(lv, o.wallId, p) ?? o.offset);
    } else if (target.kind === 'item') {
      const i = lv.items[target.id]!;
      press.itemStart = { x: i.x, y: i.y };
    }
    return 'drag';
  }

  function dragVertex(p: Press, input: PointerInput, lv: Level) {
    const id = p.target.id;
    if (!lv.vertices[id]) return;
    const res = snapAt(input, {
      excludeVertices: new Set([id]),
      excludeWalls: new Set(incidentWalls(lv, id).map((w) => w.id)),
      from: input.shift ? p.vertexStart : null,
    });
    if (!res) return;
    p.lastHit = res.hit;
    plan.getState().moveVertex(id, res.point);
  }

  function dragWall(p: Press, input: PointerInput, lv: Level) {
    const start = p.wallStart!;
    if (!lv.vertices[start.aId] || !lv.vertices[start.bId]) return;
    const constrain = (d: Pt) => (input.shift ? d : perpendicularDelta(start.a, start.b, d));
    let delta = constrain(sub(toPlan(input.screen), p.plan));
    const st = ui.getState();
    let mark: SnapResult | null = null;
    if (!input.alt) {
      const moving = new Set([start.aId, start.bId]);
      const ctx: SnapContext = {
        tolMm: tol(),
        underlayPoints: st.underlayVisible ? deps.underlayPoints?.() : null,
        excludeVertices: moving,
        excludeWalls: new Set(Object.values(lv.walls).filter((w) => moving.has(w.a) || moving.has(w.b)).map((w) => w.id)),
        gridStep: snapStep(st.view.scale),
      };
      for (const end of [start.a, start.b]) {
        const res = resolveSnap(lv, add(end, delta), ctx);
        const d = constrain(sub(res.point, end));
        // Use the snap only when the constrained wall really reaches it.
        if (res.kind && dist(add(end, d), res.point) < 1) {
          delta = d;
          mark = res;
          break;
        }
      }
      if (!mark) {
        const step = snapStep(st.view.scale);
        const n = vec.len(delta);
        if (n > 0) delta = scale(delta, (Math.round(n / step) * step) / n);
      }
    }
    ui.setState({ snap: mark?.kind ? { point: mark.point, kind: mark.kind } : null, guides: mark?.guides ?? [] });
    plan.getState().mutateLevel(
      (l) => {
        ops.moveVertex(l, start.aId, add(start.a, delta));
        ops.moveVertex(l, start.bId, add(start.b, delta));
      },
      { reconcileRooms: true },
    );
  }

  function dragOpening(p: Press, input: PointerInput, lv: Level) {
    const o = lv.openings[p.target.id];
    if (!o) return;
    const raw = toPlan(input.screen);
    const placement = placeOpening(lv, raw, o.width, tol(24), o.id);
    let wallId = o.wallId;
    let offset: number;
    if (placement && placement.wallId !== o.wallId && placement.width >= o.width) {
      wallId = placement.wallId;
      offset = placement.offset;
    } else {
      const along = offsetOnWall(lv, o.wallId, raw);
      if (along === null) return;
      offset = along + (p.openingGrab ?? 0);
      if (!input.alt) offset = Math.round(offset / 10) * 10;
    }
    const length = ops.wallLength(lv, lv.walls[wallId]!);
    offset = Math.max(50 + o.width / 2, Math.min(length - 50 - o.width / 2, offset));
    if (overlaps(lv, wallId, offset, o.width, o.id)) return;
    if (wallId !== o.wallId) p.openingGrab = 0;
    plan.getState().updateOpening(o.id, { wallId, offset });
  }

  function dragItem(p: Press, input: PointerInput) {
    const step = input.alt ? 1 : snapStep(ui.getState().view.scale);
    const d = sub(toPlan(input.screen), p.plan);
    const round = (v: number) => Math.round(v / step) * step;
    plan.getState().updateItem(p.target.id, { x: round(p.itemStart!.x + d.x), y: round(p.itemStart!.y + d.y) });
  }

  function selectMove(input: PointerInput) {
    const lv = level();
    if (!lv) return;
    if (!press) {
      const hover = hitTest(lv, toPlan(input.screen), tol());
      if (!sameSelection(hover, ui.getState().hover)) ui.setState({ hover });
      return;
    }
    if (!press.moved) {
      if (dist(input.screen, press.screen) < DRAG_PX) return;
      press.moved = true;
      plan.getState().beginGesture();
      ui.setState({ dragging: true, hover: null });
    }
    switch (press.target.kind) {
      case 'vertex':
        dragVertex(press, input, lv);
        break;
      case 'wall':
        dragWall(press, input, lv);
        break;
      case 'opening':
        dragOpening(press, input, lv);
        break;
      case 'item':
        dragItem(press, input);
        break;
    }
  }

  function selectUp() {
    const p = press;
    press = null;
    if (!p?.moved) return;
    const s = plan.getState();
    const before = level();
    if (p.target.kind === 'vertex' && before) {
      const at = before.vertices[p.target.id];
      // Dropped on a wall: split it there so the corner joins it.
      if (at && p.lastHit?.kind === 'wall' && before.walls[p.lastHit.wallId]) s.splitWall(p.lastHit.wallId, at);
      s.weldVertices();
      const after = level();
      if (after && at && !after.vertices[p.target.id]) {
        const merged = ops.findVertexNear(after, at, 6);
        s.select(merged ? { kind: 'vertex', id: merged } : null);
      }
    } else if (p.target.kind === 'wall') {
      s.weldVertices();
      if (!level()?.walls[p.target.id]) s.select(null);
    }
    s.endGesture();
    ui.setState({ dragging: false, snap: null, guides: [] });
  }

  /* ------------------------------------------------------ selection edits */

  function deleteSelection(): boolean {
    const s = plan.getState();
    const sel = s.selection;
    const lv = level();
    if (!sel || !lv) return false;
    switch (sel.kind) {
      case 'wall':
        if (!lv.walls[sel.id]) return false;
        s.removeWall(sel.id);
        return true;
      case 'opening':
        if (!lv.openings[sel.id]) return false;
        s.removeOpening(sel.id);
        return true;
      case 'item':
        if (!lv.items[sel.id]) return false;
        s.removeItem(sel.id);
        return true;
      case 'vertex':
        if (!lv.vertices[sel.id]) return false;
        s.mutateLevel((l) => dissolveVertex(l, sel.id), { reconcileRooms: true });
        s.select(null);
        return true;
      case 'room':
        deps.notify?.('Rooms follow the walls around them. Delete a wall to open a room up.');
        return false;
    }
  }

  /** Moves the selection by (dx, dy) mm as one undo step. */
  function nudge(dx: number, dy: number): boolean {
    const s = plan.getState();
    const sel = s.selection;
    const lv = level();
    if (!sel || !lv) return false;
    switch (sel.kind) {
      case 'vertex': {
        const v = lv.vertices[sel.id];
        if (!v) return false;
        s.moveVertex(sel.id, { x: v.x + dx, y: v.y + dy });
        return true;
      }
      case 'wall': {
        const w = lv.walls[sel.id];
        if (!w) return false;
        s.mutateLevel(
          (l) => {
            for (const id of [w.a, w.b]) {
              const v = l.vertices[id]!;
              ops.moveVertex(l, id, { x: v.x + dx, y: v.y + dy });
            }
          },
          { reconcileRooms: true },
        );
        return true;
      }
      case 'opening': {
        const o = lv.openings[sel.id];
        const w = o && lv.walls[o.wallId];
        if (!o || !w) return false;
        const { a, b } = ops.wallEnds(lv, w);
        const along = vec.dot({ x: dx, y: dy }, norm(sub(b, a)));
        const step = Math.sign(along) * Math.max(1, Math.round(Math.abs(along)));
        if (Math.abs(along) < 0.3 * Math.hypot(dx, dy) || overlaps(lv, o.wallId, o.offset + step, o.width, o.id)) return false;
        s.updateOpening(o.id, { offset: o.offset + step });
        return true;
      }
      case 'item': {
        const i = lv.items[sel.id];
        if (!i) return false;
        s.updateItem(sel.id, { x: i.x + dx, y: i.y + dy });
        return true;
      }
      case 'room':
        return false;
    }
  }

  function flipDoor(what: 'hinge' | 'swing'): boolean {
    const s = plan.getState();
    const o = s.selection?.kind === 'opening' ? level()?.openings[s.selection.id] : undefined;
    if (!o || o.kind !== 'door') return false;
    s.updateOpening(o.id, what === 'hinge' ? { hinge: o.hinge === 'b' ? 'a' : 'b' } : { swing: o.swing === -1 ? 1 : -1 });
    return true;
  }

  /* ------------------------------------------------------------------ view */

  function fit() {
    const lv = level();
    const st = ui.getState();
    const bounds = unionBounds(lv ? levelBounds(lv) : null, st.underlayVisible ? (deps.underlayBounds?.() ?? null) : null);
    if (!bounds) {
      ui.setState({ view: { ...DEFAULT_VIEW, tx: Math.max(120, st.size.w * 0.3), ty: Math.max(200, st.size.h * 0.7) } });
      return;
    }
    const margin = 600; // room for wall thickness, door swings and dimensions
    const padded = { minX: bounds.minX - margin, minY: bounds.minY - margin, maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
    ui.setState({ view: fitBounds(padded, st.size, FIT_INSETS) });
  }

  function zoomBy(factor: number) {
    const st = ui.getState();
    ui.setState({ view: zoomAt(st.view, { x: st.size.w / 2, y: st.size.h / 2 }, factor) });
  }

  function setTool(tool: ToolId) {
    selectUp(); // closes a drag that is still open, so its gesture never leaks
    ui.setState({ tool, draft: null, snap: null, guides: [], hover: null, dragging: false });
  }

  /* ---------------------------------------------------------------- inputs */

  /** Returns 'pan' when the press should drag the view instead of the plan. */
  function pointerDown(input: PointerInput): 'pan' | 'handled' {
    const tool = ui.getState().tool;
    const opening = OPENING_TOOLS[tool];
    if (opening) openingDown(input, opening);
    else if (tool === 'wall') wallDown(input);
    else if (tool === 'split') splitDown(input);
    else if (tool === 'measure' || tool === 'scale') twoPointDown(input, tool);
    else if (tool === 'select') return selectDown(input) === 'pan' ? 'pan' : 'handled';
    else return 'pan';
    return 'handled';
  }

  function pointerMove(input: PointerInput) {
    const tool = ui.getState().tool;
    const opening = OPENING_TOOLS[tool];
    if (opening) openingHover(input, opening);
    else if (tool === 'wall') wallMove(input);
    else if (tool === 'split') splitHover(input);
    else if (tool === 'measure' || tool === 'scale') twoPointMove(input, tool);
    else if (tool === 'select') selectMove(input);
  }

  function pointerUp() {
    selectUp();
  }

  /** The pointer left the canvas: drop hover feedback, keep work in progress. */
  function pointerLeave() {
    const st = ui.getState();
    if (press?.moved) return;
    const transient = st.draft?.kind === 'opening' || st.draft?.kind === 'split';
    ui.setState({ hover: null, snap: null, guides: [], ...(transient ? { draft: null } : {}) });
  }

  /** Handles a key press. Returns true when the editor used it. */
  function keyDown(k: KeyInput): boolean {
    if (k.mod) return false;
    const st = ui.getState();
    const key = k.key;
    const wall = draftOf('wall');
    if (wall) {
      if (isLengthChar(key, wall.typed)) {
        ui.setState({ draft: { ...wall, typed: wall.typed + key } });
        return true;
      }
      if (key === 'Backspace' && wall.typed) {
        ui.setState({ draft: { ...wall, typed: wall.typed.slice(0, -1) } });
        return true;
      }
      if (key === 'Enter') {
        if (!commitTyped()) endDraft();
        return true;
      }
    }
    switch (key) {
      case 'Escape':
        if (st.draft) endDraft();
        else if (st.tool !== 'select') setTool('select');
        else plan.getState().select(null);
        return true;
      case 'Delete':
      case 'Backspace':
        return deleteSelection();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = k.alt ? 1 : k.shift ? 100 : 10;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowDown' ? -step : key === 'ArrowUp' ? step : 0;
        return nudge(dx, dy);
      }
      case '?':
        ui.setState({ helpOpen: !st.helpOpen });
        return true;
      case '0':
      case '!':
        fit();
        return true;
      case '+':
      case '=':
        zoomBy(1.25);
        return true;
      case '-':
      case '_':
        zoomBy(0.8);
        return true;
    }
    if (key.toLowerCase() === 'f') return flipDoor(k.shift ? 'swing' : 'hinge');
    const tool = key.length === 1 ? toolByKey(key) : undefined;
    if (tool) {
      setTool(tool.id);
      return true;
    }
    return false;
  }

  /** Subscribes to the plan store. Returns the disconnect function (call it when the editor unmounts). */
  function connect(): () => void {
    // Undo while drawing a chain steps the chain back with the plan.
    const unsubscribe = plan.subscribe((s, prev) => {
      const d = draftOf('wall');
      if (d && d.chain.length > 1 && s.future.length > prev.future.length && s.project !== prev.project)
        ui.setState({ draft: { ...d, chain: d.chain.slice(0, -1), typed: '' } });
    });
    return () => {
      selectUp();
      unsubscribe();
    };
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerLeave,
    keyDown,
    setTool,
    fit,
    zoomBy,
    applyScale,
    deleteSelection,
    nudge,
    flipDoor,
    endDraft,
    clearOverlays,
    connect,
  };
}
