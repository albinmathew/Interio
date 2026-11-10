/**
 * Model output -> contract `DesignOp[]`. Each operation is checked against the
 * request it answers: unknown rooms, items, catalog entries, finishes and
 * presets are dropped one by one, so a single bad row costs that row only.
 */
import { DesignOpSchema, ITEM_PLACEMENTS, ROOM_TYPES, type DesignEditRequest, type DesignOp, type RoomType } from '@interio/core';

const MAX_OPS = 60;
const MAX_REPLY = 600;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export interface DesignAnswer {
  reply: string;
  ops: DesignOp[];
  /** Operations the model wrote that did not survive the checks. */
  dropped: number;
}

export function toDesignAnswer(raw: unknown, request: DesignEditRequest): DesignAnswer | null {
  if (!isRecord(raw) || !Array.isArray(raw.ops)) return null;
  const rooms = new Set(request.home.rooms.map((r) => r.id));
  const items = new Set(request.home.rooms.flatMap((r) => r.items.map((i) => i.id)));
  const catalog = new Set(request.catalog.map((c) => c.id));
  const finishes = new Map(request.finishes.map((f) => [f.id, f.surface]));
  const presets = new Set(request.lighting.map((l) => l.id));
  // A ceiling may take a wall paint; a floor never takes a wall finish and the other way round.
  const finish = (value: unknown, surface: 'floor' | 'wall' | 'ceiling') => {
    const id = str(value);
    const got = id ? finishes.get(id) : undefined;
    return got && (got === surface || (surface === 'ceiling' && got === 'wall')) ? id : undefined;
  };

  const ops: DesignOp[] = [];
  let dropped = 0;
  for (const row of raw.ops.slice(0, MAX_OPS)) {
    const op = isRecord(row) ? build(row) : null;
    const checked = op ? DesignOpSchema.safeParse(op) : null;
    if (checked?.success) ops.push(checked.data);
    else dropped += 1;
  }
  dropped += Math.max(0, raw.ops.length - MAX_OPS);
  return { reply: (str(raw.reply) ?? '').replace(/\s+/g, ' ').slice(0, MAX_REPLY), ops, dropped };

  function build(row: Record<string, unknown>): Record<string, unknown> | null {
    const roomId = str(row.roomId);
    const itemId = str(row.itemId);
    const catalogId = str(row.catalogId);
    switch (row.op) {
      case 'set_room': {
        if (!roomId || !rooms.has(roomId)) return null;
        const type = ROOM_TYPES.find((t): t is RoomType => t === row.type);
        const patch = {
          name: str(row.name)?.slice(0, 60),
          type,
          floorMaterial: finish(row.floorMaterial, 'floor'),
          wallMaterial: finish(row.wallMaterial, 'wall'),
          ceilingMaterial: finish(row.ceilingMaterial, 'ceiling'),
        };
        const filled = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
        return Object.keys(filled).length ? { op: 'set_room', roomId, ...filled } : null;
      }
      case 'refurnish_room':
      case 'clear_room':
        return roomId && rooms.has(roomId) ? { op: row.op, roomId } : null;
      case 'add_item': {
        if (!roomId || !rooms.has(roomId) || !catalogId || !catalog.has(catalogId)) return null;
        const count = typeof row.count === 'number' && Number.isFinite(row.count) ? Math.max(1, Math.min(12, Math.round(row.count))) : undefined;
        const place = ITEM_PLACEMENTS.find((p) => p === row.place);
        const near = str(row.nearItemId);
        return {
          op: 'add_item',
          roomId,
          catalogId,
          ...(count && count > 1 ? { count } : {}),
          ...(place && place !== 'auto' ? { place } : {}),
          ...(near && items.has(near) ? { nearItemId: near } : {}),
        };
      }
      case 'remove_item':
        return itemId && items.has(itemId) ? { op: 'remove_item', itemId } : null;
      case 'replace_item':
        return itemId && items.has(itemId) && catalogId && catalog.has(catalogId) ? { op: 'replace_item', itemId, catalogId } : null;
      case 'set_lighting': {
        const preset = str(row.preset);
        return preset && presets.has(preset) ? { op: 'set_lighting', preset } : null;
      }
      default:
        return null;
    }
  }
}
