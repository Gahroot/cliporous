#!/usr/bin/env bash
# E2E smoke validation: build with esbuild, run under node with electron stubbed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SHIM="$ROOT/scripts/verify-archetypes/electron-shim.cjs"
OUT="$HERE/run.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/run.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$OUT" \
  --alias:electron="$SHIM" \
  --alias:@shared=./src/shared \
  --external:fluent-ffmpeg \
  --external:ffmpeg-static \
  --external:@ffprobe-installer/ffprobe \
  --external:@google/genai \
  --log-level=warning

node "$OUT" "$@"
