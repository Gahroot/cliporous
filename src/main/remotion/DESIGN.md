# Rendered editorial graphics

## Continuous source-bound storyboards (2026-10-02)

- **Production owner:** `StoryBoard` in `Root.tsx`, compiled by `ai/storyboards/compiler.ts`, reached through the existing long-form preview/export functions. Saved inputs are source specifications, never model-authored graphics code. `board-proof.ts`, the optional proof entry and private reference footage do not enter the production bundle.
- **Visual grammar:** one persistent left-to-right canvas with statement, comparison, process, notes, quantity and hero panels. Source-word reveals, authored line wrapping/geometry, bounded pans and final holds keep explanatory content on screen. Full-frame 1920×1080 at 30fps is fixed. A recap is optional: if scaling would put headings below 28px or other text below 18px, compilation returns a repair diagnostic rather than tiny text or silently missing facts.
- **Two material treatments:** `resolveStoryboardPalette(style, palette)` supplies all board text, paper, strokes, accents and clay roles. Ink stays light paper; Polish retains the selected palette's direction. Light custom palettes are not converted to dark stages. Existing ordinary-scene palette derivation is unchanged.
- **Resource contract:** 1–5 panels, at most 48 compiled 2D elements and six allowlisted props, plus mesh/world/camera limits. No canvas for 2D-only boards; one shared ThreeCanvas otherwise. Props are culled outside the camera; finished action clocks are frozen. One canvas does not imply constant memory with more models.
- **Rendering contract:** absolute beats are rebased once at the outward-rounded source segment start. Transparent ProRes 4444 board output is composited over contained source, not a solid substitute. Source audio is retained once; local bounded cues go through the existing SFX mixer. Failure produces an entire-interval source fallback in export, failed reconciliation, and a truthful preview error.
- **Fonts and assets:** bundled local faces have explicit delay/cancel/final-release handling. Seven verified model IDs reuse the authored hero/Clay/studio library; no downloaded graphics, arbitrary SVG/code or remote fonts are accepted.
- **Runtime evidence:** the pinned production bundle rendered both styles, all eight built-in palettes plus two custom edges, all enabled models, long labels, dense pan/overview samples, five-panel holds, mixed timelines, real failure/cancel paths and a bounded two-board stress export. Eighty-four stills, exact repeated-frame checks, alpha probes and source-audio/frame-count comparisons are recorded in [the verification report](../../../docs/plans/longform-storyboard-verification.md).
- **Measured limit:** on the tested Windows host, FFmpeg's hardware encoder failed and software fallback completed the proof. Peak sampled owned-process working set was about 1.32 GiB; settled owned descendants were zero. This is not a GPU-memory, cross-platform or long-session performance guarantee. No live planning-quality claim is made from authored fixtures.

The older sections below describe earlier graphics work; their evidence is not renewed by this entry.

## Scope and design read

These are video graphics, not application controls. The viewer needs to understand one fact during a short interruption of the speaker. Preserve existing palettes, bundled fonts, composition IDs, public props, caption behavior, and output dimensions. This pass targets the shared long-form block envelope, the default editorial skin, bar charts, and statistic heroes. Other skins retain their identities; existing uncommitted comparison/pipeline work is not edited.

## Evidence

Before stills: `.gg/edit-quality/before-bar.png` and `before-stat.png` (frame 60, 1920×1080 rendered at half scale). They show glowing bars, a rule below the category labels rather than at the bar baseline, clipped number glow, and oversized condensed typography.

Steroids corpus examples inspected (two implementations, not a claim about industry prevalence):
- `remotion-dev/github-unwrapped`, `remotion/EndScene/index.tsx`, commit `ece8397df97eb8e0578f8825058da2bf650b1f7d`: separately bounded frame-clock entrance and exit. Adapt the explicit timing principle, not its space-scene treatment or long timings.
- `anomalyco/opencode`, `artifacts/glm52-rise-video/src/novel.tsx`, commit `fee476bb90043a1012abda156dd9af9e5c71b19d`: clamped eased count-up, tabular figures, and static text hierarchy. Adapt these mechanics, not its brand, artwork, or metrics.

## Thesis

Calm editorial inserts: headline first, evidence second, qualifier third. Existing espresso/cream/violet stays; color is emphasis rather than illumination. Use Geist headings, mono context labels with tighter tracking, a true chart baseline, and solid bars. No ambient motion or number glow. Centered statistic typography belongs because one numerical claim is the subject; charts remain left-aligned for comparison.

## Implementation plan

1. Replace shared panel spring/scale with a short bounded rise, a long static reading hold, and opacity-only exit reaching zero on the last rendered frame. Compress timings for short inserts; tiny sequences remain visible rather than spending their entire duration fading.
2. Give the editorial skin a consistent type hierarchy without changing surface widths. Rebuild chart anatomy around a shared baseline; labels never move as bars grow. Fit count-up type to its final value so its size does not jump.
3. Add timing and component regression tests; render representative before/after stills and motion samples using actual registered compositions. Check other shared-skin callers and alternate skins for regressions.

## Motion and production contract

- All motion derives from Remotion's frame clock, never CSS transitions or wall time.
- Shared entrance: at most 0.4 seconds, 18px rise, no bounce or scale. Exit: at most 0.2 seconds, no spatial motion. Both shrink to leave a reading hold in short clips.
- Updated chart/stat reveals settle by the first 55% of the insert, with bounded stagger. Numeric geometry remains stable during counting; numeric value reaches the exact target.
- Preserve actual supplied content, prefixes, suffixes, precision, and trend direction. Fixtures are preview samples, not claims.
- No flashing, looping, or new imagery. Video output has no hover/focus/keyboard states; app accessibility and reduced-motion settings are unchanged. Exported graphics do not respond to a viewer's system motion preference. Full media accessibility depends on the surrounding video's captions, narration, and playback controls and is not certified by this pass.
- Use existing text fitting for long labels and test sparse/dense inputs. Check 1920×1080 output at half scale for readability. This does not redesign vertical caption layouts.

## Verification

Verified locally on macOS, 24 September 2026:

- `npm test`: 444 main/shared tests and 315 renderer tests passed (759 total). Added 17 timing tests and 6 real-component markup tests. Component tests substitute only the Remotion clock/config and font-loader gate; Chromium renders exercise actual fonts and compositions.
- `npm run typecheck` and `tsc -p tsconfig.remotion.json --noEmit`: passed.
- `npm run build`: passed, including the production Remotion browser bundle.
- Scoped Biome check: passed with four existing warning sites (index keys and decorative SVG in the pre-existing skin code). No suppressions added.
- Rendered 37 composition/skin combinations: all 23 editorial blocks plus chart/stat in the other seven skins. Reviewed `editorial-sheet.png` and `all-samples-sheet.png` for hierarchy, common rails, and clipping.
- Rendered four H.264 previews: chart and stat at 120 frames, plus both at 15 frames. Inspected six timeline stills per full preview. FFprobe confirmed the chart preview at 960×540, 30fps, 120 frames and the short stat at 960×540, 30fps, 15 frames. Preview scale is 0.5; production dimensions remain unchanged.
- Stress renders cover six bars, zero and tiny values, wrapped category labels, a signed decimal statistic, and a long qualifier. Review caught clipping of `$-123456.78`; revised the final-value font estimate for wider tabular figures and re-rendered it with all digits visible.
- Brand cream/espresso contrast: 15.57:1. Violet/espresso: 5.62:1. Checked the static reading hold, not transient fade frames. Arbitrary user palettes are not certified.

Rendered component review: hierarchy, composition, shared consistency, typography, surface restraint, and content preservation each 2/2 within the changed chart/stat scope after the clipping correction. Removed chart glow, number glow, and the editorial decorative background. Fixed-format videos have no responsive app breakpoints or control states to score; no claim is made about whole-app accessibility or every existing block's internal animation.

Limitations: no real source-video/AI-to-FFmpeg end-to-end export or Windows execution in this pass. Existing per-block animations outside chart/stat remain unchanged; the shared container envelope changes for all block callers. No benchmark was performed, so removing per-frame bar-height layout and shadows is a code-level reduction, not a measured speed claim.

Evidence and the repeatable local rendering harness are under ignored `.gg/edit-quality/`; no generated media is shipped. Existing uncommitted comparison, schema, render-pipeline, and packaging work was left untouched.
