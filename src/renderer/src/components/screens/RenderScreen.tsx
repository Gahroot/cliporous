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

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  FileVideo,
  Folder,
  Loader2,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { startApprovedRender } from '@/services/render-service'
import { TemplateEditor } from '@/components/TemplateEditor'
import { useStore } from '@/store'
import type { ClipCandidate, RenderProgress } from '@/store/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RowStatus = RenderProgress['status'] // 'queued' | 'preparing' | 'rendering' | 'done' | 'error'

interface RowProgress {
  status: RowStatus
  percent: number
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a stable map of clipId → progress, defaulting unseen clips to queued. */
function buildProgressMap(
  approved: readonly ClipCandidate[],
  records: readonly RenderProgress[]
): Map<string, RowProgress> {
  const map = new Map<string, RowProgress>()
  for (const clip of approved) {
    map.set(clip.id, { status: 'queued', percent: 0 })
  }
  for (const r of records) {
    if (!map.has(r.clipId)) continue
    map.set(r.clipId, { status: r.status, percent: r.percent, error: r.error })
  }
  return map
}

/** Pick a small poster image for the row. Custom thumbnail wins. */
function pickThumbnail(clip: ClipCandidate): string | undefined {
  return clip.customThumbnail ?? clip.thumbnail
}

// ---------------------------------------------------------------------------
// Status Badge — shadcn <Badge> only (no custom UI)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: RowStatus }): React.JSX.Element {
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="gap-1 font-normal">
          Pending
        </Badge>
      )
    case 'preparing':
    case 'rendering':
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status === 'preparing' ? 'Preparing' : 'Rendering'}
        </Badge>
      )
    case 'done':
      return (
        <Badge variant="default" className="gap-1 font-normal">
          <Check className="h-3 w-3" />
          Done
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1 font-normal">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Single clip row
// ---------------------------------------------------------------------------

interface ClipRowProps {
  clip: ClipCandidate
  progress: RowProgress
}

function ClipRow({ clip, progress }: ClipRowProps): React.JSX.Element {
  const thumb = pickThumbnail(clip)
  const isActive = progress.status === 'rendering' || progress.status === 'preparing'
  const isDone = progress.status === 'done'
  const isError = progress.status === 'error'
  const showBar = isActive || isDone
  const barValue = isDone ? 100 : Math.max(0, Math.min(100, progress.percent))

  return (
    <Card className="flex items-center gap-3 p-3">
      {/* Thumbnail — small 9:16 tile */}
      <div className="bg-muted relative h-16 w-9 shrink-0 overflow-hidden rounded">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Play className="h-3.5 w-3.5 opacity-50" />
          </div>
        )}
      </div>

      {/* Hook text + status + progress */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              'line-clamp-2 text-sm font-medium leading-snug',
              isError && 'text-destructive'
            )}
            title={clip.hookText || undefined}
          >
            {clip.hookText || (
              <span className="text-muted-foreground italic">Untitled clip</span>
            )}
          </p>
          <StatusBadge status={progress.status} />
        </div>

        {showBar && (
          <Progress
            value={barValue}
            className={cn('mt-2 h-1.5', isError && '[&>div]:bg-destructive')}
          />
        )}

        {isError && progress.error && (
          <p
            className="text-destructive mt-1.5 line-clamp-2 text-xs"
            title={progress.error}
          >
            {progress.error}
          </p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RenderScreen
// ---------------------------------------------------------------------------

export function RenderScreen(): React.JSX.Element {
  // ── Store reads ────────────────────────────────────────────────────────
  const activeSourceId = useStore((s) => s.activeSourceId)
  const clipsBySource = useStore((s) => s.clips)
  const renderProgress = useStore((s) => s.renderProgress)
  const renderErrors = useStore((s) => s.renderErrors)
  const isRendering = useStore((s) => s.isRendering)
  const outputDirectory = useStore((s) => s.settings.outputDirectory)

  // ── Store writes ───────────────────────────────────────────────────────
  const setRenderProgress = useStore((s) => s.setRenderProgress)
  const setIsRendering = useStore((s) => s.setIsRendering)
  const setRenderError = useStore((s) => s.setRenderError)
  const clearRenderErrors = useStore((s) => s.clearRenderErrors)
  const setPipeline = useStore((s) => s.setPipeline)
  const addError = useStore((s) => s.addError)

  // ── Local state ────────────────────────────────────────────────────────
  // Tracks whether the most recent batch has finished — controls the
  // post-render footer (Open Folder / Back to Clips).
  const [batchSummary, setBatchSummary] = useState<{
    completed: number
    failed: number
    total: number
  } | null>(null)

  // ── Derived: approved clips for the active source ──────────────────────
  const approvedClips = useMemo<ClipCandidate[]>(() => {
    if (!activeSourceId) return []
    const list = clipsBySource[activeSourceId] ?? []
    return list.filter((c) => c.status === 'approved')
  }, [activeSourceId, clipsBySource])

  // Merge store renderProgress + renderErrors into a stable per-row view.
  const progressMap = useMemo(() => {
    const merged: RenderProgress[] = renderProgress.map((r) => ({
      ...r,
      error: r.error ?? renderErrors[r.clipId]
    }))
    return buildProgressMap(approvedClips, merged)
  }, [approvedClips, renderProgress, renderErrors])

  // ── Subscribe to render:* events ───────────────────────────────────────
  useEffect(() => {
    // Snapshot the current renderProgress array on each event via the store
    // getState — avoids a stale-closure dependency on a reactive `state` ref.
    const upsertProgress = (
      clipId: string,
      patch: Partial<RenderProgress>
    ): void => {
      const current = useStore.getState().renderProgress
      const idx = current.findIndex((r) => r.clipId === clipId)
      if (idx === -1) {
        const next: RenderProgress = {
          clipId,
          percent: patch.percent ?? 0,
          status: patch.status ?? 'queued',
          error: patch.error,
          outputPath: patch.outputPath
        }
        setRenderProgress([...current, next])
      } else {
        const next = current.slice()
        next[idx] = { ...next[idx], ...patch }
        setRenderProgress(next)
      }
    }

    const offStart = window.api.onRenderClipStart((data) => {
      upsertProgress(data.clipId, { status: 'rendering', percent: 0 })
    })

    const offProgress = window.api.onRenderClipProgress((data) => {
      upsertProgress(data.clipId, {
        status: 'rendering',
        percent: Math.max(0, Math.min(100, data.percent))
      })
    })

    const offDone = window.api.onRenderClipDone((data) => {
      upsertProgress(data.clipId, {
        status: 'done',
        percent: 100,
        outputPath: data.outputPath
      })
    })

    const offError = window.api.onRenderClipError((data) => {
      setRenderError(data.clipId, data.error)
      upsertProgress(data.clipId, {
        status: 'error',
        error: data.error
      })
      // Mirror render failures into the global error log so the bottom
      // <ErrorLog> panel reflects everything the main process reports.
      addError({
        source: 'render',
        message: `Clip ${data.clipId} failed: ${data.error}`,
      })
    })

    const offBatchDone = window.api.onRenderBatchDone((data) => {
      setIsRendering(false)
      setPipeline({ stage: 'done', message: '', percent: 100 })
      setBatchSummary(data)
      if (data.failed === 0) {
        toast.success(`Rendered ${data.completed}/${data.total} clip${data.total === 1 ? '' : 's'}`)
      } else {
        toast.error(`${data.failed} of ${data.total} clip${data.total === 1 ? '' : 's'} failed`)
      }
    })

    const offCancelled = window.api.onRenderCancelled((data) => {
      setIsRendering(false)
      setPipeline({ stage: 'ready', message: '', percent: 0 })
      setBatchSummary(data)
      toast.message('Render cancelled')
    })

    return () => {
      offStart()
      offProgress()
      offDone()
      offError()
      offBatchDone()
      offCancelled()
    }
  }, [setRenderProgress, setRenderError, setIsRendering, setPipeline, addError])

  // ── Action: Render All ────────────────────────────────────────────────
  // Delegates to the shared render-service so the ClipGrid "Render Approved"
  // button and this "Render All" button stay in lockstep.
  const handleRenderAll = async (): Promise<void> => {
    setBatchSummary(null)
    await startApprovedRender()
  }

  // ── Action: Cancel ────────────────────────────────────────────────────
  const handleCancel = async (): Promise<void> => {
    try {
      await window.api.cancelRender()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't cancel: ${msg}`)
    }
  }

  // ── Action: Open Output Folder ────────────────────────────────────────
  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.api.openOutputFolder(outputDirectory ?? undefined)
      // shell.openPath returns '' on success and an error string on failure.
      if (result) toast.error(`Couldn't open folder: ${result}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Couldn't open folder: ${msg}`)
    }
  }

  // ── Action: Back to Clips ─────────────────────────────────────────────
  const handleBackToClips = (): void => {
    setBatchSummary(null)
    setRenderProgress([])
    clearRenderErrors()
    setPipeline({ stage: 'ready', message: '', percent: 0 })
  }

  // ── Render ────────────────────────────────────────────────────────────
  const isComplete = batchSummary !== null && !isRendering
  const totalCount = approvedClips.length
  const doneCount = renderProgress.filter((r) => r.status === 'done').length
  const failedCount = renderProgress.filter((r) => r.status === 'error').length

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-6">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-semibold tracking-tight">
            Render
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {totalCount} clip{totalCount === 1 ? '' : 's'}
            {isRendering && ` · ${doneCount} done`}
            {isRendering && failedCount > 0 && ` · ${failedCount} failed`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isRendering && <TemplateEditor />}
          {isRendering ? (
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleRenderAll}
              disabled={isComplete || totalCount === 0}
            >
              <Play />
              Render All
            </Button>
          )}
        </div>
      </div>

      {/* ── Inline batch error — surfaces the most recent failure even
           when the bottom <ErrorLog> is collapsed. ───────────────────── */}
      {failedCount > 0 && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {failedCount} clip{failedCount === 1 ? '' : 's'} failed to render
          </AlertTitle>
          <AlertDescription className="break-words">
            See the error log at the bottom of the window for details.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Clip list ───────────────────────────────────────────────── */}
      <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
        {approvedClips.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center p-6">
            <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
              <FileVideo
                className="text-muted-foreground h-10 w-10"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-foreground text-sm font-medium">
                No approved clips
              </p>
              <p className="text-muted-foreground text-xs">
                Approve clips on the previous screen, then come back to render.
              </p>
            </Card>
          </div>
        ) : (
          approvedClips.map((clip) => {
            const p = progressMap.get(clip.id) ?? { status: 'queued' as const, percent: 0 }
            return <ClipRow key={clip.id} clip={clip} progress={p} />
          })
        )}
      </div>

      {/* ── Post-batch footer ──────────────────────────────────────── */}
      {isComplete && (
        <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" onClick={handleBackToClips}>
            Back to Clips
          </Button>
          <Button size="sm" onClick={handleOpenFolder} disabled={!outputDirectory}>
            <Folder />
            Open Output Folder
          </Button>
        </div>
      )}
    </div>
  )
}
