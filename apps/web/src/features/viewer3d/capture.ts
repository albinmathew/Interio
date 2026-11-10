/**
 * Picture export: draws the current view once at a higher pixel ratio, without the
 * helpers (selection outline, handles, placement ghost), and reads it back as a PNG.
 */
import * as THREE from 'three';

/** Longest side of an exported picture, in pixels. */
export const MAX_CAPTURE_SIZE = 4096;

/**
 * Pixel ratio for an export of a `width` x `height` (CSS px) canvas: `scale`, or less
 * when the picture would be longer than `limit` pixels on a side.
 */
export function captureRatio(width: number, height: number, scale = 2, limit = MAX_CAPTURE_SIZE): number {
  return Math.min(scale, limit / Math.max(width, height, 1));
}

/** "Sample 3-bedroom apartment" -> "interio-sample-3-bedroom-apartment-2026-11-10-14-03-22.png" */
export function captureFileName(projectName: string, at = new Date()): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `interio-${slug}-${stamp}.png`;
}

export interface CaptureOptions {
  /** Pixels per CSS pixel. Default 2. */
  scale?: number;
  /** Camera layers left out of the picture (helpers). */
  hideLayers?: number[];
  /** Names of objects left out of the picture. */
  hideObjects?: string[];
}

/**
 * Renders `scene` once at `scale` times the canvas size and returns the PNG as a data
 * URL. The renderer, camera and scene are put back exactly as they were, and the view
 * is drawn again at its own size before the browser paints.
 */
export function capturePng(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: CaptureOptions = {}): string {
  const size = gl.getSize(new THREE.Vector2());
  const ratio = gl.getPixelRatio();
  const limit = Math.min(MAX_CAPTURE_SIZE, gl.capabilities.maxTextureSize);
  const lens = camera as THREE.PerspectiveCamera;
  const view = lens.view?.enabled ? { ...lens.view } : null;
  const layers = (opts.hideLayers ?? []).filter((l) => camera.layers.isEnabled(l));
  const hidden = (opts.hideObjects ?? []).flatMap((name) => scene.getObjectByName(name) ?? []).filter((o) => o.visible);
  try {
    gl.setPixelRatio(captureRatio(size.x, size.y, opts.scale ?? 2, limit));
    // The live view is shifted to clear the side panels; the picture has none, so centre it.
    if (view) lens.clearViewOffset();
    for (const l of layers) camera.layers.disable(l);
    for (const o of hidden) o.visible = false;
    gl.render(scene, camera);
    return gl.domElement.toDataURL('image/png');
  } finally {
    for (const o of hidden) o.visible = true;
    for (const l of layers) camera.layers.enable(l);
    if (view) lens.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    gl.setPixelRatio(ratio);
    gl.render(scene, camera);
  }
}

/** Saves a data URL as a file through a temporary link. */
export function downloadDataUrl(dataUrl: string, name: string): void {
  const [head, body = ''] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: head?.match(/data:([^;]+)/)?.[1] ?? 'image/png' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Set by the scene while it is mounted: takes the picture and returns it as a PNG data URL. */
export const captureBridge: { capture: ((scale?: number) => string) | null } = { capture: null };
