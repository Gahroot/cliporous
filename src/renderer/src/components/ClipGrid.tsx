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
 * Loading state: shadcn <Skeleton> tiles in the same 9:16 aspect ratio.
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

import { ClipCard } from '@/components/ClipCard'
import { useStore } from '@/store'
import { selectActiveClips } from '@/store/selectors'
import type { ClipCandidate } from '@/store/types'

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
// ClipDetail Sheet — placeholder.
// The full editor lives in a separate task. We render the Sheet primitives
// here so card clicks have a working open/close target today.
// ---------------------------------------------------------------------------

function ClipDetailSheet({
  clip,
  open,
  onOpenChange,
}: {
  clip: ClipCandidate | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{clip?.hookText || 'Clip details'}</SheetTitle>
          <SheetDescription>
            {clip
              ? `Score ${Math.round(clip.score)} · ${clip.duration.toFixed(1)}s`
              : 'No clip selected.'}
          </SheetDescription>
        </SheetHeader>
        <Separator className="my-4" />
        <div className="text-sm text-muted-foreground">
          Detailed editor coming soon.
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Empty state — no clips at all
// ---------------------------------------------------------------------------

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium text-foreground">No clips yet</p>
      <p className="text-xs text-muted-foreground">
        Generated clips will appear here once processing finishes.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ClipGrid
// ---------------------------------------------------------------------------

export function ClipGrid(): React.JSX.Element {
  const clips = useStore(selectActiveClips)
  const activeSourceId = useStore((s) => s.activeSourceId)
  const source = useStore((s) =>
    s.activeSourceId ? s.sources.find((src) => src.id === s.activeSourceId) ?? null : null
  )
  const updateClipStatus = useStore((s) => s.updateClipStatus)
  const stage = useStore((s) => s.pipeline.stage)

  const [openClipId, setOpenClipId] = useState<string | null>(null)

  const openClip = openClipId
    ? clips.find((c) => c.id === openClipId) ?? null
    : null

  const handleApprove = (clipId: string): void => {
    if (!activeSourceId) return
    const current = clips.find((c) => c.id === clipId)
    const next = current?.status === 'approved' ? 'pending' : 'approved'
    updateClipStatus(activeSourceId, clipId, next)
  }

  const handleReject = (clipId: string): void => {
    if (!activeSourceId) return
    const current = clips.find((c) => c.id === clipId)
    const next = current?.status === 'rejected' ? 'pending' : 'rejected'
    updateClipStatus(activeSourceId, clipId, next)
  }

  // Loading: pipeline still working OR ready but clip array hasn't populated.
  const isLoading =
    stage === 'scoring' ||
    stage === 'optimizing-loops' ||
    stage === 'detecting-faces' ||
    stage === 'ai-editing' ||
    stage === 'segmenting'

  const approvedCount = clips.filter((c) => c.status === 'approved').length

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar — clip count + Render Approved primary action */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="text-sm text-muted-foreground">
          {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
          {approvedCount > 0 && ` · ${approvedCount} approved`}
        </div>
        <Button size="sm" disabled={approvedCount === 0}>
          Render Approved {approvedCount > 0 && `(${approvedCount})`}
        </Button>
      </div>

      {/* Scrollable grid area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isLoading && clips.length === 0 ? (
          <ClipGridSkeleton />
        ) : clips.length === 0 ? (
          <EmptyState />
        ) : (
          <div className={GRID_COLS}>
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                source={source}
                onOpenDetail={setOpenClipId}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </div>

      <ClipDetailSheet
        clip={openClip}
        open={openClipId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenClipId(null)
        }}
      />
    </div>
  )
}
