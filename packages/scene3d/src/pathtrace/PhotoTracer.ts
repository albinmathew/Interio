/**
 * Photo mode's engine: a progressive path tracer (three-gpu-pathtracer's WebGLPathTracer)
 * fed from the live scene, denoised with guides rasterised from the same scene (see
 * `denoise.ts`), and drawn over the live frame with the live view's tone mapping.
 *
 * Loaded on demand (see `loadPhotoTracer` in index.ts): software renderers and machines
 * that never turn photo mode on never download it.
 *
 * Life cycle: `sync` builds the traced scene (BVH in a worker) and keeps it in step with the
 * live one; for every still view `start`, then each frame `step` (a time budget of tracing)
 * and `draw`. Two passes per view: a preview at half size that becomes presentable within
 * a few seconds, then the full-size pass, which takes over once it is cleaner.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { BvhWorker } from './bvhWorker';
import { Denoiser } from './denoise';
import { NO_UPDATE, TILE_PIXELS, needsUpdate, planSceneUpdate, tileGrid, whiteBalance, type SceneSignature, type SceneUpdate } from './plan';
import { TraceMaterials } from './proxies';
import { signScene } from './signature';

export interface PhotoTracerOptions {
  /** Most pixels traced per sample: larger canvases are traced at a reduced scale and upscaled. Default full HD. */
  maxPixels?: number;
  /** Preview pass: traced at this fraction of the final width and height. Default 0.5. */
  previewScale?: number;
  /** Samples of the preview pass before the full-size pass starts. 0 skips the preview. Default 16. */
  previewSamples?: number;
  /** Samples the full-size pass needs before it replaces the preview on screen. Default 16. */
  takeoverSamples?: number;
  /** Most light bounces. Default 5. */
  bounces?: number;
  /** Pixels per tile (the unit of work per frame). Default `TILE_PIXELS`. */
  tilePixels?: number;
  /**
   * Multipliers on the live scene's lamps (point and spot lights), sun and sky. The live rig is
   * balanced for a rasteriser with fill lights; traced, the sky through the windows does more of
   * the work, as in a photograph. Defaults 0.6, 1 and 2.5; exposure is matched to the live view.
   */
  lampScale?: number;
  sunScale?: number;
  skyScale?: number;
  /**
   * Multiplier on area lights in the window openings. For the rasteriser they stand in for the sky
   * light through the glass; traced, the sky comes through by itself, so they count it twice, but
   * they also act as light portals that make a window-lit room converge far faster. Default 0.5.
   */
  windowScale?: number;
}

/** What `sync` found. `stale`: the traced picture no longer matches the scene and must not be shown. */
export interface SyncResult {
  update: SceneUpdate;
  stale: boolean;
}

interface TracerInternals {
  _pathTracer: { material: THREE.ShaderMaterial & { uniforms: Record<string, { value: unknown }> }; dispose(): void; _sobolTarget?: THREE.WebGLRenderTarget };
  _lowResPathTracer: { dispose(): void; _sobolTarget?: THREE.WebGLRenderTarget };
  _quad: FullScreenQuad;
  _generator: { geometry: THREE.BufferGeometry; bvh: unknown; staticGeometryGenerator: { objects: THREE.Object3D[]; _intermediateGeometry: Map<string, { dispose(): void }> } };
  _materials: THREE.Material[] | null;
  _previousScene: THREE.Scene | null;
  _colorBackground?: THREE.Texture;
  _internalBackground?: THREE.Texture | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  isCompiling: boolean;
  updateLights(): void;
  updateEnvironment(): void;
}

export class PhotoTracer {
  private readonly gl: THREE.WebGLRenderer;
  private readonly tracer: WebGLPathTracer;
  private readonly internals: TracerInternals;
  private readonly worker: BvhWorker;
  private readonly materials = new TraceMaterials();
  private readonly denoiser: Denoiser;
  private readonly fallbackEnvironment = new GradientEquirectTexture(64);
  private options: Required<PhotoTracerOptions>;
  /** Exposure on screen, the one it eases towards, and a fixed one set by `configure` (null: automatic). */
  private exposure = 1;
  private exposureTarget = 1;
  private fixedExposure: number | null = null;
  private exposureTime = 0;
  /** Brightness of the live frame (mean log luminance) and the samples at which the picture was last metered. */
  private liveLog = 0;
  private meteredAt = -1;
  /** White balance gains on screen and the ones they ease towards. */
  private readonly balance = new THREE.Vector3(1, 1, 1);
  private readonly balanceTarget = new THREE.Vector3(1, 1, 1);

  private scene: THREE.Scene | null = null;
  private built: SceneSignature | null = null;
  private building: Promise<void> | null = null;
  private dirty = false;
  private disposed = false;

  /** Full trace size of the current view. */
  private readonly size = new THREE.Vector2(1, 1);
  private pass: 'preview' | 'final' = 'final';
  /** The preview's filtered light, kept on screen while the full-size pass catches up. */
  private frozen: THREE.WebGLRenderTarget | null = null;
  private frozenSamples = 0;
  private filteredAt = -1;
  private filteredTime = 0;
  private grid = 1;

  /** Last build failure, if any. */
  error: Error | null = null;

  constructor(gl: THREE.WebGLRenderer, options: PhotoTracerOptions = {}) {
    this.gl = gl;
    this.options = { maxPixels: 1920 * 1080, previewScale: 0.5, previewSamples: 16, takeoverSamples: 16, bounces: 5, tilePixels: TILE_PIXELS, lampScale: 0.6, sunScale: 1, skyScale: 2.5, windowScale: 0.5, ...options };
    // The WebGL tracer logs a deprecation notice in favour of its WebGPU sibling; R3F renders with WebGL.
    const warn = console.warn;
    console.warn = () => {};
    try {
      this.tracer = new WebGLPathTracer(gl);
    } finally {
      console.warn = warn;
    }
    this.internals = this.tracer as unknown as TracerInternals;
    const t = this.tracer;
    t.renderToCanvas = false;
    t.renderDelay = 0;
    t.minSamples = 1;
    t.fadeDuration = 0;
    t.dynamicLowRes = false;
    t.rasterizeScene = false;
    t.synchronizeRenderSize = true;
    t.bounces = this.options.bounces;
    // Each glass pane is two surfaces; a door of two panes seen through a glass balustrade is six.
    t.transmissiveBounces = 10;
    // Rough-after-glossy paths are the main source of fireflies indoors.
    t.filterGlossyFactor = 0.5;
    t.multipleImportanceSampling = true;
    t.textureSize.set(1024, 1024);
    this.worker = new BvhWorker();
    t.setBVHWorker(this.worker);
    // The tracer still passes three-mesh-bvh's deprecated `maxLeafTris`; the current name avoids the warning.
    (this.internals._generator as unknown as { bvhOptions: object }).bvhOptions = { maxLeafTris: 0, targetLeafSize: 1 };
    this.denoiser = new Denoiser(gl);

    this.fallbackEnvironment.topColor.set('#dfe9f1');
    this.fallbackEnvironment.bottomColor.set('#b9ab98');
    this.fallbackEnvironment.update();

    // Lights and environment are always read through these: see `hiddenLights` and `withSafeEnvironment`.
    const internals = this.internals;
    const baseLights = internals.updateLights.bind(t);
    const baseEnvironment = internals.updateEnvironment.bind(t);
    internals.updateLights = () => this.withViewLights(baseLights);
    internals.updateEnvironment = () => this.withSafeEnvironment(baseEnvironment);
  }

  /** Changes options (dev tuning); sizes and passes apply from the next `start`. */
  configure(patch: PhotoTracerOptions & { exposure?: number }): void {
    const { exposure, ...rest } = patch;
    this.options = { ...this.options, ...rest };
    this.tracer.bounces = this.options.bounces;
    if (rest.lampScale !== undefined || rest.sunScale !== undefined || rest.windowScale !== undefined) this.tracer.updateLights();
    if (rest.skyScale !== undefined) this.tracer.updateEnvironment();
    if (exposure !== undefined) this.fixedExposure = exposure;
  }

  /* ---------------------------------------------------------------- state */

  /** The traced scene exists and nothing is being rebuilt. */
  get ready(): boolean {
    return this.built !== null && this.building === null && !this.disposed;
  }

  /** The tracer's shader is still compiling (the first time can take a few seconds). */
  get compiling(): boolean {
    return this.internals.isCompiling;
  }

  /** Samples per pixel of the picture on screen. */
  get samples(): number {
    if (this.pass === 'preview') return Math.floor(this.tracer.samples);
    if (this.frozen) return this.frozenSamples;
    return Math.floor(this.tracer.samples);
  }

  /** Samples of the pass running now. */
  get passSamples(): number {
    return this.tracer.samples;
  }

  get previewing(): boolean {
    return this.pass === 'preview' || this.frozen !== null;
  }

  /** Something worth showing has been traced since `start`. */
  get hasImage(): boolean {
    return this.denoiser.ready;
  }

  /** Tiles in one sample of the running pass. */
  get tilesPerSample(): number {
    return this.grid * this.grid;
  }

  /* ---------------------------------------------------------------- scene */

  /**
   * Compares the live scene with what was traced and applies the difference: material,
   * light and environment changes at once, geometry by a rebuild in the background.
   */
  sync(scene: THREE.Scene): SyncResult {
    // A build in flight is compared with the live scene again when it lands.
    if (this.disposed || this.building) return { update: NO_UPDATE, stale: true };
    if (this.scene !== scene || !this.built) {
      void this.build(scene);
      return { update: planSceneUpdate(null, signScene(scene)), stale: true };
    }
    const now = signScene(scene);
    const update = planSceneUpdate(this.built, now);
    if (!needsUpdate(update)) return { update, stale: false };
    if (update.rebuild) {
      void this.build(scene);
      return { update, stale: true };
    }
    if (update.materials) {
      this.materials.refresh();
      this.tracer.updateMaterials();
    }
    if (update.lights) this.tracer.updateLights();
    if (update.environment) this.tracer.updateEnvironment();
    this.built = now;
    return { update, stale: true };
  }

  /** Builds (or rebuilds) the traced scene. One build at a time; changes during it trigger one more. */
  private build(scene: THREE.Scene): Promise<void> {
    this.scene = scene;
    if (this.building) {
      this.dirty = true;
      return this.building;
    }
    const run = async () => {
      do {
        this.dirty = false;
        const signature = signScene(scene);
        const camera = this.internals.camera ?? new THREE.PerspectiveCamera();
        this.materials.swapIn(scene);
        let pending: Promise<unknown>;
        try {
          pending = this.tracer.setSceneAsync(scene, camera) as Promise<unknown>;
        } finally {
          this.materials.swapOut();
        }
        await pending;
        if (this.disposed) return;
        this.built = signature;
      } while (this.dirty && !this.disposed);
      this.materials.prune(this.materials.lastUsed);
      this.warmUp();
    };
    this.building = run()
      .catch((e: unknown) => {
        this.error = e instanceof Error ? e : new Error(String(e));
        this.built = null;
      })
      .finally(() => {
        this.building = null;
      });
    return this.building;
  }

  /** Starts compiling the tracer's shader (asynchronously, with a tiny target) before anyone waits for it. */
  private warmUp(): void {
    if (this.disposed) return;
    this.tracer.renderScale = 16 / Math.max(16, this.gl.getDrawingBufferSize(new THREE.Vector2()).x);
    this.tracer.tiles.set(1, 1);
    this.tracer.renderSample();
  }

  /* ----------------------------------------------------------------- view */

  /** Starts a fresh picture for `camera` at the canvas's CSS size. */
  start(camera: THREE.Camera, cssWidth: number, cssHeight: number): void {
    const t = this.tracer;
    this.internals.camera = camera;
    // Lights are picked for the view: the ones that can light what the camera sees.
    t.updateLights();
    t.setCamera(camera);
    let w = Math.max(1, Math.round(cssWidth));
    let h = Math.max(1, Math.round(cssHeight));
    const k = Math.min(1, Math.sqrt(this.options.maxPixels / (w * h)));
    w = Math.max(1, Math.floor(w * k));
    h = Math.max(1, Math.floor(h * k));
    this.size.set(w, h);
    this.frozen?.dispose();
    this.frozen = null;
    this.frozenSamples = 0;
    this.filteredAt = -1;
    this.pass = this.options.previewSamples > 0 && this.options.previewScale < 1 ? 'preview' : 'final';
    if (this.scene) {
      this.denoiser.prepare(this.scene, camera, w, h, this.materials.guideHidden(this.scene));
      this.liveLog = this.denoiser.meterLive(this.scene, camera);
    }
    this.meteredAt = -1;
    this.applyScale();
    t.reset();
  }

  /** Traces `tiles` tiles (see `tilesPerSample`), then refreshes the filtered picture. */
  step(tiles: number): void {
    const t = this.tracer;
    if (this.internals.isCompiling) {
      t.renderSample();
      return;
    }
    for (let i = 0; i < tiles; i++) t.renderSample();

    if (this.pass === 'preview' && t.samples >= this.options.previewSamples) {
      this.refilter(true);
      this.frozen = this.denoiser.freeze();
      this.frozenSamples = Math.floor(t.samples);
      this.filteredAt = -1;
      this.pass = 'final';
      this.applyScale();
      t.reset();
      return;
    }
    if (this.frozen && t.samples >= this.options.takeoverSamples) {
      this.frozen.dispose();
      this.frozen = null;
    }
    this.refilter(false);
  }

  /** Re-runs the filter when the running pass has new samples (whole ones, or a few tiles' worth a moment later). */
  private refilter(force: boolean): void {
    const t = this.tracer;
    if (t.samples < 1) return;
    const now = performance.now();
    const whole = Math.floor(t.samples);
    const changed = t.samples !== this.filteredAt && (whole !== Math.floor(this.filteredAt) || now - this.filteredTime > 300);
    if (!force && !changed) return;
    // The final pass works out of sight while the preview is frozen on screen.
    if (!force && this.frozen) return;
    this.denoiser.filter(t.target.texture, t.samples);
    this.filteredAt = t.samples;
    this.filteredTime = now;
    this.autoExpose(t.samples);
  }

  /**
   * Matches the picture's overall brightness to the live frame's, so the fade from one to the
   * other is seamless and the exposure suits whatever lights the room: metered on the first
   * filtered image and again, more reliably, after a few samples (eased in, see `draw`).
   */
  private autoExpose(samples: number): void {
    if (this.fixedExposure !== null) {
      this.exposure = this.exposureTarget = this.fixedExposure;
      this.balance.set(1, 1, 1);
      this.balanceTarget.set(1, 1, 1);
      return;
    }
    const first = this.meteredAt < 0;
    if (!first && (this.meteredAt >= 8 || samples < 8)) return;
    const traced = this.denoiser.meterResult();
    if (traced === null) return;
    this.meteredAt = samples;
    this.exposureTarget = Math.min(4, Math.max(0.35, EXPOSURE_KEY * Math.exp(this.liveLog - traced.logLuminance)));
    this.balanceTarget.set(...whiteBalance(traced.illuminant, WHITE_BALANCE));
    if (first) {
      this.exposure = this.exposureTarget;
      this.balance.copy(this.balanceTarget);
    }
  }

  /**
   * Draws the picture over the canvas at `opacity`. With `live`, the live frame is drawn
   * first (for the fade); leave it out when something else has already drawn it.
   */
  draw(opacity: number, live: { scene: THREE.Scene; camera: THREE.Camera } | null): void {
    if (live && opacity < 1) this.gl.render(live.scene, live.camera);
    if (opacity <= 0) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.exposureTime) / 1000);
    this.exposureTime = now;
    const k = 1 - Math.exp(-dt / 0.35);
    this.exposure += (this.exposureTarget - this.exposure) * k;
    this.balance.lerp(this.balanceTarget, k);
    this.denoiser.draw(opacity, this.exposure, this.frozen, this.balance);
  }

  /** PNG of the picture at its current sample count, or null when there is none yet. */
  capture(): string | null {
    if (!this.hasImage) return null;
    this.draw(1, null);
    return this.gl.domElement.toDataURL('image/png');
  }

  /* ------------------------------------------------------------- internals */

  private applyScale(): void {
    const buffer = this.gl.getDrawingBufferSize(new THREE.Vector2());
    const scale = this.pass === 'preview' ? this.options.previewScale : 1;
    // WebGLPathTracer sizes its target as renderScale x the drawing buffer.
    this.tracer.renderScale = Math.min(1, (this.size.x * scale) / Math.max(1, buffer.x));
    const w = Math.floor(this.tracer.renderScale * buffer.x);
    const h = Math.floor(this.tracer.renderScale * buffer.y);
    this.grid = tileGrid(w * h, this.options.tilePixels);
    this.tracer.tiles.set(this.grid, this.grid);
  }

  /** Runs `fn` with only the lights that matter for this view visible. */
  private withViewLights(fn: () => void): void {
    const scene = this.internals.scene;
    const camera = this.internals.camera;
    const hidden = scene && camera ? hiddenLights(scene, camera) : [];
    for (const l of hidden) l.visible = false;
    const scaled: [THREE.Light, number][] = [];
    const { lampScale, sunScale, windowScale } = this.options;
    scene?.traverseVisible((o) => {
      const l = o as THREE.Light & { isPointLight?: boolean; isSpotLight?: boolean; isDirectionalLight?: boolean };
      if (!l.isLight) return;
      const area = (l as THREE.Light & { isRectAreaLight?: boolean }).isRectAreaLight === true;
      const k = l.isPointLight || l.isSpotLight ? lampScale : l.isDirectionalLight ? sunScale : area ? windowScale : 1;
      if (k === 1) return;
      scaled.push([l, l.intensity]);
      l.intensity *= k;
    });
    try {
      fn();
    } finally {
      for (const l of hidden) l.visible = true;
      for (const [l, intensity] of scaled) l.intensity = intensity;
    }
  }

  /** Runs `fn` with an environment the tracer can sample (an equirect with pixel data on the CPU). */
  private withSafeEnvironment(fn: () => void): void {
    const scene = this.internals.scene;
    if (!scene) return fn();
    const env = scene.environment;
    const intensity = scene.environmentIntensity;
    const usable = !env || (env as THREE.CubeTexture).isCubeTexture === true || hasPixels(env);
    if (!usable) scene.environment = this.fallbackEnvironment;
    scene.environmentIntensity = intensity * this.options.skyScale;
    try {
      fn();
    } finally {
      scene.environment = env;
      scene.environmentIntensity = intensity;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.internals;
    for (const renderer of [t._pathTracer, t._lowResPathTracer]) {
      try {
        renderer.dispose();
        renderer._sobolTarget?.dispose();
      } catch {
        // Already gone.
      }
    }
    // Free the GPU side, then drop the CPU copies too (BVH, attributes, materials, environment
    // distribution: hundreds of megabytes in a furnished home), so nothing that still holds a
    // reference to this tracer keeps them alive.
    disposeUniforms(t._pathTracer.material);
    t._pathTracer.material.dispose();
    t._quad.dispose();
    (t._quad as unknown as { material: THREE.Material }).material.dispose();
    t._colorBackground?.dispose();
    t._internalBackground?.dispose();
    const generator = t._generator;
    generator.geometry.dispose();
    for (const g of generator.staticGeometryGenerator._intermediateGeometry.values()) g.dispose();
    generator.staticGeometryGenerator._intermediateGeometry.clear();
    generator.bvh = null;
    generator.geometry = new THREE.BufferGeometry();
    generator.staticGeometryGenerator.objects = [];
    t._materials = null;
    t.scene = null;
    t.camera = null;
    t._previousScene = null;
    this.worker.dispose();
    this.materials.dispose();
    this.denoiser.dispose();
    this.frozen?.dispose();
    this.frozen = null;
    this.fallbackEnvironment.dispose();
    this.scene = null;
    this.built = null;
  }
}

/**
 * The traced picture's brightness relative to the live view's. A little under 1: traced light
 * reaches further into corners, so the same average leaves whites near clipping.
 */
const EXPOSURE_KEY = 0.85;

/** How far the colour of the light is pulled towards neutral: some warmth (an evening, lamplight) stays. */
const WHITE_BALANCE = 0.35;

function hasPixels(texture: THREE.Texture): boolean {
  const image = texture.image as { data?: ArrayLike<number>; width?: number } | undefined;
  return !!image && !!image.data && (image.width ?? 0) > 0 && !(texture as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture;
}

function disposeUniforms(material: THREE.ShaderMaterial): void {
  for (const uniform of Object.values(material.uniforms)) {
    const value = uniform.value as { dispose?: () => void } | null;
    if (value && typeof value.dispose === 'function') {
      try {
        value.dispose();
      } catch {
        // Some uniform helpers have nothing to free.
      }
    }
    uniform.value = null;
  }
}

const _eye = new THREE.Vector3();
const _light = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _target = new THREE.Vector3();

/** Most point and spot lights traced for one view. Each extra light dilutes the samples of the others. */
const MAX_VIEW_LIGHTS = 6;

/**
 * Lights the tracer should leave out for this view: dark slots, fills that only make sense
 * for a rasteriser (a light shining up through the floor), and lamps too far away to light
 * what the camera sees. The tracer picks one light at random per sample, so every light
 * that cannot reach the view only adds noise.
 */
export function hiddenLights(scene: THREE.Scene, camera: THREE.Camera): THREE.Light[] {
  const hidden: THREE.Light[] = [];
  const scored: { light: THREE.Light; score: number }[] = [];
  camera.getWorldPosition(_eye);
  camera.getWorldDirection(_ahead).multiplyScalar(2.5).add(_eye);
  scene.traverseVisible((o) => {
    const light = o as THREE.Light & Partial<THREE.PointLight & THREE.DirectionalLight & THREE.SpotLight>;
    if (!light.isLight) return;
    if (!(light.intensity > 0)) {
      hidden.push(light);
      return;
    }
    if (light.isDirectionalLight) {
      light.getWorldPosition(_light);
      // A directional light below its target shines up through the floor: a rasteriser's stand-in for bounce light.
      if (light.target && _light.y <= light.target.getWorldPosition(_target).y) hidden.push(light);
      return;
    }
    if (light.isPointLight || light.isSpotLight) {
      light.getWorldPosition(_light);
      const reach = (p: THREE.Vector3) => {
        const d = Math.max(0.3, p.distanceTo(_light));
        const cutoff = light.distance ?? 0;
        const window = cutoff > 0 ? Math.max(0, 1 - (d / cutoff) ** 4) ** 2 : 1;
        return (light.intensity * window) / d ** (light.decay ?? 2);
      };
      scored.push({ light, score: Math.max(reach(_eye), reach(_ahead)) });
    }
  });
  scored.sort((x, y) => y.score - x.score);
  const best = scored[0]?.score ?? 0;
  scored.forEach((s, i) => {
    if (i >= MAX_VIEW_LIGHTS || s.score < best * 0.06) hidden.push(s.light);
  });
  return hidden;
}
