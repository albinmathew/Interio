/**
 * Renders contact sheets of a directory of source GLBs, with +X (red) and
 * +Z (blue) arrows, to judge style and find each model's front before adding it
 * to `src/models.ts`.
 *
 *   pnpm --filter @interio/catalog preview-kit <dir with .glb files> <output prefix>
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataUrlToBuffer, openRenderPage } from './lib/browser';
import type { RenderApi } from './render/page';

declare const interioRender: RenderApi;

const [dir, prefix = 'kit'] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: preview-kit <dir> <output prefix>');
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.glb'))
  .sort();
const session = await openRenderPage({ '/kit/': path.resolve(dir) });
try {
  const perSheet = 40;
  for (let start = 0; start < files.length; start += perSheet) {
    const cells: { label: string; src: string }[] = [];
    for (const file of files.slice(start, start + perSheet)) {
      const src = await session.page.evaluate(
        ([url]) => interioRender.thumbGlb(url!, { size: 200, axes: true, mime: 'image/png' }),
        [`/kit/${encodeURIComponent(file)}`],
      );
      cells.push({ label: file.replace(/\.glb$/, ''), src });
    }
    const sheet = await session.page.evaluate(([c]) => interioRender.contactSheet(c!, 8, 200), [cells]);
    const out = `${prefix}-${String(start / perSheet + 1).padStart(2, '0')}.png`;
    fs.writeFileSync(out, dataUrlToBuffer(sheet));
    console.log('wrote', out);
  }
} finally {
  await session.close();
}
