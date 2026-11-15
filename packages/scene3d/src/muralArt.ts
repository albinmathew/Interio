/**
 * Built-in mural art, painted in code on a canvas: original pictures, no image files.
 *
 * The look is watercolour: every shape is a stack of many nearly transparent layers of a
 * jittered polygon, multiplied onto warm paper, so edges stay soft and pigment pools where
 * layers overlap; small details (blossom, wool, flowers) are dabbed on the same way and the
 * paper grain goes over everything. Seeded, so a mural looks the same every time it is
 * painted, at any size: sizes are in units of the canvas height, positions in shares of
 * its width, so a wider wall gets more meadow rather than a stretched one.
 */

type Ctx = CanvasRenderingContext2D;
/** A point; `k` scales how much the edges next to it may wander (0 keeps them straight). */
type Pt = { x: number; y: number; k?: number };

/** Small fast seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Painter {
  ctx: Ctx;
  w: number;
  h: number;
  r: () => number;
  /** Normal-ish random number (mean 0, sd about 1). */
  g: () => number;
  /** Uniform in [a, b). */
  u: (a: number, b: number) => number;
  pick: <T>(list: readonly T[]) => T;
}

function painter(ctx: Ctx, w: number, h: number, seed: number): Painter {
  const r = rng(seed);
  return {
    ctx,
    w,
    h,
    r,
    g: () => (r() + r() + r() + r() - 2) * 1.7,
    u: (a, b) => a + (b - a) * r(),
    pick: (list) => list[Math.floor(r() * list.length)]!,
  };
}

/* ------------------------------------------------------------------ washes */

interface VPt extends Pt {
  /** How far this stretch of edge wanders when deformed. */
  v: number;
}

/** Midpoint displacement: each pass splits every edge and pushes the new point off the line. */
function deform(p: Painter, poly: readonly VPt[], passes: number): VPt[] {
  let pts = poly.slice();
  for (let k = 0; k < passes; k++) {
    const next: VPt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      next.push(a);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const v = (a.v + b.v) / 2;
      next.push({ x: (a.x + b.x) / 2 + p.g() * len * v * 0.5, y: (a.y + b.y) / 2 + p.g() * len * v * 0.5, v: v * p.u(0.75, 1.1) });
    }
    pts = next;
  }
  return pts;
}

function fillPoly(ctx: Ctx, pts: readonly Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fill();
}

interface WashOptions {
  layers?: number;
  alpha?: number;
  /** How ragged the edge is. */
  spread?: number;
  /** Pigment that pools along the edge, as on wet paper. */
  edge?: number;
  mode?: GlobalCompositeOperation;
}

/** A watercolour wash over a polygon: many faint, differently jittered layers. */
function wash(p: Painter, poly: readonly Pt[], color: string, o: WashOptions = {}): void {
  const { ctx } = p;
  const spread = o.spread ?? 0.4;
  const base = deform(
    p,
    poly.map((q) => ({ x: q.x, y: q.y, v: spread * p.u(0.4, 1.3) * (q.k ?? 1) })),
    3,
  );
  const layers = o.layers ?? 18;
  ctx.save();
  ctx.globalCompositeOperation = o.mode ?? 'multiply';
  ctx.fillStyle = color;
  ctx.globalAlpha = o.alpha ?? 0.05;
  for (let i = 0; i < layers; i++) fillPoly(ctx, deform(p, base, 2 + (i % 2)));
  if (o.edge) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = o.edge;
    ctx.lineWidth = Math.max(1, p.h * 0.0012);
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const pts = deform(p, base, 2);
      ctx.beginPath();
      pts.forEach((q, j) => (j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A roughly round polygon: the starting shape of a canopy, a cloud, a lamb's fleece. */
function blobShape(p: Painter, cx: number, cy: number, rx: number, ry: number, n = 9): Pt[] {
  const out: Pt[] = [];
  const turn = p.u(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2;
    const k = p.u(0.85, 1.12);
    out.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return out;
}

/** A band from a ridge line down to `bottom`: hills, the meadow. */
function band(p: Painter, ridge: (x: number) => number, bottom: number, x0 = -0.25, x1 = 1.25, steps = 20): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (x0 + ((x1 - x0) * i) / steps) * p.w;
    pts.push({ x, y: ridge(x / p.w) * p.h });
  }
  // The sides and bottom lie off the canvas and stay straight, so the band never lifts off the bottom edge.
  pts.push({ x: x1 * p.w, y: bottom * p.h, k: 0 }, { x: x0 * p.w, y: bottom * p.h, k: 0 });
  pts[pts.length - 3]!.k = 0.3;
  pts[0]!.k = 0.3;
  return pts;
}

/** A soft round dab of colour, as from the tip of a brush. */
function dab(p: Painter, x: number, y: number, radius: number, color: string, alpha: number, mode: GlobalCompositeOperation = 'source-over'): void {
  const { ctx } = p;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  // Slightly oval and turned, never a perfect circle.
  ctx.ellipse(x, y, radius * p.u(0.8, 1.15), radius * p.u(0.7, 1), p.u(0, Math.PI), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ pieces */

const PINKS = ['#f6c9d3', '#f1b3c3', '#eba2b6', '#f8dbe2', '#fbe9ec', '#e48fa8'] as const;
const FLOWERS = ['#fffaf1', '#f6c4cf', '#f4de95', '#d8cce9', '#ffffff'] as const;

/** Paper, sky and the first warm glaze. */
function sky(p: Painter): void {
  const { ctx, w, h } = p;
  ctx.fillStyle = '#f8f3e8';
  ctx.fillRect(0, 0, w, h);
  // A pale blue sky that fades into a warm haze at the horizon.
  for (let i = 0; i < 5; i++) {
    const cx = p.u(-0.1, 1.1) * w;
    const cy = p.u(-0.08, 0.12) * h;
    wash(p, blobShape(p, cx, cy, p.u(0.25, 0.45) * h, p.u(0.08, 0.14) * h), p.pick(['#e6eff3', '#ebf2f3', '#e2ecf1']), { layers: 10, alpha: 0.03, spread: 0.6 });
  }
  for (let i = 0; i < 3; i++) {
    const cx = p.u(0, 1) * w;
    const cy = p.u(0.32, 0.46) * h;
    wash(p, blobShape(p, cx, cy, p.u(0.3, 0.5) * h, p.u(0.05, 0.09) * h), p.pick(['#f9ece8', '#f8f0e4', '#f8ebec']), { layers: 8, alpha: 0.03, spread: 0.6 });
  }
}

/** Far hills, the nearer rise and the meadow, back to front. */
/** The ridge lines of the land, as shares of the height for x a share of the width. */
interface Ridges {
  far: (x: number) => number;
  mid: (x: number) => number;
  near: (x: number) => number;
}

function ridges(p: Painter): Ridges {
  const wave = (a: number, f: number, ph: number) => (x: number) => a * Math.sin(x * f + ph);
  const ph = p.u(0, 6);
  const far = wave(0.025, 7, ph);
  const far2 = wave(0.012, 17, ph * 2);
  const mid = wave(0.02, 5, ph + 2);
  const near = wave(0.015, 4, ph + 4);
  return {
    far: (x) => 0.47 + far(x) + far2(x) - 0.04 * Math.exp(-(((x - 0.8) / 0.18) ** 2)),
    mid: (x) => 0.52 + mid(x) - 0.035 * Math.exp(-(((x - 0.22) / 0.2) ** 2)),
    near: (x) => 0.585 + near(x),
  };
}

/** Far hills, the nearer rise and the meadow, back to front. Every band runs off the bottom, so no edge crosses the grass. */
function land(p: Painter, r: Ridges): void {
  wash(p, band(p, r.far, 1.2), '#d3e1df', { alpha: 0.04, layers: 16, spread: 0.25, edge: 0.035 });
  wash(p, band(p, r.mid, 1.2), '#cce1c0', { alpha: 0.042, layers: 16, spread: 0.25, edge: 0.035 });
  wash(p, band(p, r.near, 1.2), '#e3ebc2', { alpha: 0.045, layers: 18, spread: 0.2, edge: 0.03 });
  // Warm sunlit patches and cooler shade in the grass.
  for (let i = 0; i < 9; i++) {
    const cx = p.u(0, 1) * p.w;
    const cy = p.u(0.66, 0.98) * p.h;
    wash(p, blobShape(p, cx, cy, p.u(0.15, 0.35) * p.h, p.u(0.03, 0.07) * p.h), p.pick(['#efe9bf', '#c9dba6', '#b9d199', '#ecedc4']), { layers: 10, alpha: 0.035, spread: 0.6 });
  }
  // Deeper green in the near corners frames the scene.
  for (const side of [0, 1]) {
    const cx = (side ? p.u(0.88, 1.02) : p.u(-0.02, 0.12)) * p.w;
    wash(p, blobShape(p, cx, 0.97 * p.h, 0.35 * p.h, 0.1 * p.h), '#adc793', { layers: 14, alpha: 0.035, spread: 0.5 });
  }
}

/** A small tree on the hills: a rounded canopy (blossom pink or green) on a thin trunk, or a fir. */
function smallTree(p: Painter, x: number, ground: number, size: number, kind: 'pink' | 'green' | 'fir'): void {
  const { ctx } = p;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#8f7766';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, ground);
  ctx.lineTo(x + p.g() * size * 0.03, ground - size * 0.75);
  ctx.stroke();
  ctx.restore();
  if (kind === 'fir') {
    const tri: Pt[] = [
      { x, y: ground - size * 1.7 },
      { x: x + size * 0.42, y: ground - size * 0.25 },
      { x: x - size * 0.42, y: ground - size * 0.25 },
    ];
    wash(p, tri, p.pick(['#8fae8c', '#9cb894']), { layers: 12, alpha: 0.09, spread: 0.25 });
    return;
  }
  const cy = ground - size * 1.05;
  const colors = kind === 'pink' ? ['#f2c3ce', '#eeb2c2', '#f6d3db'] : ['#a8c48c', '#9bbb84', '#b7cf98'];
  wash(p, blobShape(p, x, cy, size * 0.62, size * 0.55), colors[0]!, { layers: 12, alpha: 0.08, spread: 0.5 });
  for (let i = 0; i < 26; i++) {
    const a = p.u(0, Math.PI * 2);
    const d = Math.sqrt(p.r()) * size * 0.55;
    dab(p, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, size * p.u(0.07, 0.14), p.pick(colors), 0.35, 'multiply');
  }
  // Light from the upper left.
  for (let i = 0; i < 8; i++) dab(p, x - size * p.u(0.05, 0.35), cy - size * p.u(0.1, 0.4), size * p.u(0.05, 0.1), '#fffaf3', 0.35);
}

/** The trees along the far hills, and one blossoming tree on the right. */
function distantTrees(p: Painter, r: Ridges): void {
  const { w, h } = p;
  const groups: [number, number, number][] = [
    // x (share of width), how far down from the hill's ridge (share of height), size (share of height)
    [0.6, 0.012, 0.03],
    [0.64, 0.02, 0.026],
    [0.71, 0.01, 0.036],
    [0.75, 0.018, 0.03],
    [0.79, 0.012, 0.026],
    [0.95, 0.01, 0.04],
    [0.99, 0.016, 0.034],
    [0.3, 0.015, 0.026],
    [0.33, 0.022, 0.022],
    [0.45, 0.02, 0.018],
  ];
  for (const [x, d, s] of groups) smallTree(p, x * w + p.g() * 0.004 * w, (r.mid(x) + d) * h, s * h, p.pick(['pink', 'green', 'green', 'fir', 'green', 'pink'] as const));
  // A larger tree in blossom on the right bank, a quieter echo of the big one.
  const tx = 0.87 * w;
  const ground = (r.near(0.87) + 0.02) * h;
  const k = narrow(p);
  const tips = trunk(p, tx, ground, -Math.PI / 2 - 0.05, 0.12 * h * k, 0.012 * h * k, 3);
  const c = centre(tips);
  canopy(p, c.x, c.y + 0.01 * h * k, 0.12 * h * k, 0.09 * h * k, Math.round(1400 * k), tips);
}

/** 1 for a wide picture, less for a narrow one (a full-height wall), so the big pieces keep their room. */
function narrow(p: Painter): number {
  return Math.min(1, Math.max(0.55, p.w / (2.1 * p.h)));
}

function centre(pts: readonly Pt[]): Pt {
  const n = Math.max(1, pts.length);
  return { x: pts.reduce((a, q) => a + q.x, 0) / n, y: pts.reduce((a, q) => a + q.y, 0) / n };
}

/** Tapered branches; returns the tips, where the blossom goes. */
function trunk(p: Painter, x: number, y: number, angle: number, len: number, width: number, depth: number, tips: Pt[] = []): Pt[] {
  const { ctx } = p;
  const bend = p.g() * 0.18;
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;
  const mx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * len * bend;
  const my = (y + ey) / 2 + Math.sin(angle + Math.PI / 2) * len * bend;
  ctx.save();
  ctx.lineCap = 'round';
  // Body, then a shaded side and a lit side.
  const strokes: [string, number, number][] = [
    ['#8c6d5b', 0.9, 0],
    ['#6c5246', 0.45, width * 0.22],
    ['#b39584', 0.4, -width * 0.25],
  ];
  // Thin twigs fade into the blossom rather than drawing lines across it.
  const fade = Math.min(1, 0.35 + width / (p.h * 0.008));
  for (const [color, alpha, off] of strokes) {
    ctx.globalAlpha = alpha * fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * (off ? 0.4 : 1));
    const ox = Math.cos(angle + Math.PI / 2) * off;
    const oy = Math.sin(angle + Math.PI / 2) * off;
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy);
    ctx.quadraticCurveTo(mx + ox, my + oy, ex + ox, ey + oy);
    ctx.stroke();
  }
  ctx.restore();
  if (depth <= 0 || width < 1) {
    tips.push({ x: ex, y: ey });
    return tips;
  }
  const n = depth > 3 ? 2 : p.r() < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const spread = n === 2 ? (i === 0 ? -p.u(0.15, 0.45) : p.u(0.3, 0.6)) : (i - 1) * p.u(0.4, 0.65);
    trunk(p, ex, ey, angle + spread + p.g() * 0.08, len * p.u(0.68, 0.82), width * p.u(0.58, 0.7), depth - 1, tips);
  }
  if (depth < 4) tips.push({ x: ex, y: ey });
  return tips;
}

/** Blossom: soft washes for the body of the canopy, then many small dabs of petals. */
function canopy(p: Painter, cx: number, cy: number, rx: number, ry: number, dabs: number, tips: readonly Pt[] = []): void {
  for (let i = 0; i < 11; i++) {
    const x = cx + p.g() * rx * 0.35;
    const y = cy + p.g() * ry * 0.3;
    wash(p, blobShape(p, x, y, rx * p.u(0.4, 0.75), ry * p.u(0.4, 0.7)), p.pick(['#f6d0d9', '#f2c0cc', '#f8dde3']), { layers: 12, alpha: 0.05, spread: 0.55 });
  }
  const unit = p.h;
  for (let i = 0; i < dabs; i++) {
    let x: number;
    let y: number;
    if (tips.length && p.r() < 0.7) {
      const t = p.pick(tips);
      x = t.x + p.g() * unit * 0.03;
      y = t.y + p.g() * unit * 0.024;
    } else {
      const a = p.u(0, Math.PI * 2);
      const d = Math.sqrt(p.r());
      x = cx + Math.cos(a) * rx * d;
      y = cy + Math.sin(a) * ry * d;
    }
    // Shadow side (lower right) a little deeper, lit side (upper left) paler.
    const lit = (cx - x) / rx + (cy - y) / ry;
    const color = lit > 0.5 ? p.pick(['#fbe9ec', '#f8dbe2', '#ffffff', '#f6c9d3']) : lit < -0.6 ? p.pick(['#e48fa8', '#eba2b6', '#f1b3c3']) : p.pick(PINKS);
    dab(p, x, y, unit * p.u(0.0025, 0.007), color, p.u(0.25, 0.55), p.r() < 0.35 ? 'multiply' : 'source-over');
  }
}

/** The big blossoming tree that leans in from the left. */
function bigTree(p: Painter): void {
  const { w, h } = p;
  const base = { x: 0.12 * w, y: 0.83 * h };
  // Scaled to the wall: on a narrow, tall wall the tree keeps to its side instead of filling the picture.
  const size = Math.min(h, w * 0.75) * narrow(p);
  // Its shadow on the grass.
  wash(p, blobShape(p, base.x + 0.05 * size, base.y + 0.01 * h, 0.22 * size, 0.025 * h), '#93b07a', { layers: 10, alpha: 0.06, spread: 0.5 });
  const tips = trunk(p, base.x, base.y, -Math.PI / 2 + 0.12, 0.27 * size, 0.04 * size, 6);
  const c = centre(tips);
  canopy(p, c.x, c.y + 0.03 * size, 0.32 * size, 0.2 * size, Math.round(9000 * (w / 2600) * (h / 1600) + 600), tips);
  // A few low twigs in blossom reaching into the picture.
  const low = trunk(p, base.x + 0.01 * size, base.y - 0.32 * size, -0.35, 0.14 * size, 0.01 * size, 3);
  canopy(p, base.x + 0.24 * size, base.y - 0.38 * size, 0.1 * size, 0.06 * size, 700, low);
  // Fallen petals under it, and a few drifting into the picture.
  for (let i = 0; i < 160; i++) {
    const x = base.x + p.g() * 0.18 * size;
    const y = base.y + p.u(-0.01, 0.07) * h;
    dab(p, x, y, h * p.u(0.0015, 0.004), p.pick(PINKS), 0.6);
  }
  for (let i = 0; i < 46; i++) {
    const t = p.r();
    const x = base.x + 0.15 * size + t * 0.55 * w + p.g() * 0.04 * w;
    const y = base.y - 0.7 * size + t * 0.25 * h + p.g() * 0.08 * h;
    dab(p, x, y, h * p.u(0.002, 0.0045), p.pick(['#f1b3c3', '#f6c9d3', '#eba2b6']), 0.7);
  }
}

/** A gentle stream from the far right down towards the near right corner. */
function stream(p: Painter): void {
  const { w, h } = p;
  const path = (t: number): Pt => {
    // Cubic through the meadow, from the hills to the edge of the picture.
    const P = [
      { x: 0.64 * w, y: 0.572 * h },
      { x: 0.86 * w, y: 0.6 * h },
      { x: 0.66 * w, y: 0.72 * h },
      { x: 1.03 * w, y: 0.84 * h },
    ];
    const k = 1 - t;
    return {
      x: k * k * k * P[0]!.x + 3 * k * k * t * P[1]!.x + 3 * k * t * t * P[2]!.x + t * t * t * P[3]!.x,
      y: k * k * k * P[0]!.y + 3 * k * k * t * P[1]!.y + 3 * k * t * t * P[2]!.y + t * t * t * P[3]!.y,
    };
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = path(t);
    const d = path(Math.min(1, t + 0.01));
    const e = path(Math.max(0, t - 0.01));
    const ang = Math.atan2(d.y - e.y, d.x - e.x);
    const half = h * (0.002 + 0.063 * t * t);
    left.push({ x: c.x + Math.cos(ang - Math.PI / 2) * half, y: c.y + Math.sin(ang - Math.PI / 2) * half });
    right.push({ x: c.x + Math.cos(ang + Math.PI / 2) * half, y: c.y + Math.sin(ang + Math.PI / 2) * half });
  }
  const poly = [...left, ...right.reverse()];
  // Grassy banks first, then the water.
  wash(p, poly.map((q) => ({ x: q.x, y: q.y + h * 0.006 })), '#a3bf8c', { layers: 10, alpha: 0.04, spread: 0.08 });
  wash(p, poly, '#cfe3ea', { layers: 16, alpha: 0.08, spread: 0.06, edge: 0.04, mode: 'source-over' });
  wash(p, poly, '#bcd6e0', { layers: 8, alpha: 0.035, spread: 0.08 });
  // Light on the water.
  const { ctx } = p;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const t = p.u(0.05, 1);
    const c = path(t);
    const len = h * (0.006 + 0.03 * t);
    ctx.globalAlpha = p.u(0.4, 0.8);
    ctx.strokeStyle = '#f4fafa';
    ctx.lineWidth = Math.max(1, h * (0.001 + 0.002 * t));
    ctx.beginPath();
    const y = c.y + p.g() * h * 0.008 * t;
    ctx.moveTo(c.x - len / 2, y);
    ctx.lineTo(c.x + len / 2, y + p.g() * h * 0.001);
    ctx.stroke();
  }
  ctx.restore();
  // Pebbles and tufts along the banks.
  for (let i = 0; i < 70; i++) {
    const t = p.u(0.2, 1);
    const c = path(t);
    const side = p.r() < 0.5 ? -1 : 1;
    const half = h * (0.005 + 0.06 * t * t) * p.u(0.9, 1.3);
    dab(p, c.x, c.y + side * half, h * p.u(0.002, 0.006) * (0.4 + t), p.pick(['#c9c2cc', '#d7cfc6', '#87a86f', '#7da066']), 0.45, 'multiply');
  }
}

/** A lamb, lying down (`lying`) or standing; `facing` 1 looks right, -1 left. Size is its body length. */
function lamb(p: Painter, cx: number, cy: number, s: number, facing: 1 | -1, lying: boolean): void {
  const { ctx } = p;
  // Shadow on the grass.
  wash(p, blobShape(p, cx, cy + s * (lying ? 0.2 : 0.42), s * 0.62, s * 0.1), '#88a671', { layers: 8, alpha: 0.07, spread: 0.4 });
  if (!lying) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#b2a397';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = s * 0.07;
    for (const dx of [-0.3, -0.18, 0.18, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * s, cy + s * 0.12);
      ctx.lineTo(cx + dx * s + p.g() * s * 0.01, cy + s * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Fleece: a shaded underside, then curls of white.
  const body = (n: number, color: string, alpha: number, dy: number, k: number) => {
    for (let i = 0; i < n; i++) {
      const a = p.u(0, Math.PI * 2);
      const d = Math.sqrt(p.r());
      const x = cx + Math.cos(a) * s * 0.4 * d;
      const y = cy + dy + Math.sin(a) * s * (lying ? 0.2 : 0.22) * d;
      dab(p, x, y, s * p.u(0.07, 0.13) * k, color, alpha);
    }
  };
  body(30, '#d8cfc3', 0.9, s * 0.05, 1.1);
  body(70, '#fbf8f1', 0.75, -s * 0.01, 1);
  body(40, '#ffffff', 0.6, -s * 0.04, 0.7);
  // Shading along the belly.
  wash(p, blobShape(p, cx + facing * s * 0.02, cy + s * 0.15, s * 0.38, s * 0.07), '#d9cfc2', { layers: 6, alpha: 0.12, spread: 0.3 });
  // Head with ears, a woolly top and a sleepy face.
  const hx = cx + facing * s * 0.43;
  const hy = cy - s * (lying ? 0.1 : 0.16);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(hx + side * s * 0.11, hy - s * 0.04);
    ctx.rotate(side * 0.9 + facing * 0.2);
    ctx.fillStyle = '#eadbc9';
    ctx.beginPath();
    ctx.ellipse(side * s * 0.06, 0, s * 0.09, s * 0.038, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c3c3';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(side * s * 0.065, 0, s * 0.055, s * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = '#f3e8da';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.ellipse(hx + facing * s * 0.02, hy + s * 0.02, s * 0.13, s * 0.15, facing * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 9; i++) dab(p, hx + p.g() * s * 0.04, hy - s * 0.1 + p.g() * s * 0.02, s * p.u(0.035, 0.055), '#ffffff', 0.85);
  // Closed eyes: two little arcs; a pink nose.
  ctx.save();
  ctx.strokeStyle = '#6b564b';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = hx + facing * s * 0.03 + side * s * 0.048;
    ctx.beginPath();
    ctx.arc(ex, hy, s * 0.022, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  dab(p, hx + facing * s * 0.035, hy + s * 0.1, s * 0.02, '#e7a9ad', 0.8);
  dab(p, hx + facing * s * 0.035 + s * 0.06, hy + s * 0.06, s * 0.025, '#f4c6c8', 0.35);
  dab(p, hx + facing * s * 0.035 - s * 0.06, hy + s * 0.06, s * 0.025, '#f4c6c8', 0.35);
}

/** A butterfly with pastel wings, `s` across. */
function butterfly(p: Painter, x: number, y: number, s: number, color: string): void {
  const { ctx } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.g() * 0.3);
  const wing = (dx: number, dy: number, rx: number, ry: number, rot: number, alpha: number, c: string) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.globalCompositeOperation = 'multiply';
  for (const side of [-1, 1]) {
    wing(side * s * 0.22, -s * 0.12, s * 0.24, s * 0.17, side * 0.5, 0.75, color);
    wing(side * s * 0.16, s * 0.13, s * 0.15, s * 0.11, -side * 0.5, 0.75, color);
    wing(side * s * 0.25, -s * 0.15, s * 0.1, s * 0.07, side * 0.5, 0.35, '#ffffff');
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#7a6658';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.2);
  ctx.lineTo(0, s * 0.22);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.5, s * 0.02);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.2);
    ctx.quadraticCurveTo(side * s * 0.05, -s * 0.38, side * s * 0.12, -s * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

/** Flowers and grass in the foreground, kept clear of the quiet middle. */
function meadowDetail(p: Painter): void {
  const { ctx, w, h } = p;
  const quiet = (x: number, y: number) => x > 0.36 * w && x < 0.64 * w && y < 0.9 * h;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 900 * (w / 2600); i++) {
    const x = p.u(0, 1) * w;
    const y = p.u(0.7, 1.02) * h;
    if (quiet(x, y) && p.r() < 0.8) continue;
    const len = h * p.u(0.008, 0.022) * (y / h);
    ctx.globalAlpha = p.u(0.2, 0.45);
    ctx.strokeStyle = p.pick(['#86a86c', '#7c9e64', '#9cba7e', '#6f915b']);
    ctx.lineWidth = Math.max(1, h * 0.0012);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + p.g() * len * 0.2, y - len * 0.6, x + p.g() * len * 0.35, y - len);
    ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i < 700 * (w / 2600); i++) {
    const x = p.u(0, 1) * w;
    const y = p.u(0.64, 1) * h;
    if (quiet(x, y) && p.r() < 0.85) continue;
    const near = (y / h - 0.6) / 0.4;
    dab(p, x, y, h * p.u(0.0015, 0.0035) * (0.5 + near), p.pick(FLOWERS), p.u(0.55, 0.9));
  }
}

/** The paper: soft mottling, then a fine grain over the whole painting. */
function paper(p: Painter): void {
  const { ctx, w, h } = p;
  for (let i = 0; i < 14; i++) {
    wash(p, blobShape(p, p.u(0, 1) * w, p.u(0, 1) * h, p.u(0.15, 0.4) * h, p.u(0.1, 0.3) * h), p.pick(['#f3ecdf', '#f5efe2', '#f1eadd']), { layers: 6, alpha: 0.03, spread: 0.7 });
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(91);
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (r() - 0.5) * 0.06;
    d[i] = Math.min(255, d[i]! * k);
    d[i + 1] = Math.min(255, d[i + 1]! * k);
    d[i + 2] = Math.min(255, d[i + 2]! * k * 0.995);
  }
  ctx.putImageData(img, 0, 0);
}

function meadow(p: Painter): void {
  const { w, h } = p;
  sky(p);
  const r = ridges(p);
  land(p, r);
  distantTrees(p, r);
  stream(p);
  bigTree(p);
  meadowDetail(p);
  // Lambs: two resting in front of the tree and by the stream, one grazing further back.
  lamb(p, 0.24 * w, 0.86 * h, 0.14 * h, 1, true);
  lamb(p, 0.76 * w, 0.88 * h, 0.135 * h, -1, true);
  lamb(p, 0.67 * w, 0.64 * h, 0.045 * h, -1, false);
  // Butterflies around the blossom and over the meadow.
  const flutter: [number, number, number, string][] = [
    [0.33, 0.3, 0.03, '#f2b4c4'],
    [0.29, 0.45, 0.022, '#bcd4f0'],
    [0.69, 0.33, 0.026, '#f5d98c'],
    [0.79, 0.24, 0.02, '#f2b4c4'],
    [0.57, 0.18, 0.018, '#cbbfe8'],
    [0.9, 0.42, 0.022, '#bcd4f0'],
  ];
  for (const [x, y, s, c] of flutter) butterfly(p, x * w, y * h, s * h * 1.7, c);
  soften(p, p.h * 0.0007);
  paper(p);
}

/** A whisper of blur over the painting, so dabs and strokes melt into each other like wet paint. */
function soften(p: Painter, radius: number): void {
  if (radius < 0.3) return;
  const { ctx, w, h } = p;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  copy.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.filter = `blur(${radius.toFixed(2)}px)`;
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
}

const ARTS: Record<string, (p: Painter) => void> = { meadow };

/** Paints built-in mural `art` on a new canvas of `width` x `height` pixels. */
export function paintMural(art: string, width: number, height: number): HTMLCanvasElement {
  const paint = ARTS[art];
  if (!paint) throw new Error(`No such mural: ${art}`);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  paint(painter(ctx, width, height, 20260515));
  return canvas;
}

const thumbs = new Map<string, string>();

/** A small JPEG data URL of a built-in mural (for swatches). */
export function muralThumbnail(art: string, width = 192, height = 96): string {
  const key = `${art}@${width}x${height}`;
  let url = thumbs.get(key);
  if (!url) {
    url = paintMural(art, width, height).toDataURL('image/jpeg', 0.85);
    thumbs.set(key, url);
  }
  return url;
}
