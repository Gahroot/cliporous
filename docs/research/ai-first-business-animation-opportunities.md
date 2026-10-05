# AI-first business scaling: animation opportunity catalog

Research and brainstorm · 3 October 2026 · No implementation proposed as approved work

## Recommendation

Expand the library around **how a business operates and scales**, not around more generic symbols of growth.

The strongest gaps are work redesign, decision rights, organizational replication, coordination, outcome-level economics, financial commitments, and uncertainty over time. These explain substantially more than another robot, rocket, spinning network, or cause-and-effect chain.

Use 2D for precise relationships, quantities, ownership, and comparisons. Use 3D for recognizable operating spaces, capacity, nesting, and physical constraints. Use hybrid scenes when both are necessary—not simply because 3D is available.

This catalog contains **80 scene/preset opportunities, 16 useful prop or assembly candidates, 12 motion treatments, and 8 advanced sequence concepts**. These are editorial options, not 80 new renderers, a claim of exhaustive coverage, or an implementation commitment. Several opportunities should share one new contract or reuse an existing kind.

## 1. What we already have—and should not rebuild

The library is already broader than cause and effect.

| Area | Existing coverage | Actual boundary or gap |
| --- | --- | --- |
| Business operations | `resource-allocation`, `market-exchange`, `unit-economics` | Allocation is bounded to two projects; exchange is a small buyer/seller/platform transaction; unit economics describes one source-stated sale unit and up to three stated costs. Not a general business model. |
| Business populations | `population-distribution`, `customer-cohort`, `inventory-demand` | Distribution units are orders/tasks; cohorts are bounded membership snapshots, not retention-rate or LTV calculators; inventory is product stock versus demand, not arbitrary service scheduling. |
| Organizational/technical structure | `system-layers`, `modular-machine`, `network`, `scale-hierarchy`, causal mechanisms | Useful building blocks, but not an explicit model of jobs, decision rights, replicated business units, or organizational coordination. |
| AI operations | `agent-workflow`, `retrieval-grounding`, `context-capacity`, `software-release`, `request-routing` | Tool use, retrieval, context, releases, and routing already exist. More generic agent diagrams would duplicate them. Business accountability and contractual authority need more specific meaning. |
| Cognition | `agent-team`, `agent-plan`, `agent-budget`, `model-training`, `model-evaluation`, `evidence-conflict` | Roles, plans, limits, training, evaluation, and competing evidence exist. They do not establish staffing economics, universal AI ROI, or a measured business learning loop. |
| Finance | `fund-flow`, `ownership-change`, `portfolio-exposure`, `cash-timing` | Capital movement, dilution/transfer, shared exposure, and invoice/payroll timing exist. Fund commitments, contractual distribution priorities, liquidity restrictions, and economic rights are different concepts. |
| AI comparisons | `token-attention`, `inference-tradeoff` | Attention is illustrative, not telemetry. Cost/latency/score comparisons require comparable tasks, units, and explicit unknowns. |
| Uncertainty/perspective | `possible-futures`, `digital-twin`, `scale-hierarchy` | Futures are explicitly uncertain qualitative alternatives, not probability geometry. The authored twin models a conveyor gate—not arbitrary live business telemetry. |
| Presentation | Charts, equations, timelines, versus, journeys, editorial treatments, diagrams, clay/studio assets | Generic presentation is not the same as a truthful specialized contract. A line chart does not automatically become a financial forecast or calibrated cost curve. |
| Longer explanations | Continuous longform storyboards | A separate bounded, catalog-driven path exists. It is not automatic support for every explainer kind, arbitrary custom panels, or cross-scene shared state. |

Relevant local evidence:

- `src/main/remotion/compositions/explainer/types.ts`
- `src/main/remotion/compositions/explainer/concepts/{business-operations,business-populations,perspective}/types.ts`
- `src/main/remotion/compositions/explainer/{technology,cognition,finance,business-systems,ai-systems}/types.ts`
- `src/main/remotion/compositions/explainer/diagrams/primitives.tsx`
- `src/main/remotion/compositions/explainer/hero-catalog.ts`
- `docs/plans/business-scene-recipes.md`
- `docs/adr/002-longform-continuous-storyboards.md`
- `docs/plans/longform-storyboard-verification.md`
- `src/main/remotion/DESIGN.md`

Existing business recipes already map backlogs, recurring waste, capacity adjustment, content reinvestment, and margin explanations onto current kinds. Those are candidates for better authored treatments—not justification for duplicate kinds.

This was a source audit, not a fresh rendering or test pass. Historical verification documents are not treated as current passing results.

## 2. What the research changes about the brainstorm

The sources establish topics and mechanisms. **The animation designs below are our proposals**, not conclusions or recommendations made by those studies.

| Research finding or established mechanism | Animation implication | Important limit |
| --- | --- | --- |
| Individual AI access can save time on particular activities without detectable broad task reorganization. [S1] | Separate task acceleration, job redesign, and firm-level change. | A workplace access experiment does not prove job elimination or whole-company productivity gains. |
| AI can help people combine knowledge across technical and commercial functions. [S2] | Show knowledge crossing boundaries, not departments vanishing. | A bounded product-innovation exercise is not an autonomous-company experiment. |
| AI business advice has heterogeneous effects among entrepreneurs. [S3] | Show different local constraints and implementation choices after similar advice. | No statistically detectable average revenue/profit improvement in this study; subgroup explanations are not universal laws. |
| Firm adoption, functional deployment, and worker task use are distinct. [S4] | Show adoption at several organizational levels and keep denominators visible. | The April 2026 study reports 18% firm adoption versus 32% employment-weighted adoption for its reference period—not that 32% of workers personally use generative AI. |
| AI assistance can add time in some demanding workflows. [S5] | Include verification, retries, exceptions, and integration in the cost of a resolved task. | A dated experiment with experienced open-source developers is not evidence that current AI slows every worker. |
| Complementary organizational investment complicates the timing and measurement of productivity gains. [S6] | Explain the implementation valley: changing processes, training, and integration before benefits. | The productivity J-curve includes a measurement argument. It is not a guaranteed company payback curve. |
| Fund commitments, contributions, fees, distributions, and carry are distinct contractual concepts. [S7] | Create a fund lifecycle and contract-specific waterfall. | ILPA's model agreement is a starting point, not universal fund terms or legal advice. |
| Interval funds have restricted periodic repurchases and may hold illiquid assets. [S8] | Separate reported value, available cash, requested exit, and permitted repurchase. | Interval funds are legally closed-end. Do not confuse them with daily open-end redemptions or exchange trading. |
| Control of compute, inputs, and distribution can affect competition. [S9] | Show dependency, switching friction, and where value might be captured. | Competition concerns are not proof of permanent moats or inevitable monopoly. |
| AI infrastructure financing is shifting toward debt, with sustainability contingent on earnings expectations. [S10] | Contrast physical capacity, utilization, financing, and continuing obligations. | This is financing analysis, not a default or market-crash forecast. |
| Energy and technology supply chains constrain data-center deployment. [S11] | Make grid connections, transformers, memory, cooling, and construction visible. | Future demand paths are projections; capital availability does not guarantee completed capacity. |
| Staged transitions and stable identities can improve understanding of changing visual structures. [S12] | Reorganize the same task, firm, or investment rather than replacing everything during a transition. | Research on statistical graphics does not mean more animation always improves comprehension. |
| Animated uncertainty samples can help on certain statistical inference tasks. [S13] | Consider an outcome album only when a genuine supported distribution exists. | Do not invent samples or turn equal editorial scenarios into implied probabilities. |

## 3. The opportunity catalog

### Legend

- **E — Extend:** a new preset, prop, treatment, or bounded sequence using an existing explanatory grammar. It may still need contract additions, source validation, and fixtures. It does **not** mean the idea works today.
- **N — New meaning:** a genuinely missing specialized explanation/contract, built inside the current systems. Several N ideas may share one scene family.
- **2D / 3D / H:** preferred presentation; H means hybrid.

### A. Work, teams, and organizational design

Research anchors: S1, S2, S4. Main gap: explaining work and organizational structure rather than depicting a collection of agents.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 01 | **Task atlas.** A job opens into persistent task tiles: human-led, AI-assisted, automated, and unresolved. Keep the person and accountability visible. | N · 2D/H |
| 02 | **Capability frontier.** A task map distinguishes where a system helps, fails, or needs review. Extend evaluation/quadrant treatments without inventing confidence scores. | E · 2D |
| 03 | **Cross-functional team.** Technical and commercial evidence enters one shared workbench from separate lanes. Extend `agent-team` and information transformations. | E · H |
| 04 | **Responsibility map.** Overlay who performs, approves, and owns each result. Doing a task and being accountable for it are visibly different. | N · 2D/H |
| 05 | **Expert-to-playbook transfer.** An experienced worker's documented practices become approved reusable guidance. Reuse information transformations; do not imply automatic model training. | E · H |
| 06 | **Work redeployment.** Released capacity moves into another source-stated activity rather than workers disappearing. Extend team/allocation treatments; keep counts illustrative unless supplied. | E · H |
| 07 | **Supervisor fan-out.** One reviewer coordinates several streams, with a bounded review queue. Reuse team and bottleneck grammar—not another new bottleneck kind. | E · H |
| 08 | **Coordination load.** Show required handoffs or meetings as an organization changes. Extend network/synchronization treatments; edges are not invented hours or a measured productivity penalty. | E · 2D/H |

### B. Delegation, authority, and reliable AI operations

Research anchor: workflow-specific limits in S5. These are operational design proposals, not evidence that every firm should use autonomous agents.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 09 | **Permission passport.** Each delegated task carries an allowed action, scope, owner, limit, and expiry. Capability does not automatically grant authority. | N · H |
| 10 | **Approval gate.** A prepared action waits, is approved, or remains blocked. Extend `agent-workflow`; approval must not be an automatic success beat. | E · 2D/H |
| 11 | **Bounded autonomy.** A task operates inside a step/tool budget, then stops or escalates. Extend `agent-budget` with business-specific limits. | E · H |
| 12 | **Exception economy.** Routine requests exit the main lane while unusual cases enter a human review lane. Reuse workflow/routing, with explicit exception states. | E · H |
| 13 | **Audit trail.** A result unfolds into inputs, actions, revisions, and approval. Extend information/retrieval scenes; do not fabricate logs or citations. | E · 2D/H |
| 14 | **Preview versus irreversible action.** Drafting, testing, and sending/spending occupy different stages. Extend `agent-plan`; a simulated change must not mutate the real-world object. | E · H |
| 15 | **Accountable handoff.** A persistent work item moves between humans/tools while its owner and acceptance state remain legible. Extend team/workflow semantics. | E · H |
| 16 | **Constraint collision.** A proposed action satisfies one condition but violates another: budget, policy, time, or customer requirement. Explain why it remains unresolved. | N · 2D |

### C. Small-business operating systems

Research anchors: S3, S4. Avoid the unsupported visual promise that every owner becomes a one-person enterprise overnight.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 17 | **Storefront cutaway.** Customers see the counter; the camera reveals booking, quoting, fulfillment, bookkeeping, and review behind it. Add a bounded commercial assembly to the existing stage. | E · 3D/H |
| 18 | **Owner knowledge handover.** Instructions leave a founder's private notebook for a versioned shared playbook with named responsibilities. Reuse information/team treatments. | E · H |
| 19 | **Appointment capacity.** Calendar slots, service duration, cancellations, and waiting customers explain service limits. Extend stock/demand grammar with a service-slot contract—not product quantities. | E · 2D/H |
| 20 | **Lead → booking → delivery.** Track one customer through inquiry, qualification, scheduling, fulfillment, and acceptance. Add business presets to journey/workflow. | E · H |
| 21 | **Founder dependency.** The owner is absent; only activities explicitly dependent on that person pause. Extend keystone/team treatment without implying inevitable business failure. | E · H |
| 22 | **Productized service.** A bespoke job decomposes into reusable modules plus the parts that still require judgment. Extend `modular-machine`. | E · H |
| 23 | **Micro-franchise replication.** Replicate a validated operating cell while preserving local differences, oversight, and shared support. New replication meaning, not a rocket growth metaphor. | N · 3D/H |
| 24 | **Channel dependence.** A business's demand comes from distinct customer/channel groups; one group is concentrated or uncertain. Extend customer-distribution/network treatment. | E · 2D/H |

### D. Large-business scale and transformation

Research anchors: S1, S2, S4, S6. Main gap: coordinated organization-wide change rather than isolated tool adoption.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 25 | **Federated operating pods.** Local teams share a common backbone while retaining explicitly different responsibilities and constraints. | N · 3D/H |
| 26 | **Central versus local decisions.** Decision rights change hands without magically improving every outcome. Pair an authority map with operating units. | N · 2D/H |
| 27 | **Controlled organizational rollout.** A pilot group, wider deployment, and paused/rolled-back sites coexist. Extend software-release presets to business units. | E · H |
| 28 | **Brownfield integration.** Old and new systems connect through explicit adapters; unresolved interfaces remain visible. Extend system layers with legacy assemblies. | E · H |
| 29 | **Merger reconciliation.** Two organizations retain duplicate customer records, processes, and permissions until specific reconciliation steps occur. | N · 2D/H |
| 30 | **Shared-service chargeback.** A common service serves departments while source-stated costs are attributed separately from delivered work. | N · 2D/H |
| 31 | **Official adoption versus informal use.** Compare approved deployment with worker-level experimentation. Distinct layers, not fabricated monitoring or a claim of misconduct. | N · 2D |
| 32 | **Approval congestion.** Work advances through production but accumulates at organizational sign-off. A business-specific bottleneck/workflow extension. | E · H |

### E. Business economics and scaling limits

Research anchors: S5, S6, S9, S10. Keep activity, revenue, stated-cost remainder, profit, and cash separate.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 33 | **Cost per resolved outcome.** Stack source-stated inference, retry, and review costs around one accepted job—not one token. Extend unit economics without double-counting costs. | E · 2D/H |
| 34 | **Fixed versus marginal cost.** A persistent operating base is spread across source-stated volume while per-unit costs remain separate. Needs explicit units and denominators. | N · 2D/H |
| 35 | **Utilization versus installed capacity.** Available, reserved, idle, and used capacity are distinct states. A utilization percentage appears only with its supported denominator. | N · H |
| 36 | **Hiring versus output frontier.** Compare operating designs with different staffing/capacity requirements. Scenario labels replace invented revenue-per-employee forecasts. | N · 2D/H |
| 37 | **Implementation valley.** Process redesign, integration, training, and evaluation occur before claimed benefits. Extend timeline/allocation; distinguish investment from the productivity measurement J-curve. | E · H |
| 38 | **Seat, usage, and outcome pricing.** Contrast what is purchased and what is counted under each model. Comparable cost claims need matching workloads. | N · 2D |
| 39 | **Value-capture chain.** Customer, business, platform, model provider, and infrastructure occupy distinct layers; innovation and retained margin are not the same thing. | N · 2D/H |
| 40 | **Revenue ≠ profit ≠ cash.** Follow one transaction through recognized revenue, stated costs, and payment timing. Compose unit-economics/cash-timing scenes without relabeling remainder as net profit. | E · 2D/H |

### F. Competition, distribution, and market structure

Research anchor: S9. These should explain conditions and dependencies, not declare winners.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 41 | **Distribution versus production.** More output does not automatically create buyers. Contrast production capacity with customer acquisition/acceptance using funnel and exchange grammar. | E · H |
| 42 | **Switching friction.** Data migration, integration, retraining, and contract commitments stand between providers. A stepwise transition, not an impenetrable moat icon. | N · H |
| 43 | **Two-sided cold start.** Buyers and sellers have separate participation requirements. Extend unmatched-market treatment; participation alone must not imply completed sales. | E · 2D/H |
| 44 | **Conditional network effects.** Show which participants benefit from which others and under what condition. Connection count must not masquerade as measured value. | N · 2D |
| 45 | **Commodity versus differentiated service.** Similar technical outputs contrast with source-stated differences in workflow, trust, distribution, or domain knowledge. Extend versus/layer treatments. | E · H |
| 46 | **Platform and supplier dependence.** A business owns its workflow but relies on external infrastructure, data, or distribution. Use the value-chain/dependency grammar rather than a generic hub. | N · 2D/H |
| 47 | **Agent-to-agent procurement.** Request, quote, authorization, acceptance, and payment remain separate steps. No agreement or purchase appears without the corresponding evidence. | N · H |
| 48 | **Specialization and complements.** Domain expert, AI tool, and distribution partner supply different necessary capabilities. Extend team/versus without assuming a mathematically optimal combination. | E · H |

### G. Investment-fund operating mechanics

Research anchors: S7, S8. These are some of the largest genuine gaps in the current financial library.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 49 | **Commit → call → contribute → invest.** Promised capital, requested capital, paid cash, and deployed capital occupy distinct states. Money never moves merely because someone committed. | N · 2D/H |
| 50 | **Fundraising and closing.** Prospective investors, accepted commitments, and completed closings form a contract book. A commitment is not cash in a vault. | N · H |
| 51 | **Distribution waterfall.** Contract-specific priority tiers allocate available proceeds: capital return, preferred return, catch-up, and carry where applicable. Unfilled tiers remain unfilled. | N · 2D/H |
| 52 | **Fees and gross-to-net bridge.** Show a stated fee basis, expenses, distributions, and performance allocation separately. Management fees are not a universal waterfall tier. | N · 2D |
| 53 | **Fund lifecycle and vintages.** Separate investment periods, follow-ons, realizations, and remaining assets across start dates. No generic positive J-curve is assumed. | N · 2D/H |
| 54 | **Follow-on reserves.** Initial investments and reserved capacity compete for a bounded source-stated pool. Extend allocation/fund-flow; reserves are not already deployed. | E · H |
| 55 | **Interval-fund repurchase queue.** Requests face a disclosed window and bounded repurchase capacity; unfilled requests remain visible. Fund type and terms stay explicit. | N · H |
| 56 | **Reported NAV versus available cash.** Distinguish asset valuation, realized proceeds, and cash that can meet obligations. A reported gain is not an available withdrawal. | N · 2D/H |

### H. Investing, financing, and the AI capital cycle

Research anchors: S7–S11. Explain rights and exposure without offering an investment recommendation.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 57 | **Economic-rights X-ray.** Ownership percentages and contractual payout priorities are shown on separate overlays. Extend ownership assets with a new economic-rights contract. | N · 2D/H |
| 58 | **Shared-dependency lens.** Add relevant provider/industry dependency variants to the existing portfolio-exposure grammar. Shared drivers already exist; this is not a new diversification kind. | E · 2D/H |
| 59 | **Portfolio outcome distribution.** Show realized/unrealized, loss, and gain categories with a supported population and return basis. Existing orders/tasks distribution cannot simply be relabeled as returns. | N · 2D |
| 60 | **Staged financing.** Successive source-stated funding rounds or conditional releases preserve investor/company identities. Extend fund-flow/ownership sequence treatments. | E · H |
| 61 | **Debt-funded capacity.** An infrastructure asset's utilization changes while contractual obligations remain separately visible. Conditional stress, not an automatic default animation. | N · H |
| 62 | **Maturity and liquidity ladder.** Available funds and obligations occupy stated time buckets. Maturity, saleability, and cash are not treated as interchangeable. | N · 2D/H |
| 63 | **Diligence evidence room.** Documents, calculations, contrary evidence, and unresolved questions feed an investment discussion. Extend evidence-conflict/information scenes without inventing analyst accuracy. | E · H |
| 64 | **Transferable claim, illiquid asset.** A financial claim changes hands while its underlying asset remains unchanged. Transferability does not prove liquidity or remove legal restrictions. | N · H |

### I. Data, compute, and physical infrastructure

Research anchors: S9–S11. Add recognizable assets and business constraints, not decorative chips floating in space.

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 65 | **Money ready, power not ready.** Construction, grid connection, transformers, and compute equipment advance on separate paths. Extend bottleneck with a data-center/power assembly. | E · 3D/H |
| 66 | **Inference work scheduling.** Recognizable requests wait, batch, run, or return to review across limited compute lanes. Extend routing with an authored capacity assembly—not a simulated GPU benchmark. | E · H |
| 67 | **Reserved versus burst resources.** Committed, shared, and temporary resources occupy distinct pools. Extend allocation/budget with source-grounded time and capacity labels. | E · 2D/H |
| 68 | **Data-residency placement.** A work item can go only to explicitly permitted locations/providers. Extend routing/context; ordinary cloud-versus-edge routing already exists. | E · 2D/H |
| 69 | **Provider exit drill.** A business workload migrates only after its documented dependencies are addressed; some work may remain unresolved. More than a generic fallback request. | N · H |
| 70 | **Data lineage and versioning.** Raw records, transformations, approved versions, and downstream uses remain connected. Extend information/retrieval with persistent identities. | E · 2D/H |
| 71 | **Model drift across periods.** Compare supported evaluation contexts over time; a changed workload need not mean the model retrained or improved. Extend model-evaluation. | E · 2D |
| 72 | **End-to-end latency budget.** Separate sequential waits, execution, and parallel stages. Only sum compatible, non-overlapping source-backed durations; unknowns stay unknown. | N · 2D/H |

### J. Decisions, uncertainty, and change over time

Research anchors: S4, S6, S12, S13. These fill gaps beyond deterministic “A causes B.”

| # | Idea and visual explanation | Route |
| --- | --- | --- |
| 73 | **Real options and staged commitment.** Spending a little now can preserve the choice to continue, wait, or stop later. Conditional choices remain open without invented probabilities. | N · 2D/H |
| 74 | **Constraint calendar.** Cash, hiring, approval, and physical availability must align in time. A source-stated schedule intersection, not an automatic optimization engine. | N · 2D/H |
| 75 | **Alternative operating designs.** Compare several qualified business futures with equal editorial standing. Extend possible-futures; never quietly choose a winner. | E · 2D/H |
| 76 | **Plan versus observed outcome.** Keep a proposed operating state separate from supplied observations. Extend twin/comparison treatments with a bounded business snapshot contract—not fake telemetry. | E · 2D/H |
| 77 | **Adoption denominator lens.** The same firms are seen as business counts, employment-weighted footprints, and deployment scope. Measures remain explicitly different. | N · 2D |
| 78 | **Survivorship and cohort selection.** Retain the original named group, including departures or missing observations. Extend cohort grammar rather than hiding failures from the comparison. | E · 2D |
| 79 | **Uncertainty outcome album.** Step through supported outcomes when distribution evidence exists; otherwise show only labeled qualitative alternatives. No invented Monte Carlo samples or implied likelihood from screen time. | N · 2D |
| 80 | **Bottleneck migration.** A constraint is relieved and a different source-stated constraint becomes relevant. An authored multi-scene bottleneck/control sequence, not a new generic mechanism. | E · H |

## 4. Eight more advanced signature sequences

Complexity should come from **multiple truthful views of the same business**, not from adding visual noise. These are proposed authored sequences. Cross-view identity and state bridges would need deliberate adapters; the current storyboard path does not provide them automatically.

### 1. The company inside-out

Begin at a clay storefront or office. Reveal its operating departments. Flatten the same work items into a 2D task atlas, highlight review/authority, then return to the operating model with those responsibilities visible.

- Explains: what “AI-first” changes inside a company.
- Reuse: clay, existing studio/stage, diagrams, workflow/team assets.
- Add: commercial assembly, task/responsibility contract, authored matching IDs and view transitions.
- Avoid: people turning into robots, unsupported staff reductions, arbitrary object morphing.

### 2. One transaction, four views

Track one source-stated job through customer acceptance, delegated authority, stated-cost economics, and payment timing. The same transaction is highlighted in every view.

- Explains: why completed work, a profitable-looking sale, and cash received are different.
- Reuse: journey/exchange, workflow, unit economics, cash timing.
- Add: a small bounded sequence recipe and compatible shared transaction identity.
- Avoid: combining mismatched periods, currencies, cost bases, or customer identities.

### 3. Small business → operating network

One authored business cell becomes a small group of local cells with shared support. Show which functions are replicated, centralized, or still owner-dependent. End on the unresolved scaling constraint where the source has one.

- Explains: repeatability, delegation, local variation, and coordination.
- Reuse: system layers, modular assemblies, network/synchronization, clay stage.
- Add: business-cell assembly and replication/federation contract.
- Avoid: treating duplicated geometry as evidence of revenue growth or guaranteed economies of scale.

### 4. The fund's capital lifecycle

Start with commitment documents, not coins. A call requests capital; paid cash appears only on contribution. Investment deploys it. Reported values remain separate from realized proceeds, which enter the applicable distribution waterfall.

- Explains: what a fund actually does with commitments and cash.
- Reuse: fund-flow, ownership, cash-timing, diagram primitives.
- Add: commitment ledger, lifecycle contract, contractual distribution tiers.
- Avoid: promised returns, universally assumed fees, or a compulsory profitable exit.

### 5. The dependency X-ray

Reveal several apparently different businesses or holdings. Peel back one layer to show explicitly stated common providers, infrastructure, customers, or financing dependencies. Show a conditional stress path only where the source supports it.

- Explains: why visible variety does not necessarily mean independent risk.
- Reuse: portfolio-exposure, layers/network, recognizable business/compute assets.
- Add: bounded cross-sectional dependency treatment; optional business-dependency contract outside finance.
- Avoid: invented correlations, systemic-collapse predictions, or unlabeled scenario shocks.

### 6. The learning loop that does not pretend to self-train

A task produces an exception. Human review records a correction. An approved process document changes. A later task uses that documented version. A comparison remains unresolved unless outcomes are actually supplied.

- Explains: operational knowledge improvement and governance.
- Reuse: workflow, information transformations, evidence/evaluation treatments.
- Add: versioned playbook assembly and an explicitly authored repeat sequence.
- Avoid: implying that every correction updates model weights or guarantees better results.

### 7. Two operating designs, one set of constraints

Compare two proposed business designs under the same source-stated demand, capital, and policy conditions. Reveal differences in handoffs, review, and reserved capacity without declaring a winner the speaker did not establish.

- Explains: tradeoffs and conditional strategies, not merely before/after.
- Reuse: possible-futures, allocation, team/workflow, diagram framing.
- Add: identity-preserving comparison recipe and labeled assumptions.
- Avoid: fabricated performance curves, probabilities, or counterfactual measurements.

### 8. Ownership and payout are different layers

A company or fund remains in the center. One overlay shows ownership; another shows source-stated financial priorities or restrictions. At a supported distribution event, only entitled claims receive the appropriate amount.

- Explains: shares, preferences, debt claims, and payout rights without conflating them.
- Reuse: ownership-change, finance actors, diagram labels and money carriers.
- Add: economic-rights contract and a tightly bounded rights assembly.
- Avoid: assuming ownership percentage equals proceeds percentage or giving generic legal guidance.

### Sequence boundary

Use ordinary scene sequences when they suffice. Use a full-frame longform storyboard only when continuity materially improves understanding. The current path is bounded to at most five panels and six props and requires catalog adapters. Do not silently increase those budgets or claim arbitrary explainer scenes already work inside it. Shorts should reduce these stories to a few readable beats—not shrink a longform dashboard into 9:16.

## 5. Asset shelf: 16 useful props or assemblies

Prefer assemblies of existing geometry over adding redundant hero icons. These are candidates, not a promise that every item deserves a standalone hero prop.

| Candidate | What it unlocks | Reuse versus addition |
| --- | --- | --- |
| Commercial storefront/office cutaway | Visible business operations behind a customer-facing surface | New authored commercial shell; existing clay/studio and familiar fixtures |
| Repeatable business pod | Replication, branches, federation, roll-ups | New compact assembly with stable local identity; not an imported city model |
| Service/appointment station | Time-based service capacity | New recognizable service assembly; extend existing calendar/queue assets |
| Operating workbench | Human/tool teamwork and job acceptance | Assemble existing laptop, documents, and carriers with a bounded working surface |
| Permission passport | Delegation scope, owner, limits, and expiry | New card/plaque treatment; existing visual materials and diagram typography |
| Versioned playbook binder | Founder handover and approved operating knowledge | Extend existing book/document geometry; add version/approval states |
| Evidence folio | Diligence, provenance, unresolved questions | Assemble existing folders/documents; labels remain bounded and source-grounded |
| Commitment ledger | Promises distinct from contributed money | New ledger assembly; reuse existing money carriers only after contribution |
| Waterfall tier trays | Contractual priority and remaining proceeds | New bounded allocation assembly; no fluid simulation or universal tier order |
| Rights stack | Ownership separate from contractual claims | New layered claim assembly; stable actor labels and entitlement states |
| Maturity/availability ladder | Cash and obligations in different time buckets | New time-bucket assembly; reuse calendar and money geometry |
| Shared-service hub | Central services, departments, and cost attribution | New hub assembly built from existing server/office assets |
| Batched server rack | Inference capacity, workload placement, infrastructure | New low-mesh assembly; no per-window/per-chip mesh explosion |
| Power connection/substation | Grid connection and power constraints | New recognizable authored geometry, not an anonymous glowing box |
| Cooling-loop/heat-exchanger assembly | Physical data-center constraints | Reuse pipes/valves where suitable; add a readable cooling structure |
| Legacy connector panel | Adapters, migration, supplier switching | New bounded endpoints/connectors; connections do not imply universal interoperability |

No new mascot, generic robot head, rocket, shield, or coin pile is needed just to announce “AI” or “growth”; useful existing equivalents already exist.

## 6. Twelve motion treatments worth adding

These are reusable authored treatments, not a new animation engine.

1. **Identity-preserving split.** One role opens into its tasks while retaining the role and task identities.
2. **Decompose and recombine.** Separate a stated total into components, then restore it without losing or creating units.
3. **Selective isolation.** Temporarily mute unrelated actors so the active relation is readable; restore them rather than pretending they vanished.
4. **Matched 2D/3D views.** A diagram and spatial assembly share explicit identities through an authored transition. Not arbitrary mesh morphing.
5. **Plan/observed overlay.** Qualify the plan and distinguish supplied observations with separate styling and dates.
6. **Time-bucket stepping.** Move through labeled periods with legible holds. Animation time is not silently treated as business time.
7. **Nested scale reveal.** Track a subject while revealing team, firm, or market context. Reuse scale-hierarchy rather than adding decorative zooms.
8. **Aligned alternative snapshots.** Compare scenarios with the same actors and baseline without quietly selecting a winner.
9. **Authority handshake.** A request pauses at the decision point; approval, rejection, or pending state is explicit.
10. **Conserved tier allocation.** Source-stated proceeds enter priority tiers without duplicate money or hidden negative amounts.
11. **Provenance unfolding.** A result expands into its documented origins and transformations; no invented sources.
12. **Constraint boundary.** A budget, permission, or capacity boundary visibly stops an action without a fake success flourish.

Design rules: seekable frame-driven motion; clear setup/action/final holds; stable tracked IDs; restrained camera moves; consistent diagram labels; no idle decoration competing with the explanation. Use the existing motion kit instead of inventing clock-based animation or a second styling system.

## 7. Recommended first batch

This is the preferred eventual build order—not work started by this brainstorm.

| Priority | Opportunity | Why start here |
| --- | --- | --- |
| 1 | Task atlas + responsibility map | High frequency in AI-first business discussions; a missing non-causal grammar that can support many topics. |
| 2 | Permission passport + approval gate | Explains the difference between assistance and safe delegated operations; strong visual reuse. |
| 3 | Commercial cutaway + business pod | Gives small-business and organizational stories recognizable, reusable settings. |
| 4 | Exception economy | A useful preset extension with less architecture work than a new general mechanism. |
| 5 | Resolved-outcome cost stack | Directly explains scaling economics without confusing cheap tokens with cheap completed work. |
| 6 | Replication/federation | Makes small-to-big scaling tangible without relying on a rising chart. |
| 7 | Commitment/capital lifecycle | Fills a genuine investment-fund gap using existing finance primitives. |
| 8 | Distribution waterfall | A visually distinct advanced asset with precise semantics; deserves a separate careful financial contract. |

Second wave: rights X-ray, maturity/liquidity ladder, value-capture chain, coordination treatments, dependency X-ray, and infrastructure assemblies.

Later, evidence-heavier work: calibrated scale economics, portfolio return distributions, real-option timelines with quantities, and statistically meaningful uncertainty displays. These need more than attractive geometry.

## 8. How these additions fit the existing systems

- Add bounded presets, props, or scene kinds; reuse `Clay`, the studio, `ExplanationStage`/existing mechanism stages, diagram primitives, palette, and motion kit.
- Prefer diagram and hybrid options for the same validated facts where useful. Diagram mode should not require WebGL; hybrid should use one stage, not a new canvas per object.
- New hero props should retain the existing one-signature-motion role. Multi-stage stories belong in authored scenes or approved storyboard adapters.
- Extend the existing planner/kind-spec/contract path and transcript-grounded evidence. Do not introduce a second planning engine, arbitrary geometry, remote assets, or runtime simulations.
- Preserve bounded labels/actors and existing short-form/longform layouts. Information density should be reduced before budgets are raised.
- Keep numbers, time units, currencies, denominators, populations, and source periods explicit. Reuse does not grant permission to relabel orders as returns or qualitative geometry as probabilities.
- For stronger continuity, author a small number of recognizable shared assemblies and explicit IDs. Current shared house identity is not a generic cross-scene state-morphing system.
- Keep source grounding and arithmetic separate: stated quantities can support calculations; merely matching words does not establish causation, a forecast, or an optimal decision.
- No new dependencies, generic business simulator, physics engine, or editor rebuild is needed for this catalog.

## 9. Quality gate for an eventual asset

A candidate should not be counted as complete because one still looks attractive.

1. **Useful gap:** it explains something a current preset does not explain adequately.
2. **Recognizable carriers:** a shop, work item, contract, server rack, or service station—not anonymous cubes pretending to be a business.
3. **Truthful semantics:** authority, ownership, cash, work, evidence, and uncertainty remain distinguishable.
4. **Readable still:** a setup and final frame communicate the relation without needing decorative motion.
5. **Readable movement:** identities persist and transitions explain a change; advanced does not mean constant movement.
6. **Both media strengths:** precise 2D labels and quantities; 3D spatial structure only where it adds information.
7. **Production fit:** standard layouts, palette, stage/motion infrastructure, and planner triggers; no unrelated renderer fork.
8. **Observed proof before shipping:** production-path parsing/shortlisting/rebasing tests, seekability, rendered layout/label stress, alpha/media checks, and bounded resource evidence as appropriate.
9. **Honest limitations:** missing values stay unknown; scenarios stay conditional; returns and wins are never auto-injected.
10. **Shorts discipline:** simplify or split an explanation rather than cramming every layer into one vertical shot.

Finance concepts are educational mechanism candidates, not investment advice or verified legal templates. Actual terms, jurisdictions, licensed advice, imported assets, and distribution rights would need appropriate review before shipping related product features. This research document changes none of those boundaries.

## 10. Sources

Accessed for this pass on 3 October 2026. Dates refer to the retrieved edition when identifiable. This is a targeted literature scan, not a claim that every future-business prediction has been surveyed or validated.

- **S1 — Dillon et al., _Shifting Work Patterns with Generative AI_.** NBER Working Paper 33795, May 2025, revised November 2025. Field experiment across 66 firms and 7,137 knowledge workers. [Primary PDF](https://www.nber.org/system/files/working_papers/w33795/w33795.pdf). Working paper; individual-level access and measured digital work patterns, not an economy-wide forecast.
- **S2 — Dell'Acqua et al., _The Cybernetic Teammate: A Field Experiment on Generative AI Reshaping Teamwork and Expertise_.** Retrieved NBER Working Paper 33641 edition dated April 2025. Product-innovation experiment with 776 P&G professionals. [Primary PDF](https://www.nber.org/system/files/working_papers/w33641/w33641.pdf). Working paper and bounded task setting; not department replacement.
- **S3 — Otis et al., _The Uneven Impact of Generative AI on Entrepreneurial Performance: Evidence from a Field Experiment in Kenya_.** HBS Working Paper 24-042; retrieved draft carries 2023/2024/2026 copyright, exact revision date not established. [Primary PDF](https://www.hbs.edu/ris/download.aspx?name=24-042.pdf). No statistically detectable average treatment effect on revenues/profits; heterogeneous effects and exploratory implementation explanations.
- **S4 — Bonney et al., _The Microstructure of AI Diffusion: Evidence from Firms, Business Functions, and Worker Tasks_.** NBER Working Paper 35141, April 2026, using the Census BTOS AI supplement. [Primary PDF](https://www.nber.org/system/files/working_papers/w35141/w35141.pdf). Survey concepts, weighting, and reference periods matter; performance associations are not a universal causal ROI estimate.
- **S5 — METR, _Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity_.** 10 July 2025. [Primary report](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/). Sixteen experienced developers and 246 issues; dated, narrow setting, not a claim about all current software work.
- **S6 — Brynjolfsson, Rock and Syverson, _The Productivity J-Curve: How Intangibles Complement General Purpose Technologies_.** NBER Working Paper 25148, October 2018, revised January 2020; published in _American Economic Journal: Macroeconomics_ in 2021. [Primary working-paper PDF](https://www.nber.org/system/files/working_papers/w25148/w25148.pdf). Distinguish complementary investment and productivity measurement from company cash payback.
- **S7 — ILPA, _Model Limited Partnership Agreement—Whole-of-Fund Waterfall_.** July 2020. [Model agreement](https://ilpa.org/wp-content/uploads/2020/07/ILPA-Model-Limited-Partnership-Agreement-Whole-of-Fund-Waterfall-July-2020.pdf). A customizable private-equity buyout fund model, explicitly not legal advice or universal terms.
- **S8 — U.S. SEC, _Investor Bulletin: Interval Funds_.** 25 September 2020. [Primary bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/investor-bulletin-interval-funds). Restricted periodic repurchases, illiquid holdings, possible losses, and fund-specific fees.
- **S9 — UK Competition and Markets Authority, _AI Foundation Models: Update paper_.** 11 April 2024. [Primary PDF](https://assets.publishing.service.gov.uk/media/661941a6c1d297c6ad1dfeed/Update_Paper__1_.pdf). Competition risks around inputs, distribution, and incumbent positions; not proof of permanent market outcomes.
- **S10 — Aldasoro, Doerr and Rees, _Financing the AI boom: from cash flows to debt_.** BIS Bulletin 120, 7 January 2026. [Primary PDF](https://www.bis.org/publications/bulletin-120-financing-ai-boom-cash-flows-debt.pdf). Financing observations and conditional earnings/sustainability analysis; authors' views, not a market prediction.
- **S11 — IEA, _Key Questions on Energy and AI_.** April 2026 report; official presentation by Thomas Spencer and Siddharth Singh dated 1 June 2026. [Report](https://iea.blob.core.windows.net/assets/3179f7f8-01f6-4dd6-bffa-c9f7b73f1dc9/KeyQuestionsonEnergyandAI.pdf) · [Presentation](https://iea.blob.core.windows.net/assets/fcb583db-c3be-4c94-a799-9e42a9d5ba88/KeyQuestionsonEnergyAndAISlides.pdf). Physical deployment bottlenecks and conditional energy-demand outlooks; future projections are not realized outcomes. The presentation supplied directly readable bottleneck evidence; the main website executive summary was access-blocked.
- **S12 — Heer and Robertson, _Animated Transitions in Statistical Data Graphics_.** IEEE InfoVis, 2007. [Primary PDF](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf). Transition design, staged changes, and object constancy in statistical graphics; apply selectively to authored explanations.
- **S13 — Hullman, Resnick and Adar, _Hypothetical Outcome Plots Outperform Error Bars and Violin Plots for Inferences about Reliability of Variable Ordering_.** _PLOS ONE_, 2015. [Primary article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0142444). Evidence concerns specific inference tasks with supported distributions—not permission to manufacture business forecasts.

## Deliverable status

Research and brainstorming only. No application code, planner contracts, assets, dependencies, or runtime behavior changed. No tests or rendering checks were run for this documentation-only deliverable. No commit or release was made.
