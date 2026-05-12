#!/usr/bin/env bash
# deploy-mac.sh — build BatchClip and replace the .app on the Mac desktop.
#
# Usage:
#   npm run deploy:mac           # full deploy: build + asar repack + sync
#   npm run deploy:mac -- --fast # skip electron-vite build (asar repack + sync only)
#   npm run deploy:mac -- --yes  # skip the destructive-overwrite prompt
#
# Prerequisites:
#   - macOS host (this script targets ~/Desktop/BatchClip.app).
#   - dist/mac-arm64/BatchClip.app exists. If it doesn't, run `npm run build:mac`
#     once to create the Electron shell + bundled node_modules.
#
# Behavior:
#   1. (default) npx electron-vite build
#   2. Extract dist/mac-arm64/BatchClip.app/Contents/Resources/app.asar into a
#      staging dir, overlay the fresh out/ + package.json, repack into the
#      .app on the desktop. (Mac packs node_modules INSIDE the asar — we must
#      preserve them, unlike Windows which keeps them in app.asar.unpacked.)
#   3. Refresh python/*.py + requirements.txt in
#      ~/Desktop/BatchClip.app/Contents/Resources/python/
#      (the venv is host-specific and is NEVER touched).
#   4. Clear the com.apple.quarantine xattr and bump the .app mtime so
#      Launch Services notices the change.
#
# If ~/Desktop/BatchClip.app is missing, the script copies the freshly-built
# dist/mac-arm64/BatchClip.app over to the desktop instead of repacking.

set -euo pipefail

TARGET="$HOME/Desktop/BatchClip.app"
UNPACKED="dist/mac-arm64/BatchClip.app"

FAST=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --fast)  FAST=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"
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

if [ "$(uname -s)" != "Darwin" ]; then
  fail "deploy-mac.sh is intended for macOS hosts (uname=$(uname -s))."
fi

if [ ! -d "$UNPACKED" ]; then
  fail "$UNPACKED not found. Run 'npm run build:mac' once to create the Electron shell."
fi

SOURCE_ASAR="$UNPACKED/Contents/Resources/app.asar"
if [ ! -f "$SOURCE_ASAR" ]; then
  fail "Missing $SOURCE_ASAR — the unpacked .app is incomplete. Re-run 'npm run build:mac'."
fi

# --- 1. Build --------------------------------------------------------------

if [ "$FAST" -eq 0 ]; then
  step "Building (electron-vite build)"
  npx electron-vite build
  ok "Build complete"
else
  step "Skipping build (--fast)"
fi

# --- First-deploy fast path: copy the whole .app -----------------------------

if [ ! -d "$TARGET" ]; then
  step "No existing $TARGET — copying fresh .app from $UNPACKED"
  cp -R "$UNPACKED" "$TARGET"
  # Refresh python scripts in case they changed since build:mac.
  cp python/download.py python/face_detect.py python/transcribe.py python/requirements.txt \
     "$TARGET/Contents/Resources/python/"
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
  touch "$TARGET"
  ok "Deployed to $TARGET"
  bold "🎉 Done. Launch BatchClip from the desktop."
  exit 0
fi

# --- 2. Repack app.asar with fresh out/ overlaid ---------------------------

step "Repacking app.asar (preserving bundled node_modules)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Extract the known-good asar from dist/mac-arm64 (has all production deps).
npx --yes asar extract "$SOURCE_ASAR" "$STAGE"

# Overlay fresh build output + package.json.
rm -rf "$STAGE/out"
mkdir -p "$STAGE/out/main" "$STAGE/out/preload" "$STAGE/out/renderer/assets"
cp out/main/*.js          "$STAGE/out/main/"
cp out/preload/index.js   "$STAGE/out/preload/"
cp out/renderer/index.html "$STAGE/out/renderer/"
cp out/renderer/assets/*  "$STAGE/out/renderer/assets/"
cp package.json           "$STAGE/"

if [ "$ASSUME_YES" -eq 0 ]; then
  printf '\033[1;33m⚠\033[0m  About to overwrite %s/Contents/Resources/app.asar. Continue? [y/N] ' "$TARGET"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) fail "Aborted." ;;
  esac
fi

npx --yes asar pack "$STAGE" "$TARGET/Contents/Resources/app.asar"
ok "app.asar repacked into $TARGET"

# --- 3. Refresh Python scripts (NOT the venv) ------------------------------

step "Refreshing Python scripts"
mkdir -p "$TARGET/Contents/Resources/python"
cp python/download.py python/face_detect.py python/transcribe.py python/requirements.txt \
   "$TARGET/Contents/Resources/python/"
ok "Python scripts copied"

# --- 4. Clear quarantine + bump mtime --------------------------------------

step "Refreshing Launch Services state"
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
touch "$TARGET"
ok "Quarantine cleared"

# Sanity check: confirm a known dep is still inside the asar.
if npx --yes asar list "$TARGET/Contents/Resources/app.asar" 2>/dev/null \
     | grep -q '^/node_modules/@google/genai/package.json$'; then
  ok "Sanity: @google/genai present inside app.asar"
else
  fail "Sanity check failed — @google/genai missing from app.asar. Re-run 'npm run build:mac'."
fi

bold "🎉 Done. Launch BatchClip from the desktop."
