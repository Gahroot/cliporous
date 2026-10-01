# BatchClip guided editorial workflow: implementation plan

Date: 2026-10-01

Research: [Refero UX research](../research/refero-ux-research-2026-10-01.md).

User decision: preserve all current working-tree changes as the baseline, then plan and execute the UX improvements on top. Do not commit, discard, install, publish, or run paid AI work.

Status: **all six implementation steps completed and locally verified within the documented scope**. Renderer: 557 passing tests. Lint, typecheck and build pass. Two unchanged Windows-specific main-test failures remain; this is not a fully green release gate. See the [verification report](refero-workflow-verification-2026-10-01.md) for per-step evidence, screenshots and native/accessibility limits.

## Outcome

Make BatchClip's existing capabilities read as one workflow:

**Choose an outcome → inspect source-backed suggestions → make explicit decisions → export a defined set → repair exceptions without losing context.**

Short-form remains the primary 1080×1920 path. Long-form keeps source-ordered, source-grounded scene plans and approval gates. These are application workflow improvements, not a replacement editor or a new visual brand.

## Baseline and preservation

- Current changes are authorized as the starting point, not changes authored by this pass.
- Renderer, DESIGN.md and shared types copied to `C:\Users\Groot\AppData\Local\Temp\batchclip-ux-baseline-SxbLJG` before application edits. This is a code comparison snapshot, not a user-data backup or a tested recovery system.
- Baseline: `npm run typecheck` passed.
- Baseline: `npm run test:renderer -- --maxWorkers=2` passed, 67 files / 413 tests.
- Baseline: `npm run check` passed with 120 warnings and 5 infos. No fixes applied.
- Use the installed toolchain. No dependencies, database migrations, project-file format changes, or model/pipeline redesigns are required.

## Resolved design decisions

1. Preserve warm light surfaces, dark mode, violet primary actions, existing typography, Lucide icons, and the current screen-transition budget.
2. Render preview, AI regeneration, and full export always require an explicit user action. Selecting a scene must never render it.
3. Keep source-order scene navigation. Do not add arbitrary reordering or narration rewriting.
4. Distinguish selected, included, preserved, draft, approved, and rendered states. No checkbox is treated as plan approval.
5. Keep version snapshots, restoration, feedback, validation, output checks, missing-source handling, and approval invalidation.
6. Creative Brief is offered only where currently consumed. Long-form explains its actual transcript/scene-feedback guidance; we will not expand the model contract just to justify an input.
7. Use the current project/preset settings model honestly. Do not claim project-only settings when the operation also changes remembered defaults.
8. Introduce only bounded transient source/scene focus for cross-screen navigation. Do not migrate saved projects for a UI selection.
9. Preserve one active media preview. No eager preview grids, background render fan-out, synthetic progress, new telemetry, or signup/collaboration features.

## Step-by-step execution

### Step 1. Shared integration rules and baseline

Owner: parent agent.

- [x] Read the current research and source conventions; confirm preservation of the dirty working tree.
- [x] Snapshot the baseline and run existing type/lint/renderer gates.
- [x] Add a source-scoped, transient long-form review target and validated navigation action.
- [x] Navigation must not change a plan, approval, render reconciliation, completed output, or feedback. It must refuse to interrupt active work and reject stale/foreign scene IDs.
- [x] Clear transient targets on project reset/load or source removal, and test these invariants.
- [x] Publish the narrow integration interface to the scene-review and render-recovery agents.

### Step 2. Convergent project entry and resumable work

Parallel workstream A, after baseline. Own entry/resume components and their tests only.

- [x] Route browse, file drop and YouTube intake into one compact confirmation with the source and output outcome visible before expensive processing.
- [x] Keep selected source through missing-key/local-tools preparation; cancel/back must not silently replace the current project.
- [x] Keep fast repeat use: reuse saved choices and avoid a separate onboarding wizard.
- [x] State the real Creative Brief applicability; hide/disable irrelevant inputs for long-form without erasing existing brief data.
- [x] Make new-project and quick-import paths converge, preserving the existing create/reset guard.
- [x] Reduce duplicate recent-project surfaces to one main library, retain search/filter/grid/list and recovery controls, and make the next action easier to scan.
- [x] Verify local, URL, drag alternative, cancel, missing-key, preparation, project-resume, and output-mode cases.

### Step 3. Focused clip review and explicit export scope

Parallel workstream B. Own ClipGrid, clip detail/selection controls and their tests only.

- [x] Retain current master-detail layout, keyboard review, stable selection, auto-advance, source transcript, bulk controls, undo and compare.
- [x] Make the default toolbar about finding and reviewing; move secondary display settings into an existing menu/popover pattern.
- [x] Make next-unreviewed progress and AI-suggestion status explicit without adding a second approval state.
- [x] Use export labels with counts and actual scope. All-clips export must disclose unreviewed/rejected inclusion before the existing confirmation gate.
- [x] Preserve selected items hidden by filters and show their count before selected export.
- [x] Add a safe actionable zero-results recovery path using existing processing/settings APIs, without automatic reruns or resetting useful source work.
- [x] Test standard/stitched items, hidden selection, empty results, rejection confirmation, busy guards, keyboard/dialog interactions and undo.

### Step 4. Long-form focused scene review and AI revision review

Parallel workstream C. Own CutPlanReviewScreen, LongformScenePreview, its composed review workspace/version dialog and related tests only.

- [x] Compose an ordered scene queue, selected source evidence, source playback and explicit draft-preview action.
- [x] Add previous/next scene navigation, clear included/omitted/preserved labels, and narrow-window layout with the selected context retained.
- [x] Separate source playback from rendered scene preview. Explain preview is a draft and not the complete export; include loading, failure and retry states.
- [x] Place the selected scene's evidence and key controls together; move plan-wide style/history/feedback details to secondary disclosure.
- [x] Preserve complete scene windows and any legacy-plan recovery path.
- [x] Make regeneration scope visible and show a generated revision as a draft requiring review. Offer comparison to its prior version with existing compare/restore behavior; do not auto-approve.
- [x] Present approval as continuing to export preparation, not as starting an export. Keep Reject and full-plan regeneration out of the primary visual competition.
- [x] Consume the parent's cross-screen focus target without affecting plan acceptance.
- [x] Test focus/selection after edit, omit, restore, regenerate and recovery navigation; source/preview distinction; stale async completion; approval guards and keyboard operation.

### Step 5. Export, completion and direct exception recovery

Parallel workstream D. Own RenderScreen, CutPlanReconciliation, ExportPreflight and related tests only.

- [x] Show scope, count, fixed format and destination consistently before starting export.
- [x] Preserve key/source/disk checks, estimates, cancellation settlement, queue controls, and usable completed outputs.
- [x] Distinguish file completion from explanation completion, including an honest completed-with-changes state.
- [x] Link an affected scene in reconciliation directly to focused scene review through the shared navigation action.
- [x] Keep outputs/reconciliation available when reviewing a problem; do not call the existing destructive render-reset helper just to navigate.
- [x] Keep retry scoped to existing supported operations. Do not promise arbitrary single-scene final-output patching or unsupported background concurrency.
- [x] Test missing source/destination/disk, selected/all/approved counts, mixed outcomes, stale targets, active-work refusal and preserved output evidence.

### Step 6. Settings scope, integration and rendered verification

Owner: parent agent, after the independent changes settle.

- [x] Clarify current/project/default/preset action scope in the existing creator-profile/settings surfaces; preserve saved profile values and missing-asset checks.
- [x] Resolve cross-workstream integration, reuse primitives, inspect the actual delta against the baseline, and eliminate contradictory labels or duplicated controls.
- [x] Add/extend honest local QA states for scene-first review and recovery using existing QA infrastructure; no live AI or paid render calls.
- [x] Verify representative light/dark, wide/narrow/resized, reduced-motion and long-content states in an actual browser. Use interaction checks as well as screenshots.
- [x] Check keyboard focus, accessible names/status, modal restoration, native media controls, long-text overflow and pointer/keyboard distinctions. Do not claim full WCAG conformance from this pass.
- [x] Run affected renderer tests and lint per workstream; run integrated typecheck, renderer and main suites, build, and repository lint gate. Record existing warnings separately from new defects.
- [x] Re-read after formatters and fix concrete failures. Review actual generated UI once, revise evidenced issues, then re-capture affected views.
- [x] Append the implemented design contract to DESIGN.md and record commands, screenshots, counts, residual limitations and completion status here or in a linked verification report.

## Parallel ownership and integration contract

All children work in-place on the approved baseline, with no commits or resets. Their owned files must not overlap. They read existing code before edits and must not format the entire project.

| Workstream | Owned files/subsystem | Must not edit |
|---|---|---|
| A | DropScreen, NewProjectDialog, CreativeBriefDialog, project library/contact-sheet entry/resume UI; their tests | Store/shared types, ClipGrid, long-form review, RenderScreen |
| B | ClipGrid, ClipDetail, ReviewSelectionToolbar and directly related clip-review tests | Entry, store/shared types, long-form review, RenderScreen/preflight |
| C | CutPlanReviewScreen, LongformScenePreview, new scene workspace, CutPlanVersionDialog and their tests | Entry, ClipGrid, store/shared types, RenderScreen/reconciliation |
| D | RenderScreen, CutPlanReconciliation, ExportPreflight, related render tests | Store/shared types, scene-review screen, ClipGrid, entry |
| Parent | Shared transient navigation/store reset integration, settings/profile scope, QA/fixtures, design/plan/evidence docs, final verification | Avoid child-owned files until completion or explicit handoff |

Proposed shared contract, to be finalized before child integration:

- `longformReviewFocus: { sourceId: string; sceneId: string } | null` in renderer state only.
- `focusLongformScene(sourceId, sceneId): boolean`: validates target and idle state, then routes to `ready` with focus. No plan or output mutation.
- `setLongformReviewFocus(...)` or equivalent narrow selection setter for review interaction, without navigation or persistence.

## Definition of done

- Every planned research pattern is either implemented through the existing system or explicitly documented as already satisfied / deliberately out of scope; no silent unfinished placeholders.
- Source intake does not start generation without the outcome being apparent; supported input guidance is honest.
- Short-form scope labels match the exact export batch, including hidden selections and rejected/unreviewed items.
- Long-form selection is stable, source evidence is next to the draft, preview is explicit, approval remains enforceable, and generated revisions remain reviewable/restorable.
- Completed output remains reachable while repairing an affected scene.
- Current settings and future defaults are not misleadingly labeled as different operations when the implementation shares them.
- User work is preserved; no dependency, schema migration, commit, publication, or live AI spend.
- Actual checks and limitations are recorded. Native Windows/Electron, GPU output, assistive technology and paid model execution are not called verified without direct evidence.

## Verification log

Implementation has not started at plan creation. Baseline results above are completed checks, not results for the changes that follow.
