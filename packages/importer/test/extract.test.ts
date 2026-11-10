/**
 * Extraction against small PDFs written by hand in this file: nested `cm`
 * transforms, optional-content layers, line widths, and the degraded inputs.
 */
import { describe, expect, it } from 'vitest';
import { ImportError, extractPage, importPdf, renderPdfPage } from '../src/index';

/** Builds a one-page PDF with two optional-content groups from a content stream. */
function makePdf(content: string, opts: { rotate?: number } = {}): ArrayBuffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /Order [5 0 R 6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] ${opts.rotate ? `/Rotate ${opts.rotate} ` : ''}/Contents 4 0 R /Resources << /Properties << /oc1 5 0 R /oc2 6 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /OCG /Name (FLAT$0$A-WALL-160) >>',
    '<< /Type /OCG /Name (A-DOOR) >>',
  ];
  let body = '%PDF-1.5\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body).buffer as ArrayBuffer;
}

const CONTENT = [
  'q 0.5 0 0 0.5 10 20 cm',
  '/OC /oc1 BDC',
  '2 w',
  '0 0 m 100 0 l 100 8 l 0 8 l h S',
  'EMC',
  'q 1 0 0 1 0 50 cm',
  '/OC /oc2 BDC',
  '0.5 w',
  '0 0 m 40 0 l S',
  '0 0 m 0 22 22 40 40 40 c S',
  'EMC',
  'Q',
  '0 0 30 30 re S',
  'Q',
  '150 10 m 190 10 l S',
].join('\n');

describe('extractPage', () => {
  it('applies the transform stack and keeps layer, width and path', async () => {
    const ex = await extractPage(makePdf(CONTENT));
    expect([ex.width, ex.height]).toEqual([200, 100]);
    expect(ex.layers).toEqual(['', 'FLAT$0$A-WALL-160', 'A-DOOR']);

    const wall = ex.segs.filter((s) => s.layer === 1);
    expect(wall).toHaveLength(4);
    expect(new Set(wall.map((s) => s.path)).size).toBe(1);
    expect(wall[0]).toMatchObject({ x1: 10, y1: 20, x2: 60, y2: 20 });
    expect(wall[3]).toMatchObject({ x1: 10, y1: 24, x2: 10, y2: 20 });
    expect(wall.every((s) => Math.abs(s.width - 1) < 1e-6)).toBe(true);
    expect(ex.paths[wall[0]!.path]).toMatchObject({ closed: true, stroked: true, lines: 4 });

    // Nested cm: (0,50) inside the 0.5 scale lands at (10, 45).
    const door = ex.segs.filter((s) => s.layer === 2);
    expect(door).toHaveLength(1);
    expect(door[0]).toMatchObject({ x1: 10, y1: 45, x2: 30, y2: 45 });
    expect(door[0]!.width).toBeCloseTo(0.25);
    expect(ex.curves).toHaveLength(1);
    expect(ex.curves[0]!.layer).toBe(2);
    expect(Array.from(ex.curves[0]!.p)).toEqual([10, 45, 10, 56, 21, 65, 30, 65]);

    // After Q the inner transform and the layer are gone, the outer scale is still on.
    const rect = ex.segs.filter((s) => s.layer === 0 && s.x1 < 100);
    expect(rect).toHaveLength(4);
    expect(Math.max(...rect.map((s) => Math.max(s.x1, s.x2)))).toBe(25);
    expect(Math.max(...rect.map((s) => Math.max(s.y1, s.y2)))).toBe(35);

    // After the last Q everything is back to page space and the default width.
    const loose = ex.segs.find((s) => s.x1 === 150)!;
    expect(loose).toMatchObject({ y1: 10, x2: 190, y2: 10, layer: 0, width: 1 });
  });

  it('reports geometry in the displayed frame of a rotated page', async () => {
    const ex = await extractPage(makePdf('150 10 m 190 10 l S', { rotate: 90 }));
    expect([ex.width, ex.height]).toEqual([100, 200]);
    const [seg] = ex.segs;
    // Rotated a quarter turn clockwise: the line near the right edge now runs down the page.
    expect(Math.abs(seg!.x1 - seg!.x2)).toBeLessThan(1e-6);
    expect(Math.abs(seg!.y1 - seg!.y2)).toBeCloseTo(40);
    expect(ex.userFromPage).toBeDefined();
  });
});

describe('importPdf on degraded files', () => {
  it('returns an empty level and a tracing hint for a page without vectors', async () => {
    const draft = await importPdf(makePdf('q Q'), { fileName: 'scan.pdf' });
    expect(Object.keys(draft.level.walls)).toHaveLength(0);
    expect(draft.issues.map((i) => i.code)).toContain('no-vectors');
    expect(draft.source.fileName).toBe('scan.pdf');
    expect(draft.underlay.segments).toHaveLength(0);
  });

  it('never throws on a drawing it cannot make sense of', async () => {
    const draft = await importPdf(makePdf(CONTENT));
    expect(draft.level).toBeDefined();
    expect(draft.issues.length).toBeGreaterThan(0);
    expect(Object.keys(draft.level.rooms)).toHaveLength(0);
  });

  it('renders a page to PNG, or fails with ImportError where no canvas exists', async () => {
    try {
      const blob = await renderPdfPage(makePdf(CONTENT), 400);
      expect(blob.type).toBe('image/png');
      const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 4);
      expect(Array.from(head)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
    }
  });
});
