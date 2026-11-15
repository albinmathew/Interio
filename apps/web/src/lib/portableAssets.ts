/**
 * Which stored assets travel in a project file, and which assets of an opened file are
 * kept. Pure: no storage, no DOM beyond `Blob`.
 *
 * Assets are stored per project under a name: `underlay`, `pdf`, and one `mural/<assetId>`
 * per picture the user put on a wall (see `lib/murals.ts`).
 */
import { isMuralAssetId, muralAssetIds, type Project, type Underlay } from '@interio/core';

export const MURAL_ASSET_PREFIX = 'mural/';

/** The asset name a mural picture is stored under. */
export const muralAssetName = (assetId: string): string => `${MURAL_ASSET_PREFIX}${assetId}`;

/** The asset id behind a stored asset name, or null when the name is not a mural's. */
export function muralAssetIdOf(name: string): string | null {
  if (!name.startsWith(MURAL_ASSET_PREFIX)) return null;
  const id = name.slice(MURAL_ASSET_PREFIX.length);
  return isMuralAssetId(id) ? id : null;
}

/** True for a value that can be a mural picture: an image blob. */
export const isMuralImage = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob && value.type.startsWith('image/');

/** A source PDF larger than this stays behind: the plan and its underlay are what the project needs. */
export const MAX_EMBEDDED_PDF_BYTES = 25_000_000;

const isFloat32 = (v: unknown): v is Float32Array => v instanceof Float32Array;

/** A stored or imported underlay is only used when it has the shape the editor expects. */
export function asUnderlay(value: unknown): Underlay | null {
  if (!value || typeof value !== 'object') return null;
  const u = value as Partial<Underlay>;
  if (!isFloat32(u.segments) || !isFloat32(u.snapPoints)) return null;
  const underlay: Underlay = { segments: u.segments, snapPoints: u.snapPoints };
  const image = u.image;
  if (
    image &&
    image.blob instanceof Blob &&
    Number.isFinite(image.widthPx) &&
    Number.isFinite(image.heightPx) &&
    Array.isArray(image.planFromImage) &&
    image.planFromImage.length === 6 &&
    image.planFromImage.every((n) => Number.isFinite(n))
  ) {
    underlay.image = { blob: image.blob, widthPx: image.widthPx, heightPx: image.heightPx, planFromImage: image.planFromImage };
  }
  return underlay;
}

/**
 * The assets an exported project carries: its underlay, its source PDF (unless it is too
 * large, then it is listed in `skipped`), and the mural pictures its walls show.
 */
export function portableAssets(project: Pick<Project, 'levels'>, stored: Record<string, unknown>): { assets: Record<string, unknown>; skipped: string[] } {
  const assets: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const name of ['underlay', 'pdf'] as const) {
    const value = stored[name];
    if (value === undefined || value === null) continue;
    if (name === 'pdf' && value instanceof Blob && value.size > MAX_EMBEDDED_PDF_BYTES) skipped.push(name);
    else assets[name] = value;
  }
  // Only the pictures in use: one swapped for another, or taken off a wall, stays home.
  for (const id of muralAssetIds(project)) {
    const value = stored[muralAssetName(id)];
    if (isMuralImage(value)) assets[muralAssetName(id)] = value;
  }
  return { assets, skipped };
}

/** The assets of an opened project file this version uses, checked for shape; anything else is dropped. */
export function importableAssets(raw: Record<string, unknown>): Record<string, unknown> {
  const assets: Record<string, unknown> = {};
  const underlay = asUnderlay(raw.underlay);
  if (underlay) assets.underlay = underlay;
  if (raw.pdf instanceof Blob) assets.pdf = raw.pdf;
  for (const [name, value] of Object.entries(raw)) {
    if (muralAssetIdOf(name) && isMuralImage(value)) assets[name] = value;
  }
  return assets;
}
