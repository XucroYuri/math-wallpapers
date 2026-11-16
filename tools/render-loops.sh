#!/usr/bin/env bash
# Record each piece as a seamless H.264 loop at the primary desktop size.
# Output: renders/loops/<slug>.mp4 and a matching <slug>-thumb.jpg
set -euo pipefail
cd "$(dirname "$0")/.."

WIDTH="${1:-2560}"
HEIGHT="${2:-1440}"
FPS="${3:-30}"
OUT=renders/loops
mkdir -p "$OUT"

if ! curl -fsS http://127.0.0.1:8090/gallery/ >/dev/null 2>&1; then
  nohup python3 -m http.server 8090 --bind 127.0.0.1 >/tmp/math-wp-server.log 2>&1 &
  sleep 0.4
fi

mapfile -t ROWS < <(python3 - <<'PY'
import json
from pathlib import Path
items = []
for folder in Path("pieces").iterdir():
    if not folder.is_dir() or folder.name.startswith("_"):
        continue
    meta = json.loads((folder / "meta.json").read_text())
    items.append((meta.get("order", 999), folder.name, int(meta["duration"])))
for _, slug, duration in sorted(items):
    print(f"{slug} {duration}")
PY
)

for row in "${ROWS[@]}"; do
  slug="${row%% *}"
  seconds="${row##* }"
  mp4="$OUT/$slug.mp4"
  echo "=== $slug ${seconds}s ${WIDTH}x${HEIGHT}"
  if ! node tools/record-mp4.js "$slug" "$seconds" "$mp4" "$WIDTH" "$HEIGHT" "$FPS"; then
    echo "FAILED $slug" >&2
    continue
  fi
  ffmpeg -y -hide_banner -loglevel error -ss 4 -i "$mp4" -frames:v 1 -q:v 3 "$OUT/$slug-thumb.jpg"
  bg="${HOME}/.local/share/gnome-wallpaper-engine/backgrounds"
  mkdir -p "$bg"
  cp -f "$mp4" "$bg/${slug}.mp4"
  cp -f "$OUT/$slug-thumb.jpg" "$bg/${slug}-thumb.jpg"
  if [[ "$slug" == "riemann" ]]; then
    bash tools/use-wallpaper.sh riemann
  fi
  echo "ready $mp4"
done
