# Detroit + hybrid explanation library: verification

Date: 2026-10-01. **Enabled scope implemented and locally verified; the full request is not complete while Spirit of Detroit remains rights-blocked.** The corrected RenCen, seven scene families and seven enabled landmark pairs have final native-render and production-route evidence below. Full-project verification/audit still have the separately recorded baseline failures. Nothing was committed, deployed or released.

## Implementation baseline (step 1)

- Actual HEAD: `9aef4b169c20265f80df5f5177d7ae6e5d5c0f54` (approved plan originally inspected `4f8b9b0`). Recent commits add explainer documentation, fixtures and integration tests.
- The working tree is substantially modified before this feature. Existing changes include planner generator injection, profile/diagnostic reporting, timeline diagnostics, renderer/UI work and packaging/configuration. These are not this feature's work.
- Reviewed overlapping diffs: `ai/explainer-scenes.ts`, `ai/explainer/variety.ts`, `render/explainer-scenes.ts`, its tests, `tsconfig.remotion.json`, Vitest and Biome configuration. Preserve generator/review behavior, diagnostics and unchanged variety budgets. Existing integration edits are additive and understood; no reset, global formatting or ownership reassignment.
- Actual environment: Windows win32, Git Bash, Node 22.18.0, npm 11.6.1; installed TypeScript 5.9.3, Vitest 4.1.5, Biome 2.4.15, Remotion 4.0.496, Three 0.186.1, React Three Fiber 9.8.1.
- Local FFmpeg and ffprobe binaries exist. Remotion's installed Windows Chrome Headless Shell was found using `ensureBrowser` with downloads explicitly disabled. No packages or browsers installed. Native ANGLE remains the proof target.
- Tool probe initially tried the unexported `three/package.json` subpath and failed. Corrected to read the installed package file; no project changes were needed.

### Baseline runtime tests

Command:

```text
npm run test:main -- src/main/render/concept-library.test.ts src/main/ai/explainer/shortlist.test.ts src/main/render/explainer-scenes.test.ts src/main/ai/explainer/planning-diagnostics.integration.test.ts
```

Result: **4 files, 408 tests passed**; Vitest reported 1.84 seconds. No runtime render or full-project verification claimed by this baseline.

## Implementation and automated evidence (through step 25)

Implemented seven families / fifteen presets in diagram and hybrid, seven local landmark pairs, concrete dispatcher/registry integration and protected windows. The existing `isCausalSceneKind` name and selection budgets are unchanged. React-free new type/catalog files were added to the node TypeScript project so planner imports remain covered.

Fixture manifest: 42 source-grounded cases (18 Detroit including all seven focus assets plus city/market; 12 finance; 4 business; 8 AI), seven showcase chapters, seven separately labelled unvalidated maximum-text layout probes. Each source case has eight advertised layout/palette cases and six beat samples: 2,016 primary stills plus 56 header stress stills were planned; final additional content/clearance probes bring the completed matrix to 2,094 stills. The existing fixture compiler validates source words and payloads; no live model call is represented.

- RUNTIME: new raw-payload suites passed (100 tests at the four-parser checkpoint), new hybrid-library pipeline suite passed **86** tests, persisted fixtures passed **43** tests. Existing concept library and shortlist regression checks passed.
- RUNTIME: stage ownership tests confirm zero Stage3D components in diagram mode and one in hybrid; this is structural CPU evidence, not rendered/GPU evidence. Layout, pose and authored mesh ceilings pass.
- RUNTIME: `npm run typecheck` and the separate `tsconfig.remotion.json` check passed.
- RUNTIME: scoped Biome check across 70 feature/integration files passed with **2 warnings** (stable line-fragment index keys) and **4 informational redundant-fragment notices**. No suppression was added.
- RUNTIME: showcase/E2E runner tests passed **7** tests, including all new stale/missing-bundle gates and actual child timeout/cancellation cleanup.
- RUNTIME: `verify-systems-e2e.mjs --hybrid --unit` passed; the production-valid transcript contains seven 10-second stories in 130 seconds (53.85% coverage), six groups and a real two-scene transition. Report: `C:\Users\Groot\AppData\Local\Temp\explainer-systems-e2e-dEGwxL\runner-report.json`.
- RUNTIME: existing `--unit --technology --concepts` also passed. Report: `C:\Users\Groot\AppData\Local\Temp\explainer-systems-e2e-muoyf3\runner-report.json`. Existing explicitly media-only tests remain skipped in unit mode; no test was newly skipped to hide failure.
- A first hybrid E2E attempt failed because the old harness assumed every selected vertical layout was stack. The planner legitimately alternates stack-flipped. The harness now validates and renders the actual selected layout; no variety/coverage rule changed.

### Full-project failures kept separate

`npm run verify` failed at Biome: **40 errors, 121 warnings, 4 infos**. All error paths are pre-existing planner-evaluation/profile/diagnostic/quote work and untouched render integration files (format/import-order), not new feature files. No blanket formatting or gate weakening was used. The experimental Biome JSON reporter emitted unescaped Windows paths and could not be JSON-parsed; its text output still identified all errors.

`npm run typecheck && npm test`: typecheck passed; main suite reported **4,916 passed, 8 failed, 5 skipped** across 205 files. One feature-caused exact-kind coverage failure was fixed by adding seven real parsed hybrid scene witnesses, not weakening the assertion; the expanded causal integration suite then passed **67** tests. The seven unrelated failures are two Windows path-separator expectations in `promo/brand-pack-loader.test.ts` and five floating-card tests that mock the old `planExplainerScenes` API while the pre-existing render changes call `planExplainerEditPlan`. These files/behaviors were not changed by this feature. Renderer tests were launched separately because the main-suite failure prevents npm test from reaching them: 348 passed and two 5-second timeouts (ClipDetail caption-mode interaction and ClipGrid initial render). Both affected suites passed unchanged on an isolated rerun: 28 tests. No timeout, assertion or UI code was changed.

`npm run audit:third-party` failed on pre-existing asset inventory problems: Windows backslash paths reported unaudited against slash-normalized manifest entries, changed existing text hashes, and missing old `build/icon.iconset/*` / `build/icon.svg` entries. This feature adds authored code, not downloaded binary assets. The audit was not modified or bypassed. Full output was observed; no licence clearance is inferred from a failed audit.

## Build and visual correction evidence (steps 26–27)

- Production app + Remotion build passed. Initial diagnostic snapshot: `C:\Users\Groot\AppData\Local\Temp\explainer-stills-t2CvEr`, SHA-256 `db9a4bbf12b8237abdb94d5f70bf40a3b6fdaa0e85078f8b7a04b2c312e4a5b9`. Initial showcase stills: `C:\Users\Groot\AppData\Local\Temp\explainer-stills-W7YyJH`.
- Initial still review reproduced cash-lane headings drawn on account/invoice symbols and dilution percentages touching ownership strips. Corrected at the shared primitives/layout owners, with three new geometry regression tests.
- Additional layout-only content probes (`hybrid-content-stress.mjs`, explicitly not parser-grounding evidence) reproduced overlapping maximum-length actor/model labels and 12-token word tiles. Fixes reserve complete name lines and route cross-row attention links outside all word tiles. Unknown measurements remain textual, not zero. Portfolio shared holdings are placed first in both columns so the linking row cannot indicate a different holding.
- Hybrid model-comparison review found cost hidden until the latency beat. A renderer-authored action-beat handoff now reveals cost, then latency, then score at their separate source beats. No planner timing or coverage limits changed.
- Diagnostic renders under `C:\Users\Groot\AppData\Local\Temp\`: `explainer-stills-NCokQR` (before content fixes), `explainer-stills-1W1gJ1` (first correction), `explainer-stills-EnpLGY` (42 showcase beat stills), `explainer-stills-iY5MF0` (56 maximum title/condition/outcome layout and palette probes). These use earlier pins; they are diagnostics, not the final matrix. Review prompted one further portfolio-icon inset correction.
- After the initial visual corrections: scoped Biome passed (two warnings/two informational notices), **9 affected test files / 114 tests passed**, standalone Remotion typecheck passed, production app + Remotion build passed. Log: `C:\Users\Groot\.ezcoder\bg\7b744311.log`.
- First full matrix completed successfully as a render run against snapshot `explainer-stills-U9pcSw` (SHA-256 `889cfec048d31deb4b240047e63916e839da571557b738f34fb5dbba30ac766d`): Detroit `explainer-stills-d4QE3e` (144 cases / 864 stills), finance `explainer-stills-eAHkPT` (96 / 576), business `explainer-stills-FQi13A` (32 / 192), AI `explainer-stills-gg0oNA` (64 / 384). Header probes: `explainer-stills-lpzsVs`; content probes: `explainer-stills-3YzvQq`; both-aspect showcase/gallery sequence stills: `hybrid-showcase-A3L5vr`. All paths in this bullet are under `C:\Users\Groot\AppData\Local\Temp\`. Log: `C:\Users\Groot\.ezcoder\bg\eb55ea8d.log`. Free space before the run was 212 GiB.
- Reviewed all seven landmark pairs, including the RenCen central/four-main/two-lower towers, station base/office-block proportions, Fox identification, stepped classic towers, suspension bridge, and market shed. Review contacts: `C:\Users\Groot\AppData\Local\Temp\hybrid-review-K25LQY\primary.png` and `supporting.png`. These are stylized representations, not an architectural survey or street map.
- The full matrix review exposed a missing **source-backed limit** in constraint-choice: the selected model was named without displaying its budget/latency criterion. Added an explicit unit-bearing limit at the check beat, retained task/basis and illustrative labeling, and reserved a separate footer without reducing metric-row separation. Two parser-to-SVG regression tests cover presence of the actual limit and absence of an invented limit in unconstrained comparisons.
- Latest correction verification: **3 affected test files / 90 tests passed**, standalone Remotion typecheck passed, scoped Biome passed (two informational notices), and production app + Remotion build passed. Log: `C:\Users\Groot\.ezcoder\bg\34571c1f.log`. Revised maximum-content constraint-choice stills were reviewed at `C:\Users\Groot\AppData\Local\Temp\explainer-stills-5qUEHe`.
- Pre-RenCen-correction pinned bundle: `C:\Users\Groot\AppData\Local\Temp\explainer-stills-bqDD8Z`, SHA-256 `1966d66217595b1d48f333f3d9b5487ffbbfba5aaaafc08e7e1db6cebdf41757`.
- That full rerun completed: AI `explainer-stills-kgwZJS`, Detroit `explainer-stills-NCoF0l`, finance `explainer-stills-fNwp44`, business `explainer-stills-thhQis`. All 336 cases / 2,016 stills passed report/input/bundle/image hash and dimension checks (`hybrid-matrix-audit-iLNOYk/report.json`). The 56 header probes (`explainer-stills-aLCGgN`) and 14 content probes (`explainer-stills-iHdQf0`) also passed artifact/hash checks. Rendering success is not visual approval; these are now pre-correction evidence.

## User-directed RenCen correction during step 28

- User rejected the RenCen depiction. Actual Portman Architects and Detroit Historical Society collection photographs exposed the mistake: four octagonal offices with slim cylindrical circulation cores, not four cylinders; the lower eastern pair is rectangular. Reworked both authored representations and the camera from these recognition features. No photo, logo, or downloaded model is a runtime asset.
- The showcase crossfade merged unrelated labels; slide still left an edge collision. A tested one-frame chapter cut now separates outgoing and incoming facts. This affects only the animation reel, not production transitions. Adjacent native frames were reviewed in `hybrid-showcase-5Bb4HZ`.
- `hybrid-showcase-D6gxaN` contains four completed but **superseded** animation-only videos. Production proof `explainer-systems-e2e-7hJuPt` was deliberately interrupted, not passed. Post-cancellation process-tree inspection found none of its recorded owned Node, Chromium, FFmpeg, or esbuild PIDs remaining.
- The screenshot tool lacked its optional engine; no package/browser was installed. Reference viewing used temporary files outside git; native verification uses the already installed Remotion browser.
- Corrected geometry's first bounds test exposed a crown touching the vector viewport. Corrected the projection inset without weakening the assertion. All **16 Detroit tests** then passed; standalone Remotion typecheck and production app/Remotion build passed. Log: `C:\Users\Groot\.ezcoder\bg\6f4252c2.log`. Authored mesh count remains 51 under the unchanged ceiling of 56; this is not a runtime performance claim.
- Intermediate diagnostic snapshot: `explainer-stills-x3JYfm`, SHA-256 `c918aca2a46f15a3f196624db149a5a67d5fcbce40fb6d796df3f1c0efe4a8df`. Superseded by the final pin below after city-portrait hierarchy and long-condition clearance corrections. Other paths in this section are under `C:\Users\Groot\AppData\Local\Temp\`.

## Final corrected evidence (steps 27–28)

All short artifact names below are directories under `C:\Users\Groot\AppData\Local\Temp\`. Generated PNGs, videos, reports and diagnostic scripts stay outside git. Render success and artifact integrity do not substitute for the visual reviews described here.

### Pinned inputs and final checks

- Bundle: `explainer-stills-1Fpb95`, SHA-256 **`94a0cff250ca7ea4ff42eb7ee33d0c7a94cdb3e5f7e2e24ed255481c080635ad`**. Windows native ANGLE, installed Chrome Headless Shell 146.0.7644.20, Node 22.18.0, Remotion 4.0.496. No software-raster override or browser download.
- RUNTIME: Detroit, AI-kind and hybrid-library checks passed **128 tests** after the RenCen correction; standalone Remotion typecheck and production app/Remotion build passed. The later focused catalog/header projection check also passed. The maximum-condition crown clearance is tested at the actual authored camera, not by weakening the safe box.
- RUNTIME: tested additive `verify-systems-e2e.mjs --bundle DIRECTORY`; missing/duplicate paths, URLs and network shares are rejected. Existing source-map/source-freshness and bundle-hash gates still run. Its runner tests and `--hybrid --unit --bundle` passed (background log `C:\Users\Groot\.ezcoder\bg\b2e7b582.log`). Unit mode's media-only worker is intentionally inactive; the actual media worker passed separately below.
- One attempted proof against mutable `out/remotion` failed when concurrent unrelated build work replaced its JS bundle/map. The source difference was in existing `src/shared/longform-layout.ts` and `src/main/remotion/styles.css`; neither was reverted or edited here. The rerun uses the reviewed immutable pin. No freshness assertion was removed and no success is claimed for the failed run.

### Corrected visual matrix

| Coverage | Report directory | Cases / stills |
| --- | --- | --- |
| All seven Detroit landmark pairs plus city/market presets | `explainer-stills-cTWK4y` | 144 / 864 |
| Finance presets, both modes | `explainer-stills-Bxp28g` | 96 / 576 |
| Cash-timing presets, both modes | `explainer-stills-fXrurz` | 32 / 192 |
| AI presets, both modes | `explainer-stills-bYGzvI` | 64 / 384 |
| Maximum title/condition/outcome layout probes | `explainer-stills-i6ckPp` | 56 / 56 |
| Maximum actor/model/token content probes | `explainer-stills-ueTyG7` | 14 / 14 |
| Additional RenCen condition/crown clearance probes | `explainer-stills-3ExdOz` | 4 / 8 |

RUNTIME: `hybrid-final-matrix-audit-2YMNAx/report.json` checks **410 cases / 2,094 stills**, exact fresh plans, input/bundle hashes, dimensions, 30fps, all PNG hashes and no missing/duplicate frames. `hybrid-showcase-ja8UkH/report.json` adds **104 sequence stills**. The first 336 cases are grounded fixture presentations; stress probes test layout only, not source grounding.

Visual review covered light/dark, both aspects and advertised safe boxes; five beats/final hold; all enabled landmark pairs; dense labels, units, unknowns and qualifiers; handoff/transition frames. Corrected RenCen has a cylindrical central hotel, four faceted offices with slender circular cores, two lower rectangular eastern towers, connected podium and riverfront Wintergarden. It dominates the city portrait without colliding with the station/Fox labels or condition header. This is an agent visual review of stylized architecture, not a renewed user sign-off or architectural survey.

### Animation-only showcase and gallery

Final folder: **`hybrid-showcase-S43QrF`**:

- `showcase-9x16.mp4` and `showcase-16x9.mp4`: seven mixed Detroit/finance/business/AI chapters.
- `gallery-9x16.mp4` and `gallery-16x9.mp4`: seven enabled landmarks, with enough time for each silhouette.

RUNTIME: `hybrid-media-audit-8IPOkw/report.json` verifies each finished video as H.264 + AAC, **30fps, 2,109 frames, 70.3 seconds**, at 1080×1920 or 1920×1080. Full decode checks passed; the first SFX cue has non-zero RMS (about 0.0020–0.0024). Selected encoded hold frames were extracted and visually inspected. One-frame chapter cuts avoid merged labels; the tests and adjacent stills cover boundaries. These are animation-only reels, not human-narrated videos or production compositing proof.

### Actual production-route media

RUNTIME: `explainer-systems-e2e-93Dlin/report.json` and `runner-report.json` **passed** with the final pinned bundle. Full log: `C:\Users\Groot\.ezcoder\bg\b0cd6556.log`.

- The real parser/planner, grouping, short-form splice and longform fitting retain all seven ten-second scenes in a 130-second authored transcript: **53.85% coverage**, six groups, speaker gaps and unchanged variety limits. No live Gemini generation is claimed.
- **12 H.264/AAC production group composites**: six groups in portrait and landscape under `hybrid-0` through `hybrid-5`, each with `portrait`/`landscape` subdirectories and `final.mp4`. These exercise actual production layout/compositing helpers, not just the standalone scene renderer.
- The same successful runner also produced **two complete 130-second / 3,900-frame films**, including all speaker-only gaps, under `hybrid-complete-portrait/hybrid-production-proof.mp4` and `hybrid-complete-landscape/hybrid-production-proof.mp4`. Both are H.264/AAC at 30fps; video duration is exactly 130s (audio/container 130.008s). Full decode passed and final file hashes were independently rechecked: portrait `fd1eaee72f7c371df57b959a07ed01efaea59756a662d6f84a5c11802d6c714e`, landscape `b0e851896c2cd83a05849b25586b13f34c282aedff073918859c464c4707e080`. Captions come from the real editorial builder in every group and gap; selected complete-film speaker-gap frames were visually inspected. The initial handover draft undercounted these complete-film artifacts by listing only group clips.
- Actual dimensions: **1080×1920@30** and **1920×1080@30**. Five groups are 10.1s/303 frames per aspect; the two-scene group is 20.4333s/613 frames. Full video decode, expected frame count and duration checks passed.
- Every intermediate is **ProRes 4444 / yuva444p12le**. Measured alpha contains both zero and non-zero pixels (maximum 226); transparent source visibility and stage compositing checks passed.
- Editorial ASS captions have non-zero measured changed pixels in every composite. SFX checks compare a silent source window (RMS 0) with a cue window (about 0.00103–0.00198). Hold and before/after-seam images are retained. Selected encoded holds and the real two-scene seam were inspected.
- Production keeps its existing transition behavior; unlike the reel's cuts, its crossfade briefly superimposes outgoing/incoming headings at the seam. Final holds are separately checked. No global production transition redesign was made.
- Source is visibly labelled **SYNTHETIC SPEAKER – NO HUMAN DATA**. This proves media plumbing/captions/alpha/SFX, not natural narration, face detection quality, lip synchronization or a real Detroit business claim.
- Browser closure passed. Missing-composition failure handling, Remotion cancellation, bounded-child timeout and cancellation checks passed. A separate unrelated longform renderer was observed running afterward and deliberately left untouched; it was not reported as an owned leak.

### Native rendered determinism

RUNTIME: `batchclip-motion-check-3xF5pr/report.json` passed using the same bundle/browser/native ANGLE. **14 cases × 23 sampled frames = 322 comparisons**, each rendered three times (966 PNGs): identical pixels and PNG bytes. This covers the selected seven chapter stories in both modes, not every preset on every GPU. Browser closed. `--no-media --no-controls` avoids duplicating the independent production alpha proof; no media result is inferred from that invocation.

## Measured rendering cost and resource limits (step 29)

RUNTIME: `hybrid-performance-omxNfp/report.json`, `audit.json`, and `diagnostic-source.mjs`. Reproducible local probe source is also at `.ezcoder/tmp/hybrid-performance.mjs` (ignored). Diagnostic SHA-256: `ad812a4807eba66bc5f7e72a3e1cee79a061348450ce95b279566115bd63f3bd`.

Hardware: Intel i9-9900K (8 cores/16 logical processors), 34,272,268,288 bytes physical RAM, NVIDIA RTX 2080 Ti, driver 32.0.16.1714, Windows 10 Pro build 19045. Same final bundle and Chrome/ANGLE as above.

Serial native 1080×960 stack PNGs at frame 90: one fresh-browser render then six repeats in that browser per case (56 renders total, 67.25s including startup/cleanup). “Cold” means browser-cold, **not OS/filesystem-cache cold**. Every `renderStill` call uses a new Remotion page, so warm does not mean a persistent mounted scene.

| Fixture | Cold render ms | Cold incl. browser/select ms | Warm median ms (6) | Sampled owned peak working set MiB |
| --- | ---: | ---: | ---: | ---: |
| Existing house-cutaway | 1,813.3 | 2,600.2 | 914.9 | 700.2 |
| RenCen diagram | 813.0 | 1,457.4 | 739.7 | 684.5 |
| RenCen hybrid | 3,112.0 | 4,666.1 | 1,488.0 | 549.2 |
| Fund-flow hybrid | 1,770.3 | 2,436.6 | 877.3 | 679.2 |
| Fund-flow diagram | 806.4 | 1,493.0 | 701.3 | 678.7 |
| Model-tradeoff diagram | 1,587.8 | 2,777.4 | 995.0 | 520.5 |
| Model-tradeoff hybrid | 1,853.0 | 2,634.7 | 874.4 | 716.6 |
| Existing shield hero | 1,911.4 | 2,568.9 | 829.0 | 709.6 |

Limits and investigation:

- Other local rendering/desktop activity was present. These are observed costs, **not isolated budgets, full-video throughput or a claim the library is fast/leak-free**. No GPU allocation telemetry or long-duration leak soak was captured.
- Windows sampler recorded 59 roughly one-second snapshots of Node and its owned descendants, excluding the sampler. Summed working sets can count shared pages twice and miss between-sample peaks. Private-byte observations are also in the report; they are committed bytes, not resident RAM.
- An initial probe (`hybrid-performance-w6MgCn`) incorrectly attributed an unrelated Firefox tree through a reused PID. Its memory totals are superseded. The corrected sampler requires parent/child creation-time ordering; all 59 snapshots passed an ancestry audit. All **128 observed owned process identities** (PID plus creation time) had exited after completion; eight browsers and the sampler closed.
- Initial warm fund-flow timing was 1,571.1ms; the unchanged scene measured 877.3ms on repeat, while the slower interval moved to other cases. A stable scene-caused regression was not isolated, so no speculative app optimization was added.
- CODE + existing focused tests: RenCen uses **51 meshes under a 56 ceiling**, with batched facade/prism geometry and bounded vertex arrays. Other landmark authored counts are station 28, Fox 27, Guardian 14, Penobscot 13, bridge 52 and market 20. Finance preset budgets are explicit in `finance/mesh-budget.test.ts` (55/55, 41/41, 28/28 ceilings). Parser limits bound transfers/holders/holdings, at most 12 attention tokens, three models and three metrics. These structural limits are distinct from runtime RAM/GPU measurements.

## Final working-tree checks and diff audit (step 31)

Fresh complete gate components ran serially after rendering; log `C:\Users\Groot\.ezcoder\bg\7e3c903b.log`. This updates the earlier step-25 checkpoint rather than rewriting its historical results.

| Final command | Actual result |
| --- | --- |
| `npm run check` | **Pass**, warnings remain; no global formatting was performed |
| `npm run typecheck` | **Pass** |
| `tsc -p tsconfig.remotion.json --noEmit` | **Pass** |
| `npm run test:main` | **Fail**: 5,293 passed, 4 failed, 5 existing skips; 219 passed files, 3 failed, 1 skipped |
| `npm run test:renderer` | **Fail**: 410 passed, 3 failed; 64 passed files, 3 failed |
| `npm run audit:third-party` | **Fail**: existing Windows path/missing asset/hash discrepancies remain |

The main failures were the two known Windows separator assertions in `promo/brand-pack-loader.test.ts`, plus unchanged five-second timeout limits in `render/transition-easing.test.ts` (panel-in) and `concepts/business-populations/projection.test.ts` (maximum boundaries). Renderer failures were five-second timeouts in the first caption/drop/grid tests of `ClipDetail`, `DropScreen` and `ClipGrid`. None is a new hybrid contract/asset test failure.

To distinguish timeout sensitivity without changing tests, the two timed-out main files and three renderer files were rerun with **`--maxWorkers=1` only**. All **36 main and 37 renderer tests passed**; log `C:\Users\Groot\.ezcoder\bg\0a29b988.log`. Assertions/timeouts and repository concurrency settings were untouched. This supports a contention-sensitive result, but does **not** turn the failed full-suite runs into green runs. The older step-25 renderer assertion failures were not reproduced in the final whole-suite run.

Final source/diff audit:

- Reviewed the seven dispatch/union/spec integrations, source/quantity contracts, prompt additions, new asset/diagram files, raw fixture/pipeline coverage, harness additions and documentation against the approved scope. Every enabled kind has a concrete renderer; no Spirit stub/allowlist entry was introduced.
- New defaults do not replace existing clay assets, add a style setting, relax baseline coverage/shortlist budgets, or change captions/output/FPS. Pre-existing planner/profile/longform work and the concurrent `CONTEXT.md` note in `CLAUDE.md` were preserved, not attributed to this feature.
- Scoped tracked `git diff --check` passed. The final immutable bundle digest and **241 mapped Remotion source contents** passed the existing source guard again. No rebuild replaced the reviewed proof inputs.
- Final app changes remain uncommitted. Temporary proof outputs and benchmark scripts remain outside git; no package install, deployment, external service or history operation occurred.

### Final independent bounded checks

The final files were checked again with separate commands (no compound-shell exit-status aggregation). No app/test/config edits followed these checks.

- `npm run check`: exit 0; 1,047 files, 120 existing warnings and five infos, no fixes applied.
- `npm run typecheck`: exit 0.
- `node node_modules/typescript/bin/tsc -p tsconfig.remotion.json --noEmit`: exit 0.
- `npm run test:main -- src/main/ai/explainer src/main/remotion/compositions/explainer/diagrams src/main/remotion/compositions/explainer/detroit src/main/remotion/compositions/explainer/finance src/main/remotion/compositions/explainer/business-systems src/main/remotion/compositions/explainer/ai-systems src/main/render/hybrid-library.test.ts src/main/render/hybrid-fixtures.test.ts src/main/render/causal-integration.test.ts --maxWorkers=1`: **65 files / 2,705 tests passed**, no skips; log `C:\Users\Groot\.ezcoder\bg\d5951af5.log`. Includes old planner/kind regressions and all affected new contract/layout/pose/geometry/production-plan suites.
- `node --test scripts/explainer-stills/hybrid-showcase.test.mjs scripts/explainer-stills/verify-systems-e2e.test.mjs`: **8 passed**, no skips.
- `node scripts/explainer-stills/verify-systems-e2e.mjs --hybrid --unit --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95`: exit 0, unit planner/pipeline pass; intentionally inactive compositor worker is not a media pass. Report `explainer-systems-e2e-QEfmCa/runner-report.json`; log `C:\Users\Groot\.ezcoder\bg\7473fd3b.log`.
- Separate `node --check` calls for `hybrid-content-stress.mjs` and the ignored performance diagnostic passed. The diagnostic's current source hash also matches the actually executed, passing `hybrid-performance-omxNfp` probe; a syntax check is not substituted for its runtime evidence.
- Reviewed the actual added/changed test assertions and config against the approved behavior: new coverage, source/quantity rejection cases, final-hold/layout guards and additive E2E checks. The existing conditional compositor-worker split remains intact; no assertion, timeout, test or compiler safety check was weakened to obtain a pass.

The full-suite/audit failures above remain separately reported; these scoped passes do not certify a green product-wide gate. Pinned bundle, current mapped Remotion sources and complete-film artifact hashes were checked again without rebuilding or changing proof inputs.

## Reproduction commands

Run from the repository with its installed tools; keep the reviewed snapshot immutable. Temporary inputs referenced below are retained locally, not tracked assets.

```text
node scripts/explainer-stills/render.mjs scripts/explainer-stills/fixtures/detroit-landmarks.json --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95
node scripts/explainer-stills/render.mjs scripts/explainer-stills/fixtures/hybrid-finance.json --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95
node scripts/explainer-stills/render.mjs scripts/explainer-stills/fixtures/hybrid-business.json --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95
node scripts/explainer-stills/render.mjs scripts/explainer-stills/fixtures/hybrid-ai.json --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95
node scripts/explainer-stills/render-hybrid-showcase.mjs --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95 --media
node scripts/explainer-stills/verify-systems-e2e.mjs --hybrid --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95
node scripts/explainer-stills/verify-motion.mjs --fixture C:/Users/Groot/AppData/Local/Temp/hybrid-repeat-input-3QeN44/repeated-frames.json --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-1Fpb95 --native-cases --no-media --no-controls
node .ezcoder/tmp/hybrid-performance.mjs
```

## Outstanding / not claimed

- **Spirit of Detroit remains blocked**, not replaced or counted among the seven enabled landmark pairs. Human prerequisite: documented permission or a qualified rights determination covering software redistribution and generated outputs. No outreach/payment was made.
- Full-project tests and third-party audit are not green: see the final working-tree results and timeout isolation above. Lint and both typechecks now pass. No failing gate, assertion or timeout was disabled.
- No live Gemini selection, natural narration, real-source end-user flow, cross-GPU/platform parity, isolated performance budget, GPU-memory total, or long-session leak guarantee.
- No package/browser installation, new service, asset purchase, commit, deployment or release. The pre-existing dirty working tree and concurrent unrelated work were preserved.

The enabled implementation and local proof work are delivered, with the sculpture and the stated verification limits explicit. This is not a complete-pack or product-wide launch certification.
