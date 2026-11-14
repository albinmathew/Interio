import { expect, test, type Page } from '@playwright/test';
import { expectSaved, expectWalkRendered, gotoMode, openSample, runTour, storedProject, trackPageErrors } from './helpers';

/** The project settings as saved in IndexedDB. */
async function savedSettings(page: Page, projectId: string): Promise<Record<string, unknown>> {
  await expectSaved(page);
  const stored = (await storedProject(page, projectId)) as unknown as { settings?: Record<string, unknown> } | null;
  return stored?.settings ?? {};
}

type WalkWindow = Window & { __interioWalk?: { tier(): string } };

/** Opens the walk view options (they stay open across mode switches). */
async function openOptions(page: Page): Promise<void> {
  if (!(await page.getByTestId('walk-outside').isVisible())) await page.getByTestId('walk-options').click();
  await expect(page.getByTestId('walk-outside')).toBeVisible();
}

async function openWalk(page: Page): Promise<string> {
  const id = await openSample(page);
  await gotoMode(page, 'walk');
  await page.waitForFunction(() => (window as WalkWindow).__interioWalk !== undefined);
  return id;
}

test.describe('cinematic walk', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = trackPageErrors(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('shows greenery outside by default; the outside view can be switched and is saved with the project', async ({ page }) => {
    const id = await openWalk(page);
    await expectWalkRendered(page.locator('canvas'));
    // Software renderers (this suite) get the cheap tier, with the backdrop.
    expect(await page.evaluate(() => (window as WalkWindow).__interioWalk!.tier())).toBe('low');

    await openOptions(page);
    const outside = page.getByTestId('walk-outside');
    await expect(outside).toHaveAttribute('data-value', 'greenery');
    await expect(outside.getByRole('tab', { name: 'Greenery' })).toHaveAttribute('aria-selected', 'true');
    expect((await savedSettings(page, id))['scene.outside']).toBeUndefined();

    await outside.getByRole('tab', { name: 'City' }).click();
    await expect(outside).toHaveAttribute('data-value', 'city');
    expect((await savedSettings(page, id))['scene.outside']).toBe('city');
    await expectWalkRendered(page.locator('canvas'));

    // The Design toolbar offers the same choice, next to the lighting presets.
    await gotoMode(page, 'design');
    const toggle = page.getByTestId('outside-view');
    await expect(toggle).toHaveAttribute('data-value', 'city');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-value', 'sky');
    expect((await savedSettings(page, id))['scene.outside']).toBe('sky');

    // And it survives a reload.
    await page.reload();
    await gotoMode(page, 'walk');
    await openOptions(page);
    await expect(page.getByTestId('walk-outside')).toHaveAttribute('data-value', 'sky');
  });

  test('cove lights follow the lighting preset until switched, and the switch is saved', async ({ page }) => {
    const id = await openWalk(page);
    await openOptions(page);
    const coves = page.getByTestId('walk-coves');
    // Daylight: off by default.
    await expect(coves).not.toBeChecked();

    // Evening: on by default.
    await gotoMode(page, 'design');
    await page.getByTestId('lighting-preset').getByRole('tab', { name: 'Warm evening' }).click();
    await gotoMode(page, 'walk');
    await openOptions(page);
    await expect(page.getByTestId('walk-coves')).toBeChecked();
    expect((await savedSettings(page, id))['scene.coveLights']).toBeUndefined();
    await expectWalkRendered(page.locator('canvas'));

    // Switched off, it stays off.
    await page.getByTestId('walk-coves').uncheck();
    await expect(page.getByTestId('walk-coves')).not.toBeChecked();
    expect((await savedSettings(page, id))['scene.coveLights']).toBe(false);
    await page.getByTestId('walk-coves').check();
    expect((await savedSettings(page, id))['scene.coveLights']).toBe(true);

    // Head bob is a view option of this browser, on by default.
    await expect(page.getByTestId('walk-head-bob')).toBeChecked();
    await page.getByTestId('walk-head-bob').uncheck();
    await expect(page.getByTestId('walk-head-bob')).not.toBeChecked();
  });

  test('the cinematic tour still visits every room, in the order of the room list', async ({ page }) => {
    test.setTimeout(300_000);
    await openWalk(page);
    await expectWalkRendered(page.locator('canvas'));
    const { visited, rooms } = await runTour(page, 16);
    expect(visited).toHaveLength(10);
    expect([...visited].sort()).toEqual([...rooms].sort());
    expect(visited).toEqual(rooms);
    await expect(page.getByTestId('walk-tour-start')).toHaveText('Tour again');
    await expectWalkRendered(page.locator('canvas'));
  });
});
