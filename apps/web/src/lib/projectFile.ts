/**
 * The portable project file (`.interio`): one file that carries a project and
 * its assets (vector underlay, page image, source PDF), so it opens in another
 * browser with everything intact.
 *
 * Layout, after gunzip:
 *
 *   "INTERIO\n" (8 bytes) | header length (uint32, little-endian) | header JSON (UTF-8) | chunks
 *
 * The header is `{ format, version, project, assets, chunks }`. Typed arrays,
 * array buffers and blobs anywhere inside `assets` are replaced by a reference
 * `{ "$interio:bin": index, as, ... }` into the chunk area, so binary data is
 * stored once, as bytes, never as base64 text. The whole container is gzipped:
 * the project JSON and the underlay coordinates shrink a lot, and data that is
 * already compressed (PNG, PDF) passes through at its own size.
 *
 * Files written before this format were the bare project JSON; `decodeProjectFile`
 * still reads those.
 */

export const PROJECT_FILE_EXTENSION = '.interio';
export const PROJECT_FILE_FORMAT = 'interio-project';
export const PROJECT_FILE_VERSION = 1;

const MAGIC = [0x49, 0x4e, 0x54, 0x45, 0x52, 0x49, 0x4f, 0x0a]; // "INTERIO\n"
const REF = '$interio:bin';

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
} as const;
type TypedArrayName = keyof typeof TYPED_ARRAYS;
type TypedArray = InstanceType<(typeof TYPED_ARRAYS)[TypedArrayName]>;

interface BinRef {
  [REF]: number;
  as: TypedArrayName | 'ArrayBuffer' | 'Blob' | 'File';
  /** Blob and File: MIME type. */
  type?: string;
  /** File only. */
  name?: string;
  lastModified?: number;
}

export interface ProjectFileContents {
  /** The project as stored: run it through `migrate` before use. */
  project: unknown;
  /** Asset name -> value, with typed arrays and blobs restored. Empty for files without assets. */
  assets: Record<string, unknown>;
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const typedArrayName = (v: unknown): TypedArrayName | null => {
  if (!ArrayBuffer.isView(v)) return null;
  for (const name of Object.keys(TYPED_ARRAYS) as TypedArrayName[]) {
    // Compare by constructor name too, so arrays from another realm (an iframe, a worker) still match.
    if (v instanceof TYPED_ARRAYS[name] || v.constructor?.name === name) return name;
  }
  return null;
};

const bytesOf = (view: ArrayBufferView): Uint8Array => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

/**
 * Replaces every typed array, array buffer and blob in a JSON-like value with a
 * reference, collecting their bytes in `chunks`. Everything else must be JSON.
 */
export async function packValue(value: unknown, chunks: Uint8Array[]): Promise<unknown> {
  if (value === null || typeof value !== 'object') return value;
  const push = (bytes: Uint8Array, ref: Omit<BinRef, typeof REF>): BinRef => {
    chunks.push(bytes);
    return { [REF]: chunks.length - 1, ...ref };
  };
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (typeof File !== 'undefined' && value instanceof File) return push(bytes, { as: 'File', type: value.type, name: value.name, lastModified: value.lastModified });
    return push(bytes, { as: 'Blob', type: value.type });
  }
  if (value instanceof ArrayBuffer) return push(new Uint8Array(value), { as: 'ArrayBuffer' });
  const typed = typedArrayName(value);
  if (typed) return push(bytesOf(value as TypedArray), { as: typed });
  if (ArrayBuffer.isView(value)) return push(bytesOf(value), { as: 'Uint8Array' });
  if (Array.isArray(value)) return Promise.all(value.map((v) => packValue(v, chunks)));
  if (!isPlainObject(value)) throw new ProjectFileError(`Cannot store a ${value.constructor?.name ?? 'value'} in a project file`);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = await packValue(v, chunks);
  }
  return out;
}

const isRef = (v: unknown): v is BinRef => isPlainObject(v) && typeof v[REF] === 'number' && typeof v.as === 'string';

/** The inverse of `packValue`. */
export function unpackValue(value: unknown, chunks: Uint8Array[]): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => unpackValue(v, chunks));
  if (isRef(value)) {
    const chunk = chunks[value[REF]];
    if (!chunk) throw new ProjectFileError('This project file is damaged: a part of it is missing.');
    // A fresh, aligned buffer: the chunk sits at an arbitrary offset inside the file.
    const buffer = chunk.slice().buffer;
    if (value.as === 'ArrayBuffer') return buffer;
    if (value.as === 'Blob') return new Blob([buffer], { type: value.type ?? '' });
    if (value.as === 'File') {
      if (typeof File === 'undefined') return new Blob([buffer], { type: value.type ?? '' });
      return new File([buffer], value.name ?? 'file', { type: value.type ?? '', lastModified: value.lastModified });
    }
    const ctor = TYPED_ARRAYS[value.as];
    if (!ctor) throw new ProjectFileError(`This project file holds data this version cannot read (${String(value.as)}).`);
    if (buffer.byteLength % ctor.BYTES_PER_ELEMENT !== 0) throw new ProjectFileError('This project file is damaged: a part of it has the wrong size.');
    return new ctor(buffer);
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = unpackValue(v, chunks);
  return out;
}

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const gzip = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream('gzip'));
const gunzip = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new DecompressionStream('gzip'));

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean => bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);

/** Builds the bytes of a project file. `project` must be plain JSON; `assets` may hold typed arrays and blobs. */
export async function encodeProjectFile(contents: { project: unknown; assets?: Record<string, unknown> }): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const assets = (await packValue(contents.assets ?? {}, chunks)) as Record<string, unknown>;
  let offset = 0;
  const table = chunks.map((c) => {
    const entry = { offset, length: c.byteLength };
    offset += c.byteLength;
    return entry;
  });
  const header = new TextEncoder().encode(
    JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, project: contents.project, assets, chunks: table }),
  );
  const out = new Uint8Array(MAGIC.length + 4 + header.byteLength + offset);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, header.byteLength, true);
  out.set(header, MAGIC.length + 4);
  let at = MAGIC.length + 4 + header.byteLength;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return gzip(out);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProjectFileError('This is not an Interio project file.');
  }
}

/** Reads a project file: the current container, or the bare project JSON older versions exported. */
export async function decodeProjectFile(data: ArrayBuffer | Uint8Array): Promise<ProjectFileContents> {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) throw new ProjectFileError('This file is empty.');
  if (startsWith(bytes, [0x1f, 0x8b])) {
    try {
      bytes = await gunzip(bytes);
    } catch {
      throw new ProjectFileError('This project file is damaged and could not be opened.');
    }
  }
  if (!startsWith(bytes, MAGIC)) {
    // Bare project JSON (the format before assets travelled with the project).
    const json = parseJson(new TextDecoder().decode(bytes));
    if (isPlainObject(json) && json.format === PROJECT_FILE_FORMAT && 'project' in json) return { project: json.project, assets: {} };
    return { project: json, assets: {} };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerStart = MAGIC.length + 4;
  if (bytes.byteLength < headerStart) throw new ProjectFileError('This project file is damaged and could not be opened.');
  const headerLength = view.getUint32(MAGIC.length, true);
  const body = headerStart + headerLength;
  if (body > bytes.byteLength) throw new ProjectFileError('This project file is damaged: it ends too early.');
  const header = parseJson(new TextDecoder().decode(bytes.subarray(headerStart, body)));
  if (!isPlainObject(header) || header.format !== PROJECT_FILE_FORMAT) throw new ProjectFileError('This is not an Interio project file.');
  if (typeof header.version !== 'number' || header.version > PROJECT_FILE_VERSION)
    throw new ProjectFileError('This project file was made by a newer version of Interio. Update Interio to open it.');
  const table = Array.isArray(header.chunks) ? (header.chunks as { offset: number; length: number }[]) : [];
  const chunks = table.map((entry) => {
    const start = body + entry.offset;
    const end = start + entry.length;
    if (!Number.isInteger(entry.offset) || !Number.isInteger(entry.length) || entry.offset < 0 || entry.length < 0 || end > bytes.byteLength)
      throw new ProjectFileError('This project file is damaged: it ends too early.');
    return bytes.subarray(start, end);
  });
  const assets = unpackValue(header.assets ?? {}, chunks);
  return { project: header.project, assets: isPlainObject(assets) ? assets : {} };
}
