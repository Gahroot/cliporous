# BatchClip guided workflow: implementation and verification

Date: 2026-10-01

Scope: [approved implementation plan](refero-workflow-implementation-2026-10-01.md), based on the [Refero research](../research/refero-ux-research-2026-10-01.md). This pass preserves the authorized dirty baseline; it does not claim authorship of all differences from git HEAD.

## Outcome

All six implementation steps are complete. Four disjoint UI workstreams ran in parallel; the parent integrated transient navigation, settings scope, QA fixtures, visible hierarchy changes and verification. Nothing was committed, installed, published or sent through paid AI generation. The repository-wide test gate is **not fully green**: two unchanged Windows-sensitive main-process assertions still fail.

| Step | Implemented result | Primary evidence |
|---|---|---|
| 1. Shared integration | Validated source/scene focus is transient, refuses active work and preserves plan, approval, versions, feedback, reconciliation and completed output. Reset, load, source removal and plan clearing discard focus. | `store/longform-navigation.test.ts`, `services/project-service.test.ts` |
| 2. Entry and resume | Browse, drop and YouTube intake converge on source/outcome confirmation. Imports add to the project; replacement remains guarded. Preparation/cancel retain source choice. One project library retains search, filters, grid/list and recovery. | `components/__tests__/DropScreen.test.tsx`, `NewProjectDialog.test.tsx`, `entry-source.test.ts` |
| 3. Clip review | Review-first toolbar, next-unreviewed context, secondary display options, hidden-selection counts, explicit approved/selected/all scope and actionable zero-results state. Existing keyboard, undo and stitched-item behavior retained. | `ClipGrid.test.tsx`, `ClipDetail.test.tsx`, render-service tests |
| 4. Scene review | Source-ordered queue plus focused workspace, previous/next, native source playback and timed transcript captions, explicit draft rendering, revision comparison, approval-to-preflight copy and existing legacy-plan recovery. | `CutPlanReviewScreen.test.tsx`, `LongformScenePreview.test.tsx`, `LongformSourcePlayback.test.tsx`, caption-track tests |
| 5. Export and repair | Scope/count/format/destination before export; completed files remain usable when explanations fail. Reconciliation links directly to the affected scene without resetting output evidence. Repairs require approval and a whole-video export, not unsupported in-place patching. | `RenderScreen.test.tsx`, `ExportPreflight.test.tsx`, `CutPlanReconciliation.test.tsx`, browser recovery proof |
| 6. Integration | Honest profile/default and Creative Brief applicability copy; production-component QA states; responsive, keyboard, playback and recovery proofs; updated design contract. | `CreatorProfileDialog.tsx`, `qa/`, evidence below, `DESIGN.md` |

Renderer-relative paths above start at `src/renderer/src/`.

## Visible revision after screenshot feedback

The initial pass was too similar to the baseline. The implemented revision changes composition, not the brand:

- Entry uses a compact Add footage / YouTube panel, distinct New project action, collapsed recipe settings and one recent-project library.
- Scene review uses a desktop scene rail and one selected-scene workspace; narrow windows use a native scene chooser. Source and rendered draft are separate views. Optional scene intent sits in a disclosure rather than repeating the transcript.
- Export reconciliation leads with the usable video and affected-scene actions. Full details sit behind a disclosure; reviewing does not destroy the completed file.
- Removed redundant initial preview status and repeated purpose copy. Cancellation remains announced while an invalidated preview settles.

Existing warm/white surfaces, dark tokens, violet actions, typography, Lucide icons and screen-transition budget remain authoritative. No new UI dependency or design-system fork was introduced.

## Final command results

Run on Windows with Node 22.18.0 and the installed toolchain, after the last application-code edit:

| Command | Result |
|---|---|
| `npm run check` | Pass; 119 warnings and 5 infos, no errors. Baseline was 120 warnings and 5 infos. No blanket fixes or suppressions. |
| `npm run typecheck` | Pass. This is the project's node/web solution, not standalone Remotion typechecking. |
| `npm run test:renderer -- --maxWorkers=2` | **75 files, 557 tests passed.** Baseline: 67 files, 413 tests. |
| `npm run test:main -- --maxWorkers=2` | **5,449 passed, 2 failed, 5 skipped**; 225 files passed, 1 failed, 1 skipped. |
| `npm run test:main -- --maxWorkers=2 src/main/ui-release-contract.test.ts` | 6 passed; rerun after the final preview-status adjustment. |
| `npm run build` | Pass, including Remotion browser bundle. Existing Browserslist data-age notice remains. |
| `git diff --check` | Pass. Git also emitted existing LF/CRLF conversion notices. |

Both full test suites, the affected main UI contract, lint and typecheck were rerun after the final application-code edits with direct npm commands. Results above are unchanged. Build also passed after the final application-code edit. No main runtime source changed in this pass.

### Remaining main failures

Both failures are in `src/main/promo/brand-pack-loader.test.ts`:

1. `appends captures and resolves relative media paths against assetsDir`
2. `SEED_MANIFEST resolves to a floating-card Skool CTA when merged`

The implementation uses host-native `node:path.join`; the assertions expect literal POSIX separators. On Windows the result is `\\packs\\assets\\skool-about.png`, not `/packs/assets/skool-about.png`. Both source and test have no diff against git HEAD. The same failures appear in the earlier `.ezcoder/tmp/longform-final-20261001/main-tests-final.log`, before this UX work. They were not rewritten or suppressed to manufacture a green gate.

Final direct-command test output is in background tasks `72fb2411` (renderer) and `6a633f67` (main) in the local EZ Coder logs; the main UI contract was also rerun directly and passed all six tests. Earlier retained logs: `.ezcoder/tmp/refero-ux/main-verification.log` and `renderer-verification-final.log`. Final build output is in task `94496163`. The five local harness scripts all pass `node --check`; capture, interaction, keyboard and native-media probes were also executed directly and passed.

## Browser evidence

Production React components, store and styles run against explicitly labeled QA fixtures and a synthetic local MP4 served with byte-range support. Native IPC is stubbed. Browser used installed Chrome through the already-installed sidecar Playwright; no package install was required.

Evidence directory: `.ezcoder/screenshots/refero-workflow/` (local-only, not a production asset).

- `capture-observations.json`: 21 captures across lobby, clips, scene review and changed-output export; light/dark, 1440px desktop, 900×640, 320px reflow, and 450×320 at 2× pixel density. No page exceptions or horizontal document overflow. Scene review opens with exactly one video and zero draft-render calls.
- `interaction-evidence.json`: source seeks to its absolute scene window and stops at the end; next-scene selection updates; rendering starts only after the explicit action; source/draft do not coexist; narrow resizing retains context; failed-scene recovery preserves serialized plan/output state; import cancellation retains source and current project.
- `keyboard-proof.json`: keyboard import, modal Tab containment and Escape focus restoration; Next retains keyboard focus; native scene selection works at 320px; source has native controls and a caption track; forced-colors/reduced-motion focus; navigation, playback and approval are reachable and hit-testable at 450×320.

Representative captures: `lobby-1440-light.png`, `scene-review-1440-light.png`, `scene-review-900-light.png`, `scene-review-320-light.png`, `scene-review-1440-dark.png`, `scene-export-1440-light.png`, `scene-review-forced-colors-keyboard.png`, `scene-review-short-height-approval.png`.

The `*-zoom-200.png` captures are a **browser reflow equivalent** (half-sized CSS viewport at 2× pixel density), not native Electron zoom or OS text-scaling proof. The initial QA zoom stub did not actually change browser scale; that probe was replaced, not counted as evidence.

## Changed-scope audit and limits

- **Code/tests:** source and scene IDs are checked before navigation; no arbitrary model-provided navigation or new main-process capability. Source URLs use the supported host allowlist and reject embedded credentials. This renderer validation is not a claim that the backend downloader has been security-audited.
- **Code/tests/runtime:** one selected media surface, no automatic AI/render work, bounded escaped caption tracks, cancellation slot retained until settlement and owned-preview cleanup. Browser counts verify media exclusivity, not native GPU/RSS stability or file-lock behavior in a packaged app.
- **Audit:** plan Steps 1–5 were independently checked against the saved baseline. A proposed feedback/reconciliation test gap was dropped: both fields live inside `longformPlans`, whose complete reference identity is asserted across the Immer navigation action.
- **Rendered rubric: 21/24.** Specificity 2, hierarchy 2, composition 2, consistency/flow 2, typography 2, surfaces 1, states 2, responsive behavior 2, accessibility 1, motion 2, authenticity 2, distinctiveness 1. Nested existing surfaces and inherited visual motifs remain; accessibility has the evidence limits below. The revision removed redundant copy rather than adding decoration.
- **Pass in this browser scope:** explicit-cost boundaries, outcome/scope visibility, selected context, usable-output recovery, media exclusivity, keyboard/modal behavior, reduced-motion and measured viewport overflow checks.
- **Not verified in this pass:** packaged Electron on either OS, native file dialogs/IPC/zoom, live AI suggestion quality, real final FFmpeg/Remotion export, native screen readers, full changed-scope WCAG criterion/contrast audit, localized/RTL/no-hover input, long-session memory/GPU usage. No accessibility-conformance, security-certification or release-readiness claim follows from these tests.

This is implemented and locally verified within the stated scope, not committed or released. The two unrelated main failures and the unverified native/accessibility checks remain explicit release limitations.
