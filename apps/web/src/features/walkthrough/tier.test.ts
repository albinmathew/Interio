import { describe, expect, it } from 'vitest';
import { declineTier, initialTier, tierOverride, walkLook, type TierState } from './tier';

describe('walk tiers', () => {
  it('starts high on a GPU and low on a software renderer', () => {
    expect(initialTier(false)).toEqual({ tier: 'high', step: 0 });
    expect(initialTier(true)).toEqual({ tier: 'low', step: 0 });
  });

  it('steps down: reflections and depth of field first, then half the shadow map, then the low tier', () => {
    const high = walkLook({ tier: 'high', step: 0 });
    expect(high).toMatchObject({ composer: true, reflections: true, dof: true, bloom: true, ao: true, shadows: true, shadowMapSize: 4096, lighting: 'cinematic', dpr: 1, samples: 4 });

    let s: TierState = initialTier(false);
    s = declineTier(s);
    expect(s).toEqual({ tier: 'medium', step: 0 });
    const medium = walkLook(s);
    expect(medium).toMatchObject({ reflections: false, dof: false, shadowMapSize: 4096, bloom: true, ao: true, shadows: true });

    s = declineTier(s);
    expect(s).toEqual({ tier: 'medium', step: 1 });
    expect(walkLook(s)).toMatchObject({ reflections: false, dof: false, shadowMapSize: 2048, shadows: true });

    s = declineTier(s);
    expect(s.tier).toBe('low');
    expect(declineTier(s).tier).toBe('low');
  });

  it('keeps the low tier as cheap as walk mode always was', () => {
    const low = walkLook({ tier: 'low', step: 0 });
    expect(low).toMatchObject({ composer: false, bloom: false, ao: false, dof: false, reflections: false, shadows: false, windowLights: 0, dpr: 1, samples: 0, lighting: 'interior' });
  });

  it('every GPU tier has fewer or equal window lights than the one above', () => {
    expect(walkLook({ tier: 'medium', step: 0 }).windowLights).toBeLessThanOrEqual(walkLook({ tier: 'high', step: 0 }).windowLights);
  });

  it('can be pinned from the address bar', () => {
    expect(tierOverride('?tier=low')).toEqual({ tier: 'low', step: 0 });
    expect(tierOverride('?tier=medium1')).toEqual({ tier: 'medium', step: 1 });
    expect(tierOverride('?tier=medium')).toEqual({ tier: 'medium', step: 0 });
    expect(tierOverride('?tier=ultra')).toBeNull();
    expect(tierOverride('')).toBeNull();
  });
});
