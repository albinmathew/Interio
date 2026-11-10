/** The editor's tools: ids, names, single-key shortcuts and the hint shown while one is active. */
import type { OpeningKind } from '@interio/core';

export type ToolId = 'select' | 'hand' | 'wall' | 'door' | 'sliding' | 'window' | 'passage' | 'split' | 'measure' | 'scale';

export interface ToolDef {
  id: ToolId;
  label: string;
  /** Lower-case shortcut key. */
  key: string;
  hint: string;
  group: 'navigate' | 'build' | 'openings' | 'utility';
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / Move', key: 'v', group: 'navigate', hint: 'Click to select. Drag corners, walls and openings to move them.' },
  { id: 'hand', label: 'Pan', key: 'h', group: 'navigate', hint: 'Drag to pan. Hold Space with any tool to do the same.' },
  { id: 'wall', label: 'Wall', key: 'w', group: 'build', hint: 'Click corners, or type a length + Enter. Shift locks the angle, Alt frees snapping, Esc ends.' },
  { id: 'door', label: 'Door', key: 'd', group: 'openings', hint: 'Hover a wall and click to place a door. It swings to the side the pointer is on.' },
  { id: 'sliding', label: 'Sliding door', key: 's', group: 'openings', hint: 'Hover a wall and click to place a sliding door.' },
  { id: 'window', label: 'Window', key: 'n', group: 'openings', hint: 'Hover a wall and click to place a window.' },
  { id: 'passage', label: 'Passage', key: 'p', group: 'openings', hint: 'Hover a wall and click to place an open passage.' },
  { id: 'split', label: 'Split wall', key: 'x', group: 'utility', hint: 'Click a wall to split it in two at that point.' },
  { id: 'measure', label: 'Measure', key: 'm', group: 'utility', hint: 'Click two points to measure the distance between them.' },
  { id: 'scale', label: 'Set scale', key: 'c', group: 'utility', hint: 'Click two points a known distance apart, then type the real distance.' },
];

export const toolByKey = (key: string): ToolDef | undefined => TOOLS.find((t) => t.key === key.toLowerCase());
export const toolDef = (id: ToolId): ToolDef => TOOLS.find((t) => t.id === id)!;

export const OPENING_TOOLS: Partial<Record<ToolId, OpeningKind>> = {
  door: 'door',
  sliding: 'sliding',
  window: 'window',
  passage: 'passage',
};
