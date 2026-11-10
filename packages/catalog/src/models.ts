/**
 * GLB models shipped in `apps/web/public/catalog/models`.
 *
 * Each model is cut from a CC0 source pack by `scripts/normalise-models.ts`,
 * which bakes it to the catalog conventions: metres, bottom-centre origin,
 * front facing +Z, bounding box equal to `dims`, materials from `PALETTE`.
 * Because the fit is baked in, entries need no `yawDeg`.
 *
 * `dims` are real-world sizes chosen close to the source model's proportions.
 */
import type { PaletteKey } from './palette';

export interface SourcePack {
  name: string;
  author: string;
  version: string;
  url: string;
  /** SPDX id. Only CC0-1.0 is accepted. */
  licence: 'CC0-1.0';
  licenceUrl: string;
  /** How the licence was confirmed. */
  verified: string;
}

export const PACKS = {
  'kenney-furniture-kit': {
    name: 'Kenney Furniture Kit',
    author: 'Kenney (kenney.nl)',
    version: '2.0',
    url: 'https://kenney.nl/assets/furniture-kit',
    licence: 'CC0-1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    verified:
      'Asset page lists "License: Creative Commons CC0" and the archive ships License.txt stating "License: (Creative Commons Zero, CC0)". Checked 2026-11-10.',
  },
} as const satisfies Record<string, SourcePack>;

export type PackId = keyof typeof PACKS;

export interface ModelSpec {
  pack: PackId;
  /** File name in the pack's GLB folder, without extension. */
  source: string;
  /** Size the model is baked to, mm. */
  dims: { w: number; d: number; h: number };
  /** Rotation applied to the source so its front faces +Z, degrees CCW about +Y. */
  sourceYawDeg?: number;
  /** Palette overrides by source material name. */
  materials?: Record<string, PaletteKey>;
}

type Mats = Record<string, PaletteKey>;

const k = (source: string, w: number, d: number, h: number, materials?: Mats, sourceYawDeg?: number): ModelSpec => ({
  pack: 'kenney-furniture-kit',
  source,
  dims: { w, d, h },
  ...(materials ? { materials } : {}),
  ...(sourceYawDeg ? { sourceYawDeg } : {}),
});

const CERAMIC: Mats = { carpetWhite: 'ceramic', _defaultMat: 'ceramic', metalLight: 'chrome', metalDark: 'steelMid', metal: 'chrome' };
const KITCHEN: Mats = { metal: 'worktop' };
const WHITE_GOODS: Mats = { metalLight: 'plastic', _defaultMat: 'plastic', metal: 'steel', glass: 'glassSmoke' };

/** Keyed by output file name (without `.glb`). */
export const MODELS = {
  // seating
  'sofa-2seat': k('loungeSofa', 1650, 850, 840, { carpet: 'fabricSand' }),
  'sofa-3seat': k('loungeSofa', 2100, 880, 840),
  'sofa-corner': k('loungeSofaCorner', 2200, 2200, 840),
  'sofa-chaise': k('loungeSofaLong', 2100, 1600, 840, { carpet: 'fabricSand' }),
  'sofa-ottoman': k('loungeSofaOttoman', 800, 800, 420),
  'sofa-modern-loveseat': k('loungeDesignChair', 1350, 780, 740),
  'sofa-modern-3seat': k('loungeDesignSofa', 2100, 800, 740),
  'sofa-modern-corner': k('loungeDesignSofaCorner', 2500, 2500, 740),
  armchair: k('loungeChair', 900, 800, 850, { carpet: 'fabricSage' }),
  'armchair-recliner': k('loungeChairRelax', 900, 1250, 1100, { carpet: 'fabricCharcoal' }),
  'chair-dining': k('chair', 430, 430, 900),
  'chair-dining-cushion': k('chairCushion', 430, 430, 900, { carpet: 'fabricSand' }),
  'chair-rounded': k('chairRounded', 430, 430, 900),
  'chair-modern': k('chairModernCushion', 440, 440, 880, { carpetBlue: 'fabricSage', metal: 'white' }),
  'chair-modern-frame': k('chairModernFrameCushion', 440, 440, 880, { carpetBlue: 'fabricCharcoal', metal: 'steel' }),
  bench: k('bench', 900, 450, 880),
  'bench-cushion': k('benchCushion', 900, 450, 880, { carpet: 'fabricSand' }),
  'bench-low': k('benchCushionLow', 900, 450, 430, { carpet: 'fabricSage' }),
  'stool-bar': k('stoolBar', 420, 370, 760, { carpet: 'fabricCharcoal' }),
  'stool-bar-square': k('stoolBarSquare', 360, 350, 750, { carpet: 'fabricClay' }),

  // tables
  'table-coffee': k('tableCoffee', 1100, 600, 400),
  'table-coffee-glass': k('tableCoffeeGlass', 1100, 600, 400, { metal: 'blackMetal' }),
  'table-coffee-square': k('tableCoffeeSquare', 750, 750, 400),
  'table-coffee-glass-square': k('tableCoffeeGlassSquare', 750, 750, 400, { metal: 'blackMetal' }),
  'table-console': k('sideTable', 1100, 380, 780),
  'table-console-drawers': k('sideTableDrawers', 1100, 380, 780),
  'table-dining-4': k('table', 1250, 800, 750),
  'table-dining-6': k('table', 1700, 900, 750),
  'table-dining-8': k('table', 2300, 1000, 750),
  'table-dining-trestle': k('tableCross', 1700, 900, 750),
  'table-dining-glass': k('tableGlass', 1700, 900, 750, { metal: 'blackMetal' }),
  'table-dining-round': k('tableRound', 1040, 1200, 750),

  // beds
  'bed-single': k('bedSingle', 950, 2000, 680, { carpet: 'fabricBlue' }),
  'bed-double': k('bedDouble', 1400, 2000, 700, { carpet: 'fabricSage' }),
  'bed-queen': k('bedDouble', 1600, 2050, 700),
  'bed-king': k('bedDouble', 1850, 2100, 700, { carpet: 'fabricSand' }),
  'bed-bunk': k('bedBunk', 1000, 2000, 1600, { carpet: 'fabricClay' }),

  // storage
  nightstand: k('cabinetBed', 460, 400, 460),
  'nightstand-drawer': k('cabinetBedDrawer', 460, 400, 480, { _defaultMat: 'steel' }),
  'nightstand-table': k('cabinetBedDrawerTable', 460, 400, 480, { _defaultMat: 'steel' }),
  'wardrobe-2door': k('bookcaseClosedDoors', 1000, 580, 2000),
  'bookcase-closed': k('bookcaseClosed', 800, 350, 1800),
  'bookcase-wide': k('bookcaseClosedWide', 1500, 350, 1500),
  'bookcase-open': k('bookcaseOpen', 800, 350, 1800),
  'bookcase-low': k('bookcaseOpenLow', 800, 350, 800),
  'tv-unit': k('cabinetTelevision', 1700, 420, 520),
  'tv-unit-doors': k('cabinetTelevisionDoors', 1700, 420, 520),
  'coat-rack-standing': k('coatRackStanding', 520, 520, 1700),
  'coat-rack-wall': k('coatRack', 800, 220, 480),
  'box-cardboard': k('cardboardBoxClosed', 400, 400, 500, { wood: 'fabricSandDark', woodDark: 'teak' }),
  trashcan: k('trashcan', 300, 340, 620),

  // kitchen
  'kitchen-base': k('kitchenCabinet', 600, 600, 870, KITCHEN),
  'kitchen-base-drawers': k('kitchenCabinetDrawer', 600, 600, 870, KITCHEN),
  'kitchen-base-corner': k('kitchenCabinetCornerInner', 620, 620, 870, KITCHEN),
  'kitchen-base-end': k('kitchenCabinetCornerRound', 600, 600, 870, KITCHEN),
  'kitchen-sink': k('kitchenSink', 600, 600, 950, { metal: 'worktop', metalLight: 'brushed', metalDark: 'chrome', _defaultMat: 'brushed' }),
  'kitchen-wall': k('kitchenCabinetUpper', 600, 350, 720),
  'kitchen-wall-double': k('kitchenCabinetUpperDouble', 800, 350, 720),
  'kitchen-wall-low': k('kitchenCabinetUpperLow', 600, 350, 360),
  'kitchen-wall-end': k('kitchenCabinetUpperCorner', 300, 350, 720),
  'kitchen-bar': k('kitchenBar', 1200, 500, 1050, KITCHEN),
  'kitchen-bar-end': k('kitchenBarEnd', 280, 500, 1050, KITCHEN),

  // bathroom
  toilet: k('toilet', 400, 700, 780, CERAMIC),
  'toilet-square': k('toiletSquare', 380, 620, 780, CERAMIC),
  'basin-vanity': k('bathroomCabinetDrawer', 800, 520, 880, { carpetWhite: 'ceramic', metalLight: 'chrome', metalDark: 'steelMid' }),
  'basin-pedestal': k('bathroomSink', 560, 460, 880, CERAMIC),
  'basin-pedestal-square': k('bathroomSinkSquare', 600, 460, 880, CERAMIC),
  'bathroom-cabinet': k('bathroomCabinet', 450, 200, 760, { metal: 'mirror' }),
  'bathroom-mirror': k('bathroomMirror', 600, 160, 870, { glass: 'mirror', metal: 'chrome' }),
  shower: k('shower', 900, 900, 2050, { carpetWhite: 'ceramic', metalDark: 'steelMid', metal: 'chrome' }),
  'shower-corner': k('showerRound', 900, 900, 2050, { carpetWhite: 'ceramic', _defaultMat: 'ceramic', metalDark: 'steelMid' }),
  bathtub: k('bathtub', 1700, 750, 580, { ...CERAMIC, metalDark: 'ceramic' }),

  // appliances
  'fridge-single': k('kitchenFridgeSmall', 560, 620, 1250, WHITE_GOODS),
  'fridge-top-freezer': k('kitchenFridge', 680, 700, 1700, WHITE_GOODS),
  'fridge-double': k('kitchenFridgeLarge', 900, 720, 1780, { metalLight: 'brushed', metalMedium: 'steelDark' }),
  'fridge-mini': k('kitchenFridgeSmall', 480, 500, 700, WHITE_GOODS),
  'fridge-integrated': k('kitchenFridgeBuiltIn', 600, 600, 2000, { metalLight: 'brushed' }),
  'range-gas': k('kitchenStove', 600, 600, 870, { metal: 'brushed', carpetWhite: 'steelLight', glass: 'glassSmoke' }),
  'range-electric': k('kitchenStoveElectric', 600, 600, 870, { metal: 'glassDark', carpetWhite: 'steelLight', glass: 'glassSmoke' }),
  'hood-chimney': k('hoodModern', 600, 480, 600, { metalMedium: 'brushed', _defaultMat: 'brushed' }),
  'hood-canopy': k('hoodLarge', 900, 500, 750, { metalDark: 'brushed', _defaultMat: 'brushed' }),
  microwave: k('kitchenMicrowave', 480, 360, 290, { metalMedium: 'brushed', carpetWhite: 'steelLight', glass: 'glassSmoke' }),
  washer: k('washer', 600, 600, 850, WHITE_GOODS),
  dryer: k('dryer', 600, 600, 850, WHITE_GOODS),
  'washer-dryer-stack': k('washerDryerStacked', 600, 600, 1700, WHITE_GOODS),
  'tv-stand': k('televisionModern', 1230, 240, 780, { metal: 'screen', metalDark: 'blackMetal' }),
  'fan-ceiling': k('ceilingFan', 900, 1040, 270, { metalLight: 'white', wood: 'woodDark', lamp: 'glow' }),
  'coffee-machine': k('kitchenCoffeeMachine', 250, 320, 240, { metalMedium: 'blackMetal', carpetWhite: 'white' }),
  toaster: k('toaster', 280, 170, 190, { metalMedium: 'brushed', metal: 'brushed' }),
  blender: k('kitchenBlender', 200, 160, 380, { metalMedium: 'blackMetal' }),
  'speaker-floor': k('speaker', 250, 280, 1000, { wood: 'woodDark', metalMedium: 'blackMetal' }),

  // lighting
  'lamp-floor-round': k('lampRoundFloor', 320, 370, 1600, { metal: 'blackMetal' }),
  'lamp-floor-square': k('lampSquareFloor', 260, 260, 1600, { metal: 'blackMetal' }),
  'lamp-table-round': k('lampRoundTable', 260, 300, 520, { metal: 'blackMetal' }),
  'lamp-table-square': k('lampSquareTable', 220, 220, 500, { metal: 'blackMetal' }),
  'lamp-pendant-square': k('lampSquareCeiling', 300, 300, 550, { metal: 'blackMetal' }),
  'lamp-wall': k('lampWall', 300, 200, 125, { metal: 'blackMetal' }),

  // decor
  'rug-rectangle': k('rugRectangle', 2400, 1400, 12, { carpet: 'fabricSand', carpetDarker: 'fabricSandDark' }),
  'rug-rounded': k('rugRounded', 2400, 1400, 12),
  'rug-round': k('rugRound', 1600, 1600, 12, { carpet: 'fabricSage', carpetDarker: 'fabricSageDark' }),
  'rug-square': k('rugSquare', 1800, 1800, 12, { carpet: 'fabricClay', carpetDarker: 'fabricClayDark' }),
  'rug-doormat': k('rugDoormat', 750, 450, 12, { wood: 'teak' }),
  'plant-potted': k('pottedPlant', 450, 500, 1350, { wood: 'terracotta', woodDark: 'soil' }),
  'plant-small-fir': k('plantSmall1', 220, 220, 330, { wood: 'terracotta' }),
  'plant-small-cactus': k('plantSmall2', 220, 220, 330, { wood: 'white', plant: 'plantDark' }),
  'plant-small-bush': k('plantSmall3', 220, 200, 330, { wood: 'terracotta' }),
  books: k('books', 260, 165, 180, { carpetDarker: 'fabricClay', plant: 'fabricSage', metal: 'fabricBlue' }),

  // office
  desk: k('desk', 1400, 700, 750),
  'desk-corner': k('deskCorner', 1800, 1800, 750),
  'chair-office': k('chairDesk', 620, 600, 1100, { carpet: 'fabricCharcoal', metalMedium: 'blackMetal' }),
  monitor: k('computerScreen', 620, 180, 460, { metal: 'screen', metalDark: 'blackMetal' }),
  laptop: k('laptop', 340, 310, 210, { metal: 'screen', metalDark: 'steelMid', metalMedium: 'steelDark' }),
  keyboard: k('computerKeyboard', 440, 170, 35, { metalDark: 'blackMetal', metalMedium: 'steelMid' }),

  // outdoor (kit pieces in weatherproof finishes)
  'outdoor-chair': k('chairModernFrameCushion', 480, 480, 860, { metal: 'blackMetal', carpetBlue: 'fabricCream' }),
  'outdoor-table': k('tableRound', 650, 750, 720, { wood: 'teak' }),
  'outdoor-bench': k('bench', 1200, 500, 880, { wood: 'teak' }),
  'outdoor-coffee-table': k('tableCoffeeSquare', 600, 600, 380, { wood: 'teak' }),
} as const satisfies Record<string, ModelSpec>;

export type ModelId = keyof typeof MODELS;

export const modelUrl = (id: ModelId): string => `/catalog/models/${id}.glb`;
