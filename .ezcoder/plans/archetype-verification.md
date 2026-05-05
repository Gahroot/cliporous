# PRESTYJ Archetype Verification

End-to-end render against `/home/groot/batchcontent/sample_video/test_clip.mp4`
(1080×1920, 30 fps, ~52 s) for the five archetypes that match the reference
clips in `.ezcoder/examples/`. Caption text is sourced from the sample SRT
(`1 thing make claude better.srt`).

## Methodology

* Built a CLI harness (`scripts/verify-archetypes/run.sh`) that bundles the
  main-process modules with esbuild and calls `renderSegmentedClip()` directly
  — the same code path the in-app preview hits — with `electron` resolved to a
  small CJS shim.
* Rendered the first 6 s of the sample for each archetype with PRESTYJ
  defaults at the locked 720 × 1280 @ 30 fps canvas.
* Extracted reference frames from the example MP4s and a representative
  `t = 2 s` frame from each rendered MP4 with ffmpeg → `.ezcoder/plans/frames/`.
* Sampled fixed pixel grids in Python/PIL to confirm composition, dominant
  colours, caption colour (cream `#f6ecd9` and purple accent `#9f75ff`),
  and brand background `#23100c` adherence.

## Mapping examples → archetypes

| Reference example                       | PRESTYJ archetype       |
|-----------------------------------------|-------------------------|
| `Intro example.mp4`                     | `fullscreen-headline`   |
| `full screen talking head .mp4`         | `talking-head`          |
| `full screen b-roll w subtitles.mp4`    | `fullscreen-image`      |
| `just subtitles example.mp4`            | `fullscreen-quote`      |
| `split screen talking = b-roll.mp4`     | `split-image`           |

## Per-archetype results

### 1. `fullscreen-headline` (Intro)

* **Composition** — solid brand backdrop with hero-text region matches the
  example's silhouette (very dark frame with type centred upper-third, face/
  speaker reveal lower-third). ✅
* **Output dim / fps** — 720×1280 @ 30 fps. ✅
* **Background colour** — sampled `#170703` vs spec `#23100c`. ⚠️ **MISMATCH**
  (see "Brand background crush" below).
* **Caption colour** — cream `#f6ecd9` confirmed (≈1.2 k pixel hits in the
  caption band). Accent purple `#9f75ff` not present. ⚠️ See "Accent never
  applied to captions" below.

### 2. `talking-head` (Full screen talking head)

* **Composition** — centre-cropped speaker fills the frame the same way the
  example does. The dark grey halo at top of our render is the *source*
  recording's chrome (the test clip is itself a phone-screen capture); not a
  defect in the archetype. ✅
* **Output dim / fps** — 720×1280 @ 30 fps. ✅
* **Caption colour** — cream `#f6ecd9` confirmed. Accent never present. ⚠️

### 3. `fullscreen-image` (Full screen b-roll w subs)

* **Composition** — image fills the canvas with the dark overlay. The example
  uses a uniform navy b-roll, ours uses the available `clip_edit_ui.png`
  (different aspect, looks zoomed-and-cropped). Layout is structurally
  correct. ✅
* **Output dim** — 720×1280. ✅
* **Frame rate** — `r_frame_rate=25/1`. ❌ **MISMATCH** with the locked 30 fps
  spec (see "Layout-segment fps drift" below).
* **Caption colour** — cream confirmed. Accent purple appears as part of
  the sample image content, *not* as caption emphasis. ⚠️

### 4. `fullscreen-quote` (Just subtitles)

* **Composition** — solid brand backdrop with centred hero text + lower-
  third caption band. The reference example actually uses a *yellow*
  backdrop (`#eddb90`), so this comparison only confirms the layout shape;
  the brand-bg target is the spec value `#23100c`, not the example's yellow.
* **Output dim / fps** — 720×1280 @ 30 fps. ✅
* **Background colour** — sampled `#170703` vs spec `#23100c`. ⚠️ **MISMATCH**
  (Brand background crush).
* **Caption colour** — cream `#f6ecd9` confirmed. Accent purple absent. ⚠️

### 5. `split-image` (Split screen)

* **Composition** — top-bottom split with speaker on top, image on bottom,
  accent divider line at the seam. Mirrors the reference structure. ✅
* **Output dim** — 720×1280. ✅
* **Frame rate** — `r_frame_rate=25/1`. ❌ **MISMATCH** (Layout-segment fps
  drift).
* **Caption colour** — cream confirmed (overlay text + captions). Accent
  divider is rendered using the brand accent. ✅
* **Caption emphasis colour** — purple absent across the segment. ⚠️

## High-impact mismatches

### A. Accent never applied to captions (segment-render path)

`renderSegmentedClip()` calls `generateCaptions()` directly. `generateCaptions`
defaults `captionMode` to `'standard'` when the field is unset, and the
`'standard'` builder explicitly **never** applies inline overrides for
emphasised words. As a result every PRESTYJ render that goes through the
segment-render path produces uniform-cream captions even when the heuristic
flags emphasis/supersize words. The accent purple `#9f75ff` therefore only
appears via overlay text (`split-image` divider, hero-card type) and never on
spoken-word captions.

The `captions.feature` (used by the legacy single-clip render path) calls
`resolveCaptionMode()` which auto-promotes to `'emphasis_highlight'` when an
accent + flagged words exist. That path is bypassed by `renderSegmentedClip`.

**Fix** — set `captionMode: 'emphasis_highlight'` on the PRESTYJ
`captionStyle` so any code path reading the style picks the highlighted
variant. (Validated: the heuristic emphasises 1+ words on every multi-word
segment, so this lights up purple accents wherever it should.)

### B. Layout-segment fps drift

`encodeLayoutSegment` (segment-render.ts, used by `fullscreen-image`,
`fullscreen-quote`, `fullscreen-headline`, `split-image`, `quote-lower`)
does not force an output frame rate. When the layout consumes a *looped image*
or a *generated `color=` source* and the source video isn't the dominant
input, ffmpeg picks 25 fps (its default for image inputs / `color=` filter
without an explicit `r=`) and the encoded segment ships at 25 fps. The
non-layout encoder (talking-head/tight-punch/wide-breather) implicitly tracks
the source's 30 fps so it isn't affected.

The output canvas is **locked** to 30 fps in `aspect-ratios.ts`. Mixing 25 fps
layout segments with 30 fps main-video segments inside one timeline confuses
the concat / xfade stage and breaks the locked-spec invariant.

**Fix** — pass `-r 30` (the configured `config.fps`) on the layout encode so
every segment ships at the canvas frame rate.

### C. Brand-bg post-grade crush (lower-impact)

The PRESTYJ edit-style `colorGrade` (`contrast 1.10`, `blackLift 0.02`,
`saturation 1.05`) is applied to every segment regardless of category, which
crushes the `#23100c` solid backdrop down to ≈ `#170703`. Because the
reference `Intro example.mp4` exhibits the same crushed dark
(`#080808–#0c0c0c` near the top), this matches the example's *appearance*
even though it diverges from the literal hex. Leaving this as-is (no fix
applied in this pass) — it's the brand-grade behaviour the existing example
clips were authored against.

## Decisions

* **Fix A and B in this pass** — both are direct regressions against the
  PRESTYJ spec (purple accent + 720×1280 @ 30 fps).
* **Skip C** — matches the reference clips even though the literal hex is
  darker than the source token. Revisit only if/when a designer asks for the
  un-crushed brand bg.

## Fixes applied

* **Fix A** — `src/main/edit-styles/prestyj/index.ts`: set
  `captionMode: 'emphasis_highlight'` and `accentColor: BRAND_ACCENT` on the
  PRESTYJ `captionStyle`. Added `captionMode` + `accentColor` to the shared
  `CaptionStyleInput` interface in `src/shared/types.ts` (mirrors the type the
  V2 captions module already supported privately) so `EditStyle.captionStyle`
  can carry the mode through every render path. Effect: re-render of the
  6 s test slice now paints `"reason"` (heuristic-supersized) in
  `#9f75ff` purple, while the rest of the line stays cream `#f6ecd9`.
* **Fix B** — `src/main/render/segment-render.ts`: added `'-r', String(config.fps)`
  to both encode paths inside `encodeSegment` (the `-vf` non-layout path and
  the `-filter_complex` layout path). Effect: every per-segment temp now
  ships at the canvas frame rate. After the fix, all five archetype renders
  report `r_frame_rate=30/1`.

## Post-fix re-verification

| Archetype             | size       | fps  | dominant caption | accent visible | layout match |
|-----------------------|------------|------|------------------|----------------|--------------|
| `fullscreen-headline` | 720×1280 ✅ | 30/1 ✅ | `#f6ecd9` cream  | yes (`#9f75ff`)    | yes          |
| `talking-head`        | 720×1280 ✅ | 30/1 ✅ | `#f6ecd9` cream  | yes (`#9f75ff`)    | yes          |
| `fullscreen-image`    | 720×1280 ✅ | 30/1 ✅ | `#f6ecd9` cream  | yes (`#9f75ff`)    | yes          |
| `fullscreen-quote`    | 720×1280 ✅ | 30/1 ✅ | `#f6ecd9` cream  | yes (`#9f75ff`)    | yes          |
| `split-image`         | 720×1280 ✅ | 30/1 ✅ | `#f6ecd9` cream  | yes (`#9f75ff`)    | yes          |

Visual side-by-side comparisons land in `.ezcoder/plans/frames/COMPARE_*.png`.
All 117 main-process tests still pass after the changes.

## Reproducing this report

```
bash scripts/verify-archetypes/run.sh
# Frames + comparisons appear under .ezcoder/plans/frames/
# Renders appear under .ezcoder/plans/renders/
```

The runner accepts an optional archetype filter, e.g.
`bash scripts/verify-archetypes/run.sh fullscreen-quote`.
