/**
 * The walker: position, heading, movement with collision, click-to-move, fade
 * jumps and the guided tour. No React and no DOM, so tests drive it directly;
 * the React layer feeds it input and copies its pose to the camera every frame.
 */
import { vec, type Id, type Pt } from '@interio/core';
import { isFree, moveCapsule, overlaps, resolvePosition, sweep } from './collision';
import { findPath, isWalkable, nearestWalkable, pathLength, pointAlong } from './nav';
import { inRoomOrDoorway, landingNear, planTour, roomAtPoint, roomPose, startPose, type Pose, type TourPlan, type WalkWorld } from './route';

export const WALK_SPEED = 1500; // mm/s
export const RUN_SPEED = 3200;
const TURN_RATE = 1.9; // rad/s, keyboard turning
const ACCELERATION = 0.14; // s to close most of the gap to the wanted speed
const BRAKING = 0.09;
const MAX_PITCH = 1.3;
const FADE_OUT = 0.16; // s
const FADE_IN = 0.24;

const TOUR_SPEED = 1200; // mm/s at 1x
const TOUR_PAN_RATE = 55; // degrees per second at 1x
const TOUR_TURN_RATE = 150;
const TOUR_SETTLE = 0.5; // s standing still before and after the pan
const TOUR_LOOK_AHEAD = 800; // mm
const TOUR_PITCH = -0.04;

export interface WalkState {
  x: number;
  y: number;
  yawDeg: number;
  roomId: Id | null;
}

export type TourStatus = 'idle' | 'playing' | 'paused' | 'ended';
export type TourPhase = 'walk' | 'look' | 'jump';

export interface TourState {
  status: TourStatus;
  /** Index of the stop being walked to or looked at. */
  index: number;
  total: number;
  phase: TourPhase | null;
  /** Room of that stop. */
  roomId: Id | null;
  /** Rooms reached so far, in order. */
  visited: Id[];
  speed: number;
}

export interface WalkInput {
  /** -1..1 each; keyboard and joystick are summed by the input layer. */
  forward: number;
  strafe: number;
  /** -1..1, positive turns left. */
  turn: number;
  run: boolean;
}

const wrap = (rad: number): number => {
  const t = (rad + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const smooth = (u: number) => u * u * (3 - 2 * u);

interface Tour {
  plan: TourPlan;
  status: 'playing' | 'paused';
  index: number;
  phase: TourPhase;
  visited: Id[];
  path: Pt[];
  length: number;
  /** Distance walked along `path`. */
  s: number;
  /** Still turning to face the path before setting off. */
  turning: boolean;
  /** Seconds into the look phase, and the heading the pan started from. */
  t: number;
  panFrom: number;
  /** Where the walker stood when the tour was paused. */
  pausedAt: Pt | null;
}

export class WalkController {
  world: WalkWorld;
  x = 0;
  y = 0;
  /** Heading in plan radians, counter-clockwise from +x. */
  yaw = 0;
  pitch = 0;
  readonly input: WalkInput = { forward: 0, strafe: 0, turn: 0, run: false };
  /** Click-to-move destination. */
  target: Pt | null = null;
  roomId: Id | null = null;
  /** 0 clear .. 1 fully faded out. */
  fade = 0;
  tourSpeed = 1;

  private vx = 0;
  private vy = 0;
  private stuck = 0;
  private pendingJump: Pose | null = null;
  private tour: Tour | null = null;
  private ended: { total: number; visited: Id[] } | null = null;
  private readonly changeListeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();

  constructor(world: WalkWorld, pose?: Pose | null) {
    this.world = world;
    const at = (pose && this.usable(pose) ? pose : null) ?? startPose(world);
    if (at) this.place(at, at.yawDeg);
  }

  /* ------------------------------------------------------------- plumbing */

  /** Discrete changes: current room, tour state, click target. */
  subscribe(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Called at the end of every `update`. */
  onFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.changeListeners) fn();
  }

  /** The level changed under the walker: keep the pose if it is still valid. */
  setWorld(world: WalkWorld): void {
    const pose = this.pose();
    this.world = world;
    this.stopTour();
    this.target = null;
    const at = this.usable(pose) ? pose : (startPose(world) ?? pose);
    this.place(at, at.yawDeg);
    this.changed();
  }

  private usable(p: Pt): boolean {
    return isWalkable(this.world.nav, p) && !overlaps(this.world.collider, p);
  }

  pose(): Pose {
    return { x: this.x, y: this.y, yawDeg: deg(this.yaw) };
  }

  getState(): WalkState {
    return { x: this.x, y: this.y, yawDeg: deg(wrap(this.yaw)), roomId: this.roomId };
  }

  private place(p: Pt, yawDeg?: number): void {
    this.x = p.x;
    this.y = p.y;
    if (yawDeg !== undefined) this.yaw = rad(yawDeg);
    this.vx = this.vy = 0;
    this.trackRoom();
  }

  private trackRoom(): boolean {
    const room = roomAtPoint(this.world, this)?.roomId ?? null;
    // In a doorway on the outer wall there is no polygon underfoot: keep the last room.
    if (room === null || room === this.roomId) return false;
    this.roomId = room;
    return true;
  }

  /* ------------------------------------------------------------- movement */

  /**
   * Puts the walker at `p` at once. A point inside a wall or a piece of
   * furniture is moved to the nearest place a person can stand.
   */
  teleport(p: Pt, yawDeg?: number): WalkState {
    const { level, rooms, collider, nav } = this.world;
    const standable = (q: Pt) => inRoomOrDoorway(level, rooms, q) && isFree(collider, q, collider.radius - 5);
    let at: Pt | null = p;
    if (!standable(p)) {
      const pushed = resolvePosition(collider, p);
      at = pushed.ok && standable(pushed.pos) ? pushed.pos : (landingNear(this.world, p) ?? nearestWalkable(nav, p));
    }
    if (at) {
      this.target = null;
      this.pendingJump = null;
      this.place(at, yawDeg);
      this.changed();
    }
    return this.getState();
  }

  /** Fades out, moves, fades back in. */
  jumpTo(pose: Pose): void {
    this.pendingJump = pose;
    this.target = null;
  }

  jumpToRoom(roomId: Id): boolean {
    const here = isWalkable(this.world.nav, this) ? this.world.nav.component[this.cell()] : undefined;
    const pose = roomPose(this.world, roomId, here);
    if (!pose) return false;
    if (this.tour) this.pauseTour();
    this.jumpTo(pose);
    return true;
  }

  /** Jump to a point picked on the minimap, keeping the heading. */
  jumpNear(p: Pt): boolean {
    const at = landingNear(this.world, p);
    if (!at) return false;
    if (this.tour) this.pauseTour();
    this.jumpTo({ ...at, yawDeg: deg(this.yaw) });
    return true;
  }

  private cell(): number {
    const g = this.world.nav;
    return Math.floor((this.y - g.minY) / g.cell) * g.cols + Math.floor((this.x - g.minX) / g.cell);
  }

  /** Moves by a plan-space offset through the collision code. Used by tests and the debug hook. */
  moveBy(dx: number, dy: number): WalkState & { blocked: boolean } {
    const { pos, blocked } = moveCapsule(this.world.collider, this, { x: dx, y: dy });
    this.x = pos.x;
    this.y = pos.y;
    if (this.trackRoom()) this.changed();
    return { ...this.getState(), blocked };
  }

  look(dYaw: number, dPitch: number): void {
    if (this.tour?.status === 'playing') return;
    this.yaw = wrap(this.yaw + dYaw);
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dPitch));
  }

  /** Click-to-move: walk in a straight line towards `p`, stopping at the first obstacle. */
  walkTo(p: Pt): void {
    if (this.tour?.status === 'playing') return;
    const { end } = sweep(this.world.collider, this, p);
    this.target = vec.dist(end, this) > 60 ? end : null;
    this.stuck = 0;
    this.changed();
  }

  get manual(): boolean {
    return this.tour?.status !== 'playing' && !this.pendingJump;
  }

  update(dt: number): void {
    const step = Math.max(0, Math.min(dt, 0.25));
    this.updateFade(step);
    if (this.tour?.status === 'playing') this.updateTour(step * this.tourSpeed);
    else if (!this.pendingJump) this.updateManual(step);
    for (const fn of this.frameListeners) fn();
  }

  private updateFade(dt: number): void {
    if (this.pendingJump) {
      this.fade = Math.min(1, this.fade + dt / FADE_OUT);
      if (this.fade >= 1) {
        const pose = this.pendingJump;
        this.pendingJump = null;
        this.pitch = 0;
        this.teleport(pose, pose.yawDeg);
      }
    } else if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / FADE_IN);
    }
  }

  private updateManual(dt: number): void {
    const { input } = this;
    if (input.turn) this.yaw = wrap(this.yaw + input.turn * TURN_RATE * dt);
    const top = input.run ? RUN_SPEED : WALK_SPEED;
    let wx = 0;
    let wy = 0;
    if (input.forward || input.strafe) {
      if (this.target) {
        this.target = null;
        this.changed();
      }
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      // Forward is (c, s); right of that is (s, -c).
      wx = c * input.forward + s * input.strafe;
      wy = s * input.forward - c * input.strafe;
      const l = Math.hypot(wx, wy);
      const k = top * Math.min(1, l) / (l || 1);
      wx *= k;
      wy *= k;
    } else if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 25) {
        this.target = null;
        this.changed();
      } else {
        const v = Math.min(top, Math.max(250, d * 5)); // ease into the destination
        wx = (dx / d) * v;
        wy = (dy / d) * v;
      }
    }
    const wanted = Math.hypot(wx, wy);
    const k = 1 - Math.exp(-dt / (wanted > Math.hypot(this.vx, this.vy) ? ACCELERATION : BRAKING));
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed < 8 && wanted === 0) {
      this.vx = this.vy = 0;
      return;
    }
    const from = { x: this.x, y: this.y };
    const { pos, blocked } = moveCapsule(this.world.collider, from, { x: this.vx * dt, y: this.vy * dt });
    this.x = pos.x;
    this.y = pos.y;
    if (blocked && dt > 0) {
      // Keep only the part of the velocity that actually moved us (the slide along the wall).
      this.vx = (pos.x - from.x) / dt;
      this.vy = (pos.y - from.y) / dt;
      if (this.target) {
        this.stuck += dt;
        if (this.stuck > 0.3) {
          this.target = null;
          this.changed();
        }
      }
    } else this.stuck = 0;
    if (this.trackRoom()) this.changed();
  }

  /* ----------------------------------------------------------------- tour */

  tourState(): TourState {
    const t = this.tour;
    if (!t) {
      return {
        status: this.ended ? 'ended' : 'idle',
        index: this.ended ? this.ended.total - 1 : 0,
        total: this.ended?.total ?? 0,
        phase: null,
        roomId: null,
        visited: this.ended?.visited ?? [],
        speed: this.tourSpeed,
      };
    }
    return {
      status: t.status,
      index: Math.max(0, t.index),
      total: t.plan.stops.length,
      phase: t.phase,
      roomId: t.plan.stops[Math.max(0, t.index)]?.roomId ?? null,
      visited: [...t.visited],
      speed: this.tourSpeed,
    };
  }

  /** Starts the tour from the entrance. False when there is nothing to tour. */
  startTour(opts: { speed?: number } = {}): boolean {
    if (opts.speed !== undefined) this.tourSpeed = opts.speed;
    const plan = planTour(this.world);
    if (!plan || plan.stops.length === 0) return false;
    this.ended = null;
    this.target = null;
    this.vx = this.vy = 0;
    // Index -1 is "getting to the start": the first leg begins once any fade has finished.
    this.tour = { plan, status: 'playing', index: -1, phase: 'jump', visited: [], path: [], length: 0, s: 0, turning: false, t: 0, panFrom: 0, pausedAt: null };
    if (vec.dist(this, plan.start) > 400) this.jumpTo(plan.start);
    else this.pendingJump = null;
    this.changed();
    return true;
  }

  pauseTour(): void {
    if (this.tour?.status !== 'playing') return;
    this.tour.status = 'paused';
    this.tour.pausedAt = { x: this.x, y: this.y };
    this.changed();
  }

  resumeTour(): void {
    const t = this.tour;
    if (!t || t.status !== 'paused') return;
    t.status = 'playing';
    this.target = null;
    this.vx = this.vy = 0;
    const moved = !t.pausedAt || vec.dist(t.pausedAt, this) > 50;
    if (t.index >= 0 && (t.phase === 'walk' || moved)) this.enterLeg(t, t.index);
    else if (t.phase === 'look') {
      // Carry on panning from wherever the walker is looking now.
      t.panFrom = this.yaw - this.panAngle(t.t);
    }
    this.changed();
  }

  nextStop(): void {
    const t = this.tour;
    if (!t) return;
    if (t.index + 1 >= t.plan.stops.length) this.finishTour(t);
    else this.skipTo(t, t.index + 1);
  }

  previousStop(): void {
    const t = this.tour;
    if (t) this.skipTo(t, Math.max(0, t.index - 1));
  }

  stopTour(): void {
    if (!this.tour && !this.ended) return;
    this.tour = null;
    this.ended = null;
    this.changed();
  }

  private skipTo(t: Tour, index: number): void {
    const stop = t.plan.stops[index]!;
    t.index = index;
    t.phase = 'jump';
    t.pausedAt = null;
    this.jumpTo({ ...stop.eye, yawDeg: stop.viewDeg });
    this.changed();
  }

  private finishTour(t: Tour): void {
    this.ended = { total: t.plan.stops.length, visited: [...t.visited] };
    this.tour = null;
    this.changed();
  }

  /** Sets off towards stop `index` from wherever the walker is. */
  private enterLeg(t: Tour, index: number): void {
    const stop = t.plan.stops[index]!;
    t.index = index;
    const here = { x: this.x, y: this.y };
    const planned = stop.leg.points;
    const path = !stop.leg.jump && planned.length > 0 && vec.dist(planned[0]!, here) < 30 ? planned : findPath(this.world.nav, here, stop.eye);
    if (!path) {
      t.phase = 'jump';
      this.jumpTo({ ...stop.eye, yawDeg: stop.viewDeg });
    } else {
      t.phase = 'walk';
      t.path = path;
      t.length = pathLength(path);
      t.s = 0;
      t.turning = true;
    }
    this.changed();
  }

  private arrive(t: Tour): void {
    const stop = t.plan.stops[t.index]!;
    if (!t.visited.includes(stop.roomId)) t.visited.push(stop.roomId);
    t.phase = 'look';
    t.t = 0;
    t.panFrom = this.yaw;
    this.changed();
  }

  /** How far the look-around has panned after `t` seconds: settle, one full turn, settle. */
  private panAngle(t: number): number {
    const duration = 360 / TOUR_PAN_RATE;
    return 2 * Math.PI * smooth(Math.max(0, Math.min(1, (t - TOUR_SETTLE) / duration)));
  }

  private updateTour(dt: number): void {
    const t = this.tour!;
    this.pitch += (TOUR_PITCH - this.pitch) * (1 - Math.exp(-dt / 0.3));
    if (t.phase === 'jump') {
      if (this.pendingJump || this.fade > 0.6) return;
      if (t.index < 0) this.enterLeg(t, 0);
      else this.arrive(t);
      return;
    }
    if (t.phase === 'walk') {
      const ahead = pointAlong(t.path, Math.min(t.length, t.s + TOUR_LOOK_AHEAD));
      const here = pointAlong(t.path, t.s);
      const facing = vec.dist(ahead, here) > 1 ? Math.atan2(ahead.y - here.y, ahead.x - here.x) : this.yaw;
      const off = wrap(facing - this.yaw);
      if (t.turning) {
        // Turn on the spot to face the way out before setting off.
        const turn = rad(TOUR_TURN_RATE) * dt;
        if (Math.abs(off) <= Math.max(turn, rad(12))) t.turning = false;
        else {
          this.yaw = wrap(this.yaw + Math.sign(off) * turn);
          return;
        }
      }
      this.yaw = wrap(this.yaw + off * (1 - Math.exp(-dt / 0.28)));
      // Ease away from a stop and into the next one.
      const ease = Math.max(0.3, Math.min(1, t.s / 500 + 0.3, (t.length - t.s) / 500 + 0.3));
      t.s = Math.min(t.length, t.s + TOUR_SPEED * ease * dt);
      const p = pointAlong(t.path, t.s);
      this.x = p.x;
      this.y = p.y;
      const roomChanged = this.trackRoom();
      if (t.s >= t.length - 0.5) this.arrive(t);
      else if (roomChanged) this.changed();
      return;
    }
    // look
    t.t += dt;
    this.yaw = wrap(t.panFrom + this.panAngle(t.t));
    if (t.t < 2 * TOUR_SETTLE + 360 / TOUR_PAN_RATE) return;
    if (t.index + 1 >= t.plan.stops.length) this.finishTour(t);
    else this.enterLeg(t, t.index + 1);
  }
}
