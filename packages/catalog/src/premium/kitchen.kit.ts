/**
 * Geometry helpers for the kitchen, appliance and bathroom families, on top of
 * `kit.ts`: profiles extruded along an axis (worktops, rails, seams that must
 * meet a neighbour without a bevel), plates with cut-outs, rounded-rectangle
 * sweeps for sanitary ware and sinks, and small deformers.
 */
import * as THREE from 'three';

const { PI } = Math;

/** Rounded rectangle centred on (cx, cy) in the XY plane. `r` is clamped to fit. */
export function rrect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const radius = Math.max(0, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5));
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  s.moveTo(x0 + radius, y0);
  s.lineTo(x1 - radius, y0);
  if (radius) s.absarc(x1 - radius, y0 + radius, radius, -PI / 2, 0, false);
  s.lineTo(x1, y1 - radius);
  if (radius) s.absarc(x1 - radius, y1 - radius, radius, 0, PI / 2, false);
  s.lineTo(x0 + radius, y1);
  if (radius) s.absarc(x0 + radius, y1 - radius, radius, PI / 2, PI, false);
  s.lineTo(x0, y0 + radius);
  if (radius) s.absarc(x0 + radius, y0 + radius, radius, PI, PI * 1.5, false);
  return s;
}

/** Ellipse centred on (cx, cy) in the XY plane. */
export function ellipse(rx: number, ry: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, PI * 2, false, 0);
  return s;
}

/**
 * Section of a board whose edges at u1 (the front) are rounded with radius `r`
 * top and bottom, drawn in (u, v). `rBack` rounds the u0 side too.
 */
export function edgeProfile(u0: number, u1: number, v0: number, v1: number, r: number, rBack = 0): THREE.Shape {
  const rf = Math.max(0, Math.min(r, (v1 - v0) / 2 - 1e-5, (u1 - u0) / 2 - 1e-5));
  const rb = Math.max(0, Math.min(rBack, (v1 - v0) / 2 - 1e-5, (u1 - u0) / 2 - 1e-5));
  const s = new THREE.Shape();
  s.moveTo(u0 + rb, v0);
  s.lineTo(u1 - rf, v0);
  if (rf) s.absarc(u1 - rf, v0 + rf, rf, -PI / 2, 0, false);
  s.lineTo(u1, v1 - rf);
  if (rf) s.absarc(u1 - rf, v1 - rf, rf, 0, PI / 2, false);
  s.lineTo(u0 + rb, v1);
  if (rb) s.absarc(u0 + rb, v1 - rb, rb, PI / 2, PI, false);
  s.lineTo(u0, v0 + rb);
  if (rb) s.absarc(u0 + rb, v0 + rb, rb, PI, PI * 1.5, false);
  return s;
}

/**
 * Extrudes a section drawn in (z, y) along X over `length`, centred on x. The
 * ends are flat, so a neighbour's piece meets it without a seam.
 */
export function alongX(section: THREE.Shape, length: number, x = 0, curveSegments = 4): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(section, { depth: Math.max(length, 1e-4), bevelEnabled: false, curveSegments });
  // (x, y, z) -> (-z, y, x): the section's x becomes world z, the extrusion runs along -x.
  g.rotateY(-PI / 2);
  return g.translate(x + length / 2, 0, 0);
}

/** Extrudes a section drawn in (x, y) along Z over `length`, centred on z. */
export function alongZ(section: THREE.Shape, length: number, z = 0, curveSegments = 4): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(section, { depth: Math.max(length, 1e-4), bevelEnabled: false, curveSegments });
  return g.translate(0, 0, z - length / 2);
}

/**
 * A flat plate lying in the XZ plane, `thickness` up from y, drawn as a shape
 * in world (x, z): unlike `slab`, the shape's y is world +z, so cut-outs are
 * placed where they appear. No bevel: the outline stays exact.
 */
export function plate(shape: THREE.Shape, thickness: number, y = 0, curveSegments = 12): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(thickness, 1e-4), bevelEnabled: false, curveSegments });
  // (x, y, z) -> (x, z, y) would mirror; rotate +90 deg about X instead: (x, y, z) -> (x, -z, y), then lift.
  g.rotateX(PI / 2);
  // Now the shape's y is world z and the extrusion runs down from 0 to -thickness.
  return g.translate(0, y + thickness, 0);
}

/** A shape with holes cut out of it. */
export function withHoles(shape: THREE.Shape, ...holes: THREE.Shape[]): THREE.Shape {
  shape.holes.push(...holes);
  return shape;
}

/**
 * Sweeps a profile around a rounded rectangle, like `lathe` around a circle.
 * `profile` is [offset, height] pairs, the offset measured outwards from the
 * outline (half sizes `hw` by `hd`, corner radius `rc`): offset o gives the
 * rounded rectangle hw + o by hd + o with radius rc + o (never below 0). Profiles drawn bottom to
 * top on the outside face outwards, as with `lathe`; continue the same profile
 * over a rim and down inside to get a basin whose inner face is visible.
 * Smooth normals; the bottom of a basin is left open for a flat floor piece.
 */
export function sweep(profile: [number, number][], hw: number, hd: number, rc: number, x = 0, y = 0, z = 0, cornerSegments = 6): THREE.BufferGeometry {
  const r0 = Math.max(0, Math.min(rc, hw - 1e-4, hd - 1e-4));
  // Corners in the order lathe walks round (phi from +z towards +x).
  const corners: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const ring: { sx: number; sz: number; phi: number }[] = [];
  corners.forEach(([sx, sz], k) => {
    for (let s = 0; s <= cornerSegments; s++) ring.push({ sx, sz, phi: (k + s / cornerSegments) * (PI / 2) });
  });
  const P = profile.length;
  const N = ring.length;
  const pos: number[] = [];
  for (const { sx, sz, phi } of ring) {
    for (const [o, h] of profile) {
      // The outline offset by o: half sizes hw + o and hd + o, corner radius rc + o (at least 0).
      const r = Math.max(r0 + o, 0);
      const cx = sx * Math.max(hw + o - r, 0);
      const cz = sz * Math.max(hd + o - r, 0);
      pos.push(x + cx + r * Math.sin(phi), y + h, z + cz + r * Math.cos(phi));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    for (let j = 0; j < P - 1; j++) {
      const a = j + i * P;
      const b = j + next * P;
      const c = j + 1 + next * P;
      const d = j + 1 + i * P;
      idx.push(a, b, d, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Revolves a profile about the y axis over part of a turn (phi from +z towards +x). Smooth normals. */
export function arcLathe(profile: [number, number][], phiStart: number, phiLength: number, segments = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0), h)),
    segments,
    phiStart,
    phiLength,
  );
}

/** Moves every vertex through `fn` (x, y, z) => [x, y, z] and recomputes normals when asked. */
export function deform(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number], renormal = true): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const [a, b, c] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, a, b, c);
  }
  pos.needsUpdate = true;
  if (renormal) g.computeVertexNormals();
  return g;
}

/** Scales a geometry about a point. */
export function scaleAt(g: THREE.BufferGeometry, sx: number, sy: number, sz: number, px = 0, py = 0, pz = 0): THREE.BufferGeometry {
  return g.translate(-px, -py, -pz).scale(sx, sy, sz).translate(px, py, pz);
}

/** A thin disc lying flat (a printed ring, a drain, a button), centred on (x, z) with its underside at y. */
export function disc(r: number, h: number, x = 0, y = 0, z = 0, segments = 28): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, Math.max(h, 1e-4), segments).translate(x, y + h / 2, z);
}

/** A flat ring lying in the XZ plane (outer and inner radius), underside at y. */
export function annulus(rOuter: number, rInner: number, h: number, x = 0, y = 0, z = 0, segments = 32): THREE.BufferGeometry {
  const s = ellipse(rOuter, rOuter);
  s.holes.push(ellipse(rInner, rInner));
  return plate(s, h, y, segments).translate(x, 0, z);
}

/** A torus lying flat (a pan-support ring, a gasket), centred on (x, z) at height y. */
export function ringTube(r: number, tubeR: number, x = 0, y = 0, z = 0, radial = 8, tubular = 36): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tubeR, radial, tubular).rotateX(PI / 2).translate(x, y, z);
}

/** A torus standing upright facing +Z (a porthole rim, a door gasket). */
export function ringFront(r: number, tubeR: number, x = 0, y = 0, z = 0, radial = 8, tubular = 40): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tubeR, radial, tubular).translate(x, y, z);
}
