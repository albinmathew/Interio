import {
  DEFAULT_CEILING_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  EXTERIOR_WALL_COLOR,
  MATERIALS,
  selectLevelMesh,
  type Level,
  type MeshGroup,
} from '@interio/core';
import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { geometryFromMesh } from './geometry';

export interface LevelMeshesProps {
  level: Level;
  /** Ceilings are hidden in dollhouse and plan views, shown in walkthrough. */
  showCeilings?: boolean;
}

const WALL_CUT_COLOR = '#6f6b65';

function surface(level: Level, g: MeshGroup): { color: string; roughness: number; opacity?: number } {
  const room = g.roomId ? level.rooms[g.roomId] : undefined;
  if (g.wallKind === 'railing') return { color: '#cfd8dc', roughness: 0.1, opacity: 0.35 };
  switch (g.kind) {
    case 'floor': {
      const m = MATERIALS[room?.floorMaterial ?? ''] ?? MATERIALS['floor.tile.white']!;
      return { color: m.color, roughness: m.roughness };
    }
    case 'ceiling': {
      const m = MATERIALS[room?.ceilingMaterial ?? DEFAULT_CEILING_MATERIAL]!;
      return { color: m.color, roughness: m.roughness };
    }
    case 'wallSide': {
      if (!room) return { color: EXTERIOR_WALL_COLOR, roughness: 0.9 };
      const m = MATERIALS[room.wallMaterial ?? DEFAULT_WALL_MATERIAL] ?? MATERIALS[DEFAULT_WALL_MATERIAL]!;
      return { color: m.color, roughness: m.roughness };
    }
    case 'wallTop':
      return { color: WALL_CUT_COLOR, roughness: 0.9 };
    default:
      return { color: '#f1eee8', roughness: 0.9 };
  }
}

/**
 * Walls, floors and ceilings of a level. Baseline renderer: flat colours from
 * the finishes palette. Every mesh carries `userData.group` (the core MeshGroup)
 * so pointer handlers can tell what was hit.
 */
export function LevelMeshes({ level, showCeilings = false }: LevelMeshesProps) {
  const mesh = selectLevelMesh(level);
  const parts = useMemo(
    () => mesh.groups.map((group) => ({ group, geometry: geometryFromMesh(group.geometry) })),
    [mesh],
  );
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);

  return (
    <group name="level">
      {parts.map(({ group, geometry }) => {
        if (group.kind === 'ceiling' && !showCeilings) return null;
        const s = surface(level, group);
        return (
          <mesh
            key={group.key}
            name={group.key}
            geometry={geometry as THREE.BufferGeometry}
            castShadow={group.kind !== 'floor' && group.kind !== 'ceiling' && s.opacity === undefined}
            receiveShadow
            userData={{ group }}
          >
            <meshStandardMaterial
              color={s.color}
              roughness={s.roughness}
              transparent={s.opacity !== undefined}
              opacity={s.opacity ?? 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}
