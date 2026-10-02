import { normalizeStoryboardStyle } from '@shared/storyboards';
import type { StateCreator } from 'zustand';
import type {
  AppState,
  CreativeBrief,
  CreativeBriefFields,
  ProjectCreatorProfile,
  ProjectWorkspace,
  PromoProjectPlan,
} from './types';

export const EMPTY_CREATIVE_BRIEF_FIELDS: CreativeBriefFields = {
  audience: '',
  goal: '',
  callToAction: '',
  tone: '',
  mustInclude: '',
  prohibitedClaims: '',
  notes: '',
};

export const DEFAULT_CREATIVE_BRIEF: CreativeBrief = {
  ...EMPTY_CREATIVE_BRIEF_FIELDS,
  committed: null,
  savedAt: null,
  updatedAt: null,
};

export const DEFAULT_PROJECT_CREATOR_PROFILE: ProjectCreatorProfile = {
  profileId: null,
  overrides: {},
};

export const DEFAULT_PROMO_PLAN: PromoProjectPlan = {
  beats: [],
  ctaSource: 'profile',
  ctaAssetPath: null,
  reviewedAt: null,
};

export const DEFAULT_PROJECT_WORKSPACE: ProjectWorkspace = {
  stage: 'idle',
  activeSourceId: null,
  selectedClipId: null,
  clipFilter: 'all',
  clipSort: 'score',
  inspectorTab: 'edit',
  gridScrollTop: 0,
  previewPlayheadByClip: {},
};

export interface WorkspaceSlice {
  workspace: ProjectWorkspace;
  creativeBrief: CreativeBrief;
  creatorProfile: ProjectCreatorProfile;
  promoPlan: PromoProjectPlan;
  setWorkspaceStage: AppState['setWorkspaceStage'];
  setWorkspaceSelectedClip: AppState['setWorkspaceSelectedClip'];
  setWorkspaceFilter: AppState['setWorkspaceFilter'];
  setWorkspaceSort: AppState['setWorkspaceSort'];
  setWorkspaceInspectorTab: AppState['setWorkspaceInspectorTab'];
  setWorkspaceGridScrollTop: AppState['setWorkspaceGridScrollTop'];
  setWorkspacePlayhead: AppState['setWorkspacePlayhead'];
  setCreativeBrief: AppState['setCreativeBrief'];
  commitCreativeBrief: AppState['commitCreativeBrief'];
  setCreatorProfile: AppState['setCreatorProfile'];
  setCreatorProfileOverride: AppState['setCreatorProfileOverride'];
  clearCreatorProfileOverride: AppState['clearCreatorProfileOverride'];
  clearCreatorProfileOverrides: AppState['clearCreatorProfileOverrides'];
  setPromoPlan: AppState['setPromoPlan'];
}

export const createWorkspaceSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  WorkspaceSlice
> = (set) => ({
  workspace: { ...DEFAULT_PROJECT_WORKSPACE },
  creativeBrief: { ...DEFAULT_CREATIVE_BRIEF },
  creatorProfile: { ...DEFAULT_PROJECT_CREATOR_PROFILE, overrides: {} },
  promoPlan: { ...DEFAULT_PROMO_PLAN, beats: [] },

  setWorkspaceStage: (stage) =>
    set((state) => {
      state.workspace.stage = stage;
    }),
  setWorkspaceSelectedClip: (selectedClipId) =>
    set((state) => {
      state.workspace.selectedClipId = selectedClipId;
    }),
  setWorkspaceFilter: (clipFilter) =>
    set((state) => {
      state.workspace.clipFilter = clipFilter;
    }),
  setWorkspaceSort: (clipSort) =>
    set((state) => {
      state.workspace.clipSort = clipSort;
    }),
  setWorkspaceInspectorTab: (inspectorTab) =>
    set((state) => {
      state.workspace.inspectorTab = inspectorTab;
    }),
  setWorkspaceGridScrollTop: (gridScrollTop) =>
    set((state) => {
      state.workspace.gridScrollTop = Math.max(0, Math.round(gridScrollTop));
    }),
  setWorkspacePlayhead: (clipId, seconds) =>
    set((state) => {
      if (Number.isFinite(seconds))
        state.workspace.previewPlayheadByClip[clipId] = Math.max(0, seconds);
    }),
  setCreativeBrief: (brief) =>
    set((state) => {
      Object.assign(state.creativeBrief, brief, { updatedAt: new Date().toISOString() });
    }),
  commitCreativeBrief: () =>
    set((state) => {
      const committed: CreativeBriefFields = {
        audience: state.creativeBrief.audience,
        goal: state.creativeBrief.goal,
        callToAction: state.creativeBrief.callToAction,
        tone: state.creativeBrief.tone,
        mustInclude: state.creativeBrief.mustInclude,
        prohibitedClaims: state.creativeBrief.prohibitedClaims,
        notes: state.creativeBrief.notes,
      };
      const savedAt = new Date().toISOString();
      state.creativeBrief.committed = committed;
      state.creativeBrief.savedAt = savedAt;
      state.creativeBrief.updatedAt = savedAt;
    }),
  setCreatorProfile: (profileId) =>
    set((state) => {
      state.creatorProfile.profileId = profileId;
      state.creatorProfile.overrides = {};
    }),
  setCreatorProfileOverride: (key, value) =>
    set((state) => {
      if (value === undefined) delete state.creatorProfile.overrides[key];
      else
        Object.assign(state.creatorProfile.overrides, {
          [key]: key === 'longformStoryboardStyle' ? normalizeStoryboardStyle(value) : value,
        });
    }),
  clearCreatorProfileOverride: (key) =>
    set((state) => {
      delete state.creatorProfile.overrides[key];
    }),
  clearCreatorProfileOverrides: () =>
    set((state) => {
      state.creatorProfile.overrides = {};
    }),
  setPromoPlan: (patch) =>
    set((state) => {
      Object.assign(state.promoPlan, patch, { reviewedAt: patch.reviewedAt ?? null });
    }),
});
