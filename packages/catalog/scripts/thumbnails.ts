/**
 * Renders a 256 px thumbnail for every catalog entry (GLB and parametric) from
 * one three-quarter angle on a transparent background and writes
 * `apps/web/public/catalog/thumbs/<id>.webp`.
 *
 *   pnpm --filter @interio/catalog thumbnails                 # all entries
 *   pnpm --filter @interio/catalog thumbnails -- --only sofa   # ids containing "sofa"
 *   pnpm --filter @interio/catalog thumbnails -- --sheet /tmp/catalog   # also write contact sheets <prefix>-NN.png
 *   ... --out <dir> --size 512 --elevation -15                        # debugging views, written elsewhere
 *
 * Runs headless in Chromium (software WebGL) through Playwright.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG } from '../src/index';
import { dataUrlToBuffer, openRenderPage } from './lib/browser';
import { THUMBS_DIR } from './lib/paths';
import type { RenderApi } from './render/page';

declare const interioRender: RenderApi;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag('--only');
const sheet = flag('--sheet');
const outDir = flag('--out') ?? THUMBS_DIR;
const elevation = flag('--elevation');
const SIZE = Number(flag('--size') ?? 256);

const entries = CATALOG.filter((e) => !only || e.id.includes(only));
fs.mkdirSync(outDir, { recursive: true });
if (!only && outDir === THUMBS_DIR) {
  const wanted = new Set(CATALOG.map((e) => `${e.id}.webp`));
  for (const f of fs.readdirSync(THUMBS_DIR)) if (!wanted.has(f)) fs.rmSync(path.join(THUMBS_DIR, f));
}

const session = await openRenderPage();
try {
  const cells: { label: string; src: string }[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const src = await session.page.evaluate(
      ([id, size, el]) => interioRender.thumbEntry(id as string, { size: size as number, ...(el === null ? {} : { elevation: el as number }) }),
      [entry.id, SIZE, elevation === undefined ? null : Number(elevation)] as const,
    );
    const buf = dataUrlToBuffer(src);
    bytes += buf.byteLength;
    fs.writeFileSync(path.join(outDir, `${entry.id}.webp`), buf);
    cells.push({ label: `${entry.id}\n${entry.dims.w}x${entry.dims.d}x${entry.dims.h} ${entry.model.kind === 'glb' ? 'glb' : 'gen'}`, src });
  }
  console.log(`${entries.length} thumbnails, ${(bytes / 1024).toFixed(0)} KB in ${path.relative(process.cwd(), outDir)}`);
  if (sheet) {
    const perSheet = 48;
    for (let start = 0; start < cells.length; start += perSheet) {
      const png = await session.page.evaluate(([c]) => interioRender.contactSheet(c!, 8, 200), [cells.slice(start, start + perSheet)]);
      const out = `${sheet}-${String(start / perSheet + 1).padStart(2, '0')}.png`;
      fs.writeFileSync(out, dataUrlToBuffer(png));
      console.log('wrote', out);
    }
  }
} finally {
  await session.close();
}
