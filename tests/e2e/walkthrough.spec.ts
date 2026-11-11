import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectCanvasRendered, gotoMode, openSample } from './helpers';

/** Mirrors `window.__interioWalk` (apps/web/src/features/walkthrough/index.tsx). */
interface WalkState {
  x: number;
  y: number;
  yawDeg: number;
  roomId: string | null;
}
interface TourState {
  status: 'idle' | 'playing' | 'paused' | 'ended';
  index: number;
  total: number;
  phase: string | null;
  roomId: string | null;
  visited: string[];
}
interface WalkHook {
  getState(): WalkState;
  teleport(p: { x: number; y: number }): WalkState;
  move(dx: number, dy: number): WalkState & { blocked: boolean };
  startTour(opts?: { speed?: number }): boolean;
  tourState(): TourState;
}
type HookWindow = Window & { __interioWalk?: WalkHook };

const hook = {
  state: (page: Page) => page.evaluate(() => (window as HookWindow).__interioWalk!.getState()),
  move: (page: Page, dx: number, dy: number) => page.evaluate(([x, y]) => (window as HookWindow).__interioWalk!.move(x!, y!), [dx, dy]),
  teleport: (page: Page, x: number, y: number) => page.evaluate((p) => (window as HookWindow).__interioWalk!.teleport(p), { x, y }),
  startTour: (page: Page, speed: number) => page.evaluate((s) => (window as HookWindow).__interioWalk!.startTour({ speed: s }), speed),
  tour: (page: Page) => page.evaluate(() => (window as HookWindow).__interioWalk!.tourState()),
};

async function openWalk(page: Page): Promise<void> {
  await openSample(page);
  await gotoMode(page, 'walk');
  await page.waitForFunction(() => (window as HookWindow).__interioWalk !== undefined);
}

const label = (page: Page) => page.getByTestId('walk-room-label');
const roomItem = (page: Page, name: string) => page.getByTestId('walk-room-item').filter({ hasText: name });

test.describe('walkthrough', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('renders and starts just inside the entrance, facing into the home', async ({ page }) => {
    await openWalk(page);
    await expectCanvasRendered(page.locator('canvas'));
    await expect(label(page)).toHaveText('Foyer');
    const s = await hook.state(page);
    // Entrance door is on the east wall at (12000, 1100).
    expect(s.y).toBeCloseTo(1100, 0);
    expect(s.x).toBeGreaterThan(10_000);
    expect(s.x).toBeLessThan(11_800);
    expect(Math.abs(s.yawDeg)).toBeCloseTo(180, 0);
    await expect(page.getByTestId('walk-room-item')).toHaveCount(10);
    await expect(roomItem(page, 'Foyer')).toHaveAttribute('aria-current', 'location');
    await expect(page.getByTestId('walk-hint')).toBeVisible();
    await expect(page.getByTestId('walk-minimap')).toBeVisible();
  });

  test('walls block, the passage lets the walker through, and the room label follows', async ({ page }) => {
    await openWalk(page);
    const start = await hook.state(page);

    // South into the foyer wall (inner face at y = 100): stopped a body radius short, no sideways drift.
    const wall = await hook.move(page, 0, -3000);
    expect(wall.blocked).toBe(true);
    expect(wall.y).toBeCloseTo(350, 0);
    expect(wall.x).toBeCloseTo(start.x, 0);
    await expect(label(page)).toHaveText('Foyer');

    // East, out of the front door: no further than the doorway.
    await hook.teleport(page, start.x, start.y);
    const door = await hook.move(page, 5000, 0);
    expect(door.blocked).toBe(true);
    expect(door.x).toBeLessThan(12_200);

    // West through the open passage into the living room.
    await hook.teleport(page, start.x, start.y);
    const through = await hook.move(page, -(start.x - 9000), 0);
    expect(through.blocked).toBe(false);
    expect(through.x).toBeCloseTo(9000, 0);
    await expect(label(page)).toHaveText('Living / Dining');
    await expect(roomItem(page, 'Living / Dining')).toHaveAttribute('aria-current', 'location');
    expect(through.roomId).toBe(await label(page).getAttribute('data-room-id'));

    // Straight on across the living room into the kitchen wall (face at x = 3060).
    const far = await hook.move(page, -20_000, 0);
    expect(far.blocked).toBe(true);
    expect(far.x).toBeCloseTo(3060 + 250, 0);
    await expect(label(page)).toHaveText('Living / Dining');
  });

  test('keyboard walks, and click-to-move walks to the clicked floor point', async ({ page }) => {
    await openWalk(page);
    await expectCanvasRendered(page.locator('canvas'));
    const start = await hook.state(page);

    // Facing west: W walks towards -x and the hint goes away.
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await hook.state(page)).x).toBeLessThan(start.x - 400);
    await page.keyboard.up('KeyW');
    await expect(page.getByTestId('walk-hint')).toHaveCSS('opacity', '0');

    // Dragging looks around without pointer lock (which headless browsers do not grant): the scene follows the pointer.
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 160, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.up();
    const turned = await hook.state(page);
    expect(Math.abs(turned.yawDeg)).toBeLessThan(160);
    expect(Math.abs(turned.yawDeg)).toBeGreaterThan(100);

    await roomItem(page, 'Foyer').click();
    await expect.poll(async () => Math.abs((await hook.state(page)).yawDeg)).toBeGreaterThan(165);
    await hook.teleport(page, start.x, start.y);
    await page.getByTestId('walk-click-mode').click();
    // A floor point ahead, below the horizon.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.72);
    await expect.poll(async () => (await hook.state(page)).x, { timeout: 15_000 }).toBeLessThan(start.x - 300);
    const s = await hook.state(page);
    expect(Math.abs(s.y - start.y)).toBeLessThan(300);
  });

  test('jumps to a room from the list and to a point on the minimap', async ({ page }) => {
    await openWalk(page);
    await roomItem(page, 'Bedroom 2').click();
    await expect(label(page)).toHaveText('Bedroom 2');
    await expect(roomItem(page, 'Bedroom 2')).toHaveAttribute('aria-current', 'location');
    const bedroom = await hook.state(page);
    // Bedroom 2 spans x 5600..9000, y 5400..9000.
    expect(bedroom.x).toBeGreaterThan(5600);
    expect(bedroom.x).toBeLessThan(9000);
    expect(bedroom.y).toBeGreaterThan(5400);
    expect(bedroom.y).toBeLessThan(9000);

    await roomItem(page, 'Balcony').click();
    await expect(label(page)).toHaveText('Balcony');

    // Click the kitchen on the map (plan point 1500, 2000).
    const at = await page.getByTestId('walk-minimap').evaluate((svg) => {
      const p = new DOMPoint(1500, -2000).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(at.x, at.y);
    await expect(label(page)).toHaveText('Kitchen');
    const kitchen = await hook.state(page);
    expect(Math.hypot(kitchen.x - 1500, kitchen.y - 2000)).toBeLessThan(150);

    // The map and the room list fold away and come back.
    await page.getByTestId('walk-map-toggle').click();
    await expect(page.getByTestId('walk-minimap')).toHaveCount(0);
    await page.getByTestId('walk-map-toggle').click();
    await expect(page.getByTestId('walk-minimap')).toBeVisible();
    await page.getByTestId('walk-rooms-toggle').click();
    await expect(page.getByTestId('walk-room-item')).toHaveCount(0);
    await page.getByTestId('walk-rooms-toggle').click();
    await expect(page.getByTestId('walk-room-item')).toHaveCount(10);
  });

  test('guided tour controls work and the tour reaches every room, then ends', async ({ page }) => {
    test.setTimeout(240_000);
    await openWalk(page);
    await expectCanvasRendered(page.locator('canvas'));

    // Controls: start, pause, resume, next, previous, stop.
    await page.getByTestId('walk-tour-speed').selectOption('4');
    await page.getByTestId('walk-tour-start').click();
    await expect(page.getByTestId('walk-tour-progress')).toHaveText('1 / 10');
    await expect(page.getByTestId('walk-tour-caption')).toContainText('Foyer');
    await page.getByTestId('walk-tour-pause').click();
    expect((await hook.tour(page)).status).toBe('paused');
    await page.getByTestId('walk-tour-play').click();
    expect((await hook.tour(page)).status).toBe('playing');
    await page.getByTestId('walk-tour-next').click();
    await expect(page.getByTestId('walk-tour-progress')).toHaveText('2 / 10');
    await expect(label(page)).toHaveText('Living / Dining');
    await expect(page.getByTestId('walk-tour-caption')).toContainText(/Living \/ Dining.*m²/);
    await page.getByTestId('walk-tour-prev').click();
    await expect(page.getByTestId('walk-tour-progress')).toHaveText('1 / 10');
    await page.getByTestId('walk-tour-stop').click();
    expect((await hook.tour(page)).status).toBe('idle');
    await expect(page.getByTestId('walk-tour-start')).toBeVisible();

    // The whole tour at a high speed setting.
    const roomIds = await page.getByTestId('walk-room-item').evaluateAll((els) => els.map((el) => el.getAttribute('data-room-id')!));
    expect(await hook.startTour(page, 12)).toBe(true);
    const seenLabels = new Set<string>();
    let midTour = false;
    await expect
      .poll(
        async () => {
          const t = await hook.tour(page);
          const s = await hook.state(page);
          expect(s.roomId, 'the tour camera is always in a room').not.toBeNull();
          seenLabels.add((await label(page).textContent()) ?? '');
          if (!midTour && t.status === 'playing' && t.index >= 4 && t.phase === 'look') {
            midTour = true;
            await page.screenshot({ path: test.info().outputPath('tour-mid.png') });
          }
          return t.status;
        },
        { timeout: 200_000, intervals: [150] },
      )
      .toBe('ended');
    const end = await hook.tour(page);
    expect(end.visited).toHaveLength(10);
    expect([...end.visited].sort()).toEqual([...roomIds].sort());
    // Rooms are listed in tour order.
    expect(end.visited).toEqual(roomIds);
    expect(seenLabels.size).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId('walk-tour-start')).toHaveText('Tour again');
    // Still drawing after the tour. The last stop may face a plain wall, which under the
    // reduced quality of software renderers (CI) shows only a few colours: check for a live,
    // non-blank view rather than a busy one.
    await expectCanvasRendered(page.locator('canvas'), 4);
  });

  test('view options: field of view, eye height and a PNG of the view', async ({ page }) => {
    await openWalk(page);
    await expectCanvasRendered(page.locator('canvas'));
    await page.getByTestId('walk-options').click();
    await page.getByTestId('walk-fov').fill('95');
    await page.getByTestId('walk-eye-height').fill('1200');
    await expect(page.getByText('95°')).toBeVisible();
    await expect(page.getByText('1.20 m')).toBeVisible();
    await expectCanvasRendered(page.locator('canvas'));

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('walk-screenshot').click()]);
    expect(download.suggestedFilename()).toMatch(/^interio-foyer-[\d-]+\.png$/);
    const png = await readFile(await download.path());
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // A rendered room, not a blank frame.
    expect(png.byteLength).toBeGreaterThan(15_000);

    const fullscreen = page.getByTestId('walk-fullscreen');
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('walkthrough');
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  });

  test('remembers where the walker was when coming back to walk mode', async ({ page }) => {
    await openWalk(page);
    await roomItem(page, 'Kitchen').click();
    await expect(label(page)).toHaveText('Kitchen');
    const before = await hook.move(page, 300, 200);
    await gotoMode(page, 'design');
    await gotoMode(page, 'walk');
    await page.waitForFunction(() => (window as HookWindow).__interioWalk !== undefined);
    await expect(label(page)).toHaveText('Kitchen');
    const after = await hook.state(page);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);

    // And across a reload in the same tab.
    await page.reload();
    await page.waitForFunction(() => (window as HookWindow).__interioWalk !== undefined);
    await expect(label(page)).toHaveText('Kitchen');
    const reloaded = await hook.state(page);
    expect(reloaded.x).toBeCloseTo(before.x, 0);
    expect(reloaded.y).toBeCloseTo(before.y, 0);
  });
});

test.describe('walkthrough on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('joystick walks, a second finger looks around, a tap walks to the floor point', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openWalk(page);
    await expect(label(page)).toHaveText('Foyer');
    const stick = (await page.getByTestId('walk-joystick').boundingBox())!;
    const cx = stick.x + stick.width / 2;
    const cy = stick.y + stick.height / 2;
    const start = await hook.state(page);

    // Real touch points through the DevTools protocol (Chromium only, like the rest of the suite).
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

    // Left thumb pushes the stick forward: the walker heads west out of the foyer.
    const thumb = { x: cx, y: cy - 45, id: 1 };
    await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
    await touch('touchMove', [thumb]);
    await expect.poll(async () => (await hook.state(page)).x).toBeLessThan(start.x - 800);
    await expect(label(page)).toHaveText('Living / Dining');

    // Right thumb drags to look while the left keeps walking.
    await touch('touchStart', [thumb, { x: 300, y: 300, id: 2 }]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [thumb, { x: 300 - i * 15, y: 300, id: 2 }]);
    await expect.poll(async () => Math.abs((await hook.state(page)).yawDeg)).toBeLessThan(170);

    // Let go: the walker comes to rest.
    await touch('touchEnd', []);
    await page.waitForTimeout(600);
    const rest = await hook.state(page);
    await page.waitForTimeout(300);
    expect(await hook.state(page)).toEqual(rest);

    // Tap the floor ahead: click-to-move is the default on touch screens.
    await page.touchscreen.tap(195, 560);
    await expect.poll(async () => {
      const s = await hook.state(page);
      return Math.hypot(s.x - rest.x, s.y - rest.y);
    }).toBeGreaterThan(300);
    expect(errors).toEqual([]);
  });
});
