/**
 * Import wizard. The first group runs against a real drawing from
 * `fixtures/local/` (git-ignored) and skips when the folder has no PDF; nothing
 * about the drawing is hard-coded, and the AI reply, when mocked, comes from the
 * `.vision.json` next to the PDF. The second group runs everywhere, on PDFs
 * built by `helpers.ts`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  blankPage,
  designReady,
  dropFiles,
  encryptedPdf,
  makePdf,
  planPage,
  planPdf,
  projectIdOf,
  scanPdf,
  storedAssets,
  storedProject,
  toastMessage,
  trackPageErrors,
  truncatedPdf,
} from './helpers';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/local');
const pdfs = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort() : [];
const withVision = pdfs.find((f) => existsSync(join(dir, f.replace(/\.pdf$/i, '.vision.json'))));
const pdf = withVision ?? pdfs[0];

const assistantOff = (page: Page) => page.route('**/api/analyze-plan', (route) => route.fulfill({ json: { available: false } }));
const upload = (page: Page, name: string, buffer: Buffer) => page.getByTestId('pdf-input').setInputFiles({ name, mimeType: 'application/pdf', buffer });
const review = (page: Page) => expect(page.getByTestId('import-review')).toBeVisible({ timeout: 45_000 });
const stat = async (page: Page, id: string) => Number(await page.getByTestId(id).textContent());

/**
 * What the assistant would read off the page drawn by `planPage` (1 unit = 20 mm,
 * origin at 60, 100 on a 500 x 400 page). The bedroom is labelled wider than it is drawn.
 */
const planVision = {
  rooms: [
    { name: 'Master Bedroom', type: 'bedroom', labelPoint: { x: 143 / 500, y: 1 - 160 / 400 }, dims: [3600, 4000] },
    { name: 'Living Room', type: 'living', labelPoint: { x: 301 / 500, y: 1 - 208 / 400 }, dims: [3000, 4000] },
    { name: 'Sit-out', type: 'balcony', labelPoint: { x: 305 / 500, y: 1 - 70 / 400 }, dims: [2540, 1140] },
  ],
  tags: [],
};

test.describe('import wizard', () => {
  test.skip(!pdf, 'no PDFs in fixtures/local');

  test('uploads a PDF, reviews it without the assistant and lands in Plan mode with rooms', async ({ page }) => {
    const errors = trackPageErrors(page);
    await assistantOff(page);

    await page.goto('/import');
    await page.getByTestId('pdf-input').setInputFiles(join(dir, pdf!));
    await review(page);

    // Vector-only: the wizard says so.
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('ai-status')).toContainText(/line work only/i);

    const rooms = await stat(page, 'room-count');
    expect(rooms).toBeGreaterThanOrEqual(4);
    expect(await stat(page, 'door-count')).toBeGreaterThan(0);
    await expect(page.getByTestId('import-preview').locator('[data-room]')).toHaveCount(rooms);
    await expect(page.getByTestId('layer-row').first()).toBeVisible();
    await expect(page.getByTestId('scale-estimate')).toContainText(/1 : \d/);
    // A single-page drawing has no page picker.
    await expect(page.getByTestId('page-picker')).toHaveCount(0);

    // Turning the wall layer off removes the rooms; turning it back on restores them.
    const wallRow = page.getByTestId('layer-row').filter({ has: page.locator('select', { has: page.locator('option[value="wall"]:checked') }) }).first();
    const layer = await wallRow.getAttribute('data-layer');
    const row = page.locator(`[data-testid="layer-row"][data-layer="${layer}"]`);
    await row.locator('select').selectOption('ignore');
    await expect(page.getByTestId('room-count')).not.toHaveText(String(rooms));
    await row.locator('select').selectOption('wall');
    await expect(page.getByTestId('room-count')).toHaveText(String(rooms));

    // A manual scale changes the sizes and can be dropped again.
    const before = await page.getByTestId('scale-estimate').getAttribute('data-mm-per-unit');
    await page.getByTestId('scale-override').fill('100');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('scale-estimate')).toContainText('1 : 100.0');
    await page.getByRole('button', { name: 'Automatic' }).click();
    await expect(page.getByTestId('scale-estimate')).toHaveAttribute('data-mm-per-unit', before!);

    // Elements the import is unsure about are marked on the plan and counted in the legend.
    const unsure = await page.getByTestId('import-preview').locator('[data-low-confidence]').count();
    await expect(page.getByTestId('legend-low-confidence')).toHaveAttribute('data-count', String(unsure));
    if (unsure > 0) {
      await page.locator('[data-code="low-confidence"]').getByTestId('issue-button').click();
      await expect(page.getByTestId('preview-highlight').locator('[data-highlight]')).toHaveCount(unsure);
      await page.getByTestId('preview-reset').click();
      await expect(page.getByTestId('import-preview')).toHaveAttribute('data-focused', 'false');
    }

    await page.getByLabel('Project name').fill('Imported flat');
    await page.getByTestId('create-project').click();
    await page.getByTestId('next-review').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('feature-plan')).toBeVisible();
    await expect(page.getByLabel('Project name')).toHaveValue('Imported flat');
    await expect(page.getByTestId('feature-plan').getByText(/Living|Bedroom/).first()).toBeVisible();
    await expect(page.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
    expect(errors).toEqual([]);
  });

  test('uses the room names from the assistant when it answers', async ({ page }) => {
    test.skip(!withVision, 'no .vision.json next to a PDF');
    const vision = JSON.parse(readFileSync(join(dir, withVision!.replace(/\.pdf$/i, '.vision.json')), 'utf8'));
    let request: { image?: string; mediaType?: string; fileName?: string } = {};
    await page.route('**/api/analyze-plan', async (route) => {
      request = route.request().postDataJSON();
      await route.fulfill({ json: { available: true, result: vision, model: 'test' } });
    });

    await page.goto('/import');
    await page.getByTestId('pdf-input').setInputFiles(join(dir, withVision!));
    await review(page);
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'used');

    // The request carries a PNG render of the page, small enough for the API.
    expect(request.mediaType).toBe('image/png');
    expect(request.fileName).toBe(withVision);
    expect(request.image!.startsWith('iVBORw0KGgo')).toBe(true);
    expect(request.image!.length * 0.75).toBeLessThan(7_500_000);

    const first = vision.rooms[0].name as string;
    await expect(page.getByTestId('room-list')).toContainText(first);
    await page.getByTestId('create-project').click();
    await page.getByTestId('next-review').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('feature-plan').getByText(first).first()).toBeVisible();
  });
});

test.describe('import wizard without fixtures', () => {
  test('explains files it cannot read: not a PDF, password-protected, damaged, empty, too large', async ({ page }) => {
    const errors = trackPageErrors(page);
    await assistantOff(page);
    await page.goto('/import');
    const problem = page.getByTestId('import-error');

    await upload(page, 'notes.pdf', Buffer.from('plain text, not a pdf'));
    await expect(page.getByRole('alert')).toContainText(/not a PDF/i);
    await expect(problem).toHaveAttribute('data-code', 'not-a-pdf');
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    await upload(page, 'locked.pdf', encryptedPdf());
    await expect(problem).toHaveAttribute('data-code', 'encrypted');
    await expect(problem).toContainText('locked.pdf is password-protected');
    await expect(problem).toContainText(/unlocked copy/i);

    await upload(page, 'half.pdf', truncatedPdf());
    await expect(problem).toHaveAttribute('data-code', 'corrupt');
    await expect(problem).toContainText('half.pdf is damaged');
    await expect(problem).toContainText(/download it again/i);

    await upload(page, 'nothing.pdf', Buffer.alloc(0));
    await expect(problem).toHaveAttribute('data-code', 'empty');

    // 51 MB on disk (a sparse file): refused by size before a byte is read.
    const big = test.info().outputPath('drawing-set.pdf');
    const handle = await open(big, 'w');
    await handle.write('%PDF-1.5\n');
    await handle.truncate(51 * 1024 * 1024);
    await handle.close();
    await page.getByTestId('pdf-input').setInputFiles(big);
    await expect(problem).toHaveAttribute('data-code', 'too-large');
    await expect(problem).toContainText('drawing-set.pdf is too large (51 MB)');
    await expect(problem).toContainText(/up to 50 MB/);

    // None of this blocks the next attempt.
    await upload(page, 'flat.pdf', planPdf());
    await review(page);
    await expect(problem).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('takes a PDF dropped anywhere on the dashboard or on the import page', async ({ page }) => {
    const errors = trackPageErrors(page);
    await assistantOff(page);

    // Dashboard: the drop starts an import.
    await page.goto('/');
    await expect(page.getByTestId('start-import')).toBeVisible();
    await dropFiles(page, [{ name: 'dropped.pdf', mimeType: 'application/pdf', buffer: planPdf() }]);
    await page.waitForURL(/\/import$/);
    await review(page);
    await expect(page.getByLabel('Project name')).toHaveValue('dropped');
    await expect(page.getByTestId('room-count')).toHaveText('3');

    // Review screen: dropping another PDF replaces the plan being reviewed.
    await dropFiles(page, [{ name: 'studio.pdf', mimeType: 'application/pdf', buffer: makePdf([planPage({ studio: true })]) }], '[data-testid="import-preview"]');
    await expect(page.getByLabel('Project name')).toHaveValue('studio');
    await review(page);
    await expect(page.getByTestId('room-count')).toHaveText('2');

    // Pick screen: anywhere on the page, not only the dashed box.
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    await dropFiles(page, [{ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('not a pdf') }], 'header');
    await expect(page.getByTestId('import-error')).toContainText('photo.png is not a PDF');
    await dropFiles(page, [{ name: 'again.pdf', mimeType: 'application/pdf', buffer: planPdf() }], 'header');
    await review(page);
    await expect(page.getByTestId('room-count')).toHaveText('3');

    // The overlay shows while a file is dragged over the window and goes away when it leaves.
    const transfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.pdf', { type: 'application/pdf' }));
      return dt;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
    await expect(page.getByTestId('drop-overlay')).toBeVisible();
    await page.dispatchEvent('body', 'dragleave', { dataTransfer: transfer });
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('offers a page picker for a PDF with several pages and re-reads the page picked', async ({ page }) => {
    const errors = trackPageErrors(page);
    await assistantOff(page);
    await page.goto('/import');
    // Cover sheet, the flat, a studio variant.
    await upload(page, 'set.pdf', makePdf([blankPage(), planPage(), planPage({ studio: true })]));
    await review(page);

    const picker = page.getByTestId('page-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('This PDF has 3 pages');
    await expect(picker).toHaveAttribute('data-page', '1');
    const thumbs = page.getByTestId('page-thumb');
    await expect(thumbs).toHaveCount(3);
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');
    // Every page gets a thumbnail image.
    for (let i = 0; i < 3; i++) await expect(thumbs.nth(i)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
    expect(await thumbs.nth(1).locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);

    // Page 1 is the cover: nothing to read, tracing is offered.
    await expect(page.getByTestId('room-count')).toHaveText('0');
    await expect(page.getByTestId('trace-callout')).toBeVisible();

    // Page 2: the flat.
    await thumbs.nth(1).click();
    await expect(page.getByTestId('import-progress')).toContainText('page 2');
    await review(page);
    await expect(picker).toHaveAttribute('data-page', '2');
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('room-count')).toHaveText('3');
    await expect(page.getByTestId('door-count')).toHaveText('2');
    await expect(page.getByTestId('create-project')).toBeVisible();

    // Page 3: one room fewer, and the thumbnails did not have to be rendered again.
    await thumbs.nth(2).click();
    await review(page);
    await expect(page.getByTestId('room-count')).toHaveText('2');
    await expect(thumbs.nth(0)).toHaveAttribute('data-ready', 'true');

    // The project is made from the page being shown.
    await page.getByTestId('create-project').click();
    await page.getByTestId('next-review').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('total-rooms')).toHaveText('2');
    expect(errors).toEqual([]);
  });

  test('issues point at what they are about, and unsure walls and openings are marked', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.route('**/api/analyze-plan', (route) => route.fulfill({ json: { available: true, result: planVision, model: 'test' } }));
    await page.goto('/import');
    // The partition has a gap with no door drawn: the importer assumes a passage and is unsure of it.
    await upload(page, 'flat.pdf', makePdf([planPage({ doorless: true })]));
    await review(page);
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'used');
    await expect(page.getByTestId('room-list')).toContainText('Master Bedroom');

    const preview = page.getByTestId('import-preview');
    const whole = Number(await preview.getAttribute('data-view-width'));

    // Low confidence: marked on the plan, counted in the legend, listed as something to check.
    await expect(preview.locator('[data-low-confidence="opening"]')).toHaveCount(1);
    await expect(preview.locator('[data-low-confidence="wall"]')).toHaveCount(0);
    await expect(page.getByTestId('legend-low-confidence')).toContainText('Low confidence (1)');

    // The mislabelled bedroom: clicking the issue zooms to the room and outlines it.
    const mismatch = page.locator('[data-code="room-size-mismatch"]');
    await expect(mismatch).toContainText('"Master Bedroom" is labelled 3600 x 4000 mm');
    await expect(page.getByTestId('preview-highlight')).toHaveCount(0);
    await mismatch.getByTestId('issue-button').click();
    await expect(mismatch.getByTestId('issue-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('data-focused', 'true');
    await expect(preview.locator('[data-highlight="room"]')).toHaveCount(1);
    await expect(preview.locator('[data-highlight="point"]')).toHaveCount(1);
    await expect.poll(async () => Number(await preview.getAttribute('data-view-width'))).toBeLessThan(whole * 0.8);
    // The outline sits on the bedroom: inside the preview, left of the living room label.
    const outline = (await preview.locator('[data-highlight="room"]').boundingBox())!;
    const frame = (await preview.boundingBox())!;
    expect(outline.x).toBeGreaterThanOrEqual(frame.x);
    expect(outline.x + outline.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(outline.width).toBeGreaterThan(150);

    // The unsure passage: another click moves the pointer there.
    const unsure = page.locator('[data-code="low-confidence"]');
    await unsure.getByTestId('issue-button').click();
    await expect(mismatch.getByTestId('issue-button')).toHaveAttribute('aria-pressed', 'false');
    await expect(preview.locator('[data-highlight="opening"]')).toHaveCount(1);
    await expect(preview.locator('[data-highlight="room"]')).toHaveCount(0);

    // Issues about the drawing as a whole have nothing to point at.
    await expect(page.locator('[data-code="passages-assumed"]').getByTestId('issue-button')).toHaveCount(0);

    // Back to the whole plan, by the button or by clicking the issue again.
    await page.getByTestId('preview-reset').click();
    await expect(preview).toHaveAttribute('data-focused', 'false');
    await expect.poll(async () => Number(await preview.getAttribute('data-view-width'))).toBe(whole);
    await unsure.getByTestId('issue-button').click();
    await unsure.getByTestId('issue-button').click();
    await expect(page.getByTestId('preview-highlight')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('explains what a switched-off assistant means and how to enable it, without blocking', async ({ page }) => {
    await assistantOff(page);
    await page.goto('/import');
    await upload(page, 'flat.pdf', planPdf());
    await review(page);
    const status = page.getByTestId('ai-status');
    await expect(status).toHaveAttribute('data-status', 'unavailable');
    await expect(status).toContainText('The assistant is switched off');
    await expect(status).toContainText(/line work only/i);
    await expect(status).toContainText(/room names and types are guesses/i);
    // The steps are one click away.
    await expect(status.getByText('ANTHROPIC_API_KEY')).toBeHidden();
    await status.getByText('How to switch it on').click();
    await expect(status.getByText('.env.example')).toBeVisible();
    await expect(status.getByText('ANTHROPIC_API_KEY')).toBeVisible();
    await expect(status).toContainText('pnpm dev');
    // The import carries on regardless.
    await expect(page.getByTestId('room-count')).toHaveText('3');
    await expect(page.getByTestId('create-project')).toBeEnabled();
  });

  test('asks the assistant again after it failed', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/analyze-plan', async (route) => {
      calls += 1;
      if (calls === 1) await route.fulfill({ status: 500, body: 'boom' });
      else await route.fulfill({ json: { available: true, result: planVision, model: 'test' } });
    });
    await page.goto('/import');
    await upload(page, 'flat.pdf', planPdf());
    await review(page);
    const status = page.getByTestId('ai-status');
    await expect(status).toHaveAttribute('data-status', 'failed');
    await expect(status).toContainText('returned 500');
    await expect(page.getByTestId('room-list')).not.toContainText('Master Bedroom');
    await status.getByTestId('ai-retry').click();
    await expect(status).toHaveAttribute('data-status', 'used');
    await expect(page.getByTestId('room-list')).toContainText('Master Bedroom');
  });

  test('Create project offers "Furnish it for me" and "Review the plan first"', async ({ page }) => {
    const errors = trackPageErrors(page);
    await assistantOff(page);
    await page.goto('/import');
    await upload(page, 'Corner flat.pdf', planPdf());
    await review(page);

    // The choice comes first; closing it creates nothing.
    await page.getByTestId('create-project').click();
    const choice = page.getByRole('dialog', { name: /What next/ });
    await expect(choice.getByTestId('next-furnish')).toContainText('Furnish it for me');
    await expect(choice.getByTestId('next-review')).toContainText('Review the plan first');
    await expect(choice.getByTestId('next-furnish')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(choice).toBeHidden();
    await expect(page.getByTestId('import-review')).toBeVisible();

    // Furnish it for me: Design mode, furniture in the rooms, a toast with the count.
    await page.getByTestId('create-project').click();
    await choice.getByTestId('next-furnish').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    const toast = toastMessage(page);
    await expect(toast).toContainText(/Furnished your home with \d+ items/);
    const added = Number((await toast.textContent())!.match(/with (\d+) items/)![1]);
    expect(added).toBeGreaterThan(5);
    await designReady(page);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(added));
    await expect(page.getByLabel('Project name')).toHaveValue('Corner flat');
    const id = projectIdOf(page);
    const stored = (await storedProject(page, id))!;
    expect(Object.keys(stored.levels[0]!.items)).toHaveLength(added);
    // Every item sits in a room of the plan.
    const roomIds = new Set(Object.keys(stored.levels[0]!.rooms));
    expect(Object.values(stored.levels[0]!.items).every((i) => i.roomId && roomIds.has(i.roomId))).toBe(true);
    // One undo takes the furniture back.
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '0');

    // Review the plan first: Plan mode over the drawing, nothing furnished.
    await page.goto('/import');
    await upload(page, 'Corner flat.pdf', planPdf());
    await review(page);
    await page.getByTestId('create-project').click();
    await choice.getByTestId('next-review').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('total-rooms')).toHaveText('3');
    await expect(page.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
    expect(Object.keys((await storedProject(page, projectIdOf(page)))!.levels[0]!.items)).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('a scan lands in Plan mode with the page as the underlay to trace', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.route('**/api/analyze-plan', (route) => route.abort());
    await page.goto('/import');
    // The pick screen already says what happens to scans.
    await expect(page.getByTestId('scan-note')).toContainText(/trace it yourself/i);

    await upload(page, 'scan.pdf', scanPdf());
    await review(page);
    await expect(page.getByTestId('room-count')).toHaveText('0');
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('issue-list')).toContainText(/trace the plan/i);
    // No rooms: tracing is the way on, and there is nothing to furnish.
    await expect(page.getByTestId('trace-callout')).toContainText(/picture, not line work/i);
    await expect(page.getByTestId('create-project')).toHaveCount(0);

    await page.getByTestId('trace-yourself').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('feature-plan')).toBeVisible();
    await expect(page.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
    await expect(page.getByTestId('empty-plan')).toContainText('Trace your drawing');
    await expect(page.getByTestId('total-rooms')).toHaveText('0');

    // The page itself is stored with the project and drawn under the plan (the scan is a grey checkerboard).
    const assets = await storedAssets(page, projectIdOf(page));
    expect(assets.imageType).toBe('image/png');
    expect(assets.imageBytes).toBeGreaterThan(500);
    expect(assets.pdfBytes).toBe(scanPdf().byteLength);
    await expect
      .poll(() =>
        page.getByTestId('plan-backdrop').evaluate((el) => {
          const canvas = el as HTMLCanvasElement;
          const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
          // The page is drawn translucent; the grid behind it is far fainter (alpha under 0.12).
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 60 && data[i]! < 120 && Math.abs(data[i]! - data[i + 2]!) < 12) dark++;
          return dark;
        }),
      )
      .toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });

  test('"Trace it yourself" is also there when the detection is not wanted', async ({ page }) => {
    await assistantOff(page);
    await page.goto('/import');
    await upload(page, 'flat.pdf', planPdf());
    await review(page);
    await expect(page.getByTestId('room-count')).toHaveText('3');
    await page.getByTestId('trace-yourself').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    // An empty plan over the drawing: the detected walls were left behind, the line work is there to snap to.
    await expect(page.getByTestId('total-rooms')).toHaveText('0');
    await expect(page.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
    await expect(page.getByTestId('empty-plan')).toContainText('Trace your drawing');
    await expect(toastMessage(page)).toContainText(/Trace the walls/);
    const id = projectIdOf(page);
    expect(Object.keys((await storedProject(page, id))!.levels[0]!.walls)).toHaveLength(0);
    expect((await storedAssets(page, id)).underlaySegments).toBeGreaterThan(40);
  });
});
