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

import { createStructuredError } from '@shared/errors';
import type { ProjectIdentity, ProjectLoadResult, ProjectSaveOptions } from '@shared/project';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/store';
import {
  DEFAULT_PROCESSING_CONFIG,
  DEFAULT_SETTINGS,
  PROJECT_SCHEMA_VERSION,
  type ProjectFileData,
  type ProjectSettings,
} from '@/store/helpers';
import { selectActiveScreen, selectIsLongformOnly } from '@/store/selectors';
import type {
  AppSettings,
  ClipCandidate,
  CreativeBrief,
  PipelineStage,
  ProcessingConfig,
  ProjectWorkspace,
  PromoProjectPlan,
  RenderProgress,
  SourceVideo,
  TranscriptionData,
} from '@/store/types';
import {
  createCreatorProfile,
  deleteCreatorProfile,
  getCreatorProfiles,
  updateCreatorProfile,
} from './creator-profiles';
import {
  autoSaveProject,
  clearRecovery,
  createNewProject,
  loadProjectFromPath,
  loadRecovery,
  migrateProjectJson,
  parseRecoverySnapshot,
  restoreProject,
  resumeLastProject,
  saveProject,
  saveProjectAs,
} from './project-service';

// ---------------------------------------------------------------------------
// Virtual filesystem mock for window.api
// ---------------------------------------------------------------------------

interface VirtualFs {
  saved: Map<string, string>; // path → JSON  (saveProject targets)
  recovery: string | null; // crash-recovery slot
}

const vfs: VirtualFs = {
  saved: new Map(),
  recovery: null,
};

const SAVE_PATH = '/virtual/project.batchclip';
const PROJECT_IDENTITY: ProjectIdentity = {
  id: 'project-fixture-id',
  displayName: 'Creator Launch Cut',
  filePath: null,
  createdAt: 1_700_000_000_000,
  modifiedAt: 1_700_000_000_000,
  schemaVersion: PROJECT_SCHEMA_VERSION,
};
vi.spyOn(Date, 'now').mockReturnValue(PROJECT_IDENTITY.modifiedAt);

it('saves per-source cadence without leaking between sources or projects', async () => {
  useStore.setState({ sources: [SOURCE_A, SOURCE_B] });
  useStore.getState().updateSource(SOURCE_A.id, { longformEditCadence: 'continuous' });
  expect(useStore.getState().sources[1]?.longformEditCadence).toBeUndefined();
  await saveProject();
  createNewProject();
  await loadProjectFromPath(SAVE_PATH);
  expect(useStore.getState().sources.map((source) => source.longformEditCadence)).toEqual([
    'continuous',
    'selective',
  ]);
  const json = JSON.parse(vfs.saved.get(SAVE_PATH) ?? '{}');
  json.sources[0].longformEditCadence = 'unknown';
  restoreProject(JSON.stringify(json));
  expect(useStore.getState().sources[0]?.longformEditCadence).toBe('selective');
});

function resetVfs(): void {
  vfs.saved.clear();
  vfs.recovery = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetVfs();

  // Wipe the store back to defaults before every test so we don't leak
  // fixture state between cases. `reset()` clears project data; we also
  // restore the canonical defaults for settings + processingConfig.
  useStore.getState().reset();
  useStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    isDirty: false,
  });
});

(window as unknown as { api: Record<string, unknown> }).api = {
  saveProject: vi.fn(async (json: string, _options: ProjectSaveOptions): Promise<string | null> => {
    const project = JSON.parse(json) as ProjectFileData;
    project.identity.filePath = SAVE_PATH;
    vfs.saved.set(SAVE_PATH, JSON.stringify(project, null, 2));
    return SAVE_PATH;
  }),
  loadProject: vi.fn(async (): Promise<ProjectLoadResult | null> => {
    const json = vfs.saved.get(SAVE_PATH);
    return json ? { json, filePath: SAVE_PATH } : null;
  }),
  loadProjectFromPath: vi.fn(async (filePath: string): Promise<ProjectLoadResult | null> => {
    const json = vfs.saved.get(filePath);
    return json ? { json, filePath } : null;
  }),
  autoSaveProject: vi.fn(async (json: string, currentPath: string | null): Promise<string> => {
    vfs.recovery = json;
    if (currentPath) {
      const project = JSON.parse(json) as ProjectFileData;
      delete project.recovery;
      vfs.saved.set(currentPath, JSON.stringify(project));
    }
    return '/virtual/recovery.batchclip';
  }),
  loadRecovery: vi.fn(async (): Promise<string | null> => {
    return vfs.recovery;
  }),
  clearRecovery: vi.fn(async (): Promise<void> => {
    vfs.recovery = null;
  }),
};

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
};

const SOURCE_B: SourceVideo = {
  id: 'src-b',
  path: '/videos/b.mp4',
  name: 'b.mp4',
  duration: 1200,
  width: 3840,
  height: 2160,
  origin: 'file',
};

const SOURCE_C: SourceVideo = {
  id: 'src-c',
  path: '',
  name: 'youtube-clip',
  duration: 420,
  width: 1920,
  height: 1080,
  origin: 'youtube',
  youtubeUrl: 'https://youtu.be/example',
};

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
  segments: [{ text: 'Hello world this is source A.', start: 0, end: 1.9 }],
  formattedForAI: '[0.0] Hello world this is source A.',
};

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
};

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
};

function makeClip(
  id: string,
  sourceId: string,
  startTime: number,
  duration: number,
  hookText: string,
  score: number,
): ClipCandidate {
  const endTime = startTime + duration;
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
  };
}

const CLIP_FIXTURES: Record<string, ClipCandidate[]> = {
  [SOURCE_A.id]: [
    makeClip('clip-a1', SOURCE_A.id, 12, 28, "You won't believe step one", 9.4),
    makeClip('clip-a2', SOURCE_A.id, 75, 34, 'The mistake everyone makes', 8.2),
    makeClip('clip-a3', SOURCE_A.id, 210, 22, 'Three numbers that matter', 7.1),
  ],
  [SOURCE_B.id]: [
    makeClip('clip-b1', SOURCE_B.id, 5, 30, 'Stop doing this in 2026', 8.8),
    makeClip('clip-b2', SOURCE_B.id, 400, 40, "How I 10x'd in a week", 9.9),
  ],
  [SOURCE_C.id]: [makeClip('clip-c1', SOURCE_C.id, 60, 18, 'Quick win for founders', 7.5)],
};

const SETTINGS_FIXTURE: AppSettings = {
  ...DEFAULT_SETTINGS,
  geminiApiKey: 'gem-key-123',
  falApiKey: 'fal-key-456',
  pexelsApiKey: 'pexels-key-789',
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
    // Custom word list — the preset field tracks that we've diverged from
    // the canonical "let-it-ride" word list.
    preset: 'custom',
    fillerWords: ['um', 'like', 'you know'],
  },
  renderQuality: {
    ...DEFAULT_SETTINGS.renderQuality,
    preset: 'high',
    customCrf: 19,
    encodingPreset: 'medium',
  },
};

const CREDENTIAL_FIELD_NAMES = ['geminiApiKey', 'pexelsApiKey', 'falApiKey', 'apiKey'];

function expectCredentialFree(json: string): void {
  for (const field of CREDENTIAL_FIELD_NAMES) expect(json).not.toContain(`"${field}"`);
  expect(json).not.toContain(SETTINGS_FIXTURE.geminiApiKey);
  expect(json).not.toContain(SETTINGS_FIXTURE.pexelsApiKey);
  expect(json).not.toContain(SETTINGS_FIXTURE.falApiKey);
}

const PLAN_FIXTURE = {
  [SOURCE_B.id]: {
    plan: {
      phrases: [],
      blocks: [],
      reasoning: 'Keep the founder claim and proof adjacent.',
      generatedAt: 1_700_000_000_000,
    },
    skin: 'editorial' as const,
    paletteId: 'brand',
  },
};

const WORKSPACE_FIXTURE: ProjectWorkspace = {
  stage: 'ready',
  activeSourceId: SOURCE_B.id,
  selectedClipId: 'clip-b2',
  clipFilter: 'approved',
  clipSort: 'source-time',
  inspectorTab: 'transcript',
  gridScrollTop: 684,
  previewPlayheadByClip: { 'clip-b2': 412.75 },
};

const CREATIVE_BRIEF_FIELDS = {
  audience: 'Technical founders',
  goal: 'Drive qualified demo requests',
  callToAction: 'Book a product walkthrough',
  tone: 'Direct and evidence-led',
  mustInclude: 'The 10x workflow result',
  prohibitedClaims: 'Guaranteed revenue',
  notes: 'Lead with the founder story.',
};

const CREATIVE_BRIEF_FIXTURE: CreativeBrief = {
  ...CREATIVE_BRIEF_FIELDS,
  committed: { ...CREATIVE_BRIEF_FIELDS },
  savedAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
};

const RENDER_PROGRESS_FIXTURE: RenderProgress[] = [
  {
    clipId: 'clip-b2',
    percent: 100,
    status: 'done',
    outputPath: '/exports/clips/founder-workflow.mp4',
  },
  { clipId: 'clip-b1', percent: 0, status: 'queued' },
];

const PROMO_PLAN_FIXTURE: PromoProjectPlan = {
  beats: [
    {
      id: 'promo-beat-1',
      script: 'Show the launch workflow with real product evidence.',
      evidenceCategory: 'app-ui',
      evidenceAssetPath: '/brand-assets/product.png',
    },
  ],
  ctaSource: 'profile',
  ctaAssetPath: '/brand-assets/join.png',
  reviewedAt: '2026-07-17T12:05:00.000Z',
};

const PROCESSING_CONFIG_FIXTURE: ProcessingConfig = {
  targetDuration: '60-90',
  enablePerfectLoop: true,
  clipEndMode: 'completion-first',
  enableMultiPart: true,
  enableAiEdit: false,
  targetAudience: 'Technical founders shipping AI products end-to-end.',
  promoMode: false,
};

/** Push the full fixture into the store. */
function populateStore(): void {
  useStore.setState({
    currentProject: { ...PROJECT_IDENTITY },
    sources: [SOURCE_A, SOURCE_B, SOURCE_C],
    activeSourceId: SOURCE_B.id,
    transcriptions: {
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    },
    clips: CLIP_FIXTURES,
    longformPlans: PLAN_FIXTURE,
    settings: SETTINGS_FIXTURE,
    processingConfig: PROCESSING_CONFIG_FIXTURE,
    pipeline: { stage: 'ready', message: '', percent: 100 },
    workspace: WORKSPACE_FIXTURE,
    creativeBrief: CREATIVE_BRIEF_FIXTURE,
    creatorProfile: { profileId: 'profile-founder', overrides: { tone: 'Punchy' } },
    promoPlan: PROMO_PLAN_FIXTURE,
    renderProgress: RENDER_PROGRESS_FIXTURE,
    renderStartedAt: 1_700_000_000_000,
    renderCompletedAt: 1_700_000_060_000,
  });
}

function expectedProjectSettings(): ProjectSettings {
  return {
    minScore: SETTINGS_FIXTURE.minScore,
    creatorPreset: SETTINGS_FIXTURE.creatorPreset,
    captionsEnabled: SETTINGS_FIXTURE.captionsEnabled,
    captionMode: SETTINGS_FIXTURE.captionMode,
    wordEmphasisEnabled: SETTINGS_FIXTURE.wordEmphasisEnabled,
    shotTransitionsEnabled: SETTINGS_FIXTURE.shotTransitionsEnabled,
    explainerScenesEnabled: SETTINGS_FIXTURE.explainerScenesEnabled,
    autoZoom: SETTINGS_FIXTURE.autoZoom,
    hookTitleOverlay: SETTINGS_FIXTURE.hookTitleOverlay,
    rehookOverlay: SETTINGS_FIXTURE.rehookOverlay,
    broll: SETTINGS_FIXTURE.broll,
    promo: SETTINGS_FIXTURE.promo,
    fillerRemoval: SETTINGS_FIXTURE.fillerRemoval,
    renderQuality: SETTINGS_FIXTURE.renderQuality,
    outputAspectRatio: SETTINGS_FIXTURE.outputAspectRatio,
    filenameTemplate: SETTINGS_FIXTURE.filenameTemplate,
    templateLayout: SETTINGS_FIXTURE.templateLayout,
    targetPlatform: SETTINGS_FIXTURE.targetPlatform,
    outputMode: SETTINGS_FIXTURE.outputMode,
    longformSkin: SETTINGS_FIXTURE.longformSkin,
    longformStoryboardStyle: SETTINGS_FIXTURE.longformStoryboardStyle,
    longformPaletteId: SETTINGS_FIXTURE.longformPaletteId,
  };
}

/** The expected credential-free ProjectFileData shape after a save round-trip. */
function expectedProject(filePath: string | null = null): ProjectFileData {
  return {
    version: PROJECT_SCHEMA_VERSION,
    identity: { ...PROJECT_IDENTITY, filePath },
    sources: [SOURCE_A, SOURCE_B, SOURCE_C],
    transcriptions: {
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    },
    clips: CLIP_FIXTURES,
    stitchedClips: {},
    longformPlans: PLAN_FIXTURE,
    settings: expectedProjectSettings(),
    processingConfig: PROCESSING_CONFIG_FIXTURE,
    workspace: WORKSPACE_FIXTURE,
    creativeBrief: CREATIVE_BRIEF_FIXTURE,
    creatorProfile: { profileId: 'profile-founder', overrides: { tone: 'Punchy' } },
    promoPlan: PROMO_PLAN_FIXTURE,
    renderState: {
      progress: RENDER_PROGRESS_FIXTURE,
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_060_000,
    },
  };
}

/**
 * Mirror of the private `applyProject` step — RecoveryDialog and the service's
 * loadProject path use this same shape. Used to deserialise a recovery JSON
 * back into a fresh store and verify equality.
 */
function applyProjectJson(json: string): void {
  restoreProject(json);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('project-service · saveProject ↔ loadProjectFromPath round-trip', () => {
  it('serialises every persisted field and restores it exactly into a fresh store', async () => {
    populateStore();

    // ── Serialise via the public save API ────────────────────────────────
    const path = await saveProject();
    expect(path).toBe(SAVE_PATH);
    const json = vfs.saved.get(SAVE_PATH);
    expect(json).toBeTruthy();
    if (json === undefined) throw new Error('Expected saved project JSON');

    // The on-disk JSON should match the canonical ProjectFileData shape.
    const parsed = JSON.parse(json) as ProjectFileData;
    expect(parsed).toEqual(expectedProject(SAVE_PATH));
    expectCredentialFree(json);

    // Save should have flagged the store as clean and triggered a recovery wipe.
    expect(useStore.getState().isDirty).toBe(false);

    // ── Deserialise into a fresh store ───────────────────────────────────
    useStore.getState().reset();
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    });

    // Pre-condition: the fresh store really is empty.
    expect(useStore.getState().sources).toEqual([]);
    expect(useStore.getState().clips).toEqual({});
    expect(useStore.getState().transcriptions).toEqual({});

    const ok = await loadProjectFromPath(SAVE_PATH);
    expect(ok).toBe(true);

    // ── Deep-equality on every persisted field ───────────────────────────
    const state = useStore.getState();
    expect(state.sources).toEqual([
      { ...SOURCE_A, longformEditCadence: 'selective', mediaStatus: 'checking' },
      { ...SOURCE_B, longformEditCadence: 'selective', mediaStatus: 'checking' },
      { ...SOURCE_C, longformEditCadence: 'selective', mediaStatus: 'online' },
    ]);
    expect(state.transcriptions).toEqual({
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    });
    expect(state.clips).toEqual(CLIP_FIXTURES);
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, ...expectedProjectSettings() });
    expect(state.processingConfig).toEqual(PROCESSING_CONFIG_FIXTURE);

    // Hook text + score made the round trip on every clip.
    const allClips = Object.values(state.clips).flat();
    expect(allClips).toHaveLength(6);
    for (const clip of allClips) {
      expect(typeof clip.hookText).toBe('string');
      expect(clip.hookText.length).toBeGreaterThan(0);
      expect(typeof clip.score).toBe('number');
    }

    expect(state.activeSourceId).toBe(SOURCE_B.id);
    expect(state.pipeline.stage).toBe('ready');
    expect(state.workspace).toEqual(WORKSPACE_FIXTURE);
    expect(state.creativeBrief).toEqual(CREATIVE_BRIEF_FIXTURE);
    expect(state.promoPlan).toEqual(PROMO_PLAN_FIXTURE);
    expect(state.renderProgress).toEqual(RENDER_PROGRESS_FIXTURE);
    expect(state.currentProject).toEqual(expectedProject(SAVE_PATH).identity);
    expect(state.isDirty).toBe(false);
  });
});

describe('project-service · exact-session resume', () => {
  it('does not persist scene focus and clears a previous project target on load', async () => {
    populateStore();
    useStore.setState({
      longformReviewFocus: { sourceId: SOURCE_A.id, sceneId: 'previous-project-scene' },
    });
    expect(await saveProject()).toBe(SAVE_PATH);
    expect(vfs.saved.get(SAVE_PATH)).not.toContain('longformReviewFocus');

    expect(await loadProjectFromPath(SAVE_PATH)).toBe(true);
    expect(useStore.getState().longformReviewFocus).toBeNull();
    expect(useStore.getState().longformPlans).toEqual(PLAN_FIXTURE);
    expect(useStore.getState().renderProgress).toEqual(RENDER_PROGRESS_FIXTURE);
  });

  it('reopens the last project with stage, source, clip, filters, inspector, scroll, playhead, brief, plan, and queue intact', async () => {
    populateStore();
    expect(await saveProject()).toBe(SAVE_PATH);

    useStore.getState().reset();
    useStore.setState({
      failedPipelineStage: 'scoring',
      completedPipelineStages: new Set<PipelineStage>(['transcribing']),
      cachedSourcePath: '/stale-session/source.mp4',
      activeEncoder: { encoder: 'stale', isHardware: false },
      renderErrors: {
        stale: createStructuredError({ source: 'render', message: 'Old project failure' }),
      },
      singleRenderClipId: 'stale-clip',
      singleRenderProgress: 77,
      singleRenderStatus: 'rendering',
      singleRenderOutputPath: '/stale-session/output.mp4',
      singleRenderError: 'Old project error',
      selectedClipIndex: 12,
    });
    expect(useStore.getState().pipeline.stage).toBe('idle');

    expect(await resumeLastProject()).toBe(true);
    const state = useStore.getState();
    expect(state.pipeline.stage).toBe('ready');
    expect(state.activeSourceId).toBe(SOURCE_B.id);
    expect(state.workspace).toEqual(WORKSPACE_FIXTURE);
    expect(state.creativeBrief).toEqual(CREATIVE_BRIEF_FIXTURE);
    expect(state.longformPlans).toEqual(PLAN_FIXTURE);
    expect(state.renderProgress).toEqual(RENDER_PROGRESS_FIXTURE);
    expect(state.failedPipelineStage).toBeNull();
    expect(state.completedPipelineStages).toEqual(new Set());
    expect(state.cachedSourcePath).toBeNull();
    expect(state.activeEncoder).toBeNull();
    expect(state.renderErrors).toEqual({});
    expect(state.singleRenderStatus).toBe('idle');
    expect(state.singleRenderClipId).toBeNull();
    expect(state.singleRenderOutputPath).toBeNull();
    expect(state.singleRenderError).toBeNull();
    expect(state.selectedClipIndex).toBe(0);
  });
});

describe('project-service · desktop save semantics', () => {
  it('reuses the first saved path and only forces a dialog for Save As', async () => {
    populateStore();

    expect(await saveProject()).toBe(SAVE_PATH);
    useStore.setState({ clips: { ...useStore.getState().clips } });
    expect(await saveProject()).toBe(SAVE_PATH);
    expect(await saveProjectAs()).toBe(SAVE_PATH);

    const calls = vi.mocked(window.api.saveProject).mock.calls;
    expect(calls[0]?.[1]).toMatchObject({ currentPath: null, forceDialog: false });
    expect(calls[1]?.[1]).toMatchObject({ currentPath: SAVE_PATH, forceDialog: false });
    expect(calls[2]?.[1]).toMatchObject({ currentPath: SAVE_PATH, forceDialog: true });
  });

  it('starts a clean project, clears resume identity, and removes stale recovery', async () => {
    populateStore();
    await saveProject();
    vfs.recovery = 'stale recovery';

    createNewProject();

    expect(useStore.getState()).toMatchObject({
      sources: [],
      activeSourceId: null,
      clips: {},
      pipeline: { stage: 'idle', message: '', percent: 0 },
      isDirty: false,
    });
    expect(useStore.getState().currentProject.filePath).toBeNull();
    expect(localStorage.getItem('batchclip-last-project-path')).toBeNull();
    // saveProject clears the prior recovery, then createNewProject clears any newly stale snapshot.
    expect(window.api.clearRecovery).toHaveBeenCalledTimes(2);
    expect(vfs.recovery).toBeNull();
  });

  it('keeps the project dirty and exposes a retryable status when a save fails', async () => {
    populateStore();
    vi.mocked(window.api.saveProject).mockRejectedValueOnce(new Error('Disk is read-only'));

    expect(await saveProject()).toBeNull();

    expect(useStore.getState()).toMatchObject({
      isDirty: true,
      saveStatus: 'error',
      lastSaveError: 'Disk is read-only',
    });
  });

  it('autosaves both the current project file and the recovery snapshot', async () => {
    populateStore();
    await saveProject();
    useStore.setState({ clips: { ...useStore.getState().clips } });

    await autoSaveProject();

    expect(vfs.recovery).not.toBeNull();
    const savedProject = vfs.saved.get(SAVE_PATH);
    expect(savedProject).toBeTruthy();
    expect(JSON.parse(savedProject ?? '{}')).not.toHaveProperty('recovery');
    expect(JSON.parse(vfs.recovery ?? '{}')).toHaveProperty('recovery.id');
    expect(vi.mocked(window.api.autoSaveProject).mock.calls.at(-1)?.[1]).toBe(SAVE_PATH);
    expect(useStore.getState()).toMatchObject({ isDirty: false, saveStatus: 'saved' });
  });

  it('can refresh crash recovery without overwriting the current project file', async () => {
    populateStore();
    await saveProject();
    const projectBeforeRecovery = vfs.saved.get(SAVE_PATH);
    useStore.setState({ clips: { ...useStore.getState().clips } });

    await autoSaveProject({ recoveryOnly: true });

    expect(vfs.recovery).not.toBeNull();
    expect(vfs.saved.get(SAVE_PATH)).toBe(projectBeforeRecovery);
    expect(vi.mocked(window.api.autoSaveProject).mock.calls.at(-1)?.[1]).toBeNull();
    expect(useStore.getState()).toMatchObject({ isDirty: true, saveStatus: 'dirty' });
  });

  it('honors the configured autosave debounce interval', async () => {
    vi.useFakeTimers();
    try {
      populateStore();
      useStore.setState((state) => ({
        settings: { ...state.settings, autosaveIntervalMs: 10_000 },
      }));

      await vi.advanceTimersByTimeAsync(9_999);
      expect(vfs.recovery).toBeNull();

      await vi.advanceTimersByTimeAsync(1);
      expect(vfs.recovery).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('project-service · autoSaveProject ↔ loadRecovery round-trip', () => {
  it('writes recovery JSON, reads it back, and restores the store identically', async () => {
    populateStore();

    // ── Trigger an auto-save ─────────────────────────────────────────────
    await autoSaveProject();
    expect(vfs.recovery).toBeTruthy();

    const recoveryJson = vfs.recovery;
    if (recoveryJson === null) throw new Error('Expected recovery JSON');
    const parsed = JSON.parse(recoveryJson) as ProjectFileData;
    expect(parsed).toMatchObject(expectedProject());
    expect(parsed.recovery).toMatchObject({
      savedAt: PROJECT_IDENTITY.modifiedAt,
      stage: 'ready',
    });
    expect(parsed.recovery?.id).toEqual(expect.any(String));
    expectCredentialFree(recoveryJson);

    // ── Reset to a fresh store and load the recovery payload ─────────────
    useStore.getState().reset();
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    });
    expect(useStore.getState().sources).toEqual([]);
    expect(useStore.getState().clips).toEqual({});

    const data = await loadRecovery();
    expect(data).not.toBeNull();
    if (data === null) throw new Error('Expected recovery data');
    expect(data).toMatchObject({
      id: parsed.recovery?.id,
      projectName: PROJECT_IDENTITY.displayName,
      sourceName: SOURCE_A.name,
      stage: 'ready',
      counts: { sources: 3, transcripts: 3, clips: 6, editPlans: 1 },
    });

    applyProjectJson(data.json);

    // ── Deep-equality on every persisted field ───────────────────────────
    const state = useStore.getState();
    expect(state.sources).toEqual([
      { ...SOURCE_A, longformEditCadence: 'selective', mediaStatus: 'checking' },
      { ...SOURCE_B, longformEditCadence: 'selective', mediaStatus: 'checking' },
      { ...SOURCE_C, longformEditCadence: 'selective', mediaStatus: 'online' },
    ]);
    expect(state.transcriptions).toEqual({
      [SOURCE_A.id]: TRANSCRIPTION_A,
      [SOURCE_B.id]: TRANSCRIPTION_B,
      [SOURCE_C.id]: TRANSCRIPTION_C,
    });
    expect(state.clips).toEqual(CLIP_FIXTURES);
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, ...expectedProjectSettings() });
    expect(state.processingConfig).toEqual(PROCESSING_CONFIG_FIXTURE);

    // Six clips total, every hook text + score preserved.
    const allClips = Object.values(state.clips).flat();
    expect(allClips).toHaveLength(6);
    expect(allClips.map((c) => c.hookText)).toEqual([
      "You won't believe step one",
      'The mistake everyone makes',
      'Three numbers that matter',
      'Stop doing this in 2026',
      "How I 10x'd in a week",
      'Quick win for founders',
    ]);
    expect(allClips.map((c) => c.score)).toEqual([9.4, 8.2, 7.1, 8.8, 9.9, 7.5]);
  });

  it('gives every new autosave its own recovery identity', async () => {
    populateStore();
    await autoSaveProject();
    const first = JSON.parse(vfs.recovery ?? '{}') as ProjectFileData;

    await autoSaveProject();
    const second = JSON.parse(vfs.recovery ?? '{}') as ProjectFileData;

    expect(first.recovery?.id).toEqual(expect.any(String));
    expect(second.recovery?.id).toEqual(expect.any(String));
    expect(second.recovery?.id).not.toBe(first.recovery?.id);
  });

  it('derives a stable hash identity for legacy snapshots', () => {
    const legacyJson = JSON.stringify({
      version: 1,
      sources: [SOURCE_A],
      transcriptions: {},
      clips: {},
      settings: {},
    });

    expect(parseRecoverySnapshot(legacyJson).id).toBe(parseRecoverySnapshot(legacyJson).id);
    expect(parseRecoverySnapshot(legacyJson).id).toMatch(/^legacy-/);
  });

  it('normalizes out-of-range recovery dates before they reach the dialog', () => {
    const recovery = parseRecoverySnapshot(
      JSON.stringify({
        version: 3,
        identity: { ...PROJECT_IDENTITY, modifiedAt: 1e300 },
        recovery: { id: 'invalid-date', savedAt: 1e300, stage: 'ready' },
        sources: [SOURCE_A],
        transcriptions: {},
        clips: {},
        settings: {},
      }),
    );

    expect(recovery.savedAt).toBe(PROJECT_IDENTITY.modifiedAt);
    expect(recovery.id).toMatch(/^legacy-/);
  });

  it('marks recovered work dirty so it is protected by the next autosave', async () => {
    populateStore();
    await autoSaveProject();
    const recovery = await loadRecovery();
    if (!recovery) throw new Error('Expected recovery data');

    useStore.getState().reset();
    restoreProject(recovery.json, undefined, { recovered: true });

    expect(useStore.getState()).toMatchObject({
      isDirty: true,
      saveStatus: 'dirty',
      projectRevision: 1,
    });
  });

  it('autoSaveProject skips when there are no clips (no recovery file written)', async () => {
    // Reset gives us a store with empty clips.
    useStore.getState().reset();
    expect(vfs.recovery).toBeNull();

    await autoSaveProject();
    expect(vfs.recovery).toBeNull();
  });
});

describe('project-service · credential and settings scope migration', () => {
  it('migrates legacy files without emitting or applying embedded credentials', async () => {
    const legacy = {
      ...expectedProject(),
      version: 1,
      settings: SETTINGS_FIXTURE,
      futureProvider: { apiKey: 'future-provider-secret' },
    };
    const legacyJson = JSON.stringify(legacy);

    const migratedJson = migrateProjectJson(legacyJson, true);
    const migrated = JSON.parse(migratedJson) as ProjectFileData;
    expect(migrated.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.settings).toEqual(expectedProjectSettings());
    expectCredentialFree(migratedJson);
    expect(migratedJson).not.toContain('future-provider-secret');
    expect(migratedJson).not.toContain('futureProvider.apiKey');

    useStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        geminiApiKey: 'current-gemini-credential',
        pexelsApiKey: 'current-pexels-credential',
        falApiKey: 'current-fal-credential',
        outputDirectory: '/current/output',
        enableNotifications: true,
        developerMode: false,
        renderConcurrency: 4,
        longformSkin: 'blueprint',
        longformPaletteId: 'creator-palette',
      },
    });
    vfs.saved.set(SAVE_PATH, legacyJson);

    expect(await loadProjectFromPath(SAVE_PATH)).toBe(true);
    const settings = useStore.getState().settings;
    expect(settings.geminiApiKey).toBe('current-gemini-credential');
    expect(settings.pexelsApiKey).toBe('current-pexels-credential');
    expect(settings.falApiKey).toBe('current-fal-credential');
    expect(settings.outputDirectory).toBe('/current/output');
    expect(settings.enableNotifications).toBe(true);
    expect(settings.developerMode).toBe(false);
    expect(settings.renderConcurrency).toBe(4);
    expect(settings.longformSkin).toBe(SETTINGS_FIXTURE.longformSkin);
    expect(settings.longformPaletteId).toBe(SETTINGS_FIXTURE.longformPaletteId);
    expect(settings.minScore).toBe(SETTINGS_FIXTURE.minScore);
  });
});

describe('project-service · preplan storyboard appearance', () => {
  beforeEach(() => {
    for (const profile of getCreatorProfiles()) deleteCreatorProfile(profile.id);
    createNewProject();
    useStore.setState({ settings: { ...DEFAULT_SETTINGS }, sources: [], longformPlans: {} });
    useStore.setState({ isDirty: false, saveStatus: 'saved' });
  });

  it('dirty-tracks, saves and reopens explicit choices before any plan or source exists', async () => {
    useStore.getState().setLongformStoryboardStyle('ink');
    useStore.getState().setLongformPaletteId('custom-missing');
    expect(useStore.getState().isDirty).toBe(true);
    expect(await saveProject()).toBe(SAVE_PATH);
    const json = vfs.saved.get(SAVE_PATH);
    if (!json) throw new Error('Expected saved project');
    const saved = JSON.parse(json);
    expect(saved.settings).toMatchObject({
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'custom-missing',
    });
    expect(saved.longformPlans).toEqual({});
    useStore.getState().setLongformStoryboardStyle('polish');
    useStore.getState().setLongformPaletteId('brand');
    expect(await loadProjectFromPath(SAVE_PATH)).toBe(true);
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'custom-missing',
    });
    expect(useStore.getState().isDirty).toBe(false);
    useStore.getState().setLongformStoryboardStyle('polish');
    expect(useStore.getState().isDirty).toBe(true);
  });

  it('recovers preplan appearance and switches projects without inheriting another project default', async () => {
    useStore.getState().setLongformStoryboardStyle('ink');
    useStore.getState().setLongformPaletteId('custom-recovery');
    await autoSaveProject();
    const recovery = vfs.recovery;
    if (!recovery) throw new Error('Expected recovery');
    useStore.getState().reset();
    useStore.getState().setLongformStoryboardStyle('polish');
    useStore.getState().setLongformPaletteId('slate');
    const loaded = await loadRecovery();
    if (!loaded) throw new Error('Expected loaded recovery');
    restoreProject(loaded.json, undefined, { recovered: true });
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'custom-recovery',
    });
    const other = {
      ...JSON.parse(recovery),
      settings: { longformStoryboardStyle: 'polish', longformPaletteId: 'brand' },
    };
    restoreProject(JSON.stringify(other));
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'brand',
    });
    restoreProject(recovery);
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'custom-recovery',
    });
    restoreProject(JSON.stringify({ ...other, settings: {} }));
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'brand',
    });
  });

  it('autosaves an explicit return to default appearance before a source exists', async () => {
    useStore.getState().setLongformStoryboardStyle('ink');
    useStore.getState().setLongformPaletteId('custom-previous');
    await autoSaveProject();
    useStore.getState().setLongformStoryboardStyle('polish');
    useStore.getState().setLongformPaletteId('brand');
    await autoSaveProject();
    const loaded = await loadRecovery();
    if (!loaded) throw new Error('Expected recovery for explicit default choices');
    expect(JSON.parse(loaded.json).settings).toMatchObject({
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'brand',
    });
  });

  it('keeps explicit dialog choices after profile defaults and later profile edits', async () => {
    const profile = createCreatorProfile('Creator');
    updateCreatorProfile(profile.id, {
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'slate',
    });
    useStore.getState().setCreatorProfile(profile.id);
    useStore.getState().setLongformStoryboardStyle('ink');
    useStore.getState().setLongformPaletteId('slate');
    // The dialog applies its explicit choices after applying profile defaults.
    useStore.getState().setLongformStoryboardStyle('polish');
    useStore.getState().setLongformPaletteId('custom-dialog');
    useStore.getState().setCreatorProfileOverride('longformStoryboardStyle', 'polish');
    useStore.getState().setCreatorProfileOverride('longformPaletteId', 'custom-dialog');
    await saveProject();
    updateCreatorProfile(profile.id, {
      longformStoryboardStyle: 'ink',
      longformPaletteId: 'brand',
    });
    expect(await loadProjectFromPath(SAVE_PATH)).toBe(true);
    expect(useStore.getState().settings).toMatchObject({
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'custom-dialog',
    });
    expect(useStore.getState().creatorProfile.overrides).toMatchObject({
      longformStoryboardStyle: 'polish',
      longformPaletteId: 'custom-dialog',
    });
    useStore.getState().clearCreatorProfileOverride('longformStoryboardStyle');
    expect(useStore.getState().creatorProfile.overrides.longformStoryboardStyle).toBeUndefined();
  });
});

describe('project-service · long-form persistence floor (RF-020)', () => {
  // A long-form (16:9) project persists a transcription + the expensive Gemini
  // edit plan but NO short-form clips. Both must survive a save/recover.
  const LONGFORM_PLAN_RECORD = {
    plan: {
      phrases: [],
      blocks: [],
      reasoning: 'test plan',
      generatedAt: 1_700_000_000_000,
    },
    skin: 'editorial' as const,
    paletteId: 'brand',
  };

  function populateLongformOnlyStore(): void {
    useStore.setState({
      sources: [SOURCE_A],
      transcriptions: { [SOURCE_A.id]: TRANSCRIPTION_A },
      clips: {},
      longformPlans: { [SOURCE_A.id]: LONGFORM_PLAN_RECORD },
      activeSourceId: SOURCE_A.id,
      pipeline: { stage: 'ready', message: '', percent: 100 },
      workspace: {
        ...useStore.getState().workspace,
        stage: 'ready',
        activeSourceId: SOURCE_A.id,
      },
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    });
  }

  it('saveProject → loadProjectFromPath restores the edit plan without clips', async () => {
    populateLongformOnlyStore();

    const path = await saveProject();
    expect(path).toBe(SAVE_PATH);

    // The serialized project carries the long-form plan keyed by source.
    const savedJson = vfs.saved.get(SAVE_PATH);
    if (savedJson === undefined) throw new Error('Expected saved project JSON');
    const parsed = JSON.parse(savedJson) as ProjectFileData;
    expect(parsed.longformPlans).toEqual({ [SOURCE_A.id]: LONGFORM_PLAN_RECORD });
    expect(parsed.clips).toEqual({});

    // Reset to a fresh, empty store.
    useStore.getState().reset();
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    });
    expect(useStore.getState().longformPlans).toEqual({});

    const ok = await loadProjectFromPath(SAVE_PATH);
    expect(ok).toBe(true);

    const state = useStore.getState();
    // The plan survived — render can proceed WITHOUT re-calling Gemini.
    expect(state.longformPlans).toEqual({ [SOURCE_A.id]: LONGFORM_PLAN_RECORD });
    expect(state.transcriptions).toEqual({ [SOURCE_A.id]: TRANSCRIPTION_A });
    // Long-form-only state still jumps past the drop screen.
    expect(state.activeSourceId).toBe(SOURCE_A.id);
    expect(state.pipeline.stage).toBe('ready');
  });

  it('routes a restored legacy long-form plan to explicit review before export', async () => {
    populateLongformOnlyStore();
    await saveProject();

    useStore.getState().reset();
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      processingConfig: { ...DEFAULT_PROCESSING_CONFIG },
    });

    const ok = await loadProjectFromPath(SAVE_PATH);
    expect(ok).toBe(true);

    const state = useStore.getState();
    expect(state.getLongformPlan(SOURCE_A.id)).toEqual(LONGFORM_PLAN_RECORD);
    // Legacy records have no accepted status, so they re-enter Cut Plan review
    // rather than bypassing approval or falling through to an empty clip grid.
    expect(selectIsLongformOnly(state)).toBe(true);
    expect(selectActiveScreen(state)).toBe('cut-plan');
  });

  it('autoSaveProject writes recovery for a long-form-only project (no clips)', async () => {
    populateLongformOnlyStore();
    expect(vfs.recovery).toBeNull();

    await autoSaveProject();

    expect(vfs.recovery).toBeTruthy();
    if (vfs.recovery === null) throw new Error('Expected recovery JSON');
    const parsed = JSON.parse(vfs.recovery) as ProjectFileData;
    expect(parsed.longformPlans).toEqual({ [SOURCE_A.id]: LONGFORM_PLAN_RECORD });
  });
});

describe('project-service · clearRecovery', () => {
  it('deletes the recovery file', async () => {
    populateStore();
    await autoSaveProject();
    expect(vfs.recovery).toBeTruthy();

    await clearRecovery();
    expect(vfs.recovery).toBeNull();

    // After deletion, loadRecovery resolves to null.
    const data = await loadRecovery();
    expect(data).toBeNull();
  });

  it('saveProject clears recovery as a side-effect', async () => {
    // Seed a recovery file first.
    populateStore();
    await autoSaveProject();
    expect(vfs.recovery).toBeTruthy();

    // saveProject is documented to wipe recovery on success — the call is
    // fire-and-forget so we await a microtask flush before asserting.
    await saveProject();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vfs.recovery).toBeNull();
  });
});
