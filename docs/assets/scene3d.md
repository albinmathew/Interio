# scene3d assets

Lighting and surface assets used by `packages/scene3d`. Everything here is **CC0-1.0**
(public domain dedication): no attribution is required, the records are kept so every
shipped file can be traced to its source.

- Files live under `apps/web/public/textures/<set>/` and `apps/web/public/env/`.
- 103 files, 28.8 MB in total: 32 texture sets (70 maps and 26 palette swatches, 20.6 MB), one HDRI for image-based light (1.1 MB)
  and three outside panoramas for walk mode (6 files, 6.8 MB).
  The furniture and new-finish sets added with the premium furniture (20 sets, 48 files) weigh 12.9 MB.
- `packages/scene3d/scripts/fetch-textures.sh` downloads and recompresses the whole set again,
  then runs `make-swatches.sh`.
- Which finish id uses which set is in `packages/scene3d/src/materialSpecs.ts` (room surfaces) and
  `packages/scene3d/src/furnitureSpecs.ts` (furniture materials). `ONLY="set set ..."` re-fetches some sets only.

## Processing

Each texture set was downloaded at 1k (1024 x 1024 JPG) and recompressed with macOS `sips`
to keep the download small: colour map JPEG quality 80, normal map (OpenGL convention)
quality 82, roughness map quality 70. The carpet normal map is reduced to 512 x 512.
Files are renamed to `color.jpg`, `normal.jpg`, `rough.jpg`. No other edits. The HDRI is
the unmodified 1k `.hdr`.

`swatch.jpg` is cut from each set's own `color.jpg` by `packages/scene3d/scripts/make-swatches.sh`:
the central 384 x 384 pixels scaled to 96 x 96, JPEG quality 78. The finishes panel of the
Design view shows it, tinted towards the finish colour exactly as the 3D view tints the
texture (`tintToward`), so a swatch matches the surface it stands for. Same source and
licence as the set it is cut from.

Cloth, leather and brushed metal ship without a colour map: the finish colour shows through
their normal and roughness maps, and the browser shades the weave into a colour map of the
finish colour (`furnitureTextures.ts`). Wood species, marble, granite, terrazzo and the woven
sets ship a colour map only (plus a normal map where noted) and are tinted towards the finish
colour in the browser. The fluted, slatted and wainscot reliefs are drawn in code over these
sets; they add no files. Neither do the reflections of glass and mirror, which come from
three's `RoomEnvironment`, generated on the GPU.

## Environment map

| Asset | File | Source | Licence |
|---|---|---|---|
| Kloofendal Overcast (Pure Sky), 1k | `env/kloofendal_overcast_puresky_1k.hdr` | Poly Haven, https://polyhaven.com/a/kloofendal_overcast_puresky | CC0-1.0 |

## Outside panoramas (walk mode)

What the windows look out on in walk mode, picked per project in `project.settings['scene.outside']`
(`greenery` by default, `city`, `sky`; `packages/scene3d/src/outside.ts`). Each panorama ships twice:
the unmodified 1k `.hdr` (image-based light, the position of its sun, the colour of the sky seen
through each window) and a 2048 x 1024 backdrop seen through the glass, cut with `sips` (JPEG quality
82) from Poly Haven's tone-mapped JPG of the same panorama. `fetch-textures.sh` fetches them
(`ONLY=outside`).

| View | Files | Asset | Source | Licence |
|---|---|---|---|---|
| `greenery` | `env/roof_garden_1k.hdr` (1.7 MB), `env/roof_garden_2k.jpg` (0.75 MB) | Roof Garden | Poly Haven, https://polyhaven.com/a/roof_garden | CC0-1.0 |
| `city` | `env/hotel_rooftop_balcony_1k.hdr` (1.6 MB), `env/hotel_rooftop_balcony_2k.jpg` (0.38 MB) | Hotel Rooftop Balcony | Poly Haven, https://polyhaven.com/a/hotel_rooftop_balcony | CC0-1.0 |
| `sky` | `env/kloofendal_48d_partly_cloudy_puresky_1k.hdr` (1.4 MB), `env/kloofendal_48d_partly_cloudy_puresky_2k.jpg` (0.22 MB) | Kloofendal 48d Partly Cloudy (Pure Sky) | Poly Haven, https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0-1.0 |

The panorama is turned (`scene.backgroundRotation`, `environmentRotation`) so its brightest point,
its sun, stands where the scene's sun is.

## Texture sets

Each set is up to four files: `color.jpg`, `normal.jpg`, `rough.jpg` and the derived `swatch.jpg`
(sets with a colour map only). Where a set ships fewer maps the table says which.

The furniture sets reuse other materials' sets where that holds up: white quartz uses the
`terrazzo` speckle, concrete the `concrete` set, white marble the `marble` set.

| Set (folder) | Asset | Source | Licence | Used by finishes |
|---|---|---|---|---|
| `textures/oak-planks` | Laminate Floor 02 | Poly Haven, https://polyhaven.com/a/laminate_floor_02 | CC0-1.0 | `floor.oak`, `floor.ash` |
| `textures/walnut-planks` | Wood Floor | Poly Haven, https://polyhaven.com/a/wood_floor | CC0-1.0 | `floor.walnut`, `wall.wood` |
| `textures/herringbone` | Herringbone Parquet | Poly Haven, https://polyhaven.com/a/herringbone_parquet | CC0-1.0 | `floor.herringbone` |
| `textures/deck` | Wood Planks | Poly Haven, https://polyhaven.com/a/wood_planks | CC0-1.0 | `floor.deck` |
| `textures/concrete` | Concrete Wall 008 | Poly Haven, https://polyhaven.com/a/concrete_wall_008 | CC0-1.0 | `floor.concrete`, `wall.concrete` |
| `textures/brick` | Red Brick | Poly Haven, https://polyhaven.com/a/red_brick | CC0-1.0 | `wall.brick` |
| `textures/tile-large` | Tiles 107 | ambientCG, https://ambientcg.com/a/Tiles107 | CC0-1.0 | `floor.tile.white`, `floor.tile.grey`, `wall.tile.white` |
| `textures/tile-small` | Tiles 133 A | ambientCG, https://ambientcg.com/a/Tiles133A | CC0-1.0 | `floor.tile.antiskid` |
| `textures/tile-subway` | Tiles 010 | ambientCG, https://ambientcg.com/a/Tiles010 | CC0-1.0 | `wall.tile.subway` |
| `textures/marble` | Marble 012 | ambientCG, https://ambientcg.com/a/Marble012 | CC0-1.0 | `floor.marble` |
| `textures/terrazzo` | Tiles 043 | ambientCG, https://ambientcg.com/a/Tiles043 | CC0-1.0 | `floor.terrazzo` |
| `textures/carpet` | Carpet 016 | ambientCG, https://ambientcg.com/a/Carpet016 | CC0-1.0 | `floor.carpet.beige`, `floor.carpet.grey` |
| `textures/chevron` | Wood Floor 052 | ambientCG, https://ambientcg.com/a/WoodFloor052 | CC0-1.0 | `floor.chevron` |
| `textures/slate` | Granite Tile | Poly Haven, https://polyhaven.com/a/granite_tile | CC0-1.0 | `floor.slate` |
| `textures/plaster` (color, normal) | Plaster 001 | ambientCG, https://ambientcg.com/a/Plaster001 | CC0-1.0 | `floor.microcement`, `wall.microcement`, custom floor colours; furniture `ceramic.terracotta` |
| `textures/travertine` (color, normal) | Travertine 009 | ambientCG, https://ambientcg.com/a/Travertine009 | CC0-1.0 | `floor.travertine`, `wall.stone.travertine`; furniture `stone.travertine` |
| `textures/marble-black` (color) | Marble 016 | ambientCG, https://ambientcg.com/a/Marble016 | CC0-1.0 | `floor.marble.black`; furniture `stone.marble.black` |
| `textures/fabric-linen` (normal, rough) | Rough Linen | Poly Haven, https://polyhaven.com/a/rough_linen | CC0-1.0 | `wall.wallpaper.linen`; furniture linens, cottons, custom fabric colours |
| `textures/fabric-weave` (normal, rough) | Fabric 061 | ambientCG, https://ambientcg.com/a/Fabric061 | CC0-1.0 | furniture `fabric.weave.*` |
| `textures/fabric-boucle` (normal, rough) | Fabric 084 | ambientCG, https://ambientcg.com/a/Fabric084 | CC0-1.0 | furniture `fabric.boucle.cream` |
| `textures/fabric-velvet` (normal, rough) | Velour Velvet | Poly Haven, https://polyhaven.com/a/velour_velvet | CC0-1.0 | furniture `fabric.velvet.*` |
| `textures/leather` (normal, rough) | Leather 037 | ambientCG, https://ambientcg.com/a/Leather037 | CC0-1.0 | furniture `leather.*` |
| `textures/metal-brushed` (normal, rough) | Metal 009 | ambientCG, https://ambientcg.com/a/Metal009 | CC0-1.0 | furniture `metal.steel`, `metal.black`, `metal.brass`, `metal.bronze` |
| `textures/wood-oak` (color) | Oak Veneer 01 | Poly Haven, https://polyhaven.com/a/oak_veneer_01 | CC0-1.0 | furniture `wood.oak`, `wood.oak.light`, custom wood colours; `wall.panel.fluted`, `ceiling.wood` |
| `textures/wood-ash` (color) | Ash Veneer | Poly Haven, https://polyhaven.com/a/ash_veneer | CC0-1.0 | furniture `wood.ash`, `wood.white` |
| `textures/wood-teak` (color) | Teak Veneer | Poly Haven, https://polyhaven.com/a/teak_veneer | CC0-1.0 | furniture `wood.teak` |
| `textures/wood-walnut` (color) | Walnut Veneer | Poly Haven, https://polyhaven.com/a/walnut_veneer | CC0-1.0 | furniture `wood.walnut` |
| `textures/wood-dark` (color) | Black Oak Veneer | Poly Haven, https://polyhaven.com/a/black_oak_veneer | CC0-1.0 | furniture `wood.wenge` |
| `textures/granite` (color) | Granite 002 A | ambientCG, https://ambientcg.com/a/Granite002A | CC0-1.0 | furniture `stone.granite.black` |
| `textures/terrazzo-chips` (color) | Terrazzo 005 | ambientCG, https://ambientcg.com/a/Terrazzo005 | CC0-1.0 | furniture `stone.terrazzo` |
| `textures/cane` (color, normal) | Wicker 010 A | ambientCG, https://ambientcg.com/a/Wicker010A | CC0-1.0 | furniture `woven.rattan`, `woven.cane.dark`, custom woven colours |
| `textures/jute` (color, normal) | Hessian 230 | Poly Haven, https://polyhaven.com/a/hessian_230 | CC0-1.0 | furniture `woven.jute` |

Paint finishes (`wall.paint.*`) and `ceiling.white` are flat colours and use no texture, as are
custom wall and ceiling colours. `floor.oak.smoked` and `floor.oak.grey` tint the oak planks;
`wall.tile.zellige` uses `tile-small` at 10 cm tiles; `wall.panel.wainscot` is drawn in code.
Furniture lacquers, glass, polished chrome, white enamel and glazed ceramic are deliberately flat.
A finish whose texture cannot be loaded falls back to its flat colour from core's `MATERIALS`.

## Lighting presets

No extra assets: the three presets (`daylight`, `evening`, `night`, see
`packages/scene3d/src/lighting.ts`) reuse the one HDRI at different strengths and differ
only in light colours, the sun's direction and the lamps inside the rooms. A project
stores its preset in `project.settings['viewer3d.lighting']`; `SceneLighting` takes it as
the `preset` prop in both the Design and the Walk view.

In the evening and night presets every room has a ceiling light, and lamps placed from
the catalog (category `lighting`) light their rooms: a ceiling lamp or pendant replaces
the room's default light, floor, table and wall lamps add local pools. At most 12 point
lights are lit at once (`MAX_INTERIOR_LIGHTS`); each room keeps its main light first.

## Adding or replacing a set

1. Pick a CC0 material from Poly Haven or ambientCG and add it to `fetch-textures.sh`.
2. Run the script; it writes the three maps and the swatch under `apps/web/public/textures/<set>/`.
3. Point finish ids at the set in `materialSpecs.ts` (`size` is metres per repeat; `avg` is
   the average colour of `color.jpg`, used to tint the texture towards the finish colour).
4. Add a row to the table above.

## Rendering tiers (no assets)

The Design view picks a tier (`apps/web/src/features/viewer3d/Effects.tsx`):

- `high`, a GPU holding its frame rate: an EffectComposer with a multisampled HDR target,
  three's GTAO pass and an OutputPass; the neutral studio environment for reflections; soft
  sun shadows (2048 px, 4096 px in the Showcase view); pixel ratio up to 2.
- `medium`, a GPU that drops frames (`PerformanceMonitor` steps down): contact shadows in
  place of the occlusion pass, pixel ratio 1.
- `low`, software renderers (SwiftShader, llvmpipe): the plain forward render without
  multisampling, a 1024 px shadow map, furniture drawn with standard materials and small
  colour maps only (no normal or roughness maps). Walk mode applies the same savings.

The Showcase view uses the composer on any GPU. Tone mapping is Khronos PBR Neutral.

## Walk mode: the cinematic look (no assets beyond the panoramas)

Walk mode (`apps/web/src/features/walkthrough`, tiers in `tier.ts`) lights the home with the
`cinematic` rig of `lighting.ts` on a GPU:

- **Sun.** `planSun` (`sun.ts`) aims it at the home's outside glazing: by day at 36 degrees through
  the living rooms' windows, at golden hour at 19 degrees, warm, raking into the bedrooms. PCF soft
  shadows from a frustum fitted to the home; ceilings cast them, so sunlight only enters through
  openings.
- **Window light.** `WindowLights`: rectangular area lights in the 6 (medium: 4) openings nearest the
  walker, coloured and scaled by the panorama's half in front of each opening. Image-based light from
  the panorama itself is kept faint indoors (it ignores walls).
- **Lamps.** At most 12 real lights (`MAX_INTERIOR_LIGHTS`); ceiling fittings become soft downward
  spots, shaded lamps inverse-square point lights. Bulbs, fabric shades, opal diffusers, the white
  inside of metal domes and candles glow by their material (`ItemsLayer`).
- **Coves** (`cove.ts`, `Coves.tsx`): a soffit round living rooms and bedrooms with an unlit, additive
  LED line and ceiling wash; `project.settings['scene.coveLights']`, on by default in the evening and
  at night.
- **Glossy floors** (`FloorMirror.tsx`, `reflectance.ts`): one mirrored view at half resolution for all
  floors (they lie at height 0), blurred through its mip chain by the finish and its roughness map,
  faded by Fresnel. Marble strongest, tile and stone less, lacquered wood faintly, carpet not at all.
- **Image** (`walkthrough/Effects.tsx`, `post.ts`): multisampled HDR render, GTAO, a firefly clamp,
  depth of field only while the tour lingers, bloom (threshold 2.6 in linear light: lamps, coves and
  bright sky bloom, lit walls do not), a warm grade and vignette per preset, ACES filmic tone mapping.

Tiers: `high` everything; `medium` (the frame rate dropped) without reflections and depth of field, then
with a 2048 px instead of 4096 px shadow map; `low` (software renderers) the forward render walk mode
always had, plus the outside panorama (drawn as a depth-tested dome, so only pixels seen through glass
cost anything) and glowing lamps and coves without bloom. `?tier=high|medium|medium1|low` pins a tier.

Frame cost, furnished and styled sample home (108 items), 1280 x 800 at pixel ratio 1, every pass
included (`__interioWalk.stats()`, best of six, three viewpoints), Apple M5 Pro (Metal):
high 9.8 ms by day / 13.9 ms in the evening, medium 10.1 / 12.6 ms, medium with the smaller shadow map
9.2 / 11.6 ms, low 2.6 / 2.3 ms. SwiftShader (the e2e suite and CI), low tier, frame interval: 29 to
57 ms by day and 33 to 82 ms in the evening across the viewpoints, against 49 to 59 ms and 31 to 120 ms
for the walk mode before this change on the same home and machine (shared and noisy: no regression).
