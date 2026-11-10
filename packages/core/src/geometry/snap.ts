import type { Id, Level, Pt } from '../schema';
import { dist, projectOnSegment } from './vec';

export type SnapHit =
  | { kind: 'vertex'; point: Pt; vertexId: Id }
  | { kind: 'underlay'; point: Pt }
  | { kind: 'wall'; point: Pt; wallId: Id; t: number };

export interface SnapOptions {
  /** Flat [x, y, ...] candidates from the source drawing (`Underlay.snapPoints`). */
  underlayPoints?: Float32Array;
  excludeVertices?: ReadonlySet<Id>;
  excludeWalls?: ReadonlySet<Id>;
}

/**
 * Nearest snap target within `tol` mm. Priority: plan vertices, then drawing
 * underlay points, then the nearest point on a wall centreline.
 */
export function snap(level: Level, p: Pt, tol: number, opts: SnapOptions = {}): SnapHit | null {
  let best: SnapHit | null = null;
  let bestD = tol;
  for (const [id, v] of Object.entries(level.vertices)) {
    if (opts.excludeVertices?.has(id)) continue;
    const d = dist(p, v);
    if (d <= bestD) {
      bestD = d;
      best = { kind: 'vertex', point: v, vertexId: id };
    }
  }
  if (best) return best;

  const pts = opts.underlayPoints;
  if (pts) {
    let d2 = tol * tol;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const dx = pts[i]! - p.x;
      const dy = pts[i + 1]! - p.y;
      const d = dx * dx + dy * dy;
      if (d <= d2) {
        d2 = d;
        best = { kind: 'underlay', point: { x: pts[i]!, y: pts[i + 1]! } };
      }
    }
    if (best) return best;
  }

  for (const w of Object.values(level.walls)) {
    if (opts.excludeWalls?.has(w.id)) continue;
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    if (!a || !b) continue;
    const pr = projectOnSegment(p, a, b);
    if (pr.distance <= bestD) {
      bestD = pr.distance;
      best = { kind: 'wall', point: pr.point, wallId: w.id, t: pr.t };
    }
  }
  return best;
}
