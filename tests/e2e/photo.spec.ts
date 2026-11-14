import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectWalkRendered, gotoMode, openSample } from './helpers';

/** Mirrors `window.__interioPhoto` (apps/web/src/features/walkthrough/photo/PhotoMode.tsx). */
interface PhotoState {
  status: 'off' | 'unavailable' | 'preparing' | 'live' | 'refining' | 'ready';
  samples: number;
  passSamples: number;
  engaged: boolean;
  opacity: number;
  lastCapture: 'traced' | 'live' | null;
  textures: number;
  geometries: number;
  shadows: boolean;
}
interface TourState {
  status: 'idle' | 'playing' | 'paused' | 'ended';
  index: number;
  phase: string | null;
}
type HookWindow = Window & {
  __interioPhoto?: { state(): PhotoState };
  __interioWalk?: { move(dx: number, dy: number): unknown; startTour(opts?: { speed?: number }): boolean; tourState(): TourState };
};

// The GPU run uses the real GPU (Metal through ANGLE on a Mac) instead of the suite's software WebGL.
if (process.env.INTERIO_E2E_GPU) {
  test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }, viewport: { width: 1600, height: 900 } });
}

const photo = (page: Page) => page.evaluate(() => (window as HookWindow).__interioPhoto?.state() ?? null);
const toggle = (page: Page) => page.getByTestId('walk-photo');

async function openWalk(page: Page, furnished = false): Promise<void> {
  if (furnished) {
    await page.goto('/');
    await page.getByTestId('start-sample-furnished').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
  } else {
    await openSample(page);
  }
  await gotoMode(page, 'walk');
  await page.waitForFunction(() => (window as HookWindow).__interioWalk !== undefined);
}

test.describe('photo mode', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /path ?trac|photo|bvh/i.test(m.text())) errors.push(m.text());
    });
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('is unavailable on a software renderer and stays out of the way', async ({ page }) => {
    test.skip(!!process.env.INTERIO_E2E_GPU, 'The default run uses a software renderer');
    await openWalk(page);
    await expectWalkRendered(page.locator('canvas'));
    const button = toggle(page);
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', /graphics card/i);
    await expect(button).toHaveAttribute('data-status', 'unavailable');
    // Clicking a disabled control does nothing; walking and screenshots work as before.
    await button.click({ force: true });
    await expect(page.getByTestId('walk-photo-progress')).toHaveCount(0);
    await page.evaluate(() => (window as HookWindow).__interioWalk!.move(0, 300));
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('walk-screenshot').click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(await photo(page)).toBeNull();
    await expectWalkRendered(page.locator('canvas'));
  });
});

/**
 * On a real GPU (run with INTERIO_E2E_GPU=1 on a machine that has one): photo mode refines a
 * still view into a path-traced picture, saves it, and gives the view back on movement.
 */
test.describe('photo mode on a GPU', () => {
  test.skip(!process.env.INTERIO_E2E_GPU, 'Set INTERIO_E2E_GPU=1 to run on the GPU');
  test.setTimeout(240_000);

  /** Mean absolute difference (0..255) between two PNG screenshots, over the middle of the view (clear of the HUD). */
  async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
    return page.evaluate(
      async ([x, y]) => {
        const load = async (b64: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = 180;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, img.width * 0.25, img.height * 0.3, img.width * 0.5, img.height * 0.45, 0, 0, c.width, c.height);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        };
        const [p, q] = await Promise.all([load(x!), load(y!)]);
        let sum = 0;
        for (let i = 0; i < p.length; i += 4) sum += Math.abs(p[i]! - q[i]!) + Math.abs(p[i + 1]! - q[i + 1]!) + Math.abs(p[i + 2]! - q[i + 2]!);
        return sum / ((p.length / 4) * 3);
      },
      [a.toString('base64'), b.toString('base64')],
    );
  }

  const waitFor = (page: Page, test: (s: PhotoState) => boolean, timeout = 60_000) =>
    expect.poll(async () => {
      const s = await photo(page);
      return s !== null && test(s);
    }, { timeout, intervals: [100] }).toBe(true);

  test('refines a still view, saves the traced picture and gives the view back on movement', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openWalk(page, true);
    // Pin walk mode's quality tier: its performance monitor would otherwise change the scene (and so
    // rebuild the traced one) whenever the frame rate wanders, which this test is not about.
    await page.goto(`${page.url()}?tier=high`);
    await page.waitForFunction(() => (window as HookWindow).__interioWalk !== undefined);
    await page.getByTestId('walk-room-item').filter({ hasText: 'Living / Dining' }).click();
    await page.waitForFunction(() => (window as HookWindow).__interioPhoto !== undefined);
    await page.waitForTimeout(1500);
    const canvas = page.locator('canvas');
    const live = await canvas.screenshot();

    // Turn it on: it prepares, then refines, and says so.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const t0 = Date.now();
    await waitFor(page, (s) => s.engaged && s.samples >= 2 && s.opacity >= 1);
    const firstImage = Date.now() - t0;
    await expect(page.getByTestId('walk-photo-progress')).toContainText(/Refining|Ready/);

    // The picture differs from the live frame, and settles: successive frames change less and less.
    const early = await canvas.screenshot();
    await waitFor(page, (s) => s.samples >= 6);
    const middle = await canvas.screenshot();
    await waitFor(page, (s) => s.samples >= 14);
    const late = await canvas.screenshot();
    expect(await difference(page, live, late)).toBeGreaterThan(2);
    const firstChange = await difference(page, early, middle);
    const laterChange = await difference(page, middle, late);
    expect(laterChange).toBeLessThan(firstChange);

    await waitFor(page, (s) => s.status === 'ready');
    const ready = Date.now() - t0;
    await expect(page.getByTestId('walk-photo-progress')).toContainText('Ready');
    test.info().annotations.push({ type: 'timing', description: `first image ${firstImage} ms, ready ${ready} ms` });

    // Saving a picture saves the traced one.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('walk-screenshot').click()]);
    const png = await readFile(await download.path());
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.byteLength).toBeGreaterThan(50_000);
    expect((await photo(page))?.lastCapture).toBe('traced');

    // Moving hands the view straight back to live rendering.
    await page.evaluate(() => (window as HookWindow).__interioWalk!.move(250, 0));
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(120);
    await page.keyboard.up('ArrowLeft');
    await waitFor(page, (s) => !s.engaged && s.status === 'live', 1_000);
    const [liveShot] = await Promise.all([page.waitForEvent('download'), page.getByTestId('walk-screenshot').click()]);
    expect(liveShot.suggestedFilename()).toMatch(/\.png$/);
    expect((await photo(page))?.lastCapture).toBe('live');
    // And refines again once still.
    await waitFor(page, (s) => s.engaged && s.samples >= 1, 30_000);

    // Turning it off and on again reuses the tracer: GPU resources stay bounded.
    const baseline = (await photo(page))!;
    for (let i = 0; i < 6; i++) {
      await toggle(page).click();
      await waitFor(page, (s) => s.status === 'off', 2_000);
      await toggle(page).click();
      await waitFor(page, (s) => s.engaged && s.samples >= 1, 30_000);
    }
    const after = (await photo(page))!;
    expect(after.textures).toBeLessThanOrEqual(baseline.textures + 2);
    expect(after.geometries).toBeLessThanOrEqual(baseline.geometries + 2);

    // The guided tour is never held up: it plays on, and a paused tour gets refined.
    expect(await page.evaluate(() => (window as HookWindow).__interioWalk!.startTour({ speed: 1 }))).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => (window as HookWindow).__interioWalk!.tourState())).index, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    await page.getByTestId('walk-tour-pause').click();
    await waitFor(page, (s) => s.engaged && s.samples >= 1, 30_000);
    await page.getByTestId('walk-tour-play').click();
    await waitFor(page, (s) => !s.engaged, 3_000);
    await page.getByTestId('walk-tour-stop').click();

    // Leaving walk mode frees the tracer; coming back remembers the toggle.
    await gotoMode(page, 'design');
    await gotoMode(page, 'walk');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await waitFor(page, (s) => s.engaged && s.samples >= 1, 60_000);
    expect(errors).toEqual([]);
  });
});
