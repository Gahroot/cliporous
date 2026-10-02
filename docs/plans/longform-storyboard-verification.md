# Continuous storyboard implementation and verification

Snapshot: 2026-10-02. Implemented in the working tree based on `890a6b84db87a72839062dc99b5300b4b221966d`. **Uncommitted and unreleased.** Engineering evidence, not a security, legal, accessibility or cross-platform certification.

## Result and scope

The production 16:9 scene-first path now plans, saves, compiles, previews and exports continuous storyboards. Ink/Polish is independent of the existing palette, legacy block skin and application theme. All **eight** current built-in palettes are supported (the planning document's count of seven was stale), along with validated custom palettes.

- Source-bound statement, comparison, process, notes, quantity and hero panels; seven model adapters: lightbulb, clapperboard, laptop, hourglass, battery, gears and book.
- Parser 2 adds boards without changing parser-1 interpretation or automatically upgrading approved history. Unknown versions remain preserved and blocked from rendering.
- Appearance is captured before generation. Profile/default precedence, cancellation, project persistence, immutable versions, approval invalidation and stale previews have regression coverage. Accepted versions retain palette contents even after the palette library changes.
- A board owns its complete source window and full-frame presentation. One outward-rounded timestamp rebase supplies production props. No model call occurs during preview/export.
- Automatic proposals are bounded, source-grounded and arbitrated in source order. Preserved/omitted decisions and whole-window ordinary scenes are protected. Ordinary planning remains the alternative when a board proposal fails.
- Transparent board output uses the existing FFmpeg source-underlay path; narration is encoded once. Real visual failure rejects preview and falls back for the full board interval during export, with failed reconciliation.
- Render limits remain 1–5 panels, 48 2D elements, six 3D instances and bounded world/model budgets. A full overview is rejected with a repair diagnostic if headings would be below 28px or other text below 18px at 1080p. Omit the optional overview, not panels or facts.

Four disjoint implementation agents, a proof-harness agent and independent read-only reviewers were used. Their results were collected; the coordinator ran the final checks and media/browser proofs. The reviewed selector finding was dropped after tracing the reachable scene-first editor. No packages, assets or browsers were installed; no live AI calls, commits, pushes or deployment occurred. Existing prototype files were preserved.

## Checks actually run

Final application checks followed the last production-code edit. Later edits were confined to the verification harness and documentation.

| Command | Exit/result |
| --- | --- |
| `npm run check` | 0; existing 132 warnings and 5 infos, no errors |
| `npm run typecheck` | 0 |
| `npm exec -- tsc -p tsconfig.remotion.json --noEmit` | 0 |
| Focused main command below | 0; 15 files, 166 tests |
| `npm test` | 1; main: 5,592 passed, 2 failed, 5 skipped; renderer not reached by the chained command |
| `npm run test:renderer -- --maxWorkers=2` | 0; 80 files, 641 tests |
| `node scripts/storyboard-proof/verify.mjs --unit` | 0; actual raw contract/plan/compiler/production-props paths |
| `node --test scripts/storyboard-proof/verify.test.mjs scripts/storyboard-proof/process-metrics.test.mjs` | 0; 16 tests after the final freshness-guard correction |
| `node --check scripts/storyboard-proof/render.mjs` | 0; original prototype runner preserved |
| Syntax checks for `verify`, `pin`, `gates`, `metrics`, `process-metrics`, `ui` `.mjs` files | 0 |
| `npm run build` | 0; main, preload, renderer and production Remotion bundle |
| Production media command below | 0; 13 evidence cases, 754 seconds including harness overhead |
| `node scripts/storyboard-proof/ui.mjs` | 0; 54 checks and 28 screenshots, latest repeat about 19 seconds |
| `git diff --check` | 0 |

```text
npm run test:main -- src/main/ai/longform-scene-contract.test.ts src/main/ai/longform-scenes.test.ts src/main/ai/storyboards src/main/remotion/compositions/storyboard src/main/render/longform-scene-pipeline.test.ts src/main/render/longform-scene-timeline.test.ts src/main/render/longform-storyboard-contract.test.ts src/main/render/longform-storyboard-props.test.ts
```

The broad planned renderer command was also run. High worker concurrency produced timeouts and cascading duplicate-element failures. The two-worker rerun isolated one introduced short-form palette fallback regression; it was fixed at `PalettePicker` using explicit `requireResolvedPalette` for scene-first consumers. All 641 renderer tests subsequently passed twice. Assertions and timeouts were not relaxed.

The two remaining main failures are the existing Windows separator assumptions in `src/main/promo/brand-pack-loader.test.ts:206,277` (`resolves a local video path`, `resolves a local image path`). For example the latter expects `/repo/ads/assets/screens/hero.png` but receives `C:\\repo\\ads\\assets\\screens\\hero.png`. The pre-change baseline log `C:/Users/Groot/.ezcoder/bg/0872a5c2.log` contains the same failures. Neither that test nor its implementation was changed. The latest full main run (`0085127b.log`) had no timeout failures. Earlier concurrent main runs did; a bounded two-worker run separated those from these two platform assertions. This is **not a clean full-suite pass**.

Useful final command logs live in `C:/Users/Groot/.ezcoder/bg/`: `5a77e321.log` (focused main), `0085127b.log` (full main), `5222960a.log` (full renderer), `7c6d1b94.log` (final lint), `9ea6586f.log` (build), `4b7ecb56.log` (media), `c5dca82b.log` (UI).

### Completion integrity review

Two additional read-only reviewers inspected test integrity and proof boundaries. The coordinator checked the actual tracked diffs: the main-test and Remotion exclusions in `tsconfig.node.json` predate this work; its only change adds the storyboard type file. Both global Vitest configurations remain unchanged. No weakened or skipped assertions were confirmed in the reviewed changes.

One proof-harness gap was reproduced and fixed: the source inventory omitted `package.json` and `scripts/build-remotion-bundle.mjs`. Four new regression cases first failed because edits/deletions of those inputs still accepted the old pin. They now pass with both inputs hashed; existing assertions were retained. The final combined harness suite passed all 16 tests, the production-path unit runner exited 0 (`storyboard-production-proof-aLcyvu/`), and `npm run check` exited 0 with the same 132 warnings and 5 infos (`c0de14cc.log`).

The completion rerun also passed 186 main tests across 13 files (`96e4bb19.log`), 56 focused renderer tests, root and standalone Remotion typechecks, and the browser UI proof. The main rerun command was:

```text
npm run test:main -- src/main/ai/longform-scenes.test.ts src/main/ai/storyboards src/main/ipc/longform-handlers.test.ts src/main/render/longform-scene-pipeline.test.ts src/main/render/longform-scene-timeline.test.ts src/main/render/longform-storyboard-contract.test.ts src/main/render/longform-storyboard-props.test.ts src/shared/storyboard-palette.test.ts src/shared/storyboards.test.ts --maxWorkers=2
```

The freshness correction changes verification only. Production code/assets, the build script and package manifest were not edited during this review. The earlier media run and pin were retained without rewriting their evidence; media was not rerendered for this guard-only change.

## Immutable production media evidence

Artifacts are local temporary outputs, intentionally outside git. They may be removed by operating-system temp cleanup.

- Final evidence root: `C:/Users/Groot/AppData/Local/Temp/storyboard-production-proof-GXb9nN/`
- Pinned bundle: `C:/Users/Groot/AppData/Local/Temp/explainer-stills-Xf7QvS/`
- Pin manifest: `C:/Users/Groot/AppData/Local/Temp/explainer-stills-Xf7QvS.storyboard-pin.json`
- Ink movie: `exports/mixed-ink.mp4`
- Polish movie: `exports/mixed-polish.mp4`
- Repeated-board stress movie: `exports/repeat-two-boards.mp4`
- Failure/fallback movie: `exports/visual-failure-fallback.mp4`
- Preview movies: `previews/`
- Contact sheet: `contact-sheet.png`; originals/index: `stills/`, `still-index.json`
- Reports: `runner-report.json`, `report.json`, `media-dispatch.json`, `live-canvas-counts.json`, `process-samples.json`, `media-commands.json`, probe/timestamp/reconciliation JSON files.

Hashes captured for the media run:

| Input | SHA-256 |
| --- | --- |
| Main/shared/fonts/SFX + lockfile/Tailwind/Remotion config (media-run inventory) | `72fbe0c2399fb98b0d248e1186269679999b0f9e6630ab186183bb9853869ade` |
| Pinned production bundle | `71b3e404e3840a3b22bdd8b50cc0df71f40d8621ed76f87113c9ae19ccfe93c2` |
| Authored synthetic 24.8-second source | `2abd512343111b07bba27c25d98bda9c1700b66abe7d4938dafffa8b3e69a376` |
| Authored synthetic 130-second stress source | `21c6bbcc6cabb62457f97235f489c973360bc2cc7691e8f6cc9483e3dae05981` |

The source inventory includes the Remotion design markdown, updated after the media run. The final read-only inventory comparison exited 0: the only changed existing entry was `src/main/remotion/DESIGN.md`; the strengthened guard additionally records `package.json` and `scripts/build-remotion-bundle.mjs`. Those two build inputs match HEAD (`git diff --exit-code HEAD -- package.json scripts/build-remotion-bundle.mjs` exited 0). All previously inventoried executable/asset inputs and the retained bundle's bytes/source-map hashes remain unchanged. The completed, expanded inventory hash is `406e02a97915f5cb2a07ec754044782225a5fc96c0bf56f801ea895e63a5b336`. The older media-run hash above is intentionally historical; reproduction must build and create a **new pin**, not rewrite the old manifest. Harness file hashes are separately recorded in the runner report.

```bash
npm run build
node scripts/storyboard-proof/pin.mjs --bundle out/remotion
# Use the fresh directory printed by pin.mjs. Exact successful run on this host:
STORYBOARD_PROOF_BROWSER='C:/Users/Groot/cliporous/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe' node scripts/storyboard-proof/verify.mjs --bundle C:/Users/Groot/AppData/Local/Temp/explainer-stills-Xf7QvS
node scripts/storyboard-proof/ui.mjs
```

Node was `v22.18.0`, Windows x64, installed local Chromium/Remotion/FFmpeg. The explicit browser path avoids assuming a different cache layout. The runner never downloads a browser or rebuilds lazily. The UI runner uses Node's supported TypeScript stripping for the shared contrast helper on this tested Node version.

### What the media proves (RUNTIME)

- Sixteen authored fixtures; 320 style/palette compiler-props combinations. This is deterministic fixture coverage, not live Gemini quality evidence.
- 84 actual still captures: 20 completed-state palette cells (2 styles × 8 built-ins plus 2 custom edges), every enabled model/panel, long punctuated labels, 45-element/5-prop and 210-node source fixtures, dense pan and overview samples. Two identical repeated still configurations matched exactly.
- Both mixed exports are 1920×1080, CFR 30, 744 frames / 24.8 seconds. Storyboard previews are 523 frames / 17.433333 seconds. The stress export is 3,900 frames / 130 seconds.
- Preview/export props match. Five sampled frame comparisons per style had maximum mean absolute RGB difference **0.9001/255**, below the predeclared **5/255** codec tolerance at 320×180. This does not mean the MP4 bytes are identical.
- ProRes 4444 alpha probes: first frame mean 0/255, opaque interior 255/255, final outward-rounded frame 3/255. Full-resolution samples, not exhaustive every-frame alpha inspection. Source-return bookends were checked against the original source.
- Synthetic stereo narration retains channel/frequency/phase/amplitude through scene seams. Sample correlations exceeded 0.999999; no second narration track was introduced. This uses authored tones, not synthesized speech or voice-quality assessment.
- SFX-on preview uses one bounded three-cue list and changes audio while leaving sampled video identical. The repeated-board export used the six expected cues. Disabled SFX was tested on both main movies.
- Two real preview cancellations after alpha rendering started, cancellation during real segment encode and concat, and injected real visual failure all completed their assertions. Existing completed exports were preserved. Preview rejected visual failure; export used source footage for the entire approved interval and recorded a failed board/fallback.
- Observed 12 2D-only still cases with zero canvases and 72 prop-bearing cases with at most one. DOM sampling every 50ms is not GPU-memory telemetry.

The agent inspected the final contact sheet and full-resolution examples including long labels, the five-panel final hold, two-panel overview, both styles and non-violet/custom palette treatments. Initial inspection caught unreadable five-panel recaps and a palette-matrix frame before the prop appeared. The compiler now rejects those miniature recaps, fixtures retain all five panels without an overview, and matrix capture waits for completed source-timed content and clay. A separate harness fault-injection issue was corrected after reading the installed Remotion implementation: rendering consumes `composition.props`, not `inputProps` alone. The final full media run passed after these corrections.

### Resource observations (RUNTIME)

| Measurement | Observed |
| --- | --- |
| Ink export + preview case | 163.7 seconds |
| Polish export + preview case | 162.1 seconds |
| Still matrix/catalog/dense samples | 126.6 seconds |
| Two-board, 130-second stress export | 189.1 seconds |
| Vitest worker sampled peak / OS high-water RSS | 411,639,808 / 413,433,856 bytes |
| Worker settled RSS | 132,124,672 bytes |
| Sampled owned descendant peak working set | 1,414,520,832 bytes, peak 8 children |
| Settled owned descendants | 0 children, 0 bytes; no sampling errors |
| Owned scratch peak | 296,481,930 bytes, 703 files |

The GPU encoder failed its first attempt on this host and the existing software-encode fallback was used. Measurements include observation overhead. Five-second process samples are not an exhaustive high-water mark, and neither they nor DOM counts measure GPU allocation. Scratch measurements exclude retained media evidence and the pinned bundle; the final scratch inventory contains intended probe outputs, not abandoned preview/render directories. This is a bounded two-board test, not a multi-hour soak or proof that cost is constant with panel count.

## Browser UI evidence

Reviewed root: `C:/Users/Groot/AppData/Local/Temp/batchclip-storyboard-ui-bNXt3K/`. Latest successful repeat: `C:/Users/Groot/AppData/Local/Temp/batchclip-storyboard-ui-2tzAPi/` (`report.json`, 28 PNGs; `6b3ced73.log`). Actual production React components were exercised through native browser pointer/keyboard events using an authored project and a local desktop-bridge fixture. This is not a packaged Electron run. The absent authored source file intentionally exercises playback-unavailable recovery; expected browser file-access messages are not evidence of native playback failure.

54 assertions cover:

- Picker accessibility-tree names; native Tab/Space selection; visible keyboard focus distinct from pointer selection.
- Pre-start dialog cancellation preserving existing appearance; disabled/pending and missing-palette blocking states.
- Light/dark 900×640 drop, dialog and review; 1280×800 picker; 320/390px reflow and long names; 200% **CSS zoom** and reduced-motion emulation. No horizontal page overflow, picker WebGL or autoplay.
- Full-frame-only board editing and Escape focus restoration.
- Appearance changes creating unapproved drafts without AI, restoration of prior appearance as a new draft, preview cancellation reaching the bridge, retry after visual failure, and a captured stale-source state.

Finite CSS transitions are awaited before screenshots. The driver verifies hit-testing instead of clicking hidden/offscreen controls. A failing style test was traced to the runner attempting Ink inside a closed nested disclosure, not to failed version invalidation; it now opens both real disclosure controls before clicking.

Measured picker heading/helper/selected-ring contrast on the actual flat UI canvas:

| Theme | Heading | Helper | Selected ring |
| --- | --- | --- | --- |
| Light | 14.37:1 | 5.69:1 | 7.39:1 |
| Dark | 15.57:1 | 9.77:1 | 5.62:1 |

These samples plus shared export-palette contrast tests are not a whole-app accessibility audit. Agent-inspected final PNGs include `dialog-dark-appearance-selected.png`, `review-light-board-editor.png`, `appearance-320-long-name.png` and `review-stale-source.png`. Earlier inspected screenshots cover the desktop picker and 200% view; these controls were unchanged in the final contrast run.

## Remaining limits

- No live Gemini calls: arbitrary-source proposal quality, provider timeout behavior over a real network and usage billing were not tested live. Fixtures exercise the bounded contracts and ledger integration, not universal model accuracy.
- No packaged native screen-reader/media-handle run, native zoom UI, forced-colors, RTL/localization audit or alternate GPU/OS verification. Browser UI uses desktop-bridge fixtures; native IPC/source-path checks have automated coverage, not a new full native acceptance session.
- No automatic voice generation, external asset acquisition, private comparison footage or rights-blocked model was used. Source grounding constrains representation; it does not establish truth, permission or correctness of the original transcript.
- Older prototype `render.mjs` remains an optional comparison tool; it is not the production evidence. Production bundle provenance checks exclude `board-proof.ts`, `proof-root.tsx` and the private reference MP4 from bundled modules/assets.
- Full tests remain red on the two documented pre-existing Windows path assertions. Existing lint warnings and build warnings were not hidden or repaired through unrelated changes.

Review source rights, audience-specific AI/media disclosures and native accessibility before release. No release or certification is implied by these development checks.
