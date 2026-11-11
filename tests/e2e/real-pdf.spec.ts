/**
 * The whole journey on real drawings: every PDF in `fixtures/local/` that has a
 * recorded AI result (`<name>.vision.json`) next to it. The folder is git-ignored
 * and the suite skips when it is empty. Nothing about a drawing is hard-coded:
 * room names come from its recorded result, and the expected room count from
 * running the importer on the same file outside the browser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { importPdfDetailed } from '../../packages/importer/src';
import {
  designReady,
  expectSaved,
  expectWalkRendered,
  gotoMode,
  openProjectState,
  projectIdOf,
  runTour,
  storedAssets,
  storedProject,
  toastMessage,
  trackPageErrors,
} from './helpers';

interface Vision {
  rooms: { name: string; type: string }[];
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/local');
const recorded = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pdf') && existsSync(join(dir, f.replace(/\.pdf$/i, '.vision.json'))))
      .sort()
  : [];

/** What the importer makes of the file on its own, for comparing with what the wizard shows. */
async function importOutsideBrowser(file: string, vision: Vision): Promise<{ rooms: string[]; walls: number; openings: number }> {
  const bytes = readFileSync(join(dir, file));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { draft } = await importPdfDetailed(data, { vision: vision as never, fileName: file, raster: false });
  return {
    rooms: Object.values(draft.level.rooms).map((r) => r.name),
    walls: Object.keys(draft.level.walls).length,
    openings: Object.keys(draft.level.openings).length,
  };
}

test.describe('real floor plans', () => {
  test.skip(recorded.length === 0, 'no PDF with a recorded .vision.json in fixtures/local');

  for (const file of recorded) {
    // The last word of the file name identifies the unit type without spelling out the drawing's title.
    const label = file.replace(/\.pdf$/i, '').split(/[\s_]+/).pop()!;

    test(`${label}: import, furnish, tour every room, export and re-import`, async ({ page, browser }) => {
      test.setTimeout(480_000);
      const errors = trackPageErrors(page);
      const vision = JSON.parse(readFileSync(join(dir, file.replace(/\.pdf$/i, '.vision.json')), 'utf8')) as Vision;
      const labelled = [...new Set(vision.rooms.map((r) => r.name))];
      expect(labelled.length).toBeGreaterThan(3);
      const expected = await importOutsideBrowser(file, vision);
      await page.route('**/api/analyze-plan', (route) => route.fulfill({ json: { available: true, result: vision, model: 'recorded' } }));

      /* ---- import through the wizard */
      await page.goto('/import');
      await page.getByTestId('pdf-input').setInputFiles(join(dir, file));
      await expect(page.getByTestId('import-review')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('ai-status')).toHaveAttribute('data-status', 'used');

      const rooms = Number(await page.getByTestId('room-count').textContent());
      expect(rooms).toBe(expected.rooms.length);
      expect(rooms).toBeGreaterThanOrEqual(labelled.length);
      await expect(page.getByTestId('import-preview').locator('[data-room]')).toHaveCount(rooms);
      // Every room labelled on the drawing is in the plan under its own name.
      for (const name of labelled) await expect(page.getByTestId('room-list').getByText(name, { exact: true }).first()).toBeVisible();
      expect(Number(await page.getByTestId('door-count').textContent())).toBeGreaterThan(rooms / 2);
      expect(Number(await page.getByTestId('window-count').textContent())).toBeGreaterThan(0);

      // What the import is unsure about is marked, and the issue that lists it points at it.
      const unsure = await page.getByTestId('import-preview').locator('[data-low-confidence]').count();
      await expect(page.getByTestId('legend-low-confidence')).toHaveAttribute('data-count', String(unsure));
      for (const button of await page.getByTestId('issue-button').all()) {
        await button.click();
        await expect(page.getByTestId('import-preview')).toHaveAttribute('data-focused', 'true');
        await expect(page.getByTestId('preview-highlight').locator('[data-highlight]').first()).toBeVisible();
      }
      if ((await page.getByTestId('preview-reset').count()) > 0) await page.getByTestId('preview-reset').click();

      /* ---- furnish it for me */
      await page.getByLabel('Project name').fill(`Home ${label}`);
      await page.getByTestId('create-project').click();
      await page.getByTestId('next-furnish').click();
      await page.waitForURL(/\/p\/[^/]+\/design$/, { timeout: 60_000 });
      const toast = toastMessage(page);
      await expect(toast).toContainText(/Furnished your home with \d+ items/);
      const added = Number((await toast.textContent())!.match(/with (\d+) items/)![1]);
      await designReady(page);
      const id = projectIdOf(page);
      const open = await openProjectState(page);
      const level = open.levels[0]!;
      expect(Object.keys(level.rooms)).toHaveLength(rooms);
      expect(Object.keys(level.walls)).toHaveLength(expected.walls);
      expect(Object.keys(level.openings)).toHaveLength(expected.openings);
      expect(Object.values(level.rooms).map((r) => r.name).sort()).toEqual([...expected.rooms].sort());
      const items = Object.values(level.items);
      expect(items).toHaveLength(added);
      // A furnished home: more items than rooms, spread over most of the labelled rooms.
      expect(added).toBeGreaterThan(rooms);
      const furnishedRooms = new Set(items.map((i) => i.roomId));
      expect(furnishedRooms.size).toBeGreaterThanOrEqual(Math.ceil(labelled.length * 0.6));
      await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(added));
      // The scene holds real geometry, not an empty frame.
      const stats = await page.evaluate(() => (window as unknown as { __interio: { stats(): { calls: number; triangles: number } } }).__interio.stats());
      expect(stats.triangles).toBeGreaterThan(5_000);
      await page.screenshot({ path: test.info().outputPath('design.png') });

      /* ---- walk: the guided tour visits every room and ends */
      await gotoMode(page, 'walk');
      await expectWalkRendered(page.locator('canvas'));
      await expect(page.getByTestId('walk-room-item')).toHaveCount(rooms);
      const tour = await runTour(page, 24, 360_000);
      expect([...tour.visited].sort()).toEqual([...tour.rooms].sort());
      expect(new Set(tour.visited).size).toBe(rooms);
      await expect(page.getByTestId('walk-tour-start')).toHaveText('Tour again');
      await page.screenshot({ path: test.info().outputPath('walk.png') });

      /* ---- export, then re-import in another browser */
      await expectSaved(page);
      const saved = (await storedProject(page, id))!;
      const assets = await storedAssets(page, id);
      expect(assets.underlaySegments).toBeGreaterThan(1000);
      expect(assets.imageType).toBe('image/png');
      expect(assets.pdfBytes).toBe(readFileSync(join(dir, file)).byteLength);
      const target = test.info().outputPath('home.interio');
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export project file' }).click()]);
      await download.saveAs(target);
      expect(download.suggestedFilename()).toBe(`Home-${label}.interio`);
      const exported = await readFile(target);
      // Sane size: about what the page picture and the PDF weigh, not a multiple of it.
      expect(exported.byteLength).toBeLessThan(assets.imageBytes + assets.pdfBytes + 600_000);

      // Leave the walkthrough, so its render loop does not compete with the second browser for the software GPU.
      await page.getByRole('button', { name: 'Back to your homes' }).click();
      await expect(page.getByTestId('card-items')).toHaveText(`${added} items`);

      const context = await browser.newContext();
      const other = await context.newPage();
      const otherErrors = trackPageErrors(other);
      await other.goto('/');
      await other.getByTestId('project-file-input').setInputFiles(target);
      await other.waitForURL(/\/p\/[^/]+\/design$/);
      await designReady(other);
      const copyId = projectIdOf(other);
      await expect(other.getByLabel('Project name')).toHaveValue(`Home ${label}`);
      const copy = (await storedProject(other, copyId))!;
      // The level JSON is the same: every vertex, wall, opening, room and item, value for value.
      expect(copy.levels).toEqual(saved.levels);
      expect(Object.keys(copy.levels[0]!.items)).toHaveLength(added);
      expect(await storedAssets(other, copyId)).toEqual(assets);
      await expect(other.getByTestId('item-count')).toHaveAttribute('data-count', String(added));
      await gotoMode(other, 'plan');
      await expect(other.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
      await expect(other.getByTestId('total-rooms')).toHaveText(String(rooms));
      expect(otherErrors).toEqual([]);
      await context.close();

      // Numbers for the run report, next to the screenshots in the test output folder (never committed).
      await writeFile(
        test.info().outputPath('summary.json'),
        JSON.stringify({ label, rooms, labelled: labelled.length, items: added, furnishedRooms: furnishedRooms.size, lowConfidence: unsure, tourStops: tour.visited.length, exportBytes: exported.byteLength, pdfBytes: assets.pdfBytes }),
      );

      expect(errors).toEqual([]);
    });
  }
});
