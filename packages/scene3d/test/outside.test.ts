import { createSampleLevel, deriveRooms, vec } from '@interio/core';
import { describe, expect, it } from 'vitest';
import {
  COVE_SETTING,
  OUTSIDE_ASSETS,
  OUTSIDE_SETTING,
  OUTSIDE_VIEWS,
  brightestPoint,
  coveLightsOn,
  outsideFromSettings,
  panoramaDirection,
  radianceThrough,
  resolveOutside,
  rotationForSun,
  shrinkPanorama,
} from '../src/outside';
import { exteriorGlazing, planAzimuth, planSun, sunVector } from '../src/sun';

describe('outside view setting', () => {
  it('defaults to greenery and accepts the three views', () => {
    expect(OUTSIDE_VIEWS).toEqual(['greenery', 'city', 'sky']);
    for (const v of OUTSIDE_VIEWS) expect(resolveOutside(v)).toBe(v);
    for (const v of [undefined, null, '', 'forest', 3, { view: 'city' }]) expect(resolveOutside(v)).toBe('greenery');
  });

  it('reads the view from project settings under its own key', () => {
    expect(OUTSIDE_SETTING).toBe('scene.outside');
    expect(outsideFromSettings({ [OUTSIDE_SETTING]: 'city' })).toBe('city');
    expect(outsideFromSettings({ 'viewer3d.lighting': 'night' })).toBe('greenery');
    expect(outsideFromSettings(undefined)).toBe('greenery');
    expect(outsideFromSettings(null)).toBe('greenery');
  });

  it('has an HDR and a backdrop for every view', () => {
    for (const v of OUTSIDE_VIEWS) {
      expect(OUTSIDE_ASSETS[v].hdr).toMatch(/^\/env\/.+_1k\.hdr$/);
      expect(OUTSIDE_ASSETS[v].backdrop).toMatch(/^\/env\/.+_2k\.jpg$/);
      expect(OUTSIDE_ASSETS[v].gain).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('cove lights setting', () => {
  it('follow the preset until the project says otherwise', () => {
    expect(COVE_SETTING).toBe('scene.coveLights');
    expect(coveLightsOn({}, 'daylight')).toBe(false);
    expect(coveLightsOn({}, 'evening')).toBe(true);
    expect(coveLightsOn(undefined, 'night')).toBe(true);
    expect(coveLightsOn({ [COVE_SETTING]: false }, 'evening')).toBe(false);
    expect(coveLightsOn({ [COVE_SETTING]: true }, 'daylight')).toBe(true);
    // Anything but a boolean is ignored.
    expect(coveLightsOn({ [COVE_SETTING]: 'on' }, 'daylight')).toBe(false);
  });
});

/** A panorama with a blue sky, green ground and a sun at image point (su, sv). */
function testPanorama(w: number, h: number, su: number, sv: number) {
  return (i: number): [number, number, number] => {
    const x = (i % w) / w;
    const y = Math.floor(i / w) / h;
    if (Math.abs(x - su) < 1.5 / w && Math.abs(y - sv) < 1.5 / h) return [5000, 4800, 4500];
    return y < 0.5 ? [0.6, 0.8, 1.2] : [0.1, 0.25, 0.05];
  };
}

describe('panoramas', () => {
  it('maps image points to directions the way three does', () => {
    // Middle of the image looks down -X at the horizon; the top row is straight up.
    const [x, y, z] = panoramaDirection(0.5, 0.5);
    expect([x, y, z].map((n) => Math.round(n * 1000) / 1000)).toEqual([1, 0, 0]);
    expect(panoramaDirection(0.5, 0)[1]).toBeCloseTo(1);
    expect(panoramaDirection(0.75, 0.5)[2]).toBeCloseTo(1);
  });

  it('finds the sun and ignores a bright ground', () => {
    const w = 128;
    const h = 64;
    const read = testPanorama(w, h, 0.3, 0.2);
    const glare = (i: number): [number, number, number] => (Math.floor(i / w) === 50 && i % w === 10 ? [9e4, 9e4, 9e4] : read(i));
    const sun = brightestPoint(w, h, glare);
    expect(sun.u).toBeCloseTo(0.3, 1);
    expect(sun.v).toBeCloseTo(0.2, 1);
  });

  it('turns the panorama so its sun stands where the scene sun is', () => {
    for (const sunU of [0.1, 0.3, 0.77]) {
      for (const azimuth of [-2.5, 0, 1.2, 3]) {
        const r = rotationForSun(sunU, azimuth);
        // An image direction at azimuth a appears at a - r.
        const seen = (sunU - 0.5) * 2 * Math.PI - r;
        expect(Math.cos(seen)).toBeCloseTo(Math.cos(azimuth), 6);
        expect(Math.sin(seen)).toBeCloseTo(Math.sin(azimuth), 6);
      }
    }
  });

  it('a window facing the sun gets more light than one facing away, and sky light is bluish', () => {
    const w = 256;
    const h = 128;
    const read = testPanorama(w, h, 0.75, 0.3); // sun towards +Z
    const small = shrinkPanorama(w, h, read, 32, 16);
    const towards = radianceThrough(small, [0, 0, 1]);
    const away = radianceThrough(small, [0, 0, -1]);
    expect(towards[0]).toBeGreaterThan(away[0] * 2);
    expect(away[2]).toBeGreaterThan(away[0]);
    // Turning the panorama half a turn swaps them.
    const turned = radianceThrough(small, [0, 0, -1], Math.PI);
    expect(turned[0]).toBeCloseTo(towards[0], 3);
  });
});

describe('sun per preset', () => {
  const level = createSampleLevel();
  const rooms = deriveRooms(level);
  const glazing = exteriorGlazing(level, rooms);
  const named = (n: string) => Object.values(level.rooms).find((r) => r.name === n)!.id;

  it('lists the outside glazing of the sample home with the room each one lights', () => {
    // Seven windows, the balcony slider and the front door; passages are not glazing.
    expect(glazing).toHaveLength(9);
    const slider = glazing.find((g) => g.kind === 'sliding')!;
    expect(slider.roomId).toBe(named('Living / Dining'));
    // The balcony counts as outside: out is towards plan -y.
    expect(slider.outward.y).toBeCloseTo(-1);
    const bedroom = glazing.find((g) => g.roomId === named('Bedroom 1'))!;
    expect(bedroom.outward.y).toBeCloseTo(1);
  });

  it('is high by day and low at golden hour, and always above the horizon', () => {
    const day = planSun(glazing, 'daylight');
    const evening = planSun(glazing, 'evening');
    expect(day.elevation).toBeGreaterThan(35);
    expect(evening.elevation).toBeLessThan(20);
    for (const s of [day, evening, planSun(glazing, 'night')]) {
      expect(s.direction[1]).toBeGreaterThan(0);
      expect(Math.hypot(...s.direction)).toBeCloseTo(1);
    }
  });

  it('shines through the living room slider by day and into the bedrooms at evening', () => {
    const horizontal = (d: [number, number, number]) => vec.norm({ x: d[0], y: -d[2] });
    const day = horizontal(planSun(glazing, 'daylight').direction);
    const slider = glazing.find((g) => g.kind === 'sliding')!;
    expect(vec.dot(day, slider.outward)).toBeGreaterThan(0.4);
    const evening = horizontal(planSun(glazing, 'evening').direction);
    for (const name of ['Bedroom 1', 'Bedroom 2', 'Bedroom 3']) {
      const g = glazing.find((x) => x.roomId === named(name))!;
      expect(vec.dot(evening, g.outward), name).toBeGreaterThan(0.4);
    }
    // At an angle, not straight in: the patch rakes.
    expect(vec.dot(evening, { x: 0, y: 1 })).toBeLessThan(0.95);
  });

  it('falls back to the old fixed sun when nothing is glazed', () => {
    const s = planSun([], 'evening');
    expect(s.direction[0]).toBeLessThan(0);
    expect(s.elevation).toBeLessThan(30);
  });

  it('converts between plan and world azimuths', () => {
    const v = sunVector(planAzimuth({ x: 0, y: 1 }), 0);
    // Plan +y is world -Z.
    expect(v[2]).toBeCloseTo(-1);
  });
});
