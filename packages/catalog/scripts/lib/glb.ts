/**
 * Minimal GLB reader/writer for the catalog scripts and tests.
 * Handles what the CC0 source kits use: one binary buffer, float positions and
 * normals, optional indices, triangle lists, node TRS or matrix transforms.
 */
import fs from 'node:fs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GltfJson = Record<string, any>;

export interface Glb {
  json: GltfJson;
  bin: Uint8Array;
}

const MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function parseGlb(data: Uint8Array): Glb {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength < 20 || view.getUint32(0, true) !== MAGIC) throw new Error('Not a GLB file');
  if (view.getUint32(4, true) !== 2) throw new Error('Unsupported GLB version');
  const total = view.getUint32(8, true);
  if (total !== data.byteLength) throw new Error(`GLB length mismatch: header ${total}, file ${data.byteLength}`);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
    else if (type === CHUNK_BIN) bin = body;
    offset += 8 + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

export function readGlb(file: string): Glb {
  return parseGlb(new Uint8Array(fs.readFileSync(file)));
}

export function encodeGlb(glb: Glb): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(glb.json));
  const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;
  const binLen = Math.ceil(glb.bin.byteLength / 4) * 4;
  const total = 12 + 8 + jsonLen + (binLen ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.fill(0x20, 20, 20 + jsonLen);
  out.set(jsonBytes, 20);
  if (binLen) {
    view.setUint32(20 + jsonLen, binLen, true);
    view.setUint32(24 + jsonLen, CHUNK_BIN, true);
    out.set(glb.bin, 28 + jsonLen);
  }
  return out;
}

export function writeGlb(file: string, glb: Glb): void {
  fs.writeFileSync(file, encodeGlb(glb));
}

/* ------------------------------------------------------------- matrices */

/** Column-major 4x4. */
export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = Array.from({ length: 16 }, () => 0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

export function nodeMatrix(node: GltfJson): Mat4 {
  if (node.matrix) return node.matrix as Mat4;
  const [x, y, z, w] = (node.rotation ?? [0, 0, 0, 1]) as number[] as [number, number, number, number];
  const [sx, sy, sz] = (node.scale ?? [1, 1, 1]) as number[] as [number, number, number];
  const [tx, ty, tz] = (node.translation ?? [0, 0, 0]) as number[] as [number, number, number];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

export function yawMatrix(deg: number): Mat4 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

export function determinant3(m: Mat4): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
    m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
    m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!)
  );
}

/** Transforms a normal by the inverse transpose of the upper 3x3 and normalises it. */
export function transformNormal(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  const a = m[0]!, b = m[4]!, c = m[8]!;
  const d = m[1]!, e = m[5]!, f = m[9]!;
  const g = m[2]!, h = m[6]!, i = m[10]!;
  // Cofactor matrix (= det * inverse transpose).
  const nx = (e * i - f * h) * x + (f * g - d * i) * y + (d * h - e * g) * z;
  const ny = (c * h - b * i) * x + (a * i - c * g) * y + (b * g - a * h) * z;
  const nz = (b * f - c * e) * x + (c * d - a * f) * y + (a * e - b * d) * z;
  const sign = determinant3(m) < 0 ? -1 : 1;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [(sign * nx) / l, (sign * ny) / l, (sign * nz) / l];
}

/* ------------------------------------------------------------ accessors */

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Reads an accessor into a flat number array (no sparse accessors). */
export function readAccessor(glb: Glb, index: number): { data: number[]; size: number; count: number } {
  const acc = glb.json.accessors[index];
  if (acc.sparse) throw new Error('Sparse accessors are not supported');
  const size = COMPONENTS[acc.type as string];
  if (!size) throw new Error(`Unsupported accessor type ${acc.type}`);
  const bv = glb.json.bufferViews[acc.bufferView];
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const ct = acc.componentType as number;
  const bytes = ct === 5126 || ct === 5125 ? 4 : ct === 5123 || ct === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? bytes * size;
  const count = acc.count as number;
  const data = Array.from({ length: count * size }, () => 0);
  for (let i = 0; i < count; i++)
    for (let k = 0; k < size; k++) {
      const o = base + i * stride + k * bytes;
      data[i * size + k] =
        ct === 5126
          ? view.getFloat32(o, true)
          : ct === 5125
            ? view.getUint32(o, true)
            : ct === 5123
              ? view.getUint16(o, true)
              : ct === 5122
                ? view.getInt16(o, true)
                : ct === 5121
                  ? view.getUint8(o)
                  : view.getInt8(o);
    }
  return { data, size, count };
}

export interface MeshInstance {
  primitive: GltfJson;
  matrix: Mat4;
}

/** Every mesh primitive of the default scene with its world matrix. */
export function collectPrimitives(json: GltfJson): MeshInstance[] {
  const out: MeshInstance[] = [];
  const visit = (index: number, parent: Mat4) => {
    const node = json.nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) out.push({ primitive, matrix: world });
    for (const child of node.children ?? []) visit(child as number, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root as number, IDENTITY);
  return out;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export const boundsSize = (b: Bounds): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

/** Exact bounds of the default scene from vertex data, optionally after an extra transform. */
export function glbBounds(glb: Glb, extra: Mat4 = IDENTITY): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const { primitive, matrix } of collectPrimitives(glb.json)) {
    const m = multiply(extra, matrix);
    const pos = readAccessor(glb, primitive.attributes.POSITION);
    for (let i = 0; i < pos.count; i++) {
      const p = transformPoint(m, pos.data[i * 3]!, pos.data[i * 3 + 1]!, pos.data[i * 3 + 2]!);
      for (let k = 0; k < 3; k++) {
        if (p[k]! < min[k]!) min[k] = p[k]!;
        if (p[k]! > max[k]!) max[k] = p[k]!;
      }
    }
  }
  return { min, max };
}

export function triangleCount(glb: Glb): number {
  let n = 0;
  for (const { primitive } of collectPrimitives(glb.json)) {
    const acc = glb.json.accessors[primitive.indices ?? primitive.attributes.POSITION];
    n += (acc.count as number) / 3;
  }
  return n;
}
