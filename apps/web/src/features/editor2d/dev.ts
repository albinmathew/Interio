/**
 * Development helpers, reachable from the browser console and from e2e tests.
 * The importer normally provides the underlay; until a project has one,
 * `__interioEditor2d.installSyntheticUnderlay()` stores a synthetic one for the
 * open project (reload to see it).
 */
import { planStore } from '@interio/core';
import { saveUnderlay } from '../../lib/session';
import { makeSyntheticUnderlay, type SyntheticUnderlayOptions } from './logic/underlay';

declare global {
  interface Window {
    __interioEditor2d?: {
      installSyntheticUnderlay(opts?: SyntheticUnderlayOptions): Promise<number>;
    };
  }
}

export function installDevHooks(): void {
  window.__interioEditor2d = {
    async installSyntheticUnderlay(opts) {
      const id = planStore.getState().project?.id;
      if (!id) throw new Error('No project is open');
      const underlay = makeSyntheticUnderlay(opts);
      await saveUnderlay(id, underlay);
      return underlay.segments.length / 4;
    },
  };
}
