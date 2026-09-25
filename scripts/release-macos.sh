#!/usr/bin/env bash
# Build and verify the unsigned BatchClip DMG for macOS 11+ on Apple Silicon.
#
# Usage: npm run release:mac
# Output: dist/release/macos-arm64/BatchClip-<version>-mac-arm64.dmg

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/audit-third-party-assets.mjs" --release
VERSION="$(node -p "require('$ROOT/package.json').version")"
FINAL_OUTPUT="$ROOT/dist/release/macos-arm64"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/batchclip-macos-arm64.XXXXXX")"
STAGE_OUTPUT="$STAGE/release-output"
MOUNT_POINT="$STAGE/dmg-mounted"
MOUNTED=0

cleanup() {
  if [ "$MOUNTED" -eq 1 ]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

copy_release_inputs() {
  local input
  local inputs=(
    package.json
    package-lock.json
    LICENSE
    THIRD_PARTY_NOTICES.md
    biome.json
    components.json
    electron.vite.config.ts
    postcss.config.js
    remotion.config.ts
    tailwind.config.js
    tsconfig.json
    tsconfig.node.json
    tsconfig.remotion.json
    tsconfig.web.json
    vitest.config.main.ts
    vitest.config.ts
    build
    python
    resources
    scripts
    src
  )

  for input in "${inputs[@]}"; do
    [ -e "$ROOT/$input" ] || fail "Missing release input: $input"
    cp -R "$ROOT/$input" "$STAGE/"
  done
}

target_macos_arm64() {
  env \
    npm_config_os=darwin \
    npm_config_cpu=arm64 \
    "$@"
}

assert_arm64_macho() {
  local binary="$1"
  local architectures
  [ -f "$binary" ] || fail "Missing Mach-O binary: $binary"
  architectures="$(lipo -archs "$binary" 2>/dev/null)" \
    || fail "Not a Mach-O binary: $binary"
  [ "$architectures" = "arm64" ] \
    || fail "Expected arm64-only Mach-O binary, found '$architectures': $binary"
}

assert_no_developer_signature() {
  local target="$1"
  local signature_info
  signature_info="$(codesign --display --verbose=4 "$target" 2>&1 || true)"
  if printf '%s\n' "$signature_info" | grep -q '^Authority='; then
    fail "Developer certificate signature unexpectedly present: $target"
  fi
  if printf '%s\n' "$signature_info" | grep '^TeamIdentifier=' | grep -vq '^TeamIdentifier=not set$'; then
    fail "Apple team identifier unexpectedly present: $target"
  fi
}

assert_asar_path() {
  local path="$1"
  grep -Fqx "/$path" "$STAGE/asar-contents.txt" \
    || fail "Missing packaged app.asar path: $path"
}

assert_file_association() {
  local plist="$1"
  node - "$plist" <<'NODE'
const { execFileSync } = require('node:child_process')
const plistPath = process.argv[2]
const plist = JSON.parse(
  execFileSync('plutil', ['-convert', 'json', '-o', '-', plistPath], { encoding: 'utf8' })
)
const association = (plist.CFBundleDocumentTypes ?? []).find((entry) =>
  entry.CFBundleTypeExtensions?.includes('batchclip')
)
if (!association) throw new Error('Missing .batchclip document association')
if (association.CFBundleTypeName !== 'BatchClip Project') {
  throw new Error(`Wrong document type name: ${association.CFBundleTypeName}`)
}
if (association.CFBundleTypeRole !== 'Editor') {
  throw new Error(`Wrong document type role: ${association.CFBundleTypeRole}`)
}
if (association.CFBundleTypeIconFile !== 'icon.icns') {
  throw new Error(`Wrong document icon: ${association.CFBundleTypeIconFile}`)
}
NODE
}

assert_release_contents() {
  local artifact="$STAGE_OUTPUT/BatchClip-$VERSION-mac-arm64.dmg"
  local unpacked_app="$STAGE_OUTPUT/mac-arm64/BatchClip.app"

  [ -f "$artifact" ] || fail "Missing DMG artifact: $artifact"
  [ -d "$unpacked_app" ] || fail "Missing unpacked Apple Silicon app: $unpacked_app"
  assert_arm64_macho "$unpacked_app/Contents/MacOS/BatchClip"
  assert_no_developer_signature "$unpacked_app"
  assert_no_developer_signature "$artifact"

  mkdir -p "$MOUNT_POINT"
  hdiutil attach "$artifact" -readonly -nobrowse -mountpoint "$MOUNT_POINT" -quiet
  MOUNTED=1

  local app="$MOUNT_POINT/BatchClip.app"
  local app_resources="$app/Contents/Resources"
  local unpacked="$app_resources/app.asar.unpacked/node_modules"
  local asar="$app_resources/app.asar"

  [ -d "$app" ] || fail "DMG does not contain BatchClip.app"
  [ -L "$MOUNT_POINT/Applications" ] || fail "DMG does not contain the Applications link"
  [ -f "$asar" ] || fail "DMG app is missing app.asar"
  [ -f "$app_resources/remotion/index.html" ] || fail "Missing prebuilt Remotion browser bundle"
  [ -f "$app_resources/LICENSE.electron.txt" ] || fail "Missing Electron license"
  [ -f "$app_resources/LICENSES.chromium.html" ] || fail "Missing Chromium third-party notices"
  cmp -s "$ROOT/build/icon.icns" "$app_resources/icon.icns" \
    || fail "Packaged application icon does not match build/icon.icns"
  cmp -s "$ROOT/build/icon.png" "$app_resources/icon.png" \
    || fail "Packaged runtime icon does not match build/icon.png"
  assert_file_association "$app/Contents/Info.plist"

  "$STAGE/node_modules/.bin/asar" list "$asar" > "$STAGE/asar-contents.txt"
  node "$STAGE/scripts/assert-clean-release-payload.mjs" "$app_resources" "$STAGE/asar-contents.txt"
  assert_asar_path "out/main/index.js"
  assert_asar_path "node_modules/@remotion/renderer/package.json"
  assert_asar_path "node_modules/react/package.json"
  assert_asar_path "node_modules/react-dom/package.json"
  assert_asar_path "out/main/catalog/presets.json"

  local sqlite="$unpacked/better-sqlite3/build/Release/better_sqlite3.node"
  local compositor_dir="$unpacked/@remotion/compositor-darwin-arm64"
  local ffmpeg="$unpacked/ffmpeg-static/ffmpeg"
  local ffprobe="$unpacked/@ffprobe-installer/darwin-arm64/ffprobe"
  local compositor="$compositor_dir/remotion"

  assert_arm64_macho "$sqlite"
  assert_arm64_macho "$ffmpeg"
  assert_arm64_macho "$ffprobe"
  assert_arm64_macho "$compositor"
  [ -x "$ffmpeg" ] || fail "Packaged FFmpeg is not executable"
  [ -x "$ffprobe" ] || fail "Packaged ffprobe is not executable"
  [ -x "$compositor" ] || fail "Packaged Remotion compositor is not executable"
  "$ffmpeg" -hide_banner -filters 2>/dev/null | grep ' ass ' >/dev/null \
    || fail "Packaged FFmpeg is missing the libass subtitle filter"
  "$ffmpeg" -hide_banner -filters 2>/dev/null | grep ' overlay ' >/dev/null \
    || fail "Packaged FFmpeg is missing the overlay filter"
  "$ffprobe" -version >/dev/null 2>&1 \
    || fail "Packaged ffprobe cannot start without external libraries"

  [ -f "$app_resources/python/download.py" ] || fail "Missing packaged Python download script"
  [ -f "$app_resources/python/face_detect.py" ] || fail "Missing packaged Python face detection script"
  [ -f "$app_resources/python/transcribe.py" ] || fail "Missing packaged Python transcription script"
  [ -f "$app_resources/python/requirements.txt" ] || fail "Missing packaged Python requirements"
  [ -f "$app_resources/python/pyproject.toml" ] || fail "Missing packaged Python project metadata"
  cmp -s "$ROOT/THIRD_PARTY_NOTICES.md" "$app_resources/THIRD_PARTY_NOTICES.md" \
    || fail "Missing or changed packaged third-party notices"
  find "$app_resources/fonts" -type f -name '*.ttf' -print -quit | grep -q . \
    || fail "No packaged fonts found"
  find "$app_resources/sfx" -type f -name '*.mp3' -print -quit | grep -q . \
    || fail "No packaged SFX found"
  [ -d "$app_resources/music" ] || fail "Missing packaged music resources directory"

  assert_no_developer_signature "$app"
  if spctl --assess --type execute "$app" >/dev/null 2>&1; then
    fail "Gatekeeper unexpectedly accepted the unsigned application"
  fi

  if find "$STAGE_OUTPUT" -maxdepth 2 \( -iname '*x64*' -o -iname '*universal*' \) \
    -print -quit | grep -q .; then
    fail "A distributable macOS x64 or universal target was generated"
  fi
}

[ "$(uname -s)" = "Darwin" ] \
  || fail "The macOS release must be built on macOS (found $(uname -s))"
[ "$(uname -m)" = "arm64" ] \
  || fail "The macOS release must be built on Apple Silicon (found $(uname -m))"
[ -f "$ROOT/build/icon.icns" ] || fail "Missing approved macOS icon: build/icon.icns"
[ -f "$ROOT/build/icon.png" ] || fail "Missing approved runtime icon: build/icon.png"

step "Creating an isolated macOS arm64 release workspace"
copy_release_inputs
ok "Release inputs copied to $STAGE"

cd "$STAGE"

step "Installing locked macOS arm64 dependencies"
target_macos_arm64 npm ci --ignore-scripts --include=optional
target_macos_arm64 node node_modules/electron/install.js
target_macos_arm64 node node_modules/ffmpeg-static/install.js
target_macos_arm64 ./node_modules/.bin/electron-builder install-app-deps --platform=darwin --arch=arm64
chmod 755 \
  node_modules/@remotion/compositor-darwin-arm64/remotion \
  node_modules/@remotion/compositor-darwin-arm64/ffmpeg \
  node_modules/@remotion/compositor-darwin-arm64/ffprobe \
  node_modules/@ffprobe-installer/darwin-arm64/ffprobe \
  node_modules/ffmpeg-static/ffmpeg \
  node_modules/@esbuild/darwin-arm64/bin/esbuild
assert_arm64_macho node_modules/ffmpeg-static/ffmpeg
assert_arm64_macho node_modules/@ffprobe-installer/darwin-arm64/ffprobe
assert_arm64_macho node_modules/better-sqlite3/build/Release/better_sqlite3.node
assert_arm64_macho node_modules/@remotion/compositor-darwin-arm64/remotion
assert_arm64_macho node_modules/@rspack/binding-darwin-arm64/rspack.darwin-arm64.node
assert_arm64_macho node_modules/@esbuild/darwin-arm64/bin/esbuild
ok "Native modules, media binaries, and Remotion tooling target macOS arm64"

cat > "$STAGE/sqlite-smoke.cjs" <<'NODE'
const Database = require('better-sqlite3')
const database = new Database(':memory:')
const row = database.prepare('select 1 as ok').get()
database.close()
if (row.ok !== 1) throw new Error('better-sqlite3 smoke query failed')
process.exit(0)
NODE
./node_modules/.bin/electron "$STAGE/sqlite-smoke.cjs"
ok "better-sqlite3 loads under the packaged Electron ABI"

step "Building the Electron application"
npm run build
ok "Electron application built"

step "Packaging unsigned, unnotarized Apple Silicon DMG"
unset \
  CSC_LINK CSC_KEY_PASSWORD CSC_NAME MAC_CSC_LINK MAC_CSC_KEY_PASSWORD \
  APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID \
  APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER \
  APPLE_KEYCHAIN APPLE_KEYCHAIN_PROFILE
export CSC_IDENTITY_AUTO_DISCOVERY=false
./node_modules/.bin/electron-builder \
  --mac dmg \
  --arm64 \
  --publish never \
  --config.forceCodeSigning=false \
  --config.mac.notarize=false \
  --config.dmg.sign=false \
  --config.directories.output="$STAGE_OUTPUT"

step "Verifying the mounted DMG payload, architecture, resources, and unsigned status"
assert_release_contents
ok "Release payload verified"

hdiutil detach "$MOUNT_POINT" -quiet
MOUNTED=0

step "Publishing release artifacts to the project output directory"
mkdir -p "$(dirname "$FINAL_OUTPUT")"
rm -rf "$FINAL_OUTPUT"
cp -R "$STAGE_OUTPUT" "$FINAL_OUTPUT"
ok "Unsigned macOS arm64 DMG: $FINAL_OUTPUT/BatchClip-$VERSION-mac-arm64.dmg"
