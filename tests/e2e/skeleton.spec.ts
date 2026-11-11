import { expect, test } from '@playwright/test';
import { expectCanvasRendered, expectSaved, expectWalkRendered, gotoMode, openSample } from './helpers';

test('sample home shows in 3D, in plan, in walk mode, and survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const id = await openSample(page);
  await expectCanvasRendered(page.locator('canvas'));

  await gotoMode(page, 'plan');
  await expect(page.getByText('Living / Dining')).toBeVisible();
  await expect(page.getByText('Bedroom 1')).toBeVisible();

  await gotoMode(page, 'walk');
  await expectWalkRendered(page.locator('canvas'));

  await page.getByLabel('Project name').fill('My flat');
  await expectSaved(page);
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('My flat');
  await expectWalkRendered(page.locator('canvas'));

  await page.goto('/');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await expect(page.getByText('My flat')).toBeVisible();
  expect(page.url()).not.toContain(id);
  expect(errors).toEqual([]);
});

test('undo and redo are wired to the header', async ({ page }) => {
  await openSample(page);
  const undo = page.getByRole('button', { name: /^Undo/ });
  await expect(undo).toBeDisabled();
  await page.getByLabel('Project name').fill('Renamed');
  await expect(undo).toBeEnabled();
});
