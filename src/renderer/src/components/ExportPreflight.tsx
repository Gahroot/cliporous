import {
  AlertTriangle,
  Check,
  Cpu,
  FolderOpen,
  Gauge,
  HardDrive,
  Loader2,
  Settings,
  Timer,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type ExportPreflightResult,
  formatBytes,
  formatEstimateRange,
  runExportPreflight,
} from '@/services/export-queue';
import { formatJobDuration } from '@/services/job-service';
import { locateMissingSource } from '@/services/media-relink-service';
import { useStore } from '@/store';
import type { OutputMode, RenderProgress } from '@/store/types';

interface ExportPreflightProps {
  queue: readonly RenderProgress[];
  sourceId: string | null;
  sourcePaths: string[];
  outputMode: OutputMode;
  onStart: () => void | Promise<void>;
  starting?: boolean;
}

function PreflightMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  detail?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0 border-l border-border/80 pl-3 first:border-l-0 first:pl-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function ExportPreflight({
  queue,
  sourceId,
  sourcePaths,
  outputMode,
  onStart,
  starting = false,
}: ExportPreflightProps): React.JSX.Element {
  const settings = useStore((state) => state.settings);
  const setOutputDirectory = useStore((state) => state.setOutputDirectory);
  const clips = useStore((state) => state.clips);
  const stitchedClips = useStore((state) => state.stitchedClips);
  const pendingQueue = useMemo(() => queue.filter((item) => item.status === 'queued'), [queue]);
  const requestRef = useRef(0);
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<ExportPreflightResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const queueSignature = useMemo(
    () => pendingQueue.map((item) => `${item.clipId}:${item.durationSeconds ?? 0}`).join('|'),
    [pendingQueue],
  );
  const sourceSignature = sourcePaths.join('|');

  const check = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current;
    setChecking(true);
    setCheckError(null);
    setResult(null);
    try {
      const destination =
        settings.outputDirectory ??
        ((await window.api.getDefaultOutputDirectory().catch(() => null)) || '');
      const next = await runExportPreflight({
        destination,
        sourcePaths,
        queue: pendingQueue,
        settings,
        outputMode,
      });
      if (request === requestRef.current) setResult(next);
    } catch (caught) {
      if (request === requestRef.current) {
        setCheckError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (request === requestRef.current) setChecking(false);
    }
  }, [outputMode, pendingQueue, settings, sourcePaths]);

  useEffect(() => {
    void queueSignature;
    void sourceSignature;
    void check();
    return () => {
      requestRef.current += 1;
    };
  }, [check, queueSignature, sourceSignature]);

  const blockers = result?.issues.filter((issue) => issue.severity === 'blocker') ?? [];
  const warnings = result?.issues.filter((issue) => issue.severity === 'warning') ?? [];
  const reviewCounts = { approved: 0, pending: 0, rejected: 0 };
  for (const item of pendingQueue) {
    const id = item.sourceId ?? sourceId;
    const clip = id
      ? [...(clips[id] ?? []), ...(stitchedClips[id] ?? [])].find((clip) => clip.id === item.clipId)
      : undefined;
    if (clip) reviewCounts[clip.status] += 1;
  }
  const stitchedCount = pendingQueue.filter((item) => item.kind === 'stitched').length;
  const fileCount = pendingQueue.length;
  const startDisabled =
    checking ||
    starting ||
    launching ||
    !result ||
    !!checkError ||
    blockers.length > 0 ||
    fileCount === 0 ||
    !sourceId ||
    sourcePaths.length === 0;

  const chooseDestination = async (): Promise<void> => {
    const path = await window.api.openDirectory();
    if (!path) return;
    setOutputDirectory(path);
  };

  const handleIssueAction = async (
    action: 'settings' | 'relink' | 'choose-destination',
  ): Promise<void> => {
    if (action === 'settings') {
      await window.api.openSettingsWindow();
      return;
    }
    if (action === 'choose-destination') {
      await chooseDestination();
      return;
    }
    if (sourceId) await locateMissingSource(sourceId);
  };

  return (
    <Card className="border-border/80 bg-card/85 p-4" aria-busy={checking}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Before you export</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Destination, media, space, and encoder are checked before expensive work starts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void check()}
          disabled={checking || starting || launching}
        >
          {checking ? <Loader2 className="animate-spin" aria-hidden /> : <Gauge aria-hidden />}
          {checking ? 'Checking' : 'Check again'}
        </Button>
      </div>

      <section aria-label="Export scope" className="mt-4 space-y-1 text-xs">
        <p className="font-semibold text-foreground">
          {fileCount} {outputMode === 'longform' ? 'full-length video' : 'queued clip'}
          {fileCount === 1 ? '' : 's'}
          {' · '}
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </p>
        <p className="text-muted-foreground">
          {outputMode === 'longform'
            ? 'The approved plan, across the whole source video.'
            : 'Only the queued clips below. Finished, failed, and cancelled items are not included.'}
        </p>
        {outputMode === 'short' && (
          <p className="text-muted-foreground">
            {reviewCounts.approved} approved · {reviewCounts.pending} unreviewed ·{' '}
            {reviewCounts.rejected} rejected
            {stitchedCount > 0 &&
              ` · ${stitchedCount} stitched ${stitchedCount === 1 ? 'story' : 'stories'}`}
          </p>
        )}
        <p>
          Fixed format: {outputMode === 'longform' ? '1920×1080 · 16:9' : '1080×1920 · 9:16'} · 30
          fps
        </p>
        <p className="break-all">
          Destination:{' '}
          {result?.destination || settings.outputDirectory || 'Checking the default export folder…'}
        </p>
      </section>

      {result && (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-y border-border/80 py-4 md:grid-cols-3 xl:grid-cols-5">
          <PreflightMetric
            icon={HardDrive}
            label="Free space"
            value={result.disk ? formatBytes(result.disk.free) : 'Unavailable'}
            detail={`Estimated ${formatBytes(result.estimate.sizeBytesLow)}–${formatBytes(result.estimate.sizeBytesHigh)}`}
          />
          <PreflightMetric
            icon={Cpu}
            label="Encoder"
            value={result.encoder?.encoder ?? 'Selected at start'}
            detail={result.encoder?.isHardware ? 'Hardware accelerated' : 'Software encode'}
          />
          <PreflightMetric
            icon={Gauge}
            label="Output"
            value={`${result.resolution} · ${result.fps} fps`}
            detail={result.qualityLabel}
          />
          <PreflightMetric
            icon={Timer}
            label="Media"
            value={`${result.clipCount} ${result.clipCount === 1 ? 'job' : 'jobs'} · ${formatJobDuration(result.totalDurationSeconds)}`}
          />
          <PreflightMetric
            icon={Timer}
            label="Estimated time"
            value={formatEstimateRange(
              result.estimate.renderSecondsLow,
              result.estimate.renderSecondsHigh,
            )}
            detail={
              result.estimate.learnedFromLocalSamples > 0
                ? `${result.estimate.learnedFromLocalSamples} recent local sample${result.estimate.learnedFromLocalSamples === 1 ? '' : 's'}`
                : 'Early estimate'
            }
          />
        </div>
      )}

      <div className="mt-3 space-y-2" aria-live="polite">
        {(!sourceId || sourcePaths.length === 0) && (
          <p className="text-xs text-destructive">
            Source media is unavailable. Relink the source before exporting.
          </p>
        )}
        {checkError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-[160px] flex-1">
              <p className="font-semibold">Preflight could not finish</p>
              <p className="mt-0.5">{checkError}</p>
            </div>
          </div>
        )}
        {result?.issues.map((issue) => (
          <div
            key={issue.id}
            className={cn(
              'flex flex-wrap items-start gap-2 rounded-md border p-3 text-xs',
              issue.severity === 'blocker'
                ? 'border-destructive/35 bg-destructive/10 text-destructive'
                : 'border-warning/35 bg-warning/10 text-foreground',
            )}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-[160px] flex-1">
              <p className="font-semibold">{issue.title}</p>
              <p className="mt-0.5 text-muted-foreground">{issue.detail}</p>
            </div>
            {issue.action && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  void handleIssueAction(issue.action as NonNullable<typeof issue.action>)
                }
              >
                {issue.action === 'settings' ? (
                  <Settings aria-hidden />
                ) : (
                  <FolderOpen aria-hidden />
                )}
                {issue.action === 'settings'
                  ? 'Settings'
                  : issue.action === 'relink'
                    ? 'Relink'
                    : 'Choose folder'}
              </Button>
            )}
          </div>
        ))}
        {result &&
          sourceId &&
          sourcePaths.length > 0 &&
          blockers.length === 0 &&
          warnings.length === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-success/35 bg-success/10 p-3 text-xs text-success">
              <Check className="h-4 w-4" aria-hidden />
              Ready to export. Source media and destination checks passed.
            </div>
          )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Estimates improve after successful local renders. Actual time and size can vary with
          visual complexity.
        </p>
        <Button
          size="sm"
          onClick={async () => {
            if (startDisabled) return;
            setLaunching(true);
            try {
              await onStart();
            } catch (caught) {
              toast.error(caught instanceof Error ? caught.message : "Couldn't start the export");
            } finally {
              setLaunching(false);
            }
          }}
          disabled={startDisabled}
        >
          {(starting || launching) && <Loader2 className="animate-spin" aria-hidden />}
          {starting || launching
            ? 'Starting export'
            : `Start ${fileCount} ${fileCount === 1 ? 'export' : 'exports'}`}
        </Button>
      </div>
    </Card>
  );
}
