/**
 * Panelling under a mural (`wall.mural.*.dado`, `mural:<id>:dado`): beadboard boards from
 * the floor to `MURAL_DADO_HEIGHT` with a cap rail on top, along every wall face that has
 * such a finish, broken at doors and stopped under low windows. Pure maths in WORLD space
 * (metres); `DadoLayer` turns it into meshes.
 */
import { MURAL_DADO_HEIGHT, parseMuralFinish, type Id, type Level, type LevelMesh } from '@interio/core';
import type { BoxSpec } from './parts';
import { surfaceFinish } from './surfaces';

/** How far the boards stand off the wall: less than the skirting, so it still reads at their foot. */
export const DADO_DEPTH = 0.009;
/** The cap rail along the top of the boards. */
export const DADO_CAP = { height: 0.035, depth: 0.026 };

/** A board run, with where it starts along the wall so the boards line up across runs. */
export interface PanelSpec extends BoxSpec {
  /** Distance along the wall from its first vertex to the run's left end, in metres (texture `u`). */
  u0: number;
}

export interface DadoWall {
  wallId: Id;
  panels: PanelSpec[];
  caps: BoxSpec[];
}

/** Panelling of every wall face whose finish is a mural with a dado, one entry per wall. */
export function dadoParts(level: Pick<Level, 'walls' | 'vertices' | 'openings' | 'rooms'>, mesh: LevelMesh): DadoWall[] {
  const byWall = new Map<Id, DadoWall>();
  const openings = Object.values(level.openings);
  const top = MURAL_DADO_HEIGHT / 1000;
  for (const g of mesh.groups) {
    if (g.kind !== 'wallSide' || !g.wallId || g.wallKind !== 'wall') continue;
    if (!parseMuralFinish(surfaceFinish(level as Level, g).finish)?.dado) continue;
    const wall = level.walls[g.wallId];
    const a = wall && level.vertices[wall.a];
    const b = wall && level.vertices[wall.b];
    if (!wall || !a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const sign = g.side === 'left' ? 1 : -1;
    const height = Math.min(top, wall.height / 1000);
    // Extent of this face along the wall, read from the mesh so mitred corners are respected.
    let s0 = Infinity;
    let s1 = -Infinity;
    const p = g.geometry.positions;
    for (let i = 0; i < p.length; i += 3) {
      const s = (p[i]! * 1000 - a.x) * dx + (-p[i + 2]! * 1000 - a.y) * dy;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
    }
    if (!(s1 - s0 > 1)) continue;

    // Openings that reach below the top of the panelling: doors break it, low windows stop it at their sill.
    const low = openings
      .filter((o) => o.wallId === wall.id && o.sill < height * 1000)
      .map((o) => ({ s0: o.offset - o.width / 2, s1: o.offset + o.width / 2, sill: o.sill / 1000 }))
      .sort((m, n) => m.s0 - n.s0);
    const runs: { r0: number; r1: number; h: number; cap: boolean }[] = [];
    let cursor = s0;
    for (const o of low) {
      if (o.s0 > cursor) runs.push({ r0: cursor, r1: Math.min(o.s0, s1), h: height, cap: true });
      // Under a window the boards stop at the sill; its frame finishes them.
      if (o.sill > 0.15) runs.push({ r0: Math.max(o.s0, s0), r1: Math.min(o.s1, s1), h: o.sill, cap: false });
      cursor = Math.max(cursor, o.s1);
    }
    if (cursor < s1) runs.push({ r0: cursor, r1: s1, h: height, cap: true });

    const entry = byWall.get(wall.id) ?? { wallId: wall.id, panels: [], caps: [] };
    const face = sign * (wall.thickness / 2);
    const place = (r0: number, r1: number, off: number): { x: number; z: number } => {
      const mid = (r0 + r1) / 2;
      return { x: (a.x + dx * mid - dy * off) / 1000, z: -(a.y + dy * mid + dx * off) / 1000 };
    };
    const rotationY = Math.atan2(dy, dx);
    for (const r of runs) {
      if (r.r1 - r.r0 < 20) continue;
      const boardTop = r.cap ? r.h - DADO_CAP.height : r.h;
      if (boardTop <= 0.02) continue;
      const w = (r.r1 - r.r0) / 1000;
      const at = place(r.r0, r.r1, face + sign * ((DADO_DEPTH * 1000) / 2));
      entry.panels.push({ size: [w, boardTop, DADO_DEPTH], position: [at.x, boardTop / 2, at.z], rotationY, u0: r.r0 / 1000 });
      if (r.cap) {
        const c = place(r.r0, r.r1, face + sign * ((DADO_CAP.depth * 1000) / 2));
        entry.caps.push({ size: [w, DADO_CAP.height, DADO_CAP.depth], position: [c.x, r.h - DADO_CAP.height / 2, c.z], rotationY });
      }
    }
    if (entry.panels.length || entry.caps.length) byWall.set(wall.id, entry);
  }
  return [...byWall.values()];
}
