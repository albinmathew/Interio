import { MURAL_DADO_HEIGHT, buildLevel, buildLevelMesh, createSampleLevel, type Level, type MeshGroup } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { DADO_CAP, DADO_DEPTH, dadoParts } from '../src/dado';
import { applyMuralTransform, faceExtent, faceRunsLeftward, muralRegion, muralSpan, muralTransform, paintAspect, type FaceExtent } from '../src/muralSpecs';
import { PATTERNS } from '../src/texturePixels';

const face: FaceExtent = { u0: 1.2, u1: 4.8, v0: 0, v1: 2.7 };

const corners = (r: FaceExtent): [number, number][] => [
  [r.u0, r.v0],
  [r.u1, r.v0],
  [r.u0, r.v1],
  [r.u1, r.v1],
];

describe('mural face mapping', () => {
  it.each([
    ['a wide picture on a squarer wall', 2.4],
    ['a tall picture', 0.7],
    ['a picture of the same shape', 3.6 / 2.7],
  ])('%s: covers the face without stretching, cropped evenly, never outside the picture', (_, aspect) => {
    for (const mirror of [false, true]) {
      const t = muralTransform(face, aspect, mirror);
      const pts = corners(face).map(([u, v]) => applyMuralTransform(t, u, v));
      for (const [s, q] of pts) {
        expect(s).toBeGreaterThanOrEqual(-1e-9);
        expect(s).toBeLessThanOrEqual(1 + 1e-9);
        expect(q).toBeGreaterThanOrEqual(-1e-9);
        expect(q).toBeLessThanOrEqual(1 + 1e-9);
      }
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const shownW = Math.max(...xs) - Math.min(...xs);
      const shownH = Math.max(...ys) - Math.min(...ys);
      // One side fills the picture exactly (cover), the other is cropped.
      expect(Math.max(shownW, shownH)).toBeCloseTo(1, 9);
      // No stretch: a metre across the wall covers as many picture pixels as a metre up it.
      expect((Math.abs(t.repeat[0]) * aspect) / t.repeat[1]).toBeCloseTo(1, 9);
      // The crop is centred.
      expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0.5, 9);
      expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0.5, 9);
    }
  });

  it('mirroring flips left and right only', () => {
    const plain = muralTransform(face, 2, false);
    const flipped = muralTransform(face, 2, true);
    const [l, b] = applyMuralTransform(plain, face.u0, face.v0);
    const [lf, bf] = applyMuralTransform(flipped, face.u1, face.v0);
    expect(lf).toBeCloseTo(l, 9);
    expect(bf).toBeCloseTo(b, 9);
  });

  it('a dado puts the picture above the panelling', () => {
    const r = muralRegion(face, true);
    expect(r.v0).toBeCloseTo(MURAL_DADO_HEIGHT / 1000, 9);
    expect(r.v1).toBe(face.v1);
    expect(muralRegion(face, false)).toEqual(face);
    // The bottom of the picture sits on the cap rail.
    const t = muralTransform(r, 2, false);
    expect(applyMuralTransform(t, r.u0, r.v0)[1]).toBeGreaterThanOrEqual(-1e-9);
    // A wall lower than the panelling keeps a strip of mural.
    expect(muralRegion({ ...face, v1: 1 }, true).v0).toBeLessThan(1);
  });

  it('built-in art is painted at about the shape of the face', () => {
    expect(paintAspect(face)).toBe(1.25);
    expect(paintAspect(muralRegion(face, true))).toBe(2.25);
    expect(paintAspect({ u0: 0, u1: 20, v0: 0, v1: 1 })).toBe(4);
  });

  describe('on the sample home', () => {
    const level: Level = createSampleLevel();
    const mesh = buildLevelMesh(level);
    const sides = mesh.groups.filter((g) => g.kind === 'wallSide');

    /** World direction someone facing the face has on their right: Y x n. */
    const right = (g: MeshGroup): [number, number] => {
      const n = g.geometry.normals;
      return [n[2]!, -n[0]!];
    };

    it('exactly one face of each wall runs leftward, and the mirrored mapping reads left to right on both', () => {
      const byWall = new Map<string, boolean[]>();
      for (const g of sides) {
        const { positions, normals, uvs, indices } = g.geometry;
        const mirror = faceRunsLeftward(positions, normals, uvs, indices);
        byWall.set(g.wallId!, [...(byWall.get(g.wallId!) ?? []), mirror]);
        // Walk the vertices: picture x must grow towards the viewer's right.
        const t = muralTransform(faceExtent(uvs), 2, mirror);
        const [rx, rz] = right(g);
        let lo = { s: Infinity, d: 0 };
        let hi = { s: -Infinity, d: 0 };
        for (let i = 0; i < uvs.length / 2; i++) {
          const s = applyMuralTransform(t, uvs[i * 2]!, uvs[i * 2 + 1]!)[0];
          const d = positions[i * 3]! * rx + positions[i * 3 + 2]! * rz;
          if (s < lo.s) lo = { s, d };
          if (s > hi.s) hi = { s, d };
        }
        expect(hi.d, g.key).toBeGreaterThan(lo.d);
      }
      for (const [wall, flags] of byWall) if (flags.length === 2) expect(flags.filter(Boolean).length, wall).toBe(1);
    });

    it('openings cut the picture where they cut the wall: the face extent spans the whole wall, window or not', () => {
      // Bedroom 1's north wall has a window; its face still maps the picture over the full wall.
      const north = sides.find((g) => g.roomId && Object.values(level.openings).some((o) => o.wallId === g.wallId && o.kind === 'window'))!;
      const e = faceExtent(north.geometry.uvs);
      const wall = level.walls[north.wallId!]!;
      expect(e.v0).toBeCloseTo(0, 6);
      expect(e.v1).toBeCloseTo(wall.height / 1000, 6);
      const a = level.vertices[wall.a]!;
      const b = level.vertices[wall.b]!;
      expect(e.u1 - e.u0).toBeGreaterThan(Math.hypot(b.x - a.x, b.y - a.y) / 1000 - 0.3);
    });
  });
});

describe('panelling under a mural', () => {
  /** Sample level with a mural over beadboard on every face of Bedroom 1. */
  const setup = () => {
    const level = createSampleLevel();
    const room = Object.values(level.rooms).find((r) => r.name === 'Bedroom 1')!;
    const mesh = buildLevelMesh(level);
    const faces = mesh.groups.filter((g) => g.kind === 'wallSide' && g.roomId === room.id);
    for (const g of faces) level.walls[g.wallId!]![g.side === 'left' ? 'finishLeft' : 'finishRight'] = 'mural:pic:dado';
    return { level, mesh, faces };
  };

  it('runs along every face with a dado mural, and only there', () => {
    const { level, mesh, faces } = setup();
    const parts = dadoParts(level, mesh);
    expect(new Set(parts.map((p) => p.wallId))).toEqual(new Set(faces.map((f) => f.wallId)));
    for (const p of parts) {
      for (const panel of p.panels) {
        expect(panel.size[2]).toBe(DADO_DEPTH);
        expect(panel.position[1] + panel.size[1] / 2).toBeLessThanOrEqual(MURAL_DADO_HEIGHT / 1000 + 1e-9);
      }
      for (const cap of p.caps) expect(cap.position[1] + cap.size[1] / 2).toBeCloseTo(MURAL_DADO_HEIGHT / 1000, 9);
    }
    // Without the dado there is no panelling.
    for (const f of faces) level.walls[f.wallId!]![f.side === 'left' ? 'finishLeft' : 'finishRight'] = 'mural:pic';
    expect(dadoParts(level, mesh)).toEqual([]);
  });

  it('breaks at the door, stops under the window at its sill, and sits on the room side', () => {
    const { level, mesh } = setup();
    const parts = dadoParts(level, mesh);
    const room = Object.values(level.rooms).find((r) => r.name === 'Bedroom 1')!;
    const door = Object.values(level.openings).find((o) => o.kind === 'door' && parts.some((p) => p.wallId === o.wallId))!;
    const doorWall = parts.find((p) => p.wallId === door.wallId)!;
    // Two runs either side of the door, each with a cap rail.
    expect(doorWall.panels.length).toBe(2);
    expect(doorWall.caps.length).toBe(2);
    const window = Object.values(level.openings).find((o) => o.kind === 'window' && parts.some((p) => p.wallId === o.wallId))!;
    const windowWall = parts.find((p) => p.wallId === window.wallId)!;
    const under = windowWall.panels.find((p) => Math.abs(p.size[1] - window.sill / 1000) < 1e-6)!;
    expect(under).toBeDefined();
    expect(under.size[0]).toBeCloseTo(window.width / 1000, 3);
    expect(windowWall.caps.length).toBe(2);
    const full = windowWall.panels.filter((p) => p !== under);
    for (const p of full) expect(p.size[1]).toBeCloseTo(MURAL_DADO_HEIGHT / 1000 - DADO_CAP.height, 9);
    // Inside Bedroom 1 (x 0..3800, y 5400..9000 in plan; world z = -y).
    for (const p of parts.flatMap((d) => d.panels)) {
      expect(p.position[0]).toBeGreaterThan(0);
      expect(p.position[0]).toBeLessThan(3.8);
      expect(-p.position[2]).toBeGreaterThan(5.4);
      expect(-p.position[2]).toBeLessThan(9);
    }
    expect(room).toBeDefined();
  });
});

describe('beadboard', () => {
  it('has one groove per 10 cm board', () => {
    const field = PATTERNS.beadboard(12);
    let grooves = 0;
    const n = 1200;
    for (let i = 0; i < n; i++) {
      const low = field(i / n, 0.5) < 0.3;
      const prev = field((i - 1 + n) / n, 0.5) < 0.3;
      if (low && !prev) grooves++;
    }
    expect(grooves).toBe(12);
  });
});

describe('muralSpan', () => {
  // One straight 4 m wall in two pieces (a partition meets it at x = 1.5 m), and a wall round the corner.
  const level = buildLevel({
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 1500, y: 0 }, thickness: 150 },
      { a: { x: 1500, y: 0 }, b: { x: 4000, y: 0 }, thickness: 150 },
      { a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 }, thickness: 150 },
      { a: { x: 1500, y: 0 }, b: { x: 1500, y: 3000 }, thickness: 100 },
    ],
  });
  const [w1, w2, corner] = Object.values(level.walls);

  it('runs across in-line pieces of wall showing the same mural on the same side', () => {
    for (const w of [w1!, w2!]) w.finishLeft = 'wall.mural.meadow.dado';
    corner!.finishLeft = 'wall.mural.meadow.dado';
    // In the u of each piece: the whole 4 m run, from where that piece starts.
    expect(muralSpan(level, w1!.id, 'left', 'wall.mural.meadow.dado')).toEqual({ u0: 0, u1: 4 });
    expect(muralSpan(level, w2!.id, 'left', 'wall.mural.meadow.dado')).toEqual({ u0: -1.5, u1: 2.5 });
  });

  it('stops at a different finish, the other side, or a corner', () => {
    w2!.finishLeft = 'wall.mural.meadow';
    expect(muralSpan(level, w1!.id, 'left', 'wall.mural.meadow.dado')).toEqual({ u0: 0, u1: 1.5 });
    w2!.finishLeft = undefined;
    w2!.finishRight = 'wall.mural.meadow.dado';
    expect(muralSpan(level, w1!.id, 'left', 'wall.mural.meadow.dado')).toEqual({ u0: 0, u1: 1.5 });
  });
});
