#!/bin/bash
# Downloads the CC0 texture sets and the HDRI used by scene3d and recompresses them into
# apps/web/public/{textures,env}. Sources and licences: docs/assets/scene3d.md.
# Needs curl, unzip and macOS `sips`. Run from the repository root:
#   bash packages/scene3d/scripts/fetch-textures.sh
set -eu

DEST="apps/web/public"
TMP="$(mktemp -d)"
UA="interio-asset-fetch/0.1"
trap 'rm -rf "$TMP"' EXIT

conv() { # in out quality maxsize
  sips -s format jpeg -s formatOptions "$3" -Z "$4" "$1" --out "$2" >/dev/null
}

polyhaven() { # asset set
  mkdir -p "$TMP/$1" "$DEST/textures/$2"
  for map in diff nor_gl rough; do
    curl -sS -f -A "$UA" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/$1/${1}_${map}_1k.jpg" -o "$TMP/$1/$map.jpg"
  done
  conv "$TMP/$1/diff.jpg" "$DEST/textures/$2/color.jpg" 80 1024
  conv "$TMP/$1/nor_gl.jpg" "$DEST/textures/$2/normal.jpg" 82 1024
  conv "$TMP/$1/rough.jpg" "$DEST/textures/$2/rough.jpg" 70 1024
}

ambientcg() { # asset set normal-size
  mkdir -p "$TMP/$1" "$DEST/textures/$2"
  curl -sS -f -L -A "$UA" "https://ambientcg.com/get?file=${1}_1K-JPG.zip" -o "$TMP/$1/src.zip"
  unzip -q -o -j "$TMP/$1/src.zip" '*.jpg' -d "$TMP/$1"
  conv "$TMP/$1/${1}_1K-JPG_Color.jpg" "$DEST/textures/$2/color.jpg" 80 1024
  conv "$TMP/$1/${1}_1K-JPG_NormalGL.jpg" "$DEST/textures/$2/normal.jpg" 82 "$3"
  conv "$TMP/$1/${1}_1K-JPG_Roughness.jpg" "$DEST/textures/$2/rough.jpg" 70 1024
}

polyhaven laminate_floor_02 oak-planks
polyhaven wood_floor walnut-planks
polyhaven herringbone_parquet herringbone
polyhaven wood_planks deck
polyhaven concrete_wall_008 concrete
polyhaven red_brick brick
ambientcg Tiles107 tile-large 1024
ambientcg Tiles133A tile-small 1024
ambientcg Tiles010 tile-subway 1024
ambientcg Marble012 marble 1024
ambientcg Tiles043 terrazzo 1024
ambientcg Carpet016 carpet 512

mkdir -p "$DEST/env"
curl -sS -f -A "$UA" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr" -o "$DEST/env/kloofendal_overcast_puresky_1k.hdr"

# Palette swatches, cut from the colour maps.
bash "$(dirname "$0")/make-swatches.sh"

du -sh "$DEST/textures" "$DEST/env"
