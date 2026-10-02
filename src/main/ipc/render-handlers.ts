import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Ch } from '@shared/ipc-channels';
import { findLongformPalette, validLongformPalettes } from '@shared/longform-palette';
import { app, BrowserWindow, ipcMain } from 'electron';
import { validateSceneFirstLongformPlan } from '../ai/longform-scene-contract';
import { generateBRollImage } from '../broll-image-gen';
import { imageToVideoClip } from '../broll-image-overlay';
import { extractBRollKeywords } from '../broll-keywords';
import { type BRollVideoResult, fetchBRollClips } from '../broll-pexels';
import type { BRollSettings as BRollSettingsConfig } from '../broll-placement';
import { buildBRollPlacements } from '../broll-placement';
import { generateRenderManifest, writeManifestFiles } from '../export-manifest';
import { wrapHandler } from '../ipc-error-handler';
import { log } from '../logger';
import { createPlannerUsageStore } from '../planner-usage-store';
import { loadBrandPack, mergeRuntimeBrandPack } from '../promo/brand-pack-loader';
import { preparePromoJob } from '../promo/promo-render';
import { resolveOutputDirectory } from '../render/output-dir';
import type { BatchDoneInfo, BatchDoneResult } from '../render/pipeline';
import {
  beginRenderBatch,
  cancelQueuedRenderJob,
  cancelRender,
  isRenderCancellationRequested,
  startBatchRender,
  stopRenderAfterCurrent,
} from '../render/pipeline';
import type { PreviewRenderConfig } from '../render/preview';
import {
  buildPresetLookup,
  resolveShotStyles,
  type StylePresetForResolution,
} from '../render/shot-style-resolver';
import type { RenderBatchOptions } from '../render/types';

export function registerRenderHandlers(): void {
  const plannerUsage = createPlannerUsageStore(app.getPath('userData'), {
    warn: (reason) => log('warn', 'planner-history', reason),
  });
  let activeController: AbortController | undefined;
  // Render — start a batch render of approved clips
  ipcMain.handle(
    Ch.Invoke.RENDER_START_BATCH,
    wrapHandler(Ch.Invoke.RENDER_START_BATCH, async (event, options: RenderBatchOptions) => {
      if (activeController) throw new Error('A render batch is already running');
      beginRenderBatch();
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('No BrowserWindow found for render request');
      const controller = new AbortController();
      activeController = controller;
      let handedOff = false;
      try {
        if (options.outputProfile === 'longform') {
          if (
            !Array.isArray(options.jobs) ||
            options.jobs.length === 0 ||
            options.jobs.length > 200
          )
            throw new Error('Invalid long-form render jobs.');
          for (const job of options.jobs) {
            const plan = options.longformEditPlan;
            if (
              plan &&
              (plan.mode === 'scene-first' ||
                (plan.schemaVersion !== undefined && plan.schemaVersion !== 1) ||
                'scenes' in plan)
            ) {
              if (
                options.jobs.length !== 1 ||
                job.startTime !== 0 ||
                !Number.isFinite(job.endTime) ||
                job.endTime <= 0
              )
                throw new Error(
                  'Scene-first export requires one approved, complete source timeline.',
                );
              if (
                typeof job.sourceVideoPath !== 'string' ||
                job.sourceVideoPath.length > 4_096 ||
                job.sourceVideoPath.includes('\0') ||
                !isAbsolute(job.sourceVideoPath)
              )
                throw new Error(
                  'Scene-first export requires a native source video file, not a URL.',
                );
              if (
                (options.customPalettes !== undefined &&
                  !validLongformPalettes(options.customPalettes)) ||
                !findLongformPalette(options.longformPaletteId, options.customPalettes)
              )
                throw new Error('The approved long-form palette is unavailable or invalid.');
              const validation = validateSceneFirstLongformPlan(
                plan,
                job.wordTimestamps ?? [],
                job.endTime,
              );
              if (!validation.ok) throw new Error(validation.error);
              if (!(await stat(job.sourceVideoPath)).isFile())
                throw new Error('The approved source video is unavailable.');
            }
          }
        }
        if (controller.signal.aborted) {
          win.webContents.send(Ch.Send.RENDER_CANCELLED, {
            completed: 0,
            failed: 0,
            total: options.jobs.length,
          });
          return { started: false };
        }
        // Zero-config floor: fall back to <OS Videos>/BatchClip when the renderer
        // sends no output directory, so a brand-new user can render without ever
        // opening Settings. Every downstream consumer (pipeline writes, manifest)
        // reads `options.outputDirectory`, so resolving it here keeps them aligned.
        options.outputDirectory = resolveOutputDirectory(options.outputDirectory);

        // ── Phase 1a: Promo Mode evidence injection ─────────────────────────────
        // Talking-head "evidence pop-up" mode. When enabled, inject Media Master /
        // Skool evidence pops (animated templates + real captures) triggered by
        // natural language in each clip's transcript, plus a forced Skool CTA on
        // every clip's end. Vertical-only; takes precedence over stock B-Roll.
        const promoEnabled = options.outputProfile !== 'longform' && !!options.promo?.enabled;
        if (promoEnabled) {
          const pack = mergeRuntimeBrandPack(
            loadBrandPack(),
            options.promo?.brandAssets ?? [],
            options.promo?.ctaAssetId,
          );
          for (const job of options.jobs) {
            if (
              options.hyperframesEnabled === false ||
              job.clipOverrides?.enableHyperframes === false
            ) {
              continue;
            }
            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Placing evidence pop-ups…',
              percent: 10,
            });
            try {
              const summary = await preparePromoJob(job, pack, {
                ...(options.promo?.accentColor ? { accentColor: options.promo.accentColor } : {}),
                ...(options.promo?.forceCta !== undefined
                  ? { forceCta: options.promo.forceCta }
                  : {}),
              });
              console.log(
                `[Promo] Clip ${job.clipId}: ${summary.overlays} template overlay(s), ${summary.captures} capture(s)`,
              );
              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: `Evidence ready (${summary.overlays + summary.captures} pop-up${summary.overlays + summary.captures !== 1 ? 's' : ''})`,
                percent: 90,
              });
            } catch (promoErr) {
              const msg = promoErr instanceof Error ? promoErr.message : String(promoErr);
              console.warn(`[Promo] Clip ${job.clipId}: evidence prep failed — ${msg}`);
              // Fail-safe: fall through to a clean talking-head render.
            }
          }
        }

        // ── Phase 1: B-Roll placement generation ────────────────────────────────
        // When B-Roll is enabled, generate placements for each clip. Long-form
        // (Hormozi 16:9) never uses stock B-Roll — its illustration is the
        // concept cards / phrase overlays — so skip placement generation there.
        // Promo Mode owns the overlay layer when active, so skip B-Roll then.
        if (
          !promoEnabled &&
          options.outputProfile !== 'longform' &&
          options.broll?.enabled &&
          (options.broll.pexelsApiKey || options.broll.sourceMode === 'ai-generated')
        ) {
          for (const job of options.jobs) {
            if (job.clipOverrides?.enableBroll === false) continue;
            // Skip clips that already have pre-computed placements
            if (job.brollPlacements && job.brollPlacements.length > 0) continue;

            win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
              clipId: job.clipId,
              message: 'Generating B-Roll placements…',
              percent: 5,
            });

            const clipDuration = job.endTime - job.startTime;
            const clipWords = (job.wordTimestamps ?? []).filter(
              (w) => w.start >= job.startTime && w.end <= job.endTime,
            );

            try {
              const sourceMode = options.broll.sourceMode ?? 'auto';
              const geminiApiKey = options.geminiApiKey ?? '';
              const styleCategory = options.styleCategory ?? 'custom';

              // Extract keywords via Gemini (requires transcript text)
              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: 'Extracting B-Roll keywords…',
                percent: 10,
              });
              const localWords = clipWords.map((w) => ({
                text: w.text,
                start: w.start - job.startTime,
                end: w.end - job.startTime,
              }));
              const transcriptText = clipWords.map((w) => w.text).join(' ');
              const keywords = await extractBRollKeywords(
                transcriptText,
                localWords,
                0,
                clipDuration,
                options.broll.pexelsApiKey || geminiApiKey,
              );

              if (keywords.length === 0) {
                console.log(`[B-Roll] Clip ${job.clipId}: no keywords — skipping`);
                continue;
              }

              // ── Route each keyword to stock (Pexels) or AI-generated image ──────
              const uniqueKeywords = Array.from(new Set(keywords.map((k) => k.keyword)));
              const downloadedClips = new Map<string, BRollVideoResult>();

              // Partition keywords into stock vs AI-generated based on sourceMode.
              // 'auto' defaults to stock when no per-keyword suggestion is available.
              const stockKeywords: string[] = [];
              const aiKeywords: string[] = [];

              for (const kw of uniqueKeywords) {
                if (sourceMode === 'ai-generated') {
                  aiKeywords.push(kw);
                } else {
                  stockKeywords.push(kw);
                }
              }

              // Fetch Pexels stock footage for stock keywords
              if (stockKeywords.length > 0 && options.broll.pexelsApiKey) {
                win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                  clipId: job.clipId,
                  message: `Downloading stock footage for ${stockKeywords.length} keyword(s)…`,
                  percent: 20,
                });
                const pexelsClips = await fetchBRollClips(
                  stockKeywords,
                  options.broll.pexelsApiKey,
                  options.broll.clipDuration,
                );
                pexelsClips.forEach((clip, kw) => {
                  downloadedClips.set(kw, clip);
                });
              }

              // Generate AI images for ai-generated keywords, convert to video clips
              if (aiKeywords.length > 0 && geminiApiKey) {
                const fullTranscriptText = clipWords.map((w) => w.text).join(' ');

                win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                  clipId: job.clipId,
                  message: `Generating ${aiKeywords.length} AI image(s)…`,
                  percent: 30,
                });

                for (let ki = 0; ki < aiKeywords.length; ki++) {
                  const kw = aiKeywords[ki];
                  try {
                    // Get a few words of transcript context around the keyword's timestamp
                    const kwEntry = keywords.find((k) => k.keyword === kw);
                    const contextWords = fullTranscriptText
                      .split(/\s+/)
                      .slice(
                        Math.max(0, Math.floor((kwEntry?.timestamp ?? 0) * 3) - 10),
                        Math.floor((kwEntry?.timestamp ?? 0) * 3) + 20,
                      )
                      .join(' ');

                    const imageResult = await generateBRollImage(
                      kw,
                      contextWords,
                      styleCategory,
                      geminiApiKey,
                    );
                    if (imageResult) {
                      const videoPath = await imageToVideoClip(
                        imageResult.filePath,
                        options.broll.clipDuration,
                      );
                      downloadedClips.set(kw, {
                        filePath: videoPath,
                        duration: options.broll.clipDuration,
                        keyword: kw,
                        pexelsId: 0, // Not from Pexels — AI-generated
                      });
                      console.log(`[B-Roll] AI image generated for "${kw}"`);
                      win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                        clipId: job.clipId,
                        message: `Generated B-Roll image: "${kw}"`,
                        percent: 30 + Math.round(((ki + 1) / aiKeywords.length) * 20),
                      });
                    }
                  } catch (aiErr) {
                    const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
                    console.warn(`[B-Roll] AI generation failed for "${kw}": ${aiMsg}`);
                  }
                }
              }

              if (downloadedClips.size === 0) {
                console.log(`[B-Roll] Clip ${job.clipId}: no clips downloaded — skipping`);
                continue;
              }

              // Build placements from keywords + downloaded footage
              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: 'Building B-Roll placements…',
                percent: 80,
              });

              const brollSettings: BRollSettingsConfig = {
                enabled: true,
                pexelsApiKey: options.broll.pexelsApiKey,
                intervalSeconds: options.broll.intervalSeconds,
                clipDuration: options.broll.clipDuration,
                displayMode: options.broll.displayMode,
                transition: options.broll.transition,
                pipSize: options.broll.pipSize,
                pipPosition: options.broll.pipPosition,
              };

              job.brollPlacements = buildBRollPlacements(
                clipDuration,
                keywords,
                downloadedClips,
                brollSettings,
              );

              console.log(
                `[B-Roll] Clip ${job.clipId}: generated ${job.brollPlacements.length} placement(s)`,
              );

              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: `B-Roll ready (${job.brollPlacements.length} placement${job.brollPlacements.length !== 1 ? 's' : ''})`,
                percent: 90,
              });
            } catch (brollErr) {
              const msg = brollErr instanceof Error ? brollErr.message : String(brollErr);
              console.warn(`[B-Roll] Clip ${job.clipId}: placement generation failed — ${msg}`);
              // Don't abort the whole batch — just skip B-Roll for this clip
            }
          }
        }

        // ── Phase 1.5: Resolve per-shot style assignments ───────────────────────
        // When clips have shotStyles (preset IDs) and shots (time ranges), resolve
        // them into concrete ShotStyleConfig objects that the render features consume.
        if (options.stylePresets && options.stylePresets.length > 0) {
          const presetLookup = buildPresetLookup(
            options.stylePresets as StylePresetForResolution[],
          );

          for (const job of options.jobs) {
            if (
              !job.shotStyles ||
              job.shotStyles.length === 0 ||
              !job.shots ||
              job.shots.length === 0
            ) {
              continue;
            }

            try {
              win.webContents.send(Ch.Send.RENDER_CLIP_PREPARE, {
                clipId: job.clipId,
                message: 'Resolving shot styles…',
                percent: 91,
              });

              job.shotStyleConfigs = resolveShotStyles(
                job.shotStyles,
                job.shots as import('@shared/types').ShotSegment[],
                presetLookup,
              );

              if (job.shotStyleConfigs.length > 0) {
                console.log(
                  `[ShotStyles] Clip ${job.clipId}: resolved ${job.shotStyleConfigs.length} per-shot style config(s)`,
                );
              }
            } catch (err) {
              console.warn(`[ShotStyles] Clip ${job.clipId}: resolution failed —`, err);
            }
          }
        }

        // Manifest writing is invoked here — at the IPC layer, on render:batchDone
        // — rather than from inside the render pipeline. The pipeline calls this
        // handler immediately before sending RENDER_BATCH_DONE to the renderer.
        const writeBatchManifest = async (info: BatchDoneInfo): Promise<BatchDoneResult> => {
          if (!info.options.sourceMeta) {
            // Without source metadata we can't populate the top-level `source`
            // block of the manifest — skip rather than emit a half-filled file.
            return {};
          }
          try {
            const manifest = generateRenderManifest({
              jobs: info.jobs,
              options: info.options,
              clipMeta: info.clipMeta,
              clipResults: info.clipResults,
              clipRenderTimes: info.clipRenderTimes,
              totalRenderTimeMs: info.totalRenderTimeMs,
              encoder: info.encoder,
              sourceName: info.options.sourceMeta.name,
              sourcePath: info.options.sourceMeta.path,
              sourceDuration: info.options.sourceMeta.duration,
            });
            const { jsonPath, csvPath } = writeManifestFiles(manifest, info.outputDirectory);
            console.log(`[Manifest] Written: ${jsonPath}, ${csvPath}`);
            return { manifestCsvPath: csvPath, manifestJsonPath: jsonPath };
          } catch (manifestErr) {
            console.warn('[Manifest] Failed to write manifest files:', manifestErr);
            return {};
          }
        };

        if (isRenderCancellationRequested()) {
          win.webContents.send(Ch.Send.RENDER_CANCELLED, {
            completed: 0,
            failed: 0,
            total: options.jobs.length,
          });
          return { started: false };
        }

        const runOwnedBatch = async (): Promise<void> => {
          try {
            await startBatchRender(options, win, writeBatchManifest, {
              plannerUsage,
              signal: controller.signal,
            });
          } catch {
            log('error', 'render-pipeline', 'Batch failed outside the per-clip boundary');
            try {
              event.sender.send(Ch.Send.RENDER_BATCH_DONE, {
                completed: 0,
                failed: options.jobs.length,
                total: options.jobs.length,
              });
            } catch {
              /* The requesting window may have closed. Ownership still ends below. */
            }
          } finally {
            if (activeController === controller) activeController = undefined;
          }
        };
        handedOff = true;
        void runOwnedBatch();
        return { started: true };
      } finally {
        if (!handedOff && activeController === controller) activeController = undefined;
      }
    }),
  );

  // Render — cancel the active batch immediately.
  ipcMain.handle(
    Ch.Invoke.RENDER_CANCEL,
    wrapHandler(Ch.Invoke.RENDER_CANCEL, () => {
      activeController?.abort();
      cancelRender();
    }),
  );

  // Render — keep completed outputs and stop claiming jobs after active encodes finish.
  ipcMain.handle(
    Ch.Invoke.RENDER_STOP_AFTER_CURRENT,
    wrapHandler(Ch.Invoke.RENDER_STOP_AFTER_CURRENT, () => {
      stopRenderAfterCurrent();
    }),
  );

  // Render — cancel one queue row that has not started encoding.
  ipcMain.handle(
    Ch.Invoke.RENDER_CANCEL_JOB,
    wrapHandler(Ch.Invoke.RENDER_CANCEL_JOB, (_event, clipId: string) => {
      cancelQueuedRenderJob(clipId);
    }),
  );

  // Render — fast low-quality preview
  ipcMain.handle(
    Ch.Invoke.RENDER_PREVIEW,
    wrapHandler(Ch.Invoke.RENDER_PREVIEW, async (_event, config: PreviewRenderConfig) => {
      const { renderPreview } = await import('../render/preview');
      const previewPath = await renderPreview(config);
      return { previewPath };
    }),
  );

  // Render — clean up a preview temp file
  ipcMain.handle(
    Ch.Invoke.RENDER_CLEANUP_PREVIEW,
    wrapHandler(Ch.Invoke.RENDER_CLEANUP_PREVIEW, async (_event, previewPath: string) => {
      const { cleanupPreviewFile } = await import('../render/preview');
      cleanupPreviewFile(previewPath);
    }),
  );
}
