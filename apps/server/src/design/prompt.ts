/**
 * The prompt and the machine-checked output shape for design requests in plain
 * language ("put a sink in the utility", "make the service room a laundry room").
 */
import { ITEM_PLACEMENTS, ROOM_TYPES, type DesignEditRequest } from '@interio/core';

export const DESIGN_OPS = ['set_room', 'refurnish_room', 'clear_room', 'add_item', 'remove_item', 'replace_item', 'set_lighting'] as const;

export const SYSTEM_PROMPT = `You are the design assistant of Interio, an app in which people furnish and style a 3D model of their own home. The user tells you in plain language what they want changed. You answer with a short reply and a list of operations; the app carries the operations out on the home and shows the user what changed.

## What you are given

The user message contains, in this order: the home (every room with its id, name, type, clear size in millimetres, area, finishes and the items already in it, each with an item id), the catalog of furniture and appliances that can be placed (id, name, category, size in millimetres as width x depth x height, how it is mounted, and the room types it suits), the finishes that floors, walls and ceilings can take, the lighting presets, earlier turns of this conversation if there are any, and finally the request.

## Operations

Use only these. Every id you write must be copied exactly from the lists you were given: room ids and item ids from the home, catalog ids from the catalog, finish ids from the finishes, preset ids from the lighting presets. Never invent an id; an operation with an unknown id is thrown away.

- set_room (roomId, and any of name, type, floorMaterial, wallMaterial, ceilingMaterial): rename a room, change what kind of room it is, or change its finishes. Only the fields you fill in change.
- refurnish_room (roomId): empties the room and furnishes it afresh for its type with a complete, sensible layout. This is how a room changes purpose: set_room with the new type and name first, then refurnish_room. It removes everything in the room, so use it only when the user asks for the room to be redone, changes what the room is for, or asks to furnish an empty room.
- clear_room (roomId): removes everything in the room.
- add_item (roomId, catalogId, optionally count, place, nearItemId): adds an item. You do not give coordinates: the app finds a free spot that keeps doors and walkways clear. place is "wall" (back against a wall), "center" (in the open floor) or "auto" (the app decides; right for almost everything). nearItemId asks for a spot next to an item that is already in the room, for example chairs near a table or a nightstand near a bed. count adds several of the same.
- remove_item (itemId): removes one item.
- replace_item (itemId, catalogId): swaps an item for another catalog entry in the same spot. Use it for "a bigger sofa", "a double bed instead", "a different fridge". If the new piece is a different kind of thing, use remove_item and add_item instead.
- set_lighting (preset): changes the lighting of the whole home.

Operations run in the order you list them, and each sees the result of the ones before it.

## How to decide

Work out which room the user means from its name or type. People are loose with names: "utility", "the wash area" and "laundry" may all be the room called "Utility"; "service room" may be "Ser. Rm." or "Service Room"; "master bedroom" is usually the largest bedroom or "Bedroom 1". When exactly one room fits, act on it. When several fit equally and it matters (three bedrooms and the user says "the bedroom"), do nothing and ask which one in your reply.

Translate purposes into room types: a laundry or washing room is "utility"; a work space, office or study is "study"; a guest room, kids' room or staff room is "bedroom"; a store or walk-in wardrobe is "storage"; a prayer room, gym or play room is "other". Give the room a fitting short name when its purpose changes ("Laundry", "Work Space").

Pick catalog entries by what the user asked for, then by what suits the room type and fits the room: compare the item's width and depth with the room's clear size, and remember what is already in the room. For "a sink" in a utility or kitchen, a sink unit is right; in a bathroom, a basin. Prefer one good choice over several guesses. If the catalog has nothing suitable, say so rather than substituting something unrelated.

Change only what was asked. Do not refurnish, restyle or tidy other rooms on your own initiative.

You cannot move, add or remove walls, doors or windows, resize rooms, give exact positions, or recolour furniture. If the user asks for one of those, do the parts you can and say plainly which part is not possible here (walls, doors and windows are edited in Plan mode). If the request is not about the home at all, return no operations and say what you can help with.

## Reply

One or two short sentences in plain words for the home owner: what you did, in terms of rooms and furniture, never ids. If you did nothing, say why or ask your question. Do not promise results: the app reports separately if an item could not be fitted.`;

const nullable = (schema: Record<string, unknown>, description: string) => ({ anyOf: [schema, { type: 'null' }], description });

/**
 * JSON Schema for the structured output. Structured outputs need every property
 * required and `additionalProperties: false`, so each operation is one flat
 * object whose unused fields are null; `sanitize.ts` turns it into a `DesignOp`.
 */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'One or two short sentences for the user.' },
    ops: {
      type: 'array',
      description: 'Operations to carry out, in order. Empty when nothing should change.',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: [...DESIGN_OPS] },
          roomId: nullable({ type: 'string' }, 'Room id from the home. For set_room, refurnish_room, clear_room, add_item.'),
          itemId: nullable({ type: 'string' }, 'Item id from the home. For remove_item, replace_item.'),
          catalogId: nullable({ type: 'string' }, 'Catalog id. For add_item, replace_item.'),
          count: nullable({ type: 'integer' }, 'add_item: how many, 1 to 12. Null means 1.'),
          place: nullable({ type: 'string', enum: [...ITEM_PLACEMENTS] }, 'add_item: where. Null means auto.'),
          nearItemId: nullable({ type: 'string' }, 'add_item: id of an item already in the room to stand next to.'),
          name: nullable({ type: 'string' }, 'set_room: new room name.'),
          type: nullable({ type: 'string', enum: [...ROOM_TYPES] }, 'set_room: new room type.'),
          floorMaterial: nullable({ type: 'string' }, 'set_room: floor finish id.'),
          wallMaterial: nullable({ type: 'string' }, 'set_room: wall finish id.'),
          ceilingMaterial: nullable({ type: 'string' }, 'set_room: ceiling finish id.'),
          preset: nullable({ type: 'string' }, 'set_lighting: preset id.'),
        },
        required: ['op', 'roomId', 'itemId', 'catalogId', 'count', 'place', 'nearItemId', 'name', 'type', 'floorMaterial', 'wallMaterial', 'ceilingMaterial', 'preset'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'ops'],
  additionalProperties: false,
} as const;

/** Control characters out, whitespace collapsed: this text is user data on its way into a prompt. */
function clean(text: string, max: number): string {
  return Array.from(text, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The user message: the home, what can be placed and chosen, the conversation so far, then the request. */
export function buildUserText(request: DesignEditRequest): string {
  const lines: string[] = ['<home>'];
  for (const room of request.home.rooms) {
    lines.push(
      `room ${room.id} | "${clean(room.name, 60)}" | type ${room.type} | clear size ${room.width} x ${room.depth} mm | ${room.area} m2 | floor ${room.floorMaterial}${room.wallMaterial ? ` | walls ${room.wallMaterial}` : ''}`,
    );
    if (room.items.length === 0) lines.push('  (empty)');
    for (const item of room.items) lines.push(`  item ${item.id} | ${item.catalogId} | ${clean(item.name, 60)}`);
  }
  if (request.home.lighting) lines.push(`lighting now: ${request.home.lighting}`);
  lines.push('</home>', '', '<catalog>', 'id | name | category | width x depth x height mm | mounted | suits');
  for (const e of request.catalog) {
    lines.push(`${e.id} | ${clean(e.name, 60)} | ${e.category} | ${e.size[0]} x ${e.size[1]} x ${e.size[2]} | ${e.anchor} | ${e.roomTypes.join(', ') || 'any room'}`);
  }
  lines.push('</catalog>', '', '<finishes>');
  for (const f of request.finishes) lines.push(`${f.id} | ${clean(f.name, 60)} | ${f.surface}`);
  lines.push('</finishes>', '', '<lighting_presets>');
  for (const l of request.lighting) lines.push(`${l.id} | ${clean(l.name, 40)}`);
  lines.push('</lighting_presets>');
  if (request.history?.length) {
    lines.push('', '<conversation_so_far>');
    for (const turn of request.history) lines.push(`${turn.role === 'user' ? 'User' : 'You'}: ${clean(turn.text, 600)}`);
    lines.push('</conversation_so_far>');
  }
  lines.push('', '<request>', clean(request.instruction, 2000), '</request>');
  return lines.join('\n');
}
