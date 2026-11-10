import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const CATALOG_PKG = path.resolve(here, '../..');
export const REPO_ROOT = path.resolve(CATALOG_PKG, '../..');
/** Served by the web app at `/catalog/`. */
export const PUBLIC_CATALOG = path.join(REPO_ROOT, 'apps/web/public/catalog');
export const MODELS_DIR = path.join(PUBLIC_CATALOG, 'models');
export const THUMBS_DIR = path.join(PUBLIC_CATALOG, 'thumbs');
export const LICENCE_DOC = path.join(REPO_ROOT, 'docs/assets/catalog.md');
