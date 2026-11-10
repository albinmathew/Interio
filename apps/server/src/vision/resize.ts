/**
 * The size Claude actually looks at.
 *
 * The API downsizes an image that exceeds the model's native resolution, and
 * the model reports pixel coordinates in that downsized frame. To turn those
 * into 0..1 we must divide by the same size, so this mirrors the reference
 * implementation in the Anthropic vision docs ("Coordinates and bounding
 * boxes"): the largest aspect-preserving size whose edges and 28 px patch
 * count both fit the model's tier.
 */

export interface Size {
  width: number;
  height: number;
}

export interface ResolutionTier {
  maxEdge: number;
  maxTokens: number;
}

export const HIGH_RESOLUTION: ResolutionTier = { maxEdge: 2576, maxTokens: 4784 };
export const STANDARD_RESOLUTION: ResolutionTier = { maxEdge: 1568, maxTokens: 1568 };

/**
 * Claude 4.7 and later are high-resolution; everything earlier is standard.
 * Matches the model family in ids such as `claude-opus-4-6`,
 * `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514` and `claude-3-...`,
 * with or without a platform prefix. Unknown ids are assumed current.
 */
const STANDARD_TIER_MODEL = /claude-(?:3-|(?:opus|sonnet|haiku)-4-(?:[0-6](?:-|$)|\d{8}))/;

export function resolutionTierFor(model: string): ResolutionTier {
  return STANDARD_TIER_MODEL.test(model) ? STANDARD_RESOLUTION : HIGH_RESOLUTION;
}

const PATCH = 28;

function fits(width: number, height: number, tier: ResolutionTier): boolean {
  return (
    Math.ceil(width / PATCH) * PATCH <= tier.maxEdge &&
    Math.ceil(height / PATCH) * PATCH <= tier.maxEdge &&
    Math.ceil(width / PATCH) * Math.ceil(height / PATCH) <= tier.maxTokens
  );
}

/** Round half to even: the API resolves exact .5 ties toward the even neighbour. */
function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The size the API resizes an image to before the model sees it. Unchanged when it already fits. */
export function resizedSize(size: Size, tier: ResolutionTier): Size {
  const { width, height } = size;
  if (fits(width, height, tier)) return { width, height };
  if (height > width) {
    const rotated = resizedSize({ width: height, height: width }, tier);
    return { width: rotated.height, height: rotated.width };
  }
  const aspect = width / height;
  const shortEdge = (long: number) => Math.max(roundTiesToEven(long / aspect), 1);
  let lo = 1; // always fits
  let hi = width; // never fits
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, shortEdge(mid), tier)) lo = mid;
    else hi = mid;
  }
  return { width: lo, height: shortEdge(lo) };
}
