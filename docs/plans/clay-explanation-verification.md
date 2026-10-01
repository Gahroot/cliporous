# Clay explanation expansion: measured verification

Date: 2026-09-30. Implementation plan: [clay-explanation-expansion.md](./clay-explanation-expansion.md).

## Result and scope

Implemented 14 new scene kinds / 29 presets: eight spatial/house families and six cognition/agent families. All are registered in the AI spec registry, scene union, shortlist and real Remotion dispatch. Existing `Clay`, studio environment, contact shadows, `MechanismStage`, palettes and render pipeline are reused; no new renderer, dependency, service, downloaded model or app setting was added.

Source validators enforce bounded authored presets, source-backed visible labels, relationship evidence, five ordered word-indexed beats, conditional meaning and final holds. Requests do not become grants, conflicting evidence does not become agreement, rent does not become profit, and generic alternatives do not invent an improved finish or structural changes. The house identity can continue across scenes; this is not arbitrary geometry/state morphing.

All existing dirty/untracked work was treated as the user-authorized baseline. No commit, deployment or publication was performed. This is a feature verification record, not an assertion that the whole repository passes its release gate.

## Automated checks

| Check | Observed result |
| --- | --- |
| `npm run typecheck` | Passed before and after implementation. |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.remotion.json` | Passed separately; the root solution does not cover Remotion. |
| Targeted Biome check over the 41 changed/new code, config and harness files | Passed with no fixes, errors or warnings remaining in that selection. |
| `npm run build` | Passed; Electron main/preload/renderer and Remotion bundle built. |
| New TypeScript feature suites | 591 passed: spatial contracts 194, cognition contracts 179, spatial poses 80, cognition poses 75, render integration 60, framing 3. |
| Final bounded affected-suite run (`npm run test:main -- --maxWorkers=2` with 13 explicit test-file filters) | All 911 tests passed, zero failures or skips. Includes the six new suites plus existing planner, shortlist, technology-boundary, technology-contract, causal-integration, short-form and long-form suites. Both type checks and the 79-pass Node harness were also rerun separately after the final code edits. |
| `npm run test:main -- --maxWorkers=2` | 3,245 passed, 2 failed, 5 pre-existing skips. The two failures are the unchanged Windows path expectations described below. |
| `npm run test:renderer -- --maxWorkers=2` | All 333 tests / 62 files passed. |
| `node --test scripts/explainer-stills/*.test.mjs` | 79 passed, 4 platform-specific skips, zero failures (83 total including subtests). |
| `git diff --check` | Passed. |

The integration tests exercise all 29 fixtures through actual grouping, protected vertical splicing, cue collection, relative-time mapping and long-form speaker-range fitting. A nonzero source offset is used, and a real same-house chain is passed through `buildGroupRenderPlan`. Each new kind also has a shortlist example; the existing prompt-size caps remain unchanged.

Pose tests cover preset distinctions, finite/bounded motion, forward/backward seeking, shifted timelines, contact/phase ordering and exact final holds. Framing tests project authored ground-plane/desk bounds to the stage and reserve separate regions for models, labels, conflicting claims and the final takeaway.

### Repository-wide failures left untouched

- `npm run verify` stops at the existing whole-repository Biome gate: 727 errors and 119 warnings in the observed checkout. The report includes widespread CRLF-versus-LF formatting differences in untouched files, plus existing lint warnings. A blanket line-ending normalization was deliberately not performed.
- Two assertions in `src/main/ipc/brand-pack-handlers.test.ts` fail on Windows: fixtures expect `/packs` and `/resources/brand-packs`; the existing path-producing code returns Windows separators. Neither this test file nor its production handler was changed by this feature.
- Initial unconstrained test runs during build/render work timed out in several existing tests. Reruns with two workers passed the renderer suite and the existing keystone suite without changing any timeout or assertion. Only the two path-expectation failures remain in the main suite.

No tests were skipped, weakened or suppressed to make this feature pass. The existing skipped FFmpeg-layout and platform-specific harness checks are not claimed as verified here.

## Real rendered evidence

Environment: Windows x64, Node 22.18.0, Remotion 4.0.496, local cached Chromium with ANGLE. No browser download/install, live AI call or paid API request was made.

Final production Remotion bundle SHA256:

```text
a4050820ea50352f82c7d4d1076ba64a04da289b8a0d0b1203b5b3552421bf3e
```

All four final reports below pin this exact bundle. Generated PNGs, movies and reports remain outside Git, under `%TEMP%` on this machine.

| Evidence | Artifact directory under `%TEMP%` | Result |
| --- | --- | --- |
| All spatial presets | `explainer-stills-m8ttNG` | 17 cases, 85 stills and contact sheets; passed. |
| All cognition presets | `explainer-stills-J4L32r` | 12 cases, 60 stills and contact sheets; passed. |
| Real `ExplainerSequence` continuity | `clay-continuity-TxCC35` | Three same-house scenes, 12 key/transition stills, `house-transition.mp4`: 60 frames at 30 fps; passed. |
| Native repeatability / ProRes | `batchclip-systems-check-Zzmflb` | Four representative cases, 88 critical frames tested in serial/shuffled/parallel order; four 12-frame movies decoded; passed. |

Each directory contains `report.json`. Stills include setup, action/distinction and both ends of the final hold. Across each family, fixtures cover light vertical `stack` and dark landscape `over`; this is not every preset crossed with every layout and palette.

### Visual critique and correction

The first rendered pass exposed real defects not caught by type checks:

1. Lower labels overlapped folded house fronts, a neighborhood road and desk legs.
2. The evidence-conflict claims collided with a table support.
3. The blueprint and house labels were reversed relative to their objects.

The shared camera and lower text regions were corrected, the conflict claim region was aligned separately, and blueprint/house label order was fixed. All 29 presets were rebuilt and re-rendered. Revised full-resolution frames were inspected for the cutaway/road/furniture and desk/claim cases, plus light and dark layouts. The new projection tests guard the underlying overlap problem.

A separate semantic review removed invented partition/finish changes from generic house alternatives, and physical supports stopped using translucent CSS border colors as clay colors. No separate material or lighting theme was introduced.

### Repeatability and transparency details

The four native cases were:

- `house-cutaway/rooms` (light vertical stack).
- `property-access/revoked-key` (dark landscape over).
- `agent-team/contractor-crew` (dark landscape over).
- `evidence-conflict/human-review` (dark landscape over).

For each case, all 22 declared critical frames were byte-identical when rendered serially, in shuffled order and in parallel on this environment. This uses fresh Remotion pages in the same browser, not a persistent mounted React instance.

Each movie is a 12-frame, 0.4-second sample around the check beat, encoded as ProRes 4444 and decoded as `yuva444p12le` at 30 fps. The three `over` samples had visible content, partial alpha and fully transparent outside corners at the sampled decoded frames. The `stack` panel was correctly opaque. The verification browser was closed successfully, and the report recorded no errors. No software-raster override was used.

This representative run rendered 312 frames in about 210.4 seconds on this machine. It is a verification workload, not a before/after performance benchmark, render-time guarantee or GPU-memory measurement.

## Reproduction commands

Use Node 22+ and the already-installed project dependencies/browser. No install step is required for the recorded environment.

```bash
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.remotion.json
npm run test:main -- --maxWorkers=2
npm run test:renderer -- --maxWorkers=2
node --test scripts/explainer-stills/*.test.mjs
npm run build

node scripts/explainer-stills/render.mjs clay-spatial.json --bundle out/remotion
node scripts/explainer-stills/render.mjs clay-cognition.json --bundle out/remotion
node scripts/explainer-stills/render-clay-continuity.mjs --media

node scripts/explainer-stills/verify-systems.mjs --select explanation:house-cutaway/rooms --select explanation:property-access/revoked-key --select explanation:agent-team/contractor-crew --select explanation:evidence-conflict/human-review --native-cases --no-controls --media-frames 12 --bundle out/remotion
```

The still renderer now resolves the already-installed `ffmpeg-static` binary for contact sheets, with PATH as the existing fallback; this was necessary because this Windows host has no `ffmpeg` executable on PATH. No package was added.

The fixture manifest has explicit coverage targets for all 29 new presets and their 14 kinds. `--all` verification includes them. Declarations and sample stills alone do not satisfy the existing `coverage.mjs --complete` gate, and complete all-target execution is not claimed here.

## Limits

- No live Gemini generation/quality evaluation, ASR, user-video processing, full end-to-end speaker/caption export, audible SFX review or release/deployment was performed.
- All presets have rendered stills and pose/contract tests; native byte-equality and ProRes tests cover the four named representatives, not every preset/frame/layout/palette combination.
- The continuity movie is a silent two-second excerpt across a real scene transition, not a whole clip export or continuous object-state morph.
- No GPU-memory/draw-call instrumentation, all-hardware determinism, macOS/Linux rendering or full accessibility conformance is asserted.
- Existing Three.js clock-deprecation and ANGLE shader-precision warnings were logged; they did not fail these checks. Dependencies and rendering controls were not changed to hide them.
