# Causal technology storytelling

## Scope and design contract (2026-09-30)

Five new authored scene families, three presets each, and six business recipes using existing scenes. This is a video-diagram surface for viewers watching narrated explainers, often at phone size. The single job is to follow one request, excerpt, context item, code change, or customer through a cause and its consequence. It is not an interactive dashboard or a product-performance claim.

Preserve the existing warm editorial material language, `useStage()` palette, Inter labels, Instrument Serif editorial titles, 1080×960 virtual stage, 1080×1920 shorts and 1920×1080 longform at 30fps. Use project-authored 2D/2.5D geometry for precise software relationships. No new WebGL canvases, external assets, dependencies, settings, or arbitrary graph layouts.

First glance: the subject and a distinctive working surface. Second glance: the one active transfer and its prerequisite. Resolution: a quiet final outcome. Surfaces belong because a tray, library, workbench, switchboard, and control desk each explain different boundaries and relationships, not because every scene needs cards. No decorative metrics, terminals, pulses, idle wobble, emoji, or invented evidence. Status uses text and shape as well as palette color. Sound is reserved for meaningful contact, rejection, routing, and resolution.

### Frozen scene interfaces

`technology/types.ts` is the React-free source of truth. Every scene has `kind`, allowlisted `preset`, source-backed `label` (32 characters), `subject` (24), `outcome` (40), optional source-backed `condition` (56), and five absolute-second beats: `setupAt`, `actionAt`, `responseAt`, `checkAt`, `resolveAt`. Model JSON supplies the corresponding `setupWord`, `actionWord`, `responseWord`, `checkWord`, `resolveWord` indices, plus normal `startWord`, `endWord`, and `layout`.

Bounds: 5–12 seconds, minimum beat gaps 0.6 / 1.0 / 1.0 / 1.0 seconds, at least 0.8 seconds after resolution. Legal layouts: stack, stack-flipped, takeover, over. No duration ends in `At`. Existing 14-second outer bound, 55% coverage, gaps, family repetition, causal-window protections, and 16-kind/10-prop menus stay unchanged.

Shared helpers handle finite times, indices, source labels, locally bounded evidence phrases and retained conditional copy. Family parsers must additionally prove the actor relationship and selected branch; nouns alone are insufficient. Negation belongs to its local claim: an earlier failed call must not invalidate a later supported retry, and a mention of retry must not imply success. Ambiguous or unsupported outcomes fail closed. Conditional claims carry the exact condition visibly and do not read as verified events.

Authored labels such as Tool, Archive, Test, Cache, and Answer name structure, not facts. Source excerpts, results, version names, values and outcome copy must occur in the source. No code snippet or benchmark is synthesized.

### Shared rendering kit

`TechnologyStage({label, condition, children})` owns the 1080×960 title and content rail; children use authored stage coordinates within x=64..1016, y=200..790. A final outcome may occupy y=818..910. StageFrame alone handles layouts, scaling, backgrounds and caption separation. No local overrides to SceneFrame or transitions.

`technology/primitives.tsx` supplies document/request actors, ports, gates, connectors and readable text with palette-derived neutral surfaces. Family assemblies remain distinct. Pure pose exports use `(scene, timeSeconds)` and return finite bounded values with exact static final holds. Shared motion is finite interpolation and token-weighted follow-through, not a new engine. Outcome timing must follow contact and validation, never precede them.

## Bounded scenario/source matrix

The following are explicitly authored example material. Each lane converts its three transcripts into actual indexed parser tests and render fixtures; no fixture declaration counts as execution evidence. Positive phrasing may be expanded to fit readable beats without changing the causal claim.

| Kind / preset | Source-backed scenario | Reject misleading branch |
| --- | --- | --- |
| agent-workflow / tool-success | An agent gets a task, calls a tool, receives its result, checks that result, then completes the task. | A tool is mentioned but not called; unchecked or failed result called success. |
| agent-workflow / tool-retry | An agent calls a tool; the first call fails; it retries; the returned result passes its check; then the task completes. | Retry also fails, is only proposed, or returns no supported result. |
| agent-workflow / approval-gate | An agent calls a tool and checks the result; the task waits for human approval; the person approves; only then does it complete. | Approval requested, denied, or never given. |
| retrieval-grounding / evidence-found | A question searches the documents, selects a relevant excerpt, uses that excerpt in the answer, and retains its source reference. | Merely mentions documents or fabricates an excerpt. |
| retrieval-grounding / no-evidence | A question searches the documents; no relevant evidence is found; the answer workspace stays empty and reports no evidence. | No-match branch fills an answer or shows a positive correctness mark. |
| retrieval-grounding / two-sources | A question searches two named sources; each supplies a selected excerpt; those excerpts are combined into an answer with both references. | Only one source is relevant, second excerpt absent, or citations treated as truth guarantees. |
| context-window / overflow | New context enters a full working window; the oldest detail leaves the working area while stored data remains in the archive. | Implies stored data was deleted or working capacity is unbounded. |
| context-window / summarisation | Detailed context fills the working window; a summary replaces that detail, keeps key points, and omits detail. | Lossless compression or all detail guaranteed to remain. |
| context-window / memory-retrieval | A question needs earlier stored context; retrieval selects a relevant item from the separate archive and returns it to the working window. | Everything is recalled, archive is absent, or irrelevant content becomes evidence. |
| software-release / fix-pass | A code change fixes a bug, runs tests, passes those tests, and is released only after the passing check. | Tests only run or were skipped; failure presented as pass. |
| software-release / regression-rollback | A change reaches checks; a regression fails them and blocks release; rollback restores the stated prior version. | Claims release despite regression or invents a prior version. |
| software-release / parallel-release | Two checks run in parallel; both pass; the join waits for both; then the change is released. | Only one check passes or parallel tasks never join. |
| request-routing / cache-hit | A request checks the cache; a fresh matching response is found; it returns without backend work. | Stale or unrelated cache data treated as a hit. |
| request-routing / cache-miss | A request finds no cached response; the backend returns one; only then is the cache populated and the response delivered. | Cache fills before response, or backend never responds. |
| request-routing / timeout-fallback | A request goes to a primary service; it times out; an explicitly available alternate service returns the response. | Alternate route merely hoped for, also fails, or is not supported. |

Business fixtures use ordinary business words and the real parser/shortlist:

1. Sales handoff waits in an approval queue, then approval clears it (`bottleneck`).
2. Support requests pile up at a constraint, then removing it clears the backlog (`bottleneck`).
3. Recurring resource loss falls after a stated corrective action (`resource-leak`).
4. Demand exceeds a capacity target, is measured, adjusted and brought back toward it (`feedback-control`).
5. Content creates leads; leads create revenue; revenue funds more content (`loop`).
6. Stated revenue minus stated costs gives stated margin (`receipt`, with exact supplied values).

Reject business nouns without the described relationship. Do not loosen existing validators to admit fixtures; report actual ordinary-language selection gaps to the coordinator.

## Ownership and sequence

Coordinator owns shared types, rendering/validation helpers, registries, dispatcher, planner guidance, aggregate tests, integration and this record. After those contracts are implemented and tested, six non-overlapping bee lanes run concurrently:

- A: AgentWorkflowScene, technology/agent-workflow pose/tests, kinds-agent-workflow spec/tests, technology-agent-workflow.json.
- B: RetrievalGroundingScene, technology/retrieval-grounding pose/tests, kinds-retrieval-grounding spec/tests, technology-retrieval-grounding.json.
- C: ContextWindowScene, technology/context-window pose/tests, kinds-context-window spec/tests, technology-context-window.json.
- D: SoftwareReleaseScene, technology/software-release pose/tests, kinds-software-release spec/tests, technology-software-release.json.
- E: RequestRoutingScene, technology/request-routing pose/tests, kinds-request-routing spec/tests, technology-request-routing.json.
- F: business-scenarios.test.ts, business-scenarios.json, business-scene-recipes.md only.

A seventh lane owns manifest/coverage, pose selection, verification options and the existing systems/e2e harness plus co-located tests. Original 54 targets remain mandatory; 5 kinds + 15 presets extend the explicit manifest. Coordinator runs expensive renders centrally, collects all agents, then obtains an independent read-only integrity/clarity review. No commits, publishing, dependency changes, broad formatting, or concurrent renders.

## Verification contract

Parser tests cover every preset, unsupported claims/negation, labels, indices, non-finite/reversed/compressed beats and final holds. Poses are sampled through full timelines, exact boundaries, repeated and shuffled seeks. Integration tests cover nonzero timestamp rebasing, chaining, segmentation, caption/layout/SFX preservation and longform speaker fitting.

Native evidence matrix: all 15 technology presets and six business fixtures in vertical stack and landscape over, with harness contrasting palettes; representative stack-flipped, longest labels, and supported production palettes. Every technology preset gets a full-motion clip. Real short-form/longform fixtures include captions and existing SFX. Determinism and ProRes alpha use the existing verifier, normal Windows browser settings (no POSIX software-raster override). A local captioned showcase identifies all footage as examples.

Applicable media accessibility checks: contrast, readable hierarchy at phone scale, non-color status, caption separation, meaningful sequence, adequate holds and no rapid flashing. Existing caption/transcript plumbing remains authoritative; no player/UI controls are changed. Keyboard/focus, touch targets and interactive reflow are not applicable to these fixed-resolution video scenes. No WCAG/ADA conformance claim. Rendered quality, live model selection, narration listening and other hardware are unverified until actually exercised. One focused visual correction pass, then re-render affected cases. Artifact paths, hashes, render duration and resource observations will be recorded rather than inferred.

## Toolchain and baseline evidence

Fresh baseline directory: `C:/Users/Groot/AppData/Local/Temp/causal-tech-baseline-Ciaf8P`.

- Clean checkout confirmed before work. Actual runtime: Windows x64, Node 22.18.0, npm 10.9.3 (the earlier plan's 22.22.1 observation was not the runtime used here).
- Staged `npm ci --ignore-scripts --no-audit --no-fund` to inspect pinned install source, then full `npm ci --no-audit --no-fund --foreground-scripts`. Both succeeded. Electron 34.5.8 native dependency rebuild completed, no extra system software requested.
- Inspected Electron/@electron/get GitHub artifact download, better-sqlite3 prebuild/node-gyp and Electron header fallback, ffmpeg-static b6.1.1 GitHub artifact download, esbuild platform-package fallback, protobufjs local postinstall, and electron-builder's rebuild entry. No new packages or lockfile changes. Deprecation warnings recorded, no dependency upgrades attempted.
- Installed locked Remotion 4.0.496 CLI source provided `browser ensure`; downloaded its pinned Chrome Headless Shell 146.0.7644.29. Real `openLocalBrowser()` open/close succeeded under normal Windows ANGLE configuration.
- `ffmpeg-static` binary reports FFmpeg 6.1.1; installed ffprobe binary runs. No global FFmpeg installed.
- Baseline `npm run check`: failed, 748 errors / 118 warnings, dominated by existing checkout CRLF formatting. No whole-repository formatting performed.
- Baseline root typecheck and standalone Remotion typecheck: passed.
- Baseline main tests: 2037 passed, 2 failed, 5 skipped. Both failures are pre-existing Windows/POSIX path expectations in `promo/brand-pack-loader.test.ts`. `npm test` therefore did not launch renderer tests.
- Renderer suite run separately: 330 passed, 3 timed out (ClipDetail caption selection, ClipGrid fixture cards, DropScreen file drop). React act warnings also recorded. This baseline ran alongside the baseline build; no timeout/assertion was weakened.
- Baseline build: passed including the Remotion bundle. `gates.log` and `renderer-tests.log` hold results. Test-induced snapshot line-ending normalization was restored; no source content change.

## Implementation and final evidence

**Visual direction corrected during step 13; verification is still in progress.** The user rejected the initial flat 2D previews relative to the existing polished 3D library. Those renders are NOT visually approved or finished. The coordinator over-applied the plan's 2D/2.5D allowance and failed to preserve the intended tactile/clay art direction. The user approved a representative clay 3D checkpoint and subsequently explicitly requested parallel agents to finish the remaining work. Keep the validated scene/planner contracts; rebuild the visual presentation with the existing sculpted materials, lighting and frame-driven motion. Steps 13–15 remain incomplete until fresh evidence and final review exist.

The retry checkpoint at `C:/Users/Groot/AppData/Local/Temp/batchclip-systems-check-8wS26M/` rendered 27 native 1080×960 stack frames with normal Windows ANGLE. This was still-only evidence, not motion, determinism, alpha, or final visual approval. Inspection found pale text blending into the bench and the close camera clipping the bench. The focused correction uses medium clay surfaces, paperText for the moving source label, an offset check label, and bounded camera framing. A new all-frame projection regression covers the workbench corners. Existing `MechanismStage`/`Stage3D` defaults remain unchanged; explicit `bobAmount={0}` permits exact static final holds.

Corrected retry checkpoint: `C:/Users/Groot/AppData/Local/Temp/batchclip-systems-check-S8zH3A/report.json` passed 27 critical frames in serial/shuffled/parallel order (81 PNG executions) and a complete 345-frame, 11.5-second 1080×960 ProRes 4444 movie. Decoding confirmed 345 frames and opaque alpha for the stack stage; transparent-over alpha is not proven by this case. The movie render took 39.94 seconds; complete check 109.80 seconds. Peak observed coordinator Node RSS was 369,315,840 bytes, explicitly excluding Chrome/FFmpeg descendants on Windows. Camera/pose/boundary targeted tests passed 40/40; scoped Biome, standalone Remotion typing, and production build passed before the subsequent parallel drafts. The silent, clearly labelled `agent-retry-preview.mp4` retains 1080×960 at 30fps. A 1fps decoded contact sheet and native stopped/retry frames were visually inspected: bench clipping and label contrast corrected, distinct setup/front/release views, no success at the failed stop, and settled final state. This is one checkpoint, not approval or complete coverage for all scenarios.

Concurrent spatial/cognition additions appeared in shared registry/types during the visual reset. The user explicitly authorized preserving both batches and making only necessary shared integration adjustments. The transient native-loader failure from extensionless runtime type-module imports was corrected by that workstream before this coordinator's guarded edit could apply; no unrelated additions were reverted. Final checks must wait for a fresh complete bundle and report external workstream failures separately.

Parallel visual-reset ownership: retrieval, context, software, and request-routing each have a separate renderer/camera lane. The coordinator owns AgentWorkflowScene, shared integration and all real renders; a separate harness lane owns only `showcase.mjs` and its tests. The shared 3D kit `technology/clay.tsx` exports ClayPart, CheckSeal, and StopSeal. All lanes use one existing canvas per scene and retain authored labels, outcome prerequisites, dimensions, and layout/transition ownership. No dependency changes or commits.


### Fresh visual-reset gates and evidence in progress

- Four parallel renderer lanes delivered clay retrieval shelves/answer lectern, context tray/archive, release workbench/test gates, and request switchboard/cache shelf. A fifth lane delivered the local showcase CLI. Existing parser and pure-pose contracts remain intact.
- Retrieval selected-count copy and deterministic bounded source/excerpt wrapping at 24px/26px have 65 passing parser/pose/camera/text tests. Projection checks retain the title-safe boundary. The exact-kind integration guard now exercises typed bodies for the concurrent families too: 42 passing tests. Harness selectors explicitly include the two authored technology boundary fixtures instead of assuming one fixture per preset.
- Fresh logs: `C:/Users/Groot/AppData/Local/Temp/causal-tech-final-iHrBeQ/`. Root typecheck, standalone Remotion typing, production build and scoped Biome (40 files) passed before visual corrections. Main: **3,242 passed, 2 known Windows path failures, 5 skips**. Harness: **79 passed, 4 existing POSIX-only skips**. Default parallel renderer: 328 passed, 5 failures under load; failing files passed alone, and the full `--fileParallelism=false` run passed **333/333**, without changing assertions/timeouts. Latest global Biome: **723 errors / 118 warnings**; unrelated files were not reformatted.
- `showcase.mjs` was exercised on the retry checkpoint, not only mocks: `C:/Users/Groot/AppData/Local/Temp/batchclip-showcase-Zbmf1y/showcase.mp4` and hash-linked manifest. Its complete 345-frame silent output passed dimension/rate/frame-count probes; the final captioned frame was inspected. This is not the final 15-scenario showcase.
- First full native stack batch used an immutable copied production bundle at `causal-tech-final-iHrBeQ/render-bundle`, SHA256 `8d50911fe9a79e4ad7e45ca28360f25fb3b33a6c5474c42e39136c2011c26bcf`. Copy/source/destination digests matched; renderer-source hashes are saved beside it. Normal Windows ANGLE, no software-raster override.
- That batch **failed** at context summarisation frame 136 after seven earlier presets passed repeated-frame checks. It is not a passing full-batch report. The browser closed. Pixel comparison isolated 40 changed pixels, maximum 1 RGB level, on the translucent summary paper. A focused real-render reproduction produced 12 distinct hashes in 12 renders in 15 seconds. Making the paper materials opaque produced 12 equal hashes with unchanged poses; the final fix uses the same bounded reveal amount to scale opaque paper rather than fractional material blending. Its final-scale reproduction and full matrix must still pass.
- First-batch visual inspection also found retrieval secondary status captions overlapping shelf/clipboard edges. The focused correction uses a single source-status heading and one answer-workspace heading, removing redundant overlapping copy. These context/retrieval corrections require a new bundle and affected renders. Other native, boundary, alpha, production/SFX and independent-review evidence remains pending. Steps 13–15 are not yet complete.

Shared contract frozen after step 3: `technology/types.ts`, `stage.tsx`, `primitives.tsx`, `motion.ts`, and `ai/explainer/technology-contract.ts`. Public render primitives: TechnologyStage, TechText, StatusMark, DocumentCard, RequestToken, Port, Gate, Connector, Outcome. Public pose helpers: unitProgress, phaseProgress, mixNumber, travelPoint, contactOffset, revealAt. Validation: technologyStory, technologySource, technologyPhrase, technologyEvidence, technologyClause; reuse mechanismIssue/sourceLabel/makeParseContext.

Family-only fields: agent `toolLabel`; retrieval `sources: {label, excerpt}[]` (0/1/2 by preset); context `detailLabel`, `memoryLabel`, optional `summaryLabel`; software `checkLabels` (1/2), optional `previousVersion`; routing `serviceLabel`, optional `fallbackLabel`. Actor labels max 22, excerpts max 40. Poses export camelCase family name + Pose, accepting `(scene, timeSeconds)`; renderers export named PascalCase family + Scene. Specs export upper-snake family + `_SPEC`.

Technology fixture names are `${kind}-${preset}`. Each declares kind coverage plus `{category: "technology", id: "${kind}/${preset}"}`, cases vertical-stack and landscape-over, and before/on/after contacts plus final-hold samples. Include source example material as fixture metadata (`sourceText` and `raw` or word timings as needed) and exercise actual parsers in co-located tests. Harness will strictly match technology kind/preset pairs.

Step 3 evidence: scoped Biome check passed (seven new files; three formatted and re-read), 17 shared validation/motion tests passed, standalone Remotion typecheck passed. No new canvas, timer, external I/O or growing collection was added. Engineering controls for AI-generated media are source-bound facts and retained conditions; this is not legal advice or a compliance assessment. Baseline and older causal-library notes are not evidence that the new scenes look correct.

Steps 4–10: all five renderer/spec/pose lanes, all 15 technology fixture presets, and six business recipes implemented. Six agents worked on non-overlapping files; initial 10-minute worker limits left drafts, then the same workers resumed with narrower fixture/test briefs. No commit, install, or render occurred in implementation lanes.

Integration registered each kind once, added each to the scene union/causal set/dispatcher, and added concise planning/review guidance. `tsconfig.node.json` explicitly includes the new React-free types/agent timing/motion dependencies required by its existing allowlist. TechnologyStatus lives in React-free types, avoiding a DOM dependency in the main-process compiler. Existing target libraries were preserved; two tests use copied-array reverse rather than ES2023 toReversed.

Regression evidence includes all 15 fixtures through the real outer planner at nonzero timestamps, not just direct parsers; exact-kind causal glue tests cover captions, segmentation, source SFX, mixed-family chains and speaker-window rejection. Existing short/longform test files needed no duplicate cases because `causal-integration.test.ts` exercises those production paths for every new kind. Shared entrance padding and millisecond rebase precision remain unchanged and are explicitly accounted for in expected values.

Concrete integration corrections: agent triggers now require agent/tool relationships rather than a lone agent/retry/approval noun. Bounded business waste/capacity triggers cover the two real selection deficits without changing caps or validators. Context memory-retrieval word spacing is 0.28s, leaving room for the outer planner's padding inside the unchanged 12-second maximum. Critical-frame metadata and exact rounded source-time expectations were updated together.

Latest integration checks: root and standalone Remotion typing passed; 138 agent/pose tests passed after the React-free type correction; 149 context/outer-planner tests passed after fixture correction. Business 65/65, shortlist 160/160, and causal integration 28/28 passed in the preceding affected runs. The aggregate targeted run had 1390 tests; its two then-failing context fixture assertions were subsequently corrected and rerun. Step 12 subsequently ran all project gates: root and Remotion typing and production build passed; main suite 2558 passed, the same 2 baseline path failures, 5 existing skips; renderer suite 330 passed and the same 3 baseline timeouts. Global Biome still fails (727 existing-format errors, 118 warnings); scoped changed-file Biome checked 57 files successfully. Harness suite: 61 passed, 4 existing POSIX-only skips, zero failures. Evidence: `C:/Users/Groot/AppData/Local/Temp/causal-tech-gates-W3A5zQ/`. Initial native preview artifacts: `C:/Users/Groot/AppData/Local/Temp/batchclip-systems-check-FykEqD/`; interrupted and visually rejected, not completion evidence. That initial run's POSIX RSS sampling does not work on Windows; the subsequent harness fix explicitly measures coordinator Node memory only. Full-motion, alpha/determinism, production e2e, showcase and independent final reviews remain incomplete.
