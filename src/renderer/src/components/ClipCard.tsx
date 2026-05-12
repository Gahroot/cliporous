/**
 * ClipCard — single 9:16 clip tile in the ClipGrid.
 *
 * Composition:
 *   <Card> (vertical, 9:16, no custom card styling beyond layout)
 *     ├─ thumbnail <img>  ← swapped for muted+looped <video> on hover
 *     ├─ <Badge> (top-left)        — score 0–99
 *     ├─ hook overlay (bottom)     — 2-line clamp
 *     └─ <CardFooter>              — Approve / Reject pill <Button>s
 *
 * Click anywhere on the card *outside* the footer pills opens ClipDetail
 * (handled by the parent via the `onOpenDetail` callback).
 */

import { useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { Check, Combine, Eye, Play, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { ClipCandidate, SourceVideo, StitchedClipCandidate } from '@/store/types'

/** Either a regular or a stitched clip — only shared fields are read by the card. */
export type CardClip = ClipCandidate | StitchedClipCandidate

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a `file://` URL for a native OS path so the renderer's <video> tag
 * can stream the source. Spaces and unicode must be percent-encoded but the
 * leading slashes preserved.
 */
function toFileUrl(nativePath: string): string {
  if (nativePath.startsWith('file://')) return nativePath
  // On Windows the path starts with e.g. C:\… — file URL needs three slashes.
  const normalised = nativePath.replace(/\\/g, '/')
  const withLead = normalised.startsWith('/') ? normalised : `/${normalised}`
  return `file://${encodeURI(withLead).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}

/** Display score: clamp + round to 2-digit integer. */
function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—'
  return Math.max(0, Math.min(99, Math.round(score))).toString()
}

/** Pick the best available poster image for the card. */
function pickThumbnail(clip: CardClip): string | undefined {
  return clip.customThumbnail ?? clip.thumbnail
}

function isStitchedClip(clip: CardClip): clip is StitchedClipCandidate {
  return 'sourceRanges' in clip
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClipCardProps {
  clip: CardClip
  source: SourceVideo | null
  /** True when the clip is a stitched (multi-range) composite. */
  stitched?: boolean
  /** Number of source ranges — only meaningful when stitched is true. */
  partCount?: number
  onOpenDetail: (clipId: string) => void
  onApprove: (clipId: string) => void
  onReject: (clipId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClipCard({
  clip,
  source,
  stitched = false,
  partCount,
  onOpenDetail,
  onApprove,
  onReject,
}: ClipCardProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)

  const thumb = pickThumbnail(clip)
  const isApproved = clip.status === 'approved'
  const isRejected = clip.status === 'rejected'
  const sourceUrl = source ? toFileUrl(source.path) : null
  const isStitched = stitched || isStitchedClip(clip)
  // Stitched clips don't have scalar startTime/endTime — hover preview is
  // disabled because the single-range seek-and-play model doesn't fit a
  // multi-range composite. Static thumbnail is fine for v1.
  const hoverPreviewEnabled = !isStitched && 'startTime' in clip && 'endTime' in clip
  const previewStart = hoverPreviewEnabled ? (clip as ClipCandidate).startTime : 0
  const previewEnd = hoverPreviewEnabled ? (clip as ClipCandidate).endTime : 0

  const handleMouseEnter = (): void => {
    if (!hoverPreviewEnabled) return
    setIsHovering(true)
    const v = videoRef.current
    if (!v) return
    if (Math.abs(v.currentTime - previewStart) > 0.25) {
      try {
        v.currentTime = previewStart
      } catch {
        /* ignore */
      }
    }
    void v.play().catch(() => {
      /* autoplay may fail before metadata */
    })
  }

  const handleMouseLeave = (): void => {
    if (!hoverPreviewEnabled) return
    setIsHovering(false)
    const v = videoRef.current
    if (v) {
      v.pause()
    }
    setIsVideoReady(false)
  }

  const handleTimeUpdate = (): void => {
    if (!hoverPreviewEnabled) return
    const v = videoRef.current
    if (!v) return
    if (v.currentTime >= previewEnd || v.currentTime < previewStart - 0.1) {
      try {
        v.currentTime = previewStart
      } catch {
        /* ignore */
      }
    }
  }

  const handleLoadedMetadata = (): void => {
    if (!hoverPreviewEnabled) return
    const v = videoRef.current
    if (!v) return
    try {
      v.currentTime = previewStart
    } catch {
      /* ignore */
    }
    if (isHovering) {
      void v.play().catch(() => {})
    }
  }

  const handleCardClick = (e: MouseEvent<HTMLDivElement>): void => {
    // Footer pills handle their own clicks via stopPropagation, so any click
    // that bubbles up here means "open detail".
    if (e.defaultPrevented) return
    onOpenDetail(clip.id)
  }

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenDetail(clip.id)
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Clip: ${clip.hookText || 'untitled'} — score ${formatScore(clip.score)}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      className={cn(
        'group relative flex aspect-[9/16] cursor-pointer flex-col overflow-hidden p-0',
        'transition-[opacity,box-shadow,transform] duration-150',
        'hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isApproved && 'ring-2 ring-primary',
        isRejected && 'opacity-50'
      )}
    >
      {/* Media layer — thumbnail (always rendered) + video on top while hovering */}
      <div className="absolute inset-0 bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Play className="h-8 w-8 opacity-50" />
          </div>
        )}

        {sourceUrl && hoverPreviewEnabled && (
          <video
            ref={videoRef}
            src={sourceUrl}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onCanPlay={() => setIsVideoReady(true)}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-100',
              isHovering && isVideoReady ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}

        {/* Bottom gradient scrim for hook readability */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      </div>

      {/* Score badge — top-left */}
      <Badge
        variant="secondary"
        className="absolute left-2 top-2 z-10 tabular-nums shadow-sm"
      >
        {formatScore(clip.score)}
      </Badge>

      {/* Stitched badge — top-right (replaces hover-preview eye when stitched) */}
      {isStitched ? (
        <Badge
          variant="secondary"
          className="absolute right-2 top-2 z-10 flex items-center gap-1 shadow-sm"
        >
          <Combine className="h-3 w-3" aria-hidden />
          Stitched
          {typeof partCount === 'number' && partCount > 0 && (
            <span className="tabular-nums">· {partCount}</span>
          )}
        </Badge>
      ) : (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Hook text overlay — bottom, 2-line clamp */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3">
        {clip.hookText && (
          <p
            className="line-clamp-2 text-sm font-semibold leading-tight tracking-tight text-white drop-shadow-md"
            title={clip.hookText}
          >
            {clip.hookText}
          </p>
        )}

        <CardFooter className="flex items-center justify-end gap-1.5 p-0">
          <Button
            type="button"
            size="sm"
            variant={isRejected ? 'destructive' : 'secondary'}
            aria-pressed={isRejected}
            aria-label="Reject clip"
            className="h-7 rounded-full px-2.5"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onReject(clip.id)
            }}
          >
            <X />
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isApproved ? 'default' : 'secondary'}
            aria-pressed={isApproved}
            aria-label="Approve clip"
            className="h-7 rounded-full px-2.5"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onApprove(clip.id)
            }}
          >
            <Check />
            Approve
          </Button>
        </CardFooter>
      </div>
    </Card>
  )
}
