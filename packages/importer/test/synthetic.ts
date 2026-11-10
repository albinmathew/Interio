/**
 * A hand-built "extracted page" for tests: a two-room flat with a balcony, drawn
 * the way CAD exports draw it (closed wall outlines, window lines across the
 * gaps, a swing arc for the door, double-line railings).
 *
 * Real plan, millimetres (clear sizes): Bedroom 3000 x 4000, Living 3000 x 4000,
 * walls 160 thick, balcony 2540 x 1140 below the living room.
 */
import type { VisionResult } from '@interio/core';
import type { Curve, Extracted, PathInfo, Seg } from '../src/extract';

export const MM_PER_UNIT = 20;
const OX = 60;
const OY = 100;
export const PAGE = { width: 500, height: 400 };

const ux = (mm: number) => OX + mm / MM_PER_UNIT;
const uy = (mm: number) => OY + mm / MM_PER_UNIT;

export interface SyntheticOptions {
  /** Put every segment on one unnamed layer (a PDF exported without layers). */
  flat?: boolean;
  /** Mirror the drawing left to right. */
  mirror?: boolean;
}

export function syntheticPlan(opts: SyntheticOptions = {}): Extracted {
  const layers = opts.flat ? [''] : ['', 'FLAT$0$A-WALL-160', 'FLAT$0$A-WINDOW', 'FLAT$0$A-DOOR', 'A-RAILING', 'A-FURNITURE', 'TITLE'];
  const L = (name: string) => (opts.flat ? 0 : layers.findIndex((l) => l.endsWith(name)));
  const segs: Seg[] = [];
  const curves: Curve[] = [];
  const paths: PathInfo[] = [];
  const mx = (x: number) => (opts.mirror ? PAGE.width - x : x);

  const path = (layer: number, width: number): number => {
    paths.push({ layer, width, closed: false, stroked: true, filled: false, lines: 0, curves: 0 });
    return paths.length - 1;
  };
  const line = (layer: number, width: number, x1: number, y1: number, x2: number, y2: number, id = path(layer, width)) => {
    segs.push({ x1: mx(ux(x1)), y1: uy(y1), x2: mx(ux(x2)), y2: uy(y2), layer, width, path: id });
  };
  /** Closed rectangular wall outline. */
  const wall = (x1: number, y1: number, x2: number, y2: number) => {
    const id = path(L('A-WALL-160'), 0.57);
    line(L('A-WALL-160'), 0.57, x1, y1, x2, y1, id);
    line(L('A-WALL-160'), 0.57, x2, y1, x2, y2, id);
    line(L('A-WALL-160'), 0.57, x2, y2, x1, y2, id);
    line(L('A-WALL-160'), 0.57, x1, y2, x1, y1, id);
  };

  // Outer walls. Left wall has a window (y 1500..2700), bottom wall a sliding door (x 3800..5800).
  wall(0, 4160, 6480, 4320);
  wall(0, 0, 3800, 160);
  wall(5800, 0, 6480, 160);
  wall(0, 160, 160, 1500);
  wall(0, 2700, 160, 4160);
  wall(6320, 160, 6480, 4160);
  // Partition with a door gap (y 500..1400).
  wall(3160, 160, 3320, 500);
  wall(3160, 1400, 3320, 4160);

  for (const x of [0, 80, 160]) line(L('A-WINDOW'), 0.14, x, 1500, x, 2700);
  for (const y of [0, 80, 160]) line(L('A-WINDOW'), 0.14, 3800, y, 5800, y);

  // Door: hinge at the lower jamb, leaf drawn open towards +x, quarter-circle swing.
  const hinge = { x: 3240, y: 500 };
  const R = 900;
  line(L('A-DOOR'), 0.14, hinge.x, hinge.y, hinge.x + R, hinge.y);
  const k = 0.5522847498 * R;
  const p = [hinge.x + R, hinge.y, hinge.x + R, hinge.y + k, hinge.x + k, hinge.y + R, hinge.x, hinge.y + R];
  curves.push({
    p: [mx(ux(p[0]!)), uy(p[1]!), mx(ux(p[2]!)), uy(p[3]!), mx(ux(p[4]!)), uy(p[5]!), mx(ux(p[6]!)), uy(p[7]!)],
    layer: L('A-DOOR'),
    width: 0.14,
    path: path(L('A-DOOR'), 0.14),
  });

  // Balcony railing: double lines on three sides.
  for (const x of [3600, 3660]) line(L('A-RAILING'), 0.14, x, -1200, x, 0);
  for (const x of [6200, 6260]) line(L('A-RAILING'), 0.14, x, -1200, x, 0);
  for (const y of [-1200, -1140]) line(L('A-RAILING'), 0.14, 3600, y, 6260, y);

  // A bed against the top wall: must not become walls.
  for (const [x1, y1, x2, y2] of [
    [600, 2000, 2400, 2000],
    [2400, 2000, 2400, 4000],
    [2400, 4000, 600, 4000],
    [600, 4000, 600, 2000],
    [600, 3500, 2400, 3500],
  ] as const) {
    line(L('A-FURNITURE'), 0.14, x1, y1, x2, y2);
  }

  // Sheet border.
  if (!opts.flat) {
    const b = L('TITLE');
    for (const [x1, y1, x2, y2] of [
      [5, 5, 495, 5],
      [495, 5, 495, 395],
      [495, 395, 5, 395],
      [5, 395, 5, 5],
    ] as const) {
      segs.push({ x1, y1, x2, y2, layer: b, width: 0.8, path: path(b, 0.8) });
    }
  }

  return {
    width: PAGE.width,
    height: PAGE.height,
    layers,
    segs,
    curves,
    paths,
    texts: [{ str: 'SCALE - 1:50', x: 400, y: 20, height: 8 }],
    pageCount: 1,
  };
}

const label = (x: number, y: number, mirror = false) => ({
  x: (mirror ? PAGE.width - ux(x) : ux(x)) / PAGE.width,
  y: 1 - uy(y) / PAGE.height,
});

export function syntheticVision(mirror = false): VisionResult {
  return {
    rooms: [
      { name: 'Master Bedroom', type: 'bedroom', labelPoint: label(1660, 1200, mirror), dims: [3000, 4000] },
      { name: 'Living Room', type: 'living', labelPoint: label(4820, 2160, mirror), dims: [3000, 4000] },
      { name: 'Sit-out', type: 'balcony', labelPoint: label(4900, -600, mirror), dims: [2540, 1140] },
    ],
    tags: [{ text: 'D1', kind: 'door', point: label(3240, 950, mirror) }],
    scaleText: '1:50',
  };
}
