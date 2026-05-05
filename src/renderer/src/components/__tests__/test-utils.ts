/**
 * Shared test utilities for component tests.
 *
 * - `resetStore()` wipes the Zustand store back to its initial slice values
 *   so tests don't leak fixture state through the singleton instance.
 * - `installApiStub()` swaps `window.api` with a fully-stubbed bridge so the
 *   components under test can call IPC methods without crashing the suite.
 */

import { vi } from 'vitest'
import { useStore } from '@/store'

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

export function resetStore(): void {
  // The store exposes a `reset()` action that returns project state to its
  // empty defaults. We also reset auxiliary fields the tests touch directly.
  useStore.getState().reset()
  useStore.setState({
    sources: [],
    activeSourceId: null,
    transcriptions: {},
    isDirty: false,
  })
}

// ---------------------------------------------------------------------------
// window.api stub
// ---------------------------------------------------------------------------

/**
 * Allow tests to override individual API methods. Returns the stub object
 * so individual mocks can be inspected via `vi.mocked(...)`.
 */
export function installApiStub(overrides: Record<string, unknown> = {}): Record<string, ReturnType<typeof vi.fn>> {
  const noop = (): void => {}
  const unsubscribe = (): (() => void) => () => {}

  const stub: Record<string, ReturnType<typeof vi.fn>> = {
    // Source / dialog
    openFiles: vi.fn(async () => []),
    openDirectory: vi.fn(async () => null),
    getPathForFile: vi.fn((file: File) => `/virtual/${file.name}`),
    getMetadata: vi.fn(async () => ({ duration: 60, width: 1920, height: 1080 })),
    extractAudio: vi.fn(async () => '/virtual/audio.wav'),
    getThumbnail: vi.fn(async () => 'data:image/png;base64,'),
    getWaveform: vi.fn(async () => Array(100).fill(0)),

    // YouTube
    downloadYouTube: vi.fn(async () => ({ ok: true, path: '/virtual/yt.mp4' })),
    onYouTubeProgress: vi.fn(unsubscribe),

    // Transcription
    transcribeVideo: vi.fn(async () => ({ words: [], segments: [], language: 'en' })),
    formatTranscriptForAI: vi.fn(async () => ''),
    onTranscribeProgress: vi.fn(unsubscribe),

    // Project
    getRecentProjects: vi.fn(async () => []),
    addRecentProject: vi.fn(async () => undefined),
    saveProject: vi.fn(async () => '/virtual/project.batchclip'),
    loadProject: vi.fn(async () => null),
    loadProjectFromPath: vi.fn(async () => null),
    autoSaveProject: vi.fn(async () => '/virtual/recovery.batchclip'),
    loadRecovery: vi.fn(async () => null),
    clearRecovery: vi.fn(async () => undefined),

    // Render
    startBatchRender: vi.fn(async () => ({ started: true })),
    cancelRender: vi.fn(async () => undefined),
    renderSingleClip: vi.fn(async () => ({ ok: true })),
    onRenderClipStart: vi.fn(unsubscribe),
    onRenderClipProgress: vi.fn(unsubscribe),
    onRenderClipDone: vi.fn(unsubscribe),
    onRenderClipError: vi.fn(unsubscribe),
    onRenderBatchDone: vi.fn(unsubscribe),
    onRenderCancelled: vi.fn(unsubscribe),
    openOutputFolder: vi.fn(async () => ''),

    // Clip detail
    regenerateClipEditPlan: vi.fn(async () => ({ ok: true })),

    // Misc
    setBadge: vi.fn(noop),
  }

  Object.assign(stub, overrides)

  const g = globalThis as unknown as { window?: { api?: unknown } }
  if (!g.window) {
    g.window = { api: stub } as unknown as Window & typeof globalThis
  }
  ;(window as unknown as { api: Record<string, unknown> }).api = stub

  return stub
}
