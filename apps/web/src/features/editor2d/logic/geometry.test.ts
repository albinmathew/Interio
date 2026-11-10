import { buildLevel, createSampleLevel, deriveRooms, ops, vec, wallFootprints, type Level, type Pt } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { arcPath, polyPath } from '../layers/style';
import { hitTest } from './hit';
import { itemFootprint, pointInItem } from './items';
import { defaultOpening, openingSymbol, placeOpening, wallFrame } from './openings';
import { rescaleLevel } from './rescale';
import { levelTotals, roomTypePatch } from './rooms';
import { makeSyntheticUnderlay, scalePoints, underlayBounds } from './underlay';
import { dissolveVertex, endForLength, perpendicularDelta, wallKindDefaults, wallPieces } from './walls';

const box = (): Level =>
  buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 200 },
      { a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 }, thickness: 200 },
      { a: { x: 4000, y: 3000 }, b: { x: 0, y: 3000 }, thickness: 200 },
      { a: { x: 0, y: 3000 }, b: { x: 0, y: 0 }, thickness: 200 },
    ],
  });

const wallAt = (level: Level, p: Pt) => ops.findWallNear(level, p, 5)!.wallId;
const near = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('wall pieces', () => {
  it('returns the whole footprint when the wall has no openings', () => {
    const level = box();
    const fp = wallFootprints(level)[0]!;
    const wall = level.walls[fp.wallId]!;
    expect(wallPieces(fp, level.vertices[wall.a]!, wall.thickness, [])).toEqual([fp.polygon]);
  });

  it('cuts a square gap at each opening and keeps the solid area', () => {
    const level = box();
    const id = wallAt(level, { x: 2000, y: 0 });
    const fp = wallFootprints(level).find((f) => f.wallId === id)!;
    const wall = level.walls[id]!;
    const pieces = wallPieces(fp, level.vertices[wall.a]!, wall.thickness, [
      { offset: 1000, width: 900 },
      { offset: 3000, width: 600 },
    ]);
    expect(pieces).toHaveLength(3);
    const area = (poly: Pt[]) => Math.abs(vec.polygonArea(poly));
    const solid = pieces.reduce((s, p) => s + area(p), 0);
    expect(solid).toBeCloseTo(area(fp.polygon) - (900 + 600) * 200, 3);
  });

  it('merges overlapping openings and drops a piece that would be empty', () => {
    const level = box();
    const id = wallAt(level, { x: 2000, y: 0 });
    const fp = wallFootprints(level).find((f) => f.wallId === id)!;
    const wall = level.walls[id]!;
    const pieces = wallPieces(fp, level.vertices[wall.a]!, wall.thickness, [
      { offset: 300, width: 600 }, // starts at the wall end
      { offset: 800, width: 600 }, // overlaps the first
    ]);
    expect(pieces).toHaveLength(1);
  });
});

describe('opening symbols', () => {
  const frame = { a: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, normal: { x: 0, y: 1 }, thickness: 200 };

  it('draws the door leaf from the hinge into the swing side', () => {
    const left = openingSymbol(frame, { offset: 1000, width: 900, kind: 'door', hinge: 'a', swing: 1 });
    near(left.arc!.center, { x: 550, y: 100 }); // hinge jamb, left face
    near(left.arc!.from, { x: 550, y: 1000 }); // open leaf tip
    near(left.arc!.to, { x: 1450, y: 100 }); // strike jamb
    expect(left.arc!.radius).toBe(900);
    near(left.lines[0]![0], left.arc!.center);
    near(left.lines[0]![1], left.arc!.from);

    const flipped = openingSymbol(frame, { offset: 1000, width: 900, kind: 'door', hinge: 'b', swing: -1 });
    near(flipped.arc!.center, { x: 1450, y: -100 });
    near(flipped.arc!.from, { x: 1450, y: -1000 });
    near(flipped.arc!.to, { x: 550, y: -100 });
  });

  it('keeps the leaf and the strike on the swing circle for any wall direction', () => {
    const level = createSampleLevel();
    for (const o of Object.values(level.openings).filter((x) => x.kind === 'door')) {
      const sym = openingSymbol(wallFrame(level, o.wallId)!, o);
      expect(vec.dist(sym.arc!.center, sym.arc!.from)).toBeCloseTo(o.width, 6);
      expect(vec.dist(sym.arc!.center, sym.arc!.to)).toBeCloseTo(o.width, 6);
      // The leaf is perpendicular to the wall.
      const f = wallFrame(level, o.wallId)!;
      expect(vec.dot(vec.sub(sym.arc!.from, sym.arc!.center), f.dir)).toBeCloseTo(0, 6);
    }
  });

  it('gives windows a frame across the wall, sliding doors two panels and passages two edges', () => {
    const win = openingSymbol(frame, { offset: 1000, width: 1500, kind: 'window' });
    expect(win.rects).toHaveLength(1);
    expect(Math.abs(vec.polygonArea(win.rects[0]!))).toBeCloseTo(1500 * 200, 6);
    expect(win.lines.length).toBeGreaterThan(0);
    expect(win.arc).toBeUndefined();

    const sliding = openingSymbol(frame, { offset: 1000, width: 1800, kind: 'sliding' });
    expect(sliding.rects).toHaveLength(2);
    const xs = sliding.rects.flat().map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(100, 6);
    expect(Math.max(...xs)).toBeCloseTo(1900, 6);

    const passage = openingSymbol(frame, { offset: 1000, width: 1200, kind: 'passage' });
    expect(passage.lines).toHaveLength(2);
    expect(passage.rects).toHaveLength(0);
  });

  it('turns the swing arc the short way round in screen space', () => {
    const sym = openingSymbol(frame, { offset: 1000, width: 900, kind: 'door', hinge: 'a', swing: 1 });
    // From the tip above the wall to the strike on the right: clockwise on screen (y down).
    expect(arcPath(sym.arc!.center, sym.arc!.from, sym.arc!.to, 900)).toBe('M550 -1000A900 900 0 0 1 1450 -100');
    const other = openingSymbol(frame, { offset: 1000, width: 900, kind: 'door', hinge: 'b', swing: 1 });
    expect(arcPath(other.arc!.center, other.arc!.from, other.arc!.to, 900)).toBe('M1450 -1000A900 900 0 0 0 550 -100');
    expect(polyPath([{ x: 0, y: 0 }, { x: 10, y: 5.5 }])).toBe('M0 0L10 -5.50Z');
  });
});

describe('placing openings', () => {
  it('uses DEFAULTS for sizes', () => {
    expect(defaultOpening('door')).toEqual({ kind: 'door', width: 900, height: 2100, sill: 0 });
    expect(defaultOpening('window')).toEqual({ kind: 'window', width: 1500, height: 1200, sill: 900 });
    expect(defaultOpening('sliding').height).toBe(2400);
    expect(defaultOpening('passage').sill).toBe(0);
  });

  it('centres on the pointer, swings to the pointer side and hinges at the nearer end', () => {
    const level = box();
    const id = wallAt(level, { x: 2000, y: 0 });
    const wall = level.walls[id]!;
    const { a } = ops.wallEnds(level, wall);
    const p = placeOpening(level, { x: 1203, y: 150 }, 900, 120)!;
    expect(p.wallId).toBe(id);
    expect(p.valid).toBe(true);
    expect(p.width).toBe(900);
    // Offset is measured from vertex a, whichever end that is.
    expect(p.offset).toBe(a.x === 0 ? 1200 : 2800);
    const leftIsUp = a.x === 0; // a -> b pointing +x has its left normal pointing +y
    expect(p.swing).toBe(leftIsUp ? 1 : -1);
    expect(placeOpening(level, { x: 1203, y: -150 }, 900, 120)!.swing).toBe(leftIsUp ? -1 : 1);
    expect(p.hinge).toBe(a.x === 0 ? 'a' : 'b');
  });

  it('keeps the opening inside the wall and snaps to its middle', () => {
    const level = box();
    const end = placeOpening(level, { x: 100, y: 0 }, 900, 120)!;
    expect(Math.min(end.offset, 4000 - end.offset)).toBe(500); // 50 mm margin + half width
    expect(placeOpening(level, { x: 2040, y: 0 }, 900, 120)!.offset).toBe(2000);
  });

  it('shrinks to a short wall, refuses a tiny one and refuses overlaps', () => {
    const level = buildLevel({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 700, y: 0 } },
        { a: { x: 0, y: 2000 }, b: { x: 250, y: 2000 } },
        { a: { x: 0, y: 5000 }, b: { x: 4000, y: 5000 } },
      ],
      openings: [{ at: { x: 2000, y: 5000 }, kind: 'door', width: 900, height: 2100, sill: 0 }],
    });
    expect(placeOpening(level, { x: 350, y: 0 }, 900, 100)).toMatchObject({ valid: true, width: 600, offset: 350 });
    expect(placeOpening(level, { x: 100, y: 2000 }, 900, 100)).toMatchObject({ valid: false });
    expect(placeOpening(level, { x: 2500, y: 5000 }, 900, 100)).toMatchObject({ valid: false, reason: 'Overlaps another opening' });
    const existing = Object.keys(level.openings)[0]!;
    expect(placeOpening(level, { x: 2500, y: 5000 }, 900, 100, existing)).toMatchObject({ valid: true });
    expect(placeOpening(level, { x: 2000, y: 9000 }, 900, 100)).toBeNull();
  });
});

describe('hit testing', () => {
  const level = createSampleLevel();

  it('finds vertices, openings, walls and rooms in that order', () => {
    expect(hitTest(level, { x: 30, y: 20 }, 80)?.kind).toBe('vertex');
    expect(hitTest(level, { x: 1900, y: 5430 }, 80)?.kind).toBe('opening'); // Bedroom 1 door
    expect(hitTest(level, { x: 6000, y: 9050 }, 80)?.kind).toBe('wall');
    const room = hitTest(level, { x: 1500, y: 2100 }, 80);
    expect(room?.kind).toBe('room');
    expect(level.rooms[room!.id]!.name).toBe('Kitchen');
    expect(hitTest(level, { x: -3000, y: -3000 }, 80)).toBeNull();
  });

  it('can skip vertices, and finds items above rooms', () => {
    expect(hitTest(level, { x: 30, y: 20 }, 80, { vertices: false })?.kind).toBe('wall');
    const withItem = structuredClone(level);
    const id = ops.addItem(withItem, { catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 90 });
    expect(hitTest(withItem, { x: 2800, y: 7200 }, 80, { rooms: false })).toEqual({ kind: 'item', id });
    expect(hitTest(withItem, { x: 1900, y: 8300 }, 80, { rooms: false })).toBeNull(); // outside the rotated bed
  });
});

describe('items', () => {
  it('rotates the catalog footprint about the item centre', () => {
    const item = { id: 'i', catalogId: 'bed.double', x: 1000, y: 2000, z: 0, rotationDeg: 0 };
    const flat = itemFootprint(item);
    expect(flat.name).toBe('Double bed');
    near(flat.corners[0], { x: 200, y: 950 }); // front-left: front faces -y
    near(flat.corners[2], { x: 1800, y: 3050 });
    const turned = itemFootprint({ ...item, rotationDeg: 90 });
    near(turned.corners[0], { x: 2050, y: 1200 });
    expect(pointInItem({ ...item, rotationDeg: 90 }, { x: 1950, y: 2000 })).toBe(true);
    expect(pointInItem(item, { x: 1950, y: 2000 })).toBe(false);
    expect(itemFootprint({ ...item, catalogId: 'nope' }).w).toBe(600);
  });
});

describe('rescale', () => {
  it('scales positions, openings and items but not heights', () => {
    const level = createSampleLevel();
    ops.addItem(level, { catalogId: 'bed.double', x: 1900, y: 7200, z: 0, rotationDeg: 0 });
    const before = structuredClone(level);
    const roomsBefore = deriveRooms(before);
    rescaleLevel(level, 0.5);
    ops.reconcileRooms(level);
    for (const [id, v] of Object.entries(level.vertices)) expect(v).toEqual({ x: Math.round(before.vertices[id]!.x * 0.5), y: Math.round(before.vertices[id]!.y * 0.5) });
    for (const [id, w] of Object.entries(level.walls)) {
      expect(w.thickness).toBe(before.walls[id]!.thickness);
      expect(w.height).toBe(before.walls[id]!.height);
    }
    const sliding = Object.values(level.openings).find((o) => o.kind === 'sliding')!;
    expect(sliding.width).toBe(1500);
    expect(sliding.height).toBe(before.openings[sliding.id]!.height);
    expect(Object.values(level.items)[0]).toMatchObject({ x: 950, y: 3600 });
    // Every room keeps its name and its identity.
    const rooms = deriveRooms(level);
    expect(rooms).toHaveLength(roomsBefore.length);
    expect(Object.values(level.rooms).map((r) => r.name).sort()).toEqual(Object.values(before.rooms).map((r) => r.name).sort());
    expect(Object.keys(level.rooms).sort()).toEqual(Object.keys(before.rooms).sort());
  });

  it('can scale wall thickness and ignores nonsense factors', () => {
    const level = box();
    rescaleLevel(level, 2, { thickness: true });
    expect(Object.values(level.walls).every((w) => w.thickness === 400)).toBe(true);
    const copy = structuredClone(level);
    for (const k of [0, -1, NaN, Infinity, 1]) rescaleLevel(level, k);
    expect(level).toEqual(copy);
  });
});

describe('wall edits', () => {
  it('joins two walls when the corner between them is removed, keeping openings in place', () => {
    const level = buildLevel({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 3000, y: 0 } },
        { a: { x: 3000, y: 0 }, b: { x: 7000, y: 0 } },
      ],
      openings: [
        { at: { x: 1000, y: 0 }, kind: 'door', width: 900, height: 2100, sill: 0 },
        { at: { x: 5000, y: 0 }, kind: 'window', width: 1500, height: 1200, sill: 900 },
      ],
    });
    const mid = ops.findVertexNear(level, { x: 3000, y: 0 }, 1)!;
    dissolveVertex(level, mid);
    expect(Object.keys(level.walls)).toHaveLength(1);
    expect(Object.keys(level.vertices)).toHaveLength(2);
    const wall = Object.values(level.walls)[0]!;
    const { a, b } = ops.wallEnds(level, wall);
    const centres = Object.values(level.openings)
      .map((o) => vec.add(a, vec.scale(vec.norm(vec.sub(b, a)), o.offset)).x)
      .sort((m, n) => m - n);
    expect(centres[0]).toBeCloseTo(1000, 6);
    expect(centres[1]).toBeCloseTo(5000, 6);
    expect(Object.values(level.openings).every((o) => o.wallId === wall.id)).toBe(true);
  });

  it('removes every wall at a junction of three or more', () => {
    const level = createSampleLevel();
    const junction = ops.findVertexNear(level, { x: 3800, y: 5400 }, 1)!;
    const before = Object.keys(level.walls).length;
    dissolveVertex(level, junction);
    expect(level.vertices[junction]).toBeUndefined();
    expect(Object.keys(level.walls).length).toBe(before - 3);
  });

  it('computes wall end, perpendicular drag and kind defaults', () => {
    expect(endForLength({ x: 0, y: 0 }, { x: 0, y: 500 }, 3400)).toEqual({ x: 0, y: 3400 });
    near(perpendicularDelta({ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 300, y: 120 }), { x: 0, y: 120 });
    expect(wallKindDefaults('railing', 3000)).toEqual({ kind: 'railing', height: 1100, thickness: 60 });
    expect(wallKindDefaults('wall', 2850)).toEqual({ kind: 'wall', height: 2850, thickness: 160 });
  });
});

describe('rooms', () => {
  it('applies the default floor for a new type unless the user picked a finish', () => {
    const fresh = { type: 'other' as const, floorMaterial: 'floor.tile.white', wallMaterial: undefined };
    expect(roomTypePatch(fresh, 'bedroom')).toEqual({ type: 'bedroom', floorMaterial: 'floor.oak' });
    expect(roomTypePatch(fresh, 'bathroom')).toEqual({ type: 'bathroom', floorMaterial: 'floor.tile.antiskid', wallMaterial: 'wall.tile.white' });
    const picked = { type: 'bedroom' as const, floorMaterial: 'floor.marble', wallMaterial: 'wall.paint.sage' };
    expect(roomTypePatch(picked, 'kitchen')).toEqual({ type: 'kitchen' });
    const bath = { type: 'bathroom' as const, floorMaterial: 'floor.tile.antiskid', wallMaterial: 'wall.tile.white' };
    expect(roomTypePatch(bath, 'study')).toEqual({ type: 'study', floorMaterial: 'floor.oak', wallMaterial: 'wall.paint.white' });
  });

  it('totals rooms and clear floor area', () => {
    const totals = levelTotals(createSampleLevel());
    expect(totals.rooms).toBe(10);
    expect(totals.walls).toBeGreaterThan(15);
    expect(totals.area / 1e6).toBeGreaterThan(95);
    expect(totals.area / 1e6).toBeLessThan(12 * 9 + 5 * 1.5);
  });
});

describe('underlay helpers', () => {
  it('builds a deterministic synthetic underlay of the requested size', () => {
    const u = makeSyntheticUnderlay({ segments: 30000, rect: [14000, 1000, 18000, 4000] });
    expect(u.segments.length).toBe(30000 * 4);
    expect(Array.from(u.snapPoints.slice(0, 8))).toEqual([14000, 1000, 18000, 1000, 18000, 4000, 14000, 4000]);
    expect(Array.from(makeSyntheticUnderlay({ segments: 30000 }).segments.slice(400, 420))).toEqual(Array.from(u.segments.slice(400, 420)));
    const b = underlayBounds(u)!;
    expect(b.maxX).toBeGreaterThanOrEqual(18000);
    expect(b.minY).toBeLessThanOrEqual(1000);
    expect(underlayBounds(u, 0.5)!.maxX).toBeCloseTo(b.maxX / 2, 3);
    expect(underlayBounds({ segments: new Float32Array(), snapPoints: new Float32Array() })).toBeNull();
  });

  it('scales snap points, reusing the array at factor 1', () => {
    const pts = new Float32Array([1000, 2000, -500, 40]);
    expect(scalePoints(pts, 1)).toBe(pts);
    expect(Array.from(scalePoints(pts, 0.5))).toEqual([500, 1000, -250, 20]);
  });
});
