/**
 * DropScreen.test.tsx
 *
 * - File drop on the drop-zone Card dispatches the file pipeline:
 *     • a SourceVideo with `origin: 'file'` is added
 *     • that source becomes active
 *     • `usePipeline().processVideo` is invoked with the new source
 * - Pasting a URL + pressing Enter dispatches the YouTube branch:
 *     • SourceVideo has `origin: 'youtube'` and the URL stored
 *     • processVideo is invoked
 * - Recent projects fetched from `window.api.getRecentProjects()` render
 *   as clickable rows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { useStore } from '@/store'
import { installApiStub, resetStore } from './test-utils'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const processVideoMock = vi.fn(async () => undefined)

vi.mock('@/hooks', () => ({
  usePipeline: () => ({
    processVideo: processVideoMock,
    cancelProcessing: () => {},
    isProcessing: () => false,
  }),
}))

vi.mock('@/services', () => ({
  loadProject: vi.fn(async () => false),
  loadProjectFromPath: vi.fn(async () => false),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore()
  installApiStub()
  processVideoMock.mockClear()
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic File object suitable for jsdom drag-and-drop. */
function makeVideoFile(name = 'clip.mp4'): File {
  return new File([new Uint8Array([0])], name, { type: 'video/mp4' })
}

/** Build a DataTransfer-like object jsdom accepts on drop events. */
function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })) as unknown as DataTransferItemList,
    types: ['Files'],
    dropEffect: 'copy',
    effectAllowed: 'all',
    clearData: () => {},
    getData: () => '',
    setData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DropScreen', () => {
  it('accepts a file drop and dispatches the source action', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen')
    render(<DropScreen />)

    const dropZone = screen.getByRole('button', {
      name: /drop a video file or paste a url/i,
    })

    const file = makeVideoFile('intro.mp4')
    const dataTransfer = makeDataTransfer([file])

    fireEvent.drop(dropZone, { dataTransfer })

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    // Source was added with origin 'file' and is now active.
    const state = useStore.getState()
    expect(state.sources).toHaveLength(1)
    expect(state.sources[0]).toMatchObject({
      origin: 'file',
      path: '/virtual/intro.mp4',
      name: 'intro.mp4',
    })
    expect(state.activeSourceId).toBe(state.sources[0].id)

    expect(processVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'file', path: '/virtual/intro.mp4' })
    )
  })

  it('accepts a URL paste + Enter and dispatches the YouTube action', async () => {
    const { DropScreen } = await import('@/components/screens/DropScreen')
    render(<DropScreen />)

    const input = screen.getByLabelText(/video url or file path/i)
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

    fireEvent.change(input, { target: { value: url } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    const state = useStore.getState()
    expect(state.sources).toHaveLength(1)
    expect(state.sources[0]).toMatchObject({
      origin: 'youtube',
      youtubeUrl: url,
      name: url,
    })
    expect(state.activeSourceId).toBe(state.sources[0].id)
  })

  it('renders recent projects when present', async () => {
    installApiStub({
      getRecentProjects: vi.fn(async () => [
        {
          path: '/projects/alpha.batchclip',
          name: 'Alpha',
          lastOpened: Date.now() - 60_000,
          clipCount: 4,
          sourceCount: 1,
        },
        {
          path: '/projects/beta.batchclip',
          name: 'Beta',
          lastOpened: Date.now() - 3_600_000,
          clipCount: 12,
          sourceCount: 2,
        },
      ]),
    })

    const { DropScreen } = await import('@/components/screens/DropScreen')
    render(<DropScreen />)

    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(await screen.findByText('Beta')).toBeInTheDocument()
    expect(screen.getByText(/4 clips/)).toBeInTheDocument()
    expect(screen.getByText(/12 clips/)).toBeInTheDocument()
  })
})
