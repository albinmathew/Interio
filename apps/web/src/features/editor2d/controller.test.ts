import {
  createPlanStore,
  createProject,
  createSampleProject,
  deriveRooms,
  ops,
  selectLevel,
  validateLevel,
  type Level,
  type Project,
  type Pt,
} from '@interio/core';
import { describe, expect, it } from 'vitest';
import { createController, type PointerInput } from './controller';
import { UNDERLAY_SCALE_KEY } from './logic/rescale';
import { roomTypePatch } from './logic/rooms';
import { planToScreen } from './logic/view';
import { createEditorStore } from './state';

function setup(project: Project, opts: { underlay?: Float32Array } = {}) {
  const plan = createPlanStore();
  plan.getState().loadProject(project);
  const ui = createEditorStore();
  // 1 px = 10 mm; plan origin at (100, 1000) on screen.
  ui.setState({ view: { scale: 0.1, tx: 100, ty: 1000 }, size: { w: 1600, h: 1200 } });
  const notes: string[] = [];
  const c = createController({ plan, ui, underlayPoints: () => opts.underlay ?? null, notify: (m) => notes.push(m) });
  const disconnect = c.connect();
  const level = (): Level => selectLevel(plan.getState())!;
  const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput => ({ screen: planToScreen(ui.getState().view, { x, y }), ...mods });
  const move = (x: number, y: number, mods?: Partial<PointerInput>) => c.pointerMove(at(x, y, mods));
  const click = (x: number, y: number, mods?: Partial<PointerInput>) => {
    c.pointerMove(at(x, y, mods));
    const result = c.pointerDown(at(x, y, mods));
    c.pointerUp();
    return result;
  };
  /** Press at `from`, move through `via` points, release. */
  const drag = (from: Pt, to: Pt, mods?: Partial<PointerInput>) => {
    c.pointerMove(at(from.x, from.y));
    c.pointerDown(at(from.x, from.y));
    for (let i = 1; i <= 5; i++) c.pointerMove(at(from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5, mods));
    c.pointerUp();
  };
  const type = (text: string) => {
    for (const key of text) c.keyDown({ key });
  };
  const vertexAt = (x: number, y: number) => ops.findVertexNear(level(), { x, y }, 2);
  return { plan, ui, c, level, at, move, click, drag, type, vertexAt, notes, disconnect, undos: () => plan.getState().past.length };
}

describe('wall tool', () => {
  it('draws a closed room click by click and ends the chain when the loop closes', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'wall', chain: [{ x: 0, y: 0 }] });
    t.click(4000, 0);
    t.click(4000, 3000);
    t.click(0, 3000);
    expect(deriveRooms(t.level())).toHaveLength(0);
    t.click(30, 40); // near the first corner: snaps onto it
    expect(Object.keys(t.level().walls)).toHaveLength(4);
    expect(Object.keys(t.level().vertices)).toHaveLength(4);
    expect(Object.values(t.level().rooms)).toHaveLength(1);
    expect(t.ui.getState().draft).toBeNull();
    expect(t.ui.getState().tool).toBe('wall');
    expect(t.undos()).toBe(4); // one step per wall
    expect(validateLevel(t.level())).toEqual([]);
  });

  it('shows the live length and aligns with the previous corner', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.move(3410, 30); // almost horizontal: lines up with the start
    const d = t.ui.getState().draft;
    expect(d).toMatchObject({ kind: 'wall', cursor: { x: 3410, y: 0 } });
    expect(t.ui.getState().guides).toHaveLength(1);
    expect(t.ui.getState().snap?.kind).toBe('align');
  });

  it('places a wall of a typed length towards the cursor', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.move(2000, 20);
    t.type('3400');
    expect(t.ui.getState().draft).toMatchObject({ typed: '3400' });
    t.c.keyDown({ key: 'Backspace' });
    t.type('0');
    t.c.keyDown({ key: 'Enter' });
    expect(t.vertexAt(3400, 0)).not.toBeNull();
    expect(t.ui.getState().draft).toMatchObject({ chain: [{ x: 0, y: 0 }, { x: 3400, y: 0 }], typed: '' });
    // Units work too, and the chain continues from the new corner.
    t.move(3400, 900);
    t.type('2.5m');
    t.c.keyDown({ key: 'Enter' });
    expect(t.vertexAt(3400, 2500)).not.toBeNull();
    expect(t.undos()).toBe(2);
  });

  it('reports a typed length it cannot read', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.move(2000, 0);
    t.type('3..4');
    t.c.keyDown({ key: 'Enter' });
    expect(t.notes).toHaveLength(1);
    expect(Object.keys(t.level().walls)).toHaveLength(0);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'wall', typed: '' });
  });

  it('locks to 45 degree steps with Shift and ignores snapping with Alt', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.click(3000, 420, { shift: true });
    expect(t.vertexAt(3000, 0)).not.toBeNull();
    t.click(5000, 2100, { shift: true }); // 45 degrees up from (3000, 0)
    const end = Object.values(t.level().vertices).find((v) => v.x > 3000)!;
    expect(end.x - 3000).toBe(end.y);
    t.c.keyDown({ key: 'Escape' });
    // Alt: lands exactly under the pointer even next to a vertex.
    t.click(8000, 8000);
    t.click(3037, 83, { alt: true });
    expect(t.vertexAt(3037, 83)).not.toBeNull();
  });

  it('ends the chain on Escape, on a double click, and when it lands on the plan', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.click(4000, 0);
    t.c.keyDown({ key: 'Escape' });
    expect(t.ui.getState().draft).toBeNull();
    expect(t.ui.getState().tool).toBe('wall');

    t.click(0, 2000);
    t.click(4000, 2000);
    t.click(4000, 2000); // second click of a double click
    expect(t.ui.getState().draft).toBeNull();
    expect(Object.keys(t.level().walls)).toHaveLength(2);

    t.click(2000, 2000); // starts on the upper wall (splits it)...
    expect(t.ui.getState().draft).not.toBeNull();
    t.click(2000, 30); // ...and lands on the lower one
    expect(t.ui.getState().draft).toBeNull();
    expect(Object.keys(t.level().walls)).toHaveLength(5);

    t.c.keyDown({ key: 'Escape' }); // nothing in progress: back to Select
    expect(t.ui.getState().tool).toBe('select');
  });

  it('keeps openings inside their walls when a new wall splits one or a drag shortens one', () => {
    const t = setup(createSampleProject());
    t.c.setTool('wall');
    // A partition landing inside the balcony sliding door (x 4500 to 7500 on the bottom wall).
    t.click(5200, 1200);
    t.click(5200, 0);
    expect(validateLevel(t.level())).toEqual([]);
    expect(t.undos()).toBe(1);
    const sliding = Object.values(t.level().openings).find((o) => o.kind === 'sliding')!;
    const wall = t.level().walls[sliding.wallId]!;
    expect(sliding.offset + sliding.width / 2).toBeLessThanOrEqual(ops.wallLength(t.level(), wall));
    // Shorten Bedroom 3's outer wall until its window no longer fits where it was.
    t.c.setTool('select');
    t.drag({ x: 12000, y: 9000 }, { x: 10400, y: 9000 }, { alt: true });
    expect(validateLevel(t.level()).filter((i) => i.code === 'opening.bounds')).toEqual([]);
    expect(t.undos()).toBe(2);
  });

  it('uses the chosen wall kind and thickness', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.ui.setState({ wallKind: 'railing', wallThickness: 60 });
    t.click(0, 0);
    t.click(3000, 0);
    expect(Object.values(t.level().walls)[0]).toMatchObject({ kind: 'railing', thickness: 60, height: 1100 });
  });

  it('steps the chain back when a wall is undone mid-draw', () => {
    const t = setup(createProject('Blank'));
    t.c.setTool('wall');
    t.click(0, 0);
    t.click(4000, 0);
    t.click(4000, 3000);
    t.plan.getState().undo();
    expect(t.ui.getState().draft).toMatchObject({ chain: [{ x: 0, y: 0 }, { x: 4000, y: 0 }] });
    t.click(4000, 2000);
    expect(t.vertexAt(4000, 2000)).not.toBeNull();
    expect(Object.keys(t.level().walls)).toHaveLength(2);
  });

  it('snaps to underlay points while tracing, but not when the underlay is hidden', () => {
    const underlay = new Float32Array([14000, 1000, 18000, 1000, 18000, 4000, 14000, 4000]);
    const t = setup(createProject('Trace'), { underlay });
    t.c.setTool('wall');
    t.move(14060, 1050);
    expect(t.ui.getState().snap).toEqual({ kind: 'underlay', point: { x: 14000, y: 1000 } });
    t.click(14060, 1050);
    t.click(17950, 960);
    t.click(18040, 4030);
    t.click(13960, 3940);
    t.click(14030, 1020);
    const xs = Object.values(t.level().vertices).map((v) => `${v.x},${v.y}`).sort();
    expect(xs).toEqual(['14000,1000', '14000,4000', '18000,1000', '18000,4000']);
    expect(Object.values(t.level().rooms)).toHaveLength(1);

    t.ui.setState({ underlayVisible: false });
    t.move(20060, 1050);
    t.move(18060, 6050);
    expect(t.ui.getState().snap?.kind).not.toBe('underlay');
  });
});

describe('opening tools', () => {
  it('previews on the hovered wall and places a door with hinge and swing', () => {
    const t = setup(createSampleProject());
    const before = Object.keys(t.level().openings).length;
    t.c.setTool('door');
    t.move(1500, 80); // just inside the kitchen, by the bottom wall
    expect(t.ui.getState().draft).toMatchObject({ kind: 'opening', placement: { valid: true, width: 900 } });
    t.click(1500, 80);
    const sel = t.plan.getState().selection!;
    expect(sel.kind).toBe('opening');
    const door = t.level().openings[sel.id]!;
    expect(door).toMatchObject({ kind: 'door', width: 900, height: 2100, sill: 0 });
    expect(door.hinge).toMatch(/^[ab]$/);
    expect([1, -1]).toContain(door.swing);
    expect(Object.keys(t.level().openings)).toHaveLength(before + 1);
    expect(t.undos()).toBe(1);
    expect(t.ui.getState().tool).toBe('door'); // stays armed for the next one
  });

  it('places windows, sliding doors and passages with their defaults', () => {
    const t = setup(createProject('Blank'));
    t.plan.getState().addWall({ x: 0, y: 0 }, { x: 9000, y: 0 });
    for (const [key, x, expected] of [
      ['n', 1500, { kind: 'window', width: 1500, height: 1200, sill: 900 }],
      ['s', 4500, { kind: 'sliding', width: 1800, height: 2400, sill: 0 }],
      ['p', 7500, { kind: 'passage', width: 1200, height: 2100, sill: 0 }],
    ] as const) {
      t.c.keyDown({ key });
      t.click(x, 0);
      const o = t.level().openings[t.plan.getState().selection!.id]!;
      expect(o).toMatchObject(expected);
      expect(o.hinge).toBeUndefined();
    }
    expect(validateLevel(t.level()).filter((i) => i.code.startsWith('opening'))).toEqual([]);
  });

  it('refuses to overlap an existing opening and says why', () => {
    const t = setup(createSampleProject());
    const before = Object.keys(t.level().openings).length;
    t.c.setTool('window');
    t.click(6000, 0); // on the balcony sliding door
    expect(Object.keys(t.level().openings)).toHaveLength(before);
    expect(t.notes).toEqual(['Overlaps another opening']);
    expect(t.undos()).toBe(0);
  });

  it('drops the preview away from walls', () => {
    const t = setup(createSampleProject());
    t.c.setTool('door');
    t.move(6500, 2100); // middle of the living room
    expect(t.ui.getState().draft).toBeNull();
  });
});

describe('select tool', () => {
  it('selects what is under the pointer and pans from empty space or a room', () => {
    const t = setup(createSampleProject());
    expect(t.click(6000, 9000)).toBe('handled');
    expect(t.plan.getState().selection?.kind).toBe('wall');
    expect(t.click(12000, 9000)).toBe('handled');
    expect(t.plan.getState().selection?.kind).toBe('vertex');
    expect(t.click(1500, 2100)).toBe('pan');
    expect(t.plan.getState().selection?.kind).toBe('room');
    expect(t.click(-4000, -4000)).toBe('pan');
    expect(t.plan.getState().selection).toBeNull();
    expect(t.undos()).toBe(0);
  });

  it('drags a vertex as one undo step and the walls follow', () => {
    const t = setup(createSampleProject());
    const before = JSON.stringify(t.level());
    const id = t.vertexAt(12000, 9000)!;
    t.drag({ x: 12000, y: 9000 }, { x: 12600, y: 9400 });
    expect(t.level().vertices[id]).toEqual({ x: 12600, y: 9400 });
    expect(t.undos()).toBe(1);
    expect(t.ui.getState().dragging).toBe(false);
    t.plan.getState().undo();
    expect(JSON.stringify(t.level())).toBe(before);
  });

  it('does not create an undo step for a click without movement', () => {
    const t = setup(createSampleProject());
    t.click(12000, 9000);
    t.c.pointerDown(t.at(12000, 9000));
    t.c.pointerMove(t.at(12010, 9010)); // 1.4 px: below the drag threshold
    t.c.pointerUp();
    expect(t.undos()).toBe(0);
    expect(t.vertexAt(12000, 9000)).not.toBeNull();
  });

  it('welds a vertex dropped on another one', () => {
    const t = setup(createProject('Blank'));
    const s = t.plan.getState();
    s.addWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    s.addWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 });
    s.addWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 });
    s.addWall({ x: 0, y: 3000 }, { x: 300, y: 700 }); // misses the first corner
    expect(Object.keys(t.level().vertices)).toHaveLength(5);
    const steps = t.undos();
    t.drag({ x: 300, y: 700 }, { x: 40, y: 30 });
    expect(Object.keys(t.level().vertices)).toHaveLength(4);
    expect(Object.values(t.level().rooms)).toHaveLength(1);
    expect(t.undos()).toBe(steps + 1);
    expect(t.plan.getState().selection).toEqual({ kind: 'vertex', id: t.vertexAt(0, 0)! });
  });

  it('splits a wall when a vertex is dropped on it', () => {
    const t = setup(createProject('Blank'));
    const s = t.plan.getState();
    s.addWall({ x: 0, y: 0 }, { x: 6000, y: 0 });
    s.addWall({ x: 3000, y: 2500 }, { x: 3000, y: 800 });
    t.drag({ x: 3000, y: 800 }, { x: 3000, y: 30 });
    expect(Object.keys(t.level().walls)).toHaveLength(3);
    expect(Object.keys(t.level().vertices)).toHaveLength(4);
    expect(t.vertexAt(3000, 0)).not.toBeNull();
  });

  it('drags a wall perpendicular to itself; Shift frees it', () => {
    const t = setup(createSampleProject());
    // The wall between Bedroom 1 and Bath 1 runs along x = 3800.
    t.drag({ x: 3800, y: 7000 }, { x: 4100, y: 7300 });
    expect(t.vertexAt(4100, 5400)).not.toBeNull();
    expect(t.vertexAt(4100, 9000)).not.toBeNull();
    expect(t.undos()).toBe(1);
    t.drag({ x: 4100, y: 7000 }, { x: 4300, y: 7200 }, { shift: true, alt: true });
    expect(t.vertexAt(4300, 5600)).not.toBeNull();
    expect(t.undos()).toBe(2);
  });

  it('drags an opening along its wall and onto another wall', () => {
    const t = setup(createSampleProject());
    t.click(1900, 5400);
    const id = t.plan.getState().selection!.id;
    const start = { ...t.level().openings[id]! };
    t.drag({ x: 1900, y: 5400 }, { x: 1500, y: 5400 });
    const slid = t.level().openings[id]!;
    expect(slid.wallId).toBe(start.wallId);
    expect(Math.abs(slid.offset - start.offset)).toBe(400);
    // Down onto the kitchen's top wall (y = 4200).
    t.drag({ x: 1500, y: 5400 }, { x: 1400, y: 4200 });
    const moved = t.level().openings[id]!;
    expect(moved.wallId).not.toBe(start.wallId);
    const wall = t.level().walls[moved.wallId]!;
    const { a, b } = ops.wallEnds(t.level(), wall);
    expect(a.y).toBe(4200);
    expect(b.y).toBe(4200);
    expect(moved.width).toBe(start.width);
    expect(t.undos()).toBe(2);
  });

  it('deletes, nudges and flips the selection from the keyboard', () => {
    const t = setup(createSampleProject());
    t.click(1900, 5400);
    const id = t.plan.getState().selection!.id;
    const o = () => t.level().openings[id]!;
    const { hinge, swing, offset } = o();
    expect(t.c.keyDown({ key: 'f' })).toBe(true);
    expect(o().hinge).not.toBe(hinge);
    expect(t.c.keyDown({ key: 'F', shift: true })).toBe(true);
    expect(o().swing).toBe(-swing!);
    expect(t.c.keyDown({ key: 'ArrowRight' })).toBe(true);
    expect(Math.abs(o().offset - offset)).toBe(10);
    expect(t.c.keyDown({ key: 'ArrowUp' })).toBe(false); // across the wall: nothing to do
    expect(t.c.keyDown({ key: 'ArrowLeft', shift: true })).toBe(true);
    expect(Math.abs(o().offset - offset)).toBe(90);
    expect(t.undos()).toBe(4);
    expect(t.c.keyDown({ key: 'Delete' })).toBe(true);
    expect(t.level().openings[id]).toBeUndefined();
    expect(t.plan.getState().selection).toBeNull();

    t.click(12000, 9000);
    const vid = t.plan.getState().selection!.id;
    t.c.keyDown({ key: 'ArrowUp', shift: true });
    expect(t.level().vertices[vid]).toEqual({ x: 12000, y: 9100 });

    t.click(1500, 2100); // a room cannot be deleted
    expect(t.c.keyDown({ key: 'Backspace' })).toBe(false);
    expect(t.notes).toHaveLength(1);

    const walls = Object.keys(t.level().walls).length;
    t.click(6000, -1500); // balcony railing
    expect(t.c.keyDown({ key: 'Backspace' })).toBe(true);
    expect(Object.keys(t.level().walls)).toHaveLength(walls - 1);
    expect(t.level().rooms).not.toHaveProperty('Balcony');
    expect(Object.values(t.level().rooms).some((r) => r.name === 'Balcony')).toBe(false);
  });

  it('leaves Cmd/Ctrl shortcuts to the app shell', () => {
    const t = setup(createSampleProject());
    expect(t.c.keyDown({ key: 'z', mod: true })).toBe(false);
    expect(t.c.keyDown({ key: 'w', mod: true })).toBe(false);
    expect(t.ui.getState().tool).toBe('select');
  });
});

describe('split, measure and scale', () => {
  it('splits a wall where it is clicked, snapping to its middle', () => {
    const t = setup(createProject('Blank'));
    t.plan.getState().addWall({ x: 0, y: 0 }, { x: 6000, y: 0 });
    t.c.keyDown({ key: 'x' });
    t.move(2960, 40);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'split', point: { x: 3000, y: 0 }, valid: true });
    t.click(2960, 40);
    expect(Object.keys(t.level().walls)).toHaveLength(2);
    expect(t.plan.getState().selection).toEqual({ kind: 'vertex', id: t.vertexAt(3000, 0)! });
    expect(t.undos()).toBe(2);
    // Not through a door: move the opening first.
    t.plan.getState().addOpening({ wallId: Object.keys(t.level().walls)[0]!, offset: 1500, width: 900, height: 2100, sill: 0, kind: 'door' });
    const doorWall = Object.values(t.level().walls)[0]!;
    const { a: wa, b: wb } = ops.wallEnds(t.level(), doorWall);
    t.move((wa.x + wb.x) / 2 + 40, 20);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'split', valid: false });
  });

  it('measures between two snapped points without touching the plan', () => {
    const t = setup(createSampleProject());
    const before = JSON.stringify(t.level());
    t.c.keyDown({ key: 'm' });
    t.click(20, 30);
    t.move(11980, 20);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'measure', a: { x: 0, y: 0 }, b: { x: 12000, y: 0 }, done: false });
    t.click(11980, 20);
    expect(t.ui.getState().draft).toMatchObject({ done: true });
    t.click(0, 9000); // a third click starts over
    expect(t.ui.getState().draft).toMatchObject({ a: { x: 0, y: 9000 }, done: false });
    expect(JSON.stringify(t.level())).toBe(before);
    expect(t.undos()).toBe(0);
  });

  it('rescales the whole level from two clicks and a real distance, in one undo step', () => {
    const t = setup(createSampleProject());
    t.plan.getState().addItem({ catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 0 });
    const before = JSON.stringify(t.plan.getState().project);
    const steps = t.undos();
    const roomIds = Object.keys(t.level().rooms).sort();
    const screenBefore = planToScreen(t.ui.getState().view, { x: 12000, y: 9000 });

    t.c.keyDown({ key: 'c' });
    expect(t.c.applyScale(6000)).toBe(false); // nothing picked yet
    t.click(0, 0);
    t.click(12000, 0);
    expect(t.ui.getState().draft).toMatchObject({ kind: 'scale', done: true });
    expect(t.c.applyScale(6000)).toBe(true);

    const xs = Object.values(t.level().vertices).map((v) => v.x);
    expect(Math.max(...xs)).toBe(6000);
    expect(Object.values(t.level().items)[0]).toMatchObject({ x: 950, y: 3600 });
    expect(Object.keys(t.level().rooms).sort()).toEqual(roomIds);
    expect(t.plan.getState().project!.settings[UNDERLAY_SCALE_KEY]).toBe(0.5);
    expect(t.undos()).toBe(steps + 1);
    expect(t.ui.getState().tool).toBe('select');
    // The camera compensates: the same corner is still at the same pixel.
    const screenAfter = planToScreen(t.ui.getState().view, { x: 6000, y: 4500 });
    expect(screenAfter.x).toBeCloseTo(screenBefore.x, 6);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y, 6);

    t.plan.getState().undo();
    expect(JSON.stringify(t.plan.getState().project)).toBe(before);
    // Undo and redo move the camera back and forth with the plan.
    const undone = planToScreen(t.ui.getState().view, { x: 12000, y: 9000 });
    expect(undone.x).toBeCloseTo(screenBefore.x, 6);
    expect(undone.y).toBeCloseTo(screenBefore.y, 6);
    t.plan.getState().redo();
    const redone = planToScreen(t.ui.getState().view, { x: 6000, y: 4500 });
    expect(redone.x).toBeCloseTo(screenBefore.x, 6);
  });
});

describe('view and tool keys', () => {
  it('switches tools by key and clears work in progress', () => {
    const t = setup(createProject('Blank'));
    t.c.keyDown({ key: 'w' });
    t.click(0, 0);
    expect(t.c.keyDown({ key: 'd' })).toBe(true);
    expect(t.ui.getState()).toMatchObject({ tool: 'door', draft: null, snap: null });
    for (const [key, tool] of [['v', 'select'], ['h', 'hand'], ['W', 'wall'], ['s', 'sliding'], ['n', 'window'], ['p', 'passage'], ['x', 'split'], ['m', 'measure'], ['c', 'scale']] as const) {
      t.c.keyDown({ key });
      expect(t.ui.getState().tool).toBe(tool);
    }
    expect(t.c.pointerDown(t.at(0, 0))).toBe('handled');
    t.c.setTool('hand');
    expect(t.c.pointerDown(t.at(0, 0))).toBe('pan');
  });

  it('fits the plan inside the free area and zooms about the centre', () => {
    const t = setup(createSampleProject());
    t.c.keyDown({ key: '0' });
    const { view, size } = t.ui.getState();
    for (const corner of [{ x: 0, y: -1500 }, { x: 12000, y: 9000 }]) {
      const s = planToScreen(view, corner);
      expect(s.x).toBeGreaterThan(80);
      expect(s.x).toBeLessThan(size.w - 290);
      expect(s.y).toBeGreaterThan(60);
      expect(s.y).toBeLessThan(size.h - 60);
    }
    t.c.keyDown({ key: '+' });
    expect(t.ui.getState().view.scale).toBeCloseTo(view.scale * 1.25, 9);
    t.c.keyDown({ key: '-' });
    expect(t.ui.getState().view.scale).toBeCloseTo(view.scale, 9);
    t.c.keyDown({ key: '?' });
    expect(t.ui.getState().helpOpen).toBe(true);
  });
});

describe('undo', () => {
  it('returns byte-identical level JSON after 20 mixed edits and 20 undos', () => {
    const t = setup(createSampleProject());
    const s = () => t.plan.getState();
    const before = JSON.stringify(t.level());
    let expected = 0;
    const step = (name: string, fn: () => void) => {
      fn();
      expected += 1;
      expect(t.undos(), name).toBe(expected);
    };

    t.c.setTool('wall');
    t.click(1000, 6500);
    step('wall 1', () => t.click(2500, 6500));
    step('wall 2', () => t.click(2500, 7500));
    t.c.keyDown({ key: 'Escape' });
    t.c.setTool('door');
    step('door', () => t.click(1500, 60));
    t.c.setTool('window');
    step('window', () => t.click(0, 7000));
    t.c.setTool('sliding');
    step('sliding door', () => t.click(12000, 7200));
    t.c.setTool('split');
    step('split', () => t.click(6000, 9000));
    t.c.setTool('select');
    step('drag vertex', () => t.drag({ x: 12000, y: 9000 }, { x: 12300, y: 9200 }));
    step('drag wall', () => t.drag({ x: 3800, y: 7000 }, { x: 4000, y: 7050 }));
    step('drag opening', () => t.drag({ x: 1900, y: 5400 }, { x: 1500, y: 5400 }));
    expect(s().selection?.kind).toBe('opening');
    step('nudge', () => t.c.keyDown({ key: 'ArrowRight' }));
    step('flip hinge', () => t.c.keyDown({ key: 'f' }));
    step('flip swing', () => t.c.keyDown({ key: 'F', shift: true }));
    t.click(1500, 2100);
    const kitchen = s().selection!;
    expect(kitchen.kind).toBe('room');
    step('rename room', () => s().setRoomProps(kitchen.id, { name: 'Galley' }));
    step('retype room', () => s().setRoomProps(kitchen.id, roomTypePatch(t.level().rooms[kitchen.id]!, 'utility')));
    t.click(6000, 0);
    t.click(9000, 0);
    const wall = s().selection!;
    expect(wall.kind).toBe('wall');
    step('wall kind', () => s().setWallProps(wall.id, { kind: 'low', height: 1000 }));
    t.click(10000, 3200);
    expect(s().selection?.kind).toBe('wall');
    step('delete wall', () => t.c.keyDown({ key: 'Delete' }));
    step('ceiling height', () => s().setLevelProps({ ceilingHeight: 2850 }));
    step('add item', () => s().addItem({ catalogId: 'bed.double', x: 1900, y: 7600, z: 0, rotationDeg: 0 }));
    step('drag item', () => t.drag({ x: 1900, y: 7600 }, { x: 2100, y: 7900 }));
    t.c.setTool('scale');
    t.click(0, 0);
    t.click(12000, 0);
    step('set scale', () => t.c.applyScale(11000, { thickness: true }));

    expect(expected).toBe(20);
    const edited = JSON.stringify(t.level());
    expect(edited).not.toBe(before);
    for (let i = 0; i < 20; i++) s().undo();
    expect(JSON.stringify(t.level())).toBe(before);
    expect(s().past).toHaveLength(0);
    for (let i = 0; i < 20; i++) s().redo();
    expect(JSON.stringify(t.level())).toBe(edited);
  });
});
