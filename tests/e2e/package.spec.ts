import { expect, test, type Page } from '@playwright/test';
import { designReady, openSample } from './helpers';

/**
 * The furnishing package in Design mode: "Furnish home" furnishes the sample home to the
 * owner's list, the Package panel shows the checklist, a bedroom's role can be changed
 * and the room refurnished, missing lines can be added back, and the checklist copied.
 */

interface Item {
  id: string;
  catalogId: string;
  roomId?: string;
}
interface Room {
  id: string;
  name: string;
  role?: string;
}
interface Store {
  getState(): {
    project: { levels: { items: Record<string, Item>; rooms: Record<string, Room> }[] };
    past: unknown[];
    selection: { kind: string; id: string } | null;
    select(sel: { kind: 'room' | 'item'; id: string } | null): void;
    removeItem(id: string): void;
  };
}

type DevWindow = { __interio: { store: Store } };

const level = (page: Page) => page.evaluate(() => (window as unknown as DevWindow).__interio.store.getState().project.levels[0]!);
const items = async (page: Page) => Object.values((await level(page)).items);
const roomNamed = async (page: Page, name: string) => Object.values((await level(page)).rooms).find((r) => r.name === name)!;
const undoSteps = (page: Page) => page.evaluate(() => (window as unknown as DevWindow).__interio.store.getState().past.length);
const line = (page: Page, key: string, roomId?: string) => page.locator(`[data-testid="package-line"][data-key="${key}"]${roomId ? `[data-room="${roomId}"]` : ''}`);

/** The furnishing toast (the first layout's "saved" toast may follow it). */
const furnishToast = (page: Page) => page.getByTestId('toast').filter({ hasText: /Furnished with Essentials, 3 BHK: \d+ of \d+ items placed/ });

async function furnishSample(page: Page): Promise<void> {
  await openSample(page);
  await designReady(page);
  await page.getByTestId('furnish-home').click();
  await expect(furnishToast(page)).toBeVisible();
}

test.describe('furnishing package', () => {
  test('Furnish home furnishes to the package and the panel ticks every placed line', async ({ page }) => {
    await furnishSample(page);
    const [, placed, needed] = (await furnishToast(page).textContent())!.match(/(\d+) of (\d+) items placed/)!.map(Number);
    expect(placed).toBeGreaterThan(needed! * 0.8);
    // One undo step for the whole home, roles and finishes included.
    expect(await undoSteps(page)).toBe(1);
    const all = await items(page);
    expect(all.some((i) => i.catalogId === 'bed.king.drawers')).toBe(true);
    expect(all.some((i) => i.catalogId.startsWith('prayer.unit.christian'))).toBe(true);
    expect((await roomNamed(page, 'Bedroom 1')).role).toBe('master');

    await expect(page.getByTestId('package-count')).toHaveAttribute('data-placed', String(placed));
    await page.getByTestId('open-package').click();
    const panel = page.getByTestId('package-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('package-select')).toHaveValue('essentials-3bhk');
    await expect(panel.getByTestId('package-summary')).toHaveAttribute('data-placed', String(placed));
    // The owner's lines, as written.
    await expect(line(page, 'tv-unit')).toHaveAttribute('data-status', 'placed');
    await expect(line(page, 'tv-unit')).toContainText('TV unit with black glass shutters');
    await expect(line(page, 'hettich')).toHaveAttribute('data-status', 'included');
    await expect(line(page, 'hettich')).toContainText('Included spec');
    expect(await panel.locator('[data-testid="package-line"][data-status="placed"]').count()).toBeGreaterThan(25);
    // Lines that did not fit say why.
    for (const short of await panel.locator('[data-testid="package-line"][data-status="noSpace"]').all()) await expect(short.getByTestId('package-line-reason')).not.toBeEmpty();
    // Nothing more to add: the button says so.
    await expect(page.getByTestId('furnish-home')).toBeDisabled();

    // Clicking a placed line selects its piece.
    await line(page, 'prayer').getByTestId('package-line-label').click();
    const selected = await page.evaluate(() => (window as unknown as DevWindow).__interio.store.getState().selection);
    expect(selected?.kind).toBe('item');
    expect((await level(page)).items[selected!.id]!.catalogId).toMatch(/^prayer\.unit\.christian/);
  });

  test('a removed piece shows as missing, and Add brings it back', async ({ page }) => {
    await furnishSample(page);
    await page.getByTestId('open-package').click();
    const prayer = (await items(page)).find((i) => i.catalogId.startsWith('prayer.unit'))!;
    await page.evaluate((id) => (window as unknown as DevWindow).__interio.store.getState().removeItem(id), prayer.id);
    await expect(line(page, 'prayer')).toHaveAttribute('data-status', 'missing');
    await expect(line(page, 'prayer').getByTestId('package-line-add')).toHaveText('Add');
    await expect(page.getByTestId('furnish-home')).toBeEnabled();
    const steps = await undoSteps(page);
    await line(page, 'prayer').getByTestId('package-line-add').click();
    await expect(line(page, 'prayer')).toHaveAttribute('data-status', 'placed');
    expect((await items(page)).filter((i) => i.catalogId.startsWith('prayer.unit'))).toHaveLength(1);
    expect(await undoSteps(page)).toBe(steps + 1);
  });

  test('changing a bedroom’s role and refurnishing it to match', async ({ page }) => {
    await furnishSample(page);
    const kids = await roomNamed(page, 'Bedroom 2');
    expect(kids.role).toBe('kids');
    expect((await items(page)).some((i) => i.roomId === kids.id && i.catalogId === 'bed.queen')).toBe(true);
    await page.evaluate((id) => (window as unknown as DevWindow).__interio.store.getState().select({ kind: 'room', id }), kids.id);
    const role = page.getByTestId('room-role');
    await expect(role).toHaveAttribute('data-role', 'kids');
    await role.getByRole('tab', { name: 'Guest' }).click();
    await expect(role).toHaveAttribute('data-role', 'guest');
    expect((await roomNamed(page, 'Bedroom 2')).role).toBe('guest');
    const steps = await undoSteps(page);
    await page.getByTestId('room-refurnish').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Refurnished Bedroom 2 as the guest bedroom' })).toBeVisible();
    const after = (await items(page)).filter((i) => i.roomId === kids.id).map((i) => i.catalogId);
    expect(after).toContain('bed.queen.storage');
    expect(after).not.toContain('bed.queen');
    expect(after.some((id) => id.startsWith('blind.roman.'))).toBe(true);
    expect(await undoSteps(page)).toBe(steps + 1);
    // One undo brings the kids' furniture back.
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await items(page)).some((i) => i.roomId === kids.id && i.catalogId === 'bed.queen')).toBe(true);
  });

  test('Copy checklist copies the owner’s list with ticks', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await furnishSample(page);
    await page.getByTestId('open-package').click();
    await page.getByTestId('package-copy').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Checklist copied' })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toMatch(/^Essentials, 3 BHK: \d+ of \d+ items placed/);
    expect(text).toContain('Master bedroom (Bedroom 1)');
    expect(text).toContain('[✓] TV unit with black glass shutters');
    expect(text).toContain('[✓] Hettich accessories (German, 15 years warranty) — included, 6 Nos');
    expect(text).toMatch(/\[✓\] Planter box \(6 of 6\)/);
  });

  test('No package keeps the plain layout', async ({ page }) => {
    await openSample(page);
    await designReady(page);
    await page.getByTestId('open-package').click();
    await page.getByTestId('package-select').selectOption('none');
    await expect(page.getByTestId('package-count')).toHaveCount(0);
    await page.getByTestId('furnish-home').click();
    await expect(page.getByTestId('toast').filter({ hasText: /^Added \d+ items to \d+ rooms/ })).toBeVisible();
    expect((await items(page)).some((i) => i.catalogId.startsWith('prayer.unit'))).toBe(false);
  });
});
