/** Catalog entries: appliances. Ids are stable: saved projects reference them. */
import type { CatalogEntry } from '@interio/core';
import {
  APPLIANCE_SLOTS,
  BUILT_IN_BASE_SLOTS,
  BUILT_IN_TALL_SLOTS,
  FRIDGE_SLOTS,
  GAS_HOB_SLOTS,
  HOOD_SLOTS,
  INDUCTION_SLOTS,
  RANGE_SLOTS,
} from '../premium/appliances';
import {
  AC_SLOTS,
  BLENDER_SLOTS,
  FAN_SLOTS,
  HEATER_SLOTS,
  LAUNDRY_SLOTS,
  PURIFIER_SLOTS,
  SMALL_SLOTS,
  SPEAKER_SLOTS,
  TV_STAND_SLOTS,
  TV_WALL_SLOTS,
} from '../premium/appliances.home';
import { TALL, TALL_DEPTH } from './kitchen';
import { WORKTOP, ceiling, gen, on, wall } from './helpers';

const door = (h: number) => ({ h, cols: 1, kind: 'door' as const });

export const APPLIANCES_ENTRIES: CatalogEntry[] = [
  gen('fridge.single', 'Single-door refrigerator', 'appliances', ['kitchen', 'dining'], 'applFridge', [560, 620, 1250], ['fridge', 'refrigerator', 'single door'], {
    slots: FRIDGE_SLOTS,
    params: { doors: 'single' },
  }),
  gen('fridge.topfreezer', 'Top-freezer refrigerator', 'appliances', ['kitchen', 'dining'], 'applFridge', [680, 700, 1700], ['fridge', 'refrigerator', 'double door', 'frost free'], {
    slots: FRIDGE_SLOTS,
    params: { doors: 'topfreezer' },
  }),
  gen('fridge.double', 'Side-by-side refrigerator', 'appliances', ['kitchen', 'dining'], 'applFridge', [900, 720, 1780], ['fridge', 'refrigerator', 'double door', 'side by side', 'french door'], {
    slots: FRIDGE_SLOTS,
    params: { doors: 'sidebyside' },
  }),
  gen('fridge.mini', 'Mini refrigerator', 'appliances', ['kitchen', 'bedroom', 'study'], 'applFridge', [480, 500, 700], ['fridge', 'refrigerator', 'bar fridge', 'minibar'], {
    slots: FRIDGE_SLOTS,
    params: { doors: 'mini' },
  }),
  gen('fridge.integrated', 'Integrated refrigerator', 'appliances', ['kitchen'], 'kitchenTall', [600, TALL_DEPTH, TALL], ['fridge', 'refrigerator', 'built-in', 'panelled'], {
    slots: BUILT_IN_TALL_SLOTS,
    params: { rows: [door(0.17), door(0.5), door(0.33)] },
  }),
  gen('hob.4burner', 'Four-burner hob', 'appliances', ['kitchen'], 'applHob', [600, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner'], {
    ...on(WORKTOP),
    slots: GAS_HOB_SLOTS,
    params: { burners: 4 },
  }),
  gen('hob.2burner', 'Two-burner hob', 'appliances', ['kitchen'], 'applHob', [300, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner', 'domino'], {
    ...on(WORKTOP),
    slots: GAS_HOB_SLOTS,
    params: { burners: 2 },
  }),
  gen('hob.5burner', 'Five-burner hob', 'appliances', ['kitchen'], 'applHob', [900, 520, 60], ['hob', 'cooktop', 'gas stove', 'burner'], {
    ...on(WORKTOP),
    slots: GAS_HOB_SLOTS,
    params: { burners: 5 },
  }),
  gen('hob.induction', 'Induction hob', 'appliances', ['kitchen'], 'applHob', [590, 520, 12], ['hob', 'cooktop', 'induction', 'electric'], {
    ...on(WORKTOP),
    slots: INDUCTION_SLOTS,
    params: { burners: 4, type: 'induction' },
  }),
  gen('range.gas', 'Gas cooking range', 'appliances', ['kitchen'], 'applRange', [600, 600, 870], ['cooker', 'stove', 'oven', 'range'], { slots: RANGE_SLOTS, params: { type: 'gas' } }),
  gen('range.electric', 'Electric cooking range', 'appliances', ['kitchen'], 'applRange', [600, 600, 870], ['cooker', 'stove', 'oven', 'range', 'ceramic'], {
    slots: RANGE_SLOTS,
    params: { type: 'electric' },
  }),
  gen('oven.builtin', 'Built-in oven', 'appliances', ['kitchen'], 'applOvenHousing', [600, 600, WORKTOP], ['oven', 'built-in', 'otg', 'baking'], {
    slots: BUILT_IN_BASE_SLOTS,
    params: { housing: 'base' },
  }),
  gen('oven.tower', 'Oven and microwave tower', 'appliances', ['kitchen'], 'applOvenHousing', [600, TALL_DEPTH, TALL], ['oven', 'built-in', 'microwave', 'tall unit'], {
    slots: BUILT_IN_TALL_SLOTS,
    params: { housing: 'tall' },
  }),
  gen('hood.chimney', 'Chimney hood', 'appliances', ['kitchen'], 'applHood', [600, 480, 600], ['chimney', 'extractor', 'cooker hood', 'exhaust'], {
    ...wall(1600),
    slots: HOOD_SLOTS,
  }),
  gen('hood.canopy', 'Canopy hood', 'appliances', ['kitchen'], 'applHood', [900, 500, 750], ['chimney', 'extractor', 'cooker hood', 'exhaust'], {
    ...wall(1550),
    slots: HOOD_SLOTS,
    params: { style: 'canopy' },
  }),
  gen('microwave', 'Microwave oven', 'appliances', ['kitchen'], 'applMicrowave', [480, 360, 290], ['microwave', 'oven', 'countertop'], { ...on(WORKTOP), slots: APPLIANCE_SLOTS }),
  gen('dishwasher', 'Dishwasher', 'appliances', ['kitchen', 'utility'], 'applDishwasher', [600, 600, 850], ['dish washer', 'freestanding'], { slots: APPLIANCE_SLOTS }),
  gen('washer.front', 'Front-load washing machine', 'appliances', ['utility', 'bathroom', 'balcony'], 'applLaundry', [600, 600, 850], ['washer', 'washing machine', 'laundry', 'front load'], {
    slots: LAUNDRY_SLOTS,
  }),
  gen('washer.top', 'Top-load washing machine', 'appliances', ['utility', 'bathroom', 'balcony'], 'applLaundry', [560, 580, 950], ['washer', 'washing machine', 'laundry', 'top load'], {
    slots: LAUNDRY_SLOTS,
    params: { type: 'top' },
  }),
  gen('dryer', 'Tumble dryer', 'appliances', ['utility', 'bathroom', 'balcony'], 'applLaundry', [600, 600, 850], ['dryer', 'laundry', 'clothes dryer'], {
    slots: LAUNDRY_SLOTS,
    params: { type: 'dryer' },
  }),
  gen('washer.dryer.stack', 'Stacked washer and dryer', 'appliances', ['utility', 'bathroom'], 'applLaundry', [600, 600, 1700], ['washer', 'dryer', 'laundry', 'stacked'], {
    slots: LAUNDRY_SLOTS,
    params: { type: 'stack' },
  }),
  gen('tv.wall.43', 'Wall-mounted TV 43"', 'appliances', ['bedroom', 'living', 'study'], 'applTv', [960, 60, 560], ['tv', 'television', 'led tv', 'wall mount'], {
    ...wall(1100),
    slots: TV_WALL_SLOTS,
  }),
  gen('tv.wall.55', 'Wall-mounted TV 55"', 'appliances', ['living', 'bedroom'], 'applTv', [1230, 60, 710], ['tv', 'television', 'led tv', 'wall mount'], {
    ...wall(1000),
    slots: TV_WALL_SLOTS,
  }),
  gen('tv.wall.65', 'Wall-mounted TV 65"', 'appliances', ['living'], 'applTv', [1450, 65, 830], ['tv', 'television', 'led tv', 'wall mount'], {
    ...wall(950),
    slots: TV_WALL_SLOTS,
  }),
  gen('tv.stand', 'TV on stand 55"', 'appliances', ['living', 'bedroom'], 'applTv', [1230, 240, 780], ['tv', 'television', 'led tv', 'table top'], {
    ...on(520),
    slots: TV_STAND_SLOTS,
    params: { stand: true },
  }),
  gen('ac.split', 'Split air conditioner', 'appliances', ['bedroom', 'living', 'study', 'dining'], 'applSplitAc', [900, 220, 300], ['ac', 'air conditioner', 'aircon', 'indoor unit', 'cooling'], {
    ...wall(2300),
    slots: AC_SLOTS,
  }),
  gen('fan.ceiling', 'Ceiling fan', 'appliances', ['bedroom', 'living', 'dining', 'study', 'kitchen'], 'applCeilingFan', [1200, 1200, 270], ['fan', 'ceiling fan', 'cooling'], {
    ...ceiling(270),
    slots: FAN_SLOTS,
  }),
  gen('geyser', 'Water heater (geyser)', 'appliances', ['bathroom', 'utility', 'kitchen'], 'applGeyser', [400, 440, 600], ['geyser', 'water heater', 'storage heater', 'boiler'], {
    ...wall(1900),
    slots: HEATER_SLOTS,
  }),
  gen('geyser.instant', 'Instant water heater', 'appliances', ['bathroom', 'kitchen', 'utility'], 'applGeyser', [280, 130, 420], ['geyser', 'water heater', 'instant', 'tankless'], {
    ...wall(1700),
    slots: HEATER_SLOTS,
    params: { type: 'instant' },
  }),
  gen('purifier', 'Water purifier', 'appliances', ['kitchen', 'dining', 'utility'], 'applPurifier', [320, 250, 500], ['ro', 'water filter', 'purifier', 'aquaguard', 'drinking water'], {
    ...wall(1300),
    slots: PURIFIER_SLOTS,
  }),
  gen('coffee.machine', 'Coffee machine', 'appliances', ['kitchen', 'dining'], 'applCoffee', [250, 320, 240], ['coffee maker', 'espresso', 'countertop'], { ...on(WORKTOP), slots: SMALL_SLOTS }),
  gen('toaster', 'Toaster', 'appliances', ['kitchen'], 'applToaster', [280, 170, 190], ['toaster', 'countertop'], { ...on(WORKTOP), slots: SMALL_SLOTS }),
  gen('blender', 'Blender', 'appliances', ['kitchen'], 'applBlender', [200, 160, 380], ['mixer', 'grinder', 'juicer', 'countertop'], { ...on(WORKTOP), slots: BLENDER_SLOTS }),
  gen('speaker.floor', 'Floor speaker', 'appliances', ['living', 'bedroom'], 'applSpeaker', [250, 280, 1000], ['speaker', 'audio', 'tower speaker', 'hi-fi'], { slots: SPEAKER_SLOTS }),
];
