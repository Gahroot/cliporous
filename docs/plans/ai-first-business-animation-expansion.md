# AI-first business animation expansion

Status: approved scope; route freeze recorded 2026-10-03. Implementation and executed proof are tracked separately; this document is not a completion claim.

## Scope and locked architecture

Implement all 80 opportunities from `docs/research/ai-first-business-animation-opportunities.md`, 16 authored assemblies, 12 treatments and 8 advanced sequences. Reuse BatchClip's source-grounded parsers, diagram/clay stages, deterministic motion, authoritative saved plans and native rendering. No new dependencies, remote assets, fonts, settings, migration, simulator, money movement, investment advice or export-time planning.

The 26 new grammars below are frozen. OP-10, OP-58 and OP-75 reuse the named current grammars; their additions must retain old source truth and omitted-mode behavior. A pack is an ownership boundary, not a ninth `KindFamily`. Retain the eight current variety families and planner limits: 6 outline ideas, 3 kinds per idea, 16 legacy shortlisted kinds, 10 props and 24 idea-shortlist kinds.

New scene facts extend `DiagramStory`; numeric `at`/`…At` fields are beat seconds, rebased once. Five ordered local source-word beats, full-window protection, no automatic generic stamps/emphasis, and a settled final hold are mandatory. Diagram mode has zero WebGL canvases; hybrid has at most one and uses the current `HybridStage`. Business models/diagram parts are separate from wrappers so storyboard panels never nest stages. Preserve 1080×1920/30fps shorts and 1920×1080/30fps longform, layouts, captions, fonts, palettes, speaker/face fallback and approved appearance.

## Frozen recipes, owners and modes

D = diagram; H = hybrid. D/H means both are complete presentations of identical validated facts, IDs and beat windows. All routes have a dedicated raw source fixture and negative case, named `business-OP-NN`; a name is not executed evidence. Mode restrictions below are per preset, not a reason to duplicate kinds. Asset and treatment IDs refer to the tables below. Labels are editorial names, not unsupported source claims.

| ID | Recipe | Kind / preset | Owner | Modes | Assets | Treatments |
| --- | --- | --- | --- | --- | --- | --- |
| OP-01 | Task atlas | task-map / task-split | work | D/H | A-04 | M-01 |
| OP-02 | Capability frontier | task-map / capability-boundary | work | D | — | M-03 |
| OP-03 | Cross-functional team | coordination-map / cross-function | work | D/H | A-04 | M-09 |
| OP-04 | Responsibility map | task-map / responsibility | work | D/H | A-04 | M-01 |
| OP-05 | Expert-to-playbook | work-redesign / expertise-transfer | work | D/H | A-07 | M-11 |
| OP-06 | Workforce redeployment | work-redesign / redeployment | work | D/H | A-02 | M-01 |
| OP-07 | Supervisor fan-out | coordination-map / supervised-fanout | work | D/H | A-08 | M-03 |
| OP-08 | Coordination load | coordination-map / handoff-load | work | D/H | A-04 | M-09 |
| OP-09 | Permission passport | delegation-scope / permissions | authority | D/H | A-05 | M-03 |
| OP-10 | Approval gate | agent-workflow / approval-gate | authority | D/H | A-06 | M-09 |
| OP-11 | Bounded autonomy | delegation-scope / action-limits | authority | D/H | A-05 | M-12 |
| OP-12 | Exception economy | authority-handoff / exception-review | authority | D/H | A-08 | M-09 |
| OP-13 | Audit trail | authority-handoff / declared-audit-chain | authority | D/H | A-07 | M-11 |
| OP-14 | Reversible/irreversible actions | authority-handoff / action-consequences | authority | D/H | A-06 | M-12 |
| OP-15 | Accountable handoffs | authority-handoff / accountable-transfer | authority | D/H | A-06 | M-09 |
| OP-16 | Constraint collision | constraint-check / conflicting-limits | authority | D | — | M-03 |
| OP-17 | Storefront cutaway | business-blueprint / back-office | commercial | D/H | A-01,A-04 | M-04 |
| OP-18 | Owner knowledge handoff | work-redesign / owner-playbook | work | D/H | A-07 | M-11 |
| OP-19 | Appointment capacity | business-blueprint / service-slots | commercial | D/H | A-02 | M-12 |
| OP-20 | Lead → book → deliver | business-blueprint / service-lifecycle | commercial | D/H | A-02,A-04 | M-09 |
| OP-21 | Founder dependency | business-blueprint / owner-dependency | commercial | D/H | A-01 | M-12 |
| OP-22 | Productized service | business-blueprint / service-modules | commercial | D/H | A-02 | M-01 |
| OP-23 | Micro-franchise replication | business-replication / shared-standard-local-context | commercial | D/H | A-03 | M-07 |
| OP-24 | Channel dependence | market-dependency / channel-concentration | markets | D/H | A-01 | M-03 |
| OP-25 | Federated pods | organization-map / federated-units | organization | D/H | A-03 | M-07 |
| OP-26 | Central/local decisions | organization-map / decision-rights | organization | D/H | A-03,A-05 | M-09 |
| OP-27 | Controlled rollout | organization-map / rollout-rings | organization | D/H | A-03 | M-06 |
| OP-28 | Brownfield integration | organization-map / legacy-boundaries | organization | D/H | A-16 | M-03 |
| OP-29 | Merger reconciliation | system-reconciliation / merge-identities | organization | D/H | A-04 | M-11 |
| OP-30 | Shared-service chargeback | organization-map / stated-chargeback | organization | D/H | A-03 | M-02 |
| OP-31 | Shadow AI | organization-map / declared-tool-boundaries | organization | D | — | M-03 |
| OP-32 | Approval congestion | coordination-map / approval-load | work | D/H | A-06,A-08 | M-09 |
| OP-33 | Cost of resolved task | operating-cost / per-outcome | economics | D/H | A-04 | M-02 |
| OP-34 | Fixed/marginal costs | scale-economics / fixed-variable | economics | D/H | A-02 | M-02 |
| OP-35 | Capacity utilization | capacity-map / installed-used-reserved | infrastructure | D/H | A-13 | M-12 |
| OP-36 | Hiring frontier | scale-economics / output-staffing | economics | D/H | A-02 | M-08 |
| OP-37 | Implementation valley | operating-cost / implementation-periods | economics | D/H | A-07 | M-06 |
| OP-38 | Pricing models | operating-cost / comparable-pricing-bases | economics | D | — | M-08 |
| OP-39 | Value-capture chain | value-capture / source-stated-allocation | economics | D/H | A-10 | M-02 |
| OP-40 | Revenue/profit/cash | operating-cost / accounting-bases | economics | D/H | A-04 | M-02 |
| OP-41 | Distribution/production | market-dependency / demand-access | markets | D/H | A-01 | M-03 |
| OP-42 | Switching friction | market-dependency / migration-constraints | markets | D/H | A-16 | M-12 |
| OP-43 | Two-sided cold start | market-dependency / participation-matching | markets | D/H | A-02 | M-09 |
| OP-44 | Network effects | market-dependency / stated-participation-benefit | markets | D | — | M-03 |
| OP-45 | Commoditization/differentiation | market-dependency / differentiated-offering | markets | D/H | A-01 | M-08 |
| OP-46 | Platform/supplier dependence | market-dependency / supplier-distribution-boundaries | markets | D/H | A-16 | M-03 |
| OP-47 | Agent purchasing | procurement-commitment / request-quote-authorize-pay | markets | D/H | A-05,A-06 | M-09 |
| OP-48 | Niche complementarity | market-dependency / complementary-specialists | markets | D/H | A-02 | M-07 |
| OP-49 | Commit → call → invest | fund-lifecycle / capital-states | funds | D/H | A-09 | M-10 |
| OP-50 | Closing/uncalled commitments | fund-lifecycle / subscriptions-and-close | funds | D/H | A-09 | M-03 |
| OP-51 | Distribution waterfall | distribution-waterfall / stated-priority-tiers | funds | D/H | A-10 | M-10 |
| OP-52 | Fees/gross/net | distribution-waterfall / gross-to-net | funds | D | — | M-02 |
| OP-53 | Vintage/fund lifecycle | fund-lifecycle / source-periods | funds | D/H | A-09 | M-06 |
| OP-54 | Follow-on reserves | fund-lifecycle / retained-follow-on-capital | funds | D/H | A-09,A-10 | M-12 |
| OP-55 | Interval-fund repurchases | fund-liquidity / periodic-repurchase | funds | D/H | A-09,A-08 | M-12 |
| OP-56 | NAV/cash | fund-liquidity / valuation-cash-distinction | funds | D/H | A-12 | M-03 |
| OP-57 | Economic-rights X-ray | economic-rights / ownership-versus-claims | capital | D/H | A-12 | M-04 |
| OP-58 | Shared dependency lens | portfolio-exposure / shared-driver | capital | D/H | A-16 | M-03 |
| OP-59 | Outcome dispersion | investment-outcomes / source-outcome-set | capital | D | — | M-08 |
| OP-60 | Staged financing | capital-structure / conditional-rounds | capital | D/H | A-09,A-12 | M-09 |
| OP-61 | Infrastructure debt | capital-structure / financing-versus-capacity | capital | D/H | A-11,A-13 | M-12 |
| OP-62 | Maturity/duration mismatch | capital-structure / obligations-and-maturity | capital | D/H | A-11 | M-06 |
| OP-63 | Diligence evidence room | operating-lineage / evidence-and-missing-information | infrastructure | D/H | A-07 | M-11 |
| OP-64 | Transferable claim/illiquid asset | economic-rights / claim-asset-distinction | capital | D/H | A-12 | M-03 |
| OP-65 | Money-ready/power-not-ready | capacity-map / physical-readiness | infrastructure | D/H | A-13,A-14,A-15 | M-12 |
| OP-66 | Inference queue | capacity-map / bounded-request-capacity | infrastructure | D/H | A-13 | M-09 |
| OP-67 | Idle/reserved/burst | capacity-map / resource-states | infrastructure | D/H | A-13 | M-12 |
| OP-68 | Data residency | capacity-map / declared-processing-scope | infrastructure | D/H | A-16 | M-03 |
| OP-69 | Provider exit | operating-lineage / provider-transition | infrastructure | D/H | A-16 | M-09 |
| OP-70 | Data lineage | operating-lineage / versioned-provenance | infrastructure | D/H | A-07,A-16 | M-11 |
| OP-71 | Model drift | operating-lineage / evaluation-periods | infrastructure | D | — | M-06 |
| OP-72 | Latency accumulation | capacity-map / end-to-end-periods | infrastructure | D/H | A-13,A-16 | M-02 |
| OP-73 | Real options/stage gates | staged-decision / contingent-commitment | decisions | D/H | A-09 | M-12 |
| OP-74 | Commitment calendar | constraint-check / dated-conditions | authority | D/H | A-11 | M-06 |
| OP-75 | Alternative designs | possible-futures / branching-scenarios | decisions | D/H | A-03 | M-08 |
| OP-76 | Plan/observed variance | measurement-frame / planned-observed | decisions | D/H | A-04 | M-05 |
| OP-77 | Adoption denominators | measurement-frame / firms-functions-workers | decisions | D/H | A-03 | M-07 |
| OP-78 | Survivorship | measurement-frame / original-and-surviving-cohorts | decisions | D/H | A-03 | M-03 |
| OP-79 | Outcome album | uncertainty-album / alternatives-or-source-distribution | decisions | D/H | A-03 | M-08 |
| OP-80 | Bottleneck migration | coordination-map / bottleneck-shift | work | D/H | A-06,A-08 | M-03 |

## Source contracts

Every recipe binds its named subjects, actors, tasks, relationships, conditions, numbers, dates and outcomes to local source-word spans; merely seeing a label elsewhere is insufficient. Use `hybridStory`, finite/phrase/actor helpers and exact finance parsing first. Shared new helpers cover only repeated missing boundaries: task ownership, quantity bases, evidence states and versioned identities. Stable IDs must keep a task distinct from its job and performer, approver and accountable owner distinct even if the same actor fills multiple roles.

- Work: explicit task/job membership, capability versus authority, supported handoff endpoints, role assignments, queue/redeployment evidence and approved guidance versions. No implied eliminated workers, automatic retraining or invented coordination hours.
- Authority: declared scope, action, owner, limit/expiry and acceptance states; blocked, pending, rejected and conditional actions never animate as success. Conflicting conditions and dated conditions remain unresolved unless supported.
- Commercial: named business/interior functions, service-slot units/durations, distinct lead/booking/delivery/acceptance states, local dependencies and replicated unit identities. No product stock relabeled as service slots.
- Organization: local/shared decision rights, declared legacy/tool boundaries, unresolved identity collisions and exact chargeback allocations. Configured adoption is not observed worker use or monitoring.
- Economics: compatible subject/population, unit, period and denominator; exact minor-unit costs with distinct components, bounded fixed/variable samples and source-stated value allocations. Retry/review costs are never duplicated. Revenue, stated-cost remainder, profit and cash remain distinct; no guaranteed payback or invented profit.
- Markets: supported demand/supplier/channel dependencies, migration constraints, separate participation/matching/acceptance/payment, stated conditional benefit and complementary capability. More edges are not measured value, sales or permanent market power.
- Funds: promises, requested capital, contributions, deployments, retained funds and distributions stay distinct. Exact conservation and source-stated contractual tier order/ceilings; partial tiers and retained cash visible. No universal fees/carry, FX, legal interpretation or IRR. Periodic repurchase requires explicit interval-fund type and disclosed terms; NAV is not available cash.
- Capital: shares and denominators separate from claim priority/payout; exact financing/maturity facts, conditional rounds and supplied bounded outcome populations. Shared drivers never imply measured correlation or diversification. No return/exit promises or advice.
- Infrastructure: installed/used/reserved capacity, queue states, scope permissions, physical readiness, versioned lineage, comparable evaluation periods and non-overlapping sequential latency units. Unknowns stay unknown; no telemetry or benchmark inference.
- Decisions: stated baseline and qualified alternatives, conditions/commitments, compatible planned/observed quantities, cohort/adoption denominators and bounded source outcomes/probabilities. Equal qualitative alternatives have equal area/frequency/duration and no selected winner.

Reject unsupported keys, nonfinite/deep/oversized input, malformed IDs, evidence swaps and arbitrary geometry/styles/code/URLs/assets. No remote fetch, executable strings, arbitrary SVG or `dangerouslySetInnerHTML`. Core invalid facts reject a candidate; optional omissions may retain a truthful simpler scene with diagnostics. Fixtures and proof logs contain invented examples, never private transcripts or credentials.

## Authored assemblies

All are scene-scoped, built from the existing clay/occupant/token/tray/calendar/book/parcel/connector kit. No standalone hero promotion is justified at freeze time: these are multi-part explanatory assemblies with source-bound roles, not independent generic hero actions. Authored mesh ceilings, dimensions, allowed uses and source dependencies are recorded in a React-free asset catalog and verified against cumulative scene/board budgets. Batch repetition, dispose owned resources and preserve rights-blocked assets.

| IDs | Assemblies | Owner files under business/assets/ |
| --- | --- | --- |
| A-01–04 | Commercial storefront/cutaway; service station; branch pod; operating desk/inbox | retail.tsx; retail-poses.ts; local tests |
| A-05–08 | Permission card; approval rail; playbook binder/versions; exception trolley/inbox | authority.tsx; authority-poses.ts; local tests |
| A-09–12 | Commitment folio; distribution tier trays; maturity ladder; economic-rights layers | funds.tsx; funds-poses.ts; local tests |
| A-13–16 | Low-mesh data-center rack; power readiness substation; cooling loop; provider connector panel | infrastructure.tsx; infrastructure-poses.ts; local tests |

## Treatments

Treatment choice follows validated presets, never model-authored movement. Reuse current motion tokens, handoffs and camera sampling; pure bounded frame samples retain facts/totals and have reading holds, exact repeated frames and backward/shuffled seek tests.

| ID | Treatment | Core proof |
| --- | --- | --- |
| M-01 | Identity-preserving task split | OP-01/04 |
| M-02 | Conserved decomposition/recombination | OP-33/39/52 |
| M-03 | Constraint/permission focus | OP-09/16 |
| M-04 | Same-subject clay ↔ diagram handoff | OP-17/57 |
| M-05 | Plan/observation overlay | OP-76 |
| M-06 | Time-compressed dated snapshots | OP-53/71 |
| M-07 | Nested scale lens | OP-23/25 |
| M-08 | Equal-baseline alternatives | OP-38/75/79 |
| M-09 | Authority handshake/pending gate | OP-10/15/47 |
| M-10 | Ordered priority filling | OP-49/51 |
| M-11 | Provenance reveal | OP-05/63/70 |
| M-12 | Budget/condition clamp | OP-11/65/73 |

## Advanced sequences and persistence

Add only an allowlisted `explanation` storyboard panel using versioned source choices/word spans and identity links. Its adapter reuses the scene source parser, then compiles authored diagrams and model instances into the existing camera/shared-canvas layer. No nested stages, opaque scene blobs, model-selected entry points or export planning. Keep existing 5 panels, 48 elements, 6 props, 180 model meshes, 40-second window, world/depth/byte/node/readability limits; >90-second sources, <=30% storyboard coverage and >=10-second separation. Short equivalents are ordinary bounded scene chains.

Storyboard spec 2 and longform parser 3 retain schema 2, spec 1, parsers 1/2 and immutable approval/history/appearance. Unknown versions remain preserved but unrenderable. Preview/export reconstruct saved specifications and fingerprints without conversion. ADR 003 records this decision; ADRs 001/002 are unchanged.

| ID | Sequence | Required meaning/identity |
| --- | --- | --- |
| S-01 | Company inside-out | Cutaway → tasks → responsibilities; same business/task IDs |
| S-02 | One transaction, four views | Customer item → authority → comparable costs → payment; promises ≠ cash |
| S-03 | Small business → operating network | Distinct units → shared services → coordination limits |
| S-04 | Fund capital lifecycle | Commitment → contribution → deployment → proceeds/distribution; conserve cash, distinguish rights |
| S-05 | Dependency X-ray | Different firms/holdings → supported common drivers; no correlation inference |
| S-06 | Governed learning loop | Exception → review → approved guidance version → later task; no inference-time retraining |
| S-07 | Alternative operating designs | Same baseline → qualified alternatives → unresolved comparison; no winner |
| S-08 | Economic-rights X-ray | Ownership → claims → supported/unknown payout |

## Ownership and ordered implementation

Follow the 40 ordered steps in the approved `.ezcoder/plans/ai-first-business-full-expansion.md`; mark a step done only with its actual implementation and checks. Coordinator owns shared helpers/contracts, root scene types/dispatch/registries, shortlist/outline/variety, hero catalogs, shared persistence DTOs, storyboard contract/compiler and proof manifests/CLI/build/pins. Workers own only disjoint new pack/asset/fixture files and return requested shared patches. Use current-branch `bee` workers, no commits/pushes; four disjoint asset workers, then at most three heavy pack workers. Start independent children before waiting and continue coordinator work. Heavy browser/native proofs begin serially.

Each pack has concrete types, poses, scene wrapper, named reusable diagram/model parts, accepted/negative raw fixtures and source/pose/layout/resource tests. No barrels, generic graph language, duplicate stages, eighty-branch renderer, placeholder dispatch or casts to weaken `KindSpec` exhaustiveness.

## Proof and completion gates

Record baseline git/HEAD and prerequisites (Node >=22, installed tools/browser, FFmpeg/FFprobe/libass, fonts/SFX, disk), then project/Remotion/local unit-proof gates. No downloads, installs, paid AI or destructive cleanup without separate authorization. Preserve the pre-existing research document and identify unchanged baseline failures by comparison.

Tests cover source actor/verb binding, negative/conditional/unresolved states, quantities/denominators, exact money/conservation/overflow/rights, finite deterministic seeks/holds, max labels/layouts/meshes/canvases, every recipe through real shortlist/parser/dispatch/rebasing/short/both-long routes, protected trim refusal, planner false friends and historical saves/version gates.

Extend existing manifests and proof runners with real business fixtures and `--business`/`--scope business`; do not weaken global completeness, native alpha/frame/hash checks or codec tolerances. Declarations, dry runs, mocks and historical reports are not render proof. Coverage keeps recipes, grammars/presets, modes, assets, treatments and sequences separate.

After final source/unit checks, build and pin outside git. Explainer and storyboard proof use the same source/build lineage; no concurrent rebuild. Execute critical frames for every OP/A/M/S, full motion for every new grammar/preset/mode and saved preview/export media for all eight sequences. Inspect native frames/readability, watch/listen to representative exports and sequences, check CFR30/dimensions/durations/alpha/captions/SFX/audio/seams/bookends/timing and real whole-interval failure fallback. Repeated-frame pixel equality is same-configuration only, never encoded-byte equality or cross-GPU equivalence.

Use existing resource/process samplers for matched old/new cold/warm maximum scenes and five repeated cycles; record elapsed time, sampled Node/owned-child RSS, canvas counts, scratch usage and exact owned-process cleanup. Mesh budgets are not GPU-memory measurements. Exercise faults/cancellation while preserving completed outputs. Final read-only security/financial reviews require triage and re-pin/re-proof after confirmed fixes.

Completion requires all 80/16/12/8 targets backed by final native artifacts/hashes and visual review; full gates pass or verified unchanged baseline failures are distinguished. A local verification document links every target, actual media/resource/cancellation observations and limits. Record project-authored asset provenance and scoped COMPLIANCE guidance. Live Gemini/ASR, Windows/cross-GPU and external legal review are unverified unless actually run. No commit, deployment or publishing is included.
