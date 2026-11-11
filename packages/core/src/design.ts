/**
 * Design requests in plain language ("put a sink in the utility", "make the
 * service room a laundry room").
 *
 * The web app sends the request with a summary of the home and the catalog to
 * POST /api/design-edit. The assistant answers with a short reply and a list of
 * `DesignOp`s; the app applies them to the open project as one undo step.
 * Walls, doors and windows are never changed this way.
 */
import { z } from 'zod';
import { deriveRooms } from './geometry/rooms';
import { FURNITURE_MATERIAL_LIST } from './furnitureMaterials';
import { MATERIAL_LIST } from './materials';
import { RoomTypeSchema, type Level } from './schema';

export const ITEM_PLACEMENTS = ['auto', 'wall', 'center'] as const;
export type ItemPlacement = (typeof ITEM_PLACEMENTS)[number];

export const DesignOpSchema = z.discriminatedUnion('op', [
  /** Rename a room, change what kind of room it is, or change its finishes. Only the given fields change. */
  z.object({
    op: z.literal('set_room'),
    roomId: z.string(),
    name: z.string().min(1).max(60).optional(),
    type: RoomTypeSchema.optional(),
    floorMaterial: z.string().optional(),
    wallMaterial: z.string().optional(),
    ceilingMaterial: z.string().optional(),
  }),
  /** Remove everything in the room and furnish it afresh for its type (after a `set_room` that changed the type). */
  z.object({ op: z.literal('refurnish_room'), roomId: z.string() }),
  /** Remove everything in the room. */
  z.object({ op: z.literal('clear_room'), roomId: z.string() }),
  /** Add catalog items to a room. The app finds a free spot: against a wall, in the open floor, or next to another item. */
  z.object({
    op: z.literal('add_item'),
    roomId: z.string(),
    catalogId: z.string(),
    count: z.number().int().min(1).max(12).optional(),
    place: z.enum(ITEM_PLACEMENTS).optional(),
    nearItemId: z.string().optional(),
  }),
  z.object({ op: z.literal('remove_item'), itemId: z.string() }),
  /** Swap an item for another catalog entry, keeping its position. */
  z.object({ op: z.literal('replace_item'), itemId: z.string(), catalogId: z.string() }),
  /**
   * Change the material or colour of one part of an item (its upholstery, frame, top...).
   * `slot` is a slot id of the item's catalog entry; `material` is a furniture material id
   * or a custom colour as `#rrggbb`.
   */
  z.object({ op: z.literal('set_item_finish'), itemId: z.string(), slot: z.string(), material: z.string() }),
  /** Lighting preset id (see `lighting` in the request). */
  z.object({ op: z.literal('set_lighting'), preset: z.string() }),
]);
export type DesignOp = z.infer<typeof DesignOpSchema>;
export type DesignOpKind = DesignOp['op'];

/** What the assistant is told about a catalog entry. */
export const CatalogBriefSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  /** Room types it suits; empty means any. */
  roomTypes: z.array(z.string()),
  /** Width, depth, height in mm. */
  size: z.tuple([z.number(), z.number(), z.number()]),
  anchor: z.enum(['floor', 'wall', 'ceiling']),
  /** Parts whose material can be changed, with the kind of material that suits each. */
  slots: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string() })).optional(),
});
export type CatalogBrief = z.infer<typeof CatalogBriefSchema>;

export const HomeSummarySchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: RoomTypeSchema,
      /** Clear size in mm and area in m². */
      width: z.number(),
      depth: z.number(),
      area: z.number(),
      floorMaterial: z.string(),
      wallMaterial: z.string().optional(),
      items: z.array(
        z.object({
          id: z.string(),
          catalogId: z.string(),
          name: z.string(),
          /** The item's current finish per slot, when it has customisable parts. */
          finishes: z.record(z.string(), z.string()).optional(),
        }),
      ),
    }),
  ),
  lighting: z.string().optional(),
});
export type HomeSummary = z.infer<typeof HomeSummarySchema>;

export const DesignTurnSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) });
export type DesignTurn = z.infer<typeof DesignTurnSchema>;

/** Request body of POST /api/design-edit. */
export const DesignEditRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  home: HomeSummarySchema,
  catalog: z.array(CatalogBriefSchema).max(1000),
  finishes: z.array(z.object({ id: z.string(), name: z.string(), surface: z.enum(['floor', 'wall', 'ceiling']) })).max(200),
  lighting: z.array(z.object({ id: z.string(), name: z.string() })).max(20),
  /** Materials that furniture parts can take (see `FURNITURE_MATERIAL_LIST`). */
  furnitureFinishes: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() })).max(300).optional(),
  /** Earlier turns of this conversation, oldest first, so follow-ups ("make it bigger") make sense. */
  history: z.array(DesignTurnSchema).max(20).optional(),
});
export type DesignEditRequest = z.infer<typeof DesignEditRequestSchema>;

/** Response body of POST /api/design-edit. */
export const DesignEditResponseSchema = z.object({
  /** False when no AI provider is configured. */
  available: z.boolean(),
  /** One or two sentences for the user: what was done, or why nothing could be. */
  reply: z.string().optional(),
  ops: z.array(DesignOpSchema).optional(),
  model: z.string().optional(),
  error: z.string().optional(),
});
export type DesignEditResponse = z.infer<typeof DesignEditResponseSchema>;

/** The home as the assistant sees it: rooms with their sizes, finishes and what is in them. */
export function summariseHome(level: Level, itemName: (catalogId: string) => string, lighting?: string): HomeSummary {
  const geoms = deriveRooms(level);
  const rooms = Object.values(level.rooms).map((room) => {
    const g = geoms.find((x) => x.roomId === room.id);
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      width: Math.round(g?.width ?? 0),
      depth: Math.round(g?.depth ?? 0),
      area: Math.round(((g?.interiorArea ?? 0) / 1_000_000) * 10) / 10,
      floorMaterial: room.floorMaterial,
      ...(room.wallMaterial ? { wallMaterial: room.wallMaterial } : {}),
      items: Object.values(level.items)
        .filter((i) => i.roomId === room.id)
        .map((i) => ({ id: i.id, catalogId: i.catalogId, name: itemName(i.catalogId), ...(i.finishes && Object.keys(i.finishes).length ? { finishes: i.finishes } : {}) })),
    };
  });
  return { rooms, ...(lighting ? { lighting } : {}) };
}

/** The furniture materials in the shape the request carries. */
export function furnitureFinishBriefs(): NonNullable<DesignEditRequest['furnitureFinishes']> {
  return FURNITURE_MATERIAL_LIST.map((m) => ({ id: m.id, name: m.name, kind: m.kind }));
}

/** The finishes palette in the shape the request carries. */
export function finishBriefs(): DesignEditRequest['finishes'] {
  return MATERIAL_LIST.map((m) => ({ id: m.id, name: m.name, surface: m.surface }));
}
