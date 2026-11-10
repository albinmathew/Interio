/**
 * Doors, windows, railings and skirting boards. Visual only: none of these meshes carry
 * `userData.group`, so pointer tools and collision code can ignore them.
 */
import { openingFrame, type Level, type LevelMesh, type Opening, type Wall } from '@interio/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeBoxes } from './boxes';
import { openingParts, railingParts, skirtingBoxes, stubBoxes, type BoxSpec } from './parts';
import type { WallFadeController } from './wallFade';

interface Look {
  color: string;
  roughness: number;
  metalness?: number;
}

const GLASS = { color: '#c9dfe6', opacity: 0.22 };
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
    envMapIntensity: 1.5,
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

function OpeningObject({ level, opening, doorsOpen, fade }: { level: Level; opening: Opening; doorsOpen: boolean; fade?: WallFadeController }) {
  const wall = level.walls[opening.wallId];
  const thickness = wall?.thickness;
  const height = wall?.height;
  const parts = useMemo(() => {
    if (thickness === undefined || height === undefined) return null;
    const spec = openingParts(opening, thickness, height, doorsOpen);
    if (!spec || spec.kind === 'passage') return null;
    const look = LOOKS[spec.kind];
    return [
      ...part('frame', spec.frame, () => solid(look.frame)),
      ...part('leaf', spec.leaf, () => solid(look.leaf)),
      ...part('metal', spec.metal, () => solid(look.metal)),
      ...part('glass', spec.glass, glass, false),
    ];
  }, [opening, thickness, height, doorsOpen]);
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
  fade?: WallFadeController;
}

/** Door frames and leaves, sliding doors and windows for every opening of the level. */
export function OpeningsLayer({ level, doorsOpen = true, fade }: OpeningsLayerProps) {
  return (
    <group name="openings">
      {Object.values(level.openings).map((o) => (
        <OpeningObject key={o.id} level={level} opening={o} doorsOpen={doorsOpen} fade={fade} />
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
