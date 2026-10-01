# Detroit + hybrid explanation library: approved brief and storyboards

Approved for implementation on 2026-10-01. Implementation baseline: `9aef4b169c20265f80df5f5177d7ae6e5d5c0f54` plus the pre-existing modified working tree. Original research baseline: `4f8b9b0`. Evidence and progress live in [the verification record](detroit-hybrid-explanation-verification.md). Asset/source decisions live in [Detroit provenance](../asset-provenance/detroit-landmarks.md). This brief preserves the approved scope; it does not claim implementation is complete.

## Settled direction

Give 2D equal explanatory and production standing without replacing the existing clay library or forcing a 50/50 quota. Keep substantial silhouettes, soft bevels, the offline studio, contact shadows, restrained clearcoat, palette roles from `useStage()` and frame-derived motion. Prefer the presentation that explains the source best.

Seven additions: `detroit-place`, `fund-flow`, `ownership-change`, `portfolio-exposure`, `cash-timing`, `token-attention`, `inference-tradeoff`.

- **diagram:** complete, designed 2D explanation; mounts no WebGL stage.
- **hybrid:** the same validated facts, IDs, times and conclusion, with an authored clay subject and connected 2D reveal; at most one WebGL canvas per active scene.
- Both use fixed locally authored geometry/topology, not model-generated SVG, code, CSS, cameras, asset URLs or layout coordinates.
- Reuse existing scene families, materials, typography, palettes, source-evidence helpers, word timing, grouping and media harnesses. No scene-wide migration, generic graph editor, style setting, IPC or schema work.

## Design read and thesis

Surface: animation-only editorial explanations, not new application screens. Audience: people watching educational business/AI videos, including phone viewers. Job: make one narrated relationship visible without making a stronger claim than the source. High error cost: finance quantities, ownership, unknowns, hypotheticals and AI illustrations can mislead.

One thesis: tactile subjects reveal precise invisible relationships. Recognition comes first, the relationship second, and the evidence/qualifier remains visible. Large semantic symbols, fixed aligned rails, deliberate text/model reservations, restrained drawn connectors and readable holds replace decorative dashboards. Labels, shapes and arrow direction supplement color. Unknowns never look like zero. All movement is frame-seekable; no wall clocks, simulation or random layouts.

Use the actual `SceneFrame` safe box on the 1080×960 virtual stage. Complex vertical stories prefer `stack`, `stack-flipped`, `pip`; longform production uses readable `over`. Do not hide a nine-second story in a 3.5-second takeover. Reserve title, condition, subject, evidence and outcome regions. Test long labels; do not crop units, signs, qualifiers or landmark names. Preserve at least 0.7 seconds of final hold after resolve inside the existing 5–12-second envelope. Simplify/reject speech that cannot fit.

## Detroit pack and source limits

| Subject | Recognition requirements | Use / boundaries |
| --- | --- | --- |
| Renaissance Center | Tall central cylinder, four surrounding main towers, two lower eastern towers, deliberate spacing and riverfront base | Dominant city portrait hero; cream/violet clay and paired 2D silhouette, not reflective glass noise |
| Michigan Central Station | Long classical station base under a tall rectangular office block | Restored appearance; no invented operational rail service or investment claim |
| Fox Theatre | Street-facing massing, entrance/marquee proportions; independently typeset FOX | No copied logo, show advertising or detailed interior ornament |
| Guardian Building | Stepped Art Deco profile and geometric entrance | No copied tile artwork or sculptural relief |
| Penobscot Building | Stepped tower, crown and mast | No reproduced friezes |
| Ambassador Bridge | Suspension towers, deck and main cable, restrained river | Not cable-stayed; no invented traffic/economic figures |
| Eastern Market | Market shed, authored stalls, small storefront context | No murals/vendor branding; fictional example businesses must be identified as examples |
| Spirit of Detroit | Requested seated figure with orb/family composition | Rights-gated; no anonymous substitute, placeholder renderer or runtime availability before a defensible reuse basis |

Explicit Detroit context can select a city portrait. Landmark focus needs its name or a supported unambiguous alias. `train station`, `fox`, `central`, or `Renaissance` alone are insufficient. No hometown inference, location tracking or global Detroit branding. Architecture may show a source-stated setting, never imply a fund owns a real landmark or that a real site uses a particular AI system. Portraits are schematic, not street maps; no invented adjacency, commute time or economic effect.

Reuse suitable neighborhood/house/people/parcel forms instead of sprawling city generation. Do not impose a suburban stereotype.

## Mixed showcase storyboards

All narration examples are authored educational fixtures, not quotations, advice, actual holdings, Detroit performance data or model telemetry. Seven primary chapters, provisionally 8–11 seconds each, with restrained transitions. Derive final duration from real fixture words and beat-window rules. A separate landmark gallery leaves time to recognize the station, Fox and supporting structures.

### 1. Detroit: a place with identity

Presets: `landmark-focus`, `city-portrait`, `market-block`.

1. Setup: grounded riverfront with RenCen dominant.
2. Action: small authored assembly/camera move establishes depth, no spinning skyline.
3. Response: matching 2D silhouette retains landmark identity.
4. Check: distinct source-backed labels; station/Fox montage only when narration names them.
5. Resolve: hold a spacious city portrait.

Gallery: dedicated views of Michigan Central, Fox, Guardian, Penobscot, bridge, market, and Spirit only if cleared. The sculpture is not a financial mascot.

### 2. Fund flows: whose money goes where

Presets: `capital-deployment`, `proceeds-distribution`.

1. Setup: distinguish named example investors, fund account and businesses by role-specific shapes.
2. Action: explicitly stated contributions arrive; money never appears before contribution.
3. Response: source-stated deployment travels along directed paths.
4. Check: show the same source-backed movements/amounts in 2D; retained money is visible only if stated.
5. Resolve: hold relationships without manufacturing profits, return promises or fees.

Distribution requires stated proceeds and recipients, no inferred gain or equal split. Qualitative flows have equal-width paths. Quantitative flows conserve bounded integer minor units with compatible currency/period.

### 3. Profit versus cash: the timing gap

Presets: `receivable-gap`, `inventory-before-sales`.

Example source explicitly states $100 sales, $70 total costs, $30 profit, costs paid today, and customer payment next month.

1. Setup: sale/invoice is distinct from cash receipt.
2. Action: stated cost payment leaves on today's lane.
3. Response: invoice remains on the later customer-payment lane.
4. Check: separate recognition/payment lanes show how profit and a cash outflow coexist; no balance without a stated opening balance.
5. Resolve: source-backed “payment arrives later,” not inferred bankruptcy/safety/profit from partial costs.

Detroit storefront setting is optional only with explicit local illustrative context; default geography is neutral.

### 4. Dilution: shares, percentage and value differ

Presets: `share-issue`, `stake-value-separation`.

Example: 40 of 100 shares, 100 new shares, original holder keeps 40, now 20% of 200. Dollar valuation remains unknown unless supplied.

1. Setup: original company and named holders.
2. Action: issue new shares without changing old holder identities/count.
3. Response: expand total ownership strip and reduce the fraction.
4. Check: separate share count/percentage; validate explicit denominators and rounding.
5. Resolve: valuation is unstated unless compatible explicit evidence exists; smaller percentage is not a claimed dollar loss.

No automatic pre-/post-money inference, options, preferences or liquidation rights.

### 5. AI attention: relationship, not fake telemetry

Presets: `reference-link`, `context-link`.

Example sentence: “Maya opened her shop. It sells bread.” Illustration explicitly links “It” to “shop.”

1. Setup: short source sentence and selected word tiles.
2. Action: emphasize target token at its spoken cue.
3. Response: draw only the explicitly illustrated earlier-token relation.
4. Check: clean diagram with persistent illustrative treatment; no percentages or heatmap weights.
5. Resolve: hold the reference/context link without claiming understanding, truth or a named model's actual internals.

Complement rather than replace retrieval, context-window and token-choice scenes.

### 6. Portfolio exposure: names differ, holdings overlap

Presets: `shared-holdings`, `shared-driver`.

1. Setup: two named example funds as distinct containers/nodes.
2. Action: reveal their source-stated holdings.
3. Response: same named company retains one identity across representations; connect shared exposure.
4. Check: direct holding versus common driver stays distinct; no fabricated coefficient or position.
5. Resolve: “shared exposure,” not identical risk, full diversification or quantified loss.

Unstated exposures remain unknown. Missing data never proves independence.

### 7. AI tradeoffs: no universal winner

Presets: `measured-comparison`, `constraint-choice`.

1. Setup: same stated task and comparable measurement basis for named models.
2. Action: reveal cost, latency and task score in order.
3. Response: matched rails preserve units and model identity.
4. Check: correct axes/directions; missing metric says “not stated,” not zero.
5. Resolve: hold tradeoffs. A choice requires an explicit compatible budget/criterion and source-supported result; never imply universal superiority.

Fixture values are explicitly hypothetical or measured, never fabricated as real telemetry.

## Validation and integration contract

At the model boundary, validate supported kind/preset/mode/landmark/role/state and every array before constructing a scene. Bounds: 8 entities, 12 edges, 4 holder categories, 6 holdings, 12 sentence tokens, 3 models, 3 metrics. Titles ≤48, subjects ≤34, short actor labels generally ≤28, conditions ≤96, outcomes ≤54. Required names are not silently truncated.

Five ordered word-indexed beats become finite seconds using `at`/`*At` fields so existing recursive time mapping works. Require entrance/tail/final-hold padding. Evidence must bind actors and amounts to the relevant local action, not unrelated words elsewhere. Preserve negation, hypotheticals, conditions, unresolved results and unknown values; reject unsupported essential facts.

Money: explicit compatible units, bounded safe integer minor units, no conversion or over-precision. Shares: safe integer counts and checked denominators/percentages. Reconcile explicitly stated totals; arithmetic alone does not authorize new profit, fees, balances, weights, scores or probabilities. Comparisons require one task/basis. Unmeasured attention remains illustrative.

Extend scene unions, concrete dispatch, kind registry, prompt/review guidance, shortlist cues and existing protected-kind helper. Preserve generator injection, diagnostics, existing families and library behavior. Keep shortlist ≤16 kinds/10 props, coverage ≤55%, speaker gaps, repeat rules and takeover budget. Protected stories reject clipping across disjoint speaker ranges; no automatic decorative extras. Change production render logic only for a demonstrated gap.

No dependencies, network assets, model-driven files/imports/geometry, arbitrary markup or executable input. Reuse owned geometry disposal, bounded subprocesses, local browsers, argument arrays, timeouts, cancellation and exact process cleanup. Outputs go to fresh owned directories outside git. No global mutable scene state or unbounded caches.

## Deliverables and proofs

- Shared bounded semantic symbols, fixed layouts, directed connectors, ownership strips, exposure links, quantity/metric rails, time lanes, unknown/conditional states and evidence notes.
- Paired locally authored Detroit representations and all seven scene families in both presentations.
- Raw parser tests for every preset/mode, natural paraphrases and hostile/incorrect near misses; deterministic repeated parsing and source word validation.
- `hybrid-library.test.ts`: raw JSON → shortlist/parser → scene → grouping/time rebasing → short-form splice and longform range fit, preserving every beat and rejecting partial stories.
- Detroit, finance, business, AI and mixed-showcase fixtures with actual source-word mappings and a coverage manifest; existing fixture schema/runtime/palette/sequence/bundle helpers reused.
- Additive `--hybrid` systems E2E mode; existing unit/technology/concepts modes unchanged. Source evidence must detect stale bundles.
- Animation-only mixed showcase and landmark gallery in both aspects, separate from production-valid transcript proofs with speaker gaps.
- Real H.264 composites: 1080×1920@30 and 1920×1080@30, intermediate ProRes 4444 alpha, captions, speaker visibility, transitions, existing CC0 SFX and FFmpeg/ffprobe checks.
- Sample setup/action/response/check/resolve/final hold, both palettes/aspects, every advertised layout, maximum labels and representative transition frames. Review recognition, signs/units, safe-box placement and identity continuity.
- Same-machine/browser/pinned-bundle repeated frame comparisons and matched old/new cold/warm render timing/memory, with Windows measurement limits named. Mesh/edge/token ceilings are not GPU measurements.

A synthetic local source may prove the media route, clearly labelled; it does not prove natural narration or lip sync. No cloned voice, purchased track or online rendering. Live Gemini evaluation is optional and separately requires API/budget authorization; deterministic injected generation is not live model evidence.

## Ordered implementation checkpoints

Follow the approved 31-step order: (1) baseline/diffs/tools; (2) persist brief; (3) rights gate; (4) shared diagram types/layout/motion; (5) stages; (6) RenCen; (7) station; (8) Fox; (9) supporting landmarks; (10) Spirit only if cleared; (11) Detroit scene/parser; (12) finance evidence helpers; (13) flows; (14) ownership; (15) exposure; (16) cash timing; (17) attention; (18) tradeoffs; (19) runtime integration; (20) planner guidance/shortlist; (21) raw pipeline tests; (22) fixtures; (23) showcase/gallery renderer; (24) hybrid E2E; (25) tests/verify/typecheck/audit; (26) build/pinned snapshot; (27) render/inspect matrix; (28) media proofs; (29) measured performance; (30) final docs/architecture; (31) diff review/handover.

Completion requires planner-reachable validated renderers, meaning-preserving presentations, reviewed landmark recognition, unchanged production invariants, actual media artifacts and honest command evidence. Spirit must be delivered with a recorded rights basis or explicitly remain blocked; do not call the full requested pack complete otherwise. Do not commit, publish, deploy, install, spend money or contact rights holders without separate authorization.
