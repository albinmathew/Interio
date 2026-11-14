/**
 * How strongly each floor finish mirrors the room: polished stone and marble clearly,
 * glazed tile a little less, polished wood faintly, carpet and anti-skid tile not at all.
 * Pure: runs in Node.
 */
import { resolveSurfaceFinish } from '@interio/core';

export interface FloorReflection {
  /** 0..1: share of the mirrored image at a grazing angle (Fresnel takes it down when looking straight down). */
  strength: number;
  /** 0..1: how soft the reflection is. Multiplied by the floor's own roughness map in the shader. */
  blur: number;
}

const BY_FINISH: Record<string, FloorReflection | null> = {
  'floor.marble': { strength: 1, blur: 0.18 },
  'floor.marble.black': { strength: 1, blur: 0.16 },
  'floor.tile.white': { strength: 0.8, blur: 0.26 },
  'floor.tile.grey': { strength: 0.7, blur: 0.3 },
  'floor.terrazzo': { strength: 0.6, blur: 0.34 },
  'floor.concrete': { strength: 0.5, blur: 0.42 },
  'floor.travertine': { strength: 0.42, blur: 0.42 },
  'floor.microcement': { strength: 0.32, blur: 0.5 },
  'floor.slate': { strength: 0.22, blur: 0.55 },
  // Lacquered timber: a faint, soft sheen.
  'floor.oak': { strength: 0.3, blur: 0.6 },
  'floor.ash': { strength: 0.28, blur: 0.62 },
  'floor.walnut': { strength: 0.34, blur: 0.58 },
  'floor.herringbone': { strength: 0.3, blur: 0.6 },
  'floor.chevron': { strength: 0.34, blur: 0.58 },
  'floor.oak.smoked': { strength: 0.32, blur: 0.6 },
  'floor.oak.grey': { strength: 0.28, blur: 0.62 },
  'floor.carpet.beige': null,
  'floor.carpet.grey': null,
  'floor.tile.antiskid': null,
  'floor.deck': null,
};

/** The reflection of a floor finish (palette id or custom colour), or null for none. */
export function floorReflection(finish: string | undefined): FloorReflection | null {
  if (finish && finish in BY_FINISH) return BY_FINISH[finish] ?? null;
  // Custom colours and anything new: from the finish's roughness (smooth floors reflect more).
  const def = resolveSurfaceFinish(finish, 'floor');
  const r = def?.roughness ?? 0.5;
  const strength = Math.max(0, Math.min(1, (0.62 - r) / 0.5)) * 0.8;
  return strength > 0.05 ? { strength, blur: Math.min(0.7, 0.15 + r * 0.8) } : null;
}
