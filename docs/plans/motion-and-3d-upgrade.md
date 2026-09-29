# Motion and 3D upgrade

## Scope

Implement the corpus-backed motion/graphic/3D improvements in the existing Remotion explainer pipeline. Preserve 1080×1920/30fps, the virtual stage, palette selection, word-index timing, existing scenes, render cancellation and deterministic frame seeking.

**Explicit exclusions:** captions (including text behind the speaker), finishing polish (grading/LUTs, grain, leaks, zoom changes, GL transitions, GPU postprocessing), additional aspect ratios. No installs, external model/asset downloads or arbitrary SVG uploads. Lottie asset ingestion is deferred: no licensed asset pack is present and it would require another dependency. Existing rolling numbers are retained, not reimplemented. Cursor/toast graphics belong in a future dedicated product-demo scene rather than decorating unrelated speech.

## Step-by-step implementation

1. **Establish sources and working-tree baseline.** Read relevant corpus implementations and local callers. Record sources and distinguish inspiration from copied code. Preserve existing work (initial status: only untracked `.ezcoder/`). Use existing tests and still renderer.
2. **Motion vocabulary.** Add frame-driven named spring presets (snappy, default, heavy, gentle, playful, stamp), pure spring evaluation, stagger offsets, damped follow-through and bounded additive emphasis pulses. Wire presets into shared pop/entrance helpers, stamps and hero entrances. Preserve explicitly tuned legacy prop signatures rather than blindly replace every spring. Test seeking out of order, start/end behavior, bounded overlap and relative overshoot.
3. **Graphic primitives and real integration.** Add mask-rise text, marker swipe, ink circle/underline/arrow, outline callout and deterministic text decoding; integrate into suitable existing scene components. Enhance stamp impact with a restrained ring/accent burst, not full-screen shake. Reuse the existing rolling-number scene. Keep new animation code pure and palette-derived.
4. **Planner-controlled accents with a taste budget.** Give supported scenes optional, validated annotation choices, attached to their own label rather than free coordinates. Cap decorative extras and avoid stacking stamp + annotations. Keep choices transcript-timed, bounded and serializable. Add rejection/fallback and rebasing coverage. Explain restraint in the prompt; do not pretend this is a whole-app visual scoring system.
5. **Curated 3D icon pack.** Build reusable beveled shape extrusion using installed Three.js, with project-authored filled silhouettes (not downloaded icon SVGs). Add 12 semantic props: shield, cloud, checkmark, warning, lightning, chat, crown, diamond, bookmark, compass, link, graduation-cap. Register every prop in types, catalog, planner shortlist and renderer. Give each a deliberate reveal/action and impact timing. Test catalog completeness, geometry, recognition and parser acceptance/rejection. No model-supplied paths/URLs/XML.
6. **Studio material upgrade.** Improve shared Clay material with restrained physical clearcoat; add a small offline generated environment while retaining the existing rim lights. Dispose GPU resources on unmount; no external HDRIs, random room generation, transmission, bloom or temporal effects. Validate alpha and headless rendering before keeping the environment.
7. **Verification and visual evidence.** Add fixture coverage for new icons, representative old props, graphic effects, long labels and transparent layout. Run focused tests, main/web typing, standalone Remotion typing, lint of changed files, production bundle where possible, then render/inspect real PNG contact sheets (including phone-size views). Correct concrete defects; record commands, outcomes and limits below.

## Corpus evidence

- `lakshaybhushan/vecto3d`, commit `32ddea4f3ea1533de310c9837c9f55417f320813`, `components/previews/svg-model.tsx` 188–235, 266–281: shape-based extrusion and physical material tuning. We use authored Three Shapes rather than accepting SVG XML.
- `Vincentwei1021/video-shotcraft`, commit `e2d8928c57ef84701f9b0119ca4a1c28a62050c1`, `assets/lib/helpers/motion.ts` 24–40: seekable lag and damped follow-through. New implementation uses seconds, existing Remotion springs and project-specific constraints.
- `Remocn/remocn`, commit `3903a46b3438da48c8c63083f0d1222ab814dde2`, `registry/remocn-icons/icon-arrow-down/index.tsx` 81–89: shaft then arrowhead draw-on via SVG dash offsets. New project-authored paths use normalized path lengths.

These are implementation references, not dependencies. No repository code/assets are vendored by this plan. Existing project attribution remains intact.

## Verification log

Completed on 2026-09-28. All seven scoped steps above are implemented; exclusions/deferred work in Scope remain excluded.

### Implemented

- Six named motion weights; heavy hero/stage/window entrances, stamp recoil, bounded additive reactions, stagger/follow-through helpers. Existing deliberately tuned individual prop animations remain intact.
- Mask-rise labels in hero/search scenes; a short deterministic terminal-title decode (code contents unchanged); marker, underline, circle, box and arrow annotations; restrained stamp impact ring. Existing rolling-number animations are reused.
- Annotation parsing is allowlisted, word-timed and scene-relative after rebasing. Later stamps win over annotations; annotations cannot appear on consecutive accepted scenes and annotated scenes have at most one reaction, including automatic emphasis.
- Twelve project-authored beveled 3D icons bring the hero catalog from 31 to 43. Each has a registry entry, transcript trigger, impact cue and geometry/shortlist/parser coverage. Cloud supports a downward download action.
- Shared Clay uses restrained physical clearcoat. StudioEnvironment generates a 128px offline Three.js RoomEnvironment reflection map once per mounted canvas, restores prior scene state and disposes owned GPU resources. It never assigns a scene background.

### Observed verification (RUNTIME)

- `npm run check`: pass, 118 warnings reported; no new suppressions. The two warned lines in modified explainer files are pre-existing array-index keys.
- `npm run typecheck`: pass (main/preload/shared + renderer).
- `./node_modules/.bin/tsc --noEmit -p tsconfig.remotion.json`: pass (standalone video compositions).
- `npm test`: main 925 passed, 5 opt-in tests skipped; renderer 333 passed. Existing React `act` warnings remain.
- `LAYOUT_FFMPEG_IT=1 ./node_modules/.bin/vitest run --config vitest.config.main.ts src/main/layouts/segment-layouts.ffmpeg.test.ts`: all 5 opt-in real-FFmpeg layout tests passed separately.
- `npm run build`: production Electron/preload/renderer and Remotion bundles pass.
- `node scripts/explainer-stills/render.mjs motion-upgrade.json`: 21 fixtures / 66 PNG frames and contact sheets rendered successfully with ANGLE GL. Covers all 12 icons, reverse cloud, transparent long-label overlay, stamp impact phases, annotations, old coins/lock, code and search. A 360px-wide-per-tile gallery was inspected.
- `node scripts/explainer-stills/render.mjs scenes-3d-a.json balance-left`: existing 3D balance scene rendered and inspected at six phases.
- `node scripts/explainer-stills/verify-motion.mjs`: production-bundle frame order 75 → 18 → 75 produces identical PNG bytes; a 90-frame ProRes 4444 render preserves transparent corners and a visible hero after FFmpeg decoding.
- `git diff --check`: pass.

### Defects caught and fixed

- An impulse's exact 0.9-second boundary could leave floating-point residue; elapsed-frame comparison now returns exactly zero.
- Broad `complet*` matching incorrectly selected the new checkmark for “completely drained”, overriding the battery. Narrowed word forms; the existing quote-graphics regression now passes unchanged.
- Nonuniform SVG scaling plus a non-scaling dashed stroke broke drawn borders into pieces. Animate a separate normalized mask, retain a solid non-scaling visible stroke, and leave space for italic overhang.
- Initial icon bodies were too pale to distinguish their white details at phone size. Darkened their palette-derived body material and re-rendered the full fixture pack.

### Evidence and limits

Generated files are intentionally outside git:

- `$TMPDIR/explainer-stills/upgrade-*-sheet.png`, individual `upgrade-*-f*.png`, and `upgrade-gallery.png`.
- Latest production alpha/seek evidence: `/var/folders/4x/5bswsdrs5jx8fjx_qp31qrn40000gn/T/batchclip-motion-check-rr0hB8/` (`shield-alpha.mov`, `shield-f75.png`). Future harness runs create their own temp directory and print it.

No paid/live Gemini planning call, Windows GPU/deployment test, full real-source user export, cross-palette visual sweep, render-speed comparison, or long-session memory benchmark was performed. Repeated-frame equality and ProRes alpha were directly verified on the shield case, not every prop. New resource bounds/disposal are CODE evidence, not a claim of measured performance. Three.js emits an existing Clock deprecation warning in the rendering stack; no dependency upgrade was attempted.

No caption, finishing-polish, aspect-ratio, package/lockfile, or user-data changes. No commit or release was made.
