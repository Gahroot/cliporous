# Clay explanation vision: execution evidence

Date: 2026-09-30. Status: all 18 kinds / 42 presets implemented; pinned full-motion and mixed production exports passed. Final text-stress, resource-accounting and strict seek evidence is being reconciled below.

## Preserved baseline

The user explicitly authorized building on the existing uncommitted animation changes. No baseline work was discarded, stashed, reset, or committed. Six pack workers own new, disjoint paths; the coordinator owns shared registration and verification.

### Baseline commands actually run

- `npm run check`: failed before implementation. The baseline log reports 722 errors and 118 warnings across existing files. No repository-wide formatting was applied.
- `npm run typecheck`: passed before implementation.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.remotion.json`: passed before implementation.
- `npm test`: the main suite reported 3,245 passed, 3 failed, 5 skipped; its nonzero exit prevented the chained renderer command. Existing failures were two Windows-path assertions in `promo/brand-pack-loader.test.ts` and one `mechanisms/keystone-poses.test.ts` clearance assertion.
- `node --test scripts/explainer-stills/*.test.mjs`: 83 tests passed, zero failed before implementation.
- A separate `npm run test:renderer` baseline reported 324 passed and 9 failures across six files (timeouts plus DOM cleanup fallout), before new scene views were integrated. These failures are not being silently rewritten as part of this animation feature.
- `npm run build`: passed before new scene integration and produced `out/remotion`.

Baseline command logs: `C:/Users/Groot/.ezcoder/bg/5be34de3.log` and `C:/Users/Groot/.ezcoder/bg/ef448112.log`. The second shell command ended with the successful build, not a successful renderer test; results above retain each check's own status.

### Local rendering prerequisites actually checked

`openLocalBrowser()` launched and closed the installed Remotion headless Chrome successfully. The renderer reported Windows ANGLE, no software-raster override, and the installed executable below `node_modules/.remotion/chrome-headless-shell/win64/`.

No browser download, dependency installation, paid model request, or remote asset fetch was requested.

### Baseline visual anchors actually rendered

Existing build, before new views:

- Regression controls: `C:/Users/Groot/AppData/Local/Temp/explainer-stills-jKJud5/report.json`.
- Agent-team miniature: `C:/Users/Groot/AppData/Local/Temp/explainer-stills-zkhh5y/report.json`.
- House cutaway: `C:/Users/Groot/AppData/Local/Temp/explainer-stills-FgJtYm/report.json`.

The agent-team contact sheet was inspected: existing warm stage, white rounded semantic models, violet accents, soft contact shadows, reserved title/subject/actor/outcome rails. New scenes must reuse these actual material/stage owners rather than reimplementing the look.

## Implemented scope

Six independent pack workers added the scene contracts, parsers, bounded poses, semantic models, views, tests and source fixtures. Shared integration preserves the existing registrations and authored-scene timing protections.

| Pack | Kinds | Presets |
|---|---:|---:|
| Information and organization | 3 | 7 |
| AI selection and processing | 3 | 6 |
| Business operations | 3 | 8 |
| Populations and business state | 3 | 8 |
| Perspective and alternatives | 3 | 6 |
| Collective and adaptive systems | 3 | 7 |
| **Total** | **18** | **42** |

`src/main/render/concept-library.test.ts` passes all 42 real fixture payloads through the production parser, shortlist, source/scene parity checks, time rebasing, vertical splice, landscape speaker containment and cue preservation. `causal-integration.test.ts` now derives representative concept scenes from real parsed fixtures; its exact registry assertion was retained rather than weakened.

### Test and build results

- `npm run typecheck`, standalone `tsconfig.remotion.json`, and `npm run build`: passed after the label corrections. Log: `C:/Users/Groot/.ezcoder/bg/76756347.log`.
- Scoped Biome: **84 relevant files passed**. The dirty baseline was not globally reformatted.
- Affected Vitest gate: **1,236 tests passed across 24 files**, including all six packs, mesh accounting, label regressions, the 42-preset integration test, preserved causal registry equality and the shortlist eval. `shortlist.test.ts` now includes one source example for every new kind without widening its menus.
- Full main suite after the corrections: **4,283 passed, 2 failed, 5 pending**. The two failures are the existing Windows-path expectations in `promo/brand-pack-loader.test.ts`. Report: `$TEMP/concept-final-main-tests-3.json`.
- Full renderer suite: **332 passed, 1 failed**. The remaining failure is the existing `ProcessingScreen` cancellation/“Cancelling…” test, also present in the baseline log. Report: `$TEMP/concept-final-renderer-tests-2.json`. An earlier attempt used the nonexistent `vitest.config.renderer.ts`; that startup failure is not counted as a test run.
- Harness suite: **108 passed, 4 existing POSIX-only skips, zero failed**. This includes snapshot and maximum-label fixture-generator regressions. Log: `C:/Users/Groot/.ezcoder/bg/75a83124.log`.
- `verify-systems-e2e.mjs --concepts --unit`: passed; its render-mode test is intentionally skipped in unit mode.
- `git diff --check`: passed (Git emitted line-ending notices, not whitespace errors).

Full-suite counts and the focused gate are distinct runs, not added together. Harness-only follow-up checks are reported separately rather than silently changing those totals.

## Output-truth controls (engineering guidance, not legal advice)

Scope is this local scene expansion, not a product-wide legal/privacy audit. It adds no provider, data collection, payment processing, publishing channel, or external assets. Business objects illustrate transcript claims; they do not operate a financial service or provide financial advice.

Parser and regression tests cover source-bound actors, relationships and quantities; unresolved/blocked/simulated states; and rejection of invented probabilities, fees, retention, accuracy or outcomes. A defensive review found a conflicting-direction gap in `digital-twin/simulated-change`; the validator now rejects a conflicting intervention instead of merely finding the requested direction elsewhere in the text. Focused regressions and the subsequent full main suite passed. This is tested bounded-parser behavior, not a guarantee that every possible live model response is semantically correct.

## Frozen-bundle render evidence

All paths below use `$TEMP = C:/Users/Groot/AppData/Local/Temp` on this machine. Temporary media remain outside Git.

An unrelated concurrent build replaced shared `out/remotion` after the original render batches. The showcase correctly rejected those historical reports' `0b34bdb…` bundle hash. No guard was bypassed. `snapshot-bundle.mjs` now makes an exclusive local copy, verifies its digest and refuses missing/occupied paths; all three regression tests pass.

The first pinned full-motion checkpoint uses `$TEMP/clay-concepts-pinned-bundle-20260930`, SHA-256 `e403cb21992522086067213dff9a659ee7a1da650c0f253b409fd0639ffc45da`. Subsequent maximum-label corrections are being rebuilt and rerendered; this checkpoint is not silently presented as the corrected output.

| Passed report directory under `$TEMP` | Presets | Critical PNGs | Full-motion frames |
|---|---:|---:|---:|
| `clay-concepts-pinned-ab-20260930` | 13 | 286 | 4,404 |
| `clay-concepts-pinned-cd-20260930` | 16 | 352 | 5,280 |
| `clay-concepts-pinned-ef-20260930` | 13 | 286 | 4,494 |
| **Total** | **42** | **924** | **14,178** |

Each directory contains `report.json`, PNGs and native **1080×960, 30-fps ProRes 4444 stage movies** for the portrait `stack` layout. These are intermediate stage exports, not a changed final-output resolution. All 42 movies cover the entire authored duration (472.6 seconds combined); full decoding, frame counts and opaque-stage alpha passed. Both final aspect ratios are checked separately by the production smoke below. The full-motion batches deliberately disabled repeated-seek and historical control rerenders; they do not prove those separate checks.

### Visual review and corrections

All 42 five-phase portrait contact sheets were reviewed across the coordinator and independent reviewers: orientation, primary change, relationship, comparison and final hold. Pilot sorting-label overlap and exchange-wallet wording were corrected before the first pinned renders. No further concrete defect was found in those normal-text sheets. All **924/924 pinned critical PNG hashes** match the already reviewed original renders; source freshness and file hashes were verified by `$TEMP/concept-render-summary.mjs`, with results in `concept-render-summary-20260930.json`.

The additional maximum-length probes then found real issues in **customer-cohort**, **information-transform**, **edge-cloud**, and the four-column **scale-hierarchy** footer. Corrections preserve source text/caps, retain the existing clay treatment, and use separated label rails/columns rather than truncating or shrinking text. Scale hierarchy reserves up to four label rows and widens its camera framing; the default shared label layout remains unchanged. Focused regression failures were reproduced before/while those fixes were applied; corrected visual captures are pending. Synthetic endings such as `WID`/`WOR` are deliberate character-cap filler, not evidence of clipping.

### Production export and cleanup

Pinned production smoke: `$TEMP/concept-pinned-e2e-D1cBi6/report.json` and `runner-report.json`, **passed**. The wrapper `$TEMP/concept-pinned-e2e.mjs` supplies the frozen bundle to the unchanged production smoke and checks source-map freshness before and after execution.

The smoke validates all 42 planner fixtures and renders a mixed three-scene chain through both 9:16 and 16:9 production paths. It checks full decode, composition placement, captions, cue timing/audio mixing, missing-composition failure and in-flight Remotion cancellation. Its browser and tested child processes closed. **This is harness-owned cancellation, not an Electron UI `cancelRender()` acceptance test.** The observed Puppeteer close warning during cancellation did not fail the explicit page/child cleanup checks.

### Performance observations

Full-motion stage export times ranged from **33.6 to 61.5 seconds per preset** with three batches running concurrently. Peak coordinator RSS was **364,109,824 bytes (~347 MiB)**. Chrome/FFmpeg descendant memory is unmeasured on Windows; these numbers are not total application/GPU memory, a leak soak test, a serial benchmark, or a cross-machine guarantee. Each batch closed its browser.

## Remaining verification work and limits

- The final audit's mesh-accounting gap is closed: `concepts/mesh-budget.test.ts` passes **45 tests**, traverses actual fixture JSX at every frame, and ties ceilings to actual model definitions and actor caps. It preserves earlier inference/adaptive bounds. This excludes HTML/SVG, shared studio meshes and extra GPU passes; it is **static authored-mesh accounting, not measured draw calls, VRAM or RSS**.
- The maximum-label generator has **23 passing tests**. It yields 18 representative kinds × 3 cases (light/dark native `over` 16:9 plus existing palette/layout samples), preserving nontext state. All 54 cases / 270 PNGs rendered in the first pass; the corrected pass is running. Selected text caps are tested, not an exhaustive Cartesian product of every optional field or every possible glyph sequence.
- Finish/review pinned landscape stills and the captioned showcase. A first overlapping landscape run ended with a local `ERR_CONNECTION_RESET`; its failed report is retained and is not counted as passing evidence.
- Strict native seek check failed for `token-choice-next-token`, frame 282, on a parallel render. Report: `$TEMP/clay-concepts-pinned-seek-20260930-v2/report.json`. Decoded PNG comparison found **one opaque pixel at (1564,553), blue delta 1/255, zero alpha difference**. This is not merely PNG metadata. The precise browser/GPU mechanism was not proven; source pose tests pass. No tolerance or software-raster override was introduced to convert the failure into a pass. Separate limited-frame repeat/reverse/parallel checks cannot erase this counterexample or establish universal bitwise identity.
- Live paid model acceptance, cross-GPU/platform pixel equality, total descendant/GPU memory, app-level cancellation, and subjective user approval are not claimed. No deployment or commit was performed.
