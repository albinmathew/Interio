/**
 * PDF floor plan -> PlanDraft.
 *
 * Pipeline (one file per stage):
 *   extract.ts   vector geometry with layer, line width and path id (full CTM stack)
 *   roles.ts     layer name -> role
 *   strips.ts    opposite parallel edges -> wall strips (centreline + thickness)
 *   doors.ts     swing arcs -> hinged doors
 *   topology.ts  strips + openings -> connected wall runs
 *   scale.ts     mm per drawing unit from dimensions, wall thickness and title block
 *   build.ts     level via @interio/core ops, room names, confidence, issues, underlay
 */
import type { LayerRole, PlanDraft, VisionResult } from '@interio/core';
import { analyse, type Analysis } from './analyse';
import { buildDraft, planFromImage, type BuildResult, type RoomCheck } from './build';
import { ImportError } from './errors';
import { extractPage, openPdf, type Extracted } from './extract';
import { isBrowser } from './pdfjs';
import type { ScaleCandidates } from './scale';

export { ImportError } from './errors';
export { analyse, type Analysis } from './analyse';
export { buildDraft, sizesMatch, sizeTolerance, type RoomCheck, type BuildResult } from './build';
export { extractPage, type Extracted, type Seg, type Curve } from './extract';
export { classifyLayer, layerKey, assignRoles, nominalThickness } from './roles';
export { Dirs, pairStrips, mergeStacked, dominantThickness, pathWinding, type Strip, type EdgeIn } from './strips';
export { findArcs, findDoors, type DoorSymbol } from './doors';
export { buildRuns, snapEnds, makeWallSupport, runEnds, type Run, type RunOpening } from './topology';
export { chooseScale, clearSpans, dimensionScale, parseScaleText, nearestStandardWall, MM_PER_PT, type ScaleCandidates } from './scale';

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
  /** Attach a raster of the page to the underlay. Defaults to true in a browser, false elsewhere. */
  raster?: boolean;
  /** Longest side of the raster underlay in pixels. */
  rasterMaxSidePx?: number;
}

/** Everything the wizard needs to re-run the geometry without re-reading the PDF. */
export interface ImportDetail {
  draft: PlanDraft;
  /** Labelled rooms against what was measured. */
  checks: RoomCheck[];
  /** The three automatic scale estimates, mm per PDF unit. */
  scaleCandidates: ScaleCandidates;
  mode: Analysis['mode'];
  /** Page size in PDF units, and the page-frame position of the plan origin. */
  page: { width: number; height: number; origin: { x: number; y: number } };
  extracted: Extracted;
}

function detail(ex: Extracted, opts: ImportOptions): ImportDetail {
  const an = analyse(ex, opts.roleOverrides);
  opts.onProgress?.('Building rooms', 0.8);
  const built: BuildResult = buildDraft(ex, an, { fileName: opts.fileName, vision: opts.vision, mmPerPdfUnit: opts.mmPerPdfUnit });
  return {
    draft: built.draft,
    checks: built.checks,
    scaleCandidates: built.candidates,
    mode: an.mode,
    page: { width: ex.width, height: ex.height, origin: built.origin },
    extracted: ex,
  };
}

/** Geometry only: turns an already extracted page into a draft. Synchronous, so the wizard can re-run it on every change. */
export function importExtracted(ex: Extracted, opts: ImportOptions = {}): ImportDetail {
  try {
    return detail(ex, opts);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    // A bug in a geometry stage must not lose the user's file: fall back to tracing.
    const an = analyse({ ...ex, segs: [], curves: [], paths: [] }, opts.roleOverrides);
    const built = buildDraft(ex, an, { fileName: opts.fileName, vision: opts.vision, mmPerPdfUnit: opts.mmPerPdfUnit });
    built.draft.issues.unshift({
      severity: 'error',
      code: 'analysis-failed',
      message: `The plan could not be analysed (${e instanceof Error ? e.message : String(e)}). Trace it over the drawing in the editor.`,
    });
    return {
      draft: built.draft,
      checks: [],
      scaleCandidates: built.candidates,
      mode: 'none',
      page: { width: ex.width, height: ex.height, origin: built.origin },
      extracted: ex,
    };
  }
}

async function attachRaster(result: ImportDetail, data: ArrayBuffer, opts: ImportOptions): Promise<void> {
  const want = opts.raster ?? isBrowser();
  if (!want) return;
  try {
    const { blob, widthPx, heightPx } = await renderPage(data, opts.rasterMaxSidePx ?? 2400, opts.page ?? 1);
    result.draft.underlay.image = {
      blob,
      widthPx,
      heightPx,
      planFromImage: planFromImage(result.page.origin, result.draft.scale.mmPerPdfUnit, result.page, widthPx, heightPx),
    };
  } catch {
    result.draft.issues.push({ severity: 'info', code: 'no-raster', message: 'The page image could not be rendered; only the line work is available as a backdrop.' });
  }
}

/** Like `importPdf`, and also returns the measurements and the extracted page for the review screen. */
export async function importPdfDetailed(data: ArrayBuffer, opts: ImportOptions = {}): Promise<ImportDetail> {
  opts.onProgress?.('Reading PDF', 0.05);
  const ex = await extractPage(data, opts.page ?? 1);
  opts.onProgress?.('Finding walls', 0.5);
  const result = importExtracted(ex, opts);
  opts.onProgress?.('Rendering backdrop', 0.9);
  await attachRaster(result, data, opts);
  opts.onProgress?.('Done', 1);
  return result;
}

/** Reads a floor-plan PDF and proposes a plan. Never throws on a low-quality result: it reports `issues`. */
export async function importPdf(data: ArrayBuffer, opts: ImportOptions = {}): Promise<PlanDraft> {
  return (await importPdfDetailed(data, opts)).draft;
}

async function renderPage(data: ArrayBuffer, maxSidePx: number, pageNo: number): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  const { doc } = await openPdf(data);
  try {
    const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, pageNo)));
    const unit = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxSidePx / Math.max(unit.width, unit.height) });
    const widthPx = Math.max(1, Math.round(viewport.width));
    const heightPx = Math.max(1, Math.round(viewport.height));
    if (isBrowser()) {
      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, widthPx, heightPx);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Canvas export failed');
      return { blob, widthPx, heightPx };
    }
    // Node: pdf.js brings its own canvas factory when @napi-rs/canvas is installed.
    const factory = doc.canvasFactory;
    const target = factory.create(widthPx, heightPx);
    target.context.fillStyle = '#fff';
    target.context.fillRect(0, 0, widthPx, heightPx);
    await page.render({ canvas: target.canvas, canvasContext: target.context, viewport }).promise;
    const bytes: Uint8Array = target.canvas.toBuffer('image/png');
    return { blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }), widthPx, heightPx };
  } finally {
    await doc.destroy?.();
  }
}

/** Renders a page to PNG for the AI assist request and for the raster underlay. */
export async function renderPdfPage(data: ArrayBuffer, maxSidePx = 2000, page = 1): Promise<Blob> {
  try {
    return (await renderPage(data, maxSidePx, page)).blob;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(`The page could not be rendered: ${e instanceof Error ? e.message : String(e)}`, 'failed');
  }
}
