# BatchClip

Electron desktop app: long-form video → AI-scored 9:16 vertical clips with PRESTYJ-style captions. Hybrid render pipeline: Remotion (alpha-channel compositions) + FFmpeg (encode, overlay, concat).

For architecture, conventions, and deploy details see [`CLAUDE.md`](./CLAUDE.md).

## Stack

- Electron 34 + electron-vite 5 + electron-builder 25
- React 19 + Radix/shadcn + Tailwind 3.4
- Zustand 5 (+ immer) for state
- `@google/genai` (Gemini) for scoring, edit plans, descriptions
- `ffmpeg-static` + `@ffprobe-installer` + Remotion 4
- `better-sqlite3` for local persistence
- Python sidecar (yt-dlp, NeMo Parakeet ASR, MediaPipe) — scripts in `python/`

## Prerequisites

- **Node.js** matching the version in [`.nvmrc`](./.nvmrc) (currently `24`). Required to build the Electron 34 / `better-sqlite3` native modules cleanly.
- **Python 3** with `venv`. The first-run bootstrap (`npm run setup:python`) creates `python/venv/` and installs `python/requirements.txt`.
- **macOS or Linux** for development. Windows builds are produced via `npm run build:win` on macOS/Linux and deployed via WSL2 — see [`CLAUDE.md`](./CLAUDE.md#deploy-to-windows-desktop-wsl2-only).

## Install

```bash
nvm use            # or: nvm install
npm install        # postinstall runs electron-builder install-app-deps
npm run setup:python
```

## Run

```bash
npm run dev        # hot-reload Electron dev
```

## Verify

```bash
npm run build      # electron-vite build — TypeScript strict typecheck (main + preload + renderer)
npm test           # vitest: main suite then renderer suite
npm run lint       # biome lint
npm run format     # biome format --write
npm run typecheck  # tsc --noEmit across all tsconfigs
```

No ESLint/Prettier — **Biome** is the formatter + linter and **TypeScript strict mode** is the quality gate.

## Build & deploy

```bash
npm run build:mac        # .dmg
npm run build:win        # .exe (nsis)
npm run build:linux      # .AppImage
npm run deploy           # WSL2 → Windows desktop (see CLAUDE.md)
npm run deploy:mac
```

## License

MIT — see [`LICENSE`](./LICENSE).
