# Planner quality evaluation (subscription-only)

## Boundaries

Production still uses the existing Gemini gateway. This tool is **not** a new production provider. No live Gemini comparison or paid OpenAI/Gemini request is authorized. Do not open `gem.txt`, copy OAuth files, buy credits, enable overages, rotate accounts, or substitute an API key.

New live runs use the user-approved **GG ChatGPT OAuth adapter**, not the unfinished restricted native Codex build. This is an internal ChatGPT/Codex endpoint integration, **not a stable public subscription API or guaranteed compatibility**. No GG sign-in, real account preflight or live model generation has occurred. Earlier stock-Codex login is not reused and is not a billing audit.

## Approved alternative: isolated GG client (2026-10-01)

`scripts/planner-eval/gg-client/` pins `@kenkaiiii/gg-ai@5.67.1` and `@kenkaiiii/gg-core@5.67.1`, reviewed against GG commit `d7f3e960f03544554a6dbff3bc1c1ac9cf27c374`. Dependencies and lockfile are isolated from the app. Installation used `--ignore-scripts --omit=optional`; runtime commands never install packages. The helper uses GG's public OAuth storage/login interface at the dedicated home-relative `.batchclip/planner-eval/gg-chatgpt-v1/auth.json` path. Do not read/copy another client's tokens or paste tokens into this tool.

The parent launches a fixed local helper with the current Node executable, a fresh temporary working directory and an allowlisted environment. Prompts enter on stdin, not argv. It does not launch GG's coding agent, register tools, load repository instructions/configuration, or use GG's backup-key feature. Each inference has fresh messages and a new session ID; `tools: []` and `toolChoice: 'none'` are checked against the real SDK wire request in offline tests. Provider inference is allowed only at `https://chatgpt.com/backend-api/codex/responses`; metadata and OAuth token calls have separate exact endpoint/method limits. Redirects, proxies, extra inference requests, partial/error/tool responses and oversized bodies are refused.

Before each inference, fresh managed credentials and account metadata must establish ChatGPT auth, selected model/reasoning availability, raw `rate_limit.allowed === true`, `has_credits === false`, `unlimited === false`, and a decimal zero balance. Missing permission or credit data remains unknown and blocks generation; percentages never grant permission. **Automatic credit reload must also be explicitly confirmed disabled by the user.** No verified automatic-reload getter was found, and permission to use ChatGPT is not that confirmation. The SDK omits `service_tier`, matching the pinned official Codex convention for Standard; explicit non-default response tiers are rejected. These checks are not a guarantee about backend accounting or a verified bill.

The live CLI defaults to `--transport gg-chatgpt` and requires `--model <catalog-checked model>`. Native `--codex-executable` / `--codex-sha256` overrides are refused for live mode. Without `--auto-reload-disabled true`, only a blocked metadata preflight is possible. Never add the flag without actual user attestation. Model metadata records the configured/catalog-checked slug, not a verified upstream model revision. `provider: codex-subscription` and existing profile IDs retain their historical names; `transport: gg-chatgpt` and the pinned client version distinguish new artifacts.

Once offline checks and the account-setting confirmation are complete, use the managed browser login (`node scripts/planner-eval/gg-client/cli.mjs login`), then metadata-only preflight (`node scripts/planner-eval/gg-client/cli.mjs planner-preflight`). Do not log raw credentials or account identifiers. Only an eligible account can proceed to one bounded smoke trial before matched pilots. No automatic retry follows an unknown outcome; no API key, paid fallback, credit purchase or overage is authorized.

The earlier native-build attempt is **superseded**, not a remaining prerequisite for this route. Its outside-workspace write guard was not bypassed; no restricted executable or build hash was produced. The existing external checkout is retained unchanged. Historical evidence is preserved in the verification document.

Source evidence: [GG pinned source](https://github.com/kenkaiiii/gg-framework/tree/d7f3e960f03544554a6dbff3bc1c1ac9cf27c374), installed package source/lockfile, [official Standard-tier request mapping](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/protocol/src/openai_models.rs), and [credit fallback and automatic reload](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-free-go-plus-pro-sora).

## Commands

Requires Node 22+ and the app's existing dependencies. GG live commands and the offline real-SDK tests additionally require the isolated pinned helper dependencies. After the approved initial setup, fresh checkouts can reproduce them with `npm ci --prefix scripts/planner-eval/gg-client --ignore-scripts --omit=optional`; CI does this explicitly before its offline tests. Evaluation commands never install packages or sign in automatically.

```sh
# Default: validate authored corpus and write a schedule; no credentials or network.
npm run eval:planner

# Reproducible authored-response regression, NOT an AI comparison.
# Prints a new owned temporary directory outside git.
npm run eval:planner -- --mode replay --fixture authored-responses-v1 --repetitions 1

# Rebuild the same report without regenerating any completed trial.
npm run eval:planner -- --mode replay --fixture authored-responses-v1 --run-dir "<printed directory>" --repetitions 1

# Replay genuine saved responses without a fixture flag when available.
npm run eval:planner -- --mode replay --run-dir "<owned run directory>" --corpus "<matching corpus>"

# Private corpus schedule; paths/transcripts/reports stay outside the repository.
npm run eval:planner -- --corpus "<private corpus JSON>"
```

Other filters: `--profile <versioned ID>`, `--split discovery|holdout`, `--clip <ID>`, `--repetitions 1|2`. A filter does not change the corpus/config fingerprint, so matching pilot work can be reused. Corpus, source code, prompts, configuration, tool/model identity and history seed changes reject resume; keep old artifacts and start a new run. Completed trial files are immutable. Interrupted/unknown outcomes are not automatically retried.

The named authored response fixture supports three consecutive explanations, ordinary speech, no-animation speech, and a takeaway. Other cases remain scheduled, not silently assigned empty plans. The real parser, source/timing validators, policy, outline handling and review code run on these authored responses. There is no model inference. A fixture passing says nothing about live model quality.

## Profiles and editorial policy

- `baseline-policy-codex-v1`: old shortlist, emphasis rotation, variety policy and empty-review fallback. This is a current-policy control transported through the GG ChatGPT adapter **when permitted**, not a historical Gemini measurement.
- `content-led-codex-v1`: same catalog exposure, earned optional exact-source quotes, stable layouts, separate takeover limits and valid empty reviews.
- `semantic-variety-codex-v1`: content-led plus bounded source-indexed outlines, per-idea offers and recent-use context. These semantic prompt changes remain experimental for Gemini.

Production short form uses the content-led **editing policy**, after offline and rendered controls; Gemini remains its transport. Long-form defaults retain the baseline policy. This is not a measured Gemini prompt/model win. There is no selected Codex winner (`EVALUATION_DEFAULT_PROFILE` is null); the evaluation CLI defaults to comparing all profiles, not promoting one.

An animation choice includes kind, preset, hero prop, tone and meaningful variant. A stable `stack` layout is not repeated content. Chaining shares a stage, not arbitrary object state/morphing. Full-screen quote emphasis is distinct from captions, per-word caption emphasis and animation takeover.

Automatic segment assignment no longer rotates into full-screen quotes. Explicit saved/manual choices are not rewritten. Quotes require exact source words and a reason; zero is valid. The versioned quote policy sets ceilings, never quotas. Original evidence/geometry/quantity/condition/full-window guards remain in force.

## Corpus and resource limits

The authored manifest contains six discovery and two held-out controls partitioned by topic/source. Private timed words can be imported through `corpus.ts`'s allowlisted importer; do not load a project through migrating/saving routines or copy complete project/settings objects. Validate word ordering, containment, size, clip duration and source/topic holdout leakage.

Primary trials hold model/config/review/history seed constant and use fresh sessions. Initial live target (blocked): six discovery clips × three profiles × two repetitions; reserve at least 20 of the hard 120 generation-attempt ceiling for confirmation/holdouts. Every outline/draft/review/retry counts. Maximum one request at a time, 90-second request and two-hour run ceilings, bounded output and transient retries. Limits are not permission to consume paid extras. Stop on quota, credit, upgrade, billing, auth or configuration failures; never switch providers.

Evaluation history is isolated. The runner's typed `historySeed` accepts at most 20 validated metadata-only records and fingerprints the seed; the CLI currently uses the declared empty seed. It never reads or writes production history. Production history is registration-owned derived metadata, limited to 64 clips / a 20-clip comparison window, with stable planning order and success-only export persistence.

## Reports and scoring

Owned run directories contain `checkpoint.json`, immutable `trial-<id>.json`, `report.json`, `report.md`, `blinded.json`, and a separate `profile-map.json`. Trial summaries are not trial identities: resolve the scheduled ID and load its validated trial artifact. Report rebuilding replays saved raw phase responses through the production planner and checks the result/fingerprints; cached parsed objects are not trusted.

Plan metrics record kind/family/preset/prop/tone/motif counts and durations with explicit denominators, repeated motifs, layout changes, stable split-screen time, quote/takeover time and expectation failures. Frequency duration sums and unioned wall-clock durations are different measurements. Trigger-based usefulness and eligible-window coverage are labeled **proxies, not semantic scores**. Empty output cannot pass a required-animation expectation. Optional quote selections, baseline rotation proposals before splicing, and final rendered quote/layout windows are separate counters. Deterministic quote-card prop observations are separate render events.

Use profile-blinded plan sheets and `metrics.ts`'s fixed 1–5 rubric: source relevance, explanatory clarity, readability/timing, pacing and emphasis restraint. Each score needs a reason; unscored stays null. Unsupported claims or incorrect source binding disqualify a plan. Choose correctness/relevance first, then pacing/restraint/useful variety, then latency/included usage; confirm on holdouts. Do not select a winner from authored controls or from lower repetition in empty output.

Observed metadata records provider/model/config, transport/client version and auth mode (legacy artifacts may have a CLI version), phase attempts, latency and reported token categories. Missing categories stay unknown. Never convert subscription tokens to API dollar charges or describe capacity as unlimited/free. Plan metrics are not rendered-quality evidence.

## Saved-plan render proofs (no AI)

```sh
npm run build
node scripts/explainer-stills/snapshot-bundle.mjs
node scripts/planner-eval/render-finalists.mjs --run-dir "<owned run>" --trial "<trial SHA256>" --corpus "<matching corpus>" --media "<local video>" --bundle "<snapshot path>" --fixture authored-responses-v1
```

Omit `--fixture` for non-fixture artifacts. Preserve matching `--transport`, `--model`, `--reasoning` and `--auto-reload-disabled` identity flags; retain native executable/hash flags only for legacy offline identity. The saved-plan renderer never launches the GG helper, Codex or an account check. Old code/config fingerprints remain immutable and are not silently migrated or made resumable by retaining flags. Each render creates a new owned output directory; it refuses existing preview outputs. Use a media source matching the corpus timing. Authored controls require explicitly labeled synthetic speaker footage, not unrelated real speech presented as a match.

The adapter loads a complete validated saved plan and uses the direct production segmented pipeline; it does not invoke the ordinary IPC preparation path or replan. Provider construction/gateway calls throw, in-process external fetch is blocked, provider environment overrides are absent, and `noAi` disables incidental emphasis/hook/B-roll/rehook generation. Supplied local captions and hook text, palettes, splicing, grouping, rebasing, SFX and native encoding remain real. Needed local render services remain available.

The immutable bundle is hashed before/after rendering. Output is checked at 1080×1920 / 30fps with bounded A/V duration difference; every expected planned animation must appear in successful render identities. Boundary PNGs, a contact sheet, ffprobe stream details and black-interval observations are retained outside git. Inspect them: a successful command is not a visual inspection. Synthetic footage proves pipeline behavior, not real speaking-face framing or live planning quality.

## Verification gates

Run focused main/shared/renderer regressions, `npm run check`, `npm run typecheck`, `npm test`, `npm run build`, and `npx --no-install tsc -p tsconfig.remotion.json --noEmit`. Use applicable existing explainer continuity/E2E checks. Normal `npm test` never logs into ChatGPT, calls a real provider or reads existing credentials; GG tests exercise the installed SDK against synthetic credentials and mocked network. Keep unrelated workspace changes and failures separate; do not weaken assertions or repair unrelated work to claim a clean gate.

Actual results, artifact paths and outstanding blockers are recorded in `planner-quality-verification.md`.
