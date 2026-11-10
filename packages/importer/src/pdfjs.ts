/**
 * Loads pdf.js for the current runtime: the legacy build under Node (Vitest,
 * scripts), the modern build with a module worker in the browser.
 */
export type PdfjsModule = any;

let cached: Promise<PdfjsModule> | null = null;

export const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export function loadPdfjs(): Promise<PdfjsModule> {
  if (cached) return cached;
  cached = (async () => {
    if (isBrowser()) {
      const pdfjs: PdfjsModule = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    }
    const legacy = 'pdfjs-dist/legacy/build/pdf.mjs';
    return import(/* @vite-ignore */ legacy);
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
