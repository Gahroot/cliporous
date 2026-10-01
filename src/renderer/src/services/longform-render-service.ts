import { isLongformPalette } from '@shared/longform-palette';
import {
  isSceneFirstLongformPlan,
  longformSourceFingerprint,
  sceneFirstPlanProblem,
} from '@shared/longform-scenes';
import { BUILTIN_PALETTES } from '@shared/palettes';
import { toast } from 'sonner';
import { longformApprovalProblem } from '@/lib/longform-approval';
import { useStore } from '@/store';
import type { RenderProgress, SourceVideo } from '@/store/types';
import { estimateExport, hashRenderOptions, runExportPreflight } from './export-queue';
import { LONGFORM_RENDER_DEFAULTS } from './render-defaults';

export interface StartLongformRenderResult {
  started: boolean;
  reason?:
    | 'no-source'
    | 'source-checking'
    | 'source-offline'
    | 'no-plan'
    | 'plan-not-approved'
    | 'plan-invalid'
    | 'palette-unavailable'
    | 'no-output-dir'
    | 'preflight-blocked'
    | 'invoke-failed';
}
type LongformFailureReason = NonNullable<StartLongformRenderResult['reason']>;

function getReadyLongform():
  | { state: ReturnType<typeof useStore.getState>; source: SourceVideo; sourceId: string }
  | { reason: LongformFailureReason } {
  const state = useStore.getState();
  const sourceId = state.activeSourceId;
  const source = sourceId ? state.sources.find((candidate) => candidate.id === sourceId) : null;
  if (!source || !sourceId) return { reason: 'no-source' };
  if (source.mediaStatus === 'checking') return { reason: 'source-checking' };
  if (source.mediaStatus === 'offline') return { reason: 'source-offline' };
  const record = state.getLongformPlan(sourceId);
  if (!record) return { reason: 'no-plan' };
  if (record.validationProblem || longformApprovalProblem(record))
    return { reason: 'plan-invalid' };
  if (
    record.status !== 'accepted' ||
    ((isSceneFirstLongformPlan(record.plan) || record.approvedVersionId != null) &&
      record.approvedVersionId !== record.activeVersionId)
  )
    return { reason: 'plan-not-approved' };
  if (isSceneFirstLongformPlan(record.plan)) {
    const words = state.transcriptions[sourceId]?.words ?? [];
    if (
      sceneFirstPlanProblem(record.plan) ||
      record.plan.sourceFingerprint !== longformSourceFingerprint(words, source.duration)
    )
      return { reason: 'plan-invalid' };
  }
  const paletteAvailable =
    (isLongformPalette(record.palette) && record.palette.id === record.paletteId) ||
    [...BUILTIN_PALETTES, ...state.settings.customPalettes].some(
      (palette) => palette.id === record.paletteId,
    );
  if (!paletteAvailable) return { reason: 'palette-unavailable' };
  return { state, source, sourceId };
}

async function resolveOutputDirectory(): Promise<string | null> {
  const state = useStore.getState();
  if (state.settings.outputDirectory) return state.settings.outputDirectory;
  const outputDirectory = await window.api.getDefaultOutputDirectory().catch(() => null);
  if (!outputDirectory) return null;
  useStore.setState((draft) => {
    draft.settings.outputDirectory = outputDirectory;
  });
  return outputDirectory;
}

function makeLongformQueueRow(
  source: SourceVideo,
  state: ReturnType<typeof useStore.getState>,
  estimate?: ReturnType<typeof estimateExport>,
): RenderProgress {
  return {
    clipId: source.id,
    kind: 'longform',
    label: `Long-form edit · ${source.name}`,
    sourceId: source.id,
    durationSeconds: source.duration,
    queuePosition: 0,
    optionsHash: hashRenderOptions({
      plan: state.getLongformPlan(source.id)?.activeVersionId,
      quality: state.settings.renderQuality,
      skin: state.getLongformPlan(source.id)?.skin,
      palette: state.getLongformPlan(source.id)?.paletteId,
    }),
    percent: 0,
    status: 'queued',
    checkpoints: [],
    queuedAt: Date.now(),
    ...(estimate
      ? {
          estimatedRenderSeconds: Math.round(
            (estimate.renderSecondsLow + estimate.renderSecondsHigh) / 2,
          ),
          estimatedSizeBytes: Math.round((estimate.sizeBytesLow + estimate.sizeBytesHigh) / 2),
        }
      : {}),
  };
}

function explainReadinessFailure(reason: LongformFailureReason): void {
  if (reason === 'source-checking') {
    toast.error('Wait for the source media check before rendering');
  } else if (reason === 'source-offline') {
    toast.error('Relink the source media before rendering');
  } else if (reason === 'no-plan') {
    toast.error('No Cut Plan is available');
  } else if (reason === 'plan-not-approved') {
    toast.error('Accept the Cut Plan before rendering');
  } else if (reason === 'plan-invalid') {
    toast.error('This Cut Plan no longer matches its source. Review a new draft before rendering.');
  } else if (reason === 'palette-unavailable') {
    toast.error('Restore or select a palette before rendering');
  } else {
    toast.error('No active source video');
  }
}

export async function prepareLongformRender(): Promise<StartLongformRenderResult> {
  const ready = getReadyLongform();
  if ('reason' in ready) {
    explainReadinessFailure(ready.reason);
    return { started: false, reason: ready.reason };
  }
  const outputDirectory = await resolveOutputDirectory();
  if (!outputDirectory) return { started: false, reason: 'no-output-dir' };
  const encoder = await window.api.getEncoder().catch(() => null);
  const draft = makeLongformQueueRow(ready.source, ready.state);
  const estimate = estimateExport([draft], ready.state.settings, 'longform', encoder);
  ready.state.clearRenderErrors();
  ready.state.setRenderProgress([makeLongformQueueRow(ready.source, ready.state, estimate)]);
  ready.state.setRenderCancellation({ status: 'idle', error: null });
  ready.state.setIsRendering(false);
  ready.state.setPipeline({ stage: 'rendering', message: 'Review export preflight', percent: 0 });
  return { started: true };
}

/** Render the active source from its explicitly approved, persisted Cut Plan. */
export async function startLongformRender(): Promise<StartLongformRenderResult> {
  const ready = getReadyLongform();
  if ('reason' in ready) {
    explainReadinessFailure(ready.reason);
    return { started: false, reason: ready.reason };
  }
  const { state, source, sourceId } = ready;
  const record = state.getLongformPlan(sourceId);
  if (!record) return { started: false, reason: 'no-plan' };
  const outputDirectory = await resolveOutputDirectory();
  if (!outputDirectory) {
    toast.error('Couldn’t resolve a default output directory');
    return { started: false, reason: 'no-output-dir' };
  }

  const currentRow =
    state.renderProgress.find((item) => item.clipId === sourceId) ??
    makeLongformQueueRow(source, state);
  const preflight = await runExportPreflight({
    destination: outputDirectory,
    sourcePaths: [source.path],
    queue: [currentRow],
    settings: state.settings,
    outputMode: 'longform',
  });
  const blocker = preflight.issues.find((issue) => issue.severity === 'blocker');
  if (blocker) {
    const error = state.addError({
      source: 'render',
      message: `${blocker.title}: ${blocker.detail}`,
      failedStage: 'rendering',
    });
    toast.error(error.headline);
    return { started: false, reason: 'preflight-blocked' };
  }

  const latest = getReadyLongform();
  if ('reason' in latest) {
    explainReadinessFailure(latest.reason);
    return { started: false, reason: latest.reason };
  }
  if (
    latest.sourceId !== sourceId ||
    latest.state.getLongformPlan(sourceId)?.activeVersionId !== record.activeVersionId
  )
    return { started: false, reason: 'plan-not-approved' };
  if (latest.source.path !== source.path || latest.source.duration !== source.duration) {
    toast.error('The source changed during export checks. Start the export again.');
    return { started: false, reason: 'plan-invalid' };
  }

  state.clearRenderErrors();
  state.setLongformReconciliation(sourceId, null);
  state.setRenderProgress([makeLongformQueueRow(source, state, preflight.estimate)]);
  state.setRenderCancellation({ status: 'idle', error: null });
  state.setIsRendering(true);
  state.setPipeline({ stage: 'rendering', message: 'Preparing long-form export', percent: 0 });

  try {
    const transcriptWords = state.transcriptions[sourceId]?.words;
    await window.api.startBatchRender({
      outputDirectory,
      outputProfile: 'longform',
      longformEditPlan: record.plan,
      longformSkinId: record.skin,
      longformPaletteId: record.paletteId,
      explainerScenesEnabled: state.settings.explainerScenesEnabled,
      ...(isSceneFirstLongformPlan(record.plan)
        ? { longformEditsEnabled: state.settings.explainerScenesEnabled }
        : {}),
      customPalettes: record.palette
        ? [{ ...record.palette }]
        : (state.settings.customPalettes ?? LONGFORM_RENDER_DEFAULTS.customPalettes),
      renderQuality: state.settings.renderQuality,
      developerMode: state.settings.developerMode,
      ...(isSceneFirstLongformPlan(record.plan)
        ? {}
        : { geminiApiKey: state.settings.geminiApiKey }),
      sourceMeta: {
        name: source.name,
        path: source.path,
        duration: source.duration,
      },
      jobs: [
        {
          clipId: sourceId,
          sourceVideoPath: source.path,
          startTime: 0,
          endTime: source.duration,
          ...(transcriptWords ? { wordTimestamps: transcriptWords } : {}),
        },
      ],
    });
    return { started: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    state.setIsRendering(false);
    state.setPipeline({ stage: 'ready', message: '', percent: 0 });
    const error = state.addError({
      source: 'render',
      message: `Couldn't start long-form render: ${message}`,
      failedStage: 'rendering',
    });
    toast.error(error.headline);
    return { started: false, reason: 'invoke-failed' };
  }
}
