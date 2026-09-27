# BatchClip (`batchclip`, dir `cliporous`)

Electron desktop app: long-form video → AI-scored short-form clips with burned-in captions. Hybrid render: FFmpeg (encode/crop/overlay/concat) + Remotion (alpha-channel compositions composited by FFmpeg). Primary path is 9:16 vertical; an additive 16:9 "longform" path also exists.

> Product naming is inconsistent across layers: package `batchclip` / appId `com.batchclip.app`, but window title and temp prefixes use `BatchContent`/`batchcontent-`, and the renderer wordmark reads "BatchClip". Don't "fix" this without checking.

## Stack

Electron 34 + electron-vite 5 + electron-builder 25 · React 19 + Radix/shadcn + Tailwind 3.4 + framer-motion · Zustand 5 (+ immer, sliced) · @google/genai (Gemini) · Remotion 4 (ProRes 4444 + alpha) · ffmpeg-static + @ffprobe-installer · better-sqlite3 · TypeScript 5.7 strict · Vitest 4 · Biome 2. npm (package-lock.json). **Node >= 22 required.**

Python sidecar (`python/`, set up via `npm run setup:python`): `transcribe.py` (NeMo Parakeet TDT v3 ASR), `face_detect.py` (PySceneDetect + MediaPipe → 9:16 crop timelines), `download.py` (yt-dlp). All emit newline-delimited JSON on stdout (`{type: progress|done|error}`). Bridge in `src/main/python.ts`; first-run bootstrap in `python-setup.ts`. Windows keeps its own venv at `%APPDATA%/batchcontent/python-env/` — never copy a mac/Linux `python/venv/` to Windows.

## Commands

```bash
npm run dev            # electron-vite hot-reload
npm run build          # electron-vite build (does NOT typecheck)
npm run typecheck      # tsc -b --noEmit
npm run check          # biome check (lint + format)
npm test               # vitest main config then renderer config (sequential)
npm run test:main      # main-process tests (node env)
npm run test:renderer  # renderer tests (jsdom)
npm run verify         # check + typecheck + test  (the full gate)
npm run setup:python   # bootstrap python/venv
npm run deploy         # scripts/deploy-windows.sh (replaces whole Windows folder; --fast --yes via deploy:fast)
npm run deploy:mac     # scripts/deploy-mac.sh
```

`npm run build` bundles but skips typing — run `typecheck` separately. Biome is the lint/format gate (`biome.json`). `tsc -b` builds the root solution, which references **only** `tsconfig.node.json` (main/preload/shared) + `tsconfig.web.json` (renderer) — `tsconfig.remotion.json` is standalone and NOT covered by `npm run typecheck`.

## Locked invariants

- **Output:** vertical hard-locked to **1080×1920 @ 30fps** (`OUTPUT_WIDTH/HEIGHT/FPS` in `src/main/aspect-ratios.ts`); only `'9:16'` is configured and `getCanvasDimensions` ignores its arg. Longform path uses `LANDSCAPE_* = 1920×1080 @ 30`.
- **Theme modes.** Light is the default persisted renderer theme with a warm canvas and white raised surfaces; dark is explicit and preserves the brand seeds: espresso `#23100c`, cream `#f6ecd9`, violet accent/primary/ring `#9f75ff`. `src/renderer/index.html` and the native window use the light default to avoid a launch flash; `useTheme.ts` applies the saved mode before React renders.
- **Captions — four modes, one builder** (`src/main/captions.ts`, emits ASS burned via libass): `standard` (white on all words), `emphasis` (emphasis words recolored to accent), `emphasis_highlight` (recolor + display-font swap), `editorial` (renderer default for new settings: `Instrument Serif` sentence case on its own `Editorial` ASS style, per-word timed events — a soft rounded `\p1` pill on layer 0 behind the spoken word, upcoming words dimmed to ~45%, emphasis words italic + accent; pill x-offsets come from embedded Instrument Serif advance widths). Fonts: `Inter` default, `Bebas Neue` display, `Instrument Serif` Regular+Italic; `fullscreen-quote` archetype overrides to italic `Instrument Serif` hero in every mode. Optional `layoutWindows` move the anchor (`stack` below the seam, `stack-flipped` above it, `takeover` at 78%, `pip` at 68% above the speaker window). Accent comes from the selected palette (`settings.longformPaletteId` — now drives short-form too); fallback `#9f75ff`. Many `CaptionStyleInput` fields are tolerated-but-ignored V1 back-compat.
- **Edit styles** (`src/main/edit-styles/`): `prestyj` is `DEFAULT_EDIT_STYLE_ID` and the only short-form (9:16) style; `hormozi` exists **only** for the 16:9 longform path. No multi-style picker for vertical.

## Architecture notes

- **Screen flow:** `selectScreen(stage, hasActiveSource)` in `store/selectors.ts` routes 4 screens (drop · processing · clips · render). `App.tsx` wraps each in one `ScreenFrame` (150ms fade + 8px shift) — that is the entire animation budget. Settings is a separate BrowserWindow (`window.api.openSettingsWindow()`).
- **Render pipeline** (`src/main/render/pipeline.ts`): per clip, each `RenderFeature` (`features/*.feature.ts`) runs `prepare → videoFilter → overlayPass → postProcess`. Registered order: `filler-removal, accent-color, word-emphasis, captions, hook-title, rehook, auto-zoom, broll, shot-transition, hyperframes-overlay`. `blocks` and `phrase-emphasis` features exist but are NOT registered (dead). `segment-render.ts` checks `remotion/registry.ts` first (renders ProRes+alpha, FFmpeg composites) else falls back to pure FFmpeg. Encoder pref `h264_nvenc → h264_qsv → libx264` (`getEncoder()` in `ffmpeg.ts`). Per-clip errors isolated; `cancelRender()` SIGTERMs tracked FFmpeg procs.
- **Explainer scenes** (v2): transcript-driven animated diagrams. Planner `src/main/ai/explainer-scenes.ts` (Gemini 3.8 Flash, word-indexed, second review pass, `explainer/variety.ts` rules) with one spec per kind in `src/main/ai/explainer/kinds-*.ts` (parse untrusted JSON → absolute beat times, layouts, SFX cues). 18 kinds (checklist, versus, stamp, flow, stack, statement, number, timeline, notes, question, before-after, chart, chat, network, loop, myth-fact, funnel, hero). Compositions in `src/main/remotion/compositions/explainer/`: every scene draws on a 1080×960 virtual stage; `SceneFrame` places it per layout (`stack`, `stack-flipped`, `takeover`, `pip`, `over`); chained scenes render as ONE `ExplainerSequence` via `@remotion/transitions`. Colours only via `useStage()` (palette derived in `palette.ts`); motion only frame-driven (`motion.tsx`, `Stage3D.tsx` — never clock-based drei helpers). Beat-time convention: fields named `at`/`…At` are seconds (see `types.ts`). Shorts: `render/explainer-scenes.ts` splices groups into segments (layouts composited in `layouts/segment-layouts.ts`); long-form: `render/explainer-longform.ts` (`over`/`takeover` only, speaker ranges only). Beat SFX: `render/scene-sfx.ts` + `resources/sfx/scene/` (CC0, low-passed, no bright/meme sounds), mixed post-concat. Dev note: segment captions need an FFmpeg with libass on PATH (Homebrew's default build lacks it; packaged builds use ffmpeg-static).
- **Hyperframes** (`src/main/hyperframes/`): animated HTML overlay widgets (`catalog/*.html` + `presets.json`) rendered and composited as a render feature.

## Conventions (project-specific overrides)

- `src/main/index.ts` is bootstrap only — **never** add IPC handlers there. Handlers live in `src/main/ipc/<domain>-handlers.ts` exporting `registerXxxHandlers()`, wrapped with `wrapHandler()` from `ipc-error-handler.ts`. Channel names only via the `Ch` object in `src/shared/ipc-channels.ts` — never hard-code strings. Keep `src/preload/index.ts` and `index.d.ts` in sync.
- AI modules in `src/main/ai/` must reuse `gemini-client.ts` (model chains in `MODELS`; Gemini 3 ignores sub-1.0 temperature — use `thinking` instead). Renderer state in `src/renderer/src/store/` slices (`store.ts` is a re-export shim). shadcn primitives in `components/ui/` are generated — don't hand-edit.
- Path aliases: `@/` → `src/renderer/src/` (renderer only), `@shared/` → `src/shared/`. Tests co-located `*.test.ts(x)`; main tests use `src/main/test-setup.ts`.
- Working dir is macOS; deploy target is Windows via WSL2. Windows logs: `%APPDATA%/batchcontent/logs/`.
