/**
 * ClipCard — single 9:16 clip tile in the ClipGrid.
 *
 * Composition:
 *   <Card> (vertical, 9:16, no custom card styling beyond layout)
 *     ├─ thumbnail <img>  ← swapped for muted+looped <video> on hover
 *     ├─ <Badge> (top-left)        — score 0–100
 *     ├─ hook overlay (bottom)     — 2-line clamp
 *     └─ <CardFooter>              — Approve / Reject pill <Button>s
 *
 * Click anywhere on the card *outside* the footer pills opens ClipDetail
 * (handled by the parent via the `onOpenDetail` callback).
 */

import { Check, Combine, Eye, Play, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import { toMediaFileUrl } from '@/lib/media-url';
import { formatSourceTime } from '@/lib/transcript-review';
import { cn } from '@/lib/utils';
import type { GridDensity } from '@/services/display-preferences';

import type { ClipCandidate, SourceVideo, StitchedClipCandidate } from '@/store/types';

/** Either a regular or a stitched clip — only shared fields are read by the card. */
export type CardClip = ClipCandidate | StitchedClipCandidate;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Display score: clamp and round to the product's 0–100 range. */
function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—';
  return Math.max(0, Math.min(100, Math.round(score))).toString();
}

/** Pick the best available poster image for the card. */
function pickThumbnail(clip: CardClip): string | undefined {
  return clip.customThumbnail ?? clip.thumbnail;
}

function isStitchedClip(clip: CardClip): clip is StitchedClipCandidate {
  return 'sourceRanges' in clip;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClipCardProps {
  clip: CardClip;
  source: SourceVideo | null;
  /** True when the clip is a stitched (multi-range) composite. */
  stitched?: boolean;
  /** Number of source ranges — only meaningful when stitched is true. */
  partCount?: number;
  /** The keyboard review cursor, independent from approve/reject status. */
  selected?: boolean;
  /** Persisted contact-sheet density. Controls information packing, never hit-target size. */
  density?: GridDensity;
  /** Keep the first visible row eager; defer posters below it. */
  mediaPriority?: 'eager' | 'lazy';
  /** Multi-select is transient review state, independent from the keyboard cursor. */
  selectionMode?: boolean;
  checked?: boolean;
  onToggleSelection?: (clipId: string) => void;
  onOpenDetail: (clipId: string) => void;
  onApprove: (clipId: string) => void;
  onReject: (clipId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClipCard({
  clip,
  source,
  stitched = false,
  partCount,
  selected = false,
  density = 'comfortable',
  mediaPriority = 'lazy',
  selectionMode = false,
  checked = false,
  onToggleSelection,
  onOpenDetail,
  onApprove,
  onReject,
}: ClipCardProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const thumb = pickThumbnail(clip);
  const isApproved = clip.status === 'approved';
  const isRejected = clip.status === 'rejected';
  const displayScore =
    'scoreSource' in clip && clip.scoreSource === 'manual' ? 'New' : formatScore(clip.score);
  const sourceOffline = source?.mediaStatus === 'offline';
  const sourceChecking = source?.mediaStatus === 'checking';
  const sourceUrl =
    source && !sourceOffline && !sourceChecking ? toMediaFileUrl(source.path) : null;
  const isStitched = stitched || isStitchedClip(clip);
  // Stitched clips don't have scalar startTime/endTime — hover preview is
  // disabled because the single-range seek-and-play model doesn't fit a
  // multi-range composite. Static thumbnail is fine for v1.
  const hoverPreviewEnabled =
    !sourceOffline && !sourceChecking && !isStitched && 'startTime' in clip && 'endTime' in clip;
  const previewStart = hoverPreviewEnabled ? (clip as ClipCandidate).startTime : 0;
  const previewEnd = hoverPreviewEnabled ? (clip as ClipCandidate).endTime : 0;

  const handleMouseEnter = (): void => {
    if (!hoverPreviewEnabled) return;
    setIsHovering(true);
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - previewStart) > 0.25) {
      try {
        v.currentTime = previewStart;
      } catch {
        /* ignore */
      }
    }
    void v.play().catch(() => {
      /* autoplay may fail before metadata */
    });
  };

  const handleMouseLeave = (): void => {
    if (!hoverPreviewEnabled) return;
    setIsHovering(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
    }
    setIsVideoReady(false);
  };

  const handleTimeUpdate = (): void => {
    if (!hoverPreviewEnabled) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime >= previewEnd || v.currentTime < previewStart - 0.1) {
      try {
        v.currentTime = previewStart;
      } catch {
        /* ignore */
      }
    }
  };

  const handleLoadedMetadata = (): void => {
    if (!hoverPreviewEnabled) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = previewStart;
    } catch {
      /* ignore */
    }
    if (isHovering) {
      void v.play().catch(() => {});
    }
  };

  const handleCardActivate = (): void => {
    if (selectionMode) {
      onToggleSelection?.(clip.id);
      return;
    }
    onOpenDetail(clip.id);
  };

  return (
    <Card
      data-selected={selected ? 'true' : 'false'}
      data-checked={checked ? 'true' : 'false'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'media-list-item group relative flex aspect-[9/16] cursor-pointer flex-col overflow-hidden p-0',
        'transition-[opacity,border-color,box-shadow] duration-150',
        'hover:border-primary/45',
        selected && 'border-primary/80',
        checked && 'border-primary ring-2 ring-primary',
        isApproved && !checked && 'border-primary',
        isRejected && 'opacity-50',
      )}
    >
      <button
        type="button"
        data-review-clip-id={clip.id}
        data-density={density}
        aria-label={`Clip: ${clip.hookText || 'untitled'}, ${displayScore === 'New' ? 'unscored' : `AI score ${displayScore} (advisory)`}, source ${formatSourceTime('startTime' in clip ? clip.startTime : (clip.sourceRanges[0]?.startTime ?? 0))}${selectionMode ? (checked ? ', checked for bulk actions' : ', not checked for bulk actions') : selected ? ', in inspector' : ''}`}
        aria-keyshortcuts={selectionMode ? 'Enter Space S' : 'Enter Space A X'}
        aria-pressed={selectionMode ? checked : undefined}
        onClick={handleCardActivate}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      {/* Media layer — thumbnail (always rendered) + video on top while hovering */}
      <div className="absolute inset-0 bg-muted">
        {sourceOffline ? (
          <OfflineMediaPlaceholder fileName={source?.name ?? 'Source media'} />
        ) : thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            loading={mediaPriority}
            decoding="async"
            fetchPriority={mediaPriority === 'eager' ? 'high' : 'auto'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Play className="h-8 w-8 opacity-50" aria-hidden="true" />
          </div>
        )}

        {isHovering && sourceUrl && hoverPreviewEnabled && (
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
              isHovering && isVideoReady ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}

        {/* Bottom gradient scrim for hook readability */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      </div>

      {/* Score and source-time badge stay visible in both density modes. */}
      <Badge
        variant="secondary"
        className="pointer-events-none absolute left-2 top-2 z-20 border border-white/25 bg-black/70 font-mono font-semibold tabular-nums text-white shadow-sm"
      >
        {displayScore === 'New' ? 'Not scored' : `AI ${displayScore}`} ·{' '}
        {formatSourceTime(
          'startTime' in clip ? clip.startTime : (clip.sourceRanges[0]?.startTime ?? 0),
        )}
      </Badge>

      {/* Multi-select owns the top-right; otherwise preserve clip-kind and cursor context. */}
      {selectionMode ? (
        <label className="absolute right-2 top-2 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-white/35 bg-black/70 text-white shadow-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleSelection?.(clip.id)}
            className="h-4 w-4 accent-primary"
            aria-label={`Select ${clip.hookText || 'untitled clip'} for bulk actions`}
          />
        </label>
      ) : isStitched ? (
        <Badge
          variant="secondary"
          className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1 shadow-sm"
        >
          <Combine className="h-3 w-3" aria-hidden />
          Stitched
          {typeof partCount === 'number' && partCount > 0 && (
            <span className="tabular-nums">· {partCount}</span>
          )}
        </Badge>
      ) : selected ? (
        <Badge className="pointer-events-none absolute right-2 top-2 z-20 border border-white/30 bg-primary text-primary-foreground shadow-sm">
          Inspecting
        </Badge>
      ) : (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      )}

      {/* Hook and actions remain reachable in compact mode; labels collapse, targets do not. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col',
          density === 'compact' ? 'gap-1.5 p-2' : 'gap-2 p-3',
        )}
      >
        {isHovering && isVideoReady && (
          <p className="text-[10px] text-white/80">Source media · not edited</p>
        )}
        {selectionMode && (
          <p className="text-xs font-medium text-white">
            {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Unreviewed'}
          </p>
        )}
        {clip.hookText && (
          <p
            className={cn(
              'line-clamp-2 font-semibold leading-tight tracking-tight text-white drop-shadow-md',
              density === 'compact' ? 'text-xs' : 'text-sm',
            )}
            title={clip.hookText}
          >
            {clip.hookText}
          </p>
        )}

        {!selectionMode && (
          <CardFooter className="pointer-events-auto relative z-30 flex items-center justify-end gap-1.5 p-0">
            <Button
              type="button"
              size="sm"
              variant={isRejected ? 'destructive' : 'secondary'}
              aria-pressed={isRejected}
              aria-label="Reject clip"
              className={cn('h-8', density === 'compact' ? 'w-8 px-0' : 'px-2.5')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReject(clip.id);
              }}
            >
              <X />
              <span className={density === 'compact' ? 'sr-only' : undefined}>Reject</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isApproved ? 'default' : 'secondary'}
              aria-pressed={isApproved}
              aria-label="Approve clip"
              className={cn('h-8', density === 'compact' ? 'w-8 px-0' : 'px-2.5')}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onApprove(clip.id);
              }}
            >
              <Check />
              <span className={density === 'compact' ? 'sr-only' : undefined}>Approve</span>
            </Button>
          </CardFooter>
        )}
      </div>
    </Card>
  );
}
