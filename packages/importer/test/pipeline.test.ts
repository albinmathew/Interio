import { deriveRooms, validateLevel } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { ImportError, importExtracted, importPdf } from '../src/index';
import { MM_PER_UNIT, syntheticPlan, syntheticVision } from './synthetic';

const roomByName = (detail: ReturnType<typeof importExtracted>, name: string) => {
  const level = detail.draft.level;
  const room = Object.values(level.rooms).find((r) => r.name === name);
  const geom = room ? deriveRooms(level).find((g) => g.roomId === room.id) : undefined;
  return { room, geom };
};

describe('importExtracted on a synthetic plan', () => {
  const detail = importExtracted(syntheticPlan(), { vision: syntheticVision(), fileName: 'flat.pdf' });
  const { draft } = detail;
  const level = draft.level;

  it('uses the layers and calibrates on the labelled dimensions', () => {
    expect(detail.mode).toBe('layers');
    expect(draft.scale.source).toBe('dimension');
    expect(draft.scale.mmPerPdfUnit).toBeCloseTo(MM_PER_UNIT, 2);
    expect(detail.scaleCandidates.wallThickness).toBeCloseTo(MM_PER_UNIT, 2);
    // The title block says 1:50 (17.64 mm per unit): the disagreement is reported.
    expect(draft.scale.spreadPct).toBeGreaterThan(1);
    expect(draft.issues.some((i) => i.code === 'scale-disagreement')).toBe(true);
  });

  it('closes and names every labelled room at its labelled size', () => {
    expect(Object.keys(level.rooms)).toHaveLength(3);
    for (const [name, w, d] of [
      ['Master Bedroom', 3000, 4000],
      ['Living Room', 3000, 4000],
    ] as const) {
      const { room, geom } = roomByName(detail, name);
      expect(room, name).toBeDefined();
      expect(Math.abs(geom!.width - w)).toBeLessThanOrEqual(10);
      expect(Math.abs(geom!.depth - d)).toBeLessThanOrEqual(10);
    }
    const balcony = roomByName(detail, 'Sit-out');
    expect(balcony.room?.type).toBe('balcony');
    expect(Math.abs(balcony.geom!.depth - 1140)).toBeLessThanOrEqual(40);
    expect(detail.checks.every((c) => c.ok)).toBe(true);
  });

  it('puts the plan origin at its lower-left and keeps the graph valid', () => {
    const xs = Object.values(level.vertices).map((v) => v.x);
    const ys = Object.values(level.vertices).map((v) => v.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...ys)).toBeLessThan(200);
    expect(validateLevel(level).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('gives each wall its drawn thickness and kind', () => {
    const kinds = Object.values(level.walls).map((w) => w.kind);
    expect(kinds).toContain('railing');
    expect(Object.values(level.walls).filter((w) => w.kind === 'wall').every((w) => w.thickness === 160)).toBe(true);
    // Furniture never becomes a wall: the bedroom stays a plain rectangle.
    const { geom } = roomByName(detail, 'Master Bedroom');
    expect(geom!.interiorArea / 1e6).toBeCloseTo(12, 0);
    expect(Object.values(level.walls).filter((w) => w.kind === 'wall').length).toBeLessThan(20);
  });

  it('finds the door with hinge and swing, the window, and the sliding door', () => {
    const openings = Object.values(level.openings);
    expect(openings.map((o) => o.kind).sort()).toEqual(['door', 'sliding', 'window']);

    const door = openings.find((o) => o.kind === 'door')!;
    expect(door.width).toBe(900);
    expect(door.tag).toBe('D1');
    const wall = level.walls[door.wallId]!;
    const a = level.vertices[wall.a]!;
    const b = level.vertices[wall.b]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const centre = { x: a.x + dir.x * door.offset, y: a.y + dir.y * door.offset };
    // Partition centreline x = 3240, door from y = 500 to 1400. The plan origin is the
    // lower-left of everything built, and the balcony hangs 1200 below the bottom wall.
    const below = 1200;
    expect(centre.x).toBeCloseTo(3240, -1);
    expect(centre.y).toBeCloseTo(950 + below, -1);
    const hingeY = centre.y + (door.hinge === 'a' ? -1 : 1) * dir.y * (door.width / 2);
    expect(hingeY).toBeCloseTo(500 + below, -1);
    // Swings into the living room (+x): the wall's left normal is (-dir.y, dir.x).
    expect(-dir.y * door.swing!).toBeGreaterThan(0);

    const win = openings.find((o) => o.kind === 'window')!;
    expect(win.width).toBe(1200);
    expect(win.sill).toBeGreaterThan(0);
    const slide = openings.find((o) => o.kind === 'sliding')!;
    expect(slide.width).toBe(2000);
    expect(slide.sill).toBe(0);
  });

  it('fills layers, confidence, underlay and source', () => {
    expect(draft.layers.find((l) => l.name === 'FLAT$0$A-WALL-160')).toMatchObject({ role: 'wall', segments: 32 });
    expect(draft.layers.find((l) => l.name === 'A-FURNITURE')?.role).toBe('furniture');
    expect(Object.keys(draft.confidence).length).toBeGreaterThan(10);
    expect(Object.values(draft.confidence).every((c) => c > 0 && c <= 1)).toBe(true);
    expect(draft.underlay.segments.length % 4).toBe(0);
    expect(draft.underlay.segments.length).toBeGreaterThan(4 * 40);
    expect(draft.underlay.snapPoints.length).toBeGreaterThan(20);
    expect(draft.underlay.image).toBeUndefined();
    expect(draft.source).toMatchObject({ fileName: 'flat.pdf' });
    expect(draft.source.mmPerPdfUnit).toBeCloseTo(MM_PER_UNIT, 2);
    expect(draft.suggestedItems).toEqual([]);
  });

  it('gives the same rooms for a mirrored drawing', () => {
    const mirrored = importExtracted(syntheticPlan({ mirror: true }), { vision: syntheticVision(true) });
    const areas = (d: typeof detail) =>
      deriveRooms(d.draft.level)
        .map((g) => Math.round(g.interiorArea / 1e4))
        .sort((x, y) => x - y);
    expect(areas(mirrored)).toEqual(areas(detail));
    expect(Object.values(mirrored.draft.level.rooms).map((r) => r.name).sort()).toEqual(Object.values(level.rooms).map((r) => r.name).sort());
  });
});

describe('importExtracted options and degraded inputs', () => {
  it('guesses room types without the AI result', () => {
    const { draft } = importExtracted(syntheticPlan());
    expect(draft.scale.source).toBe('wallThickness');
    expect(draft.scale.mmPerPdfUnit).toBeCloseTo(MM_PER_UNIT, 2);
    const types = Object.values(draft.level.rooms).map((r) => r.type).sort();
    expect(types).toEqual(['balcony', 'bedroom', 'living']);
    expect(draft.issues.some((i) => i.code === 'vector-only')).toBe(true);
  });

  it('lets the user override the scale and the layer roles', () => {
    const scaled = importExtracted(syntheticPlan(), { mmPerPdfUnit: 10 });
    expect(scaled.draft.scale).toMatchObject({ source: 'user', mmPerPdfUnit: 10 });
    const width = Math.max(...Object.values(scaled.draft.level.vertices).map((v) => v.x));
    expect(width).toBeCloseTo(3200, -2);

    const noRail = importExtracted(syntheticPlan(), { roleOverrides: { 'A-RAILING': 'ignore' } });
    expect(Object.keys(noRail.draft.level.rooms)).toHaveLength(2);
    expect(noRail.draft.layers.find((l) => l.name === 'A-RAILING')?.role).toBe('ignore');
  });

  it('falls back to line weight when the PDF has no layers', () => {
    const detail = importExtracted(syntheticPlan({ flat: true }));
    expect(detail.mode).toBe('weights');
    expect(detail.draft.issues.some((i) => i.code === 'no-layers')).toBe(true);
    expect(Object.keys(detail.draft.level.rooms).length).toBeGreaterThanOrEqual(2);
    const kinds = Object.values(detail.draft.level.openings).map((o) => o.kind);
    expect(kinds).toContain('door');
  });

  it('returns an empty level for a page with no vectors', () => {
    const scan = { width: 600, height: 800, layers: [''], segs: [], curves: [], paths: [], texts: [], pageCount: 1 };
    const { draft, mode } = importExtracted(scan, { fileName: 'scan.pdf' });
    expect(mode).toBe('none');
    expect(Object.keys(draft.level.walls)).toHaveLength(0);
    expect(Object.keys(draft.level.rooms)).toHaveLength(0);
    expect(draft.issues.find((i) => i.code === 'no-vectors')?.message).toMatch(/trace/i);
    expect(draft.scale.mmPerPdfUnit).toBeGreaterThan(0);
  });

  it('throws ImportError only for unreadable files', async () => {
    const junk = new TextEncoder().encode('this is not a pdf at all').buffer as ArrayBuffer;
    await expect(importPdf(junk)).rejects.toBeInstanceOf(ImportError);
    await expect(importPdf(junk)).rejects.toMatchObject({ code: 'not-a-pdf' });
    const broken = new TextEncoder().encode('%PDF-1.7\nnothing useful here').buffer as ArrayBuffer;
    await expect(importPdf(broken)).rejects.toBeInstanceOf(ImportError);
  });
});
