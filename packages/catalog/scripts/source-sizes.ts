/**
 * Prints the exact bounding size of source GLBs (w x d x h in source units and
 * scaled so the width equals a given mm value), to help choose `dims` that
 * respect a model's proportions.
 *
 *   tsx scripts/source-sizes.ts <dir> [name-prefix]
 */
import fs from 'node:fs';
import path from 'node:path';
import { boundsSize, glbBounds, readGlb } from './lib/glb';

const [dir, prefix = ''] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: source-sizes <dir> [name-prefix]');
  process.exit(1);
}
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.glb') && n.startsWith(prefix)).sort()) {
  const [w, h, d] = boundsSize(glbBounds(readGlb(path.join(dir, f))));
  console.log(`${f.replace('.glb', '').padEnd(28)} w ${w.toFixed(3)} d ${d.toFixed(3)} h ${h.toFixed(3)}   d/w ${(d / w).toFixed(2)} h/w ${(h / w).toFixed(2)}`);
}
