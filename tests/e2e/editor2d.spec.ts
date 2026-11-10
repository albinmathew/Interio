import { expect, test, type Page } from '@playwright/test';
import { gotoMode, openSample } from './helpers';

declare global {
  interface Window {
    __interioEditor2d?: { installSyntheticUnderlay(opts?: { segments?: number; rect?: [number, number, number, number] }): Promise<number> };
  }
}

/** Reads the editor camera and returns a function mapping plan millimetres to page pixels. */
async function planToPage(page: Page): Promise<(x: number, y: number) => { x: number; y: number }> {
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!;
  const [scale, tx, ty] = await Promise.all(['data-scale', 'data-tx', 'data-ty'].map(async (name) => Number(await canvas.getAttribute(name))));
  return (x, y) => ({ x: box.x + tx! + x * scale!, y: box.y + ty! - y * scale! });
}

async function hover(page: Page, x: number, y: number): Promise<void> {
  const p = (await planToPage(page))(x, y);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

async function click(page: Page, x: number, y: number): Promise<void> {
  await hover(page, x, y);
  const p = (await planToPage(page))(x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const P = await planToPage(page);
  const a = P(...from);
  const b = P(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

const panel = (page: Page) => page.getByTestId('properties-panel');
const field = (page: Page, label: string) => panel(page).getByLabel(label, { exact: true });

/** Blue-ish pixels in the backdrop canvas: the underlay linework (the grid is neutral grey). */
async function underlayPixels(page: Page): Promise<number> {
  return page.getByTestId('plan-backdrop').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 40 && data[i + 2]! - data[i]! > 30) n++;
    return n;
  });
}

test('draw a room on a blank plan, add a door and a window, rename it, move a corner and undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('start-blank').click();
  await page.waitForURL(/\/plan$/);
  await expect(page.getByTestId('empty-plan')).toBeVisible();
  await expect(page.getByTestId('total-rooms')).toHaveText('0');

  // Four walls with the Wall tool; closing the loop ends the chain and makes a room.
  await page.getByRole('button', { name: 'Draw walls' }).click();
  await expect(page.getByTestId('empty-plan')).toBeHidden();
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  await click(page, 0, 0);
  await click(page, 5000, 0);
  await hover(page, 5000, 2000);
  await expect(page.getByTestId('readout')).toContainText('2 000 mm · 90°');
  await click(page, 5000, 3500);
  await click(page, 0, 3500);
  await expect(page.locator('[data-room-label]')).toHaveCount(0);
  await click(page, 40, 30); // near the first corner: snaps onto it
  await expect(page.locator('[data-wall-id]')).toHaveCount(4);
  await expect(page.locator('[data-room-label]')).toHaveCount(1);
  await expect(page.locator('[data-room-label]')).toContainText('Room 1');
  await expect(page.getByTestId('wall-draft')).toHaveCount(0);
  await expect(page.getByTestId('total-rooms')).toHaveText('1');

  // Door: preview on hover, placed on click.
  await page.keyboard.press('d');
  await hover(page, 1500, 60);
  await expect(page.getByTestId('opening-preview')).toHaveAttribute('data-valid', 'true');
  await click(page, 1500, 60);
  await expect(page.locator('[data-opening-kind="door"]')).toHaveCount(1);
  await expect(panel(page)).toHaveAttribute('data-selection', 'opening');
  await expect(field(page, 'Width')).toHaveValue('900');

  // Flip the hinge from the panel.
  const door = page.locator('[data-opening-kind="door"]');
  const hinge = await door.getAttribute('data-hinge');
  await panel(page).getByRole('button', { name: 'Flip hinge' }).click();
  await expect(door).not.toHaveAttribute('data-hinge', hinge!);

  // Window on the right-hand wall.
  await page.keyboard.press('n');
  await click(page, 5000, 1800);
  await expect(page.locator('[data-opening-kind="window"]')).toHaveCount(1);
  await expect(field(page, 'Sill')).toHaveValue('900');

  // Rename the room in the panel.
  await page.keyboard.press('v');
  await click(page, 2500, 2400);
  await expect(panel(page)).toHaveAttribute('data-selection', 'room');
  await field(page, 'Name').fill('Studio');
  await field(page, 'Name').press('Enter');
  await expect(page.locator('[data-room-label]')).toContainText('Studio');
  await panel(page).getByLabel('Type').selectOption('bedroom');
  await expect(panel(page).getByLabel('Floor finish')).toHaveValue('floor.oak');

  // Move a corner: the walls follow, and one undo puts it back.
  await click(page, 5000, 3500);
  await expect(panel(page)).toHaveAttribute('data-selection', 'vertex');
  await expect(field(page, 'X')).toHaveValue('5000');
  await expect(field(page, 'Y')).toHaveValue('3500');
  await drag(page, [5000, 3500], [5600, 3900]);
  await expect(field(page, 'X')).toHaveValue('5600');
  await expect(field(page, 'Y')).toHaveValue('3900');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await click(page, 5000, 3500);
  await expect(panel(page)).toHaveAttribute('data-selection', 'vertex');
  await expect(field(page, 'X')).toHaveValue('5000');
  await expect(field(page, 'Y')).toHaveValue('3500');
  // The rename before the drag is still there: the drag was a single undo step.
  await expect(page.locator('[data-room-label]')).toContainText('Studio');

  // Shortcuts help opens from the keyboard.
  await page.keyboard.press('?');
  await expect(page.getByTestId('help-popover')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByTestId('help-popover')).toBeHidden();
  expect(errors).toEqual([]);
});

test('snap-trace over an underlay on the sample plan and set the scale with two clicks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await openSample(page);
  await gotoMode(page, 'plan');
  await expect(page.getByTestId('total-rooms')).toHaveText('10');
  await expect(page.getByLabel('Source drawing opacity')).toHaveCount(0);

  // The importer is not wired up here: store a synthetic 30 000 segment underlay for this project.
  // Its outline is a 4000 x 3000 rectangle to the right of the plan; the rest is clutter above it.
  const count = await page.evaluate(() => window.__interioEditor2d!.installSyntheticUnderlay({ segments: 30000, rect: [14000, 1000, 18000, 4000] }));
  expect(count).toBe(30000);
  await page.reload();
  await expect(page.getByTestId('editor2d')).toHaveAttribute('data-underlay', 'ready');
  await page.keyboard.press('0'); // fit the plan and the drawing
  await expect.poll(() => underlayPixels(page)).toBeGreaterThan(2000);

  // Trace the outline. Every click is a few pixels off: the underlay corners pull the pointer in.
  await page.keyboard.press('w');
  await hover(page, 14090, 1070);
  await expect(page.getByTestId('snap-mark')).toHaveAttribute('data-kind', 'underlay');
  await click(page, 14090, 1070);
  await click(page, 17930, 940);
  await click(page, 18060, 4080);
  await click(page, 13920, 3930);
  await click(page, 14050, 1040);
  await expect(page.getByTestId('wall-draft')).toHaveCount(0);
  await page.keyboard.press('v');
  await expect(page.getByTestId('total-rooms')).toHaveText('11');

  // The trace landed exactly on the drawing.
  await click(page, 16000, 1000);
  await expect(panel(page)).toHaveAttribute('data-selection', 'wall');
  await expect(field(page, 'Length')).toHaveValue('4000');
  await click(page, 18000, 4000);
  await expect(field(page, 'X')).toHaveValue('18000');
  await expect(field(page, 'Y')).toHaveValue('4000');

  // Set scale: two clicks on a known distance, then its real length.
  await page.keyboard.press('c');
  await click(page, 14000, 1000);
  await click(page, 18000, 1000);
  await expect(page.getByTestId('scale-line')).toHaveAttribute('data-length', '4000');
  const prompt = page.getByTestId('scale-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByLabel('Real distance').fill('2m');
  await prompt.getByLabel('Real distance').press('Enter');
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-tool', 'select');

  // Everything is half the size: the traced wall, the sample plan, and the underlay under it.
  await click(page, 8000, 500);
  await expect(field(page, 'Length')).toHaveValue('2000');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('total-rooms')).toHaveText('11');
  // Remove the traced corner at the outline's top-right, now at (9000, 2000): what attracts the
  // pointer there afterwards can only be the underlay, so it was rescaled with the plan.
  await click(page, 9000, 2000);
  await expect(panel(page)).toHaveAttribute('data-selection', 'vertex');
  await page.keyboard.press('Delete');
  await page.keyboard.press('w');
  await hover(page, 9030, 2040);
  await expect(page.getByTestId('snap-mark')).toHaveAttribute('data-kind', 'underlay');
  await page.keyboard.press('v');

  // Undo the corner, then one more undo restores the scale.
  const undo = page.getByRole('button', { name: /^Undo/ });
  await undo.click();
  await click(page, 8000, 500);
  await expect(field(page, 'Length')).toHaveValue('2000');
  await undo.click();
  await click(page, 16000, 1000);
  await expect(field(page, 'Length')).toHaveValue('4000');

  // Underlay controls: hide it and the linework is gone from the canvas.
  await expect(page.getByLabel('Source drawing opacity')).toBeEnabled();
  await page.getByRole('button', { name: 'Hide source drawing' }).click();
  await expect.poll(() => underlayPixels(page)).toBe(0);
  await page.getByRole('button', { name: 'Show source drawing' }).click();
  await expect.poll(() => underlayPixels(page)).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
