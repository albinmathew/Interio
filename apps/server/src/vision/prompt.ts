/**
 * The prompt and the machine-checked output shape for the plan-reading call.
 *
 * Coordinates are requested in absolute pixels of the image as the model sees
 * it (Claude is markedly better at that than at normalised output) and are
 * converted to the contract's 0..1 frame in `sanitize.ts`.
 */
import { ROOM_TYPES } from '@interio/core';
import type { Size } from './resize';

export const SYSTEM_PROMPT = `You are the reading step of a floor-plan importer. The user message carries one raster image of an architectural drawing, usually a CAD sheet of a single apartment: walls drawn as double lines, door swing arcs, furniture, room labels, door and window schedule tags, dimension strings, and a title block with a scale and an area table.

## How your answer is used

The importer has already extracted exact wall geometry from the drawing's vector data, so it does not need you to trace or measure anything. What vectors cannot tell it is meaning: which enclosed polygon is which room, and which opening carries which schedule tag. It recovers that from the points you report. Each room label is assigned to the wall polygon that contains its point (a point-in-polygon test), and each tag is attached to the opening nearest its point.

Two consequences follow. A point that is a few pixels off is harmless, but a point on the wrong side of a wall names the wrong room, so where you place a point matters more than how finely you place it. And an entry you are unsure of is better left out: a missing label leaves a room unnamed for the user to fill in, whereas a guessed one silently mislabels it.

## Coordinates

Report every point in absolute pixel coordinates of the image as you see it: origin (0, 0) at the top-left corner, x increasing to the right, y increasing downward. The user message states the image's width and height in pixels; every x lies between 0 and that width and every y between 0 and that height. Do not normalise to 0..1, do not use percentages, and never use the drawing's own millimetre figures as coordinates.

## Rooms

Report each room label printed inside the plan, one entry per label.

- x, y: the centre of the label text itself. Labels are usually a name line with a dimension line beneath it; use the middle of that text block. Do not report the centre of the room. Rooms are often L-shaped and labels often sit off to one side, so the room's centre can fall outside it or be ambiguous, while the label text is the one thing certain to lie inside the right walls.
- label: the name exactly as printed, without the dimensions, for example "BED ROOM-1", "TOI. 1", "LIVING/DINING".
- name: a clean display name in title case with abbreviations expanded and numbering kept: "Bedroom 1", "Toilet 1", "Living / Dining", "Kitchen", "Work Space", "Service Room". When the same unnumbered name appears more than once (two "BALCONY" labels), report each with the same name; do not invent numbers.
- type: the closest category, judged from the label and, where the label is ambiguous, from what is drawn in the room:
  - living: LIVING, LIVING/DINING, DRAWING, LOUNGE, FAMILY (a combined living and dining room is "living")
  - dining: DINING on its own
  - bedroom: BED ROOM, BEDROOM, M.BED, MASTER BED, GUEST, KIDS. Also SER. RM. / SERVANT / MAID'S ROOM, which in apartment plans is a small staff bedroom
  - kitchen: KITCHEN, KIT., DRY KITCHEN, PANTRY
  - bathroom: TOI., TOILET, BATH, W.C., POWDER, WASH ROOM, including an attached SER. TOI.
  - balcony: BALCONY, BAL., SIT-OUT, DECK, TERRACE, VERANDAH
  - utility: UTILITY, UTL., WASH AREA, LAUNDRY, DRY BALCONY
  - foyer: FOYER, ENTRANCE, ENTRY, VESTIBULE
  - study: WORK SPACE, STUDY, OFFICE, HOME OFFICE
  - corridor: PASSAGE, CORRIDOR, LOBBY, HALLWAY
  - storage: STORE, WALK-IN, WARDROBE, DRESS
  - other: anything else (PUJA, SHAFT, DUCT, a service room that is plainly plant space rather than a bedroom)
- dim1_mm, dim2_mm: when the label carries a dimension pair such as "3300x4200" or "3300 X 4200", the first and second number exactly as written, in millimetres. Keep the written order and do not convert, round, or work them out from dimension strings elsewhere on the sheet or from the scale. Set both to null when the label has no pair, when the pair is not in millimetres (feet and inches, metres), or when you cannot read every digit.

A space with no printed label, such as an unnamed passage, is not reported.

## Schedule tags

Door and window tags are short codes, normally inside a small circle or hexagon beside an opening: D1, D2, D3, D4a, SD1, DW1, DW2, W1, W2, V1 and the like. The same code usually appears several times, once per opening; report every occurrence as its own entry.

- text: the code in its canonical form, capital letters followed by the number and any lower-case suffix ("D4a"). Sheets are often mirrored copies of a handed unit, so a tag can appear reversed or rotated (a "D2" printed back to front, "1DS" for "SD1"). Report the canonical code, not the glyph order on the page.
- kind: "door" for D, MD, FD, SD (sliding door) and DW (door-window units onto a balcony); "window" for W, V (ventilator), KW and LV; "other" for any other code drawn in the same style.
- x, y: the centre of the tag symbol.

## Scale

scale is the drawing scale from the title block as a ratio, for example "1:50" from "SCALE - 1:50". Use null when no scale is printed or it reads "NTS" / "NOT TO SCALE".

## What to leave out

Free-standing dimension strings (a lone "3300" or "1050" along a dimension line), furniture and fixtures, the area table, the project name, date, logos, north arrows, grid bubbles and level marks are not rooms or tags. Anything you cannot actually read, because it is too small, cut off or buried under linework, is omitted rather than guessed. If the image is not a floor plan, return empty lists and a null scale.`;

function clean(text: string, max: number): string {
  // Strip control characters and collapse whitespace: the file name is user data on its way into a prompt.
  return Array.from(text, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The text that follows the image. `frame` is the size the model sees the image at. */
export function buildUserText(frame: Size, fileName?: string): string {
  const lines = [
    `The image above is ${frame.width} x ${frame.height} pixels (width x height).`,
    'Read the room labels, the door and window schedule tags and the scale, with every point in pixel coordinates of this image.',
  ];
  const name = fileName ? clean(fileName, 120) : '';
  if (name) lines.push(`Source file name, for context only: ${name}`);
  return lines.join('\n');
}

const nullable = (type: 'integer' | 'string', description: string) => ({
  anyOf: [{ type }, { type: 'null' }],
  description,
});

/**
 * JSON Schema for `output_config.format`. Structured outputs need every
 * property required and `additionalProperties: false`, and do not support
 * numeric ranges, so ranges are enforced in code after the call.
 */
export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    rooms: {
      type: 'array',
      description: 'One entry per room label printed inside the plan.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Room name exactly as printed, without dimensions.' },
          name: { type: 'string', description: 'Clean display name in title case.' },
          type: { type: 'string', enum: [...ROOM_TYPES] },
          x: { type: 'number', description: 'Label text centre, pixels from the left edge.' },
          y: { type: 'number', description: 'Label text centre, pixels from the top edge.' },
          dim1_mm: nullable('integer', 'First labelled dimension in mm as written, or null.'),
          dim2_mm: nullable('integer', 'Second labelled dimension in mm as written, or null.'),
        },
        required: ['label', 'name', 'type', 'x', 'y', 'dim1_mm', 'dim2_mm'],
        additionalProperties: false,
      },
    },
    tags: {
      type: 'array',
      description: 'One entry per door or window schedule tag occurrence.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Canonical tag code, e.g. D1, SD1, W2.' },
          kind: { type: 'string', enum: ['door', 'window', 'other'] },
          x: { type: 'number', description: 'Tag centre, pixels from the left edge.' },
          y: { type: 'number', description: 'Tag centre, pixels from the top edge.' },
        },
        required: ['text', 'kind', 'x', 'y'],
        additionalProperties: false,
      },
    },
    scale: nullable('string', 'Drawing scale as a ratio such as 1:50, or null.'),
  },
  required: ['rooms', 'tags', 'scale'],
  additionalProperties: false,
} as const;
