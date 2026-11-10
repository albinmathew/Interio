/**
 * Small pieces shared by the pages of the shell: the browser tab title and the
 * hand-over of a dropped PDF from the dashboard to the import page.
 */
import { useEffect } from 'react';

export const APP_NAME = 'Interio';

/** Sets the browser tab title to "<title> · Interio" while the calling page is shown. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const name = title?.trim();
    document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}

let pendingPdf: File | null = null;

/**
 * A PDF dropped on one page and imported on another. A `File` cannot ride along
 * in the URL, so it waits here for the import page to pick it up.
 */
export const pdfHandoff = {
  put(file: File): void {
    pendingPdf = file;
  },
  take(): File | null {
    const file = pendingPdf;
    pendingPdf = null;
    return file;
  },
};

export const isPdfFile = (file: File): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** "1 item", "24 items". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
