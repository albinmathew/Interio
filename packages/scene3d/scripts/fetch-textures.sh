#!/bin/bash
# Downloads the CC0 texture sets and the HDRI used by scene3d and recompresses them into
# apps/web/public/{textures,env}. Sources and licences: docs/assets/scene3d.md.
# Needs curl, unzip and macOS `sips`. Run from the repository root:
#   bash packages/scene3d/scripts/fetch-textures.sh
# ONLY="granite cane env" fetches just those sets (folder names; `env` is the HDRI).
set -eu

DEST="apps/web/public"
TMP="$(mktemp -d)"
UA="interio-asset-fetch/0.1"
trap 'rm -rf "$TMP"' EXIT

want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }

conv() { # in out quality maxsize
  sips -s format jpeg -s formatOptions "$3" -Z "$4" "$1" --out "$2" >/dev/null
}

# Writes one map of a set: color (quality 80), normal (82, OpenGL convention) or rough (70).
put() { # source set map [normal-size]
  case "$3" in
    color) conv "$1" "$DEST/textures/$2/color.jpg" 80 1024 ;;
    normal) conv "$1" "$DEST/textures/$2/normal.jpg" 82 "${4:-1024}" ;;
    rough) conv "$1" "$DEST/textures/$2/rough.jpg" 70 1024 ;;
  esac
}

# polyhaven <asset> <set> [maps] [normal-size]: maps is a list of color, normal, rough (default all three).
polyhaven() {
  want "$2" || return 0
  mkdir -p "$TMP/$1" "$DEST/textures/$2"
  for map in ${3:-color normal rough}; do
    case "$map" in color) src=diff ;; normal) src=nor_gl ;; rough) src=rough ;; esac
    curl -sS -f --retry 4 --retry-all-errors --connect-timeout 30 -A "$UA" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/$1/${1}_${src}_1k.jpg" -o "$TMP/$1/$map.jpg"
    put "$TMP/$1/$map.jpg" "$2" "$map" "${4:-1024}"
  done
}

# ambientcg <asset> <set> [maps] [normal-size]
ambientcg() {
  want "$2" || return 0
  mkdir -p "$TMP/$1" "$DEST/textures/$2"
  curl -sS -f --retry 4 --retry-all-errors --connect-timeout 30 -L -A "$UA" "https://ambientcg.com/get?file=${1}_1K-JPG.zip" -o "$TMP/$1/src.zip"
  unzip -q -o -j "$TMP/$1/src.zip" '*.jpg' -d "$TMP/$1"
  for map in ${3:-color normal rough}; do
    case "$map" in color) src=Color ;; normal) src=NormalGL ;; rough) src=Roughness ;; esac
    put "$TMP/$1/${1}_1K-JPG_${src}.jpg" "$2" "$map" "${4:-1024}"
  done
}

# Floors and walls.
polyhaven laminate_floor_02 oak-planks
polyhaven wood_floor walnut-planks
polyhaven herringbone_parquet herringbone
polyhaven wood_planks deck
polyhaven concrete_wall_008 concrete
polyhaven red_brick brick
ambientcg Tiles107 tile-large
ambientcg Tiles133A tile-small
ambientcg Tiles010 tile-subway
ambientcg Marble012 marble
ambientcg Tiles043 terrazzo
ambientcg Carpet016 carpet "color normal rough" 512
ambientcg WoodFloor052 chevron
polyhaven granite_tile slate
ambientcg Plaster001 plaster "color normal"

# Furniture (and the surfaces that share them). Cloth, leather and brushed metal take
# their colour from the finish, so they ship without a colour map.
polyhaven rough_linen fabric-linen "normal rough"
ambientcg Fabric061 fabric-weave "normal rough"
ambientcg Fabric084 fabric-boucle "normal rough"
polyhaven velour_velvet fabric-velvet "normal rough"
ambientcg Leather037 leather "normal rough"
ambientcg Metal009 metal-brushed "normal rough"
polyhaven oak_veneer_01 wood-oak "color"
polyhaven ash_veneer wood-ash "color"
polyhaven teak_veneer wood-teak "color"
polyhaven walnut_veneer wood-walnut "color"
polyhaven black_oak_veneer wood-dark "color"
ambientcg Marble016 marble-black "color"
ambientcg Granite002A granite "color"
ambientcg Terrazzo005 terrazzo-chips "color"
ambientcg Travertine009 travertine "color normal"
ambientcg Wicker010A cane "color normal"
polyhaven hessian_230 jute "color normal"

want env && mkdir -p "$DEST/env" && curl -sS -f --retry 4 --retry-all-errors --connect-timeout 30 -A "$UA" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_puresky_1k.hdr" -o "$DEST/env/kloofendal_overcast_puresky_1k.hdr"

# Palette swatches, cut from the colour maps.
bash "$(dirname "$0")/make-swatches.sh"

du -sh "$DEST/textures" "$DEST/env"
