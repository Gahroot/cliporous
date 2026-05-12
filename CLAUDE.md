# BatchClip (cliporous)

Electron desktop app: long-form video → AI-scored 9:16 vertical clips with PRESTYJ-style captions. Hybrid render pipeline: Remotion (alpha-channel compositions) + FFmpeg (encode, overlay, concat).

**Locked invariants:** single edit style (PRESTYJ), three caption modes, dark theme only, output 720×1280 @ 30fps. No brand kit, no sound design, no color grade, no clip variants, no multi-style picker.

## Stack

- **Electron 34** + electron-vite 5 + electron-builder 25
- **React 19** + Radix/shadcn + Tailwind 3.4 + framer-motion (used only for `ScreenFrame`)
- **Zustand 5** + immer for state (sliced)
- **@google/genai** (Gemini) for scoring, edit plans, descriptions, hooks, segment images
- **ffmpeg-static** + **@ffprobe-installer** for video; **Remotion 4** for archetype compositions (ProRes 4444 + alpha)
- **better-sqlite3** for local persistence
- **Python venv** (yt-dlp, NeMo Parakeet ASR, MediaPipe) — sidecar scripts in `python/`

## Project Structure

```
cliporous/
├── electron.vite.config.ts      # Three-target build (main/preload/renderer)
├── remotion.config.ts           # Entry: src/main/remotion/index.ts; ProRes+PNG for alpha
├── tsconfig.{json,node,web,remotion}.json
├── vitest.config.{ts,main.ts}   # Renderer (jsdom) + main (node)
├── tailwind.config.js / postcss.config.js / components.json
│
├── python/                      # transcribe.py · face_detect.py · download.py · requirements.txt
├── resources/                   # bin/ (ffmpeg, yt-dlp) · fonts/ · music/ · sfx/  (asarUnpacked)
├── scripts/                     # setup-python.sh · deploy-windows.sh · e2e-smoke/ · verify-archetypes/
│
└── src/
    ├── shared/                  # ipc-channels (Ch.*) · types · constants · safe-zones · segments
    ├── preload/                 # contextBridge (window.api) — index.d.ts must stay in sync
    ├── main/
    │   ├── index.ts             # Bootstrap only (~220 lines): logger, ffmpeg, python probe, registerXxxHandlers
    │   ├── ipc/                 # One handler module per domain — wrap with wrapHandler()
    │   ├── ai/                  # gemini-client (shared) · edit-plan(+cache) · descriptions · curiosity-gap · loop-optimizer · segment-images/videos · embeddings
    │   ├── edit-styles/         # Single-style registry: prestyj/templates/* + shared/{archetypes,base,brand,transitions,types}
    │   ├── remotion/            # Root.tsx · registry.ts (archetype→composition) · render.ts (cached bundle) · compositions/* · shared/{fonts,easing,PrestyjBackground}
    │   ├── render/              # pipeline.ts · base-render · segment-render (consults remotion registry, falls back to ffmpeg) · stitched-render · preview · overlay-runner · features/*.feature.ts
    │   ├── layouts/ overlays/   # FFmpeg filter_complex builders (segment layouts, caption-bg, rehook)
    │   └── *.ts                 # captions · hook-title · segments · broll-* · shot-* · filler-* · auto-zoom · color-grade · aspect-ratios · ffmpeg · python(+setup) · transcription · youtube · face-detection · ai-scoring · ai-usage · secrets · logger · ipc-error-handler
    │
    └── renderer/src/
        ├── App.tsx · main.tsx · SettingsWindow.tsx (separate BrowserWindow)
        ├── components/
        │   ├── screens/         # DropScreen · ProcessingScreen · ClipGrid · RenderScreen
        │   ├── ClipCard · ClipDetail · ErrorBoundary · ErrorLog · AiUsageIndicator · PythonSetupCard · TemplateEditor
        │   └── ui/              # shadcn — generate via `npx shadcn@latest add`
        ├── hooks/               # usePipeline (+ pipeline-stages/) · useAutosave · useKeyboardShortcuts · useFontLoader · useTheme · usePythonSetup
        ├── services/            # project-service · render-service · render-defaults
        ├── store/               # Zustand slices: clips · pipeline · project · settings(+sync) · history · errors · selectors (selectScreen)
        └── lib/                 # utils · progress-reporter
```

## Brand & Visual Ground Truth

Colors in `src/renderer/src/assets/index.css` as HSL CSS vars:

| Role       | Hex       | Token |
| ---------- | --------- | ----- |
| Background | `#23100c` | `--background` |
| Foreground | `#f6ecd9` | `--foreground` |
| Accent     | `#9f75ff` | `--accent` / `--primary` / `--ring` |

Dark only — no light palette, no theme toggle. Window background hard-coded to `#23100c` to prevent white flash on launch. Visual references in `.ezcoder/examples/` (captions JPGs, archetype MP4s).

## Captions — Three Modes (one builder: `src/main/captions.ts`)

| Mode                  | Font swap                                                | Color |
| --------------------- | -------------------------------------------------------- | ----- |
| `standard`            | Geist sans on every word                                 | `#f6ecd9` |
| `emphasis`            | Sans default; emphasis → Style Script display            | `#f6ecd9` |
| `emphasis_highlight`  | Same font swap as `emphasis`                             | Emphasis words → accent `#9f75ff` |

No animations, no box backgrounds, no per-word color cycling.

## Output Lock

Hard-locked to **720×1280 @ 30fps** via `OUTPUT_WIDTH/HEIGHT/FPS` in `src/main/aspect-ratios.ts`. `OutputAspectRatio = '9:16'`. One canvas, one safe zone, one ratio.

## Four-Screen Flow

Routed by `selectScreen(stage, hasActiveSource)` in `store/selectors.ts`:

| Screen       | Stages |
| ------------ | ------ |
| `drop`       | `idle` (or `error` w/o source) |
| `processing` | `downloading` · `transcribing` · `scoring` · `optimizing-loops` · `detecting-faces` · `ai-editing` · `segmenting` · `error` w/ source |
| `clips`      | `ready` — ClipGrid + ClipDetail |
| `render`     | `rendering` · `done` |

`App.tsx` wraps each in a single `ScreenFrame` (150 ms fade + 8px y-shift, keyed by stage). That is the **entire** animation budget. Settings opens in a separate BrowserWindow via `window.api.openSettingsWindow()`.

## Render Pipeline — Feature Lifecycle

`startBatchRender()` in `src/main/render/pipeline.ts` runs each `RenderFeature` through four phases (`features/feature.ts`):

1. **`prepare(job, batchOptions)`** — ASS captions, filler detection, B-roll fetch, hook/rehook overlays, segment styling. Returns `{ tempFiles, modified }`.
2. **`videoFilter(job, ctx)`** — contribute to base `-vf` chain. Order: filler-select → crop → scale → zoom.
3. **`overlayPass(job, ctx)`** — separate FFmpeg pass per overlay (avoids Windows filter-string escaping limits). Composited by `overlay-runner.ts`.
4. **`postProcess(job, renderedPath, ctx)`** — final pass (e.g. B-roll image overlays).

`segment-render.ts` first checks `remotion/registry.ts` for an archetype composition; if present, Remotion renders that segment as ProRes 4444 (alpha) and FFmpeg composites it. Otherwise falls back to pure FFmpeg.

Encoder preference: `h264_nvenc` → `h264_qsv` → `libx264` (`getEncoder()` in `ffmpeg.ts`). Per-clip errors are isolated. Active FFmpeg commands are tracked in `base-render.ts` so `cancelRender()` can SIGTERM them.

## Organization Rules

- **Main entry** `src/main/index.ts` is bootstrap only. **Never** add IPC handlers here.
- **IPC handlers** → `src/main/ipc/<domain>-handlers.ts` exporting `registerXxxHandlers()`. Wrap with `wrapHandler()` from `ipc-error-handler.ts`.
- **IPC channel names** → `src/shared/ipc-channels.ts` (`Ch` object). Never hard-code channel strings.
- **Preload** `src/preload/index.ts` exposes `window.api`; `index.d.ts` must stay in sync.
- **Render** features go in `src/main/render/features/*.feature.ts` implementing `RenderFeature`.
- **Remotion compositions** in `src/main/remotion/compositions/`, registered in `Root.tsx` + `registry.ts`. Use `staticFile()` against `resources/` for fonts.
- **AI modules** in `src/main/ai/` — always reuse `gemini-client.ts`.
- **Edit styles** in `src/main/edit-styles/`. PRESTYJ is the only registered style; templates live in `prestyj/templates/`. Do not add a multi-style picker.
- **Renderer state** in `src/renderer/src/store/` slices. `store.ts` is a re-export shim.
- **React components** one per file. Screens in `components/screens/`. shadcn in `components/ui/` (do not edit by hand).
- **Tests** co-located (`*.test.ts(x)`). Main tests use `src/main/test-setup.ts`.
- **Path aliases**: `@/` → `src/renderer/src/`, `@shared/` → `src/shared/`.

## Code Quality — Zero Tolerance

After editing ANY file:

```bash
npm run build      # electron-vite build — includes TS strict typecheck (main + preload + renderer)
npm test           # vitest main suite then renderer suite
```

Fix every error before continuing. No ESLint/Biome/Prettier is configured — **TypeScript strict mode is the quality gate.**

Other commands:

```bash
npm run dev           # hot-reload dev
npm run test:main     # main process tests only
npm run test:renderer # renderer tests only
npm run setup:python  # bootstrap python/venv
npx remotion preview  # Remotion composition preview
```

No `lint` or `typecheck` npm scripts exist; `npm run build` is the typecheck. No `.nvmrc` — use the Node version that built `better-sqlite3` and Electron 34 native modules cleanly.

## Python Environment

`python/` holds `transcribe.py` (NeMo Parakeet TDT v3 — words + segments), `face_detect.py` (MediaPipe → 9:16 crops), `download.py` (yt-dlp). All communicate via newline-delimited JSON on stdout:

```json
{ "type": "progress", "stage": "loading-model", "message": "..." }
{ "type": "done", "text": "...", "words": [...], "segments": [...] }
{ "type": "error", "message": "..." }
```

Electron bridge: `src/main/python.ts` (`resolvePythonPath` · `runPythonScript` · `isPythonAvailable`); first-run bootstrap in `python-setup.ts`. Availability checked at startup non-blocking (never gates window creation).

- NeMo install pulls CUDA wheels (~3–4 GB) regardless of GPU — CPU fallback works (slower).
- Parakeet model (~1.2 GB) downloads from HuggingFace on first transcribe and caches at `~/.cache/huggingface/`.
- Packaged builds copy `python/*.py` + `requirements.txt` to `resources/python/`. Windows maintains its own venv at `%APPDATA%/batchcontent/python-env/` (auto-installed on first launch).
- Timeouts: transcription 3h · download 2h · import check 30s.

## Error Handling

**Main:** `uncaughtException` → native dialog + clipboard copy + exit. `unhandledRejection` → log only. IPC errors flow through `wrapHandler()`. GPU encoder failures fall back to `libx264`. Logger: `src/main/logger.ts`.

**Renderer:** `ErrorBoundary` wraps the app. `ErrorLog` panel appears when `store.errorLog` is non-empty (collapsible, per-entry copy, Copy All, Clear). `addError({ source, message })` from `errors-slice.ts`. Recovery prompt checks for autosave 400ms after first paint. Sources: `pipeline · transcription · scoring · ffmpeg · youtube · face-detection · render`.

## Deploy to Windows Desktop (WSL2 only)

When the user says **"send it to my Windows machine"**, run the full sequence. Do not patch individual files — always replace the entire folder.

```bash
# 1. Build app code
npm run build

# 2. Pack a fresh app.asar
ASAR_STAGE=$(mktemp -d)
mkdir -p "$ASAR_STAGE/out/main" "$ASAR_STAGE/out/preload" "$ASAR_STAGE/out/renderer/assets"
cp out/main/*.js "$ASAR_STAGE/out/main/"
cp out/preload/index.js "$ASAR_STAGE/out/preload/"
cp out/renderer/index.html "$ASAR_STAGE/out/renderer/"
cp out/renderer/assets/* "$ASAR_STAGE/out/renderer/assets/"
cp package.json "$ASAR_STAGE/"
npx asar pack "$ASAR_STAGE" dist/win-unpacked/resources/app.asar
rm -rf "$ASAR_STAGE"

# 3. Update Python scripts (NOT the venv)
cp python/{download,face_detect,transcribe}.py python/requirements.txt \
   dist/win-unpacked/resources/python/

# 4. Replace the Windows folder
rm -rf "/mnt/c/Users/Groot/Desktop/BatchContent"
cp -r dist/win-unpacked "/mnt/c/Users/Groot/Desktop/BatchContent"
sync
```

Or use the helper: `npm run deploy` / `npm run deploy:fast` (`scripts/deploy-windows.sh`).

- `dist/win-unpacked/` is produced by `npm run build:win` (or `build:unpack`). One-time, slow.
- Never copy Linux/mac `python/venv/` to Windows — Windows installs its own at `%APPDATA%/batchcontent/python-env/`.
- WSL2 `cp -r` to `/mnt/c/` takes 30–60s for ~240 MB; use 180s timeout or `run_in_background`.
- Windows logs: `C:\Users\Groot\AppData\Roaming\batchcontent\logs\`
- Windows debug exports: `C:\Users\Groot\Downloads\batchcontent-debug-*.log`

## Environment

- Working directory: `/Users/groot/cliporous` (folder renamed; package name is still `batchclip`).
- Platform: macOS (darwin). Deploy target: Windows desktop via WSL2 path above.
- Node: no `.nvmrc` — use a version that builds `better-sqlite3` and Electron 34 cleanly.
