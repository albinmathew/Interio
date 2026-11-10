export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: 'not-implemented' | 'not-a-pdf' | 'no-vectors' | 'failed',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
