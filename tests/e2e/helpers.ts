import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the dashboard and creates a project from the sample home. Lands in Design mode. */
export async function openSample(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('start-sample').click();
  await page.waitForURL(/\/p\/[^/]+\/design$/);
  return page.url().match(/\/p\/([^/]+)\//)![1]!;
}

export async function gotoMode(page: Page, mode: 'plan' | 'design' | 'walk'): Promise<void> {
  await page.getByRole('tab', { name: new RegExp(`^${mode}$`, 'i') }).click();
  await page.waitForURL(new RegExp(`/${mode}$`));
  await expect(page.getByTestId(`feature-${mode}`)).toBeVisible();
}

/**
 * Asserts a WebGL canvas has actually drawn a scene: it is sized to its container
 * and its screenshot contains a healthy number of distinct colours.
 */
export async function expectCanvasRendered(canvas: Locator, minColours = 12): Promise<void> {
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(600);
  await expect
    .poll(
      async () => {
        const png = await canvas.screenshot();
        return canvas.page().evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 160;
          c.height = 100;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set<number>();
          for (let i = 0; i < d.length; i += 4) seen.add(((d[i]! >> 4) << 8) | ((d[i + 1]! >> 4) << 4) | (d[i + 2]! >> 4));
          return seen.size;
        }, png.toString('base64'));
      },
      // CI rasterises WebGL in software on two cores: one capture of a continuously
      // drawing walk view can take most of the old 20 s budget there.
      { timeout: process.env.CI ? 90_000 : 20_000 },
    )
    .toBeGreaterThan(minColours);
}

/**
 * Walk mode is drawn: a live, non-blank view. Interior views of an unfurnished home
 * (a corridor, a bare wall) legitimately show only a few colours, especially with the
 * reduced quality software renderers get on CI, so this checks for a drawn frame rather
 * than a busy one.
 */
export async function expectWalkRendered(canvas: Locator): Promise<void> {
  await expectCanvasRendered(canvas, 4);
}

/** Waits until autosave has written the project. */
export async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}

/** Collects uncaught page errors; assert the returned list is empty at the end of a test. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** The newest toast on screen. */
export const toastMessage = (page: Page): Locator => page.getByTestId('toast').last();

/** Drops files on the page the way a drag from the desktop does. */
export async function dropFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[], selector = 'body'): Promise<void> {
  const transfer = await page.evaluateHandle(
    (list) => {
      const dt = new DataTransfer();
      for (const f of list) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.mimeType }));
      }
      return dt;
    },
    files.map((f) => ({ name: f.name, mimeType: f.mimeType, base64: f.buffer.toString('base64') })),
  );
  await page.dispatchEvent(selector, 'dragenter', { dataTransfer: transfer });
  await page.dispatchEvent(selector, 'dragover', { dataTransfer: transfer });
  await page.dispatchEvent(selector, 'drop', { dataTransfer: transfer });
}

/* ------------------------------------------------------------- dev hooks */

/** Mirrors `window.__interioWalk` (apps/web/src/features/walkthrough/index.tsx). */
export interface TourState {
  status: 'idle' | 'playing' | 'paused' | 'ended';
  index: number;
  total: number;
  phase: string | null;
  roomId: string | null;
  visited: string[];
}

export interface StoredLevel {
  rooms: Record<string, { id: string; name: string; type: string }>;
  items: Record<string, { id: string; catalogId: string; roomId?: string }>;
  walls: Record<string, unknown>;
  openings: Record<string, unknown>;
  vertices: Record<string, unknown>;
}
export interface StoredProject {
  id: string;
  name: string;
  levels: StoredLevel[];
}
type DevWindow = Window & {
  __interio?: {
    ready: boolean;
    store: { getState(): { project: StoredProject | null } };
    project(x: number, y: number, z?: number): { x: number; y: number };
    stats(): { calls: number; triangles: number };
  };
  __interioWalk?: { startTour(opts?: { speed?: number }): boolean; tourState(): TourState; getState(): { roomId: string | null } };
};

/** Waits for the Design view's dev hook and a drawn canvas. */
export async function designReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as DevWindow).__interio?.ready === true);
  await expectCanvasRendered(page.locator('canvas'));
}

/** The open project as the plan store holds it (Design mode must be showing). */
export const openProjectState = (page: Page): Promise<StoredProject> => page.evaluate(() => (window as DevWindow).__interio!.store.getState().project!);

/** Clicks a plan point (mm) in Plan mode, using the camera the editor publishes on its canvas. */
export async function clickPlan2d(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!;
  const [scale, tx, ty] = await Promise.all(['data-scale', 'data-tx', 'data-ty'].map(async (name) => Number(await canvas.getAttribute(name))));
  const px = box.x + tx! + x * scale!;
  const py = box.y + ty! - y * scale!;
  await page.mouse.move(px, py, { steps: 3 });
  await page.mouse.click(px, py);
}

/** Clicks a plan point (mm) on the floor in Design mode. */
export async function clickPlan3d(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(([px, py]) => (window as DevWindow).__interio!.project(px!, py!), [x, y]);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

/** A project record straight from IndexedDB, or null when it is not there. */
export function storedProject(page: Page, projectId: string): Promise<StoredProject | null> {
  return page.evaluate(
    (id) =>
      new Promise<StoredProject | null>((resolve, reject) => {
        const open = indexedDB.open('interio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects').objectStore('projects').get(id);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve((get.result as StoredProject | undefined) ?? null);
        };
      }),
    projectId,
  );
}

/** What is stored next to a project: the kind and size of its underlay and source PDF. */
export function storedAssets(page: Page, projectId: string): Promise<{ underlaySegments: number; snapPoints: number; imageBytes: number; imageType: string; pdfBytes: number; pdfType: string }> {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('interio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('assets').objectStore('assets');
          const underlay = store.get(`${id}/underlay`);
          const pdf = store.get(`${id}/pdf`);
          pdf.onerror = () => reject(pdf.error);
          pdf.onsuccess = () => {
            const u = underlay.result as { segments?: Float32Array; snapPoints?: Float32Array; image?: { blob: Blob } } | undefined;
            const p = pdf.result as Blob | undefined;
            resolve({
              underlaySegments: u?.segments instanceof Float32Array ? u.segments.length / 4 : -1,
              snapPoints: u?.snapPoints instanceof Float32Array ? u.snapPoints.length / 2 : -1,
              imageBytes: u?.image?.blob.size ?? 0,
              imageType: u?.image?.blob.type ?? '',
              pdfBytes: p instanceof Blob ? p.size : 0,
              pdfType: p instanceof Blob ? p.type : '',
            });
          };
        };
      }),
    projectId,
  );
}

/** The id of the project in the address bar. */
export const projectIdOf = (page: Page): string => page.url().match(/\/p\/([^/]+)\//)![1]!;

/**
 * Runs the guided tour at a high speed and waits for it to end. Returns the rooms
 * it visited and the ids of every room in the Walk mode room list.
 */
export async function runTour(page: Page, speed = 16, timeout = 240_000): Promise<{ visited: string[]; rooms: string[] }> {
  await page.waitForFunction(() => (window as DevWindow).__interioWalk !== undefined);
  const rooms = await page.getByTestId('walk-room-item').evaluateAll((els) => els.map((el) => el.getAttribute('data-room-id')!));
  expect(await page.evaluate((s) => (window as DevWindow).__interioWalk!.startTour({ speed: s }), speed)).toBe(true);
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => ({ tour: (window as DevWindow).__interioWalk!.tourState(), roomId: (window as DevWindow).__interioWalk!.getState().roomId }));
        expect(state.roomId, 'the tour camera is always in a room').not.toBeNull();
        return state.tour.status;
      },
      { timeout, intervals: [200] },
    )
    .toBe('ended');
  const end = await page.evaluate(() => (window as DevWindow).__interioWalk!.tourState());
  return { visited: end.visited, rooms };
}

/* ------------------------------------------------------------------ PDFs */
/*
 * Hand-built PDFs, so the import wizard can be tested without the real drawings
 * in `fixtures/local`: a small CAD-style plan with layers, a multi-page set, a
 * scan (one picture, no line work), an encrypted file and a damaged one.
 */

export interface PdfLayer {
  /** Optional-content group name, as CAD exports write it. Empty for content outside any layer. */
  name: string;
  /** Content-stream operators. */
  content: string;
}

export interface PdfPageSpec {
  width: number;
  height: number;
  layers: PdfLayer[];
}

const pdfString = (text: string): string => `(${text.replace(/([\\()])/g, '\\$1')})`;

/** Serialises pages to a PDF 1.5 file with a classic cross-reference table. */
export function makePdf(pages: PdfPageSpec[], opts: { encrypted?: boolean } = {}): Buffer {
  const names = [...new Set(pages.flatMap((p) => p.layers.map((l) => l.name)).filter(Boolean))];
  const pageObj = (i: number) => 3 + 2 * i;
  const ocgObj = (name: string) => 3 + 2 * pages.length + names.indexOf(name);
  const ocgRefs = names.map((n) => `${ocgObj(n)} 0 R`).join(' ');
  const objects: string[] = [];
  objects.push(`<< /Type /Catalog /Pages 2 0 R${names.length ? ` /OCProperties << /OCGs [${ocgRefs}] /D << /Order [${ocgRefs}] /ON [${ocgRefs}] >> >>` : ''} >>`);
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page, i) => {
    const used = [...new Set(page.layers.map((l) => l.name).filter(Boolean))];
    const properties = used.map((n) => `/L${names.indexOf(n)} ${ocgObj(n)} 0 R`).join(' ');
    const stream = page.layers.map((l) => (l.name ? `/OC /L${names.indexOf(l.name)} BDC\n${l.content}\nEMC` : l.content)).join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${pageObj(i) + 1} 0 R /Resources << ${properties ? `/Properties << ${properties} >> ` : ''}>> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  for (const name of names) objects.push(`<< /Type /OCG /Name ${pdfString(name)} >>`);
  let trailer = '';
  if (opts.encrypted) {
    // A standard security handler whose password check can never pass: the file asks for a password.
    const hex = (seed: number) => Array.from({ length: 32 }, (_, i) => ((i * 37 + seed) & 255).toString(16).padStart(2, '0')).join('');
    objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${hex(1)}> /U <${hex(9)}> /P -44 >>`);
    trailer = ` /Encrypt ${objects.length} 0 R /ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]`;
  }
  let body = '%PDF-1.5\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/**
 * A small flat drawn the way CAD exports draw it, 1 PDF unit = 20 mm: closed wall
 * outlines 160 mm thick, window lines across the gaps, a door leaf with its swing
 * arc, a double-line balcony railing and a bed. `studio` leaves out the partition
 * and its door, so the page has one room fewer. `doorless` keeps the partition but
 * draws no door in its gap, which the importer reads as an open passage it is unsure of.
 *
 * Clear sizes: bedroom 3000 x 4000, living room 3000 x 4000, balcony below it.
 */
export function planPage(opts: { studio?: boolean; doorless?: boolean } = {}): PdfPageSpec {
  const ux = (mm: number) => (60 + mm / 20).toFixed(2);
  const uy = (mm: number) => (100 + mm / 20).toFixed(2);
  const rect = (x1: number, y1: number, x2: number, y2: number) => `${ux(x1)} ${uy(y1)} m ${ux(x2)} ${uy(y1)} l ${ux(x2)} ${uy(y2)} l ${ux(x1)} ${uy(y2)} l h S`;
  const line = (x1: number, y1: number, x2: number, y2: number) => `${ux(x1)} ${uy(y1)} m ${ux(x2)} ${uy(y2)} l S`;

  const walls = [
    // Outer walls. The left wall has a window (y 1500..2700), the bottom wall a sliding door (x 3800..5800).
    rect(0, 4160, 6480, 4320),
    rect(0, 0, 3800, 160),
    rect(5800, 0, 6480, 160),
    rect(0, 160, 160, 1500),
    rect(0, 2700, 160, 4160),
    rect(6320, 160, 6480, 4160),
  ];
  // Partition with a door gap (y 500..1400).
  if (!opts.studio) walls.push(rect(3160, 160, 3320, 500), rect(3160, 1400, 3320, 4160));

  const windows = [...[0, 80, 160].map((x) => line(x, 1500, x, 2700)), ...[0, 80, 160].map((y) => line(3800, y, 5800, y))];

  // Door: hinge at the lower jamb, leaf open towards +x, quarter-circle swing.
  const hinge = { x: 3240, y: 500 };
  const R = 900;
  const k = 0.5522847498 * R;
  const door = [
    line(hinge.x, hinge.y, hinge.x + R, hinge.y),
    `${ux(hinge.x + R)} ${uy(hinge.y)} m ${ux(hinge.x + R)} ${uy(hinge.y + k)} ${ux(hinge.x + k)} ${uy(hinge.y + R)} ${ux(hinge.x)} ${uy(hinge.y + R)} c S`,
  ];

  const railing = [...[3600, 3660].map((x) => line(x, -1200, x, 0)), ...[6200, 6260].map((x) => line(x, -1200, x, 0)), ...[-1200, -1140].map((y) => line(3600, y, 6260, y))];

  const bed = [line(600, 2000, 2400, 2000), line(2400, 2000, 2400, 4000), line(2400, 4000, 600, 4000), line(600, 4000, 600, 2000), line(600, 3500, 2400, 3500)];

  const layers: PdfLayer[] = [
    { name: 'FLAT$0$A-WALL-160', content: `0.57 w\n${walls.join('\n')}` },
    { name: 'FLAT$0$A-WINDOW', content: `0.14 w\n${windows.join('\n')}` },
    { name: 'A-RAILING', content: `0.14 w\n${railing.join('\n')}` },
    { name: 'A-FURNITURE', content: `0.14 w\n${bed.join('\n')}` },
  ];
  if (!opts.studio && !opts.doorless) layers.splice(2, 0, { name: 'FLAT$0$A-DOOR', content: `0.14 w\n${door.join('\n')}` });
  return { width: 500, height: 400, layers };
}

/** A one-page CAD-style plan: bedroom, living room and balcony. */
export const planPdf = (): Buffer => makePdf([planPage()]);

/** A page that is one picture and no line work: what a scanned plan looks like to the importer. */
export function scanPage(): PdfPageSpec {
  // A 4 x 4 grey checkerboard stretched over the page, as an inline image.
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 === 0 ? '30' : 'f0')).join(''));
  return { width: 400, height: 300, layers: [{ name: '', content: `q 400 0 0 300 0 0 cm\nBI /W 4 /H 4 /CS /G /BPC 8 /F /AHx ID\n${rows.join('')}>\nEI Q` }] };
}

export const scanPdf = (): Buffer => makePdf([scanPage()]);

/** A page with nothing on it. */
export const blankPage = (): PdfPageSpec => ({ width: 400, height: 300, layers: [{ name: '', content: 'q Q' }] });

/** A PDF that asks for a password. */
export const encryptedPdf = (): Buffer => makePdf([planPage()], { encrypted: true });

/** The first part of a real PDF: what an interrupted download leaves behind. */
export const truncatedPdf = (): Buffer => planPdf().subarray(0, 300);
