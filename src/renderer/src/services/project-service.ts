import { stripCredentialFields } from '@shared/credential-safety';
import { createStructuredError, isStructuredError } from '@shared/errors';
import type { CreatorJob } from '@shared/jobs';
import {
  clampAutosaveInterval,
  PROJECT_SCHEMA_VERSION,
  type ProjectIdentity,
  type RecoverySnapshotMetadata,
} from '@shared/project';
import { normalizeStoryboardStyle } from '@shared/storyboards';
import { useStore, withoutDirtyTracking } from '../store';
import type { ProjectFileData, ProjectSettings } from '../store/helpers';
import {
  DEFAULT_PROCESSING_CONFIG,
  DEFAULT_SETTINGS,
  migrateFillerRemoval,
} from '../store/helpers';
import type {
  AppSettings,
  AppState,
  PipelineStage,
  ProjectWorkspace,
  PromoProjectPlan,
  RenderProgress,
} from '../store/types';
import {
  DEFAULT_CREATIVE_BRIEF,
  DEFAULT_PROJECT_CREATOR_PROFILE,
  DEFAULT_PROJECT_WORKSPACE,
  DEFAULT_PROMO_PLAN,
  EMPTY_CREATIVE_BRIEF_FIELDS,
} from '../store/workspace-slice';
import { getCreatorProfiles } from './creator-profiles';
import { restoreLongformPlans } from './longform-project-plans';

const LAST_PROJECT_PATH_KEY = 'batchclip-last-project-path';

interface LegacyProjectFileData
  extends Omit<Partial<ProjectFileData>, 'identity' | 'settings' | 'version'> {
  version?: number;
  identity?: Partial<ProjectIdentity>;
  settings?: Partial<AppSettings>;
}

function projectSettingsFrom(settings: Partial<AppSettings> | undefined): ProjectSettings {
  const saved = settings ?? {};
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    geminiApiKey: '',
    pexelsApiKey: '',
    falApiKey: '',
    outputDirectory: null,
    autosaveIntervalMs: DEFAULT_SETTINGS.autosaveIntervalMs,
    autoZoom: { ...DEFAULT_SETTINGS.autoZoom, ...(saved.autoZoom ?? {}) },
    hookTitleOverlay: {
      ...DEFAULT_SETTINGS.hookTitleOverlay,
      ...(saved.hookTitleOverlay ?? {}),
    },
    rehookOverlay: { ...DEFAULT_SETTINGS.rehookOverlay, ...(saved.rehookOverlay ?? {}) },
    broll: { ...DEFAULT_SETTINGS.broll, ...(saved.broll ?? {}) },
    promo: { ...DEFAULT_SETTINGS.promo, ...(saved.promo ?? {}) },
    fillerRemoval: migrateFillerRemoval(saved.fillerRemoval),
    renderQuality: { ...DEFAULT_SETTINGS.renderQuality, ...(saved.renderQuality ?? {}) },
    templateLayout: {
      titleText: {
        ...DEFAULT_SETTINGS.templateLayout.titleText,
        ...(saved.templateLayout?.titleText ?? {}),
      },
      subtitles: {
        ...DEFAULT_SETTINGS.templateLayout.subtitles,
        ...(saved.templateLayout?.subtitles ?? {}),
      },
    },
  };

  return {
    minScore: merged.minScore,
    creatorPreset: merged.creatorPreset,
    captionsEnabled: merged.captionsEnabled,
    captionMode: merged.captionMode,
    wordEmphasisEnabled: merged.wordEmphasisEnabled,
    shotTransitionsEnabled: merged.shotTransitionsEnabled,
    explainerScenesEnabled: merged.explainerScenesEnabled,
    autoZoom: merged.autoZoom,
    hookTitleOverlay: merged.hookTitleOverlay,
    rehookOverlay: merged.rehookOverlay,
    broll: merged.broll,
    promo: merged.promo,
    fillerRemoval: merged.fillerRemoval,
    renderQuality: merged.renderQuality,
    outputAspectRatio: merged.outputAspectRatio,
    filenameTemplate: merged.filenameTemplate,
    templateLayout: merged.templateLayout,
    targetPlatform: merged.targetPlatform,
    outputMode: merged.outputMode,
    longformSkin: merged.longformSkin ?? DEFAULT_SETTINGS.longformSkin,
    longformStoryboardStyle: normalizeStoryboardStyle(saved.longformStoryboardStyle),
    longformPaletteId:
      typeof saved.longformPaletteId === 'string' && saved.longformPaletteId.trim()
        ? saved.longformPaletteId
        : DEFAULT_SETTINGS.longformPaletteId,
  };
}

function displayNameFromPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const filename = filePath.split(/[\\/]/).pop();
  return filename?.replace(/\.batchclip$/i, '') || null;
}

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
  );
}

function normalizeProjectIdentity(
  identity: Partial<ProjectIdentity> | undefined,
  filePath: string | null | undefined,
  firstSourceName?: string,
): ProjectIdentity {
  const now = Date.now();
  const authoritativePath = filePath === undefined ? (identity?.filePath ?? null) : filePath;
  return {
    id:
      typeof identity?.id === 'string' && identity.id.trim()
        ? identity.id
        : globalThis.crypto.randomUUID(),
    displayName:
      (typeof identity?.displayName === 'string' && identity.displayName.trim()) ||
      displayNameFromPath(authoritativePath) ||
      firstSourceName?.replace(/\.[^.]+$/, '') ||
      'Untitled Project',
    filePath: authoritativePath,
    createdAt: isValidTimestamp(identity?.createdAt) ? identity.createdAt : now,
    modifiedAt: isValidTimestamp(identity?.modifiedAt) ? identity.modifiedAt : now,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
}

const PIPELINE_STAGES = new Set<PipelineStage>([
  'idle',
  'downloading',
  'transcribing',
  'scoring',
  'stitching',
  'optimizing-loops',
  'detecting-faces',
  'ai-editing',
  'segmenting',
  'ready',
  'rendering',
  'done',
  'error',
]);

function normalizeWorkspace(value: Partial<ProjectWorkspace> | undefined): ProjectWorkspace {
  const stage = PIPELINE_STAGES.has(value?.stage as PipelineStage)
    ? (value?.stage as PipelineStage)
    : DEFAULT_PROJECT_WORKSPACE.stage;
  const clipFilter = ['all', 'unreviewed', 'approved', 'rejected', 'stitched'].includes(
    value?.clipFilter ?? '',
  )
    ? (value?.clipFilter as ProjectWorkspace['clipFilter'])
    : DEFAULT_PROJECT_WORKSPACE.clipFilter;
  const clipSort = ['score', 'source-time', 'duration', 'status'].includes(value?.clipSort ?? '')
    ? (value?.clipSort as ProjectWorkspace['clipSort'])
    : DEFAULT_PROJECT_WORKSPACE.clipSort;
  const inspectorTab = ['edit', 'transcript'].includes(value?.inspectorTab ?? '')
    ? (value?.inspectorTab as ProjectWorkspace['inspectorTab'])
    : DEFAULT_PROJECT_WORKSPACE.inspectorTab;
  const previewPlayheadByClip =
    value?.previewPlayheadByClip &&
    typeof value.previewPlayheadByClip === 'object' &&
    !Array.isArray(value.previewPlayheadByClip)
      ? Object.fromEntries(
          Object.entries(value.previewPlayheadByClip)
            .filter(
              (entry): entry is [string, number] =>
                entry[0].length > 0 && typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            )
            .map(([clipId, seconds]) => [clipId, Math.max(0, seconds)]),
        )
      : {};

  return {
    stage,
    activeSourceId: typeof value?.activeSourceId === 'string' ? value.activeSourceId : null,
    selectedClipId: typeof value?.selectedClipId === 'string' ? value.selectedClipId : null,
    clipFilter,
    clipSort,
    inspectorTab,
    gridScrollTop:
      typeof value?.gridScrollTop === 'number' && Number.isFinite(value.gridScrollTop)
        ? Math.max(0, value.gridScrollTop)
        : 0,
    previewPlayheadByClip,
  };
}

function normalizePromoPlan(value: Partial<PromoProjectPlan> | undefined): PromoProjectPlan {
  const beats = Array.isArray(value?.beats)
    ? value.beats.flatMap((beat) => {
        if (!beat || typeof beat !== 'object' || typeof beat.id !== 'string') return [];
        const evidenceCategory = ['none', 'app-ui', 'community-proof', 'growth-stat'].includes(
          beat.evidenceCategory,
        )
          ? beat.evidenceCategory
          : 'none';
        return [
          {
            id: beat.id,
            script: typeof beat.script === 'string' ? beat.script : '',
            evidenceCategory,
            evidenceAssetPath:
              typeof beat.evidenceAssetPath === 'string' ? beat.evidenceAssetPath : null,
          },
        ];
      })
    : [];
  const ctaSource = ['profile', 'brief', 'none'].includes(value?.ctaSource ?? '')
    ? (value?.ctaSource as PromoProjectPlan['ctaSource'])
    : DEFAULT_PROMO_PLAN.ctaSource;
  return {
    beats,
    ctaSource,
    ctaAssetPath: typeof value?.ctaAssetPath === 'string' ? value.ctaAssetPath : null,
    reviewedAt: typeof value?.reviewedAt === 'string' ? value.reviewedAt : null,
  };
}

function normalizeRenderProgress(value: unknown): RenderProgress[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is RenderProgress =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as RenderProgress).clipId === 'string' &&
      typeof (entry as RenderProgress).percent === 'number' &&
      ['queued', 'preparing', 'rendering', 'done', 'error', 'cancelled'].includes(
        (entry as RenderProgress).status,
      ),
  );
}

function normalizeProcessingState(
  value: ProjectFileData['processingState'] | undefined,
): ProjectFileData['processingState'] | undefined {
  const job = value?.job as Partial<CreatorJob> | undefined;
  if (
    !job ||
    typeof job.id !== 'string' ||
    job.kind !== 'processing' ||
    typeof job.projectId !== 'string' ||
    typeof job.sourceName !== 'string' ||
    typeof job.stage !== 'string' ||
    !isValidTimestamp(job.startedAt) ||
    !Array.isArray(job.activities) ||
    !Array.isArray(job.results)
  ) {
    return undefined;
  }
  const completedStages = (value?.completedStages ?? []).filter((stage) =>
    PIPELINE_STAGES.has(stage),
  );
  return {
    job: job as CreatorJob,
    completedStages,
    cachedSourcePath: typeof value?.cachedSourcePath === 'string' ? value.cachedSourcePath : null,
  };
}

function normalizeRecoveryMetadata(value: unknown): RecoverySnapshotMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    !isValidTimestamp(candidate.savedAt) ||
    typeof candidate.stage !== 'string' ||
    candidate.stage.trim().length === 0
  ) {
    return undefined;
  }
  return { id: candidate.id, savedAt: candidate.savedAt, stage: candidate.stage };
}

function buildProjectData(
  state: AppState,
  modifiedAt = state.currentProject.modifiedAt,
  recovery?: RecoverySnapshotMetadata,
): ProjectFileData {
  const processingJob = state.creatorJobs.find(
    (job) =>
      job.id === state.currentProcessingJobId &&
      job.projectId === state.currentProject.id &&
      !['completed', 'cancelled'].includes(job.status),
  );
  return {
    version: PROJECT_SCHEMA_VERSION,
    identity: {
      ...state.currentProject,
      modifiedAt,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    },
    sources: state.sources,
    transcriptions: state.transcriptions,
    clips: state.clips,
    stitchedClips: state.stitchedClips,
    longformPlans: state.longformPlans,
    settings: projectSettingsFrom(state.settings),
    processingConfig: state.processingConfig,
    workspace: {
      ...state.workspace,
      stage: state.pipeline.stage,
      activeSourceId: state.activeSourceId,
    },
    creativeBrief: state.creativeBrief,
    creatorProfile: state.creatorProfile,
    promoPlan: state.promoPlan,
    ...(processingJob
      ? {
          processingState: {
            job: processingJob,
            completedStages: Array.from(state.completedPipelineStages),
            cachedSourcePath: state.cachedSourcePath,
          },
        }
      : {}),
    renderState: {
      progress: state.renderProgress,
      startedAt: state.renderStartedAt,
      completedAt: state.renderCompletedAt,
    },
    ...(recovery ? { recovery } : {}),
  };
}

/** Migrate a parsed legacy project without importing embedded credentials. */
export function migrateProjectData(input: unknown, filePath?: string | null): ProjectFileData {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Project file must contain a JSON object');
  }

  const sanitized = stripCredentialFields(input).value as LegacyProjectFileData;
  const version = typeof sanitized.version === 'number' ? sanitized.version : 1;
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema ${version} is newer than supported schema ${PROJECT_SCHEMA_VERSION}`,
    );
  }

  const sources = Array.isArray(sanitized.sources) ? sanitized.sources : [];
  const recovery = normalizeRecoveryMetadata(sanitized.recovery);
  const processingState = normalizeProcessingState(sanitized.processingState);
  const workspace = normalizeWorkspace(sanitized.workspace);
  const profileOverrides = { ...(sanitized.creatorProfile?.overrides ?? {}) };
  if (profileOverrides.longformStoryboardStyle !== undefined) {
    profileOverrides.longformStoryboardStyle = normalizeStoryboardStyle(
      profileOverrides.longformStoryboardStyle,
    );
  }
  const profile = getCreatorProfiles().find(
    (item) => item.id === sanitized.creatorProfile?.profileId,
  );
  if (!sanitized.workspace) {
    const hasReadyContent =
      Object.values(sanitized.clips ?? {}).some((items) => items.length > 0) ||
      Object.values(sanitized.stitchedClips ?? {}).some((items) => items.length > 0) ||
      Object.keys(sanitized.longformPlans ?? {}).length > 0;
    workspace.stage = hasReadyContent ? 'ready' : 'idle';
    workspace.activeSourceId = hasReadyContent ? (sources[0]?.id ?? null) : null;
  }
  return {
    version: PROJECT_SCHEMA_VERSION,
    identity: normalizeProjectIdentity(sanitized.identity, filePath, sources[0]?.name),
    sources,
    transcriptions: sanitized.transcriptions ?? {},
    clips: sanitized.clips ?? {},
    stitchedClips: sanitized.stitchedClips ?? {},
    longformPlans: restoreLongformPlans(
      sanitized.longformPlans,
      sources,
      sanitized.transcriptions ?? {},
    ),
    // Saved project choices win over mutable profile defaults, including before
    // planning. Older projects may only have profile choices; never borrow from
    // whichever project happened to be open previously.
    settings: projectSettingsFrom({
      ...sanitized.settings,
      longformSkin:
        sanitized.settings?.longformSkin ?? profileOverrides.longformSkin ?? profile?.longformSkin,
      longformStoryboardStyle:
        sanitized.settings?.longformStoryboardStyle ??
        profileOverrides.longformStoryboardStyle ??
        profile?.longformStoryboardStyle,
      longformPaletteId:
        sanitized.settings?.longformPaletteId ??
        profileOverrides.longformPaletteId ??
        profile?.longformPaletteId,
    }),
    processingConfig: {
      ...DEFAULT_PROCESSING_CONFIG,
      ...(sanitized.processingConfig ?? {}),
    },
    workspace,
    creativeBrief: {
      ...DEFAULT_CREATIVE_BRIEF,
      ...(sanitized.creativeBrief ?? {}),
      committed: sanitized.creativeBrief?.committed
        ? { ...EMPTY_CREATIVE_BRIEF_FIELDS, ...sanitized.creativeBrief.committed }
        : null,
    },
    creatorProfile: {
      ...DEFAULT_PROJECT_CREATOR_PROFILE,
      ...(sanitized.creatorProfile ?? {}),
      overrides: profileOverrides,
    },
    promoPlan: normalizePromoPlan(sanitized.promoPlan),
    ...(processingState ? { processingState } : {}),
    renderState: {
      progress: normalizeRenderProgress(sanitized.renderState?.progress),
      startedAt: isValidTimestamp(sanitized.renderState?.startedAt)
        ? sanitized.renderState.startedAt
        : null,
      completedAt: isValidTimestamp(sanitized.renderState?.completedAt)
        ? sanitized.renderState.completedAt
        : null,
    },
    ...(recovery ? { recovery } : {}),
  };
}

/** Return canonical, credential-free project JSON for save, recovery, or migration. */
export function migrateProjectJson(data: string, pretty = false): string {
  const migrated = migrateProjectData(JSON.parse(data) as unknown);
  const sanitized = stripCredentialFields(migrated).value;
  return JSON.stringify(sanitized, null, pretty ? 2 : undefined);
}

function getProjectJson(pretty = false, modifiedAt?: number): string {
  const project = stripCredentialFields(buildProjectData(useStore.getState(), modifiedAt)).value;
  return JSON.stringify(project, null, pretty ? 2 : undefined);
}

function getRecoveryJson(state: AppState, savedAt: number): string {
  const recovery: RecoverySnapshotMetadata = {
    id: globalThis.crypto.randomUUID(),
    savedAt,
    stage: state.pipeline.stage,
  };
  const project = stripCredentialFields(buildProjectData(state, savedAt, recovery)).value;
  return JSON.stringify(project);
}

/** Apply canonical or legacy project JSON while preserving app-scoped settings. */
export function restoreProject(
  data: string,
  filePath?: string | null,
  options: { recovered?: boolean } = {},
): boolean {
  const project = migrateProjectData(JSON.parse(data) as unknown, filePath);
  const sources = project.sources.map((source) => ({
    ...source,
    mediaStatus:
      source.origin === 'file' && source.path ? ('checking' as const) : ('online' as const),
  }));
  const clips = project.clips;
  const stitchedClips = project.stitchedClips ?? {};
  const longformPlans = project.longformPlans ?? {};
  const requestedActiveSourceId = project.workspace?.activeSourceId ?? null;
  const activeSourceId = sources.some((source) => source.id === requestedActiveSourceId)
    ? requestedActiveSourceId
    : (sources[0]?.id ?? null);
  const allClipIds = new Set([
    ...Object.values(clips)
      .flat()
      .map((clip) => clip.id),
    ...Object.values(stitchedClips)
      .flat()
      .map((clip) => clip.id),
  ]);
  const selectedClipId = allClipIds.has(project.workspace?.selectedClipId ?? '')
    ? (project.workspace?.selectedClipId ?? null)
    : null;
  const restoredCheckpoint = project.processingState;
  const rawRestoredJob = restoredCheckpoint?.job;
  const restoredJob = rawRestoredJob
    ? {
        ...rawRestoredJob,
        status: ['running', 'queued', 'cancelling'].includes(rawRestoredJob.status)
          ? ('paused' as const)
          : rawRestoredJob.status,
        message: ['running', 'queued', 'cancelling'].includes(rawRestoredJob.status)
          ? 'Paused when BatchClip closed. Resume from the last safe checkpoint.'
          : rawRestoredJob.message,
        updatedAt: Date.now(),
        progressSamples: [],
      }
    : null;
  const checkpointStage =
    restoredJob &&
    PIPELINE_STAGES.has((restoredJob.failedStage ?? restoredJob.stage) as PipelineStage)
      ? ((restoredJob.failedStage ?? restoredJob.stage) as PipelineStage)
      : null;
  const restoredStage = restoredJob
    ? 'error'
    : activeSourceId
      ? (project.workspace?.stage ?? 'ready')
      : 'idle';
  const pipeline = {
    stage: restoredStage,
    message: restoredJob?.message ?? '',
    percent:
      restoredStage === 'ready' || restoredStage === 'done' ? 100 : (restoredJob?.progress ?? 0),
  };
  const restoredProgress = (project.renderState?.progress ?? []).map((entry) => {
    const legacyError = (entry as RenderProgress & { error?: unknown }).error;
    const error = isStructuredError(legacyError)
      ? legacyError
      : typeof legacyError === 'string'
        ? createStructuredError({
            source: 'render',
            message: legacyError,
            failedStage: 'rendering',
          })
        : undefined;
    const normalized = { ...entry, ...(error ? { error } : {}) };
    return entry.status === 'preparing' || entry.status === 'rendering'
      ? { ...normalized, status: 'queued' as const, percent: 0, prepareMessage: 'Ready to resume' }
      : normalized;
  });
  const currentState = useStore.getState();
  const currentSettings = currentState.settings;
  const creatorJobs = restoredJob
    ? [restoredJob, ...currentState.creatorJobs.filter((job) => job.id !== restoredJob.id)].slice(
        0,
        24,
      )
    : currentState.creatorJobs;
  const assignedProfile = getCreatorProfiles().find(
    (profile) => profile.id === project.creatorProfile?.profileId,
  );
  const profileOverrides = project.creatorProfile?.overrides ?? {};
  const profileTemplateLayout = profileOverrides.templateLayout ?? assignedProfile?.templateLayout;
  const profileTargetPlatform = profileOverrides.targetPlatform ?? assignedProfile?.targetPlatform;
  const profileAudience = profileOverrides.audience ?? assignedProfile?.audience;

  const nextState: Partial<AppState> = {
    currentProject: project.identity,
    sources,
    transcriptions: project.transcriptions,
    clips,
    stitchedClips,
    longformPlans,
    longformReviewFocus: null,
    creativeBrief: { ...DEFAULT_CREATIVE_BRIEF, ...(project.creativeBrief ?? {}) },
    creatorProfile: {
      ...DEFAULT_PROJECT_CREATOR_PROFILE,
      ...(project.creatorProfile ?? {}),
      overrides: { ...(project.creatorProfile?.overrides ?? {}) },
    },
    promoPlan: normalizePromoPlan(project.promoPlan),
    workspace: {
      ...DEFAULT_PROJECT_WORKSPACE,
      ...(project.workspace ?? {}),
      stage: restoredStage,
      activeSourceId,
      selectedClipId,
    },
    settings: {
      ...currentSettings,
      ...project.settings,
      promo: {
        ...project.settings.promo,
        enabled: project.processingConfig?.promoMode ?? project.settings.promo.enabled,
      },
      ...(profileTemplateLayout ? { templateLayout: profileTemplateLayout } : {}),
      ...(profileTargetPlatform ? { targetPlatform: profileTargetPlatform } : {}),
    },
    pipeline,
    creatorJobs,
    currentProcessingJobId: restoredJob?.id ?? null,
    processingCancellation: { status: 'idle', error: null },
    failedPipelineStage: checkpointStage,
    completedPipelineStages: new Set<PipelineStage>(restoredCheckpoint?.completedStages ?? []),
    cachedSourcePath: restoredCheckpoint?.cachedSourcePath ?? null,
    renderProgress: restoredProgress,
    isRendering: false,
    renderCancellation: { status: 'idle', error: null },
    activeEncoder: null,
    renderStartedAt: project.renderState?.startedAt ?? null,
    renderCompletedAt: project.renderState?.completedAt ?? null,
    clipRenderTimes: {},
    renderErrors: Object.fromEntries(
      restoredProgress.flatMap((entry) =>
        entry.status === 'error' && entry.error ? [[entry.clipId, entry.error] as const] : [],
      ),
    ),
    singleRenderClipId: null,
    singleRenderProgress: 0,
    singleRenderStatus: 'idle',
    singleRenderOutputPath: null,
    singleRenderError: null,
    errorLog: [],
    selectedClipIndex: 0,
    _undoStack: [],
    _redoStack: [],
    _clipUndoStacks: {},
    _clipRedoStacks: {},
    _lastEditedClipId: null,
    _lastEditedSourceId: null,
    canUndo: false,
    canRedo: false,
    activeSourceId,
    isDirty: options.recovered === true,
    projectRevision: options.recovered ? 1 : 0,
    savedRevision: 0,
    saveStatus: options.recovered ? 'dirty' : 'idle',
    lastSavedAt: null,
    lastSaveError: null,
    processingConfig: {
      ...(project.processingConfig ?? DEFAULT_PROCESSING_CONFIG),
      promoMode: project.processingConfig?.promoMode ?? project.settings.promo.enabled,
      ...(profileAudience !== undefined ? { targetAudience: profileAudience } : {}),
    },
  };
  withoutDirtyTracking(() => useStore.setState(nextState));
  const rememberedPath = filePath ?? project.identity.filePath;
  if (rememberedPath) localStorage.setItem(LAST_PROJECT_PATH_KEY, rememberedPath);
  return true;
}

async function saveProjectToDisk(forceDialog: boolean): Promise<string | null> {
  const startingState = useStore.getState();
  const revision = startingState.projectRevision;
  const modifiedAt = Date.now();

  withoutDirtyTracking(() => {
    useStore.setState((state) => ({
      currentProject: { ...state.currentProject, modifiedAt },
      saveStatus: 'saving',
      lastSaveError: null,
    }));
  });

  try {
    const filePath = await window.api.saveProject(getProjectJson(true, modifiedAt), {
      currentPath: startingState.currentProject.filePath,
      forceDialog,
      suggestedName: startingState.currentProject.displayName,
    });
    if (!filePath) {
      withoutDirtyTracking(() => {
        const state = useStore.getState();
        useStore.setState({ saveStatus: state.isDirty ? 'dirty' : 'idle' });
      });
      return null;
    }

    const savedAt = Date.now();
    withoutDirtyTracking(() => {
      const state = useStore.getState();
      const savedLatestRevision = state.projectRevision === revision;
      useStore.setState({
        currentProject: {
          ...state.currentProject,
          filePath,
          modifiedAt,
          schemaVersion: PROJECT_SCHEMA_VERSION,
        },
        savedRevision: revision,
        isDirty: !savedLatestRevision,
        saveStatus: savedLatestRevision ? 'saved' : 'dirty',
        lastSavedAt: savedAt,
        lastSaveError: null,
      });
    });
    localStorage.setItem(LAST_PROJECT_PATH_KEY, filePath);
    void window.api.clearRecovery().catch(() => {
      /* best-effort cleanup after a successful manual save */
    });
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    withoutDirtyTracking(() => {
      useStore.setState({ isDirty: true, saveStatus: 'error', lastSaveError: message });
    });
    useStore
      .getState()
      .addError({ source: 'project', message: `Failed to save project: ${message}` });
    return null;
  }
}

export function saveProject(): Promise<string | null> {
  return saveProjectToDisk(false);
}

export function saveProjectAs(): Promise<string | null> {
  return saveProjectToDisk(true);
}

export function createNewProject(): void {
  useStore.getState().reset();
  localStorage.removeItem(LAST_PROJECT_PATH_KEY);
  void window.api.clearRecovery().catch(() => {
    // A stale recovery prompt is inconvenient, but a cleanup failure must not block a new project.
  });
}

export async function loadProject(): Promise<boolean> {
  try {
    const result = await window.api.loadProject();
    if (!result) return false;
    return restoreProject(result.json, result.filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useStore
      .getState()
      .addError({ source: 'project', message: `Failed to load project: ${message}` });
    return false;
  }
}

export async function resumeLastProject(): Promise<boolean> {
  if (useStore.getState().sources.length > 0) return false;
  const filePath = localStorage.getItem(LAST_PROJECT_PATH_KEY);
  if (!filePath) return false;
  try {
    const result = await window.api.loadProjectFromPath(filePath);
    if (!result) {
      localStorage.removeItem(LAST_PROJECT_PATH_KEY);
      return false;
    }
    return restoreProject(result.json, result.filePath);
  } catch (error) {
    localStorage.removeItem(LAST_PROJECT_PATH_KEY);
    useStore.getState().addError({
      source: 'project',
      message: `Couldn’t resume the last project: ${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
}

export async function loadProjectFromPath(filePath: string): Promise<boolean> {
  try {
    const result = await window.api.loadProjectFromPath(filePath);
    if (!result) return false;
    return restoreProject(result.json, result.filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useStore.getState().addError({
      source: 'project',
      message: `Failed to load project from ${filePath}: ${message}`,
    });
    return false;
  }
}

let autoSaveInFlight: Promise<void> | null = null;

export function autoSaveProject(options: { recoveryOnly?: boolean } = {}): Promise<void> {
  if (autoSaveInFlight) return autoSaveInFlight;

  const startingState = useStore.getState();
  // A dirty preplan choice is project content, including a return to defaults.
  // Pristine empty projects remain clean and do not produce recovery snapshots.
  if (!startingState.isDirty) return Promise.resolve();

  const revision = startingState.projectRevision;
  const currentPath = options.recoveryOnly ? null : startingState.currentProject.filePath;
  const modifiedAt = Date.now();

  autoSaveInFlight = (async () => {
    withoutDirtyTracking(() => {
      useStore.setState((state) => ({
        currentProject: { ...state.currentProject, modifiedAt },
        saveStatus: 'saving',
        lastSaveError: null,
      }));
    });

    try {
      await window.api.autoSaveProject(getRecoveryJson(startingState, modifiedAt), currentPath);
      const savedAt = Date.now();
      withoutDirtyTracking(() => {
        const state = useStore.getState();
        const savedLatestRevision = state.projectRevision === revision;
        const savedProjectFile = currentPath !== null;
        useStore.setState({
          currentProject: { ...state.currentProject, modifiedAt },
          savedRevision: savedProjectFile ? revision : state.savedRevision,
          isDirty: savedProjectFile ? !savedLatestRevision : true,
          saveStatus: savedProjectFile && savedLatestRevision ? 'saved' : 'dirty',
          lastSavedAt: savedProjectFile ? savedAt : state.lastSavedAt,
          lastSaveError: null,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      withoutDirtyTracking(() => {
        useStore.setState({ isDirty: true, saveStatus: 'error', lastSaveError: message });
      });
      window.api.logToMain?.('error', 'project', `Autosave failed: ${message}`);
    } finally {
      autoSaveInFlight = null;
    }
  })();

  return autoSaveInFlight;
}

export interface RecoverySnapshot {
  id: string;
  savedAt: number;
  stage: string;
  projectName: string;
  sourceName: string | null;
  counts: {
    sources: number;
    transcripts: number;
    clips: number;
    editPlans: number;
  };
  json: string;
}

function recoveryContentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function inferRecoveryStage(project: ProjectFileData): string {
  if (Object.keys(project.longformPlans ?? {}).length > 0) return 'ready';
  if (Object.values(project.clips).some((clips) => clips.length > 0)) return 'ready';
  if (Object.values(project.stitchedClips ?? {}).some((clips) => clips.length > 0)) return 'ready';
  if (Object.keys(project.transcriptions).length > 0) return 'scoring';
  return project.sources.length > 0 ? 'transcribing' : 'idle';
}

export function parseRecoverySnapshot(data: string): RecoverySnapshot {
  const project = migrateProjectData(JSON.parse(data) as unknown);
  const json = JSON.stringify(stripCredentialFields(project).value);
  const metadata = project.recovery;
  const regularClipCount = Object.values(project.clips).reduce(
    (total, clips) => total + clips.length,
    0,
  );
  const stitchedClipCount = Object.values(project.stitchedClips ?? {}).reduce(
    (total, clips) => total + clips.length,
    0,
  );

  return {
    id: metadata?.id ?? `legacy-${recoveryContentHash(data)}`,
    savedAt: metadata?.savedAt ?? project.identity.modifiedAt,
    stage: metadata?.stage ?? inferRecoveryStage(project),
    projectName: project.identity.displayName,
    sourceName: project.sources[0]?.name ?? null,
    counts: {
      sources: project.sources.length,
      transcripts: Object.keys(project.transcriptions).length,
      clips: regularClipCount + stitchedClipCount,
      editPlans: Object.keys(project.longformPlans ?? {}).length,
    },
    json,
  };
}

export async function loadRecovery(): Promise<RecoverySnapshot | null> {
  try {
    const data = await window.api.loadRecovery();
    return data ? parseRecoverySnapshot(data) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useStore.getState().addError({
      source: 'project',
      message: `Failed to load recovery data: ${message}`,
    });
    throw error;
  }
}

export async function clearRecovery(): Promise<void> {
  await window.api.clearRecovery();
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

useStore.subscribe((state, prevState) => {
  if (!state.isDirty) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    return;
  }

  const shouldReschedule =
    state.projectRevision !== prevState.projectRevision ||
    state.isDirty !== prevState.isDirty ||
    state.settings.autosaveIntervalMs !== prevState.settings.autosaveIntervalMs;
  if (!shouldReschedule) return;

  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    if (useStore.getState().isDirty) void autoSaveProject();
  }, clampAutosaveInterval(state.settings.autosaveIntervalMs));
});
