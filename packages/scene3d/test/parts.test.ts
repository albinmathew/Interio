import { MATERIAL_LIST, buildLevelMesh, createSampleLevel, type Opening } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { SURFACE_TEXTURES, hexToLinear, tintToward, uvTransform } from '../src/materialSpecs';
import { DOOR_OPEN_DEG, doorLeafAngle, openingParts, railingParts, skirtingBoxes, stubBoxes } from '../src/parts';
import { fadeWalls, wallHidesRoom, WallFadeController } from '../src/wallFade';

const door = (hinge: 'a' | 'b', swing: 1 | -1): Opening => ({ id: 'o', wallId: 'w', offset: 2000, width: 900, height: 2100, sill: 0, kind: 'door', hinge, swing });

describe('hinged doors', () => {
  it.each([
    ['a', 1],
    ['a', -1],
    ['b', 1],
    ['b', -1],
  ] as const)('hinge %s, swing %i: hangs on the hinge jamb and opens into the swing side', (hinge, swing) => {
    const parts = openingParts(door(hinge, swing), 120, 3000, true)!;
    const leaf = parts.leaf[0]!;
    // Local frame: +X runs from vertex a to b, the wall's left side is -Z.
    const hingeX = hinge === 'a' ? -0.45 : 0.45;
    const swingZ = swing === 1 ? -1 : 1;
    // The leaf centre stays near the hinge jamb and lies well into the room it swings into.
    expect(Math.sign(leaf.position[0])).toBe(Math.sign(hingeX));
    expect(Math.abs(leaf.position[0] - hingeX)).toBeLessThan(0.2);
    expect(leaf.position[2] * swingZ).toBeGreaterThan(0.3);
    expect(Math.abs(leaf.rotationY!)).toBeCloseTo((DOOR_OPEN_DEG * Math.PI) / 180, 9);
    expect(leaf.rotationY).toBeCloseTo(doorLeafAngle(hinge, swing), 9);
    // Handles ride on the leaf, at its free edge.
    for (const h of parts.metal) expect(h.position[2] * swingZ).toBeGreaterThan(0.6);
  });

  it('closed doors fill the frame', () => {
    const parts = openingParts(door('a', 1), 120, 3000, false)!;
    const leaf = parts.leaf[0]!;
    expect(leaf.rotationY).toBe(0);
    expect(leaf.position[0]).toBeCloseTo(0, 2);
    expect(leaf.size[0]).toBeGreaterThan(0.78);
    expect(leaf.size[0]).toBeLessThan(0.82);
  });

  it('the frame lines the opening: two jambs and a head, proud of both wall faces', () => {
    const { frame } = openingParts(door('a', 1), 120, 3000)!;
    expect(frame).toHaveLength(3);
    for (const box of frame) expect(box.size[2]).toBeGreaterThan(0.12);
    expect(Math.max(...frame.map((b) => b.position[1] + b.size[1] / 2))).toBeCloseTo(2.1, 6);
  });
});

describe('other openings', () => {
  it('windows get a frame, glass and a mullion per bay, at sill height', () => {
    const w = openingParts({ id: 'o', wallId: 'w', offset: 0, width: 1800, height: 1200, sill: 900, kind: 'window' }, 200, 3000)!;
    expect(w.glass).toHaveLength(1);
    expect(w.glass[0]!.position[1]).toBeCloseTo(1.5, 6);
    // 4 frame members + 1 mullion (two bays) + window board.
    expect(w.frame).toHaveLength(6);
    expect(w.leaf).toHaveLength(0);
  });

  it('sliding doors have two glazed panels; open parks one over the other', () => {
    const o: Opening = { id: 'o', wallId: 'w', offset: 0, width: 3000, height: 2400, sill: 0, kind: 'sliding' };
    const shut = openingParts(o, 200, 3000, false)!;
    const open = openingParts(o, 200, 3000, true)!;
    expect(shut.glass).toHaveLength(2);
    expect(shut.glass[0]!.position[0]).toBeLessThan(0);
    expect(shut.glass[1]!.position[0]).toBeGreaterThan(0);
    // Panels run on separate tracks.
    expect(shut.glass[0]!.position[2]).not.toBe(shut.glass[1]!.position[2]);
    expect(open.glass[1]!.position[0]).toBeLessThan(shut.glass[1]!.position[0] - 1);
  });

  it('passages have no joinery, and openings taller than the wall are clamped', () => {
    expect(openingParts({ id: 'o', wallId: 'w', offset: 0, width: 1200, height: 2400, sill: 0, kind: 'passage' }, 120, 3000)).toBeNull();
    const tall = openingParts({ ...door('a', 1), height: 5000 }, 120, 2400)!;
    expect(Math.max(...tall.frame.map((b) => b.position[1] + b.size[1] / 2))).toBeCloseTo(2.4, 6);
  });

  it('railings have posts no further apart than a bay, a handrail and glass between posts', () => {
    const r = railingParts(5000, 1100);
    const posts = r.metal.filter((b) => b.size[0] < 0.1);
    expect(posts).toHaveLength(5);
    expect(r.glass).toHaveLength(4);
    expect(Math.max(...r.metal.map((b) => b.position[1] + b.size[1] / 2))).toBeCloseTo(1.1, 6);
  });
});

describe('skirting and stubs on the sample home', () => {
  const level = createSampleLevel();
  const mesh = buildLevelMesh(level);

  it('skirting runs along room-facing wall faces and stops at doors and passages', () => {
    const boxes = skirtingBoxes(level, mesh);
    expect(boxes.length).toBeGreaterThan(30);
    for (const o of Object.values(level.openings)) {
      if (o.sill > 0) continue;
      const wall = level.walls[o.wallId]!;
      const a = level.vertices[wall.a]!;
      const b = level.vertices[wall.b]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const c = { x: (a.x + ((b.x - a.x) / l) * o.offset) / 1000, z: -(a.y + ((b.y - a.y) / l) * o.offset) / 1000 };
      // No board passes within the wall's thickness of the middle of a doorway.
      for (const box of boxes) {
        const dx = c.x - box.position[0];
        const dz = c.z - box.position[2];
        const along = Math.abs(dx * Math.cos(box.rotationY!) - dz * Math.sin(box.rotationY!));
        const across = Math.abs(dx * Math.sin(box.rotationY!) + dz * Math.cos(box.rotationY!));
        expect(along < box.size[0] / 2 - 0.01 && across < wall.thickness / 1000).toBe(false);
      }
    }
  });

  it('stubs cover full-height walls only and leave doorways clear', () => {
    const boxes = stubBoxes(level);
    const walls = Object.values(level.walls).filter((w) => w.kind === 'wall');
    const floorOpenings = Object.values(level.openings).filter((o) => o.sill <= 0);
    // One box per wall plus one more for each floor-level opening that splits a wall.
    expect(boxes.length).toBe(walls.length + floorOpenings.length);
    expect(boxes.every((b) => b.size[1] === 0.1)).toBe(true);
  });
});

describe('cutaway', () => {
  const level = createSampleLevel();
  const mesh = buildLevelMesh(level);
  const walls = fadeWalls(level, mesh);
  const south = walls.filter((w) => Math.abs(w.az) < 1e-6 && Math.abs(w.bz) < 1e-6);
  const north = walls.filter((w) => Math.abs(w.az + 9) < 1e-6 && Math.abs(w.bz + 9) < 1e-6);
  const corridor = walls.filter((w) => Math.abs(w.az + 5.4) < 1e-6 && Math.abs(w.bz + 5.4) < 1e-6);

  it('finds the walls and never includes railings', () => {
    expect(south.length).toBeGreaterThan(0);
    expect(north.length).toBeGreaterThan(0);
    expect(corridor.length).toBeGreaterThan(0);
    expect(walls.length).toBe(Object.values(level.walls).filter((w) => w.kind === 'wall').length);
  });

  it('a camera in the south sees through the south wall and the corridor walls, not the north wall', () => {
    // World z is -y: south of the plan is +z.
    const cam = { x: 6, z: 14 };
    expect(south.every((w) => wallHidesRoom(w, cam.x, cam.z))).toBe(true);
    expect(corridor.every((w) => wallHidesRoom(w, cam.x, cam.z))).toBe(true);
    expect(north.some((w) => wallHidesRoom(w, cam.x, cam.z))).toBe(false);
  });

  it('from the north it is the other way round, and walls seen edge-on stay', () => {
    const cam = { x: 6, z: -24 };
    expect(north.every((w) => wallHidesRoom(w, cam.x, cam.z))).toBe(true);
    const west = walls.filter((w) => Math.abs(w.ax) < 1e-6 && Math.abs(w.bx) < 1e-6);
    expect(west.some((w) => wallHidesRoom(w, 0.5, 20))).toBe(false);
  });

  it('the controller fades registered materials and restores them when looking straight down', () => {
    const controller = new WallFadeController();
    controller.setWalls(walls);
    const material = { opacity: 1, transparent: false, depthWrite: true, visible: true, needsUpdate: false, userData: {} as Record<string, unknown> };
    controller.register(south[0]!.id, material as never);
    controller.update(true, 6, 14, 0.7, 0.016);
    expect(material.visible).toBe(false);
    expect(material.opacity).toBe(0);
    for (let i = 0; i < 80; i++) controller.update(true, 6, 14, 0.99, 0.016);
    expect(material.visible).toBe(true);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
  });

  it('leaves translucent materials translucent when their wall is fully shown', () => {
    const controller = new WallFadeController();
    controller.setWalls(walls);
    const glass = { opacity: 0.2, transparent: true, depthWrite: false, visible: true, needsUpdate: false, userData: {} as Record<string, unknown> };
    const overlay = { opacity: 1, transparent: true, depthWrite: false, visible: true, needsUpdate: false, userData: {} as Record<string, unknown> };
    controller.register(north[0]!.id, glass as never);
    controller.register(north[0]!.id, overlay as never);
    controller.update(true, 6, 14, 0.7, 0.016);
    expect(glass).toMatchObject({ opacity: 0.2, transparent: true, depthWrite: false, visible: true });
    expect(overlay).toMatchObject({ opacity: 1, transparent: true, depthWrite: false, visible: true });
  });
});

describe('finish textures', () => {
  it('every textured finish is a known finish id with a sensible tiling', () => {
    const ids = new Set(MATERIAL_LIST.map((m) => m.id));
    for (const [id, spec] of Object.entries(SURFACE_TEXTURES)) {
      expect(ids.has(id)).toBe(true);
      expect(spec.size).toBeGreaterThan(0.5);
      expect(uvTransform(spec).repeat).toBeCloseTo(1 / spec.size, 9);
    }
    // The brief's list: planks, tiles, marble, concrete, carpet, deck, brick, wall tile.
    for (const id of ['floor.oak', 'floor.tile.white', 'floor.marble', 'floor.concrete', 'floor.carpet.beige', 'floor.deck', 'wall.brick', 'wall.tile.white'])
      expect(SURFACE_TEXTURES[id]).toBeDefined();
  });

  it('tints a texture to the finish colour, without brightening past the cap', () => {
    // Same colour: no tint.
    expect(tintToward('#9c8164', '#9c8164')).toEqual([1, 1, 1]);
    // Darker target: plain ratio per channel.
    const dark = tintToward('#4e4032', '#9c8164');
    const t = hexToLinear('#4e4032');
    const a = hexToLinear('#9c8164');
    dark.forEach((v, i) => expect(v).toBeCloseTo(t[i]! / a[i]!, 9));
    // Much lighter target: capped, hue of the multiplier kept.
    const light = tintToward('#ffffff', '#404040', 1.6);
    expect(Math.max(...light)).toBeCloseTo(1.6, 9);
    expect(light[0]).toBeCloseTo(light[1]!, 9);
  });
});
