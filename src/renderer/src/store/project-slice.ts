import {
  PROJECT_SCHEMA_VERSION,
  type ProjectIdentity,
  type ProjectSaveStatus,
} from '@shared/project';
import type { StateCreator } from 'zustand';
import { DEFAULT_PIPELINE } from './helpers';
import type { AppState } from './types';
import {
  DEFAULT_CREATIVE_BRIEF,
  DEFAULT_PROJECT_CREATOR_PROFILE,
  DEFAULT_PROJECT_WORKSPACE,
  DEFAULT_PROMO_PLAN,
} from './workspace-slice';

// ---------------------------------------------------------------------------
// Project Slice — pure state only, no IPC
// ---------------------------------------------------------------------------

export function createUntitledProjectIdentity(
  now = Date.now(),
  id = globalThis.crypto.randomUUID(),
): ProjectIdentity {
  return {
    id,
    displayName: 'Untitled Project',
    filePath: null,
    createdAt: now,
    modifiedAt: now,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
}

export interface ProjectSlice {
  currentProject: ProjectIdentity;
  isDirty: boolean;
  projectRevision: number;
  savedRevision: number;
  saveStatus: ProjectSaveStatus;
  lastSavedAt: number | null;
  lastSaveError: string | null;
  setProjectDisplayName: (displayName: string) => void;
  reset: () => void;
}

export const createProjectSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  ProjectSlice
> = (set) => ({
  currentProject: createUntitledProjectIdentity(),
  isDirty: false,
  projectRevision: 0,
  savedRevision: 0,
  saveStatus: 'idle',
  lastSavedAt: null,
  lastSaveError: null,

  setProjectDisplayName: (displayName) =>
    set((state) => {
      const trimmed = displayName.trim();
      if (trimmed) state.currentProject.displayName = trimmed;
    }),

  reset: () =>
    set({
      currentProject: createUntitledProjectIdentity(),
      sources: [],
      activeSourceId: null,
      transcriptions: {},
      clips: {},
      stitchedClips: {},
      longformPlans: {},
      longformReviewFocus: null,
      workspace: { ...DEFAULT_PROJECT_WORKSPACE, previewPlayheadByClip: {} },
      creativeBrief: { ...DEFAULT_CREATIVE_BRIEF },
      creatorProfile: { ...DEFAULT_PROJECT_CREATOR_PROFILE, overrides: {} },
      promoPlan: { ...DEFAULT_PROMO_PLAN, beats: [] },
      pipeline: { ...DEFAULT_PIPELINE },
      currentProcessingJobId: null,
      processingCancellation: { status: 'idle', error: null },
      failedPipelineStage: null,
      completedPipelineStages: new Set(),
      cachedSourcePath: null,
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
      singleRenderStatus: 'idle',
      singleRenderOutputPath: null,
      singleRenderError: null,
      errorLog: [],
      selectedClipIndex: 0,
      isDirty: false,
      projectRevision: 0,
      savedRevision: 0,
      saveStatus: 'idle',
      lastSavedAt: null,
      lastSaveError: null,
      _undoStack: [],
      _redoStack: [],
      _clipUndoStacks: {},
      _clipRedoStacks: {},
      _lastEditedClipId: null,
      _lastEditedSourceId: null,
      canUndo: false,
      canRedo: false,
    }),
});
