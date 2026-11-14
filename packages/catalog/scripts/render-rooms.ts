/**
 * Furnishes every room of the sample home with `autoFurnish` and renders the
 * result, for a visual check of the layouts.
 *
 *   pnpm --filter @interio/catalog render-rooms <output prefix> [options]
 *
 * Options:
 *   --styling none|light|full   styling layer (default full)
 *   --views home,plan,rooms,top,eye   which pictures (default home,plan,rooms)
 *       home   the whole level from above at an angle
 *       plan   the whole level straight down
 *       rooms  each room from above at an angle, walls cut low
 *       top    each room straight down
 *       eye    each room at eye level from two corners, full-height walls
 *   --room <name part>          only rooms whose name contains this (case-insensitive)
 *   --level <file.json>         a level saved as JSON instead of the sample home (keep real drawings out of the repo)
 *   --scheme <id>               nudge the first room's seed point until the home gets this colour scheme
 *
 * Writes `<prefix>-<view>.png` / `<prefix>-<room>[-<view>].png` and prints what was placed.
 */
import fs from 'node:fs';
import { createSampleLevel, deriveRooms, vec, type Item, type Level } from '@interio/core';
import { autoFurnish } from '../src/index';
import { homeScheme } from '../src/autofurnish/schemes';
import { RoomSeed } from '../src/autofurnish/seed';
import { dataUrlToBuffer, openRenderPage } from './lib/browser';
import type { LevelRenderOptions, RenderApi } from './render/page';

declare const interioRender: RenderApi;

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const prefix = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1]!.startsWith('--'))) ?? 'rooms';
const styling = (flag('--styling') ?? 'full') as 'none' | 'light' | 'full';
const views = new Set((flag('--views') ?? 'home,plan,rooms').split(','));
const only = flag('--room')?.toLowerCase();

const levelFile = flag('--level');
const level: Level = levelFile ? (JSON.parse(fs.readFileSync(levelFile, 'utf8')) as Level) : createSampleLevel();
const scheme = flag('--scheme');
if (scheme) {
  const first = Object.values(level.rooms)[0]!;
  const start = { ...first.seed };
  for (let k = 0; k < 40 && homeScheme(new RoomSeed(level, first)).id !== scheme; k++) first.seed = { x: start.x + ((k % 7) - 3) * 100, y: start.y + (Math.floor(k / 7) - 3) * 100 };
  console.log('scheme', homeScheme(new RoomSeed(level, first)).id);
}
const items: Omit<Item, 'id'>[] = [];
for (const room of Object.values(level.rooms)) {
  const placed = autoFurnish(level, room.id, { styling });
  items.push(...placed);
  console.log(`${room.name} (${room.type}, ${placed.length}): ${placed.map((i) => i.catalogId).join(', ') || 'nothing'}`);
}
console.log(`total ${items.length} items`);

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const session = await openRenderPage();
try {
  const shot = async (name: string, opts: LevelRenderOptions) => {
    const png = await session.page.evaluate(([l, i, o]) => interioRender.renderLevel(l, i, o), [level, items, opts] as const);
    const out = `${prefix}-${name}.png`;
    fs.writeFileSync(out, dataUrlToBuffer(png));
    console.log('wrote', out);
  };
  if (views.has('home')) await shot('home', { elevation: 62, azimuth: 0, width: 1500, height: 1200 });
  if (views.has('plan')) await shot('plan', { elevation: 89.5, azimuth: 0, width: 1500, height: 1250 });
  const geoms = deriveRooms(level);
  for (const room of Object.values(level.rooms)) {
    if (only && !room.name.toLowerCase().includes(only)) continue;
    const name = slug(room.name);
    if (views.has('rooms') && room.type !== 'corridor') await shot(name, { roomId: room.id, elevation: 48, azimuth: 0, width: 1000, height: 800 });
    if (views.has('top')) await shot(`${name}-top`, { roomId: room.id, elevation: 89.5, azimuth: 0, width: 1000, height: 800, wallHeight: 2700 });
    if (views.has('eye')) {
      const geom = geoms.find((g) => g.roomId === room.id);
      if (!geom) continue;
      // From the two corners furthest apart, looking across the room.
      const corners = [...geom.interior].sort((a, b) => vec.dist(b, geom.centroid) - vec.dist(a, geom.centroid));
      const picks = [corners[0]!, corners.find((c) => vec.dist(c, corners[0]!) > 1500) ?? corners[1]!];
      for (const [k, corner] of picks.entries()) {
        const inset = vec.add(corner, vec.scale(vec.norm(vec.sub(geom.centroid, corner)), 350));
        await shot(`${name}-eye${k + 1}`, {
          roomId: room.id,
          width: 1200,
          height: 800,
          eye: { x: inset.x, y: inset.y, z: 1550, tx: geom.centroid.x, ty: geom.centroid.y, tz: 1000, fov: 72 },
        });
      }
    }
  }
} finally {
  await session.close();
}
