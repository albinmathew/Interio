import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  createSampleProject,
  isMuralAssetId,
  isMuralFinish,
  muralAssetIds,
  muralFinishId,
  parseMuralFinish,
  resolveSurfaceFinish,
  withMuralDado,
} from '../src';

describe('mural finish ids', () => {
  it('reads the built-in murals, with and without panelling', () => {
    expect(parseMuralFinish('wall.mural.meadow')).toEqual({ source: { kind: 'builtin', art: 'meadow' }, dado: false });
    expect(parseMuralFinish('wall.mural.meadow.dado')).toEqual({ source: { kind: 'builtin', art: 'meadow' }, dado: true });
    expect(MATERIALS['wall.mural.meadow']?.name).toBe('Spring meadow mural');
    expect(MATERIALS['wall.mural.meadow.dado']?.surface).toBe('wall');
    // Art that does not exist is not a mural.
    expect(parseMuralFinish('wall.mural.ocean')).toBeNull();
  });

  it("reads a user's own mural: an asset id, optionally with panelling", () => {
    expect(parseMuralFinish('mural:a1B_2-c')).toEqual({ source: { kind: 'asset', assetId: 'a1B_2-c' }, dado: false });
    expect(parseMuralFinish('mural:a1B_2-c:dado')).toEqual({ source: { kind: 'asset', assetId: 'a1B_2-c' }, dado: true });
    for (const bad of ['mural:', 'mural:a:b', 'mural:a b', 'mural:a:dado:x', 'mural:a/b', `mural:${'x'.repeat(65)}`, 'wall.paint.white', '#aabbcc', undefined, ''])
      expect(parseMuralFinish(bad), String(bad)).toBeNull();
  });

  it('writes ids that read back, and switches the panelling on and off', () => {
    expect(muralFinishId('abc', false)).toBe('mural:abc');
    expect(muralFinishId('abc', true)).toBe('mural:abc:dado');
    expect(parseMuralFinish(muralFinishId('k9', true))?.source).toEqual({ kind: 'asset', assetId: 'k9' });
    expect(() => muralFinishId('a:b', false)).toThrow();
    expect(isMuralAssetId('a:b')).toBe(false);
    expect(withMuralDado('mural:abc', true)).toBe('mural:abc:dado');
    expect(withMuralDado('mural:abc:dado', false)).toBe('mural:abc');
    expect(withMuralDado('wall.mural.meadow', true)).toBe('wall.mural.meadow.dado');
    expect(withMuralDado('wall.mural.meadow.dado', false)).toBe('wall.mural.meadow');
    expect(withMuralDado('wall.paint.white', true)).toBeNull();
    expect(isMuralFinish('mural:abc')).toBe(true);
    expect(isMuralFinish('wall.panel.beadboard')).toBe(false);
  });

  it("resolves a user's mural to a wall finish, so it renders and has a name", () => {
    expect(resolveSurfaceFinish('mural:abc', 'wall')).toMatchObject({ id: 'mural:abc', name: 'Your mural', surface: 'wall' });
    expect(resolveSurfaceFinish('mural:abc:dado', 'wall')?.name).toBe('Your mural over beadboard');
    expect(resolveSurfaceFinish('mural:a:b', 'wall')).toBeNull();
  });

  it("lists the user's mural assets a project's walls show", () => {
    const project = createSampleProject();
    expect(muralAssetIds(project)).toEqual([]);
    const walls = Object.values(project.levels[0]!.walls);
    walls[0]!.finishLeft = 'mural:one';
    walls[1]!.finishRight = 'mural:two:dado';
    walls[2]!.finishLeft = 'mural:one:dado';
    walls[3]!.finishLeft = 'wall.mural.meadow';
    expect(muralAssetIds(project).sort()).toEqual(['one', 'two']);
  });
});
