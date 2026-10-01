# Clay explanation library: complete vision and execution plan

Date: 2026-09-30

## Status and authorization

**Implementation authorized and in progress.** On 2026-09-30 the user explicitly confirmed that the current uncommitted animation work is the baseline, must be preserved, and that this plan should be executed with parallel subagents.

The changed-file inventory was rechecked before implementation. No existing work will be discarded, stashed, committed or reset. Two read-only agents previously mapped integration and verification; editing workers now own disjoint pack files while the coordinator owns shared integration.

Observed environment: Windows, bash, Node v22.18.0, npm 11.6.1. This differs from the older macOS assumption in project notes. Verification results will be recorded separately; the commands below are the intended gate, not assertions of a pass.

## 1. Objective and completion standard

Expand the existing clay explanation system into a coherent library spanning:

1. Structure and layers.
2. Sorting, similarity, and matching.
3. Transformation and synthesis.
4. Scale and perspective.
5. Choices, constraints, and opportunity cost.
6. Distribution and concentration.
7. Uncertainty and possible futures.
8. Collective behavior.
9. Exchange, ownership, and incentives.

Cover all twelve concrete applications from the brainstorming session: next-word choice, meaning maps, multimodal combination, specialist selection, unit economics, retention, marketplaces, inventory versus demand, digital twins, edge versus cloud, robot perception, and modular machines.

The proposed full delivery is **18 authored scene kinds with 42 named presets**, not 42 unrelated rendering systems. Each preset must have a meaningful beginning, transformation or reveal, and readable result. A new label applied to the same generic boxes is not a completed animation.

Completion requires working planner selection and validation, actual scene rendering, short- and long-form integration, source-grounded semantics, deterministic seeking, fixtures and tests, rendered visual review, and documented evidence. Do not equate fixture declarations, parser success, or a successful build with completion.

### Not part of this work

- Replacing the clay renderer, lighting rig, fonts, palette system, caption engine, or app UI.
- Rebuilding existing causal, property, cognition, or technology scenes.
- Arbitrary generated meshes, external models, arbitrary SVG, remote assets, or physics simulations.
- New dependencies, provider/model changes, paid API runs, deployments, releases, or Git commits.
- General cross-scene world-state simulation. Identity continuity is explicit and authored, not inferred from matching labels.

## 2. Existing foundations to preserve

### Visual foundation

Reuse the current chain rather than copying its appearance:

- `hero-kit.tsx`: `Clay`, geometry helpers, frame-exact motion helpers.
- `Stage3D.tsx`: one `ThreeCanvas`, existing key/fill/rim lighting, contact shadows, alpha behavior, and camera application.
- `StudioEnvironment.tsx`: offline environment and restrained material highlights.
- `mechanisms/MechanismStage.tsx`: existing scene stage and overlay composition.
- `explanation-kit.tsx`: `ExplanationStage` and `ClayBlock`, including geometry cleanup.
- `explanation-layout.ts`: reserved model and editorial regions.
- `stage.tsx`, `palette.ts`, `motion.tsx`, `motion-tokens.ts`: palette, time, seekable movement, settling and weight.
- Existing semantic parts in `hero-props/`, `spatial/`, `cognition/`, and `technology/` where their geometry and meaning actually fit.

### Planner and pipeline foundation

- One `KindSpec` per scene kind, collected in `ai/explainer/kinds.ts`.
- Source phrase, word-index and beat helpers in `mechanism-contract.ts` and `technology-contract.ts`.
- `technologyStory` for the common bounded five-beat story where applicable, with additional scene-specific relationship checks.
- Trigger-driven shortlist and existing family variety rules; do not raise the global shortlist limit just because the library grows.
- Recursive `mapSceneTimes` in `types.ts`: numeric beat fields must be named `at` or end in `At`.
- Short/long render paths share `groupPlannedScenes` and `buildGroupRenderPlan`.
- Existing fixture schema, manifest, local browser runner, PNG contact sheets, media verification, and coverage reporting.

### Already represented, not counted as new

Existing scenes cover bottlenecks, momentum, leverage, leaks, feedback, relay, assembly, synchronization, cutaways, property lifecycles, agent teams, replanning, bounded budgets, training, evaluation, evidence conflict, tool workflows, retrieval, context windows, software releases, routing, funnels, and compounding.

New specialist selection must show *which experts activate for a task*, not merely duplicate `agent-team`. New information transformation must show changing content and retained provenance, not duplicate retrieval. New market exchange must show both sides and ownership, not duplicate a payment prop. New allocation must show competing uses and the cost of reallocation, not duplicate budget exhaustion.

## 3. Art direction and visual contract

**Thesis: a tactile miniature world that becomes futuristic through behavior, not through a new material style.**

### Style invariants

- Keep current clay roughness, restrained clearcoat, palette-derived colors, studio lights, contact shadows, and alpha compositing.
- No neon/holographic rebrand, glossy glass dashboards, space backgrounds, or decorative particle fog.
- Keep rounded authored forms with recognizable silhouettes: documents, people, products, shelves, tools, devices, chips, racks, machines, and workstations.
- Objects retain identity as they move, split, change ownership, or become part of a larger structure.
- At most one primary explanation happens at a time. Secondary movement follows the main action instead of competing with it.
- Labels clarify identity or relationships; they do not carry an explanation that the objects fail to show.
- No invented screenshots, fake logs, decorative code, meaningless numeric counters, or unexplained success checks.

### Composition and legibility

- Author on the existing 1080x960 virtual stage. Preserve title, condition, label and outcome rails.
- Preserve output at 1080x1920/30fps and long-form at 1920x1080/30fps.
- Each kind declares only layouts that remain legible: start with `stack`, `stack-flipped`, `takeover`, and selectively `over`.
- Do not automatically enable `pip`; support it only if an actual reduced-size render proves legibility.
- Test the smallest supported layout, longest permitted labels, and both light/dark palette contexts.
- Avoid making color the only indication of grouping, ownership, selection, uncertainty, or failure. Pair it with shape, location, labels, outlines, or explicit status.
- Keep captions and the speaker safe areas unchanged. No flashing or rapid repeated contrast pulses.

### Motion contract

Reuse the current 5-12 second authored-story window initially, with five word-indexed beats and at least the existing final hold. Do not compress a complicated scene below what can be read; omit it or divide it into supported scenes instead.

Typical beats are orientation -> primary change -> relationship reveal -> comparison/check -> stable result. These are not always causal success beats. A result may remain uncertain, unmatched, blocked, unequal, or unresolved.

All poses are pure functions of scene data and frame-derived time. No wall clocks, random placement, integration-based physics, asynchronous simulation, ambient camera loops, or hidden mutable state. Camera changes must reveal information and settle for the final hold.

## 4. Complete scene and preset catalog

Names below are proposed implementation IDs. Final naming may change during implementation only if the catalog, parser, fixtures and tests remain aligned. Counts and conceptual coverage must not silently shrink.

### Pack A: information and organization — 3 kinds, 7 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `system-layers` | `business-stack`, `device-stack` | An intact organization/device separates into two to four named functional layers. Connections explain the relationship and the parts reassemble without losing identity. |
| `semantic-sort` | `topic-clusters`, `closest-match`, `skill-match` | Recognizable documents organize into groups; a query/document approaches relevant material; tasks pair with matching skills. Unmatched items remain visible. |
| `information-transform` | `structured-report`, `multimodal-fusion` | Details visibly leave source material and assemble into a structured result; text/image/audio contribute distinguishable pieces to a combined interpretation. Origins remain traceable. |

Semantic protections: similarity is not truth; grouping is not proof of causation; a synthesized result cannot invent facts absent from inputs. A document moving to a new tray without changing representation is not sufficient for transformation.

### Pack B: AI selection and processing — 3 kinds, 6 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `token-choice` | `next-token`, `uncertain-choice` | Several candidate word tiles appear, one joins the sentence, and a subsequent choice becomes visible. The uncertain variant retains alternatives without claiming correctness. |
| `expert-selection` | `single-specialist`, `specialist-team` | A named task activates only appropriate specialists; inactive experts stay inactive. Selected contributions return to the same task. |
| `edge-cloud` | `local-processing`, `split-processing` | A recognizable device processes some work locally; the split case sends only the stated work to a remote service and receives its result. Data movement remains visible. |

Semantic protections: do not claim selected words are true; do not fabricate probabilities; do not imply all models use the illustrated expert architecture; local processing does not automatically mean complete privacy or no networking.

### Pack C: business operations — 3 kinds, 8 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `resource-allocation` | `reallocate`, `constrained-projects` | A finite set of time/capacity resources is assigned to competing projects. Increasing one use visibly reduces another or leaves a request unmet. |
| `market-exchange` | `direct-sale`, `platform-fee`, `unmatched-market` | Product and payment move in opposite directions; ownership changes; a platform fee is shown only when stated. Unmatched participants do not magically transact. |
| `unit-economics` | `positive-margin`, `break-even`, `negative-margin` | One sale is separated into stated costs and remainder; break-even leaves no remainder; a loss is explicit rather than represented as growth. |

Semantic protections: conserve stated resources; preserve payment/ownership direction; do not invent fees, costs, margin, revenue, return, or guaranteed performance. Incomplete cost evidence must not turn into a net-profit claim.

### Pack D: populations and business state — 3 kinds, 8 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `population-distribution` | `customer-concentration`, `workload-spread`, `average-hides-tail` | Persistent members receive visibly different amounts. A group average can be contrasted with its spread without erasing outliers. |
| `customer-cohort` | `retention`, `churn` | The same identifiable starting group passes through periods. Retained and departed members remain distinct; new arrivals do not count as retained members. |
| `inventory-demand` | `surplus`, `shortage`, `balanced` | Physical stock and incoming demand are separate actors. Matching, leftover stock and unmet demand are visible and conserve identity/counts. |

Semantic protections: never invent an 80/20 ratio, denominator, population size, time period, retention rate, or demand trend. An illustrative crowd is not a quantitative chart. Use explicitly qualitative scenes when no numerical evidence is available.

### Pack E: perspective and alternatives — 3 kinds, 6 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `scale-hierarchy` | `chip-to-center`, `customer-to-market` | A tracked chip/customer is revealed as part of progressively larger systems. The original remains identifiable through the change in scale. |
| `possible-futures` | `branching-scenarios`, `forecast-range` | Two or three clearly possible outcomes diverge from a common present; a supported range replaces an unjustified single forecast. |
| `digital-twin` | `mirror-state`, `simulated-change` | A physical miniature and its model correspond. A proposed intervention changes the model separately from the physical world. |

Semantic protections: a diagram is not real telemetry; simulated outcomes are not observed outcomes; alternative futures must not acquire invented odds or a fabricated winner. Range geometry must not imply unsupported quantitative probabilities.

### Pack F: collective and adaptive systems — 3 kinds, 7 presets

| Kind | Presets | Required visual story |
|---|---|---|
| `collective-pattern` | `network-clusters`, `adoption-wave`, `coordinated-swarm` | Bounded participants make local connections, adopt in supported stages, or coordinate into an authored formation. The emerging pattern is the subject. |
| `robot-perception` | `recognized-target`, `uncertain-target` | A robot observes distinguishable objects and boundaries before acting. Uncertain recognition visibly defers action or retains ambiguity. |
| `modular-machine` | `reconfigure`, `incompatible-module` | Identifiable functional components rearrange for a new job; incompatible parts cannot seat or activate successfully. |

Semantic protections: do not imply inevitable network growth, universal model accuracy, arbitrary robot competence, or compatibility that the source does not support. No free-running swarms or physics engine is needed; paths and states are authored and seekable.

### Coverage map back to the vision

| Explanation family | Principal delivery |
|---|---|
| Structure and layers | `system-layers`, `modular-machine` |
| Sorting, similarity, matching | `semantic-sort`, `expert-selection`, `market-exchange` |
| Transformation and synthesis | `information-transform`, `token-choice` |
| Scale and perspective | `scale-hierarchy` |
| Choices and opportunity cost | `resource-allocation`, `expert-selection` |
| Distribution and concentration | `population-distribution`, `customer-cohort`, `inventory-demand` |
| Uncertainty and futures | `possible-futures`, `digital-twin`, `robot-perception` |
| Collective behavior | `collective-pattern` |
| Exchange and incentives | `market-exchange`, `unit-economics`, `resource-allocation` |

All twelve domain applications have an explicit home in this catalog; no separate generic “AI effect” is counted as a substitute.

## 5. Shared technical design

### Bounded data contracts

Use six disjoint pack directories under `src/main/remotion/compositions/explainer/concepts/`:

- `information/`
- `inference/`
- `business-operations/`
- `business-populations/`
- `perspective/`
- `adaptive/`

Each owns its scene types, preset constants, pure pose functions, view modules and co-located tests. Reuse `TechnologyStory`/beat helpers where their current meaning fits without renaming or restructuring older families.

The coordinator establishes these React-free type contracts before renderer workers start. Extend the root scene-kind list and discriminated union deliberately. Do not introduce a broad untyped `props` payload or arbitrary scene-program language.

For each kind define:

- Allowlisted presets and supported layouts.
- Named source-backed actors, roles, relationships and outcomes.
- Explicit source word indices for beats and relevant relationship evidence.
- Finite bounded numbers and arrays, with stated units and denominators when quantitative.
- Stable actor IDs derived from validated ordered entries, not labels alone or randomness.
- Required conditions or uncertainty qualifiers from the source.
- Fixed authored camera/geometry configurations, never model-controlled coordinates or asset paths.

Proposed scene budgets: two to four layers, two or three alternatives, at most twelve individually tracked semantic carriers, and at most twenty-four simple population actors for an explicitly illustrative crowd. A preset can set a smaller cap. These are design limits, not claims about measured rendering performance.

### Parsing and semantic contracts

Create small pack-owned specs such as `kinds-concept-information.ts` and pack-specific contract helpers under `src/main/ai/explainer/`. Shared new helpers belong in `concept-contract.ts` only when at least two packs genuinely need the same rule.

At the untrusted model boundary:

1. Reject unknown presets, malformed entries, non-finite values and out-of-window word indices.
2. Reuse existing phrase/beat/condition validation before interpreting relationships.
3. Validate each relationship in its own local source span, bound to the correct actors.
4. Distinguish observed, conditional, simulated, selected and unresolved states.
5. Reject negated, merely proposed or unrelated evidence presented as an achieved outcome.
6. Preserve signed numbers, units, complete conditions and source attribution.
7. Reject quantitative layouts when their required values are missing or inconsistent. Use a separately supported qualitative preset only when its own semantics are supported.
8. Return useful bounded diagnostics to the existing review pass; do not silently invent repairs.

Do not use noun presence alone as proof: mentioning “profit” does not establish profit; mentioning “approved” does not establish the task was approved; mentioning a source does not establish support for the generated result.

### Rendering and motion

- Each view uses one existing stage and the existing `Clay` material.
- Share recognizable actor geometry only where multiple scenes actually use it. Start from existing actors before adding new ones.
- Each pose module is pure and independently testable at all beats, between beats, on backward seeks and during the final hold.
- Keep geometry construction out of per-frame loops; memoize/dispose locally owned geometry using existing patterns.
- Maintain a per-preset object/mesh budget and record it with verification, rather than adding an unbounded generic graph renderer.
- Use existing subdued scene SFX, tied to semantic events. Do not add new sound assets for this expansion.
- Keep camera and labels coordinated through existing projection/camera helpers. Scale stories require explicit reveal framing, not arbitrary zoom that sends labels offscreen.

### Shared integration ownership

Only the coordinator edits shared files:

- `src/main/remotion/compositions/explainer/types.ts`
- `src/main/remotion/compositions/explainer/SceneBody.tsx`
- `src/main/ai/explainer/kinds.ts`
- `src/main/ai/explainer/kind-spec.ts` only if strictly necessary
- `src/main/ai/explainer-scenes.ts` only for required story integration
- `src/main/render/explainer-scenes.ts` and `explainer-longform.ts` if a reproduced integration defect requires a change
- Shared fixture schema/manifest, coverage and verification runners
- Shared stage/layout helpers, only if a concrete new requirement cannot be met through composition

The existing `CAUSAL_SCENE_KINDS` list already protects non-causal authored stories. Add the new authored kinds to the same full-window/emphasis protection without doing an unrelated global rename. Keep the nine conceptual families separate from the planner's existing `KindFamily` vocabulary: map new kinds to the existing meaningful categories unless tests establish a need to extend that vocabulary.

## 6. Step-by-step execution

### Phase 0: preserve and establish the baseline

1. Obtain confirmation that the existing uncommitted work is the implementation baseline. Do not commit, stash, reset, discard, or rewrite it.
2. Record the changed-file inventory and read each shared target immediately before editing it. If new unexplained changes appear during implementation, stop at that file.
3. Confirm installed dependencies, compatible local Chrome Headless Shell, FFmpeg/ffprobe, available temporary space, and build prerequisites.
4. Run the current checks once and record existing failures separately from introduced failures.
5. Build and capture a small set of existing causal, property, cognition and technology scenes on this Windows machine as style/performance controls.

**Exit:** baseline is authorized and recorded; blockers are explicit; existing visuals have comparison artifacts.

### Phase 1: storyboard and freeze interfaces

6. For all 42 presets, write a five-beat storyboard with actor identities, relationship evidence, camera behavior, source requirements, and final hold.
7. Map each preset to at least one realistic synthetic transcript. Label fixtures as fixtures, not actual business or model measurements.
8. Define negative examples alongside positive ones, especially unsupported outcomes, uncertain states, mismatched actors, and missing quantities.
9. Establish six pack type files, preset manifests, shared limits and the minimal common contract utilities.
10. Run a three-agent pilot wave using Workers A, C and E: one complete `topic-clusters`, `direct-sale` and `chip-to-center` preset respectively. These are real vertical slices with parsers, poses and clay views, not throwaway mocks. The coordinator wires the slices and reviews actual renders against the existing stage. Resolve material, framing and semantic-readability defects before multiplying models; retain the pilot agents' context for the next phase.

**Exit:** no worker has to invent a competing stage, data schema, source policy, or visual language.

### Phase 2: implement independent packs in parallel

11. Continue the three pilot agents and launch Workers B, D and F so all six independent packs can advance in parallel. Each owns only its pack directory, spec/contract/test files and fixture JSON. Once foundation types are handed to a worker, further cross-pack contract changes go through the coordinator.
12. Each agent builds its three kinds end to end: validated types, poses, actual clay views, parser specs, cues, fixtures, source-boundary tests, motion tests and projection tests.
13. Each agent runs focused checks, reads its resulting diff, and returns exact files, passed/failed commands and unresolved issues. No agent changes a shared registry or formatting configuration.
14. The coordinator integrates completed packs incrementally and handles shared compile errors. Workers do not all run the full build or full test suite concurrently.

**Exit:** 18 real renderers and 42 non-placeholder presets exist, with focused proof. Missing branches remain marked incomplete.

### Phase 3: wire planner and rendering paths

15. Register all specs, kinds and exhaustive dispatcher cases.
16. Add 18 positive shortlist cases plus confusable/negative cases. Verify existing kinds are not displaced by overly broad triggers or duplicate backfill behavior.
17. Preserve shortlist and hero-prop bounds and the existing maximum run of same-family scenes.
18. Test absolute beats -> relative scene beats -> group rebasing, including nested arrays and large source offsets.
19. Apply full-window protection and suppress generic stamp/emphasis extras that would contradict an authored scene.
20. Exercise short-form splicing, transitions and speaker resumption. Exercise long-form speaker-range containment and `over`/`takeover` mapping.
21. Check end padding/final holds in both paths instead of assuming short-form render durations and long-form durations are identical.
22. Verify SFX occur at the right source times and no scene bypasses face-placement fallback rules.

**Exit:** the scenes are selectable and renderable in real product paths, not just standalone fixtures.

### Phase 4: structural and adversarial coverage

23. Extend fixture manifests/schema and coverage accounting for the 18 kinds and 42 presets through one owner.
24. Add one table-driven coverage check asserting that each registered preset has a parser fixture, pose test and rendered-fixture entry.
25. Test nulls, wrong types, overlong strings, oversized lists, invalid IDs, non-finite values, reversed/outside beats, missing conditions, ungrounded numbers and swapped actor evidence.
26. Test semantic invariants: finite-resource conservation, no duplicated retained customers, ownership/payment directions, stock-demand accounting, stable actor identity, inactive experts, model-versus-reality separation, and unresolved uncertainty.
27. Verify old scenes and the existing fixture manifest tests still pass. Do not weaken tests or regenerate unrelated snapshots to obtain a pass.

**Exit:** malformed model output fails closed and all expected branches are represented.

### Phase 5: visual and full-motion proof

28. Build once after the last relevant source change, then hash/record the exact bundle used by the render jobs.
29. Render at least five semantic checkpoints for every preset: setup, first movement, relationship reveal, comparison/check, final hold. This is a minimum of 210 primary stills, plus failure-boundary samples where needed.
30. Review contact sheets against existing style anchors. Fix clipping, visual ambiguity, identity loss, collisions, oversize labels, poorly framed cameras and unexplained motion.
31. Render every preset's complete motion at least once with bounded concurrency and resumable case selection. Twelve-frame media excerpts do not count as full-motion coverage.
32. Test serial/repeated/shuffled seeking on representatives of all nine conceptual families; add representative parallel-context tests. Record the exact Windows browser/GPU mode and artifact hashes.
33. Check alpha on representative transparent overlays from each pack, including decoded ProRes 4444 alpha and actual FFmpeg compositing over a speaker/background.
34. Cover every advertised layout with native-size samples across the library; every preset must include its smallest supported layout. Cover all existing palettes at library level and the longest allowed strings per kind.
35. Add mixed-scene sequences proving transition behavior, final holds, short-form captions/speaker placement, and long-form overlays. Examples: sorting -> transformation -> token choice; sale -> costs -> margin; chip -> rack -> data center; actual system -> simulated alternative.
36. Re-render changed cases after visual revisions; previous output is stale after edits. Keep comparison controls unchanged.

**Exit:** every preset has reviewed rendered evidence, full-motion coverage and recorded limitations. Cross-GPU equality is not claimed from one Windows machine.

### Phase 6: final gate and documentation

37. Run the full checks, standalone Remotion typecheck, harness tests and final production build.
38. Review the actual accumulated diff against the baseline, preserving all pre-existing user changes and rejecting unrelated cleanup.
39. Record counts and statuses for all 18 kinds/42 presets, exact commands, elapsed times, render environment, artifacts and any blocked checks.
40. Update project documentation only for the delivered architecture and verified commands. Add a concise developer recipe for adding future scenes without bypassing contracts or the shared stage.
41. Leave generated PNGs, videos, logs and temporary reports outside Git. Do not publish, deploy or commit unless separately requested.

**Exit:** report implemented, tested and visually verified work separately. Any missing mandatory visual/runtime gate keeps the overall vision incomplete rather than silently reducing scope.

## 7. Efficient parallel-agent schedule

### Worker ownership

| Worker | Exclusive implementation area | Output |
|---|---|---|
| A | `concepts/information/`, `kinds-concept-information.ts`, matching contracts/tests, `concept-information.json` | 3 kinds / 7 presets |
| B | `concepts/inference/`, `kinds-concept-inference.ts`, matching contracts/tests, `concept-inference.json` | 3 kinds / 6 presets |
| C | `concepts/business-operations/`, `kinds-concept-business-operations.ts`, matching contracts/tests, `concept-business-operations.json` | 3 kinds / 8 presets |
| D | `concepts/business-populations/`, `kinds-concept-business-populations.ts`, matching contracts/tests, `concept-business-populations.json` | 3 kinds / 8 presets |
| E | `concepts/perspective/`, `kinds-concept-perspective.ts`, matching contracts/tests, `concept-perspective.json` | 3 kinds / 6 presets |
| F | `concepts/adaptive/`, `kinds-concept-adaptive.ts`, matching contracts/tests, `concept-adaptive.json` | 3 kinds / 7 presets |
| Coordinator | Shared contracts, root union, registries, dispatch, integration, shared harness and final evidence | Joined product path |

### Scheduling rules

- Finish baseline and type/contract foundation before starting editing workers.
- Start the independent pack agents before waiting for any one of them.
- Use up to six coding agents; reduce concurrent workers if measured local memory/CPU pressure makes more workers slower. Six is a ceiling, not a performance claim.
- One owner per file. Shared edits are requested from the coordinator rather than applied independently.
- As workers finish, reuse free slots for independent read-only semantic/security and rendered-output review. Reviewers do not rewrite the same files concurrently with implementers.
- Run at most one full build/full-suite process and one bounded rendering coordinator at a time. Start render concurrency at one; increase only after measuring a representative job without resource contention.
- Do not share live fixture output directories between workers; artifact directories are unique per run/pack.
- Use agent messages to resolve contract issues while other packs continue. A change to a shared contract is announced to every affected worker before further edits.
- After three failed attempts at the same defect, re-diagnose the shared cause instead of stacking patches.

**Critical path:** baseline permission -> shared contracts -> pack implementations -> shared integration/build -> rendered verification -> corrections -> final checks. Starting more agents cannot bypass these dependencies.

## 8. Verification commands and evidence

These are the existing project commands to run during implementation, not checks already performed:

```bash
npm run check
npm run typecheck
npm run test:main
npm run test:renderer
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.remotion.json
node --test scripts/explainer-stills/*.test.mjs
npm run build
```

After the six new fixture files are implemented and registered:

```bash
node scripts/explainer-stills/render.mjs concept-information.json --bundle out/remotion
node scripts/explainer-stills/render.mjs concept-inference.json --bundle out/remotion
node scripts/explainer-stills/render.mjs concept-business-operations.json --bundle out/remotion
node scripts/explainer-stills/render.mjs concept-business-populations.json --bundle out/remotion
node scripts/explainer-stills/render.mjs concept-perspective.json --bundle out/remotion
node scripts/explainer-stills/render.mjs concept-adaptive.json --bundle out/remotion
```

Extend the existing systems/motion verification manifest through its shared owner. Selective commands should use the supported manifest IDs established by that implementation; do not document fictitious runner flags. The current house-only `render-clay-continuity.mjs` is not a generic continuity verifier. Add a narrow concept-sequence runner using the existing harness if needed, rather than treating its house whitelist as coverage for new scenes.

### Required evidence ledger

For every preset record: parser fixture, boundary tests, pose checks, supported layouts, five still checkpoints, full-motion artifact, visual review result and final source/bundle revision. For the library record: baseline comparison, integration checks, nine-family determinism coverage, six-pack alpha samples, mixed sequences, test/build logs and remaining limitations.

Performance evidence should compare unchanged baseline controls on the same machine with representative new workloads. Record elapsed render time and available process-memory measures. Windows coordinator RSS is not whole-browser/GPU memory; do not label it a complete memory measurement. No speed or leak claim is justified without measurements.

### Windows-specific limits

The local harness disables automatic browser downloads. If a compatible Chrome Headless Shell or a required package/binary is missing, record the blocker and request provisioning rather than installing silently. `--software-raster` is POSIX-only and must not be enabled on Windows or promoted into production defaults. GPU-dependent alpha-edge differences require honest reporting, not weakened equality checks.

No paid Gemini calls are required for deterministic parser, planner integration and rendering tests. A live model-selection acceptance pass is separate, uses the existing client/model configuration, and requires appropriate access/cost authorization; it cannot be claimed from fixture-only tests.

## 9. Definition of done checklist

- [ ] Existing uncommitted baseline confirmed and preserved.
- [ ] Baseline checks and representative current visuals recorded.
- [ ] Nine explanation families and all twelve brainstorm applications mapped.
- [ ] 18 kinds and 42 presets implemented without placeholder geometry/stories.
- [ ] Existing clay, lighting, palette, shadows and depth reused directly.
- [ ] Source-bound relationships, quantities and uncertainty validated.
- [ ] Bounded deterministic poses and resource lifetimes tested.
- [ ] Planner registry, shortlist and variety behavior integrated.
- [ ] Short- and long-form paths, window protection, captions and SFX checked.
- [ ] All preset fixtures and boundary/semantic regressions pass.
- [ ] At least 210 primary checkpoint stills reviewed.
- [ ] All 42 presets have full-motion rendered evidence.
- [ ] Representative nine-family determinism and six-pack alpha/compositing proof recorded.
- [ ] Native layouts, palette coverage, longest text and mixed sequences reviewed.
- [ ] Full verification, standalone Remotion typing and build pass, or blockers explicitly prevent a completion claim.
- [ ] Final diff reviewed without altering unrelated user work.
- [ ] Verification report distinguishes actual evidence from unverified platforms/live-AI behavior.
- [ ] No dependency install, paid call, commit, deployment or release performed without the required authorization.

## 10. Frozen worker handoff contract

Implementation starts with pack-owned React-free types, using the existing `TechnologyStory` five beats. The coordinator owns global registration; workers may see temporary missing-union TypeScript errors until those registrations land. Do not bypass them with `any`, broad casts, or suppressed errors.

| Pack | Type export from its `types.ts` | Preset constant | View export from its `Scene.tsx` | Spec export |
|---|---|---|---|---|
| information | `InformationScene` | `INFORMATION_PRESETS` | `InformationSceneView` | `CONCEPT_INFORMATION_SPECS` |
| inference | `InferenceScene` | `INFERENCE_PRESETS` | `InferenceSceneView` | `CONCEPT_INFERENCE_SPECS` |
| business-operations | `BusinessOperationsScene` | `BUSINESS_OPERATIONS_PRESETS` | `BusinessOperationsSceneView` | `CONCEPT_BUSINESS_OPERATIONS_SPECS` |
| business-populations | `BusinessPopulationsScene` | `BUSINESS_POPULATIONS_PRESETS` | `BusinessPopulationsSceneView` | `CONCEPT_BUSINESS_POPULATIONS_SPECS` |
| perspective | `PerspectiveScene` | `PERSPECTIVE_PRESETS` | `PerspectiveSceneView` | `CONCEPT_PERSPECTIVE_SPECS` |
| adaptive | `AdaptiveScene` | `ADAPTIVE_PRESETS` | `AdaptiveSceneView` | `CONCEPT_ADAPTIVE_SPECS` |

Views receive `{ scene: PackScene }`. Every preset constant maps its three kind IDs to readonly preset-ID arrays. Every spec collection is an array satisfying the existing `AnyKindSpec` contract. Send the coordinator a type-ready message once the pack type file exists. New fixtures use the current array schema, `kind` and `explanation` coverage tags, supported native cases, sourceText, 5 semantic samples, and 5 source-word-derived story beats. Parsers export testable functions and tests exercise the real parser as well as the registry after integration.

Integration clarified the fixture-time contract: `durationSec` is the complete rendered window, including the production planner's 0.25-second lead-in and 0.35-second tail. All six packs and export tests use the coordinator-owned `concepts/fixture-words.ts` helper, placing uniformly spaced speech inside those edges. Real planner tests place the window within a 60-second plannable span so the existing 55% coverage budget is honored. Do not bypass the full planner with manually constructed plans or loosen its duration/coverage safeguards. The pipeline intentionally rebases to millisecond precision; test that contract rather than demanding nanosecond equality.

Workers own `concept-<pack>-contract.ts` if needed and `kinds-concept-<pack>.test.ts`; no cross-pack helper or actor is changed without coordinator agreement. Reuse existing `technologyStory`, phrase/evidence helpers and `ExplanationStage` directly. Prefer local semantic geometry over a new abstract rendering framework. No new dependencies, commits, broad formatting, global test runs, installs, or heavy media runs in workers. The coordinator schedules builds and visual verification.
