/**
 * ClipDetail — right-side <Sheet> editor for a single clip.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ SheetHeader   (hook + score · duration)│
 *   ├────────────────────────────────────────┤
 *   │ <video>  (9:16, native controls)       │
 *   ├────── Trim ────────────────────────────┤
 *   │ Slider (two thumbs) + 2 number inputs  │
 *   ├────── Hook text ───────────────────────┤
 *   │ Input + character counter              │
 *   ├────── Captions mode ───────────────────┤
 *   │ Select (Standard / Emphasis / E+H)     │
 *   ├────── Accent color ────────────────────┤
 *   │ swatch #9f75ff + tooltip               │
 *   ├────────────────────────────────────────┤
 *   │ SheetFooter — Reject / Approve         │
 *   └────────────────────────────────────────┘
 *
 * State strategy:
 *   - Trim and hook text are debounced into the store via the existing
 *     `updateClipTrim` / `updateClipHookText` actions so undo/redo works.
 *   - Captions mode is local UI state for now (no field on ClipCandidate).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Combine, FileVideo, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { ClipCandidate, SourceVideo, StitchedClipCandidate } from '@/store/types'

/** Either a regular or a stitched clip in the detail sheet. */
export type DetailClip = ClipCandidate | StitchedClipCandidate

function isStitched(clip: DetailClip): clip is StitchedClipCandidate {
  return 'sourceRanges' in clip
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Brand accent — also defined in main/edit-styles/shared/brand.ts. */
const BRAND_ACCENT = '#9f75ff'

/** Step the trim slider in 0.1 s increments — matches existing trim UX. */
const TRIM_SLIDER_STEP = 0.1

/** Soft cap for the hook-text counter. The Input itself has no maxLength. */
const HOOK_TEXT_TARGET = 80

type CaptionsMode = 'standard' | 'emphasis' | 'emphasis-highlight'

const CAPTIONS_MODE_LABELS: Record<CaptionsMode, string> = {
  standard: 'Standard',
  emphasis: 'Emphasis',
  'emphasis-highlight': 'Emphasis + Highlight',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `file://` URL from a native OS path so <video> can stream it. */
function toFileUrl(nativePath: string): string {
  if (nativePath.startsWith('file://')) return nativePath
  const normalised = nativePath.replace(/\\/g, '/')
  const withLead = normalised.startsWith('/') ? normalised : `/${normalised}`
  return `file://${encodeURI(withLead).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}

/** Round to one decimal place — keeps slider/input values tidy. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Format seconds as `m:ss.s` (or `h:mm:ss.s` past an hour).
 * Examples: 7.3 → "0:07.3", 73.4 → "1:13.4", 3725 → "1:02:05.0".
 */
function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0
  const tenths = Math.round(totalSeconds * 10) / 10
  const h = Math.floor(tenths / 3600)
  const m = Math.floor((tenths % 3600) / 60)
  const s = tenths - h * 3600 - m * 60
  const sStr = s.toFixed(1).padStart(4, '0') // "07.3" or "13.4"
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sStr}`
  return `${m}:${sStr}`
}

/**
 * Parse a timecode string back to seconds. Accepts:
 *   - bare seconds: "73.4" → 73.4
 *   - m:ss(.s): "1:13.4" → 73.4
 *   - h:mm:ss(.s): "1:02:05" → 3725
 * Returns the fallback for unparseable input.
 */
function parseTimecode(raw: string, fallback: number): number {
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  const parts = trimmed.split(':')
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) ? n : fallback
  }
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isFinite(n))) return fallback
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return fallback
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClipDetailProps {
  clip: DetailClip | null
  source: SourceVideo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClipDetail({
  clip,
  source,
  open,
  onOpenChange,
}: ClipDetailProps): React.JSX.Element {
  const updateClipTrim = useStore((s) => s.updateClipTrim)
  const updateClipHookText = useStore((s) => s.updateClipHookText)
  const updateClipStatus = useStore((s) => s.updateClipStatus)
  const updateStitchedClipStatus = useStore((s) => s.updateStitchedClipStatus)

  const stitched = clip !== null && isStitched(clip)
  const regularClip = clip !== null && !stitched ? (clip as ClipCandidate) : null

  // Source bounds for the trim slider — fall back to clip range if no source.
  const sourceMax =
    source?.duration ?? (regularClip ? regularClip.endTime : 0)

  // ---- Local working copies (committed to store on commit handlers) -------
  const [trim, setTrim] = useState<[number, number]>([0, 0])
  const [startInput, setStartInput] = useState('0:00.0')
  const [endInput, setEndInput] = useState('0:00.0')
  const [hookText, setHookText] = useState('')
  const [captionsMode, setCaptionsMode] = useState<CaptionsMode>('emphasis')

  // Sync local state whenever the active clip changes.
  useEffect(() => {
    if (!regularClip) return
    const start = round1(regularClip.startTime)
    const end = round1(regularClip.endTime)
    setTrim([start, end])
    setStartInput(formatTimecode(start))
    setEndInput(formatTimecode(end))
    setHookText(regularClip.hookText ?? '')
    // Captions mode has no persisted field on ClipCandidate yet — reset to
    // the default each time so the UI remains coherent.
    setCaptionsMode('emphasis')
  }, [regularClip?.id, regularClip?.startTime, regularClip?.endTime, regularClip?.hookText])

  // ---- Video preview ------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sourceUrl = useMemo(
    () => (source ? toFileUrl(source.path) : null),
    [source]
  )

  // Keep refs to the active trim range so the video event listeners (attached
  // once below) always see the latest values without re-binding.
  const startRef = useRef(0)
  const endRef = useRef(0)
  useEffect(() => {
    startRef.current = trim[0]
    endRef.current = trim[1]
  }, [trim])

  // Seek to clip.startTime once metadata loads / clip changes / trim changes.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !regularClip) return
    const seek = (): void => {
      try {
        v.currentTime = trim[0]
      } catch {
        /* metadata not ready — onLoadedMetadata will retry */
      }
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [regularClip?.id, trim[0]])

  // Clamp playback to [start, end]:
  //   - On `play`, if currentTime is outside the clip window, snap back to start.
  //   - On `timeupdate`, if we run past the end, pause and snap to end.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = (): void => {
      const start = startRef.current
      const end = endRef.current
      // 0.05 s grace so a hairline rounding error doesn't fight the user.
      if (v.currentTime < start - 0.05 || v.currentTime >= end - 0.05) {
        try {
          v.currentTime = start
        } catch {
          /* noop */
        }
      }
    }
    const onTimeUpdate = (): void => {
      const end = endRef.current
      if (v.currentTime >= end) {
        v.pause()
        try {
          v.currentTime = end
        } catch {
          /* noop */
        }
      }
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [sourceUrl])

  // ---- Commit helpers -----------------------------------------------------
  const commitTrim = (next: [number, number]): void => {
    if (!regularClip) return
    const [start, end] = next
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    if (end <= start) return
    if (start === regularClip.startTime && end === regularClip.endTime) return
    updateClipTrim(regularClip.sourceId, regularClip.id, start, end)
  }

  const commitHookText = (next: string): void => {
    if (!regularClip) return
    if (next === regularClip.hookText) return
    updateClipHookText(regularClip.sourceId, regularClip.id, next)
  }

  // ---- Approve / Reject ---------------------------------------------------
  const handleApprove = (): void => {
    if (!clip) return
    if (stitched) {
      updateStitchedClipStatus(clip.sourceId, clip.id, 'approved')
      onOpenChange(false)
      return
    }
    if (!regularClip) return
    // Make sure any in-flight edits are flushed before we change status.
    commitTrim(trim)
    commitHookText(hookText)
    updateClipStatus(regularClip.sourceId, regularClip.id, 'approved')
    onOpenChange(false)
  }

  const handleReject = (): void => {
    if (!clip) return
    if (stitched) {
      updateStitchedClipStatus(clip.sourceId, clip.id, 'rejected')
      onOpenChange(false)
      return
    }
    if (!regularClip) return
    updateClipStatus(regularClip.sourceId, regularClip.id, 'rejected')
    onOpenChange(false)
  }

  // ---- Render -------------------------------------------------------------
  const duration = clip
    ? stitched
      ? (clip as StitchedClipCandidate).duration
      : (clip as ClipCandidate).endTime - (clip as ClipCandidate).startTime
    : 0
  const stitchedClip = stitched ? (clip as StitchedClipCandidate) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {/* Header --------------------------------------------------------- */}
        <SheetHeader className="shrink-0 border-b border-border p-4">
          <SheetTitle className="line-clamp-2 pr-8 text-left">
            {clip?.hookText || 'Clip details'}
          </SheetTitle>
          <SheetDescription className="text-left">
            {clip
              ? `Score ${Math.round(clip.score)} · ${duration.toFixed(1)}s`
              : 'No clip selected.'}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body ----------------------------------------------- */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* No-clip empty state — the Sheet can be opened without a
              selection (e.g. while the underlying list is mutating).
              Render a centered Card so the body is never blank. */}
          {!clip && (
            <div className="flex h-full w-full items-center justify-center p-6">
              <Card className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
                <FileVideo
                  className="text-muted-foreground h-10 w-10"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <p className="text-foreground text-sm font-medium">
                  No clip selected
                </p>
                <p className="text-muted-foreground text-xs">
                  Pick a clip from the grid to edit it here.
                </p>
              </Card>
            </div>
          )}

          {stitchedClip && (
            <div className="flex flex-col gap-6 p-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Combine className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <Label className="text-sm font-medium">Stitched clip</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Range editing isn’t supported yet — approve to render or reject.
                </p>
              </section>

              {stitchedClip.reasoning && (
                <>
                  <Separator />
                  <section className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Why this works</Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {stitchedClip.reasoning}
                    </p>
                  </section>
                </>
              )}

              <Separator />

              <section className="flex flex-col gap-2">
                <Label className="text-sm font-medium">
                  Source ranges ({stitchedClip.sourceRanges.length})
                </Label>
                <ul className="flex flex-col gap-2">
                  {stitchedClip.sourceRanges.map((r, i) => (
                    <li
                      key={`${r.startTime}-${r.endTime}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs tabular-nums"
                    >
                      <span className="font-mono text-muted-foreground">
                        {formatTimecode(r.startTime)} → {formatTimecode(r.endTime)}
                      </span>
                      <span className="text-muted-foreground">
                        {(r.endTime - r.startTime).toFixed(1)}s
                      </span>
                      <span className="rounded bg-background px-1.5 py-0.5 font-medium uppercase tracking-wide">
                        {r.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {regularClip && (
          <>
          {/* Video preview ------------------------------------------------ */}
          <div className="bg-black">
            <div className="mx-auto aspect-[9/16] w-full max-w-[260px]">
              {sourceUrl ? (
                <video
                  ref={videoRef}
                  src={sourceUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No source video
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 p-4">
            {/* Section 1 — Trim ----------------------------------------- */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="trim-slider">Trim</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {duration.toFixed(1)}s
                </span>
              </div>

              <Slider
                id="trim-slider"
                min={0}
                max={Math.max(sourceMax, trim[1])}
                step={TRIM_SLIDER_STEP}
                value={trim}
                minStepsBetweenThumbs={1}
                onValueChange={(next) => {
                  if (next.length === 2) {
                    const a = round1(next[0])
                    const b = round1(next[1])
                    setTrim([a, b])
                    setStartInput(formatTimecode(a))
                    setEndInput(formatTimecode(b))
                  }
                }}
                onValueCommit={(next) => {
                  if (next.length === 2) {
                    commitTrim([round1(next[0]), round1(next[1])])
                  }
                }}
                aria-label="Clip start and end time"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="trim-start"
                    className="text-xs text-muted-foreground"
                  >
                    Start
                  </Label>
                  <Input
                    id="trim-start"
                    type="text"
                    inputMode="numeric"
                    value={startInput}
                    placeholder="0:00.0"
                    onChange={(e) => {
                      setStartInput(e.target.value)
                      const parsed = parseTimecode(e.target.value, trim[0])
                      setTrim(([, end]) => [round1(parsed), end])
                    }}
                    onBlur={() => {
                      const parsed = parseTimecode(startInput, trim[0])
                      const start = Math.max(
                        0,
                        Math.min(parsed, trim[1] - TRIM_SLIDER_STEP)
                      )
                      const tidy: [number, number] = [round1(start), trim[1]]
                      setTrim(tidy)
                      setStartInput(formatTimecode(tidy[0]))
                      commitTrim(tidy)
                    }}
                    className="tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="trim-end"
                    className="text-xs text-muted-foreground"
                  >
                    End
                  </Label>
                  <Input
                    id="trim-end"
                    type="text"
                    inputMode="numeric"
                    value={endInput}
                    placeholder="0:00.0"
                    onChange={(e) => {
                      setEndInput(e.target.value)
                      const parsed = parseTimecode(e.target.value, trim[1])
                      setTrim(([start]) => [start, round1(parsed)])
                    }}
                    onBlur={() => {
                      const parsed = parseTimecode(endInput, trim[1])
                      const end = Math.max(
                        trim[0] + TRIM_SLIDER_STEP,
                        Math.min(parsed, sourceMax || parsed)
                      )
                      const tidy: [number, number] = [trim[0], round1(end)]
                      setTrim(tidy)
                      setEndInput(formatTimecode(tidy[1]))
                      commitTrim(tidy)
                    }}
                    className="tabular-nums"
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Section 2 — Hook text ------------------------------------ */}
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="hook-text">Hook text</Label>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    hookText.length > HOOK_TEXT_TARGET
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  )}
                >
                  {hookText.length} / {HOOK_TEXT_TARGET}
                </span>
              </div>
              <Input
                id="hook-text"
                value={hookText}
                placeholder="Hook…"
                onChange={(e) => setHookText(e.target.value)}
                onBlur={() => commitHookText(hookText)}
              />
            </section>

            <Separator />

            {/* Section 3 — Captions mode -------------------------------- */}
            <section className="flex flex-col gap-2">
              <Label htmlFor="captions-mode">Captions mode</Label>
              <Select
                value={captionsMode}
                onValueChange={(v) => setCaptionsMode(v as CaptionsMode)}
              >
                <SelectTrigger id="captions-mode">
                  <SelectValue placeholder="Select captions mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    {CAPTIONS_MODE_LABELS.standard}
                  </SelectItem>
                  <SelectItem value="emphasis">
                    {CAPTIONS_MODE_LABELS.emphasis}
                  </SelectItem>
                  <SelectItem value="emphasis-highlight">
                    {CAPTIONS_MODE_LABELS['emphasis-highlight']}
                  </SelectItem>
                </SelectContent>
              </Select>
            </section>

            <Separator />

            {/* Section 4 — Accent color --------------------------------- */}
            <section className="flex flex-col gap-2">
              <Label>Accent color</Label>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      role="img"
                      aria-label={`Brand accent ${BRAND_ACCENT}`}
                      className="flex w-fit items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
                    >
                      <span
                        className="h-5 w-5 rounded-sm border border-black/20 shadow-inner"
                        style={{ backgroundColor: BRAND_ACCENT }}
                      />
                      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                        {BRAND_ACCENT}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Brand accent</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </section>

          </div>
          </>
          )}
        </div>

        {/* Footer --------------------------------------------------------- */}
        <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border p-4 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReject}
            disabled={!clip}
          >
            <X />
            Reject
          </Button>
          <Button type="button" onClick={handleApprove} disabled={!clip}>
            <Check />
            Approve
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
