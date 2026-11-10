import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, parseSections } from './markdown';

describe('markdown reader', () => {
  it('reads inline bold, code and links, and drops images', () => {
    expect(parseInline('Press **Create project** then `Enter`, see [the guide](docs/USER_GUIDE.md).')).toEqual([
      { kind: 'text', text: 'Press ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'Create project' }] },
      { kind: 'text', text: ' then ' },
      { kind: 'code', text: 'Enter' },
      { kind: 'text', text: ', see ' },
      { kind: 'link', href: 'docs/USER_GUIDE.md', children: [{ kind: 'text', text: 'the guide' }] },
      { kind: 'text', text: '.' },
    ]);
    expect(parseInline('![Dashboard](docs/screenshots/dashboard.jpg)')).toEqual([]);
    expect(parseInline('**`W`** walks')).toEqual([{ kind: 'bold', children: [{ kind: 'code', text: 'W' }] }, { kind: 'text', text: ' walks' }]);
  });

  it('reads headings, paragraphs, lists and tables', () => {
    const blocks = parseBlocks(
      ['# Title', '', 'First line', 'second line.', '', '- one', '- **two**', '  continued', '', '1. first', '2. second', '', '| Key | Action |', '|---|---|', '| `W` | Wall |', '| `D` | Door |', '', '### Sub'].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'table', 'heading']);
    expect(blocks[1]).toEqual({ kind: 'paragraph', children: [{ kind: 'text', text: 'First line second line.' }] });
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false });
    expect((blocks[2] as { items: unknown[][] }).items).toHaveLength(2);
    expect((blocks[2] as { items: unknown[][] }).items[1]).toEqual([{ kind: 'bold', children: [{ kind: 'text', text: 'two' }] }, { kind: 'text', text: ' continued' }]);
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true });
    const table = blocks[4] as { head: unknown[][]; rows: unknown[][][] };
    expect(table.head).toEqual([[{ kind: 'text', text: 'Key' }], [{ kind: 'text', text: 'Action' }]]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]![0]).toEqual([{ kind: 'code', text: 'W' }]);
    expect(blocks[5]).toMatchObject({ kind: 'heading', level: 3 });
  });

  it('splits the user guide into the sections the help dialog shows', () => {
    const guide = readFileSync(fileURLToPath(new URL('../../../../docs/USER_GUIDE.md', import.meta.url)), 'utf8');
    const { intro, sections } = parseSections(guide);
    expect(intro.length).toBeGreaterThan(0);
    expect(sections.map((s) => s.title)).toEqual([
      'Import a floor plan',
      'Edit the plan',
      'Furnish in 3D',
      'Finishes',
      'Lighting and pictures',
      'Ask the assistant',
      'Variants',
      'Walk through',
      'Save, export and share',
      'Troubleshooting',
    ]);
    for (const section of sections) expect(section.blocks.length).toBeGreaterThan(0);
    // The shortcut tables survive as tables.
    expect(sections[1]!.blocks.some((b) => b.kind === 'table' && b.rows.length > 10)).toBe(true);
    expect(sections[2]!.blocks.some((b) => b.kind === 'table')).toBe(true);
  });
});
