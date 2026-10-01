# BatchClip UX research: review the work, not the controls

Date: 2026-10-01  
Scope: research and recommendations only. No application changes.  
Primary external source: authorized Refero MCP. Local source: the current working tree, not an assumed released version.

## Executive recommendation

**Make BatchClip a guided editorial review tool, not a smaller general-purpose video editor.**

The product already has much of the right machinery: project resume, clip decisions, keyboard review, a persistent inspector, scene previews, feedback, plan versions, approval gates, export checks, durable jobs, and render reconciliation. The opportunity is to make that machinery easier to understand and use in sequence.

The strongest combination is:

- **Descript:** keep source words beside the media and apply changes to an explicit selection.
- **Pitch:** show the generated artifact before asking the creator to commit to it; use an overview followed by a focused editor.
- **Linear:** keep a stable queue beside the current item so reviewing the next item does not require reorienting.
- **Canva:** make output scope visible at the moment of export.
- **Dropbox:** distinguish individual job outcomes from the overall batch outcome.
- **Loom:** explicitly separate this project's settings from defaults for future work.
- **Figma:** make returning to recognizable work easy and reversible actions easy to undo.
- **Replo:** treat an AI revision as a proposal to inspect, not automatically the new truth.

These are observations of captured interfaces, not evidence of higher conversion or faster task completion. Replo is a secondary interaction analogy, not a direct video competitor or a claim about popularity.

### First three changes to prototype

1. **A focused long-form scene review workspace:** scene queue, selected source passage, preview, and one clear next action. Reuse existing planning and approval behavior.
2. **An explicit review-to-export handoff:** approved/selected/all scope, exact count, output destination, and a clear distinction between draft preview and finished export.
3. **A truthful, convergent start flow:** every import route reaches the same source/output confirmation; only ask for guidance that actually affects the chosen workflow.

Do not start with a theme redesign, more animation, a new timeline editor, or additional AI options.

## 1. Evidence and limits

### What was inspected

- **9 complete Refero flow records across 8 products**, containing **57 numbered screenshot steps** in their returned metadata.
- **22 individual Refero screenshots visually inspected**, across those same 8 products. Five were Descript, four Pitch, two Canva, two Linear, two Figma, two Loom, three Dropbox, and two Replo.
- Two existing local long-form UI captures, plus current renderer/planner source and relevant design/roadmap documentation.
- Source reading covered both short-form and scene-first long-form paths, not just the drop screen.

A full flow record supplies the documented sequence. A screenshot supplies visual evidence for a state. Neither is a live interaction test. Search-result descriptions alone were not used to establish the central recommendations.

### Important qualifications

- Refero captures may represent older versions. This report does not claim to describe each product's current October 2026 UI.
- Searches for Gamma, OpusClip, Riverside, and Frame.io did not yield usable, clearly matching evidence in the returned results inspected. They are not cited as observed examples. That is a search limitation, not proof those products are absent from Refero.
- Some Refero metadata was inconsistent. The Descript clarity flow included export-related prose, and one Loom diagram called the app Rive. The recommendations below use the actual screen content and matching numbered steps, not those contradictory summaries.
- The two local captures are `.ezcoder/ui-scene-proof-20261001-bee/light-1280-overview.png` and `light-1280-scenes.png`. They show an earlier state than parts of the current source: current scene rows already put actions below the text and suppress an exactly repeated purpose excerpt. The captures are useful context, not proof that the old geometry or exact duplication persists.
- No fresh BatchClip browser/Electron session, usability study, accessibility audit, build, or automated test was run. Accessibility and performance requirements below are proposed validation work, not passed checks.
- Existing user changes were not modified. A new research document is the only deliverable of this pass.

## 2. Product fit and design thesis

### Design read

**Surface:** media-heavy desktop application with a batch production workflow. The dominant task is editorial judgment, not managing a generic dashboard.

**Audience, inferred from the product:** a creator or editor repurposing longer recordings. They may know what a good moment sounds like without wanting to operate a full video-editing suite or a large AI prompt form. No customer interviews were available to validate this inference.

**Single job:** turn a source recording into outputs the creator can inspect, trust, and find on disk.

**Risks:** expensive generation/rendering, mistaken export scope, loss of review context, misunderstanding what AI guidance is actually used, and confusing a successful file encode with a faithful realization of the approved plan.

**Platform:** resizable Electron windows, keyboard and pointer use, local media that can move or go offline, local processing plus network-dependent AI. A cloud-product screenshot is an interaction analogy, not permission to introduce cloud accounts or claim background concurrency.

### Thesis

At any point, the creator should be able to answer:

1. **What am I reviewing?** Source, clip/scene, and relevant spoken passage.
2. **What will the viewer see?** Source playback, draft preview, or finished export, clearly distinguished.
3. **What needs a decision?** Remaining items and any real blockers.
4. **What happens if I press the main button?** Its scope, consequence, and cost where known.

Keep the existing warm light canvas, white raised surfaces, violet action role, dark option, Lucide icons, and restrained screen transitions. Borrow interaction structures, not another product's branding.

The memorable device should be **source evidence tied to the proposed visual**, not decorative dashboard chrome.

## 3. What BatchClip already does

Do not turn this research into a backlog of features that already exist.

| Area | Observed foundation | Main opportunity |
|---|---|---|
| Entry | Project lobby, local file/drop, YouTube URL, New/Open project, output mode, recent-project grid/list, search and filters | Make the entry routes converge and reduce duplicated starting/resume surfaces |
| Short-form setup | Processing recipe and sensible defaults; queued source survives local-tools setup | Keep essential outcome choices obvious without expanding setup into a survey |
| Clip review | Master-detail/sheet layout, filters, sorting, approve/reject/pending, bulk selection, keyboard commands, auto-advance, transcript, undo/history | Reduce toolbar competition; emphasize the current review task and exact export scope |
| Long-form review | Source-grounded scene list, timeline, preview, omit/include, edit, feedback, preserve, versions/compare/restore, approval | Put the selected scene and its media at the center; distinguish review, preservation, and approval |
| Export | Preflight component, quality/destination controls, disk/source checks and estimates, render queue | Explain the batch being exported and handle completed-with-changes honestly |
| Recovery | Resume/autosave paths, offline source handling, job HUD, failed/cancelled job actions | Put recovery next to the affected item instead of making users hunt |

### Actual journey: short form

```text
Resume saved work OR Project lobby
  -> Choose local video / YouTube source + short-form output
  -> Resolve prerequisites if needed (Gemini key, local tools)
  -> Download/probe/transcribe/analyze/edit as applicable
  -> Review your clips
       -> inspect source/preview
       -> approve / reject / leave unreviewed
       -> optional transcript/edit/compare/bulk work
  -> Render Approved / Render All / selected render action
  -> Export preflight
  -> Render queue
  -> Completed outputs and recovery for failed items
```

This is not a fixed numbered wizard. Do not claim a measured click count from static code.

### Actual journey: long form

```text
Project lobby -> Long-form (16:9) -> source
  -> Transcription -> source-grounded scene planning
  -> Cut Plan review
       -> select scene -> explicitly render draft preview
       -> include/omit, edit, feedback, preserve
       -> regenerate / compare / restore as needed
  -> Accept and Continue
  -> Export treatment / queue / applicable preflight
  -> Render saved, approved plan
  -> Plan to render check
       -> inspect changed/failed scenes
       -> return to plan, amend, approve again, re-export if needed
```

Approval is tied to the active plan version. Planning failure is not the same as an intentionally speaker-only plan. Preserve both distinctions.

## 4. Reference findings and their transfer

### A. Descript: selection, transcript, media, and tool stay in context

**Evidence:** clarity flow 2112 and export flow 2134; five screenshots inspected, including a separate demo-editor still. References D1–D5 below.

**Observed:** selected transcript text remains visible beside the preview while the right panel offers “Edit for clarity,” edit intensity, and Submit. A later state offers “Copy edits to new composition,” “Discard all edits,” and Done. Export opens a scoped panel over the existing editor rather than replacing it with an unrelated destination.

**Transfer:** keep the spoken passage next to the clip or scene being judged. Label whether a command affects this selection, this scene, or the whole plan. When a generated revision arrives, show it as reviewable work.

**Already present here:** transcript access, clip inspector, scene source quotations, version history.

**Useful delta:** make these the main review relationship instead of treating source text as one more block among equally weighted controls.

**Do not copy:** a full audio/timeline editor, voice synthesis, transcript rewriting, or Descript's paywall hierarchy. BatchClip's long-form narration and scene timing remain source-grounded.

### B. Pitch: overview first, focused editing second

**Evidence:** AI presentation flow 600, 12 documented steps, four screenshots inspected. P1–P4.

**Observed:** a generated slide overview sits beside font/color controls, then “Start editing” opens a slide-focused editor with a left filmstrip. A failed-generation capture still shows partial slides and a specific failure message.

**Transfer:** use a scene overview to establish the plan, then a focused workspace to review one scene. Keep lightweight appearance choices beside an example of their effect.

**Useful delta:** a long-form scene queue or filmstrip is a better analogy than a long document of scene controls. Source order and selected-scene context should remain stable.

**Do not copy:** arbitrary slide reordering, freely invented narration, decorative sample content, or instant generation assumptions. An actual BatchClip scene preview requires rendering. The failure capture is also a caution: “Start again” alone is weaker than targeted recovery that preserves valid work.

### C. Linear: a stable queue makes repeated decisions legible

**Evidence:** inbox sorting flow 6682, three documented steps, two screenshots inspected. L1–L2.

**Observed:** the inbox list stays beside the selected issue; ordering/display options live in a popover. Deleting a notification leaves a visible Undo response.

**Transfer:** a compact list of clips/scenes with the selected item's evidence and media beside it. Put display preferences behind a view control rather than giving them the same prominence as review actions.

**Already present here:** short-form master-detail, keyboard handling, filters, auto-advance, history.

**Useful delta:** extend the same interaction grammar to long-form and simplify the existing short-form header. The reference supports the layout and recovery pattern; it does not establish that Linear's keyboard model was tested in this research.

**Do not copy:** project-management statuses, assignees, sprint hierarchy, or an enterprise sidebar.

### D. Canva: scope belongs beside the export action

**Evidence:** video download flow 8056, four documented steps, two screenshots inspected. C1–C2.

**Observed:** the download panel shows file type, quality, selected pages, and whether pages become separate files. The completion state names the output and supplies a fallback download link.

**Transfer:** make the selected batch concrete immediately before rendering. The equivalent of selected pages is the exact set of approved/selected/all clips, not whatever filter happens to be visible.

**Already present here:** an export preflight with queue items and destination/quality checks.

**Useful delta:** carry the review status breakdown into that handoff and explain what the primary action will render.

**Do not copy:** a general resolution menu that conflicts with BatchClip's fixed 1080×1920 short-form output, export upsells, or a success panel dominated by promotional content.

### E. Dropbox: the batch and each item have separate outcomes

**Evidence:** upload flow 13027, six documented steps, three screenshots inspected. B1–B3.

**Observed:** a task panel has All uploads / Completed / Skipped / Failed views, per-item progress, a batch count, and a completed state. The library shows “11 selected” beside bulk actions.

**Transfer:** the production queue should state both aggregate progress and the exact exceptions. A completed file is not proof that every intended explanation rendered.

**Already present here:** job HUD, queue states, retries, and plan-to-render reconciliation.

**Useful delta:** link an exception directly to its scene and keep completed files available while failures are handled.

**Do not copy:** imply that users can switch projects or run simultaneous work unless the app actually supports it. Do not hide warnings just because an MP4 exists.

### F. Loom: defaults have an explicit scope

**Evidence:** default-settings flow 5034, four documented steps, two screenshots inspected. M1–M2.

**Observed:** the video settings surface has a separate “Set defaults…” action. The defaults modal explicitly says it affects “this video and future videos,” and has a “Save defaults” action.

**Transfer:** label changes as This clip / This project / Future projects. A project palette change should not silently become a new creator default.

**Already present here:** Creator Profiles and project-specific saved plan treatment.

**Useful delta:** consistent scope language and an explicit opt-in when saving future defaults. BatchClip need not copy Loom's exact retroactive scope.

**Do not copy:** collect a preference merely because other apps do. If a selected workflow does not consume a field, explain that boundary or omit it from that setup path.

### G. Figma: returning work should be recognizable and easy to resume

**Evidence:** file deletion flow 1241, four documented steps, two screenshots inspected. F1–F2.

**Observed:** Recents uses recognizable thumbnails with names and edited times, alongside clear create/import choices. A removed file produces “File moved to trash” and Undo.

**Transfer:** resume from actual project content, not generic file icons alone; keep reversible navigation/list actions reversible.

**Already present here:** recent project thumbnails, filters, next-step copy, actions, and a latest-cuts contact sheet.

**Useful delta:** one clear resume destination per project, with the next unfinished action. The separate latest-cuts strip and recent library should earn their separate space.

**Do not copy:** a cloud file/team hierarchy. Also, Figma's Undo does not justify claiming a destructive local file deletion is reversible. Keep remove-from-recents and delete-project semantics distinct.

### H. Replo: a generated change is a proposal

**Evidence:** AI section update flow 3843, eight documented steps, two screenshots inspected. R1–R2.

**Observed:** the creator supplies brand/prompt context inside the editor, then sees the generated section with “Generation Completed!”, Cancel, and Accept before returning to ordinary editing.

**Transfer:** show the proposed result and its change scope before committing a regeneration. Preserve the existing version and the ability to compare or restore.

**Already present here:** saved plan versions, compare/restore, pending feedback, preserved beats.

**Useful delta:** make the before/after review the natural landing point after regeneration rather than expecting users to discover history later.

**Do not copy:** a prompt box for every action, overwrite by default, or imply that a whole-plan generation changed only the selected scene.

## 5. Recommended flows

All labels and counts in the examples below are proposed UI copy or illustrative fixture values, not observations of a live user project.

### Flow 1: one start path, whether the user clicks or drops

```text
New project / Import / Drop / Paste supported URL
  -> Source + outcome confirmation
       Source: filename, duration when known
       Outcome: Short clips (9:16) OR Long-form video (16:9)
       Preset: current creator profile, optional
       Readiness: actionable prerequisites only
       Advanced guidance: only fields this workflow uses
  -> Find clips OR Plan explanations
  -> Processing with source context preserved
```

**Recommendation:** make quick import and the New project dialog converge on the same compact start state. Do not force every returning creator through a multi-step onboarding wizard. A remembered preset may reduce input, but the chosen output mode must remain visible before expensive work starts. This adds a decision point to immediate imports, so test the clarity benefit against the extra friction; prefer an inline confirmation over another modal.

The current lobby has three header actions, a contact sheet, a source card, mode controls, recipe/palette controls, and a recent library. It is functional; the hypothesis is that the entry hierarchy can be simpler, not that import is missing.

**Important product-trust finding:** `NewProjectDialog` allows an optional Creative Brief for either output mode, but the scene-first initial planning call currently passes source words, duration, and request options, not that brief. The shortest safe UX improvement is to disclose the field's actual scope or avoid offering unsupported guidance in this path. Connecting it to planning is a separate product/behavior change and must keep source evidence authoritative.

**First-run exception:** keep the queued-source behavior. If local tools must install, show what will resume afterward. A clearly labeled example could help during first setup, but do not add a fake-progress demo or suggest the user's footage has already been processed. No installation-time benchmark was performed in this research.

### Flow 2: short-form review as a decision queue

```text
Review clips
  -> Select next unreviewed clip
  -> Watch + inspect source words / why it was suggested
  -> Approve / Reject / Edit
  -> Next unreviewed item (existing optional auto-advance)
  -> Export approved clips (exact count)
```

Keep the contact sheet for scanning. Keep the inspector for deciding. Neither needs replacing.

Suggested hierarchy:

- **Primary:** current clip, playback, approve/reject, next/previous.
- **Secondary:** edit, compare, transcript search, select multiple.
- **View menu:** density, sorting, filter preferences.
- **Handoff:** “Export approved clips (N).”

Do not hide the availability of unreviewed or rejected work; simply stop giving every view preference and batch command equal weight.

AI scores should remain advisory evidence, not a claim that the clip will perform well. A short, source-grounded rationale is more useful than a confidence-looking score alone, provided that rationale is actually available rather than invented by the UI.

**Recovery:** “No clips passed scoring” currently points to Settings or a different source. Add an in-context route to adjust the relevant threshold and rerun only the supported necessary work, preserving transcript/source data. Do not promise a cheap re-filter unless the pipeline can actually do that.

### Flow 3: long-form scene review, centered on the selected scene

```text
Plan overview
  -> Select a scene from source-ordered queue
  -> Inspect spoken passage + intended explanation
  -> Watch source OR explicitly render draft preview
  -> Include / Omit / Edit / Send feedback
  -> Next scene
  -> Review plan-level blockers and changes
  -> Approve plan and prepare export
```

Suggested desktop composition:

```text
Project / source                  Draft status       Prepare export
------------------------------------------------------------------
Scene queue        | Selected scene preview          | Focused details
- Scene title      | Source / Draft preview          | Source passage
- Time range      | Clearly labeled preview state   | Explanation
- Issue indicator | Playback / Render draft preview | Presentation
                  |                                 | Edit / Feedback
------------------------------------------------------------------
Previous scene        Include / Omit        Next scene
```

At narrower widths, keep the selected scene and playback primary; put the scene queue and advanced inspector into intentional drawers or tabs. Preserve selection and focus when recomposing.

**Reuse:** `CutPlanReviewScreen`, the existing scene view model, `LongformScenePreview`, `CutPlanItemEditor`, source quotations, versions, and approval gates. This is a composition/interaction change, not a new planner.

**Preview clarity:** today “Preview scene” selects the item, while “Render scene preview” starts work in a separate region. That two-stage behavior protects compute, but the first label can imply playback has already started. Prefer “Open scene” for selection and an explicit “Render draft preview” action inside it. Do not automatically launch a render for every queue selection.

**Keep three concepts separate:**

- Included/omitted: whether the explanation appears.
- Preserved: whether regeneration may change it.
- Approved plan version: whether the overall plan may be exported.

If a reviewed/unreviewed progress marker is added, it is a fourth UI concept, not a synonym for preserved or approved. Only add it if testing shows value.

No drag-to-reorder scene sequence or free retiming is implied. Source chronology and full scene windows remain protected.

### Flow 4: feedback -> proposed change -> inspect -> approve

```text
Select scene or plan
  -> Add feedback with visible scope
  -> See which items are preserved and what will regenerate
  -> Generate new draft
  -> Compare changed items against previous version
  -> Keep draft OR restore prior version
  -> Approval required for the active version
```

Reposition existing compare/restore capability into this sequence. The user should not need to remember to open Version history after a regeneration.

Show actual changed/retained/failed counts only if they can be computed reliably. Avoid implying that a selected-scene comment guarantees a selected-scene-only regeneration.

Partial planning failures stay visible. Offer existing section retry where supported, with unaffected content retained. Never convert incomplete planning into a successful speaker-only outcome.

### Flow 5: export with explicit scope and a useful finish

```text
Export approved / Export selected / Export everything
  -> Scope summary + exact count + status breakdown
  -> Destination, fixed output shape, quality, checks, estimate
  -> Start export
  -> Per-item progress + overall batch state
  -> Completed files OR completed with changes OR failures
  -> Open file / Show in folder / Review affected scene / Retry eligible work
```

**Current sharp edge:** `Render All` deliberately includes pending and rejected clips while leaving their review decisions unchanged. Rejected clips get a confirmation; pending clips alone do not trigger that confirmation. Keep the capability, but make the consequence obvious.

For example: “Export all 12 clips: 5 approved, 4 unreviewed, 3 rejected.” This must be based on real counts. A visible filter is not export scope.

Use “export” consistently for the user's deliverable if adopting new copy. Keep “render” for the compute operation where that distinction helps. Do not undertake a code/domain rename merely to change button wording.

Preserve preflight instead of adding a second confirmation wizard. The generic preflight receives an `outputMode` and can be used for long-form queued work; it is not accurate to say long-form has no preflight. Long-form also has a separate treatment/setup state.

**Completion:** the existing “Plan to render check” is valuable. Add a direct “Review this scene” action to changed/failed scene rows, restoring the scene selection and relevant source time. The current report provides instructions and a scene ID/time range but no per-row navigation callback.

### Flow 6: return to the next decision

```text
Launch / Project lobby
  -> Recognizable recent project
  -> Continue review / Inspect completed export / Resolve interrupted job
  -> Restore selected clip/scene and saved context where supported
```

Keep existing recents search/filter and resume behavior. Consider folding the latest-cuts contact strip into a single resume-led area, especially when its five frames all belong to one project. The current frame collector can consume all slots from one project's poster and selected frames; it is not necessarily five distinct projects.

Differentiate a project from an output. A saved project thumbnail should lead to editing context; a completed output action should lead to the actual file. This is a navigation clarity recommendation, not a request for a new digital asset management system.

## 6. Priority and implementation boundaries

Effort is a qualitative estimate from source structure, not a delivery commitment. Priorities reflect potential user impact and local evidence, not measured usability gains.

| Priority | Recommendation | Existing owners to reuse | Approximate scope |
|---|---|---|---|
| 1 | Focused long-form scene workspace and truthful preview labels | `CutPlanReviewScreen`, `LongformScenePreview`, `CutPlanItemEditor` | Medium/large UI composition; do not change scene contracts |
| 1 | Explicit export scope and review-to-export hierarchy | `ClipGrid`, selection toolbar, `ExportPreflight` | Small/medium UI work; preserve review statuses |
| 1 | Make Creative Brief applicability truthful | `NewProjectDialog`, `CreativeBriefDialog`, `useLongformPipeline` | Small disclosure/gating work; planner integration is separate and larger |
| 2 | Regeneration lands in a useful comparison context | Existing plan versions, compare/restore, focused feedback | Medium interaction work; preserve approval invalidation |
| 2 | Direct navigation from render exception to scene | `CutPlanReconciliation`, review selection/routing | Small/medium wiring; preserve completed output |
| 2 | Simplify short-form view controls and empty-result recovery | `ClipGrid`, current inspector, current pipeline | Small hierarchy change; rerun behavior needs separate tracing |
| 3 | One source-confirmation path and explicit defaults scope | `DropScreen`, `NewProjectDialog`, Creator Profiles | Medium cross-entry behavior work |
| 3 | Consolidate resume surfaces if testing supports it | `ProjectContactSheet`, `RecentProjectLibrary` | Small/medium; keep search and project actions |

### A practical sequence

**Pass 1: clarity without a new workflow.** Exact export scope, preview-selection wording, brief applicability, and direct exception navigation. These address concrete source-observed ambiguities.

**Pass 2: prototype the major interaction change.** Build a focused scene-review prototype using real fixture data and existing controls. Compare it against the current review screen before replacing it.

**Pass 3: refine repeat use.** Simplify import convergence, defaults scope, and resume hierarchy using observed user problems from the first two passes.

Do not implement every borrowed pattern. If a change does not improve source understanding, review confidence, recovery, or export clarity, it is outside this recommendation.

## 7. Validation plan

Use real representative projects or clearly labeled fixtures, not attractive empty screens. Include a long source, many clips, long scene labels, missing media, partial planning, and a render with fallbacks.

A first formative round could use 5–6 representative creators to find qualitative problems. That sample is not proof of a statistically significant improvement.

| Task | Observe | Proposed acceptance condition |
|---|---|---|
| Start short clips from a dropped video | Which output users expect before processing | They can state the selected outcome and prerequisites without guessing |
| Start long-form with a saved profile/brief | What users believe affects planning | No false expectation that unused guidance controls generation |
| Review a set of clips and export only approved ones | Scope errors, navigation backtracking, hesitation | Exact set is understandable before work starts; review statuses remain unchanged |
| Inspect the middle scene of a long plan | Source/preview association and scroll recovery | User can identify what was said, what the scene adds, and whether the displayed media is source or rendered draft |
| Request one change while preserving another scene | Perceived regeneration scope and trust | Changed scope is visible; preserved work survives; prior version remains recoverable |
| Resolve an incomplete planning section | Whether users restart unnecessarily | Supported retry is discoverable without discarding valid sections |
| Open an export that contains a failed explanation | Whether “file completed” is confused with “all scenes succeeded” | User notices the exception and reaches its scene directly |
| Return after interruption or move a source file | Lost context and recovery effort | Saved work remains identifiable; relink/recovery route is clear |
| Change a palette, then start another project | Understanding of defaults scope | Project-only edits do not appear to change future defaults without explicit intent |

Record baseline and prototype results for time to first useful preview, wrong-scope exports, unnecessary reruns, backtracking, and explanation of current state. Do not invent expected percentage improvements.

### Interaction and accessibility checks before shipping changes

- Complete keyboard paths for scene selection, playback, decisions, menus, dialogs, compare, and export; visible focus and return focus after dismissal.
- Clear separation between focused, selected, included, preserved, approved, pending, and error states; never color alone.
- Screen-reader names/status for changing selection, generation, preview, and batch outcomes without flooding announcements.
- Pointer and keyboard behavior on resizable layouts; long labels and large/zoomed text; no loss of selected context when switching between side panel and drawer.
- Readable text/control/focus contrast in light/dark and applicable forced-colors settings; reduced-motion behavior.
- No autoplay/render fan-out when navigating scenes; no invented ETA or simulated progress. Measure actual responsiveness under a representative queue.
- Preserve source containment, credential handling, saved versions, confirmation of destructive actions, and the existing approval gate.

This list is a task-specific starting point, not a complete WCAG conformance assessment.

## 8. Local evidence map

Paths and line ranges describe the working tree at the time of inspection and may drift with subsequent changes.

| Claim | Source |
|---|---|
| Domain names and editor-owned overrides | `CONTEXT.md` |
| Lobby entry actions and contact sheet | `src/renderer/src/components/screens/DropScreen.tsx:459–494` |
| Visible missing-key alert | `src/renderer/src/components/screens/DropScreen.tsx:496–509` |
| Output mode, recipe/palette, recent library | `src/renderer/src/components/screens/DropScreen.tsx:612–705` |
| New project can offer brief/profile alongside either mode | `src/renderer/src/components/NewProjectDialog.tsx:203–224` |
| Initial scene-first call does not pass Creative Brief | `src/renderer/src/hooks/useLongformPipeline.ts:209–217`; `src/main/ipc/longform-handlers.ts:115–143` |
| Latest-cuts frames may all come from one project | `src/renderer/src/components/ProjectContactSheet.tsx:18–29` |
| Existing recents grid/list, search/filter and next-step text | `src/renderer/src/components/RecentProjectLibrary.tsx:137–175, 198–296` |
| Zero-results guidance currently points to Settings/source change | `src/renderer/src/components/ClipGrid.tsx:162–184` |
| Render All includes all clip IDs; rejected-count confirmation | `src/renderer/src/components/ClipGrid.tsx:552–574` |
| Clip review controls and render hierarchy | `src/renderer/src/components/ClipGrid.tsx:774–923` |
| Existing master-detail/sheet layout and source-offline notice | `src/renderer/src/components/ClipGrid.tsx:925–948` |
| Current scene source text, duplicate-purpose guard, and action placement | `src/renderer/src/components/screens/CutPlanReviewScreen.tsx:180–274` |
| Version-bound acceptance before render preparation | `src/renderer/src/components/screens/CutPlanReviewScreen.tsx:606–617` |
| Explicit preview rendering, stale-input invalidation, cancel/retry | `src/renderer/src/components/LongformScenePreview.tsx:83–128, 149–195` |
| Existing export preflight and output-mode handling | `src/renderer/src/components/ExportPreflight.tsx:34–290` |
| Render treatment vs generic preflight, including long-form | `src/renderer/src/components/screens/RenderScreen.tsx:1046–1066, 1248–1281` |
| Existing durable job HUD and eligibility-based retries | `src/renderer/src/components/JobsHud.tsx:116–183` |
| Reconciliation scene rows explain recovery but do not navigate | `src/renderer/src/components/CutPlanReconciliation.tsx:85–106` |
| Previous implementation/design evidence and planned work | `DESIGN.md`; `EZCODER_TO_CLIPOROUS_UX_ROADMAP.md` (not treated as proof of absent functionality) |

## 9. Refero source ledger

All links below were returned by Refero. Full flow records were retrieved by numeric ID; linked screenshots are representative evidence within those sequences. Search hit totals are not sample sizes.

### Complete flow records read

| Product | Refero flow ID | Captured task | Numbered steps returned | Images inspected |
|---|---:|---|---:|---:|
| Descript | 2134 | Exporting content | 11 | 2 |
| Descript | 2112 | Edit for clarity | 5 | 2 |
| Pitch | 600 | Creating a presentation with AI | 12 | 4 |
| Canva | 8056 | Downloading a video | 4 | 2 |
| Linear | 6682 | Sorting an inbox | 3 | 2 |
| Figma | 1241 | Deleting files from Recents | 4 | 2 |
| Dropbox | 13027 | Uploading files | 6 | 3 |
| Loom | 5034 | Default settings for future recordings/uploads | 4 | 2 |
| Replo | 3843 | Updating a section with AI | 8 | 2 |
| **Total** | **9 flows / 8 products** | | **57 step records** | **21 flow screenshots** |

One additional Descript editor screenshot makes **22 visually inspected Refero screenshots**.

### Visually inspected screenshots

| Ref | State observed | Refero source |
|---|---|---|
| D1 | Descript export panel, current composition and output controls | [a3e142f1-2a89-489d-a073-b45b1f97461a](https://refero.design/screenshots/a3e142f1-2a89-489d-a073-b45b1f97461a) |
| D2 | Descript export/download completed activity | [79989ee8-dc65-4ebc-9a51-b552e1f4628e](https://refero.design/screenshots/79989ee8-dc65-4ebc-9a51-b552e1f4628e) |
| D3 | Descript demo editor with transcript, media, timeline and Underlord tools; standalone search result | [9782a4a2-8276-4b7e-ad7e-8bb49b04954b](https://refero.design/screenshots/9782a4a2-8276-4b7e-ad7e-8bb49b04954b) |
| D4 | Selected transcript and Edit for clarity controls | [b90200a9-ae5f-4d27-bd1e-2cee404b66da](https://refero.design/screenshots/b90200a9-ae5f-4d27-bd1e-2cee404b66da) |
| D5 | Clarity review state with copy/discard/done actions | [64b617ff-32da-4ee9-915b-73962bf27f42](https://refero.design/screenshots/64b617ff-32da-4ee9-915b-73962bf27f42) |
| P1 | Pitch generation skeleton beside appearance controls | [9255feff-f264-42b3-9902-11805dbf75d3](https://refero.design/screenshots/9255feff-f264-42b3-9902-11805dbf75d3) |
| P2 | Pitch partial draft and generation error | [fbb2ccc4-8d53-48c0-b462-e12d4d9ad271](https://refero.design/screenshots/fbb2ccc4-8d53-48c0-b462-e12d4d9ad271) |
| P3 | Pitch generated overview and Start editing | [a671040c-b656-4a24-90aa-44408e1fbc9e](https://refero.design/screenshots/a671040c-b656-4a24-90aa-44408e1fbc9e) |
| P4 | Pitch focused editor with slide filmstrip | [d74cea38-cd0c-447e-91cf-36b946423c46](https://refero.design/screenshots/d74cea38-cd0c-447e-91cf-36b946423c46) |
| C1 | Canva file type, quality, pages, separate-file option | [3bff4179-4b18-472a-9eb6-e5820bf943ae](https://refero.design/screenshots/3bff4179-4b18-472a-9eb6-e5820bf943ae) |
| C2 | Canva completed download and fallback link | [d4f5eba3-9e75-4afb-b40d-1a774aab925e](https://refero.design/screenshots/d4f5eba3-9e75-4afb-b40d-1a774aab925e) |
| L1 | Linear queue/detail with ordering/display popover | [c9b900e1-457a-49ab-af0f-daa717f6edea](https://refero.design/screenshots/c9b900e1-457a-49ab-af0f-daa717f6edea) |
| L2 | Linear queue/detail after notification removal with Undo | [42256ca3-3d3b-452b-b445-a908e916d9fc](https://refero.design/screenshots/42256ca3-3d3b-452b-b445-a908e916d9fc) |
| F1 | Figma Recents with thumbnails, names, edited times and create/import | [ffce5cdd-ca65-478c-9447-dc1b8c70d1ba](https://refero.design/screenshots/ffce5cdd-ca65-478c-9447-dc1b8c70d1ba) |
| F2 | Figma file moved to trash with Undo | [e92e15ef-8723-4087-b7ad-ac7acacca3c2](https://refero.design/screenshots/e92e15ef-8723-4087-b7ad-ac7acacca3c2) |
| M1 | Loom video settings with Set defaults action | [14794d48-8a71-4d29-aa94-bf1ce79504eb](https://refero.design/screenshots/14794d48-8a71-4d29-aa94-bf1ce79504eb) |
| M2 | Loom defaults modal with explicit current/future scope | [075584f5-3931-4b27-8eb8-22288017f641](https://refero.design/screenshots/075584f5-3931-4b27-8eb8-22288017f641) |
| B1 | Dropbox per-file progress and outcome tabs | [bbf53250-f313-4040-bee0-2ed8183883a0](https://refero.design/screenshots/bbf53250-f313-4040-bee0-2ed8183883a0) |
| B2 | Dropbox 11 selected, bulk actions and upload success | [59b1e859-f26f-4a99-8aec-57f7a7e9db3b](https://refero.design/screenshots/59b1e859-f26f-4a99-8aec-57f7a7e9db3b) |
| B3 | Dropbox completed task panel and item results | [de07026b-2112-499e-9df3-3ea5cd86691e](https://refero.design/screenshots/de07026b-2112-499e-9df3-3ea5cd86691e) |
| R1 | Replo AI brand/context input inside the editor | [8d39a5fe-f694-4916-a6c2-d3ddadfc1772](https://refero.design/screenshots/8d39a5fe-f694-4916-a6c2-d3ddadfc1772) |
| R2 | Replo generated section with Cancel and Accept | [8d9ca6a7-9ac3-427c-9881-673959d08f3a](https://refero.design/screenshots/8d9ca6a7-9ac3-427c-9881-673959d08f3a) |

## Bottom line

The product does not need to become Canva, Descript, or Linear. It should borrow their best division of responsibilities:

**Choose an outcome -> inspect the AI's proposal against the source -> make a small number of clear decisions -> export a precisely defined result -> resolve exceptions without losing work.**

The largest opportunity is long-form scene review. The quickest gains are clearer scope, honest preview/guidance labels, and direct recovery actions. Preserve the substantial work already implemented rather than adding a second system beside it.
