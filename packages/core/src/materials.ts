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
  m('ceiling.white', 'White ceiling', 'ceiling', '#fafaf8', 0.95),
];

export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(MATERIAL_LIST.map((x) => [x.id, x]));

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
