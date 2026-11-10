import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the dashboard and creates a project from the sample home. Lands in Design mode. */
export async function openSample(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('start-sample').click();
  await page.waitForURL(/\/p\/[^/]+\/design$/);
  return page.url().match(/\/p\/([^/]+)\//)![1]!;
}

export async function gotoMode(page: Page, mode: 'plan' | 'design' | 'walk'): Promise<void> {
  await page.getByRole('tab', { name: new RegExp(`^${mode}$`, 'i') }).click();
  await page.waitForURL(new RegExp(`/${mode}$`));
  await expect(page.getByTestId(`feature-${mode}`)).toBeVisible();
}

/**
 * Asserts a WebGL canvas has actually drawn a scene: it is sized to its container
 * and its screenshot contains a healthy number of distinct colours.
 */
export async function expectCanvasRendered(canvas: Locator, minColours = 12): Promise<void> {
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(600);
  await expect
    .poll(
      async () => {
        const png = await canvas.screenshot();
        return canvas.page().evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 160;
          c.height = 100;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set<number>();
          for (let i = 0; i < d.length; i += 4) seen.add(((d[i]! >> 4) << 8) | ((d[i + 1]! >> 4) << 4) | (d[i + 2]! >> 4));
          return seen.size;
        }, png.toString('base64'));
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(minColours);
}

/** Waits until autosave has written the project. */
export async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}
