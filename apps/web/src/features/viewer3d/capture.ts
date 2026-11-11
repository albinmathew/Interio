/**
 * Picture export: draws the current view once at a higher pixel ratio, without the
 * helpers (selection outline, handles, placement ghost), and reads it back as a PNG.
 * The same pass at a low pixel ratio gives the small JPEG previews of saved variants.
 */
import * as THREE from 'three';

/** Longest side of an exported picture, in pixels. */
export const MAX_CAPTURE_SIZE = 4096;

/** Pixels per CSS pixel of an exported picture: twice the view, three times in the Showcase view (within `MAX_CAPTURE_SIZE`). */
export function exportScale(view: 'orbit' | 'top' | 'showcase'): number {
  return view === 'showcase' ? 3 : 2;
}

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

/** Size of a variant preview, in pixels. */
export const THUMBNAIL_WIDTH = 320;
export const THUMBNAIL_HEIGHT = 200;
/** Share of the view's width a preview keeps: the middle, where the home is framed between the panels. */
export const THUMBNAIL_CROP = 0.74;
/** Previews live inside the project file: stay under this many bytes. */
export const THUMBNAIL_MAX_BYTES = 25_000;
/** JPEG qualities tried in turn until a preview fits `THUMBNAIL_MAX_BYTES`. */
export const THUMBNAIL_QUALITIES = [0.7, 0.55, 0.4, 0.28];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The middle of a `width` x `height` view with the proportions of a preview: `crop` of
 * the width, or less when the view is not tall enough for that.
 */
export function thumbnailCrop(width: number, height: number, crop = THUMBNAIL_CROP, aspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT): Rect {
  let w = Math.max(1, width) * crop;
  let h = w / aspect;
  if (h > height) {
    h = Math.max(1, height);
    w = h * aspect;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The first encoding that fits `maxBytes` (data URL payload), or the smallest one tried. */
export function fitEncoding(encode: (quality: number) => string, maxBytes = THUMBNAIL_MAX_BYTES, qualities = THUMBNAIL_QUALITIES): string {
  let best = '';
  for (const quality of qualities) {
    const url = encode(quality);
    if (!best || url.length < best.length) best = url;
    // Base64 carries three bytes in four characters.
    if (((url.length - url.indexOf(',') - 1) * 3) / 4 <= maxBytes) return url;
  }
  return best;
}

export interface CaptureOptions {
  /** Pixels per CSS pixel. Default 2. */
  scale?: number;
  /** Reads the drawn frame back. Default: a PNG data URL. */
  read?: (canvas: HTMLCanvasElement) => string;
  /** Camera layers left out of the picture (helpers). */
  hideLayers?: number[];
  /** Names of objects left out of the picture. */
  hideObjects?: string[];
}

/**
 * Set while a post-processing pipeline draws the view (the occlusion composer): pictures
 * go through it too, resized to the picture's pixel ratio.
 */
export const pipeline: { render: (() => void) | null; setPixelRatio: ((ratio: number) => void) | null } = { render: null, setPixelRatio: null };

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
  const draw = () => (pipeline.render ? pipeline.render() : gl.render(scene, camera));
  try {
    const r = captureRatio(size.x, size.y, opts.scale ?? 2, limit);
    gl.setPixelRatio(r);
    pipeline.setPixelRatio?.(r);
    // The live view is shifted to clear the side panels; the picture has none, so centre it.
    if (view) lens.clearViewOffset();
    for (const l of layers) camera.layers.disable(l);
    for (const o of hidden) o.visible = false;
    draw();
    return opts.read ? opts.read(gl.domElement) : gl.domElement.toDataURL('image/png');
  } finally {
    for (const o of hidden) o.visible = true;
    for (const l of layers) camera.layers.enable(l);
    if (view) lens.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    gl.setPixelRatio(ratio);
    pipeline.setPixelRatio?.(ratio);
    draw();
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

/**
 * A small JPEG of the middle of the current view (`THUMBNAIL_WIDTH` x `THUMBNAIL_HEIGHT`,
 * no helpers) as a data URL: the preview stored with a saved variant.
 */
export function captureThumbnail(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: Pick<CaptureOptions, 'hideLayers' | 'hideObjects'> = {}): string {
  const size = gl.getSize(new THREE.Vector2());
  const crop = thumbnailCrop(size.x, size.y);
  return capturePng(gl, scene, camera, {
    ...opts,
    // Draw just large enough for the cropped part to fill the preview.
    scale: THUMBNAIL_WIDTH / crop.w,
    read: (canvas) => {
      const k = canvas.width / Math.max(size.x, 1);
      const out = document.createElement('canvas');
      out.width = THUMBNAIL_WIDTH;
      out.height = THUMBNAIL_HEIGHT;
      const ctx = out.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(canvas, crop.x * k, crop.y * k, crop.w * k, crop.h * k, 0, 0, out.width, out.height);
      return fitEncoding((quality) => out.toDataURL('image/jpeg', quality));
    },
  });
}

/** Set by the scene while it is mounted. */
export const captureBridge: {
  /** Takes the picture and returns it as a PNG data URL. */
  capture: ((scale?: number) => string) | null;
  /** Takes a variant preview: a small JPEG data URL. */
  thumbnail: (() => string) | null;
  /** Frames drawn since the scene was mounted, and when the last one was (`performance.now()`). */
  frames: number;
  lastFrameAt: number;
} = { capture: null, thumbnail: null, frames: 0, lastFrameAt: 0 };

/** A preview of the view as it is now, or undefined when the scene is not up or the picture cannot be read. */
export function takeThumbnail(): string | undefined {
  try {
    const url = captureBridge.thumbnail?.();
    return url && url.startsWith('data:image/') && url.length > 200 ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves once the scene has drawn and gone quiet (models loaded, no frame for
 * `quietMs`), or after `timeoutMs` if it never settles. False when the scene went away.
 */
export function sceneSettled(opts: { quietMs?: number; timeoutMs?: number; minFrames?: number } = {}): Promise<boolean> {
  const { quietMs = 450, timeoutMs = 8000, minFrames = 2 } = opts;
  const started = performance.now();
  let from = captureBridge.frames;
  return new Promise((resolve) => {
    const check = () => {
      const now = performance.now();
      const up = captureBridge.thumbnail !== null;
      // The frame count starts again when the scene is mounted anew.
      if (captureBridge.frames < from) from = 0;
      const drawn = captureBridge.frames - from;
      const quiet = now - captureBridge.lastFrameAt >= quietMs;
      // Normally: new frames since the call, then silence. A scene with nothing new to draw counts once it has been silent for a while.
      if (up && quiet && (drawn >= minFrames || (captureBridge.frames > 0 && now - started > quietMs * 3))) return resolve(true);
      if (now - started > timeoutMs) return resolve(up && captureBridge.frames > 0);
      setTimeout(check, 120);
    };
    check();
  });
}
