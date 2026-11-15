import { FURNITURE_MATERIALS, MATERIALS, isHexColor } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { PACKAGES, getEntry, getPackage } from '../src';

describe('furnishing packages', () => {
  it.each(PACKAGES.map((p) => [p.id, p] as const))('%s references only real catalog entries, slots and finishes', (_id, pkg) => {
    expect(getPackage(pkg.id)).toBe(pkg);
    const keys = new Set<string>();
    for (const room of pkg.rooms) {
      for (const item of room.items) {
        expect(keys.has(`${room.title}/${item.key}`), `${room.title}/${item.key} is duplicated`).toBe(false);
        keys.add(`${room.title}/${item.key}`);
        expect(item.catalogIds.length).toBeGreaterThan(0);
        for (const id of item.catalogIds) expect(getEntry(id), `${room.title}: ${item.label}: ${id}`).toBeDefined();
        for (const [slot, finish] of Object.entries(item.finishes ?? {})) {
          expect(getEntry(item.catalogIds[0]!)!.slots?.some((s) => s.id === slot), `${item.label}: slot ${slot}`).toBe(true);
          expect(FURNITURE_MATERIALS[finish] !== undefined || isHexColor(finish), `${item.label}: ${finish}`).toBe(true);
        }
      }
      for (const s of room.surfaces ?? []) expect(MATERIALS[s.finish] !== undefined || isHexColor(s.finish), `${room.title}: ${s.label}`).toBe(true);
    }
  });

  it('has a default package', () => {
    expect(getPackage(undefined)?.id).toBe('essentials-3bhk');
  });
});
