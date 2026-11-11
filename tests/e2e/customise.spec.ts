import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectCanvasRendered, expectSaved, openSample } from './helpers';

/**
 * Customising the sample home in Design mode: the finishes of a bed's parts, an accent
 * wall, a custom floor colour, and the Showcase view with its picture. State is checked
 * in the plan store and in what the scene draws (`window.__interio`), and after a reload.
 */

interface PlacedItem {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  roomId?: string;
  finishes?: Record<string, string>;
}

interface Hook {
  ready: boolean;
  store: {
    getState(): {
      project: {
        levels: {
          items: Record<string, PlacedItem>;
          rooms: Record<string, { id: string; name: string; floorMaterial: string; wallMaterial?: string }>;
          walls: Record<string, { id: string; finishLeft?: string; finishRight?: string }>;
        }[];
      };
      past: unknown[];
      selection: { kind: string; id: string } | null;
      addItem(item: Omit<PlacedItem, 'id'> & { z: number; rotationDeg: number }): string;
      select(selection: { kind: string; id: string } | null): void;
    };
  };
  ui: { getState(): { wallFace: { wallId: string; side: 'left' | 'right'; roomId: string | null } | null; view: string } };
  project(x: number, y: number, z?: number): { x: number; y: number };
  describeItem(id: string): { meshes: string[]; materials: Record<string, string> } | null;
  describeSurfaces(): Record<string, { finish: string; color: string }>;
}

type Dev = { __interio: Hook };

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __interio?: { ready: boolean } }).__interio?.ready === true);
  await expectCanvasRendered(page.locator('canvas'));
}

const level = (page: Page) => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().project.levels[0]!);
const undoSteps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().past.length);
const itemFinishes = async (page: Page, id: string) => (await level(page)).items[id]?.finishes;
const drawn = (page: Page, id: string) => page.evaluate((i) => (window as unknown as Dev).__interio.describeItem(i)?.materials ?? {}, id);
const surfaces = (page: Page) => page.evaluate(() => (window as unknown as Dev).__interio.describeSurfaces());
const undo = (page: Page) => page.getByRole('button', { name: /^Undo/ }).click();

async function clickPlan(page: Page, x: number, y: number, z = 0, modifiers: ('Alt' | 'Shift')[] = []): Promise<void> {
  const p = await page.evaluate(([px, py, pz]) => (window as unknown as Dev).__interio.project(px!, py!, pz), [x, y, z]);
  await page.mouse.move(p.x - 4, p.y - 4);
  await page.mouse.move(p.x, p.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

const swatch = (page: Page, slot: string, material: string) => page.locator(`[data-testid="material-swatch"][data-slot="${slot}"][data-material-id="${material}"]`);
const custom = (page: Page, slot: string) => page.locator(`[data-testid="slot-custom"][data-slot="${slot}"]`);
const current = (page: Page, slot: string) => page.locator(`[data-testid="slot-current"][data-slot="${slot}"]`);

// Bedroom 1 spans x 0..3800, y 5400..9000 in the sample plan; its north wall has a window below 2.1 m.
const BEDROOM = { x: 1900, y: 7200 };
const NORTH_WALL = { x: 1900, y: 8880, z: 2500 };

test.describe('customise furniture and walls', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('a bed: pick a listed material and a custom colour per slot, undo, apply to all, default, and keep it after a reload', async ({ page }) => {
    const projectId = await openSample(page);
    await ready(page);

    // Place a double bed in Bedroom 1 from the catalog.
    const card = page.locator('[data-testid="catalog-entry"][data-entry-id="bed.double"]');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await clickPlan(page, BEDROOM.x, BEDROOM.y);
    await expect(page.getByTestId('item-name')).toHaveText('Double bed');
    const bed = (await page.evaluate(() => (window as unknown as Dev).__interio.store.getState().selection))!.id;

    // One row per slot of the entry, the defaults marked.
    const finishes = page.getByTestId('item-finishes');
    await expect(finishes).toBeVisible();
    await expect(finishes.getByTestId('item-slot')).toHaveCount(4);
    await expect(swatch(page, 'frame', 'wood.oak')).toHaveAttribute('aria-pressed', 'true');
    await expect(current(page, 'headboard')).toHaveText('Sand linen');
    // The slot's own kind first: a fabric slot shows fabrics, the woods are behind More.
    await expect(swatch(page, 'headboard', 'fabric.velvet.navy')).toBeVisible();
    await expect(swatch(page, 'headboard', 'wood.walnut')).toHaveCount(0);
    // Swatches show the real texture.
    await expect(swatch(page, 'frame', 'wood.walnut')).toHaveAttribute('data-textured', 'true');
    await expect(drawn(page, bed)).resolves.toMatchObject({ frame: 'wood.oak', headboard: 'fabric.linen.sand', throw: 'fabric.linen.taupe' });

    // A listed material: one undo step, written to the item and drawn by the model.
    const steps = await undoSteps(page);
    await swatch(page, 'headboard', 'fabric.velvet.navy').click();
    await expect.poll(() => itemFinishes(page, bed)).toEqual({ headboard: 'fabric.velvet.navy' });
    expect(await undoSteps(page)).toBe(steps + 1);
    await expect(current(page, 'headboard')).toHaveText('Navy velvet');
    await expect.poll(async () => (await drawn(page, bed)).headboard).toBe('fabric.velvet.navy');

    // A custom colour on another slot.
    await custom(page, 'throw').fill('#c0392b');
    await expect.poll(() => itemFinishes(page, bed)).toEqual({ headboard: 'fabric.velvet.navy', throw: '#c0392b' });
    expect(await undoSteps(page)).toBe(steps + 2);
    await expect(current(page, 'throw')).toHaveText('Custom #c0392b');
    await expect.poll(async () => (await drawn(page, bed)).throw).toBe('#c0392b');

    // A material of another kind, from More.
    await page.locator('[data-testid="slot-more"][data-slot="frame"]').click();
    await swatch(page, 'frame', 'metal.black').click();
    await expect.poll(async () => (await drawn(page, bed)).frame).toBe('metal.black');

    // Undo steps back one pick at a time.
    await undo(page);
    await expect.poll(async () => (await drawn(page, bed)).frame).toBe('wood.oak');
    await undo(page);
    await expect.poll(() => itemFinishes(page, bed)).toEqual({ headboard: 'fabric.velvet.navy' });
    await expect.poll(async () => (await drawn(page, bed)).throw).toBe('fabric.linen.taupe');
    // Undo leaves nothing selected: click the bed to edit it again.
    const placed = (await level(page)).items[bed]!;
    await clickPlan(page, placed.x, placed.y, 500);
    await expect(page.getByTestId('item-name')).toHaveText('Double bed');
    await custom(page, 'throw').fill('#c0392b');
    await expect.poll(() => itemFinishes(page, bed)).toEqual({ headboard: 'fabric.velvet.navy', throw: '#c0392b' });

    // A second double bed elsewhere, then "Apply to all": one undo step.
    const other = await page.evaluate(() => {
      const s = (window as unknown as Dev).__interio.store.getState();
      const room = Object.values(s.project.levels[0]!.rooms).find((r) => r.name === 'Bedroom 2')!;
      return s.addItem({ catalogId: 'bed.double', x: 0, y: 0, z: 0, rotationDeg: 0, roomId: room.id });
    });
    await page.evaluate((id) => (window as unknown as Dev).__interio.store.getState().select({ kind: 'item', id }), bed);
    const before = await undoSteps(page);
    await page.getByTestId('item-finish-apply-all').click();
    await expect.poll(() => itemFinishes(page, other)).toEqual({ headboard: 'fabric.velvet.navy', throw: '#c0392b' });
    expect(await undoSteps(page)).toBe(before + 1);
    await expect.poll(async () => (await drawn(page, other)).headboard).toBe('fabric.velvet.navy');
    await expect(page.getByTestId('item-finish-apply-all')).toBeDisabled();

    // Default clears one slot.
    await page.locator('[data-testid="slot-default"][data-slot="headboard"]').click();
    await expect.poll(() => itemFinishes(page, bed)).toEqual({ throw: '#c0392b' });
    await expect(page.locator('[data-testid="slot-default"][data-slot="headboard"]')).toBeDisabled();

    // Saved with the project.
    await expectSaved(page);
    await page.reload();
    await ready(page);
    expect(await itemFinishes(page, bed)).toEqual({ throw: '#c0392b' });
    expect(await itemFinishes(page, other)).toEqual({ headboard: 'fabric.velvet.navy', throw: '#c0392b' });
    await expect.poll(async () => (await drawn(page, bed)).throw).toBe('#c0392b');
    expect(page.url()).toContain(projectId);
  });

  test('an accent wall: a listed finish and a custom colour on one face, cleared again; a custom floor colour', async ({ page }) => {
    await openSample(page);
    await ready(page);

    // A first click on a wall selects its room, as before, and remembers the face.
    await clickPlan(page, NORTH_WALL.x, NORTH_WALL.y, NORTH_WALL.z);
    await expect(page.getByTestId('room-name')).toHaveText('Bedroom 1');
    await page.getByRole('tab', { name: 'Finishes' }).click();
    const face = (await page.evaluate(() => (window as unknown as Dev).__interio.ui.getState().wallFace))!;
    expect(face.roomId).not.toBeNull();
    const key = `wall:${face.wallId}:${face.side}`;
    const prop = face.side === 'left' ? 'finishLeft' : 'finishRight';
    const faceValue = async () => (await level(page)).walls[face.wallId]![prop];

    // "This wall only" switches the panel to that face.
    await page.getByTestId('room-wall-face').click();
    await expect(page.getByTestId('wall-face-panel')).toBeVisible();
    await expect(page.getByTestId('wall-face-title')).toHaveText('Wall of Bedroom 1');

    // A listed finish: one undo step, on that face only.
    const steps = await undoSteps(page);
    await page.locator('[data-testid="wall-face-swatch"][data-finish-id="wall.marble"]').click();
    await expect.poll(faceValue).toBe('wall.marble');
    expect(await undoSteps(page)).toBe(steps + 1);
    await expect.poll(async () => (await surfaces(page))[key]?.finish).toBe('wall.marble');
    const otherFaces = Object.entries(await surfaces(page)).filter(([k]) => k.startsWith('wall:') && k !== key && k.split(':')[1] !== face.wallId);
    expect(otherFaces.some(([, v]) => v.finish === 'wall.marble')).toBe(false);
    await expect(page.getByTestId('wall-face-current')).toContainText('Marble cladding');

    // A custom colour.
    await page.getByTestId('wall-face-custom').fill('#2f5d62');
    await expect.poll(faceValue).toBe('#2f5d62');
    await expect.poll(async () => (await surfaces(page))[key]?.finish).toBe('#2f5d62');
    expect((await surfaces(page))[key]!.color).toMatch(/^#(2[ef]|30)(5[cde])(6[123])$/);

    // Back to the room's finish.
    await page.getByTestId('wall-face-clear').click();
    await expect.poll(faceValue).toBeUndefined();
    await expect.poll(async () => (await surfaces(page))[key]?.finish).toBe('wall.paint.white');
    await expect(page.getByTestId('wall-face-clear')).toBeDisabled();
    await undo(page);
    await expect.poll(faceValue).toBe('#2f5d62');

    // Alt-click goes straight to a face.
    await page.keyboard.press('Escape');
    await clickPlan(page, NORTH_WALL.x, NORTH_WALL.y, NORTH_WALL.z, ['Alt']);
    await expect(page.getByTestId('wall-face-panel')).toBeVisible();

    // A custom floor colour for the room, from its Finishes tab.
    await page.getByTestId('wall-face-back').click();
    await expect(page.getByTestId('room-name')).toHaveText('Bedroom 1');
    await page.getByRole('tab', { name: 'Finishes' }).click();
    await page.locator('[data-testid="finish-custom"][data-surface="floor"]').fill('#8a6f5a');
    const room = face.roomId!;
    await expect.poll(async () => (await level(page)).rooms[room]!.floorMaterial).toBe('#8a6f5a');
    await expect(page.getByTestId('finish-current-floor')).toHaveText('Custom #8a6f5a');
    await expect.poll(async () => Object.entries(await surfaces(page)).some(([k, v]) => k.startsWith('floor:') && v.finish === '#8a6f5a')).toBe(true);
    // The palette is grouped, and every listed finish is still there.
    await expect(page.getByTestId('finish-group-wall')).toContainText('Panelling and paper');
    await expect(page.locator('[data-testid="finish-swatch"][data-surface="wall"][data-finish-id="wall.panel.fluted"]')).toHaveCount(1);
  });

  test('the Showcase view frames the home from above and exports a large picture', async ({ page }) => {
    await openSample(page);
    await ready(page);
    await page.getByTestId('furnish-home').click();
    await expect(page.getByTestId('item-count')).not.toHaveAttribute('data-count', '0');
    const box = (await page.locator('canvas').boundingBox())!;

    await page.getByRole('tab', { name: /Showcase/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Dev).__interio.ui.getState().view)).toBe('showcase');
    await expectCanvasRendered(page.locator('canvas'));

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-picture').click()]);
    expect(download.suggestedFilename()).toMatch(/^interio-sample-3-bedroom-apartment-[\d-]+\.png$/);
    const file = await readFile((await download.path())!);
    expect([...file.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Larger than the 2x picture of the other views.
    expect(file.readUInt32BE(16)).toBeGreaterThan(Math.round(box.width) * 2);
    expect(file.byteLength).toBeGreaterThan(150_000);
    await expect(page.getByText('Picture saved to your downloads')).toBeVisible();
    await expectCanvasRendered(page.locator('canvas'));
  });
});
