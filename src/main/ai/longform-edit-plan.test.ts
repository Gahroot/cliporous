// ---------------------------------------------------------------------------
// Long-form block parsing/validation tests.
//
// Drives `generateLongformEditPlan` with a mocked Gemini response so we can
// assert that the CONTENT BLOCKS layer is validated correctly: valid blocks of
// several kinds survive, malformed entries are dropped, arrays are clamped, and
// the Hormozi accent is stamped onto blocks that omit one.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WordTimestamp } from '@shared/types'

// Mock the Gemini client so no network call happens and we control the JSON.
const callMock = vi.fn<(...args: unknown[]) => Promise<string>>()

vi.mock('./gemini-client', () => ({
  callGeminiWithRetry: (...args: unknown[]) => callMock(...args),
  MODELS: { BALANCED: ['model-a', 'model-b'] }
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(_opts: unknown) {}
  }
}))

import { generateLongformEditPlan } from './longform-edit-plan'
import { HORMOZI_ACCENT } from '../edit-styles/hormozi'

function words(): WordTimestamp[] {
  // A handful of words spread across the first window (0–300s).
  return [
    { text: 'hello', start: 1, end: 1.4 },
    { text: 'world', start: 1.4, end: 1.9 },
    { text: 'numbers', start: 120, end: 120.5 },
    { text: 'matter', start: 120.5, end: 121 }
  ]
}

describe('generateLongformEditPlan — content blocks', () => {
  beforeEach(() => {
    callMock.mockReset()
  })

  it('keeps valid blocks of multiple kinds, drops malformed ones, stamps the accent', async () => {
    callMock.mockResolvedValue(
      JSON.stringify({
        phrases: [],
        blocks: [
          // valid bar-chart
          {
            kind: 'bar-chart',
            start: 10,
            end: 14,
            kicker: 'THE NUMBERS',
            heading: 'Revenue By Quarter',
            bars: [
              { label: 'Q1', value: 0.4, valueLabel: '$84K' },
              { label: 'Q2', value: 1.5, valueLabel: '$201K' } // value clamped to 1
            ]
          },
          // valid numbered-list with custom accent (should be preserved)
          {
            kind: 'numbered-list',
            start: 20,
            end: 25,
            kicker: 'PLAYBOOK',
            heading: 'Three Steps',
            accentColor: '#123456',
            items: [
              { text: 'Validate', detail: 'Talk first' },
              { text: 'Pre-sell' },
              { text: 'Ship' }
            ]
          },
          // valid stat-hero
          {
            kind: 'stat-hero',
            start: 30,
            end: 34,
            kicker: 'ONE YEAR IN',
            heading: 'ARR',
            value: 1.2,
            decimals: 1,
            prefix: '$',
            suffix: 'M',
            label: 'Up from $310K',
            trend: 'up',
            delta: '+287%'
          },
          // invalid: unknown kind
          { kind: 'pie-chart', start: 40, end: 44, kicker: 'X', heading: 'Y' },
          // invalid: out of range
          { kind: 'checklist', start: 9000, end: 9004, kicker: 'X', heading: 'Y', items: [{ text: 'a' }, { text: 'b' }] },
          // invalid: bar-chart with too few bars
          { kind: 'bar-chart', start: 50, end: 54, kicker: 'X', heading: 'Y', bars: [{ label: 'only', value: 0.5, valueLabel: '1' }] },
          // invalid: missing heading
          { kind: 'stat-grid', start: 60, end: 64, kicker: 'X', heading: '', stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }] }
        ]
      })
    )

    const plan = await generateLongformEditPlan({
      apiKey: 'fake',
      words: words(),
      videoDuration: 200
    })

    // Three valid blocks survive, sorted by startTime.
    expect(plan.blocks.map((b) => b.kind)).toEqual(['bar-chart', 'numbered-list', 'stat-hero'])

    const bar = plan.blocks[0]
    expect(bar.kind).toBe('bar-chart')
    if (bar.kind === 'bar-chart') {
      expect(bar.bars).toHaveLength(2)
      expect(bar.bars[1].value).toBe(1) // clamped from 1.5
    }
    // bar-chart had no accent → stamped with Hormozi accent.
    expect(bar.accentColor).toBe(HORMOZI_ACCENT)

    // numbered-list provided its own accent → preserved.
    const list = plan.blocks[1]
    expect(list.accentColor).toBe('#123456')
    if (list.kind === 'numbered-list') {
      expect(list.items).toHaveLength(3)
      expect(list.items[0].detail).toBe('Talk first')
      expect(list.items[1].detail).toBeUndefined()
    }
  })

  it('returns an empty blocks array when no words are present', async () => {
    const plan = await generateLongformEditPlan({ apiKey: 'fake', words: [], videoDuration: 0 })
    expect(plan.blocks).toEqual([])
    expect(callMock).not.toHaveBeenCalled()
  })

  it('clamps over-long lists to the max length', async () => {
    callMock.mockResolvedValue(
      JSON.stringify({
        blocks: [
          {
            kind: 'numbered-list',
            start: 10,
            end: 15,
            kicker: 'K',
            heading: 'Too Many',
            items: [
              { text: 'one' },
              { text: 'two' },
              { text: 'three' },
              { text: 'four' },
              { text: 'five' },
              { text: 'six' },
              { text: 'seven' }
            ]
          }
        ]
      })
    )

    const plan = await generateLongformEditPlan({ apiKey: 'fake', words: words(), videoDuration: 200 })
    const list = plan.blocks[0]
    expect(list.kind).toBe('numbered-list')
    if (list.kind === 'numbered-list') {
      expect(list.items).toHaveLength(5) // sliced from 7
    }
  })
})
