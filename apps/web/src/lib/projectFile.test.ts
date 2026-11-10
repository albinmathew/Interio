import { createSampleProject, migrate, serializeProject, type Underlay } from '@interio/core';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_FILE_FORMAT,
  PROJECT_FILE_VERSION,
  ProjectFileError,
  decodeProjectFile,
  encodeProjectFile,
  packValue,
  unpackValue,
} from './projectFile';
import { copyName, projectFileName } from './session';

const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const gzip = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

/** Deterministic noise: stands in for a PNG or a PDF, which gzip cannot shrink. */
function noise(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

/** An underlay the size of a real drawing: 25 000 segments on a 10 mm grid plus a page image. */
function underlay(segments = 25_000): Underlay {
  const seg = new Float32Array(segments * 4);
  for (let i = 0; i < segments; i++) {
    const x = (i % 400) * 40;
    const y = Math.floor(i / 400) * 55;
    seg.set([x, y, x + 30 + (i % 7) * 10, y + (i % 3) * 20], i * 4);
  }
  const snap = new Float32Array(segments * 2);
  for (let i = 0; i < segments; i++) snap.set([seg[i * 4]!, seg[i * 4 + 1]!], i * 2);
  return {
    segments: seg,
    snapPoints: snap,
    image: { blob: new Blob([noise(300_000).buffer as ArrayBuffer], { type: 'image/png' }), widthPx: 2000, heightPx: 1414, planFromImage: [12.5, 0, 0, -12.5, -400.25, 9000.5] },
  };
}

/** Swaps one same-length ASCII run inside a binary container (its header is ASCII JSON). */
function replaceAscii(bytes: Uint8Array, from: string, to: string): Uint8Array {
  expect(to.length).toBe(from.length);
  const needle = [...from].map((c) => c.charCodeAt(0));
  const at = bytes.findIndex((_, i) => needle.every((b, j) => bytes[i + j] === b));
  expect(at).toBeGreaterThan(0);
  const out = bytes.slice();
  out.set([...to].map((c) => c.charCodeAt(0)), at);
  return out;
}

const blobBytes = async (blob: Blob): Promise<number[]> => [...new Uint8Array(await blob.arrayBuffer())];

describe('project file', () => {
  it('round-trips a project with its underlay and source PDF', async () => {
    const project = JSON.parse(serializeProject(createSampleProject()));
    const source = underlay();
    const pdf = new File([noise(200_000, 7).buffer as ArrayBuffer], 'Type D2.pdf', { type: 'application/pdf', lastModified: 1_700_000_000_000 });

    const bytes = await encodeProjectFile({ project, assets: { underlay: source, pdf } });
    const { project: back, assets } = await decodeProjectFile(bytes);

    expect(back).toEqual(project);
    expect(migrate(back)).toEqual(migrate(project));

    const u = assets.underlay as Underlay;
    expect(u.segments).toBeInstanceOf(Float32Array);
    expect(u.snapPoints).toBeInstanceOf(Float32Array);
    expect(u.segments).toEqual(source.segments);
    expect(u.snapPoints).toEqual(source.snapPoints);
    expect(u.image!.blob).toBeInstanceOf(Blob);
    expect(u.image!.blob.type).toBe('image/png');
    expect(await blobBytes(u.image!.blob)).toEqual(await blobBytes(source.image!.blob));
    expect(u.image).toMatchObject({ widthPx: 2000, heightPx: 1414, planFromImage: [12.5, 0, 0, -12.5, -400.25, 9000.5] });

    const file = assets.pdf as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('Type D2.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.lastModified).toBe(1_700_000_000_000);
    expect(await blobBytes(file)).toEqual(await blobBytes(pdf));
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', async () => {
    const bytes = await encodeProjectFile({ project: { schema: 1 }, assets: { a: new Float32Array([1.5, -2]) } });
    const { assets } = await decodeProjectFile(bytes.slice().buffer);
    expect(assets.a).toEqual(new Float32Array([1.5, -2]));
  });

  it('is gzipped, stores binary data once, and stays close to the size of what cannot be compressed', async () => {
    const project = JSON.parse(serializeProject(createSampleProject()));
    const source = underlay();
    const pdf = new Blob([noise(200_000, 7).buffer as ArrayBuffer], { type: 'application/pdf' });
    const bytes = await encodeProjectFile({ project, assets: { underlay: source, pdf } });

    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    const incompressible = 300_000 + 200_000;
    const raw = JSON.stringify(project).length + source.segments.byteLength + source.snapPoints.byteLength + incompressible;
    // Smaller than the parts laid end to end, and nowhere near the 4/3 growth of base64.
    expect(bytes.byteLength).toBeLessThan(raw);
    expect(bytes.byteLength).toBeLessThan(incompressible * 1.02 + 250_000);

    // No base64 inside: the container holds the PDF bytes verbatim.
    const inner = await gunzip(bytes);
    const magic = new TextDecoder().decode(inner.subarray(0, 8));
    expect(magic).toBe('INTERIO\n');
    const headerLength = new DataView(inner.buffer).getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(inner.subarray(12, 12 + headerLength)));
    expect(header).toMatchObject({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION });
    expect(header.chunks).toHaveLength(4);
    expect(header.assets.pdf).toEqual({ '$interio:bin': 3, as: 'Blob', type: 'application/pdf' });
    expect(headerLength).toBeLessThan(JSON.stringify(project).length + 1000);
  });

  it('reads the plain JSON project files of earlier versions', async () => {
    const project = createSampleProject();
    const legacy = new TextEncoder().encode(serializeProject(project));
    const { project: back, assets } = await decodeProjectFile(legacy);
    expect(migrate(back)).toEqual(migrate(JSON.parse(serializeProject(project))));
    expect(assets).toEqual({});

    // Pretty-printed with a byte-order mark free of surprises, and a JSON envelope without binary parts.
    const pretty = new TextEncoder().encode(JSON.stringify(JSON.parse(serializeProject(project)), null, 2));
    expect(migrate((await decodeProjectFile(pretty)).project).name).toBe(project.name);
    const envelope = new TextEncoder().encode(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: 1, project: JSON.parse(serializeProject(project)) }));
    expect(migrate((await decodeProjectFile(envelope)).project).id).toBe(project.id);
  });

  it('keeps every typed array kind, views with an offset, empty arrays and nesting', async () => {
    const backing = new Float64Array([0, 1.25, -2.5, 3.75, 4]);
    const assets = {
      i8: new Int8Array([-128, 0, 127]),
      u8: new Uint8Array([0, 255]),
      u8c: new Uint8ClampedArray([1, 2, 3]),
      i16: new Int16Array([-32768, 32767]),
      u16: new Uint16Array([65535]),
      i32: new Int32Array([-2147483648, 2147483647]),
      u32: new Uint32Array([4294967295]),
      f32: new Float32Array([Math.fround(0.1), -1e30]),
      // A view that starts in the middle of its buffer: only the viewed part is stored.
      f64: backing.subarray(1, 4),
      buffer: new Uint8Array([9, 8, 7]).buffer,
      empty: new Float32Array(0),
      nested: { list: [new Uint16Array([1, 2]), { deep: new Int8Array([-1]) }, 'text', 3, null, true] },
      blob: new Blob(['hello'], { type: 'text/plain' }),
    };
    const { assets: back } = await decodeProjectFile(await encodeProjectFile({ project: {}, assets }));

    for (const key of ['i8', 'u8', 'u8c', 'i16', 'u16', 'i32', 'u32', 'f32', 'empty'] as const) {
      expect(back[key]!.constructor).toBe(assets[key].constructor);
      expect(back[key]).toEqual(assets[key]);
    }
    expect(back.f64).toEqual(new Float64Array([1.25, -2.5, 3.75]));
    expect(back.buffer).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(back.buffer as ArrayBuffer)]).toEqual([9, 8, 7]);
    const nested = back.nested as { list: unknown[] };
    expect(nested.list[0]).toEqual(new Uint16Array([1, 2]));
    expect((nested.list[1] as { deep: Int8Array }).deep).toEqual(new Int8Array([-1]));
    expect(nested.list.slice(2)).toEqual(['text', 3, null, true]);
    expect(await (back.blob as Blob).text()).toBe('hello');
    expect((back.blob as Blob).type).toBe('text/plain');
  });

  it('packs and unpacks values without touching plain JSON', async () => {
    const chunks: Uint8Array[] = [];
    const packed = await packValue({ a: 1, b: [new Float32Array([1, 2])], c: undefined, d: 'x' }, chunks);
    expect(packed).toEqual({ a: 1, b: [{ '$interio:bin': 0, as: 'Float32Array' }], d: 'x' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(8);
    expect(unpackValue(packed, chunks)).toEqual({ a: 1, b: [new Float32Array([1, 2])], d: 'x' });
    // Something that is neither JSON nor binary is refused rather than silently dropped.
    await expect(packValue({ when: new Date(0) }, [])).rejects.toBeInstanceOf(ProjectFileError);
    await expect(packValue({ m: new Map() }, [])).rejects.toThrow(/Map/);
  });

  it('explains what is wrong with a file it cannot read', async () => {
    await expect(decodeProjectFile(new Uint8Array(0))).rejects.toThrow(/empty/i);
    await expect(decodeProjectFile(new TextEncoder().encode('%PDF-1.7 not a project'))).rejects.toThrow(/not an Interio project file/i);

    const good = await encodeProjectFile({ project: { schema: 1 }, assets: { a: new Float32Array(1000).fill(1.5), b: new Blob([noise(5000).buffer as ArrayBuffer]) } });
    // Cut off in the middle of the compressed stream.
    await expect(decodeProjectFile(good.subarray(0, Math.floor(good.byteLength / 2)))).rejects.toBeInstanceOf(ProjectFileError);

    // A container whose data area is shorter than its table says.
    const inner = await gunzip(good);
    await expect(decodeProjectFile(await gzip(inner.subarray(0, inner.byteLength - 100)))).rejects.toThrow(/ends too early/i);
    // The container also opens without the gzip wrapper.
    expect((await decodeProjectFile(inner)).assets.a).toEqual(new Float32Array(1000).fill(1.5));

    // A chunk whose size does not fit its element type.
    const odd = await encodeProjectFile({ project: {}, assets: { a: new Uint8Array(7) } });
    const oddInner = await gunzip(odd);
    await expect(decodeProjectFile(replaceAscii(oddInner, 'Uint8Array', 'Int16Array'))).rejects.toThrow(/wrong size/i);
    // A kind of data this version does not know.
    await expect(decodeProjectFile(replaceAscii(oddInner, 'Uint8Array', 'BigInt64Ar'))).rejects.toThrow(/cannot read/i);
    // A reference to a chunk that is not in the table.
    await expect(decodeProjectFile(replaceAscii(oddInner, '"$interio:bin":0', '"$interio:bin":5'))).rejects.toThrow(/missing/i);

    // Written by a later version.
    const header = new TextEncoder().encode(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION + 1, project: {}, assets: {}, chunks: [] }));
    const future = new Uint8Array(12 + header.byteLength);
    future.set(new TextEncoder().encode('INTERIO\n'), 0);
    new DataView(future.buffer).setUint32(8, header.byteLength, true);
    future.set(header, 12);
    await expect(decodeProjectFile(future)).rejects.toThrow(/newer version/i);
  });
});

describe('project names', () => {
  it('names copies without colliding', () => {
    expect(copyName('Flat', ['Flat'])).toBe('Flat copy');
    expect(copyName('Flat', ['Flat', 'Flat copy'])).toBe('Flat copy 2');
    expect(copyName('Flat copy', ['Flat', 'Flat copy'])).toBe('Flat copy 2');
    expect(copyName('Flat copy 2', ['Flat', 'Flat copy', 'Flat copy 2'])).toBe('Flat copy 3');
  });

  it('makes a safe file name', () => {
    expect(projectFileName('My flat / v2')).toBe('My-flat-v2.interio');
    expect(projectFileName('  ')).toBe('plan.interio');
    expect(projectFileName('Sample.home')).toBe('Sample.home.interio');
  });
});
