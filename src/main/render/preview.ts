// ---------------------------------------------------------------------------
// Preview render — fast low-quality render at the locked 1080×1920 canvas
// ---------------------------------------------------------------------------
//
// Designed for the ClipPreview dialog's "Preview with Overlays" button.
// Renders in ~3–5 seconds instead of 20–30 seconds by using:
//   - Locked 1080×1920 @ 30fps output (matches the final render)
//   - Software encoder (libx264) with ultrafast preset and CRF 35
//   - All overlays applied (captions, hook title, auto-zoom)
//   - Sound design, B-roll, and filler removal are skipped
// ---------------------------------------------------------------------------

import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EmphasizedWord, VideoSegment } from '@shared/types';
import { OUTPUT_FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH } from '../aspect-ratios';
import { generateZoomFilter } from '../auto-zoom';
import { DEFAULT_EDIT_STYLE_ID, getEditStyleById } from './../edit-styles/index';
import { ARCHETYPE_DEFAULT_TRANSITION_IN } from './../edit-styles/shared/archetypes';
import { getVideoMetadata } from '../ffmpeg';
import { buildVideoFilter, renderClip } from './base-render';
import { createCaptionsFeature } from './features/captions.feature';
import type {
  FilterContext,
  OverlayContext,
  OverlayPassResult,
  RenderFeature,
} from './features/feature';
import { createHookTitleFeature } from './features/hook-title.feature';
import { createRehookFeature } from './features/rehook.feature';
import { wordEmphasisFeature } from './features/word-emphasis.feature';
import {
  type ResolvedSegment,
  renderSegmentedClip,
  type SegmentRenderConfig,
} from './segment-render';
import type {
  CaptionStyleInput,
  HookTitleConfig,
  RehookConfig,
  RenderBatchOptions,
  RenderClipJob,
  ZoomSettings,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Preview output resolution — locked to the same 1080×1920 @ 30fps as final renders. */
const PREVIEW_WIDTH = OUTPUT_WIDTH;
const PREVIEW_HEIGHT = OUTPUT_HEIGHT;
const PREVIEW_FPS = OUTPUT_FPS;

/**
 * Derive a lighter tint from a hex color for the supersize word color.
 * Blends the input color toward white by the given amount.
 * (Mirrored from accent-color.feature.ts to avoid import coupling.)
 */
function lightenColor(hex: string, amount = 0.4): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PreviewRenderConfig {
  sourceVideoPath: string;
  startTime: number;
  endTime: number;
  cropRegion?: { x: number; y: number; width: number; height: number };
  cropTimeline?: Array<{
    startTime: number;
    endTime: number;
    x: number;
    y: number;
    width: number;
    height: number;
    faceDetected: boolean;
  }>;
  wordTimestamps?: { text: string; start: number; end: number }[];
  hookTitleText?: string;
  /** Creator-approved text for the registered mid-clip re-hook feature. */
  rehookText?: string;
  /** Whether to burn in captions (requires wordTimestamps + captionStyle). */
  captionsEnabled?: boolean;
  captionStyle?: CaptionStyleInput;
  /** Percentage centers interpreted identically by preview and final export. */
  templateLayout?: {
    titleText: { x: number; y: number };
    subtitles: { x: number; y: number };
  };
  /** Hook title overlay config, applied when enabled and hookTitleText is set. */
  hookTitleOverlay?: HookTitleConfig;
  /** Mid-clip re-hook config. */
  rehookOverlay?: RehookConfig;
  /** Whether word emphasis contributes caption and reactive-zoom keyframes. */
  wordEmphasisEnabled?: boolean;
  /** Whether segmented previews use their configured transitions. */
  shotTransitionsEnabled?: boolean;
  /** Auto-zoom (Ken Burns) — applied when enabled=true */
  autoZoom?: ZoomSettings;
  /**
   * Per-clip accent color (CSS hex, e.g. '#FF6B35').
   * When set, overrides highlight/emphasis/supersize colors in captions,
   * hook title text color, rehook text color, and progress bar color.
   */
  accentColor?: string;
  /**
   * Per-segment render plan. When present and non-empty, the preview renders
   * each segment with its own archetype layout/zoom/caption treatment via
   * renderSegmentedClip(), matching the batch render's segmented path.
   * When absent, the preview falls back to the single-clip path.
   */
  segments?: VideoSegment[];
  /**
   * Active edit style id — used to resolve per-segment templates. Only
   * consumed when `segments` is non-empty. Falls back to DEFAULT_EDIT_STYLE_ID.
   */
  stylePresetId?: string;
  /**
   * Optional pre-computed word emphasis passed through to segmented preview.
   */
  wordEmphasis?: EmphasizedWord[];
}

// ---------------------------------------------------------------------------
// Segmented preview render
// ---------------------------------------------------------------------------

/**
 * Render a preview using the per-segment archetype pipeline at the same locked
 * 1080×1920 canvas as final export.
 */
async function renderSegmentedPreview(
  config: PreviewRenderConfig,
  outputPath: string,
): Promise<string> {
  const meta = await getVideoMetadata(config.sourceVideoPath);

  const editStyleId = config.stylePresetId ?? DEFAULT_EDIT_STYLE_ID;
  const editStyle = getEditStyleById(editStyleId) ?? getEditStyleById(DEFAULT_EDIT_STYLE_ID)!;

  const rawSegments = config.segments ?? [];
  const resolvedSegments: ResolvedSegment[] = rawSegments.map((raw) => {
    return {
      startTime: raw.startTime,
      endTime: raw.endTime,
      archetype: raw.archetype,
      zoom: {
        style: 'none',
        intensity: 1.0,
      },
      transitionIn:
        config.shotTransitionsEnabled === false
          ? 'hard-cut'
          : (ARCHETYPE_DEFAULT_TRANSITION_IN[raw.archetype] ?? editStyle.defaultTransition),
      imagePath: raw.imagePath,
    };
  });

  const segConfig: SegmentRenderConfig = {
    sourceVideoPath: config.sourceVideoPath,
    segments: resolvedSegments,
    editStyle,
    transitionsEnabled: config.shotTransitionsEnabled !== false,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    fps: PREVIEW_FPS,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    wordTimestamps: config.wordTimestamps,
    wordEmphasis: config.wordEmphasisEnabled === false ? undefined : config.wordEmphasis,
    captionStyle: config.captionStyle,
    captionsEnabled: config.captionsEnabled ?? true,
    templateLayout: config.templateLayout
      ? {
          ...config.templateLayout,
          rehookText: config.templateLayout.titleText,
        }
      : undefined,
    hookTitleText: config.hookTitleText,
    hookTitleConfig: config.hookTitleOverlay,
    rehookText: config.rehookText,
    rehookConfig: config.rehookOverlay,
    rehookAppearTime: config.hookTitleOverlay?.displayDuration ?? 2.5,
  };

  await renderSegmentedClip(segConfig, outputPath, () => {
    // Preview has no progress reporting — swallow updates.
  });

  return outputPath;
}

// ---------------------------------------------------------------------------
// Preview render function
// ---------------------------------------------------------------------------

/**
 * Render a single clip at the locked 1080×1920 @ 30fps with ultrafast/CRF-35 encoding.
 * Applies captions, hook title, and auto-zoom.
 * Skips sound design, B-roll, and filler removal.
 *
 * @returns Absolute path to the rendered temp file (caller must delete it).
 */
export async function renderPreview(config: PreviewRenderConfig): Promise<string> {
  const clipId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const outputPath = join(tmpdir(), `batchcontent-preview-${Date.now()}.mp4`);

  // ── Segmented preview shortcut ──────────────────────────────────────────
  // When the clip has per-segment styling, render each segment with its
  // own archetype layout via renderSegmentedClip(). This mirrors the batch
  // render path in pipeline.ts but at preview resolution/quality.
  if (config.segments && config.segments.length > 0) {
    return renderSegmentedPreview(config, outputPath);
  }

  // ── Build job ─────────────────────────────────────────────────────────────
  const job: RenderClipJob = {
    clipId,
    sourceVideoPath: config.sourceVideoPath,
    startTime: config.startTime,
    endTime: config.endTime,
    cropRegion: config.cropRegion,
    cropTimeline: config.cropTimeline,
    wordTimestamps: config.wordTimestamps,
    hookTitleText: config.hookTitleText,
    rehookText: config.rehookText,
  };

  // ── Build batch options (no sound design, no B-roll, no filler removal) ───
  const batchOptions: RenderBatchOptions = {
    jobs: [job],
    outputDirectory: tmpdir(),
    captionsEnabled: config.captionsEnabled,
    captionStyle: config.captionStyle,
    templateLayout: config.templateLayout
      ? {
          ...config.templateLayout,
          rehookText: config.templateLayout.titleText,
        }
      : undefined,
    hookTitleOverlay: config.hookTitleOverlay,
    rehookOverlay: config.rehookOverlay,
    autoZoom: config.autoZoom,
    wordEmphasisEnabled: config.wordEmphasisEnabled,
    shotTransitionsEnabled: config.shotTransitionsEnabled,
    // soundDesign, fillerRemoval, broll intentionally omitted
  };

  // ── Apply accent color to batch options (same logic as accent-color.feature) ──
  if (config.accentColor) {
    const accent = config.accentColor;
    if (batchOptions.captionStyle) {
      batchOptions.captionStyle = {
        ...batchOptions.captionStyle,
        highlightColor: accent,
        emphasisColor: accent,
        // Lighten 40% toward white for supersize (same as accent-color.feature)
        supersizeColor: lightenColor(accent, 0.4),
      };
    }
    if (batchOptions.hookTitleOverlay) {
      batchOptions.hookTitleOverlay = {
        ...batchOptions.hookTitleOverlay,
        textColor: accent,
      };
    }
    console.log(`[Preview] Applying accent color: ${accent}`);
  }

  // ── Get source metadata ───────────────────────────────────────────────────
  const meta = await getVideoMetadata(config.sourceVideoPath);

  // ── Create fresh feature instances for this preview ───────────────────────
  // We create fresh instances of stateful features to avoid state pollution
  // between concurrent preview renders and batch renders.
  const features: RenderFeature[] = [
    wordEmphasisFeature,
    createCaptionsFeature(),
    createHookTitleFeature(),
    createRehookFeature(),
  ];

  // Auto-zoom filter (call generateZoomFilter directly — the autoZoomFeature
  // singleton stores per-clipId state which we avoid by calling the function
  // directly here with our unique preview clipId).
  const clipDuration = config.endTime - config.startTime;
  let autoZoomFilter: string | null = null;
  if (config.autoZoom?.enabled) {
    try {
      const filter = generateZoomFilter(
        clipDuration,
        config.autoZoom,
        0.38,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
      );
      autoZoomFilter = filter || null;
    } catch (err) {
      console.warn('[Preview] Auto-zoom filter generation failed, skipping:', err);
    }
  }

  // ── Phase 1: Prepare all features ─────────────────────────────────────────
  const allTempFiles: string[] = [];
  for (const feature of features) {
    if (feature.prepare) {
      const result = await feature.prepare(job, batchOptions);
      allTempFiles.push(...result.tempFiles);
    }
  }

  // ── Phase 2: Build video filter chain ─────────────────────────────────────
  const targetResolution = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  let videoFilter = buildVideoFilter(
    job,
    meta.width,
    meta.height,
    targetResolution,
    '9:16',
    meta.fps,
  );

  // Append auto-zoom if enabled
  if (autoZoomFilter) {
    videoFilter = `${videoFilter},${autoZoomFilter}`;
  }

  // Feature video filters (none of the current features use this for preview,
  // but we call it for completeness / future-proofing)
  const filterContext: FilterContext = {
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    targetWidth: PREVIEW_WIDTH,
    targetHeight: PREVIEW_HEIGHT,
    clipDuration,
    outputAspectRatio: '9:16',
  };
  for (const feature of features) {
    if (feature.videoFilter) {
      const featureFilter = feature.videoFilter(job, filterContext);
      if (featureFilter) {
        videoFilter = `${videoFilter},${featureFilter}`;
      }
    }
  }

  // ── Phase 3: Collect overlay passes ───────────────────────────────────────
  const overlayContext: OverlayContext = {
    clipDuration,
    targetWidth: PREVIEW_WIDTH,
    targetHeight: PREVIEW_HEIGHT,
  };
  const overlaySteps: OverlayPassResult[] = [];
  for (const feature of features) {
    if (feature.overlayPass) {
      const step = feature.overlayPass(job, overlayContext);
      if (step) overlaySteps.push(step);
    }
  }

  // ── Phase 4: Render at preview quality ────────────────────────────────────
  // CRF 35 + ultrafast preset gives the fastest possible encode.
  // GPU (NVENC p1 / QSV fast) or software (libx264 ultrafast) — both work fine.
  const previewQuality = { crf: 35, preset: 'ultrafast' as const };

  try {
    await renderClip(
      job,
      outputPath,
      videoFilter,
      () => {}, // no progress tracking for preview
      undefined,
      previewQuality,
      'mp4',
      null,
      null,
      overlaySteps,
    );
  } finally {
    // Clean up temp files from features (ASS files, etc.)
    for (const tmp of allTempFiles) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  return outputPath;
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

/**
 * Delete a preview temp file. Safe to call even if the file doesn't exist.
 */
export function cleanupPreviewFile(previewPath: string): void {
  try {
    unlinkSync(previewPath);
    console.log(`[Preview] Cleaned up temp file: ${previewPath}`);
  } catch {
    // Ignore — file may have already been deleted or never created
  }
}
