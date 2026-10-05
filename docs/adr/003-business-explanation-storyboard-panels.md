# 003: Business explanation panels preserve source choices and share the board stage

Status: accepted, 2026-10-03.

## Context

Business explanations need persistent task, transaction, capital and claim identities across storyboard panels. Saving rendered scene blobs would obscure source validation and make historical exports depend on changing renderer internals; embedding independent scene stages would conflict with the board camera and cumulative resource limits.

## Decision

Storyboard source specification 2 adds a bounded `explanation` panel. It saves versioned allowlisted source choices, word spans and explicit identity links, not geometry or opaque approved scene data. Deterministic adapters invoke the same scene source parsers and compile validated facts into authored board diagrams and shared model instances. Panels retain the board's held clocks, camera, culling, one WebGL layer and existing cumulative budgets; independent `HybridStage`/`ExplanationStage` wrappers are not nested.

Keep longform schema 2. Parser 3 explicitly supports specification 2; specification 1 and parsers 1/2 retain their historical behavior, appearance snapshots and approved history without conversion. Unknown future versions remain preserved but unrenderable. Preview and export reconstruct saved specifications and fingerprints without calling a planner, and retain whole-interval source fallback on visual failure.

## Rejected alternative

A generic saved graph, raw scene blob or export-time planner would be quicker to connect but would introduce arbitrary graphics, duplicate semantic validation or change reviewed facts on export. Independent panel canvases would avoid extracting reusable parts but break camera continuity and bounded shared resources. Neither is used; ADRs 001 and 002 remain accepted and unchanged.
