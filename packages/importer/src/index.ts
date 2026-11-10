/**
 * PDF floor plan -> PlanDraft.
 *
 * Phase 0 ships the public surface only. The importer workstream implements it:
 * pdf.js vector extraction with layers, layer roles, wall strips, openings,
 * scale, rooms, and the merge of the AI result.
 */
import type { LayerRole, PlanDraft, VisionResult } from '@interio/core';

export interface ImportOptions {
  /** Original file name, kept in the project source. */
  fileName?: string;
  /** AI reading of the page (room names, dimensions, tags). Null or absent runs vector-only. */
  vision?: VisionResult | null;
  /** User corrections from the wizard: layer name -> role. */
  roleOverrides?: Record<string, LayerRole>;
  /** User calibration from the wizard. Overrides every automatic estimate. */
  mmPerPdfUnit?: number;
  /** 1-based page number. Defaults to the first page. */
  page?: number;
  onProgress?: (stage: string, fraction: number) => void;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: 'not-implemented' | 'not-a-pdf' | 'no-vectors' | 'failed',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Reads a floor-plan PDF and proposes a plan. Never throws on a low-quality result: it reports `issues`. */
export async function importPdf(_data: ArrayBuffer, _opts: ImportOptions = {}): Promise<PlanDraft> {
  throw new ImportError('PDF import is not implemented yet', 'not-implemented');
}

/** Renders a page to PNG for the AI assist request and for the raster underlay. */
export async function renderPdfPage(_data: ArrayBuffer, _maxSidePx = 2000, _page = 1): Promise<Blob> {
  throw new ImportError('PDF rendering is not implemented yet', 'not-implemented');
}
