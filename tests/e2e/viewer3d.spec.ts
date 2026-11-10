import { expect, test, type Page } from '@playwright/test';
import { makeBoxGlb } from '../../packages/scene3d/test/glb';
import { expectCanvasRendered, expectSaved, openSample } from './helpers';

/**
 * Design view: furnish the sample home through the UI. State is asserted three ways:
 * the DOM (panels, counters), the plan store through the `window.__interio` hook that
 * development builds expose, and the project record in IndexedDB after a reload.
 */

interface PlacedItem {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  z: number;
  rotationDeg: number;
  roomId?: string;
}

interface Hook {
  ready: boolean;
  store: {
    getState(): {
      project: { levels: { items: Record<string, PlacedItem>; rooms: Record<string, { id: string; name: string }> }[] };
      past: unknown[];
      selection: { kind: string; id: string } | null;
      addItem(item: Omit<PlacedItem, 'id'>): string;
      select(selection: { kind: string; id: string } | null): void;
    };
  };
  registerEntry(entry: unknown): void;
  project(x: number, y: number, z?: number): { x: number; y: number };
  describeItem(id: string): { min: number[]; max: number[]; meshes: string[] } | null;
}

type Dev = { __interio: Hook };

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __interio?: { ready: boolean } }).__interio?.ready === true);
  await expectCanvasRendered(page.locator('canvas'));
}

const items = (page: Page): Promise<PlacedItem[]> => page.evaluate(() => Object.values((window as unknown as Dev).__interio.store.getState().project.levels[0]!.items));
const undoSteps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().past.length);
const roomId = (page: Page, name: string): Promise<string> =>
  page.evaluate((n) => Object.values((window as unknown as Dev).__interio.store.getState().project.levels[0]!.rooms).find((r) => r.name === n)!.id, name);

/** Client coordinates of a plan point (mm). */
const at = (page: Page, x: number, y: number, z = 0): Promise<{ x: number; y: number }> =>
  page.evaluate(([px, py, pz]) => (window as unknown as Dev).__interio.project(px!, py!, pz), [x, y, z]);

/** Moves over a plan point (in two steps, so hover and ghost update) and clicks it. */
async function clickPlan(page: Page, x: number, y: number, z = 0): Promise<void> {
  const p = await at(page, x, y, z);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

async function pickEntry(page: Page, name: string): Promise<void> {
  const card = page.getByTestId('catalog-entry').filter({ hasText: name });
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/** The project's items as stored in IndexedDB. */
function storedItems(page: Page, projectId: string): Promise<PlacedItem[]> {
  return page.evaluate(
    (id) =>
      new Promise<PlacedItem[]>((resolve, reject) => {
        const open = indexedDB.open('interio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects').objectStore('projects').get(id);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve(Object.values((get.result as { levels: { items: Record<string, PlacedItem> }[] }).levels[0]!.items));
        };
      }),
    projectId,
  );
}

const count = (page: Page) => page.getByTestId('item-count');

test('place from the catalog with wall snapping, move, rotate, delete, undo, and persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const projectId = await openSample(page);
  await ready(page);
  await expect(count(page)).toHaveAttribute('data-count', '0');
  const living = await roomId(page, 'Living / Dining');

  // Catalog: search narrows the list, and the card arms placement.
  await page.getByLabel('Search the catalog').fill('sofa');
  await expect(page.getByTestId('catalog-entry')).toHaveCount(1);
  await pickEntry(page, 'Three-seat sofa');
  await expect(page.getByTestId('viewer-hint')).toContainText('Click the floor to place Three-seat sofa');

  // Place near the living room's west wall (face at x = 3060) in the south-west corner:
  // the back snaps to the wall, the sofa turns to face the room and slides clear of the corner.
  await clickPlan(page, 3400, 800);
  await expect(count(page)).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('item-name')).toHaveText('Three-seat sofa');
  await expect(page.getByTestId('item-dims')).toHaveText('2200 × 900 × 800 mm');
  await expect(page.getByTestId('item-panel')).toContainText('Living / Dining');
  await expect(page.getByTestId('item-rotation')).toHaveValue('90');
  let [sofa] = await items(page);
  expect(sofa).toMatchObject({ catalogId: 'sofa.3seat', x: 3510, y: 1200, z: 0, rotationDeg: 90, roomId: living });
  expect(await undoSteps(page)).toBe(1);
  await expect(page.getByTestId('viewer-hint')).toContainText('Drag to move');

  // Move: drag the sofa to the middle of the room. One drag is one undo step.
  const from = await at(page, sofa!.x, sofa!.y, 400);
  const to = await at(page, 6500, 2100, 400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await items(page))[0]!.x).toBeGreaterThan(5500);
  [sofa] = await items(page);
  expect(Math.abs(sofa!.x - 6500)).toBeLessThan(600);
  expect(Math.abs(sofa!.y - 2100)).toBeLessThan(600);
  // Away from every wall it keeps the rotation it had.
  expect(sofa!.rotationDeg).toBe(90);
  expect(sofa!.roomId).toBe(living);
  expect(await undoSteps(page)).toBe(2);

  // Rotate with the keyboard: 15 degree steps, back with Shift, 90 with Alt.
  await page.keyboard.press('r');
  await expect(page.getByTestId('item-rotation')).toHaveValue('105');
  await page.keyboard.press('Shift+R');
  await expect(page.getByTestId('item-rotation')).toHaveValue('90');
  await page.keyboard.press('Alt+KeyR');
  await expect(page.getByTestId('item-rotation')).toHaveValue('180');
  expect((await items(page))[0]!.rotationDeg).toBe(180);

  // Nudge with the arrow keys (the default camera looks north, so right is +x).
  const before = (await items(page))[0]!;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await items(page))[0]!.x).toBe(before.x + 50);
  expect((await items(page))[0]!.y).toBe(before.y);

  // Duplicate, then delete the copy (it is selected).
  await page.keyboard.press('ControlOrMeta+d');
  await expect(count(page)).toHaveAttribute('data-count', '2');
  const copy = (await items(page)).find((i) => i.id !== sofa!.id)!;
  expect(copy).toMatchObject({ catalogId: 'sofa.3seat', rotationDeg: 180 });
  expect(copy.x !== before.x + 50 || copy.y !== before.y).toBe(true);
  await page.keyboard.press('Delete');
  await expect(count(page)).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('item-panel')).toHaveCount(0);

  // Select the sofa again by clicking it, delete it with the panel button, then undo.
  const now = (await items(page))[0]!;
  await clickPlan(page, now.x, now.y, 400);
  await expect(page.getByTestId('item-name')).toHaveText('Three-seat sofa');
  await page.getByTestId('item-remove').click();
  await expect(count(page)).toHaveAttribute('data-count', '0');
  expect(await items(page)).toHaveLength(0);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(count(page)).toHaveAttribute('data-count', '1');
  const restored = (await items(page))[0]!;
  expect(restored).toMatchObject({ id: now.id, x: now.x, y: now.y, rotationDeg: 180 });

  // Persisted: autosave, reload, and read the record back from IndexedDB.
  await expectSaved(page);
  await page.reload();
  await ready(page);
  await expect(count(page)).toHaveAttribute('data-count', '1');
  expect(await items(page)).toEqual([restored]);
  expect(await storedItems(page, projectId)).toEqual([restored]);
  expect(errors).toEqual([]);
});

test('wall-anchored entries, room selection, the room filter and the top view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSample(page);
  await ready(page);

  // A wall-anchored entry attaches to the nearest wall of the room at its mount height.
  // Bedroom 1's north wall face is at y = 8900; the unit is 220 deep.
  await page.getByRole('tab', { name: 'Appliances' }).click();
  await pickEntry(page, 'Split air conditioner');
  await clickPlan(page, 1900, 8300);
  await expect(count(page)).toHaveAttribute('data-count', '1');
  const [ac] = await items(page);
  expect(ac).toMatchObject({ catalogId: 'ac.split', x: 1900, y: 8790, z: 2300, rotationDeg: 0, roomId: await roomId(page, 'Bedroom 1') });
  await expect(page.getByTestId('item-elevation')).toHaveValue('2300');

  // Esc deselects; clicking a floor selects its room (the hook for a finishes panel).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('item-panel')).toHaveCount(0);
  await clickPlan(page, 1500, 1000);
  await expect(page.getByTestId('room-name')).toHaveText('Kitchen');
  expect(await page.evaluate(() => (window as unknown as Dev).__interio.store.getState().selection)).toEqual({ kind: 'room', id: await roomId(page, 'Kitchen') });

  // The catalog can be narrowed to what suits that room.
  await page.getByRole('tab', { name: 'All' }).click();
  const filter = page.getByTestId('catalog-room-filter');
  await expect(page.getByText('Suggested for Kitchen')).toBeVisible();
  await filter.check();
  await expect(page.getByTestId('catalog-entry').filter({ hasText: 'Double-door refrigerator' })).toHaveCount(1);
  await expect(page.getByTestId('catalog-entry').filter({ hasText: 'Double bed' })).toHaveCount(0);
  await filter.uncheck();
  await expect(page.getByTestId('catalog-entry').filter({ hasText: 'Double bed' })).toHaveCount(1);

  // Top view and back: the scene keeps drawing, and placing works looking straight down.
  await page.getByRole('tab', { name: 'Top' }).click();
  await page.waitForTimeout(700);
  await expectCanvasRendered(page.locator('canvas'));
  await pickEntry(page, 'Coffee table');
  await clickPlan(page, 6500, 2100);
  await expect(count(page)).toHaveAttribute('data-count', '2');
  const table = (await items(page)).find((i) => i.catalogId === 'table.coffee')!;
  expect(table).toMatchObject({ x: 6500, y: 2100, rotationDeg: 0 });
  await page.getByRole('tab', { name: '3D' }).click();
  await page.waitForTimeout(700);
  await expectCanvasRendered(page.locator('canvas'));
  expect(errors).toEqual([]);
});

test('a GLB entry is loaded and fitted to its catalog dimensions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSample(page);
  await ready(page);

  // A model in its own units, off-centre, with its long side along z: yawDeg 90 turns it.
  const glb = Array.from(new Uint8Array(makeBoxGlb({ min: [10, 5, -40], max: [30, 45, 40], scale: 0.3, name: 'glb-test-mesh' })));
  const id = await page.evaluate((bytes) => {
    const h = (window as unknown as Dev).__interio;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'model/gltf-binary' }));
    h.registerEntry({
      id: 'test.glb',
      name: 'Test GLB',
      category: 'decor',
      roomTypes: [],
      dims: { w: 1600, d: 600, h: 1200 },
      anchor: 'floor',
      model: { kind: 'glb', url, yawDeg: 90 },
      licence: 'test',
    });
    const state = h.store.getState();
    const itemId = state.addItem({ catalogId: 'test.glb', x: 6500, y: 2100, z: 0, rotationDeg: 0 });
    state.select({ kind: 'item', id: itemId });
    return itemId;
  }, glb);

  await expect(page.getByTestId('item-name')).toHaveText('Test GLB');
  // The GLB's own mesh replaces the stand-in box...
  await expect.poll(async () => (await page.evaluate((i) => (window as unknown as Dev).__interio.describeItem(i), id))?.meshes).toEqual(['glb-test-mesh']);
  // ...and is stretched to dims with its bottom-centre on the item position (world metres, z = -y).
  const drawn = (await page.evaluate((i) => (window as unknown as Dev).__interio.describeItem(i), id))!;
  const expected = { min: [6.5 - 0.8, 0, -2.1 - 0.3], max: [6.5 + 0.8, 1.2, -2.1 + 0.3] };
  drawn.min.forEach((v, i) => expect(v).toBeCloseTo(expected.min[i]!, 3));
  drawn.max.forEach((v, i) => expect(v).toBeCloseTo(expected.max[i]!, 3));

  // A missing model falls back to the box instead of breaking the scene.
  const missing = await page.evaluate(() => {
    const h = (window as unknown as Dev).__interio;
    h.registerEntry({
      id: 'test.missing',
      name: 'Missing GLB',
      category: 'decor',
      roomTypes: [],
      dims: { w: 500, d: 500, h: 500 },
      anchor: 'floor',
      model: { kind: 'glb', url: '/catalog/does-not-exist.glb' },
      licence: 'test',
    });
    return h.store.getState().addItem({ catalogId: 'test.missing', x: 8500, y: 2100, z: 0, rotationDeg: 0 });
  });
  await expect.poll(async () => (await page.evaluate((i) => (window as unknown as Dev).__interio.describeItem(i), missing))?.max[1]).toBeCloseTo(0.5, 3);
  await expectCanvasRendered(page.locator('canvas'));
  expect(errors).toEqual([]);
});
