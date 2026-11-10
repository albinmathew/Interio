/**
 * Cutaway for the dollhouse view: walls that stand between the camera and a room fade
 * out so the user can see inside. Pure decision (`wallFaces`) plus a small controller
 * that animates the opacity of every material registered for a wall.
 */
import type { Id, Level, LevelMesh } from '@interio/core';
import type * as THREE from 'three';

export interface FadeWall {
  id: Id;
  /** Wall centreline in world metres (x, z). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** World-space unit normal of the wall's left side (x, z). */
  nx: number;
  nz: number;
  /** Whether a room lies on the left / right of the wall. */
  roomLeft: boolean;
  roomRight: boolean;
}

/** Full-height walls with the rooms they bound. Low walls and railings never fade. */
export function fadeWalls(level: Level, mesh: LevelMesh): FadeWall[] {
  const rooms = new Map<string, boolean>();
  for (const g of mesh.groups) if (g.kind === 'wallSide' && g.wallId && g.roomId) rooms.set(`${g.wallId}:${g.side}`, true);
  const out: FadeWall[] = [];
  for (const w of Object.values(level.walls)) {
    if (w.kind !== 'wall') continue;
    const a = level.vertices[w.a];
    const b = level.vertices[w.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) continue;
    out.push({
      id: w.id,
      ax: a.x / 1000,
      az: -a.y / 1000,
      bx: b.x / 1000,
      bz: -b.y / 1000,
      // Plan left normal (-dy, dx) -> world (x, z) = (-dy, -dx).
      nx: -dy / l,
      nz: -dx / l,
      roomLeft: rooms.has(`${w.id}:left`),
      roomRight: rooms.has(`${w.id}:right`),
    });
  }
  return out;
}

/**
 * True when the wall hides a room from a camera at world (cx, cz): the camera looks at
 * the wall's face (not along it) and there is a room on the far side.
 */
export function wallHidesRoom(w: FadeWall, cx: number, cz: number, edgeOn = 0.3): boolean {
  const ex = w.bx - w.ax;
  const ez = w.bz - w.az;
  const l2 = ex * ex + ez * ez;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((cx - w.ax) * ex + (cz - w.az) * ez) / l2));
  const px = w.ax + ex * t;
  const pz = w.az + ez * t;
  const reach = Math.hypot(cx - px, cz - pz);
  if (reach < 1e-6) return false;
  // Signed distance of the camera from the wall line; positive on the left side.
  const side = (cx - w.ax) * w.nx + (cz - w.az) * w.nz;
  if (Math.abs(side) / reach < edgeOn) return false;
  return side > 0 ? w.roomRight : w.roomLeft;
}

const OPAQUE = 0.995;

export class WallFadeController {
  private walls: FadeWall[] = [];
  private current = new Map<Id, number>();
  private materials = new Map<Id, Set<THREE.Material>>();
  /** The first update jumps straight to the target so the view does not open with a fade. */
  private snap = true;

  /** Opacity of a faded wall. At 0 the wall is not drawn at all and casts no shadow. */
  fadedOpacity = 0;
  /** Camera pitch (sine of the angle below the horizon) above which nothing fades: looking straight down, walls hide nothing. */
  topDown = 0.93;

  setWalls(walls: FadeWall[]): void {
    this.walls = walls;
    const ids = new Set(walls.map((w) => w.id));
    for (const id of this.current.keys()) if (!ids.has(id)) this.current.delete(id);
  }

  opacity(wallId: Id): number {
    return this.current.get(wallId) ?? 1;
  }

  /** The material follows the wall's opacity from now on. Returns the unregister function. */
  register(wallId: Id, material: THREE.Material): () => void {
    let set = this.materials.get(wallId);
    if (!set) this.materials.set(wallId, (set = new Set()));
    // Remember how the material was authored, so glass and shading overlays stay translucent at full strength.
    if (material.userData.baseOpacity === undefined) {
      material.userData.baseOpacity = material.opacity;
      material.userData.baseTransparent = material.transparent;
      material.userData.baseDepthWrite = material.depthWrite;
    }
    set.add(material);
    this.apply(material, this.opacity(wallId));
    return () => {
      set.delete(material);
    };
  }

  /**
   * Moves every wall towards its target opacity. `down` is the camera's downward pitch
   * as a sine (0 level, 1 straight down). Returns true while a fade is still running.
   */
  update(enabled: boolean, cx: number, cz: number, down: number, dt: number): boolean {
    const k = this.snap ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 14);
    if (this.walls.length > 0) this.snap = false;
    let animating = false;
    for (const w of this.walls) {
      const hide = enabled && down < this.topDown && wallHidesRoom(w, cx, cz);
      const target = hide ? this.fadedOpacity : 1;
      const cur = this.current.get(w.id) ?? 1;
      if (cur === target) continue;
      let next = cur + (target - cur) * k;
      if (Math.abs(next - target) < 0.01) next = target;
      else animating = true;
      this.current.set(w.id, next);
      const set = this.materials.get(w.id);
      if (set) for (const m of set) this.apply(m, next);
    }
    return animating;
  }

  private apply(material: THREE.Material, f: number): void {
    const base = (material.userData.baseOpacity as number | undefined) ?? 1;
    const transparent = material.userData.baseTransparent === true || base < OPAQUE || f < OPAQUE;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = base * f;
    material.depthWrite = material.userData.baseDepthWrite !== false && base >= OPAQUE && f > 0.9;
    // Fully faded: skip the draw and the shadow pass.
    material.visible = f > 0.02;
  }
}

/** True for an object drawn with a material that is currently faded out (pointer tools should skip it). */
export function isFaded(object: THREE.Object3D): boolean {
  const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (!material || Array.isArray(material)) return false;
  const base = (material.userData.baseOpacity as number | undefined) ?? 1;
  return !material.visible || material.opacity < base * 0.5;
}
