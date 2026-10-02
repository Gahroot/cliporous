# Compliance Register: scoped rendering features

Snapshot: 2026-10-01 · EZ Coder compliance-guard · **Engineering guidance, NOT LEGAL ADVICE.**
Baseline: `9aef4b169c20265f80df5f5177d7ae6e5d5c0f54` plus existing working-tree changes.

This is a narrowly scoped feature register, not a product-wide legal/privacy/security review or a launch certification.

## Continuous storyboard extension: 2026-10-02

Engineering guidance only, not legal advice. Scope: the uncommitted storyboard changes based on `890a6b84db87a72839062dc99b5300b4b221966d`. Nothing was deployed. Earlier Detroit/hybrid rows below were **not re-audited** and must not be read as fresh findings or approvals from this pass.

Confirmed code scope: the local Electron editor accepts source media/transcripts and uses its existing Gemini connection for planning. This adds bounded storyboard proposals, not a new provider, public endpoint, tracker, voice generator or remote asset service. Source footage can contain personal data; actual customers, distribution jurisdictions and source permissions were not investigated here.

| ID | Severity | Trigger and evidence | Implemented control / residual responsibility | Guard / status |
| --- | --- | --- | --- | --- |
| SB-C01 | MEDIUM | **RUNTIME:** generated explanations can imply unsupported facts; raw-response fixtures, numeric/sign/precision negatives and real saved-plan compilation were exercised | Source spans, exact quantities, relationship evidence, allowlisted models/actions and complete timing windows are required. The existing whole-plan approval remains; this does not establish the truth of the speaker or transcription | Contract/compiler/planner and persistence tests; production proof. Implemented, with human editorial judgment still required |
| SB-C02 | MEDIUM | **CODE:** storyboard proposals send bounded transcript/feedback data through the existing Gemini client and usage ledger | Existing source-processing permissions/vendor arrangements remain relevant. Extra calls are bounded and usage-visible; preview/export work from saved specs without AI. No live provider behavior or retention terms were checked | Planner fixture/cancellation tests; offline render proof. No new privacy/vendor certification |
| SB-C03 | MEDIUM | **RUNTIME:** new appearance/review controls affect keyboard and visual access | Native controls and existing Radix semantics are retained. 54 browser checks and 28 screenshots cover selection, keyboard focus, reflow, CSS zoom, missing palettes, preview recovery and history; sampled text/ring contrast passed | `scripts/storyboard-proof/ui.mjs`; packaged screen readers, forced colors, OS scaling and complete accessibility conformance remain unverified |
| SB-C04 | LAWYER | **CODE:** explanatory graphics are generated/manipulated output, separate from the right to use the source | This feature does not add a persistent export disclosure or a machine-readable provenance standard. Before public distribution, the release owner must obtain advice on the appropriate labeling/provenance for the actual product and audience, separately from source-media permissions | Open release-policy question, not a conclusion that a particular law requires one specific mark. No date-sensitive legal claim was verified |
| SB-C05 | MEDIUM | **RUNTIME:** prototype/reference media could accidentally enter a shipped composition | Production bundle gates reject the proof module/private reference dependency. Verification used authored panels and synthetic local tone/video, no downloaded footage. Existing local model allowlists stay in force; no rights-blocked asset was enabled | Bundle/source hashes, gate tests and production renders. Existing asset-license records were not re-certified |

No new payments, messaging, hosted UGC, biometrics, training-data collection or user-ranking service was added in this scope. This is not a fresh audit of those surfaces elsewhere in the app. No legal thresholds, statutes' effective dates or vendor terms were re-verified. Current evidence and limits: [long-form storyboard verification](docs/plans/longform-storyboard-verification.md).

## Earlier Detroit/hybrid exposure profile (historical)

Confirmed: desktop video-production software; transcript-driven illustrative finance/business/AI animations; local authored landmark assets; generated videos may be distributed. This feature adds no accounts, payments, tracking, precise location, new personal-data storage, external assets or paid model calls. Distribution is treated cautiously as potentially commercial. The examples are educational fixtures, not advice, live holdings, actual Detroit business performance or measured AI internals.

## Findings and controls

| ID | Severity | Trigger | Evidence | Required control | Status | Guard |
| --- | --- | --- | --- | --- | --- | --- |
| DH-01 | LAWYER | Depicting Spirit of Detroit in redistributed software/video | CODE + source review: no redistribution basis established; see asset provenance | Record rights basis/permission for both model redistribution and generated outputs; museum photo procedures alone are insufficient | **Blocked**; no asset, runtime ID or substitution | Catalog and negative parser tests reject unavailable asset |
| DH-02 | HIGH | Financial visualizations could imply invented performance/ownership | RUNTIME: raw-payload rejection/acceptance tests and native fixture/media proofs | Exact conservation, denominator/unit checks, unknown states and local actor evidence; no advice or actual-holdings claims from fixtures | Implemented and checked on deterministic fixtures; not a live-model accuracy guarantee | Finance/cash contracts, negative parser tests, hybrid-library pipeline tests |
| DH-03 | HIGH | Attention illustration could look like measured model telemetry | RUNTIME: parser tests and reviewed token/metric frames, including source-backed constraint limit | Persistent illustrative label, no attention percentages; comparable task/basis for metrics | Implemented and fixture-verified; no actual-model telemetry claimed | AI diagram contracts, parser-to-SVG tests and rendered-frame checks |
| DH-04 | MEDIUM | Landmark identity could imply endorsement or reproduced artwork | CODE + RUNTIME: authored local catalog and reviewed corrected landmark pairs | Source-triggered setting, no inferred ownership/returns; no logos/photos/murals/reliefs; retain provenance | Seven pairs implemented/reviewed; stylized, not survey-accurate or user re-approved | Catalog/alias/availability tests, mesh bounds, final matrix/gallery |
| DH-05 | MEDIUM | Synthetic proof video could be mistaken for real speaker evidence | RUNTIME: 12 production group composites visibly label synthetic source/no human data | Distinguish animation reels, authored transcript and local synthetic source from natural narration/live Gemini evaluation | Label and report verified; no real-person/voice claim | Production report, caption/alpha/SFX checks and sampled encoded holds |

## Implemented in this pass

Seven explanation families/fifteen presets, both presentation modes, seven enabled landmark pairs, source/quantity guards, storyboards and rights gate are implemented. Native matrix, media and production-route evidence is in [the scoped verification record](docs/plans/detroit-hybrid-explanation-verification.md); provenance is in [the landmark record](docs/asset-provenance/detroit-landmarks.md). The corrected RenCen replaces the user-rejected depiction. Spirit remains unavailable.

Four local 70.3-second showcase/gallery videos, twelve production group composites and two complete 130-second production proof films were exported. Proof uses authored educational text and a visibly labelled synthetic source; no cloned voice, purchased music, real holdings, financial advice or live model evaluation. Final lint and both typechecks pass, but full-suite tests and the third-party asset audit do not. The failures and successful serial timeout reruns are separately recorded, not treated as a green launch gate.

## Open prerequisites / needs a qualified rights review

Spirit of Detroit: a recorded defensible basis or permission covering independently authored 3D/2D derivatives in commercial software and generated outputs. No permission request, payment or legal conclusion will be made automatically. Independent landmarks and architecture may proceed under the approved plan while this asset remains unavailable.

## Re-verify before relying

Source pages identify subjects, not blanket licences. Recheck rights decisions before enabling any gated artwork, and rerun guards when contracts, assets or model selection change. No statutory deadlines, jurisdictional certification or fair-use conclusion is asserted. No product-wide exposure, accessibility, privacy, payment, hosting, content-platform or marketing review was performed by this scoped register.
