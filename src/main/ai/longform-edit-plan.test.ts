// ---------------------------------------------------------------------------
// Long-form block parsing/validation tests.
//
// Drives `generateLongformEditPlan` with a mocked Gemini response so we can
// assert that the CONTENT BLOCKS layer is validated correctly: valid blocks of
// several kinds survive, malformed entries are dropped, arrays are clamped, and
// no accent is forced onto blocks that omit one (they inherit the brand palette
// downstream — no Hormozi gold).
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

import { generateLongformEditPlan, diversifyBlocks } from './longform-edit-plan'
import type { BlockPlacement } from '@shared/types'

/** Minimal valid bar-chart block for variety-pass tests. */
function bar(startTime: number): BlockPlacement {
  return {
    kind: 'bar-chart',
    startTime,
    endTime: startTime + 4,
    kicker: 'K',
    heading: 'H',
    bars: [
      { label: 'A', value: 0.5, valueLabel: '1' },
      { label: 'B', value: 0.6, valueLabel: '2' }
    ]
  }
}

/** Minimal valid callout block (a different kind) for variety-pass tests. */
function callout(startTime: number): BlockPlacement {
  return { kind: 'callout', startTime, endTime: startTime + 4, kicker: 'K', heading: 'H', body: 'Hi' }
}

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

  it('keeps valid blocks of multiple kinds, drops malformed ones, leaves accent unset', async () => {
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
    // bar-chart had no accent → left unset so it inherits the brand palette.
    expect(bar.accentColor).toBeUndefined()

    // numbered-list provided its own accent → preserved.
    const list = plan.blocks[1]
    expect(list.accentColor).toBe('#123456')
    if (list.kind === 'numbered-list') {
      expect(list.items).toHaveLength(3)
      expect(list.items[0].detail).toBe('Talk first')
      expect(list.items[1].detail).toBeUndefined()
    }
  })

  it('runs the variety pass on the merged plan (collapses clustered same-kind blocks)', async () => {
    // Four bar-charts packed into ~40s with nothing between them.
    callMock.mockResolvedValue(
      JSON.stringify({
        blocks: [
          { kind: 'bar-chart', start: 10, end: 14, kicker: 'K', heading: 'A', bars: [{ label: 'a', value: 0.4, valueLabel: '1' }, { label: 'b', value: 0.6, valueLabel: '2' }] },
          { kind: 'bar-chart', start: 18, end: 22, kicker: 'K', heading: 'B', bars: [{ label: 'a', value: 0.4, valueLabel: '1' }, { label: 'b', value: 0.6, valueLabel: '2' }] },
          { kind: 'bar-chart', start: 26, end: 30, kicker: 'K', heading: 'C', bars: [{ label: 'a', value: 0.4, valueLabel: '1' }, { label: 'b', value: 0.6, valueLabel: '2' }] },
          { kind: 'bar-chart', start: 34, end: 38, kicker: 'K', heading: 'D', bars: [{ label: 'a', value: 0.4, valueLabel: '1' }, { label: 'b', value: 0.6, valueLabel: '2' }] }
        ]
      })
    )

    const plan = await generateLongformEditPlan({ apiKey: 'fake', words: words(), videoDuration: 200 })

    // The tight cluster collapses to a single bar-chart, never empty.
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0].kind).toBe('bar-chart')
    expect(plan.blocks[0].startTime).toBe(10) // earliest kept
    expect(plan.blocks[0].accentColor).toBeUndefined()
  })

  it('returns an empty blocks array when no words are present', async () => {
    const plan = await generateLongformEditPlan({ apiKey: 'fake', words: [], videoDuration: 0 })
    expect(plan.blocks).toEqual([])
    expect(callMock).not.toHaveBeenCalled()
  })

  it('injects an intro phrase quota into the first window prompt', async () => {
    callMock.mockResolvedValue(JSON.stringify({ phrases: [], blocks: [] }))

    await generateLongformEditPlan({ apiKey: 'fake', words: words(), videoDuration: 200 })

    // The window starting at video time 0 must carry the denser intro phrase
    // guidance; the prompt is the 3rd arg passed to the Gemini client.
    const prompt = String(callMock.mock.calls[0][2])
    expect(prompt).toContain('INTRO PHRASES')
  })

  it('drops a currency prefix whose suffix is a non-money unit (% / s / kg)', async () => {
    callMock.mockResolvedValue(
      JSON.stringify({
        blocks: [
          { kind: 'stat-hero', start: 10, end: 14, kicker: 'K', heading: 'Tuned Out', value: 90, decimals: 1, prefix: '$', suffix: '%', label: 'Ignore AI hype' },
          { kind: 'stat-hero', start: 60, end: 64, kicker: 'K', heading: 'Sprint Pace', value: 5, prefix: '$', suffix: 's', label: 'Per rep' },
          { kind: 'stat-hero', start: 130, end: 134, kicker: 'K', heading: 'Revenue', value: 1.2, decimals: 1, prefix: '$', suffix: 'M', label: 'ARR' }
        ]
      })
    )

    const plan = await generateLongformEditPlan({ apiKey: 'fake', words: words(), videoDuration: 200 })

    const pct = plan.blocks[0]
    if (pct.kind === 'stat-hero') {
      expect(pct.suffix).toBe('%')
      expect(pct.prefix).toBeUndefined() // '$' dropped — % is not money
    }
    const sec = plan.blocks[1]
    if (sec.kind === 'stat-hero') {
      expect(sec.suffix).toBe('s')
      expect(sec.prefix).toBeUndefined() // '$' dropped — s is not money
    }
    const money = plan.blocks[2]
    if (money.kind === 'stat-hero') {
      expect(money.prefix).toBe('$') // kept — M is a magnitude multiplier
      expect(money.suffix).toBe('M')
    }
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

describe('diversifyBlocks', () => {
  it('collapses consecutive same-kind blocks that are close in time', () => {
    const result = diversifyBlocks([bar(10), bar(18), bar(26)])
    // All within MIN_SAME_KIND_GAP — only the first survives.
    expect(result).toHaveLength(1)
    expect(result[0].startTime).toBe(10)
  })

  it('keeps same-kind blocks once they are spaced far enough apart', () => {
    // 0s and 100s are > the base 45s gap apart — both kept.
    const result = diversifyBlocks([bar(0), bar(100)])
    expect(result.map((b) => b.startTime)).toEqual([0, 100])
  })

  it('improves variety without dropping everything', () => {
    // A tight cluster of 4 same-kind bars plus one different kind. A pure
    // same-kind run would collapse to 1; the different kind survives so the mix
    // is more varied than the input run — and never empty.
    const input = [bar(10), bar(18), callout(22), bar(26), bar(34)]
    const result = diversifyBlocks(input)

    // Non-empty and chronological.
    expect(result.length).toBeGreaterThan(1)
    const starts = result.map((b) => b.startTime)
    expect([...starts]).toEqual([...starts].sort((a, b) => a - b))

    // Both kinds represented — variety improved vs. the clustered bar run.
    const kinds = new Set(result.map((b) => b.kind))
    expect(kinds.size).toBe(2)

    // The packed bar-charts collapse to one; the lone callout is kept.
    expect(result.filter((b) => b.kind === 'bar-chart')).toHaveLength(1)
    expect(result.filter((b) => b.kind === 'callout')).toHaveLength(1)
  })

  it('preserves chronological order and is a no-op for 0 or 1 blocks', () => {
    expect(diversifyBlocks([])).toEqual([])
    const one = [bar(5)]
    expect(diversifyBlocks(one)).toEqual(one)
  })

  it('escalates required spacing for over-used kinds', () => {
    // Base gap 20s, escalating as 20*(uses+1).
    //   bar@0   kept (1st use)
    //   bar@50  needs >40 (2nd use)  — gap 50  → kept
    //   bar@95  needs >60 (3rd use)  — gap 45  → dropped
    //   bar@180 needs >60            — gap 130 → kept
    const result = diversifyBlocks([bar(0), bar(50), bar(95), bar(180)])
    expect(result.map((b) => b.startTime)).toEqual([0, 50, 180])
  })
})
