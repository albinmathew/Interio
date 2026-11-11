/**
 * The whole user journey, on the sample home and on hand-built PDFs, so it runs
 * without the drawings in `fixtures/local`: dashboard, plan, design, walk, export,
 * delete, re-import, and the shell around them (titles, not-found pages, the error
 * boundary, toasts in full screen, keyboard order, help).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  clickPlan2d,
  clickPlan3d,
  designReady,
  expectSaved,
  expectWalkRendered,
  gotoMode,
  openProjectState,
  openSample,
  planPdf,
  projectIdOf,
  runTour,
  storedAssets,
  storedProject,
  toastMessage,
  trackPageErrors,
} from './helpers';

const panel = (page: Page) => page.getByTestId('properties-panel');
const tile = (page: Page, name: string) => page.getByTestId('project-tile').filter({ has: page.getByTestId('card-name').getByText(name, { exact: true }) });

/** Exports the open project through the header and returns the downloaded file. */
async function exportProject(page: Page, saveAs: string): Promise<{ name: string; bytes: Buffer }> {
  await expectSaved(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export project file' }).click()]);
  await download.saveAs(saveAs);
  return { name: download.suggestedFilename(), bytes: await readFile(saveAs) };
}

test.describe('journey', () => {
  test('sample home: plan, design, walk, export, delete, re-import, and everything is back', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackPageErrors(page);

    // Dashboard -> sample.
    await page.goto('/');
    await expect(page).toHaveTitle('Your homes · Interio');
    const id = await openSample(page);
    await designReady(page);
    await expect(page).toHaveTitle('Sample 3-bedroom apartment · Design · Interio');

    // Plan: rename the kitchen (it spans x 0..3000, y 0..4200).
    await gotoMode(page, 'plan');
    await expect(page.getByTestId('total-rooms')).toHaveText('10');
    await clickPlan2d(page, 1500, 2000);
    await expect(panel(page)).toHaveAttribute('data-selection', 'room');
    await panel(page).getByLabel('Name', { exact: true }).fill('Pantry kitchen');
    await panel(page).getByLabel('Name', { exact: true }).press('Enter');
    await expect(page.locator('[data-room-label]').filter({ hasText: 'Pantry kitchen' })).toHaveCount(1);

    // Design: place one sofa from the catalog in the living room.
    await gotoMode(page, 'design');
    await designReady(page);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '0');
    await page.locator('[data-testid="catalog-entry"][data-entry-id="sofa.3seat"]').click();
    await clickPlan3d(page, 6500, 2000);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '1');
    await page.keyboard.press('Escape');

    // Walk: the guided tour reaches every room and ends.
    await gotoMode(page, 'walk');
    await expectWalkRendered(page.locator('canvas'));
    const tour = await runTour(page, 16);
    expect(tour.rooms).toHaveLength(10);
    expect([...tour.visited].sort()).toEqual([...tour.rooms].sort());
    await expect(page.getByTestId('walk-room-item').filter({ hasText: 'Pantry kitchen' })).toHaveCount(1);

    // Name the home, then export it.
    await page.getByLabel('Project name').fill('Journey home');
    await expect(page).toHaveTitle('Journey home · Walk · Interio');
    const file = await exportProject(page, test.info().outputPath('journey.interio'));
    expect(file.name).toBe('Journey-home.interio');
    expect([file.bytes[0], file.bytes[1]]).toEqual([0x1f, 0x8b]);
    await expect(toastMessage(page)).toContainText('Saved Journey-home.interio');
    const before = (await storedProject(page, id))!;
    expect(before.name).toBe('Journey home');

    // Dashboard: the card shows what is inside. Delete it.
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(tile(page, 'Journey home').getByTestId('card-items')).toHaveText('1 item');
    await tile(page, 'Journey home').hover();
    await page.getByRole('button', { name: 'Delete Journey home' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('project-card')).toHaveCount(0);
    expect(await storedProject(page, id)).toBeNull();

    // Re-import the file: a new project with the same content.
    await page.getByTestId('project-file-input').setInputFiles(test.info().outputPath('journey.interio'));
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    const restoredId = projectIdOf(page);
    expect(restoredId).not.toBe(id);
    await designReady(page);
    await expect(page.getByLabel('Project name')).toHaveValue('Journey home');
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '1');
    const after = (await storedProject(page, restoredId))!;
    expect(after.name).toBe('Journey home');
    expect(after.levels).toEqual(before.levels);
    expect(Object.values(after.levels[0]!.rooms).map((r) => r.name)).toContain('Pantry kitchen');
    expect(Object.values(after.levels[0]!.items).map((i) => i.catalogId)).toEqual(['sofa.3seat']);

    // It is the same home in every mode.
    await gotoMode(page, 'plan');
    await expect(page.locator('[data-room-label]').filter({ hasText: 'Pantry kitchen' })).toHaveCount(1);
    await gotoMode(page, 'walk');
    await expect(page.getByTestId('walk-room-item')).toHaveCount(10);
    expect(errors).toEqual([]);
  });

  test('blank project: a room drawn in Plan shows in Design and in Walk', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    await page.getByTestId('start-blank').click();
    await page.waitForURL(/\/plan$/);
    await expect(page.getByTestId('empty-plan')).toBeVisible();

    // Nothing to show yet in the other modes.
    await gotoMode(page, 'design');
    await expect(page.getByText('Nothing to furnish yet')).toBeVisible();
    await gotoMode(page, 'walk');
    await expect(page.getByText('Nothing to walk through yet')).toBeVisible();

    // Four walls; closing the loop makes a room.
    await gotoMode(page, 'plan');
    await page.getByRole('button', { name: 'Draw walls' }).click();
    await clickPlan2d(page, 0, 0);
    await clickPlan2d(page, 5000, 0);
    await clickPlan2d(page, 5000, 3500);
    await clickPlan2d(page, 0, 3500);
    await clickPlan2d(page, 40, 30);
    await expect(page.getByTestId('total-rooms')).toHaveText('1');
    await page.keyboard.press('v');
    await clickPlan2d(page, 2500, 1750);
    await expect(panel(page)).toHaveAttribute('data-selection', 'room');
    await panel(page).getByLabel('Name', { exact: true }).fill('Studio');
    await panel(page).getByLabel('Name', { exact: true }).press('Enter');
    await expectSaved(page);

    // Design: the room is there and drawn.
    await gotoMode(page, 'design');
    await designReady(page);
    const project = await openProjectState(page);
    expect(Object.values(project.levels[0]!.rooms).map((r) => r.name)).toEqual(['Studio']);
    expect(Object.keys(project.levels[0]!.walls)).toHaveLength(4);
    await clickPlan3d(page, 2500, 1750);
    await expect(page.getByTestId('room-name')).toHaveText('Studio');

    // Walk: the walker stands in it.
    await gotoMode(page, 'walk');
    await expectWalkRendered(page.locator('canvas'));
    await expect(page.getByTestId('walk-room-item')).toHaveCount(1);
    await expect(page.getByTestId('walk-room-label')).toHaveText('Studio');
    expect(errors).toEqual([]);
  });
});

test.describe('dashboard', () => {
  test('furnish the sample home in one click, then rename and duplicate it from its card', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    await page.getByTestId('start-sample-furnished').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    await expect(toastMessage(page)).toContainText(/Furnished the sample home with \d+ items/);
    await designReady(page);
    const furnished = Object.keys((await openProjectState(page)).levels[0]!.items).length;
    expect(furnished).toBeGreaterThan(20);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(furnished));
    // Furnishing is one undo step.
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '0');
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(furnished));
    await expectSaved(page);
    const id = projectIdOf(page);

    // The card counts the furniture.
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    const original = tile(page, 'Sample 3-bedroom apartment');
    await expect(original.getByTestId('card-items')).toHaveText(`${furnished} items`);

    // Rename from the card: the dialog starts with the name selected, Enter confirms.
    await original.hover();
    await page.getByRole('button', { name: 'Rename Sample 3-bedroom apartment' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename project' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await dialog.getByLabel('Name').fill('Lake house');
    await dialog.getByLabel('Name').press('Enter');
    await expect(dialog).toBeHidden();
    await expect(tile(page, 'Lake house')).toHaveCount(1);
    expect((await storedProject(page, id))!.name).toBe('Lake house');

    // Duplicate: a copy with its own id and the same furniture.
    await tile(page, 'Lake house').hover();
    await page.getByRole('button', { name: 'Duplicate Lake house' }).click();
    await expect(toastMessage(page)).toContainText('Lake house copy');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await expect(tile(page, 'Lake house copy').getByTestId('card-items')).toHaveText(`${furnished} items`);
    const copyId = await tile(page, 'Lake house copy').getAttribute('data-project-id');
    expect(copyId).not.toBe(id);
    const copy = (await storedProject(page, copyId!))!;
    expect(copy.levels).toEqual((await storedProject(page, id))!.levels);

    // The renamed project opens under its new name (not the copy the editor had open before).
    await tile(page, 'Lake house').getByTestId('project-card').click();
    await expect(page.getByLabel('Project name')).toHaveValue('Lake house');
    await expect(page).toHaveTitle('Lake house · Design · Interio');
    expect(errors).toEqual([]);
  });

  test('opens the plain JSON project files of earlier versions', async ({ page }) => {
    const id = await openSample(page);
    await page.getByLabel('Project name').fill('Old format');
    await expectSaved(page);
    const record = (await storedProject(page, id))!;
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await page.getByTestId('project-file-input').setInputFiles({ name: 'old.interio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(record)) });
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    expect(projectIdOf(page)).not.toBe(id);
    await expect(page.getByLabel('Project name')).toHaveValue('Old format');
    expect((await storedProject(page, projectIdOf(page)))!.levels).toEqual(record.levels);

    // A file that is not a project says so and changes nothing.
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await page.getByTestId('project-file-input').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": "world"}') });
    await expect(toastMessage(page)).toContainText(/Unsupported project version|Not an Interio project/i);
    await expect(page.getByTestId('project-card')).toHaveCount(2);
  });
});

test.describe('portable projects', () => {
  test('an imported plan travels to another browser with its drawing and source PDF', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const errors = trackPageErrors(page);
    const pdf = planPdf();
    await page.route('**/api/analyze-plan', (route) => route.fulfill({ json: { available: false } }));
    await page.goto('/import');
    await page.getByTestId('pdf-input').setInputFiles({ name: 'Two room flat.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByTestId('import-review')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('create-project').click();
    await page.getByTestId('next-furnish').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    await designReady(page);
    const id = projectIdOf(page);
    const source = (await storedProject(page, id))!;
    const sourceAssets = await storedAssets(page, id);
    expect(sourceAssets.underlaySegments).toBeGreaterThan(40);
    expect(sourceAssets.imageBytes).toBeGreaterThan(1000);
    expect(sourceAssets.pdfBytes).toBe(pdf.byteLength);
    expect(Object.keys(source.levels[0]!.items).length).toBeGreaterThan(5);

    const file = await exportProject(page, test.info().outputPath('flat.interio'));
    expect(file.name).toBe('Two-room-flat.interio');
    // One file, and not much bigger than the picture and the PDF it carries.
    expect(file.bytes.byteLength).toBeLessThan(sourceAssets.imageBytes + sourceAssets.pdfBytes + 60_000);

    // Another browser: its own, empty storage.
    const context = await browser.newContext();
    const other = await context.newPage();
    const otherErrors = trackPageErrors(other);
    await other.goto('/');
    await expect(other.getByText('Nothing here yet')).toBeVisible();
    await other.getByTestId('project-file-input').setInputFiles(test.info().outputPath('flat.interio'));
    await other.waitForURL(/\/p\/[^/]+\/design$/);
    await designReady(other);
    const otherId = projectIdOf(other);
    await expect(other.getByLabel('Project name')).toHaveValue('Two room flat');
    const copy = (await storedProject(other, otherId))!;
    expect(copy.levels).toEqual(source.levels);
    expect(await storedAssets(other, otherId)).toEqual(sourceAssets);

    // The drawing is under the plan there too.
    await gotoMode(other, 'plan');
    await expect(other.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
    await expect(other.getByLabel('Source drawing opacity')).toBeEnabled();
    expect(otherErrors).toEqual([]);
    await context.close();
    expect(errors).toEqual([]);
  });
});

test.describe('shell', () => {
  test('unknown addresses and missing projects get a page of their own', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/no/such/page');
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
    await expect(page.getByTestId('not-found')).toContainText('/no/such/page');
    await expect(page).toHaveTitle('Page not found · Interio');
    await page.getByRole('link', { name: 'Back to your homes' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Your homes' })).toBeVisible();

    await page.goto('/p/p_does_not_exist/design');
    await expect(page.getByTestId('project-not-found')).toBeVisible();
    await expect(page).toHaveTitle('Project not found · Interio');
    await page.getByRole('link', { name: 'Back to your homes' }).click();
    await expect(page.getByRole('heading', { name: 'Your homes' })).toBeVisible();

    // An unknown mode of a real project falls back to Design.
    const id = await openSample(page);
    await page.goto(`/p/${id}/nonsense`);
    await page.waitForURL(new RegExp(`/p/${id}/design$`));
    await expect(page.getByTestId('feature-design')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a crash in one mode shows a way out instead of a blank page', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openSample(page);
    await designReady(page);

    await page.evaluate(() => (window as Window & { __interioShell?: { crashFeature(): void } }).__interioShell!.crashFeature());
    const crash = page.getByTestId('feature-error');
    await expect(crash).toBeVisible();
    await expect(crash).toContainText('Design mode ran into a problem');
    await expect(crash.getByTestId('feature-error-detail')).toContainText('development hook');
    // The header is still there and usable.
    await expect(page.getByLabel('Project name')).toHaveValue('Sample 3-bedroom apartment');
    await expect(page.getByRole('tab', { name: 'Plan' })).toBeVisible();

    // Try again brings the mode back.
    await crash.getByRole('button', { name: 'Try again' }).click();
    await expect(crash).toBeHidden();
    await designReady(page);

    // Another mode is one click away from the crash screen.
    await page.evaluate(() => (window as Window & { __interioShell?: { crashFeature(): void } }).__interioShell!.crashFeature());
    await expect(crash).toBeVisible();
    await gotoMode(page, 'plan');
    await expect(crash).toBeHidden();
    await expect(page.getByTestId('total-rooms')).toHaveText('10');

    // And so are the homes.
    await page.evaluate(() => (window as Window & { __interioShell?: { crashFeature(): void } }).__interioShell!.crashFeature());
    await expect(crash).toContainText('Plan mode ran into a problem');
    await crash.getByRole('button', { name: 'Back to your homes' }).click();
    await expect(page.getByRole('heading', { name: 'Your homes' })).toBeVisible();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    // The boundary caught it: nothing reached the page as an uncaught error.
    expect(errors).toEqual([]);
  });

  test('toasts show inside a view that is in browser full screen', async ({ page }) => {
    await openSample(page);
    await gotoMode(page, 'walk');
    await expectWalkRendered(page.locator('canvas'));

    // Outside full screen the toasts live in the page body.
    await page.getByTestId('walk-screenshot').click();
    await expect(toastMessage(page)).toHaveText('Picture saved to your downloads');
    expect(await page.getByTestId('toaster').evaluate((el) => el.parentElement === document.body)).toBe(true);

    await page.getByTestId('walk-fullscreen').click();
    await expect(page.getByTestId('walk-fullscreen')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('walk-screenshot').click();
    await expect(toastMessage(page)).toBeVisible();
    const inside = await toastMessage(page).evaluate((el) => {
      const full = document.fullscreenElement;
      const box = el.getBoundingClientRect();
      return { contained: !!full && full.contains(el), testId: full?.getAttribute('data-testid'), onScreen: box.width > 0 && box.bottom <= window.innerHeight && box.top >= 0 };
    });
    expect(inside).toEqual({ contained: true, testId: 'walkthrough', onScreen: true });

    // Leaving full screen puts them back in the body.
    await page.getByTestId('walk-fullscreen').click();
    await expect(page.getByTestId('walk-fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.getByTestId('toaster').evaluate((el) => el.parentElement === document.body)).toBe(true);
  });

  test('header controls have names, a sensible tab order, and the title follows the project', async ({ page }) => {
    await openSample(page);
    await designReady(page);
    const header = page.locator('header');

    // Every control in the header has an accessible name.
    const unnamed = await header.locator('button, input, a, [role="tab"]').evaluateAll((els) =>
      els.filter((el) => !(el.getAttribute('aria-label') || el.textContent?.trim() || (el as HTMLInputElement).labels?.length)).map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    await expect(header.getByRole('navigation', { name: 'Modes' })).toBeVisible();
    await expect(page.getByTestId('save-status')).toHaveAttribute('role', 'status');

    // Renaming updates the tab title and enables undo.
    await page.getByLabel('Project name').fill('Hill house');
    await expect(page).toHaveTitle('Hill house · Design · Interio');
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();

    // Tab walks the header left to right; disabled buttons (Redo) are skipped.
    await page.getByRole('button', { name: 'Back to your homes' }).focus();
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? ''));
      await page.keyboard.press('Tab');
    }
    expect(order).toEqual(['Back to your homes', 'Project name', 'Plan', 'Design', 'Walk', 'Undo (⌘Z)', 'Help', 'Export project file']);

    await gotoMode(page, 'plan');
    await expect(page).toHaveTitle('Hill house · Plan · Interio');
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await expect(page).toHaveTitle('Your homes · Interio');
  });

  test('help opens on the topic for the current mode and reads from the user guide', async ({ page }) => {
    await openSample(page);
    await designReady(page);
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Help' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Furnish in 3D' })).toBeVisible();
    await expect(dialog.getByTestId('help-topic').filter({ hasText: 'Furnish in 3D' })).toHaveAttribute('aria-current', 'page');
    await expect(dialog.getByTestId('help-content')).toContainText('Auto-furnish room');

    // The topics are the sections of docs/USER_GUIDE.md.
    const guide = await readFile(join(dirname(fileURLToPath(import.meta.url)), '../../docs/USER_GUIDE.md'), 'utf8');
    const sections = [...guide.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
    expect(sections.length).toBeGreaterThanOrEqual(6);
    await expect(dialog.getByTestId('help-topic')).toHaveText(sections);

    await dialog.getByTestId('help-topic').filter({ hasText: 'Edit the plan' }).click();
    await expect(dialog.getByRole('heading', { name: 'Plan shortcuts' })).toBeVisible();
    await expect(dialog.getByTestId('help-content')).toContainText('Set scale');
    await dialog.getByTestId('help-topic').filter({ hasText: 'Save, export and share' }).click();
    await expect(dialog.getByTestId('help-content')).toContainText('.interio');

    // Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeFocused();

    // In Walk mode it opens on the walkthrough.
    await gotoMode(page, 'walk');
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Walk through' })).toBeVisible();
    await expect(dialog.getByTestId('help-content')).toContainText('guided tour');
  });
});

/**
 * Screenshots of the sample home for the README. Not part of the normal run:
 *   INTERIO_DOCS_SHOTS=1 pnpm e2e flow --grep "docs screenshots"
 */
test.describe('docs screenshots', () => {
  test.skip(!process.env.INTERIO_DOCS_SHOTS, 'set INTERIO_DOCS_SHOTS=1 to regenerate docs/screenshots');
  const out = (name: string) => join(dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots', name);
  const shot = (page: Page, name: string) => page.screenshot({ path: out(name), type: 'jpeg', quality: 82 });

  test('dashboard, plan, design and walk on the sample home', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByTestId('start-sample-furnished').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    await designReady(page);
    await page.getByLabel('Project name').fill('Sample home');
    await page.getByLabel('Project name').blur();
    await expect(toastMessage(page)).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    await shot(page, 'design.jpg');

    await gotoMode(page, 'plan');
    await expect(page.getByTestId('total-rooms')).toHaveText('10');
    await page.waitForTimeout(500);
    await shot(page, 'plan.jpg');

    await gotoMode(page, 'walk');
    await expectWalkRendered(page.locator('canvas'));
    await page.getByTestId('walk-room-item').filter({ hasText: 'Living / Dining' }).click();
    await page.waitForTimeout(2500);
    await shot(page, 'walk.jpg');
    await expectSaved(page);

    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await page.getByTestId('start-sample').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    await page.getByLabel('Project name').fill('Empty sample');
    await expectSaved(page);
    await page.getByRole('button', { name: 'Back to your homes' }).click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.waitForTimeout(500);
    await shot(page, 'dashboard.jpg');
  });
});
