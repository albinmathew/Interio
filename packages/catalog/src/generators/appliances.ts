/**
 * Parametric appliances the CC0 kit does not cover. Each one is built to the
 * entry's `dims` exactly (bottom-centre origin, front +Z) from palette materials.
 */
import type { CatalogEntry } from '@interio/core';
import * as THREE from 'three';
import { Builder, param, size } from './kit';

type Built = ReturnType<Builder['build']>;

/** Gas or induction hob that sits on a worktop. `params.burners`: 2 to 5, `params.type`: 'gas' | 'induction'. */
export function buildHob(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const type = param<'gas' | 'induction'>(entry, 'type', 'gas');
  const burners = param<number>(entry, 'burners', 4);
  const b = new Builder();

  const spots: [number, number, number][] = []; // x, z, radius
  const back = -D * 0.2;
  const front = D * 0.16;
  const r = Math.min(W / (burners <= 2 ? 3.2 : 7), D * 0.17);
  if (burners <= 2) {
    if (W > D) spots.push([-W * 0.24, -D * 0.04, r], [W * 0.24, -D * 0.04, r]);
    else spots.push([0, back, r], [0, front, r * 0.85]);
  } else if (burners === 3) spots.push([-W * 0.27, back, r], [W * 0.27, back, r], [0, front, r * 1.1]);
  else {
    spots.push([-W * 0.27, back, r], [W * 0.27, back, r * 0.85], [-W * 0.27, front, r * 0.85], [W * 0.27, front, r]);
    if (burners >= 5) spots.push([0, (back + front) / 2, r * 1.15]);
  }

  if (type === 'induction') {
    const mark = 0.001;
    b.box('glassDark', W, H - mark, D);
    for (const [x, z, rad] of spots) {
      b.add('steelMid', new THREE.RingGeometry(rad * 0.92, rad, 32).rotateX(-Math.PI / 2).translate(x, H, z));
      b.add('steelMid', new THREE.RingGeometry(rad * 0.1, rad * 0.14, 16).rotateX(-Math.PI / 2).translate(x, H, z));
    }
    // Touch control strip.
    b.box('screen', W * 0.34, mark, D * 0.05, 0, H - mark, D * 0.42);
    return b.build(`hob:${entry.id}`);
  }

  const glass = Math.min(0.012, H * 0.25);
  b.box('glassDark', W, glass, D);
  for (const [x, z, rad] of spots) {
    const rise = H - glass;
    b.cyl('steelDark', rad * 0.62, rad * 0.7, rise * 0.45, x, glass, z);
    b.cyl('blackMetal', rad * 0.36, rad * 0.36, rise * 0.3, x, glass + rise * 0.45, z, 'y', 16);
    b.add('flame', new THREE.TorusGeometry(rad * 0.5, rise * 0.07, 6, 20).rotateX(Math.PI / 2).translate(x, glass + rise * 0.55, z));
    // Pan support: a square frame with four fingers, top face at the full height.
    const arm = rad * 2.1;
    const bar = Math.max(0.006, rad * 0.11);
    const top = rise * 0.3;
    for (const s of [-1, 1]) {
      b.box('blackMetal', arm, top, bar, x, H - top, z + (s * arm) / 2 - (s * bar) / 2);
      b.box('blackMetal', bar, top, arm, x + (s * arm) / 2 - (s * bar) / 2, H - top, z);
      b.box('blackMetal', bar, rise * 0.7, bar, x + (s * arm) / 2 - (s * bar) / 2, glass, z + (s * arm) / 2 - (s * bar) / 2);
      b.box('blackMetal', bar, rise * 0.7, bar, x + (s * arm) / 2 - (s * bar) / 2, glass, z - (s * arm) / 2 + (s * bar) / 2);
      b.box('blackMetal', arm * 0.3, top, bar, x + s * arm * 0.33, H - top, z);
      b.box('blackMetal', bar, top, arm * 0.3, x, H - top, z + s * arm * 0.33);
    }
  }
  // Knobs along the front edge.
  const knobs = spots.length;
  const pitch = Math.min(0.075, (W * 0.7) / knobs);
  for (let i = 0; i < knobs; i++) {
    const x = (i - (knobs - 1) / 2) * pitch;
    b.cyl('steel', 0.014, 0.017, Math.min(0.022, H - glass), x, glass, D / 2 - 0.035, 'y', 16);
  }
  return b.build(`hob:${entry.id}`);
}

/** Front of a built-in oven: control strip, glass door with window, bar handle. Returns nothing; draws into `b`. */
function ovenFront(b: Builder, x: number, y0: number, w: number, h: number, face: number, proud: number): void {
  const strip = Math.min(0.11, h * 0.2);
  const door = h - strip - 0.004;
  b.box('glassDark', w, door, 0.02, x, y0, face - 0.01);
  b.box('screen', w * 0.72, door * 0.56, 0.002, x, y0 + door * 0.16, face + 0.001);
  b.box('brushed', w, strip, 0.02, x, y0 + door + 0.004, face - 0.01);
  b.box('screen', w * 0.2, strip * 0.42, 0.002, x, y0 + door + 0.004 + strip * 0.29, face + 0.001);
  b.box('led', w * 0.06, strip * 0.12, 0.001, x - w * 0.04, y0 + door + 0.004 + strip * 0.44, face + 0.0025);
  for (const s of [-1, 1]) b.cyl('steelDark', 0.017, 0.02, proud * 0.55, x + s * w * 0.3, y0 + door + 0.004 + strip / 2, face + proud * 0.275, 'z', 16);
  // Handle bar on two posts, touching the front plane.
  const hy = y0 + door - 0.05;
  b.cyl('chrome', 0.009, 0.009, w * 0.8, x, hy, face + proud - 0.009, 'x', 12);
  for (const s of [-1, 1]) b.box('chrome', 0.012, 0.012, proud - 0.012, x + s * w * 0.34, hy - 0.006, face + (proud - 0.012) / 2);
}

/**
 * Built-in oven in its housing, ready to drop into a kitchen run.
 * `params.housing`: 'base' (under a worktop) or 'tall' (oven tower with a microwave niche).
 */
export function buildBuiltinOven(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const housing = param<'base' | 'tall'>(entry, 'housing', 'base');
  const b = new Builder();
  const proud = 0.04;
  const face = D / 2 - proud;
  const plinth = 0.1;
  const t = 0.018;
  const back = -D / 2;
  const bodyD = face - 0.02 - back;
  const bodyZ = (face - 0.02 + back) / 2;
  const topT = housing === 'base' ? 0.03 : t;
  const bodyTop = H - topT;

  b.box('woodDark', W - 0.02, plinth, bodyD - 0.05, 0, 0, bodyZ - 0.015);
  b.box('wood', t, bodyTop - plinth, bodyD + 0.02, -W / 2 + t / 2, plinth, bodyZ + 0.01);
  b.box('wood', t, bodyTop - plinth, bodyD + 0.02, W / 2 - t / 2, plinth, bodyZ + 0.01);
  b.box('woodDark', W - 2 * t, bodyTop - plinth, bodyD, 0, plinth, bodyZ);
  if (housing === 'base') b.box('worktop', W, topT, D - proud + 0.02, 0, bodyTop, (back + face + 0.02) / 2);
  else b.box('wood', W, topT, bodyD + 0.02, 0, bodyTop, bodyZ + 0.01);

  const inner = W - 2 * t - 0.006;
  const front = (y0: number, h: number, handle: boolean) => {
    b.box('wood', inner, h - 0.004, 0.018, 0, y0 + 0.002, face - 0.009);
    if (handle) b.box('steel', Math.min(0.22, inner * 0.4), 0.012, 0.026, 0, y0 + h * 0.5 - 0.006, face + 0.013);
  };
  if (housing === 'base') {
    const avail = bodyTop - plinth;
    const oven = Math.min(0.6, avail * 0.82);
    front(plinth, avail - oven, false);
    ovenFront(b, 0, bodyTop - oven, inner, oven, face, proud);
  } else {
    const ovenY = 0.72;
    const oven = 0.6;
    const micro = 0.38;
    const lower = (ovenY - plinth) / 2;
    front(plinth, lower, true);
    front(plinth + lower, lower, true);
    ovenFront(b, 0, ovenY, inner, oven, face, proud);
    // Compact microwave: door, side control column.
    const my = ovenY + oven;
    b.box('glassDark', inner * 0.74, micro - 0.004, 0.02, -inner * 0.13, my + 0.002, face - 0.01);
    b.box('screen', inner * 0.56, micro * 0.62, 0.002, -inner * 0.13, my + micro * 0.19, face + 0.001);
    b.box('brushed', inner * 0.26 - 0.004, micro - 0.004, 0.02, inner * 0.37, my + 0.002, face - 0.01);
    b.box('screen', inner * 0.18, micro * 0.16, 0.002, inner * 0.37, my + micro * 0.72, face + 0.001);
    b.cyl('steelDark', 0.016, 0.019, 0.02, inner * 0.37, my + micro * 0.3, face + 0.01, 'z', 16);
    b.box('chrome', 0.012, micro * 0.6, 0.026, inner * 0.2, my + micro * 0.2, face + 0.013);
    front(my + micro, bodyTop - (my + micro), true);
  }
  return b.build(`oven:${entry.id}`);
}

/** Freestanding dishwasher with a stainless door and a dark control strip. */
export function buildDishwasher(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const proud = 0.03;
  const face = D / 2 - proud;
  const kick = 0.1;
  const strip = 0.11;
  const top = 0.02;
  const bodyD = face - 0.02 + D / 2;
  const bodyZ = (face - 0.02 - D / 2) / 2;
  b.box('steelDark', W - 0.02, kick, bodyD - 0.04, 0, 0, bodyZ - 0.01);
  b.box('plastic', W, H - kick - top, bodyD, 0, kick, bodyZ);
  b.box('plastic', W, top, bodyD + 0.02, 0, H - top, bodyZ + 0.01);
  const doorH = H - kick - top - strip - 0.006;
  b.box('brushed', W - 0.006, doorH, 0.02, 0, kick + 0.002, face - 0.01);
  b.box('panelDark', W - 0.006, strip, 0.02, 0, kick + doorH + 0.006, face - 0.01);
  const sy = kick + doorH + 0.006;
  b.box('screen', W * 0.16, strip * 0.4, 0.002, W * 0.22, sy + strip * 0.3, face + 0.001);
  for (let i = 0; i < 4; i++) b.box(i === 0 ? 'led' : 'steelMid', 0.012, 0.012, 0.002, -W * 0.3 + i * 0.035, sy + strip * 0.44, face + 0.001);
  b.cyl('steel', 0.016, 0.016, 0.014, -W * 0.38, sy + strip / 2, face + 0.007, 'z', 16);
  // Handle bar.
  b.cyl('chrome', 0.009, 0.009, W * 0.7, 0, kick + doorH - 0.045, face + proud - 0.009, 'x', 12);
  for (const s of [-1, 1]) b.box('chrome', 0.012, 0.012, proud - 0.012, s * W * 0.3, kick + doorH - 0.051, face + (proud - 0.012) / 2);
  return b.build(`dishwasher:${entry.id}`);
}

/** Top-loading washing machine: glass lid, raised control console at the back. */
export function buildTopLoadWasher(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const consoleH = Math.min(0.11, H * 0.12);
  const consoleD = Math.min(0.15, D * 0.26);
  const bodyH = H - consoleH;
  const feet = 0.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('rubber', 0.02, 0.022, feet, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 'y', 12);
  b.rounded('plastic', W, D, bodyH - feet, 0.03, 0, feet + (bodyH - feet) / 2, 0, 'y');
  // Lid over the drum opening.
  const lidD = D - consoleD - 0.05;
  const lidZ = D / 2 - 0.03 - lidD / 2;
  b.cyl('steelMid', W * 0.34, W * 0.34, 0.002, 0, bodyH, lidZ, 'y', 32);
  b.cyl('steelDark', W * 0.12, W * 0.12, 0.003, 0, bodyH, lidZ, 'y', 24);
  b.rounded('glassSmoke', W - 0.06, lidD, 0.012, 0.03, 0, bodyH + 0.008, lidZ, 'y');
  b.box('steelLight', W * 0.3, 0.006, 0.02, 0, bodyH + 0.014, D / 2 - 0.045);
  // Console.
  const cz = -D / 2 + consoleD / 2;
  b.profile('plastic', [
    [-D / 2, bodyH],
    [-D / 2, H],
    [-D / 2 + consoleD * 0.45, H],
    [-D / 2 + consoleD, bodyH + consoleH * 0.35],
    [-D / 2 + consoleD, bodyH],
  ], W);
  const slope = Math.atan2(consoleH * 0.65, consoleD * 0.55);
  const panel = (key: Parameters<Builder['add']>[0], w: number, d: number, x: number, lift: number) =>
    b.add(key, new THREE.BoxGeometry(w, 0.002, d).rotateX(slope).translate(x, bodyH + consoleH * 0.675 + lift, cz + consoleD * 0.225 + lift * 0.6));
  panel('panelDark', W * 0.86, Math.hypot(consoleH * 0.65, consoleD * 0.55) * 0.8, 0, 0.0006);
  panel('screen', W * 0.2, 0.03, W * 0.2, 0.0018);
  for (let i = 0; i < 5; i++) panel(i === 1 ? 'led' : 'steelMid', 0.012, 0.012, -W * 0.36 + i * 0.03, 0.0018);
  return b.build(`washer-top:${entry.id}`);
}

/** Wall-mounted flat-panel television with its bracket. Depth includes the bracket. */
export function buildWallTv(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const bracket = D * 0.4;
  const glass = 0.002;
  const panel = D - bracket - glass;
  b.box('steelDark', W * 0.3, H * 0.42, bracket, 0, H * 0.29, -D / 2 + bracket / 2);
  b.box('blackMetal', W, H, panel, 0, 0, -D / 2 + bracket + panel / 2);
  const bezel = Math.max(0.006, W * 0.006);
  b.box('screen', W - 2 * bezel, H - 2 * bezel - 0.008, glass, 0, bezel + 0.008, D / 2 - glass / 2);
  b.box('steelMid', 0.03, 0.003, glass, 0, 0.004, D / 2 - glass / 2);
  return b.build(`tv:${entry.id}`);
}

/** Indoor unit of a split air conditioner. Hangs on the wall with its back at -Z. */
export function buildSplitAc(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const z0 = -D / 2;
  const skin = 0.0015; // decals sit on the shell and reach the stated size
  const z1 = D / 2 - skin;
  const top = H - skin;
  // Side profile: flat back and top, rounded shoulder, face, then the outlet slope down to the wall.
  const shoulder: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    shoulder.push([z1 - D * 0.3 + Math.sin(a) * D * 0.3, top - H * 0.22 + Math.cos(a) * H * 0.22]);
  }
  const outletTop: [number, number] = [z1, H * 0.34];
  const outletBottom: [number, number] = [z1 - D * 0.36, H * 0.02];
  b.profile('plastic', [[z0, H * 0.1], [z0, top], ...shoulder, outletTop, outletBottom, [z1 - D * 0.5, 0], [z0 + D * 0.12, 0]], W - 0.024);
  // End caps, a shade darker.
  for (const s of [-1, 1])
    b.profile('steelLight', [[z0, H * 0.1], [z0, top], ...shoulder, outletTop, outletBottom, [z1 - D * 0.5, 0], [z0 + D * 0.12, 0]], 0.012, s * (W / 2 - 0.006));

  // Outlet: dark slot with a louvre blade along the slope.
  const dz = outletBottom[0] - outletTop[0];
  const dy = outletBottom[1] - outletTop[1];
  const len = Math.hypot(dz, dy);
  const tilt = Math.atan2(-dy, dz);
  const mid: [number, number] = [(outletTop[0] + outletBottom[0]) / 2, (outletTop[1] + outletBottom[1]) / 2];
  const nz = -dy / len;
  const ny = dz / len;
  const along = (key: Parameters<Builder['add']>[0], width: number, depth: number, out: number, shift = 0) =>
    b.add(
      key,
      new THREE.BoxGeometry(width, 0.003, depth)
        .rotateX(tilt)
        .translate(0, mid[1] - ny * out + (dy / len) * shift, mid[0] - nz * out + (dz / len) * shift),
    );
  along('panelDark', W * 0.84, len * 0.62, -0.0012);
  along('steelLight', W * 0.82, len * 0.26, -0.004, len * 0.1);

  // Panel seam, intake grille on top, status light.
  b.box('steelMid', W - 0.03, 0.003, skin, 0, H * 0.4, z1 + skin / 2);
  for (let i = 0; i < 5; i++) b.box('steelMid', W * 0.86, skin, D * 0.035, 0, top, z0 + D * (0.12 + i * 0.1));
  b.box('ledBlue', 0.02, 0.006, skin, W * 0.36, H * 0.46, z1 + skin / 2);
  b.box('steelMid', 0.05, 0.008, skin, -W * 0.36, H * 0.47, z1 + skin / 2);
  return b.build(`ac:${entry.id}`);
}

/** Storage water heater (geyser): enamelled tank on a wall bracket with inlet and outlet pipes. */
export function buildGeyser(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const R = W / 2;
  const pod = 0.012;
  const cz = D / 2 - R - pod;
  const pipes = Math.min(0.07, H * 0.12);
  const cap = Math.min(0.06, H * 0.1);
  const r = R - 0.004;
  b.cyl('plastic', r, r, H - pipes - 2 * cap, 0, pipes + cap, cz, 'y', 32);
  b.dome('plastic', r, cap, r, 0, H - cap, cz);
  b.dome('steelLight', r, cap, r, 0, pipes + cap, cz, true);
  b.cyl('steelMid', R, R, 0.03, 0, pipes + cap + 0.01, cz, 'y', 32);
  // Thermostat pod with dial and lamp.
  b.rounded('steelLight', 0.1, 0.07, pod + 0.02, 0.012, 0, pipes + cap + 0.1, cz + R + pod / 2 - 0.01, 'z');
  b.cyl('steelDark', 0.016, 0.018, 0.006, -0.018, pipes + cap + 0.1, cz + R + pod - 0.003, 'z', 16);
  b.box('led', 0.008, 0.008, 0.002, 0.026, pipes + cap + 0.096, cz + R + pod - 0.001);
  // Pipes with isolation valves.
  for (const [s, key] of [[-1, 'ledBlue'], [1, 'fabricClay']] as const) {
    b.cyl('chrome', 0.011, 0.011, pipes + cap * 0.4, s * R * 0.45, 0, cz, 'y', 12);
    b.cyl(key, 0.016, 0.016, 0.012, s * R * 0.45, pipes * 0.35, cz, 'y', 12);
  }
  // Wall bracket.
  b.box('steelMid', W * 0.5, H * 0.5, cz - R + D / 2 + 0.01, 0, H * 0.3, (-D / 2 + cz - R + 0.01) / 2);
  return b.build(`geyser:${entry.id}`);
}

/** Instant (tankless) water heater: compact wall box with a dial and two pipes. */
export function buildInstantGeyser(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const pipes = Math.min(0.05, H * 0.14);
  const knob = 0.012;
  const bodyD = D - knob;
  const bodyZ = -knob / 2;
  b.rounded('plastic', W, H - pipes, bodyD, Math.min(0.04, W * 0.16), 0, pipes + (H - pipes) / 2, bodyZ, 'z');
  b.rounded('steelLight', W * 0.7, (H - pipes) * 0.34, 0.004, 0.02, 0, pipes + (H - pipes) * 0.3, bodyZ + bodyD / 2 + 0.001, 'z');
  b.cyl('steelDark', 0.02, 0.023, knob, 0, pipes + (H - pipes) * 0.3, D / 2 - knob / 2, 'z', 16);
  b.box('led', 0.01, 0.01, 0.002, W * 0.22, pipes + (H - pipes) * 0.4, bodyZ + bodyD / 2 + 0.004);
  b.box('steelMid', W * 0.4, 0.004, 0.002, 0, pipes + (H - pipes) * 0.72, bodyZ + bodyD / 2 + 0.001);
  for (const s of [-1, 1]) b.cyl('chrome', 0.01, 0.01, pipes + 0.02, s * W * 0.25, 0, bodyZ, 'y', 12);
  return b.build(`geyser-instant:${entry.id}`);
}

/** Wall-mounted RO water purifier: white shell, dark fascia, see-through storage tank and tap. */
export function buildPurifier(entry: CatalogEntry): Built {
  const { W, D, H } = size(entry);
  const b = new Builder();
  const tap = 0.035;
  const bodyD = D - tap;
  const bodyZ = -tap / 2;
  const face = bodyZ + bodyD / 2;
  b.rounded('plastic', W, H, bodyD, Math.min(0.035, W * 0.12), 0, H / 2, bodyZ, 'z');
  // Fascia with indicators.
  b.rounded('glassDark', W * 0.86, H * 0.36, 0.004, 0.02, 0, H * 0.76, face + 0.001, 'z');
  for (let i = 0; i < 3; i++) b.box(i === 0 ? 'ledBlue' : 'led', 0.01, 0.01, 0.002, -W * 0.18 + i * W * 0.18, H * 0.8, face + 0.004);
  b.box('steelMid', W * 0.3, 0.006, 0.002, 0, H * 0.67, face + 0.004);
  // Storage tank window.
  b.rounded('water', W * 0.74, H * 0.3, 0.006, 0.02, 0, H * 0.38, face + 0.002, 'z');
  b.box('steelLight', W * 0.74, 0.004, 0.003, 0, H * 0.44, face + 0.006);
  // Tap and drip tray.
  b.cyl('chrome', 0.011, 0.011, tap - 0.006, 0, H * 0.16, face + (tap - 0.006) / 2, 'z', 12);
  b.cyl('chrome', 0.009, 0.011, 0.03, 0, H * 0.16 - 0.034, face + tap - 0.016, 'y', 12);
  b.box('steelDark', 0.022, 0.008, 0.03, 0, H * 0.16 + 0.01, face + tap - 0.015);
  b.box('steelMid', W * 0.44, 0.01, tap, 0, 0.012, face + tap / 2);
  return b.build(`purifier:${entry.id}`);
}
