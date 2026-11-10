# Interio contract

What every package may rely on. `packages/core` is the source of truth; this page explains it.

## Units and frames

- **Lengths are millimetres**, rounded to integers when stored.
- **Plan frame**: x right, y **up**, z elevation above the floor.
- **World frame** (three.js): metres, Y up. `X = x/1000`, `Y = z/1000`, `Z = -y/1000`. Use `planToWorld` / `worldToPlan`.
- **Angles** are degrees, counter-clockwise in plan. That equals rotation about world +Y (`planDegToWorldYaw`).
- 2D screens flip y when drawing (SVG y is down): draw at `(x, -y)`.

## Plan model (`schema.ts`)

`Project -> levels[] -> Level { vertices, walls, openings, rooms, items }`, all id-keyed records.

| Type | Notes |
|---|---|
| `Wall` | Between two **shared vertices** `a`, `b` along its centreline. `thickness`, `height`, `kind: wall \| low \| railing`. "Left" is the CCW normal of a -> b. |
| `Opening` | On a wall. `offset` is the distance from vertex `a` to the opening's **centre**. `kind: door \| sliding \| window \| passage`, `width`, `height`, `sill`, `hinge`, `swing`. |
| `Room` | A named **seed point**. Its polygon is derived from the wall graph; name, type and finishes follow the seed. |
| `Item` | `catalogId`, centre `x`,`y`, underside elevation `z`, `rotationDeg`. At 0 degrees the front faces plan -y and width runs along x. |
| `CatalogEntry` | `dims {w, d, h}`, `anchor`, `model` (`glb` or `parametric`), `licence`. |
| `PlanDraft` | Importer output: level, scale estimate, confidence per element, issues, layers, underlay, suggested items. |
| `VisionResult` | AI reading of the page: room names, types, label points (0..1, origin top-left), dimension strings, tags. |

Walls must meet at shared vertices. Use `ops.addWall`, which welds endpoints, splits walls at T-junctions and crossings, and keeps the graph planar. Call `ops.reconcileRooms` after structural edits made outside the store (the store does it for you).

## Store (`store.ts`)

`planStore` (zustand) holds one open project with undo/redo. React: `usePlanStore(selector)`, `useLevel()`.

Actions: `loadProject`, `applyDraft`, `addWall`, `moveVertex`, `weldVertices`, `splitWall`, `removeWall`, `setWallProps`, `addOpening`, `updateOpening`, `removeOpening`, `setRoomProps`, `addItem`, `updateItem`, `removeItem`, `mutateLevel`, `setLevelProps`, `setProjectSettings`, `select`, `transact`, `beginGesture` / `endGesture`, `undo`, `redo`.

- Every action is one undo step. Wrap pointer drags in `beginGesture()` / `endGesture()` and multi-step edits in `transact()`.
- Features keep UI state (active tool, camera, panels) in their **own** stores. Only plan data lives here.
- Project-level view settings (lighting preset and the like) go in `project.settings` via `setProjectSettings`, namespaced by feature, e.g. `{ 'viewer3d.lighting': 'evening' }`.

## Pure geometry (`geometry/`)

No three.js, runs in Node.

| Function | Returns |
|---|---|
| `deriveRooms(level)` | `RoomGeom[]`: centreline `polygon`, clear-floor `interior`, `interiorArea`, `width`, `depth`, `centroid`, `roomId` |
| `wallFootprints(level)` | Mitred plan outline per wall |
| `openingFrame(level, id)` | Centre, jambs, direction, normal, thickness of an opening |
| `buildLevelMesh(level)` | World-space triangle groups: `wallSide` (with `roomId` of the room it faces), `wallTop`, `wallEnd`, `reveal`, `floor`, `ceiling` |
| `roomGraph(level)` | Rooms connected by doors and passages, plus entrances |
| `tourPath(level, start?)` | Ordered stops through every room with door waypoints |
| `snap(level, p, tol, opts?)` | Nearest vertex, underlay point, or wall point |
| `validateLevel(level)` | Structural issues |

`selectRooms`, `selectFootprints`, `selectLevelMesh` are cached versions for **immutable** levels read from the store. Never call them on a level you mutate in place.

## Module boundaries

| Path | Responsibility |
|---|---|
| `packages/core` | Contract. Frozen during parallel work; changes go through the contract owner. |
| `packages/scene3d` | Renders a level and its items; lighting; model loading. Used by viewer3d and walkthrough. |
| `packages/importer` | `importPdf(data, opts) -> PlanDraft`, `renderPdfPage`. No UI. |
| `packages/catalog` | `CATALOG`, `getEntry`, `entriesFor`, `autoFurnish`, parametric generators. |
| `apps/server` | `POST /api/analyze-plan` -> `AnalyzePlanResponse`. |
| `apps/web/src/features/*` | One directory per feature, mounted by `features/registry.ts`. |
| `apps/web/src/lib`, `ui`, `pages` | Shell: storage, session, UI kit, dashboard, workspace header. |

Features render inside a full-size container and read the store themselves. Use the UI kit in `apps/web/src/ui` and the colour tokens in `index.css`.

## Storage

`lib/storage.ts` (IndexedDB): projects as JSON, assets under `<projectId>/<name>` (`pdf`, `underlay`). `lib/session.ts`: `openProject`, `createFromDraft`, `startAutosave`, `loadUnderlay`, export/import. `lib/useUnderlay.ts` gives the source-drawing underlay to the editor.

## Running several checkouts

Ports come from `INTERIO_WEB_PORT` and `INTERIO_API_PORT` (shell or root `.env`). The e2e suite uses `INTERIO_E2E_WEB_PORT` / `INTERIO_E2E_API_PORT` (defaults 5273 / 8887).

## Local fixtures

Real floor plans are third-party drawings. Keep them in `fixtures/local/` (git-ignored). Tests that need them must skip when the folder has no PDFs.
