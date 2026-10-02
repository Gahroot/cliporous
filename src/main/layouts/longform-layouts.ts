/**
 * Long-form (16:9) layout filter builder.
 *
 * Keyed on `LongformArchetype` — kept separate from `segment-layouts.ts`
 * (which is keyed on the 9:16 `Archetype` union) so the short-form layout
 * system is untouched. The only archetype is `speaker`: a face-centered 16:9
 * crop that delegates to the proven `buildArchetypeLayout('talking-head', …)`
 * builder with landscape target dimensions; its aspect-correct sub-crop
 * handles 16:9 framing without distortion. Content blocks are Remotion renders
 * muxed in by the long-form pipeline, not FFmpeg layouts.
 *
 * Produces a `[outv]` label with SAR 1:1 + yuv420p, ready to encode.
 */

import { containLongformSource, getLongformLayout } from '@shared/longform-layout';
import type { LongformPresentation } from '@shared/longform-scenes';
import type { LongformArchetype } from '@shared/types';
import { LANDSCAPE_FPS, LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from '../aspect-ratios';
import {
  buildArchetypeLayout,
  type SegmentLayoutParams,
  type SegmentLayoutResult,
} from './segment-layouts';

/**
 * Resolve a long-form archetype into an FFmpeg layout for a single segment.
 */
export function buildLongformLayout(
  _archetype: LongformArchetype,
  params: SegmentLayoutParams,
): SegmentLayoutResult {
  // Reuse the tested talking-head crop+scale with landscape dimensions.
  return buildArchetypeLayout('talking-head', params);
}

export interface LongformSceneLayoutOptions {
  sourceWidth: number;
  sourceHeight: number;
  frameCount: number;
  background: string;
  /** Omitted for speaker gaps/fallbacks. Scene input 1 is a full-canvas alpha render. */
  presentation?: LongformPresentation;
  /** Internal only: validated full-frame storyboard alpha fades over contained source footage. */
  sourceUnderlay?: boolean;
}

/** Scene-first only: the shared geometry owns every pane; source is contained, never cropped. */
export function buildLongformSceneLayout(opts: LongformSceneLayoutOptions): string {
  const { frameCount, sourceWidth, sourceHeight, presentation } = opts;
  if (!Number.isInteger(frameCount) || frameCount < 1)
    throw new Error('Invalid scene frame count.');
  if (!/^#[0-9a-f]{6}$/i.test(opts.background)) throw new Error('Invalid scene background.');
  const fps = LANDSCAPE_FPS;
  const canvas = { x: 0, y: 0, width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT };
  if (opts.sourceUnderlay && presentation !== 'full-frame')
    throw new Error('Storyboard source underlay requires full-frame presentation.');
  const speaker = opts.sourceUnderlay
    ? canvas
    : presentation
      ? getLongformLayout(presentation).speaker
      : canvas;
  const normalize = `setpts=PTS-STARTPTS,fps=${fps},tpad=stop_mode=clone:stop=${frameCount},trim=end_frame=${frameCount},setpts=N/${fps}/TB,setsar=1`;
  const filters = [
    `color=c=${opts.background}:s=${canvas.width}x${canvas.height}:r=${fps},trim=end_frame=${frameCount},setpts=N/${fps}/TB[base]`,
  ];
  let base = 'base';
  if (presentation && !opts.sourceUnderlay) {
    filters.push(`[1:v]${normalize}[scene]`);
    filters.push('[base][scene]overlay=x=0:y=0:shortest=1:eof_action=repeat[explained]');
    base = 'explained';
  }
  if (speaker) {
    const rect = containLongformSource(sourceWidth, sourceHeight, speaker);
    filters.push(
      `[0:v]${normalize},scale=${rect.width}:${rect.height}:flags=lanczos+accurate_rnd[speaker]`,
    );
    filters.push(
      `[${base}][speaker]overlay=x=${rect.x}:y=${rect.y}:shortest=1:eof_action=repeat[placed]`,
    );
    base = 'placed';
  }
  if (opts.sourceUnderlay) {
    filters.push(`[1:v]${normalize}[scene]`);
    filters.push(`[${base}][scene]overlay=x=0:y=0:shortest=1:eof_action=repeat[board]`);
    base = 'board';
  }
  filters.push(`[${base}]format=yuv420p[outv]`);
  return filters.join(';');
}
