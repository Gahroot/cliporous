# 002: Continuous storyboards share the authoritative long-form plan

Status: accepted, 2026-10-02.

## Context

Long-form explanations sometimes need a persistent canvas rather than isolated scene cuts. Saving generated graphics or choosing boards at export would undermine the approved source-grounded plan and make historical exports depend on a model or changing defaults.

## Decision

A storyboard is one full-frame scene placement with a versioned, source-word-bound specification. An allowlisted deterministic compiler owns geometry, timing, camera routes and resource budgets. Multiple panels remain on one canvas; supported clay props share zero or one WebGL canvas, with completed action clocks held and offscreen instances culled. One canvas avoids nested render stages but does not remove cumulative model costs, which still require caps and runtime measurement.

Ink and Polish are a separate material/type axis from palette, legacy block skins and application theme. Capture style and validated palette contents at planning start; immutable plan versions own appearance through preview and export. Appearance-only edits create drafts without calling a model.

Keep schema 2. Parser 1 retains its historical scene-only meaning; parser 2 explicitly supports storyboards and records storyboard style. Unknown versions remain preserved but unrenderable. No automatic conversion of approved history. Source narration remains on the existing exact-frame timeline, with transparent board fades composited over the original footage and whole-interval source fallback on visual failure.

## Rejected alternative

A separate storyboard renderer/planner running during export would duplicate timing, approval, persistence, palette and cancellation ownership. Nested existing scene canvases would be quicker to assemble but would not provide a consistent camera or bounded WebGL resources. Generated HTML/SVG/code would remove the source-evidence and authored-geometry boundary. None is used.
