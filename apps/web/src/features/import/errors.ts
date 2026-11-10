/**
 * Turns what can go wrong with an uploaded file into a message that says what
 * happened and what to do next. The importer reports unreadable files with the
 * PDF library's own wording; that wording is only used to tell the cases apart.
 */
import { ImportError } from '@interio/importer';

/** Plans are a few hundred kilobytes; whole drawing sets run to tens of megabytes. Beyond this the browser tab runs out of memory. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export interface ImportProblem {
  /** One line, shown in bold. */
  title: string;
  /** What to do about it. */
  hint: string;
  code: 'empty' | 'too-large' | 'not-a-pdf' | 'encrypted' | 'corrupt' | 'failed';
}

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** Problems that can be told from the file alone, before reading it. */
export function checkFile(file: { name: string; size: number }): ImportProblem | null {
  if (file.size === 0) return { code: 'empty', title: `${file.name} is empty.`, hint: 'The file has no content. Download or export it again and upload the new copy.' };
  if (file.size > MAX_PDF_BYTES)
    return {
      code: 'too-large',
      title: `${file.name} is too large (${megabytes(file.size)}).`,
      hint: `Interio reads PDFs up to ${megabytes(MAX_PDF_BYTES)}. Save just the floor-plan page as its own PDF (Print, then Save as PDF, choosing that page) and upload that.`,
    };
  return null;
}

/** Explains a failure thrown while reading or analysing the PDF. */
export function describeImportError(error: unknown, fileName: string): ImportProblem {
  const text = error instanceof Error ? error.message : String(error);
  if (error instanceof ImportError && error.code === 'not-a-pdf')
    return { code: 'not-a-pdf', title: `${fileName} is not a PDF.`, hint: 'Upload the floor plan as a PDF. An image or a CAD file can be saved as a PDF from the program that opens it.' };
  if (/password|encrypt/i.test(text))
    return {
      code: 'encrypted',
      title: `${fileName} is password-protected.`,
      hint: 'Open it in a PDF viewer with its password, save an unlocked copy (Print, then Save as PDF) and upload that copy.',
    };
  if (/invalid pdf|missing pdf|unexpected (server )?response|bad xref|xref|invalid (root|page)|pages? (tree|count)|format ?error|end of (file|stream)|could not be read/i.test(text))
    return {
      code: 'corrupt',
      title: `${fileName} is damaged and could not be opened.`,
      hint: 'The file is incomplete or broken, often after an interrupted download. Download it again, or ask whoever sent it to export it again.',
    };
  if (/out of memory|allocation|array buffer allocation|invalid (array|typed array) length/i.test(text))
    return {
      code: 'too-large',
      title: `${fileName} is too large for this browser to read.`,
      hint: 'Save just the floor-plan page as its own PDF (Print, then Save as PDF, choosing that page) and upload that.',
    };
  return {
    code: 'failed',
    title: `${fileName} could not be imported.`,
    hint: `Try uploading it again. If it keeps failing, save a fresh copy from a PDF viewer (Print, then Save as PDF). Details: ${text}`,
  };
}
