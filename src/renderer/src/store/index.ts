import { createTokenUsageAggregate, estimateTokenUsageCost } from '@shared/ai-usage';
import type { StructuredError } from '@shared/errors';
import { enableMapSet } from 'immer';
import { create, type Mutate, type StoreApi, type UseBoundStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Enable Immer's MapSet plugin so Set/Map values work in the store
enableMapSet();

import { persistCreatorJobs } from '@/services/job-service';
import { createClipsSlice } from './clips-slice';
import { createErrorsSlice } from './errors-slice';
import {
  loadPersistedProcessingConfig,
  loadPersistedSettings,
  persistProcessingConfig,
  persistSettings,
} from './helpers';
import { createHistorySlice } from './history-slice';
import { createLongformSlice } from './longform-slice';
import { createPipelineSlice } from './pipeline-slice';
import { createProjectSlice } from './project-slice';
import { createSettingsSlice } from './settings-slice';
import { broadcastSettingsChange, listenForSettingsChanges } from './settings-sync';
import { createStitchedClipsSlice } from './stitched-clips-slice';
import type { AppState, RenderProgress, SourceVideo, TranscriptionData } from './types';
import { createWorkspaceSlice } from './workspace-slice';

/** Maximum number of AI usage history entries to keep in memory. */
const MAX_AI_USAGE_HISTORY = 200;

const RECOVERY_ACK_KEY = 'batchclip-acknowledged-recovery-snapshot-id';
const LEGACY_RECOVERY_ACK_KEY = 'batchclip-acknowledged-recovery';
localStorage.removeItem(LEGACY_RECOVERY_ACK_KEY);

let suppressDirtyTracking = 0;

/** Apply persistence metadata or a loaded project without manufacturing a new edit revision. */
export function withoutDirtyTracking<T>(callback: () => T): T {
  suppressDirtyTracking += 1;
  try {
    return callback();
  } finally {
    suppressDirtyTracking -= 1;
  }
}

function objectValueChanged(current: unknown, previous: unknown): boolean {
  return current !== previous && JSON.stringify(current) !== JSON.stringify(previous);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// Keep recursive scene JSON behind Zustand's public type instead of exposing Immer internals.
export const useStore: UseBoundStore<Mutate<StoreApi<AppState>, [['zustand/immer', never]]>> =
  create<AppState>()(
    immer((...a) => {
      const [set, get] = a;
      return {
        // --- Slices ---
        ...createClipsSlice(...a),
        ...createStitchedClipsSlice(...a),
        ...createLongformSlice(...a),
        ...createSettingsSlice(...a),
        ...createPipelineSlice(...a),
        ...createProjectSlice(...a),
        ...createHistorySlice(...a),
        ...createErrorsSlice(...a),
        ...createWorkspaceSlice(...a),

        // --- Sources ---
        sources: [],
        activeSourceId: null,
        transcriptions: {},

        addSource: (source: SourceVideo) =>
          set((state) => {
            if (
              state.sources.length === 0 &&
              state.currentProject.filePath === null &&
              state.currentProject.displayName === 'Untitled Project'
            ) {
              state.currentProject.displayName = source.name.startsWith('http')
                ? 'YouTube Project'
                : source.name.replace(/\.[^.]+$/, '') || 'Untitled Project';
            }
            state.sources.push(source);
          }),

        updateSource: (id: string, updates: Partial<SourceVideo>) =>
          set((state) => {
            const idx = state.sources.findIndex((s) => s.id === id);
            const source = state.sources[idx];
            if (!source) return;
            state.sources[idx] = { ...source, ...updates, id: source.id };
          }),

        removeSource: (id: string) =>
          set((state) => {
            // Remove every source-owned artifact, including workspace pointers and
            // historical render rows that would otherwise survive as stale queue data.
            const regularClipIds = (state.clips[id] ?? []).map((clip) => clip.id);
            const stitchedClipIds = (state.stitchedClips[id] ?? []).map((clip) => clip.id);
            const ownedIds = new Set([...regularClipIds, ...stitchedClipIds, id]);
            const undoStacks = { ...state._clipUndoStacks };
            const redoStacks = { ...state._clipRedoStacks };
            for (const clipId of regularClipIds) {
              delete undoStacks[clipId];
              delete redoStacks[clipId];
            }
            if (state._lastEditedSourceId === id) {
              state._lastEditedClipId = null;
              state._lastEditedSourceId = null;
            }

            state.sources = state.sources.filter((source) => source.id !== id);
            delete state.transcriptions[id];
            delete state.clips[id];
            delete state.stitchedClips[id];
            delete state.longformPlans[id];
            if (state.longformReviewFocus?.sourceId === id) state.longformReviewFocus = null;
            state.renderProgress = state.renderProgress.filter(
              (entry) => !ownedIds.has(entry.clipId),
            );
            for (const ownedId of ownedIds) {
              delete state.renderErrors[ownedId];
              delete state.clipRenderTimes[ownedId];
              delete state.workspace.previewPlayheadByClip[ownedId];
            }
            if (state.activeSourceId === id) {
              const nextSource = state.sources[0] ?? null;
              state.activeSourceId = nextSource?.id ?? null;
              state.workspace.activeSourceId = nextSource?.id ?? null;
            }
            if (state.workspace.selectedClipId && ownedIds.has(state.workspace.selectedClipId)) {
              state.workspace.selectedClipId = null;
            }
            state._clipUndoStacks = undoStacks;
            state._clipRedoStacks = redoStacks;
          }),

        setActiveSource: (id: string | null) =>
          set((state) => {
            state.activeSourceId = id;
            state.workspace.activeSourceId = id;
          }),

        setTranscription: (sourceId: string, data: TranscriptionData) =>
          set((state) => {
            state.transcriptions[sourceId] = data;
          }),

        getActiveSource: () => {
          const { sources, activeSourceId } = get();
          return sources.find((s) => s.id === activeSourceId) ?? null;
        },

        getActiveTranscription: () => {
          const { transcriptions, activeSourceId } = get();
          if (!activeSourceId) return null;
          return transcriptions[activeSourceId] ?? null;
        },

        // --- Render ---
        renderProgress: [],
        isRendering: false,
        renderCancellation: { status: 'idle', error: null },
        activeEncoder: null,
        renderStartedAt: null,
        renderCompletedAt: null,
        clipRenderTimes: {},
        renderErrors: {},
        singleRenderClipId: null,
        singleRenderProgress: 0,
        singleRenderStatus: 'idle' as const,
        singleRenderOutputPath: null,
        singleRenderError: null,

        setRenderProgress: (progress: RenderProgress[]) => set({ renderProgress: progress }),

        setIsRendering: (rendering: boolean) => {
          const now = Date.now();
          if (rendering) {
            set({
              isRendering: true,
              renderStartedAt: now,
              renderCompletedAt: null,
              clipRenderTimes: {},
            });
          } else {
            set({ isRendering: false, renderCompletedAt: now });
          }
        },

        setRenderCancellation: (renderCancellation) => set({ renderCancellation }),

        setRenderError: (clipId: string, error: StructuredError) =>
          set((state) => {
            state.renderErrors[clipId] = error;
          }),

        clearRenderErrors: () => set({ renderErrors: {} }),

        setSingleRenderState: (patch) =>
          set((state) => {
            if (patch.clipId !== undefined) state.singleRenderClipId = patch.clipId;
            if (patch.progress !== undefined) state.singleRenderProgress = patch.progress;
            if (patch.status !== undefined) state.singleRenderStatus = patch.status;
            if (patch.outputPath !== undefined) state.singleRenderOutputPath = patch.outputPath;
            if (patch.error !== undefined) state.singleRenderError = patch.error;
          }),

        // --- Network ---
        isOnline: navigator.onLine,
        setIsOnline: (online: boolean) => set({ isOnline: online }),

        // --- Per-snapshot recovery acknowledgement ---
        acknowledgedRecoverySnapshotId: localStorage.getItem(RECOVERY_ACK_KEY),
        acknowledgeRecoverySnapshot: (snapshotId: string) => {
          localStorage.setItem(RECOVERY_ACK_KEY, snapshotId);
          set({ acknowledgedRecoverySnapshotId: snapshotId });
        },

        // --- AI Token Usage ---
        aiUsage: {
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalCalls: 0,
          callHistory: [],
          byModel: {},
          bySource: {},
          sessionStarted: Date.now(),
        },

        trackTokenUsage: (event) =>
          set((state) => {
            const cost = estimateTokenUsageCost(event).estimatedCostUsd;
            const applyToAggregate = (
              aggregateKey: string,
              target: 'byModel' | 'bySource',
            ): void => {
              const aggregate = state.aiUsage[target][aggregateKey] ?? createTokenUsageAggregate();
              aggregate.promptTokens += event.promptTokens;
              aggregate.completionTokens += event.completionTokens;
              aggregate.calls += 1;
              if (cost === null) aggregate.unpricedCalls += 1;
              else aggregate.estimatedCostUsd += cost;
              state.aiUsage[target][aggregateKey] = aggregate;
            };

            state.aiUsage.totalPromptTokens += event.promptTokens;
            state.aiUsage.totalCompletionTokens += event.completionTokens;
            state.aiUsage.totalCalls += 1;
            applyToAggregate(event.model, 'byModel');
            applyToAggregate(event.source, 'bySource');
            if (state.aiUsage.callHistory.length >= MAX_AI_USAGE_HISTORY) {
              state.aiUsage.callHistory = [
                ...state.aiUsage.callHistory.slice(-(MAX_AI_USAGE_HISTORY - 1)),
                event,
              ];
            } else {
              state.aiUsage.callHistory.push(event);
            }
          }),

        resetAiUsage: () =>
          set({
            aiUsage: {
              totalPromptTokens: 0,
              totalCompletionTokens: 0,
              totalCalls: 0,
              callHistory: [],
              byModel: {},
              bySource: {},
              sessionStarted: Date.now(),
            },
          }),
      };
    }),
  );

// ---------------------------------------------------------------------------
// Auto-persist settings & processing config on change
// ---------------------------------------------------------------------------

useStore.subscribe((state, prevState) => {
  if (objectValueChanged(state.settings, prevState.settings)) {
    persistSettings(state.settings);
    broadcastSettingsChange();
  }
  if (objectValueChanged(state.processingConfig, prevState.processingConfig)) {
    persistProcessingConfig(state.processingConfig);
    broadcastSettingsChange();
  }
  if (objectValueChanged(state.creatorJobs, prevState.creatorJobs)) {
    persistCreatorJobs(state.creatorJobs);
  }
});

// ---------------------------------------------------------------------------
// Dirty tracking — mark isDirty when meaningful project data changes
// ---------------------------------------------------------------------------

useStore.subscribe((state, prevState) => {
  if (suppressDirtyTracking > 0) return;

  const appearanceChanged =
    state.settings.longformSkin !== prevState.settings.longformSkin ||
    state.settings.longformStoryboardStyle !== prevState.settings.longformStoryboardStyle ||
    state.settings.longformPaletteId !== prevState.settings.longformPaletteId;
  const projectChanged =
    appearanceChanged ||
    state.sources !== prevState.sources ||
    state.transcriptions !== prevState.transcriptions ||
    state.clips !== prevState.clips ||
    state.stitchedClips !== prevState.stitchedClips ||
    state.longformPlans !== prevState.longformPlans ||
    objectValueChanged(state.workspace, prevState.workspace) ||
    objectValueChanged(state.creativeBrief, prevState.creativeBrief) ||
    objectValueChanged(state.creatorProfile, prevState.creatorProfile) ||
    state.renderProgress !== prevState.renderProgress ||
    objectValueChanged(state.processingConfig, prevState.processingConfig) ||
    state.currentProject.id !== prevState.currentProject.id ||
    state.currentProject.displayName !== prevState.currentProject.displayName ||
    state.settings.minScore !== prevState.settings.minScore ||
    objectValueChanged(state.settings.autoZoom, prevState.settings.autoZoom) ||
    objectValueChanged(state.settings.hookTitleOverlay, prevState.settings.hookTitleOverlay) ||
    objectValueChanged(state.settings.rehookOverlay, prevState.settings.rehookOverlay) ||
    objectValueChanged(state.settings.broll, prevState.settings.broll) ||
    objectValueChanged(state.settings.promo, prevState.settings.promo) ||
    objectValueChanged(state.settings.fillerRemoval, prevState.settings.fillerRemoval) ||
    objectValueChanged(state.settings.renderQuality, prevState.settings.renderQuality) ||
    state.settings.outputAspectRatio !== prevState.settings.outputAspectRatio ||
    state.settings.filenameTemplate !== prevState.settings.filenameTemplate ||
    objectValueChanged(state.settings.templateLayout, prevState.settings.templateLayout) ||
    state.settings.targetPlatform !== prevState.settings.targetPlatform ||
    state.settings.outputMode !== prevState.settings.outputMode;

  const isCleanEmptyProject =
    state.sources.length === 0 &&
    Object.keys(state.transcriptions).length === 0 &&
    Object.keys(state.clips).length === 0 &&
    Object.keys(state.stitchedClips).length === 0 &&
    Object.keys(state.longformPlans).length === 0 &&
    state.projectRevision === 0 &&
    !state.isDirty;

  if (!projectChanged || (isCleanEmptyProject && !appearanceChanged)) return;
  useStore.setState({
    projectRevision: state.projectRevision + 1,
    isDirty: true,
    saveStatus: state.saveStatus === 'saving' ? 'saving' : 'dirty',
    lastSaveError: null,
  });
});

// ---------------------------------------------------------------------------
// Cross-window settings sync (BroadcastChannel)
// ---------------------------------------------------------------------------

listenForSettingsChanges(() => {
  const freshSettings = loadPersistedSettings();
  const freshConfig = loadPersistedProcessingConfig();
  // loadPersistedSettings() returns empty strings / null for values that live
  // in safeStorage (API keys + outputDirectory). Preserve the current
  // in-memory values so a sibling-window broadcast doesn't visibly wipe them
  // before hydrateSecretsFromMain() refreshes them from the source of truth.
  const current = useStore.getState().settings;
  useStore.setState({
    settings: {
      ...freshSettings,
      // App-library updates may cross windows; another window's defaults must
      // not overwrite a project's already chosen appearance, even before a plan.
      longformSkin: current.longformSkin,
      longformStoryboardStyle: current.longformStoryboardStyle,
      longformPaletteId: current.longformPaletteId,
      geminiApiKey: current.geminiApiKey,
      falApiKey: current.falApiKey,
      pexelsApiKey: current.pexelsApiKey,
      outputDirectory: current.outputDirectory,
    },
    processingConfig: freshConfig,
  });
  void useStore.getState().hydrateSecretsFromMain();
});

// ---------------------------------------------------------------------------
// Debounced auto-save — moved to services/project-service.ts
// The service module is imported in App.tsx which activates the subscriber.
// ---------------------------------------------------------------------------
