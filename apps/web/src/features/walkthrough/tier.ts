/**
 * How much of the cinematic look walk mode can afford. Pure: unit tested.
 *
 * - `high`: a GPU holding its frame rate. Everything: soft sun shadows at 4096 px, window
 *   light, floor reflections, ambient occlusion, bloom, grade and vignette, depth of field
 *   while the tour lingers.
 * - `medium`: a GPU that drops frames. Reflections and depth of field go first; if it is
 *   still slow, the shadow map is halved. Then `low`.
 * - `low`: software renderers (CI, machines without a GPU). The plain forward render it
 *   always had, plus the outside backdrop and glowing lamp shades (no bloom).
 */
export type WalkTier = 'high' | 'medium' | 'low';

export interface TierState {
  tier: WalkTier;
  /** Steps taken down within `medium`: 0 drops reflections and depth of field, 1 also halves the shadow map. */
  step: number;
}

export interface WalkLook {
  /** Lighting rig: `cinematic` (sun through the windows, window light, image-based light) or the cheap `interior` one. */
  lighting: 'cinematic' | 'interior';
  /** Post-processing chain (occlusion, bloom, grade, vignette, tone mapping). */
  composer: boolean;
  bloom: boolean;
  ao: boolean;
  dof: boolean;
  reflections: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Edge softness of the sun's shadow, in shadow-map texels. */
  shadowSoftness: number;
  /** Rectangular lights in the windows nearest the walker (sky light pouring in). */
  windowLights: number;
  /** Device pixel ratio range for the canvas. */
  dpr: number | [number, number];
  /** MSAA samples of the composer's target. */
  samples: number;
}

export function initialTier(software: boolean): TierState {
  return { tier: software ? 'low' : 'high', step: 0 };
}

/** One step down after the frame rate dropped. `low` is the floor. */
export function declineTier(s: TierState): TierState {
  if (s.tier === 'high') return { tier: 'medium', step: 0 };
  if (s.tier === 'medium' && s.step < 1) return { tier: 'medium', step: s.step + 1 };
  return { tier: 'low', step: 0 };
}

/** `?tier=high|medium|low` pins a tier, for comparisons and frame-cost measurements. */
export function tierOverride(search: string): TierState | null {
  const value = new URLSearchParams(search).get('tier');
  if (value === 'high' || value === 'low') return { tier: value, step: 0 };
  if (value === 'medium' || value === 'medium0') return { tier: 'medium', step: 0 };
  if (value === 'medium1') return { tier: 'medium', step: 1 };
  return null;
}

export function walkLook({ tier, step }: TierState): WalkLook {
  if (tier === 'low') {
    return {
      lighting: 'interior',
      composer: false,
      bloom: false,
      ao: false,
      dof: false,
      reflections: false,
      shadows: false,
      shadowMapSize: 1024,
      shadowSoftness: 2,
      windowLights: 0,
      dpr: 1,
      samples: 0,
    };
  }
  const high = tier === 'high';
  return {
    lighting: 'cinematic',
    composer: true,
    bloom: true,
    ao: true,
    dof: high,
    reflections: high,
    shadows: true,
    shadowMapSize: high || step < 1 ? 4096 : 2048,
    shadowSoftness: high ? 4 : 3,
    windowLights: high ? 6 : 4,
    dpr: high ? [1, 2] : 1,
    samples: 4,
  };
}
