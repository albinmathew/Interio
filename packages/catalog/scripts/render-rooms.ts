/**
 * Furnishes every room of the sample home with `autoFurnish` and renders the
 * result, for a visual check of the layouts.
 *
 *   pnpm --filter @interio/catalog render-rooms -- <output prefix>
 *
 * Writes `<prefix>-home.png` (whole level from above) and one `<prefix>-<room>.png`
 * per room, and prints what was placed.
 */
import fs from 'node:fs';
import { createSampleLevel, type Item } from '@interio/core';
import { autoFurnish } from '../src/index';
import { dataUrlToBuffer, openRenderPage } from './lib/browser';
import type { RenderApi } from './render/page';

declare const interioRender: RenderApi;

const prefix = process.argv[2] ?? 'rooms';
const level = createSampleLevel();
const items: Omit<Item, 'id'>[] = [];
for (const room of Object.values(level.rooms)) {
  const placed = autoFurnish(level, room.id);
  items.push(...placed);
  console.log(`${room.name} (${room.type}): ${placed.map((i) => i.catalogId).join(', ') || 'nothing'}`);
}

const session = await openRenderPage();
try {
  const shot = async (name: string, opts: { roomId?: string; elevation: number; azimuth: number; width: number; height: number }) => {
    const png = await session.page.evaluate(([l, i, o]) => interioRender.renderLevel(l, i, o), [level, items, opts] as const);
    const out = `${prefix}-${name}.png`;
    fs.writeFileSync(out, dataUrlToBuffer(png));
    console.log('wrote', out);
  };
  await shot('home', { elevation: 62, azimuth: 0, width: 1500, height: 1200 });
  await shot('plan', { elevation: 89.5, azimuth: 0, width: 1500, height: 1250 });
  for (const room of Object.values(level.rooms)) {
    if (room.type === 'corridor') continue;
    await shot(room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), { roomId: room.id, elevation: 48, azimuth: 0, width: 1000, height: 800 });
  }
} finally {
  await session.close();
}
