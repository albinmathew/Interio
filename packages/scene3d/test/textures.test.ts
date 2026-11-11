import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FINISH_KINDS,
  FURNITURE_MATERIAL_LIST,
  MATERIAL_LIST,
  createSampleLevel,
  resolveFurnitureMaterial,
  selectLevelMesh,
  type Level,
  type MeshGroup,
} from '@interio/core';
import { describe, expect, it } from 'vitest';
import { CUSTOM_TEXTURES, FURNITURE_SETS, FURNITURE_TEXTURES, furnitureSets, furnitureTextureSpec } from '../src/furnitureSpecs';
import { CUSTOM_FLOOR_TEXTURE, SURFACE_TEXTURES, isFlatFinish, textureSpecFor } from '../src/materialSpecs';
import { DEFAULT_FLOOR, surfaceFinish } from '../src/surfaces';
import { PATTERNS, applyShade, averageLinear, linearToByte, normaliseRoughness, relief, shadeFromNormals, tintPixels } from '../src/texturePixels';

const TEXTURES = fileURLToPath(new URL('../../../apps/web/public/textures', import.meta.url));
const file = (set: string, map: string) => `${TEXTURES}/${set}/${map}.jpg`;

describe('furniture textures', () => {
  it('every furniture material has a decided look: a texture set or a deliberate flat finish', () => {
    for (const m of FURNITURE_MATERIAL_LIST) expect(Object.hasOwn(FURNITURE_TEXTURES, m.id), m.id).toBe(true);
    for (const id of Object.keys(FURNITURE_TEXTURES)) expect(FURNITURE_MATERIAL_LIST.some((m) => m.id === id), id).toBe(true);
  });

  it('cloth, leather, wood, stone and woven finishes are textured; glass, lacquer and polished metal are flat', () => {
    for (const m of FURNITURE_MATERIAL_LIST) {
      const spec = furnitureTextureSpec(m);
      if (['fabric', 'leather', 'wood', 'stone', 'woven'].includes(m.kind)) expect(spec, m.id).not.toBeNull();
      if (['glass', 'lacquer'].includes(m.kind)) expect(spec, m.id).toBeNull();
    }
    expect(furnitureTextureSpec(resolveFurnitureMaterial('metal.steel')!)?.set).toBe('metal-brushed');
    expect(furnitureTextureSpec(resolveFurnitureMaterial('metal.chrome')!)).toBeNull();
    // Each species of wood has its own grain.
    const woods = ['wood.oak', 'wood.ash', 'wood.teak', 'wood.walnut', 'wood.wenge'].map((id) => FURNITURE_TEXTURES[id]!.set);
    expect(new Set(woods).size).toBe(5);
    expect(FURNITURE_TEXTURES['stone.marble.white']!.set).not.toBe(FURNITURE_TEXTURES['stone.marble.black']!.set);
  });

  it('every set exists on disk with the maps its spec uses', () => {
    for (const spec of Object.values(FURNITURE_SETS)) {
      if (spec.color) expect(existsSync(file(spec.set, 'color')), `${spec.set}/color`).toBe(true);
      if (spec.normal || spec.cavity) expect(existsSync(file(spec.set, 'normal')), `${spec.set}/normal`).toBe(true);
      if (spec.rough) expect(existsSync(file(spec.set, 'rough')), `${spec.set}/rough`).toBe(true);
      // Something to show: a colour map, or a weave to shade.
      expect(spec.color || spec.normal).toBe(true);
      if (spec.color) expect(spec.avg).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(furnitureSets().length).toBeGreaterThan(15);
  });

  it('patterns repeat at their real size: weaves of centimetres, grains and stones of a metre or so', () => {
    for (const id of ['fabric.linen.sand', 'fabric.weave.grey', 'fabric.boucle.cream', 'fabric.velvet.navy', 'woven.jute']) {
      expect(FURNITURE_TEXTURES[id]!.size, id).toBeLessThan(0.5);
    }
    for (const id of ['wood.oak', 'wood.walnut', 'stone.marble.white', 'stone.travertine']) {
      expect(FURNITURE_TEXTURES[id]!.size, id).toBeGreaterThanOrEqual(0.8);
      expect(FURNITURE_TEXTURES[id]!.size, id).toBeLessThanOrEqual(2);
    }
    for (const spec of Object.values(FURNITURE_SETS)) expect(spec.swatch).toBeLessThanOrEqual(spec.size);
  });

  it('a custom colour keeps the surface character of its slot', () => {
    for (const kind of FINISH_KINDS) {
      const custom = resolveFurnitureMaterial('#3366aa', kind)!;
      expect(custom.color).toBe('#3366aa');
      expect(furnitureTextureSpec(custom)).toBe(CUSTOM_TEXTURES[kind]);
    }
    expect(furnitureTextureSpec(resolveFurnitureMaterial('#3366aa', 'fabric')!)?.set).toBe('fabric-linen');
    expect(furnitureTextureSpec(resolveFurnitureMaterial('#3366aa', 'wood')!)?.color).toBe(true);
    expect(furnitureTextureSpec(resolveFurnitureMaterial('#3366aa', 'glass')!)).toBeNull();
    expect(furnitureTextureSpec({ id: 'not.a.material', kind: 'wood' })).toBeNull();
  });
});

describe('surface textures', () => {
  it('every palette finish has a texture set or is a deliberate flat paint', () => {
    for (const m of MATERIAL_LIST) {
      const spec = SURFACE_TEXTURES[m.id];
      expect(!!spec !== isFlatFinish(m.id), m.id).toBe(true);
      if (!spec) continue;
      if (spec.set && !spec.noColor) expect(existsSync(file(spec.set, 'color')), `${m.id}: ${spec.set}`).toBe(true);
      if (spec.noColor) expect(existsSync(file(spec.set!, 'normal')), m.id).toBe(true);
      if (!spec.set) expect(spec.pattern, m.id).toBeDefined();
    }
    for (const id of ['floor.oak.smoked', 'floor.chevron', 'floor.travertine', 'floor.slate', 'floor.marble.black', 'floor.microcement', 'wall.panel.fluted', 'wall.panel.wainscot', 'wall.tile.zellige', 'ceiling.wood'])
      expect(textureSpecFor(id), id).toBeDefined();
  });

  it('a custom colour is a trowelled floor, or a flat paint on walls and ceilings', () => {
    expect(textureSpecFor('#aabbcc', 'floor')).toBe(CUSTOM_FLOOR_TEXTURE);
    expect(textureSpecFor('#aabbcc', 'wall')).toBeUndefined();
    expect(textureSpecFor('#aabbcc', 'ceiling')).toBeUndefined();
    expect(textureSpecFor('#aabbcc')).toBeUndefined();
    expect(textureSpecFor('nonsense', 'floor')).toBeUndefined();
  });
});

describe('wall face finishes', () => {
  const level = (): Level => createSampleLevel();
  const sides = (l: Level) => selectLevelMesh(l).groups.filter((g) => g.kind === 'wallSide');

  it('a face shows its room wall finish, an accent of its own wins, and outside faces keep the facade', () => {
    const l = level();
    const inside = sides(l).find((g) => g.roomId)!;
    const room = l.rooms[inside.roomId!]!;
    room.wallMaterial = 'wall.paint.sage';
    expect(surfaceFinish(l, inside)).toEqual({ finish: 'wall.paint.sage', surface: 'wall' });

    const wall = l.walls[inside.wallId!]!;
    if (inside.side === 'left') wall.finishLeft = 'wall.panel.fluted';
    else wall.finishRight = 'wall.panel.fluted';
    expect(surfaceFinish(l, inside).finish).toBe('wall.panel.fluted');
    // The other face of the same wall is untouched.
    const other: MeshGroup = { ...inside, side: inside.side === 'left' ? 'right' : 'left' };
    expect(surfaceFinish(l, other).finish).not.toBe('wall.panel.fluted');

    const outside = sides(l).find((g) => !g.roomId)!;
    expect(surfaceFinish(l, outside).finish).toBeUndefined();
    const ow = l.walls[outside.wallId!]!;
    if (outside.side === 'left') ow.finishLeft = '#334455';
    else ow.finishRight = '#334455';
    expect(surfaceFinish(l, outside)).toEqual({ finish: '#334455', surface: 'wall' });
  });

  it('floors and ceilings follow their room, with defaults', () => {
    const l = level();
    const floor = selectLevelMesh(l).groups.find((g) => g.kind === 'floor' && g.roomId)!;
    l.rooms[floor.roomId!]!.floorMaterial = '#806040';
    expect(surfaceFinish(l, floor)).toEqual({ finish: '#806040', surface: 'floor' });
    expect(surfaceFinish(l, { ...floor, roomId: null }).finish).toBe(DEFAULT_FLOOR);
    const top = selectLevelMesh(l).groups.find((g) => g.kind === 'wallTop')!;
    expect(surfaceFinish(l, top).finish).toBeUndefined();
  });
});

describe('texture pixels', () => {
  const solid = (n: number, rgba: [number, number, number, number]) => {
    const d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
    return d;
  };

  it('tinting by white changes nothing; tinting by a colour scales in linear light', () => {
    const d = solid(4, [200, 120, 40, 255]);
    expect([...tintPixels(d.slice(), [1, 1, 1])]).toEqual([...d]);
    const half = tintPixels(d.slice(), [0.5, 0.5, 0.5]);
    const avg = averageLinear(half);
    const before = averageLinear(d);
    avg.forEach((v, i) => expect(v).toBeCloseTo(before[i]! * 0.5, 2));
  });

  it('a flat normal map shades to exactly the finish colour; a slanted one goes darker or lighter', () => {
    const flat = shadeFromNormals(solid(4, [128, 128, 255, 255]), '#3366aa', 0.6);
    expect([flat[0], flat[1], flat[2]]).toEqual([0x33, 0x66, 0xaa].map((v) => expect.closeTo(v, 1) as unknown as number));
    const away = shadeFromNormals(solid(1, [220, 40, 200, 255]), '#3366aa', 0.6);
    expect(away[2]!).toBeLessThan(0xaa);
  });

  it('roughness maps are rescaled to the wanted mean', () => {
    const d = new Uint8ClampedArray([40, 40, 40, 255, 80, 80, 80, 255]);
    normaliseRoughness(d, 0.6);
    expect((d[1]! + d[5]!) / 2 / 255).toBeCloseTo(0.6, 1);
  });

  it('procedural reliefs: flat fields give flat normals, flutes and panels give relief and shade', () => {
    const flat = relief(() => 0.5, 8);
    for (let i = 0; i < flat.normal.length; i += 4) expect([flat.normal[i], flat.normal[i + 1]]).toEqual([128, 128]);
    for (const field of [PATTERNS.flutes(4), PATTERNS.slats(4), PATTERNS.wainscot(3, 0.3)]) {
      const r = relief(field, 64, 3);
      const xs = new Set<number>();
      for (let i = 0; i < r.normal.length; i += 4) xs.add(r.normal[i]! + 256 * r.normal[i + 1]!);
      expect(xs.size).toBeGreaterThanOrEqual(3);
      expect(Math.min(...r.shade)).toBeLessThan(0.9);
      expect(Math.max(...r.shade)).toBeLessThanOrEqual(1);
    }
    // Wainscot: plain wall above the panelling.
    const w = PATTERNS.wainscot(3, 0.3);
    expect(w(0.4, 0.8)).toBe(0);
    expect(w(0.5, 0.15)).not.toBe(0);
    const shaded = applyShade(solid(1, [255, 255, 255, 255]), new Float32Array([0.5]));
    expect(shaded[0]).toBe(linearToByte(0.5));
  });
});
