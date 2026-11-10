import type { Item, Level } from '@interio/core';

export interface AutoFurnishOptions {
  /** Include wall-mounted and ceiling pieces (AC, fan, lights, wall cabinets). Default true. */
  mounted?: boolean;
}

export function autoFurnish(_level: Level, _roomId: string, _options: AutoFurnishOptions = {}): Omit<Item, 'id'>[] {
  return [];
}
