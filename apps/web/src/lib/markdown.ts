/**
 * A small Markdown reader for the in-app help, which shows `docs/USER_GUIDE.md`.
 * It covers what that guide uses: headings, paragraphs, bullet and numbered
 * lists, tables, and inline bold, code and links. Images are left out.
 */

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; children: Inline[] } | { kind: 'code'; text: string } | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'heading'; level: number; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] };

export interface Section {
  /** Text of the `##` heading. */
  title: string;
  blocks: Block[];
}

const INLINE = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(!?\[([^\]]*)\]\(([^)\s]+)\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: 'bold', children: parseInline(m[2]!) });
    else if (m[3]) out.push({ kind: 'code', text: m[4]! });
    else if (m[5] && !m[5].startsWith('!')) out.push({ kind: 'link', href: m[7]!, children: parseInline(m[6]!) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

const isTableRule = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, children: parseInline(heading[2]!.trim()) });
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && isTableRule(lines[i + 1] ?? '')) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!).map(parseInline));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    const marker = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (marker) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = marker.exec(lines[i]!);
        if (item) items.push(item[1]!);
        // An indented line continues the item above it.
        else if (items.length > 0 && /^\s{2,}\S/.test(lines[i]!)) items[items.length - 1] += ` ${lines[i]!.trim()}`;
        else break;
        i++;
      }
      blocks.push({ kind: 'list', ordered: marker === NUMBERED, items: items.map(parseInline) });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^#{1,6}\s/.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!) && !lines[i]!.trim().startsWith('|')) {
      text.push(lines[i++]!.trim());
    }
    // An image on its own line has no place in the dialog.
    const paragraph = parseInline(text.join(' '));
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', children: paragraph });
  }
  return blocks;
}

const plain = (inline: Inline[]): string => inline.map((n) => (n.kind === 'text' || n.kind === 'code' ? n.text : plain(n.children))).join('');

/** Splits a document at its `##` headings. Text before the first one (the title and intro) is returned as `intro`. */
export function parseSections(markdown: string): { intro: Block[]; sections: Section[] } {
  const intro: Block[] = [];
  const sections: Section[] = [];
  for (const block of parseBlocks(markdown)) {
    if (block.kind === 'heading' && block.level === 2) sections.push({ title: plain(block.children), blocks: [] });
    else if (sections.length > 0) sections[sections.length - 1]!.blocks.push(block);
    else if (!(block.kind === 'heading' && block.level === 1)) intro.push(block);
  }
  return { intro, sections };
}
