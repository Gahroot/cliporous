#!/usr/bin/env bash
# Build the verifier with esbuild and run it under node, with `electron`
# resolved to a local CJS stub so main-process modules import cleanly.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/render-samples.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/render-samples.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=cjs \
  --outfile="$OUT" \
  --alias:electron="$HERE/electron-shim.cjs" \
  --alias:@shared=./src/shared \
  --external:fluent-ffmpeg \
  --external:ffmpeg-static \
  --external:@ffprobe-installer/ffprobe \
  --external:@google/genai \
  --log-level=warning

node "$OUT" "$@"
