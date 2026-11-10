/**
 * Baked contact shading: soft dark gradients where walls meet the floor, the ceiling
 * and each other. It stands in for ambient occlusion at no per-frame cost, so plain
 * white rooms keep their shape under even light (walk mode) and in the dollhouse.
 *
 * Pure maths: quads in WORLD metres with an opacity per corner.
 */
import type { Id, Level, Pt, RoomGeom } from '@interio/core';

type P3 = [number, number, number];

export interface ShadeQuad {
  /** Corners in order around the quad. */
  corners: [P3, P3, P3, P3];
  /** Opacity of the shade at each corner, 0..1. */
  alpha: [number, number, number, number];
}

export interface ContactShading {
  /** Gradients on wall faces, by wall id (so they can fade with their wall). */
  walls: Map<Id, ShadeQuad[]>;
  /** Gradients on floors and ceilings along the walls. */
  flat: ShadeQuad[];
}

export interface ShadingOptions {
  /** Shade the wall heads and the ceiling edges too. Only when ceilings are drawn. */
  ceilings?: boolean;
}

/** How far each gradient reaches (m) and how dark it is where the surfaces meet. */
const FOOT = { reach: 0.55, alpha: 0.2 };
const HEAD = { reach: 0.6, alpha: 0.24 };
const FLOOR = { reach: 0.45, alpha: 0.22 };
const CEILING = { reach: 0.5, alpha: 0.14 };
const CORNER = { reach: 0.45, alpha: 0.17 };
/** The gradients float this far off the surface they shade (mm). */
const LIFT = 2;

function subtract(from: number, to: number, gaps: (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = from;
  for (const [g0, g1] of [...gaps].sort((m, n) => m[0] - n[0])) {
    if (g0 > cursor) out.push([cursor, Math.min(g0, to)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([s, e]) => e - s > 20);
}

export function contactShading(level: Level, rooms: RoomGeom[], opts: ShadingOptions = {}): ContactShading {
  const walls = new Map<Id, ShadeQuad[]>();
  const flat: ShadeQuad[] = [];
  const openings = Object.values(level.openings);
  const onWall = (id: Id, quad: ShadeQuad) => (walls.get(id) ?? walls.set(id, []).get(id)!).push(quad);

  for (const room of rooms) {
    const poly = room.interior;
    const n = poly.length;
    if (n < 3) continue;
    const dirs = poly.map((a, i) => {
      const b = poly[(i + 1) % n]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      return { l, x: l > 0 ? (b.x - a.x) / l : 0, y: l > 0 ? (b.y - a.y) / l : 0 };
    });
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const d = dirs[i]!;
      const wall = level.walls[room.edgeWalls[i] ?? ''];
      if (!wall || wall.kind !== 'wall' || d.l < 50) continue;
      // Counter-clockwise polygon: the room is on the left of every edge.
      const nx = -d.y;
      const ny = d.x;
      const h = Math.min(wall.height, level.ceilingHeight);
      const wa = level.vertices[wall.a];
      const wb = level.vertices[wall.b];
      if (!wa || !wb) continue;
      const wl = Math.hypot(wb.x - wa.x, wb.y - wa.y) || 1;
      // Openings of this wall as spans along the edge, with their vertical extent.
      const holes = openings
        .filter((o) => o.wallId === wall.id)
        .map((o) => {
          const cx = wa.x + ((wb.x - wa.x) / wl) * o.offset;
          const cy = wa.y + ((wb.y - wa.y) / wl) * o.offset;
          const t = (cx - a.x) * d.x + (cy - a.y) * d.y;
          return { span: [t - o.width / 2, t + o.width / 2] as const, sill: o.sill, top: o.sill + o.height };
        })
        .filter((o) => o.span[1] > 0 && o.span[0] < d.l);
      /** World point at distance t along the edge, `off` mm into the room, at height z (mm). */
      const at = (t: number, off: number, z: number): P3 => [(a.x + d.x * t + nx * off) / 1000, z / 1000, -(a.y + d.y * t + ny * off) / 1000];
      const clear = (lo: number, hi: number, t0: number, t1: number) => holes.every((o) => o.top <= lo || o.sill >= hi || o.span[1] <= t0 || o.span[0] >= t1);

      // Foot of the wall and the floor in front of it, broken at doors and passages.
      const footGaps = holes.filter((o) => o.sill < FOOT.reach * 1000).map((o) => o.span);
      for (const [t0, t1] of subtract(0, d.l, footGaps)) {
        const top = FOOT.reach * 1000;
        onWall(wall.id, { corners: [at(t0, LIFT, 0), at(t1, LIFT, 0), at(t1, LIFT, top), at(t0, LIFT, top)], alpha: [FOOT.alpha, FOOT.alpha, 0, 0] });
      }
      const floorGaps = holes.filter((o) => o.sill <= 0).map((o) => o.span);
      for (const [t0, t1] of subtract(0, d.l, floorGaps)) {
        const out = FLOOR.reach * 1000;
        flat.push({ corners: [at(t0, 0, LIFT), at(t1, 0, LIFT), at(t1, out, LIFT), at(t0, out, LIFT)], alpha: [FLOOR.alpha, FLOOR.alpha, 0, 0] });
      }

      if (opts.ceilings) {
        const from = h - HEAD.reach * 1000;
        const headGaps = holes.filter((o) => o.top > from).map((o) => o.span);
        for (const [t0, t1] of subtract(0, d.l, headGaps)) {
          onWall(wall.id, { corners: [at(t0, LIFT, from), at(t1, LIFT, from), at(t1, LIFT, h), at(t0, LIFT, h)], alpha: [0, 0, HEAD.alpha, HEAD.alpha] });
        }
        const out = CEILING.reach * 1000;
        flat.push({ corners: [at(0, 0, h - LIFT), at(d.l, 0, h - LIFT), at(d.l, out, h - LIFT), at(0, out, h - LIFT)], alpha: [CEILING.alpha, CEILING.alpha, 0, 0] });
      }

      // Inside corners: a vertical gradient on both walls that meet there.
      const reach = Math.min(CORNER.reach * 1000, d.l / 2);
      const prev = dirs[(i - 1 + n) % n]!;
      const next = dirs[(i + 1) % n]!;
      const inside = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x > 0.3;
      if (inside(prev, d) && clear(0, h, 0, reach)) {
        onWall(wall.id, { corners: [at(0, LIFT, 0), at(reach, LIFT, 0), at(reach, LIFT, h), at(0, LIFT, h)], alpha: [CORNER.alpha, 0, 0, CORNER.alpha] });
      }
      if (inside(d, next) && clear(0, h, d.l - reach, d.l)) {
        onWall(wall.id, { corners: [at(d.l - reach, LIFT, 0), at(d.l, LIFT, 0), at(d.l, LIFT, h), at(d.l - reach, LIFT, h)], alpha: [0, CORNER.alpha, CORNER.alpha, 0] });
      }
    }
  }
  return { walls, flat };
}

/** Flat arrays for a buffer geometry: positions (xyz) and RGBA colours, two triangles per quad. */
export function shadeBuffers(quads: ShadeQuad[], rgb: [number, number, number]): { positions: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(quads.length * 12);
  const colors = new Float32Array(quads.length * 16);
  const indices = new Uint32Array(quads.length * 6);
  quads.forEach((q, k) => {
    for (let c = 0; c < 4; c++) {
      positions.set(q.corners[c]!, k * 12 + c * 3);
      colors.set([rgb[0], rgb[1], rgb[2], q.alpha[c]!], k * 16 + c * 4);
    }
    const v = k * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], k * 6);
  });
  return { positions, colors, indices };
}
