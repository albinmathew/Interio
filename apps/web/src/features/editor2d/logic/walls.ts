/** Wall helpers: drawing pieces around openings, and edits the store has no action for. */
import { DEFAULTS, ops, vec, type Id, type Level, type Opening, type Pt, type Wall, type WallFootprint, type WallKind } from '@interio/core';

const { add, scale, dist } = vec;

/**
 * The solid parts of a wall: its mitred footprint with a square-cut gap at every
 * opening. Each piece is a closed polygon in plan mm.
 */
export function wallPieces(fp: WallFootprint, a: Pt, thickness: number, openings: Pick<Opening, 'offset' | 'width'>[]): Pt[][] {
  const spans = openings
    .map((o) => [Math.max(0, o.offset - o.width / 2), Math.min(fp.length, o.offset + o.width / 2)] as [number, number])
    .filter(([s0, s1]) => s1 - s0 > 0.5)
    .sort((m, n) => m[0] - n[0]);
  if (spans.length === 0) return [fp.polygon];
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  const h = thickness / 2;
  const left = (s: number) => add(add(a, scale(fp.dir, s)), scale(fp.normal, h));
  const right = (s: number) => add(add(a, scale(fp.dir, s)), scale(fp.normal, -h));
  const b = add(a, scale(fp.dir, fp.length));
  const pieces: Pt[][] = [];
  const first = merged[0]!;
  if (first[0] > 0.5) pieces.push([fp.aR, right(first[0]), left(first[0]), fp.aL, a]);
  for (let i = 0; i + 1 < merged.length; i++) {
    const s = merged[i]![1];
    const e = merged[i + 1]![0];
    pieces.push([right(s), right(e), left(e), left(s)]);
  }
  const tail = merged[merged.length - 1]!;
  if (fp.length - tail[1] > 0.5) pieces.push([right(tail[1]), fp.bR, b, fp.bL, left(tail[1])]);
  return pieces;
}

export function incidentWalls(level: Level, vertexId: Id): Wall[] {
  return Object.values(level.walls).filter((w) => w.a === vertexId || w.b === vertexId);
}

/** Default height and thickness when a wall changes kind. */
export function wallKindDefaults(kind: WallKind, ceilingHeight: number): Pick<Wall, 'kind' | 'height' | 'thickness'> {
  if (kind === 'railing') return { kind, height: DEFAULTS.railingHeight, thickness: DEFAULTS.railingThickness };
  if (kind === 'low') return { kind, height: DEFAULTS.lowWallHeight, thickness: DEFAULTS.partitionThickness };
  return { kind, height: ceilingHeight, thickness: DEFAULTS.wallThickness };
}

/**
 * Removes a vertex. Where exactly two walls meet they are joined into one
 * (openings keep their place); otherwise every wall at the vertex goes.
 * Mutates the level: run it inside `mutateLevel`.
 */
export function dissolveVertex(level: Level, vertexId: Id): void {
  const walls = incidentWalls(level, vertexId);
  if (walls.length !== 2) {
    for (const w of walls) ops.removeWall(level, w.id);
    return;
  }
  const [keep, drop] = walls as [Wall, Wall];
  const far = (w: Wall) => (w.a === vertexId ? w.b : w.a);
  const u = far(keep);
  const v = far(drop);
  const already = Object.values(level.walls).some((w) => (w.a === u && w.b === v) || (w.a === v && w.b === u));
  if (u === v || already) {
    ops.removeWall(level, keep.id);
    ops.removeWall(level, drop.id);
    return;
  }
  const keepLen = ops.wallLength(level, keep);
  const dropLen = ops.wallLength(level, drop);
  const pu = level.vertices[u]!;
  const pv = level.vertices[v]!;
  const total = dist(pu, pv);
  // Openings keep their distance from the far end they were measured against.
  const fromU = (o: Opening): number => {
    if (o.wallId === keep.id) return keep.a === u ? o.offset : keepLen - o.offset;
    const fromMid = drop.a === vertexId ? o.offset : dropLen - o.offset;
    return total - (dropLen - fromMid);
  };
  const moved = Object.values(level.openings)
    .filter((o) => o.wallId === keep.id || o.wallId === drop.id)
    .map((o) => ({ o, s: fromU(o) }));
  keep.a = u;
  keep.b = v;
  delete level.walls[drop.id];
  for (const { o, s } of moved) {
    o.wallId = keep.id;
    o.offset = s;
    if (!ops.clampOpening(level, o)) delete level.openings[o.id];
  }
  ops.removeOrphanVertices(level);
}

/** New position of vertex b so the wall a -> b has `length`, keeping its direction. */
export function endForLength(a: Pt, b: Pt, length: number): Pt {
  const d = vec.norm(vec.sub(b, a));
  return vec.roundPt(add(a, scale(d, length)));
}

/** Component of `delta` perpendicular to the wall a -> b. */
export function perpendicularDelta(a: Pt, b: Pt, delta: Pt): Pt {
  const n = vec.perp(vec.norm(vec.sub(b, a)));
  return scale(n, vec.dot(delta, n));
}
