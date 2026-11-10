/**
 * In-app help: `docs/USER_GUIDE.md` shown in a dialog, one section at a time,
 * opening on the section for the mode the user is in. The guide is the single
 * source: editing the Markdown file changes what is shown here.
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import guide from '../../../../docs/USER_GUIDE.md?raw';
import type { WorkspaceMode } from '../features/registry';
import { parseSections, type Block, type Inline } from '../lib/markdown';
import { Dialog, Kbd, cn } from '../ui';

/** The guide section each mode opens on, by a word in its heading. */
const SECTION_FOR_MODE: Record<WorkspaceMode, RegExp> = {
  plan: /edit the plan/i,
  design: /furnish/i,
  walk: /walk/i,
};

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    if (node.kind === 'text') return <Fragment key={i}>{node.text}</Fragment>;
    if (node.kind === 'bold')
      return (
        <strong key={i} className="font-semibold text-ink">
          {inline(node.children)}
        </strong>
      );
    if (node.kind === 'code') return <Kbd key={i}>{node.text}</Kbd>;
    // Only web links leave the app; links to other files in the repository read as plain text here.
    if (/^https?:\/\//.test(node.href))
      return (
        <a key={i} href={node.href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          {inline(node.children)}
        </a>
      );
    return <Fragment key={i}>{inline(node.children)}</Fragment>;
  });
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'heading') return <h3 className="mt-4 mb-1 text-[13px] font-semibold text-ink first:mt-0">{inline(block.children)}</h3>;
  if (block.kind === 'paragraph') return <p className="mb-2 leading-relaxed">{inline(block.children)}</p>;
  if (block.kind === 'list') {
    const List = block.ordered ? 'ol' : 'ul';
    return (
      <List className={cn('mb-2 flex flex-col gap-1.5 pl-5 leading-relaxed', block.ordered ? 'list-decimal' : 'list-disc')}>
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </List>
    );
  }
  return (
    <table className="mb-2 w-full border-collapse text-left text-[13px]">
      <thead>
        <tr>
          {block.head.map((cell, i) => (
            <th key={i} className="border-b border-line px-2 py-1.5 text-xs font-medium text-ink-faint first:pl-0">
              {inline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, r) => (
          <tr key={r} className="border-b border-line last:border-b-0">
            {row.map((cell, c) => (
              <td key={c} className={cn('px-2 py-1.5 align-top first:pl-0', c === 0 && 'whitespace-nowrap text-ink')}>
                {inline(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HelpDialog({ mode, onClose }: { mode?: WorkspaceMode; onClose: () => void }) {
  const { sections } = useMemo(() => parseSections(guide), []);
  const initial = mode ? Math.max(0, sections.findIndex((s) => SECTION_FOR_MODE[mode].test(s.title))) : 0;
  const [index, setIndex] = useState(initial);
  const section = sections[index];
  return (
    <Dialog title="Help" onClose={onClose} size="lg">
      <div className="-m-4 flex h-[min(70vh,560px)] flex-col sm:flex-row" data-testid="help-dialog">
        <nav aria-label="Help topics" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-48 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0">
          {sections.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-current={i === index ? 'page' : undefined}
              data-autofocus={i === index ? '' : undefined}
              onClick={() => setIndex(i)}
              data-testid="help-topic"
              className={cn(
                'rounded-md px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap transition-colors sm:whitespace-normal',
                i === index ? 'bg-accent-soft font-medium text-accent-strong' : 'text-ink-soft hover:bg-sunken hover:text-ink',
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <article className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="help-content" tabIndex={0} aria-label={section?.title}>
          {section && (
            <>
              <h2 className="mb-2 text-base font-semibold text-ink">{section.title}</h2>
              {section.blocks.map((block, i) => (
                <BlockView key={`${index}-${i}`} block={block} />
              ))}
            </>
          )}
        </article>
      </div>
    </Dialog>
  );
}
