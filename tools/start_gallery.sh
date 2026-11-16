#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

python3 tools/build_gallery.py

if ! curl -fsS http://127.0.0.1:8090/gallery/ >/dev/null 2>&1; then
  nohup python3 -m http.server 8090 --bind 127.0.0.1 >/tmp/math-wp-server.log 2>&1 &
  sleep 1
fi

URL="http://127.0.0.1:8090/gallery/"
echo "gallery: $URL"
command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" >/dev/null 2>&1 || true
