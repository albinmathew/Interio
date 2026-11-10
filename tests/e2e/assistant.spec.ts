import { expect, test, type Locator, type Page } from '@playwright/test';
import type { DesignEditRequest, DesignEditResponse } from '../../packages/core/src/design';
import type { Level, Variant } from '../../packages/core/src/schema';
import { designReady, expectSaved, gotoMode, openSample, toastMessage } from './helpers';

/**
 * The design assistant and saved variants in Design mode, on the sample home.
 *
 * No test here reaches a model: `/api/design-edit` and `/api/health` are answered by
 * the test. State is asserted through the panels, the plan store (`window.__interio`,
 * development builds) and the project record in IndexedDB after a reload.
 */

interface RoomData {
  id: string;
  name: string;
  type: string;
  floorMaterial: string;
  wallMaterial?: string;
}
interface ProjectData {
  id: string;
  settings: Record<string, unknown>;
  levels: (Level & { rooms: Record<string, RoomData> })[];
  variants: Variant[];
}
interface Hook {
  ready: boolean;
  store: {
    getState(): {
      project: ProjectData;
      past: unknown[];
      setRoomProps(id: string, patch: Partial<RoomData>): void;
      mutateLevel(fn: (level: Level) => void): void;
    };
  };
  project(x: number, y: number, z?: number): { x: number; y: number };
}
type Dev = { __interio: Hook };

const project = (page: Page): Promise<ProjectData> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().project);
const level = async (page: Page) => (await project(page)).levels[0]!;
const room = async (page: Page, name: string): Promise<RoomData> => Object.values((await level(page)).rooms).find((r) => r.name === name)!;
const itemsIn = async (page: Page, roomId: string) => Object.values((await level(page)).items).filter((i) => i.roomId === roomId);
const itemTotal = async (page: Page): Promise<number> => Object.keys((await level(page)).items).length;
const undoSteps = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Dev).__interio.store.getState().past.length);
const variants = async (page: Page): Promise<Variant[]> => (await project(page)).variants;
const setRoom = (page: Page, id: string, patch: Partial<RoomData>): Promise<void> =>
  page.evaluate(([roomId, p]) => (window as unknown as Dev).__interio.store.getState().setRoomProps(roomId as string, p as Partial<RoomData>), [id, patch] as const);

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

interface Prepared {
  body: DesignEditResponse;
  status?: number;
  /** The answer is held back until this resolves. */
  hold?: Promise<void>;
}

/** Answers the assistant's routes from a queue and records what the app sent. */
async function mockAssistant(page: Page, opts: { ai?: boolean } = {}) {
  const requests: DesignEditRequest[] = [];
  const queue: Prepared[] = [];
  await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true, ai: opts.ai ?? true, model: 'test-model', provider: opts.ai === false ? 'off' : 'api' } }));
  await page.route('**/api/design-edit', async (route) => {
    requests.push(route.request().postDataJSON() as DesignEditRequest);
    const next = queue.shift() ?? { body: { available: true, error: 'The test prepared no answer for this request.' }, status: 500 };
    if (next.hold) await next.hold;
    // A request the app abandoned has nobody left to answer.
    await route.fulfill({ status: next.status ?? 200, json: next.body }).catch(() => undefined);
  });
  return {
    requests,
    answer: (body: DesignEditResponse, extra: Omit<Prepared, 'body'> = {}) => {
      queue.push({ body, ...extra });
    },
  };
}

const input = (page: Page) => page.getByTestId('assistant-input');
const turns = (page: Page) => page.getByTestId('assistant-turn');
const variantCount = (page: Page) => page.getByTestId('variant-count');
const exactly = (text: string): RegExp => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const card = (page: Page, name: string) => page.getByTestId('variant-card').filter({ has: page.locator('[data-testid="variant-name"]', { hasText: exactly(name) }) });
const cardNames = (page: Page) => page.getByTestId('variant-name').allTextContents();
const undo = (page: Page) => page.getByRole('button', { name: /^Undo \(/ });
const redo = (page: Page) => page.getByRole('button', { name: /^Redo \(/ });

/** Opens a docked panel from its toolbar button, unless it is the one showing (the dock is remembered between modes). */
async function openDock(page: Page, which: 'assistant' | 'variants'): Promise<void> {
  const button = page.getByTestId(`open-${which}`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`${which}-panel`)).toBeVisible();
}
const openAssistant = (page: Page): Promise<void> => openDock(page, 'assistant');
const openVariants = (page: Page): Promise<void> => openDock(page, 'variants');

async function send(page: Page, text: string): Promise<void> {
  await input(page).fill(text);
  await input(page).press('Enter');
}

const boxOf = async (locator: Locator) => (await locator.boundingBox())!;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('design assistant', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('a request changes the home, the answer lists what was done, Undo takes it back and a follow-up carries the conversation', async ({ page }) => {
    const assistant = await mockAssistant(page);
    await openSample(page);
    await designReady(page);
    const bed3 = await room(page, 'Bedroom 3');
    const before = await project(page);
    expect(await itemTotal(page)).toBe(0);

    // The panel opens from a labelled button and offers requests that use this home's room names.
    await expect(page.getByTestId('open-assistant')).toHaveText('Assistant');
    await expect(page.getByTestId('open-assistant')).toHaveAttribute('aria-pressed', 'false');
    await openAssistant(page);
    await expect(page.getByTestId('open-assistant')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('assistant-unavailable')).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    await expect(page.getByTestId('assistant-example')).toHaveText([
      'Add a sink to the Kitchen',
      'Make Bedroom 3 a laundry room',
      'Use warm evening lighting',
      'Furnish the Living / Dining',
    ]);
    await expect(page.getByTestId('assistant-send')).toBeDisabled();

    // An example fills the input; Shift+Enter makes a new line and sends nothing.
    await page.getByTestId('assistant-example').nth(1).click();
    await expect(input(page)).toHaveValue('Make Bedroom 3 a laundry room');
    await expect(input(page)).toBeFocused();
    await input(page).press('Shift+Enter');
    await input(page).pressSequentially('with a sink');
    await expect(input(page)).toHaveValue('Make Bedroom 3 a laundry room\nwith a sink');
    expect(assistant.requests).toHaveLength(0);

    // Enter sends. The answer renames and retypes the room, furnishes it afresh, adds an item, and asks for one thing that cannot be done.
    assistant.answer({
      available: true,
      model: 'test-model',
      reply: 'Bedroom 3 is now a laundry room with a sink.',
      ops: [
        { op: 'set_room', roomId: bed3.id, name: 'Laundry', type: 'utility' },
        { op: 'refurnish_room', roomId: bed3.id },
        { op: 'add_item', roomId: bed3.id, catalogId: 'kitchen.sink' },
        { op: 'replace_item', itemId: 'not-in-the-plan', catalogId: 'sofa.corner' },
      ],
    });
    await input(page).press('Enter');
    const first = turns(page).nth(0);
    await expect(first).toHaveAttribute('data-status', 'done');
    await expect(first.getByTestId('turn-request')).toContainText('Make Bedroom 3 a laundry room\nwith a sink');
    await expect(first.getByTestId('turn-reply')).toContainText('Bedroom 3 is now a laundry room with a sink.');
    const changes = first.getByTestId('turn-change');
    await expect(changes).toHaveCount(4);
    await expect(changes.nth(0)).toHaveText('Done: Bedroom 3: renamed to Laundry, now a utility / laundry room');
    await expect(changes.nth(1)).toHaveText(/^Done: Furnished Laundry afresh \(\d+ items\)$/);
    await expect(changes.nth(2)).toHaveText('Done: Added Sink unit to Laundry');
    await expect(changes.nth(3)).toHaveText('Not done: That item is no longer in the plan');
    expect(await changes.evaluateAll((els) => els.map((el) => el.getAttribute('data-ok')))).toEqual(['true', 'true', 'true', 'false']);

    // The plan follows, as one undo step, and typing can carry on.
    expect(await room(page, 'Laundry')).toMatchObject({ id: bed3.id, type: 'utility', floorMaterial: 'floor.tile.antiskid' });
    const laundry = await itemsIn(page, bed3.id);
    expect(laundry.length).toBeGreaterThan(1);
    expect(laundry.filter((i) => i.catalogId === 'kitchen.sink').length).toBeGreaterThan(0);
    expect(await undoSteps(page)).toBe(1);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(laundry.length));
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('');

    // What was sent: the request, this home and no history yet.
    expect(assistant.requests).toHaveLength(1);
    const sent = assistant.requests[0]!;
    expect(sent.instruction).toBe('Make Bedroom 3 a laundry room\nwith a sink');
    expect(sent.home.rooms.find((r) => r.id === bed3.id)).toMatchObject({ name: 'Bedroom 3', type: 'bedroom', items: [] });
    expect(sent.catalog.some((c) => c.id === 'kitchen.sink')).toBe(true);
    expect(sent.history).toBeUndefined();

    // Undo, offered on the answer while it is the latest edit, restores the previous data.
    await first.getByTestId('turn-undo').click();
    await expect(first.getByTestId('turn-undone')).toBeVisible();
    await expect(first.getByTestId('turn-undo')).toHaveCount(0);
    expect((await project(page)).levels).toEqual(before.levels);
    expect(await undoSteps(page)).toBe(0);
    // Redo in the header brings it back, and with it the offer to undo.
    await redo(page).click();
    await expect(first.getByTestId('turn-undo')).toBeVisible();
    expect(await room(page, 'Laundry')).toMatchObject({ type: 'utility' });
    await undo(page).click();
    await expect(first.getByTestId('turn-undone')).toBeVisible();
    expect((await project(page)).levels).toEqual(before.levels);

    // A follow-up carries the earlier exchange, including that it was undone.
    assistant.answer({ available: true, reply: 'Warm evening light is on.', ops: [{ op: 'set_lighting', preset: 'evening' }] });
    await send(page, 'use warmer lighting instead');
    const second = turns(page).nth(1);
    await expect(second).toHaveAttribute('data-status', 'done');
    await expect(second.getByTestId('turn-change')).toHaveText(['Done: Lighting: Warm evening']);
    await expect(page.getByTestId('lighting-preset')).toHaveAttribute('data-preset', 'evening');
    expect((await project(page)).settings['viewer3d.lighting']).toBe('evening');
    expect(assistant.requests[1]!.history).toEqual([
      { role: 'user', text: 'Make Bedroom 3 a laundry room\nwith a sink' },
      { role: 'assistant', text: expect.stringMatching(/^Bedroom 3 is now a laundry room with a sink\.\nDone: Bedroom 3: renamed to Laundry[^]*Not done: That item is no longer in the plan\nThe user then undid these changes\.$/) },
    ]);
    // The first answer is no longer the latest edit: only the newest one offers Undo.
    await expect(first.getByTestId('turn-undo')).toHaveCount(0);
    await expect(second.getByTestId('turn-undo')).toBeVisible();

    // An edit made by hand after an answer withdraws its Undo.
    await setRoom(page, bed3.id, { name: 'Guest room' });
    await expect(second.getByTestId('turn-undo')).toHaveCount(0);

    // Save as variant: the name comes from the request; the request is kept as the note.
    await second.getByTestId('turn-save').click();
    await expect(second.getByTestId('turn-variant-name')).toHaveValue('Use warmer lighting instead');
    await expect(second.getByTestId('turn-variant-name')).toBeFocused();
    await second.getByTestId('turn-variant-name').press('Enter');
    await expect(toastMessage(page)).toContainText('Saved “Use warmer lighting instead” to Variants');
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');
    const saved = (await variants(page))[0]!;
    expect(saved).toMatchObject({ name: 'Use warmer lighting instead', note: 'use warmer lighting instead', settings: { 'viewer3d.lighting': 'evening' } });
    expect(saved.rooms[bed3.id]).toMatchObject({ name: 'Guest room' });
    expect(saved.thumbnail).toMatch(/^data:image\/jpeg;base64,/);
    await second.getByTestId('turn-saved').click();
    await expect(card(page, 'Use warmer lighting instead')).toHaveAttribute('data-current', 'true');

    // The conversation is kept for the session while moving between modes, and cleared on request.
    await gotoMode(page, 'plan');
    await gotoMode(page, 'design');
    await designReady(page);
    await openAssistant(page);
    await expect(turns(page)).toHaveCount(2);
    await page.getByTestId('assistant-clear').click();
    await expect(turns(page)).toHaveCount(0);
    await expect(page.getByTestId('assistant-example').first()).toBeVisible();
  });

  test('an answer that changes nothing reads as an explanation, a failure offers Try again, and neither touches the home', async ({ page }) => {
    const assistant = await mockAssistant(page);
    await openSample(page);
    await designReady(page);
    await openAssistant(page);
    const before = await project(page);

    assistant.answer({ available: true, reply: 'Walls, doors and windows cannot be changed here. Move the wall in Plan mode.', ops: [] });
    await send(page, 'move the kitchen wall out by a metre');
    const nothing = turns(page).nth(0);
    await expect(nothing).toHaveAttribute('data-status', 'nothing');
    await expect(nothing.getByTestId('turn-reply')).toContainText('Walls, doors and windows cannot be changed here.');
    await expect(nothing).toContainText('Nothing was changed');
    await expect(nothing.getByTestId('turn-problem')).toHaveCount(0);
    await expect(nothing.getByTestId('turn-retry')).toHaveCount(0);
    await expect(nothing.getByTestId('turn-undo')).toHaveCount(0);

    // Operations that could not be carried out are listed as not done.
    const bath = await room(page, 'Bath 2');
    assistant.answer({ available: true, reply: 'I tried to fit a bed in the bathroom.', ops: [{ op: 'add_item', roomId: bath.id, catalogId: 'bed.double' }] });
    await send(page, 'put a double bed in bath 2');
    const noSpace = turns(page).nth(1);
    await expect(noSpace).toHaveAttribute('data-status', 'nothing');
    await expect(noSpace.getByTestId('turn-change')).toHaveText(['Not done: No free space for Double bed in Bath 2']);
    await expect(noSpace.getByTestId('turn-change')).toHaveAttribute('data-ok', 'false');

    // A failure gives its reason and can be sent again as it was.
    assistant.answer({ available: true, error: 'The Claude plan limit was reached. Try again in a few minutes.' }, { status: 502 });
    await send(page, 'add a plant to the foyer');
    const failed = turns(page).nth(2);
    await expect(failed).toHaveAttribute('data-status', 'failed');
    await expect(failed.getByTestId('turn-problem')).toContainText('The Claude plan limit was reached. Try again in a few minutes.');
    expect((await project(page)).levels).toEqual(before.levels);
    expect(await undoSteps(page)).toBe(0);

    const foyer = await room(page, 'Foyer');
    assistant.answer({ available: true, reply: 'A plant is in the foyer.', ops: [{ op: 'add_item', roomId: foyer.id, catalogId: 'plant.potted' }] });
    await failed.getByTestId('turn-retry').click();
    await expect(turns(page)).toHaveCount(3);
    const retried = turns(page).nth(2);
    await expect(retried).toHaveAttribute('data-status', 'done');
    await expect(retried.getByTestId('turn-request')).toContainText('add a plant to the foyer');
    expect(assistant.requests.map((r) => r.instruction).slice(-2)).toEqual(['add a plant to the foyer', 'add a plant to the foyer']);
    expect(await itemsIn(page, foyer.id)).toHaveLength(1);
    // Only answered requests are context for the next one: the failure is not.
    expect(assistant.requests[3]!.history!.map((t) => t.text.split('\n')[0])).toEqual([
      'move the kitchen wall out by a metre',
      'Walls, doors and windows cannot be changed here. Move the wall in Plan mode.',
      'put a double bed in bath 2',
      'I tried to fit a bed in the bathroom.',
    ]);

    // The network going away is a failure too.
    await page.unroute('**/api/design-edit');
    await page.route('**/api/design-edit', (route) => route.abort());
    await send(page, 'and a lamp');
    await expect(turns(page).nth(3).getByTestId('turn-problem')).toContainText('The assistant could not be reached.');
  });

  test('a switched-off assistant explains how to switch it on and leaves the rest of the view working', async ({ page }) => {
    // The suite's server runs with the assistant off: this is the real /api/health.
    const requests: string[] = [];
    await page.route('**/api/design-edit', (route) => {
      requests.push(route.request().url());
      return route.fulfill({ json: { available: false } });
    });
    await openSample(page);
    await designReady(page);
    await openAssistant(page);
    const notice = page.getByTestId('assistant-unavailable');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('The assistant is switched off');
    await expect(notice).toContainText('ANTHROPIC_API_KEY');
    await expect(notice).toContainText('INTERIO_AI_PROVIDER=claude-code');
    await expect(notice).toContainText('.env');
    await expect(notice).toContainText('restart');
    await expect(page.getByTestId('assistant-example')).toHaveCount(0);

    // Sending while it is off keeps the request in the input and never reaches the assistant.
    await send(page, 'add a plant');
    await expect(input(page)).toHaveValue('add a plant');
    await expect(turns(page)).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await notice.getByTestId('assistant-recheck').click();
    await expect(toastMessage(page)).toHaveText('The assistant is still switched off');

    // Nothing else is blocked: furnish from the toolbar and pick from the catalog with the panel open.
    await page.getByTestId('furnish-home').click();
    await expect(page.getByTestId('item-count')).not.toHaveAttribute('data-count', '0');
    await page.locator('[data-testid="catalog-entry"][data-entry-id="sofa.3seat"]').click();
    await expect(page.getByTestId('viewer-hint')).toContainText('Click the floor to place');
    await page.keyboard.press('Escape');

    // It can also turn out to be off only when a request is answered.
    await page.unroute('**/api/health');
    await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true, ai: true } }));
    await notice.getByTestId('assistant-recheck').click();
    await expect(notice).toHaveCount(0);
    await send(page, 'add a plant');
    await expect(notice).toBeVisible();
    await expect(input(page)).toHaveValue('add a plant');
    await expect(turns(page)).toHaveCount(0);
    expect(requests).toHaveLength(1);
  });

  test('a slow answer shows the wait, and Cancel abandons it so the home stays as it was', async ({ page }) => {
    const assistant = await mockAssistant(page);
    await openSample(page);
    await designReady(page);
    await openAssistant(page);
    const kitchen = await room(page, 'Kitchen');
    const before = await project(page);

    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    assistant.answer({ available: true, reply: 'A sink is in the kitchen.', ops: [{ op: 'add_item', roomId: kitchen.id, catalogId: 'kitchen.sink' }] }, { hold });
    await send(page, 'add a sink to the kitchen');
    const turn = turns(page).nth(0);
    await expect(turn).toHaveAttribute('data-status', 'pending');
    const busy = page.getByTestId('assistant-busy');
    await expect(busy).toBeVisible();
    await expect(busy.getByRole('status')).toHaveText('Working on it…');
    // Seconds tick, sending is off, the next request can already be typed.
    await expect.poll(async () => Number(await page.getByTestId('assistant-elapsed').getAttribute('data-seconds'))).toBeGreaterThanOrEqual(1);
    await input(page).fill('and a dishwasher');
    await expect(page.getByTestId('assistant-send')).toBeDisabled();
    await input(page).press('Enter');
    expect(assistant.requests).toHaveLength(1);
    await expect(page.getByTestId('open-assistant')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('assistant-cancel').click();
    await expect(busy).toHaveCount(0);
    await expect(turn).toHaveAttribute('data-status', 'cancelled');
    await expect(turn.getByTestId('turn-reply')).toHaveText('Cancelled. Nothing was changed.');
    await expect(page.getByTestId('assistant-send')).toBeEnabled();
    await expect(input(page)).toHaveValue('and a dishwasher');

    // The answer arriving late is not applied.
    release();
    await page.waitForTimeout(600);
    await expect(turn).toHaveAttribute('data-status', 'cancelled');
    expect((await project(page)).levels).toEqual(before.levels);
    expect(await undoSteps(page)).toBe(0);
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '0');

    // Leaving Design mode while waiting abandons the request as well.
    let releaseSecond!: () => void;
    const holdSecond = new Promise<void>((resolve) => (releaseSecond = resolve));
    assistant.answer({ available: true, reply: 'A sink is in the kitchen.', ops: [{ op: 'add_item', roomId: kitchen.id, catalogId: 'kitchen.sink' }] }, { hold: holdSecond });
    await input(page).fill('add a sink to the kitchen');
    await input(page).press('Enter');
    await expect(busy).toBeVisible();
    await gotoMode(page, 'plan');
    releaseSecond();
    await page.waitForTimeout(400);
    await gotoMode(page, 'design');
    await designReady(page);
    expect((await project(page)).levels).toEqual(before.levels);
    await openAssistant(page);
    await expect(turns(page).nth(1)).toHaveAttribute('data-status', 'cancelled');
    await expect(turns(page).nth(1).getByTestId('turn-reply')).toContainText('left Design mode');
  });

  test('at 1280 x 720 the assistant docks beside the catalog and the room panel, and everything is reachable by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const assistant = await mockAssistant(page);
    await openSample(page);
    await designReady(page);

    // From the toolbar buttons by keyboard: focus, Enter, and the input has the focus.
    await page.getByTestId('open-assistant').focus();
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Ask the assistant' })).toBeVisible();

    // Select a room: its panel moves beside the dock; nothing covers anything else.
    const p = await page.evaluate(() => (window as unknown as Dev).__interio.project(1900, 7200));
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('room-name')).toHaveText('Bedroom 1');
    const viewer = await boxOf(page.getByTestId('viewer3d'));
    const boxes = {
      catalog: await boxOf(page.getByTestId('catalog-panel')),
      side: await boxOf(page.getByTestId('side-panel')),
      dock: await boxOf(page.getByTestId('design-dock')),
      toolbar: await boxOf(page.getByTestId('design-toolbar')),
      buttons: await boxOf(page.getByTestId('dock-buttons')),
    };
    const names = Object.keys(boxes) as (keyof typeof boxes)[];
    for (const a of names) {
      expect(boxes[a].x, `${a} is inside the view`).toBeGreaterThanOrEqual(viewer.x);
      expect(boxes[a].x + boxes[a].width, `${a} is inside the view`).toBeLessThanOrEqual(viewer.x + viewer.width);
      expect(boxes[a].y + boxes[a].height, `${a} is inside the view`).toBeLessThanOrEqual(viewer.y + viewer.height);
      for (const b of names) if (a < b) expect(overlap(boxes[a], boxes[b]), `${a} and ${b} overlap`).toBe(false);
    }
    // Part of the home is still in view between the panels.
    expect(boxes.side.x - (boxes.catalog.x + boxes.catalog.width)).toBeGreaterThan(300);

    // The panel keeps its place and size when an answer arrives.
    const kitchen = await room(page, 'Kitchen');
    const dockBefore = await boxOf(page.getByTestId('design-dock'));
    const inputBefore = await boxOf(input(page));
    assistant.answer({ available: true, reply: 'A sink is in the kitchen.', ops: [{ op: 'add_item', roomId: kitchen.id, catalogId: 'kitchen.sink' }] });
    await input(page).focus();
    await page.keyboard.type('add a sink to the kitchen');
    await page.keyboard.press('Enter');
    await expect(turns(page).nth(0)).toHaveAttribute('data-status', 'done');
    expect(await boxOf(page.getByTestId('design-dock'))).toEqual(dockBefore);
    expect(await boxOf(input(page))).toEqual(inputBefore);
    await expect(input(page)).toBeFocused();

    // Tab reaches the answer's actions and the panel's controls, each with a name.
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as variant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear conversation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('turn-undone')).toBeVisible();
    await page.getByRole('button', { name: 'Close assistant' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('design-dock')).toHaveCount(0);
    await expect(page.getByTestId('open-assistant')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('variants', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the first furnished look is saved by itself, once', async ({ page }) => {
    const projectId = await openSample(page);
    await designReady(page);
    // An unfurnished home has nothing to save.
    await expect(page.getByTestId('open-variants')).toContainText('Variants');
    await page.waitForTimeout(1500);
    await expect(variantCount(page)).toHaveAttribute('data-count', '0');
    await openVariants(page);
    await expect(page.getByTestId('variants-empty')).toBeVisible();
    await page.getByTestId('variants-close').click();

    // Furnish home: the look is saved as "First layout" once the scene has drawn it, and a toast says where.
    await page.getByTestId('furnish-home').click();
    const toast = page.getByTestId('toast').filter({ hasText: 'First layout' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await expect(toast).toContainText('Variants');
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');
    const furnished = await itemTotal(page);
    expect(furnished).toBeGreaterThan(20);
    const first = (await variants(page))[0]!;
    expect(first.name).toBe('First layout');
    expect(Object.keys(first.items)).toHaveLength(furnished);
    // A small JPEG preview, well under 25 KB.
    expect(first.thumbnail).toMatch(/^data:image\/jpeg;base64,/);
    const bytes = (first.thumbnail!.length - 'data:image/jpeg;base64,'.length) * 0.75;
    expect(bytes).toBeGreaterThan(1500);
    expect(bytes).toBeLessThan(25_000);
    // Saving it was not an edit: one undo step (the furnishing), and undoing keeps the variant.
    expect(await undoSteps(page)).toBe(1);

    await openVariants(page);
    const firstCard = card(page, 'First layout');
    await expect(firstCard).toHaveAttribute('data-current', 'true');
    await expect(firstCard.getByTestId('variant-items')).toHaveText(`${furnished} items`);
    await expect(firstCard.getByTestId('variant-meta')).toContainText('just now');
    await expect(firstCard.getByTestId('variant-thumbnail')).toHaveJSProperty('complete', true);
    expect(await firstCard.getByTestId('variant-thumbnail').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);

    // Never twice: clearing and furnishing again, or coming back to Design mode, saves nothing more.
    await undo(page).click();
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', '0');
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');
    await expect(firstCard).toHaveAttribute('data-current', 'false');
    await page.getByTestId('furnish-home').click();
    await expect(page.getByTestId('item-count')).not.toHaveAttribute('data-count', '0');
    await gotoMode(page, 'plan');
    await gotoMode(page, 'design');
    await designReady(page);
    await page.waitForTimeout(1500);
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');

    // Not even after it was deleted and the page reloaded.
    await openVariants(page);
    await firstCard.getByTestId('variant-delete').click();
    await page.getByTestId('variant-delete-confirm').click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '0');
    await expectSaved(page);
    await page.reload();
    await designReady(page);
    await page.waitForTimeout(2000);
    await expect(variantCount(page)).toHaveAttribute('data-count', '0');
    expect((await stored(page, projectId)).variants).toEqual([]);
  });

  test('a home that arrives furnished gets its first look saved on the way in', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-sample-furnished').click();
    await page.waitForURL(/\/p\/[^/]+\/design$/);
    await designReady(page);
    const toast = page.getByTestId('toast').filter({ hasText: 'First layout' });
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await expect(toast).toContainText('Variants');
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');
    expect((await variants(page)).map((v) => v.name)).toEqual(['First layout']);
    expect(Object.keys((await variants(page))[0]!.items)).toHaveLength(await itemTotal(page));
    await expectSaved(page);
    await page.reload();
    await designReady(page);
    await page.waitForTimeout(1500);
    await expect(variantCount(page)).toHaveAttribute('data-count', '1');
  });

  test('save looks, switch between them, rename, update and delete; they survive undo and a reload', async ({ page }) => {
    const projectId = await openSample(page);
    await designReady(page);
    await page.getByTestId('furnish-home').click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '1', { timeout: 20_000 });
    const bedroom = await room(page, 'Bedroom 1');
    const furnished = await itemTotal(page);
    await openVariants(page);
    const hint = page.getByTestId('variants-hint');
    await expect(hint).toHaveText('This look is saved as “First layout”.');
    await expect(page.getByTestId('variant-name-input')).toHaveValue('Variant 2');

    // A second look: evening light, a walnut floor and a renamed bedroom, with its furniture cleared.
    await page.getByTestId('lighting-preset').getByRole('tab', { name: 'Warm evening' }).click();
    await setRoom(page, bedroom.id, { floorMaterial: 'floor.walnut', name: 'Guest room' });
    await page.evaluate((roomId) => {
      (window as unknown as Dev).__interio.store.getState().mutateLevel((l) => {
        for (const item of Object.values(l.items)) if (item.roomId === roomId) delete l.items[item.id];
      });
    }, bedroom.id);
    const fewer = await itemTotal(page);
    expect(fewer).toBeLessThan(furnished);
    await expect(hint).toHaveText('Keeps furniture, room looks and lighting.');
    await expect(page.locator('[data-testid="variant-card"][data-current="true"]')).toHaveCount(0);

    await page.getByTestId('variant-name-input').fill('Evening walnut');
    await page.getByTestId('variant-save').click();
    await expect(toastMessage(page)).toHaveText('Saved “Evening walnut”');
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    await expect(page.getByTestId('variants-total')).toHaveText('2');
    // Newest first, and the one the home looks like is marked.
    expect(await cardNames(page)).toEqual(['Evening walnut', 'First layout']);
    await expect(card(page, 'Evening walnut')).toHaveAttribute('data-current', 'true');
    await expect(card(page, 'Evening walnut')).toContainText('Current');
    await expect(card(page, 'First layout')).toHaveAttribute('data-current', 'false');
    await expect(card(page, 'Evening walnut').getByTestId('variant-items')).toHaveText(`${fewer} items`);
    // There is nothing to apply on the current one.
    await expect(card(page, 'Evening walnut').getByTestId('variant-apply')).toHaveCount(0);
    await expect(card(page, 'First layout').getByTestId('variant-apply')).toBeEnabled();
    await expect(page.getByTestId('variant-name-input')).toHaveValue('Variant 3');
    const steps = await undoSteps(page);

    // Switch to the first look: items, room name, finish and lighting follow, as one undo step.
    await card(page, 'First layout').getByTestId('variant-apply').click();
    await expect(toastMessage(page)).toContainText('Switched to “First layout”');
    await expect(card(page, 'First layout')).toHaveAttribute('data-current', 'true');
    await expect(card(page, 'Evening walnut')).toHaveAttribute('data-current', 'false');
    expect(await itemTotal(page)).toBe(furnished);
    expect(await room(page, 'Bedroom 1')).toMatchObject({ id: bedroom.id, floorMaterial: 'floor.oak' });
    await expect(page.getByTestId('lighting-preset')).toHaveAttribute('data-preset', 'daylight');
    await expect(page.getByTestId('item-count')).toHaveAttribute('data-count', String(furnished));
    expect(await undoSteps(page)).toBe(steps + 1);

    // And back again.
    await card(page, 'Evening walnut').getByTestId('variant-apply').click();
    expect(await itemTotal(page)).toBe(fewer);
    expect(await room(page, 'Guest room')).toMatchObject({ id: bedroom.id, floorMaterial: 'floor.walnut' });
    await expect(page.getByTestId('lighting-preset')).toHaveAttribute('data-preset', 'evening');
    expect((await project(page)).settings['viewer3d.lighting']).toBe('evening');

    // Undo takes the switch back; the saved variants are not part of undo history.
    await undo(page).click();
    await expect(card(page, 'First layout')).toHaveAttribute('data-current', 'true');
    expect(await itemTotal(page)).toBe(furnished);
    for (let i = 0; i < 3; i++) await undo(page).click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    await redo(page).click();
    await redo(page).click();
    await redo(page).click();
    await expect(card(page, 'First layout')).toHaveAttribute('data-current', 'true');

    // A look that is saved nowhere: switching offers to save it first.
    await setRoom(page, bedroom.id, { wallMaterial: 'wall.paint.sage' });
    await expect(page.locator('[data-testid="variant-card"][data-current="true"]')).toHaveCount(0);
    await card(page, 'Evening walnut').getByTestId('variant-apply').click();
    const dialog = page.getByRole('dialog', { name: 'Save the current look first?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('switch-save-name')).toHaveValue('Variant 3');
    await expect(dialog.getByRole('button', { name: 'Save and switch' })).toBeFocused();
    // Cancel changes nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await room(page, 'Bedroom 1')).toMatchObject({ wallMaterial: 'wall.paint.sage' });
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    // Switch without saving drops the look (Undo still has it).
    await card(page, 'Evening walnut').getByTestId('variant-apply').click();
    await dialog.getByRole('button', { name: 'Switch without saving' }).click();
    await expect(card(page, 'Evening walnut')).toHaveAttribute('data-current', 'true');
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    // Save and switch keeps it under the name given.
    await undo(page).click();
    expect(await room(page, 'Bedroom 1')).toMatchObject({ wallMaterial: 'wall.paint.sage' });
    await card(page, 'Evening walnut').getByTestId('variant-apply').click();
    await dialog.getByTestId('switch-save-name').fill('Sage bedroom');
    await dialog.getByRole('button', { name: 'Save and switch' }).click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '3');
    expect(await cardNames(page)).toEqual(['Sage bedroom', 'Evening walnut', 'First layout']);
    await expect(card(page, 'Evening walnut')).toHaveAttribute('data-current', 'true');
    const sage = (await variants(page)).find((v) => v.name === 'Sage bedroom')!;
    expect(sage.rooms[bedroom.id]).toMatchObject({ name: 'Bedroom 1', wallMaterial: 'wall.paint.sage' });
    expect(sage.thumbnail).toMatch(/^data:image\/jpeg;base64,/);

    // Rename in place: Escape keeps the name, Enter takes the new one.
    await page.getByRole('button', { name: 'Rename Sage bedroom' }).click();
    const rename = page.getByTestId('variant-rename-input');
    await expect(rename).toBeFocused();
    await rename.fill('Nope');
    await rename.press('Escape');
    expect(await cardNames(page)).toContain('Sage bedroom');
    await page.getByRole('button', { name: 'Rename Sage bedroom' }).click();
    await rename.fill('Sage walls');
    await rename.press('Enter');
    expect(await cardNames(page)).toEqual(['Sage walls', 'Evening walnut', 'First layout']);
    expect((await variants(page)).map((v) => v.name).sort()).toEqual(['Evening walnut', 'First layout', 'Sage walls']);

    // Update with the current look: the variant now holds what is on screen and becomes the current one too.
    const before = (await variants(page)).find((v) => v.name === 'First layout')!;
    expect(Object.keys(before.items)).toHaveLength(furnished);
    await expect(page.getByRole('button', { name: 'Update Evening walnut with the current look' })).toBeDisabled();
    await page.getByRole('button', { name: 'Update First layout with the current look' }).click();
    await expect(toastMessage(page)).toHaveText('Updated “First layout” with the current look');
    const updated = (await variants(page)).find((v) => v.name === 'First layout')!;
    expect(updated.id).toBe(before.id);
    expect(Object.keys(updated.items)).toHaveLength(fewer);
    expect(updated.settings['viewer3d.lighting']).toBe('evening');
    expect(updated.thumbnail).not.toBe(before.thumbnail);
    await expect(card(page, 'First layout')).toHaveAttribute('data-current', 'true');
    await expect(card(page, 'First layout').getByTestId('variant-items')).toHaveText(`${fewer} items`);

    // Delete asks first.
    await page.getByRole('button', { name: 'Delete Sage walls' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete variant' });
    await expect(confirm).toContainText('Sage walls');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '3');
    await page.getByRole('button', { name: 'Delete Sage walls' }).click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    expect(await cardNames(page)).toEqual(['Evening walnut', 'First layout']);

    // Persisted with the project: reload and read the record back.
    await expectSaved(page);
    const live = await variants(page);
    await page.reload();
    await designReady(page);
    await expect(variantCount(page)).toHaveAttribute('data-count', '2');
    expect(await variants(page)).toEqual(live);
    expect((await stored(page, projectId)).variants).toEqual(live);
    await openVariants(page);
    expect(await cardNames(page)).toEqual(['Evening walnut', 'First layout']);
    await expect(page.locator('[data-testid="variant-card"][data-current="true"]')).toHaveCount(2);
    await expect(page.getByTestId('variant-thumbnail')).toHaveCount(2);
    // Applying after a reload still works, and the view keeps drawing.
    await setRoom(page, bedroom.id, { name: 'Den' });
    await card(page, 'Evening walnut').getByTestId('variant-apply').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Switch without saving' }).click();
    expect(await room(page, 'Guest room')).toMatchObject({ id: bedroom.id });
    await designReady(page);
  });
});
