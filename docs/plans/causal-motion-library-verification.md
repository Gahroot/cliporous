# Causal motion library: completion and verification

**Completed locally, 2026-09-30 (UTC).** All 54 planned deliverables have executed critical-frame evidence. The 108-case motion matrix, 195-case systems matrix, 34 existing-scene controls and portrait/landscape pipeline smoke passed. Strict pixel equality is scoped to the recorded verification-only raster configuration, not production GPUs.

Scope: `.ezcoder/plans/causal-motion-library.md`, including the approved 29 September 2026 addition that moving objects must fit their scene (rail vehicles on tracks, parcels on belts, recognizable loads and parts rather than anonymous cubes).

This records implementation and measured evidence, not a release or a claim of cross-GPU determinism. No dependency installations, paid model requests, external assets, commits, or deployment are part of this work.

## Starting baseline (historical)

The working tree already contained the first 14 implementation steps. Those changes were preserved.

- `npm run build`: passed before this completion pass; included the Remotion browser bundle.
- Standalone Remotion TypeScript check: passed.
- Initial `npm run verify`: stopped at seven formatting/import-order errors in the rail/switchyard work. These were corrected without suppressions; the final gate passed.
- Existing-prop and timing checks are recorded below. Current-build controls are not a complete pristine pre-change pixel baseline.

## Integration decisions

- Keep the existing palette, clay materials, output dimensions and 30 fps timelines.
- Causal scene windows may snap **outward**, never inward: a regression reproduced a 14.0-second setup being cut to 14.3 seconds and the final hold being cut short. A targeted regression now protects both while preserving legacy scene snapping.
- New scenes have bounded authored arrangements and typed, word-locked phases. AI cannot select arbitrary rig connections, geometry, markup, camera paths or external assets.
- Optional editorial treatment errors are fail-soft: omit the treatment, retain the underlying scene, and return useful review diagnostics.
- Use semantic geometry, not a blanket ban on box primitives: carts/trains on rails, taped parcels on conveyors, recognizable relay inputs and outputs. Arch stones, housings and puzzle blocks remain legitimate block-shaped parts.
- Causal hero wrappers do not add ambient turns, float, drift or emphasis after an authored action. The calculator visibly sequences `1 + 1 = 2`, with timing/result/palette regression tests.
- Exploded-view magnification uses the same camera/canvas, not a second WebGL renderer. The relay key remains legible and focus-isolation shading respects floating-card corners.

## Final checks

| Check | Observed result |
| --- | --- |
| `npm run verify` | Passed. Biome checked 749 files with 118 warnings, no errors; main/preload and renderer TypeScript passed; main tests: 2,039 passed, 5 existing opt-in tests skipped; renderer: 333 passed. |
| Standalone Remotion TypeScript | `tsc -p tsconfig.remotion.json --noEmit` passed. |
| Harness tests | `node --test scripts/explainer-stills/*.test.mjs`: 39 passed, none skipped. |
| Production build | `npm run build` passed before rendering; includes the Remotion bundle. |
| Deliverable coverage | `coverage.mjs --complete` passed: 54/54 declared targets have every required case/frame, with artifact dimensions and SHA256 rechecked; no missing targets or rejected reports. |

Coverage comprises **28 props, 10 treatments, 10 causal scene kinds and six relay presets** (five pair relationships plus the idea/process/result chain). Parser/source-grounding, optional-treatment recovery, scene dispatch, absolute-time mapping, captions and outward-only causal timing are covered by the passing source tests. No paid planner calls were made.

### Render evidence

Environment: macOS arm64, Apple M1 Pro, Node v24.19.0, Remotion 4.0.496. All three matrices used ANGLE with `--software-raster` (`--disable-gpu-rasterization`). The production renderer defaults were not changed.

Bundle SHA256: `c55a3786f1457fee2d58435f5f00d99c399c3bf58549a525d058761198e6320a`. Renderer configuration SHA256: `e8f962c197072a5bc9189990b9d307b95134dae4760ff7868febba7f405b3650`.

| Measurement | Props/treatments | Composed systems | Existing-scene controls |
| --- | --- | --- | --- |
| Cases | 108 | 195 | 34 |
| Planned critical frames | 1,417 | 3,499 | 318 |
| Serial/shuffled/parallel PNGs rendered | 4,251 | 10,497 | 954 |
| Strict byte-equality checks | 108/108 passed | 195/195 passed | 34/34 passed |
| ProRes 4444 media rendered and decoded | 108 candidate + 71 control windows, 12 frames each | 195 candidate + 15 control complete clips | Not requested (`--no-media`) |
| Total rendered frames, including media/probes | 6,401 | 47,301 | 954 |
| Matched cost comparisons | 108/108 | 195/195 | Not requested |
| Wall time | 38m 14s | 2h 16m 54s | 7m 27s |
| Peak sampled RSS | 1.62 GB | 1.97 GB | 1.30 GB |
| Errors / browser closure | 0 / confirmed | 0 / confirmed | 0 / confirmed |

The motion run also passed invalid-frame rejection, injected browser error, live cancellation and recovery checks (109 checks including the lifecycle group). Media checks probed codecs, dimensions, frame counts, full decode and sampled alpha; transparent layouts required both visible and transparent pixels. Opaque stage layouts are intentionally opaque.

Cost comparisons used matched renderer flags, process/device, dimensions, palette, codec, frame count and concurrency. Candidate/control ratios were 0.744–1.044 (median 0.931) for motion windows and 0.771–0.960 (median 0.840) for systems clips. These are measured relative costs, **not** a render-budget approval or a production throughput guarantee. RSS is the once-per-second sum of Node and descendants; shared pages can be counted twice, and GPU memory/draw calls were not instrumented.

### Production-path smoke

`verify-systems-e2e.mjs` passed using synthetic video and transcript fixtures, software `libx264` encoding and `swangle` for this smoke only:

- Rendered 14.57-second final H.264 clips at **1080×1920 and 1920×1080, both 30 fps** (about 97s and 92s per pipeline).
- Exercised chained scenes, transitions, layout compositing, caption burn-in and six beat-SFX placements per output. Caption checks found 13,371 portrait and 2,588 landscape changed pixels; mixed-audio RMS was 0.006314 versus the quiet control's 0.0001765.
- The landscape alpha sample contained 1,557,797 transparent and 328,611 visible pixels. Setup/contact/final and transition-seam PNGs were retained; portrait and landscape contact images were inspected.
- Asserted absolute beat preservation, rejection across source gaps and speaker-range-only longform placement. Missing-composition rejection, in-flight Remotion cancellation, child progress/cancellation/missing-input closure and final browser closure passed; the runner recorded owned-process-group cleanup.

This is the real rendering/compositing path with synthetic inputs, not a full Electron UI session or an app-level `cancelRender()` test. The worker-only Vitest branch is mode-gated in the outer smoke; the landscape compositor runs through its separate worker. The log includes a non-fatal Remotion `Target.closeTarget` warning; the lifecycle assertions and runner report still passed.

### Visual and semantic inspection

Representative contact sheets were inspected for props, treatments, mechanisms and relay presets. Additional still batches covered assembly/routing, bottleneck/momentum, leverage/feedback, resource leaks, synchronization and relay systems. Inspection included semantic rail vehicles and belt cargo, calculator arithmetic, readable mechanism labels, relay handoffs and floating-card clipping. This is sampled frame review, not perceptual approval of every frame or audio playback.

## Evidence locations

Artifacts are local temporary files, not committed assets; the OS may remove them. On this machine `$TMPDIR` was `/var/folders/4x/5bswsdrs5jx8fjx_qp31qrn40000gn/T/`.

| Evidence | Path beneath `$TMPDIR` |
| --- | --- |
| Full motion matrix | `batchclip-motion-check-t3sjAR/report.json` |
| Full systems matrix | `batchclip-systems-check-1bQf4k/report.json` |
| Existing-scene controls | `batchclip-motion-check-fa8nDW/report.json` |
| Revalidated 54-target coverage | `batchclip-coverage-zPfaSH/report.json` |
| Pipeline smoke and lifecycle | `explainer-systems-e2e-86P81U/report.json`, `runner-report.json` |
| Final clips and sampled PNGs | `explainer-systems-e2e-86P81U/{portrait,landscape}/` |

Build/render command log: `~/.ezcoder/bg/c1827bf2.log`. Combined source/type/harness gate (exit 0): `~/.ezcoder/bg/8109bb1c.log`.

Subsequent bounded checks also exited 0 with source unchanged: `npm test` (same 2,039 main + 333 renderer passes, five existing opt-in skips), `npm run typecheck`, standalone Remotion `tsc --noEmit`, and all 39 harness tests. The bounded test log is `~/.ezcoder/tool-output/2026-09-30/bash-2d95304238bf.txt`.

Temporary diagnostic helpers were checked separately: `shellcheck` passed for `.ezcoder/tmp/causal-chrome.sh`; `node --check` passed for the three `.mjs` helpers. The wrapper/shadow probe then rendered eight byte-identical shield frames to `$TMPDIR/causal-shadow-probe-QZAkDQ/`; `png-diff.mjs` reported zero changed pixels between frames 0 and 7. The review-sheet helper produced three calculator sheets in `$TMPDIR/causal-review-sheets-DxZJFu/`, and the compact-layout sheet was inspected. These are local diagnostic checks, not extra production coverage.

## Reproduction

Use the already installed local prerequisites; these commands do not install or download them. Rendering is opt-in and resource-intensive. Each run writes a fresh temporary directory.

```bash
npm run verify
./node_modules/.bin/tsc -p tsconfig.remotion.json --noEmit
node --test scripts/explainer-stills/*.test.mjs
npm run build

node scripts/explainer-stills/verify-motion.mjs \
  --fixture editorial.json --fixture props-kinetic.json \
  --fixture props-transport.json --fixture props-optics.json \
  --fixture props-structures.json --fixture props-commerce.json \
  --fixture props-storage.json --fixture props-media.json \
  --fixture props-tools.json --software-raster --probe-cleanup
node scripts/explainer-stills/verify-systems.mjs --all --software-raster
node scripts/explainer-stills/verify-systems-e2e.mjs
node scripts/explainer-stills/verify-motion.mjs --controls --no-media --software-raster

# Recheck this run's actual PNGs; use the newly printed report paths after a rerun.
node scripts/explainer-stills/coverage.mjs --complete --bundle out/remotion \
  --report "$TMPDIR/batchclip-motion-check-t3sjAR/report.json" \
  --report "$TMPDIR/batchclip-systems-check-1bQf4k/report.json"
```

## Remaining limits

- **No cross-GPU or native-raster determinism claim.** Native Chromium GPU raster showed edge-pixel variability during investigation. Strict equality was retained; the software-raster override is verification-only. Windows/GPU-specific behavior was not exercised, and the process-group E2E runner is POSIX-only.
- Seek tests use fresh Remotion pages within one browser, not repeated seeks in a persistent React instance. Critical-frame coverage is finite, not proof of every unsampled pose, arbitrary transcript, label or layout combination. Motion media used 12-frame windows; the systems matrix used complete clips.
- Existing controls prove current-build rendering and local repeatability, not a complete before/after pixel comparison against a pristine pre-implementation build. Changes to the source or bundle require new evidence.
- Five existing opt-in FFmpeg tests in `segment-layouts.ffmpeg.test.ts` were not run by the default suite. The dedicated native pipeline smoke above did run. Biome warnings, React test `act(...)` warnings and dependency deprecation warnings remain; no assertions or security controls were weakened to hide them.
- No paid-model evaluation, universal semantic-fit guarantee, listening review, Windows deployment or full-app cancellation/soak test was performed. The changed surface is rendered video, not application controls; keyboard/focus behavior is unchanged. Sampled label/contrast/motion/safe-region checks do not certify accessibility.
- Parser allowlists and transcript grounding are engineering controls, not security certification or legal advice. Illustrations must not invent claims, signed amounts, certifications, measurements or branded anatomy; product-wide legal/privacy review and release certification remain outside this change.
