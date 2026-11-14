/**
 * Turns a few noisy path-traced samples into a clean picture.
 *
 * The live scene is rasterised once per view into a small G-buffer: surface colour
 * (albedo) and normal + depth. The traced image is divided by the albedo, which leaves
 * the light alone (smooth, where the noise lives); the light is smoothed with an edge-aware
 * à-trous wavelet filter that stops at geometric edges (normals, depth) and at real
 * changes in brightness; then it is multiplied by the full-resolution albedo again, so
 * textures (wood grain, fabric weave, tiles) stay crisp even when the light is traced at
 * half size. The filter weakens as samples add up and the noise goes away by itself.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const LUMA = 'vec3(0.2126, 0.7152, 0.0722)';
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Depth written where nothing was hit (sky, the outside view). */
const FAR = 1e4;

/** Writes world normal (facing the camera) and view depth. */
class NormalDepthMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying float vDepth;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 view = viewMatrix * world;
          vDepth = -view.z;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying float vDepth;
        void main() {
          vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
          gl_FragColor = vec4(n, vDepth);
        }`,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }
}

/** Divides the traced image by the albedo and tames fireflies. */
class DemodulateMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: { noisy: { value: null }, albedo: { value: null }, normalDepth: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D noisy;
        uniform sampler2D albedo;
        uniform sampler2D normalDepth;
        varying vec2 vUv;
        float lum(vec3 c) { return dot(c, ${LUMA}); }
        void main() {
          ivec2 size = textureSize(noisy, 0);
          ivec2 px = clamp(ivec2(vUv * vec2(size)), ivec2(0), size - 1);
          vec3 c = max(texelFetch(noisy, px, 0).rgb, 0.0);
          // A pixel far brighter than its neighbourhood is a firefly: bring it down towards it.
          float sum = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            sum += lum(max(texelFetch(noisy, clamp(px + ivec2(x, y), ivec2(0), size - 1), 0).rgb, 0.0));
          }
          float l = lum(c);
          // The view outside is a picture, not noise: only a stray sparkle (a reflection in the glass) is clamped there.
          bool sky = texture2D(normalDepth, vUv).w >= ${FAR.toFixed(1)} * 0.5;
          float cap = (sky ? 2.5 : 4.0) * sum / 8.0 + 0.05;
          if (l > cap) c *= cap / l;
          vec3 a = texture2D(albedo, vUv).rgb;
          gl_FragColor = vec4(c / max(a, vec3(0.04)), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }
}

/** One à-trous iteration: a 5x5 B3-spline kernel spread `step` pixels apart, with edge-stopping weights. */
class AtrousMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: { light: { value: null }, normalDepth: { value: null }, albedo: { value: null }, step: { value: 1 }, sigmaL: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D light;
        uniform sampler2D normalDepth;
        uniform sampler2D albedo;
        uniform float step;
        uniform float sigmaL;
        varying vec2 vUv;
        float squash(vec3 c) { float l = dot(c, ${LUMA}); return l / (1.0 + l); }
        void main() {
          vec2 texel = 1.0 / vec2(textureSize(light, 0));
          vec4 centre = texture2D(light, vUv);
          vec4 g = texture2D(normalDepth, vUv);
          // Nothing hit: the view outside, seen directly or through glass.
          bool sky = g.w >= ${FAR.toFixed(1)} * 0.5;
          // Mirrors (albedo alpha 0) show a reflected picture, not light: blur them only a little, and only with each other.
          bool mirror = texture2D(albedo, vUv).a < 0.5;
          if (mirror && step > 2.5) { gl_FragColor = centre; return; }
          // The outside view (seen directly or through clear glass) is already sharp and nearly noiseless.
          if (sky) { gl_FragColor = centre; return; }
          // Brightness of the neighbourhood rather than of the pixel alone, so a stray bright or dark
          // sample cannot shield itself from its neighbours.
          float lc = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) lc += squash(texture2D(light, vUv + vec2(float(x), float(y)) * texel).rgb);
          lc /= 9.0;
          float k[3] = float[3](0.375, 0.25, 0.0625);
          vec3 sum = vec3(0.0);
          float weights = 0.0;
          for (int y = -2; y <= 2; y++) {
            for (int x = -2; x <= 2; x++) {
              vec2 uv = vUv + vec2(float(x), float(y)) * step * texel;
              vec3 s = texture2D(light, uv).rgb;
              vec4 gs = texture2D(normalDepth, uv);
              bool skyS = gs.w >= ${FAR.toFixed(1)} * 0.5;
              float wn = sky || skyS ? (sky == skyS ? 1.0 : 0.0) : pow(max(0.0, dot(g.xyz, gs.xyz)), 32.0);
              if ((texture2D(albedo, uv).a < 0.5) != mirror) wn = 0.0;
              float wz = sky ? 1.0 : exp(-abs(g.w - gs.w) / (0.015 * g.w * step + 0.002));
              float wl = exp(-abs(lc - squash(s)) / sigmaL);
              float w = k[abs(x)] * k[abs(y)] * wn * wz * wl;
              sum += s * w;
              weights += w;
            }
          }
          gl_FragColor = vec4(sum / max(weights, 1e-6), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }
}

/** Light x albedo, exposure, the renderer's tone mapping and output colour space; fades over the live frame. */
class OutputMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: { light: { value: null }, albedo: { value: null }, normalDepth: { value: null }, opacity: { value: 1 }, exposure: { value: 1 }, balance: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D light;
        uniform sampler2D albedo;
        uniform sampler2D normalDepth;
        uniform float opacity;
        uniform float exposure;
        uniform vec3 balance;
        varying vec2 vUv;
        // Joint bilateral upsampling: the four nearest light texels, weighted by how well their
        // surface matches this pixel's, so a half-size light never bleeds across an edge.
        vec3 upsample(vec4 g, bool sky) {
          vec2 size = vec2(textureSize(light, 0));
          vec2 p = vUv * size - 0.5;
          vec2 f = fract(p);
          vec2 base = floor(p);
          vec3 sum = vec3(0.0);
          float weights = 0.0;
          for (int y = 0; y <= 1; y++) {
            for (int x = 0; x <= 1; x++) {
              vec2 uv = (base + vec2(float(x), float(y)) + 0.5) / size;
              vec4 gs = texture2D(normalDepth, uv);
              bool skyS = gs.w >= ${FAR.toFixed(1)} * 0.5;
              float bilinear = (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y);
              float match = sky || skyS ? (sky == skyS ? 1.0 : 0.0)
                : pow(max(0.0, dot(g.xyz, gs.xyz)), 16.0) * exp(-abs(g.w - gs.w) / (0.02 * g.w + 0.002));
              float w = bilinear * (match + 1e-4);
              sum += texture2D(light, uv).rgb * w;
              weights += w;
            }
          }
          return sum / weights;
        }
        void main() {
          vec3 a = texture2D(albedo, vUv).rgb;
          vec4 g = texture2D(normalDepth, vUv);
          bool sky = g.w >= ${FAR.toFixed(1)} * 0.5;
          // The view outside keeps the live view's exposure (as a photographer "pulls" a window), so a
          // dim room brightened for the photo does not turn its windows into white rectangles.
          vec3 c = upsample(g, sky) * max(a, vec3(0.04)) * (sky ? vec3(min(exposure, 1.0)) : exposure * balance);
          gl_FragColor = vec4(c, opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }
}

/**
 * For metering: log luminance of light x albedo (or of `light` alone) in red, and the log of
 * the light's own colour (the illuminant, albedo divided out) in green, blue and alpha, or a
 * sentinel where the view looks outside.
 */
class MeterMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: { light: { value: null }, albedo: { value: null }, normalDepth: { value: null }, useAlbedo: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D light;
        uniform sampler2D albedo;
        uniform sampler2D normalDepth;
        uniform float useAlbedo;
        varying vec2 vUv;
        void main() {
          vec3 l = max(texture2D(light, vUv).rgb, vec3(1e-3));
          vec3 c = useAlbedo > 0.5 ? l * max(texture2D(albedo, vUv).rgb, vec3(0.04)) : l;
          bool sky = useAlbedo > 0.5 && texture2D(normalDepth, vUv).w >= ${FAR.toFixed(1)} * 0.5;
          gl_FragColor = vec4(log(max(dot(c, ${LUMA}), 1e-3)), sky ? vec3(-1000.0) : log(l));
        }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }
}

/** A picture's overall brightness (mean log luminance) and the colour of the light in it (geometric mean, linear). */
export interface Metering {
  logLuminance: number;
  illuminant: [number, number, number] | null;
}

/** Iterations and brightness tolerance of the filter for a sample count: strong at first, light once converged. */
export function filterStrength(samples: number): { iterations: number; sigmaL: number } {
  const spp = Math.max(1, samples);
  const iterations = spp < 24 ? 5 : spp < 96 ? 4 : spp < 384 ? 3 : 2;
  const sigmaL = Math.min(1.5, Math.max(0.04, 1.4 / Math.sqrt(spp)));
  return { iterations, sigmaL };
}

const METER_W = 64;
const METER_H = 36;

const halfFloat = (w: number, h: number, samples = 0) =>
  new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples });

/**
 * The guide buffers and the filter. `prepare` once per view (rasterises the G-buffer at the
 * final trace size), `filter` whenever the traced image has new samples, `draw` every frame.
 */
export class Denoiser {
  private readonly albedo = halfFloat(1, 1, 4);
  private readonly normalDepth = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly ping = halfFloat(1, 1);
  private readonly pong = halfFloat(1, 1);
  private readonly normalDepthMaterial = new NormalDepthMaterial();
  private readonly albedoMaterials = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly demodulate = new FullScreenQuad(new DemodulateMaterial());
  private readonly atrous = new FullScreenQuad(new AtrousMaterial());
  private readonly output = new FullScreenQuad(new OutputMaterial());
  private readonly meterQuad = new FullScreenQuad(new MeterMaterial());
  private readonly copier = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(map, vUv); }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    }),
  );
  private readonly meterTarget = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.FloatType, depthBuffer: false });
  private readonly liveTarget = halfFloat(METER_W * 2, METER_H * 2);
  private readonly meterPixels = new Float32Array(METER_W * METER_H * 4);
  private result: THREE.WebGLRenderTarget | null = null;

  constructor(private readonly gl: THREE.WebGLRenderer) {}

  /**
   * Rasterises albedo and normal + depth of the view. `hide` lists meshes the guides leave
   * out (glass, so what is behind a window guides the filter there; things the tracer skips).
   */
  prepare(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, hide: THREE.Object3D[]): void {
    const gl = this.gl;
    this.albedo.setSize(width, height);
    this.normalDepth.setSize(width, height);
    this.result = null;
    const background = scene.background;
    const override = scene.overrideMaterial;
    const previousTarget = gl.getRenderTarget();
    const clear = gl.getClearColor(new THREE.Color());
    const clearAlpha = gl.getClearAlpha();
    const autoClear = gl.autoClear;
    const shadows = gl.shadowMap.enabled;
    const visible = hide.map((o) => o.visible);
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    try {
      hide.forEach((o) => (o.visible = false));
      scene.background = null;
      gl.autoClear = true;
      gl.shadowMap.enabled = false;

      scene.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        swapped.push([mesh, mesh.material]);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.albedoOf(m)) : this.albedoOf(mesh.material);
      });
      // Nothing hit: albedo 1, so the light there is the traced colour itself.
      gl.setClearColor(0xffffff, 1);
      gl.setRenderTarget(this.albedo);
      gl.render(scene, camera);
      for (const [mesh, m] of swapped) mesh.material = m;
      swapped.length = 0;

      scene.overrideMaterial = this.normalDepthMaterial;
      gl.setClearColor(new THREE.Color(0, 0, 0), FAR);
      gl.setRenderTarget(this.normalDepth);
      gl.render(scene, camera);
    } finally {
      for (const [mesh, m] of swapped) mesh.material = m;
      scene.overrideMaterial = override;
      scene.background = background;
      hide.forEach((o, i) => (o.visible = visible[i]!));
      gl.setClearColor(clear, clearAlpha);
      gl.autoClear = autoClear;
      gl.shadowMap.enabled = shadows;
      gl.setRenderTarget(previousTarget);
    }
  }

  private albedoOf(m: THREE.Material): THREE.MeshBasicMaterial {
    let a = this.albedoMaterials.get(m);
    const src = m as THREE.MeshStandardMaterial & { isMeshBasicMaterial?: boolean };
    if (!a) {
      a = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
      this.albedoMaterials.set(m, a);
    }
    a.color.copy(src.color ?? WHITE);
    a.map = src.map ?? null;
    a.vertexColors = src.vertexColors === true;
    a.alphaTest = src.alphaTest ?? 0;
    a.alphaMap = src.alphaMap ?? null;
    // A mirror's "albedo" is the picture it reflects: white, flagged with alpha 0 for the filter.
    const mirror = src.name === 'glass.mirror' || ((src.metalness ?? 0) > 0.9 && (src.roughness ?? 1) < 0.08);
    if (mirror) a.color.copy(WHITE);
    a.opacity = mirror ? 0 : 1;
    a.transparent = mirror;
    a.blending = THREE.NoBlending;
    return a;
  }

  /** Filters the traced image `noisy` (any size) for `samples` samples per pixel. */
  filter(noisy: THREE.Texture, samples: number): void {
    const gl = this.gl;
    const { width, height } = noisy.image as { width: number; height: number };
    for (const t of [this.ping, this.pong]) if (t.width !== width || t.height !== height) t.setSize(width, height);
    const previous = gl.getRenderTarget();
    const demod = this.demodulate.material as DemodulateMaterial;
    demod.uniforms.noisy!.value = noisy;
    demod.uniforms.albedo!.value = this.albedo.texture;
    demod.uniforms.normalDepth!.value = this.normalDepth.texture;
    gl.setRenderTarget(this.ping);
    this.demodulate.render(gl);

    const { iterations, sigmaL } = filterStrength(samples);
    const pass = this.atrous.material as AtrousMaterial;
    pass.uniforms.normalDepth!.value = this.normalDepth.texture;
    pass.uniforms.albedo!.value = this.albedo.texture;
    pass.uniforms.sigmaL!.value = sigmaL;
    let read = this.ping;
    let write = this.pong;
    for (let i = 0; i < iterations; i++) {
      pass.uniforms.light!.value = read.texture;
      pass.uniforms.step!.value = 2 ** i;
      gl.setRenderTarget(write);
      this.atrous.render(gl);
      [read, write] = [write, read];
    }
    this.result = read;
    gl.setRenderTarget(previous);
  }

  get ready(): boolean {
    return this.result !== null;
  }

  /** Keeps the current result and filters the next image elsewhere: lets a preview stay on screen. */
  freeze(): THREE.WebGLRenderTarget | null {
    const kept = this.result;
    if (!kept) return null;
    const copy = halfFloat(kept.width, kept.height);
    (this.copier.material as THREE.ShaderMaterial).uniforms.map!.value = kept.texture;
    const gl = this.gl;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(copy);
    this.copier.render(gl);
    gl.setRenderTarget(previous);
    return copy;
  }

  /** Draws the filtered image (or `image`, a frozen one) to the canvas. `balance`: white balance gains for the room. */
  draw(opacity: number, exposure: number, image?: THREE.WebGLRenderTarget | null, balance?: THREE.Vector3): void {
    const light = image ?? this.result;
    if (!light) return;
    const gl = this.gl;
    const out = this.output.material as OutputMaterial;
    out.uniforms.light!.value = light.texture;
    out.uniforms.albedo!.value = this.albedo.texture;
    out.uniforms.normalDepth!.value = this.normalDepth.texture;
    out.uniforms.opacity!.value = opacity;
    out.uniforms.exposure!.value = exposure;
    (out.uniforms.balance!.value as THREE.Vector3).copy(balance ?? ONE3);
    out.blending = opacity < 1 ? THREE.NormalBlending : THREE.NoBlending;
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    this.output.render(gl);
    gl.autoClear = autoClear;
  }

  /** The filtered light, for metering. */
  /** Brightness and light colour of the filtered picture, or null before there is one. */
  meterResult(): Metering | null {
    return this.result ? this.meter(this.result.texture, true) : null;
  }

  /** Brightness of the live frame (the raster view, before tone mapping). */
  meterLive(scene: THREE.Scene, camera: THREE.Camera): number {
    const gl = this.gl;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(this.liveTarget);
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    return this.meter(this.liveTarget.texture, false).logLuminance;
  }

  private meter(texture: THREE.Texture, useAlbedo: boolean): Metering {
    const gl = this.gl;
    const m = this.meterQuad.material as MeterMaterial;
    m.uniforms.light!.value = texture;
    m.uniforms.albedo!.value = this.albedo.texture;
    m.uniforms.normalDepth!.value = this.normalDepth.texture;
    m.uniforms.useAlbedo!.value = useAlbedo ? 1 : 0;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(this.meterTarget);
    this.meterQuad.render(gl);
    gl.readRenderTargetPixels(this.meterTarget, 0, 0, METER_W, METER_H, this.meterPixels);
    gl.setRenderTarget(previous);
    let lum = 0;
    let n = 0;
    const rgb = [0, 0, 0];
    let lit = 0;
    const px = this.meterPixels;
    for (let i = 0; i < px.length; i += 4) {
      if (Number.isFinite(px[i]!)) {
        lum += px[i]!;
        n++;
      }
      if (px[i + 1]! > -999 && Number.isFinite(px[i + 1]!) && Number.isFinite(px[i + 2]!) && Number.isFinite(px[i + 3]!)) {
        rgb[0]! += px[i + 1]!;
        rgb[1]! += px[i + 2]!;
        rgb[2]! += px[i + 3]!;
        lit++;
      }
    }
    return {
      logLuminance: n ? lum / n : 0,
      illuminant: lit > 16 ? [Math.exp(rgb[0]! / lit), Math.exp(rgb[1]! / lit), Math.exp(rgb[2]! / lit)] : null,
    };
  }

  get light(): THREE.Texture | null {
    return this.result?.texture ?? null;
  }

  get albedoTexture(): THREE.Texture {
    return this.albedo.texture;
  }

  dispose(): void {
    for (const t of [this.albedo, this.normalDepth, this.ping, this.pong, this.meterTarget, this.liveTarget]) t.dispose();
    this.normalDepthMaterial.dispose();
    for (const m of this.albedoMaterials.values()) m.dispose();
    this.albedoMaterials.clear();
    for (const quad of [this.demodulate, this.atrous, this.output, this.meterQuad, this.copier]) {
      quad.dispose();
      (quad as unknown as { material: THREE.Material }).material.dispose();
    }
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const ONE3 = new THREE.Vector3(1, 1, 1);
