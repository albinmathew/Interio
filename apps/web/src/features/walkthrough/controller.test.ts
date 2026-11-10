import { createSampleLevel, vec } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, isFree } from './collision';
import { RUN_SPEED, WALK_SPEED, WalkController } from './controller';
import { buildWorld, inRoomOrDoorway, standPoint } from './route';

const level = createSampleLevel();
const world = buildWorld(level);
const name = (id: string | null) => (id ? level.rooms[id]!.name : null);
const roomId = (roomName: string) => Object.values(level.rooms).find((r) => r.name === roomName)!.id;

/** Runs the controller at 60 fps for `seconds`. */
function run(c: WalkController, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += 1 / 60) {
    c.update(1 / 60);
    each?.();
  }
}

describe('walker', () => {
  it('starts in the foyer facing into the home', () => {
    const c = new WalkController(world);
    const s = c.getState();
    expect(name(s.roomId)).toBe('Foyer');
    expect(Math.abs(s.yawDeg)).toBeCloseTo(180, 3);
  });

  it('restores a saved pose, and ignores one that is no longer standable', () => {
    expect(new WalkController(world, { x: 6500, y: 2100, yawDeg: 90 }).getState()).toMatchObject({ x: 6500, y: 2100, yawDeg: 90 });
    expect(name(new WalkController(world, { x: 3000, y: 1000, yawDeg: 90 }).getState().roomId)).toBe('Foyer');
  });

  it('accelerates smoothly up to walking speed, faster with Shift', () => {
    const c = new WalkController(world, { x: 9000, y: 2100, yawDeg: 180 });
    c.input.forward = 1;
    c.update(1 / 60);
    const first = 9000 - c.x;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan((WALK_SPEED / 60) * 0.5);
    run(c, 1);
    const before = c.x;
    c.update(1 / 60);
    expect((before - c.x) * 60).toBeCloseTo(WALK_SPEED, -2);
    c.input.run = true;
    run(c, 1);
    const fast = c.x;
    c.update(1 / 60);
    expect((fast - c.x) * 60).toBeCloseTo(RUN_SPEED, -2);
    // Lets go: coasts to a stop without overshooting far.
    c.input.forward = 0;
    c.input.run = false;
    const released = c.x;
    run(c, 1);
    expect(released - c.x).toBeLessThan(500);
    const rest = c.x;
    c.update(1 / 60);
    expect(c.x).toBe(rest);
  });

  it('strafes to the right of where it faces and turns left with a positive turn', () => {
    const c = new WalkController(world, { x: 6500, y: 2100, yawDeg: 90 }); // facing +y
    c.input.strafe = 1;
    run(c, 0.5);
    expect(c.x).toBeGreaterThan(6600);
    expect(c.y).toBeCloseTo(2100, 3);
    c.input.strafe = 0;
    c.input.turn = 1;
    run(c, 0.2);
    expect(c.getState().yawDeg).toBeGreaterThan(95);
  });

  it('is stopped by a wall and slides along it, even on a very long frame', () => {
    const c = new WalkController(world, { x: 8800, y: 1000, yawDeg: 270 }); // facing the south wall
    c.input.forward = 1;
    c.input.run = true;
    for (let i = 0; i < 20; i++) c.update(5); // clamped, sub-stepped
    expect(c.y).toBeCloseTo(100 + PLAYER_RADIUS, 0);
    c.input.strafe = 1; // right of -y is -x
    run(c, 0.5);
    expect(c.y).toBeCloseTo(100 + PLAYER_RADIUS, 0);
    expect(c.x).toBeLessThan(8500);
  });

  it('walks through the foyer passage and reports the room change', () => {
    const c = new WalkController(world);
    const seen: (string | null)[] = [];
    c.subscribe(() => seen.push(name(c.roomId)));
    const moved = c.moveBy(-3000, 0);
    expect(moved.blocked).toBe(false);
    expect(name(moved.roomId)).toBe('Living / Dining');
    expect(seen).toEqual(['Living / Dining']);
  });

  it('teleports to a free point exactly and out of walls otherwise', () => {
    const c = new WalkController(world);
    expect(c.teleport({ x: 1500, y: 2000 })).toMatchObject({ x: 1500, y: 2000 });
    expect(name(c.roomId)).toBe('Kitchen');
    const s = c.teleport({ x: 3000, y: 1000 }); // inside the kitchen wall
    expect(isFree(world.collider, s, PLAYER_RADIUS - 5)).toBe(true);
    expect(vec.dist(s, { x: 3000, y: 1000 })).toBeLessThan(600);
    const far = c.teleport({ x: -5000, y: 20_000 }); // nowhere near the home
    expect(inRoomOrDoorway(level, world.rooms, far)).toBe(true);
  });

  it('click-to-move walks a straight line and stops at the obstacle', () => {
    const c = new WalkController(world, { x: 6500, y: 2100, yawDeg: 0 });
    c.walkTo({ x: 8000, y: 3000 });
    run(c, 4);
    expect(c.target).toBeNull();
    expect(vec.dist(c, { x: 8000, y: 3000 })).toBeLessThan(30);
    // Through the wall into the kitchen: stops short of the wall (face at x = 3060).
    c.teleport({ x: 5000, y: 1000 });
    c.walkTo({ x: 1500, y: 1000 });
    run(c, 4);
    expect(c.target).toBeNull();
    expect(c.x).toBeGreaterThanOrEqual(3060 + PLAYER_RADIUS - 2);
    expect(c.x).toBeLessThan(3060 + PLAYER_RADIUS + 80);
    // A key press cancels the walk.
    c.walkTo({ x: 9000, y: 1000 });
    c.input.forward = 1;
    c.update(1 / 60);
    expect(c.target).toBeNull();
  });

  it('jumps to a room with a fade', () => {
    const c = new WalkController(world);
    expect(c.jumpToRoom(roomId('Bedroom 2'))).toBe(true);
    c.update(1 / 60);
    expect(c.fade).toBeGreaterThan(0);
    expect(name(c.roomId)).toBe('Foyer');
    run(c, 1);
    expect(c.fade).toBe(0);
    expect(name(c.roomId)).toBe('Bedroom 2');
    expect(c.jumpNear({ x: 1500, y: 2000 })).toBe(true);
    run(c, 1);
    expect(name(c.roomId)).toBe('Kitchen');
  });
});

describe('guided tour playback', () => {
  it('walks through every room once, never leaving the home, and ends', () => {
    const c = new WalkController(world, { x: 1500, y: 2000, yawDeg: 0 }); // start somewhere else
    expect(c.startTour()).toBe(true);
    let frames = 0;
    let worstStep = 0;
    let last = { x: c.x, y: c.y };
    let jumping = true;
    while (c.tourState().status === 'playing' && frames < 60 * 600) {
      c.update(1 / 60);
      frames++;
      expect(inRoomOrDoorway(level, world.rooms, c), `outside at ${c.x},${c.y}`).toBe(true);
      expect(isFree(world.collider, c, PLAYER_RADIUS - 10), `in a wall at ${c.x},${c.y}`).toBe(true);
      if (!jumping) worstStep = Math.max(worstStep, vec.dist(last, c));
      jumping = c.fade > 0;
      last = { x: c.x, y: c.y };
    }
    const end = c.tourState();
    expect(end.status).toBe('ended');
    expect(end.visited).toHaveLength(10);
    expect(new Set(end.visited).size).toBe(10);
    expect(name(end.visited[0]!)).toBe('Foyer');
    expect(worstStep).toBeLessThan(25); // 1.2 m/s at 60 fps: it walked, it did not teleport
    expect(frames / 60).toBeGreaterThan(60);
    expect(frames / 60).toBeLessThan(240);
    // Finished: the walker has the controls back, and walking off clears the finished state.
    expect(c.manual).toBe(true);
    c.input.forward = 1;
    c.update(1 / 60);
    expect(c.tourState()).toMatchObject({ status: 'idle', visited: [] });
  });

  it('runs at any speed setting and frame rate', () => {
    const c = new WalkController(world);
    c.startTour({ speed: 25 });
    let frames = 0;
    while (c.tourState().status === 'playing' && frames++ < 2000) {
      c.update(0.1);
      expect(inRoomOrDoorway(level, world.rooms, c)).toBe(true);
    }
    expect(c.tourState()).toMatchObject({ status: 'ended', total: 10, speed: 25 });
    expect(new Set(c.tourState().visited).size).toBe(10);
  });

  it('pans a full turn at each stop and reports phase and room', () => {
    const c = new WalkController(world);
    c.startTour();
    const phases = new Set<string>();
    let turned = 0;
    let yaw = c.yaw;
    while (c.tourState().index === 0 && c.tourState().status === 'playing') {
      c.update(1 / 30);
      const s = c.tourState();
      if (s.phase) phases.add(s.phase);
      if (s.phase === 'look') {
        let d = c.yaw - yaw;
        if (d < -Math.PI) d += 2 * Math.PI;
        if (d > Math.PI) d -= 2 * Math.PI;
        turned += d;
      }
      yaw = c.yaw;
    }
    expect([...phases].sort()).toEqual(['look', 'walk']);
    expect((turned * 180) / Math.PI).toBeCloseTo(360, 0);
    expect(name(c.tourState().roomId)).toBe('Living / Dining');
    expect(c.tourState().visited.map(name)).toEqual(['Foyer']);
  });

  it('ignores manual input while playing, and hands control back when paused', () => {
    const c = new WalkController(world);
    c.startTour();
    run(c, 1);
    c.pauseTour();
    expect(c.tourState().status).toBe('paused');
    const at = { x: c.x, y: c.y };
    run(c, 0.5);
    expect(vec.dist(at, c)).toBeLessThan(1);
    c.input.forward = 1;
    run(c, 0.5);
    expect(vec.dist(at, c)).toBeGreaterThan(200);
    c.input.forward = 0;
    c.resumeTour();
    c.input.strafe = 1;
    const yaw = c.yaw;
    c.look(1, 0);
    expect(c.yaw).toBe(yaw);
    c.input.strafe = 0;
    // Wandering off while paused does not break the tour: it re-routes and finishes.
    c.tourSpeed = 20;
    for (let i = 0; i < 5000 && c.tourState().status === 'playing'; i++) c.update(0.05);
    expect(c.tourState().status).toBe('ended');
    expect(new Set(c.tourState().visited).size).toBe(10);
  });

  it('skips forwards and backwards between stops and stops on request', () => {
    const c = new WalkController(world);
    c.startTour();
    run(c, 0.5);
    c.nextStop();
    run(c, 1);
    expect(c.tourState()).toMatchObject({ index: 1, phase: 'look' });
    expect(name(c.roomId)).toBe('Living / Dining');
    expect(vec.dist(c, standPoint(world, roomId('Living / Dining'))!)).toBeLessThan(1);
    c.previousStop();
    run(c, 1);
    expect(c.tourState().index).toBe(0);
    expect(name(c.roomId)).toBe('Foyer');
    c.stopTour();
    expect(c.tourState()).toMatchObject({ status: 'idle', phase: null });
    // Skipping past the last stop ends the tour.
    c.startTour();
    let skips = 0;
    while (c.tourState().status === 'playing' && skips++ < 20) {
      c.nextStop();
      run(c, 0.6);
    }
    expect(skips).toBe(11); // to the first stop, nine more, then off the end
    expect(c.tourState().status).toBe('ended');
  });

  it('pauses when the walker jumps to a room mid-tour', () => {
    const c = new WalkController(world);
    c.startTour();
    run(c, 1);
    c.jumpToRoom(roomId('Kitchen'));
    run(c, 1);
    expect(c.tourState().status).toBe('paused');
    expect(name(c.roomId)).toBe('Kitchen');
  });
});
