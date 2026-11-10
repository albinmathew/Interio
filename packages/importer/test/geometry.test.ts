import { describe, expect, it } from 'vitest';
import {
  Dirs,
  assignRoles,
  buildRuns,
  chooseScale,
  classifyLayer,
  clearSpans,
  dimensionScale,
  dominantThickness,
  findArcs,
  findDoors,
  mergeStacked,
  nominalThickness,
  pairStrips,
  parseScaleText,
  pathWinding,
  runEnds,
  type EdgeIn,
  type Strip,
} from '../src/index';
import { polygonSpans } from '../src/scale';

/** Closed polygon as edges on one path. */
function outline(points: [number, number][], path: number): EdgeIn[] {
  return points.map(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length]!;
    return { x1, y1, x2, y2, path };
  });
}

const byDir = (strips: Strip[], dir: number) => strips.filter((s) => s.dir === dir).sort((a, b) => a.c - b.c || a.u1 - b.u1);

describe('layer roles', () => {
  it('classifies on the part after the last $', () => {
    expect(classifyLayer('UNIT A$0$a-160 strl')).toBe('wall');
    expect(classifyLayer('UNIT B$0$a-door')).toBe('door');
    expect(classifyLayer('UNIT A$0$a-door 1')).toBe('door');
    expect(classifyLayer('UNIT A$0$a-window')).toBe('window');
    expect(classifyLayer('UNIT A$0$ALUFRAME')).toBe('window');
    expect(classifyLayer('UNIT A$0$a-railing')).toBe('lowWall');
    expect(classifyLayer('a-ledge wall')).toBe('lowWall');
    expect(classifyLayer('UNIT A$0$A-LHWALL')).toBe('lowWall');
    expect(classifyLayer('UNIT A$0$a-furniture')).toBe('furniture');
    expect(classifyLayer('Furniture-print')).toBe('furniture');
    expect(classifyLayer('UNIT A$0$a-kitchen fixtures')).toBe('fixture');
    expect(classifyLayer('UNIT A$0$a-granite counter')).toBe('fixture');
    expect(classifyLayer('a-dim int s')).toBe('dimension');
    expect(classifyLayer('a-textm')).toBe('text');
    expect(classifyLayer('a-dw sch cir')).toBe('tag');
    expect(classifyLayer('a-tile anti skid ceramic')).toBe('hatch');
    expect(classifyLayer('A-HVAC')).toBe('overhead');
    expect(classifyLayer('UNIT A$0$a-chajja line')).toBe('overhead');
    expect(classifyLayer('UNIT A$0$a-ac ledge railing')).toBe('overhead');
    expect(classifyLayer('UNIT A$0$a-rcc beam line')).toBe('overhead');
    expect(classifyLayer('A-TITLE')).toBe('ignore');
    expect(classifyLayer('0')).toBe('ignore');
    expect(classifyLayer('something unknown')).toBe('ignore');
  });

  it('applies overrides by full layer name and reads a nominal thickness', () => {
    expect(assignRoles(['a-misc', 'a-wall'], { 'a-misc': 'wall' })).toEqual(['wall', 'wall']);
    expect(nominalThickness('UNIT A$0$a-160 strl')).toBe(160);
    expect(nominalThickness('A-WALL-230')).toBe(230);
    expect(nominalThickness('a-wall')).toBeNull();
  });
});

describe('strip pairing', () => {
  it('finds the solid side of closed outlines whichever way they wind', () => {
    const ccw = outline([[0, 0], [10, 0], [10, 2], [0, 2]], 1);
    const cw = outline([[0, 0], [0, 2], [10, 2], [10, 0]], 2);
    const w = pathWinding([...ccw, ...cw]);
    expect(w.get(1)).toBe(1);
    expect(w.get(2)).toBe(-1);
    expect(pathWinding([{ x1: 0, y1: 0, x2: 5, y2: 0, path: 3 }]).has(3)).toBe(false);
  });

  it('recovers both legs of an L-shaped wall outline', () => {
    const dirs = new Dirs();
    // Horizontal leg 100 long, vertical leg 80 high, 8 thick.
    const edges = outline([[0, 0], [100, 0], [100, 8], [8, 8], [8, 80], [0, 80]], 1);
    const { strips, oriented } = pairStrips(edges, dirs, { maxT: 30 });
    expect(oriented).toBe(true);
    const real = strips.filter((s) => s.u2 - s.u1 >= s.t);
    expect(real).toHaveLength(2);
    const h = byDir(real, 0)[0]!;
    expect(h.t).toBeCloseTo(8);
    expect(dirs.point(0, 0, h.c).y).toBeCloseTo(4);
    expect([h.u1, h.u2]).toEqual([8, 100]);
    const v = byDir(real, 1)[0]!;
    expect(v.t).toBeCloseTo(8);
    expect(dirs.point(1, 0, v.c).x).toBeCloseTo(4);
    expect(v.u2 - v.u1).toBeCloseTo(72);
    expect(dominantThickness(strips)).toBeCloseTo(8);
  });

  it('pairs plain double lines the same way', () => {
    const dirs = new Dirs();
    const edges: EdgeIn[] = [
      { x1: 0, y1: 0, x2: 50, y2: 0 },
      { x1: 0, y1: 6, x2: 50, y2: 6 },
      { x1: 20, y1: 30, x2: 50, y2: 30 }, // far away: no partner
    ];
    const { strips, singles } = pairStrips(edges, dirs, { maxT: 12 });
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({ dir: 0, c: 3, t: 6, u1: 0, u2: 50 });
    expect(singles).toHaveLength(1);
  });

  it('does not pair the facing sides of two different walls', () => {
    const dirs = new Dirs();
    // Two wall islands 8 thick with a 10 wide shaft between them.
    const edges = [...outline([[0, 0], [60, 0], [60, 8], [0, 8]], 1), ...outline([[0, 18], [60, 18], [60, 26], [0, 26]], 2)];
    const { strips } = pairStrips(edges, dirs, { maxT: 30 });
    const long = strips.filter((s) => s.dir === 0);
    expect(long.map((s) => s.t)).toEqual([8, 8]);
  });

  it('falls back to plain pairing when outlines wrap rooms instead of walls', () => {
    const dirs = new Dirs();
    // Building outline and a room outline inside it: the wall is between the two loops.
    const edges = [...outline([[0, 0], [100, 0], [100, 60], [0, 60]], 1), ...outline([[8, 8], [92, 8], [92, 52], [8, 52]], 2)];
    const res = pairStrips(edges, dirs, { maxT: 20 });
    expect(res.oriented).toBe(false);
    expect(res.strips.filter((s) => Math.abs(s.t - 8) < 1e-6)).toHaveLength(4);
  });

  it('handles walls that are not axis aligned', () => {
    const dirs = new Dirs();
    const a = Math.PI / 6;
    const rot = (x: number, y: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const edges = outline([rot(0, 0), rot(80, 0), rot(80, 8), rot(0, 8)], 1);
    const { strips } = pairStrips(edges, dirs, { maxT: 20 });
    const s = strips.find((x) => x.u2 - x.u1 > 50)!;
    expect(s.t).toBeCloseTo(8, 4);
    expect(s.u2 - s.u1).toBeCloseTo(80, 4);
    const mid = dirs.point(s.dir, (s.u1 + s.u2) / 2, s.c);
    const [ex, ey] = rot(40, 4);
    expect(mid.x).toBeCloseTo(ex, 3);
    expect(mid.y).toBeCloseTo(ey, 3);
  });

  it('stacks the thin slices of a window into one strip', () => {
    const dirs = new Dirs();
    const edges: EdgeIn[] = [0, 3, 5, 8].map((y) => ({ x1: 10, y1: y, x2: 40, y2: y }));
    const thin = pairStrips(edges, dirs, { maxT: 20, oriented: false }).strips;
    expect(thin).toHaveLength(3);
    const merged = mergeStacked(thin);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ c: 4, t: 8, u1: 10, u2: 40 });
  });
});

describe('doors', () => {
  const quarter = (cx: number, cy: number, r: number) => {
    const k = 0.5522847498 * r;
    return { p: [cx + r, cy, cx + r, cy + k, cx + k, cy + r, cx, cy + r] };
  };

  it('fits a circle to a Bezier quarter arc', () => {
    const [arc] = findArcs([quarter(10, 20, 45)], 5, 100);
    expect(arc!.centre.x).toBeCloseTo(10, 1);
    expect(arc!.centre.y).toBeCloseTo(20, 1);
    expect(arc!.radius).toBeCloseTo(45, 1);
    expect(arc!.sweep).toBeCloseTo(90, 0);
    expect(findArcs([quarter(0, 0, 2)], 5, 100)).toHaveLength(0);
  });

  it('takes the end of the arc without a leaf as the strike', () => {
    const leaf = [{ x1: 10, y1: 20, x2: 55, y2: 20 }];
    const [door] = findDoors([quarter(10, 20, 45)], leaf, { minR: 5, maxR: 100 });
    expect(door!.hinge.x).toBeCloseTo(10, 1);
    expect(door!.tip.x).toBeCloseTo(55, 1);
    expect(door!.strike.y).toBeCloseTo(65, 1);
  });

  it('lets the wall gap overrule the drawn leaf', () => {
    // Frame lines drawn across the opening look like a leaf; the wall support knows better.
    const lines = [
      { x1: 10, y1: 20, x2: 55, y2: 20 },
      { x1: 10, y1: 21, x2: 55, y2: 21 },
      { x1: 10, y1: 20, x2: 10, y2: 65 },
    ];
    const support = (_h: { x: number; y: number }, end: { x: number; y: number }) => (Math.abs(end.y - 20) < 1 ? 2 : -1);
    const [door] = findDoors([quarter(10, 20, 45)], lines, { minR: 5, maxR: 100, wallSupport: support });
    expect(door!.strike.x).toBeCloseTo(55, 1);
    expect(door!.strike.y).toBeCloseTo(20, 1);
  });
});

describe('runs', () => {
  const T = 8;
  const strip = (dir: number, c: number, u1: number, u2: number, t = T): Strip => ({ dir, c, t, u1, u2 });

  it('joins collinear strips across a gap as one wall with a passage', () => {
    const dirs = new Dirs();
    const runs = buildRuns({ dirs, T, walls: [strip(0, 4, 0, 100), strip(0, 4, 150, 300)], stubs: [], glazing: [], doors: [], low: [] });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ u1: 0, u2: 300, kind: 'wall' });
    expect(runs[0]!.openings).toHaveLength(1);
    expect(runs[0]!.openings[0]).toMatchObject({ kind: 'passage', u1: 100, u2: 150 });
  });

  it('leaves a gap wider than a passage open', () => {
    const dirs = new Dirs();
    const runs = buildRuns({ dirs, T, walls: [strip(0, 4, 0, 100), strip(0, 4, 300, 400)], stubs: [], glazing: [], doors: [], low: [] });
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.openings.length === 0)).toBe(true);
  });

  it('classifies a gap by what is drawn in it', () => {
    const dirs = new Dirs();
    const runs = buildRuns({
      dirs,
      T,
      walls: [strip(0, 4, 0, 100), strip(0, 4, 160, 300), strip(0, 4, 350, 500)],
      stubs: [],
      glazing: [{ strip: strip(0, 4.5, 100, 160, 7), kind: 'window' }],
      doors: [{ hinge: { x: 300, y: 8 }, strike: { x: 350, y: 8 }, tip: { x: 300, y: 58 }, radius: 50, confidence: 0.9 }],
      low: [],
    });
    expect(runs).toHaveLength(1);
    const [w, d] = runs[0]!.openings;
    expect(w).toMatchObject({ kind: 'window', u1: 100, u2: 160 });
    expect(d).toMatchObject({ kind: 'door', u1: 300, u2: 350, hingeU: 300, swingSide: 1 });
    // The door was drawn on the wall face; the opening sits on the wall centreline.
    expect(runs[0]!.c).toBeCloseTo(4);
  });

  it('snaps corners and T-junctions onto shared points', () => {
    const dirs = new Dirs();
    // Outline-style strips stop at the faces of the walls they meet.
    const walls = [
      strip(0, 4, 8, 200), // bottom wall, centreline y = 4
      strip(1, -4, 8, 150), // left wall, centreline x = 4
      strip(1, -104, 8, 150), // partition, centreline x = 104, stops at the bottom wall's face
    ];
    const runs = buildRuns({ dirs, T, walls, stubs: [], glazing: [], doors: [], low: [] });
    const ends = runs.map((r) => runEnds(r, dirs));
    const bottom = ends.find((e) => Math.abs(e.a.y - e.b.y) < 1e-6)!;
    const left = ends.find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    const part = ends.find((e) => Math.abs(e.a.x - 104) < 1e-6)!;
    expect(Math.min(bottom.a.x, bottom.b.x)).toBeCloseTo(4);
    expect(Math.min(left.a.y, left.b.y)).toBeCloseTo(4);
    expect(Math.min(part.a.y, part.b.y)).toBeCloseTo(4);
  });

  it('keeps a railing that closes a balcony and drops a ledge that hugs a wall', () => {
    const dirs = new Dirs();
    const walls = [strip(0, 4, 0, 300), strip(1, -4, 8, 100), strip(1, -296, 8, 100)];
    const runs = buildRuns({
      dirs,
      T,
      walls,
      stubs: [],
      glazing: [],
      doors: [],
      low: [
        { strip: strip(0, 100, 8, 292, 3), kind: 'railing' },
        { strip: strip(0, 14, 50, 120, 6), kind: 'low' },
      ],
    });
    expect(runs.filter((r) => r.kind === 'railing')).toHaveLength(1);
    expect(runs.filter((r) => r.kind === 'low')).toHaveLength(0);
    const rail = runEnds(runs.find((r) => r.kind === 'railing')!, dirs);
    expect(Math.min(rail.a.x, rail.b.x)).toBeCloseTo(4);
    expect(Math.max(rail.a.x, rail.b.x)).toBeCloseTo(296);
  });
});

describe('scale', () => {
  it('reads scale text', () => {
    expect(parseScaleText('SCALE - 1:50')).toBe(50);
    expect(parseScaleText('Scale 1 / 75')).toBe(75);
    expect(parseScaleText('DATE - 13-05-2025')).toBeNull();
    expect(parseScaleText(undefined)).toBeNull();
  });

  it('measures clear spans between wall faces', () => {
    const walls = [
      { a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, t: 8 },
      { a: { x: 60, y: 0 }, b: { x: 60, y: 100 }, t: 8 },
      { a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, t: 8 },
    ];
    const [w, h] = clearSpans({ x: 30, y: 50 }, walls, [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(w).toBeCloseTo(52);
    expect(h).toBeNull();
  });

  it('reports every clear width of an L-shaped room', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 4000, y: 3500 },
      { x: 0, y: 3500 },
    ];
    const [across, up] = polygonSpans(poly, [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(across.sort()).toEqual([3000, 4000]);
    expect(up.sort()).toEqual([1500, 3500]);
  });

  it('finds the scale the labelled dimensions agree on', () => {
    const s = 17.26;
    const labels = [
      { dims: [3400, 3960] as [number, number], spans: [3400 / s, 3960 / s] as [number, number] },
      { dims: [1565, 2775] as [number, number], spans: [2775 / s, 1565 / s] as [number, number] },
      { dims: [3660, 6435] as [number, number], spans: [9000 / s, 6435 / s] as [number, number] }, // open plan: one span is wrong
      { dims: [2000, 2000] as [number, number], spans: [null, null] as [null, null] },
    ];
    const res = dimensionScale(labels, 17.6);
    expect(res!.value).toBeCloseTo(s, 2);
    expect(res!.support).toBe(3);
    expect(dimensionScale([labels[3]!])).toBeNull();
  });

  it('prefers dimension over wall thickness over title block, and reports the spread', () => {
    expect(chooseScale({ dimension: 17.26, wallThickness: 17.27, titleBlock: 17.64 })).toMatchObject({ source: 'dimension', mmPerPdfUnit: 17.26 });
    expect(chooseScale({ dimension: 17.26, wallThickness: 17.27, titleBlock: 17.64 }).spreadPct).toBeGreaterThan(2);
    expect(chooseScale({ dimension: null, wallThickness: 17.27, titleBlock: 17.64 }).source).toBe('wallThickness');
    expect(chooseScale({ dimension: null, wallThickness: null, titleBlock: 17.64 })).toMatchObject({ source: 'titleBlock', spreadPct: 0 });
    expect(chooseScale({ dimension: 17.26, wallThickness: 17.27, titleBlock: 17.64 }, 20)).toMatchObject({ source: 'user', mmPerPdfUnit: 20 });
  });
});
