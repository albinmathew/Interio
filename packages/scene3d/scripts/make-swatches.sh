#!/bin/bash
# Cuts a small swatch out of every texture set's colour map, for the finishes palette:
# the central 384 px of color.jpg (normal.jpg when a set has no colour map) scaled to
# 96 px, as <set>/swatch.jpg.
# Needs macOS `sips`. Run from the repository root:
#   bash packages/scene3d/scripts/make-swatches.sh
set -eu

DEST="apps/web/public/textures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for dir in "$DEST"/*/; do
  set_name="$(basename "$dir")"
  # Sets without a colour map (cloth, leather, brushed metal) get a cut of their normal map,
  # which the palette shades and tints into a swatch.
  src="$dir/color.jpg"
  [ -f "$src" ] || src="$dir/normal.jpg"
  cp "$src" "$TMP/$set_name.jpg"
  sips -c 384 384 "$TMP/$set_name.jpg" >/dev/null
  sips -s format jpeg -s formatOptions 78 -Z 96 "$TMP/$set_name.jpg" --out "$dir/swatch.jpg" >/dev/null
done

du -ch "$DEST"/*/swatch.jpg | tail -1
