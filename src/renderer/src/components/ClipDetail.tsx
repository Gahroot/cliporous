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
 *   ├────── Regenerate ──────────────────────┤
 *   │ Button (Sparkles)                      │
 *   ├────────────────────────────────────────┤
 *   │ SheetFooter — Reject / Approve         │
 *   └────────────────────────────────────────┘
 *
 * State strategy:
 *   - Trim and hook text are debounced into the store via the existing
 *     `updateClipTrim` / `updateClipHookText` actions so undo/redo works.
 *   - Captions mode is local UI state for now (no field on ClipCandidate).
 *   - Regenerate calls `window.api.regenerateClipEditPlan(clipId)`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import type { ClipCandidate, SourceVideo } from '@/store/types'

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

/** Clamp + sanitize a numeric input string into a finite number. */
function parseNumberInput(raw: string, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClipDetailProps {
  clip: ClipCandidate | null
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

  // Source bounds for the trim slider — fall back to clip range if no source.
  const sourceMax = source?.duration ?? (clip?.endTime ?? 0)

  // ---- Local working copies (committed to store on commit handlers) -------
  const [trim, setTrim] = useState<[number, number]>([0, 0])
  const [hookText, setHookText] = useState('')
  const [captionsMode, setCaptionsMode] = useState<CaptionsMode>('emphasis')
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Sync local state whenever the active clip changes.
  useEffect(() => {
    if (!clip) return
    setTrim([round1(clip.startTime), round1(clip.endTime)])
    setHookText(clip.hookText ?? '')
    // Captions mode has no persisted field on ClipCandidate yet — reset to
    // the default each time so the UI remains coherent.
    setCaptionsMode('emphasis')
  }, [clip?.id, clip?.startTime, clip?.endTime, clip?.hookText])

  // ---- Video preview ------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sourceUrl = useMemo(
    () => (source ? toFileUrl(source.path) : null),
    [source]
  )

  // Seek to clip.startTime once metadata loads / clip changes.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !clip) return
    const seek = (): void => {
      try {
        v.currentTime = clip.startTime
      } catch {
        /* metadata not ready — onLoadedMetadata will retry */
      }
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [clip?.id, clip?.startTime])

  // ---- Commit helpers -----------------------------------------------------
  const commitTrim = (next: [number, number]): void => {
    if (!clip) return
    const [start, end] = next
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    if (end <= start) return
    if (start === clip.startTime && end === clip.endTime) return
    updateClipTrim(clip.sourceId, clip.id, start, end)
  }

  const commitHookText = (next: string): void => {
    if (!clip) return
    if (next === clip.hookText) return
    updateClipHookText(clip.sourceId, clip.id, next)
  }

  // ---- Approve / Reject ---------------------------------------------------
  const handleApprove = (): void => {
    if (!clip) return
    // Make sure any in-flight edits are flushed before we change status.
    commitTrim(trim)
    commitHookText(hookText)
    updateClipStatus(clip.sourceId, clip.id, 'approved')
    onOpenChange(false)
  }

  const handleReject = (): void => {
    if (!clip) return
    updateClipStatus(clip.sourceId, clip.id, 'rejected')
    onOpenChange(false)
  }

  // ---- Regenerate edit plan (IPC) ----------------------------------------
  const handleRegenerate = async (): Promise<void> => {
    if (!clip || isRegenerating) return
    setIsRegenerating(true)
    try {
      const result = await window.api.regenerateClipEditPlan(clip.id)
      if (result && 'ok' in result && result.ok) {
        toast.success('Edit plan regenerated')
      } else {
        const msg =
          result && 'error' in result ? result.error : 'Regenerate failed'
        toast.error(msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Regenerate failed: ${msg}`)
    } finally {
      setIsRegenerating(false)
    }
  }

  // ---- Render -------------------------------------------------------------
  const duration = clip ? clip.endTime - clip.startTime : 0

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
                    setTrim([round1(next[0]), round1(next[1])])
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
                    Start (s)
                  </Label>
                  <Input
                    id="trim-start"
                    type="number"
                    step={TRIM_SLIDER_STEP}
                    min={0}
                    max={trim[1]}
                    value={trim[0]}
                    onChange={(e) => {
                      const next = parseNumberInput(e.target.value, trim[0])
                      setTrim(([, end]) => [round1(next), end])
                    }}
                    onBlur={() => {
                      const start = Math.max(0, Math.min(trim[0], trim[1] - TRIM_SLIDER_STEP))
                      const tidy: [number, number] = [round1(start), trim[1]]
                      setTrim(tidy)
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
                    End (s)
                  </Label>
                  <Input
                    id="trim-end"
                    type="number"
                    step={TRIM_SLIDER_STEP}
                    min={trim[0]}
                    max={sourceMax || undefined}
                    value={trim[1]}
                    onChange={(e) => {
                      const next = parseNumberInput(e.target.value, trim[1])
                      setTrim(([start]) => [start, round1(next)])
                    }}
                    onBlur={() => {
                      const end = Math.max(trim[0] + TRIM_SLIDER_STEP, Math.min(trim[1], sourceMax || trim[1]))
                      const tidy: [number, number] = [trim[0], round1(end)]
                      setTrim(tidy)
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

            <Separator />

            {/* Section 5 — Regenerate ----------------------------------- */}
            <section className="flex flex-col gap-2">
              <Label>Regenerate</Label>
              <Button
                type="button"
                variant="secondary"
                onClick={handleRegenerate}
                disabled={!clip || isRegenerating}
                className="w-fit"
              >
                <Sparkles className={cn(isRegenerating && 'animate-pulse')} />
                {isRegenerating ? 'Regenerating…' : 'Regenerate edit plan'}
              </Button>
            </section>
          </div>
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
