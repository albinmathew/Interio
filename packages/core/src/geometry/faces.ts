/**
 * Planar face finding on the wall graph. Faces are the bounded regions enclosed
 * by wall centrelines; rooms are faces with a name attached.
 */
import type { Id, Level, Pt } from '../schema';
import {
  add,
  cross,
  dist,
  lineIntersection,
  norm,
  perp,
  polygonArea,
  projectOnSegment,
  scale,
  segmentIntersection,
  sub,
} from './vec';

export interface Face {
  /** Counter-clockwise polygon along wall centrelines. */
  polygon: Pt[];
  /** Wall id for each polygon edge i (from polygon[i] to polygon[i+1]). */
  edgeWalls: Id[];
  /** Polygon inset by half of each wall's thickness: the clear floor area. */
  interior: Pt[];
  /** Area of `polygon` in mm^2. */
  area: number;
  /** Area of `interior` in mm^2. */
  interiorArea: number;
}

interface SubEdge {
  u: string;
  v: string;
  wallId: Id;
}

function planarize(level: Level): { nodes: Map<string, Pt>; edges: SubEdge[] } {
  const nodes = new Map<string, Pt>(Object.entries(level.vertices));
  const walls = Object.values(level.walls).filter((w) => nodes.has(w.a) && nodes.has(w.b) && w.a !== w.b);
  const cuts = new Map<Id, { t: number; node: string }[]>();
  for (const w of walls) cuts.set(w.id, [{ t: 0, node: w.a }, { t: 1, node: w.b }]);

  // Vertices lying on a wall's interior (T-junctions that were not split).
  for (const w of walls) {
    const a = nodes.get(w.a)!;
    const b = nodes.get(w.b)!;
    const l = dist(a, b);
    if (l < 1) continue;
    for (const [vid, v] of Object.entries(level.vertices)) {
      if (vid === w.a || vid === w.b) continue;
      const pr = projectOnSegment(v, a, b);
      if (pr.distance < 1 && pr.t * l > 1 && (1 - pr.t) * l > 1) cuts.get(w.id)!.push({ t: pr.t, node: vid });
    }
  }
  // Walls crossing without a shared vertex.
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w = walls[i]!;
      const x = walls[j]!;
      if (w.a === x.a || w.a === x.b || w.b === x.a || w.b === x.b) continue;
      const hit = segmentIntersection(nodes.get(w.a)!, nodes.get(w.b)!, nodes.get(x.a)!, nodes.get(x.b)!);
      if (!hit) continue;
      const lw = dist(nodes.get(w.a)!, nodes.get(w.b)!);
      const lx = dist(nodes.get(x.a)!, nodes.get(x.b)!);
      if (hit.t * lw < 1 || (1 - hit.t) * lw < 1 || hit.u * lx < 1 || (1 - hit.u) * lx < 1) continue;
      const key = `x:${Math.round(hit.point.x)},${Math.round(hit.point.y)}`;
      if (!nodes.has(key)) nodes.set(key, hit.point);
      cuts.get(w.id)!.push({ t: hit.t, node: key });
      cuts.get(x.id)!.push({ t: hit.u, node: key });
    }
  }

  const edges: SubEdge[] = [];
  const seen = new Set<string>();
  for (const w of walls) {
    const list = cuts.get(w.id)!.sort((m, n) => m.t - n.t);
    for (let i = 0; i + 1 < list.length; i++) {
      const u = list[i]!.node;
      const v = list[i + 1]!.node;
      if (u === v) continue;
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ u, v, wallId: w.id });
    }
  }
  return { nodes, edges };
}

function pruneDangling(edges: SubEdge[]): SubEdge[] {
  let current = edges;
  for (;;) {
    const degree = new Map<string, number>();
    for (const e of current) {
      degree.set(e.u, (degree.get(e.u) ?? 0) + 1);
      degree.set(e.v, (degree.get(e.v) ?? 0) + 1);
    }
    const next = current.filter((e) => degree.get(e.u)! > 1 && degree.get(e.v)! > 1);
    if (next.length === current.length) return next;
    current = next;
  }
}

/** Insets a CCW polygon by a per-edge distance. */
export function insetPolygon(polygon: Pt[], offsets: number[]): Pt[] {
  const n = polygon.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]!;
    const cur = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const d0 = norm(sub(cur, prev));
    const d1 = norm(sub(next, cur));
    const o0 = offsets[(i - 1 + n) % n] ?? 0;
    const o1 = offsets[i] ?? 0;
    const p0 = add(cur, scale(perp(d0), o0));
    const p1 = add(cur, scale(perp(d1), o1));
    const hit = Math.abs(cross(d0, d1)) < 1e-3 ? null : lineIntersection(p0, d0, p1, d1);
    out.push(hit && dist(hit, cur) < 6 * Math.max(o0, o1, 1) ? hit : p1);
  }
  return out;
}

/** All bounded faces of the wall graph with area of at least `minArea` mm^2. */
export function deriveFaces(level: Level, minArea = 500_000): Face[] {
  const { nodes, edges: raw } = planarize(level);
  const edges = pruneDangling(raw);
  if (edges.length < 3) return [];

  // Outgoing half-edges per node, sorted counter-clockwise by angle.
  interface Half {
    from: string;
    to: string;
    wallId: Id;
    angle: number;
    used: boolean;
  }
  const out = new Map<string, Half[]>();
  const push = (from: string, to: string, wallId: Id) => {
    const a = nodes.get(from)!;
    const b = nodes.get(to)!;
    const h: Half = { from, to, wallId, angle: Math.atan2(b.y - a.y, b.x - a.x), used: false };
    const list = out.get(from);
    if (list) list.push(h);
    else out.set(from, [h]);
  };
  for (const e of edges) {
    push(e.u, e.v, e.wallId);
    push(e.v, e.u, e.wallId);
  }
  for (const list of out.values()) list.sort((m, n) => m.angle - n.angle);

  const faces: Face[] = [];
  for (const list of out.values()) {
    for (const start of list) {
      if (start.used) continue;
      const loop: Half[] = [];
      let h = start;
      let guard = 0;
      while (!h.used && guard++ < 100_000) {
        h.used = true;
        loop.push(h);
        // Next edge of the face on the left: the outgoing edge just clockwise of the twin.
        const around = out.get(h.to)!;
        const twin = around.findIndex((x) => x.to === h.from);
        h = around[(twin - 1 + around.length) % around.length]!;
      }
      if (loop.length < 3) continue;
      const polygon = loop.map((x) => nodes.get(x.from)!);
      const area = polygonArea(polygon);
      if (area < minArea) continue; // negative area is the unbounded outer face
      const edgeWalls = loop.map((x) => x.wallId);
      const interior = insetPolygon(
        polygon,
        edgeWalls.map((id) => (level.walls[id]?.thickness ?? 0) / 2),
      );
      const interiorArea = polygonArea(interior);
      // The clear floor inside the walls must be usable too: ducts and shafts are not rooms.
      if (interiorArea < minArea * 0.8) continue;
      faces.push({
        polygon,
        edgeWalls,
        interior: interiorArea > 0 ? interior : polygon,
        area,
        interiorArea: interiorArea > 0 ? interiorArea : area,
      });
    }
  }
  // Stable order: by lowest-left corner, so face indices do not shuffle between runs.
  faces.sort((f, g) => {
    const a = f.polygon.reduce((m, p) => (p.y < m.y || (p.y === m.y && p.x < m.x) ? p : m));
    const b = g.polygon.reduce((m, p) => (p.y < m.y || (p.y === m.y && p.x < m.x) ? p : m));
    return a.y - b.y || a.x - b.x;
  });
  return faces;
}
