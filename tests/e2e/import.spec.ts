/**
 * Import wizard against a real drawing from `fixtures/local/` (git-ignored).
 * Skips when the folder has no PDF. Nothing about the drawing is hard-coded:
 * the AI reply, when mocked, comes from the `.vision.json` next to the PDF.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/local');
const pdfs = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort() : [];
const withVision = pdfs.find((f) => existsSync(join(dir, f.replace(/\.pdf$/i, '.vision.json'))));
const pdf = withVision ?? pdfs[0];

test.describe('import wizard', () => {
  test.skip(!pdf, 'no PDFs in fixtures/local');

  test('uploads a PDF, reviews it without the assistant and lands in Plan mode with rooms', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/analyze-plan', (route) => route.fulfill({ json: { available: false } }));

    await page.goto('/import');
    await page.getByTestId('pdf-input').setInputFiles(join(dir, pdf!));
    await expect(page.getByTestId('import-review')).toBeVisible({ timeout: 45_000 });

    // Vector-only: the wizard says so.
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'unavailable');
    await expect(page.getByTestId('ai-status')).toContainText(/line work only/i);

    const rooms = Number(await page.getByTestId('room-count').textContent());
    expect(rooms).toBeGreaterThanOrEqual(4);
    expect(Number(await page.getByTestId('door-count').textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId('import-preview').locator('[data-room]')).toHaveCount(rooms);
    await expect(page.getByTestId('layer-row').first()).toBeVisible();
    await expect(page.getByTestId('scale-estimate')).toContainText(/1 : \d/);

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

    await page.getByLabel('Project name').fill('Imported flat');
    await page.getByTestId('create-project').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('feature-plan')).toBeVisible();
    await expect(page.getByLabel('Project name')).toHaveValue('Imported flat');
    await expect(page.getByTestId('feature-plan').getByText(/Living|Bedroom/).first()).toBeVisible();
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
    await expect(page.getByTestId('import-review')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'used');

    // The request carries a PNG render of the page, small enough for the API.
    expect(request.mediaType).toBe('image/png');
    expect(request.fileName).toBe(withVision);
    expect(request.image!.startsWith('iVBORw0KGgo')).toBe(true);
    expect(request.image!.length * 0.75).toBeLessThan(7_500_000);

    const first = vision.rooms[0].name as string;
    await expect(page.getByTestId('room-list')).toContainText(first);
    await page.getByTestId('create-project').click();
    await page.waitForURL(/\/p\/[^/]+\/plan$/);
    await expect(page.getByTestId('feature-plan').getByText(first).first()).toBeVisible();
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await page.goto('/import');
    await page.getByTestId('pdf-input').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('plain text, not a pdf') });
    await expect(page.getByRole('alert')).toContainText(/not a PDF/i);
    await expect(page.getByTestId('drop-zone')).toBeVisible();
  });
});
