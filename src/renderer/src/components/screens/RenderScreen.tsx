/**
 * RenderScreen — per-clip render progress list + post-render summary.
 *
 * Layout (per ux spec):
 *   • Top bar: "Render All" Button (disabled while running). Becomes
 *     a destructive "Cancel" Button while a batch is in flight.
 *   • Body: one shadcn <Card> row per approved clip with:
 *       — small thumbnail
 *       — hook text (line-clamped)
 *       — status <Badge> (pending / rendering / done / error)
 *       — per-row <Progress> bar visible while rendering
 *       — error message line under the bar when status === 'error'
 *   • Footer (after batch completes): "Open Output Folder" + "Back to Clips".
 *
 * The screen subscribes to the five render send-channels via the preload
 * bridge:
 *   render:clipStart  · render:clipProgress · render:clipDone
 *   render:clipError  · render:batchDone
 * Subscriptions are wired in a single useEffect; each `on…` returns its own
 * unsubscribe and we clean them up on unmount or when the screen unmounts
 * mid-batch.
 *
 * Pure UI: orchestration of building RenderClipJob[] + global render settings
 * is intentionally minimal here — we forward what the store already has.
 * Anything more elaborate (B-Roll, hook overlay config, etc.) belongs in a
 * dedicated render-service and is out of scope for this screen.
 */

import { createStructuredError, type StructuredError } from '@shared/errors';
import { BUILTIN_PALETTES } from '@shared/palettes';
import type { LongformEditPlan, LongformRenderFallback } from '@shared/types';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FileSpreadsheet,
  FileVideo,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CompletedOutputCard } from '@/components/CompletedOutputCard';
import {
  CutPlanReconciliation,
  hasReconciliationChanges,
} from '@/components/CutPlanReconciliation';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import { ExportPreflight } from '@/components/ExportPreflight';
import { PalettePicker } from '@/components/PalettePicker';
import { TemplateEditor } from '@/components/TemplateEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { humanizeLongformKind } from '@/lib/longform-plan';
import { cn } from '@/lib/utils';
import { creatorPreparationLabel, recordRenderHistory } from '@/services/export-queue';
import { prepareLongformRender, startLongformRender } from '@/services/longform-render-service';
import { locateMissingSource } from '@/services/media-relink-service';
import { startApprovedRender } from '@/services/render-service';
import { useStore } from '@/store';
import type { LongformPlanRecord } from '@/store/longform-slice';
import { PROCESSING_STAGES } from '@/store/selectors';
import type {
  ClipCandidate,
  RenderProgress,
  SourceVideo,
  StitchedClipCandidate,
} from '@/store/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RowStatus = RenderProgress['status'];

interface RowProgress {
  status: RowStatus;
  percent: number;
  error?: StructuredError;
  outputPath?: string;
  prepareMessage?: string;
  preparationActivities?: RenderProgress['preparationActivities'];
  fallbacks?: RenderProgress['fallbacks'];
  summary?: string;
  completedWithChanges?: boolean;
}

interface RowProgressFields {
  error?: StructuredError | undefined;
  outputPath?: string | undefined;
  prepareMessage?: string | undefined;
  preparationActivities?: RenderProgress['preparationActivities'] | undefined;
  fallbacks?: RenderProgress['fallbacks'] | undefined;
  summary?: string | undefined;
  completedWithChanges?: boolean | undefined;
}

function toRowProgress(
  status: RowStatus,
  percent: number,
  fields: RowProgressFields = {},
): RowProgress {
  const row: RowProgress = { status, percent };
  if (fields.error !== undefined) row.error = fields.error;
  if (fields.outputPath !== undefined) row.outputPath = fields.outputPath;
  if (fields.prepareMessage !== undefined) row.prepareMessage = fields.prepareMessage;
  if (fields.preparationActivities !== undefined) {
    row.preparationActivities = fields.preparationActivities;
  }
  if (fields.fallbacks !== undefined) row.fallbacks = fields.fallbacks;
  if (fields.summary !== undefined) row.summary = fields.summary;
  if (fields.completedWithChanges !== undefined)
    row.completedWithChanges = fields.completedWithChanges;
  return row;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Summarize a long-form AI edit plan for the render status surface (RF-012).
 * These are planned totals, not a claim that every explanation rendered.
 * The saved export check reports which approved visuals reached the file.
 *
 * Example: "5 blocks (2 bar-chart, 2 stat-grid, 1 callout) · 3 cards · 12 phrases".
 */
function summarizeLongformPlan(plan: LongformEditPlan): string {
  if (plan.mode === 'scene-first') {
    const included = plan.scenes.filter((scene) => !scene.omitted).length;
    return `${included} explanation ${included === 1 ? 'scene' : 'scenes'} · ${plan.scenes.length - included} omitted`;
  }
  const blocks = plan.blocks ?? [];
  const cards = plan.cards ?? [];
  const phrases = plan.phrases ?? [];

  const kindCounts = new Map<string, number>();
  for (const b of blocks) kindCounts.set(b.kind, (kindCounts.get(b.kind) ?? 0) + 1);
  const breakdown = Array.from(kindCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => `${n} ${kind}`)
    .join(', ');

  const parts = [
    `${blocks.length} block${blocks.length === 1 ? '' : 's'}${breakdown ? ` (${breakdown})` : ''}`,
    `${cards.length} card${cards.length === 1 ? '' : 's'}`,
    `${phrases.length} phrase${phrases.length === 1 ? '' : 's'}`,
  ];
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Status Badge — shadcn <Badge> only (no custom UI)
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  completedWithChanges = false,
}: {
  status: RowStatus;
  completedWithChanges?: boolean | undefined;
}): React.JSX.Element {
  if (status === 'done' && completedWithChanges) {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-warning">
        <AlertTriangle className="h-3 w-3" aria-hidden /> Completed with changes
      </Badge>
    );
  }
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="gap-1 font-normal">
          Pending
        </Badge>
      );
    case 'preparing':
    case 'rendering':
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status === 'preparing' ? 'Preparing' : 'Rendering'}
        </Badge>
      );
    case 'done':
      return (
        <Badge variant="default" className="gap-1 font-normal">
          <Check className="h-3 w-3" />
          File ready
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1 font-normal">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
          <X className="h-3 w-3" />
          Cancelled
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Generic progress row — used by output modes without a ClipCandidate (e.g.
// the long-form 16:9 pipeline, which renders a single whole-video job).
// ---------------------------------------------------------------------------

function RenderErrorDetails({ progress }: { progress: RowProgress }): React.JSX.Element | null {
  if (progress.status !== 'error' || !progress.error) return null;
  return <ErrorPresentation error={progress.error} compact className="mt-3" />;
}

function GenericRow({
  label,
  progress,
  poster,
  planSummary,
  controls,
  fallbackActions,
}: {
  label: string;
  progress: RowProgress;
  poster?: string;
  planSummary?: string;
  controls?: ReactNode;
  fallbackActions?: ReactNode;
}): React.JSX.Element {
  const isActive = progress.status === 'rendering' || progress.status === 'preparing';
  const isDone = progress.status === 'done';
  const isError = progress.status === 'error';
  const showBar = isActive || isDone;
  const barValue = isDone ? 100 : Math.max(0, Math.min(100, progress.percent));

  return (
    <Card className="flex items-center gap-3 border-border/80 bg-card/75 p-3 transition-[border-color,box-shadow] duration-150 hover:border-primary/35">
      <div className="bg-muted text-muted-foreground flex h-16 w-9 shrink-0 items-center justify-center overflow-hidden rounded">
        {poster ? (
          <img src={poster} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <FileVideo className="h-4 w-4 opacity-60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p
            className={cn(
              'line-clamp-2 text-sm font-medium leading-snug',
              isError && 'text-destructive',
            )}
            title={label}
          >
            {label}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge
              status={progress.status}
              completedWithChanges={progress.completedWithChanges}
            />
            {controls}
          </div>
        </div>
        {showBar && (
          <Progress
            value={barValue}
            className={cn('mt-2 h-1.5', isError && '[&>div]:bg-destructive')}
          />
        )}
        {planSummary && (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs" title={planSummary}>
            {planSummary}
          </p>
        )}
        {progress.status === 'preparing' && progress.prepareMessage && (
          <p
            className="mt-1.5 line-clamp-1 text-xs text-muted-foreground"
            title={progress.prepareMessage}
          >
            {progress.prepareMessage}
          </p>
        )}
        {progress.preparationActivities && progress.preparationActivities.length > 0 && (
          <ul
            className="mt-2 space-y-1 text-[11px] text-muted-foreground"
            aria-label="Recent preparation activity"
          >
            {progress.preparationActivities.slice(-2).map((activity) => (
              <li key={activity.id} className="flex items-center gap-1.5">
                {activity.status === 'running' ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3 w-3 text-success" aria-hidden />
                )}
                {activity.label}
              </li>
            ))}
          </ul>
        )}
        {progress.fallbacks && progress.fallbacks.length > 0 && (
          <div className="mt-2 rounded-md border border-warning/35 bg-warning/10 p-2.5 text-xs">
            <p className="flex items-start gap-1.5 font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {progress.fallbacks.length} visual{' '}
              {progress.fallbacks.length === 1 ? 'moment used' : 'moments used'} the speaker shot
            </p>
            <p className="mt-1 text-muted-foreground">
              {progress.fallbacks[progress.fallbacks.length - 1]?.reason}
            </p>
            {fallbackActions && (
              <div className="mt-2 flex flex-wrap gap-1.5">{fallbackActions}</div>
            )}
          </div>
        )}
        {isDone && progress.completedWithChanges && (
          <p className="mt-2 text-xs text-warning">
            Video file ready. Some visuals changed; the output is still usable.
          </p>
        )}
        {isDone && progress.summary && (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground" title={progress.summary}>
            {progress.summary}
          </p>
        )}
        <RenderErrorDetails progress={progress} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Long-form re-render setup — shown when a restored long-form project (saved
// Gemini edit plan, no short-form clips) is opened. Lets the user change the
// skin/palette, then render straight from the persisted plan (no AI re-run).
// ---------------------------------------------------------------------------

function LongformSetup({
  record,
  source,
  disabled,
}: {
  record: LongformPlanRecord;
  source: SourceVideo | null;
  disabled: boolean;
}): React.JSX.Element {
  const phrases = record.plan.phrases.length;
  const blocks = record.plan.blocks.length;
  const cards = record.plan.cards?.length ?? 0;
  const scenes = record.plan.mode === 'scene-first' ? record.plan.scenes : [];
  const includedScenes = scenes.filter((scene) => !scene.omitted).length;
  const noVisualBeats = phrases + blocks + cards + includedScenes === 0;
  const sourceChecking = source?.mediaStatus === 'checking';
  const sourceUnavailable = !source || source.mediaStatus === 'offline';

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-border bg-muted/25 p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-5">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
            {source?.thumbnail ? (
              <img
                src={source.thumbnail}
                alt="Representative source frame"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <FileVideo className="h-5 w-5 opacity-60" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {record.status === 'accepted' ? 'Approved plan' : 'Review required'}
              </Badge>
              <Badge variant="outline">No AI re-analysis</Badge>
            </div>
            <h2
              className="mt-2 truncate text-base font-semibold text-foreground"
              title={source?.name}
            >
              {source?.name ?? 'Long-form source unavailable'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Export one full-length video from the saved plan after approval. Style changes affect
              the next export only; existing files are kept.
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {record.plan.mode === 'scene-first' && (
                <div>
                  <dt className="text-muted-foreground">Explanation scenes</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {includedScenes} included · {scenes.length - includedScenes} omitted
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Phrase overlays</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{phrases}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Content blocks</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{blocks}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Overlay cards</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{cards}</dd>
              </div>
            </dl>
          </div>
        </div>

        {sourceChecking && (
          <div
            role="status"
            className="flex items-start gap-2 border-b border-border bg-muted/25 p-4"
          >
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
            <div>
              <p className="text-xs font-medium text-foreground">Checking source media</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Export preparation unlocks when the saved source is confirmed.
              </p>
            </div>
          </div>
        )}

        {sourceUnavailable && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 p-4"
          >
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="text-xs font-medium text-foreground">Source media is unavailable</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Relink the original video before preparing this export.
                </p>
              </div>
            </div>
            {source && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void locateMissingSource(source.id)}
                disabled={disabled}
              >
                <FolderOpen className="h-4 w-4" aria-hidden />
                Relink source
              </Button>
            )}
          </div>
        )}

        {noVisualBeats && (
          <div
            className="flex items-start gap-2 border-b border-warning/35 bg-warning/10 p-4"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-xs font-medium text-foreground">Speaker-only saved plan</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This export has no planned overlays or content blocks. The source video still
                renders.
              </p>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Choose the next export treatment
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compare skin and palette choices against this project's frame and saved copy.
            </p>
          </div>
          <PalettePicker disabled={disabled} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RenderScreen
// ---------------------------------------------------------------------------

export function RenderScreen(): React.JSX.Element {
  // ── Store reads ────────────────────────────────────────────────────────
  const activeSourceId = useStore((state) => state.activeSourceId);
  const reviewBusy = useStore(
    (state) =>
      state.isRendering ||
      state.singleRenderStatus === 'rendering' ||
      PROCESSING_STAGES.has(state.pipeline.stage) ||
      state.pipeline.stage === 'rendering' ||
      state.processingCancellation.status === 'cancelling' ||
      state.renderCancellation.status === 'cancelling',
  );
  const clipsBySource = useStore((state) => state.clips);
  const stitchedBySource = useStore((state) => state.stitchedClips);
  const longformPlans = useStore((state) => state.longformPlans);
  const getLongformPlan = useStore((s) => s.getLongformPlan);
  const sources = useStore((s) => s.sources);
  const renderProgress = useStore((s) => s.renderProgress);
  const renderErrors = useStore((s) => s.renderErrors);
  const isRendering = useStore((s) => s.isRendering);
  const renderCancellation = useStore((s) => s.renderCancellation);
  const outputDirectory = useStore((s) => s.settings.outputDirectory);
  const longformPaletteId = useStore((s) => s.settings.longformPaletteId);
  const customPalettes = useStore((s) => s.settings.customPalettes);

  // ── Store writes ───────────────────────────────────────────────────────
  const setRenderProgress = useStore((s) => s.setRenderProgress);
  const setIsRendering = useStore((s) => s.setIsRendering);
  const setRenderCancellation = useStore((s) => s.setRenderCancellation);
  const setRenderError = useStore((s) => s.setRenderError);
  const clearRenderErrors = useStore((s) => s.clearRenderErrors);
  const setPipeline = useStore((s) => s.setPipeline);
  const setActiveSource = useStore((s) => s.setActiveSource);
  const setLongformReconciliation = useStore((s) => s.setLongformReconciliation);
  const addError = useStore((s) => s.addError);

  // ── Local state ────────────────────────────────────────────────────────
  // Tracks whether the most recent batch has finished — controls the
  // post-render footer (Open Folder / Back to Clips).
  const [batchSummary, setBatchSummary] = useState<{
    completed: number;
    failed: number;
    total: number;
    manifestCsvPath?: string;
  } | null>(null);
  const [stoppingAfterCurrent, setStoppingAfterCurrent] = useState(false);
  const cancellationWatchdogRef = useRef<number | null>(null);
  const segmentFallbacksRef = useRef<LongformRenderFallback[]>([]);
  const verifiedOutputPathsRef = useRef(new Set<string>());

  // Progress updates replace event subscriptions, but must not cancel the stop deadline.
  useEffect(
    () => () => {
      if (cancellationWatchdogRef.current !== null) {
        window.clearTimeout(cancellationWatchdogRef.current);
        cancellationWatchdogRef.current = null;
      }
    },
    [],
  );

  // Active source metadata — drives the long-form row label + poster frame.
  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? null,
    [sources, activeSourceId],
  );
  const sourceBlocked =
    !activeSource ||
    activeSource.mediaStatus === 'checking' ||
    activeSource.mediaStatus === 'offline';
  const sourceBlockedMessage =
    activeSource?.mediaStatus === 'checking'
      ? 'Wait for the source media check before rendering'
      : 'Relink the source media before rendering';
  const paletteUnavailable = ![...BUILTIN_PALETTES, ...customPalettes].some(
    (palette) => palette.id === longformPaletteId,
  );
  const renderBlocked = sourceBlocked || paletteUnavailable;
  const renderBlockedMessage = paletteUnavailable
    ? 'Restore or select a palette before rendering'
    : sourceBlockedMessage;

  // Persisted long-form edit plan for the active source (RF-001). A restored
  // long-form project has this but no short-form clips; we re-render straight
  // from it without re-calling Gemini. Subscribe to `longformPlans` so the
  // lookup stays reactive while still reading through the store getter.
  const longformPlanRecord = useMemo(() => {
    void longformPlans;
    return activeSourceId ? getLongformPlan(activeSourceId) : null;
  }, [activeSourceId, longformPlans, getLongformPlan]);

  // Seed the palette/skin picker with the axes the plan was saved with, so a
  // reopened project shows what it was rendered with. Seed once per source so
  // we don't clobber the user's in-session changes on every re-render.
  const seededSourceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!longformPlanRecord || !activeSourceId) return;
    if (seededSourceRef.current === activeSourceId) return;
    seededSourceRef.current = activeSourceId;
    const store = useStore.getState();
    store.setLongformSkin(longformPlanRecord.skin);
    store.setLongformPaletteId(longformPlanRecord.paletteId);
  }, [activeSourceId, longformPlanRecord]);

  const approvedClips = useMemo<ClipCandidate[]>(() => {
    if (!activeSourceId) return [];
    return (clipsBySource[activeSourceId] ?? []).filter((clip) => clip.status === 'approved');
  }, [activeSourceId, clipsBySource]);
  const approvedStitched = useMemo<StitchedClipCandidate[]>(() => {
    if (!activeSourceId) return [];
    return (stitchedBySource[activeSourceId] ?? []).filter((clip) => clip.status === 'approved');
  }, [activeSourceId, stitchedBySource]);
  const queueItems = useMemo<RenderProgress[]>(() => {
    if (renderProgress.length > 0) {
      return [...renderProgress].sort(
        (left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0),
      );
    }
    const now = Date.now();
    return [
      ...approvedClips.map((clip, index) => ({
        clipId: clip.id,
        kind: 'clip' as const,
        label: clip.hookText || 'Untitled clip',
        sourceId: clip.sourceId,
        durationSeconds: clip.duration,
        queuePosition: index,
        percent: 0,
        status: 'queued' as const,
        queuedAt: now,
      })),
      ...approvedStitched.map((clip, index) => ({
        clipId: clip.id,
        kind: 'stitched' as const,
        label: clip.hookText || 'Stitched story',
        sourceId: clip.sourceId,
        durationSeconds: clip.duration,
        queuePosition: approvedClips.length + index,
        percent: 0,
        status: 'queued' as const,
        queuedAt: now,
      })),
    ];
  }, [approvedClips, approvedStitched, renderProgress]);

  useEffect(() => {
    const pending = queueItems
      .filter(
        (item) =>
          item.status === 'done' &&
          item.outputPath &&
          !verifiedOutputPathsRef.current.has(item.outputPath),
      )
      .flatMap((item) => (item.outputPath ? [item.outputPath] : []));
    if (pending.length === 0) return;
    for (const path of pending) verifiedOutputPathsRef.current.add(path);
    void window.api
      .checkMediaPaths(pending)
      .then((statuses) => {
        const availability = new Map(statuses.map((status) => [status.path, status.available]));
        const current = useStore.getState().renderProgress;
        const next = current.map((item) => {
          if (!item.outputPath || !pending.includes(item.outputPath)) return item;
          if (availability.get(item.outputPath)) {
            return {
              ...item,
              checkpoints: Array.from(
                new Set([...(item.checkpoints ?? []), 'output-verified' as const]),
              ),
            };
          }
          const { outputPath: missingOutput, ...rest } = item;
          void missingOutput;
          return {
            ...rest,
            status: 'queued' as const,
            percent: 0,
            prepareMessage: 'Previous output is missing. Ready to render again.',
            checkpoints: (item.checkpoints ?? []).filter(
              (checkpoint) => checkpoint !== 'output-verified',
            ),
          };
        });
        setRenderProgress(next);
      })
      .catch(() => {
        for (const path of pending) verifiedOutputPathsRef.current.delete(path);
      });
  }, [queueItems, setRenderProgress]);

  // ── Subscribe to render:* events ───────────────────────────────────────
  useEffect(() => {
    // Snapshot the current renderProgress array on each event via the store
    // getState — avoids a stale-closure dependency on a reactive `state` ref.
    const upsertProgress = (clipId: string, patch: Partial<RenderProgress>): void => {
      const current = useStore.getState().renderProgress;
      const idx = current.findIndex((r) => r.clipId === clipId);
      if (idx === -1) {
        const next = queueItems.map((item) =>
          item.clipId === clipId ? { ...item, ...patch } : item,
        );
        if (!next.some((item) => item.clipId === clipId)) {
          next.push({
            clipId,
            status: patch.status ?? 'queued',
            percent: patch.percent ?? 0,
            ...patch,
          });
        }
        setRenderProgress(next);
      } else {
        const next = current.slice();
        const existing = next[idx];
        if (!existing) return;
        next[idx] = { ...existing, ...patch };
        setRenderProgress(next);
      }
    };

    const offPrepare = window.api.onRenderClipPrepare((data) => {
      // Prep runs before the encode begins. Don't downgrade a row that has
      // already moved on to 'rendering'/'done' (events can race on retry).
      const current = useStore.getState().renderProgress;
      const row = current.find((r) => r.clipId === data.clipId);
      if (row && (row.status === 'rendering' || row.status === 'done')) return;
      const label = creatorPreparationLabel(data.message);
      const previousActivities = (row?.preparationActivities ?? []).map((activity) =>
        activity.status === 'running' ? { ...activity, status: 'done' as const } : activity,
      );
      upsertProgress(data.clipId, {
        status: 'preparing',
        percent: Math.max(0, Math.min(100, data.percent)),
        prepareMessage: label,
        checkpoints: Array.from(new Set([...(row?.checkpoints ?? []), 'prepared' as const])),
        preparationActivities: [
          ...previousActivities,
          {
            id: `${data.clipId}-${Date.now()}-${data.percent}`,
            label,
            status: 'running' as const,
            timestamp: Date.now(),
          },
        ].slice(-8),
      });
    });

    const offStart = window.api.onRenderClipStart((data) => {
      if (useStore.getState().getLongformPlan(data.clipId)) {
        segmentFallbacksRef.current = [];
      }
      useStore.setState({
        activeEncoder: { encoder: data.encoder, isHardware: data.encoderIsHardware },
      });
      upsertProgress(data.clipId, {
        status: 'rendering',
        percent: 0,
        startedAt: Date.now(),
        preparationActivities: (
          useStore.getState().renderProgress.find((item) => item.clipId === data.clipId)
            ?.preparationActivities ?? []
        ).map((activity) => ({ ...activity, status: 'done' as const })),
      });
    });

    const offProgress = window.api.onRenderClipProgress((data) => {
      upsertProgress(data.clipId, {
        status: 'rendering',
        percent: Math.max(0, Math.min(100, data.percent)),
      });
    });

    const offDone = window.api.onRenderClipDone((data) => {
      const finishedAt = Date.now();
      const state = useStore.getState();
      const row = state.renderProgress.find((item) => item.clipId === data.clipId);
      const encoder = state.activeEncoder;
      if (row?.startedAt && row.durationSeconds && encoder) {
        recordRenderHistory({
          encoder: encoder.encoder,
          hardware: encoder.isHardware,
          quality: state.settings.renderQuality.preset,
          mediaSeconds: row.durationSeconds,
          renderSeconds: Math.max(1, (finishedAt - row.startedAt) / 1000),
          completedAt: finishedAt,
        });
      }
      upsertProgress(data.clipId, {
        status: 'done',
        percent: 100,
        outputPath: data.outputPath,
        completedAt: finishedAt,
        checkpoints: Array.from(
          new Set([...(row?.checkpoints ?? []), 'encoded' as const, 'output-verified' as const]),
        ),
        ...(data.summary ? { summary: data.summary } : {}),
      });
      if (data.reconciliation) {
        setLongformReconciliation(data.clipId, {
          ...data.reconciliation,
          fallbacks: [...data.reconciliation.fallbacks, ...segmentFallbacksRef.current],
        });
      }
    });

    const offFallback = window.api.onSegmentFallback((data) => {
      const state = useStore.getState();
      const row = state.renderProgress.find((item) => item.clipId === data.clipId);
      const kind = humanizeLongformKind(data.archetype);
      const fallback = {
        id: `${data.clipId}-${data.segmentIndex}-${Date.now()}`,
        message: `${kind} used the speaker shot`,
        reason: data.reason,
        actionable: true,
        timestamp: Date.now(),
      };
      upsertProgress(data.clipId, { fallbacks: [...(row?.fallbacks ?? []), fallback] });
      if (state.getLongformPlan(data.clipId)) {
        segmentFallbacksRef.current.push({
          type: 'segment',
          count: 1,
          label: `Segment ${data.segmentIndex + 1}, ${kind}`,
          reason: data.reason,
        });
      }
    });

    const offError = window.api.onRenderClipError((data) => {
      setRenderError(data.clipId, data.error);
      upsertProgress(data.clipId, { status: 'error', error: data.error, completedAt: Date.now() });
      addError(data.error);
    });

    const offClipCancelled = window.api.onRenderClipCancelled((data) => {
      upsertProgress(data.clipId, { status: 'cancelled', percent: 0, completedAt: Date.now() });
    });

    const offBatchDone = window.api.onRenderBatchDone((data) => {
      if (cancellationWatchdogRef.current !== null) {
        window.clearTimeout(cancellationWatchdogRef.current);
        cancellationWatchdogRef.current = null;
      }
      setStoppingAfterCurrent(false);
      setRenderCancellation({ status: 'idle', error: null });
      setIsRendering(false);
      setPipeline({ stage: 'done', message: '', percent: 100 });
      setBatchSummary(data);
      const state = useStore.getState();
      const withChanges = state.renderProgress.some((item) => {
        const check = state.getLongformPlan(item.sourceId ?? item.clipId)?.reconciliation;
        return (
          item.status === 'done' &&
          ((item.fallbacks?.length ?? 0) > 0 ||
            (check && check.outputPath === item.outputPath && hasReconciliationChanges(check)))
        );
      });
      if (data.failed === 0 && withChanges) {
        toast.message(
          'Export completed with changes. The video files are usable; review the export check.',
        );
      } else if (data.failed === 0 && data.completed > 0) {
        toast.success(
          `Export pack ready: ${data.completed} of ${data.total} ${data.total === 1 ? 'file' : 'files'}`,
        );
      } else if (data.total === 0) {
        toast.message('No files exported.');
      } else {
        toast.error(
          `${data.failed} of ${data.total} ${data.total === 1 ? 'export' : 'exports'} failed`,
        );
      }
    });

    const offCancelled = window.api.onRenderCancelled((data) => {
      if (cancellationWatchdogRef.current !== null) {
        window.clearTimeout(cancellationWatchdogRef.current);
        cancellationWatchdogRef.current = null;
      }
      setStoppingAfterCurrent(false);
      setRenderCancellation({ status: 'idle', error: null });
      setIsRendering(false);
      setPipeline({ stage: 'done', message: 'Queue stopped with progress kept', percent: 0 });
      setBatchSummary(data);
      toast.message('Queue stopped. Completed media and remaining jobs are kept.');
    });

    return () => {
      offPrepare();
      offStart();
      offProgress();
      offDone();
      offFallback();
      offError();
      offClipCancelled();
      offBatchDone();
      offCancelled();
    };
  }, [
    setRenderProgress,
    setRenderError,
    setRenderCancellation,
    setIsRendering,
    setPipeline,
    setLongformReconciliation,
    addError,
    queueItems,
  ]);

  // ── Action: Render All ────────────────────────────────────────────────
  // Delegates to the shared render-service so the ClipGrid "Render Approved"
  // button and this "Render All" button stay in lockstep.
  const handleRenderAll = async (): Promise<void> => {
    setBatchSummary(null);
    setRenderCancellation({ status: 'idle', error: null });
    await startApprovedRender();
  };

  // Compatibility path for reopened completed projects. Draft and legacy plans
  // return to explicit review instead of bypassing approval.
  const handleLongformRender = async (): Promise<void> => {
    const record = activeSourceId ? useStore.getState().getLongformPlan(activeSourceId) : null;
    if (!record || record.status !== 'accepted') {
      setPipeline({ stage: 'ready', message: 'Cut Plan ready for review', percent: 100 });
      toast.message('Review and accept the Cut Plan before rendering');
      return;
    }
    setBatchSummary(null);
    await prepareLongformRender();
  };

  const handleReviewScene = (sceneId: string): void => {
    if (!activeSourceId || !useStore.getState().focusLongformScene(activeSourceId, sceneId)) {
      toast.error(
        'This scene is no longer available, or work is still running. Finish or stop active work before reviewing.',
      );
    }
  };

  // Review is navigation, not a new export: retain completed files and render evidence.
  const handleReviewPlan = (): void => {
    const state = useStore.getState();
    if (reviewBusy) return;
    const record = activeSourceId ? state.getLongformPlan(activeSourceId) : null;
    if (!record) return;
    if (record.plan.mode === 'scene-first' && record.plan.scenes.length > 0) {
      const firstChanged = record.reconciliation?.sceneResults?.find(
        (scene) =>
          scene.status !== 'rendered' &&
          record.plan.mode === 'scene-first' &&
          record.plan.scenes.some((planned) => planned.id === scene.id),
      );
      const sceneId = firstChanged?.id ?? record.plan.scenes[0]?.id;
      if (sceneId) handleReviewScene(sceneId);
      return;
    }
    setPipeline({
      stage: 'ready',
      message: 'Review the plan. Existing exports are kept.',
      percent: 100,
    });
  };

  // ── Action: Retry Failed ──────────────────────────────────────────────
  // Re-runs only the clips whose renderProgress status is 'error', so a
  // partial failure doesn't force a full re-encode of the successful clips.
  const handleRetryFailed = async (): Promise<void> => {
    if (useStore.getState().isRendering || useStore.getState().renderCancellation.status !== 'idle')
      return;
    const failedIds = useStore
      .getState()
      .renderProgress.filter((r) => r.status === 'error')
      .map((r) => r.clipId);
    if (failedIds.length === 0) return;
    setBatchSummary(null);
    setRenderCancellation({ status: 'idle', error: null });
    if (longformPlanRecord && failedIds.includes(activeSourceId ?? '')) {
      await startLongformRender();
      return;
    }
    await startApprovedRender({ clipIds: failedIds });
  };

  const handleRetryOne = async (clipId: string): Promise<void> => {
    if (useStore.getState().isRendering || useStore.getState().renderCancellation.status !== 'idle')
      return;
    setBatchSummary(null);
    if (longformPlanRecord && clipId === activeSourceId) {
      await startLongformRender();
      return;
    }
    await startApprovedRender({ clipIds: [clipId] });
  };

  const moveQueuedJob = (clipId: string, direction: -1 | 1): void => {
    if (isRendering) return;
    const current = [...useStore.getState().renderProgress].sort(
      (left, right) => (left.queuePosition ?? 0) - (right.queuePosition ?? 0),
    );
    const index = current.findIndex((item) => item.clipId === clipId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [
      current[target] as RenderProgress,
      current[index] as RenderProgress,
    ];
    setRenderProgress(current.map((item, position) => ({ ...item, queuePosition: position })));
  };

  const cancelQueuedJob = async (clipId: string): Promise<void> => {
    const current = useStore.getState().renderProgress;
    const row = current.find((item) => item.clipId === clipId);
    if (!row || row.status !== 'queued') return;
    if (isRendering) await window.api.cancelQueuedRenderJob(clipId);
    setRenderProgress(
      current.map((item) =>
        item.clipId === clipId
          ? { ...item, status: 'cancelled' as const, percent: 0, completedAt: Date.now() }
          : item,
      ),
    );
  };

  const handleStopAfterCurrent = async (): Promise<void> => {
    if (stoppingAfterCurrent) return;
    setStoppingAfterCurrent(true);
    try {
      await window.api.stopRenderAfterCurrent();
      toast.message('Finishing active exports. Remaining jobs will stay queued.');
    } catch (caught) {
      setStoppingAfterCurrent(false);
      toast.error(caught instanceof Error ? caught.message : "Couldn't stop the queue safely");
    }
  };

  const clearCompleted = (): void => {
    setRenderProgress(useStore.getState().renderProgress.filter((item) => item.status !== 'done'));
    setBatchSummary(null);
  };

  const handleFixFallback = (clipId: string): void => {
    const state = useStore.getState();
    if (state.isRendering || state.renderCancellation.status !== 'idle') return;
    if (longformPlanRecord && clipId === activeSourceId) {
      handleReviewPlan();
      return;
    }
    useStore.getState().setWorkspaceSelectedClip(clipId);
    setPipeline({ stage: 'ready', message: 'Review visual fallback', percent: 100 });
  };

  // ── Action: Cancel ────────────────────────────────────────────────────
  const handleCancel = async (): Promise<void> => {
    if (renderCancellation.status === 'cancelling') return;
    setRenderCancellation({ status: 'cancelling', error: null });

    const markCancellationFailed = (caught: unknown): void => {
      const state = useStore.getState();
      if (!state.isRendering || state.renderCancellation.status !== 'cancelling') return;
      const error = createStructuredError({
        source: 'render',
        error: caught,
        headline: "BatchClip couldn't stop rendering yet",
        whatHappened: 'The render is still running.',
        whatIsSafe: 'Completed outputs and your clip edits have been kept.',
        whatToDoNext: 'Try cancelling again. Keep BatchClip open until rendering stops.',
        failedStage: 'rendering',
        recoveryAction: 'retry',
        retryable: true,
      });
      addError(error);
      setRenderCancellation({ status: 'failed', error });
    };

    try {
      await window.api.cancelRender();
      const state = useStore.getState();
      if (!state.isRendering || state.renderCancellation.status !== 'cancelling') return;
      if (cancellationWatchdogRef.current !== null) {
        window.clearTimeout(cancellationWatchdogRef.current);
      }
      cancellationWatchdogRef.current = window.setTimeout(() => {
        const state = useStore.getState();
        if (state.isRendering && state.renderCancellation.status === 'cancelling') {
          markCancellationFailed(
            new Error('The render did not confirm cancellation within 25 seconds.'),
          );
        }
      }, 25_000);
    } catch (caught) {
      markCancellationFailed(caught);
    }
  };

  // ── Action: Open Output Folder ────────────────────────────────────────
  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.api.openOutputFolder(outputDirectory ?? undefined);
      // shell.openPath returns '' on success and an error string on failure.
      if (result) toast.error(`Couldn't open folder: ${result}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't open folder: ${msg}`);
    }
  };

  // ── Action: Open manifest.csv ────────────────────────────────
  // Opens the exported caption/hashtag sheet in the OS default app.
  const handleOpenCsv = async (): Promise<void> => {
    const csvPath = batchSummary?.manifestCsvPath;
    if (!csvPath) return;
    try {
      const result = await window.api.openPath(csvPath);
      // shell.openPath returns '' on success and an error string on failure.
      if (result) toast.error(`Couldn't open CSV: ${result}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't open CSV: ${msg}`);
    }
  };

  // ── Action: Back to Clips ─────────────────────────────────────────────
  const handleBackToClips = (): void => {
    setPipeline({ stage: 'ready', message: '', percent: 0 });
  };

  // ── Action: New video (long-form) ─────────────────────────────────────
  // Long-form has no clip grid to return to, so "Back to Clips" would strand
  // the user on ClipGrid's empty state. Reset to a clean slate → DropScreen.
  const handleNewVideo = (): void => {
    setBatchSummary(null);
    setRenderProgress([]);
    clearRenderErrors();
    setActiveSource(null);
    setPipeline({ stage: 'idle', message: '', percent: 0 });
  };

  // ── Render ────────────────────────────────────────────────────────────
  const reconciliation = longformPlanRecord?.reconciliation ?? null;
  const planScenes =
    longformPlanRecord?.plan.mode === 'scene-first' ? longformPlanRecord.plan.scenes : [];
  const reviewRouteAvailable =
    activeSource !== null &&
    activeSourceId !== null &&
    (clipsBySource[activeSourceId]?.length ?? 0) === 0 &&
    (stitchedBySource[activeSourceId]?.length ?? 0) === 0;
  const reviewableSceneIds = reviewRouteAvailable ? planScenes.map((scene) => scene.id) : [];
  const rowHasChanges = (item: RenderProgress): boolean => {
    const record = longformPlans[item.sourceId ?? item.clipId];
    const check = record?.reconciliation;
    return (
      item.status === 'done' &&
      ((item.fallbacks?.length ?? 0) > 0 ||
        !!(
          check &&
          check.outputPath === item.outputPath &&
          hasReconciliationChanges(
            check,
            record.plan.mode === 'scene-first' ? record.plan.scenes : [],
          )
        ))
    );
  };
  const showLongformSetup =
    longformPlanRecord !== null &&
    reconciliation === null &&
    approvedClips.length === 0 &&
    approvedStitched.length === 0 &&
    renderProgress.length === 0;
  const isLongform =
    longformPlanRecord !== null || queueItems.some((item) => item.kind === 'longform');
  const totalCount = showLongformSetup ? 1 : Math.max(queueItems.length, reconciliation ? 1 : 0);
  const doneCount =
    queueItems.length === 0 && reconciliation
      ? 1
      : queueItems.filter((item) => item.status === 'done').length;
  const changedCount =
    queueItems.length === 0 && reconciliation
      ? Number(hasReconciliationChanges(reconciliation, planScenes))
      : queueItems.filter(rowHasChanges).length;
  const failedCount = queueItems.filter((item) => item.status === 'error').length;
  const queuedCount = queueItems.filter((item) => item.status === 'queued').length;
  const cancelledCount = queueItems.filter((item) => item.status === 'cancelled').length;
  const completedRows = queueItems.filter(
    (item): item is RenderProgress & { outputPath: string } =>
      item.status === 'done' && typeof item.outputPath === 'string',
  );
  const isComplete = !isRendering && completedRows.length > 0 && queuedCount === 0;
  const showPreflight = !isRendering && queuedCount > 0 && !showLongformSetup;
  const isCancelling = renderCancellation.status === 'cancelling';
  const displayedError =
    renderCancellation.error ??
    [...queueItems].reverse().find((entry) => entry.error)?.error ??
    null;
  const itemNoun = isLongform ? 'video' : 'export';

  return (
    <div className="studio-shell mx-auto flex h-full w-full max-w-5xl flex-col overflow-y-auto px-4 py-4 sm:px-6 min-[1100px]:py-6">
      {/* Production queue header keeps counts, source, destination, and actions together. */}
      <div className="mb-4 grid shrink-0 grid-cols-1 items-end gap-3 border-b border-border/80 pb-4 md:grid-cols-[minmax(0,1fr)_auto] min-[1100px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[1100px]:gap-4 min-[1100px]:pb-5">
        <div className="min-w-0">
          <p className="text-primary text-[11px] font-semibold uppercase tracking-[0.16em]">
            Production queue
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight">Export</h1>
          <p role="status" className="mt-1 text-xs tabular-nums text-muted-foreground">
            {totalCount} {itemNoun}
            {totalCount === 1 ? '' : 's'}
            {queuedCount > 0 && ` · ${queuedCount} queued`}
            {doneCount > 0 && ` · ${doneCount} ${doneCount === 1 ? 'file' : 'files'} ready`}
            {changedCount > 0 && ` · ${changedCount} with changes`}
            {failedCount > 0 && ` · ${failedCount} failed`}
          </p>
          <p
            className="text-muted-foreground mt-2 max-w-xl break-all text-xs"
            title={outputDirectory ?? undefined}
          >
            Destination: {outputDirectory ?? 'Default export folder (confirmed before export)'}
          </p>
        </div>
        <section
          className="flex flex-wrap items-center gap-2 md:justify-end"
          aria-label="Render summary"
        >
          <span className="rounded-md border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs text-muted-foreground">
            <strong className="text-foreground">{queuedCount}</strong> queued
          </span>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
            <strong>{doneCount}</strong> {doneCount === 1 ? 'file' : 'files'} ready
          </span>
          <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            <strong>{failedCount}</strong> failed
          </span>
          {changedCount > 0 && (
            <span className="rounded-md border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <strong>{changedCount}</strong> completed with changes
            </span>
          )}
          {cancelledCount > 0 && (
            <span className="rounded-md border border-border/70 bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              <strong>{cancelledCount}</strong> cancelled
            </span>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2 min-[1100px]:col-span-1 min-[1100px]:justify-end">
          {isLongform ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewVideo}
              disabled={isRendering}
              title={isRendering ? 'Cancel the render first' : 'Start a new video'}
            >
              <Plus />
              New video
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToClips}
              disabled={isRendering}
              title={isRendering ? 'Cancel the render first' : 'Back to clips'}
            >
              <ArrowLeft />
              Back to Clips
            </Button>
          )}
          {!isRendering && !showLongformSetup && !isLongform && <TemplateEditor />}
          {isRendering ? (
            <>
              <Button
                size="sm"
                onClick={() => void handleStopAfterCurrent()}
                disabled={stoppingAfterCurrent}
                aria-live="polite"
              >
                {stoppingAfterCurrent ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Square aria-hidden />
                )}
                {stoppingAfterCurrent ? 'Finishing current exports' : 'Stop after current'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleCancel()}
                disabled={isCancelling || stoppingAfterCurrent}
                className={cn(isCancelling && 'disabled:opacity-100')}
              >
                {isCancelling && <Loader2 className="animate-spin" aria-hidden />}
                {isCancelling
                  ? 'Cancelling now'
                  : renderCancellation.status === 'failed'
                    ? 'Retry cancel'
                    : 'Cancel now'}
              </Button>
            </>
          ) : reconciliation ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReviewPlan}
              disabled={reviewBusy || !reviewRouteAvailable}
            >
              <RotateCcw />
              Review plan
            </Button>
          ) : showLongformSetup ? (
            <Button
              size="sm"
              onClick={handleLongformRender}
              disabled={renderBlocked}
              title={renderBlocked ? renderBlockedMessage : undefined}
            >
              <Play />
              Prepare export
            </Button>
          ) : doneCount > 0 ? (
            <Button size="sm" variant="outline" onClick={clearCompleted}>
              <X aria-hidden />
              Clear completed
            </Button>
          ) : null}
        </div>
      </div>

      {displayedError && (failedCount > 0 || renderCancellation.status === 'failed') && (
        <ErrorPresentation
          error={displayedError}
          className="mb-4"
          actions={
            renderCancellation.status === 'failed'
              ? [
                  {
                    label: 'Retry cancellation',
                    onClick: handleCancel,
                    icon: RotateCcw,
                  },
                ]
              : !isRendering && failedCount > 0
                ? [
                    ...(displayedError.recoveryAction === 'free-space'
                      ? [
                          {
                            label: 'Free Space',
                            onClick: () => window.api.openSettingsWindow(),
                            icon: SettingsIcon,
                          },
                        ]
                      : []),
                    ...(displayedError.recoveryAction === 'relink' && activeSource
                      ? [
                          {
                            label: 'Relink Source',
                            onClick: async () => {
                              await locateMissingSource(activeSource.id);
                            },
                            icon: FolderOpen,
                          },
                        ]
                      : []),
                    {
                      label: `Retry failed (${failedCount})`,
                      onClick: handleRetryFailed,
                      icon: RotateCcw,
                    },
                  ]
                : []
          }
        />
      )}

      {longformPlanRecord?.reconciliation && (
        <div className="mb-4">
          {isRendering && (
            <p className="mb-2 text-xs text-muted-foreground">
              Previous export — a new export is still running.
            </p>
          )}
          <CutPlanReconciliation
            reconciliation={longformPlanRecord.reconciliation}
            scenes={planScenes}
            onReviewScene={handleReviewScene}
            reviewDisabled={reviewBusy}
            reviewableSceneIds={reviewableSceneIds}
            compact
          />
        </div>
      )}

      {showPreflight && !isLongform && (
        <Card className="mb-4 p-4">
          <PalettePicker
            variant="compact"
            title="Animation colours"
            description="Used for animated scenes and caption highlights."
            disabled={isRendering}
          />
        </Card>
      )}

      {showPreflight && activeSource && (
        <div className="mb-4">
          <ExportPreflight
            queue={queueItems}
            sourceId={activeSource.id}
            sourcePaths={[activeSource.path]}
            outputMode={isLongform ? 'longform' : 'short'}
            onStart={
              isLongform
                ? async () => {
                    setBatchSummary(null);
                    await startLongformRender();
                  }
                : handleRenderAll
            }
          />
        </div>
      )}

      {/* ── Clip list ───────────────────────────────────────────────── */}
      <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
        {showLongformSetup && longformPlanRecord ? (
          <LongformSetup record={longformPlanRecord} source={activeSource} disabled={isRendering} />
        ) : queueItems.length === 0 && !reconciliation ? (
          <div className="flex h-full w-full items-center justify-center p-6">
            <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
              <FileVideo
                className="h-10 w-10 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-sm font-medium text-foreground">No exports queued</p>
              <p className="text-xs text-muted-foreground">
                Approve clips on the previous screen, then prepare an export.
              </p>
            </Card>
          </div>
        ) : (
          queueItems.map((item, index) => {
            const clip = approvedClips.find((candidate) => candidate.id === item.clipId);
            const stitched = approvedStitched.find((candidate) => candidate.id === item.clipId);
            const poster =
              clip?.customThumbnail ??
              clip?.thumbnail ??
              stitched?.customThumbnail ??
              stitched?.thumbnail ??
              activeSource?.thumbnail;
            const label =
              item.label ??
              clip?.hookText ??
              stitched?.hookText ??
              (activeSource ? `Long-form edit · ${activeSource.name}` : 'Long-form edit');
            const controls = (
              <>
                {item.status === 'queued' && !isRendering && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveQueuedJob(item.clipId, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${label} earlier`}
                      title="Move earlier"
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => moveQueuedJob(item.clipId, 1)}
                      disabled={index === queueItems.length - 1}
                      aria-label={`Move ${label} later`}
                      title="Move later"
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </>
                )}
                {item.status === 'queued' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => void cancelQueuedJob(item.clipId)}
                    aria-label={`Cancel queued export ${label}`}
                    title="Cancel queued export"
                  >
                    <X aria-hidden />
                  </Button>
                )}
                {item.status === 'error' && !isRendering && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetryOne(item.clipId)}
                  >
                    <RotateCcw aria-hidden /> Retry
                  </Button>
                )}
              </>
            );
            return (
              <GenericRow
                key={item.clipId}
                label={label}
                progress={toRowProgress(item.status, item.percent, {
                  error: item.error ?? renderErrors[item.clipId],
                  outputPath: item.outputPath,
                  prepareMessage: item.prepareMessage,
                  preparationActivities: item.preparationActivities,
                  fallbacks: item.fallbacks,
                  summary: item.summary,
                  completedWithChanges: rowHasChanges(item),
                })}
                {...(poster ? { poster } : {})}
                {...(item.kind === 'longform' && longformPlanRecord
                  ? { planSummary: summarizeLongformPlan(longformPlanRecord.plan) }
                  : {})}
                controls={controls}
                fallbackActions={
                  item.fallbacks?.some((fallback) => fallback.actionable) ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFixFallback(item.clipId)}
                        disabled={reviewBusy}
                      >
                        Review visual
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRetryOne(item.clipId)}
                        disabled={isRendering}
                      >
                        <RotateCcw aria-hidden /> Render again
                      </Button>
                    </>
                  ) : undefined
                }
              />
            );
          })
        )}
      </div>

      {completedRows.length > 0 && (
        <section
          className="mt-5 border-t border-border/80 pt-5"
          aria-labelledby="completed-outputs-heading"
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="completed-outputs-heading" className="text-lg font-semibold text-foreground">
                Finished media
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Play the real files, reveal them, copy a path, or render one again.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearCompleted}>
              <X aria-hidden /> Clear completed
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {completedRows.map((item) => {
              const clip = approvedClips.find((candidate) => candidate.id === item.clipId);
              const stitched = approvedStitched.find((candidate) => candidate.id === item.clipId);
              const poster =
                clip?.customThumbnail ??
                clip?.thumbnail ??
                stitched?.customThumbnail ??
                stitched?.thumbnail ??
                activeSource?.thumbnail;
              return (
                <CompletedOutputCard
                  key={item.clipId}
                  item={item}
                  {...(poster ? { poster } : {})}
                  onRenderAgain={handleRetryOne}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ── Post-batch footer ──────────────────────────────────────── */}
      {isComplete && (
        <div className="mt-4 shrink-0 space-y-3 border-t pt-4">
          {/* Manifest note — tells the user the caption/hashtag sheet exists
              and lets them open it in one click. */}
          {batchSummary?.manifestCsvPath && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  Captions &amp; hashtags exported to{' '}
                  <span className="text-foreground">manifest.csv</span>
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={handleOpenCsv}>
                <FileSpreadsheet />
                Open CSV
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {outputDirectory ? (
              <p className="text-muted-foreground min-w-0 truncate text-xs" title={outputDirectory}>
                Saved to <span className="text-foreground">{outputDirectory}</span>
              </p>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {longformPlanRecord ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReviewPlan}
                  disabled={reviewBusy || !reviewRouteAvailable}
                >
                  <RotateCcw />
                  Review plan
                </Button>
              ) : (
                failedCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetryFailed}
                    disabled={sourceBlocked}
                    title={sourceBlocked ? sourceBlockedMessage : undefined}
                  >
                    <RotateCcw />
                    Retry Failed ({failedCount})
                  </Button>
                )
              )}
              <Button size="sm" onClick={handleOpenFolder} disabled={!outputDirectory}>
                <Folder />
                Open Output Folder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
