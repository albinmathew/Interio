/**
 * Path-traced photo mode. The tracer itself (`PhotoTracer`, three-gpu-pathtracer) is loaded
 * on demand with `loadPhotoTracer`, after `pathTracingSupport` has said the GPU can run it,
 * so software renderers never download or start it.
 */
import type * as THREE from 'three';
import { isSoftwareRenderer } from '../quality';

export { NO_UPDATE, needsUpdate, planSceneUpdate, type SceneSignature, type SceneUpdate } from './plan';
export { signScene } from './signature';
export type { PhotoTracer, PhotoTracerOptions, SyncResult } from './PhotoTracer';

export interface PathTracingSupport {
  ok: boolean;
  /** Why not, in words for a tooltip. */
  reason?: string;
}

/** Whether this renderer can path trace: a hardware WebGL2 context that renders to float targets. */
export function pathTracingSupport(gl: THREE.WebGLRenderer): PathTracingSupport {
  try {
    const context = gl.getContext();
    if (typeof WebGL2RenderingContext === 'undefined' || !(context instanceof WebGL2RenderingContext)) {
      return { ok: false, reason: 'Photo mode needs WebGL 2' };
    }
    if (isSoftwareRenderer(context)) return { ok: false, reason: 'Photo mode needs a graphics card' };
    if (!gl.extensions.has('EXT_color_buffer_float')) return { ok: false, reason: 'Photo mode is not supported by this graphics card' };
    if (context.getParameter(context.MAX_TEXTURE_SIZE) < 4096) return { ok: false, reason: 'Photo mode is not supported by this graphics card' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Photo mode is not available here' };
  }
}

/** Loads the tracer module. Rejects when it cannot be loaded. */
export function loadPhotoTracer(): Promise<typeof import('./PhotoTracer')> {
  return import('./PhotoTracer');
}
