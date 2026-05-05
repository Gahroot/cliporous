# BatchClip — UX Spec

One app, four screens, one pipeline. The user drops a source, watches three stages run, triages a grid of vertical clips, then renders. Visual fidelity target: the PRESTYJ caption examples in `.ezcoder/examples/` (notably `standard font + emphasis.jpg`, `standard font + emphasis&highlight.jpg`, `full screen talking head.mp4`, and `split screen talking = b-roll.mp4`) — bold sans, word-level emphasis, optional highlight pill, accent color cycling per phrase.

---

## 1. DropScreen

**Purpose:** zero-friction entry. One field, one drop zone, one shortcut to past work.

- **Layout:** full-bleed, centered column, vertical rhythm only. No chrome, no sidebar.
- **Drop zone:** large dashed-border rounded rect, centered, ~60% viewport height. Idle copy: "Drop a video file or paste a URL". On drag-over: solid accent border + subtle scale (1.01) + tinted fill.
- **Combined input:** single text field beneath the drop zone. Auto-detects:
  - Starts with `http(s)://` or matches a known host (youtube, x, tiktok, vimeo) → URL mode, leading link icon.
  - Looks like a path (`/`, `~`, `C:\`, `file://`) or matches a video extension → file mode, leading file icon.
  - Ambiguous → neutral icon, defer to Enter (URL fetch first, fallback to file resolve).
  - Inline validation only after blur or Enter; never red-flag mid-typing.
- **Recent projects:** below input, max 5 rows, newest first. Each row: thumbnail (16:9, 64px tall), title, source host or filename, relative timestamp, ⋯ menu (Reveal, Remove). Clicking a row reopens the project at its last screen.
- **Import .batchclip:** ghost button, bottom-right of the column. Opens system file picker filtered to `.batchclip`.
- **Empty state:** when no recents, the row block is replaced by a single muted line: "Recent projects appear here."

---

## 2. ProcessingScreen

**Purpose:** answer "what is it doing and how long". Nothing else.

- **Layout:** centered column, `max-width: 640px`, vertically centered in viewport. No grid, no sidebar.
- **Header:** project title (truncated), source line beneath in muted text.
- **Stage timeline:** single vertical list of three rows, connected by a thin rail on the left. Stages are user-facing buckets:
  1. **Download** — maps to pipeline stages `downloading`.
  2. **Transcribe** — maps to `transcribing`.
  3. **Score** — maps to `scoring`, `optimizing-loops`, `detecting-faces`, `ai-editing`, `segmenting` (rolled up; sub-message shown as the row's secondary line).
- **Stage row contents:**
  - Status icon (left, on the rail): pending (hollow ring), active (animated ring), done (filled check), failed (filled ✕ in error tint).
  - Stage label (bold) + sub-message (muted, current `PipelineProgress.message`).
  - Determinate progress bar — full width of the row, 4px tall, accent fill. Indeterminate shimmer only if percent is unknown.
  - ETA on the right, monospace, `~Xm Ys` or `—` if unknown. Computed from rolling percent delta.
- **Cancel:** single ghost button, centered, beneath the timeline. Confirms via inline popover ("Cancel and discard progress?"). No other actions on this screen.
- **Failure:** failed row turns to error tint, Cancel button is replaced by **Retry stage** + **Start over**.

---

## 3. ClipGrid

**Purpose:** fast triage of generated vertical clips.

- **Layout:** masonry grid of 9:16 thumbnail cards.
  - `≥1440px → 4 cols`, `≥960px → 3 cols`, `<960px → 2 cols`. 16px gutter. Page padding 24px.
- **Top bar:** project title left; right side has filter chips (All / Approved / Rejected / Unreviewed), sort dropdown (Score ↓ default, Time ↑), and a primary **Render Approved (n)** button (disabled until n ≥ 1). Sticky.
- **Clip card:**
  - 9:16 thumbnail, rounded 12px, `object-cover`. Idle: poster frame at the hook timestamp.
  - **Hover / focus:** muted, looped playback of the clip itself, `playsinline`. Cursor: pointer. First frame swap is crossfaded 100ms to avoid flash.
  - **Score badge:** top-left, pill, 2-digit score (0–99). Color ramps from neutral → accent at ≥80.
  - **Hook overlay:** bottom of the card, gradient scrim, two lines max, ellipsized. Uses the same display weight as the PRESTYJ caption examples (heavy sans, tight tracking, white with subtle drop shadow).
  - **Approve / Reject pills:** bottom-right corner, two compact pills. Selected state is filled with accent (Approve) or muted-error (Reject); unselected is ghost. Keyboard: `A` / `R` while card is focused.
  - **State outline:** approved cards get a 2px accent ring; rejected cards drop to 50% opacity.
  - **Click (not on pills):** opens the **ClipDetail Sheet** (see §5).
- **Empty / loading:** skeleton cards in the same masonry shape, 6 placeholders.

---

## 4. RenderScreen

**Purpose:** render approved clips and get the user back to the folder.

- **Layout:** centered column, `max-width: 720px`.
- **Header:** "Render N clips" with total estimated duration. Primary **Render All** button (top-right). While rendering: button becomes **Pause**; a secondary **Cancel** appears.
- **Per-clip rows:** vertical list, one row per approved clip:
  - Left: 9:16 mini-thumb (40×72), title (hook text, single line), duration.
  - Center: progress bar (4px) + sub-status ("Encoding 1080×1920 · 32%" / "Queued" / "Done" / "Failed").
  - Right: percent monospace, then a per-row action — `Cancel` while active, `Retry` on failure, `Reveal` on done.
- **On full completion:** the per-row list collapses to a success summary card with two buttons:
  - **Open Folder** (primary) — reveals the output directory.
  - **Back to Clips** (ghost) — returns to ClipGrid with the same project loaded.
- **On partial failure:** summary card lists succeeded count + failed count, with **Retry Failed** + **Open Folder**.

---

## 5. ClipDetail Sheet (right-side overlay on ClipGrid)

Slides in from the right, 480px wide, full viewport height, scrim over the grid (grid stays mounted behind). Esc or scrim click closes. Arrow keys move between clips without closing.

- **Header:** clip title (hook text), score badge, close ✕.
- **Preview:** 9:16 player at top, with playhead scrubber. Plays unmuted by default inside the sheet.
- **Trim:** dual-handle range slider over the source waveform; numeric `start` / `end` in `mm:ss.cs` to the right of the slider; **Reset to auto** link.
- **Hook text:** single-line input, character counter, live-updates the overlay in the preview.
- **Captions mode:** dropdown with four options matching the PRESTYJ examples:
  1. *No captions*
  2. *Standard — no emphasis* (ref: `standard font no emphasis no highlight.jpg`)
  3. *Standard + emphasis* (ref: `standard font + emphasis.jpg`)
  4. *Standard + emphasis & highlight* (ref: `standard font + emphasis&highlight.jpg`)
  Selecting a mode swaps the preview captions live.
- **Accent color preview:** horizontal swatch row (6 presets cycling through the PRESTYJ palette) + custom hex field. Selected swatch shows a ring; preview captions and score badge re-tint immediately.
- **Regenerate:** secondary button, "Regenerate clip" — re-runs scoring/segmenting for this clip only with current trim+hook as hints. Shows inline spinner, disables footer until done.
- **Footer (sticky):** full-width split — **Reject** (ghost, left) / **Approve** (primary, right). Mirrors card pills; updates the grid in place.

---

## 6. State → Screen Routing

Driven by `pipeline.stage` (from `src/renderer/src/store/types.ts`). Single source of truth:

| `pipeline.stage`                                                                  | Screen            |
| --------------------------------------------------------------------------------- | ----------------- |
| `idle`                                                                            | DropScreen        |
| `downloading`, `transcribing`, `scoring`, `optimizing-loops`, `detecting-faces`, `ai-editing`, `segmenting` | ProcessingScreen  |
| `ready`                                                                           | ClipGrid          |
| `rendering`                                                                       | RenderScreen      |
| `done`                                                                            | RenderScreen (success summary) |
| `error`                                                                           | Stays on the screen that owns the failed stage; inline error block. ProcessingScreen for pipeline failures, RenderScreen for render failures. |

Additional rules:
- ClipDetail Sheet is **not** a screen — it overlays ClipGrid only and never changes `pipeline.stage`.
- Opening a recent project jumps to the screen its persisted stage maps to.
- Manual navigation: from ClipGrid the user can re-enter RenderScreen via **Render Approved**; from RenderScreen success the user can return to ClipGrid via **Back to Clips**. No back-stack beyond that.

---

## 7. Screen Transition

A single global transition between screens:

- **Duration:** 150ms.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` (standard ease-out).
- **Properties:** `opacity 0 → 1` and `translateY 8px → 0` on enter; reverse on exit. Exit and enter overlap (crossfade), total wall time stays 150ms.
- **Reduced motion:** if `prefers-reduced-motion: reduce`, opacity only, no translate.
- **Scope:** applies only to top-level screen swaps. Stage rows, card hovers, and the ClipDetail sheet have their own micro-motions and are unaffected.

---

## 8. Visual Fidelity Notes (PRESTYJ reference)

- Captions: heavy sans (Inter Black / similar), tight tracking, white fill, subtle dark shadow. Word-level emphasis scales the active word ~1.08 and tints it the project accent. Highlight mode adds a rounded pill behind the active word in the accent color with white text.
- Layouts to support in preview/render: full-screen talking head, full-screen b-roll with subtitles, split-screen talking + b-roll, intro card. These are caption/layout *modes* in render config — not separate screens.
- Accent color drives: score badge ≥80, approved ring, active stage rail, primary buttons, caption emphasis/highlight. One accent per project.
