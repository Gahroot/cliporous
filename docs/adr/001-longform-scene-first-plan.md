# 001: One authoritative scene-first plan for long-form

Status: accepted, 2026-10-01.

## Context

Long-form planning previously saved blocks, phrases and cards, then selected modern explanation scenes during export and discarded any that did not fit the remaining speaker windows. The reviewed plan could therefore differ from the actual export, and the richer library was subordinate to legacy scheduling.

## Decision

New long-form drafts persist source-bound, versioned explanation placements before approval. Preview and export reconstruct the same allowlisted source specifications without calling a planner. The approved snapshot includes timing, presentation and palette; invalid or divergent restored approvals are revoked without discarding their original data. Existing legacy plans remain explicit and playable.

Reuse the existing scene catalog, source-grounding contracts, deterministic motion, Remotion renderer and FFmpeg pipeline. Share widescreen geometry between composition and encoding, and keep narration in source time. A failed scene returns to speaker footage for exactly its approved interval and appears in reconciliation.

## Rejected alternative

Keeping legacy planning plus a separate render-time explainer planner would be cheaper initially, but would retain competing timeline ownership, unreviewed export changes and unreliable complex-scene scheduling. A separate long-form animation engine would duplicate the existing catalog and validation work without solving those problems.
