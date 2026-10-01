# Planner quality verification — 2026-10-01

## Evidence status

Implementation follows the approved `.ezcoder/plans/2026-10-01-planner-quality-evaluation.md` and the later user-authorized GG alternative. **No live ChatGPT or Gemini generations have been made in this evaluation.** The current route is the isolated GG ChatGPT OAuth helper; the unfinished native Codex build is superseded. There is no measured model winner. Authored response replays test policy and parsing, not planning quality. Current GG evidence and limits are recorded at the end; earlier results below remain historical evidence, not fresh GG validation.

- Implemented: injectable generation, versioned profiles, source-backed optional quotes, no compulsory automatic quote slots, stable split-screen policy, semantic offers/outlines, diagnostics, bounded recent-use history and reservations, offline CLI/replay, saved-plan no-AI rendering.
- Focused checks observed: 2,702 main/shared tests across 39 files, 13 renderer pipeline-store tests, then additional/finalized pipeline and evaluation checks (see final gates below).
- Main project TypeScript passed. A separate program including the main project's ambient declarations and the opt-in adapters also passed; an earlier ad-hoc check omitted those declarations and was corrected rather than changing project types.
- Four no-AI production render controls passed and were visually inspected, including one using the provided real video. They establish rendering/policy behavior, not a live planner-quality winner.

## Historical restricted connector follow-up — superseded

The user first authorized a restricted local Codex build from pinned official source. That native build was not completed, and the user later approved the GG route instead. This history does not authorize API billing, credits, credit purchases, overages, paid-provider fallback, tool execution or inherited instructions.

The earlier TypeScript connector used a reviewed executable SHA-256, selected reasoning level and explicit automatic-credit-reload-disabled attestation. Its strict account policy required ChatGPT auth, backend `ordinaryUsageAllowed: true`, no funded/unlimited credits, model/reasoning availability, Standard tier and zero tools/inherited inputs. Its generation/account tests used **fake native responses**, not real Codex. The current adapter retains these boundaries but launches the fixed GG helper, not a native executable override.

The runner reserves attempts before dispatch, stops on unknown/error/limit outcomes, preserves immutable/resumable artifacts, and can replay saved live-shaped responses offline. Saved-plan render identity is forwarded without authentication or replanning.

**Native build history (not a GG prerequisite):**

- Source checkout: `01fc69f4026735edfdf6789820549727a4867b11` (`rust-v0.159.3`) in `%LOCALAPPDATA%/BatchClipPlannerTools/codex-planner-text-only-v1/source`. No restricted source patch, compiled executable or native isolation test was produced.
- Rust/MSVC tools were installed. A dependency fetch stopped on Windows `Filename too long` in a fetched `rules_rust` submodule; external `PROVENANCE.txt` and `dependency-fetch.log` retain the evidence. No global Git configuration was changed.
- EZ Coder denied outside-workspace source edits (`allowOutsideWorkspaceWrites`), and that permission question was dismissed. The guard was not bypassed. This abandoned build is not resumed by the GG implementation.
- Automatic credit reload is still **not confirmed disabled**. Permission to use ChatGPT is not that confirmation.

Earlier native-connector verification (before the GG replacement):

| Check | Actual result |
| --- | --- |
| `npm run check` | Pass; 120 existing warnings and 5 information diagnostics. |
| `npm run typecheck` | Pass. |
| `npx --no-install tsc -p tsconfig.remotion.json --noEmit` | Pass. |
| Focused evaluation/generation/no-AI render/pipeline tests | 403 passed across 13 files. Includes 350 evaluator tests; real Node subprocess stdin/cancellation/output-cap checks; fake-Codex live-path checks. |
| `npm run build` | Pass including Remotion; existing Browserslist notice. This is the **application build**, not a restricted Codex build. |
| `npm run eval:planner` | Pass; no-network schedule in `%TEMP%/planner-eval-run-qL4xdK`. |
| Authored-response replay, one repetition | Pass in `%TEMP%/planner-eval-run-KBN9UW`; no inference. |

Full `npm test`, renderer UI tests and visual render proofs were not repeated for this connector-only follow-up; their earlier measured results and limits remain below. The saved-render identity forwarding regression is unit-tested, not a new native render proof. No checks were skipped or assertions weakened to get these scoped results. No commit or deployment occurred.

## Corpus and privacy

The untouched autosave snapshot was 283,831 bytes (SHA-256 `8575aab5117ebffec266f4b6c04d6dabbb9ed3e20bca97541d1f0a938d7e96b3`); allowlisted inspection found no eligible timed clips. The original project was not loaded through migration/save routines.

The repository's authored manifest has 6 discovery and 2 holdout clips: consecutive process explanations; ordinary speech; a genuine takeaway; no useful animation; business-owner bottlenecks; AI test-versus-training; conflicting evidence; quiet observation. These are synthetic controls.

The external mixed manifest replaces two discovery controls with excerpts from the user's provided video. Retrieval used the existing `python/download.py`, unchanged. Local cached Parakeet TDT v3 produced 373 timed words for the first 120 seconds; timing is not manually certified. Both real excerpts share one source/topic and remain discovery-only. Held-out coverage is synthetic, not a real-source generalization test. The mixed manifest's media reference objects were corrected to the parser's opaque ID schema; no validation was relaxed.

Source video, audio, transcript, project snapshot, private corpus and all run/render artifacts stay under owned temporary directories outside git. No Gemini key file or OAuth token file was read/copied for this route.

## Historical stock Codex identity and access boundary

- Official user-local package: `@openai/codex@0.159.3`, registry provenance saved in `planner-eval-evidence-BF8UTs/codex-provenance.json` under the OS temp directory.
- Binary version observed: `codex-cli 0.159.3`.
- Stock binary SHA-256 remeasured: `57e1bdab42c0559a74558ca17e85d5c7893caa5f1e582f67e9ddd6d97fa705a7`, matching the original provenance JSON. The previously written documentation hash and old hard-coded transport hash were incorrect; neither is reused as a restricted-build pin. This is a record/pin correction, not evidence that the installed binary changed.
- Official browser login succeeded; supported status reported ChatGPT authentication, not proof of allowance entitlement. Credentials were not inspected.
- Effective shell/file/MCP/plugin/hook/inherited-instruction isolation and an enforceable included-allowance-only contract were not established for the stock executable. It remains ineligible. Its login and token store are not reused by the dedicated GG adapter.
- Actual generation model/reasoning identity: **unverified; none selected or tested**. No model identity is inferred from login.
- Smoke test, matched live pilots, discovery matrix, finalist ablations and holdouts: **not run**. Live generation attempts: **0**. No paid fallback, purchases or overages.
- Reported subscription tokens, included usage remaining and actual charges: **not observed**. No claim of a billing audit, unlimited usage or a $0 bill.

## Offline trials and scoring

The repeatable named fixture is explicitly `provider: offline`, `model: authored-control-v1`, not Codex. The final full authored-control run produced 12 completed trials (4 cases × 3 profiles), 17 local phase-response attempts, and 12 scheduled cases without authored responses. An immutable-resume check compared every completed trial file's SHA-256 before/after rebuilding the report: all 12 were unchanged.

Final artifacts: `%TEMP%/planner-eval-run-LgFZhQ`. Run fingerprint: `e532a7239d967118bce2a9f34bea037f32eaa709c82251b3f37644cb249bf78f`; code fingerprint: `fc7d1df796ec4611640a667460c5c3b089f48fe617277c0c1c2f42be84024f40`. The history seed was empty. Default no-network scheduling also passed (`planner-eval-run-qM7r4s`). An additional private real-media control used two authored phase responses (`model: authored-real-media-control`), not inference. Earlier development runs are retained separately, not pooled as independent quality trials.

Representative saved responses, before rendering:

| Authored process control | Accepted scenes | Longest stable stack | Mechanical expectation |
| --- | ---: | ---: | --- |
| Baseline policy | 1 | 7.40 s | Fails the three-consecutive requirement |
| Content-led policy | 3 | 20.40 s | Passes |
| Semantic policy | 3 | 20.40 s | Passes |

Ordinary/no-animation authored responses remain empty. Content-led admits the exact-source takeaway quote; an empty semantic outline can validly yield no emphasis. These are ceilings, not quote quotas. Plan quote metrics count optional selections; baseline automatic rotation proposals are reported separately before splicing, and final rendered timelines/quote counts separately after encoding.

Blinded sheets omit profile IDs, model metadata and planner diagnostics; the profile map is separate. The fixed relevance/clarity/readability/pacing/restraint 1–5 rubric remains **unscored (null)**: no live planning quality was measured. No automatic proxy is promoted to a semantic score. Unsupported source binding is a disqualification rule, not a score offset.

## Live comparison decision (steps 14–15)

The user authorized the GG ChatGPT OAuth alternative after the restricted native build stalled. Offline connector checks and account eligibility must precede any real smoke call or matched pilot. No live discovery or holdout capacity was consumed; no ablations were justified. **No conclusive ChatGPT planner winner.** Production Gemini prompt/model quality is explicitly unverified. The semantic profile is experimental, not a verified production Gemini choice.

## Render evidence

All paths below are relative to the OS `%TEMP%` directory. Each output directory contains `preview.mp4`, `render-proof.json`, `media-check.json`, `bundle-identity.json`, boundary PNGs, `contact-sheet.png`, and a separate `visual-inspection.json`.

The built Remotion snapshot was `explainer-stills-2pjnp9`, SHA-256 `0629fe79f1c9872874dd9d49e28d24522fd0b9e1cd85f283c24f7d37b1a8907c`. Its hash was checked before/after each export. These controls ran before the production-default switch; they explicitly selected the same content-led policy later enabled for short form. No Remotion assets were changed by this task.

| Control | Output directory | Successful animations | Final quotes | Video / audio seconds | Render test elapsed |
| --- | --- | ---: | ---: | --- | ---: |
| Authored baseline process | `planner-eval-run-4Ptj8d` | 1 | 2 automatic | 24.066667 / 24.088000 | 27.0 s |
| Authored content-led process | `planner-eval-run-a1zZ2I` | 3 | 0 | 24.033333 / 24.041000 | 41.3 s |
| Authored takeaway | `planner-eval-run-EfEw1d` | 0 | 1 selected | 18.066667 / 18.054667 | 11.7 s |
| Authored control on real video | `planner-eval-run-SANQIH` | 1 laptop | 0 | 17.333333 / 17.342000 | 30.2 s |

All four assert zero paid-provider boundary calls, 1080×1920 at 30fps, expected successful animation identities, and A/V duration difference ≤0.12 seconds. The largest observed A/V difference was 0.021333 seconds. No full-frame black interval ≥0.05 seconds was detected at the declared threshold. Frame extraction now uses the actual video frame count, not padded AAC/container duration, and asserts that every requested boundary image exists.

Visual observations: statement → flow → checklist stays in one upper `stack` stage for 20.40 seconds, with the synthetic speaker below; the baseline instead switches to unearned full-screen emphasis on ordinary words. The selected takeaway uses the existing readable italic word-by-word treatment. Real footage remains visible before/after and beneath the laptop animation, with readable sampled captions and a visible speaking face. Opening and ending speaker footage were retained. This is sampled inspection, not an exhaustive readability, face-tracking or lip-sync certification. The synthetic source watermark overlaps captions in that fixture; blank contact-sheet cells are unused tile padding, not blank video frames.

The synthetic media contains a quiet test tone, not speech. A volume probe measured source peak −57.4 dB versus −12.6 dB after production scene-SFX mixing in the initial process proof (`planner-eval-run-gYkKEQ`). This supports execution of that audio path, not an audio listening/quality audit. All render latency figures are local test elapsed times, not model-generation latency or fair cross-model performance comparisons.

The real-media artifact is retained in `planner-eval-run-auecRj` with trial `8c31891703e7eaf9fa5ad396b823d23938fa54281dde5150b1733bc4bf8f58b4`; its external seeding adapter is under `planner-eval-real-media-control-b8a4ae03`. It matched exact timed source words and made no quote selection. It is **authored manual evidence**, not a live finalist.

Development failures were retained rather than overwritten: an older run was rejected when other workspace Remotion files changed its fingerprint; the first native harness lacked `setupFFmpeg()` and failed to locate ffprobe. Both were diagnosed without weakening checks. No live finalist plans existed to render.

## Earlier full-project gates and production policy

| Command / check | Actual result |
| --- | --- |
| `npm run check` | Pass; existing warnings/information remain. |
| `npm run typecheck` | Pass. |
| `npx --no-install tsc -p tsconfig.remotion.json --noEmit` | Pass. |
| `npm run build` | Pass, including the Remotion bundle; existing Three CJS / Browserslist notices remain. |
| `npm test` (main leg) | 4,952 passed, 2 failed, 5 existing skipped; 205 files passed, 1 failed, 1 skipped. The failing main leg prevents npm's chained renderer leg. |
| `npm run test:renderer` separately | 347 passed; three cold/parallel 5-second timeouts in ClipGrid, ClipDetail and DropScreen. No assertions or timeouts were relaxed. |
| `npm run test:renderer -- --maxWorkers=1` | 350 passed across 63 files; 173.72 s. |
| Opt-in adapter TypeScript program with main ambient declarations | Pass. |
| `node scripts/explainer-stills/verify-systems-e2e.mjs --concepts --unit` | Pass for production planner/pipeline integration; 1 passed, 1 existing opt-in media test skipped by `--unit`. Native media evidence is the four separate controls above. |
| Final dry-run, authored replay and resume | Pass; 12 completed trial hashes unchanged. |

The two persistent main failures are `src/main/promo/brand-pack-loader.test.ts` expecting `/packs/assets/skool-about.png` while Windows returns backslashes. Both that test and `brand-pack-loader.ts` match the starting SHA-256 exactly. They were not edited, skipped or suppressed. Initial integration failures in face-placement tests were fixed by updating their planner mock to the richer edit-plan result, preserving all placement assertions. Tests intended to exercise the old rotation/variety now explicitly choose the baseline profile; new regressions verify the changed production default and unchanged long-form default.

Production short form now uses the provider-independent content-led editing policy: stable speaker-visible runs, bounded source-backed optional quotes, and valid empty review handling. New automatic segmentation omits compulsory quote slots. Gemini remains the production transport/model chain. Long-form defaults explicitly remain on the baseline policy. Semantic outlines/per-idea recency remain experimental, and `EVALUATION_DEFAULT_PROFILE` is null because no Codex winner was measured. History is derived, bounded, registration-owned, and persisted only after successful exports; uncertain composite fallback omits history rather than claiming a shown animation.

Starting substantive Windows/Python/FFmpeg/system-handler/long-form/error changes and `package-lock.json` were compared by hash and remained unchanged. The existing writable-output-path integration was preserved. Other concurrent workspace changes were not reset, formatted or claimed as this task's work. The final diff and affected tests were reviewed; no project, source video or export was deleted or migrated. No commit, deployment, new production provider, or release was performed.

Historical gate logs: local `.ezcoder/bg/3e6e0b3b.log` (full build/typecheck run), `73f4ed3e.log` (final checks/main/parallel-renderer results), `f7eb4d36.log` (serial renderer), and `dcf8cbae.log` (final replay/hash check), under the user's EZ Coder data directory, not git. They do not establish GG account eligibility or authorize paid fallback.

## GG ChatGPT alternative — current route

- Pinned isolated packages: `@kenkaiiii/gg-ai@5.67.1` and `@kenkaiiii/gg-core@5.67.1`, source revision `d7f3e960f03544554a6dbff3bc1c1ac9cf27c374`; nested lockfile in `scripts/planner-eval/gg-client/`. Installation disabled scripts and omitted optional dependencies. CI explicitly installs this nested lockfile for offline real-SDK tests; root application dependencies are not extended with GG.
- Fixed local Node helper, fresh temporary working directory, allowlisted environment and stdin prompt. GG-managed OAuth uses only a dedicated home-relative auth path. No GG coding-agent loop, tools, inherited project inputs, API-key route or paid backup. No existing token files were read/copied.
- Before each inference: fresh account/catalog checks, raw `rate_limit.allowed === true`, explicitly empty/non-unlimited credit wallet and user attestation that automatic credit reload is disabled. Unknown data refuses generation. No automatic-reload getter was verified; quota percentages and login do not establish permission.
- GG omits `service_tier`, matching pinned official Codex's Standard-request mapping (`ModelInfo.service_tier_for_request`); explicitly non-default response tiers are rejected. This is request-configuration evidence, not a billing guarantee.
- New live runs default to `gg-chatgpt` and reject native executable/hash overrides. Transport/client identity is fingerprinted and checked on saved responses. Offline replay remains offline; saved-plan rendering forwards GG or legacy transport identity without starting a model. Old fingerprints are not silently migrated.
- The backend `chatgpt.com/backend-api/codex/responses` is an **internal endpoint**, not a stable public subscription API. Endpoint schemas, model availability and compatibility may change.

No GG sign-in, real account-preflight request or live model generation has occurred. Account-setting confirmation, managed login, observed account eligibility, then one bounded smoke trial remain prerequisites to matched live comparisons. Production Gemini remains unchanged by this connector replacement.

### Final offline GG verification (1 October 2026)

**Runtime evidence** — current connector checks:

| Check | Result |
| --- | --- |
| Focused planner/evaluation and render regressions | **512 passed across 15 files**, including **108 helper tests** with real-SDK streaming/refresh cases |
| Full Biome check | Final standalone `npm run check` passed; 119 existing warnings and 5 infos remain, with no configuration suppressions |
| `npm run typecheck` | Passed |
| Opt-in evaluation/render TypeScript | Passed with the node configuration plus both script entry points, `allowJs: true` for their MJS imports, and no emit |
| Actual helper `--version` subprocess | `batchclip-gg-chatgpt 5.67.1`; no auth/network operation |
| Default CLI | Dry-run only, 48 scheduled trials, **zero attempts** |
| Authored-response replay, one repetition | 12 fixture-supported trials completed, 17 authored phase calls; the other 12 trials remain scheduled without fixtures. No real generation |
| Isolated dependency audit (`--omit=optional`) | Zero reported advisories at check time; not proof of absence of defects |

The focused command was:

```sh
npm run test:main -- src/main/ai/planner-eval src/main/ai/explainer/planner-generation.test.ts src/main/ai/explainer/planner-profiles.test.ts src/main/render/planner-pipeline.test.ts src/main/render/explainer-scenes.test.ts src/main/render/quote-graphics.test.ts
```

Verification caught and fixed three concrete integration defects before live use:

- Raw final SSE snapshots could disagree with SDK-accumulated text while leaving valid but incomplete JSON. Failing real-SDK regressions reproduced the issue; bounded item/content identity and final-text checks now reject mismatches, duplicate identities, omitted terminal items and post-final mutations. Consistent final-only text and legitimate final suffixes remain supported. An independent offline recheck also exercised this path.
- Saved-plan rendering did not accept/forward the new transport flag. Failing CLI regressions now pass for GG and legacy identity; the render adapter validates the field without authenticating or generating.
- Dot-prefixed home directories such as `..auth-home` inside the repository bypassed a lexical containment test. Two failing regressions now pass with path-segment-aware checking; a valid external home remains accepted without opening a credential store.

Offline tests also cover compressed planner-size requests, actual SDK token normalization, fresh messages/sessions, explicit ordinary-usage permission, credit/attestation refusals, endpoint/method restrictions before credential egress, no provider fallback, output/time/cancellation bounds, and no CLI auto-start on import.

Final standalone recheck logs: `%USERPROFILE%/.ezcoder/bg/c489437a.log` (512 tests), `c52acc94.log` (project typecheck), `a448086d.log` (full Biome), and `6d5299c2.log` (offline authored replay, artifacts in `%TEMP%/planner-eval-run-znPWPS`). Each command ran independently and exited 0. Earlier logs: `95297b1c.log` (combined checks and opt-in script typing) and `4b9945d1.log` (version, dry-run, replay). An earlier full Biome invocation reported three errors; subsequent read-only full reruns passed, and no unrelated formatting fixes were applied. An initial ad-hoc script typecheck lacked MJS support; the final check uses `allowJs` without changing project settings or adding suppressions.

Final artifacts outside git: `%TEMP%/planner-eval-run-zNFxUM` (dry-run) and `%TEMP%/planner-eval-run-qwS6U7` (authored replay). Both report code fingerprint `b3edf6b463de46b0039d8c87dfabf6cd49e0487d7577cb5a6588774bcac201a5`. These are authored/offline evidence, not account or model-quality measurements.

**Not re-verified in this GG pass:** live browser/OAuth operation, real account eligibility/charging, upstream model identity beyond its catalog slug, full-app media exports or the entire app test suite. Earlier build/render/full-suite results above are historical, including the two known Windows-path assertions; they were not silently promoted to current GG proof. No commits, publication, package fallback, purchases or account-setting changes were performed.