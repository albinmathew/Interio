/**
 * Plan model. THE CONTRACT every package codes against.
 *
 * Units and frames
 * - All lengths are millimetres. Positions are rounded to integers by the ops in `ops.ts`.
 * - Plan frame: x to the right, y UP (maths convention), z = elevation above the floor.
 * - World frame (three.js, metres, Y up): X = x/1000, Y = z/1000, Z = -y/1000. See `frames.ts`.
 * - Angles are degrees, counter-clockwise in the plan frame (equals rotation about world +Y).
 */
import { z } from 'zod';

export type Id = string;
export type Mm = number;

export const PtSchema = z.object({ x: z.number(), y: z.number() });
export type Pt = z.infer<typeof PtSchema>;

/** 2x3 affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export const Mat2x3Schema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]);
export type Mat2x3 = z.infer<typeof Mat2x3Schema>;

export const ROOM_TYPES = [
  'living',
  'dining',
  'bedroom',
  'kitchen',
  'bathroom',
  'balcony',
  'utility',
  'foyer',
  'study',
  'corridor',
  'storage',
  'other',
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const WALL_KINDS = ['wall', 'low', 'railing'] as const;
export const WallKindSchema = z.enum(WALL_KINDS);
export type WallKind = z.infer<typeof WallKindSchema>;

/** A wall runs between two shared vertices along its centreline. */
export const WallSchema = z.object({
  id: z.string(),
  /** Vertex ids. Direction a -> b defines the wall's "left" (CCW normal) and "right" sides. */
  a: z.string(),
  b: z.string(),
  thickness: z.number().positive(),
  height: z.number().positive(),
  /** `wall` is full height; `low` is a parapet/half wall; `railing` is a balcony railing. All three bound rooms. */
  kind: WallKindSchema.default('wall'),
});
export type Wall = z.infer<typeof WallSchema>;

export const OPENING_KINDS = ['door', 'sliding', 'window', 'passage'] as const;
export const OpeningKindSchema = z.enum(OPENING_KINDS);
export type OpeningKind = z.infer<typeof OpeningKindSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  /** Distance along the wall centreline from vertex `a` to the CENTRE of the opening. */
  offset: z.number(),
  width: z.number().positive(),
  /** Clear height of the opening. */
  height: z.number().positive(),
  /** Height of the bottom of the opening above the floor (0 for doors and passages). */
  sill: z.number().min(0).default(0),
  kind: OpeningKindSchema,
  /** Hinged doors: which end of the opening carries the hinge (the end nearer vertex a or b). */
  hinge: z.enum(['a', 'b']).optional(),
  /** Hinged doors: +1 swings into the wall's left side, -1 into its right side. */
  swing: z.union([z.literal(1), z.literal(-1)]).optional(),
  /** Free-form tag from the drawing's schedule, e.g. "D2", "W1", "SD1". */
  tag: z.string().optional(),
});
export type Opening = z.infer<typeof OpeningSchema>;

/**
 * A room is a named seed point. Its polygon is DERIVED from the wall graph
 * (`deriveRooms`); name, type and finishes follow the seed through wall edits.
 */
export const RoomSchema = z.object({
  id: z.string(),
  seed: PtSchema,
  name: z.string(),
  type: RoomTypeSchema.default('other'),
  /** Material ids resolve in the finishes palette (`MATERIALS` in `materials.ts`). */
  floorMaterial: z.string().default('floor.oak'),
  wallMaterial: z.string().optional(),
  ceilingMaterial: z.string().optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  /** Plan position of the item's footprint centre. */
  x: z.number(),
  y: z.number(),
  /** Elevation of the item's underside above the floor. */
  z: z.number().default(0),
  /** CCW degrees. At 0 the item's front faces plan -y and its width runs along plan x. */
  rotationDeg: z.number().default(0),
  roomId: z.string().optional(),
  /** Optional per-item overrides. */
  scale: z.number().positive().optional(),
  variant: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const LevelSchema = z.object({
  id: z.string(),
  name: z.string().default('Level 1'),
  ceilingHeight: z.number().positive().default(3000),
  vertices: z.record(z.string(), PtSchema),
  walls: z.record(z.string(), WallSchema),
  openings: z.record(z.string(), OpeningSchema),
  rooms: z.record(z.string(), RoomSchema),
  items: z.record(z.string(), ItemSchema),
});
export type Level = z.infer<typeof LevelSchema>;

/** Where the plan came from. Blobs (PDF, underlay) live in project storage, keyed by id. */
export const ProjectSourceSchema = z.object({
  fileName: z.string().optional(),
  pdfBlobId: z.string().optional(),
  underlayBlobId: z.string().optional(),
  /** Millimetres of real space per PDF user-space unit. */
  mmPerPdfUnit: z.number().positive().optional(),
  /** Maps plan mm to PDF user space, for re-deriving the underlay. */
  planToPdf: Mat2x3Schema.optional(),
});
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

export const SCHEMA_VERSION = 1 as const;

export const ProjectSchema = z.object({
  schema: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  levels: z.array(LevelSchema).min(1),
  source: ProjectSourceSchema.optional(),
  /** Scene-wide settings owned by the 3D features (lighting preset, time of day...). */
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type Project = z.infer<typeof ProjectSchema>;

/* ---------------------------------------------------------------- catalog */

export const CATALOG_CATEGORIES = [
  'seating',
  'tables',
  'beds',
  'storage',
  'kitchen',
  'bathroom',
  'appliances',
  'lighting',
  'decor',
  'office',
  'outdoor',
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

/**
 * Model conventions (scene3d enforces them at load time):
 * - GLB: any authoring scale/origin. scene3d fits the model's bounding box to `dims`
 *   and puts its bottom-centre on the item position. `yawDeg` corrects models whose
 *   front does not face world +Z.
 * - Parametric: `generator` names a function registered in `@interio/catalog`
 *   that builds a THREE.Object3D for the entry at `dims` (bottom-centre origin, front +Z).
 */
export type CatalogModel =
  | { kind: 'glb'; url: string; yawDeg?: number }
  | { kind: 'parametric'; generator: string; params?: Record<string, unknown> };

export interface CatalogEntry {
  id: string;
  name: string;
  category: CatalogCategory;
  /** Room types this entry is suggested for. Empty means any room. */
  roomTypes: RoomType[];
  /** Outer size: w along the item's local x, d along its local y (depth, front to back), h height. */
  dims: { w: Mm; d: Mm; h: Mm };
  anchor: 'floor' | 'wall' | 'ceiling';
  /** Default elevation of the underside for wall/ceiling anchored entries. */
  mountHeight?: Mm;
  model: CatalogModel;
  thumbnail?: string;
  /** SPDX id plus source, e.g. "CC0-1.0 (Kenney Furniture Kit)". */
  licence: string;
  tags?: string[];
}

/* ------------------------------------------------------------ import draft */

export const LAYER_ROLES = [
  'wall',
  'lowWall',
  'door',
  'window',
  'furniture',
  'fixture',
  'dimension',
  'text',
  'tag',
  'hatch',
  'overhead',
  'ignore',
] as const;
export type LayerRole = (typeof LAYER_ROLES)[number];

export interface Issue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  /** Element ids the issue points at (walls, openings, rooms). */
  refs?: Id[];
  at?: Pt;
}

export interface LayerInfo {
  name: string;
  role: LayerRole;
  segments: number;
}

/** Vector underlay of the source drawing, in plan mm. Stored as a blob next to the project. */
export interface Underlay {
  /** Flat [x1, y1, x2, y2, ...] line segments. */
  segments: Float32Array;
  /** Flat [x, y, ...] snap candidates (segment endpoints and intersections). */
  snapPoints: Float32Array;
  /** Optional raster of the page. `planFromImage` maps image pixels (origin top-left) to plan mm. */
  image?: { blob: Blob; widthPx: number; heightPx: number; planFromImage: Mat2x3 };
}

export interface ScaleEstimate {
  mmPerPdfUnit: number;
  source: 'dimension' | 'wallThickness' | 'titleBlock' | 'user';
  /** Disagreement between the available estimates, in percent. */
  spreadPct: number;
}

/** Output of `@interio/importer`. Reviewed in the import wizard, then `applyDraft` makes it a project. */
export interface PlanDraft {
  level: Level;
  scale: ScaleEstimate;
  /** 0..1 per element id (walls, openings, rooms). Missing means 1. */
  confidence: Record<Id, number>;
  issues: Issue[];
  layers: LayerInfo[];
  underlay: Underlay;
  /** Items inferred from the drawing's furniture/fixture layers. Offered, never auto-applied. */
  suggestedItems: Item[];
  source: ProjectSource;
}

/* -------------------------------------------------------------- AI assist */

/** Normalised image point: origin top-left, x and y in 0..1. */
export const Pt01Schema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type Pt01 = z.infer<typeof Pt01Schema>;

export const VisionResultSchema = z.object({
  rooms: z.array(
    z.object({
      name: z.string(),
      type: RoomTypeSchema,
      labelPoint: Pt01Schema,
      /** Labelled clear dimensions in mm, as written on the drawing (e.g. 3400 x 3960). */
      dims: z.tuple([z.number(), z.number()]).optional(),
    }),
  ),
  tags: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(['door', 'window', 'other']),
      point: Pt01Schema,
    }),
  ),
  scaleText: z.string().optional(),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;

/** Response body of POST /api/analyze-plan. */
export const AnalyzePlanResponseSchema = z.object({
  available: z.boolean(),
  result: VisionResultSchema.optional(),
  model: z.string().optional(),
  error: z.string().optional(),
});
export type AnalyzePlanResponse = z.infer<typeof AnalyzePlanResponseSchema>;

/* ---------------------------------------------------------------- defaults */

export const DEFAULTS = {
  wallThickness: 160,
  partitionThickness: 100,
  ceilingHeight: 3000,
  lowWallHeight: 1000,
  railingHeight: 1100,
  railingThickness: 60,
  doorWidth: 900,
  doorHeight: 2100,
  windowWidth: 1500,
  windowHeight: 1200,
  windowSill: 900,
  slidingWidth: 1800,
  slidingHeight: 2400,
  passageWidth: 1200,
  passageHeight: 2100,
  eyeHeight: 1600,
} as const;
