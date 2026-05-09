#!/usr/bin/env bash
# deploy-windows.sh — build BatchClip and replace the copy on the Windows desktop.
#
# Usage:
#   npm run deploy           # full deploy: build + asar repack + sync
#   npm run deploy -- --fast # skip electron-vite build (asar repack + sync only)
#
# Prerequisites:
#   - WSL2 with /mnt/c mounted (Windows desktop reachable at TARGET below).
#   - dist/win-unpacked/ exists. If it doesn't, run `npm run build:win` once.
#
# Behavior:
#   1. (default) npx electron-vite build
#   2. Pack a fresh app.asar from out/ into dist/win-unpacked/resources/app.asar
#   3. Refresh python/*.py + requirements.txt in dist/win-unpacked/resources/python/
#      (the venv is Windows-specific and is NEVER touched).
#   4. rm -rf the BatchContent folder on the Windows desktop and copy
#      dist/win-unpacked there.
#
# Step 4 is destructive (rm -rf on the Windows folder). Pass --yes / -y to
# skip the confirmation prompt.

set -euo pipefail

TARGET="/mnt/c/Users/Groot/Desktop/BatchContent"
UNPACKED="dist/win-unpacked"

FAST=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --fast)  FAST=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

# Resolve to project root (one level up from this script's directory).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preflight -------------------------------------------------------------

if [ ! -d "$UNPACKED" ]; then
  fail "$UNPACKED not found. Run 'npm run build:win' once to create the Electron shell."
fi

if [ ! -d "$(dirname "$TARGET")" ]; then
  fail "Windows desktop not reachable at $(dirname "$TARGET"). Is /mnt/c mounted?"
fi

# --- 1. Build --------------------------------------------------------------

if [ "$FAST" -eq 0 ]; then
  step "Building (electron-vite build)"
  npx electron-vite build
  ok "Build complete"
else
  step "Skipping build (--fast)"
fi

# --- 2. Repack app.asar ----------------------------------------------------

step "Packing app.asar"
ASAR_STAGE="$(mktemp -d)"
trap 'rm -rf "$ASAR_STAGE"' EXIT

mkdir -p "$ASAR_STAGE/out/main" "$ASAR_STAGE/out/preload" "$ASAR_STAGE/out/renderer/assets"
cp out/main/*.js "$ASAR_STAGE/out/main/"
cp out/preload/index.js "$ASAR_STAGE/out/preload/"
cp out/renderer/index.html "$ASAR_STAGE/out/renderer/"
cp out/renderer/assets/* "$ASAR_STAGE/out/renderer/assets/"
cp package.json "$ASAR_STAGE/"

npx --yes asar pack "$ASAR_STAGE" "$UNPACKED/resources/app.asar"
ok "app.asar repacked"

# --- 3. Refresh Python scripts (NOT the venv) ------------------------------

step "Refreshing Python scripts"
mkdir -p "$UNPACKED/resources/python"
cp python/download.py python/face_detect.py python/transcribe.py python/requirements.txt \
   "$UNPACKED/resources/python/"
ok "Python scripts copied"

# --- 4. Replace the folder on the Windows desktop --------------------------

step "Deploying to $TARGET"
if [ "$ASSUME_YES" -eq 0 ] && [ -d "$TARGET" ]; then
  printf '\033[1;33m⚠\033[0m  About to delete %s and replace it. Continue? [y/N] ' "$TARGET"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) fail "Aborted." ;;
  esac
fi

rm -rf "$TARGET"
cp -r "$UNPACKED" "$TARGET"
sync
ok "Deployed to $TARGET"

bold "🎉 Done. Launch BatchContent from the Windows desktop."
