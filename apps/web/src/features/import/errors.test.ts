import { ImportError } from '@interio/importer';
import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, checkFile, describeImportError } from './errors';

describe('import problems', () => {
  it('catches empty and oversized files before reading them', () => {
    expect(checkFile({ name: 'plan.pdf', size: 250_000 })).toBeNull();
    expect(checkFile({ name: 'plan.pdf', size: MAX_PDF_BYTES })).toBeNull();
    expect(checkFile({ name: 'plan.pdf', size: 0 })).toMatchObject({ code: 'empty' });
    const large = checkFile({ name: 'set.pdf', size: MAX_PDF_BYTES + 1 });
    expect(large).toMatchObject({ code: 'too-large' });
    expect(large!.title).toContain('set.pdf');
    expect(large!.title).toMatch(/50 MB/);
    expect(large!.hint).toMatch(/up to 50 MB/);
    expect(checkFile({ name: 'big.pdf', size: 120 * 1024 * 1024 })!.title).toContain('120 MB');
  });

  it('tells the unreadable cases apart from the wording of the PDF library', () => {
    const failed = (message: string) => new ImportError(`The PDF could not be read: ${message}`, 'failed');
    expect(describeImportError(new ImportError('This file is not a PDF', 'not-a-pdf'), 'notes.pdf')).toMatchObject({ code: 'not-a-pdf', title: 'notes.pdf is not a PDF.' });
    expect(describeImportError(failed('No password given'), 'locked.pdf')).toMatchObject({ code: 'encrypted' });
    expect(describeImportError(failed('Incorrect Password'), 'locked.pdf').title).toMatch(/password-protected/);
    expect(describeImportError(failed('Invalid PDF structure.'), 'broken.pdf')).toMatchObject({ code: 'corrupt' });
    expect(describeImportError(failed('Bad XRef entry'), 'broken.pdf')).toMatchObject({ code: 'corrupt' });
    expect(describeImportError(new RangeError('Array buffer allocation failed'), 'huge.pdf')).toMatchObject({ code: 'too-large' });
  });

  it('keeps the detail of a failure it does not recognise', () => {
    const problem = describeImportError(new Error('worker crashed'), 'plan.pdf');
    expect(problem.code).toBe('failed');
    expect(problem.hint).toContain('worker crashed');
    expect(describeImportError('just a string', 'plan.pdf').hint).toContain('just a string');
  });
});
