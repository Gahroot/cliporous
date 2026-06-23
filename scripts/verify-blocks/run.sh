#!/usr/bin/env bash
# Build the block smoke renderer with esbuild and run it under node, with
# `electron` resolved to the archetype-verifier's CJS stub so main-process
# modules import cleanly. Native/heavy deps are kept external so esbuild does
# not try to bundle them.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SHIM="$ROOT/scripts/verify-archetypes/electron-shim.cjs"
OUT="$HERE/render-block.bundle.cjs"

cd "$ROOT"

./node_modules/.bin/esbuild \
  "$HERE/render-block.ts" \
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
  --external:remotion \
  --external:'@remotion/*' \
  --log-level=warning

node "$OUT" "$@"
