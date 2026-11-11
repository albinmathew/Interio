# Catalog assets and licences

Every furniture and appliance model in the catalog is built in code by the
premium generators in `packages/catalog/src/premium/` and is part of this
project. Each entry's licence is recorded as `CC0-1.0 (Interio parametric)`.

No third-party model files are shipped. The app can still load GLB models
(`model: { kind: 'glb', url }`), for example from a licensed pack added
later; any such pack must be recorded here with its source and licence
before it is committed.

## Shipped payload

| What | Where |
|---|---|
| Thumbnails (256 px WebP), one per entry | `apps/web/public/catalog/thumbs` |

Regenerate the thumbnails with `pnpm --filter @interio/catalog thumbnails`.

## Earlier assets

Until November 2026 the catalog shipped models from the Kenney Furniture Kit
(CC0-1.0, https://kenney.nl/assets/furniture-kit). They were replaced by the
premium set and are no longer included.

Textures applied to furniture materials are recorded in
[scene3d.md](scene3d.md).
