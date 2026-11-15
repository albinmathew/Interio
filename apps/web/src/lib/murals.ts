/**
 * The user's own pictures used as murals. A picture is an asset of the project
 * (`mural/<assetId>` in IndexedDB, next to the underlay and source PDF), and a wall face
 * shows it through its finish id (`mural:<assetId>` or `mural:<assetId>:dado`, see
 * `parseMuralFinish` in core). Everything stays in the browser: nothing is uploaded.
 */
import { planStore } from '@interio/core';
import { provideMuralImage, setMuralImageLoader } from '@interio/scene3d';
import { isMuralImage, muralAssetName } from './portableAssets';
import { storage } from './storage';

export function newMuralAssetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

/** Pictures larger than this on their long side are scaled down before they are stored. */
export const MAX_MURAL_SIDE = 4096;

/**
 * The picture as it is stored: the chosen file when it is already a reasonable size, else
 * a scaled-down JPEG. Rejects files that are not images or cannot be read.
 */
export async function prepareMuralImage(file: Blob): Promise<Blob> {
  if (!isMuralImage(file)) throw new Error('Choose an image file (JPEG, PNG or WebP).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image could not be read.');
  }
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    if (long <= MAX_MURAL_SIDE && file.size <= 12_000_000) return file;
    const k = Math.min(1, MAX_MURAL_SIDE / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * k));
    canvas.height = Math.max(1, Math.round(bitmap.height * k));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That image could not be read.'))), 'image/jpeg', 0.9));
  } finally {
    bitmap.close();
  }
}

/** Stores a picture with the project and makes it available to the 3D view at once. Returns its asset id. */
export async function saveMuralImage(projectId: string, file: Blob): Promise<string> {
  const image = await prepareMuralImage(file);
  const id = newMuralAssetId();
  await storage.putAsset(projectId, muralAssetName(id), image);
  provideMuralImage(id, image);
  return id;
}

let installed = false;

/** Lets the 3D views read mural pictures from the open project's stored assets. */
export function installMuralLoader(): void {
  if (installed) return;
  installed = true;
  setMuralImageLoader(async (assetId) => {
    const projectId = planStore.getState().project?.id;
    if (!projectId) return null;
    const value = await storage.getAsset<unknown>(projectId, muralAssetName(assetId));
    return isMuralImage(value) ? value : null;
  });
}
