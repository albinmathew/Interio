# scene3d assets

Lighting and surface assets used by `packages/scene3d`. Everything here is **CC0-1.0**
(public domain dedication): no attribution is required, the records are kept so every
shipped file can be traced to its source.

- Files live under `apps/web/public/textures/<set>/` and `apps/web/public/env/`.
- 37 files, 9.1 MB in total (36 texture maps, 7.9 MB; one HDRI, 1.2 MB).
- `packages/scene3d/scripts/fetch-textures.sh` downloads and recompresses the whole set again.
- Which finish id uses which set is in `packages/scene3d/src/materialSpecs.ts`.

## Processing

Each texture set was downloaded at 1k (1024 x 1024 JPG) and recompressed with macOS `sips`
to keep the download small: colour map JPEG quality 80, normal map (OpenGL convention)
quality 82, roughness map quality 70. The carpet normal map is reduced to 512 x 512.
Files are renamed to `color.jpg`, `normal.jpg`, `rough.jpg`. No other edits. The HDRI is
the unmodified 1k `.hdr`.

## Environment map

| Asset | File | Source | Licence |
|---|---|---|---|
| Kloofendal Overcast (Pure Sky), 1k | `env/kloofendal_overcast_puresky_1k.hdr` | Poly Haven, https://polyhaven.com/a/kloofendal_overcast_puresky | CC0-1.0 |

## Texture sets

Each set is three files: `color.jpg`, `normal.jpg`, `rough.jpg`.

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

Paint finishes (`wall.paint.*`) and `ceiling.white` are flat colours and use no texture.
A finish whose texture cannot be loaded falls back to its flat colour from core's `MATERIALS`.

## Adding or replacing a set

1. Pick a CC0 material from Poly Haven or ambientCG and add it to `fetch-textures.sh`.
2. Run the script; it writes the three maps under `apps/web/public/textures/<set>/`.
3. Point finish ids at the set in `materialSpecs.ts` (`size` is metres per repeat; `avg` is
   the average colour of `color.jpg`, used to tint the texture towards the finish colour).
4. Add a row to the table above.
