/**
 * ClipGrid.test.tsx
 *
 * - Renders one ClipCard per ClipCandidate from a fixture set seeded into
 *   the store via setActiveSource + setClips.
 * - Clicking a card opens the ClipDetail Sheet — verified by the SheetTitle
 *   showing the clip's hook text.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { useStore } from '@/store'
import type { ClipCandidate, SourceVideo } from '@/store/types'
import { installApiStub, resetStore } from './test-utils'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE: SourceVideo = {
  id: 'src-1',
  path: '/videos/talk.mp4',
  name: 'talk.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  origin: 'file',
}

function makeClip(overrides: Partial<ClipCandidate> & { id: string }): ClipCandidate {
  return {
    sourceId: SOURCE.id,
    startTime: 0,
    endTime: 30,
    duration: 30,
    text: 'sample text',
    score: 80,
    hookText: `Hook ${overrides.id}`,
    reasoning: 'because',
    status: 'pending',
    ...overrides,
  }
}

const CLIPS: ClipCandidate[] = [
  makeClip({ id: 'c1', score: 90, hookText: 'First hook line' }),
  makeClip({ id: 'c2', score: 80, hookText: 'Second hook line' }),
  makeClip({ id: 'c3', score: 70, hookText: 'Third hook line' }),
  makeClip({ id: 'c4', score: 60, hookText: 'Fourth hook line' }),
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  installApiStub()

  const store = useStore.getState()
  store.addSource(SOURCE)
  store.setActiveSource(SOURCE.id)
  store.setClips(SOURCE.id, CLIPS)
  // Force `pipeline.stage` to 'ready' so the loading skeleton doesn't show.
  store.setPipeline({ stage: 'ready', message: '', percent: 0 })
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClipGrid', () => {
  it('renders one card per clip in the fixture set', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    // Each ClipCard is a role="button" with an aria-label that begins
    // with "Clip:". Score markup ensures they don't collide with footer
    // pills (which have their own aria-labels).
    const cards = screen.getAllByRole('button', { name: /^Clip:/ })
    expect(cards).toHaveLength(CLIPS.length)

    // Hook text from each fixture clip is present on the page.
    for (const clip of CLIPS) {
      expect(screen.getByText(clip.hookText)).toBeInTheDocument()
    }

    // The clip-count label reflects the fixture size.
    expect(screen.getByText(`${CLIPS.length} clips`)).toBeInTheDocument()
  })

  it('opens the ClipDetail Sheet when a card is clicked', async () => {
    const { ClipGrid } = await import('@/components/ClipGrid')
    render(<ClipGrid />)

    // Clicking the first card opens the Sheet for that clip. Cards are
    // sorted by score desc, so c1 (score 90) is first.
    const firstCard = screen.getByRole('button', { name: /First hook line/ })
    fireEvent.click(firstCard)

    // Sheet renders a dialog whose title is the clip's hookText.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // The hook text appears at least twice now (once in the grid card, once
    // in the SheetTitle), so scope the title query to the dialog.
    expect(
      within(dialog).getByText('First hook line')
    ).toBeInTheDocument()
  })
})
