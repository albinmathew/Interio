/**
 * Headless render harness: bundles `render/page.ts` with esbuild, serves it next
 * to the static catalog files and opens it in Chromium with software WebGL.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { CATALOG_PKG, PUBLIC_CATALOG } from './paths';


const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.js': 'text/javascript',
  '.html': 'text/html',
};

export interface RenderSession {
  page: Page;
  origin: string;
  close(): Promise<void>;
}

/**
 * @param mounts extra static directories, keyed by URL prefix (e.g. `{ '/kit/': '/path/to/kit' }`).
 */
export async function openRenderPage(mounts: Record<string, string> = {}): Promise<RenderSession> {
  const bundle = await build({
    entryPoints: [path.join(CATALOG_PKG, 'scripts/render/page.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const script = bundle.outputFiles[0]!.text;
  const roots: Record<string, string> = { '/catalog/': PUBLIC_CATALOG, ...mounts };

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><script src="/page.js"></script></body>');
      return;
    }
    if (url === '/page.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(script);
      return;
    }
    for (const [prefix, dir] of Object.entries(roots)) {
      if (!url.startsWith(prefix)) continue;
      const file = path.resolve(dir, url.slice(prefix.length));
      if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) break;
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Render server failed to start');
  const origin = `http://127.0.0.1:${address.port}`;

  // Same flags as tests/e2e/playwright.config.ts: software WebGL for headless runs.
  const browser: Browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (err) => console.error('[page error]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[page]', msg.text());
  });
  await page.goto(origin);
  await page.waitForFunction(() => 'interioRender' in window);

  return {
    page,
    origin,
    async close() {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}
