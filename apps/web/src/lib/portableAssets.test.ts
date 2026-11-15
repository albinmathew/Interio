import { createSampleProject, muralFinishId, type Project } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { MAX_EMBEDDED_PDF_BYTES, importableAssets, muralAssetIdOf, muralAssetName, portableAssets } from './portableAssets';
import { decodeProjectFile, encodeProjectFile } from './projectFile';

const png = (seed: number) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed, seed + 1, seed + 2])], { type: 'image/png' });
const bytes = async (b: unknown) => Array.from(new Uint8Array(await (b as Blob).arrayBuffer()));

/** The sample home with the user's own picture on one wall face (with panelling) and another on a second. */
function projectWithMurals(): Project {
  const project = createSampleProject();
  const walls = Object.values(project.levels[0]!.walls);
  walls[0]!.finishLeft = muralFinishId('kids1', true);
  walls[1]!.finishRight = muralFinishId('sky2', false);
  return project;
}

describe('mural asset names', () => {
  it('store each picture under mural/<assetId>', () => {
    expect(muralAssetName('abc')).toBe('mural/abc');
    expect(muralAssetIdOf('mural/abc')).toBe('abc');
    expect(muralAssetIdOf('mural/a:b')).toBeNull();
    expect(muralAssetIdOf('underlay')).toBeNull();
  });
});

describe('portable assets', () => {
  it('an export carries the pictures the walls show, and only those', () => {
    const project = projectWithMurals();
    const stored = {
      underlay: { segments: new Float32Array(4), snapPoints: new Float32Array(2) },
      [muralAssetName('kids1')]: png(1),
      [muralAssetName('sky2')]: png(2),
      // Taken off its wall earlier: stays home.
      [muralAssetName('old')]: png(3),
      // Not an image: never exported as a mural.
      [muralAssetName('bad')]: new Blob(['x'], { type: 'text/plain' }),
    };
    const { assets, skipped } = portableAssets(project, stored);
    expect(Object.keys(assets).sort()).toEqual(['mural/kids1', 'mural/sky2', 'underlay']);
    expect(skipped).toEqual([]);
  });

  it('a large source PDF stays behind', () => {
    const big = new Blob([new Uint8Array(MAX_EMBEDDED_PDF_BYTES + 1)], { type: 'application/pdf' });
    expect(portableAssets(createSampleProject(), { pdf: big })).toEqual({ assets: {}, skipped: ['pdf'] });
  });

  it('round trip: mural pictures survive export and import byte for byte, and the walls still point at them', async () => {
    const project = projectWithMurals();
    const stored = { [muralAssetName('kids1')]: png(1), [muralAssetName('sky2')]: png(2) };
    const { assets } = portableAssets(project, stored);
    const file = await encodeProjectFile({ project: JSON.parse(JSON.stringify(project)), assets });
    const opened = await decodeProjectFile(file);
    const kept = importableAssets(opened.assets);
    expect(Object.keys(kept).sort()).toEqual(['mural/kids1', 'mural/sky2']);
    expect(await bytes(kept['mural/kids1'])).toEqual(await bytes(stored['mural/kids1']));
    expect((kept['mural/sky2'] as Blob).type).toBe('image/png');
    const walls = Object.values((opened.project as Project).levels[0]!.walls);
    expect(walls[0]!.finishLeft).toBe('mural:kids1:dado');
    expect(walls[1]!.finishRight).toBe('mural:sky2');
  });

  it('an import drops anything that is not a usable asset', () => {
    const kept = importableAssets({
      'mural/ok': png(1),
      'mural/not:id': png(2),
      'mural/text': new Blob(['x'], { type: 'text/plain' }),
      'mural/notblob': 'data:image/png;base64,AAAA',
      other: png(3),
      pdf: new Blob(['%PDF'], { type: 'application/pdf' }),
      underlay: { segments: [1, 2] },
    });
    expect(Object.keys(kept).sort()).toEqual(['mural/ok', 'pdf']);
  });
});
