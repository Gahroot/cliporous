/**
 * ClipGrid — responsive grid of ClipCards with a placeholder ClipDetail Sheet.
 *
 * Breakpoints (from /commit task):
 *   ≥1600px  → 4 columns
 *   ≥1280px  → 3 columns
 *   ≥ 900px  → 2 columns
 *   < 900px  → 1 column
 *
 * Implemented with Tailwind responsive utilities (`min-[…px]:grid-cols-N`),
 * NOT a JS layout library.
 *
 * States:
 *   • Loading  — shadcn <Skeleton> tiles in the same 9:16 aspect ratio.
 *   • Empty    — centered shadcn <Card> with an Inbox icon + one-line copy.
 *   • Error    — inline shadcn <Alert variant="destructive"> at the top when
 *                the most recent error is screen-specific (scoring / pipeline).
 *                The full-fidelity error log lives in the bottom panel.
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { ClipCard } from '@/components/ClipCard'
import { ClipDetail } from '@/components/ClipDetail'
import { startApprovedRender } from '@/services/render-service'
import { TemplateEditor } from '@/components/TemplateEditor'
import { useStore } from '@/store'
import { selectActiveClips, selectActiveStitchedClips } from '@/store/selectors'
import type { ClipCandidate, ErrorLogEntry, StitchedClipCandidate } from '@/store/types'

type GridItem =
  | { kind: 'normal'; clip: ClipCandidate; score: number }
  | { kind: 'stitched'; clip: StitchedClipCandidate; score: number }

// Sources whose errors are surfaced inline on this screen.
const CLIPS_SCREEN_SOURCES: ReadonlySet<string> = new Set([
  'pipeline',
  'scoring',
  'transcription',
  'face-detection',
])

function pickClipsScreenError(log: readonly ErrorLogEntry[]): ErrorLogEntry | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (CLIPS_SCREEN_SOURCES.has(log[i].source)) return log[i]
  }
  return null
}

// ---------------------------------------------------------------------------
// Tailwind classes — responsive grid columns at the requested breakpoints
// ---------------------------------------------------------------------------

const GRID_COLS = [
  'grid',
  'gap-4',
  'grid-cols-1',
  'min-[900px]:grid-cols-2',
  'min-[1280px]:grid-cols-3',
  'min-[1600px]:grid-cols-4',
].join(' ')

// ---------------------------------------------------------------------------
// Skeleton placeholder grid (loading state)
// ---------------------------------------------------------------------------

const SKELETON_COUNT = 8

function ClipGridSkeleton(): React.JSX.Element {
  return (
    <div className={GRID_COLS} aria-hidden="true">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <Skeleton key={i} className="aspect-[9/16] w-full rounded-lg" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state — no clips at all. Centered shadcn Card with an Inbox icon
// and a single one-line description (per /commit empty-state spec).
// ---------------------------------------------------------------------------

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
        <Inbox
          className="text-muted-foreground h-10 w-10"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-foreground text-sm font-medium">No clips yet</p>
        <p className="text-muted-foreground text-xs">
          Drop a video on the start screen to generate clips.
        </p>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClipGrid
// ---------------------------------------------------------------------------

export function ClipGrid(): React.JSX.Element {
  const clips = useStore(selectActiveClips)
  const stitchedClips = useStore(selectActiveStitchedClips)
  const activeSourceId = useStore((s) => s.activeSourceId)
  const source = useStore((s) =>
    s.activeSourceId ? s.sources.find((src) => src.id === s.activeSourceId) ?? null : null
  )
  const updateClipStatus = useStore((s) => s.updateClipStatus)
  const updateStitchedClipStatus = useStore((s) => s.updateStitchedClipStatus)
  const stage = useStore((s) => s.pipeline.stage)
  const errorLog = useStore((s) => s.errorLog)

  const [openClipId, setOpenClipId] = useState<string | null>(null)

  const screenError = pickClipsScreenError(errorLog)

  const allItems = useMemo<GridItem[]>(() => {
    const normal: GridItem[] = clips.map((c) => ({ kind: 'normal', clip: c, score: c.score }))
    const stitched: GridItem[] = stitchedClips.map((c) => ({
      kind: 'stitched',
      clip: c,
      score: c.score,
    }))
    return [...normal, ...stitched].sort((a, b) => b.score - a.score)
  }, [clips, stitchedClips])

  // The detail sheet supports both clip kinds; resolve the open id against
  // both lists. Stitched clips render the read-only variant of ClipDetail.
  const openClip =
    openClipId
      ? clips.find((c) => c.id === openClipId) ??
        stitchedClips.find((c) => c.id === openClipId) ??
        null
      : null

  const handleApprove = (item: GridItem): void => {
    if (!activeSourceId) return
    if (item.kind === 'stitched') {
      const next = item.clip.status === 'approved' ? 'pending' : 'approved'
      updateStitchedClipStatus(activeSourceId, item.clip.id, next)
    } else {
      const next = item.clip.status === 'approved' ? 'pending' : 'approved'
      updateClipStatus(activeSourceId, item.clip.id, next)
    }
  }

  const handleReject = (item: GridItem): void => {
    if (!activeSourceId) return
    if (item.kind === 'stitched') {
      const next = item.clip.status === 'rejected' ? 'pending' : 'rejected'
      updateStitchedClipStatus(activeSourceId, item.clip.id, next)
    } else {
      const next = item.clip.status === 'rejected' ? 'pending' : 'rejected'
      updateClipStatus(activeSourceId, item.clip.id, next)
    }
  }

  // Loading: pipeline still working OR ready but clip array hasn't populated.
  const isLoading =
    stage === 'scoring' ||
    stage === 'stitching' ||
    stage === 'optimizing-loops' ||
    stage === 'detecting-faces' ||
    stage === 'ai-editing' ||
    stage === 'segmenting'

  const approvedCount =
    clips.filter((c) => c.status === 'approved').length +
    stitchedClips.filter((c) => c.status === 'approved').length
  const totalCount = clips.length + stitchedClips.length
  const [isStartingRender, setIsStartingRender] = useState(false)

  const handleRenderApproved = async (): Promise<void> => {
    if (isStartingRender || approvedCount === 0) return
    setIsStartingRender(true)
    try {
      await startApprovedRender()
    } finally {
      setIsStartingRender(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar — clip count + Render Approved primary action */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'clip' : 'clips'}
          {approvedCount > 0 && ` · ${approvedCount} approved`}
        </div>
        <div className="flex items-center gap-2">
          <TemplateEditor />
          <Button
            size="sm"
            disabled={approvedCount === 0 || isStartingRender}
            onClick={handleRenderApproved}
          >
            Render Approved {approvedCount > 0 && `(${approvedCount})`}
          </Button>
        </div>
      </div>

      {/* Scrollable grid area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {/* Inline error — only when there are no clips to show; otherwise
            the bottom error log panel is the canonical surface and an inline
            alert would just duplicate it. */}
        {screenError && totalCount === 0 && !isLoading && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t generate clips</AlertTitle>
            <AlertDescription className="break-words">
              {screenError.message}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && totalCount === 0 ? (
          <ClipGridSkeleton />
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : (
          <div className={GRID_COLS}>
            {allItems.map((item) => (
              <ClipCard
                key={item.clip.id}
                clip={item.clip}
                source={source}
                stitched={item.kind === 'stitched'}
                partCount={
                  item.kind === 'stitched' ? item.clip.sourceRanges.length : undefined
                }
                onOpenDetail={setOpenClipId}
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
        open={openClipId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenClipId(null)
        }}
      />
    </div>
  )
}
