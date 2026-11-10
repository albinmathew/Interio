import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { autoFurnish } from '../../packages/catalog/src';
import { MATERIAL_LIST } from '../../packages/core/src/materials';
import type { Level } from '../../packages/core/src/schema';
import { expectCanvasRendered, expectSaved, gotoMode, openSample } from './helpers';

/**
 * Styling the sample home in Design mode: room finishes, whole-home furnishing,
 * lighting presets and picture export. State is asserted through the DOM, the plan
 * store (`window.__interio`, development builds) and the record in IndexedDB.
 */

interface RoomData {
  id: string;
  name: string;
  type: string;
  floorMaterial: string;
  wallMaterial?: string;
  ceilingMaterial?: string;
}
interface ProjectData {
  id: string;
  settings: Record<string, unknown>;
  levels: (Level & { rooms: Record<string, RoomData> })[];
}
interface Hook {
  ready: boolean;
  store: {
    getState(): {
      project: ProjectData;
      past: unknown[];
      loadProject(project: unknown): void;
    };
  };
  project(x: number, y: number, z?: number): { x: number; y: number };
}
type Dev = { __interio: Hook };

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __interio?: { ready: boolean } }).__interio?.ready === true);
  await expectCanvasRendered(page.locator('canvas'));
}

const project = (page: Page): Promise<ProjectData> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().project);
const rooms = async (page: Page): Promise<RoomData[]> => Object.values((await project(page)).levels[0]!.rooms);
const room = async (page: Page, name: string): Promise<RoomData> => (await rooms(page)).find((r) => r.name === name)!;
const itemRooms = async (page: Page): Promise<(string | undefined)[]> => Object.values((await project(page)).levels[0]!.items).map((i) => i.roomId);
const undoSteps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().past.length);

/** The project record as stored in IndexedDB. */
function stored(page: Page, projectId: string): Promise<ProjectData> {
  return page.evaluate(
    (id) =>
      new Promise<ProjectData>((resolve, reject) => {
        const open = indexedDB.open('interio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects').objectStore('projects').get(id);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve(get.result as ProjectData);
        };
      }),
    projectId,
  );
}

/** Selects the room around a plan point (mm) by clicking its floor. */
async function selectRoom(page: Page, x: number, y: number, name: string): Promise<void> {
  const p = await page.evaluate(([px, py]) => (window as unknown as Dev).__interio.project(px!, py!), [x, y]);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('room-name')).toHaveText(name);
}

const swatch = (page: Page, surface: 'floor' | 'wall' | 'ceiling', id: string) =>
  page.locator(`[data-testid="finish-swatch"][data-surface="${surface}"][data-finish-id="${id}"]`);
const count = (page: Page) => page.getByTestId('item-count');
const undo = (page: Page) => page.getByRole('button', { name: /^Undo/ });

/** Mean brightness (0..255) of what the canvas shows. */
async function brightness(page: Page): Promise<number> {
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

// Bedroom 1 spans x 0..3800, y 5400..9000 in the sample plan.
const BEDROOM: [number, number, string] = [1900, 7200, 'Bedroom 1'];

test.describe('finishes and styling', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('pick floor, wall and ceiling finishes for a room; they apply live, undo one at a time and persist', async ({ page }) => {
    const projectId = await openSample(page);
    await ready(page);
    await selectRoom(page, ...BEDROOM);

    // The room panel keeps furnishing and finishes apart.
    await expect(page.getByTestId('room-autofurnish')).toBeVisible();
    await expect(page.getByTestId('finishes-panel')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Finishes' }).click();
    await expect(page.getByTestId('finishes-panel')).toBeVisible();
    await expect(page.getByTestId('room-autofurnish')).toHaveCount(0);

    // Every finish of the palette is offered under its surface, named, with the current one marked.
    for (const surface of ['floor', 'wall'] as const) {
      const ids = MATERIAL_LIST.filter((m) => m.surface === surface).map((m) => m.id);
      await expect(page.locator(`[data-testid="finish-swatch"][data-surface="${surface}"]`)).toHaveCount(ids.length);
      for (const id of ids) await expect(swatch(page, surface, id)).toHaveCount(1);
    }
    await expect(swatch(page, 'ceiling', 'ceiling.white')).toHaveAttribute('aria-pressed', 'true');
    await expect(swatch(page, 'floor', 'floor.oak')).toHaveAttribute('aria-pressed', 'true');
    await expect(swatch(page, 'floor', 'floor.oak')).toHaveAttribute('title', 'Oak planks');
    await expect(page.locator('[data-testid="finish-swatch"][data-surface="floor"][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByTestId('finish-current-floor')).toHaveText('Oak planks');
    await expect(page.getByTestId('finish-current-wall')).toHaveText('Warm white');
    // Textured finishes show their texture, paints a flat colour.
    await expect(swatch(page, 'floor', 'floor.walnut')).toHaveAttribute('data-textured', 'true');
    await expect(swatch(page, 'wall', 'wall.brick')).toHaveAttribute('data-textured', 'true');
    await expect(swatch(page, 'wall', 'wall.paint.sage')).toHaveAttribute('data-textured', 'false');
    expect(await swatch(page, 'floor', 'floor.walnut').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('data:image');

    // Each pick is written to the plan at once, as one undo step.
    await swatch(page, 'floor', 'floor.walnut').click();
    await expect(swatch(page, 'floor', 'floor.walnut')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('finish-current-floor')).toHaveText('Walnut planks');
    expect(await room(page, 'Bedroom 1')).toMatchObject({ floorMaterial: 'floor.walnut' });
    expect(await undoSteps(page)).toBe(1);
    await swatch(page, 'wall', 'wall.paint.sage').click();
    await expect(page.getByTestId('finish-current-wall')).toHaveText('Sage');
    expect(await undoSteps(page)).toBe(2);
    await swatch(page, 'ceiling', 'wall.paint.sky').click();
    await expect(page.getByTestId('finish-current-ceiling')).toHaveText('Sky blue');
    expect(await undoSteps(page)).toBe(3);
    // Picking the current finish again changes nothing.
    await swatch(page, 'ceiling', 'wall.paint.sky').click();
    expect(await undoSteps(page)).toBe(3);
    const styled = { floorMaterial: 'floor.walnut', wallMaterial: 'wall.paint.sage', ceilingMaterial: 'wall.paint.sky' };
    expect(await room(page, 'Bedroom 1')).toMatchObject(styled);
    // Other rooms are untouched, and the 3D view keeps drawing.
    expect(await room(page, 'Bedroom 2')).toMatchObject({ floorMaterial: 'floor.oak' });
    expect((await room(page, 'Bedroom 2')).wallMaterial).toBeUndefined();
    await expectCanvasRendered(page.locator('canvas'));

    // One undo takes back one pick.
    await undo(page).click();
    expect((await room(page, 'Bedroom 1')).ceilingMaterial).toBeUndefined();
    expect(await room(page, 'Bedroom 1')).toMatchObject({ floorMaterial: 'floor.walnut', wallMaterial: 'wall.paint.sage' });
    await page.getByRole('button', { name: /^Redo/ }).click();
    expect(await room(page, 'Bedroom 1')).toMatchObject(styled);

    // Persisted: autosave, reload, and read the record back.
    await expectSaved(page);
    await page.reload();
    await ready(page);
    expect(await room(page, 'Bedroom 1')).toMatchObject(styled);
    const saved = Object.values((await stored(page, projectId)).levels[0]!.rooms).find((r) => r.name === 'Bedroom 1')!;
    expect(saved).toMatchObject(styled);
    await selectRoom(page, ...BEDROOM);
    await page.getByRole('tab', { name: 'Finishes' }).click();
    await expect(swatch(page, 'floor', 'floor.walnut')).toHaveAttribute('aria-pressed', 'true');
    await expect(swatch(page, 'wall', 'wall.paint.sage')).toHaveAttribute('aria-pressed', 'true');
    await expect(swatch(page, 'ceiling', 'wall.paint.sky')).toHaveAttribute('aria-pressed', 'true');

    // Reset puts the room back on the finishes its type starts with, in one step.
    await page.getByTestId('finish-reset').click();
    const reset = await room(page, 'Bedroom 1');
    expect(reset).toMatchObject({ floorMaterial: 'floor.oak', wallMaterial: 'wall.paint.white' });
    expect(reset.ceilingMaterial).toBeUndefined();
    expect(await undoSteps(page)).toBe(1);
    await expect(page.getByTestId('finish-reset')).toBeDisabled();
  });

  test('apply a room finish to its room type and to every room, each as one undo step', async ({ page }) => {
    await openSample(page);
    await ready(page);
    const before = await rooms(page);
    await selectRoom(page, ...BEDROOM);
    await page.getByRole('tab', { name: 'Finishes' }).click();
    // Nothing to copy yet: the other bedrooms look the same.
    await expect(page.getByTestId('finish-apply-type')).toHaveText('Apply to all bedrooms');
    await expect(page.getByTestId('finish-apply-type')).toBeDisabled();

    await swatch(page, 'floor', 'floor.herringbone').click();
    await swatch(page, 'wall', 'wall.paint.blush').click();
    expect(await undoSteps(page)).toBe(2);
    const look = { floorMaterial: 'floor.herringbone', wallMaterial: 'wall.paint.blush' };

    // Bedrooms only.
    await page.getByTestId('finish-apply-type').click();
    expect(await undoSteps(page)).toBe(3);
    for (const r of await rooms(page)) {
      if (r.type === 'bedroom') expect(r).toMatchObject(look);
      else expect(r).toEqual(before.find((b) => b.id === r.id));
    }
    await expect(page.getByTestId('finish-apply-type')).toBeDisabled();

    // Every room, then undo: one step brings all of them back.
    await page.getByTestId('finish-apply-all').click();
    expect(await undoSteps(page)).toBe(4);
    const all = await rooms(page);
    expect(all).toHaveLength(before.length);
    for (const r of all) expect(r).toMatchObject(look);
    await expect(page.getByTestId('finish-apply-all')).toBeDisabled();
    await undo(page).click();
    expect(await undoSteps(page)).toBe(3);
    for (const r of await rooms(page)) {
      if (r.type === 'bedroom') expect(r).toMatchObject(look);
      else expect(r).toEqual(before.find((b) => b.id === r.id));
    }
    // And one more undoes the bedrooms.
    await undo(page).click();
    expect(await room(page, 'Bedroom 1')).toMatchObject(look);
    expect(await room(page, 'Bedroom 2')).toEqual(before.find((b) => b.name === 'Bedroom 2'));
  });

  test('furnish the whole home, then clear the furniture after a confirmation', async ({ page }) => {
    await openSample(page);
    await ready(page);
    await expect(count(page)).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('clear-furniture')).toBeDisabled();

    // The rooms the catalog has a layout for, worked out from the same plan in Node.
    const level = (await project(page)).levels[0]!;
    const expected = Object.values(level.rooms).filter((r) => autoFurnish(level, r.id).length > 0);
    expect(expected.length).toBeGreaterThan(5);

    await page.getByTestId('furnish-home').click();
    await expect.poll(async () => (await itemRooms(page)).length).toBeGreaterThan(expected.length);
    const placed = await itemRooms(page);
    await expect(count(page)).toHaveAttribute('data-count', String(placed.length));
    for (const r of expected) expect(placed.filter((id) => id === r.id).length, `${r.name} (${r.type}) has furniture`).toBeGreaterThan(0);
    // Every room type with a template is covered.
    const furnishedTypes = new Set(Object.values(level.rooms).filter((r) => placed.includes(r.id)).map((r) => r.type));
    expect([...furnishedTypes].sort()).toEqual([...new Set(expected.map((r) => r.type))].sort());
    await expect(page.getByText(`Added ${placed.length} items to ${new Set(placed).size} rooms`)).toBeVisible();
    // One undo step for the whole home.
    expect(await undoSteps(page)).toBe(1);
    // Nothing more can be added: the button is off, or says so and leaves the plan alone.
    if (await page.getByTestId('furnish-home').isEnabled()) {
      await page.getByTestId('furnish-home').click();
      await expect(page.getByText('Nothing to suggest for the rooms that are still empty')).toBeVisible();
    } else {
      await expect(page.getByTestId('furnish-home')).toHaveAttribute('title', 'Every room already has furniture');
    }
    expect(await itemRooms(page)).toHaveLength(placed.length);
    expect(await undoSteps(page)).toBe(1);
    await expectCanvasRendered(page.locator('canvas'));

    // Clearing asks first.
    await page.getByTestId('clear-furniture').click();
    const dialog = page.getByRole('dialog', { name: 'Clear furniture' });
    await expect(dialog).toContainText(`Remove all ${placed.length} items`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(count(page)).toHaveAttribute('data-count', String(placed.length));
    await page.getByTestId('clear-furniture').click();
    await page.getByTestId('clear-furniture-confirm').click();
    await expect(count(page)).toHaveAttribute('data-count', '0');
    expect(await itemRooms(page)).toHaveLength(0);
    expect(await undoSteps(page)).toBe(2);
    await expect(page.getByTestId('furnish-home')).toBeEnabled();

    // Undo brings every item back in one step.
    await undo(page).click();
    await expect(count(page)).toHaveAttribute('data-count', String(placed.length));
  });

  test('lighting presets are saved with the project and followed by Walk mode', async ({ page }) => {
    const projectId = await openSample(page);
    await ready(page);
    const preset = page.getByTestId('lighting-preset');
    await expect(preset).toHaveAttribute('data-preset', 'daylight');
    await expect(page.getByRole('tab', { name: 'Daylight' })).toHaveAttribute('aria-selected', 'true');
    expect((await project(page)).settings['viewer3d.lighting']).toBeUndefined();
    const day = await brightness(page);

    await page.getByRole('tab', { name: 'Warm evening' }).click();
    await expect(preset).toHaveAttribute('data-preset', 'evening');
    expect((await project(page)).settings['viewer3d.lighting']).toBe('evening');
    await expectCanvasRendered(page.locator('canvas'));

    await page.getByRole('tab', { name: 'Night' }).click();
    await expect(preset).toHaveAttribute('data-preset', 'night');
    expect((await project(page)).settings['viewer3d.lighting']).toBe('night');
    await expectCanvasRendered(page.locator('canvas'));
    // The view really is darker at night.
    await expect.poll(() => brightness(page)).toBeLessThan(day * 0.7);

    // Saved with the project.
    await expectSaved(page);
    expect((await stored(page, projectId)).settings['viewer3d.lighting']).toBe('night');
    await page.reload();
    await ready(page);
    await expect(preset).toHaveAttribute('data-preset', 'night');
    await expect(page.getByRole('tab', { name: 'Night' })).toHaveAttribute('aria-selected', 'true');

    // Walk mode uses the same preset: its night is darker than its day.
    await gotoMode(page, 'walk');
    await expectCanvasRendered(page.locator('canvas'));
    const walkNight = await brightness(page);
    await gotoMode(page, 'design');
    await ready(page);
    await page.getByRole('tab', { name: 'Daylight' }).click();
    await expect(preset).toHaveAttribute('data-preset', 'daylight');
    await gotoMode(page, 'walk');
    await expectCanvasRendered(page.locator('canvas'));
    await expect.poll(() => brightness(page)).toBeGreaterThan(walkNight * 1.1);
  });

  test('the camera button downloads a PNG of the view at twice the resolution', async ({ page }) => {
    await openSample(page);
    await ready(page);
    await page.getByTestId('furnish-home').click();
    await expect.poll(async () => (await itemRooms(page)).length).toBeGreaterThan(5);
    const box = (await page.locator('canvas').boundingBox())!;

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-picture').click()]);
    expect(download.suggestedFilename()).toMatch(/^interio-sample-3-bedroom-apartment-[\d-]+\.png$/);
    const file = await readFile((await download.path())!);
    // A real picture: PNG signature, twice the canvas size, and far more than an empty frame would weigh.
    expect([...file.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(file.readUInt32BE(16)).toBe(Math.round(box.width) * 2);
    expect(file.readUInt32BE(20)).toBe(Math.round(box.height) * 2);
    expect(file.byteLength).toBeGreaterThan(100_000);
    await expect(page.getByText('Picture saved to your downloads')).toBeVisible();

    // The view itself is back at its own size and still drawing.
    expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBe(Math.round(box.width));
    await expectCanvasRendered(page.locator('canvas'));
  });

  test('a plan without rooms or walls points to Plan mode', async ({ page }) => {
    const projectId = await openSample(page);
    await ready(page);
    await expect(page.getByTestId('viewer-hint')).toBeVisible();

    // One loose wall: the 3D view still shows it, and says what is missing.
    await page.evaluate(() => {
      const state = (window as unknown as Dev).__interio.store.getState();
      const level = state.project.levels[0]!;
      const wall = Object.values(level.walls)[0]!;
      state.loadProject({
        ...state.project,
        levels: [{ ...level, walls: { [wall.id]: wall }, vertices: { [wall.a]: level.vertices[wall.a], [wall.b]: level.vertices[wall.b] }, openings: {}, rooms: {}, items: {} }],
      });
    });
    await expect(page.getByTestId('viewer-no-rooms')).toContainText('No rooms yet');
    await expect(page.getByTestId('viewer-hint')).toHaveCount(0);
    await expect(page.getByTestId('furnish-home')).toBeDisabled();
    await expectCanvasRendered(page.locator('canvas'), 3);

    // No walls at all: a plain empty state with the way out.
    await page.evaluate(() => {
      const state = (window as unknown as Dev).__interio.store.getState();
      state.loadProject({ ...state.project, levels: [{ ...state.project.levels[0]!, walls: {}, vertices: {} }] });
    });
    await expect(page.getByTestId('viewer-empty')).toContainText('Nothing to furnish yet');
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByTestId('open-plan-mode').click();
    await page.waitForURL(new RegExp(`/p/${projectId}/plan$`));
    await expect(page.getByTestId('feature-plan')).toBeVisible();
  });

  test('the Design panels fit a 1280 x 720 window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openSample(page);
    await ready(page);
    await selectRoom(page, ...BEDROOM);
    await page.getByRole('tab', { name: 'Finishes' }).click();
    const main = (await page.getByTestId('feature-design').boundingBox())!;
    const inside = async (testId: string) => {
      const b = (await page.getByTestId(testId).boundingBox())!;
      expect(b.x, `${testId} left`).toBeGreaterThanOrEqual(main.x);
      expect(b.y, `${testId} top`).toBeGreaterThanOrEqual(main.y);
      expect(b.x + b.width, `${testId} right`).toBeLessThanOrEqual(main.x + main.width);
      expect(b.y + b.height, `${testId} bottom`).toBeLessThanOrEqual(main.y + main.height);
      return b;
    };
    const catalog = await inside('catalog-panel');
    const toolbar = await inside('design-toolbar');
    const side = await inside('side-panel');
    await inside('finish-reset');
    // The toolbar sits between the two side panels without touching either.
    expect(toolbar.x).toBeGreaterThan(catalog.x + catalog.width);
    expect(toolbar.x + toolbar.width).toBeLessThan(side.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

    // The whole catalog is in the list, and only the thumbnails near the viewport have loaded.
    const cards = page.getByTestId('catalog-entry');
    const total = await cards.count();
    expect(total).toBeGreaterThan(150);
    const loaded = () => page.locator('[data-testid="catalog-entry"] img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length);
    expect(await loaded()).toBeLessThan(total / 2);
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
    await expect.poll(async () => cards.last().locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  });
});
