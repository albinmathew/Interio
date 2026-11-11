import type { RoomType } from './schema';

/**
 * Finish palette. Core owns ids, names and flat fallback colours; `@interio/scene3d`
 * maps ids to textures. Unknown ids render with the surface default.
 */
export interface MaterialDef {
  id: string;
  name: string;
  surface: 'floor' | 'wall' | 'ceiling';
  color: string;
  roughness: number;
  metalness?: number;
}

const m = (id: string, name: string, surface: MaterialDef['surface'], color: string, roughness: number): MaterialDef => ({
  id,
  name,
  surface,
  color,
  roughness,
});

export const MATERIAL_LIST: MaterialDef[] = [
  m('floor.oak', 'Oak planks', 'floor', '#c9a47a', 0.55),
  m('floor.walnut', 'Walnut planks', 'floor', '#7a5236', 0.5),
  m('floor.ash', 'Ash planks', 'floor', '#e2cfae', 0.6),
  m('floor.herringbone', 'Herringbone oak', 'floor', '#b98d5f', 0.55),
  m('floor.tile.white', 'White vitrified tile', 'floor', '#eeeae4', 0.25),
  m('floor.tile.grey', 'Grey porcelain tile', 'floor', '#a9aaa8', 0.35),
  m('floor.tile.antiskid', 'Anti-skid ceramic', 'floor', '#c8c2b6', 0.8),
  m('floor.marble', 'Marble', 'floor', '#f1ede6', 0.15),
  m('floor.terrazzo', 'Terrazzo', 'floor', '#d8d2c8', 0.4),
  m('floor.concrete', 'Polished concrete', 'floor', '#9b9a96', 0.45),
  m('floor.carpet.beige', 'Beige carpet', 'floor', '#cfc3ae', 0.95),
  m('floor.carpet.grey', 'Grey carpet', 'floor', '#8f9094', 0.95),
  m('floor.deck', 'Outdoor deck', 'floor', '#8a6a4c', 0.7),
  m('floor.oak.smoked', 'Smoked oak planks', 'floor', '#5f4634', 0.55),
  m('floor.oak.grey', 'Grey oak planks', 'floor', '#a59c8e', 0.6),
  m('floor.chevron', 'Chevron walnut', 'floor', '#6f4c35', 0.5),
  m('floor.travertine', 'Travertine', 'floor', '#d9cab2', 0.4),
  m('floor.slate', 'Slate', 'floor', '#55595c', 0.6),
  m('floor.marble.black', 'Black marble', 'floor', '#232426', 0.15),
  m('floor.microcement', 'Microcement', 'floor', '#b5b1aa', 0.5),
  m('wall.paint.white', 'Warm white', 'wall', '#f4f1ea', 0.9),
  m('wall.paint.ivory', 'Ivory', 'wall', '#ece3d0', 0.9),
  m('wall.paint.sand', 'Sand', 'wall', '#d9c7a8', 0.9),
  m('wall.paint.sage', 'Sage', 'wall', '#b7c4b0', 0.9),
  m('wall.paint.sky', 'Sky blue', 'wall', '#bcd0de', 0.9),
  m('wall.paint.blush', 'Blush', 'wall', '#e6c9c0', 0.9),
  m('wall.paint.terracotta', 'Terracotta', 'wall', '#c47b5c', 0.9),
  m('wall.paint.navy', 'Navy', 'wall', '#2f4058', 0.9),
  m('wall.paint.charcoal', 'Charcoal', 'wall', '#4a4b4f', 0.9),
  m('wall.tile.white', 'White wall tile', 'wall', '#f2f2ef', 0.2),
  m('wall.tile.subway', 'Subway tile', 'wall', '#e9ece8', 0.2),
  m('wall.brick', 'Exposed brick', 'wall', '#a8614a', 0.85),
  m('wall.concrete', 'Concrete', 'wall', '#a3a29e', 0.7),
  m('wall.wood', 'Wood panelling', 'wall', '#a37a52', 0.6),
  m('wall.paint.greige', 'Greige', 'wall', '#c9c0b2', 0.9),
  m('wall.paint.mushroom', 'Mushroom', 'wall', '#a79c8f', 0.9),
  m('wall.paint.olive', 'Olive', 'wall', '#7c8363', 0.9),
  m('wall.paint.teal', 'Deep teal', 'wall', '#2f5d62', 0.9),
  m('wall.paint.mustard', 'Mustard', 'wall', '#c99c45', 0.9),
  m('wall.paint.plum', 'Plum', 'wall', '#5d3f52', 0.9),
  m('wall.paint.black', 'Soft black', 'wall', '#232527', 0.9),
  m('wall.wallpaper.linen', 'Linen wallpaper', 'wall', '#ddd3c2', 0.95),
  m('wall.panel.fluted', 'Fluted oak panelling', 'wall', '#b98f62', 0.6),
  m('wall.panel.wainscot', 'White wainscot', 'wall', '#f1eee8', 0.7),
  m('wall.stone.travertine', 'Travertine cladding', 'wall', '#d8c9b1', 0.5),
  m('wall.marble', 'Marble cladding', 'wall', '#efece6', 0.2),
  m('wall.microcement', 'Microcement', 'wall', '#b3afa8', 0.6),
  m('wall.tile.zellige', 'Zellige tile', 'wall', '#dfe5dc', 0.25),
  m('ceiling.white', 'White ceiling', 'ceiling', '#fafaf8', 0.95),
  m('ceiling.wood', 'Wood slat ceiling', 'ceiling', '#b08a5f', 0.65),
];

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(MATERIAL_LIST.map((x) => [x.id, x]));

/**
 * The surface finish a value stands for: a palette id, or a custom colour written
 * as `#rrggbb` (a matte paint of that colour). Null for anything else.
 */
export function resolveSurfaceFinish(value: string | undefined, surface: MaterialDef['surface']): MaterialDef | null {
  if (!value) return null;
  const known = MATERIALS[value];
  if (known) return known;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  const color = value.toLowerCase();
  return { id: color, name: `Custom ${color}`, surface, color, roughness: surface === 'floor' ? 0.5 : 0.9 };
}

/** The wall finish of one face of a wall: its own accent finish, else the room's wall finish, else the default. */
export function wallFaceFinish(wall: { finishLeft?: string; finishRight?: string } | undefined, side: 'left' | 'right', roomWall: string | undefined): string {
  const own = side === 'left' ? wall?.finishLeft : wall?.finishRight;
  return own ?? roomWall ?? DEFAULT_WALL_MATERIAL;
}

export const DEFAULT_WALL_MATERIAL = 'wall.paint.white';
export const DEFAULT_CEILING_MATERIAL = 'ceiling.white';
export const EXTERIOR_WALL_COLOR = '#e7e2d8';

export function defaultFloorFor(type: RoomType): string {
  switch (type) {
    case 'bathroom':
    case 'utility':
      return 'floor.tile.antiskid';
    case 'kitchen':
      return 'floor.tile.grey';
    case 'balcony':
      return 'floor.deck';
    case 'bedroom':
    case 'study':
      return 'floor.oak';
    case 'foyer':
    case 'corridor':
    case 'living':
    case 'dining':
      return 'floor.tile.white';
    default:
      return 'floor.tile.white';
  }
}

export function defaultWallFor(type: RoomType): string {
  return type === 'bathroom' ? 'wall.tile.white' : DEFAULT_WALL_MATERIAL;
}
