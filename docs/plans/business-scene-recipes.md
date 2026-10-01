# Business scene recipes — lane F

These six transcripts are **authored example material**, not customer evidence, financial advice, measured performance, or product promises. "Source-backed" here means backed by the supplied example transcript. No narration recording, AI call, or render was performed for this lane.

The single fixture source is `scripts/explainer-stills/fixtures/business-scenarios.json`. `src/main/ai/explainer/business-scenarios.test.ts` reads that file and exercises the real `buildShortlist`, registered kind parsers with `makeParseContext`, and `parseExplainerPlan`. There is no new renderer, dependency, or exported API.

## Six recipes

| Fixture | Existing kind | Source relationship and boundary | Duration |
| --- | --- | --- | --- |
| `business-sales-approval` | `bottleneck` | Sales handoff requests arrive, wait in the approval queue, then the manager approves them and the handoff clears. Six visible tokens are illustrative, not six claimed customers or requests. | 6.05 s |
| `business-support-backlog` | `bottleneck` | Requests pile up because only one reviewer can assign them; removing that constraint lets the team answer them and clears the backlog. Do not infer clearance from merely hiring staff or mentioning support. | 7.05 s |
| `business-recurring-resource-loss` | `resource-leak` | Revenue arrives; duplicate subscriptions waste money; cancelling those subscriptions ends that recurring waste and leaves more revenue available. The sealed outlets represent this stated waste ending, not all business spending disappearing. No saving amount is invented. | 7.05 s |
| `business-demand-capacity` | `feedback-control` | Demand exceeds capacity target, workload is measured, staff are added, and workload returns to target and stays there. This source explicitly supports the existing scene's settled target; merely moving toward an unknown target would not justify that resolution. No numeric capacity or utilization is supplied. | 5.8 s |
| `business-content-reinvestment` | `loop` | Content creates leads, leads create revenue, and reinvestment funds more content; the cycle repeats. This is a feedback relationship, not the repeated pushes, driven output, and coast required for mechanical `momentum`. No conversion rate or guaranteed growth is claimed. | 6.3 s |
| `business-revenue-margin` | `receipt` | The source supplies revenue `$12,000`, costs `$7,500`, and margin `$4,500`. The row label **Minus costs** preserves the subtraction relationship; the total is the supplied margin, not a generated result or margin percentage. | 5.05 s |

The complete sentences, display labels, word indices, scene bodies, contact times, and samples live together in the JSON. The tests require the narration to remain ordinary business language, without gate/tank/leak/sensor/valve/gauge/flywheel nouns added to qualify for a mechanism.

## Timing and fixture contract

- `exampleMaterial: true` identifies each fixture as an example; any later showcase must also identify example footage visibly. Metadata alone is not a rendered disclaimer.
- `sourceText` splits on whitespace. `timed.startSec = 10.25`, `stepSec = 0.25`, and `wordDurationSec = 0.2` deterministically produce synthetic word times. These are test timings, not measured ASR or spoken delivery.
- `raw` contains the actual untrusted model-shaped parse case, including `startWord`, `endWord`, `layout`, and indexed beats. The parser scene window starts at `timed.sceneStartSec = 10`; its end is that start plus `durationSec`. Production lead-in/tail handling reproduces this window in all six tests.
- Registered parsers produce absolute seconds. Tests rebase their output by the scene start, round only floating-point representation to six decimals, and require equality with the fixture `scene`. They also check production-plan windows, bodies, and contact cues. No timestamp repair or alternate business parser is used.
- Every fixture has `vertical-stack` (`9:16`, `stack`) and `landscape-over` (`16:9`, `over`). The existing still harness's stack surface is 1080×960, the native half-height contribution to 1080×1920 vertical output; landscape is 1920×1080. These fixtures are not complete captioned videos.
- The dispatcher accepts `over` for the mechanisms and receipt. The legacy `loop` spec does not: an explicit `over` request falls back to `stack`, which the tests assert. Existing `longformLayout` in `src/main/render/explainer-longform.ts` maps non-takeover layouts to `over`; the landscape fixture exercises that intended surface, not a newly supported loop planner layout.
- `contact.atSec` names a meaningful cue/transition, not necessarily a literal collision: gate opening, outlet tap seating, measurement response, cycle closure, or receipt total cue. `contact` samples use the first frame at or after that time (`ceil(seconds × 30)`), with adjacent before/after frames. Resource-leak seating is `sealAt + 0.32 s`, not the start of the correction.
- All samples are inside the declared duration. Setup precedes the first beat; the final sample is at least 0.5 s after the last beat. Mechanism durations and phase spacing pass existing validators. The loop's `hold` means the completed relationship is visible, not that its animation has been proven static.
- `covers` declares only recognized kind targets: `bottleneck`, `resource-leak`, and `feedback-control`. Loop and receipt intentionally omit coverage tags. No unknown manifest targets or new presets are introduced.

## Validator boundaries, especially financial claims

The current mechanism parsers validate a contiguous source-backed label, required ordered indices, finite times, minimum phase gaps, duration, and final hold. They do **not** prove every causal relationship from narration. Their shortlist regexes and planner guidance are not semantic truth validators. Consequently, noun-only and missing-relationship examples are tested as selection negatives where supported; absence of a raw correction beat is tested as a structural rejection, not as proof of semantic understanding. Unsupported display labels, including numeric claims inside those labels, are rejected through the existing source-label contract; this is not validation of every numeric field or implied outcome.

The legacy loop parser validates its timed stage structure, bounded text, and spin index, not whether revenue actually funds content. This recipe separately checks its displayed labels against the supplied source and keeps the kind as `loop`.

The legacy `receiptSpec` in `src/main/ai/explainer/kinds-money.ts` bounds display strings and word timing. It does **not** verify source amounts, units, subtraction, or arithmetic. This lane neither changes it nor asserts that an arbitrary unsupported short amount string would be rejected.

The financial recipe instead provides explicit example evidence:

1. All three amounts, including the margin, occur in the source and at the referenced word positions.
2. The parsed display amounts equal those exact supplied strings; title and labels also appear in the source.
3. A separate test checks `$12,000 - $7,500 = $4,500` against the already supplied margin. It never synthesizes a missing result.
4. Parser negatives cover only actual supported rejections: missing, empty, non-string, or overlong total amounts.

Production guarantees for arbitrary financial narration would require a separately approved source-amount/unit/operator grounding and arithmetic-validation contract. That is outside lane F; this example does not establish such a guarantee, and no shared limits or old tests were weakened.

## Coordinator step 10: actual shortlist regressions

The targeted run on 2026-09-30 produced **63 passing tests and two failing positive shortlist tests**. Both failed `score > 0` with actual score `0`; their direct-parser and production-plan tests passed. These positive assertions remain red, not skipped, inverted, or marked expected-failure. Selection changes belong to the coordinator.

### Resource loss

Exact failing source:

> Revenue arrives each month, but duplicate subscriptions keep wasting money. We cancel those subscriptions, ending that recurring waste so more revenue stays available for the business.

Target: `resourceLeakSpec.triggers` in `src/main/ai/explainer/kinds-mechanisms.ts`. The current alternatives require either inflow/"revenue comes in" wording or a filling tank, followed by **leak → seal/plug/close → retain/keep/rise**. The ordinary-business source above has the relationship without those mechanical words.

Proposed additive relationship terms, not a bare noun trigger: **revenue arrives → duplicate subscriptions wasting money → cancel those subscriptions → ending recurring waste / more revenue stays available**. Keep clauses locally bounded and require the correction and retained result. The negative regression already in the test is:

> Revenue arrives each month. The report lists subscriptions and costs, without saying what was cancelled or retained.

### Demand and capacity

Exact failing source:

> Demand exceeds our capacity target. We measure workload against available staffing, then add staff; workload returns to target and stays there.

Target: `feedbackControlSpec.triggers` in `src/main/ai/explainer/kinds-mechanisms.ts`. Its current expression requires **gauge/pressure/level/temperature → above target → sensor response → valve → settling**. There is no ordinary demand/workload/staffing alternative.

Proposed additive relationship terms: **demand exceeds capacity target → measure workload → add staff / adjust staffing → workload returns to target and stays**. Do not trigger from demand, capacity, or measurement alone; retain the stated stable result and avoid matching explicitly absent correction. The existing negative regression is:

> Demand exceeds available capacity. We measure workload, but no staffing adjustment or return to target is reported.

No shared trigger or validator was edited by this lane. A trigger addition should rerun this suite with the existing assertions unchanged, as well as the coordinator's shared shortlist regressions.

## Executed tests and remaining evidence

Command: `npm run test:main -- src/main/ai/explainer/business-scenarios.test.ts`.

Each of the following columns corresponds to one executed test per fixture:

| Fixture | Real shortlist | Indexed parser/body | Production plan/window/cue | Dispatcher layout boundary | Native cases/sample bounds |
| --- | --- | --- | --- | --- | --- |
| Sales approval | Pass | Pass | Pass | Pass | Pass |
| Support backlog | Pass | Pass | Pass | Pass | Pass |
| Recurring resource loss | **Fail: score 0** | Pass | Pass | Pass | Pass |
| Demand/capacity | **Fail: score 0** | Pass | Pass | Pass | Pass |
| Content/reinvestment | Pass | Pass | Pass | Pass | Pass |
| Revenue/margin | Pass | Pass | Pass | Pass | Pass |

Remaining executed tests (all pass):

- One six-recipe/example/recognized-coverage contract test.
- Five individual selection negatives: business-noun agenda; approval only mentioned; subscription report without correction/retention; demand measurement without adjustment/result; misleading flywheel noun without mechanical momentum.
- One content-loop/not-momentum/source-label test.
- Sixteen mechanism source-label rejection cases: `Revenue doubles`, `Savings $99,999`, `Margin 50%`, and `Zero costs`, each against the four mechanism fixtures.
- Four mechanism tests for missing or unordered correction/release beats, one per fixture.
- One receipt source-amount/subtraction/arithmetic-evidence test.
- Seven receipt total rejection cases: `undefined`, `null`, empty string, numeric `4500`, `NaN`, `Infinity`, and overlong `$123456789`.

Total: 65 tests, 63 pass, two shared-selection blockers. No live-model selection, pose sampling, render, alpha/determinism check, captioned integration, narration listening, or visual-quality review was executed. Fixture declarations and timing checks are not visual evidence.

Scoped Biome was invoked with all three owned paths. The project configuration includes the test but excludes fixture JSON and Markdown. The test passes its scoped check; the fixture was additionally checked/formatted via Biome stdin with the virtual root filename `business-scenarios.json`, and a second formatting pass was identical. No virtual file was created. Markdown is not covered by the project Biome check; this document was manually reread. All three owned files were reread after formatting.