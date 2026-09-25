// ---------------------------------------------------------------------------
// Content-block feature (long-form / Hormozi 16:9 only).
//
// Pre-renders a full-frame skinned content block (bar chart, comparison, stat
// grid, numbered list, …) as a Remotion clip, then muxes it with the source
// narration audio for the same time range. Used exclusively by
// `longform-pipeline.ts`. Outside the long-form profile this is a no-op.
//
// The block compositions are registered in `Root.tsx` at 1920×1080 across the
// four skins; `resolveLongformBlockCompositionId` reconstructs the registered
// id from a `(kind, skinId)` pair.
// ---------------------------------------------------------------------------

import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_LONGFORM_BLOCK_SECONDS } from '@shared/longform-plan-timing';
import type { Palette } from '@shared/palettes';
import { getPaletteById } from '@shared/palettes';
import type { BlockPlacement, ComparisonPositiveSide, LongformSkinId } from '@shared/types';
import type {
  BarChartProps,
  CalloutProps,
  ChecklistProps,
  ComparisonProps,
  ComparisonTableProps,
  DefinitionCardProps,
  DonutProps,
  FeatureGridProps,
  FunnelProps,
  IconRowProps,
  IconStatGridProps,
  KpiTickerProps,
  LeaderboardProps,
  MapBlockProps,
  NumberedListProps,
  PortraitQuoteProps,
  ProgressBarsProps,
  QuoteCardProps,
  StatGridProps,
  StatHeroProps,
  TimelineCardsProps,
  TimelineProps,
  TweetCardProps,
} from '../../remotion/compositions/blocks/types';
import { resolveLongformBlockCompositionId } from '../../remotion/registry';
import { muxRemotionVisualWithAudio } from '../longform-encode';
import type { WordTimestamp } from '../point-coverage';
import type { RenderBatchOptions, RenderClipJob } from '../types';
import type { PrepareResult, RenderFeature } from './feature';

// ---------------------------------------------------------------------------
// Placement → composition inputProps
//
// Each branch builds the exact `*Props` object the matching composition expects
// (skinId + accentColor + content fields). The `satisfies` annotation makes the
// build FAIL if the shared `BlockPlacement` contract ever drifts from the
// main-side `*Props` interfaces — without touching either definition.
// ---------------------------------------------------------------------------
const POSITIVE_COMPARISON_TITLE_SIGNALS = [
  /\bbetter\b/i,
  /\bbest\b/i,
  /\brecommended\b/i,
  /\bpreferred\b/i,
  /\bimproved\b/i,
  /\bmodern\b/i,
  /\bnew\b/i,
  /\bfuture\b/i,
  /\bideal\b/i,
  /\bright\b/i,
  /\boperators?\b/i,
  /\bpros?\b/i,
  /\bautomated\b/i,
  /\befficient\b/i,
  /\bwinning\b/i,
  /\bworks?\b/i,
  /\bafter\b/i,
  /\bwith\b/i,
];

const NEGATIVE_COMPARISON_TITLE_SIGNALS = [
  /\bworse\b/i,
  /\bworst\b/i,
  /\bavoid\b/i,
  /\btraditional\b/i,
  /\bold\b/i,
  /\blegacy\b/i,
  /\boutdated\b/i,
  /\bwrong\b/i,
  /\bamateurs?\b/i,
  /\bcons?\b/i,
  /\bmanual\b/i,
  /\binefficient\b/i,
  /\bbroken\b/i,
  /\bproblems?\b/i,
  /\bbefore\b/i,
  /\bwithout\b/i,
];

function scoreComparisonTitle(title: string): number {
  const positive = POSITIVE_COMPARISON_TITLE_SIGNALS.filter((signal) => signal.test(title)).length;
  const negative = NEGATIVE_COMPARISON_TITLE_SIGNALS.filter((signal) => signal.test(title)).length;
  return positive - negative;
}

/**
 * Resolve comparison semantics from the AI-authored side first, then recover
 * legacy plans from recognizable headings such as "Current Way / Better Way".
 */
export function resolveComparisonPositiveSide(
  positiveSide: ComparisonPositiveSide | undefined,
  leftTitle: string,
  rightTitle: string,
): ComparisonPositiveSide {
  if (positiveSide) return positiveSide;
  return scoreComparisonTitle(rightTitle) > scoreComparisonTitle(leftTitle) ? 'right' : 'left';
}

/**
 * Map a block placement to the Remotion composition inputProps for `skinId`.
 * The render-time selected palette is authoritative, including its accent; this
 * prevents stale model-authored violet accents from overriding the user's choice.
 */
export function buildBlockInputProps(
  placement: BlockPlacement,
  skinId: LongformSkinId,
  palette?: Palette,
): Record<string, unknown> {
  const resolvedPalette = palette ?? placement.palette;
  const accentColor = resolvedPalette?.accent ?? placement.accentColor;
  // `exactOptionalPropertyTypes` forbids `accentColor: undefined` /
  // `palette: undefined`, so only attach each key when it is actually present.
  const base = {
    skinId,
    ...(accentColor ? { accentColor } : {}),
    ...(resolvedPalette ? { palette: resolvedPalette } : {}),
  };

  switch (placement.kind) {
    case 'bar-chart':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        bars: placement.bars,
      } satisfies BarChartProps;
    case 'comparison':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        leftTitle: placement.leftTitle,
        rightTitle: placement.rightTitle,
        leftItems: placement.leftItems,
        rightItems: placement.rightItems,
        positiveSide: resolveComparisonPositiveSide(
          placement.positiveSide,
          placement.leftTitle,
          placement.rightTitle,
        ),
      } satisfies ComparisonProps;
    case 'comparison-table':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        leftTitle: placement.leftTitle,
        rightTitle: placement.rightTitle,
        leftItems: placement.leftItems,
        rightItems: placement.rightItems,
        positiveSide: resolveComparisonPositiveSide(
          placement.positiveSide,
          placement.leftTitle,
          placement.rightTitle,
        ),
      } satisfies ComparisonTableProps;
    case 'stat-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        stats: placement.stats,
      } satisfies StatGridProps;
    case 'icon-stat-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies IconStatGridProps;
    case 'icon-row':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies IconRowProps;
    case 'numbered-list':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies NumberedListProps;
    case 'checklist':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies ChecklistProps;
    case 'stat-hero':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        value: placement.value,
        decimals: placement.decimals,
        prefix: placement.prefix,
        suffix: placement.suffix,
        label: placement.label,
        trend: placement.trend,
        delta: placement.delta,
      } satisfies StatHeroProps;
    case 'progress-bars':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        bars: placement.bars,
      } satisfies ProgressBarsProps;
    case 'kpi-ticker':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies KpiTickerProps;
    case 'quote-card':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        quote: placement.quote,
        name: placement.name,
        role: placement.role,
        avatarUrl: placement.avatarUrl,
      } satisfies QuoteCardProps;
    case 'portrait-quote':
      return {
        ...base,
        kicker: placement.kicker,
        ...(placement.heading ? { heading: placement.heading } : {}),
        quote: placement.quote,
        name: placement.name,
        ...(placement.role ? { role: placement.role } : {}),
        ...(placement.imageUrl ? { imageUrl: placement.imageUrl } : {}),
      } satisfies PortraitQuoteProps;
    case 'tweet-card':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        name: placement.name,
        handle: placement.handle,
        verified: placement.verified,
        avatarUrl: placement.avatarUrl,
        body: placement.body,
        replies: placement.replies,
        reposts: placement.reposts,
        likes: placement.likes,
      } satisfies TweetCardProps;
    case 'definition-card':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        term: placement.term,
        partOfSpeech: placement.partOfSpeech,
        definition: placement.definition,
      } satisfies DefinitionCardProps;
    case 'timeline':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        steps: placement.steps,
      } satisfies TimelineProps;
    case 'timeline-cards':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        steps: placement.steps,
      } satisfies TimelineCardsProps;
    case 'feature-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items,
      } satisfies FeatureGridProps;
    case 'leaderboard':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        rows: placement.rows,
      } satisfies LeaderboardProps;
    case 'donut':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        slices: placement.slices,
      } satisfies DonutProps;
    case 'funnel':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        stages: placement.stages,
      } satisfies FunnelProps;
    case 'callout':
      return {
        ...base,
        kicker: placement.kicker,
        ...(placement.heading ? { heading: placement.heading } : {}),
        body: placement.body,
        ...(placement.attribution ? { attribution: placement.attribution } : {}),
      } satisfies CalloutProps;
    case 'map':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        pins: placement.pins,
      } satisfies MapBlockProps;
  }
}

// ---------------------------------------------------------------------------
// Point coverage (shared with the vertical hyperframes path)
//
// List-style content blocks render N rows at once; keep them on screen until
// the last row has been spoken. Reuses the shared fuzzy matcher in
// `point-coverage.ts`. Times here are absolute source-video seconds, matching
// `BlockPlacement.startTime/endTime` and `job.wordTimestamps`.
// ---------------------------------------------------------------------------

/** Prop fields (priority order) that carry a block's list of points. */
const BLOCK_LIST_FIELDS = [
  'items',
  'rightItems',
  'leftItems',
  'stats',
  'bars',
  'rows',
  'steps',
  'slices',
  'stages',
] as const;

function blockItemToText(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    const value = o.text ?? o.label ?? o.title ?? o.name ?? o.value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** Pull the longest text list out of a block placement (its main content). */
export function extractBlockItemTexts(placement: BlockPlacement): string[] {
  const record = placement as unknown as Record<string, unknown>;
  let best: string[] = [];
  for (const field of BLOCK_LIST_FIELDS) {
    const value = record[field];
    if (!Array.isArray(value)) continue;
    const texts = value.map(blockItemToText).filter((t) => t.length > 0);
    if (texts.length > best.length) best = texts;
  }
  return best;
}

/**
 * Keep the reviewed plan's end time authoritative while enforcing a hard display
 * ceiling. Extending a block after planning can create a new overlap and can also
 * match a repeated word near the video's end, pinning the full-frame graphic over
 * every later edit. `words` remains in the signature for API compatibility.
 */
export function extendBlockPlacementEndTime(
  placement: BlockPlacement,
  _words: WordTimestamp[] | undefined,
  clipEnd: number,
): number {
  return Math.min(placement.endTime, clipEnd, placement.startTime + MAX_LONGFORM_BLOCK_SECONDS);
}

export interface RenderBlockOptions {
  placement: BlockPlacement;
  skinId: LongformSkinId;
  sourceVideoPath: string;
  width: number;
  height: number;
  fps: number;
  /** Resolved color palette to color the block with. Wins over `paletteId`. */
  palette?: Palette;
  /** Palette id to resolve when a concrete `palette` is not supplied. */
  paletteId?: string;
  /**
   * Per-segment progress callback (0–100), RF-006. The slow Remotion render
   * drives 0–95; the final audio mux completes the segment at 100.
   */
  onProgress?: ((percent: number) => void) | undefined;
}

/**
 * Render one content block to a normalized, concat-ready mp4 segment.
 * Returns the output path. Temp files are written under the OS temp dir.
 */
export async function renderBlockSegment(opts: RenderBlockOptions): Promise<string> {
  const { placement, skinId, sourceVideoPath, width, height, fps, onProgress } = opts;
  const duration = Math.max(0.5, placement.endTime - placement.startTime);
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

  // Default to the brand palette when no concrete palette / id is supplied.
  const palette = opts.palette ?? getPaletteById(opts.paletteId);
  const compositionId = resolveLongformBlockCompositionId(placement.kind, skinId);
  const inputProps = buildBlockInputProps(placement, skinId, palette);

  // Dynamic import keeps @remotion/bundler (esbuild) out of the static module
  // graph so importing the render pipeline in tests never loads it.
  const { renderRemotionSegment } = await import('../../remotion/render');

  const visualPath = join(tmpdir(), `batchcontent-block-vis-${stamp}.mp4`);
  const outputPath = join(tmpdir(), `batchcontent-block-seg-${stamp}.mp4`);
  try {
    await renderRemotionSegment({
      compositionId,
      inputProps,
      durationSec: duration,
      fps,
      width,
      height,
      transparent: false,
      outputPath: visualPath,
      // Remotion render is the slow phase — map its 0..1 onto 0..95 of the
      // segment band; the trailing mux completes the last 5%.
      onProgress: onProgress ? (progress) => onProgress(Math.min(95, progress * 100)) : undefined,
    });

    await muxRemotionVisualWithAudio({
      visualPath,
      sourceVideoPath,
      outputPath,
      startTime: placement.startTime,
      duration,
      width,
      height,
      fps,
    });

    onProgress?.(100);
    return outputPath;
  } catch (err) {
    try {
      unlinkSync(outputPath);
    } catch {
      // Ignore a missing or partially-created output.
    }
    throw err;
  } finally {
    try {
      unlinkSync(visualPath);
    } catch {
      // Ignore a missing or partially-created visual.
    }
  }
}

/**
 * RenderFeature shell — documents the long-form seam and stays a strict no-op
 * for the 9:16 pipeline (it is never registered in the standard feature list).
 */
export const blocksFeature: RenderFeature = {
  name: 'blocks',
  async prepare(_job: RenderClipJob, batchOptions: RenderBatchOptions): Promise<PrepareResult> {
    // Long-form orchestration happens in longform-pipeline.ts, not here.
    if (batchOptions.outputProfile !== 'longform') {
      return { tempFiles: [], modified: false };
    }
    return { tempFiles: [], modified: false };
  },
};
