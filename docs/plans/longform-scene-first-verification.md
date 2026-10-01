# Scene-first long-form implementation and verification

Date: 2026-10-01. Status: implementation and final bounded sound-cue verification passed. The 924-second media, export/preview SFX, cancellation/alpha and UI proofs are recorded below. Full repository verification is not claimed green: the recorded full main suite retains two unrelated Windows failures.

## Delivered behavior

- New long-form drafts are explicit schema-v2 `scene-first` plans. The planner processes bounded transcript sections with two-section concurrency, cancellation, source-grounded catalog parsing, diagnostics, partial results and deterministic reconstruction.
- Saved scene decisions, source word/timing fingerprints, presentation, skin and palette snapshots are reviewed and approved before export. Restoring missing, stale or divergent approval snapshots revokes approval without discarding the saved versions.
- Export and one-scene preview reconstruct the allowlisted saved specifications; neither makes new AI decisions. Scene-first export omits AI credentials and respects the explanations-enabled setting.
- `speaker-side`, `speaker-pip` and `full-frame` share geometry between Remotion and FFmpeg. Modern scene families receive native widescreen staging rather than a stretched vertical composition.
- Source-time speech stays continuous. Omitted, invalid or failed scenes leave speaker footage, with an explicit per-scene reconciliation report instead of hidden legacy-card substitution.
- Saved sound cues are mixed only for successfully rendered, enabled scenes. Export keeps source time; preview rebases once. Sequential five-second lossless sound beds bound delay buffers and per-command inputs, followed by one stereo 48 kHz AAC mix with video stream-copy. Missing planned assets, mix failure or cancellation prevent scene-first publication; legacy missing-asset fallback is unchanged.
- New scene-first exports choose unused sibling names and publish without overwriting an existing file. Hard links provide atomic no-clobber publication on supporting filesystems; the exclusive-create streaming fallback is cancellable but not atomically visible. Existing legacy export behavior is unchanged.
- New boundary probing is regular-file-only, bounded and cancellable, with FFmpeg/FFprobe protocol allowlisting. Authorized native and UNC media paths remain supported; this does not claim a broader legacy-route security rewrite.
- Legacy plans remain readable and playable. Their **New scene-first draft** action creates a new version; existing plans are not silently migrated.

Architecture and vocabulary: [ADR 001](../adr/001-longform-scene-first-plan.md), [CONTEXT.md](../../CONTEXT.md).

## Automated checks

Run from the repository root with the installed dependencies, without package installation or live AI calls.

| Check | Observed result |
| --- | --- |
| Root TypeScript + standalone Remotion TypeScript + production build | SFX production build passed (`post-sfx-gates.log`). Root and standalone Remotion typechecks also passed as direct, unpiped commands in the final refresh. |
| Full main suite, direct `npm run test:main -- --maxWorkers=2` | **5,449 passed, 2 failed, 5 existing skips** across 227 files. Both failures remain unchanged Windows path-separator expectations in `src/main/promo/brand-pack-loader.test.ts`; neither loader nor fixture was modified by this work. Log: `C:/Users/Groot/.ezcoder/bg/0872a5c2.log`. |
| Full renderer suite, direct `npm run test:renderer -- --maxWorkers=1` | **557 passed across 75 files**, exit 0. Log: `C:/Users/Groot/.ezcoder/bg/ac44937c.log`. An interim run hit six review/preview expectation mismatches during concurrent UI changes; those were resolved outside this SFX pass, followed by fresh focused and full passing runs. |
| Final focused main gate | **188 passed across 10 files:** SFX, bed, cancellation, missing assets, scene-first pipeline, both IPC boundaries, planner contract and stage/projection fixtures. The two missing-asset regressions were reproduced failing before the correction; all five asset-availability cases now pass, including legacy compatibility. |
| Opt-in media harness TypeScript | Direct `tsc -p .ezcoder/tmp/longform-final-20261001/tsconfig.proof-harness.json --noEmit` passed. It includes both media tests, both runners and SFX config, plus the project's existing main globals; root TypeScript normally excludes these scripts. |
| Scene-first IPC/source validation | 35 focused tests passed. |
| Review screen, preview, restore and export approval regressions | Final direct focused run: **59 passed across 4 files**, including 33 review-screen, nine preview and 17 restore/export tests. Log: `C:/Users/Groot/.ezcoder/bg/87046fe6.log`. |
| No-clobber publication/render boundaries | Render agent's final 99 focused tests passed, including real-file existing-target, collision, exclusive-copy cancellation and cleanup cases. |
| Main structural/projection fixtures | 66 affected tests passed after adapting the existing traversal fixtures to the new layout hook; WebGL ownership now mounts actual React context through server rendering. No geometry assertions were removed. |
| Biome | Direct `npm run check` passed: 1,072 files, 119 existing warnings and five infos, no fixes applied. The earlier 16-file SFX/IPC/harness check passed without diagnostics (`post-sfx-gates.log`). |

Local evidence: `.ezcoder/tmp/longform-final-20261001/`, including `post-sfx-direct-verification.json` with exact commands, statuses and native log/report paths. No tests were newly skipped or assertions weakened. No commit, deployment, dependency installation or paid AI request was made.

## Actual Windows media evidence

The reusable, opt-in proof uses the real source-spec parser, `renderLongformVideo`, `renderLongformScenePreview`, Remotion renderer and FFmpeg. It renders synthetic source video/audio and approved checklist, house-cutaway and token-attention scenes. AI/planner calls and lazy builds are guarded against. Bundle snapshots are immutable; freshness checks distinguish formatting-only differences and explicitly exclude unexercised Detroit scenes from the proof claim.

Commands:

```bash
# Fast saved-plan reconstruction, including all 924 seconds of the long fixture
node scripts/explainer-stills/verify-longform-scenes.mjs --unit --long-stress

# Actual 168-second quick stress or 924-second full-duration stress
node scripts/explainer-stills/verify-longform-scenes.mjs --bundle <approved-snapshot> --stress
node scripts/explainer-stills/verify-longform-scenes.mjs --bundle <approved-snapshot> --long-stress
```

Completed 168-second proof: `%TEMP%/longform-scene-proof-Gn5iTp/`.

- Output: 1920×1080, 30fps, 5,040 frames. All three presentations, speaker gaps, and omitted-scene fallback are covered.
- Actual export: 545.6 seconds. Actual nine-second preview: 51.6 seconds.
- Frame samples compare speaker intervals, active scenes, and preview/export output; the contact sheet was inspected.
- Continuous stereo synthetic tone identities/timing are checked at four-second intervals. This is not a speech-intelligibility or lip-sync listening evaluation.
- No AI calls, planner calls or bundle builds occurred during export/preview.

The first 924-second production attempt (`%TEMP%/longform-924-proof-2fa71764/`) was interrupted at approximately 30% without a final report. Both its launcher and root process disappeared; no application failure or matching Windows crash event was found. The exact interruption source was not established, and this run is **not** counted as passed. No remaining process was found in its observed root ancestry.

The direct parent-owned retry **passed**: `%TEMP%/longform-scene-proof-3gRaWj/report.json` and `runner-report.json`.

- Output: **924 seconds (15:24), 1920×1080 at 30fps, 27,720 frames**. All 66 eligible scenes rendered; all 22 intentionally omitted scenes stayed omitted. Legacy phrase/block/card counts are zero.
- Actual production export: 2,907.8 seconds (48.46 minutes). Nine-second preview: 54.2 seconds. Entire proof, including synthetic source creation and assertions: 52.5 minutes.
- This fixture deliberately uses software video encoding; ANGLE remains enabled for 3D rendering. These timings are not a production hardware-encoder benchmark.
- Audio timing/tone identity, source/plan immutability, source speaker samples, every repeated scene/layout and preview/export equivalence passed. The final contact sheet was inspected.
- Node coordinator peak: approximately 208 MiB. The separate Windows sampler recorded 1,414 samples: approximately 1.54 GiB peak summed working set and 763 MiB median after the first 15 samples. These are upper estimates, not exact application-only values: shared pages are counted per process and a pre-existing Windows notification process was misattributed through a reused parent PID.
- The only remaining flagged PID was confirmed as `MusNotifyIcon.exe`, created at 12:20 UTC—over eight hours before the proof. It was left untouched. No confirmed owned process remained. `long-process-qualification.json` records this correction without rewriting the raw sample; the local sampler now checks parent/child creation order and passed a real-process smoke check.
- Retained artifact tree: approximately 2.82 GiB logical bytes, including synthetic source, export, preview, bundle and reports. Generated artifacts remain outside git.

### Final bounded scene-sound evidence

The final sound pass reuses the completed 924-second export without re-encoding its video. The harness reads `export/source_longform.mp4` and `transcript.json`; the earlier wrong-filename attempt stopped before media processing and is not counted as a pass. Fresh integration-proof resource trees now include the packaged SFX assets without changing the approved Remotion snapshot.

```bash
node scripts/explainer-stills/verify-longform-sfx.mjs 'C:/Users/Groot/AppData/Local/Temp/longform-scene-proof-3gRaWj'
node scripts/explainer-stills/verify-longform-scenes.mjs --bundle 'C:/Users/Groot/AppData/Local/Temp/longform-scene-proof-3gRaWj/resources/remotion'
```

- **RUNTIME — long-duration sound:** `%TEMP%/longform-sfx-proof-47g98F/report.json` and the final direct Vitest refresh `%TEMP%/longform-sfx-direct-proof-k0gGIN/report.json`, both **passed**. Output in each directory: `longform-with-sound.mp4`. The 66 eligible scenes supply 176 saved cues; all 155 placements surviving the existing spacing/rate guardrails were mixed. The original export retained its file digest.
- **RUNTIME — video/audio integrity:** all 27,720 encoded video packets retain the same payload hash (`87756907a28934d447061037540da74f`). Video remains 1920×1080 at 30fps. Audio is exactly 924 seconds, stereo AAC at 48 kHz, and the entire audio track decoded successfully with FFmpeg `-xerror`. Across 67 sampled source-time windows, including 923.5 seconds, the minimum per-channel correlation is 0.999999968 and the RMS ratio range is 0.999989820–1.000000058. These are synthetic-tone measurements, not a listening test.
- **RUNTIME — sound-bed seams:** actual cues at 4.9, 5.1 and 9.95 seconds cross five-second window boundaries. Waveform error against the legacy reference is 1.49% normalized RMS after accounting for its known 239-sample limiter delay; the new path compensates that delay. The acceptance limit is 2.5%.
- **RUNTIME — SFX cancellation:** cancellation followed an actual FFmpeg start. The process left the active-command set, and the partial output and owned bed directory were removed. Final AAC-pass cancellation/failure is additionally covered by focused unit tests; this native SFX case cancels during bed generation.
- **RUNTIME — complete production routes after the final correction:** `%TEMP%/longform-scene-proof-bdXgA6/report.json` and `sound-proof.json`, status **passed**. Real 42-second export mixed eight source-time cues; the real nine-second house preview mixed two cues rebased to 2.0667 and 5.2667 seconds. Both use the actual packaged-resource lookup and native mixer, not a mocked mixer result. Export took 146.5 seconds; preview took 54.3 seconds using the proof's software-encoding configuration. Reconciliation, source audio, frame comparisons and preview/export visual equivalence passed; the contact sheet was inspected.
- **CODE + tests — failure policy:** bounded mixes now reject missing planned assets rather than accepting an incomplete/no-SFX result. Export and preview publish only after successful mixing; the legacy skip-and-warn behavior is retained. Unit coverage also checks disabled/omitted/failed scenes, source-time placement, single preview rebasing and owned cancellation cleanup.

The long-duration evidence is the final native mixer applied to the earlier full production export, plus a fresh shorter end-to-end export/preview; it is not a second full 924-second Remotion render. No new whole-process memory benchmark or perceptual speech/SFX review is claimed.

### Real cancellation and pre-composition alpha

Final corrected proof: `%TEMP%/longform-scene-proof-PaaGk3/report.json`, status **passed**, seven real media cases. This rerun fixes a report-only shared-array problem in an earlier artifact; production code did not change.

- 2D export, 3D export and 3D preview were cancelled after two actual rendered frames.
- Finalization was cancelled during actual continuous-source-narration progress (fraction 0.905), not merely before launching work.
- Owned partial overlays/request directories were removed. Existing exports, the source and unrelated siblings retained their original bytes.
- Pre-composition output is ProRes with `yuva444p12le`. One real mid-scene frame per presentation verifies fully transparent speaker regions where required and opaque explanation regions; full-frame output has no speaker hole.
- The final rerun's Windows process sample observed 14 processes at peak, approximately 1.22 GiB summed working set and no remaining observed owned process IDs. The sum may double-count shared pages; GPU memory was not measured.
- Publication/link-race coverage is real-file unit coverage, not a claim that the media harness forces a filesystem publication race.

Reproduce the small proof with `LONGFORM_CANCEL_FIXTURE` pointing at the existing 42-second fixture directory and `verify-longform-scenes.mjs --cancel-alpha --bundle <approved-snapshot>`. Final process sample: `.ezcoder/tmp/longform-final-20261001/cancel-process-sample.json`.

## Review UI evidence

Proof-only browser harness: `.ezcoder/ui-scene-proof-20261001-bee/`. It mounts the real review screen, store and styles with mocked native IPC. Captured MP4 playback uses actual output from the media proof, not a placeholder animation.

The broader sweep passed 88 assertions covering desktop/minimum window, themes, focus return, full excerpts and reduced motion. Visual inspection additionally caught clipped content/footer at 450×320 logical pixels and a harness-only mismatch between the selected checklist and the house MP4; those original captures are not the final proof.

The corrected `run-short-height.mjs` proof passed **37/37 assertions** at 450×320 and 900×640, light/dark. All five footer actions are reachable and hit-testable inside the review screen, source excerpts remain readable, and the actual house MP4 is bound exclusively to the house scene. All 12 final captures were inspected by the UI agent; the parent additionally inspected the short-height light footer/house preview and the minimum-window dark scene view. Artifacts: `.ezcoder/ui-scene-proof-20261001-bee/short-height/`.

The production fallback only changes scroll flow at 500px logical height and below. It does not hide actions or alter taller desktop/approval behavior. The older broad browser runner was not revalidated against the corrected house-only media fixture; use the focused final runner for preview association evidence.

## Limits

- Evidence is from Windows x64, Node 22.18.0, installed Remotion 4.0.496 and ANGLE. It is not a macOS, packaged-app, other-GPU or cross-GPU byte-equality guarantee.
- Browser proof does not replace native Electron IPC integration. 200% evidence uses equivalent CSS viewport/device scale, not an OS text-scaling assertion.
- Synthetic audio timing is not perceptual speech review. Repeated fixture stress is not proof that every catalog scene or arbitrary transcript produces a good editorial plan.
- No live Gemini planning was purchased or run. Planner orchestration/source grounding are exercised with bounded fixtures and mocked provider boundaries.
- Working-set samples are local observations, not a performance SLO; other local verification tasks may run concurrently. GPU memory and draw calls are not instrumented.
- Full repository verification is not claimed green solely because of the two unchanged Windows brand-pack path expectations above. The final renderer suite, typechecks, build and Biome passed; unrelated files were not changed to hide the remaining failures.
