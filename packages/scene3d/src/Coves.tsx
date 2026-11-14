/**
 * Cove lighting (see `cove.ts`): the lowered soffit, the warm LED line on its inner edge
 * and the wash of light it throws across the ceiling. The wash and the line are drawn
 * unlit and additive (bright enough to bloom in the cinematic image), so they cost no
 * real lights.
 */
import { selectRooms, type Level, type Pt } from '@interio/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { COVE_DROP, coves, type Cove } from './cove';
import { NO_AO } from './post';

/** World position of a plan point (mm) at height y (m). */
const at = (p: Pt, y: number): [number, number, number] => [p.x / 1000, y, -p.y / 1000];

/** Inward unit normal (world) of edge i of a counter-clockwise plan polygon. */
function inward(poly: Pt[], i: number): [number, number, number] {
  const a = poly[i]!;
  const b = poly[(i + 1) % poly.length]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / l;
  const ny = (b.x - a.x) / l;
  return [nx, 0, -ny];
}

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  /** A triangle facing along `n`, with a vertex colour (rgb + alpha) per corner. */
  tri(a: number[], b: number[], c: number[], n: number[], ca = [1, 1, 1, 1], cb = ca, cc = ca): void {
    this.positions.push(...a, ...b, ...c);
    this.normals.push(...n, ...n, ...n);
    this.colors.push(...ca, ...cb, ...cc);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 4));
    return g;
  }
}

const DOWN = [0, -1, 0];

function coveGeometry(list: Cove[], ceiling: number): { soffit: THREE.BufferGeometry; line: THREE.BufferGeometry; wash: THREE.BufferGeometry } {
  const soffit = new Builder();
  const line = new Builder();
  const wash = new Builder();
  const bottom = ceiling - COVE_DROP / 1000;
  // The fascia stops short of the ceiling: the light comes out of that slot.
  const slotTop = ceiling - 0.05;
  const lineTop = ceiling - 0.032;
  for (const c of list) {
    const n = c.outer.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Underside of the soffit, seen from below (clockwise in plan = facing down).
      soffit.tri(at(c.outer[i]!, bottom), at(c.inner[i]!, bottom), at(c.inner[j]!, bottom), DOWN);
      soffit.tri(at(c.outer[i]!, bottom), at(c.inner[j]!, bottom), at(c.outer[j]!, bottom), DOWN);
      if (!c.walled[i]) continue;
      const nIn = inward(c.inner, i);
      const a0 = at(c.inner[i]!, bottom);
      const b0 = at(c.inner[j]!, bottom);
      const a1 = at(c.inner[i]!, slotTop);
      const b1 = at(c.inner[j]!, slotTop);
      // Fascia, facing into the room.
      soffit.tri(a0, a1, b1, nIn);
      soffit.tri(a0, b1, b0, nIn);
      // The LED line in the slot above it.
      const a2 = at(c.inner[i]!, lineTop);
      const b2 = at(c.inner[j]!, lineTop);
      line.tri(a1, a2, b2, nIn);
      line.tri(a1, b2, b1, nIn);
      // The wash on the ceiling: brightest at the slot, gone by `wash`.
      const y = ceiling - 0.004;
      const on = [1, 1, 1, 1];
      const off = [1, 1, 1, 0];
      wash.tri(at(c.inner[i]!, y), at(c.wash[i]!, y), at(c.wash[j]!, y), DOWN, on, off, off);
      wash.tri(at(c.inner[i]!, y), at(c.wash[j]!, y), at(c.inner[j]!, y), DOWN, on, off, on);
    }
  }
  return { soffit: soffit.build(), line: line.build(), wash: wash.build() };
}

const WARM = new THREE.Color('#ffb46e');

export interface CovesProps {
  level: Level;
  /** 0 builds the soffits dark; 1 is the evening glow. */
  strength: number;
}

/** Soffits with hidden LED strips round the ceilings of living rooms and bedrooms. */
export function Coves({ level, strength }: CovesProps) {
  const { rooms, walls, ceilingHeight } = level;
  const geoms = selectRooms(level);
  const built = useMemo(() => {
    const list = coves({ rooms, walls }, geoms);
    if (list.length === 0) return null;
    const g = coveGeometry(list, ceilingHeight / 1000);
    return {
      ...g,
      soffitMaterial: new THREE.MeshStandardMaterial({ name: 'cove.soffit', color: '#f4f2ed', roughness: 0.92 }),
      lineMaterial: new THREE.MeshBasicMaterial({ name: 'cove.line', color: WARM.clone(), side: THREE.DoubleSide }),
      washMaterial: new THREE.MeshBasicMaterial({
        name: 'cove.wash',
        color: WARM.clone(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    };
  }, [rooms, walls, ceilingHeight, geoms]);
  useEffect(
    () => () => {
      if (!built) return;
      for (const x of [built.soffit, built.line, built.wash, built.soffitMaterial, built.lineMaterial, built.washMaterial]) x.dispose();
    },
    [built],
  );
  useEffect(() => {
    if (!built) return;
    // HDR colours: the line well above the bloom threshold, the wash just under it near the slot.
    built.lineMaterial.color.copy(WARM).multiplyScalar(7 * strength);
    built.washMaterial.color.copy(WARM).multiplyScalar(1.6 * strength);
    built.lineMaterial.visible = strength > 0;
    built.washMaterial.visible = strength > 0;
  }, [built, strength]);
  if (!built) return null;
  const glow = { [NO_AO]: true };
  return (
    <group name="coves">
      <mesh geometry={built.soffit} material={built.soffitMaterial} receiveShadow raycast={() => null} />
      <mesh geometry={built.line} material={built.lineMaterial} userData={glow} raycast={() => null} />
      <mesh geometry={built.wash} material={built.washMaterial} userData={glow} renderOrder={3} raycast={() => null} />
    </group>
  );
}
