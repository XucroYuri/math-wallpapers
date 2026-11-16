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

encode() {
  local webm="$1" mp4="$2"
  if ffmpeg -y -hide_banner -loglevel error -i "$webm" \
      -an -c:v h264_nvenc -preset p5 -cq 20 -pix_fmt yuv420p -movflags +faststart "$mp4"; then
    return 0
  fi
  ffmpeg -y -hide_banner -loglevel error -i "$webm" \
    -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -movflags +faststart "$mp4"
}

for row in "${ROWS[@]}"; do
  slug="${row%% *}"
  seconds="${row##* }"
  webm="$OUT/$slug.webm"
  mp4="$OUT/$slug.mp4"
  echo "=== $slug ${seconds}s ${WIDTH}x${HEIGHT}"
  node tools/record.js "$slug" "$seconds" "$webm" "$WIDTH" "$HEIGHT" "$FPS" || true
  if [[ ! -s "$webm" ]]; then
    echo "missing $webm" >&2
    continue
  fi
  encode "$webm" "$mp4"
  ffmpeg -y -hide_banner -loglevel error -ss 4 -i "$mp4" -frames:v 1 -q:v 3 "$OUT/$slug-thumb.jpg"
  rm -f "$webm"
  echo "ready $mp4"
done
