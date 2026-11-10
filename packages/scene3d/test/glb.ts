/**
 * Builds a tiny binary glTF in memory: one box mesh spanning `min`..`max` in the
 * model's own units, under a node with an optional translation and uniform scale.
 * Enough to exercise the loader and the fit maths without shipping a model file.
 */
export interface TestGlbOptions {
  min: [number, number, number];
  max: [number, number, number];
  translation?: [number, number, number];
  scale?: number;
  /** Name of the mesh node. */
  name?: string;
}

export function makeBoxGlb({ min, max, translation = [0, 0, 0], scale = 1, name = 'box' }: TestGlbOptions): ArrayBuffer {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  // prettier-ignore
  const positions = new Float32Array([
    x0, y0, z0,  x1, y0, z0,  x1, y1, z0,  x0, y1, z0,
    x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1,
  ]);
  // prettier-ignore
  const indices = new Uint16Array([
    0, 2, 1,  0, 3, 2,  4, 5, 6,  4, 6, 7,
    0, 1, 5,  0, 5, 4,  3, 6, 2,  3, 7, 6,
    0, 4, 7,  0, 7, 3,  1, 2, 6,  1, 6, 5,
  ]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);

  const json = {
    asset: { version: '2.0', generator: 'interio-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, translation, scale: [scale, scale, scale] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  };
  const pad = (bytes: Uint8Array, fill: number): Uint8Array => {
    const out = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill);
    out.set(bytes);
    return out;
  };
  const jsonChunk = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(jsonChunk, 20);
  const at = 20 + jsonChunk.length;
  view.setUint32(at, binChunk.length, true);
  view.setUint32(at + 4, 0x004e4942, true); // "BIN"
  bytes.set(binChunk, at + 8);
  return out;
}
