/**
 * Golden tests on real drawings in `fixtures/local/` (git-ignored, third-party).
 * Nothing about those drawings is written here: expectations come from the
 * `<name>.vision.json` next to each PDF and from the PDF's own title block.
 * The whole file skips when the folder has no PDFs.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveRooms, validateLevel, VisionResultSchema, type VisionResult } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { importPdfDetailed, type ImportDetail } from '../src/index';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/local');
const pdfs: string[] = existsSync(dir) ? (readdirSync(dir) as string[]).filter((f) => f.toLowerCase().endsWith('.pdf')).sort() : [];
const visionPath = (pdf: string) => join(dir, pdf.replace(/\.pdf$/i, '.vision.json'));
const labelled = pdfs.filter((f) => existsSync(visionPath(f)));
const mirrors = pdfs.filter((f) => f.includes('TYPE-1') && pdfs.includes(f.replace('TYPE-1', 'TYPE-2')));

const cache = new Map<string, Promise<ImportDetail>>();
function run(pdf: string, withVision: boolean): Promise<ImportDetail> {
  const key = `${pdf}|${withVision}`;
  let hit = cache.get(key);
  if (!hit) {
    const buf = readFileSync(join(dir, pdf));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const vision: VisionResult | null = withVision ? VisionResultSchema.parse(JSON.parse(readFileSync(visionPath(pdf), 'utf8'))) : null;
    hit = importPdfDetailed(data, { vision, fileName: pdf });
    cache.set(key, hit);
  }
  return hit;
}

/** Carpet area in m2 from the sheet's own area table: the first number on the "CA" row. */
function carpetArea(detail: ImportDetail): number | null {
  const texts = detail.extracted.texts;
  const ca = texts.find((t) => t.str.trim() === 'CA');
  if (!ca) return null;
  const row = texts
    .filter((t) => Math.abs(t.y - ca.y) < 8 && t.x > ca.x && /^\d+(\.\d+)?$/.test(t.str.trim()))
    .sort((a, b) => a.x - b.x);
  return row.length ? Number(row[0]!.str) : null;
}

const areas = (detail: ImportDetail): number[] =>
  deriveRooms(detail.draft.level)
    .map((g) => g.interiorArea / 1e6)
    .sort((a, b) => a - b);

describe.skipIf(pdfs.length === 0)('local PDFs', () => {
  for (const pdf of pdfs) it(`${pdf} imports to a valid plan without the AI result`, async () => {
    const detail = await run(pdf, false);
    const level = detail.draft.level;
    expect(detail.mode).not.toBe('none');
    expect(Object.keys(level.rooms).length).toBeGreaterThanOrEqual(4);
    expect(Object.values(level.openings).some((o) => o.kind === 'door')).toBe(true);
    expect(validateLevel(level).filter((i) => i.severity === 'error')).toEqual([]);
    expect(detail.draft.underlay.segments.length).toBeGreaterThan(1000);
    // The lower-left of the plan is the origin.
    const xs = Object.values(level.vertices).map((v) => v.x);
    const ys = Object.values(level.vertices).map((v) => v.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...xs)).toBeLessThan(400);
    expect(Math.min(...ys)).toBeLessThan(400);
  });

  for (const pdf of labelled) it(`${pdf}: labelled rooms are closed, named and to size`, async () => {
    const detail = await run(pdf, true);
    const { draft, checks } = detail;
    // Every label lands in a closed room.
    expect(checks.filter((c) => !c.roomId).map((c) => c.name)).toEqual([]);
    // Each closed room carries the name of one of its labels.
    const names = new Set(Object.values(draft.level.rooms).map((r) => r.name));
    const own = checks.filter((c) => !c.sharedWith);
    for (const c of own) expect(names.has(c.name), c.name).toBe(true);
    // Rooms with walls all round match their labelled size; allow the odd shaft the drawing leaves ambiguous.
    const wrong = own.filter((c) => !c.ok).map((c) => `${c.name} ${c.labelled?.join('x')} vs ${c.bbox?.join('x')}`);
    expect(wrong.length, wrong.join('; ')).toBeLessThanOrEqual(1);
    expect(own.length).toBeGreaterThanOrEqual(0.9 * checks.length);
  });

  for (const pdf of labelled) it(`${pdf}: scale comes from the dimensions and agrees with the wall thickness`, async () => {
    const detail = await run(pdf, true);
    const c = detail.scaleCandidates;
    expect(detail.draft.scale.source).toBe('dimension');
    expect(c.dimension).not.toBeNull();
    expect(c.wallThickness).not.toBeNull();
    expect(Math.abs(c.dimension! - c.wallThickness!) / c.dimension!).toBeLessThan(0.005);
    if (c.titleBlock && Math.abs(c.titleBlock - c.dimension!) / c.dimension! > 0.012) {
      expect(detail.draft.issues.some((i) => i.code === 'scale-disagreement')).toBe(true);
    }
  });

  for (const pdf of labelled) it(`${pdf}: every room can be entered and balconies have a wide opening`, async () => {
    const { draft } = await run(pdf, true);
    const level = draft.level;
    const byWall = new Map<string, string[]>();
    for (const o of Object.values(level.openings)) byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o.kind]);
    for (const g of deriveRooms(level)) {
      const room = g.roomId ? level.rooms[g.roomId] : undefined;
      if (!room || /^(Shaft|Store|Room)/.test(room.name)) continue;
      const kinds = g.edgeWalls.flatMap((id) => byWall.get(id) ?? []);
      // A room is entered through a door, sliding door or passage, or across an open-plan divider.
      const open = g.edgeWalls.some((id) => level.walls[id]?.kind === 'divider');
      expect(open || kinds.some((k) => k !== 'window'), `${room.name} has no way in`).toBe(true);
      if (room.type === 'bedroom') expect(kinds.some((k) => k === 'window' || k === 'sliding'), `${room.name} has no daylight`).toBe(true);
      if (room.type === 'balcony') expect(kinds.some((k) => k === 'sliding' || k === 'door'), `${room.name} has no door`).toBe(true);
    }
  });

  for (const pdf of labelled) it(`${pdf}: interior area is close to the carpet area on the sheet`, async () => {
    const detail = await run(pdf, true);
    const carpet = carpetArea(detail);
    if (carpet === null) return;
    const level = detail.draft.level;
    const sum = deriveRooms(level)
      .filter((g) => {
        const type = g.roomId ? level.rooms[g.roomId]?.type : undefined;
        return type !== 'balcony' && type !== 'utility';
      })
      .reduce((s, g) => s + g.interiorArea / 1e6, 0);
    // Carpet area counts internal partitions; the clear floor does not, so it sits a few percent under.
    expect(sum / carpet).toBeGreaterThan(0.93);
    expect(sum / carpet).toBeLessThan(1.03);
  });

  for (const pdf of mirrors) it(`${pdf} and its mirror give the same rooms`, async () => {
    const a = areas(await run(pdf, false));
    const b = areas(await run(pdf.replace('TYPE-1', 'TYPE-2'), false));
    expect(b.length).toBe(a.length);
    a.forEach((area, i) => expect(Math.abs(b[i]! - area), `room ${i}: ${area} vs ${b[i]}`).toBeLessThanOrEqual(Math.max(0.1, 0.025 * area)));
  });
});
