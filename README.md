# Interio

Turn a floor-plan PDF into a furnished 3D home you can walk through.

1. **Upload** a floor plan (vector PDF from a builder or architect).
2. **Review** the detected walls, doors, windows and rooms in the 2D plan editor.
3. **Furnish** in 3D from a catalog of furniture and appliances.
4. **Walk** through every room in first person, or take the guided tour.

Projects are stored in your browser (IndexedDB) and can be exported to a file.

## Quick start

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. The API (AI assist for plan import) runs on port 8787.

AI assist is optional. To enable it, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.
Without a key, import runs on the PDF's vector data alone.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Web app and API with hot reload |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | End-to-end tests (Playwright, headless) |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` | oxlint |
| `pnpm build` | Production build of the web app |

## Layout

```
packages/core       Plan schema, store with undo, pure geometry (rooms, wall meshes, room graph)
packages/scene3d    three.js scene components shared by the 3D view and the walkthrough
packages/importer   PDF -> plan draft
packages/catalog    Furniture and appliance catalog
apps/server         API: AI assist for plan import
apps/web            The app: dashboard, import, plan editor, 3D design, walkthrough
tests/e2e           Playwright tests
```

See [docs/CONTRACT.md](docs/CONTRACT.md) for the data model, coordinate frames and module boundaries.

## Licence

Apache-2.0. Third-party assets and their licences are listed in [ASSETS.md](ASSETS.md).
