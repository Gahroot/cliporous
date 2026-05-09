/**
 * ProcessingScreen — single vertical stage timeline for the active source.
 *
 * Layout (per ux spec):
 *   • Card, max-width 640px, centered.
 *   • One row per stage with: lucide icon · name · live status icon ·
 *     <Progress> bar bound to pipeline.percent (active stage only) ·
 *     optional ETA / message line.
 *   • Stages: Download (YouTube only), Transcribe, Score.
 *   • Single ghost "Cancel" button at the bottom.
 *
 * No tabs, no config UI, no preprocessing options — defaults are PRESTYJ.
 * State comes entirely from the pipeline slice on the store.
 */

import { useMemo } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { useStore } from '@/store'
import type { PipelineStage } from '@/store/types'
import { usePipeline } from '@/hooks'
import { RotateCcw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type StageStatus = 'pending' | 'active' | 'done' | 'error'

interface StageRow {
  /** Pipeline stage key in the store. */
  key: PipelineStage
  /** Human-readable label. */
  label: string
  /** Lucide icon for the row. */
  icon: LucideIcon
}

const ALL_STAGES: readonly StageRow[] = [
  { key: 'downloading', label: 'Download', icon: Download },
  { key: 'transcribing', label: 'Transcribe', icon: FileText },
  { key: 'scoring', label: 'Score', icon: Sparkles },
] as const

const STAGE_ORDER: readonly PipelineStage[] = ALL_STAGES.map((s) => s.key)

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveStatus(
  rowKey: PipelineStage,
  currentStage: PipelineStage,
  failedStage: PipelineStage | null,
  completed: ReadonlySet<PipelineStage>
): StageStatus {
  if (failedStage === rowKey) return 'error'
  if (completed.has(rowKey)) return 'done'
  if (currentStage === rowKey) return 'active'
  // The current pipeline stage may be a *later* stage (e.g. optimizing-loops)
  // — in that case the visible Score row is implicitly done even if the
  // markStageCompleted call hasn't fired yet for that exact key.
  const rowIdx = STAGE_ORDER.indexOf(rowKey)
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  if (rowIdx >= 0 && currentIdx > rowIdx) return 'done'
  return 'pending'
}

/**
 * Pull an "ETA …" suffix out of a free-form pipeline message, if present.
 * Returns null when the message contains no ETA hint.
 */
function extractEta(message: string): string | null {
  if (!message) return null
  const match = message.match(/ETA[:\s]+([^·•|]+?)(?:$|[·•|])/i)
  if (!match) return null
  const eta = match[1].trim()
  return eta.length > 0 ? `ETA ${eta}` : null
}

// ---------------------------------------------------------------------------
// Status icon — shadcn-free, lucide-only (matches ux spec).
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: StageStatus }): React.JSX.Element | null {
  switch (status) {
    case 'active':
      return <Loader2 className="text-primary h-4 w-4 animate-spin" aria-label="In progress" />
    case 'done':
      return <Check className="text-primary h-4 w-4" aria-label="Done" />
    case 'error':
      return <AlertCircle className="text-destructive h-4 w-4" aria-label="Error" />
    case 'pending':
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Single stage row
// ---------------------------------------------------------------------------

interface StageRowProps {
  row: StageRow
  status: StageStatus
  /** Live percent from the store — only meaningful when status === 'active'. */
  percent: number
  /** Pipeline message — only displayed when status === 'active'. */
  message: string
}

function StageTimelineRow({ row, status, percent, message }: StageRowProps): React.JSX.Element {
  const Icon = row.icon
  const isActive = status === 'active'
  const isError = status === 'error'
  const isDone = status === 'done'

  // For finished stages, fill the bar; for pending, leave it empty.
  const barValue = isActive ? Math.max(0, Math.min(100, percent)) : isDone ? 100 : 0
  const eta = isActive ? extractEta(message) : null

  return (
    <div className="flex items-start gap-3 py-3">
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          isActive && 'text-foreground',
          isDone && 'text-muted-foreground',
          isError && 'text-destructive',
          status === 'pending' && 'text-muted-foreground/60'
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'text-sm font-medium',
              status === 'pending' && 'text-muted-foreground',
              isActive && 'text-foreground',
              isDone && 'text-foreground',
              isError && 'text-destructive'
            )}
          >
            {row.label}
          </span>
          <StatusIcon status={status} />
        </div>

        <Progress
          value={barValue}
          className={cn(
            'mt-2 h-1.5',
            status === 'pending' && 'opacity-40',
            isError && '[&>div]:bg-destructive'
          )}
        />

        {isActive && (message || eta) && (
          <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-3 text-xs tabular-nums">
            <span className="truncate">{message}</span>
            {eta && <span className="shrink-0">{eta}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProcessingScreen
// ---------------------------------------------------------------------------

export function ProcessingScreen(): React.JSX.Element {
  // Subscribe to the pipeline slice — every keystroke of progress re-renders.
  const stage = useStore((s) => s.pipeline.stage)
  const percent = useStore((s) => s.pipeline.percent)
  const message = useStore((s) => s.pipeline.message)
  const failedStage = useStore((s) => s.failedPipelineStage)
  const completed = useStore((s) => s.completedPipelineStages)
  const activeSource = useStore((s) => s.getActiveSource())

  const isError = stage === 'error'

  const setPipeline = useStore((s) => s.setPipeline)
  const setActiveSource = useStore((s) => s.setActiveSource)
  const clearPipelineCache = useStore((s) => s.clearPipelineCache)
  const { processVideo } = usePipeline()

  // Resume is offered only when:
  //   • the pipeline is currently in the error state
  //   • we know which stage failed
  //   • the source still exists in the store (not cancelled)
  // Re-runs `processVideo` with `resumeFrom` set to the failed stage so prior
  // stages (download, transcribe) reuse their cached output and we pick up
  // exactly where it broke.
  const canResume = isError && failedStage !== null && activeSource !== null

  const handleResume = (): void => {
    if (!canResume || !activeSource || !failedStage) return
    void processVideo(activeSource, failedStage)
  }

  // Show the Download row only for YouTube sources.
  const visibleStages = useMemo<readonly StageRow[]>(() => {
    if (activeSource?.origin === 'youtube') return ALL_STAGES
    return ALL_STAGES.filter((s) => s.key !== 'downloading')
  }, [activeSource?.origin])

  const handleCancel = (): void => {
    // Reset pipeline + drop the active source — the App router will swap back
    // to the drop screen on the next render.  In-flight async work will see
    // the next state read and short-circuit on its own boundaries.
    setPipeline({ stage: 'idle', message: '', percent: 0 })
    setActiveSource(null)
    clearPipelineCache()
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-8">
      <Card className="w-full max-w-[640px] p-6">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-foreground text-base font-semibold tracking-tight">
            Processing
          </h2>
          {activeSource && (
            <span
              className="text-muted-foreground max-w-[60%] truncate text-xs"
              title={activeSource.name}
            >
              {activeSource.name}
            </span>
          )}
        </div>

        <Separator className="my-3" />

        {/* Inline screen-specific error — the bottom <ErrorLog> panel still
            carries the full history; this Alert surfaces the active failure
            so the user doesn't have to expand the log to see what broke. */}
        {isError && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Processing failed</AlertTitle>
            <AlertDescription className="break-words">
              {message || 'An error interrupted the pipeline.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col">
          {visibleStages.map((row, idx) => {
            const status = deriveStatus(row.key, stage, failedStage, completed)
            return (
              <div key={row.key}>
                {idx > 0 && <Separator />}
                <StageTimelineRow
                  row={row}
                  status={status}
                  percent={percent}
                  message={message}
                />
              </div>
            )
          })}
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {isError ? 'Back' : 'Cancel'}
          </Button>
          {canResume && (
            <Button
              variant="default"
              size="sm"
              onClick={handleResume}
              title={`Resume from ${failedStage}`}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Resume from {failedStage}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
