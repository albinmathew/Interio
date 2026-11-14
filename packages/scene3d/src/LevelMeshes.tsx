import {
  EXTERIOR_WALL_COLOR,
  selectLevelMesh,
  type Id,
  type Level,
  type MeshGroup,
} from '@interio/core';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { geometryFromMesh } from './geometry';
import { ContactShade, OpeningsLayer, RailingsLayer, SkirtingLayer, WallStubs } from './Joinery';
import { hideFromMirror, makeReflective } from './FloorMirror';
import { createSurfaceMaterial } from './materials';
import { floorReflection } from './reflectance';
import { surfaceFinish } from './surfaces';
import { fadeWalls, WallFadeController } from './wallFade';

export interface LevelMeshesProps {
  level: Level;
  /** Ceilings are hidden in dollhouse and plan views, shown in walkthrough. */
  showCeilings?: boolean;
  /** Fade walls that stand between the camera and a room (dollhouse view). Default false. */
  cutaway?: boolean;
  /** Hinged doors stand open and sliding doors are parked. Default true. */
  doorsOpen?: boolean;
  /** Openings that stay shut while the others stand open (the front door when walking). */
  closedDoors?: readonly Id[];
  /** Door and window joinery, railings and skirting boards. Default true. */
  details?: boolean;
  /** Tiling PBR textures for floors and feature walls. Default true; flat colours otherwise. */
  textures?: boolean;
  /** Clear window glass, for views from inside. Default false (a light tint that reads from above). */
  clearGlass?: boolean;
  /**
   * Glossy floors take the planar reflection drawn by `<FloorMirror>` (mount it in the same
   * canvas), each by its finish. Default false.
   */
  reflections?: boolean;
}

/** The cut tops of full-height walls: a neutral mid grey, as on an architectural section. */
export const WALL_CUT_COLOR = '#8b8b89';
const TRIM = { color: '#f1eee8', roughness: 0.9 };

function material(level: Level, g: MeshGroup, textures: boolean): THREE.MeshStandardMaterial {
  const { finish, surface } = surfaceFinish(level, g);
  switch (g.kind) {
    case 'floor':
      return createSurfaceMaterial(finish, { color: '#eeeae4', roughness: 0.4 }, { textures, surface });
    case 'ceiling':
      return createSurfaceMaterial(finish, { color: '#fafaf8', roughness: 0.95 }, { textures, surface });
    case 'wallSide':
      if (!finish) return createSurfaceMaterial(undefined, { color: EXTERIOR_WALL_COLOR, roughness: 0.9 });
      return createSurfaceMaterial(finish, TRIM, { textures, surface });
    case 'wallTop':
      return createSurfaceMaterial(undefined, g.wallKind === 'wall' ? { color: WALL_CUT_COLOR, roughness: 0.9 } : TRIM);
    default:
      return createSurfaceMaterial(undefined, TRIM);
  }
}

/**
 * The built structure of a level: walls, floors and ceilings with their finishes, plus
 * door and window joinery, railings and skirting boards. Every wall, floor and ceiling
 * mesh carries `userData.group` (the core MeshGroup) so pointer handlers can tell what
 * was hit; joinery meshes do not.
 */
export function LevelMeshes({ level, showCeilings = false, cutaway = false, doorsOpen = true, closedDoors, details = true, textures = true, clearGlass, reflections = false }: LevelMeshesProps) {
  const mesh = selectLevelMesh(level);
  const rooms = level.rooms;
  const walls = level.walls;
  const parts = useMemo(
    () =>
      mesh.groups.map((group) => ({
        group,
        geometry: geometryFromMesh(group.geometry),
        // Read through `level` at build time: rooms and walls are part of the mesh cache key, so this stays in step.
        material: material({ rooms, walls } as Level, group, textures),
      })),
    [mesh, rooms, walls, textures],
  );
  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      }),
    [parts],
  );

  // Glossy floors: the shared reflection, per finish. The floors and their edge shading stay out of the mirrored view.
  const root = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!reflections) return;
    const undo: (() => void)[] = [];
    for (const p of parts) {
      if (p.group.kind !== 'floor') continue;
      const r = floorReflection(surfaceFinish({ rooms, walls } as Level, p.group).finish);
      if (r) undo.push(makeReflective(p.material, r));
    }
    root.current?.traverse((o) => {
      if (o.name === 'contact-shade' || (o.userData.group as MeshGroup | undefined)?.kind === 'floor') undo.push(hideFromMirror(o));
    });
    return () => undo.forEach((f) => f());
  }, [reflections, parts, rooms, walls]);

  const fade = useMemo(() => new WallFadeController(), []);
  const vertices = level.vertices;
  useEffect(() => {
    fade.setWalls(fadeWalls({ walls, vertices } as Level, mesh));
  }, [fade, mesh, walls, vertices]);
  useEffect(() => {
    const off = parts.filter((p) => p.group.wallId).map((p) => fade.register(p.group.wallId!, p.material));
    return () => off.forEach((f) => f());
  }, [fade, parts]);
  const down = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, invalidate }, dt) => {
    camera.getWorldDirection(down);
    if (fade.update(cutaway, camera.position.x, camera.position.z, -down.y, dt)) invalidate();
  });

  return (
    <group name="level" ref={root}>
      {parts.map(({ group, geometry, material: m }) => {
        if (group.kind === 'ceiling' && !showCeilings) return null;
        // Railings are drawn as balustrades; the slab stays in the graph, hidden, for anything that reads `userData.group`.
        const railing = group.wallKind === 'railing';
        const flat = group.kind === 'floor' || group.kind === 'ceiling';
        return (
          <mesh
            key={group.key}
            name={group.key}
            geometry={geometry}
            material={m}
            visible={!(railing && details)}
            castShadow={group.kind === 'ceiling' || (!flat && !railing)}
            receiveShadow
            userData={{ group }}
          />
        );
      })}
      {details && (
        <>
          <OpeningsLayer level={level} doorsOpen={doorsOpen} closedDoors={closedDoors} fade={fade} clearGlass={clearGlass} />
          <RailingsLayer level={level} />
          <SkirtingLayer level={level} mesh={mesh} />
          <ContactShade level={level} ceilings={showCeilings} fade={fade} />
        </>
      )}
      {cutaway && <WallStubs level={level} />}
    </group>
  );
}
