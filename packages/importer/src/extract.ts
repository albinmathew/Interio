/**
 * Stage 1: pull vector geometry out of a PDF page.
 *
 * Output is in the PAGE FRAME: PDF user-space units, x right, y UP, origin at
 * the lower-left corner of the page as displayed (rotation and crop applied).
 * Every segment keeps its optional-content layer, stroked line width and the
 * id of the path it came from.
 */
import { loadPdfjs, type PdfjsModule } from './pdfjs';
import { ImportError } from './errors';

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Index into `Extracted.layers`. */
  layer: number;
  /** Stroke width in page units. 0 for fill-only paths. */
  width: number;
  /** Index into `Extracted.paths`. */
  path: number;
}

/** A cubic Bezier piece (CAD arcs arrive as one to four of these). */
export interface Curve {
  p: [number, number, number, number, number, number, number, number];
  layer: number;
  width: number;
  path: number;
}

export interface PathInfo {
  layer: number;
  width: number;
  closed: boolean;
  stroked: boolean;
  filled: boolean;
  /** Number of line segments and curve pieces in the path. */
  lines: number;
  curves: number;
}

export interface TextRun {
  str: string;
  x: number;
  y: number;
  height: number;
}

export interface Extracted {
  /** Displayed page size in PDF units. */
  width: number;
  height: number;
  /** Layer names; index 0 is always '' (content outside any optional-content group). */
  layers: string[];
  segs: Seg[];
  curves: Curve[];
  paths: PathInfo[];
  texts: TextRun[];
  pageCount: number;
  /** Maps the page frame back to PDF user space. Identity for an unrotated page at the origin. */
  userFromPage?: [number, number, number, number, number, number];
}

type M = [number, number, number, number, number, number];

const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** DrawOPS codes used inside pdf.js `constructPath` buffers. */
const D_MOVE = 0;
const D_LINE = 1;
const D_CURVE = 2;
const D_QUAD = 3;
const D_CLOSE = 4;

/** Above this many path pieces the page is clearly not a single floor plan; stop collecting. */
const MAX_PIECES = 600_000;

export async function openPdf(data: ArrayBuffer): Promise<{ pdfjs: PdfjsModule; doc: any }> {
  const head = new Uint8Array(data, 0, Math.min(1024, data.byteLength));
  let isPdf = false;
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) {
      isPdf = true;
      break;
    }
  }
  if (!isPdf) throw new ImportError('This file is not a PDF', 'not-a-pdf');
  const pdfjs = await loadPdfjs();
  try {
    // pdf.js transfers the buffer to its worker: hand it a copy so callers can reuse theirs.
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), verbosity: 0 }).promise;
    return { pdfjs, doc };
  } catch (e) {
    throw new ImportError(`The PDF could not be read: ${e instanceof Error ? e.message : String(e)}`, 'failed');
  }
}

export async function extractPage(data: ArrayBuffer, pageNo = 1): Promise<Extracted> {
  const { pdfjs, doc } = await openPdf(data);
  try {
    const pageCount: number = doc.numPages;
    const page = await doc.getPage(Math.max(1, Math.min(pageCount, pageNo)));
    const viewport = page.getViewport({ scale: 1 });
    const W: number = viewport.width;
    const H: number = viewport.height;
    // Viewport maps user space to x right / y down. Flip to y up.
    const vt = viewport.transform as M;
    const base: M = [vt[0], -vt[1], vt[2], -vt[3], vt[4], H - vt[5]];

    const OPS = pdfjs.OPS;
    const opList = await page.getOperatorList();
    let ocConfig: any = null;
    try {
      ocConfig = await doc.getOptionalContentConfig();
    } catch {
      ocConfig = null;
    }

    const layers: string[] = [''];
    const layerIndex = new Map<string, number>([['', 0]]);
    const layerOf = (name: string): number => {
      let i = layerIndex.get(name);
      if (i === undefined) {
        i = layers.length;
        layers.push(name);
        layerIndex.set(name, i);
      }
      return i;
    };
    const groupName = (props: any): string | null => {
      if (!props || typeof props !== 'object') return null;
      const id = props.type === 'OCG' ? props.id : Array.isArray(props.ids) ? props.ids[0] : props.id;
      if (!id) return null;
      const g = ocConfig?.getGroup?.(id);
      return typeof g?.name === 'string' ? g.name : String(id);
    };

    const segs: Seg[] = [];
    const curves: Curve[] = [];
    const paths: PathInfo[] = [];

    let ctm: M = base;
    let lineWidth = 1;
    const stack: { ctm: M; lineWidth: number }[] = [];
    /** One entry per open marked-content sequence: the layer it switches to, or -1 to inherit. */
    const marked: number[] = [];
    let layer = 0;
    let pieces = 0;

    const fn = opList.fnArray as number[];
    const args = opList.argsArray as any[];
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i];
      const a = args[i];
      switch (op) {
        case OPS.save:
          stack.push({ ctm, lineWidth });
          break;
        case OPS.restore: {
          const s = stack.pop();
          if (s) {
            ctm = s.ctm;
            lineWidth = s.lineWidth;
          }
          break;
        }
        case OPS.transform:
          ctm = mul(ctm, [a[0], a[1], a[2], a[3], a[4], a[5]]);
          break;
        case OPS.setLineWidth:
          lineWidth = a[0];
          break;
        case OPS.paintFormXObjectBegin: {
          stack.push({ ctm, lineWidth });
          const m = a?.[0];
          if (m && m.length >= 6) ctm = mul(ctm, [m[0], m[1], m[2], m[3], m[4], m[5]]);
          break;
        }
        case OPS.paintFormXObjectEnd: {
          const s = stack.pop();
          if (s) {
            ctm = s.ctm;
            lineWidth = s.lineWidth;
          }
          break;
        }
        case OPS.beginMarkedContent:
          marked.push(-1);
          break;
        case OPS.beginMarkedContentProps: {
          const name = a?.[0] === 'OC' ? groupName(a[1]) : null;
          if (name === null) marked.push(-1);
          else {
            marked.push(layer);
            layer = layerOf(name);
          }
          break;
        }
        case OPS.endMarkedContent: {
          const prev = marked.pop();
          if (prev !== undefined && prev >= 0) layer = prev;
          break;
        }
        case OPS.constructPath: {
          const paint: number = a[0];
          const buf: Float32Array | null = a[1]?.[0] ?? null;
          if (!buf || paint === OPS.endPath) break;
          if (pieces > MAX_PIECES) break;
          const stroked =
            paint === OPS.stroke ||
            paint === OPS.closeStroke ||
            paint === OPS.fillStroke ||
            paint === OPS.eoFillStroke ||
            paint === OPS.closeFillStroke ||
            paint === OPS.closeEOFillStroke;
          const filled = paint !== OPS.stroke && paint !== OPS.closeStroke;
          const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
          const width = stroked ? lineWidth * scale : 0;
          const [ma, mb, mc, md, me, mf] = ctm;
          const tx = (x: number, y: number) => ma * x + mc * y + me;
          const ty = (x: number, y: number) => mb * x + md * y + mf;

          let info: PathInfo | null = null;
          let pathId = -1;
          const begin = () => {
            info = { layer, width, closed: false, stroked, filled, lines: 0, curves: 0 };
            pathId = paths.length;
            paths.push(info);
          };
          let sx = 0;
          let sy = 0;
          let cx = 0;
          let cy = 0;
          let open = false;
          const line = (x: number, y: number) => {
            if (!info) begin();
            if (Math.abs(x - cx) > 1e-4 || Math.abs(y - cy) > 1e-4) {
              segs.push({ x1: cx, y1: cy, x2: x, y2: y, layer, width, path: pathId });
              info!.lines++;
              pieces++;
            }
            cx = x;
            cy = y;
          };
          for (let k = 0; k < buf.length; ) {
            const code = buf[k++];
            if (code === D_MOVE) {
              // A filled subpath is implicitly closed.
              if (open && filled && !stroked) line(sx, sy);
              const x = buf[k++]!;
              const y = buf[k++]!;
              sx = cx = tx(x, y);
              sy = cy = ty(x, y);
              info = null;
              open = true;
            } else if (code === D_LINE) {
              const x = buf[k++]!;
              const y = buf[k++]!;
              line(tx(x, y), ty(x, y));
            } else if (code === D_CURVE || code === D_QUAD) {
              let x1: number, y1: number, x2: number, y2: number, x3: number, y3: number;
              if (code === D_CURVE) {
                x1 = buf[k++]!;
                y1 = buf[k++]!;
                x2 = buf[k++]!;
                y2 = buf[k++]!;
                x3 = buf[k++]!;
                y3 = buf[k++]!;
              } else {
                const qx = buf[k++]!;
                const qy = buf[k++]!;
                x3 = buf[k++]!;
                y3 = buf[k++]!;
                x1 = qx;
                y1 = qy;
                x2 = qx;
                y2 = qy;
              }
              if (!info) begin();
              const ex = tx(x3, y3);
              const ey = ty(x3, y3);
              curves.push({
                p: [cx, cy, tx(x1, y1), ty(x1, y1), tx(x2, y2), ty(x2, y2), ex, ey],
                layer,
                width,
                path: pathId,
              });
              info!.curves++;
              pieces++;
              cx = ex;
              cy = ey;
            } else if (code === D_CLOSE) {
              if (open) {
                line(sx, sy);
                if (info) (info as PathInfo).closed = true;
              }
            } else {
              break; // unknown op: the rest of the buffer cannot be trusted
            }
          }
          if (open && filled && !stroked) line(sx, sy);
          break;
        }
        default:
          break;
      }
    }

    const texts: TextRun[] = [];
    try {
      const tc = await page.getTextContent();
      for (const item of tc.items as any[]) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const t = item.transform as M;
        const m = mul(base, t);
        texts.push({ str: item.str, x: m[4], y: m[5], height: Math.hypot(m[2], m[3]) });
      }
    } catch {
      /* text is optional */
    }

    const det = base[0] * base[3] - base[1] * base[2];
    const userFromPage: M = [
      base[3] / det,
      -base[1] / det,
      -base[2] / det,
      base[0] / det,
      (base[2] * base[5] - base[3] * base[4]) / det,
      (base[1] * base[4] - base[0] * base[5]) / det,
    ];
    return { width: W, height: H, layers, segs, curves, paths, texts, pageCount, userFromPage };
  } finally {
    await doc.destroy?.();
  }
}
