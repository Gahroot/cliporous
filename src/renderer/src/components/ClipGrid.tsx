/**
 * ClipGrid — filtered review contact sheet with keyboard triage and ClipDetail.
 *
 * At 1280px and wider the contact sheet and persistent inspector form a
 * master-detail workspace. Narrower windows keep the existing modal Sheet.
 * Grid density and inspector width continue to use the persisted display
 * preferences; selection, filter, sort, scroll, tab, and playhead stay in the
 * project workspace.
 *
 * States:
 *   • Loading  — shadcn <Skeleton> tiles in the same 9:16 aspect ratio.
 *   • Empty    — centered shadcn <Card> with an Inbox icon + one-line copy.
 *   • Error    — inline shadcn <Alert variant="destructive"> at the top when
 *                the most recent error is screen-specific (scoring / pipeline).
 *                The full-fidelity error log lives in the bottom panel.
 */

import {
  AlertTriangle,
  Inbox,
  MousePointer2,
  Search,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClipCard } from '@/components/ClipCard';
import { ClipComparisonDialog } from '@/components/ClipComparisonDialog';
import { ClipDetail } from '@/components/ClipDetail';
import {
  dispatchEditorialPlayerCommand,
  type EditorialPlayerCommand,
} from '@/components/EditorialPlayer';
import { ErrorPresentation } from '@/components/ErrorPresentation';
import { HistoryControls } from '@/components/HistoryControls';
import { ReviewKeyboardGuide } from '@/components/ReviewKeyboardGuide';
import { ReviewSelectionToolbar } from '@/components/ReviewSelectionToolbar';
import { TemplateEditor } from '@/components/TemplateEditor';
import { TranscriptNavigator } from '@/components/TranscriptNavigator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { performHistoryCommand } from '@/hooks/useHistoryControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePipeline } from '@/hooks/usePipeline';
import {
  adjacentReviewItem,
  buildReviewItems,
  nextUnreviewedItem,
  type ReviewClipItem,
} from '@/lib/review-clips';
import { setDisplayPreferences, useDisplayPreferences } from '@/services/display-preferences';
import { prepareApprovedRender } from '@/services/render-service';
import { showUndoFeedback } from '@/services/review-feedback';
import { useStore } from '@/store';
import { PROCESSING_STAGES, selectActiveClips, selectActiveStitchedClips } from '@/store/selectors';
import type { ClipCandidate, ClipRenderSettings, ErrorLogEntry } from '@/store/types';

type GridItem = ReviewClipItem;

// Sources whose errors are surfaced inline on this screen.
const CLIPS_SCREEN_SOURCES: ReadonlySet<string> = new Set([
  'pipeline',
  'scoring',
  'transcription',
  'face-detection',
]);

function pickClipsScreenError(log: readonly ErrorLogEntry[]): ErrorLogEntry | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry && CLIPS_SCREEN_SOURCES.has(entry.source)) return entry;
  }
  return null;
}

function isReviewTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable]')) return true;
  const ownedControlSelector = [
    'input',
    'textarea',
    'select',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    '[aria-haspopup="menu"]',
    '[role="option"]',
    '[role="slider"]',
  ].join(', ');
  return target.matches(ownedControlSelector) || target.closest(ownedControlSelector) !== null;
}

function anotherDialogOwnsFocus(): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]',
  );
  return Array.from(dialogs).some((dialog) => !dialog.hasAttribute('data-review-inspector'));
}

// ---------------------------------------------------------------------------
// Tailwind classes — responsive grid columns at the requested breakpoints
// ---------------------------------------------------------------------------

const GRID_COLS = {
  comfortable:
    'grid grid-cols-1 gap-4 min-[760px]:grid-cols-2 min-[1280px]:grid-cols-2 min-[1600px]:grid-cols-3',
  compact:
    'grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 min-[900px]:grid-cols-3 min-[1280px]:grid-cols-3 min-[1600px]:grid-cols-4',
} as const;

const REVIEW_WORKSPACE_COLS = {
  narrow: 'min-[1280px]:grid-cols-[minmax(0,1fr)_400px]',
  standard: 'min-[1280px]:grid-cols-[minmax(0,1fr)_480px]',
  wide: 'min-[1280px]:grid-cols-[minmax(0,1fr)_min(640px,42vw)]',
} as const;

// ---------------------------------------------------------------------------
// Skeleton placeholder grid (loading state)
// ---------------------------------------------------------------------------

const SKELETON_KEYS = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
  'skeleton-6',
  'skeleton-7',
  'skeleton-8',
] as const;

function ClipGridSkeleton({ density }: { density: keyof typeof GRID_COLS }): React.JSX.Element {
  return (
    <div className={GRID_COLS[density]} aria-hidden="true">
      {SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="aspect-[9/16] w-full rounded-lg" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — no clips to show. Two distinct cases:
//   • processed=false → no source has been run yet; prompt to drop a video.
//   • processed=true  → a run finished but nothing passed scoring; explain why
//                       and offer a concrete next step instead of telling the
//                       user to do exactly what they just did.
// ---------------------------------------------------------------------------

function EmptyState({
  processed,
  reprocessDisabled,
  onReprocess,
}: {
  processed: boolean;
  reprocessDisabled: boolean;
  onReprocess: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
        {processed ? (
          <>
            <SearchX className="text-muted-foreground h-10 w-10" strokeWidth={1.5} aria-hidden />
            <p className="text-foreground text-sm font-medium">No clips passed scoring</p>
            <p className="text-muted-foreground text-xs">
              Try lowering the minimum score in Settings, then reprocess. Your source and transcript
              stay here; you can also create a candidate from the transcript.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void window.api.openSettingsWindow()}>
                Open Settings
              </Button>
              <Button disabled={reprocessDisabled} onClick={onReprocess}>
                Reprocess with current settings
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Reprocessing uses AI and may incur usage costs. Nothing runs until you confirm.
            </p>
          </>
        ) : (
          <>
            <Inbox className="text-muted-foreground h-10 w-10" strokeWidth={1.5} aria-hidden />
            <p className="text-foreground text-sm font-medium">No clips yet</p>
            <p className="text-muted-foreground text-xs">
              Drop a video on the start screen to generate clips.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClipGrid
// ---------------------------------------------------------------------------

export function ClipGrid(): React.JSX.Element {
  const clips = useStore(selectActiveClips);
  const { gridDensity, inspectorWidth, reviewAutoAdvance } = useDisplayPreferences();
  const stitchedClips = useStore(selectActiveStitchedClips);
  const activeSourceId = useStore((s) => s.activeSourceId);
  const source = useStore((s) =>
    s.activeSourceId ? (s.sources.find((src) => src.id === s.activeSourceId) ?? null) : null,
  );
  const updateClipStatus = useStore((s) => s.updateClipStatus);
  const updateStitchedClipStatus = useStore((s) => s.updateStitchedClipStatus);
  const selectedClipIds = useStore((s) => s.selectedClipIds);
  const toggleClipSelection = useStore((s) => s.toggleClipSelection);
  const selectAllVisible = useStore((s) => s.selectAllVisible);
  const clearSelection = useStore((s) => s.clearSelection);
  const batchUpdateReviewItems = useStore((s) => s.batchUpdateReviewItems);
  const addClipCandidate = useStore((s) => s.addClipCandidate);
  const stage = useStore((s) => s.pipeline.stage);
  const workBusy = useStore(
    (s) =>
      PROCESSING_STAGES.has(s.pipeline.stage) ||
      s.pipeline.stage === 'rendering' ||
      s.isRendering ||
      s.processingCancellation.status === 'cancelling' ||
      s.renderCancellation.status === 'cancelling',
  );
  const { processVideo } = usePipeline();
  const [confirmReprocess, setConfirmReprocess] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const actionPendingRef = useRef(false);
  const errorLog = useStore((s) => s.errorLog);
  const openClipId = useStore((s) => s.workspace.selectedClipId);
  const clipFilter = useStore((s) => s.workspace.clipFilter);
  const clipSort = useStore((s) => s.workspace.clipSort);
  const gridScrollTop = useStore((s) => s.workspace.gridScrollTop);
  const setOpenClipId = useStore((s) => s.setWorkspaceSelectedClip);
  const setClipFilter = useStore((s) => s.setWorkspaceFilter);
  const setClipSort = useStore((s) => s.setWorkspaceSort);
  const setGridScrollTop = useStore((s) => s.setWorkspaceGridScrollTop);
  const transcription = useStore((s) =>
    s.activeSourceId ? (s.transcriptions[s.activeSourceId] ?? null) : null,
  );
  const isWideReview = useMediaQuery('(min-width: 1280px)');
  const [inspectorOpen, setInspectorOpen] = useState(() => openClipId !== null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const lastHistoryScopeRef = useRef<'global' | 'clip'>('global');
  const previousWideReviewRef = useRef(isWideReview);

  const screenError = pickClipsScreenError(errorLog);
  const sourceOffline = source?.mediaStatus === 'offline';
  const sourceUnavailable = sourceOffline || source?.mediaStatus === 'checking';

  const allItems = useMemo<GridItem[]>(
    () => buildReviewItems(clips, stitchedClips, clipFilter, clipSort),
    [clips, stitchedClips, clipFilter, clipSort],
  );
  const activeClipIds = useMemo(
    () => new Set([...clips.map((clip) => clip.id), ...stitchedClips.map((clip) => clip.id)]),
    [clips, stitchedClips],
  );
  const selectedIds = useMemo(
    () => Array.from(selectedClipIds).filter((clipId) => activeClipIds.has(clipId)),
    [activeClipIds, selectedClipIds],
  );
  const selectedRegularClips = useMemo(
    () => clips.filter((clip) => selectedClipIds.has(clip.id)),
    [clips, selectedClipIds],
  );
  const visibleIds = useMemo(() => allItems.map((item) => item.clip.id), [allItems]);
  const visibleSelectedCount = visibleIds.filter((clipId) => selectedClipIds.has(clipId)).length;
  const hiddenSelectedCount = Math.max(0, selectedIds.length - visibleSelectedCount);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((clipId) => selectedClipIds.has(clipId));
  const compareEligible = selectedIds.length === 2 && selectedRegularClips.length === 2;

  useEffect(() => {
    if (previousWideReviewRef.current && !isWideReview && openClipId) {
      setInspectorOpen(true);
    }
    previousWideReviewRef.current = isWideReview;
  }, [isWideReview, openClipId]);

  useEffect(() => {
    if (activeSourceId === undefined) return;
    clearSelection();
    setSelectionMode(false);
    setCompareOpen(false);
    setConfirmReprocess(false);
  }, [activeSourceId, clearSelection]);

  useEffect(() => {
    if (!isWideReview || openClipId || allItems.length === 0) return;
    const firstItem = allItems[0];
    if (firstItem) setOpenClipId(firstItem.clip.id);
  }, [allItems, isWideReview, openClipId, setOpenClipId]);

  useLayoutEffect(() => {
    const element = gridScrollRef.current;
    if (!element) return;
    element.scrollTop = gridScrollTop;
    const frame = requestAnimationFrame(() => {
      if (gridScrollRef.current) gridScrollRef.current.scrollTop = gridScrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [gridScrollTop]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      if (gridScrollRef.current) setGridScrollTop(gridScrollRef.current.scrollTop);
    },
    [setGridScrollTop],
  );

  // The detail sheet supports both clip kinds; resolve the open id against
  // both lists. Stitched clips render the read-only variant of ClipDetail.
  const openClip = openClipId
    ? (clips.find((c) => c.id === openClipId) ??
      stitchedClips.find((c) => c.id === openClipId) ??
      null)
    : null;

  useEffect(() => {
    if (openClipId && !openClip) setOpenClipId(null);
  }, [openClip, openClipId, setOpenClipId]);

  const selectedItem = useMemo<GridItem | null>(() => {
    const visible = allItems.find((item) => item.clip.id === openClipId);
    if (visible) return visible;
    const normal = clips.find((clip) => clip.id === openClipId);
    if (normal) return { kind: 'normal', clip: normal, score: normal.score };
    const stitched = stitchedClips.find((clip) => clip.id === openClipId);
    return stitched ? { kind: 'stitched', clip: stitched, score: stitched.score } : null;
  }, [allItems, clips, openClipId, stitchedClips]);

  const selectedVisibleIndex = allItems.findIndex((item) => item.clip.id === openClipId);
  const previousItem =
    selectedVisibleIndex > 0 ? (allItems[selectedVisibleIndex - 1] ?? null) : null;
  const nextItem =
    selectedVisibleIndex >= 0 && selectedVisibleIndex < allItems.length - 1
      ? (allItems[selectedVisibleIndex + 1] ?? null)
      : null;

  const focusClipCard = useCallback((clipId: string): void => {
    requestAnimationFrame(() => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-review-clip-id]')).find(
        (element) => element.dataset.reviewClipId === clipId,
      );
      card?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      card?.focus({ preventScroll: true });
    });
  }, []);

  const selectReviewItem = useCallback(
    (item: GridItem, focusCard = false): void => {
      setOpenClipId(item.clip.id);
      if (focusCard) focusClipCard(item.clip.id);
    },
    [focusClipCard, setOpenClipId],
  );

  const openClipEditor = useCallback(
    (clipId: string): void => {
      setOpenClipId(clipId);
      setInspectorOpen(true);
    },
    [setOpenClipId],
  );

  const applyDecision = useCallback(
    (item: GridItem, status: ClipCandidate['status']): void => {
      if (!activeSourceId || item.clip.status === status) return;
      lastHistoryScopeRef.current = 'global';
      const focusedCard = document.activeElement?.closest('[data-review-clip-id]') !== null;
      const nextUnreviewed =
        reviewAutoAdvance && (status === 'approved' || status === 'rejected')
          ? nextUnreviewedItem(allItems, item.clip.id)
          : null;
      const hasOtherUnreviewed = [...clips, ...stitchedClips].some(
        (candidate) => candidate.id !== item.clip.id && candidate.status === 'pending',
      );
      const reviewComplete =
        reviewAutoAdvance &&
        (status === 'approved' || status === 'rejected') &&
        !hasOtherUnreviewed;

      if (item.kind === 'stitched') {
        updateStitchedClipStatus(activeSourceId, item.clip.id, status);
      } else {
        updateClipStatus(activeSourceId, item.clip.id, status);
      }

      if (nextUnreviewed) {
        selectReviewItem(nextUnreviewed, focusedCard && !inspectorOpen);
      } else if (focusedCard && clipFilter === 'unreviewed' && status !== 'pending') {
        focusClipCard(item.clip.id);
      }

      const message =
        status === 'approved'
          ? `Clip approved${reviewComplete ? ' · Review complete' : ''}`
          : status === 'rejected'
            ? `Clip rejected${reviewComplete ? ' · Review complete' : ''}`
            : 'Clip returned to unreviewed';
      showUndoFeedback({
        id: 'review-decision',
        message,
        scope: 'global',
        onUndo: () => {
          setOpenClipId(item.clip.id);
          if (focusedCard && !inspectorOpen) focusClipCard(item.clip.id);
        },
      });
    },
    [
      activeSourceId,
      allItems,
      clipFilter,
      clips,
      focusClipCard,
      inspectorOpen,
      reviewAutoAdvance,
      selectReviewItem,
      setOpenClipId,
      stitchedClips,
      updateClipStatus,
      updateStitchedClipStatus,
    ],
  );

  const handleApprove = (item: GridItem): void => {
    applyDecision(item, item.clip.status === 'approved' ? 'pending' : 'approved');
  };

  const handleReject = (item: GridItem): void => {
    applyDecision(item, item.clip.status === 'rejected' ? 'pending' : 'rejected');
  };

  const applyBulkStatus = useCallback(
    (status: ClipCandidate['status']): void => {
      if (!activeSourceId || selectedIds.length === 0) return;
      const changed = batchUpdateReviewItems(activeSourceId, selectedIds, { status });
      if (!changed) {
        toast(
          `No changes to ${selectedIds.length} selected ${selectedIds.length === 1 ? 'clip' : 'clips'}`,
        );
        return;
      }
      lastHistoryScopeRef.current = 'global';
      const action =
        status === 'approved'
          ? 'approved'
          : status === 'rejected'
            ? 'rejected'
            : 'returned to unreviewed';
      showUndoFeedback({
        id: 'bulk-review-decision',
        message: `${selectedIds.length} ${selectedIds.length === 1 ? 'clip' : 'clips'} ${action}`,
        scope: 'global',
      });
    },
    [activeSourceId, batchUpdateReviewItems, selectedIds],
  );

  const applyBulkSetting = useCallback(
    (overrides: Partial<ClipRenderSettings>, label: string): void => {
      if (!activeSourceId || selectedIds.length === 0) return;
      const changed = batchUpdateReviewItems(activeSourceId, selectedIds, { overrides });
      if (!changed) {
        toast(
          `No changes to ${selectedIds.length} selected ${selectedIds.length === 1 ? 'clip' : 'clips'}`,
        );
        return;
      }
      lastHistoryScopeRef.current = 'global';
      showUndoFeedback({
        id: 'bulk-review-setting',
        message: `${label} for ${selectedIds.length} ${selectedIds.length === 1 ? 'clip' : 'clips'}`,
        scope: 'global',
      });
    },
    [activeSourceId, batchUpdateReviewItems, selectedIds],
  );

  const createTranscriptCandidate = useCallback(
    (start: number, end: number, text: string): void => {
      if (!activeSourceId || !source || end <= start || !text.trim()) return;
      const clampedStart = Math.max(0, Math.min(source.duration, start));
      const clampedEnd = Math.max(clampedStart, Math.min(source.duration, end));
      if (clampedEnd - clampedStart < 1) return;
      const clipId = `transcript-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
      const hookText =
        text
          .trim()
          .split(/(?<=[.!?])\s+/)[0]
          ?.slice(0, 90) ?? text.trim().slice(0, 90);
      const wordTimestamps = (transcription?.words ?? []).filter(
        (word) => word.end >= start && word.start <= end,
      );
      addClipCandidate(activeSourceId, {
        id: clipId,
        sourceId: activeSourceId,
        startTime: clampedStart,
        endTime: clampedEnd,
        duration: clampedEnd - clampedStart,
        text: text.trim(),
        score: 0,
        scoreSource: 'manual',
        hookText,
        reasoning: 'Unscored candidate created from a selected transcript range.',
        status: 'pending',
        wordTimestamps,
      });
      setClipFilter('all');
      setOpenClipId(clipId);
      setInspectorOpen(true);
      setTranscriptOpen(false);
      showUndoFeedback({
        id: 'transcript-candidate',
        message: 'Candidate created from transcript range',
        scope: 'global',
      });
    },
    [activeSourceId, addClipCandidate, setClipFilter, setOpenClipId, source, transcription?.words],
  );

  // Loading: pipeline still working OR ready but clip array hasn't populated.
  const isLoading = PROCESSING_STAGES.has(stage);

  // A run finished (source present + pipeline settled on a completed stage) but
  // produced zero clips — e.g. nothing cleared the score threshold. Distinct
  // from the cold start where no source has been processed yet.
  const runCompletedEmpty =
    !isLoading && source !== null && (stage === 'ready' || stage === 'done');

  const approvedCount =
    clips.filter((c) => c.status === 'approved').length +
    stitchedClips.filter((c) => c.status === 'approved').length;
  const rejectedCount =
    clips.filter((c) => c.status === 'rejected').length +
    stitchedClips.filter((c) => c.status === 'rejected').length;
  const totalCount = clips.length + stitchedClips.length;
  const [isStartingRender, setIsStartingRender] = useState(false);
  const [confirmRenderAll, setConfirmRenderAll] = useState(false);
  const [confirmKeyboardRender, setConfirmKeyboardRender] = useState(false);
  const unreviewedCount = totalCount - approvedCount - rejectedCount;
  const exportDisabled =
    workBusy || isStartingRender || isReprocessing || sourceUnavailable || !source;
  const reprocessDisabled =
    exportDisabled || !runCompletedEmpty || totalCount > 0 || !transcription || !source?.path;
  const keyboardItems =
    selectedIds.length > 0
      ? [...clips, ...stitchedClips].filter((clip) => selectedClipIds.has(clip.id))
      : selectedItem
        ? [selectedItem.clip]
        : [...clips, ...stitchedClips].filter((clip) => clip.status === 'approved');
  const keyboardScope = selectedIds.length > 0 || selectedItem ? 'selected' : 'approved';
  const keyboardUnreviewed = keyboardItems.filter((clip) => clip.status === 'pending').length;
  const keyboardRejected = keyboardItems.filter((clip) => clip.status === 'rejected').length;

  const handleReprocess = async (): Promise<void> => {
    if (actionPendingRef.current || reprocessDisabled || !source) return;
    actionPendingRef.current = true;
    setConfirmReprocess(false);
    setIsReprocessing(true);
    try {
      // Resume from scoring: keep the saved source and transcript; never reset the project.
      await processVideo(source, 'scoring');
    } finally {
      actionPendingRef.current = false;
      setIsReprocessing(false);
    }
  };

  const handleRenderApproved = async (): Promise<void> => {
    if (actionPendingRef.current || exportDisabled || approvedCount === 0) return;
    actionPendingRef.current = true;
    setIsStartingRender(true);
    try {
      await prepareApprovedRender();
    } finally {
      actionPendingRef.current = false;
      setIsStartingRender(false);
    }
  };

  // Explicit ids define this one render batch. Review decisions remain untouched,
  // including pending and rejected clips.
  const runRenderAll = async (): Promise<void> => {
    if (actionPendingRef.current || exportDisabled || totalCount === 0 || !activeSourceId) return;
    actionPendingRef.current = true;
    setIsStartingRender(true);
    try {
      await prepareApprovedRender({
        clipIds: [...clips.map((clip) => clip.id), ...stitchedClips.map((clip) => clip.id)],
      });
    } finally {
      actionPendingRef.current = false;
      setIsStartingRender(false);
    }
  };

  // Rendering rejected clips is potentially expensive, so keep the confirmation
  // while stating that the creator's review decisions are preserved.
  const requestRenderAll = (): void => {
    if (actionPendingRef.current || exportDisabled || totalCount === 0 || !activeSourceId) return;
    if (rejectedCount > 0) {
      setConfirmRenderAll(true);
      return;
    }
    void runRenderAll();
  };

  const handleConfirmRenderAll = (): void => {
    setConfirmRenderAll(false);
    void runRenderAll();
  };

  const moveSelection = useCallback(
    (direction: -1 | 1, extendBulkSelection = false): void => {
      const target = adjacentReviewItem(allItems, openClipId, direction);
      if (!target) return;
      if (extendBulkSelection) {
        setSelectionMode(true);
        if (openClipId && !selectedClipIds.has(openClipId)) toggleClipSelection(openClipId);
        if (!selectedClipIds.has(target.clip.id)) toggleClipSelection(target.clip.id);
      }
      selectReviewItem(target, !inspectorOpen);
    },
    [allItems, inspectorOpen, openClipId, selectReviewItem, selectedClipIds, toggleClipSelection],
  );

  const handleKeyboardRender = async (): Promise<void> => {
    if (actionPendingRef.current || exportDisabled || keyboardItems.length === 0) return;
    actionPendingRef.current = true;
    setConfirmKeyboardRender(false);
    setIsStartingRender(true);
    const renderIds =
      selectedIds.length > 0 ? selectedIds : selectedItem ? [selectedItem.clip.id] : [];
    try {
      await prepareApprovedRender(renderIds.length > 0 ? { clipIds: renderIds } : undefined);
    } finally {
      actionPendingRef.current = false;
      setIsStartingRender(false);
    }
  };

  useEffect(() => {
    const handleReviewKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && !event.altKey && key === 'z') {
        if (isReviewTypingTarget(event.target) || anotherDialogOwnsFocus()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const clipScope = selectedItem
          ? { sourceId: selectedItem.clip.sourceId, clipId: selectedItem.clip.id }
          : null;
        const scope = lastHistoryScopeRef.current === 'clip' && clipScope ? clipScope : 'global';
        const result = performHistoryCommand(event.shiftKey ? 'redo' : 'undo', scope);
        if (!result && scope !== 'global') {
          performHistoryCommand(event.shiftKey ? 'redo' : 'undo', 'global');
        }
        return;
      }

      if (
        modifier &&
        !event.altKey &&
        key === 'a' &&
        selectionMode &&
        !isReviewTypingTarget(event.target) &&
        !anotherDialogOwnsFocus()
      ) {
        event.preventDefault();
        selectAllVisible(visibleIds);
        return;
      }
      if (modifier || event.altKey) return;
      const commaKey = event.code === 'Comma' || event.key === ',' || event.key === '<';
      const periodKey = event.code === 'Period' || event.key === '.' || event.key === '>';
      const selectionArrow =
        selectionMode && event.shiftKey && (key === 'arrowleft' || key === 'arrowright');
      if (event.shiftKey && !commaKey && !periodKey && !selectionArrow) return;
      if (isReviewTypingTarget(event.target) || anotherDialogOwnsFocus()) return;
      const targetElement = event.target instanceof HTMLElement ? event.target : null;
      const interactiveTarget =
        targetElement !== null && targetElement.closest('button, [role="button"], video') !== null;
      const clipCardTarget =
        targetElement !== null && targetElement.closest('[data-review-clip-id]') !== null;

      if (key === 'escape' && selectionMode) {
        event.preventDefault();
        clearSelection();
        setSelectionMode(false);
        return;
      }
      if (key === 'arrowleft' || key === 'j') {
        event.preventDefault();
        moveSelection(-1, selectionArrow);
        return;
      }
      if (key === 'arrowright' || key === 'k') {
        event.preventDefault();
        moveSelection(1, selectionArrow);
        return;
      }
      if (
        (key === 's' || (event.key === ' ' && selectionMode && !clipCardTarget)) &&
        selectedItem
      ) {
        event.preventDefault();
        setSelectionMode(true);
        toggleClipSelection(selectedItem.clip.id);
        return;
      }
      if (event.key === ' ' && !interactiveTarget) {
        const player = document.querySelector<HTMLVideoElement>(
          '[data-review-inspector] video[data-review-player="true"]',
        );
        if (!player) return;
        event.preventDefault();
        if (player.paused) void player.play().catch(() => {});
        else player.pause();
        return;
      }

      const editorialCommand: EditorialPlayerCommand | null =
        event.key === '['
          ? 'seek-back-5'
          : event.key === ']'
            ? 'seek-forward-5'
            : commaKey
              ? event.shiftKey
                ? 'nudge-back-100ms'
                : 'nudge-back-frame'
              : periodKey
                ? event.shiftKey
                  ? 'nudge-forward-100ms'
                  : 'nudge-forward-frame'
                : key === '0'
                  ? 'replay'
                  : key === 'l'
                    ? 'toggle-loop'
                    : null;
      const editorialPlayerOpen =
        inspectorOpen && document.querySelector('[data-editorial-player="true"]') !== null;
      if (editorialCommand && editorialPlayerOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dispatchEditorialPlayerCommand(editorialCommand);
        return;
      }
      if (key === 'a' && (selectedIds.length > 0 || selectedItem)) {
        event.preventDefault();
        if (selectedIds.length > 0) applyBulkStatus('approved');
        else if (selectedItem) applyDecision(selectedItem, 'approved');
        return;
      }
      if (key === 'x' && (selectedIds.length > 0 || selectedItem)) {
        event.preventDefault();
        if (selectedIds.length > 0) applyBulkStatus('rejected');
        else if (selectedItem) applyDecision(selectedItem, 'rejected');
        return;
      }
      if (key === 'u' && (selectedIds.length > 0 || selectedItem)) {
        event.preventDefault();
        if (selectedIds.length > 0) applyBulkStatus('pending');
        else if (selectedItem) applyDecision(selectedItem, 'pending');
        return;
      }
      if ((key === 'e' || (key === 'enter' && !interactiveTarget)) && allItems.length > 0) {
        event.preventDefault();
        const target = selectedItem ?? allItems[0];
        if (target) openClipEditor(target.clip.id);
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        if (actionPendingRef.current || workBusy || isStartingRender || isReprocessing) return;
        if (sourceUnavailable || !source) {
          toast('Relink the source media before preparing an export');
          return;
        }
        if (selectedIds.length === 0 && !selectedItem && approvedCount === 0) {
          toast('Select a clip or approve clips before preparing an export');
          return;
        }
        setConfirmKeyboardRender(true);
      }
    };

    window.addEventListener('keydown', handleReviewKeyDown, true);
    return () => window.removeEventListener('keydown', handleReviewKeyDown, true);
  }, [
    allItems,
    applyBulkStatus,
    applyDecision,
    approvedCount,
    clearSelection,
    inspectorOpen,
    isReprocessing,
    isStartingRender,
    moveSelection,
    openClipEditor,
    selectAllVisible,
    selectedIds,
    selectedItem,
    selectionMode,
    source,
    sourceUnavailable,
    toggleClipSelection,
    visibleIds,
    workBusy,
  ]);

  return (
    <div className="studio-shell flex h-full w-full flex-col">
      {/* Review header keeps source context, decision counts, and render actions together. */}
      <header className="grid shrink-0 grid-cols-1 items-center gap-3 border-b border-border/80 bg-background/80 px-4 py-3 sm:px-6 md:grid-cols-[minmax(220px,1fr)_auto] md:gap-4">
        <div className="min-w-0">
          <p className="text-primary text-[11px] font-semibold uppercase tracking-[0.16em]">
            Clip review
          </p>
          <h1 className="text-foreground mt-1 text-xl font-semibold tracking-tight">
            Review your clips
          </h1>
          <p
            className="text-muted-foreground mt-1 max-w-xl truncate text-xs"
            title={source?.name ?? undefined}
          >
            {source?.name ?? 'No source selected'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI scores are suggestions. You decide what to export.
          </p>
        </div>
        <section
          className="flex flex-wrap items-center gap-2 md:justify-end"
          aria-label="Clip review counts"
        >
          <span
            className="rounded-md border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
            aria-live="polite"
          >
            {clipFilter === 'all'
              ? `${totalCount} ${totalCount === 1 ? 'clip' : 'clips'}`
              : `${allItems.length} ${allItems.length === 1 ? 'result' : 'results'} · ${totalCount} total`}
          </span>
          <span className="text-sm font-medium tabular-nums" aria-live="polite">
            {unreviewedCount} left to review
          </span>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
            {approvedCount} approved
          </span>
          <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
            {rejectedCount} rejected
          </span>
        </section>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2 md:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-review-transcript-open="true"
            onClick={() => setTranscriptOpen(true)}
            disabled={!transcription}
          >
            <Search aria-hidden="true" />
            Transcript
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectionMode ? 'secondary' : 'outline'}
            data-review-selection-toggle="true"
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode((current) => !current);
              if (selectionMode) clearSelection();
            }}
          >
            <MousePointer2 aria-hidden="true" />
            {selectionMode ? 'Selecting' : 'Select'}
          </Button>

          <Select
            value={clipFilter}
            onValueChange={(value) => setClipFilter(value as typeof clipFilter)}
          >
            <SelectTrigger className="h-9 w-36" aria-label="Filter clips">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clips</SelectItem>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="stitched">Stitched</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <SlidersHorizontal aria-hidden="true" />
                View options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Sort clips</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Sort clips"
                value={clipSort}
                onValueChange={(value) => setClipSort(value as typeof clipSort)}
              >
                <DropdownMenuRadioItem value="score">AI score</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="source-time">Source time</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="duration">Duration</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Grid density</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Grid density"
                value={gridDensity}
                onValueChange={(value) =>
                  setDisplayPreferences({ gridDensity: value as 'comfortable' | 'compact' })
                }
              >
                <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {isWideReview && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Inspector width</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    aria-label="Inspector width"
                    value={inspectorWidth}
                    onValueChange={(value) =>
                      setDisplayPreferences({ inspectorWidth: value as typeof inspectorWidth })
                    }
                  >
                    <DropdownMenuRadioItem value="narrow">Narrow</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="standard">Standard</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="wide">Wide</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <HistoryControls scope="global" compact />
          <TemplateEditor />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={totalCount === 0 || exportDisabled}
              onClick={requestRenderAll}
              aria-describedby="all-clips-export-scope"
            >
              Prepare {totalCount} {totalCount === 1 ? 'clip' : 'clips'} for export
            </Button>
            <p id="all-clips-export-scope" className="text-center text-xs text-muted-foreground">
              All clips · {unreviewedCount} unreviewed · {rejectedCount} rejected
            </p>
          </div>
          <Button
            size="sm"
            disabled={approvedCount === 0 || exportDisabled}
            onClick={handleRenderApproved}
          >
            Prepare {approvedCount} approved {approvedCount === 1 ? 'clip' : 'clips'} for export
          </Button>
        </div>
      </header>

      <ReviewKeyboardGuide
        autoAdvance={reviewAutoAdvance}
        onAutoAdvanceChange={(enabled) => setDisplayPreferences({ reviewAutoAdvance: enabled })}
      />

      {selectionMode && (
        <ReviewSelectionToolbar
          selectedCount={selectedIds.length}
          visibleCount={visibleIds.length}
          hiddenSelectedCount={hiddenSelectedCount}
          allVisibleSelected={allVisibleSelected}
          compareEligible={compareEligible}
          renderDisabled={exportDisabled}
          onSelectAll={() => {
            if (allVisibleSelected) clearSelection();
            else selectAllVisible(visibleIds);
          }}
          onClear={clearSelection}
          onDone={() => {
            clearSelection();
            setSelectionMode(false);
          }}
          onStatus={applyBulkStatus}
          onRender={() => setConfirmKeyboardRender(true)}
          onCompare={() => setCompareOpen(true)}
          onApplySetting={applyBulkSetting}
        />
      )}

      <div
        className={`grid min-h-0 flex-1 grid-cols-1 ${REVIEW_WORKSPACE_COLS[inspectorWidth]}`}
        data-review-layout={isWideReview ? 'master-detail' : 'sheet'}
      >
        {/* Scrollable contact sheet */}
        <div
          ref={gridScrollRef}
          className="min-h-0 overflow-y-auto px-4 py-6 sm:px-6"
          onScroll={(event) => {
            const scrollTop = event.currentTarget.scrollTop;
            if (scrollFrameRef.current !== null) return;
            scrollFrameRef.current = requestAnimationFrame(() => {
              scrollFrameRef.current = null;
              setGridScrollTop(scrollTop);
            });
          }}
        >
          {sourceOffline && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Source media is offline</AlertTitle>
              <AlertDescription>
                Review data is safe. Relink the source before previewing or preparing an export.
              </AlertDescription>
            </Alert>
          )}
          {/* Inline error — only when there are no clips to show; otherwise
            the bottom error log panel is the canonical surface and an inline
            alert would just duplicate it. */}
          {screenError && totalCount === 0 && !isLoading && (
            <ErrorPresentation
              error={screenError}
              timestamp={screenError.timestamp}
              className="mb-4"
              actions={
                screenError.recoveryAction === 'open-settings'
                  ? [
                      {
                        label: 'Open Settings',
                        onClick: () => window.api.openSettingsWindow(),
                      },
                    ]
                  : []
              }
            />
          )}

          {isLoading && totalCount === 0 ? (
            <ClipGridSkeleton density={gridDensity} />
          ) : totalCount === 0 ? (
            <EmptyState
              processed={runCompletedEmpty}
              reprocessDisabled={reprocessDisabled}
              onReprocess={() => setConfirmReprocess(true)}
            />
          ) : allItems.length === 0 ? (
            <Card className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">
              <SearchX className="h-9 w-9 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No clips match this filter</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setClipFilter('all')}
              >
                Show all clips
              </Button>
            </Card>
          ) : (
            <div className={GRID_COLS[gridDensity]}>
              {allItems.map((item, index) => (
                <ClipCard
                  key={item.clip.id}
                  clip={item.clip}
                  source={source}
                  stitched={item.kind === 'stitched'}
                  {...(item.kind === 'stitched'
                    ? { partCount: item.clip.sourceRanges.length }
                    : {})}
                  selected={item.clip.id === openClipId}
                  density={gridDensity}
                  mediaPriority={index < 8 ? 'eager' : 'lazy'}
                  selectionMode={selectionMode}
                  checked={selectedClipIds.has(item.clip.id)}
                  onToggleSelection={toggleClipSelection}
                  onOpenDetail={openClipEditor}
                  onApprove={() => handleApprove(item)}
                  onReject={() => handleReject(item)}
                />
              ))}
            </div>
          )}
        </div>

        <ClipDetail
          clip={openClip}
          source={source}
          open={inspectorOpen && openClip !== null}
          presentation={isWideReview ? 'panel' : 'sheet'}
          {...(selectedVisibleIndex >= 0
            ? { position: selectedVisibleIndex + 1, total: allItems.length }
            : {})}
          {...(previousItem ? { onPrevious: () => selectReviewItem(previousItem) } : {})}
          {...(nextItem ? { onNext: () => selectReviewItem(nextItem) } : {})}
          onDecision={(status) => {
            if (selectedItem) applyDecision(selectedItem, status);
          }}
          onEditCommitted={() => {
            lastHistoryScopeRef.current = 'clip';
          }}
          onOpenChange={setInspectorOpen}
        />
      </div>

      <TranscriptNavigator
        open={transcriptOpen}
        source={source}
        transcription={transcription}
        selectedClip={openClip}
        onOpenChange={setTranscriptOpen}
        onCreateCandidate={createTranscriptCandidate}
      />

      <ClipComparisonDialog
        open={compareOpen}
        clips={selectedRegularClips}
        source={source}
        onOpenChange={setCompareOpen}
      />

      {/* Rejected clips can join this batch without changing their review state. */}
      <AlertDialog open={confirmRenderAll} onOpenChange={setConfirmRenderAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prepare all {totalCount} clips for export?</AlertDialogTitle>
            <AlertDialogDescription>
              All clips: {unreviewedCount} unreviewed and {rejectedCount} rejected included. Review
              decisions will not change. Next: check export settings before exporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={exportDisabled} onClick={handleConfirmRenderAll}>
              Prepare {totalCount} {totalCount === 1 ? 'clip' : 'clips'} for export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReprocess} onOpenChange={setConfirmReprocess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocess with current settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Find clips again using your saved source and transcript, starting from scoring. This
              uses AI and may incur usage costs. Your source and transcript will not be reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={reprocessDisabled} onClick={() => void handleReprocess()}>
              Reprocess now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmKeyboardRender} onOpenChange={setConfirmKeyboardRender}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Prepare {keyboardItems.length} {keyboardScope}{' '}
              {keyboardItems.length === 1 ? 'clip' : 'clips'} for export?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {keyboardScope === 'selected'
                ? `Selected only: ${keyboardUnreviewed} unreviewed and ${keyboardRejected} rejected included.${hiddenSelectedCount > 0 ? ` ${hiddenSelectedCount} hidden by the current filter.` : ''} Selection does not mean approval.`
                : 'Approved clips only, across all filters.'}{' '}
              Review decisions will not change. Next: check export settings before exporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={exportDisabled || keyboardItems.length === 0}
              onClick={() => void handleKeyboardRender()}
            >
              Export {keyboardScope} ({keyboardItems.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
