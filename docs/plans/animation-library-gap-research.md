# Animation library: gap research and idea inventory

Research date: 3 October 2026.

**Recommendation: expand what we can explain before expanding how many objects we can animate.** The best opportunities are evidence and reasoning, uncertainty, decisions and constraints, concurrent activity, precise quantitative relationships, and spatial/representation changes.

This is a research and brainstorm document, not an approved implementation plan. It contains **80 candidate animation stories, 12 reusable asset kits, and 8 advanced showcase treatments drawn from those stories**. Those are not 100 independent scene kinds. The inventory is a broad first pass, not a claim to cover every conceivable animation.

No runtime code, assets, dependencies, settings, or planning limits were changed. Current coverage was inspected in code and existing verification documents; visual quality was not freshly assessed by rendering the library.

## 1. What we already have

The current registry is broader than the older 49-kind overview:

| Existing layer | Verified coverage | What that means |
| --- | --- | --- |
| Broad explainer idioms | 39 kinds | Lists, comparisons, statements, timelines, simple charts, networks, cycles, equations, sets, rankings, stories, and general clay metaphors. |
| Causal mechanisms | 10 kinds | Bottlenecks, momentum, leverage, leaks, feedback, structural dependency, routing, synchronization, relays, and exploded views. |
| Technology stories | 5 kinds / 15 presets | Agent tools/retries/approval; retrieved evidence; context/summary/memory; software checks/rollback/parallel release; cache hit/miss/fallback. |
| Spatial and cognition stories | 14 kinds / 29 presets | Houses/property/fit/access and agents/plans/budgets/training/evaluation/conflicting evidence. |
| Concept stories | 18 kinds / 42 presets | Layers, sorting, transformation, inference, allocation, markets, economics, populations, cohorts, inventory, scale, futures, twins, collective patterns, perception, and modular assemblies. |
| Dedicated diagram/hybrid stories | 7 kinds / 15 presets | Detroit place, finance/ownership/exposure, cash timing, token attention, and inference trade-offs. |
| Hero catalog | 71 props | Includes objects, filled silhouettes, and kinetic mechanisms; these are not 71 complete explanations. |
| Separate persistent storyboard system | 6 panel kinds / 7 model choices | Source-grounded statement, comparison, process, notes, quantity, and hero panels on a continuous board; not an unrestricted semantic graph. |

**Total: 93 registered explainer kinds = 39 broad kinds + 54 specialized kinds.** Do not add the storyboard panels, presets, or hero props to that total. The internal `CAUSAL_SCENE_KINDS` grouping also protects non-causal stories; its name does not describe the whole library's meaning.

Important distinctions:

- A generic `chart` currently supports bars/lines with 3–6 points. It is not a statistical visualization suite.
- `population-distribution` describes a small named population with bounded amounts. It is not an arbitrary histogram, density curve, or survey dataset.
- `possible-futures` preserves qualitative alternatives. It deliberately does not encode probabilities or statistical confidence bands.
- `model-evaluation` and `inference-tradeoff` already compare approaches. A new trade-off idea must add a real capability, not rename these scenes.
- Cache hit/miss, retries, parallel release checks, scale hierarchy, assembly, and basic conflicting evidence already exist. Their richer variants below are marked as extensions.
- Diagram/hybrid is a supported contract for seven current kinds, not a switch automatically available for all 93.
- The hybrid stage currently provides a same-subject model-to-diagram crossfade. A true identity-matched geometric transition would be new authored work.
- Storyboards have a deliberately closed model/panel vocabulary. A new explainer asset is not automatically available as a storyboard prop.

## 2. Research findings that guide the brainstorm

These sources inform the design choices; they do not validate the proposed BatchClip assets. Research findings, established visualization guidance, and design inspiration are separated below.

| Source | Evidence type and useful takeaway | Application here |
| --- | --- | --- |
| [Brehmer and Munzner: visualization task typology](https://www.cs.ubc.ca/labs/imager/tr/2013/MultiLevelTaskTypology/) | Research framework. Distinguishes why a visualization is needed, how it operates, and its inputs/outputs. | Organize additions by the question they answer, not by attractive prop names. |
| [Financial Times Visual Vocabulary](https://raw.githubusercontent.com/Financial-Times/chart-doctor/main/visual-vocabulary/Visual-vocabulary-en.pdf) | Editorial guidance. Separates deviation, correlation, ranking, distribution, change over time, magnitude, part-to-whole, spatial relationships, and flow; includes uncertainty treatments. | Our bar/line chart should not stand in for all quantitative relationships. |
| [Aigner et al.: visualizing time-oriented data](https://vca.informatik.uni-rostock.de/~ct/publications/Aigner07TimeVis.pdf) | Research framework. Points differ from intervals; linear, cyclic, and branching time have different structures. | Add duration, overlap, expiry, concurrency, and cycle-to-timeline explanations beyond a basic timeline. |
| [Heer and Robertson: animated transitions](http://vis.stanford.edu/files/2007-AnimatedTransitions-InfoVis.pdf) | Controlled experiments and design discussion. Appropriate transitions helped the tested graphical-perception tasks; animation can also distract or falsely imply identity/causation. | Preserve identity during view changes; separate axis changes from value changes; do not claim every animation improves learning. |
| [Mayer and Moreno: cognitive load in multimedia learning](https://www.uky.edu/~gmswan3/544/9_ways_to_reduce_CL.pdf) | Research synthesis with instructional experiments. Essential, incidental, and memory-holding demands can overload learners. | More sophisticated rigs should reveal one meaningful relationship at a time, not add simultaneous spectacle. These results are not a direct test of our short-form edits. |
| [Seeing Theory: Bayesian inference](https://seeing-theory.brown.edu/bayesian-inference/index.html) | Educational example and inspiration. Prior information and new evidence have distinct roles in updating a belief. | A probability workbench needs explicit priors, evidence, and an updated result—not a generic confidence meter. |
| [Setosa: conditional probability](https://setosa.io/conditional/index.html) | Educational example and inspiration. Conditioning changes the reference population. | Retain the original population, then isolate the relevant subset; make the denominator visible. |
| [Red Blob Games: pathfinding](https://www.redblobgames.com/pathfinding/a-star/introduction.html) | Educational explanation. Distinguishes search frontier, obstacles, costs, and the resulting route. | A routing/search asset should show alternatives examined, not merely animate a finished arrow. |
| [Distill: how to use t-SNE effectively](https://distill.pub/2016/misread-tsne/) | Technical explanation and illustrated failure modes. Cluster sizes and distances in an embedding can be misleading. | Do not turn arbitrary visual spacing, clusters, or particle density into unsupported claims about similarity or amount. |

Practical conclusions:

1. **Explanation breadth beats prop count.** A reusable assembly with meaningful states is more valuable than another rotating icon.
2. **2D has equal standing.** Exact comparisons, probabilities, arguments, and schedules usually need aligned planar marks. Use 3D for shape, containment, clearance, assembly, or viewpoint.
3. **Complexity should live in the rig, not in the viewer's workload.** A sophisticated asset can still present a simple, readable moment.
4. **Alternate views should retain the same facts.** A clay introduction and a precise diagram must not become two contradictory accounts.
5. **Animation is not proof.** A plausible motion, simulation, or visual metaphor must not be presented as observed evidence.

## 3. Highest-value gaps

| Explanation question | Current foothold | Gap worth filling |
| --- | --- | --- |
| Why should I believe this? | Study, retrieved evidence, conflicting claims | Claims, assumptions, provenance, objections, and scope shown explicitly. |
| How uncertain is it? | Qualitative futures and unresolved outcomes | Supported intervals, sampling, base rates, and belief updates without invented certainty. |
| What is the quantity really saying? | Small charts, amounts, populations, finance | Denominators, distributions, subgroup differences, signed changes, and compositions. |
| Which choice fits these conditions? | Versus, rankings, two-model comparisons | Constraint elimination, conditional rules, weighted decisions, and no-single-winner trade-offs. |
| Who relates to whom, and how? | Hub networks, teams, ownership | Hierarchies, dependencies, typed relationships, approvals, and matching constraints. |
| What happens simultaneously or remains pending? | Timelines, loops, parallel presets | Duration, overlap, deadlines, state transitions, and history-dependent behavior. |
| How does the same thing look in another representation? | Information transforms and hybrid crossfades | Traceable aggregation, equivalence, projection, coordinates, and representation bridges. |
| What is inside, obstructed, reachable, or able to fit? | Houses, cutaways, perception, floorplan fit | General sections, unfolding, volumetric packing, occlusion, and constrained spatial routes. |
| How does a real task work? | Chat, search, code, agent/release stories | Bounded product walkthroughs, duplicate actions, shared-state conflicts, and access boundaries. |
| Can we explain unfamiliar physical systems? | Kinetic mechanisms and authored assemblies | Carefully scoped signal, transport, material-state, and infrastructure assets. |

## 4. Full candidate inventory: 80 ideas

Legend:

- **N — new coverage:** no dedicated matching story contract was found in the reviewed catalog. Existing primitives may approximate it. This does not settle whether implementation should introduce a new kind.
- **E — extension:** a richer preset, factual contract, or alternate view of existing coverage. Do not build a duplicate kind by default.
- **2D / 3D / hybrid:** recommended presentation, not a claim that the variant exists today.
- **S / M / L:** relative development depth: reuse-heavy; new asset/story/validation; or advanced multipart/multi-view/quantitative work. These are rough comparisons, not time estimates.

Every example below is a proposed teaching situation, not a quotation from an actual source. Numbers, conclusions, spatial facts, and model behavior would still need supported inputs.

### A. Evidence, arguments, and reasoning

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 1 | Evidence-to-claim trace | Source fragments travel into named intermediate facts and then a claim; unsupported portions remain visibly unconnected. | E: retrieval + information transform / 2D or hybrid / M |
| 2 | Competing claims, shared evidence | Two claims inspect the same evidence table rather than treating two floating documents as equally decisive. | E: evidence conflict / 2D / M |
| 3 | Argument and objection map | Reasons support a claim; an objection attaches to the exact assumption or premise it challenges. | N / 2D / M |
| 4 | Assumption switchboard | Toggle one stated assumption while holding the other facts fixed; the dependent conclusion becomes conditional. | E: digital twin + futures / hybrid / M |
| 5 | Correlation versus a hidden factor | Two changing observations share a third influence; connection is distinguished from an asserted causal link. | N / 2D / M |
| 6 | Known, unknown, and missing | A structured evidence board shows what is stated, what is absent, and what cannot yet be concluded. | E: no-evidence + unresolved conflict / 2D / S–M |
| 7 | Apparent contradiction, different scope | Claims about different dates, groups, definitions, or conditions separate into their actual scopes. | E: evidence conflict / 2D / M |
| 8 | Same facts, different framing | The same fixed quantities appear in alternate frames without changing the underlying entities or values. | N; reuses comparison / 2D / M |

### B. Probability, uncertainty, and sampling

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 9 | Base-rate and false-positive microscope | Start with a whole population, show real cases and test outcomes, then zoom into positive results without hiding the original denominator. | N; reuses pictogram/population motifs / 2D or hybrid / L |
| 10 | Bayesian belief update | A stated prior and evidence produce a changed belief; the old and new distributions remain distinguishable. | N / 2D / L |
| 11 | Conditional subset lens | Selecting a condition changes the reference group; the overlap and denominator stay visible. | E: Venn, with a new quantitative contract / 2D / M |
| 12 | Sampling and survivorship bias | A selection gate excludes part of the population, revealing why the visible sample is not the whole story. | N; reuses population/cohort actors / 2D or hybrid / M |
| 13 | Repeated-sample variation | Several authorized, bounded samples produce different estimates; one result is not shown as the population truth. | N / 2D / L |
| 14 | Measured range and forecast uncertainty | A value/range or a small set of supported scenarios appears with its meaning and assumptions; confidence, prediction, and qualitative possibilities are not conflated. | E: futures + charts, substantial new validation / 2D / L |
| 15 | Probability versus consequence | Two risks occupy separate likelihood and impact dimensions; a rare severe event is not confused with a frequent minor one. | E: quadrant, with grounded metrics / 2D / M |
| 16 | Confidence versus correctness | Prediction groups compare stated confidence with observed outcomes; confident errors remain visible. | E: model evaluation / 2D / L |

### C. Quantities, distributions, and comparison

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 17 | Distribution shape and long tails | Records collect into real frequency bins; two equal averages can conceal very different distributions. | E: population distribution, new data contract / 2D / L |
| 18 | Subgroups reverse the headline | Split a population into explicitly stated groups to show why an aggregate comparison can reverse. | N / 2D / L |
| 19 | Absolute, relative, and denominator | The same source-backed change is expressed as a count, rate, or relative change with reference groups visible. | E: number + chart + pictogram / 2D / M |
| 20 | Parts of a whole | A fixed whole partitions into stated portions; separate views distinguish composition from independent magnitudes. | N; reuses ownership-strip ideas / 2D / M |
| 21 | Rank changes across periods | Stable identities move between two rankings; a slope/bump view makes who moved, not only who won, readable. | E: ranking / 2D / M |
| 22 | Calendar and seasonality | A bounded calendar view exposes recurring patterns that disappear in a single smooth trend line. | E: chart + streak / 2D / M |
| 23 | Above, below, and away from target | Signed marks diverge from a shared reference; shortfall is not presented as another positive bar. | E: chart + spectrum / 2D / M |
| 24 | Fair comparison on shared axes | Several small aligned views retain identical scales and units; the camera does not manufacture a winner. | E: charts + model evaluation / 2D / M |

### D. Decisions, constraints, and optimization

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 25 | Constraint sieve | Candidate options encounter stated requirements one at a time; eliminated options retain the reason they failed. | N; reuses sorting/fit motifs / 2D or hybrid / M |
| 26 | Trade-off frontier | Options compare cost, time, or performance; dominated options fall away while several non-dominated choices remain. | N; extends beyond two-model rails / 2D / L |
| 27 | Changing priorities, changing ranking | A clearly stated change in criteria weights reorders options without pretending the options themselves changed. | E: ranking + model evaluation / 2D / L |
| 28 | Conditional decision tree | Explicit if/otherwise rules select branches; an unknown condition leaves the result unresolved. | N; distinct from scenario futures / 2D / M |
| 29 | Search frontier versus final route | A bounded authored map reveals explored options, obstacles, stated costs, and the eventual path. | N; reuses routing motifs / 2D or hybrid / L |
| 30 | Local versus global optimum | A simple supported landscape distinguishes a nearby best point from a better distant region. | N / 2D or 3D with a planar reference / L |
| 31 | Explore versus exploit | A limited choice sequence distinguishes trying an unknown option from using an established one. | N; reuses expert selection / 2D / M |
| 32 | Sequential testing and elimination | Options are ruled out by stated tests; a surviving candidate is not automatically declared optimal. | E: evaluation + expert selection / 2D / M |

### E. Relationships, hierarchy, and classification

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 33 | Taxonomy and nested categories | Retained examples sit inside parent/child categories; ancestry is distinguished from similarity or physical scale. | N; reuses layers/sorting / 2D / M |
| 34 | Ownership versus control | Two separately labeled relationship layers show who owns an asset and who can direct a decision. | E: ownership change, new control evidence / 2D or hybrid / L |
| 35 | Responsibility and approval map | Performer, reviewer, approver, and recipient are different roles; a handoff does not imply authority. | E: agent team + approval gate / 2D or hybrid / M |
| 36 | Dependency map | A task or part needs another before proceeding; dependency lines are not confused with material flow. | N; reuses network/keystone / 2D / M |
| 37 | Relationship matrix to graph | A small adjacency matrix and a graph show the exact same named relationships with matched identities. | N; reuses network/diagram / 2D / L |
| 38 | Matching with limited capacity | Items compete for a limited number of valid slots; capacity conflicts and unassigned items remain explicit. | E: semantic sort + allocation / 2D or hybrid / M |
| 39 | Inclusion, exclusion, and set operations | Union, intersection, and difference operate on retained examples rather than merely overlapping labeled circles. | E: Venn / 2D / M |
| 40 | Network resilience and bridges | Remove a specified connection to show reachability or redundancy, without inventing centrality scores. | E: network + collective patterns / 2D / M |

### F. Time, concurrency, and state

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 41 | Concurrent work lanes | Duration bars and event markers show work happening at the same time versus waiting or running sequentially. | N; basic parallel presets are narrower / 2D / M |
| 42 | Critical path and slack | A small supported task network highlights which durations constrain completion and which can move without delaying it. | N / 2D / L |
| 43 | Reversible state machine | An actor moves among named waiting, active, paused, failed, or complete states through explicit allowed transitions. | N; reuses technology status vocabulary / 2D / M |
| 44 | Deadline, expiry, and validity windows | A task can exist before it becomes valid or after permission expires; the eligible window is visible. | N / 2D / M |
| 45 | Delay versus processing rate | The same jobs distinguish time before response, throughput, and work-in-progress using supported measurements or qualitative labels. | E: bottleneck + request routing / 2D or hybrid / M |
| 46 | Periodic signals and phase | Two cycles show matching frequency but different phase, or a change in synchronization, with a linear time reference. | E: synchronization + loop / 2D / M |
| 47 | History-dependent state | The same present input can produce different states depending on its earlier path; a labeled hysteresis example retains that history. | N / 2D / L |
| 48 | Aligned before/during/after traces | One persistent subject has parallel timelines for state, action, and observation; temporal alignment does not imply causation. | E: digital twin + comparison / 2D or hybrid / M |

### G. Mathematics and representation changes

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 49 | Unit conversion and dimensional meaning | Units remain attached to quantities as a supported conversion changes the representation, not the thing measured. | E: equation + number / 2D / M |
| 50 | Equivalent fractions and proportions | The same stated fraction appears as a strip, set, and area partition with an unchanged denominator. | N; reuses pictogram / 2D / M |
| 51 | Aggregation and lost detail | Several identifiable inputs become a summary while the omitted detail remains traceable outside the aggregate. | E: information transform + context summary / 2D or hybrid / M |
| 52 | Lossless versus lossy representation | A bounded mosaic is encoded and reconstructed; exact restoration is distinguished from deliberate discarded detail. | E: information transform / 2D / M |
| 53 | 3D projection and coordinate frames | The same authored object moves between views; projected positions and depth ambiguity are explained, not hidden. | N; reuses hybrid/stage projection / hybrid / L |
| 54 | Matrix multiplication workbench | A selected row and column pair combine into one output cell; a small source-supported example keeps the arithmetic visible. | N / 2D or shallow clay tiles + 2D math / L |
| 55 | Vector decomposition | A named vector separates into stated components and recombines; direction and magnitude have defined meanings. | N / 2D / M |
| 56 | Algebraic regrouping | Terms regroup or factor while preserving the actual expression; unlike terms never merge through a cosmetic morph. | E: equation / 2D / L |

### H. Space, geometry, and place

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 57 | Moving section scanner | An authored section plane exposes successive interiors while a linked planar slice names the currently visible parts. | E: cutaway + exploded view / hybrid / L |
| 58 | Solid unfolds into a net | Panels rotate about authored hinges to connect a familiar solid with its flat construction. | N / 3D with linked 2D / L |
| 59 | Packing, clearance, and fit | Recognizable items fit or collide inside a bounded volume; transparent guides clarify the offending dimension. | E: floorplan fit + modular machine / 3D with 2D dimensions / L |
| 60 | Local-to-global identity zoom | A marked subject remains itself while revealing its supported enclosing context; add domains beyond chip/customer presets. | E: scale hierarchy / hybrid / M–L |
| 61 | Visibility and occlusion | The same object can be hidden from one authored viewpoint and visible from another; unseen does not mean absent. | E: robot perception / 3D with planar sight lines / M |
| 62 | Reachable service area | A simple authored route network shows accessibility constrained by barriers or travel conditions, not just radial distance. | E: place + access + neighborhood / 2D or hybrid / L |
| 63 | Boundaries and overlapping regions | Named jurisdictions, coverage areas, or zones overlap or differ without implying geographic facts not supplied. | N; reuses place/sets / 2D / M |
| 64 | Length, area, and volume scaling | A supported scale change distinguishes how one-, two-, and three-dimensional quantities respond. | N / hybrid / L |

### I. Software, AI, and product demonstrations

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 65 | Cache freshness and invalidation | A cached value can exist but be outdated; invalidation and refresh add a meaningful capability beyond the existing hit/miss presets. | E: request routing / 2D or hybrid / M |
| 66 | Batch versus streaming | The same input items are processed in a group or incrementally; latency and completion are not conflated. | N; reuses workflow/routing carriers / 2D or hybrid / M |
| 67 | Retry, duplicate, and idempotency | Repeating a request is distinguished from repeating its effect; explicit IDs show why two attempts need not mean two charges or writes. | E: tool retry, new effect contract / 2D / M |
| 68 | Bounded product walkthrough | A few source-described actions move through an authored generic form, table, or result view; a visible output explains the task. | N; reuses search/chat/code/editorial / 2D or hybrid / M |
| 69 | Shared-state conflict and reconciliation | Two versions edit the same supported fact; conflicts remain unresolved unless a reconciliation rule is stated. | E: software release / 2D / M–L |
| 70 | Read, edit, and export permissions | Typed access boundaries distinguish viewing information from changing it or moving it elsewhere. | N; reuses lock/approval/routing / 2D / M |
| 71 | Memorization versus generalization | Training examples and held-out cases remain distinct; matching a seen example is not presented as success on unseen cases. | E: model training + evaluation / 2D or hybrid / M |
| 72 | Model drift and changed test context | The same test/model is compared against an explicitly changed source-backed population or condition; old evaluation is not silently reused. | E: evaluation + population / 2D / M–L |

### J. Physical systems and social/operational stories

These are authored educational illustrations, not open-ended simulations. Science-specific proposals need appropriate source review as well as asset review.

| # | Idea | What the animation explains | Fit / form / depth |
| --- | --- | --- | --- |
| 73 | Supply chain and retained stock | Named materials/products persist through suppliers, processing, storage, and delivery; transfer is distinguished from transformation. | E: inventory + market + relay / 2D or hybrid / M–L |
| 74 | Incentives and external costs | A visible benefit goes to one actor while a stated cost lands elsewhere; do not imply motivations the source does not establish. | N; reuses market/allocation actors / 2D or hybrid / M |
| 75 | Shared-resource rules | Several actors draw from a bounded common resource; compare only source-described allocation rules and outcomes. | E: resource allocation + collective pattern / 2D or hybrid / M |
| 76 | Selective transport and filtering | An authored filter or channel admits some identifiable carriers and retains others; pathways explain selection without pretending to simulate fluid dynamics. | N; reuses aperture/valve/carriers / hybrid / L |
| 77 | Wave addition and interference | Two stated signals combine into a third; alignment reveals reinforcement or cancellation using deterministic curves. | N / 2D with optional clay signal bench / L |
| 78 | Material states and transitions | A fixed set of authored particles shows a supported structural/state difference; particle count is not invented telemetry. | N / 2D or bounded 3D / L |
| 79 | Conserved energy or material budget | Source-backed quantities split and recombine with an accounted remainder; unknown losses remain unknown. | N; reuses flow and financial accounting discipline / 2D / L |
| 80 | Field and direction map | A small authored grid of arrows shows a stated field or directional tendency; magnitude and position are not fabricated measurements. | N / 2D with an optional physical model / L |

## 5. Eight more advanced showcase concepts

These are richer treatments of the inventory above, not eight extra semantic kinds. They aim for memorable visuals without another renderer, physics engine, or arbitrary AI-generated geometry.

### 1. The belief microscope — ideas 9–11

A population tray reveals one marked subset, then zooms into the selected results. A fixed context rail preserves the original group while a precise diagram updates the relevant fraction.

- **Teaches:** why a positive result, prior probability, and certainty are different.
- **Assets:** reusable population carriers, selection gates, retained IDs, denominator rail, subset lens.
- **Reuse:** pictogram/population motifs, diagram stage, identity-preserving frame-driven poses.
- **Hard part:** valid denominators and legibility at a bounded scale. No arbitrary particle cloud or invented medical-test figures.

### 2. The evidence constellation — ideas 1–3 and 7

A document workspace expands into an authored argument map. Source cards retain their identity; support, objection, assumption, and unresolved relationships receive distinct visual treatments.

- **Teaches:** which evidence supports which part of an argument, and where disagreement actually lives.
- **Assets:** evidence cards, provenance anchors, typed connectors, conditional scope bands.
- **Reuse:** retrieval/evidence contracts, diagram primitives, editorial labeling.
- **Hard part:** grounding the relationship, not merely the labels. No force simulation, credibility score, or automatic declaration of a winner.

### 3. The constraint sculpture — ideas 25–28

Begin with tangible candidate pieces. Constraints remove regions or exclude pieces one at a time. End on an exact 2D feasible set or trade-off frontier rather than a theatrically chosen winner.

- **Teaches:** why an option fails, why several remain valid, and why changing priorities can change the choice.
- **Assets:** candidate carriers, rule gates, planar masks, shared metric rails.
- **Reuse:** sorting, allocation, fit, clay stage, and diagram handoff.
- **Hard part:** no distortion of the feasible set or unsupported objective function. A shallow physical metaphor should introduce the idea, not replace the math.

### 4. The time loom — ideas 41–45

Several named tasks occupy aligned lanes. Start/end tokens, waiting spans, deadlines, and joins reveal real concurrency. A final flattened view exposes the schedule and its bottleneck.

- **Teaches:** parallel work, waiting, duration, and what actually delays completion.
- **Assets:** duration ribbons, job tokens, event pins, deadline gates, join markers.
- **Reuse:** technology states and carriers, SVG diagrams, frame-driven sequence timing.
- **Hard part:** distinguish narration/reveal time from represented real-world time. A longer animation must not falsely imply a longer task.

### 5. The section scanner — ideas 53 and 57–59

A recognizable assembly stays still while a section plane traverses it. A linked flat slice tracks the same named parts. Then a small clearance test isolates the actual obstruction.

- **Teaches:** internal arrangement and why a part can or cannot fit.
- **Assets:** a few authored sectionable assemblies, plane/slice rig, named part anchors, dimension guides.
- **Reuse:** house/cutaway conventions, modular assembly, Clay, camera/projection helpers, hybrid handoff.
- **Hard part:** section geometry, label occlusion, and matching the slice to the model. Use authored slice poses where possible rather than open-ended geometry processing.

### 6. The representation bridge — ideas 37 and 49–56

One small source-supported example travels through two representations: matrix to graph, grouped tokens to an aggregate, or a 3D object to its projection. Stable IDs and a deliberate intermediate hold make the correspondence visible.

- **Teaches:** different representations of the same thing, and what information each keeps or loses.
- **Assets:** identity-matched tiles, connectors, view anchors, expression rails.
- **Reuse:** diagrams, information transformation, current hybrid crossfade as a simpler fallback.
- **Hard part:** actual correspondence. Cosmetic morphs between unrelated objects are explicitly out of scope.

### 7. The signal studio — ideas 46 and 77

A restrained clay instrument introduces two inputs, then yields to aligned waveforms. Phase or amplitude changes are separated from the combining operation; the output settles next to both inputs.

- **Teaches:** reinforcement, cancellation, phase, and the difference between an input and its combined result.
- **Assets:** a signal bench, deterministic waveform paths, markers, overlay/sum view.
- **Reuse:** existing studio, frame-based motion, SVG/HTML diagrams, palette.
- **Hard part:** mathematical validity and a calm camera. Audio, vibration, or machinery behavior must not be inferred from a decorative waveform.

### 8. The version-and-permission theater — ideas 65 and 67–70

A tangible record has a persistent identity, version, and permitted action. Two requests approach it; a repeated request, stale cached value, edit conflict, or blocked export changes different parts of the diagram.

- **Teaches:** attempts, effects, versions, and permissions are separate concepts.
- **Assets:** record/version cards, request tokens, effect ledger, scoped boundaries, generic product surfaces.
- **Reuse:** request routing, retries, software release, approval gates, diagram/technology stage.
- **Hard part:** a repeated effect cannot disappear simply to make the story look successful. Outcomes and reconciliation need source-backed rules.

## 6. Twelve reusable asset kits

Build kits around identifiable parts and meaningful actions, not another collection of icons. Some proposed kits assemble existing pieces; they are not claims that every constituent is missing.

| Kit | Add or standardize | Enables |
| --- | --- | --- |
| 1. Evidence desk | Source/claim cards, scope/date bands, fragment anchors, assumption/objection connectors | Argument, provenance, contradictions, missing evidence. |
| 2. Population workbench | Retained people/item tokens, bounded trays, selection masks, denominator rails | Sampling, base rates, subsets, cohorts, distributions. |
| 3. Quantitative diagram kit | Signed axes, bins, shared scales, intervals, composition strips, calendar cells | Exact comparisons and quantities without forcing 3D. |
| 4. Constraint board | Candidate carriers, rule gates, excluded-region masks, reason labels | Eligibility, choices, optimization, fit. |
| 5. Temporal workbench | Start/end pins, duration lanes, waiting markers, deadlines, reversible state tokens | Concurrency, scheduling, expiry, state transitions. |
| 6. Relationship kit | Nested containers, dependency/approval/control conventions, matched matrix/graph anchors | Hierarchy, responsibility, matching, network diagnostics. |
| 7. Geometry sampler | Authored sectionable objects, hinged panels, clearance volumes, fixed measurement anchors | Sections, nets, projection, packing. |
| 8. Representation bridge kit | Retained tile IDs, row/column highlights, projection paths, expression/unit rails | Math and identity-preserving transformations. |
| 9. Computing workbench | Extend existing requests/cache/services with explicit buffers, versions, duplicate IDs, and effect records | Streaming, cache freshness, idempotency, reconciliation. |
| 10. Product/workflow surfaces | Original generic form, table, result, job, and approval surfaces with a small supported action vocabulary | Task demonstrations and organizational handoffs. |
| 11. Signal bench | Curves, phase markers, input/output ports, sum overlays, calm authored instrument parts | Wave/phase/filter explanations. |
| 12. Transport/infrastructure assemblies | Filter cartridge, manifold, duct/vent, bounded channel, named inlet/outlet/retained carriers | Selective transport, building systems, material/energy budgets. |

Later, domain-specific variants could include motor internals, gear ratios, grid/storage nodes, membrane channels, or molecular binding. These are larger authored assemblies, not generic hero-prop swaps. Detailed anatomy, biological outcomes, and electrical/physical claims require separate factual review; realistic-looking geometry is not enough.

## 7. Motion-graphics additions that improve the existing library

These are presentation recipes rather than new explanatory kinds:

- **Component roll-call:** introduce named parts before a complicated operation.
- **Progressive reveal:** retain established relationships while adding the next one.
- **Local label handoff:** move emphasis to the currently narrated component while preserving identity.
- **Linked-view bookmark:** retain a small reference view when the camera moves or the representation changes.
- **Difference-first comparison:** keep shared facts fixed and animate only the stated difference.
- **Unpack/repack:** reveal constituents without dropping or manufacturing objects.
- **Axis-then-value change:** prevent a scale change from masquerading as growth.
- **Cycle unrolling:** connect one recurring phase to the same phase on a linear timeline.
- **Model-to-diagram handoff:** use the current crossfade when an authored morph offers no extra understanding.
- **Overview return:** return to the accumulated board after a close-up, rather than ending without context.
- **Held alternative:** leave an unresolved or unchosen branch visible instead of automatically rewarding one path.
- **Purposeful match cut:** reuse the exact tracked subject across a shot boundary, never morph unrelated concepts for style alone.

The motion-token, graphic-accent, camera, and storyboard systems already provide useful ingredients. New recipes should be composed within those systems, not turned into a new animation runtime or a new app theme.

## 8. Recommended first selection

For the next selection round, prioritize these **12 candidates**, not all 80:

1. **Argument and objection map** (#3) — a major new way to explain reasoning.
2. **Base-rate microscope** (#9) — makes a difficult, broadly useful probability concept tangible.
3. **Supported uncertainty ranges** (#14) — addresses a real gap while retaining uncertainty.
4. **Distribution and long tails** (#17) — goes beyond a few bars or named actors.
5. **Denominator comparison** (#19) — useful across business, statistics, and everyday claims.
6. **Constraint sieve** (#25) — explains why options are eliminated, not just which one looks best.
7. **Trade-off frontier** (#26) — richer than a winner/loser comparison.
8. **Concurrent work lanes** (#41) — useful in operations, software, agents, and project explanations.
9. **Reversible state machine** (#43) — describes conditional processes without flattening them into a one-way flow.
10. **Section scanner** (#57) — a strong advanced 3D/hybrid asset with a real teaching purpose.
11. **Packing and clearance** (#59) — richer spatial reasoning using recognizable objects.
12. **Bounded product walkthrough** (#68) — a practical missing alternative to an abstract diagram.

A sensible later sequence:

- **Breadth first:** evidence, denominators, constraints, concurrency, state.
- **Quantitative depth:** distributions, uncertainty, probability, trade-off frontiers.
- **Advanced showcase assets:** section scanner, representation bridge, signal studio.
- **Domain packs:** only after actual transcript use cases justify them.

Do not interpret this as authorization to build or as a request to redesign editing controls. The immediate deliverable is the inventory.

## 9. Quality bar for every eventual addition

### Meaning and factual fidelity

- State one teaching question, suitable transcript cues, and situations where the asset should not be used.
- Require evidence for relationships and outcomes, not just labels.
- Keep real measurements, illustrative quantities, conditional scenarios, and unknown states distinct.
- Do not infer distributions, probabilities, confidence, centrality, time durations, or proportions from vague narration.
- Derived arithmetic must use supported inputs, correct units and denominators, and explicit validation. A plausible number is not a fact.
- Counts, widths, areas, volumes, density, camera framing, and connector styles must not quietly invent quantitative meaning.
- A 3D rig must use recognizable semantic carriers; no anonymous cubes standing in for an unexplained process.
- Simulated or authored demonstrations remain labeled as such. No invented clinical outcomes, winners, financial returns, or model telemetry.

### Visual and motion quality

- The setup and final hold should make sense as still images; animation may explain the transition without carrying all the meaning.
- Keep one main narrated event at a time. Additional motion must clarify, not compete.
- Retain subject/part IDs across views, state changes, and revisits.
- Use anticipation, movement, settle, and hold where meaningful; do not automatically add stamps, impact rings, or camera orbits.
- Render real 9:16 layouts and supported 16:9 routes, with speaker/caption space and readable labels. A virtual-stage still is not enough.
- Distinguish reveal time from represented event time in schedules and quantitative stories.
- Use 2D where alignment and precision matter; introduce 3D only when shape/space/viewpoint adds understanding.
- Prefer a calm authored section/pose transition to uncontrolled camera motion, particles, or pseudo-simulation.

### Fit to the existing systems

- Reuse Remotion frame time, `Clay`, `ExplanationStage`/`MechanismStage`, diagram primitives, stage palette, studio, and current compositing paths.
- Keep poses pure and seekable. No wall-clock animation, history-dependent render state, random live physics, or external remote assets.
- Keep diagram-only stories free of WebGL; use a single shared 3D stage for a hybrid assembly rather than a canvas per part.
- Bound actors, labels, states, geometry, and particles in code. Geometry remains authored, not supplied as arbitrary model-generated paths or code.
- A new preset still needs planner evidence validation, timing, shortlist/outline examples, render registration, and representative fixtures. Adding a model alone does not make it selectable or usable.
- Preserve the current shortlist architecture: basic shortlist max 16 kinds, idea-outline shortlist max 24, hero shortlist max 10. More catalog entries are not a reason to dump the full catalog into every prompt.
- Expand storyboard panels/models explicitly where justified; do not assume all explainer kinds become storyboard panels.
- Use original artwork and existing materials. External examples are inspiration, not a license to copy their illustrations, logos, or assets. Rights-blocked existing assets remain blocked.

### Eventual verification

- Check positive, negative, unresolved, longest-label, missing-data, layout, and repeated-frame cases as applicable.
- Inspect full-motion exports as well as setup/action/end contact sheets.
- Verify alpha through the production ProRes/FFmpeg path where required.
- Measure render time, memory, and mesh/draw cost for large assemblies; authored mesh ceilings do not prove actual GPU performance.
- Snapshot the bundle before parallel rendering so evidence refers to the same code.
- Only call an asset approved after reviewing the real production render and source-faithful behavior. No fresh visual/performance checks were run for this brainstorm.

## 10. Local evidence consulted

Primary inventory and integration:

- `src/main/remotion/compositions/explainer/types.ts` — current scene/prop registry and layout contracts.
- `src/main/ai/explainer/kinds.ts` and the `kinds-*.ts` packs — planner registration and bounded story contracts.
- `src/main/ai/explainer/shortlist.ts` — basic and idea-outline selection limits.
- `src/main/remotion/compositions/explainer/technology/types.ts` — existing technology presets, including cache/retry/parallel cases.
- `src/main/remotion/compositions/explainer/cognition/types.ts` — training/evaluation and evidence-conflict scope.
- `src/main/remotion/compositions/explainer/concepts/*/types.ts` — concept preset coverage, including qualitative futures and bounded populations.
- `src/main/remotion/compositions/explainer/diagrams/types.ts` and `primitives.tsx` — bounded semantics, measurements, and diagram marks.
- `src/shared/storyboards.ts` — separate persistent-board vocabulary and limits.

Reusable rendering:

- `src/main/remotion/compositions/explainer/explanation-kit.tsx` and `hero-kit.tsx`.
- `src/main/remotion/compositions/explainer/mechanisms/MechanismStage.tsx` and mechanism poses/anchors.
- `src/main/remotion/compositions/explainer/diagrams/HybridStage.tsx` — current same-subject crossfade, not arbitrary geometry morphing.
- `src/main/remotion/DESIGN.md` — clay, stage, palette, typography, alpha, and frame-driven rules.

Existing scope/verification notes:

- `docs/plans/clay-explanation-vision.md` and related verification document.
- `docs/plans/business-scene-recipes.md`.
- `docs/plans/motion-and-3d-upgrade.md`.
- `docs/plans/longform-storyboard-verification.md`.
- `docs/plans/detroit-hybrid-explanation-verification.md`.

Verification documents describe their recorded runs and limitations, not fresh results from this research. Tests were not run because this change only adds a research document.
