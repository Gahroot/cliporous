import { isSceneFirstPlanEnvelope, LONGFORM_PRESENTATION_LABELS } from '@shared/longform-scenes';
import { getPaletteById } from '@shared/palettes';
import type { LongformPlanItemType } from '@shared/types';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  History,
  LayoutPanelTop,
  Loader2,
  Lock,
  MessageSquareText,
  Palette,
  Pencil,
  Quote,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CutPlanItemEditor } from '@/components/CutPlanItemEditor';
import { CutPlanVersionDialog } from '@/components/CutPlanVersionDialog';
import { LongformScenePreview } from '@/components/LongformScenePreview';
import { LongformSceneWorkspace } from '@/components/LongformSceneWorkspace';
import { PalettePicker } from '@/components/PalettePicker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MISSING_GEMINI_KEY_MESSAGE, resolveGeminiKey } from '@/lib/gemini-key';
import {
  buildLongformPlanItems,
  buildLongformSections,
  compareLongformPlans,
  estimateLongformRenderSeconds,
  formatTimecode,
  humanizeLongformKind,
  isScenePlanForReview,
  type LongformPlanItemUpdate,
  type LongformPlanItemView,
  longformSceneReviewProblem,
  longformSceneScheduleIssues,
  mergePreservedLongformItems,
  type PreservedLongformItem,
  removeLongformPlanItem,
  snapshotLongformPlanItem,
  updateLongformPlanItem,
} from '@/lib/longform-plan';
import { cn } from '@/lib/utils';
import { prepareLongformRender } from '@/services/longform-render-service';
import { useStore } from '@/store';
import { getLongformVersions } from '@/store/longform-slice';

const ITEM_ICONS: Record<LongformPlanItemType, typeof Quote> = {
  phrase: Quote,
  block: LayoutPanelTop,
  card: FileText,
  scene: Video,
};

function planStatusLabel(status: 'draft' | 'accepted' | 'rejected'): string {
  if (status === 'accepted') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Needs review';
}

function PlanTimeline({
  duration,
  items,
  sceneFirst,
}: {
  duration: number;
  items: LongformPlanItemView[];
  sceneFirst: boolean;
}): React.JSX.Element {
  const safeDuration = Math.max(1, duration);
  const colors: Record<LongformPlanItemType, string> = {
    phrase: 'bg-info',
    block: 'bg-primary',
    card: 'bg-warning',
    scene: 'bg-primary',
  };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Editorial timeline</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {sceneFirst
              ? 'Complete scene windows use absolute source time. Speaker footage continues between explanations.'
              : 'Every marker uses absolute source time. Full-frame blocks replace the speaker; phrases and cards overlay it.'}
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          0:00 / {formatTimecode(duration)}
        </span>
      </div>
      <div className="relative mt-4 h-8 rounded border border-border bg-muted/55" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {items
          .filter((item) => !item.scene?.omitted)
          .map((item) => {
            const left = Math.max(0, Math.min(100, (item.startTime / safeDuration) * 100));
            const width = Math.max(
              0.45,
              Math.min(100 - left, ((item.endTime - item.startTime) / safeDuration) * 100),
            );
            return (
              <span
                key={item.key}
                title={`${item.kind}: ${formatTimecode(item.startTime)} to ${formatTimecode(item.endTime)}`}
                className={cn(
                  'absolute top-1/2 h-3 -translate-y-1/2 rounded-sm opacity-85',
                  colors[item.type],
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(sceneFirst ? (['scene'] as const) : (['phrase', 'block', 'card'] as const)).map(
          (type) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', colors[type])} aria-hidden />
              {type === 'scene'
                ? 'Explanation scene'
                : type === 'phrase'
                  ? 'Phrase overlay'
                  : type === 'block'
                    ? 'Content block'
                    : 'Evidence card'}
            </span>
          ),
        )}
      </div>
    </Card>
  );
}

interface BeatCardProps {
  item: LongformPlanItemView;
  preserved: boolean;
  onEdit: (trigger: HTMLButtonElement) => void;
  onFeedback: () => void;
  onTogglePreserve: () => void;
  onPreview: () => void;
  onToggleOmit: () => void;
  previewSelected: boolean;
  disabled: boolean;
  issue?: string | undefined;
}

function BeatCard({
  item,
  preserved,
  onEdit,
  onFeedback,
  onTogglePreserve,
  onPreview,
  onToggleOmit,
  previewSelected,
  disabled,
  issue,
}: BeatCardProps): React.JSX.Element {
  const Icon = ITEM_ICONS[item.type];
  const normalizeExcerpt = (text: string): string =>
    text
      .trim()
      .replace(/^["“‘']|["”’']$/g, '')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  const repeatedPurpose =
    item.scene &&
    normalizeExcerpt(item.detail.replace(/^Explain the source passage:\s*/i, '')) ===
      normalizeExcerpt(item.sourceText);
  return (
    <li className="grid grid-cols-1 gap-3 border-t border-border/70 py-3 first:border-0 first:pt-0 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-start">
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        <span className="block text-foreground">{formatTimecode(item.startTime)}</span>
        <span>{formatTimecode(item.endTime)}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">{item.kind}</span>
          {item.scene?.omitted && <Badge variant="secondary">Omitted</Badge>}
          {preserved && (
            <Badge variant="outline" className="gap-1 border-primary/35 bg-primary/10 text-primary">
              <Lock className="h-3 w-3" aria-hidden />
              Preserve
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug">{item.title}</p>
        {!repeatedPurpose && (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.scene ? 'Purpose: ' : ''}
            {item.detail}
          </p>
        )}
        {item.scene && (
          <p className="mt-1 text-xs text-muted-foreground">
            {LONGFORM_PRESENTATION_LABELS[item.scene.presentation]}
          </p>
        )}
        {issue && (
          <p className="mt-1 text-xs text-warning">
            {issue} Omit this scene or request a new draft; timing is never shortened.
          </p>
        )}
        <blockquote className="mt-2 border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
          <span className="sr-only">Transcript source: </span>
          {item.sourceText || 'No transcript excerpt is available for this timing.'}
        </blockquote>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1 sm:col-start-2 sm:row-start-2">
        {item.scene && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onPreview}
              aria-pressed={previewSelected}
              disabled={disabled}
            >
              Preview scene
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleOmit} disabled={disabled}>
              {item.scene.omitted ? 'Include scene' : 'Omit scene'}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => onEdit(event.currentTarget)}
          disabled={disabled}
        >
          <Pencil />
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onFeedback} disabled={disabled}>
          <MessageSquareText />
          Feedback
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTogglePreserve}
          disabled={disabled}
          aria-pressed={preserved}
          title={
            preserved
              ? 'Allow regeneration to change this beat'
              : 'Keep this beat during regeneration'
          }
        >
          {preserved ? <Unlock /> : <Lock />}
          {preserved ? 'Release' : 'Preserve'}
        </Button>
      </div>
    </li>
  );
}

export function CutPlanReviewScreen(): React.JSX.Element {
  const activeSourceId = useStore((state) => state.activeSourceId);
  const source = useStore((state) =>
    state.sources.find((candidate) => candidate.id === state.activeSourceId),
  );
  const record = useStore((state) =>
    state.activeSourceId ? state.longformPlans[state.activeSourceId] : undefined,
  );
  const transcription = useStore((state) =>
    state.activeSourceId ? state.transcriptions[state.activeSourceId] : undefined,
  );
  const settings = useStore((state) => state.settings);
  const projectId = useStore((state) => state.currentProject.id);
  const addVersion = useStore((state) => state.addLongformPlanVersion);
  const restoreVersion = useStore((state) => state.restoreLongformPlanVersion);
  const acceptPlan = useStore((state) => state.acceptLongformPlan);
  const rejectPlan = useStore((state) => state.rejectLongformPlan);
  const addFeedback = useStore((state) => state.addLongformPlanFeedback);
  const markFeedbackApplied = useStore((state) => state.markLongformFeedbackApplied);
  const setPreservedItems = useStore((state) => state.setLongformPreservedItems);
  const setPlanStyle = useStore((state) => state.setLongformPlanStyle);
  const reviewFocus = useStore((state) => state.longformReviewFocus);
  const setReviewFocus = useStore((state) => state.setLongformReviewFocus);

  const [feedbackTarget, setFeedbackTarget] = useState<LongformPlanItemView | null | undefined>(
    undefined,
  );
  const [feedbackText, setFeedbackText] = useState('');
  const [editingItem, setEditingItem] = useState<LongformPlanItemView | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationProgress, setRegenerationProgress] = useState('');
  const feedbackInputRef = useRef<HTMLTextAreaElement>(null);
  const editorTriggerRef = useRef<HTMLButtonElement>(null);
  const generationJob = useRef<{ cancel: () => void } | null>(null);
  const mounted = useRef(false);
  const selectionOwner = `${projectId}:${activeSourceId}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generationJob.current?.cancel();
    };
  }, []);
  useEffect(() => {
    // Local editors must never carry a source's beat into a different source/project.
    void selectionOwner;
    setEditingItem(null);
    setFeedbackTarget(undefined);
    setFeedbackText('');
    setVersionsOpen(false);
    setRejectOpen(false);
  }, [selectionOwner]);

  const words = transcription?.words ?? [];
  const plan = record?.plan;
  const versions = useMemo(() => (record ? getLongformVersions(record) : []), [record]);
  const items = useMemo(() => (plan ? buildLongformPlanItems(plan, words) : []), [plan, words]);
  const sections = useMemo(
    () => (plan && source ? buildLongformSections(plan, words, source.duration) : []),
    [plan, source, words],
  );
  const preservedItems = record?.preservedItems ?? [];
  const preservedKeys = useMemo(
    () => new Set(preservedItems.map((item) => item.key)),
    [preservedItems],
  );
  const pendingFeedback = (record?.feedback ?? []).filter((entry) => entry.status === 'pending');
  const sceneReview = plan ? isScenePlanForReview(plan) : false;
  const scenePlan = plan && isSceneFirstPlanEnvelope(plan) ? plan : null;
  const validationProblem =
    record?.validationProblem ||
    (plan ? longformSceneReviewProblem(plan, words, source?.duration ?? 0) : null);
  const scheduleIssues = useMemo(
    () => (plan ? longformSceneScheduleIssues(plan) : new Map<string, string>()),
    [plan],
  );
  const invalidItems = items.filter(
    (item) =>
      !item.scene?.omitted &&
      (!Number.isFinite(item.startTime) ||
        !Number.isFinite(item.endTime) ||
        item.endTime <= item.startTime ||
        item.startTime < 0 ||
        item.endTime > (source?.duration ?? 0) ||
        scheduleIssues.has(item.key)),
  );
  const activeItems = items.filter((item) => !item.scene?.omitted);
  const failedSections = sections.filter((section) => section.status === 'failed');
  const planningIncomplete =
    failedSections.length > 0 &&
    (activeItems.length === 0 || failedSections.length === sections.length);
  const selectedSceneId =
    reviewFocus?.sourceId === activeSourceId &&
    items.some((item) => item.scene && item.key === reviewFocus.sceneId)
      ? reviewFocus.sceneId
      : items.find((item) => item.scene)?.key;
  useEffect(() => {
    if (
      activeSourceId &&
      selectedSceneId &&
      (reviewFocus?.sourceId !== activeSourceId || reviewFocus.sceneId !== selectedSceneId)
    ) {
      setReviewFocus({ sourceId: activeSourceId, sceneId: selectedSceneId });
    }
  }, [activeSourceId, selectedSceneId, reviewFocus, setReviewFocus]);
  const activeVersionIndex = versions.findIndex(
    (version) => version.id === record?.activeVersionId,
  );
  const activeVersion = versions[activeVersionIndex];
  const priorVersion = versions[activeVersionIndex - 1];
  const revisionDiff =
    activeVersion?.origin === 'regenerated' && priorVersion && plan
      ? compareLongformPlans(priorVersion.plan, plan)
      : null;
  const approvalBlocked =
    Boolean(validationProblem) || invalidItems.length > 0 || planningIncomplete;
  const palette =
    record?.palette ??
    getPaletteById(record?.paletteId ?? settings.longformPaletteId, settings.customPalettes);
  const status = record?.status ?? 'draft';
  const feedbackMode = feedbackTarget !== undefined;

  useEffect(() => {
    if (feedbackMode) feedbackInputRef.current?.focus();
  }, [feedbackMode]);

  if (!source || !record || !plan || !activeSourceId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden />
          <h1 className="mt-3 text-base font-semibold">Cut Plan unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The source or generated plan is missing. Return to Source and run long-form analysis
            again.
          </p>
        </Card>
      </div>
    );
  }

  const createUserVersion = (
    nextPlan: typeof plan,
    note: string,
    nextPreserved: PreservedLongformItem[],
  ): void => {
    addVersion(activeSourceId, nextPlan, 'user-edited', note);
    setPreservedItems(activeSourceId, nextPreserved);
  };

  const saveItemEdit = (item: LongformPlanItemView, update: LongformPlanItemUpdate): void => {
    const nextPlan = updateLongformPlanItem(plan, item, update);
    const edited = snapshotLongformPlanItem(nextPlan, item);
    const nextPreserved = preservedItems.filter((entry) => entry.key !== item.key);
    if (edited) nextPreserved.push(edited);
    createUserVersion(
      nextPlan,
      `Edited ${item.kind} at ${formatTimecode(item.startTime)}`,
      nextPreserved,
    );
    toast.success('Cut Plan edit saved');
  };

  const removeItem = (item: LongformPlanItemView): void => {
    if (item.scene) {
      saveItemEdit(item, { omitted: !item.scene.omitted });
      return;
    }
    const nextPlan = removeLongformPlanItem(plan, item);
    createUserVersion(
      nextPlan,
      `Removed ${item.kind} at ${formatTimecode(item.startTime)}`,
      preservedItems.filter((entry) => entry.key !== item.key),
    );
    toast.success('Beat removed. Restore an earlier version to undo.');
  };

  const togglePreserve = (item: LongformPlanItemView): void => {
    if (preservedKeys.has(item.key)) {
      setPreservedItems(
        activeSourceId,
        preservedItems.filter((entry) => entry.key !== item.key),
      );
      return;
    }
    const snapshot = snapshotLongformPlanItem(plan, item);
    if (snapshot) setPreservedItems(activeSourceId, [...preservedItems, snapshot]);
  };

  const toggleSectionPreserve = (sectionItems: LongformPlanItemView[]): void => {
    const allPreserved =
      sectionItems.length > 0 && sectionItems.every((item) => preservedKeys.has(item.key));
    if (allPreserved) {
      const sectionKeys = new Set(sectionItems.map((item) => item.key));
      setPreservedItems(
        activeSourceId,
        preservedItems.filter((entry) => !sectionKeys.has(entry.key)),
      );
      return;
    }
    const next = [...preservedItems];
    const existing = new Set(next.map((item) => item.key));
    for (const item of sectionItems) {
      if (existing.has(item.key)) continue;
      const snapshot = snapshotLongformPlanItem(plan, item);
      if (snapshot) next.push(snapshot);
    }
    setPreservedItems(activeSourceId, next);
  };

  const sendFeedback = (): void => {
    const message = feedbackText.trim();
    if (!message) return;
    addFeedback(activeSourceId, {
      targetKey: feedbackTarget?.key ?? null,
      targetLabel: feedbackTarget
        ? `${feedbackTarget.kind} at ${formatTimecode(feedbackTarget.startTime)}`
        : 'Whole plan',
      message,
    });
    setFeedbackText('');
    setFeedbackTarget(undefined);
    toast.success('Feedback saved. Regenerate when you are ready to apply it.');
  };

  const regenerate = async (
    mode: 'scene-first' | 'legacy' = sceneReview ? 'scene-first' : 'legacy',
    sectionIds?: string[],
  ): Promise<void> => {
    if (generationJob.current) return;
    if (!navigator.onLine) {
      toast.error('Connect to the internet to regenerate this Cut Plan');
      return;
    }
    if (!transcription?.words.length) {
      toast.error('The saved transcript is required to regenerate');
      return;
    }
    const initial = useStore.getState();
    const requestId = crypto.randomUUID();
    let cancelled = false;
    let started = false;
    const isCurrent = (): boolean => {
      const state = useStore.getState();
      return (
        mounted.current &&
        !cancelled &&
        state.currentProject.id === projectId &&
        state.activeSourceId === activeSourceId &&
        state.longformPlans[activeSourceId]?.plan === plan &&
        state.longformPlans[activeSourceId]?.activeVersionId === record.activeVersionId &&
        state.longformPlans[activeSourceId]?.preservedItems === record.preservedItems &&
        state.longformPlans[activeSourceId]?.feedback === record.feedback &&
        state.transcriptions[activeSourceId] === transcription &&
        state.sources.find((candidate) => candidate.id === activeSourceId) === source &&
        state.pipeline.stage === initial.pipeline.stage
      );
    };
    const job = {
      cancel: (): void => {
        if (cancelled) return;
        cancelled = true;
        if (mounted.current)
          setRegenerationProgress('Cancelling generation… Saved work is unchanged.');
        if (started) void window.api.cancelLongformEditPlan(requestId).catch(() => {});
      },
    };
    generationJob.current = job;
    setRegenerating(true);
    setRegenerationProgress('Preparing transcript');
    const unsubscribe = useStore.subscribe(() => {
      if (!isCurrent()) job.cancel();
    });
    let offProgress = (): void => {};
    try {
      const apiKey = await resolveGeminiKey(settings.geminiApiKey);
      if (!isCurrent()) return;
      if (!apiKey) {
        toast.error(MISSING_GEMINI_KEY_MESSAGE);
        return;
      }
      offProgress = window.api.onLongformEditProgress((progress) => {
        if (progress.requestId !== requestId || !isCurrent()) return;
        setRegenerationProgress(
          `Reviewing transcript window ${progress.window} of ${progress.total}`,
        );
      });
      const feedback = pendingFeedback.map((entry) => `${entry.targetLabel}: ${entry.message}`);
      const canReuse = mode === 'scene-first' && scenePlan && !validationProblem;
      started = true;
      const generated = await window.api.generateLongformEditPlan(
        apiKey,
        transcription.words,
        source.duration,
        feedback,
        {
          requestId,
          mode,
          ...(canReuse
            ? {
                previousPlan: scenePlan,
                preservedSceneIds: preservedItems.flatMap((item) =>
                  item.type === 'scene' ? [item.item.id] : [],
                ),
                ...(sectionIds ? { sectionIds } : {}),
              }
            : {}),
        },
      );
      if (!isCurrent()) return;
      if (mode === 'scene-first' && !isSceneFirstPlanEnvelope(generated))
        throw new Error(
          'Generation returned an unsupported scene plan. Your saved draft is unchanged.',
        );
      // Scene preservation belongs to the source-aware planner, not the legacy overlap merger.
      const merged =
        mode === 'scene-first' ? generated : mergePreservedLongformItems(generated, preservedItems);
      const problem = longformSceneReviewProblem(merged, transcription.words, source.duration);
      if (problem) throw new Error(problem);
      unsubscribe();
      addVersion(
        activeSourceId,
        merged,
        'regenerated',
        sectionIds?.length
          ? `Retried ${sectionIds.length} failed section(s)`
          : `${feedback.length} feedback note(s) applied`,
      );
      if (!canReuse && mode === 'scene-first') setPreservedItems(activeSourceId, []);
      markFeedbackApplied(activeSourceId);
      toast.success('New draft revision ready. Compare with the prior version before approval.');
    } catch (caught) {
      if (isCurrent())
        toast.error(caught instanceof Error ? caught.message : 'Cut Plan regeneration failed');
    } finally {
      unsubscribe();
      offProgress();
      if (generationJob.current === job) generationJob.current = null;
      if (mounted.current) {
        setRegenerating(false);
        setRegenerationProgress('');
      }
    }
  };

  const acceptAndContinue = async (): Promise<void> => {
    if (approvalBlocked || regenerating) return;
    if (status !== 'accepted') acceptPlan(activeSourceId, record.skin, record.paletteId);
    const current = useStore.getState().longformPlans[activeSourceId];
    if (
      current?.validationProblem ||
      current?.status !== 'accepted' ||
      current.approvedVersionId !== current.activeVersionId
    )
      return;
    await prepareLongformRender();
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background [@media(max-height:500px)]:overflow-y-auto">
      <header className="shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6">
        <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                Cut Plan review
              </p>
              <Badge
                variant="outline"
                className={cn(
                  status === 'accepted' && 'border-success/40 bg-success/10 text-success',
                  status === 'rejected' &&
                    'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {validationProblem ? 'Needs a new draft' : planStatusLabel(status)}
              </Badge>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight" title={source.name}>
              {source.name}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Review source-backed scenes, then approve the plan to prepare export. Nothing exports
              from this screen.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4 lg:text-right">
            <div>
              <dt className="text-muted-foreground">Sections</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{sections.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {sceneReview ? 'Included scenes' : 'Evidence beats'}
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{activeItems.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {formatTimecode(source.duration)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Render estimate</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                ~{formatTimecode(estimateLongformRenderSeconds(plan, source.duration))}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible">
        <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-4">
          <main className="min-w-0 space-y-4">
            {revisionDiff && status === 'draft' && (
              <Card
                className="border-primary/30 bg-primary/5 p-4"
                aria-label="Draft revision comparison"
              >
                <h2 className="text-sm font-semibold">
                  New draft revision · review before approval
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Compared with the prior saved version: {revisionDiff.added} added,{' '}
                  {revisionDiff.removed} removed, {revisionDiff.contentChanges} changed,{' '}
                  {revisionDiff.timingChanges} timing changes, {revisionDiff.unchanged} unchanged.
                  This draft is not approved.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  disabled={regenerating}
                  onClick={() => setVersionsOpen(true)}
                >
                  Compare with prior version
                </Button>
              </Card>
            )}

            {validationProblem && (
              <Card className="border-warning/35 bg-warning/10 p-4">
                <p role="alert" className="text-sm font-medium">
                  {validationProblem}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  This saved plan is kept for recovery and cannot be rendered as a draft preview or
                  exported. Generate a new draft from the current transcript.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={regenerating || words.length === 0}
                  onClick={() => void regenerate('scene-first')}
                >
                  Generate new scene draft
                </Button>
              </Card>
            )}
            {sceneReview && !validationProblem && activeItems.length === 0 && (
              <Card className="p-4">
                <h2 className="text-sm font-semibold">
                  {items.length ? 'All scenes are omitted' : 'No explanation scenes planned'}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {planningIncomplete
                    ? 'Planning is incomplete, not a successful speaker-only plan. Retry the failed sections before approval.'
                    : 'This plan will export speaker footage without explanation scenes. Approve the speaker-only plan, include a scene, or regenerate; saved versions are kept.'}
                </p>
              </Card>
            )}
            {failedSections.length > 0 && (
              <Card className="border-warning/35 p-4">
                <h2 className="text-sm font-semibold">
                  {planningIncomplete ? 'Planning incomplete' : 'Partial plan'}:{' '}
                  {failedSections.length} failed section(s)
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {planningIncomplete
                    ? 'Retry the failed sections before approval. A planning failure does not mean that no explanation is needed.'
                    : 'Retry the failed sections without replacing other sections. If you approve this partial plan, those ranges remain speaker-only.'}
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={regenerating || Boolean(validationProblem)}
                  onClick={() =>
                    void regenerate(
                      'scene-first',
                      failedSections.map((section) => section.id),
                    )
                  }
                >
                  Retry failed sections
                </Button>
              </Card>
            )}
            {scenePlan && selectedSceneId && (
              <LongformSceneWorkspace
                items={items}
                selectedSceneId={selectedSceneId}
                preservedKeys={preservedKeys}
                disabled={regenerating || Boolean(validationProblem)}
                issue={scheduleIssues.get(selectedSceneId)}
                onSelect={(sceneId) => setReviewFocus({ sourceId: activeSourceId, sceneId })}
                onEdit={(item, trigger) => {
                  editorTriggerRef.current = trigger;
                  setEditingItem(item);
                }}
                onFeedback={setFeedbackTarget}
                onTogglePreserve={togglePreserve}
                onToggleOmit={removeItem}
              >
                <LongformScenePreview
                  request={{
                    sourceVideoPath: source.path,
                    wordTimestamps: words,
                    plan: scenePlan,
                    sceneId: selectedSceneId,
                    paletteId: record.paletteId,
                    customPalettes: record.palette
                      ? [record.palette]
                      : settings.customPalettes.filter(
                          (palette) => palette.id === record.paletteId,
                        ),
                  }}
                  disabledReason={
                    validationProblem ||
                    scheduleIssues.get(selectedSceneId) ||
                    (regenerating ? 'Finish or cancel generation before previewing.' : undefined)
                  }
                />
              </LongformSceneWorkspace>
            )}

            {invalidItems.length > 0 && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="font-medium">
                    {invalidItems.length} unsupported timing{' '}
                    {invalidItems.length === 1 ? 'item' : 'items'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sceneReview
                      ? 'Omit conflicting scenes or regenerate. Complete authored scene windows are never shortened.'
                      : 'Edit or remove beats that fall outside the source before approval.'}
                  </p>
                </div>
              </div>
            )}

            <details open={!sceneReview} className="min-w-0 rounded-lg border border-border p-3">
              <summary className="cursor-pointer rounded text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Planning sections ({sections.length}){!sceneReview ? ' · Legacy plan' : ''}
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Sections organize planning only; complete scene windows and narration are retained.
              </p>
              <div className="mt-3 space-y-3">
                {sections.map((section) => {
                  const sectionPreserved =
                    section.items.length > 0 &&
                    section.items.every((item) => preservedKeys.has(item.key));
                  return (
                    <Card key={section.id} className="overflow-hidden">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-muted/35 px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-primary">
                              {String(section.index + 1).padStart(2, '0')}
                            </span>
                            <h2 className="text-sm font-semibold">{section.title}</h2>
                            {section.status && (
                              <Badge variant="outline">
                                {humanizeLongformKind(section.status)}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {formatTimecode(section.startTime)} to {formatTimecode(section.endTime)}{' '}
                            · {section.items.length} planned{' '}
                            {sceneReview ? 'scenes' : section.items.length === 1 ? 'beat' : 'beats'}
                          </p>
                        </div>
                        {section.items.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSectionPreserve(section.items)}
                            disabled={regenerating || Boolean(validationProblem)}
                            aria-pressed={sectionPreserved}
                          >
                            {sectionPreserved ? <Unlock /> : <Lock />}
                            {sectionPreserved ? 'Release section' : 'Preserve section'}
                          </Button>
                        )}
                      </div>
                      <div className="p-4">
                        {(section.diagnostics ?? []).map((diagnostic) => (
                          <p key={diagnostic} className="mb-2 text-xs text-muted-foreground">
                            {diagnostic}
                          </p>
                        ))}
                        {section.status === 'failed' && (
                          <Button
                            className="mb-3"
                            size="sm"
                            variant="outline"
                            disabled={regenerating || Boolean(validationProblem)}
                            onClick={() => void regenerate('scene-first', [section.id])}
                          >
                            Retry {section.title.toLowerCase()}
                          </Button>
                        )}
                        {section.items.length > 0 ? (
                          sceneReview ? (
                            <p className="text-xs text-muted-foreground">
                              {section.items.filter((item) => !item.scene?.omitted).length} included
                              · {section.items.filter((item) => item.scene?.omitted).length} omitted
                              · {section.items.filter((item) => preservedKeys.has(item.key)).length}{' '}
                              preserved
                            </p>
                          ) : (
                            <ul>
                              {section.items.map((item) => (
                                <BeatCard
                                  key={item.key}
                                  item={item}
                                  preserved={preservedKeys.has(item.key)}
                                  onEdit={(trigger) => {
                                    editorTriggerRef.current = trigger;
                                    setEditingItem(item);
                                  }}
                                  onFeedback={() => setFeedbackTarget(item)}
                                  onTogglePreserve={() => togglePreserve(item)}
                                  onPreview={() =>
                                    setReviewFocus({ sourceId: activeSourceId, sceneId: item.key })
                                  }
                                  onToggleOmit={() => removeItem(item)}
                                  previewSelected={selectedSceneId === item.key}
                                  disabled={regenerating || Boolean(validationProblem)}
                                  issue={scheduleIssues.get(item.key)}
                                />
                              ))}
                            </ul>
                          )
                        ) : (
                          <div className="py-6 text-center">
                            <p className="text-sm font-medium">
                              {section.status === 'failed'
                                ? 'Planning failed for this range'
                                : 'Speaker-only section'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {section.status === 'failed'
                                ? 'Retry this section or add plan feedback. No explanation was fabricated.'
                                : 'No visual beats were planned for this source range.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </details>
          </main>

          <details className="min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]">
            <summary className="cursor-pointer rounded text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Plan settings, history and feedback
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {source.width}×{source.height} source · {words.length.toLocaleString()} transcript
              words. {plan.reasoning || 'No model reasoning was saved with this version.'}
            </p>
            <div className="mt-4">
              <PlanTimeline duration={source.duration} items={items} sceneFirst={sceneReview} />
            </div>
            <aside
              className="mt-4 grid min-w-0 gap-4 md:grid-cols-2"
              aria-label="Cut Plan controls"
            >
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold">Style and palette</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sceneReview
                    ? 'Applied to explanation scenes and on-demand previews.'
                    : 'Applied to every full-frame content block.'}
                </p>
                <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-muted/35 p-3">
                  <span className="flex gap-1" aria-hidden>
                    {[palette.background, palette.foreground, palette.accent].map((color) => (
                      <span
                        key={color}
                        className="h-5 w-5 rounded border border-border"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {sceneReview ? 'Scene-first explanations' : humanizeLongformKind(record.skin)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{palette.name}</p>
                  </div>
                </div>
                <details className="mt-3 group">
                  <summary className="cursor-pointer rounded-md px-2 py-2 text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Change style and palette
                  </summary>
                  <PalettePicker
                    className="mt-3 border-t border-border pt-4"
                    disabled={regenerating || Boolean(validationProblem)}
                    skin={record.skin}
                    paletteId={record.paletteId}
                    onSkinChange={(skin) => setPlanStyle(activeSourceId, skin, record.paletteId)}
                    onPaletteChange={(paletteId) =>
                      setPlanStyle(activeSourceId, record.skin, paletteId)
                    }
                    variant={sceneReview ? 'compact' : 'full'}
                    showProjectPreview={false}
                    showProfileDefault={false}
                  />
                </details>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold">Version history</h2>
                  </div>
                  <Badge variant="secondary">{versions.length}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Generated, edited, regenerated, and approved snapshots stay in this project.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setVersionsOpen(true)}
                  disabled={regenerating}
                >
                  <History />
                  Compare and restore
                </Button>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold">Focused feedback</h2>
                  </div>
                  <Badge variant={pendingFeedback.length > 0 ? 'default' : 'secondary'}>
                    {pendingFeedback.length} pending
                  </Badge>
                </div>
                {pendingFeedback.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {pendingFeedback.slice(-3).map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded border border-border bg-muted/35 p-2 text-xs"
                      >
                        <p className="font-medium">{entry.targetLabel}</p>
                        <p className="mt-1 line-clamp-3 leading-relaxed text-muted-foreground">
                          {entry.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Target the whole plan or one beat. Notes stay saved if regeneration fails.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setFeedbackTarget(null)}
                  disabled={regenerating}
                >
                  <MessageSquareText />
                  Add plan feedback
                </Button>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold">Render preflight</h2>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Working estimate</dt>
                    <dd className="font-medium tabular-nums">
                      ~{formatTimecode(estimateLongformRenderSeconds(plan, source.duration))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Known unsupported</dt>
                    <dd
                      className={cn(
                        'font-medium tabular-nums',
                        invalidItems.length > 0 && 'text-warning',
                      )}
                    >
                      {invalidItems.length}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Preserved beats</dt>
                    <dd className="font-medium tabular-nums">{preservedItems.length}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {sceneReview
                    ? 'Complete scene windows are retained. Omitted and failed scenes are reconciled by scene ID; failures never become generic text blocks.'
                    : 'The render may thin overlapping full-frame visuals. Every fallback will be reconciled against this approved version.'}
                </p>
              </Card>
            </aside>
            <section
              className="mt-4 min-w-0 rounded-lg border border-border p-4"
              aria-label="Revision scope"
            >
              <h2 className="text-sm font-semibold">Revise this plan</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {validationProblem
                  ? 'Scope: create a fresh scene-first draft from the current transcript. Invalid preserved decisions cannot be reused; all saved versions remain available.'
                  : `Scope: whole plan. Regeneration may change every unpreserved ${sceneReview ? 'scene' : 'beat'}; ${preservedItems.length} preserved decisions stay. ${pendingFeedback.length} pending feedback notes will be applied. This is not single-scene regeneration.`}{' '}
                AI runs only when requested. The result is a new draft, never an approval.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!validationProblem && (
                  <Button
                    variant="outline"
                    onClick={() => void regenerate()}
                    disabled={regenerating || words.length === 0}
                  >
                    <RefreshCw />
                    Regenerate plan
                  </Button>
                )}
                {!sceneReview && !validationProblem && (
                  <Button
                    variant="outline"
                    disabled={regenerating || words.length === 0}
                    onClick={() => void regenerate('scene-first')}
                  >
                    New scene-first draft
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setRejectOpen(true)}
                  disabled={regenerating}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                  Reject
                </Button>
              </div>
              {!sceneReview && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A new scene-first draft uses the transcript, not legacy beat preservation. Your
                  legacy plan and saved versions are kept for restoration.
                </p>
              )}
            </section>
          </details>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card/95 px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          {feedbackMode ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label htmlFor="cut-plan-feedback" className="text-xs font-semibold">
                  Feedback for{' '}
                  {feedbackTarget
                    ? `${feedbackTarget.kind} at ${formatTimecode(feedbackTarget.startTime)}`
                    : 'the whole plan'}
                </label>
                <textarea
                  ref={feedbackInputRef}
                  id="cut-plan-feedback"
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setFeedbackTarget(undefined);
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      sendFeedback();
                    }
                  }}
                  rows={3}
                  maxLength={1200}
                  placeholder={
                    sceneReview
                      ? 'Explain what this scene should clarify, request another kind or presentation, or describe a failed section.'
                      : 'Remove this block, change the wording, move the timing, replace the visual type, or preserve this section.'
                  }
                  className="mt-1.5 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setFeedbackTarget(undefined)}>
                  Cancel
                </Button>
                <Button onClick={sendFeedback} disabled={!feedbackText.trim()}>
                  <MessageSquareText />
                  Send feedback
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground lg:col-span-2">
                Cmd/Ctrl+Enter to send · Escape to cancel
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {status === 'rejected'
                    ? 'This plan is rejected. Revise, regenerate, restore, or approve it when ready.'
                    : approvalBlocked
                      ? 'Resolve the plan issues above before approval.'
                      : sceneReview && activeItems.length === 0
                        ? 'Speaker-only export: no explanation scenes will be rendered.'
                        : `${activeItems.length} ${sceneReview ? 'scenes' : 'beats'} across ${sections.length} sections are ready for your decision.`}
                </p>
                {regenerating && (
                  <p
                    role="status"
                    className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {regenerationProgress || 'Regenerating Cut Plan'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {regenerating && (
                  <Button variant="outline" onClick={() => generationJob.current?.cancel()}>
                    Cancel generation
                  </Button>
                )}
                <Button
                  className="h-auto min-h-9 max-w-full whitespace-normal text-left"
                  onClick={() => void acceptAndContinue()}
                  disabled={regenerating || approvalBlocked}
                >
                  {status === 'accepted' ? <ArrowRight /> : <Check />}
                  Approve plan and prepare export
                </Button>
              </div>
            </div>
          )}
        </div>
      </footer>

      <CutPlanItemEditor
        returnFocusRef={editorTriggerRef}
        item={editingItem}
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        onSave={(update) => {
          if (editingItem) saveItemEdit(editingItem, update);
        }}
        onRemove={() => {
          if (editingItem) removeItem(editingItem);
        }}
      />
      <CutPlanVersionDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        activeVersionId={record.activeVersionId ?? versions.at(-1)?.id}
        onRestore={(versionId) => {
          restoreVersion(activeSourceId, versionId);
          toast.success('Saved Cut Plan version restored. Review before approval.');
        }}
      />
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this Cut Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Rendering will not start. The transcript, feedback, edits, and all saved versions stay
              in this project so you can restore or regenerate later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                rejectPlan(activeSourceId);
                toast.success('Cut Plan rejected. Saved versions were kept.');
              }}
            >
              <X />
              Reject plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
