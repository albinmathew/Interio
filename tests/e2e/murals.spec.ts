import { expect, test, type Page } from '@playwright/test';
import { expectCanvasRendered, expectSaved, openSample, toastMessage, trackPageErrors } from './helpers';

/**
 * Murals on a wall face in Design mode: the built-in painted meadow (with beadboard
 * panelling under it), and the user's own picture, which is stored with the project,
 * survives a reload and travels in an exported project file.
 */

interface Hook {
  ready: boolean;
  store: {
    getState(): {
      project: { id: string; levels: { walls: Record<string, { finishLeft?: string; finishRight?: string }> }[] };
      past: unknown[];
    };
  };
  ui: { getState(): { wallFace: { wallId: string; side: 'left' | 'right'; roomId: string | null } | null } };
  project(x: number, y: number, z?: number): { x: number; y: number };
  describeSurfaces(): Record<string, { finish: string; color: string }>;
}

type Dev = { __interio: Hook };

// Bedroom 1's north wall in the sample plan: it has a window, which the mural flows around.
const NORTH_WALL = { x: 1900, y: 8880, z: 2500 };

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __interio?: { ready: boolean } }).__interio?.ready === true);
  await expectCanvasRendered(page.locator('canvas'));
}

const surfaces = (page: Page) => page.evaluate(() => (window as unknown as Dev).__interio.describeSurfaces());
const undoSteps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().past.length);

async function clickPlan(page: Page, x: number, y: number, z: number): Promise<void> {
  const p = await page.evaluate(([px, py, pz]) => (window as unknown as Dev).__interio.project(px!, py!, pz), [x, y, z]);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

/** Opens the face panel of Bedroom 1's north wall; returns the face and a reader for its finish. */
async function openNorthFace(page: Page) {
  await clickPlan(page, NORTH_WALL.x, NORTH_WALL.y, NORTH_WALL.z);
  await expect(page.getByTestId('room-name')).toHaveText('Bedroom 1');
  await page.getByRole('tab', { name: 'Finishes' }).click();
  const face = (await page.evaluate(() => (window as unknown as Dev).__interio.ui.getState().wallFace))!;
  await page.getByTestId('room-wall-face').click();
  await expect(page.getByTestId('wall-face-panel')).toBeVisible();
  return face;
}

const faceValue = (page: Page, face: { wallId: string; side: 'left' | 'right' }) =>
  page.evaluate(
    ({ wallId, side }) => {
      const wall = (window as unknown as Dev).__interio.store.getState().project.levels[0]!.walls[wallId]!;
      return side === 'left' ? wall.finishLeft : wall.finishRight;
    },
    { wallId: face.wallId, side: face.side },
  );

/** A small PNG made in the page: a blue sky over green grass with a yellow sun. */
async function smallPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 48;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#7fb2e5';
    ctx.fillRect(0, 0, 96, 30);
    ctx.fillStyle = '#5c9e4a';
    ctx.fillRect(0, 30, 96, 18);
    ctx.fillStyle = '#f4d03f';
    ctx.beginPath();
    ctx.arc(20, 12, 7, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}

test.describe('murals', () => {
  test('the painted meadow on one wall face, with and without panelling; murals are not offered for whole rooms', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openSample(page);
    await ready(page);
    const face = await openNorthFace(page);
    const key = `wall:${face.wallId}:${face.side}`;

    // Room-wide wall finishes do not offer murals; the face panel does, in its own section with a painted thumbnail.
    await page.getByTestId('wall-face-back').click();
    await page.getByRole('tab', { name: 'Finishes' }).click();
    await expect(page.locator('[data-testid="finish-swatch"][data-surface="wall"][data-finish-id^="wall.mural."]')).toHaveCount(0);
    await page.getByTestId('room-wall-face').click();
    const meadow = page.locator('[data-testid="wall-face-swatch"][data-finish-id="wall.mural.meadow.dado"]');
    await expect(page.getByTestId('wall-face-panel')).toContainText('Murals');
    await expect(meadow).toHaveAttribute('data-textured', 'true');

    const steps = await undoSteps(page);
    await meadow.click();
    await expect.poll(() => faceValue(page, face)).toBe('wall.mural.meadow.dado');
    expect(await undoSteps(page)).toBe(steps + 1);
    await expect(page.getByTestId('wall-face-current')).toContainText('Meadow mural over beadboard');
    // Drawn with the painting: the material turns white (no tint) once the picture is on it.
    await expect.poll(async () => (await surfaces(page))[key]).toEqual({ finish: 'wall.mural.meadow.dado', color: '#ffffff' });
    await expect(page.getByTestId('wall-face-mural-dado')).toBeChecked();

    // The panelling switch takes it off the painted mural too: one more undo step.
    await page.getByTestId('wall-face-mural-dado').uncheck();
    await expect.poll(() => faceValue(page, face)).toBe('wall.mural.meadow');
    expect(await undoSteps(page)).toBe(steps + 2);
    await expect(page.getByTestId('wall-face-current')).toContainText('Spring meadow mural');
    expect(errors).toEqual([]);
  });

  test('your own image as a mural: stored with the project, kept after a reload, carried in the project file', async ({ page, browser }) => {
    const errors = trackPageErrors(page);
    await openSample(page);
    await ready(page);
    const face = await openNorthFace(page);
    const key = `wall:${face.wallId}:${face.side}`;

    await expect(page.getByTestId('wall-face-mural-pick')).toHaveText('Use my image as a mural');
    await expect(page.getByTestId('wall-face-mural-dado')).toBeChecked();
    const png = await smallPng(page);
    await page.getByTestId('wall-face-mural-file').setInputFiles({ name: 'kids.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => faceValue(page, face)).toMatch(/^mural:[A-Za-z0-9_-]+:dado$/);
    const value = (await faceValue(page, face))!;
    const assetId = value.split(':')[1]!;
    await expect(toastMessage(page)).toContainText('Your picture is on the wall');
    await expect(page.getByTestId('wall-face-current')).toContainText('Your mural over beadboard');
    await expect(page.getByTestId('wall-face-mural-pick')).toHaveText('Use another image');
    await expect.poll(async () => (await surfaces(page))[key]).toEqual({ finish: value, color: '#ffffff' });

    // Without panelling, then back.
    await page.getByTestId('wall-face-mural-dado').uncheck();
    await expect.poll(() => faceValue(page, face)).toBe(`mural:${assetId}`);
    await page.getByTestId('wall-face-mural-dado').check();
    await expect.poll(() => faceValue(page, face)).toBe(value);

    // Stored in this browser with the project: it shows again after a reload.
    await expectSaved(page);
    await page.reload();
    await ready(page);
    expect(await faceValue(page, face)).toBe(value);
    await expect.poll(async () => (await surfaces(page))[key]).toEqual({ finish: value, color: '#ffffff' });

    // Exported and opened in another browser (its own, empty storage): the picture comes along.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export project file' }).click()]);
    const file = test.info().outputPath('mural.interio');
    await download.saveAs(file);
    const context = await browser.newContext();
    const other = await context.newPage();
    const otherErrors = trackPageErrors(other);
    await other.goto('/');
    await other.getByTestId('project-file-input').setInputFiles(file);
    await other.waitForURL(/\/p\/[^/]+\/design$/);
    await ready(other);
    expect(await faceValue(other, face)).toBe(value);
    const stored = await other.evaluate(async (name) => {
      const id = (window as unknown as Dev).__interio.store.getState().project.id;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('interio');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const blob = await new Promise<Blob | undefined>((resolve) => {
        const req = db.transaction('assets').objectStore('assets').get(`${id}/${name}`);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
      });
      return blob ? { type: blob.type, size: blob.size } : null;
    }, `mural/${assetId}`);
    expect(stored).toEqual({ type: 'image/png', size: png.byteLength });
    await expect.poll(async () => (await surfaces(other))[key]).toEqual({ finish: value, color: '#ffffff' });
    expect(otherErrors).toEqual([]);
    await context.close();
    expect(errors).toEqual([]);
  });
});
