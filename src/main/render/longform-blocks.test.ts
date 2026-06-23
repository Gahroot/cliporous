// ---------------------------------------------------------------------------
// Long-form block wiring tests.
//
//   1. `buildTimeline` turns `plan.blocks` into chronological `kind: 'block'`
//      inserts, dropping overlaps (first-by-start wins) alongside cards/headers.
//   2. `resolveLongformBlockCompositionId` reproduces the exact composition ids
//      registered in Root.tsx (`${Base}-${skinId}`) — guards the base map vs
//      typos that would make a block fail to `selectComposition` at render.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest'

// longform-pipeline pulls in electron/ffmpeg at module load; stub electron so
// the import resolves cleanly in the node test environment.
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/tmp') },
  BrowserWindow: class {}
}))

import { buildTimeline } from './longform-pipeline'
import {
  resolveLongformBlockCompositionId,
  DEFAULT_LONGFORM_BLOCK_SKIN
} from '../remotion/registry'
import type { LongformEditPlan, BlockPlacement, LongformBlockKind } from '@shared/types'

function emptyPlan(over: Partial<LongformEditPlan> = {}): LongformEditPlan {
  return {
    phrases: [],
    blocks: [],
    reasoning: '',
    generatedAt: 0,
    ...over
  }
}

/** A minimal valid numbered-list placement for timeline insertion tests. */
function block(startTime: number, endTime: number): BlockPlacement {
  return {
    kind: 'numbered-list',
    startTime,
    endTime,
    kicker: 'K',
    heading: 'H',
    items: [{ text: 'a' }, { text: 'b' }]
  }
}

describe('buildTimeline — blocks', () => {
  it('inserts blocks as kind:block segments with speaker fill around them', () => {
    const plan = emptyPlan({ blocks: [block(10, 14)] })
    const timeline = buildTimeline(plan, 30)

    const kinds = timeline.map((b) => b.kind)
    expect(kinds).toEqual(['speaker', 'block', 'speaker'])

    const blk = timeline.find((b) => b.kind === 'block')
    expect(blk).toBeDefined()
    if (blk && blk.kind === 'block') {
      expect(blk.startTime).toBe(10)
      expect(blk.endTime).toBe(14)
      expect(blk.placement.kind).toBe('numbered-list')
    }
  })

  it('orders blocks chronologically and drops overlapping inserts', () => {
    const plan = emptyPlan({
      blocks: [
        block(20, 24),
        block(5, 9),
        block(7, 11) // overlaps the 5–9 block → dropped
      ]
    })
    const timeline = buildTimeline(plan, 40)
    const blocks = timeline.filter((b) => b.kind === 'block')
    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.startTime)).toEqual([5, 20])
  })

  it('drops a block that overlaps an earlier block', () => {
    const plan = emptyPlan({
      blocks: [block(5, 12), block(8, 12)] // second starts inside the first → dropped
    })
    const timeline = buildTimeline(plan, 30)
    expect(timeline.filter((b) => b.kind === 'block')).toHaveLength(1)
  })
})

describe('resolveLongformBlockCompositionId', () => {
  const cases: Array<[LongformBlockKind, string]> = [
    ['bar-chart', 'BarChart'],
    ['comparison', 'Comparison'],
    ['comparison-table', 'ComparisonTable'],
    ['stat-grid', 'StatGrid'],
    ['icon-stat-grid', 'IconStatGrid'],
    ['icon-row', 'IconRow'],
    ['numbered-list', 'NumberedList'],
    ['checklist', 'Checklist'],
    ['stat-hero', 'StatHero'],
    ['progress-bars', 'ProgressBars'],
    ['kpi-ticker', 'KpiTicker'],
    ['quote-card', 'QuoteCard'],
    ['tweet-card', 'TweetCard'],
    ['definition-card', 'DefinitionCard'],
    ['timeline', 'Timeline'],
    ['timeline-cards', 'TimelineCards'],
    ['feature-grid', 'FeatureGrid']
  ]

  it('reconstructs the registered ${Base}-${skinId} composition id', () => {
    for (const [kind, base] of cases) {
      expect(resolveLongformBlockCompositionId(kind, 'editorial')).toBe(`${base}-editorial`)
      expect(resolveLongformBlockCompositionId(kind, 'terminal')).toBe(`${base}-terminal`)
    }
  })

  it('uses a real skin id as the default', () => {
    expect(['aurora-glass', 'editorial', 'bento', 'terminal']).toContain(
      DEFAULT_LONGFORM_BLOCK_SKIN
    )
  })
})
