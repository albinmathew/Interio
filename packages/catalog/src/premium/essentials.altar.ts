/**
 * The Christian prayer unit: a Kerala (Syro-Malabar) style home altar wall. Floor
 * to ceiling teak flutes on both sides of a recessed, backlit ivory niche; a
 * glowing dove of the Holy Spirit at the top; the Sacred Heart of Jesus on the
 * back panel; a floating shelf with St Joseph and the Child, the St Thomas cross
 * and Our Lady of Grace; a small shelf with a rosary over an open Bible on its
 * stand; a low cabinet with handle-less fronts, and pampas grass at both ends.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { panel, type G } from './decor.parts';
import { Model, box, cyl, rbox, type BuildContext } from './kit';

/* ---------------------------------------------------------------- materials */

/** The fixed materials. Ten meshes at most: three slots and seven of these. */
const STATUE = '#efe3c7'; // painted resin, cream
const GOLD = 'metal.brass';
const SKIN = '#e0bc98'; // faces and hands; pampas plumes share it
const RED = '#a3171d'; // the Sacred Heart, the red vase, the Bible's ribbon
const SILVER = 'metal.chrome'; // the cross and the rosary
const GLOW = '#fff6e6'; // the dove and the LED strips (emissive)
const DARK = '#2a1e16'; // hair, the shadow gaps, the plinth, the Bible's cover

/** How strongly the lit parts glow (emissive intensity). The panel stays soft so bloom does not wash the niche out. */
const PANEL_GLOW = 0.55;
const LED_GLOW = 4;
const PANEL_TINT = new THREE.Color('#ffd9a3');
const LED_TINT = new THREE.Color('#fff0d6');

const glowCopies = new WeakMap<THREE.Material, THREE.Material>();

/**
 * A glowing copy of a built part's material, shared per source material. The
 * source is the catalog's shared material for that finish: never touch it, or
 * every cream item in the home would glow.
 */
function glowOf(source: THREE.Material, tint: THREE.Color, intensity: number): THREE.Material {
  let m = glowCopies.get(source);
  if (!m) {
    const copy = source.clone() as THREE.MeshStandardMaterial;
    copy.name = source.name;
    if (copy.emissive) {
      copy.emissive.copy(copy.color ?? new THREE.Color('#ffffff')).lerp(new THREE.Color('#ffffff'), 0.4).multiply(tint);
      copy.emissiveIntensity = intensity;
    }
    glowCopies.set(source, (m = copy));
  }
  return m;
}

/** Lights the niche's back panel softly and the dove and LED strips brightly. They cast no shadow. */
function light(group: THREE.Group): THREE.Group {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    if (mesh.userData.slot === 'niche') mesh.material = glowOf(mesh.material, PANEL_TINT, PANEL_GLOW);
    else if (!mesh.userData.slot && mesh.material.name === GLOW) mesh.material = glowOf(mesh.material, LED_TINT, LED_GLOW);
    else return;
    mesh.castShadow = false;
  });
  return group;
}

/* -------------------------------------------------------------- the altar */

/**
 * Christian prayer unit (altar wall), front +Z, back against the wall at -Z.
 * The cabinet takes the full depth; the wall above it is shallow.
 */
export function buildAltar(entry: CatalogEntry, ctx?: BuildContext): THREE.Object3D {
  const m = new Model(entry, ctx);
  const { W, D, H } = m;
  const back = -D / 2;
  const front = D / 2;

  /* Base cabinet: a recessed plinth, three handle-less doors under a gola groove, a wood top. */
  const topT = 0.032;
  const cabH = Math.min(0.55, H * 0.23);
  const plinth = 0.08;
  const groove = 0.032;
  const carcassD = D - 0.025;
  const cz = back + carcassD / 2;
  m.fixed(DARK, panel(W - 0.02, plinth, carcassD - 0.06, 0, 0, cz - 0.03, 0.001));
  m.part('fronts', panel(W, cabH - topT - plinth, carcassD - 0.02, 0, plinth, cz - 0.01, 0.002));
  m.fixed(DARK, box(W - 0.006, groove, 0.004, 0, cabH - topT - groove, back + carcassD - 0.018));
  const doors = Math.max(2, Math.round(W / 0.5));
  const gap = 0.003;
  const dw = (W - (doors + 1) * gap) / doors;
  const doorH = cabH - topT - groove - plinth - 2 * gap;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + gap + dw / 2 + i * (dw + gap);
    m.part('fronts', rbox(dw, doorH, 0.018, 0.0025, x, plinth + gap, back + carcassD + 0.009 - 0.004, 1));
  }
  m.part('wood', rbox(W, topT, D, 0.004, 0, cabH - topT, 0, 2));

  /* The wall: a fluted panel each side of a recessed niche. */
  const y0 = cabH;
  const wallH = H - y0;
  const NW = W * 0.55;
  const SW = (W - NW) / 2;
  const boxD = 0.075; // the panels' body, its inner side is the niche's jamb
  const slatD = 0.025;
  const nicheZ = back + 0.02; // back of the niche panel
  const nicheT = 0.015;
  const nicheFace = nicheZ + nicheT;
  m.fixed(DARK, box(W, wallH, 0.01, 0, y0, back + 0.005));
  m.part('niche', box(NW + 0.02, wallH, nicheT, 0, y0, nicheZ + nicheT / 2));
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 - SW / 2);
    m.part('wood', box(SW, wallH, boxD, cx, y0, back + boxD / 2));
    // A dark shadow line behind the slats, so the flutes read from across the room.
    m.fixed(DARK, box(SW - 0.004, wallH, 0.002, cx, y0, back + boxD + 0.001));
    const slat = 0.03;
    const sGap = 0.012;
    const n = Math.max(3, Math.round((SW + sGap) / (slat + sGap)));
    const pitch = (SW - slat) / (n - 1);
    for (let i = 0; i < n; i++) {
      const x = cx - SW / 2 + slat / 2 + i * pitch;
      m.part('wood', panel(slat, wallH, slatD, x, y0, back + boxD + slatD / 2, 0.004));
    }
    // LED strip down the niche's edge, on the back panel.
    m.fixed(GLOW, box(0.008, wallH - 0.02, 0.004, s * (NW / 2 - 0.012), y0 + 0.01, nicheFace + 0.002));
  }
  // And across the top.
  m.fixed(GLOW, box(NW - 0.03, 0.008, 0.004, 0, H - 0.02, nicheFace + 0.002));

  /* Shelves: the statues' shelf with an LED strip under its front, and a small one lower down for the rosary. */
  const shelfY = y0 + wallH * 0.3;
  const shelfT = 0.045;
  const shelfD = Math.min(0.24, D * 0.55);
  m.part('wood', rbox(NW + 0.03, shelfT, shelfD, 0.004, 0, shelfY, nicheFace + shelfD / 2, 2));
  m.fixed(GLOW, box(NW - 0.06, 0.004, 0.01, 0, shelfY - 0.004, nicheFace + shelfD - 0.03));
  const lowY = y0 + wallH * 0.145;
  const lowW = Math.min(0.5, NW * 0.62);
  const lowD = Math.min(0.15, D * 0.34);
  m.part('wood', rbox(lowW, 0.035, lowD, 0.004, 0, lowY, nicheFace + lowD / 2, 2));

  return light(m.build());
}

/** Generators of this family, registered through `essentials.ts`. */
export const ALTAR_GENERATORS: Record<string, (entry: CatalogEntry, ctx?: BuildContext) => THREE.Object3D> = {
  essentialsAltar: buildAltar,
};

// Kept for the props and statues that follow.
void cyl;
export type { G };
