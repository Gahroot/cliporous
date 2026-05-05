# E2E Smoke Validation

_2026-05-05T23:55:03.953Z_

**Result:** ✅ all checks passed

## Pipeline coverage

| Stage       | Outcome | Notes |
|-------------|---------|-------|
| Download    | SKIPPED | Local sample supplied: `/home/groot/batchcontent/sample_video/test_clip.mp4` |
| Transcribe  | ✅ parakeet | 187 word timestamps |
| Score       | ✅ stub | Gemini key not present in this env — used local deterministic picker matching the `ScoredSegment` shape. Picked 3 clips. |
| Approve     | ✅ | All 3 picks approved |
| Render      | ✅ | renderSegmentedClip × 3 (PRESTYJ) |
| Manifest    | ✅ | manifest.json + manifest.csv at `/home/groot/batchclip/.ezcoder/plans/e2e-output/manifest.json` |

## Render plan

| Clip | Range (s)         | Archetype          | Caption mode          | Hook |
|------|-------------------|--------------------|-----------------------|------|
| 1 | 2.7–8.7 | `talking-head` | `standard` | Claude keeps missing the mark, |
| 2 | 20.8–26.8 | `talking-head` | `emphasis` | look around, read the code, |
| 3 | 39.0–45.0 | `fullscreen-quote` | `emphasis_highlight` | like that. But I'll show |

## Per-clip verification

| Clip | Output | size | fps | cream #f6ecd9 | accent #9f75ff | brand-bg | OK |
|------|--------|------|-----|---------------|----------------|----------|----|
| clip_1 | `e2e_clip1_talking-head_standard.mp4` | 720×1280 | 30/1 | ✅ (closest #f6ecd6) | n/a (closest #000000) | n/a | ✅ |
| clip_2 | `e2e_clip2_talking-head_emphasis.mp4` | 720×1280 | 30/1 | ✅ (closest #f5edd8) | n/a (closest #000000) | n/a | ✅ |
| clip_3 | `e2e_clip3_fullscreen-quote_emphasis-highlight.mp4` | 720×1280 | 30/1 | ✅ (closest #f7ecd9) | ✅ (closest #9f75ff) | ✅ (closest #170703) | ✅ |

### Caption visual spec — three-mode coverage

References: `.ezcoder/examples/standard font no emphasis no highlight.jpg`, `standard font + emphasis.jpg`, `standard font + emphasis&highlight.jpg`.

- **standard** (clip 1): every word renders in PRESTYJ sans (Geist) at `#f6ecd9`. No font swap, no accent recolor. Verified by checking the caption band contains cream and contains *no* accent purple.
- **emphasis** (clip 2): emphasised words swap to PRESTYJ display font (Style Script) but stay cream `#f6ecd9`. Verified by cream presence; accent should still be *absent* in the caption band.
- **emphasis_highlight** (clip 3): emphasised words swap font *and* recolor to accent `#9f75ff`. Verified by both cream and accent presence in the caption band.

### Just-subtitles scene (clip 3, `fullscreen-quote`)

- Backdrop: `#23100c` brand bg (post-grade crush ≈ `#170703` — see archetype-verification.md). Verified by sampling the upper region of the frame.
- Caption text: `#f6ecd9` cream. Verified above.
- Accent: `#9f75ff` purple on emphasised words. Verified above.

## Manifest

- JSON: `/home/groot/batchclip/.ezcoder/plans/e2e-output/manifest.json`
- CSV:  `/home/groot/batchclip/.ezcoder/plans/e2e-output/manifest.csv`

Manifest contains 3 clip entries with `accentColor: #9f75ff`. ✅

## Findings & fixes applied this run

### Heuristic emphasis floor (`src/main/word-emphasis.ts`)

**Symptom.** On the first run, clip 3 (`fullscreen-quote` / `emphasis_highlight`) shipped with cream-only captions — visually identical to `standard` mode — because `analyzeEmphasisHeuristic` returned every word as `normal`. The transcript window had no power-words, no superlatives, no `?`/`!`, no numbers, and no ALL-CAPS, so the curated lookups never fired and `emphasisSet` stayed empty.

**Effect on the spec.** The visual spec requires that any highlighted word render in `#9f75ff`. With zero flagged words, no purple was ever emitted, and the V2 mode swap (font + accent recolor) had nothing to apply to. From the renderer’s perspective the output was correct — `buildAssLines` only recolors `isEmphasized` words — but the *system* failed the spec because the upstream emphasis selector had no fallback.

**Fix.** Added a Step 3.5 fallback in `analyzeEmphasisHeuristic`: when `supersizeSet` and `emphasisSet` are both empty after the curated rules, mark the longest non-stop word in the segment as `emphasis` (or, if every word is a stop word, the longest word overall). Guarantees ≥ 1 emphasised word per multi-word segment, which restores the contract that `emphasis_highlight` always shows accent.

**Confirmation.** Re-run → clip 3 caption frame at t=5.5s shows “understanding” in `#9f75ff` PRESTYJ display script on the brand-bg backdrop. Other archetypes also benefit (e.g. clip 2 `emphasis` mode now shows “actually” in cream Style Script at t=5.5s instead of all-Geist sans).

All 161 main-process tests still pass. The 2 pre-existing failures in `src/shared/ipc-channels.test.ts` are unrelated user-in-progress work and are not caused by this change.

## Reproducing this report

```
bash scripts/e2e-smoke/run.sh
```

Outputs: `.ezcoder/plans/e2e-output/` (rendered MP4s + manifest); `.ezcoder/plans/e2e-frames/` (sampled caption frames).
