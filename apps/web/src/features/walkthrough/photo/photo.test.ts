import { planSceneUpdate, signScene, tileGrid, traceRole, whiteBalance, writeTraceMaterial, type TraceMaterial } from '@interio/scene3d';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FrameBudget, TARGET_FPS_60HZ, TARGET_FPS_HIGH } from './budget';
import { MAX_SAMPLES, READY_SAMPLES, photoStatus, progressText } from './progress';
import { STILL_DELAY_MS, Stillness, TOUR_STILL_DELAY_MS, stillDelay } from './stillness';

describe('stillness', () => {
  const view = (x = 0) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 1.6, -2, 1, 1920, 1080];

  it('counts how long the view has stayed the same', () => {
    const s = new Stillness();
    expect(s.observe(view(), 1000)).toBe(0);
    expect(s.observe(view(), 1100)).toBe(100);
    expect(s.observe(view(), 1400)).toBe(400);
  });

  it('starts again when the view moves, and ignores sub-epsilon drift', () => {
    const s = new Stillness();
    s.observe(view(), 0);
    expect(s.observe(view(1e-9), 200)).toBe(200);
    expect(s.observe(view(0.01), 300)).toBe(0);
    expect(s.observe(view(0.01), 450)).toBe(150);
  });

  it('restarts the clock after a scene edit without a new view', () => {
    const s = new Stillness();
    s.observe(view(), 0);
    s.restart(500);
    expect(s.observe(view(), 600)).toBe(100);
  });

  it('waits longer while the guided tour plays', () => {
    expect(stillDelay(false)).toBe(STILL_DELAY_MS);
    expect(stillDelay(true)).toBe(TOUR_STILL_DELAY_MS);
    // A tour stop holds still for half a second at 1x: too short to start tracing.
    expect(TOUR_STILL_DELAY_MS).toBeGreaterThan(500);
  });
});

describe('frame budget', () => {
  const run = (b: FrameBudget, frameMs: number, frames: number) => {
    let tiles = 0;
    for (let i = 0; i < frames; i++) tiles += b.next(frameMs);
    return tiles;
  };

  it('aims above the performance monitor bound for the display', () => {
    const b60 = new FrameBudget();
    for (let i = 0; i < 200; i++) b60.observeIdle(1000 / 60);
    expect(b60.targetFps).toBe(TARGET_FPS_60HZ);
    const b120 = new FrameBudget();
    for (let i = 0; i < 200; i++) b120.observeIdle(1000 / 120);
    expect(b120.targetFps).toBe(TARGET_FPS_HIGH);
  });

  it('one odd frame does not change the verdict on the display', () => {
    const b = new FrameBudget();
    for (let i = 0; i < 100; i++) b.observeIdle(1000 / 60);
    b.observeIdle(3.5);
    expect(b.targetFps).toBe(TARGET_FPS_60HZ);
  });

  it('traces more while frames stay quick and backs off when they slow', () => {
    const b = new FrameBudget();
    const start = b.tilesPerSecond;
    run(b, 1000 / 60, 120);
    const fast = b.tilesPerSecond;
    expect(fast).toBeGreaterThan(start);
    run(b, 40, 30);
    expect(b.tilesPerSecond).toBeLessThan(fast * 0.5);
  });

  it('spreads the rate over frames and caps tiles per frame', () => {
    const b = new FrameBudget();
    run(b, 1000 / 60, 600);
    for (let i = 0; i < 60; i++) expect(b.next(1000 / 60)).toBeLessThanOrEqual(3);
    // About rate x time tiles over a second.
    const tiles = run(b, 1000 / 60, 60);
    expect(tiles).toBeGreaterThan(0);
  });
});

describe('progress', () => {
  it('goes from preparing to live to refining to ready', () => {
    const base = { enabled: true, available: true, prepared: true, tracing: true, samples: 0 };
    expect(photoStatus({ ...base, available: false })).toBe('unavailable');
    expect(photoStatus({ ...base, enabled: false })).toBe('off');
    expect(photoStatus({ ...base, prepared: false })).toBe('preparing');
    expect(photoStatus({ ...base, tracing: false })).toBe('live');
    expect(photoStatus({ ...base, samples: READY_SAMPLES - 1 })).toBe('refining');
    expect(photoStatus({ ...base, samples: READY_SAMPLES })).toBe('ready');
    expect(MAX_SAMPLES).toBeGreaterThan(READY_SAMPLES);
  });

  it('says what it is doing in a few words', () => {
    expect(progressText('off', 0)).toBeNull();
    expect(progressText('live', 0)).toBeNull();
    expect(progressText('preparing', 0)?.label).toMatch(/Preparing/);
    expect(progressText('refining', 1)).toMatchObject({ label: 'Refining…', detail: '1 sample' });
    expect(progressText('refining', 8)).toMatchObject({ label: 'Refining…', detail: '8 samples', fraction: 8 / READY_SAMPLES });
    expect(progressText('ready', 40)).toMatchObject({ label: 'Ready', detail: '40 samples', fraction: 1 });
  });
});

describe('scene changes and tracer updates', () => {
  function scene() {
    const s = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: '#c8a27a', roughness: 0.4 }));
    floor.name = 'floor';
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.9), new THREE.MeshPhysicalMaterial({ color: '#efe7da', sheen: 1 }));
    const shade = new THREE.Group();
    shade.name = 'contact-shade';
    const shadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    shade.add(shadeQuad);
    const lamp = new THREE.PointLight('#ffe0ba', 2, 5, 2);
    lamp.position.set(1, 2.3, 0);
    s.add(floor, sofa, shade, lamp);
    s.environmentIntensity = 0.22;
    s.updateMatrixWorld(true);
    return { s, floor, sofa, shadeQuad, lamp };
  }

  it('rebuilds everything the first time', () => {
    const { s } = scene();
    expect(planSceneUpdate(null, signScene(s))).toEqual({ rebuild: true, materials: true, lights: true, environment: true });
  });

  it('a finish change updates materials only', () => {
    const { s, floor } = scene();
    const before = signScene(s);
    (floor.material as THREE.MeshStandardMaterial).color.set('#3b2a20');
    expect(planSceneUpdate(before, signScene(s))).toEqual({ rebuild: false, materials: true, lights: false, environment: false });
  });

  it('a moved or added item rebuilds the geometry', () => {
    const { s, sofa } = scene();
    const before = signScene(s);
    sofa.position.x += 0.5;
    s.updateMatrixWorld(true);
    expect(planSceneUpdate(before, signScene(s)).rebuild).toBe(true);
    const again = signScene(s);
    s.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    s.updateMatrixWorld(true);
    expect(planSceneUpdate(again, signScene(s)).rebuild).toBe(true);
  });

  it('a lamp or lighting preset change updates lights; the outside view updates the environment', () => {
    const { s, lamp } = scene();
    const before = signScene(s);
    lamp.intensity = 0;
    expect(planSceneUpdate(before, signScene(s))).toEqual({ rebuild: false, materials: false, lights: true, environment: false });
    const again = signScene(s);
    s.environmentIntensity = 0.1;
    s.background = new THREE.Color('#f0c49c');
    expect(planSceneUpdate(again, signScene(s))).toEqual({ rebuild: false, materials: false, lights: false, environment: true });
  });

  it('ignores what the tracer leaves out, and three re-flagging a material', () => {
    const { s, shadeQuad, floor } = scene();
    const before = signScene(s);
    (shadeQuad.material as THREE.Material).opacity = 0.3;
    shadeQuad.position.x = 2;
    s.updateMatrixWorld(true);
    // Drawing transparent double-sided materials bumps their version every frame.
    (floor.material as THREE.Material).needsUpdate = true;
    expect(planSceneUpdate(before, signScene(s))).toEqual({ rebuild: false, materials: false, lights: false, environment: false });
  });
});

describe('traced materials', () => {
  const out = () => new THREE.MeshPhysicalMaterial() as TraceMaterial;

  it('makes opaque surfaces double sided so ceilings and floors block light from behind', () => {
    const m = writeTraceMaterial(new THREE.MeshStandardMaterial({ color: '#fafaf8', roughness: 0.95 }), 'default', out());
    expect(m.side).toBe(THREE.DoubleSide);
    expect(m.transmission).toBe(0);
  });

  it('turns faint transparent window glass and glass finishes into transmissive glass', () => {
    const pane = writeTraceMaterial(new THREE.MeshStandardMaterial({ color: '#cfe2e8', roughness: 0.04, transparent: true, opacity: 0.16 }), 'default', out());
    expect(pane.transmission).toBe(1);
    expect(pane.transparent).toBe(false);
    expect(pane.opacity).toBe(1);
    const frosted = writeTraceMaterial(new THREE.MeshPhysicalMaterial({ name: 'glass.frosted', roughness: 0.6, transparent: true, opacity: 0.55 }), 'default', out());
    expect(frosted.transmission).toBe(1);
    expect(frosted.roughness).toBeGreaterThan(0.2);
    const mirror = writeTraceMaterial(new THREE.MeshPhysicalMaterial({ name: 'glass.mirror', metalness: 1, roughness: 0.04 }), 'default', out());
    expect(mirror.transmission).toBe(0);
    expect(mirror.metalness).toBe(1);
  });

  it('keeps fabric sheen, and folds clear coat into a glossier base', () => {
    const fabric = writeTraceMaterial(new THREE.MeshPhysicalMaterial({ sheen: 1, sheenRoughness: 0.6, sheenColor: '#ffffff' }), 'default', out());
    expect(fabric.sheen).toBe(1);
    const lacquer = writeTraceMaterial(new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12 }), 'default', out());
    expect(lacquer.clearcoat).toBe(0);
    expect(lacquer.roughness).toBeLessThan(0.18);
  });

  it('lets a lit lamp shine: the bulb casts no shadow, the shade glows and lets the light through', () => {
    const bulb = writeTraceMaterial(new THREE.MeshStandardMaterial({ name: 'lacquer.white.gloss:lit', emissive: '#ffd59a', emissiveIntensity: 2.4 }), 'default', out());
    expect(bulb.castShadow).toBe(false);
    expect(bulb.emissiveIntensity).toBeCloseTo(2.4);
    const shade = writeTraceMaterial(new THREE.MeshPhysicalMaterial({ name: 'fabric.linen.ivory', color: '#efe6d6' }), 'litShade', out());
    expect(shade.castShadow).toBe(false);
    expect(shade.emissiveIntensity).toBeGreaterThan(0);
  });

  it('turns an unlit backdrop into an emitter of its colour', () => {
    const backdrop = writeTraceMaterial(new THREE.MeshBasicMaterial({ color: '#7fa86a' }), 'default', out());
    expect(backdrop.emissive.getHexString()).toBe(new THREE.Color('#7fa86a').getHexString());
    expect(backdrop.color.getHex()).toBe(0);
  });

  it('leaves out baked contact shading and opted-out objects; marks lit shades', () => {
    const lit = new Map<THREE.Object3D, boolean>();
    const group = new THREE.Group();
    group.name = 'contact-shade';
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    group.add(quad);
    expect(traceRole(quad, lit)).toBe('excluded');
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    marker.userData.pathTrace = false;
    expect(traceRole(marker, lit)).toBe('excluded');

    const item = new THREE.Group();
    item.userData.itemId = 'lamp1';
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshPhysicalMaterial({ name: 'fabric.linen.ivory' }));
    shade.userData.slot = 'shade';
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial({ name: 'lacquer.white.gloss:lit' }));
    item.add(shade, bulb);
    expect(traceRole(shade, lit)).toBe('litShade');
    expect(traceRole(bulb, new Map())).toBe('default');
  });
});

describe('tracer helpers', () => {
  it('splits images into tiles of about the same size', () => {
    expect(tileGrid(100)).toBe(1);
    expect(tileGrid(960 * 540)).toBeGreaterThan(2);
    expect(tileGrid(1920 * 1080)).toBeGreaterThan(tileGrid(960 * 540));
  });

  it('white balance pulls warm light part of the way to neutral, keeping brightness', () => {
    expect(whiteBalance(null, 0.6)).toEqual([1, 1, 1]);
    const [r, , b] = whiteBalance([1.2, 1, 0.7], 0.6);
    expect(r).toBeLessThan(1);
    expect(b).toBeGreaterThan(1);
    const neutral = whiteBalance([1, 1, 1], 0.6);
    neutral.forEach((v) => expect(v).toBeCloseTo(1));
    // Never more than a factor of two either way.
    whiteBalance([10, 0.01, 0.01], 1).forEach((v) => expect(v).toBeLessThanOrEqual(2));
  });
});
