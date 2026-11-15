/**
 * Face mapping for murals: one picture across a whole wall face instead of a tiling
 * texture. Pure maths over the mesh data core builds (`buildLevelMesh`), whose wall-face
 * UVs are metres: `u` along the wall from its first vertex, `v` up from the floor.
 *
 * A mural keeps those UVs and moves the picture with the texture transform instead
 * (`offset` / `repeat`), so openings cut through it exactly where they cut the wall, and
 * the path tracer (which reads the same transform) shows it in the same place.
 */
import { MURAL_DADO_HEIGHT, type Id, type Level } from '@interio/core';

/** The part of a wall face a mural covers, in mesh UV units (metres). */
export interface FaceExtent {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Texture transform (three's `repeat` and `offset`; no rotation) that places a mural on a face. */
export interface MuralTransform {
  repeat: [number, number];
  offset: [number, number];
}

/** The UV bounds of a face's geometry (its whole rectangle, openings included). */
export function faceExtent(uvs: ArrayLike<number>): FaceExtent {
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let i = 0; i + 1 < uvs.length; i += 2) {
    u0 = Math.min(u0, uvs[i]!);
    u1 = Math.max(u1, uvs[i]!);
    v0 = Math.min(v0, uvs[i + 1]!);
    v1 = Math.max(v1, uvs[i + 1]!);
  }
  if (!Number.isFinite(u0)) return { u0: 0, u1: 1, v0: 0, v1: 1 };
  return { u0, u1, v0, v1 };
}

/** The part a mural covers: the whole face, or above the panelling when it has a dado. */
export function muralRegion(face: FaceExtent, dado: boolean): FaceExtent {
  if (!dado) return face;
  const top = MURAL_DADO_HEIGHT / 1000;
  // A wall lower than the panelling still shows a strip of mural rather than none.
  const v0 = Math.min(Math.max(face.v0, top), face.v1 - 0.05);
  return { ...face, v0 };
}

/**
 * Whether `u` runs right to left for someone facing the wall, so the picture must be
 * mirrored to read the right way round. Core numbers `u` from the wall's first vertex on
 * both faces, so exactly one face of each wall runs backwards. Reads the first triangle:
 * world positions (Y up), normals and UVs as `geometryFromMesh` passes them.
 */
export function faceRunsLeftward(positions: ArrayLike<number>, normals: ArrayLike<number>, uvs: ArrayLike<number>, indices?: ArrayLike<number>): boolean {
  const i0 = indices ? indices[0]! : 0;
  const i1 = indices ? indices[1]! : 1;
  const i2 = indices ? indices[2]! : 2;
  const p = (i: number) => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!] as const;
  const t = (i: number) => [uvs[i * 2]!, uvs[i * 2 + 1]!] as const;
  const [a, b, c] = [p(i0), p(i1), p(i2)];
  const [ta, tb, tc] = [t(i0), t(i1), t(i2)];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const du1 = tb[0] - ta[0];
  const dv1 = tb[1] - ta[1];
  const du2 = tc[0] - ta[0];
  const dv2 = tc[1] - ta[1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-12) return false;
  // Direction in which u grows: the tangent of the UV map.
  const tangent = [0, 1, 2].map((k) => (e1[k]! * dv2 - e2[k]! * dv1) / det);
  // Facing the wall (looking along -n, Y up), right is Y x n = (n.z, 0, -n.x).
  const nx = normals[i0 * 3]!;
  const nz = normals[i0 * 3 + 2]!;
  return tangent[0]! * nz + tangent[2]! * -nx < 0;
}

/**
 * The transform that covers `region` with a picture of aspect `imageAspect` (width over
 * height): the picture fills the region and keeps its proportions, cropped evenly on the
 * two sides that overflow (CSS `object-fit: cover`). `mirror` flips it left to right
 * (see `faceRunsLeftward`). Every point of the region maps inside 0..1, so the picture
 * never repeats or smears, whatever the texture's wrap mode.
 */
export function muralTransform(region: FaceExtent, imageAspect: number, mirror: boolean): MuralTransform {
  const w = Math.max(1e-6, region.u1 - region.u0);
  const h = Math.max(1e-6, region.v1 - region.v0);
  const faceAspect = w / h;
  const aspect = imageAspect > 0 && Number.isFinite(imageAspect) ? imageAspect : faceAspect;
  // Share of the picture's width and height that shows.
  const cs = faceAspect >= aspect ? 1 : faceAspect / aspect;
  const ct = faceAspect >= aspect ? aspect / faceAspect : 1;
  const sx = cs / w;
  const sy = ct / h;
  // s' = cs * (s - 0.5) + 0.5 with s = (u - u0) / w, or (u1 - u) / w when mirrored.
  const ox = mirror ? cs * (region.u1 / w - 0.5) + 0.5 : 0.5 - cs * (region.u0 / w + 0.5);
  const oy = 0.5 - ct * (region.v0 / h + 0.5);
  return { repeat: [mirror ? -sx : sx, sy], offset: [ox, oy] };
}

/** Where a mesh UV lands in the picture under a transform: the same sum three's texture matrix does. */
export function applyMuralTransform(t: MuralTransform, u: number, v: number): [number, number] {
  return [t.repeat[0] * u + t.offset[0], t.repeat[1] * v + t.offset[1]];
}

/**
 * The aspect a built-in mural is painted at for a face: the face's own, rounded so faces of
 * about the same shape share one painting. Built-in art is painted to fit, so the cover crop
 * trims only a sliver and the composition (a tree at each side) survives.
 */
export function paintAspect(region: FaceExtent): number {
  const a = (region.u1 - region.u0) / Math.max(1e-6, region.v1 - region.v0);
  return Math.min(4, Math.max(0.75, Math.round(a * 4) / 4));
}

/**
 * The run of wall a mural spans, in the `u` of wall `wallId` (metres from its first
 * vertex): the wall itself plus the walls joined to it end to end in a straight line whose
 * face on the same side shows the same finish. A plan often splits one straight wall into
 * pieces (where a partition meets it); the picture then runs across them all instead of
 * starting again on each piece.
 */
export function muralSpan(level: Pick<Level, 'walls' | 'vertices'>, wallId: Id, side: 'left' | 'right', finish: string): { u0: number; u1: number } | null {
  const wall = level.walls[wallId];
  const a = wall && level.vertices[wall.a];
  const b = wall && level.vertices[wall.b];
  if (!wall || !a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const along = (p: { x: number; y: number }) => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
  const off = (p: { x: number; y: number }) => Math.abs((p.x - a.x) * dir.y - (p.y - a.y) * dir.x);
  // A wall in line with this one, whose face on our side shows the same finish.
  const inLine = (id: Id): [number, number] | null => {
    const w = level.walls[id];
    const p = w && level.vertices[w.a];
    const q = w && level.vertices[w.b];
    if (!w || !p || !q || w.kind !== wall.kind || off(p) > 5 || off(q) > 5) return null;
    const same = (q.x - p.x) * dir.x + (q.y - p.y) * dir.y > 0;
    const theirSide = same ? side : side === 'left' ? 'right' : 'left';
    if ((theirSide === 'left' ? w.finishLeft : w.finishRight) !== finish) return null;
    return [Math.min(along(p), along(q)), Math.max(along(p), along(q))];
  };
  let s0 = 0;
  let s1 = len;
  const used = new Set<Id>([wallId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of Object.keys(level.walls)) {
      if (used.has(id)) continue;
      const r = inLine(id);
      // Joined end to end: it starts where the run ends (or ends where it starts).
      if (!r || (Math.abs(r[0] - s1) > 5 && Math.abs(r[1] - s0) > 5)) continue;
      used.add(id);
      s0 = Math.min(s0, r[0]);
      s1 = Math.max(s1, r[1]);
      grew = true;
    }
  }
  return { u0: s0 / 1000, u1: s1 / 1000 };
}
