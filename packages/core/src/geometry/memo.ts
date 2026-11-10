import type { Level } from '../schema';

/**
 * Memoises a derived value on the identities of selected level slices. The store
 * uses immer, so an untouched slice keeps its identity across edits: moving a
 * piece of furniture does not rebuild rooms or wall meshes.
 */
export function memoLevel<T>(deps: (level: Level) => unknown[], fn: (level: Level) => T, size = 4): (level: Level) => T {
  const cache: { deps: unknown[]; value: T }[] = [];
  return (level) => {
    const d = deps(level);
    const hit = cache.find((c) => c.deps.length === d.length && c.deps.every((x, i) => x === d[i]));
    if (hit) return hit.value;
    const value = fn(level);
    cache.unshift({ deps: d, value });
    if (cache.length > size) cache.pop();
    return value;
  };
}
