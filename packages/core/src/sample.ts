/**
 * A generic three-bedroom apartment, hand-authored. Used by "New from sample",
 * by tests, and as every feature's development plan.
 *
 *  y
 *  9000 +-----------+------+----------+---------+
 *       | Bedroom 1 | Bath | Bedroom 2| Bedroom3|
 *  5400 +-----------+------+----------+---------+
 *       |               Corridor                |
 *  4200 +--------+----------------------+-------+
 *       | Kitchen|  Living / Dining     | Bath 2|
 *  2200 |        |                      +-------+
 *       |        |                      | Foyer | <- entrance
 *     0 +--------+----------------------+-------+
 *            -1500    | Balcony |
 *       0      3000        ...        10000   12000  x
 */
import { createProject } from './migrate';
import { buildLevel } from './ops';
import { DEFAULTS, type Level, type Project } from './schema';

const EXT = 200;
const INT = 120;

export function createSampleLevel(): Level {
  const ext = (x1: number, y1: number, x2: number, y2: number) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: EXT });
  const int = (x1: number, y1: number, x2: number, y2: number) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, thickness: INT });
  const rail = (x1: number, y1: number, x2: number, y2: number) => ({
    a: { x: x1, y: y1 },
    b: { x: x2, y: y2 },
    kind: 'railing' as const,
  });
  const door = (x: number, y: number, hinge: 'a' | 'b', swing: 1 | -1, width = 900) => ({
    at: { x, y },
    kind: 'door' as const,
    width,
    height: DEFAULTS.doorHeight,
    sill: 0,
    hinge,
    swing,
  });
  const win = (x: number, y: number, width = 1500, sill: number = DEFAULTS.windowSill, height: number = DEFAULTS.windowHeight) => ({
    at: { x, y },
    kind: 'window' as const,
    width,
    height,
    sill,
  });

  return buildLevel({
    walls: [
      // shell
      ext(0, 0, 12000, 0),
      ext(12000, 0, 12000, 9000),
      ext(12000, 9000, 0, 9000),
      ext(0, 9000, 0, 0),
      // corridor
      int(0, 5400, 12000, 5400),
      int(0, 4200, 12000, 4200),
      // top row
      int(3800, 5400, 3800, 9000),
      int(5600, 5400, 5600, 9000),
      int(9000, 5400, 9000, 9000),
      // bottom row
      int(3000, 0, 3000, 4200),
      int(10000, 0, 10000, 4200),
      int(10000, 2200, 12000, 2200),
      // balcony
      rail(3500, 0, 3500, -1500),
      rail(3500, -1500, 8500, -1500),
      rail(8500, -1500, 8500, 0),
    ],
    openings: [
      // entrance and internal doors
      door(12000, 1100, 'a', 1, 1000),
      door(1900, 5400, 'a', 1),
      door(4700, 5400, 'b', 1, 750),
      door(7300, 5400, 'a', 1),
      door(10500, 5400, 'b', 1),
      door(11000, 4200, 'a', -1, 750),
      // open passages
      { at: { x: 6500, y: 4200 }, kind: 'passage', width: 2400, height: 2400, sill: 0 },
      { at: { x: 10000, y: 1100 }, kind: 'passage', width: 1400, height: 2400, sill: 0 },
      { at: { x: 3000, y: 2400 }, kind: 'passage', width: 1200, height: 2400, sill: 0 },
      // balcony sliding door
      { at: { x: 6000, y: 0 }, kind: 'sliding', width: 3000, height: DEFAULTS.slidingHeight, sill: 0 },
      // windows
      win(1900, 9000, 1800),
      win(4700, 9000, 600, 1800, 600),
      win(7300, 9000, 1800),
      win(10500, 9000, 1500),
      win(0, 2100, 1500, 1050, 1050),
      win(0, 4800, 900),
      win(12000, 3200, 600, 1800, 600),
    ],
    rooms: [
      { at: { x: 1900, y: 7200 }, name: 'Bedroom 1', type: 'bedroom' },
      { at: { x: 4700, y: 7200 }, name: 'Bath 1', type: 'bathroom', wallMaterial: 'wall.tile.white' },
      { at: { x: 7300, y: 7200 }, name: 'Bedroom 2', type: 'bedroom' },
      { at: { x: 10500, y: 7200 }, name: 'Bedroom 3', type: 'bedroom' },
      { at: { x: 6000, y: 4800 }, name: 'Corridor', type: 'corridor' },
      { at: { x: 1500, y: 2100 }, name: 'Kitchen', type: 'kitchen' },
      { at: { x: 6500, y: 2100 }, name: 'Living / Dining', type: 'living', floorMaterial: 'floor.oak' },
      { at: { x: 11000, y: 3200 }, name: 'Bath 2', type: 'bathroom', wallMaterial: 'wall.tile.white' },
      { at: { x: 11000, y: 1100 }, name: 'Foyer', type: 'foyer' },
      { at: { x: 6000, y: -750 }, name: 'Balcony', type: 'balcony' },
    ],
  });
}

export function createSampleProject(name = 'Sample 3-bedroom apartment'): Project {
  return createProject(name, createSampleLevel());
}
