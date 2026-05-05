/**
 * project-service.test.ts
 *
 * Round-trips a fully populated store state through the project-service
 * persistence layer and asserts every persisted field survives serialise →
 * deserialise without loss.
 *
 * Two paths are exercised:
 *   1. saveProject  → loadProjectFromPath  (explicit user save / open)
 *   2. autoSaveProject → loadRecovery      (crash-recovery auto-save)
 *
 * `window.api` is mocked with an in-memory virtual filesystem so the IPC
 * surface behaves the same as the production preload bridge.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useStore } from '@/store'
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROCESSING_CONFIG,
  type ProjectFileData,
} from '@/store/helpers'
import type {
  AppSettings,
  ClipCandidate,
  ProcessingConfig,
  SourceVideo,
  TranscriptionData,
} from '@/store/types'

// ---------------------------------------------------------------------------
// Virtual filesystem mock for window.api
// ---------------------------------------------------------------------------

interface VirtualFs {
  saved: Map<string, string>          // path → JSON  (saveProject targets)
  recovery: string | null             // crash-recovery slot
}

const vfs: VirtualFs = {
  saved: new Map(),
  recovery: null,
}

const SAVE_PATH = '/virtual/project.batchclip'

function resetVfs(): void {
  vfs.saved.clear()
  vfs.recovery = null
}

beforeEach(() => {
  resetVfs()

  // Wipe the store back to defaults before every test so we don't leak
  // fixture state between cases. `reset()` clears project data; we also
  // restore the canonical defaults for settings + processingConfig.
  useStore.getState().reset()
  useStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    isDirty: false,
  })
})

// Install a fresh window.api mock once for the whole suite.
;(globalThis as unknown as { window: { api: unknown } }).window =
  (globalThis as unknown as { window?: { api?: unknown } }).window ?? ({} as { api: unknown })

;(window as unknown as { api: Record<string, unknown> }).api = {
  saveProject: vi.fn(async (json: string): Promise<string | null> => {
    vfs.saved.set(SAVE_PATH, json)
    return SAVE_PATH
  }),
  loadProject: vi.fn(async (): Promise<string | null> => {
    return vfs.saved.get(SAVE_PATH) ?? null
  }),
  loadProjectFromPath: vi.fn(async (filePath: string): Promise<string | null> => {
    return vfs.saved.get(filePath) ?? null
  }),
  autoSaveProject: vi.fn(async (json: string): Promise<string> => {
    vfs.recovery = json
    return '/virtual/recovery.batchclip'
  }),
  loadRecovery: vi.fn(async (): Promise<string | null> => {
    return vfs.recovery
  }),
  clearRecovery: vi.fn(async (): Promise<void> => {
    vfs.recovery = null
  }),
}

// Now that window.api is in place, import the service under test. Importing
// after the mock avoids the auto-save subscriber capturing a missing api.
const projectService = await import('./project-service')
const { saveProject, loadProjectFromPath, autoSaveProject, loadRecovery, clearRecovery } =
  projectService

// ---------------------------------------------------------------------------
// Fixture: a fully populated project
// ---------------------------------------------------------------------------

const SOURCE_A: SourceVideo = {
  id: 'src-a',
  path: '/videos/a.mp4',
  name: 'a.mp4',
  duration: 600,
  width: 1920,
  height: 1080,
  thumbnail: 'data:image/png;base64,AAA=',
  origin: 'file',
}

const SOURCE_B: SourceVideo = {
  id: 'src-b',
  path: '/videos/b.mp4',
  name: 'b.mp4',
  duration: 1200,
  width: 3840,
  height: 2160,
  origin: 'file',
}

const SOURCE_C: SourceVideo = {
  id: 'src-c',
  path: '',
  name: 'youtube-clip',
  duration: 420,
  width: 1920,
  height: 1080,
  origin: 'youtube',
  youtubeUrl: 'https://youtu.be/example',
}

const TRANSCRIPTION_A: TranscriptionData = {
  text: 'Hello world this is source A.',
  words: [
    { text: 'Hello', start: 0, end: 0.4 },
    { text: 'world', start: 0.4, end: 0.9 },
    { text: 'this', start: 1.0, end: 1.2 },
    { text: 'is', start: 1.2, end: 1.3 },
    { text: 'source', start: 1.3, end: 1.7 },
    { text: 'A', start: 1.7, end: 1.9 },
  ],
  segments: [
    { text: 'Hello world this is source A.', start: 0, end: 1.9 },
  ],
  formattedForAI: '[0.0] Hello world this is source A.',
}

const TRANSCRIPTION_B: TranscriptionData = {
  text: 'Source B speaks too.',
  words: [
    { text: 'Source', start: 10, end: 10.4 },
    { text: 'B', start: 10.4, end: 10.5 },
    { text: 'speaks', start: 10.5, end: 10.9 },
    { text: 'too', start: 10.9, end: 11.1 },
  ],
  segments: [{ text: 'Source B speaks too.', start: 10, end: 11.1 }],
  formattedForAI: '[10.0] Source B speaks too.',
}

const TRANSCRIPTION_C: TranscriptionData = {
  text: 'Quick clip from YouTube.',
  words: [
    { text: 'Quick', start: 5, end: 5.3 },
    { text: 'clip', start: 5.3, end: 5.6 },
    { text: 'from', start: 5.6, end: 5.8 },
    { text: 'YouTube', start: 5.8, end: 6.4 },
  ],
  segments: [{ text: 'Quick clip from YouTube.', start: 5, end: 6.4 }],
  formattedForAI: '[5.0] Quick clip from YouTube.',
}

function makeClip(
  id: string,
  sourceId: string,
  startTime: number,
  duration: number,
  hookText: string,
  score: number,
): ClipCandidate {
  const endTime = startTime + duration
  return {
    id,
    sourceId,
    startTime,
    endTime,
    duration,
    text: `Body for ${id}`,
    score,
    originalScore: score,
    hookText,
    reasoning: `Picked ${id} because the hook lands and the payoff is fast.`,
    status: score >= 8 ? 'approved' : 'pending',
    cropRegion: {
      x: 100,
      y: 0,
      width: 1080,
      height: 1920,
      faceDetected: true,
    },
    aiStartTime: startTime,
    aiEndTime: endTime,
    thumbnail: `thumb://${id}`,
  }
}

const CLIP_FIXTURES: Record<string, ClipCandidate[]> = {
  [SOURCE_A.id]: [
    makeClip('clip-a1', SOURCE_A.id, 12, 28, 'You won\'t believe step one', 9.4),
    makeClip('clip-a2', SOURCE_A.id, 75, 34, 'The mistake everyone makes', 8.2),
    makeClip('clip-a3', SOURCE_A.id, 210, 22, 'Three numbers that matter', 7.1),
  ],
  [SOURCE_B.id]: [
    makeClip('clip-b1', SOURCE_B.id, 5, 30, 'Stop doing this in 2026', 8.8),
    makeClip('clip-b2', SOURCE_B.id, 400, 40, 'How I 10x\'d in a week', 9.9),
  ],
  [SOURCE_C.id]: [
    makeClip('clip-c1', SOURCE_C.id, 60, 18, 'Quick win for founders', 7.5),
  ],
}

const SETTINGS_FIXTURE: AppSettings = {
  ...DEFAULT_SETTINGS,
  geminiApiKey: 'gem-key-123',
  falApiKey: 'fal-key-456',
  outputDirectory: '/exports/clips',
  minScore: 7.5,
  enableNotifications: false,
  developerMode: true,
  outputAspectRatio: '9:16',
  filenameTemplate: '{source}-{index}-{score}',
  renderConcurrency: 3,
  autoZoom: { ...DEFAULT_SETTINGS.autoZoom, enabled: false, intervalSeconds: 6 },
  hookTitleOverlay: { ...DEFAULT_SETTINGS.hookTitleOverlay, fontSize: 88, textColor: '#FFD400' },
  rehookOverlay: { ...DEFAULT_SETTINGS.rehookOverlay, displayDuration: 2.0 },
  broll: { ...DEFAULT_SETTINGS.broll, enabled: true, pipSize: 0.3 },
  fillerRemoval: {
    ...DEFAULT_SETTINGS.fillerRemoval,
    enabled: false,
    fillerWords: ['um', 'like', 'you know'],
  },
  renderQuality: {
    ...DEFAULT_SETTINGS.renderQuality,
    preset: 'high',
    customCrf: 19,
    encodingPreset: 'medium',
  },
}

const PROCESSING_CONFIG_FIXTURE: ProcessingConfig = {
  targetDuration: '60-90',
  enablePerfectLoop: true,
  clipEndMode: 'extend',
  enableMultiPart: true,
  enableAiEdit: false,
  targetAudience: 'Technical founders shipping AI products end-to-end.',
}

/** Push the full fixture into the store. */
function populateStore(): void {
  useStore.setState({
    sources: [SOURCE_A, SOURCE_B, SOURCE_C],
    transcriptions: {
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    },
    clips: CLIP_FIXTURES,
    settings: SETTINGS_FIXTURE,
    processingConfig: PROCESSING_CONFIG_FIXTURE,
  })
}

/** The expected ProjectFileData shape after a save round-trip. */
function expectedProject(): ProjectFileData {
  return {
    version: 1,
    sources: [SOURCE_A, SOURCE_B, SOURCE_C],
    transcriptions: {
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    },
    clips: CLIP_FIXTURES,
    settings: SETTINGS_FIXTURE,
    processingConfig: PROCESSING_CONFIG_FIXTURE,
  }
}

/**
 * Mirror of the private `applyProject` step — RecoveryDialog and the service's
 * loadProject path use this same shape. Used to deserialise a recovery JSON
 * back into a fresh store and verify equality.
 */
function applyProjectJson(json: string): void {
  const parsed = JSON.parse(json) as Partial<ProjectFileData>
  useStore.setState({
    sources: parsed.sources ?? [],
    transcriptions: parsed.transcriptions ?? {},
    clips: parsed.clips ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    processingConfig: { ...DEFAULT_PROCESSING_CONFIG, ...(parsed.processingConfig ?? {}) },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('project-service · saveProject ↔ loadProjectFromPath round-trip', () => {
  it('serialises every persisted field and restores it exactly into a fresh store', async () => {
    populateStore()

    // ── Serialise via the public save API ────────────────────────────────
    const path = await saveProject()
    expect(path).toBe(SAVE_PATH)
    const json = vfs.saved.get(SAVE_PATH)
    expect(json).toBeTruthy()

    // The on-disk JSON should match the canonical ProjectFileData shape.
    const parsed = JSON.parse(json!) as ProjectFileData
    expect(parsed).toEqual(expectedProject())

    // Save should have flagged the store as clean and triggered a recovery wipe.
    expect(useStore.getState().isDirty).toBe(false)

    // ── Deserialise into a fresh store ───────────────────────────────────
    useStore.getState().reset()
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    })

    // Pre-condition: the fresh store really is empty.
    expect(useStore.getState().sources).toEqual([])
    expect(useStore.getState().clips).toEqual({})
    expect(useStore.getState().transcriptions).toEqual({})

    const ok = await loadProjectFromPath(SAVE_PATH)
    expect(ok).toBe(true)

    // ── Deep-equality on every persisted field ───────────────────────────
    const state = useStore.getState()
    expect(state.sources).toEqual([SOURCE_A, SOURCE_B, SOURCE_C])
    expect(state.transcriptions).toEqual({
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    })
    expect(state.clips).toEqual(CLIP_FIXTURES)
    expect(state.settings).toEqual(SETTINGS_FIXTURE)
    expect(state.processingConfig).toEqual(PROCESSING_CONFIG_FIXTURE)

    // Hook text + score made the round trip on every clip.
    const allClips = Object.values(state.clips).flat()
    expect(allClips).toHaveLength(6)
    for (const clip of allClips) {
      expect(typeof clip.hookText).toBe('string')
      expect(clip.hookText.length).toBeGreaterThan(0)
      expect(typeof clip.score).toBe('number')
    }

    // applyProject sets activeSourceId to the first source when clips exist.
    expect(state.activeSourceId).toBe(SOURCE_A.id)
    expect(state.pipeline.stage).toBe('ready')
    // Note: a microtask-scheduled subscriber re-marks isDirty=true when
    // `clips` changes, so we can't assert isDirty here without racing it.
    // The save-side isDirty=false assertion above already covers the contract.
  })
})

describe('project-service · autoSaveProject ↔ loadRecovery round-trip', () => {
  it('writes recovery JSON, reads it back, and restores the store identically', async () => {
    populateStore()

    // ── Trigger an auto-save ─────────────────────────────────────────────
    await autoSaveProject()
    expect(vfs.recovery).toBeTruthy()

    const recoveryJson = vfs.recovery!
    const parsed = JSON.parse(recoveryJson) as ProjectFileData
    expect(parsed).toEqual(expectedProject())

    // ── Reset to a fresh store and load the recovery payload ─────────────
    useStore.getState().reset()
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    })
    expect(useStore.getState().sources).toEqual([])
    expect(useStore.getState().clips).toEqual({})

    const data = await loadRecovery()
    expect(data).toBe(recoveryJson)
    expect(data).not.toBeNull()

    applyProjectJson(data!)

    // ── Deep-equality on every persisted field ───────────────────────────
    const state = useStore.getState()
    expect(state.sources).toEqual([SOURCE_A, SOURCE_B, SOURCE_C])
    expect(state.transcriptions).toEqual({
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    })
    expect(state.clips).toEqual(CLIP_FIXTURES)
    expect(state.settings).toEqual(SETTINGS_FIXTURE)
    expect(state.processingConfig).toEqual(PROCESSING_CONFIG_FIXTURE)

    // Six clips total, every hook text + score preserved.
    const allClips = Object.values(state.clips).flat()
    expect(allClips).toHaveLength(6)
    expect(allClips.map((c) => c.hookText)).toEqual([
      'You won\'t believe step one',
      'The mistake everyone makes',
      'Three numbers that matter',
      'Stop doing this in 2026',
      'How I 10x\'d in a week',
      'Quick win for founders',
    ])
    expect(allClips.map((c) => c.score)).toEqual([9.4, 8.2, 7.1, 8.8, 9.9, 7.5])
  })

  it('autoSaveProject skips when there are no clips (no recovery file written)', async () => {
    // Reset gives us a store with empty clips.
    useStore.getState().reset()
    expect(vfs.recovery).toBeNull()

    await autoSaveProject()
    expect(vfs.recovery).toBeNull()
  })
})

describe('project-service · clearRecovery', () => {
  it('deletes the recovery file', async () => {
    populateStore()
    await autoSaveProject()
    expect(vfs.recovery).toBeTruthy()

    await clearRecovery()
    expect(vfs.recovery).toBeNull()

    // After deletion, loadRecovery resolves to null.
    const data = await loadRecovery()
    expect(data).toBeNull()
  })

  it('saveProject clears recovery as a side-effect', async () => {
    // Seed a recovery file first.
    populateStore()
    await autoSaveProject()
    expect(vfs.recovery).toBeTruthy()

    // saveProject is documented to wipe recovery on success — the call is
    // fire-and-forget so we await a microtask flush before asserting.
    await saveProject()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(vfs.recovery).toBeNull()
  })
})
