#!/usr/bin/env bash
# Point Gnome Live Wallpaper at one rendered loop.
# usage: tools/use-wallpaper.sh riemann
set -euo pipefail
cd "$(dirname "$0")/.."

slug="${1:-}"
if [[ -z "$slug" ]]; then
  echo "usage: tools/use-wallpaper.sh <slug>" >&2
  exit 2
fi

src="renders/loops/${slug}.mp4"
thumb="renders/loops/${slug}-thumb.jpg"
if [[ ! -f "$src" ]]; then
  echo "missing $src — run tools/render-loops.sh first" >&2
  exit 1
fi

bg="${HOME}/.local/share/gnome-wallpaper-engine/backgrounds"
mkdir -p "$bg"
cp -f "$src" "$bg/${slug}.mp4"
if [[ -f "$thumb" ]]; then
  cp -f "$thumb" "$bg/${slug}-thumb.jpg"
fi

schema="org.gnome.shell.extensions.gnome-wallpaper-engine"
schema_dir="${HOME}/.local/share/gnome-shell/extensions/gnome-wallpaper-engine@gjs.com/schemas"
gsettings --schemadir "$schema_dir" set "$schema" current-wallpaper "${slug}.mp4"
gsettings --schemadir "$schema_dir" set "$schema" autostart true
echo "wallpaper: ${slug}.mp4"
