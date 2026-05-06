# BatchClip

Electron desktop app: long-form video → AI-scored 9:16 vertical clips with PRESTYJ-style captions.

Trimmed fork of BatchContent. **Single edit style (PRESTYJ). Three caption modes. Dark theme only. Output locked to 720×1280 @ 30fps.** No brand kit, no sound design, no color grade, no story arcs, no clip variants, no multi-style picker, no script cues, no segment template editor.

## Architecture

```
Electron main process (Node.js)
  ├── FFmpeg (fluent-ffmpeg)       — video processing, thumbnails, rendering
  ├── Python venv (yt-dlp, NeMo)   — YouTube download, ASR, face detection
  └── Google Gemini AI (@google/genai) — transcript scoring, hooks, descriptions, edit plans

Renderer (React 19 + Zustand + Tailwind, dark only)
  └── IPC bridge (contextBridge)   — all main↔renderer calls via window.api

Shared
  └── src/shared/ipc-channels.ts   — canonical channel name registry (Ch.*)
```

`src/main/index.ts` is a thin bootstrap (~220 lines): logger, FFmpeg, Python probe,
then `registerXxxHandlers()` for each module under `src/main/ipc/`. The window
background is hard-coded to `#23100c` to prevent a white flash on launch. No
business logic in `index.ts`.

## Brand & Visual Ground Truth

**Brand color tokens** (defined in `src/renderer/src/assets/index.css` as HSL CSS vars):

| Role        | Hex       | Token                |
| ----------- | --------- | -------------------- |
| Background  | `#23100c` | `--background`       |
| Foreground  | `#f6ecd9` | `--foreground`       |
| Accent      | `#9f75ff` | `--accent` / `--primary` / `--ring` |

The whole shadcn token ramp (card, popover, secondary, muted, border) is derived
from these three seeds. Dark theme only — `tailwind.config.js` has `darkMode: 'class'`
but there is no light palette and no theme toggle. Keep it that way.

**Visual ground truth**: `/home/groot/batchclip/.ezcoder/examples/` contains the
reference renders the app must match. Consult these before changing anything
user-visible:

```
standard font no emphasis no highlight.jpg   → captions mode 'standard'
standard font + emphasis.jpg                 → captions mode 'emphasis'
standard font + emphasis&highlight.jpg       → captions mode 'emphasis_highlight'
full screen talking head .mp4                → talking-head archetype
full screen b-roll w subtitles.mp4           → b-roll archetype
split screen talking = b-roll.mp4            → split-screen layout
just subtitles example.mp4                   → caption-only motion
Intro example.mp4 / final 720p.mp4           → end-to-end render reference
```

## Where To Find Things

High-level layout — prefer `ls` / `find` over trusting this list for specifics.

```
src/
├── shared/                  # IPC channel names, types, constants, safe-zones
├── main/                    # Electron main process
│   ├── index.ts             # App lifecycle + window creation only (~220 lines)
│   ├── ipc/                 # IPC handler modules — one file per domain
│   │   ├── ai-handlers.ts
│   │   ├── render-handlers.ts
│   │   ├── media-handlers.ts
│   │   ├── project-handlers.ts
│   │   ├── system-handlers.ts
│   │   ├── export-handlers.ts
│   │   ├── secrets-handlers.ts
│   │   └── ffmpeg-handlers.ts
│   ├── render/              # Batch render engine
│   │   ├── pipeline.ts          # Feature-pipeline orchestrator
│   │   ├── base-render.ts       # Core FFmpeg encode + active command tracking
│   │   ├── segment-render.ts    # Per-segment styled render path
│   │   ├── stitched-render.ts   # Multi-source stitched clip render path
│   │   ├── bumpers.ts           # Intro/outro concat
│   │   ├── overlay-runner.ts    # Multi-pass overlay compositor
│   │   ├── preview.ts           # Preview render (single clip, low quality)
│   │   ├── helpers.ts / quality.ts / filename.ts / types.ts
│   │   ├── color-grade-filter.ts / face-track-filter.ts / vfx-filters.ts
│   │   ├── scene-crop-filter.ts / shot-style-resolver.ts / archetype-hero.ts
│   │   └── features/            # Render features, one per concern
│   │       ├── feature.ts                 # RenderFeature interface + lifecycle
│   │       ├── captions.feature.ts
│   │       ├── hook-title.feature.ts
│   │       ├── rehook.feature.ts
│   │       ├── auto-zoom.feature.ts
│   │       ├── word-emphasis.feature.ts
│   │       ├── broll.feature.ts
│   │       ├── shot-transition.feature.ts
│   │       ├── accent-color.feature.ts
│   │       ├── filler-removal.feature.ts
│   │       ├── brand-kit.feature.ts       # legacy; not wired in V2
│   │       └── sound-design.feature.ts    # legacy; not wired in V2
│   ├── ai/                  # Gemini-backed modules
│   │   ├── gemini-client.ts         # Single shared @google/genai client
│   │   ├── description-generator.ts # Platform descriptions + hashtags
│   │   ├── edit-plan.ts             # Per-clip edit plan generator
│   │   ├── edit-plan-cache.ts
│   │   ├── curiosity-gap.ts         # Boundary optimization
│   │   ├── loop-optimizer.ts        # Loop point + crossfade builder
│   │   ├── segment-styler.ts        # Per-segment style assignment
│   │   └── segment-images.ts        # Per-segment AI image generation
│   ├── edit-styles/         # Single-style registry — only PRESTYJ ships
│   │   ├── index.ts             # EDIT_STYLES = [prestyjEditStyle]
│   │   ├── shared/              # archetypes, types
│   │   └── prestyj/templates/   # PRESTYJ archetype templates
│   ├── layouts/             # FFmpeg filter_complex builders
│   ├── overlays/            # Overlay filter builders (rehook, hook, etc.)
│   ├── ffmpeg.ts / python.ts / python-setup.ts
│   ├── transcription.ts / youtube.ts / face-detection.ts
│   ├── ai-scoring.ts / ai-usage.ts
│   ├── captions.ts / hook-title.ts
│   ├── segments.ts / segment-styles.ts
│   ├── broll-*.ts           # B-roll: keywords, Pexels fetch, AI image gen, placement, overlay
│   ├── shot-segmentation.ts / shot-transitions.ts
│   ├── filler-detection.ts / filler-cuts.ts / word-emphasis.ts
│   ├── color-grade.ts / zoom-filters.ts / transition-filters.ts / auto-zoom.ts
│   ├── font-registry.ts / aspect-ratios.ts / safe-zones.ts / brand-kit.ts
│   ├── secrets.ts / settings-window.ts / logger.ts
│   ├── ipc-error-handler.ts # wrapHandler() — IPC error envelope
│   └── export-manifest.ts
│
├── preload/
│   ├── index.ts             # contextBridge API exposure
│   └── index.d.ts           # window.api types — keep in sync with preload
│
└── renderer/src/            # React 19 UI — dark only, four screens
    ├── App.tsx              # Header + ScreenFrame + recovery prompt
    ├── main.tsx
    ├── SettingsWindow.tsx   # Loaded into a SEPARATE BrowserWindow
    ├── store.ts             # Re-export shim
    ├── store/               # Zustand store split into slices
    │   ├── index.ts
    │   ├── clips-slice.ts / pipeline-slice.ts / project-slice.ts
    │   ├── settings-slice.ts / settings-sync.ts / history-slice.ts / errors-slice.ts
    │   ├── selectors.ts     # selectScreen() — stage → screen routing
    │   └── helpers.ts / types.ts
    ├── components/
    │   ├── screens/         # FOUR top-level screens — see flow below
    │   │   ├── DropScreen.tsx
    │   │   ├── ProcessingScreen.tsx
    │   │   ├── ClipGrid.tsx
    │   │   └── RenderScreen.tsx
    │   ├── ClipCard.tsx / ClipDetail.tsx / ClipGrid.tsx
    │   ├── ProcessingScreen.tsx (panel) / ErrorBoundary.tsx / ErrorLog.tsx
    │   ├── AiUsageIndicator.tsx
    │   └── ui/              # ShadCN — do not edit by hand
    ├── hooks/               # usePipeline (+ pipeline-stages/), useAutosave,
    │                        # useKeyboardShortcuts, useFontLoader, useTheme
    ├── services/            # saveProject, loadProject, recovery
    └── lib/utils.ts

python/                      # yt-dlp, NeMo ASR, MediaPipe face detection
scripts/setup-python.sh
resources/                   # Fonts, music, SFX (bundled)
```

## Four-Screen Flow

The whole UI is four screens, routed by `selectScreen(stage, hasActiveSource)` in
`src/renderer/src/store/selectors.ts`:

| Screen       | Pipeline stages                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| `drop`       | `idle` (or `error` with no source) — file/URL drop zone                       |
| `processing` | `downloading`, `transcribing`, `scoring`, `optimizing-loops`, `detecting-faces`, `ai-editing`, `segmenting`, plus `error` w/ source |
| `clips`      | `ready` with an active source — `ClipGrid` + per-clip `ClipDetail`            |
| `render`     | `rendering`, `done` — `RenderScreen`                                          |

`App.tsx` wraps each screen in a single `ScreenFrame` (150 ms fade + 8px y-shift,
keyed by `pipeline.stage`). That is the **entire** animation budget — no stagger,
no springs, no parallax, no other framer-motion usage anywhere.

**Settings** lives in a separate BrowserWindow (`src/renderer/src/SettingsWindow.tsx`,
opened via `window.api.openSettingsWindow()` and managed by
`src/main/settings-window.ts`). It is not part of the four-screen flow.

## Captions — Three Modes, One Builder

`src/main/captions.ts` is the only caption builder. The three modes — and **only**
these three — are:

| Mode                  | Font                          | Color                    |
| --------------------- | ----------------------------- | ------------------------ |
| `standard`            | PRESTYJ sans (Geist) on every word | `#f6ecd9` everywhere |
| `emphasis`            | Sans default, emphasis words swap to PRESTYJ display (Style Script) | `#f6ecd9` everywhere |
| `emphasis_highlight`  | Same font swap as `emphasis`  | Emphasis words recolored to accent (`#9f75ff`) |

See `.ezcoder/examples/standard*.jpg` for the canonical look. Do not add
animations, box backgrounds, levels, or per-word color cycling — they were
removed in V2.

## Output Lock

Output is hard-locked to **720×1280 @ 30fps**, defined as `OUTPUT_WIDTH`,
`OUTPUT_HEIGHT`, `OUTPUT_FPS` in `src/main/aspect-ratios.ts`. `OutputAspectRatio`
is the literal type `'9:16'`. `ASPECT_RATIO_CONFIGS` has one entry. No platform
branching (TikTok / Reels / Shorts) — one canvas, one safe zone, one ratio.

## Organization Rules

- **Main process entry** → `src/main/index.ts` — bootstrap only. Never add IPC handlers here.
- **IPC handlers** → `src/main/ipc/<domain>-handlers.ts`. Each file exports `registerXxxHandlers()` and is called from `index.ts`. Wrap handlers with `wrapHandler()` from `src/main/ipc-error-handler.ts`.
- **IPC channel names** → `src/shared/ipc-channels.ts` (the `Ch` object). Do not hard-code channel strings in handlers or the preload bridge.
- **Render engine** → `src/main/render/`. New render logic goes in a `features/*.feature.ts` module implementing the `RenderFeature` interface from `features/feature.ts`.
- **AI modules** → `src/main/ai/`, one module per capability. Reuse `gemini-client.ts` rather than constructing new clients.
- **Edit styles** → `src/main/edit-styles/`. PRESTYJ is the only registered style; do not add a multi-style picker. Templates live under `prestyj/templates/`.
- **Layouts / overlays** → `src/main/layouts/` and `src/main/overlays/` for FFmpeg filter_complex builders.
- **Preload bridge** → `src/preload/index.ts` exposes `window.api`; `src/preload/index.d.ts` must stay in sync.
- **Renderer state** → `src/renderer/src/store/` slices. `store.ts` is only a re-export shim.
- **React components** → `src/renderer/src/components/`, one component per file. Top-level screens live under `components/screens/`. ShadCN UI in `components/ui/` (auto-generated via `npx shadcn@latest add <component>`).
- **Hooks** → `src/renderer/src/hooks/`.
- **Tests** → co-located next to source (`*.test.ts` / `*.test.tsx`). Main-process tests use `src/main/test-setup.ts` via Vitest.
- **Path alias**: `@/` maps to `src/renderer/src/`. `@shared/` maps to `src/shared/`.
- **Config file**: `electron.vite.config.ts` (dot, not dash).

## IPC Channels

Channel names are defined in `src/shared/ipc-channels.ts` as the `Ch` object.
Handlers are registered in `src/main/ipc/*-handlers.ts`. To see what channels
exist right now, read those files — do not trust a static list here. The preload
bridge in `src/preload/index.ts` is the canonical renderer-facing surface.

Common main → renderer `send` events: `youtube:progress`, `transcribe:progress`,
`ai:scoringProgress`, `face:progress`, `render:clipStart`, `render:clipProgress`,
`render:clipDone`, `render:clipError`, `render:batchDone`, `render:cancelled`.
The authoritative list is in `src/shared/ipc-channels.ts`.

## Render Pipeline — Feature Lifecycle

The batch render runs through `startBatchRender()` in `src/main/render/pipeline.ts`.
It is a feature-pipeline: each `RenderFeature` in `src/main/render/features/`
hooks into a four-phase lifecycle defined in `features/feature.ts`:

1. **`prepare(job, batchOptions)`** — pre-render setup. Generate ASS captions,
   detect fillers, fetch B-roll, build hook/rehook overlays, plan segment styling.
   Returns `{ tempFiles, modified }`. Temp files are cleaned up after the clip
   finishes.
2. **`videoFilter(job, ctx)`** — contribute to the base `-vf` filter chain
   (auto-zoom, word emphasis, accent color, etc.). Order: filler-select → crop
   → scale → zoom. Return `null` to skip.
3. **`overlayPass(job, ctx)`** — return an `OverlayPassResult` (`{ name, filter,
   filterComplex? }`) for a separate FFmpeg re-encode pass. Each overlay runs
   as its own invocation to avoid Windows escaping issues with massive combined
   filter strings. Composited by `overlay-runner.ts`.
4. **`postProcess(job, renderedPath, ctx)`** — final post-processing (e.g.
   B-roll image overlays). Returns the path to the final output.

`renderClip()` (or `renderSegmentedClip()` / `renderStitchedClip()`) runs the
base FFmpeg encode and concats bumpers. Encoder preference:
`h264_nvenc` → `h264_qsv` → `libx264` (see `getEncoder()` in
`src/main/ffmpeg.ts`). Per-clip errors are isolated — one failure does not abort
the batch. Active FFmpeg commands are tracked in `base-render.ts` so
`cancelRender()` can `SIGTERM` them.

## Error Handling

### Main process
- `process.on('uncaughtException')` in `src/main/index.ts` — shows a native dialog with copy-to-clipboard, then exits.
- `process.on('unhandledRejection')` — logs to console only (non-fatal, no dialog).
- IPC handlers use `wrapHandler()` from `src/main/ipc-error-handler.ts` for a consistent error envelope; errors serialize naturally across `ipcMain.handle`.
- GPU encoder failures in the render pipeline fall back to `libx264`.
- Python script errors include the script name + stderr context.
- Logger: `src/main/logger.ts` (`initLogger` / `log` / `closeLogger`) writes to the session log file.

### Renderer
- `ErrorBoundary` wraps the full app — catches React render errors with copy + reload UI.
- `ErrorLog` panel appears at the bottom when `store.errorLog` is non-empty — collapsible, per-entry copy, "Copy All", "Clear".
- `addError({ source, message })` on the Zustand store (see `errors-slice.ts`) adds entries with auto-assigned id + timestamp.
- Recovery prompt (`App.tsx` → `RecoveryPrompt`) checks for an autosaved payload from a previous unclean shutdown 400 ms after first paint.
- Error sources: `pipeline`, `transcription`, `scoring`, `ffmpeg`, `youtube`, `face-detection`, `render`, plus any added in `errors-slice.ts`.

## Code Quality

After editing ANY file, run:

```bash
npx electron-vite build
```

Fix ALL errors before continuing. The build includes TypeScript type checking.

```bash
npm test                 # both main + renderer suites
npm run test:main
npm run test:renderer
npx electron-vite dev    # hot-reload dev
```

No ESLint is configured. TypeScript strict mode is the primary quality gate.

## Python Environment

The Python environment lives in `python/` at the project root:

```
python/
├── requirements.txt      # nemo_toolkit[asr], mediapipe, opencv-python-headless, numpy, yt-dlp
├── venv/                 # Created by setup script (git-ignored)
├── transcribe.py         # Parakeet TDT v3 ASR — word + segment timestamps
├── face_detect.py        # MediaPipe face detection → 9:16 crop rectangles
└── download.py           # yt-dlp YouTube downloader
```

### Setup

```bash
npm run setup:python
# or directly:
bash scripts/setup-python.sh
```

### Python Script Protocol

All Python scripts communicate over stdout with newline-delimited JSON:

```json
{ "type": "progress", "stage": "loading-model", "message": "Loading NeMo..." }
{ "type": "done", "text": "...", "words": [...], "segments": [...] }
{ "type": "error", "message": "..." }
```

### Notes

- **NeMo / CUDA**: `nemo_toolkit[asr]` pulls in PyTorch + CUDA libraries (~3–4 GB). On a machine without a compatible NVIDIA GPU the model still runs on CPU (slower). The install includes CUDA wheels regardless — that is normal.
- **Model download**: `nvidia/parakeet-tdt-0.6b-v3` (~1.2 GB) is downloaded from HuggingFace on first `transcribe.py` invocation and cached in `~/.cache/huggingface/`.
- **Electron bridge**: `src/main/python.ts` exports `resolvePythonPath`, `resolveScriptPath`, `runPythonScript`, `isPythonAvailable`. First-run venv bootstrap lives in `src/main/python-setup.ts`. Availability is checked in `src/main/index.ts` at startup (non-blocking — never gates window creation).
- **Packaged build**: electron-builder copies `python/*.py` + `python/requirements.txt` into `resources/python/` in the app bundle. The Windows build maintains its own venv at `%APPDATA%/batchcontent/python-env/`, auto-installed on first launch.
- **Timeouts**: Transcription allows 3 hours; YouTube download allows 2 hours; Python import check allows 30 seconds.

## Deploy to Windows Desktop (WSL2)

When the user says **"send it to my Windows machine"** (or similar), run this
full deploy sequence. Do NOT skip steps or try to patch individual files —
always replace the entire folder.

```bash
# 1. Build the app code
npx electron-vite build

# 2. Pack a fresh app.asar from the build output
ASAR_STAGE=$(mktemp -d)
mkdir -p "$ASAR_STAGE/out/main" "$ASAR_STAGE/out/preload" "$ASAR_STAGE/out/renderer/assets"
cp out/main/*.js "$ASAR_STAGE/out/main/"
cp out/preload/index.js "$ASAR_STAGE/out/preload/"
cp out/renderer/index.html "$ASAR_STAGE/out/renderer/"
cp out/renderer/assets/* "$ASAR_STAGE/out/renderer/assets/"
cp package.json "$ASAR_STAGE/"
npx asar pack "$ASAR_STAGE" dist/win-unpacked/resources/app.asar
rm -rf "$ASAR_STAGE"

# 3. Update Python scripts in dist (NOT the venv — it's Windows-specific)
cp python/download.py python/face_detect.py python/transcribe.py python/requirements.txt \
   dist/win-unpacked/resources/python/

# 4. Nuke and replace the entire BatchContent folder on the Windows desktop
rm -rf "/mnt/c/Users/Groot/Desktop/BatchContent"
cp -r dist/win-unpacked "/mnt/c/Users/Groot/Desktop/BatchContent"
sync
```

**Important notes:**
- `dist/win-unpacked/` contains the Electron shell (exe, DLLs, ffmpeg binaries).
  Created by `npm run build:win` or `npm run build:unpack`. If it doesn't exist
  yet, run `npm run build:win` first (one-time, takes a while).
- Never copy the Linux `python/venv/` to Windows — the Windows app installs its
  own venv at `%APPDATA%/batchcontent/python-env/` on first launch.
- `cp -r` across WSL2 → `/mnt/c/` can take 30–60 seconds for ~240 MB. Use a
  180 s timeout or `run_in_background` if needed.
- Session logs on Windows: `C:\Users\Groot\AppData\Roaming\batchcontent\logs\`
- Debug exports on Windows: `C:\Users\Groot\Downloads\batchcontent-debug-*.log`

## Environment

- Working directory: /home/groot/batchclip
- Platform: linux
- Node: check `.nvmrc` or `package.json` engines field
