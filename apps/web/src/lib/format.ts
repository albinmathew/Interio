/** 3400 -> "3.40 m" */
export const metres = (mm: number, digits = 2): string => `${(mm / 1000).toFixed(digits)} m`;
/** mm^2 -> "12.4 m²" */
export const squareMetres = (mm2: number): string => `${(mm2 / 1_000_000).toFixed(1)} m²`;
/** mm^2 -> "133 sq ft" */
export const squareFeet = (mm2: number): string => `${Math.round(mm2 / 92_903.04)} sq ft`;
/** 3400, 3960 -> "3400 × 3960" */
export const dims = (w: number, d: number): string => `${Math.round(w)} × ${Math.round(d)}`;

/** 1 250 000 -> "1.2 MB", 48 000 -> "47 KB" */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
