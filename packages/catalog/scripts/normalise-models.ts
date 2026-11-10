/**
 * Cuts the catalog's GLB models out of the CC0 source packs.
 *
 *   pnpm --filter @interio/catalog models -- --pack kenney-furniture-kit=<extracted archive>
 *
 * For every entry of `src/models.ts` the source GLB is flattened into a single
 * mesh (one primitive per material) and baked to the catalog conventions:
 * metres, bottom-centre origin, front +Z, bounding box equal to `dims`,
 * materials from `src/palette.ts`. Texture coordinates are dropped (the kits are
 * flat coloured) and identical vertices are welded. Nothing but the listed
 * models is written, and stale files are removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, PACKS, type ModelSpec, type PackId } from '../src/models';
import { KENNEY_MATERIALS, PALETTE, hexToLinear, type MaterialSpec, type PaletteKey } from '../src/palette';
import { MODELS_DIR } from './lib/paths';
import {
  boundsSize,
  collectPrimitives,
  determinant3,
  glbBounds,
  multiply,
  readAccessor,
  readGlb,
  transformNormal,
  transformPoint,
  writeGlb,
  yawMatrix,
  type GltfJson,
  type Mat4,
} from './lib/glb';

const PACK_GLB_DIRS: Record<PackId, string[]> = {
  'kenney-furniture-kit': ['Models/GLTF format', '.'],
};

const SOURCE_MATERIALS: Record<PackId, Record<string, PaletteKey>> = {
  'kenney-furniture-kit': KENNEY_MATERIALS,
};

function parseArgs(): Record<PackId, string> {
  const out: Partial<Record<PackId, string>> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--pack') continue;
    const [id, dir] = (args[++i] ?? '').split('=');
    if (!id || !dir || !(id in PACKS)) throw new Error(`--pack expects <pack id>=<dir>, pack ids: ${Object.keys(PACKS).join(', ')}`);
    const base = path.resolve(dir);
    const found = PACK_GLB_DIRS[id as PackId].map((sub) => path.join(base, sub)).find((p) => fs.existsSync(p) && fs.readdirSync(p).some((f) => f.endsWith('.glb')));
    if (!found) throw new Error(`No GLB files found for ${id} under ${base}`);
    out[id as PackId] = found;
  }
  for (const id of Object.keys(PACKS) as PackId[]) if (!out[id]) throw new Error(`Missing --pack ${id}=<dir> (download it from ${PACKS[id].url})`);
  return out as Record<PackId, string>;
}

interface Group {
  positions: number[];
  normals: number[];
  indices: number[];
  lookup: Map<string, number>;
}

function gltfMaterial(name: string, spec: MaterialSpec): GltfJson {
  const [r, g, b] = hexToLinear(spec.color);
  const blend = spec.opacity !== undefined && spec.opacity < 1;
  const out: GltfJson = {
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [r, g, b, spec.opacity ?? 1].map((v) => Number(v.toFixed(5))),
      metallicFactor: spec.metalness,
      roughnessFactor: spec.roughness,
    },
  };
  if (blend) {
    out.alphaMode = 'BLEND';
    out.doubleSided = true;
  }
  if (spec.emissive) out.emissiveFactor = hexToLinear(spec.emissive).map((v) => Number((v * (spec.emissiveIntensity ?? 1)).toFixed(5)));
  return out;
}

function normalise(id: string, spec: ModelSpec, sourceDir: string): { bytes: number; stretch: number; triangles: number } {
  const src = readGlb(path.join(sourceDir, `${spec.source}.glb`));
  const yaw = yawMatrix(spec.sourceYawDeg ?? 0);
  const bounds = glbBounds(src, yaw);
  const size = boundsSize(bounds);
  const target = [spec.dims.w / 1000, spec.dims.h / 1000, spec.dims.d / 1000] as const;
  const s = target.map((t, i) => t / size[i]!) as [number, number, number];
  const fit: Mat4 = [
    s[0], 0, 0, 0,
    0, s[1], 0, 0,
    0, 0, s[2], 0,
    -((bounds.min[0] + bounds.max[0]) / 2) * s[0], -bounds.min[1] * s[1], -((bounds.min[2] + bounds.max[2]) / 2) * s[2], 1,
  ];
  const base = multiply(fit, yaw);

  const defaults = SOURCE_MATERIALS[spec.pack];
  const groups = new Map<PaletteKey, Group>();
  let triangles = 0;
  for (const { primitive, matrix } of collectPrimitives(src.json)) {
    if ((primitive.mode ?? 4) !== 4) throw new Error(`${id}: only triangle lists are supported`);
    const sourceName = (src.json.materials?.[primitive.material]?.name as string | undefined) ?? '_defaultMat';
    const key = spec.materials?.[sourceName] ?? defaults[sourceName];
    if (!key) throw new Error(`${id}: no palette mapping for source material "${sourceName}"`);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { positions: [], normals: [], indices: [], lookup: new Map() }));

    const m = multiply(base, matrix);
    const flip = determinant3(m) < 0;
    const pos = readAccessor(src, primitive.attributes.POSITION);
    const nor = primitive.attributes.NORMAL !== undefined ? readAccessor(src, primitive.attributes.NORMAL) : null;
    const idx = primitive.indices !== undefined ? readAccessor(src, primitive.indices).data : Array.from({ length: pos.count }, (_, i) => i);
    const remap = Array.from({ length: pos.count }, () => -1);
    const vertex = (i: number, faceNormal: [number, number, number] | null): number => {
      if (!faceNormal && remap[i]! >= 0) return remap[i]!;
      const p = transformPoint(m, pos.data[i * 3]!, pos.data[i * 3 + 1]!, pos.data[i * 3 + 2]!);
      const n = faceNormal ?? transformNormal(m, nor!.data[i * 3]!, nor!.data[i * 3 + 1]!, nor!.data[i * 3 + 2]!);
      const hash = `${p.map((v) => Math.round(v * 1e5)).join(',')}|${n.map((v) => Math.round(v * 1e3)).join(',')}`;
      let out = group.lookup.get(hash);
      if (out === undefined) {
        out = group.positions.length / 3;
        group.positions.push(...p);
        group.normals.push(...n);
        group.lookup.set(hash, out);
      }
      if (!faceNormal) remap[i] = out;
      return out;
    };
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const tri = flip ? [idx[t]!, idx[t + 2]!, idx[t + 1]!] : [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      let face: [number, number, number] | null = null;
      if (!nor) {
        const corner = (i: number) => transformPoint(m, pos.data[i * 3]!, pos.data[i * 3 + 1]!, pos.data[i * 3 + 2]!);
        const a = corner(tri[0]!);
        const b = corner(tri[1]!);
        const c = corner(tri[2]!);
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
        face = [n[0]! / l, n[1]! / l, n[2]! / l];
      }
      const out = tri.map((i) => vertex(i, face));
      if (out[0] === out[1] || out[1] === out[2] || out[0] === out[2]) continue; // collapsed by welding
      group.indices.push(...(out as [number, number, number]));
      triangles++;
    }
  }

  // Pack: opaque materials first so blended ones draw last.
  const ordered = [...groups.entries()].filter(([, g]) => g.indices.length > 0);
  ordered.sort(([a], [b]) => Number(((PALETTE[a] as MaterialSpec).opacity ?? 1) < 1) - Number(((PALETTE[b] as MaterialSpec).opacity ?? 1) < 1));
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const json: GltfJson = {
    asset: {
      version: '2.0',
      generator: 'interio catalog normalise-models',
      copyright: `${PACKS[spec.pack].licence} ${PACKS[spec.pack].author}, ${PACKS[spec.pack].name} ${PACKS[spec.pack].version} (${spec.source})`,
    },
    scene: 0,
    scenes: [{ name: id, nodes: [0] }],
    nodes: [{ name: id, mesh: 0 }],
    meshes: [{ name: id, primitives: [] }],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const push = (data: Float32Array | Uint16Array | Uint32Array, target: number): number => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
    padded.set(bytes);
    chunks.push(padded);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += padded.byteLength;
    return json.bufferViews.length - 1;
  };
  for (const [key, g] of ordered) {
    const count = g.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const positions = new Float32Array(g.positions);
    for (let i = 0; i < count; i++)
      for (let c = 0; c < 3; c++) {
        const v = positions[i * 3 + c]!;
        if (v < min[c]!) min[c] = v;
        if (v > max[c]!) max[c] = v;
      }
    const posView = push(positions, 34962);
    json.accessors.push({ bufferView: posView, componentType: 5126, count, type: 'VEC3', min, max });
    const norView = push(new Float32Array(g.normals), 34962);
    json.accessors.push({ bufferView: norView, componentType: 5126, count, type: 'VEC3' });
    const wide = count > 65535;
    const idxView = push(wide ? new Uint32Array(g.indices) : new Uint16Array(g.indices), 34963);
    json.accessors.push({ bufferView: idxView, componentType: wide ? 5125 : 5123, count: g.indices.length, type: 'SCALAR' });
    json.materials.push(gltfMaterial(key, PALETTE[key]));
    json.meshes[0].primitives.push({
      attributes: { POSITION: json.accessors.length - 3, NORMAL: json.accessors.length - 2 },
      indices: json.accessors.length - 1,
      material: json.materials.length - 1,
    });
  }
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) {
    bin.set(c, at);
    at += c.byteLength;
  }
  json.buffers.push({ byteLength: bin.byteLength });
  const file = path.join(MODELS_DIR, `${id}.glb`);
  writeGlb(file, { json, bin });
  return { bytes: fs.statSync(file).size, stretch: Math.max(...s) / Math.min(...s), triangles };
}

const packs = parseArgs();
fs.mkdirSync(MODELS_DIR, { recursive: true });
const wanted = new Set(Object.keys(MODELS).map((id) => `${id}.glb`));
for (const f of fs.readdirSync(MODELS_DIR)) if (f.endsWith('.glb') && !wanted.has(f)) fs.rmSync(path.join(MODELS_DIR, f));

let total = 0;
const rows: string[] = [];
for (const [id, spec] of Object.entries(MODELS) as [string, ModelSpec][]) {
  const r = normalise(id, spec, packs[spec.pack]);
  total += r.bytes;
  rows.push(`${id.padEnd(28)} ${spec.source.padEnd(28)} ${String(r.triangles).padStart(5)} tris ${(r.bytes / 1024).toFixed(1).padStart(6)} KB  stretch ${r.stretch.toFixed(2)}${r.stretch > 1.5 ? '  <-- check' : ''}`);
}
console.log(rows.join('\n'));
console.log(`\n${rows.length} models, ${(total / 1024 / 1024).toFixed(2)} MB in ${path.relative(process.cwd(), MODELS_DIR)}`);
