/**
 * Explainer scenes on the 16:9 long-form path.
 *
 * Long-form already has full-frame content blocks, phrase overlays and pop-up
 * cards. Explainer scenes add a premium layer ON TOP of the speaker only:
 *
 *  - `over`     — the speaker stays full frame and a floating glass card with
 *                 the animated diagram sits in the free right side (default);
 *  - `takeover` — the animation fills the frame for a short moment (≤ 3.5 s).
 *
 * Both render as transparent ProRes 4444 at 1920×1080 (takeover's backdrop is
 * opaque, so it simply covers the speaker) and composite in one post-concat
 * pass via `compositePhraseOverlays`. Other layouts are mapped to these two —
 * a split screen on 16:9 reads cheap.
 *
 * Planning is restricted to speaker ranges so a scene never lands on top of a
 * content block. Everything is fail-soft: any failure returns the input.
 */

import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type PlannedExplainerScene, planExplainerScenes } from '../ai/explainer-scenes';
import type { QualityParams } from '../ffmpeg';
import { log } from '../logger';
import type {
  ExplainerLayout,
  ExplainerPalette,
  SceneCue,
} from '../remotion/compositions/explainer/types';
import { buildGroupRenderPlan, groupPlannedScenes, type SceneGroup } from './explainer-scenes';
import { compositePhraseOverlays, type PhraseOverlayInput } from './longform-encode';

export interface LongformExplainerOptions {
  apiKey: string;
  inputPath: string;
  outputPath: string;
  words: { text: string; start: number; end: number }[];
  /** Speaker-only ranges (absolute == concat time on long-form). */
  speakerRanges: { start: number; end: number }[];
  palette: ExplainerPalette;
  emphasisTimes?: readonly number[];
  fps: number;
  qualityParams: QualityParams;
  isCancelled?: () => boolean;
  onProgress?: (message: string, fraction: number) => void;
}

export interface LongformExplainerResult {
  /** `outputPath` when anything composited, else `inputPath`. */
  outputPath: string;
  tempFiles: string[];
  cues: SceneCue[];
  rendered: number;
}

/** Long-form only supports floating cards and short takeovers. Pure. */
export function longformLayout(layout: ExplainerLayout): 'over' | 'takeover' {
  return layout === 'takeover' ? 'takeover' : 'over';
}

/** Keep only groups that sit fully inside one speaker range. Pure. */
export function fitGroupsToSpeakerRanges(
  groups: readonly SceneGroup[],
  ranges: readonly { start: number; end: number }[],
): SceneGroup[] {
  return groups
    .filter((g) => ranges.some((r) => g.startTime >= r.start - 0.01 && g.endTime <= r.end + 0.01))
    .map((g) => ({ ...g, layout: longformLayout(g.layout) }));
}

/** Plan per speaker range so a scene never straddles a content block. */
async function planInRanges(opts: LongformExplainerOptions): Promise<PlannedExplainerScene[]> {
  // Merge the plan over the whole video (one Gemini call), then filter.
  const first = opts.speakerRanges[0];
  const last = opts.speakerRanges[opts.speakerRanges.length - 1];
  if (!first || !last) return [];
  const result = await planExplainerScenes(
    opts.apiKey,
    opts.words,
    { minStart: first.start + 2, maxEnd: last.end },
    {
      aspect: '16:9',
      ...(opts.emphasisTimes ? { emphasisTimes: opts.emphasisTimes } : {}),
    },
  );
  if (!result.ok) {
    log('warn', 'explainer', `long-form planning failed: ${result.error}`);
    return [];
  }
  return result.value;
}

export async function applyLongformExplainerScenes(
  opts: LongformExplainerOptions,
): Promise<LongformExplainerResult> {
  const unchanged: LongformExplainerResult = {
    outputPath: opts.inputPath,
    tempFiles: [],
    cues: [],
    rendered: 0,
  };
  if (opts.words.length < 8 || opts.speakerRanges.length === 0) return unchanged;

  opts.onProgress?.('Planning animated scenes…', 0);
  const planned = await planInRanges(opts);
  const groups = fitGroupsToSpeakerRanges(groupPlannedScenes(planned), opts.speakerRanges);
  if (groups.length === 0) return unchanged;

  const { renderRemotionSegment } = await import('../remotion/render');
  const tempFiles: string[] = [];
  const overlays: PhraseOverlayInput[] = [];
  const cues: SceneCue[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    if (opts.isCancelled?.()) break;
    const plan = buildGroupRenderPlan(
      group,
      { startTime: group.startTime, endTime: group.endTime },
      opts.palette,
      '16:9',
    );
    const out = join(tmpdir(), `batchcontent-lf-explainer-${Date.now()}-${i}.mov`);
    const started = Date.now();
    opts.onProgress?.(`Animating scene ${i + 1}/${groups.length}…`, i / groups.length);
    try {
      await renderRemotionSegment({
        compositionId: 'ExplainerSequence',
        inputProps: plan.props as unknown as Record<string, unknown>,
        durationSec: group.endTime - group.startTime,
        fps: opts.fps,
        width: 1920,
        height: 1080,
        transparent: true,
        outputPath: out,
      });
      tempFiles.push(out);
      overlays.push({ overlayPath: out, startTime: group.startTime, endTime: group.endTime });
      cues.push(...plan.cues);
      log(
        'info',
        'explainer',
        `long-form ${group.layout} group (${group.scenes.map((s) => s.scene.kind).join('→')}) ` +
          `rendered in ${Date.now() - started}ms`,
      );
    } catch (err) {
      try {
        unlinkSync(out);
      } catch {
        /* partial file may not exist */
      }
      log(
        'warn',
        'explainer',
        `long-form scene render failed, skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (overlays.length === 0) return { ...unchanged, tempFiles };
  try {
    await compositePhraseOverlays({
      inputPath: opts.inputPath,
      outputPath: opts.outputPath,
      overlays,
      qualityParams: opts.qualityParams,
    });
  } catch (err) {
    log(
      'warn',
      'explainer',
      `long-form explainer composite failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ...unchanged, tempFiles };
  }
  return { outputPath: opts.outputPath, tempFiles, cues, rendered: overlays.length };
}
