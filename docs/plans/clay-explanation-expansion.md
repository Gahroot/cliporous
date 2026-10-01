# Clay explanation expansion: implementation and verification plan

## Objective and authorization

Implement the brainstormed 3D visual explanations using the existing clay material, studio lighting, depth, shadows, typography, palettes and frame-seekable Remotion system. Preserve the current causal and technology scenes. The user authorized treating all pre-existing tracked/untracked changes as the working baseline; do not revert, commit, install, deploy or publish anything.

This is an expansion of authored explanation scenes, not a new renderer, physics simulation, arbitrary AI scene graph, app UI redesign or agent execution feature. The AI selects bounded visual stories from transcript evidence; it does not gain new tools or permissions.

## Design read and thesis

- Surface: prerecorded educational graphics within vertical and long-form video, not interactive controls.
- Audience: viewers who need to understand a spoken relationship in seconds, especially AI, automation, business and property analogies.
- Thesis: recognizable clay miniatures demonstrate one relationship at a time. One familiar house can explain structure, plans, responsibilities, permission boundaries and scale without repeatedly teaching the viewer new objects.
- First glance: identify the main object. Second glance: see the physical change or relationship. Final hold: read a short, source-backed takeaway.
- Reuse: `Clay`, `Stage3D` / `MechanismStage`, `StudioEnvironment`, contact shadows, `useStage`, `useSceneTime`, frame-driven easing, existing scene frames/transitions, source phrase validation, strict beat spacing and existing sound vocabulary.
- Keep rounded silhouettes, bevel highlights, three-quarter views, meaningful depth and grounded contact. No flat diagram substituted for promised 3D models; no ambient spinning, bobbing, glowing balls, new shader stack or remote assets.
- Same authored house silhouette and palette roles across the spatial scenes and contractor story establish visual continuity. Preserve a source-backed subject across adjacent scenes; do not imply that different source subjects are the same property.
- Labels complement the geometry, not cover it. Reserve caption/speaker safe areas and retain readable wrapping in stack, takeover and over layouts. Video motion is the content: it remains seekable and bounded with still final holds, no flashing or continuous background movement. Existing player controls/captions are preserved. No claim of full WCAG conformance is made by these changes.

## Scope: 14 new kinds, 29 bounded presets

| Kind | Presets | Physical story and semantic limit |
| --- | --- | --- |
| `house-cutaway` | `rooms`, `utilities` | Roof/front open to show rooms or utility routes. Anatomy, not automatic improvement. |
| `house-build` | `construct`, `plan-mismatch` | Blueprint, foundation, walls and roof; mismatch stays visibly a mismatch. |
| `house-renovation` | `cosmetic`, `structural` | Surface treatment versus an exposed, replaced structural component. No invented value gain. |
| `property-access` | `scoped-key`, `revoked-key` | A key operates only an allowed room; revocation leaves the door closed. Not an approval-gate duplicate. |
| `neighborhood` | `replicate`, `context` | Familiar home repeats into a bounded block, or stays the same while surroundings differ. Copies are illustrative, not invented market counts. |
| `floorplan-fit` | `fits`, `rearrange` | Recognizable furniture fits a fixed room or is rearranged within it. No impossible wall crossings. |
| `house-options` | `compare`, `tradeoff` | Two source-labeled alternatives using the same house. Neutral presentation: no invented renovation geometry, superior finish, winner or forecast. |
| `property-lifecycle` | `occupancy`, `maintenance`, `cash-flow` | Occupancy turnover, repair cycle, or separate income/expense movement. Rent is never labeled profit. |
| `agent-team` | `parallel-specialists`, `contractor-crew` | Named assignments fan out and results reunite; contractor variant reuses the house. No unsupported speed claim. |
| `agent-plan` | `replan`, `fixed-vs-adaptive` | A plan meets new information and changes route; fixed route remains visibly distinct. |
| `agent-budget` | `stop`, `request-more` | Actions consume a bounded allowance, then stop or request more. A request is not a grant. |
| `model-training` | `train-then-use`, `examples-correction` | Examples change the model during training; later use does not silently retrain it. |
| `model-evaluation` | `same-tests`, `tradeoffs` | Named approaches face the same checks. No fabricated score, universal winner or benchmark. |
| `evidence-conflict` | `unresolved`, `human-review` | Contradictory sources remain separate; referral to a human does not imply resolution. |

These extend, rather than replace, the existing tool-success/retry/approval, retrieval, context-window, release and routing stories. Spatial anatomy builds on the idea of exploded-view, but gets a dedicated recognizable house assembly rather than changing the existing templates.

## Step-by-step implementation

### 1. Establish baseline and freeze shared contracts

1. Record existing dirty work and avoid attributing it to this implementation.
2. Run the root and standalone Remotion type checks before edits (both passed on 2026-09-30).
3. Define React-free discriminated unions in `explainer/spatial/types.ts` and `explainer/cognition/types.ts` with allowlisted presets and bounded source-label fields.
4. Reuse the five-beat story contract (`setupAt`, `actionAt`, `responseAt`, `checkAt`, `resolveAt`) and 5–12 second window. Model JSON supplies word indices; parsers derive absolute seconds.
5. Add only a small shared presentation kit where both new renderer groups need the same rounded parts and editorial frame. Do not change the existing material or lights.

### 2. Build spatial models and choreography

1. Author a recognizable reusable house with foundation, roof, windows, door, room divisions and restrained utility paths.
2. Implement the eight spatial scene bodies with distinct physical storytelling, not just different text.
3. Use pure pose functions for each kind/preset and exact setup/final-hold states; cap repeated houses, furniture, occupants and money markers.
4. Keep geometry and paths authored. Use memoized static geometry and existing material lifecycle conventions.
5. Add pose tests for finite/bounded output, random seek order, contact timing, final holds and each preset's meaningful distinction.

### 3. Build cognition/agent models and choreography (parallel with step 2)

1. Author recognizable desks, plan sheets, tools, documents, model housings and test stations using the shared clay kit.
2. Implement the six cognition scene bodies with distinct plans, ownership, budgets, training phases, evaluation and unresolved-evidence states.
3. Reuse the spatial house for contractor-crew; do not invent separate house styling.
4. Preserve subject identity along movement. Failures, requests, uncertainty and conditional outcomes must never receive a success seal.
5. Add pure pose tests covering every preset, finite bounds, contact/phase ordering, seek determinism and stable final holds.

### 4. Implement AI contracts and source validation (two parallel workstreams)

1. Create spatial and cognition kind specs with concise descriptions, JSON schemas, trigger phrases, appropriate existing variety families and explicit avoid rules.
2. Reuse `sourceLabel`, strict beat validation and technology story condition handling.
3. Validate every preset and all visible labels. Bound arrays and reject unsupported extra semantic payloads rather than drawing arbitrary model-provided geometry.
4. Require relationship evidence, not just matching nouns. Reject negated/opposite outcomes, absent actors, invented amounts and unsupported branch selection. Associate evidence with the relevant beats/clauses where needed.
5. Keep unclear alternatives, unmet permissions, budget requests and conflicting evidence visibly unresolved.
6. Test valid stories for every preset plus malformed payloads, non-finite/reversed/compressed timing, missing source phrases, unsupported conditions, contradictions and invented quantities.

### 5. Integrate the shared pipeline

1. Extend `ExplainerSceneBody`, kind lists, and the protected full-window list while preserving all baseline additions.
2. Register specs in `kinds.ts` and renderer dispatch in `SceneBody.tsx`.
3. Add shortlist evaluation cases so relevant kinds are offered without increasing the bounded menu or always offering every new kind.
4. Verify generic time rebasing, cue mapping, source review diagnostics, cancellation and per-clip isolation continue to work unchanged.
5. Add targeted planner/render integration tests, including valid off-menu parsing and all offered layouts.
6. Add continuity guidance to the existing planner prompt: reuse the house metaphor and exact subject only when supported by the spoken passage; do not force a property analogy onto unrelated content.

### 6. Fixtures and runnable visual evidence (parallel workstream)

1. Add honestly labeled fixture stories covering all 29 presets with setup, middle, distinction and final states.
2. Include stack/over and landscape representatives, long labels, conditional/blocked cases, multiple palette families and a house continuity sequence.
3. Add a bounded verifier using installed local Remotion/browser tooling, without model API calls or downloads.
4. Render contact sheets and representative full-size stills to the system temp directory, never tracked output folders.
5. Check repeated-frame equality, finite poses, final-hold equality and at least a representative ProRes 4444 alpha export through the real composition path.

### 7. Integrate, review and revise

1. Parent owns shared integration files; workers own disjoint new modules, tests and fixture assets.
2. Read each worker's diff, check it against this scope and verify important claims independently.
3. Run affected tests, root typecheck, standalone Remotion typecheck, relevant Biome checks and build.
4. Run the existing full test suite and harness tests; distinguish pre-existing failures from new failures with evidence, not assumptions.
5. Inspect rendered outputs. Check subject recognition, clay depth, contact/occlusion, label wrapping, safe areas, denied/unresolved states and consistency across both aspect ratios.
6. Revise concrete visual defects, re-render affected scenes and rerun affected checks after edits.
7. Document commands, counts, evidence locations, exact results and any unavailable checks. Do not claim a release, comprehensive accessibility certification, all-GPU determinism or live-AI success from fixture results.

## Parallel ownership

- Parent: this plan; shared type integration; small shared presentation kit; registry/dispatch; prompt continuity; shortlist/integration tests; final review and verification.
- Spatial renderer worker: only new `explainer/spatial/` implementation and pose tests, excluding parent-owned `types.ts`.
- Cognition renderer worker: only new `explainer/cognition/` implementation and pose tests, excluding parent-owned `types.ts`.
- Spatial planner worker: only new `ai/explainer/kinds-spatial*.ts` and spatial contract/tests.
- Cognition planner worker: only new `ai/explainer/kinds-cognition*.ts` and cognition contract/tests.
- Visual harness worker: only new explanation fixture JSON, fixture-contract tests and a new explanation verifier; coordinate before changing existing harness files.

Workers do not edit shared registries, formatting configuration, package files, baseline technology modules, or each other's files. Start all independent implementation workers after the shared contracts are written. Keep browser rendering bounded: initial previews used two independent jobs; final renders and media verification ran sequentially.

## Acceptance criteria

- All 14 kinds and 29 presets are registered, validated, selectable from suitable transcript triggers and rendered by real 3D clay geometry.
- Existing scene kinds, output dimensions, default styles, materials, lighting, palette behavior, caption/speaker safe areas and lifecycle controls are preserved.
- Narration-grounded semantics survive negative, conditional, uncertain and comparative input. No invented financial return, score, access grant, completion or outcome.
- Every preset has a deterministic pose test and fixture. Integration tests demonstrate parsing and timeline rebasing.
- Actual rendered evidence demonstrates the spatial and cognition families, including failure/unresolved states and both aspect ratios. Limitations are explicit.
- No dependency installs, paid API calls, external assets, commits, deployment, data deletion or unrelated cleanup.

## Execution log

- Baseline: user approved preserving/extending pre-existing changes. Node v22.18.0, npm 11.6.1.
- Baseline root typecheck and standalone Remotion typecheck: passed (`npm run typecheck && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.remotion.json`).
- All eight implementation steps are complete. Five disjoint editing workstreams handled the two renderers, two source contracts and fixtures; the parent integrated shared registries, time-window protection, planner instructions, render-path tests, framing and final verification. Read-only investigations and a rendered-image review supported that work.
- Added all 14 kinds / 29 presets, with 591 passing tests in new TypeScript feature suites and additional shortlist/harness checks.
- Reused existing materials, studio, stage, sound vocabulary and render paths. No dependency, service, app preference or IPC additions.
- Visual inspection found lower labels crossing house fronts/table legs and a reversed blueprint/house label order. Fixed shared camera/text bounds, added projection regression tests and re-rendered every preset.
- Removed unsupported structural/finish differences between generic house alternatives. Normalized exact choreography endpoints instead of weakening assertions.
- Build and both type checks passed. All 333 renderer tests passed with two workers.
- Final stills: 145 images across all 29 presets. A real three-scene same-house sequence produced 12 key/transition stills and a 60-frame silent transition movie.
- Representative native verification: four cases, 88 critical frames with serial/shuffled/parallel byte equality, four 12-frame ProRes 4444 samples and decoded alpha checks. All passed on Windows/ANGLE without a software-raster override.
- The full repository gate is not green: existing formatting/line-ending diagnostics and two unchanged Windows path-expectation failures in `brand-pack-handlers.test.ts` remain. No unrelated normalization or test suppression was applied.

Exact commands, artifact directories, bundle hash, measured results and verification limits are in [clay-explanation-verification.md](./clay-explanation-verification.md). Nothing was committed, deployed or published.
