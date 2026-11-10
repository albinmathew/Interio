import type { Underlay } from '@interio/core';
import { useEffect, useState } from 'react';
import { loadUnderlay } from './session';

/** The source-drawing underlay of a project, or null when it has none (or while loading). */
export function useUnderlay(projectId: string | undefined): Underlay | null {
  const [underlay, setUnderlay] = useState<Underlay | null>(null);
  useEffect(() => {
    let alive = true;
    setUnderlay(null);
    if (projectId) void loadUnderlay(projectId).then((u) => alive && setUnderlay(u));
    return () => {
      alive = false;
    };
  }, [projectId]);
  return underlay;
}
