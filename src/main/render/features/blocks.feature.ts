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

import { join } from 'path'
import { tmpdir } from 'os'
import type { BlockPlacement, LongformSkinId } from '@shared/types'
import { resolveLongformBlockCompositionId } from '../../remotion/registry'
import { HORMOZI_ACCENT } from '../../edit-styles/hormozi'
import { muxRemotionVisualWithAudio } from '../longform-encode'
import type { RenderFeature, PrepareResult } from './feature'
import type { RenderClipJob, RenderBatchOptions } from '../types'
import type {
  BarChartProps,
  ComparisonProps,
  ComparisonTableProps,
  StatGridProps,
  IconStatGridProps,
  IconRowProps,
  NumberedListProps,
  ChecklistProps,
  StatHeroProps,
  ProgressBarsProps,
  KpiTickerProps,
  QuoteCardProps,
  TweetCardProps,
  DefinitionCardProps,
  TimelineCardsProps,
  FeatureGridProps
} from '../../remotion/compositions/blocks/types'
import type { TimelineProps } from '../../remotion/compositions/blocks/Timeline'

// ---------------------------------------------------------------------------
// Placement → composition inputProps
//
// Each branch builds the exact `*Props` object the matching composition expects
// (skinId + accentColor + content fields). The `satisfies` annotation makes the
// build FAIL if the shared `BlockPlacement` contract ever drifts from the
// main-side `*Props` interfaces — without touching either definition.
// ---------------------------------------------------------------------------

/**
 * Map a block placement to the Remotion composition inputProps for `skinId`.
 * `accentColor` defaults to the Hormozi yellow when the plan omits it.
 */
export function buildBlockInputProps(
  placement: BlockPlacement,
  skinId: LongformSkinId
): Record<string, unknown> {
  const accentColor = placement.accentColor ?? HORMOZI_ACCENT
  const base = { skinId, accentColor }

  switch (placement.kind) {
    case 'bar-chart':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        bars: placement.bars
      } satisfies BarChartProps
    case 'comparison':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        leftTitle: placement.leftTitle,
        rightTitle: placement.rightTitle,
        leftItems: placement.leftItems,
        rightItems: placement.rightItems
      } satisfies ComparisonProps
    case 'comparison-table':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        leftTitle: placement.leftTitle,
        rightTitle: placement.rightTitle,
        leftItems: placement.leftItems,
        rightItems: placement.rightItems
      } satisfies ComparisonTableProps
    case 'stat-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        stats: placement.stats
      } satisfies StatGridProps
    case 'icon-stat-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies IconStatGridProps
    case 'icon-row':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies IconRowProps
    case 'numbered-list':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies NumberedListProps
    case 'checklist':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies ChecklistProps
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
        delta: placement.delta
      } satisfies StatHeroProps
    case 'progress-bars':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        bars: placement.bars
      } satisfies ProgressBarsProps
    case 'kpi-ticker':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies KpiTickerProps
    case 'quote-card':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        quote: placement.quote,
        name: placement.name,
        role: placement.role,
        avatarUrl: placement.avatarUrl
      } satisfies QuoteCardProps
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
        likes: placement.likes
      } satisfies TweetCardProps
    case 'definition-card':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        term: placement.term,
        partOfSpeech: placement.partOfSpeech,
        definition: placement.definition
      } satisfies DefinitionCardProps
    case 'timeline':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        steps: placement.steps
      } satisfies TimelineProps
    case 'timeline-cards':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        steps: placement.steps
      } satisfies TimelineCardsProps
    case 'feature-grid':
      return {
        ...base,
        kicker: placement.kicker,
        heading: placement.heading,
        items: placement.items
      } satisfies FeatureGridProps
  }
}

export interface RenderBlockOptions {
  placement: BlockPlacement
  skinId: LongformSkinId
  sourceVideoPath: string
  width: number
  height: number
  fps: number
}

/**
 * Render one content block to a normalized, concat-ready mp4 segment.
 * Returns the output path. Temp files are written under the OS temp dir.
 */
export async function renderBlockSegment(opts: RenderBlockOptions): Promise<string> {
  const { placement, skinId, sourceVideoPath, width, height, fps } = opts
  const duration = Math.max(0.5, placement.endTime - placement.startTime)
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`

  const compositionId = resolveLongformBlockCompositionId(placement.kind, skinId)
  const inputProps = buildBlockInputProps(placement, skinId)

  // Dynamic import keeps @remotion/bundler (esbuild) out of the static module
  // graph so importing the render pipeline in tests never loads it.
  const { renderRemotionSegment } = await import('../../remotion/render')

  const visualPath = join(tmpdir(), `batchcontent-block-vis-${stamp}.mp4`)
  await renderRemotionSegment({
    compositionId,
    inputProps,
    durationSec: duration,
    fps,
    width,
    height,
    transparent: false,
    outputPath: visualPath
  })

  const outputPath = join(tmpdir(), `batchcontent-block-seg-${stamp}.mp4`)
  await muxRemotionVisualWithAudio({
    visualPath,
    sourceVideoPath,
    outputPath,
    startTime: placement.startTime,
    duration,
    width,
    height,
    fps
  })

  return outputPath
}

/**
 * RenderFeature shell — documents the long-form seam and stays a strict no-op
 * for the 9:16 pipeline (it is never registered in the standard feature list).
 */
export const blocksFeature: RenderFeature = {
  name: 'blocks',
  async prepare(
    _job: RenderClipJob,
    batchOptions: RenderBatchOptions
  ): Promise<PrepareResult> {
    // Long-form orchestration happens in longform-pipeline.ts, not here.
    if (batchOptions.outputProfile !== 'longform') {
      return { tempFiles: [], modified: false }
    }
    return { tempFiles: [], modified: false }
  }
}
