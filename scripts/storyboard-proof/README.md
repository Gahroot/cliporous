# Storyboard production proof (STEP20/22)

Local authored fixtures only. No installs, downloads, builds, live AI or changes to application settings. The prototype `render.mjs` is preserved and is **not** used by this proof. Coordinator-owned `ui.*` files are independent.

## Fast checks (no browser, media, assets or production bundle needed)

```bash
node --test scripts/storyboard-proof/verify.test.mjs
node scripts/storyboard-proof/verify.mjs --unit
```

The runner generates an isolated Vitest config in a new OS `mkdtemp` directory. It does not modify global Vitest configuration. Unit mode executes real source-spec compilation, saved-plan validation, mixed-timeline construction, one-time production props rebasing, and the real export/preview dispatcher. **Only in unit mode**, rendering/encoding/SFX are mocked and output files are explicitly labelled non-media markers. Unit success is not media evidence.

Sixteen authored cases include definition, comparison, process, notes, quantity, all seven supported hero models, two-panel moving recurring prop, five-panel/45-element/5-prop board, maximum 210-node readable source, and long punctuated labels. Both Ink/Polish and all **eight** shared built-in palettes plus custom light/low-contrast inputs are exercised. Only numeric timestamp fields allow <=1e-9 arithmetic round-off in round-trip comparisons; geometry, labels and durations remain exact (segment duration is separately checked against its frame interval).

## Coordinator: pin an ALREADY built production bundle, then run serial media

After the coordinator's final production edits and build:

```bash
node scripts/storyboard-proof/pin.mjs --bundle out/remotion
# Copy the external "bundle" path printed above:
node scripts/storyboard-proof/verify.mjs --bundle "<returned bundle path>"
```

`pin.mjs` snapshots the existing bundle outside the repository and writes its adjacent `.storyboard-pin.json`. A snapshot from the generic explainer tool must first be passed through `pin.mjs` to create this manifest. No lazy build is possible. `verify.mjs` refuses missing/stale manifests, altered bundle bytes, stale production source-map contents, prototype roots, or an in-repository bundle. Production source hashes include main/shared code, local fonts/SFX, `package.json`, `package-lock.json`, `scripts/build-remotion-bundle.mjs`, `tailwind.config.js` and `tsconfig.remotion.json`, excluding proof scripts, tests and renderer-only UI edits. Bundled renderer dependencies are still checked through their source maps. Inputs are checked again after the run.

Installed local FFmpeg, FFprobe, Remotion compositor and Chrome Headless Shell are required. On Windows the existing `node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell.exe` is used. For another installed location set `STORYBOARD_PROOF_BROWSER` to its local executable. Browser downloads are prohibited. The copied production runtime is packaged-mode, so `renderRemotionSegment` cannot invoke a development bundler.

## Media route and assertions

Media mode uses actual `renderSceneFirstLongform` / `renderLongformScenePreview`, actual `renderRemotionSegment`, Remotion alpha rendering and FFmpeg encode/concat/mixing. No fake successful media outputs or standalone proof root are substituted. The renderer boundary only supplies the local browser, records calls, captures an actual alpha file, triggers cancellation after real rendered frames, and injects invalid visual props in the explicitly labelled failure case.

Cases include:
- Same saved two-panel board with recurring prop in Ink/Polish export and preview, mixed with an ordinary checklist and source bookends.
- 1920x1080, CFR30 timestamp/frame/duration probes; stereo source tone continuity, timeline seams, and source bookends.
- Full-resolution alpha samples at bookends and opaque interior; not exhaustive every-frame coverage.
- Preview/export RGB comparison with explicit MAE <=5/255 after 320x180 scaling (codec tolerance, not encoded-byte equality).
- Actual production `StoryBoard` completed-state still matrix, including clay, for 2 styles x (8 built-ins + 2 custom edges), catalog holds, dense pans, overview samples and contact sheet. Repeated stills must match exactly with the **same configuration**, browser, frame and output path.
- Optional overviews retain at least 28px headings and 18px other text at 1080p. Five-panel fixtures retain every panel without an unreadable miniature recap.
- SFX off/on, one actual mixer cue list per route, measured PCM difference, and repeated-board export with no duplicate cue aggregation.
- Two real preview cancellations after at least two alpha frames, followed by request/temp cleanup checks; separate cancellations after actual segment and final-concat FFmpeg process start preserve completed exports.
- A real browser visual fault: preview rejects; export reports a failed scene and restores the full source interval using actual FFmpeg.
- Bounded two-board stress. It obeys production policy: >90s source, <=30% board coverage and >=10s separation. The synthetic source is padded accordingly; this is not two overlapping boards in a short source.

## Artifacts and limits

The console prints the unique external artifact directory. Keep `runner-report.json`, `report.json`, `contracts.json`, `mixed-plan.json`, command/probe/timestamp/reconciliation JSON, logs, source and exported/preview MP4s, captured alpha MOV, full-resolution stills, `still-index.json` and `contact-sheet.png`. Unit runs additionally retain `unit-dispatch.json` with explicit mocked-runtime scope. Reports record source/bundle/harness hashes, invocations, measured results and failures. Owned copied runtime/cache is cleaned; media artifacts remain for review.

Metrics report wall time, worker Node RSS high-water/samples and owned scratch disk bytes/file counts before/after and sampled peak. On Windows, `process-samples.json` separately samples owned child counts and working sets every five seconds, with PID creation-time checks and a settled sample; observer overhead is included. `live-canvas-counts.json` samples actual production still-composition DOM and checks zero canvases for 2D, at most one for 3D. These are sampled observations, not exhaustive high-water marks or GPU allocation measurements. Sub-frame publication races, multi-hour soak, maximum-board full-motion stress, cross-GPU determinism, native UI/accessibility and live-AI/ASR quality remain unverified unless the coordinator records additional evidence. No constant-resource claim is made. Full-resolution visual inspection and listening limits must be recorded.

The coordinator ran the production media and browser proofs on 2026-10-02. Exact results, local artifacts, visual corrections, platform limits and the two remaining unrelated Windows test failures are in [the completion record](../../docs/plans/longform-storyboard-verification.md). A unit-only run never substitutes for those measurements.

## Browser UI proof

`node scripts/storyboard-proof/ui.mjs` serves the actual React controls with an authored desktop-bridge fixture, drives native browser keyboard/pointer events, measures picker contrast with the shared helper, and records PNGs plus `report.json` outside git. Use Node 22.18+ (native TypeScript stripping for the shared contrast module). `STORYBOARD_PROOF_BROWSER` can select an existing local browser; no browser is downloaded. The driver opens native disclosures, rejects offscreen pointer targets and waits for finite transitions before capture. Missing fixture media is intentional; packaged Electron playback and assistive technology are not exercised by this runner.
