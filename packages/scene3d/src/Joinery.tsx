/**
 * Doors, windows, railings and skirting boards. Visual only: none of these meshes carry
 * `userData.group`, so pointer tools and collision code can ignore them.
 */
import { openingFrame, selectRooms, type Id, type Level, type LevelMesh, type Opening, type Wall } from '@interio/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeBoxes } from './boxes';
import { openingParts, railingParts, skirtingBoxes, stubBoxes, type BoxSpec } from './parts';
import { contactShading, shadeBuffers, type ShadeQuad } from './shading';
import type { WallFadeController } from './wallFade';

interface Look {
  color: string;
  roughness: number;
  metalness?: number;
}

const GLASS = { color: '#cfe2e8', opacity: 0.16 };
const LOOKS: Record<'door' | 'sliding' | 'window', { frame: Look; leaf: Look; metal: Look }> = {
  door: {
    frame: { color: '#f3f0ea', roughness: 0.6 },
    leaf: { color: '#b08a62', roughness: 0.55 },
    metal: { color: '#3d4043', roughness: 0.35, metalness: 0.8 },
  },
  sliding: {
    frame: { color: '#4a4e52', roughness: 0.45, metalness: 0.5 },
    leaf: { color: '#4a4e52', roughness: 0.45, metalness: 0.5 },
    metal: { color: '#2c2e30', roughness: 0.35, metalness: 0.8 },
  },
  window: {
    frame: { color: '#f5f5f2', roughness: 0.5 },
    leaf: { color: '#f5f5f2', roughness: 0.5 },
    metal: { color: '#3d4043', roughness: 0.35, metalness: 0.8 },
  },
};
const RAILING_METAL: Look = { color: '#585d62', roughness: 0.4, metalness: 0.7 };
const SKIRTING: Look = { color: '#f6f4ef', roughness: 0.65 };
const STUB: Look = { color: '#8a857d', roughness: 0.9 };

const solid = (look: Look) => new THREE.MeshStandardMaterial({ color: look.color, roughness: look.roughness, metalness: look.metalness ?? 0 });
const glass = () =>
  new THREE.MeshStandardMaterial({
    color: GLASS.color,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: GLASS.opacity,
    depthWrite: false,
    envMapIntensity: 1.1,
  });
/**
 * Glass seen from inside: it takes a little light away and reflects, but does not glow
 * milky in the sun, so the world outside stays crisp.
 */
const clearGlass = () =>
  new THREE.MeshStandardMaterial({
    color: '#0e1416',
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    envMapIntensity: 0.6,
  });

interface Part {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  solid: boolean;
}

function part(key: string, boxes: BoxSpec[], material: () => THREE.MeshStandardMaterial, isSolid = true): Part[] {
  return boxes.length ? [{ key, geometry: mergeBoxes(boxes), material: material(), solid: isSolid }] : [];
}

function useDisposable(parts: Part[] | null): void {
  useEffect(
    () => () => {
      parts?.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      });
    },
    [parts],
  );
}

function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p) => (
        <mesh key={p.key} geometry={p.geometry} material={p.material} castShadow={p.solid} receiveShadow={p.solid} renderOrder={p.solid ? 0 : 2} />
      ))}
    </>
  );
}

function OpeningObject({ level, opening, doorsOpen, fade, clear }: { level: Level; opening: Opening; doorsOpen: boolean; fade?: WallFadeController; clear?: boolean }) {
  const wall = level.walls[opening.wallId];
  const thickness = wall?.thickness;
  const height = wall?.height;
  // A divider is a line between zones of one space, not a wall: nothing to hang joinery on.
  const bodiless = wall?.kind === 'divider';
  const parts = useMemo(() => {
    if (thickness === undefined || height === undefined || bodiless) return null;
    const spec = openingParts(opening, thickness, height, doorsOpen);
    if (!spec || spec.kind === 'passage') return null;
    const look = LOOKS[spec.kind];
    return [
      ...part('frame', spec.frame, () => solid(look.frame)),
      ...part('leaf', spec.leaf, () => solid(look.leaf)),
      ...part('metal', spec.metal, () => solid(look.metal)),
      ...part('glass', spec.glass, clear ? clearGlass : glass, false),
    ];
  }, [opening, thickness, height, doorsOpen, bodiless, clear]);
  useDisposable(parts);
  useEffect(() => {
    if (!parts || !fade) return;
    const off = parts.map((p) => fade.register(opening.wallId, p.material));
    return () => off.forEach((f) => f());
  }, [parts, fade, opening.wallId]);

  const frame = openingFrame(level, opening.id);
  if (!parts || !frame) return null;
  return (
    <group
      name={`opening:${opening.id}`}
      position={[frame.center.x / 1000, 0, -frame.center.y / 1000]}
      rotation={[0, (frame.angleDeg * Math.PI) / 180, 0]}
      userData={{ openingId: opening.id }}
    >
      <Parts parts={parts} />
    </group>
  );
}

export interface OpeningsLayerProps {
  level: Level;
  /** Hinged doors stand open (about 80 degrees) and sliding doors are parked. Default true. */
  doorsOpen?: boolean;
  /** Openings that stay shut while the others stand open (the front door when walking). */
  closedDoors?: readonly Id[];
  fade?: WallFadeController;
  /** Clear glass for views from inside (walk mode); a light tint otherwise, so panes read from above. */
  clearGlass?: boolean;
}

/** Door frames and leaves, sliding doors and windows for every opening of the level. */
export function OpeningsLayer({ level, doorsOpen = true, closedDoors, fade, clearGlass: clear }: OpeningsLayerProps) {
  return (
    <group name="openings">
      {Object.values(level.openings).map((o) => (
        <OpeningObject key={o.id} level={level} opening={o} doorsOpen={doorsOpen && !closedDoors?.includes(o.id)} fade={fade} clear={clear} />
      ))}
    </group>
  );
}

function RailingObject({ level, wall }: { level: Level; wall: Wall }) {
  const a = level.vertices[wall.a];
  const b = level.vertices[wall.b];
  const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const parts = useMemo(() => {
    if (length < 50) return null;
    const spec = railingParts(length, wall.height);
    return [...part('metal', spec.metal, () => solid(RAILING_METAL)), ...part('glass', spec.glass, glass, false)];
  }, [length, wall.height]);
  useDisposable(parts);
  if (!parts || !a || !b) return null;
  return (
    <group
      name={`railing:${wall.id}`}
      position={[(a.x + b.x) / 2000, 0, -(a.y + b.y) / 2000]}
      rotation={[0, Math.atan2(b.y - a.y, b.x - a.x), 0]}
    >
      <Parts parts={parts} />
    </group>
  );
}

/** Glass balustrades for walls of kind `railing`. */
export function RailingsLayer({ level }: { level: Level }) {
  return (
    <group name="railings">
      {Object.values(level.walls)
        .filter((w) => w.kind === 'railing')
        .map((w) => (
          <RailingObject key={w.id} level={level} wall={w} />
        ))}
    </group>
  );
}

/** Skirting boards along every wall face that looks into a room, as one mesh. */
export function SkirtingLayer({ level, mesh }: { level: Level; mesh: LevelMesh }) {
  const openings = level.openings;
  const rooms = level.rooms;
  const built = useMemo(
    () => {
      const boxes = skirtingBoxes(level, mesh);
      return boxes.length ? { geometry: mergeBoxes(boxes), material: solid(SKIRTING) } : null;
    },
    // The mesh already changes with walls and vertices; openings and room types cover the rest.
    [mesh, openings, rooms],
  );
  useEffect(
    () => () => {
      built?.geometry.dispose();
      built?.material.dispose();
    },
    [built],
  );
  if (!built) return null;
  return <mesh name="skirting" geometry={built.geometry} material={built.material} castShadow receiveShadow />;
}

/**
 * Low plinths that mark where a wall stands once the cutaway hides it. Hidden inside
 * the wall otherwise, so they can stay mounted.
 */
export function WallStubs({ level }: { level: Level }) {
  const { walls, vertices, openings } = level;
  const built = useMemo(() => {
    const boxes = stubBoxes({ walls, vertices, openings });
    return boxes.length ? { geometry: mergeBoxes(boxes), material: solid(STUB) } : null;
  }, [walls, vertices, openings]);
  useEffect(
    () => () => {
      built?.geometry.dispose();
      built?.material.dispose();
    },
    [built],
  );
  if (!built) return null;
  return <mesh name="wall-stubs" geometry={built.geometry} material={built.material} receiveShadow />;
}

const SHADE_RGB: [number, number, number] = [0.02, 0.018, 0.015];

function shadeGeometry(quads: ShadeQuad[]): THREE.BufferGeometry {
  const { positions, colors, indices } = shadeBuffers(quads, SHADE_RGB);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

const shadeMaterial = () =>
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

/**
 * Baked contact shading (see `shading.ts`): gradients at the foot and head of walls, in
 * inside corners and along the edges of floors and ceilings.
 */
export function ContactShade({ level, ceilings, fade }: { level: Level; ceilings: boolean; fade?: WallFadeController }) {
  const { walls, vertices, openings, rooms, ceilingHeight } = level;
  const built = useMemo(() => {
    const view = { walls, vertices, openings, rooms, ceilingHeight } as Level;
    const shading = contactShading(view, selectRooms(level), { ceilings });
    return {
      flat: shading.flat.length ? { geometry: shadeGeometry(shading.flat), material: shadeMaterial() } : null,
      walls: [...shading.walls].map(([wallId, quads]) => ({ wallId, geometry: shadeGeometry(quads), material: shadeMaterial() })),
    };
    // `selectRooms` is keyed on the same slices as the dependencies below.
  }, [walls, vertices, openings, rooms, ceilingHeight, ceilings]);
  useEffect(
    () => () => {
      for (const part of [built.flat, ...built.walls]) {
        part?.geometry.dispose();
        part?.material.dispose();
      }
    },
    [built],
  );
  useEffect(() => {
    if (!fade) return;
    const off = built.walls.map((w) => fade.register(w.wallId, w.material));
    return () => off.forEach((f) => f());
  }, [built, fade]);
  return (
    <group name="contact-shade">
      {built.flat && <mesh geometry={built.flat.geometry} material={built.flat.material} renderOrder={1} />}
      {built.walls.map((w) => (
        <mesh key={w.wallId} geometry={w.geometry} material={w.material} renderOrder={1} />
      ))}
    </group>
  );
}
