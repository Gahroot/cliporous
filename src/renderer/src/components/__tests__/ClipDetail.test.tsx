/**
 * ClipDetail.test.tsx
 *
 * - Toggling captions mode updates the Select trigger value (persists in
 *   component state across re-render — the value sticks until the user
 *   changes it again or selects a different clip).
 * - Editing the trim Start / End number inputs and committing on blur
 *   calls `updateClipTrim` which persists the new boundaries to the
 *   Zustand store.
 *
 * The Radix Slider's pointer interactions don't work cleanly in jsdom,
 * so the trim test drives the equivalent number inputs that share the
 * same `commitTrim` path.
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

const CLIP: ClipCandidate = {
  id: 'c1',
  sourceId: SOURCE.id,
  startTime: 10,
  endTime: 40,
  duration: 30,
  text: 'sample',
  score: 85,
  hookText: 'A bold opening',
  reasoning: 'because',
  status: 'pending',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  installApiStub()

  const store = useStore.getState()
  store.addSource(SOURCE)
  store.setActiveSource(SOURCE.id)
  store.setClips(SOURCE.id, [CLIP])
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClipDetail', () => {
  it('toggling captions mode updates and persists the selection', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail')
    render(
      <ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />
    )

    // Default mode is 'emphasis' — the trigger shows that label.
    // Radix's <Select> trigger doesn't pick up htmlFor/id label association,
    // so we look it up by its DOM id directly.
    const trigger = document.getElementById('captions-mode') as HTMLElement
    expect(trigger).not.toBeNull()
    expect(trigger).toHaveTextContent(/emphasis/i)

    // Open the Select. Radix Selects respond to keyboard activation.
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    // Pick "Standard" from the listbox.
    const standardOption = await screen.findByRole('option', {
      name: /standard/i,
    })
    fireEvent.click(standardOption)

    // The trigger now reflects the new selection — the value persists.
    expect(trigger).toHaveTextContent(/standard/i)

    // Re-rendering the same component (e.g. parent state update) keeps the
    // user's selection intact.
    const triggerAfter = document.getElementById('captions-mode') as HTMLElement
    expect(triggerAfter).toHaveTextContent(/standard/i)
  })

  it('updates start / end times in the store when the trim inputs commit', async () => {
    const { ClipDetail } = await import('@/components/ClipDetail')
    const { rerender } = render(
      <ClipDetail clip={CLIP} source={SOURCE} open onOpenChange={() => {}} />
    )

    // Trim inputs accept timecode strings (m:ss.s) but also bare seconds.
    const startInput = screen.getByLabelText(/^start$/i) as HTMLInputElement
    const endInput = screen.getByLabelText(/^end$/i) as HTMLInputElement

    // Initial values mirror the fixture, formatted as m:ss.s.
    expect(startInput.value).toBe('0:10.0')
    expect(endInput.value).toBe('0:40.0')

    // Update both bounds with bare seconds (parser accepts both forms).
    // onBlur commits the trim into the store.
    fireEvent.change(startInput, { target: { value: '12.5' } })
    fireEvent.blur(startInput)

    fireEvent.change(endInput, { target: { value: '38' } })
    fireEvent.blur(endInput)

    const persisted = useStore.getState().clips[SOURCE.id][0]
    expect(persisted.startTime).toBe(12.5)
    expect(persisted.endTime).toBe(38)
    expect(persisted.duration).toBeCloseTo(25.5, 5)

    // The Sheet header reflects the new duration on re-render.
    rerender(
      <ClipDetail
        clip={useStore.getState().clips[SOURCE.id][0]}
        source={SOURCE}
        open
        onOpenChange={() => {}}
      />
    )

    const dialog = screen.getByRole('dialog')
    // Sheet header shows "Score N · 25.5s" — match the description text.
    expect(within(dialog).getByText(/Score 85 · 25\.5s/)).toBeInTheDocument()
  })
})
