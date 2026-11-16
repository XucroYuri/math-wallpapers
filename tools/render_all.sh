#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

mkdir -p renders/previews
for dir in pieces/*/; do
  slug="$(basename "$dir")"
  [[ "$slug" == _* ]] && continue
  [[ -f "$dir/meta.json" ]] || continue
  echo "--- $slug"
  node tools/record.js "$slug" 4 "renders/previews/${slug}.webm" 1280 720 30 || true
done
