import { isLongformPalette } from '@shared/longform-palette';
import { isSceneFirstPlanEnvelope, sceneFirstPlanProblem } from '@shared/longform-scenes';
import { BUILTIN_PALETTES, type Palette } from '@shared/palettes';
import { isStoryboardStyle } from '@shared/storyboards';
import type { LongformEditPlan, LongformRenderReconciliation } from '@shared/types';
import type { StateCreator } from 'zustand';
import {
  isScenePlanForReview,
  longformSceneReviewProblem,
  longformSceneScheduleIssues,
  type PreservedLongformItem,
} from '@/lib/longform-plan';
import { PROCESSING_STAGES } from './selectors';
import type { AppState, LongformSkinId } from './types';

export type LongformPlanVersionOrigin = 'generated' | 'user-edited' | 'regenerated' | 'accepted';
export type LongformPlanStatus = 'draft' | 'accepted' | 'rejected';

/** Appearance captured when a generation request starts, never resolved on completion. */
export interface LongformPlanAppearance {
  skin: LongformSkinId;
  paletteId: string;
  palette: Palette;
}

export const LONGFORM_PALETTE_PROBLEM =
  'The saved palette is unavailable or invalid. Select a palette in a new draft; the saved data is preserved.';

export interface LongformPlanVersion {
  id: string;
  plan: LongformEditPlan;
  origin: LongformPlanVersionOrigin;
  createdAt: number;
  note?: string;
  skin?: LongformSkinId;
  paletteId?: string;
  palette?: Palette;
  validationProblem?: string;
  preservedItems?: PreservedLongformItem[];
}

export interface LongformPlanFeedback {
  id: string;
  targetKey: string | null;
  targetLabel: string;
  message: string;
  createdAt: number;
  status: 'pending' | 'applied';
}

/** A persisted long-form edit plan, its review history, and render proof. */
export interface LongformPlanRecord {
  /** Active plan mirror kept for backward compatibility with saved projects. */
  plan: LongformEditPlan;
  skin: LongformSkinId;
  paletteId: string;
  palette?: Palette;
  versions?: LongformPlanVersion[];
  activeVersionId?: string;
  approvedVersionId?: string | null;
  status?: LongformPlanStatus;
  feedback?: LongformPlanFeedback[];
  preservedItems?: PreservedLongformItem[];
  reconciliation?: LongformRenderReconciliation | null;
  validationProblem?: string;
  /** Unsupported saved payload retained for recovery, never used for export. */
  preservedPlanData?: unknown;
}

/** Bounded session navigation, deliberately excluded from saved project data. */
export interface LongformReviewFocus {
  sourceId: string;
  sceneId: string;
}

export interface LongformSlice {
  longformPlans: Record<string, LongformPlanRecord>;
  longformReviewFocus: LongformReviewFocus | null;
  setLongformReviewFocus: (target: LongformReviewFocus | null) => void;
  focusLongformScene: (sourceId: string, sceneId: string) => boolean;
  setLongformPlan: (sourceId: string, record: LongformPlanRecord) => void;
  addLongformPlanVersion: (
    sourceId: string,
    plan: LongformEditPlan,
    origin: LongformPlanVersionOrigin,
    note?: string,
    appearance?: LongformPlanAppearance,
  ) => void;
  restoreLongformPlanVersion: (sourceId: string, versionId: string) => void;
  acceptLongformPlan: (sourceId: string, skin: LongformSkinId, paletteId: string) => void;
  setLongformPlanStyle: (sourceId: string, skin: LongformSkinId, paletteId: string) => void;
  setLongformPlanStoryboardStyle: AppState['setLongformPlanStoryboardStyle'];
  rejectLongformPlan: (sourceId: string) => void;
  addLongformPlanFeedback: (
    sourceId: string,
    feedback: Omit<LongformPlanFeedback, 'id' | 'createdAt' | 'status'>,
  ) => void;
  markLongformFeedbackApplied: (sourceId: string) => void;
  setLongformPreservedItems: (sourceId: string, items: PreservedLongformItem[]) => void;
  setLongformReconciliation: (
    sourceId: string,
    reconciliation: LongformRenderReconciliation | null,
  ) => void;
  clearLongformPlan: (sourceId: string) => void;
  getLongformPlan: (sourceId: string) => LongformPlanRecord | null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneLongformPlan<T extends LongformEditPlan>(plan: T): T {
  return JSON.parse(JSON.stringify(plan)) as T;
}

function snapshotPalette(
  paletteId: string,
  custom: Palette[] = [],
  saved?: Palette,
): Palette | undefined {
  // An embedded snapshot is authoritative, including when invalid. Do not repair
  // saved colors from a mutable library or resolve an unknown ID to Brand.
  const palette =
    saved !== undefined
      ? saved
      : [...BUILTIN_PALETTES, ...custom].find((item) => item.id === paletteId);
  return isLongformPalette(palette) && palette.id === paletteId ? { ...palette } : undefined;
}

function clonePreservedItems(items: PreservedLongformItem[]): PreservedLongformItem[] {
  return JSON.parse(JSON.stringify(items)) as PreservedLongformItem[];
}

export function getLongformVersions(record: LongformPlanRecord): LongformPlanVersion[] {
  if (record.versions && record.versions.length > 0) return record.versions;
  return [
    {
      id: record.activeVersionId ?? `legacy-${record.plan.generatedAt}`,
      plan: record.plan,
      origin: record.status === 'accepted' ? 'accepted' : 'generated',
      createdAt: record.plan.generatedAt,
      skin: record.skin,
      paletteId: record.paletteId,
      ...(record.palette ? { palette: { ...record.palette } } : {}),
      ...(record.validationProblem ? { validationProblem: record.validationProblem } : {}),
      preservedItems: clonePreservedItems(record.preservedItems ?? []),
    },
  ];
}

function ensureRecord(record: LongformPlanRecord): void {
  if (!record.versions || record.versions.length === 0) {
    record.versions = getLongformVersions(record);
  }
  if (!record.activeVersionId) {
    const latestVersionId = record.versions.at(-1)?.id;
    if (latestVersionId) record.activeVersionId = latestVersionId;
  }
  record.approvedVersionId ??= null;
  record.status ??= 'draft';
  record.feedback ??= [];
  record.preservedItems ??= [];
  record.reconciliation ??= null;
  if (record.validationProblem) {
    record.status = 'draft';
    record.approvedVersionId = null;
  }
}

function sceneApprovalBlocked(plan: LongformEditPlan): boolean {
  return (
    isScenePlanForReview(plan) &&
    (!isSceneFirstPlanEnvelope(plan) ||
      (plan.sections.some((section) => section.status === 'failed') &&
        (!plan.scenes.some((scene) => !scene.omitted) ||
          plan.sections.every((section) => section.status === 'failed'))) ||
      longformSceneScheduleIssues(plan).size > 0)
  );
}

function currentPlanProblem(
  state: AppState,
  sourceId: string,
  plan: LongformEditPlan,
): string | null {
  if (
    plan.mode === 'scene-first' ||
    (plan.schemaVersion !== undefined && plan.schemaVersion !== 1)
  ) {
    const problem = sceneFirstPlanProblem(plan);
    if (problem) return problem;
  }
  if (!isScenePlanForReview(plan)) return null;
  const source = state.sources.find((candidate) => candidate.id === sourceId);
  return longformSceneReviewProblem(
    plan,
    state.transcriptions[sourceId]?.words ?? [],
    source?.duration ?? 0,
  );
}

function hasReviewScene(state: AppState, target: LongformReviewFocus): boolean {
  const plan = state.longformPlans[target.sourceId]?.plan;
  return (
    state.sources.some((source) => source.id === target.sourceId) &&
    isSceneFirstPlanEnvelope(plan) &&
    plan.scenes.some((scene) => scene.id === target.sceneId)
  );
}

export const createLongformSlice: StateCreator<
  AppState,
  [['zustand/immer', never]],
  [],
  LongformSlice
> = (set, get) => ({
  longformPlans: {},
  longformReviewFocus: null,

  setLongformReviewFocus: (target) => {
    const state = get();
    if (target && !hasReviewScene(state, target)) return;
    if (
      state.longformReviewFocus?.sourceId === target?.sourceId &&
      state.longformReviewFocus?.sceneId === target?.sceneId
    )
      return;
    set({ longformReviewFocus: target ? { ...target } : null });
  },

  focusLongformScene: (sourceId, sceneId) => {
    const state = get();
    const target = { sourceId, sceneId };
    if (
      !hasReviewScene(state, target) ||
      state.isRendering ||
      state.singleRenderStatus === 'rendering' ||
      PROCESSING_STAGES.has(state.pipeline.stage) ||
      state.pipeline.stage === 'rendering' ||
      state.processingCancellation.status === 'cancelling' ||
      state.renderCancellation.status === 'cancelling' ||
      (state.clips[sourceId]?.length ?? 0) > 0 ||
      (state.stitchedClips[sourceId]?.length ?? 0) > 0
    )
      return false;
    set((draft) => {
      draft.longformReviewFocus = target;
      draft.activeSourceId = sourceId;
      draft.workspace.activeSourceId = sourceId;
      draft.workspace.stage = 'ready';
      draft.pipeline = { stage: 'ready', message: 'Review scene', percent: 100 };
    });
    return true;
  },

  setLongformPlan: (sourceId, record) =>
    set((state) => {
      const snapshot = JSON.parse(JSON.stringify(record)) as LongformPlanRecord;
      const palette = snapshotPalette(snapshot.paletteId, [], snapshot.palette);
      if (palette) snapshot.palette = palette;
      const problem =
        currentPlanProblem(state, sourceId, snapshot.plan) ||
        (!palette ? LONGFORM_PALETTE_PROBLEM : null);
      if (problem) {
        snapshot.preservedPlanData ??= JSON.parse(JSON.stringify(record));
        snapshot.validationProblem = problem;
      }
      ensureRecord(snapshot);
      state.longformPlans[sourceId] = snapshot;
    }),

  addLongformPlanVersion: (sourceId, plan, origin, note, appearance) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      if (appearance) {
        record.skin = appearance.skin;
        record.paletteId = appearance.paletteId;
        record.palette = { ...appearance.palette };
      }
      const palette = snapshotPalette(record.paletteId, [], record.palette);
      if (palette) record.palette = palette;
      const problem =
        currentPlanProblem(state, sourceId, plan) ||
        (!palette ? LONGFORM_PALETTE_PROBLEM : null) ||
        (origin === 'generated' || origin === 'regenerated' ? null : record.validationProblem);
      if (problem) record.validationProblem = problem;
      else delete record.validationProblem;
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan: cloneLongformPlan(plan),
        ...(problem ? { validationProblem: problem } : {}),
        origin,
        createdAt: Date.now(),
        skin: record.skin,
        paletteId: record.paletteId,
        ...(record.palette ? { palette: { ...record.palette } } : {}),
        preservedItems: clonePreservedItems(record.preservedItems ?? []),
        ...(note ? { note } : {}),
      };
      record.versions?.push(version);
      record.plan = cloneLongformPlan(plan);
      record.activeVersionId = version.id;
      const approved = origin === 'accepted' && !problem && !sceneApprovalBlocked(plan);
      record.status = approved ? 'accepted' : 'draft';
      record.approvedVersionId = approved ? version.id : null;
      record.reconciliation = null;
    }),

  restoreLongformPlanVersion: (sourceId, versionId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      const version = record.versions?.find((candidate) => candidate.id === versionId);
      if (!version) return;
      record.plan = cloneLongformPlan(version.plan);
      record.skin = version.skin ?? record.skin;
      // Historical versions without appearance metadata retain the record's prior meaning.
      // A missing custom snapshot still fails closed below; never consult global defaults.
      record.paletteId = version.paletteId ?? record.paletteId;
      const palette = snapshotPalette(record.paletteId, [], version.palette);
      record.palette = palette ?? version.palette;
      const problem =
        version.validationProblem ||
        currentPlanProblem(state, sourceId, record.plan) ||
        (!palette ? LONGFORM_PALETTE_PROBLEM : null);
      if (problem) record.validationProblem = problem;
      else delete record.validationProblem;
      record.activeVersionId = version.id;
      // A restored snapshot is reviewed again; prior export approval is not portable.
      record.status = 'draft';
      record.approvedVersionId = null;
      record.preservedItems = clonePreservedItems(version.preservedItems ?? []);
      record.reconciliation = null;
    }),

  acceptLongformPlan: (sourceId, skin, paletteId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      const palette = snapshotPalette(
        paletteId,
        paletteId === record.paletteId ? [] : state.settings.customPalettes,
        paletteId === record.paletteId ? record.palette : undefined,
      );
      const problem =
        record.validationProblem ||
        currentPlanProblem(state, sourceId, record.plan) ||
        (!palette ? LONGFORM_PALETTE_PROBLEM : null);
      if (problem || !palette || sceneApprovalBlocked(record.plan)) {
        if (problem) record.validationProblem = problem;
        record.status = 'draft';
        record.approvedVersionId = null;
        return;
      }
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan: cloneLongformPlan(record.plan),
        origin: 'accepted',
        createdAt: Date.now(),
        note: 'Approved for render',
        skin,
        paletteId,
        palette: { ...palette },
        preservedItems: clonePreservedItems(record.preservedItems ?? []),
      };
      record.versions?.push(version);
      record.activeVersionId = version.id;
      record.approvedVersionId = version.id;
      record.status = 'accepted';
      record.skin = skin;
      record.paletteId = paletteId;
      record.palette = { ...palette };
      record.reconciliation = null;
    }),

  setLongformPlanStyle: (sourceId, skin, paletteId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      const palette = snapshotPalette(
        paletteId,
        state.settings.customPalettes,
        record.paletteId === paletteId && record.skin !== skin && isLongformPalette(record.palette)
          ? record.palette
          : undefined,
      );
      if (
        record.skin === skin &&
        record.paletteId === paletteId &&
        JSON.stringify(record.palette) === JSON.stringify(palette)
      )
        return;
      ensureRecord(record);
      const problem =
        currentPlanProblem(state, sourceId, record.plan) ||
        (!palette ? LONGFORM_PALETTE_PROBLEM : null) ||
        (record.validationProblem === LONGFORM_PALETTE_PROBLEM ? null : record.validationProblem);
      if (problem) record.validationProblem = problem;
      else delete record.validationProblem;
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan: cloneLongformPlan(record.plan),
        origin: 'user-edited',
        createdAt: Date.now(),
        note: 'Changed scene style or palette',
        skin,
        paletteId,
        ...(palette ? { palette: { ...palette } } : {}),
        preservedItems: clonePreservedItems(record.preservedItems ?? []),
        ...(record.validationProblem ? { validationProblem: record.validationProblem } : {}),
      };
      record.versions?.push(version);
      record.activeVersionId = version.id;
      record.skin = skin;
      record.paletteId = paletteId;
      record.palette = palette;
      record.status = 'draft';
      record.approvedVersionId = null;
      record.reconciliation = null;
    }),

  setLongformPlanStoryboardStyle: (sourceId, style) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (
        !record ||
        !isStoryboardStyle(style) ||
        !isSceneFirstPlanEnvelope(record.plan) ||
        record.plan.parserVersion !== 2 ||
        record.plan.storyboardStyle === style
      )
        return;
      ensureRecord(record);
      const plan = cloneLongformPlan(record.plan);
      plan.storyboardStyle = style;
      const problem =
        currentPlanProblem(state, sourceId, plan) ||
        record.validationProblem ||
        (!snapshotPalette(record.paletteId, [], record.palette) ? LONGFORM_PALETTE_PROBLEM : null);
      const version: LongformPlanVersion = {
        id: makeId('cut-plan'),
        plan,
        origin: 'user-edited',
        createdAt: Date.now(),
        note: 'Changed storyboard style',
        skin: record.skin,
        paletteId: record.paletteId,
        ...(record.palette ? { palette: { ...record.palette } } : {}),
        preservedItems: clonePreservedItems(record.preservedItems ?? []),
        ...(problem ? { validationProblem: problem } : {}),
      };
      record.versions?.push(version);
      record.plan = cloneLongformPlan(plan);
      record.activeVersionId = version.id;
      record.status = 'draft';
      record.approvedVersionId = null;
      record.reconciliation = null;
      if (problem) record.validationProblem = problem;
      else delete record.validationProblem;
    }),

  rejectLongformPlan: (sourceId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.status = 'rejected';
      record.approvedVersionId = null;
      record.reconciliation = null;
    }),

  addLongformPlanFeedback: (sourceId, feedback) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.feedback?.push({
        ...feedback,
        id: makeId('feedback'),
        createdAt: Date.now(),
        status: 'pending',
      });
    }),

  markLongformFeedbackApplied: (sourceId) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      for (const feedback of record.feedback ?? []) {
        if (feedback.status === 'pending') feedback.status = 'applied';
      }
    }),

  setLongformPreservedItems: (sourceId, items) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.preservedItems = clonePreservedItems(items);
      const version = record.versions?.find((candidate) => candidate.id === record.activeVersionId);
      // Preservation is review metadata, not a mutation of the approved scene spec.
      if (version && version.origin !== 'accepted')
        version.preservedItems = clonePreservedItems(items);
    }),

  setLongformReconciliation: (sourceId, reconciliation) =>
    set((state) => {
      const record = state.longformPlans[sourceId];
      if (!record) return;
      ensureRecord(record);
      record.reconciliation = reconciliation;
    }),

  clearLongformPlan: (sourceId) =>
    set((state) => {
      delete state.longformPlans[sourceId];
      if (state.longformReviewFocus?.sourceId === sourceId) state.longformReviewFocus = null;
    }),

  getLongformPlan: (sourceId) => get().longformPlans[sourceId] ?? null,
});
