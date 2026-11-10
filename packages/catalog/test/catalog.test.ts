import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_CATEGORIES, ROOM_TYPES, type CatalogEntry } from '@interio/core';
import { describe, expect, it } from 'vitest';
import { LICENCE_DOC, MODELS_DIR, PUBLIC_CATALOG, THUMBS_DIR } from '../scripts/lib/paths';
import { CATALOG, MODELS, PACKS, entriesFor, getEntry, hasGenerator } from '../src/index';

const publicFile = (url: string) => path.join(PUBLIC_CATALOG, url.replace(/^\/catalog\//, ''));
const furniture = CATALOG.filter((e) => e.category !== 'appliances');
const appliances = CATALOG.filter((e) => e.category === 'appliances');
const find = (pred: (e: CatalogEntry) => boolean) => CATALOG.filter(pred);
const tagged = (...words: string[]) => (e: CatalogEntry) => words.some((w) => e.tags?.includes(w) || e.name.toLowerCase().includes(w));

describe('catalog entries', () => {
  it('meets the size targets', () => {
    expect(furniture.length).toBeGreaterThanOrEqual(80);
    expect(appliances.length).toBeGreaterThanOrEqual(15);
  });

  it('has unique, stable ids', () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    for (const e of CATALOG) expect(e.id, e.id).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)*$/);
  });

  it('keeps every placeholder id from the first catalog', () => {
    const placeholders = [
      'bed.double', 'bed.single', 'nightstand', 'wardrobe.2door', 'sofa.3seat', 'armchair', 'table.coffee', 'table.dining6',
      'chair.dining', 'desk', 'tv.unit', 'fridge.double', 'washer.front', 'hob.4burner', 'ac.split',
    ];
    for (const id of placeholders) {
      const entry = getEntry(id);
      expect(entry, id).toBeDefined();
      expect(entry!.model.kind === 'glb' || entry!.model.generator !== 'box', `${id} still a placeholder box`).toBe(true);
    }
  });

  it.each(CATALOG.map((e) => [e.id, e] as const))('%s is well formed', (_id, e) => {
    expect(e.name.trim().length).toBeGreaterThan(2);
    expect(CATALOG_CATEGORIES).toContain(e.category);
    for (const r of e.roomTypes) expect(ROOM_TYPES).toContain(r);
    for (const v of [e.dims.w, e.dims.d, e.dims.h]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(4000);
    }
    expect(['floor', 'wall', 'ceiling']).toContain(e.anchor);
    expect(e.licence).toMatch(/^CC0-1\.0 \(.+\)$/);
    expect(e.tags?.length ?? 0).toBeGreaterThan(0);
    for (const t of e.tags ?? []) expect(t).toBe(t.toLowerCase());

    // Wall and ceiling pieces say where they hang, and fit under a 3 m ceiling.
    if (e.anchor !== 'floor') expect(e.mountHeight, 'mountHeight').toBeGreaterThan(0);
    expect((e.mountHeight ?? 0) + e.dims.h).toBeLessThanOrEqual(3000);
    if (e.anchor === 'ceiling') expect(e.mountHeight! + e.dims.h).toBe(3000);

    expect(e.thumbnail).toBe(`/catalog/thumbs/${e.id}.webp`);
    const thumb = publicFile(e.thumbnail!);
    expect(fs.existsSync(thumb), `missing thumbnail ${thumb}`).toBe(true);
    expect(fs.statSync(thumb).size).toBeGreaterThan(200);

    if (e.model.kind === 'glb') {
      expect(e.model.url).toMatch(/^\/catalog\/models\/[a-z0-9-]+\.glb$/);
      expect(fs.existsSync(publicFile(e.model.url)), `missing model ${e.model.url}`).toBe(true);
      // Models are baked front +Z, so no entry needs a yaw correction.
      expect(e.model.yawDeg ?? 0).toBe(0);
    } else {
      expect(hasGenerator(e.model.generator), `generator ${e.model.generator}`).toBe(true);
      expect(e.model.generator).not.toBe('box');
    }
  });

  it('covers every category and room type', () => {
    for (const c of CATALOG_CATEGORIES) expect(entriesFor({ category: c }).length, c).toBeGreaterThanOrEqual(5);
    for (const r of ROOM_TYPES) expect(entriesFor({ roomType: r }).length, r).toBeGreaterThanOrEqual(5);
    for (const r of ROOM_TYPES.filter((t) => t !== 'other' && t !== 'corridor'))
      expect(CATALOG.filter((e) => e.roomTypes.includes(r)).length, `entries suggested for ${r}`).toBeGreaterThanOrEqual(4);
  });

  it('has the required furniture', () => {
    const need: [string, (e: CatalogEntry) => boolean, number][] = [
      ['sofas', (e) => e.id.startsWith('sofa.'), 3],
      ['armchairs', (e) => e.id.startsWith('armchair'), 2],
      ['coffee and side tables', (e) => e.id.startsWith('table.coffee') || e.id === 'table.side', 3],
      ['tv units', (e) => e.id.startsWith('tv.unit'), 1],
      ['shelves', (e) => e.id.startsWith('bookcase') || e.id.startsWith('shelf'), 3],
      ['rugs', (e) => e.id.startsWith('rug.'), 3],
      ['plants', (e) => e.id.startsWith('plant.'), 2],
      ['dining tables for 4, 6 and 8', (e) => ['table.dining4', 'table.dining6', 'table.dining8'].includes(e.id), 3],
      ['dining chairs', (e) => e.id.startsWith('chair.'), 3],
      ['sideboard', (e) => e.id === 'sideboard', 1],
      ['beds single, double, queen, king', (e) => ['bed.single', 'bed.double', 'bed.queen', 'bed.king'].includes(e.id), 4],
      ['nightstands', (e) => e.id.startsWith('nightstand'), 1],
      ['wardrobes', (e) => e.id.startsWith('wardrobe.'), 2],
      ['dressers', (e) => e.id.startsWith('dresser'), 1],
      ['desk and chair', (e) => e.id === 'desk' || e.id === 'chair.office', 2],
      ['base and wall cabinets', (e) => e.id.startsWith('kitchen.base') || e.id.startsWith('kitchen.wall'), 4],
      ['counter runs', (e) => e.id.startsWith('kitchen.counter'), 2],
      ['sink unit', (e) => e.id === 'kitchen.sink', 1],
      ['island', (e) => e.id === 'kitchen.island', 1],
      ['bar stools', (e) => e.id.startsWith('stool.bar'), 1],
      ['toilet', (e) => e.id.startsWith('toilet'), 1],
      ['basin with vanity', (e) => e.id === 'basin.vanity', 1],
      ['shower enclosure', (e) => e.id.startsWith('shower'), 1],
      ['bathtub', (e) => e.id === 'bathtub', 1],
      ['mirror', (e) => e.id.includes('mirror'), 2],
      ['outdoor', (e) => e.category === 'outdoor', 4],
      ['ceiling lights', (e) => e.category === 'lighting' && e.anchor === 'ceiling', 2],
      ['floor lamps', (e) => e.id.startsWith('lamp.floor'), 1],
      ['table lamps', (e) => e.id.startsWith('lamp.table'), 1],
      ['decor', (e) => e.category === 'decor', 8],
    ];
    for (const [label, pred, min] of need) expect(find(pred).length, label).toBeGreaterThanOrEqual(min);
  });

  it('has the required appliances', () => {
    const app = (pred: (e: CatalogEntry) => boolean) => appliances.filter(pred);
    expect(app(tagged('single door')).length, 'single-door fridge').toBeGreaterThanOrEqual(1);
    expect(app(tagged('double door')).length, 'double-door fridge').toBeGreaterThanOrEqual(1);
    expect(app(tagged('hob')).length, 'hob').toBeGreaterThanOrEqual(1);
    expect(app((e) => e.id === 'oven.builtin').length, 'built-in oven').toBe(1);
    expect(app(tagged('chimney')).every((e) => e.anchor === 'wall'), 'chimney on the wall').toBe(true);
    expect(app(tagged('chimney')).length, 'chimney').toBeGreaterThanOrEqual(1);
    expect(app(tagged('microwave')).length, 'microwave').toBeGreaterThanOrEqual(1);
    expect(app((e) => e.id === 'dishwasher').length, 'dishwasher').toBe(1);
    expect(app(tagged('washing machine')).length, 'washing machine').toBeGreaterThanOrEqual(1);
    expect(app(tagged('dryer')).length, 'dryer').toBeGreaterThanOrEqual(1);
    expect(app((e) => tagged('television')(e) && e.anchor === 'wall').length, 'wall-mounted tv').toBeGreaterThanOrEqual(1);
    expect(app((e) => tagged('television')(e) && e.anchor === 'floor').length, 'tv on stand').toBeGreaterThanOrEqual(1);
    const ac = getEntry('ac.split')!;
    expect(ac.anchor).toBe('wall');
    expect(ac.mountHeight).toBe(2300);
    expect(getEntry('fan.ceiling')!.anchor).toBe('ceiling');
    for (const id of ['geyser', 'purifier']) expect(getEntry(id)!.anchor, id).toBe('wall');
  });

  it('answers searches', () => {
    expect(entriesFor({ query: 'geyser' }).map((e) => e.id)).toContain('geyser');
    expect(entriesFor({ query: 'Almirah' }).length).toBeGreaterThanOrEqual(3);
    expect(entriesFor({ query: 'couch', roomType: 'living' }).length).toBeGreaterThanOrEqual(3);
    expect(entriesFor({ category: 'beds', roomType: 'kitchen' })).toHaveLength(0);
    expect(entriesFor({ roomType: 'corridor' }).some((e) => e.roomTypes.length === 0)).toBe(true);
    expect(entriesFor({})).toHaveLength(CATALOG.length);
  });
});

describe('shipped files and licences', () => {
  const shipped = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.glb'));

  it('ships exactly the models the manifest lists, all in use', () => {
    expect(shipped.sort()).toEqual(Object.keys(MODELS).map((id) => `${id}.glb`).sort());
    const used = new Set(CATALOG.flatMap((e) => (e.model.kind === 'glb' ? [path.basename(e.model.url)] : [])));
    for (const f of shipped) expect(used.has(f), `${f} is not used by any entry`).toBe(true);
  });

  it('ships a thumbnail per entry and nothing else', () => {
    expect(fs.readdirSync(THUMBS_DIR).sort()).toEqual(CATALOG.map((e) => `${e.id}.webp`).sort());
  });

  it('keeps the payload modest', () => {
    const bytes = (dir: string) => fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
    expect(bytes(MODELS_DIR) + bytes(THUMBS_DIR)).toBeLessThan(20 * 1024 * 1024);
  });

  it('accepts only CC0 packs and records every file', () => {
    const doc = fs.readFileSync(LICENCE_DOC, 'utf8');
    for (const [id, pack] of Object.entries(PACKS)) {
      expect(pack.licence, id).toBe('CC0-1.0');
      expect(doc).toContain(pack.url);
      expect(doc).toContain(pack.name);
    }
    for (const [id, model] of Object.entries(MODELS)) {
      expect(doc, `${id} missing from docs/assets/catalog.md`).toContain(`\`${id}.glb\` | \`${model.source}.glb\``);
      expect(PACKS[model.pack]).toBeDefined();
    }
  });
});
