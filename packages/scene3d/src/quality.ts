/**
 * Rendering quality. CPU rasterisers (SwiftShader, llvmpipe: headless browsers,
 * CI, machines without a usable GPU) need a cheaper scene to stay interactive.
 */
export type RenderQuality = 'high' | 'low';

/** True for CPU rasterisers, where shadow passes and many lights cost far more than they give. */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

let probed: boolean | null = null;

/** Probes a throwaway WebGL context once, so the quality is known before the scene's canvas exists. */
export function detectSoftwareRenderer(): boolean {
  if (probed !== null) return probed;
  probed = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      probed = isSoftwareRenderer(gl);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    probed = false;
  }
  return probed;
}
