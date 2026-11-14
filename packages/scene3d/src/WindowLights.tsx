/**
 * Sky light pouring in through the windows: a rectangular area light in the nearest
 * openings, facing into the room, coloured and scaled by the part of the outside panorama
 * each one looks at. Image-based light that respects the walls, in effect: rooms are bright
 * by the glass and fall off towards the back, as real rooms do.
 *
 * A fixed number of light slots is mounted (spare ones are dark) and moved to the openings
 * nearest the camera as it walks, so materials never recompile.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { radianceThrough, type Panorama } from './outside';
import type { Glazing } from './sun';

let ltcReady = false;

export interface WindowLightsProps {
  glazing: Glazing[];
  /** Number of light slots. */
  count: number;
  /** Small copy of the outside panorama and its turn (see `Outside`). Without it, a neutral sky. */
  panorama: Panorama | null;
  rotation: number;
  /** Overall strength (the preset's `windows`); 0 switches them off. */
  strength: number;
}

/** World direction pointing out of an opening. */
const outwardWorld = (g: Glazing): [number, number, number] => [g.outward.x, 0, -g.outward.y];

interface Fill {
  color: THREE.Color;
  intensity: number;
}

/** Sky colour and strength through one opening: the panorama's half in front of it, sun left out. */
function fillFor(g: Glazing, panorama: Panorama | null, rotation: number, strength: number): Fill {
  const [r, gr, b]: [number, number, number] = panorama ? radianceThrough(panorama, outwardWorld(g), rotation, 6) : [0.9, 0.95, 1];
  const peak = Math.max(r, gr, b, 1e-6);
  const luminance = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  // Poly Haven skies are about 1 to 3 in linear units; a 2 m2 window should read as a soft, bright source.
  const intensity = Math.min(14, 6.5 * Math.sqrt(luminance)) * strength;
  return { color: new THREE.Color(r / peak, gr / peak, b / peak), intensity };
}

export function WindowLights({ glazing: all, count, panorama, rotation, strength }: WindowLightsProps) {
  const invalidate = useThree((s) => s.invalidate);
  // Doors have solid leaves: only windows and glazed sliders let the sky in.
  const glazing = useMemo(() => all.filter((g) => g.kind !== 'door'), [all]);
  if (!ltcReady) {
    RectAreaLightUniformsLib.init();
    ltcReady = true;
  }
  const lights = useMemo(() => Array.from({ length: count }, () => new THREE.RectAreaLight('#ffffff', 0, 1, 1)), [count]);
  useEffect(() => () => lights.forEach((l) => l.dispose()), [lights]);
  const fills = useMemo(() => glazing.map((g) => fillFor(g, panorama, rotation, strength)), [glazing, panorama, rotation, strength]);
  const last = useRef<{ x: number; z: number; fills: Fill[] } | null>(null);
  const forward = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const { x, z } = camera.position;
    const prev = last.current;
    if (prev && prev.fills === fills && Math.hypot(prev.x - x, prev.z - z) < 0.5) return;
    last.current = { x, z, fills };
    // Nearest openings first; ones behind the camera count a little further away.
    camera.getWorldDirection(forward);
    const ranked = glazing
      .map((g, i) => {
        const gx = g.center.x / 1000;
        const gz = -g.center.y / 1000;
        const d = Math.hypot(gx - x, gz - z);
        const ahead = (gx - x) * forward.x + (gz - z) * forward.z;
        return { i, score: d + (ahead < 0 ? 1.5 : 0) };
      })
      .sort((a, b) => a.score - b.score);
    lights.forEach((light, slot) => {
      const pick = ranked[slot];
      const g = pick && glazing[pick.i];
      if (!g || strength <= 0) {
        light.intensity = 0;
        return;
      }
      const fill = fills[pick.i]!;
      const inward = -1;
      const [ox, , oz] = outwardWorld(g);
      // On the room face of the wall, so it lights the room and not the reveal.
      const inset = (g.thickness / 2 + 20) / 1000;
      const px = g.center.x / 1000 + ox * inward * inset;
      const pz = -g.center.y / 1000 + oz * inward * inset;
      const y = (g.sill + g.height / 2) / 1000;
      light.position.set(px, y, pz);
      light.width = g.width / 1000;
      light.height = g.height / 1000;
      light.lookAt(px - ox, y, pz - oz);
      light.color.copy(fill.color);
      light.intensity = fill.intensity;
    });
    invalidate();
  });

  return (
    <>
      {lights.map((light, i) => (
        <primitive key={i} object={light} />
      ))}
    </>
  );
}
