/**
 * TemplateEditor \u2014 drag-to-position editor for the two on-screen text overlays
 * burned into every clip: the hook title and the subtitles baseline.
 *
 * Coordinates are stored in `settings.templateLayout` as percentages of the
 * 1080\u00d71920 canvas (centre of element relative to top-left). The render
 * pipeline reads them via `BatchRenderOptions.templateLayout` and translates
 * them into ASS `\\an` / `MarginV` values for captions and into pixel y-offsets
 * for hook + rehook overlays.
 *
 * Ported from the ultra-clip TemplateEditor with the "media" element removed
 * (BatchClip ships only single-source clips \u2014 no per-segment image / B-roll
 * placement here) and the rehook indicator collapsed into the hook title (the
 * mid-clip pattern interrupt always mirrors the title position).
 */
import { useRef, useCallback, useState, useMemo } from 'react'
import { LayoutTemplate, Type, Captions, RotateCcw } from 'lucide-react'
import {
  DndContext,
  useDraggable,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'

import { useStore } from '@/store'
import type { TemplateLayout, Platform } from '@/store/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLATFORM_SAFE_ZONES } from '@shared/safe-zones'

const CANVAS_W = CANVAS_WIDTH
const CANVAS_H = CANVAS_HEIGHT
const SNAP_THRESHOLD_PX = 8

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'universal', label: 'Universal' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reels', label: 'Reels' },
  { value: 'shorts', label: 'Shorts' },
]

type DraggableId = keyof TemplateLayout

function DraggableElement({
  id,
  position,
  children,
}: {
  id: DraggableId
  position: { x: number; y: number }
  children: React.ReactNode
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%)${
          transform ? ` translate(${transform.x}px, ${transform.y}px)` : ''
        }`,
        cursor: 'grab',
        touchAction: 'none',
        zIndex: transform ? 10 : 1,
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}

export function TemplateEditor(): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null)
  const snappedRef = useRef({ x: false, y: false })
  const [isSnapped, setIsSnapped] = useState({ x: false, y: false })

  const templateLayout = useStore((s) => s.settings.templateLayout)
  const setTemplateLayout = useStore((s) => s.setTemplateLayout)
  const targetPlatform = useStore((s) => s.settings.targetPlatform)
  const setTargetPlatform = useStore((s) => s.setTargetPlatform)
  const resetTemplateLayout = useStore((s) => s.resetTemplateLayout)

  const canvasHeight = 420
  const canvasWidth = Math.round(canvasHeight * (9 / 16))

  const platformData = PLATFORM_SAFE_ZONES[targetPlatform]
  const deadZone = platformData.deadZones

  const scaleX = canvasWidth / CANVAS_W
  const scaleY = canvasHeight / CANVAS_H

  /** Dead zone overlay rects in preview-canvas pixels. */
  const dzOverlays = useMemo(
    () => ({
      top: { left: 0, top: 0, width: canvasWidth, height: deadZone.top * scaleY },
      bottom: {
        left: 0,
        top: canvasHeight - deadZone.bottom * scaleY,
        width: canvasWidth,
        height: deadZone.bottom * scaleY,
      },
      left:
        deadZone.left > 0
          ? {
              left: 0,
              top: deadZone.top * scaleY,
              width: deadZone.left * scaleX,
              height: canvasHeight - (deadZone.top + deadZone.bottom) * scaleY,
            }
          : null,
      right: {
        left: canvasWidth - deadZone.right * scaleX,
        top: deadZone.top * scaleY,
        width: deadZone.right * scaleX,
        height: canvasHeight - (deadZone.top + deadZone.bottom) * scaleY,
      },
    }),
    [canvasWidth, canvasHeight, deadZone, scaleX, scaleY]
  )

  /** Safe zone outline in preview pixels. */
  const safeRect = useMemo(
    () => ({
      left: deadZone.left * scaleX,
      top: deadZone.top * scaleY,
      width: (CANVAS_W - deadZone.left - deadZone.right) * scaleX,
      height: (CANVAS_H - deadZone.top - deadZone.bottom) * scaleY,
    }),
    [deadZone, scaleX, scaleY]
  )

  // Snap-to-centre dnd-kit modifier. Must be pure (only writes ref).
  const snapToCenter = useCallback(
    ({
      active,
      transform,
    }: {
      active: { id: string | number } | null
      transform: { x: number; y: number; scaleX: number; scaleY: number }
    }) => {
      if (!canvasRef.current || !active) return transform

      const rect = canvasRef.current.getBoundingClientRect()
      const key = active.id as DraggableId
      const pos = templateLayout[key]

      const result = { ...transform }
      let sx = false
      let sy = false

      const startX = (pos.x / 100) * rect.width
      const projectedX = startX + transform.x
      if (Math.abs(projectedX - rect.width / 2) < SNAP_THRESHOLD_PX) {
        result.x = rect.width / 2 - startX
        sx = true
      }

      const startY = (pos.y / 100) * rect.height
      const projectedY = startY + transform.y
      if (Math.abs(projectedY - rect.height / 2) < SNAP_THRESHOLD_PX) {
        result.y = rect.height / 2 - startY
        sy = true
      }

      snappedRef.current = { x: sx, y: sy }
      return result
    },
    [templateLayout]
  )

  const handleDragMove = useCallback((_event: DragMoveEvent) => {
    const snap = snappedRef.current
    setIsSnapped((prev) =>
      prev.x === snap.x && prev.y === snap.y ? prev : { x: snap.x, y: snap.y }
    )
  }, [])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, delta } = event
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const deltaXPct = (delta.x / rect.width) * 100
    const deltaYPct = (delta.y / rect.height) * 100

    const key = active.id as DraggableId
    const current = templateLayout[key]

    let newX = snappedRef.current.x ? 50 : current.x + deltaXPct
    let newY = snappedRef.current.y ? 50 : current.y + deltaYPct

    // Clamp to safe-zone bounds (% of canvas).
    const safeLeftPct = (deadZone.left / CANVAS_W) * 100
    const safeRightPct = ((CANVAS_W - deadZone.right) / CANVAS_W) * 100
    const safeTopPct = (deadZone.top / CANVAS_H) * 100
    const safeBottomPct = ((CANVAS_H - deadZone.bottom) / CANVAS_H) * 100

    newX = Math.max(safeLeftPct, Math.min(safeRightPct, newX))
    newY = Math.max(safeTopPct, Math.min(safeBottomPct, newY))

    setTemplateLayout({
      ...templateLayout,
      [key]: { x: newX, y: newY },
    })

    snappedRef.current = { x: false, y: false }
    setIsSnapped({ x: false, y: false })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <LayoutTemplate className="w-4 h-4" />
          Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5" />
            Template Editor
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Platform preview selector */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setTargetPlatform(p.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  targetPlatform === p.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <DndContext
            modifiers={[restrictToParentElement, snapToCenter]}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            <div
              ref={canvasRef}
              className="relative bg-zinc-900 rounded-lg overflow-hidden border border-border"
              style={{ width: canvasWidth, height: canvasHeight }}
            >
              {/* Top dead zone */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: dzOverlays.top.left,
                  top: dzOverlays.top.top,
                  width: dzOverlays.top.width,
                  height: dzOverlays.top.height,
                  background: 'rgba(239, 68, 68, 0.18)',
                }}
              />
              {/* Bottom dead zone */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: dzOverlays.bottom.left,
                  top: dzOverlays.bottom.top,
                  width: dzOverlays.bottom.width,
                  height: dzOverlays.bottom.height,
                  background: 'rgba(239, 68, 68, 0.18)',
                }}
              />
              {/* Left dead zone */}
              {dzOverlays.left && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: dzOverlays.left.left,
                    top: dzOverlays.left.top,
                    width: dzOverlays.left.width,
                    height: dzOverlays.left.height,
                    background: 'rgba(239, 68, 68, 0.18)',
                  }}
                />
              )}
              {/* Right engagement-button column */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: dzOverlays.right.left,
                  top: dzOverlays.right.top,
                  width: dzOverlays.right.width,
                  height: dzOverlays.right.height,
                  background: 'rgba(239, 68, 68, 0.12)',
                }}
              >
                <div className="flex flex-col items-center justify-center gap-2 h-full opacity-40">
                  {['\u2665', '\ud83d\udcac', '\u2197', '\ud83d\udd16'].map((icon, i) => (
                    <div key={i} className="text-[8px] text-white">
                      {icon}
                    </div>
                  ))}
                </div>
              </div>

              {/* Safe zone border */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: safeRect.left,
                  top: safeRect.top,
                  width: safeRect.width,
                  height: safeRect.height,
                  border: '1px dashed rgba(34, 197, 94, 0.35)',
                  borderRadius: 4,
                }}
              />

              {/* Centre guidelines (highlighted while snapped) */}
              <div
                className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-px transition-colors duration-75"
                style={{
                  borderLeft: '1px dashed',
                  borderColor: isSnapped.x
                    ? 'hsl(var(--accent))'
                    : 'rgba(255,255,255,0.15)',
                }}
              />
              <div
                className="absolute left-0 right-0 top-1/2 h-px -translate-y-px transition-colors duration-75"
                style={{
                  borderTop: '1px dashed',
                  borderColor: isSnapped.y
                    ? 'hsl(var(--accent))'
                    : 'rgba(255,255,255,0.15)',
                }}
              />

              {/* Person silhouette \u2014 visual reference for talking-head framing */}
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-24 h-52 bg-white rounded-full" />
              </div>

              {/* Hook / title text */}
              <DraggableElement id="titleText" position={templateLayout.titleText}>
                <div className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap select-none shadow-lg">
                  <Type className="w-3.5 h-3.5" />
                  Hook Title
                </div>
              </DraggableElement>

              {/* Subtitles */}
              <DraggableElement id="subtitles" position={templateLayout.subtitles}>
                <div className="flex items-center gap-1.5 text-white font-bold text-lg whitespace-nowrap select-none drop-shadow-lg">
                  <Captions className="w-4 h-4" />
                  Subtitles
                </div>
              </DraggableElement>
            </div>
          </DndContext>

          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Drag to reposition</span>
              <span className="text-green-500/80 font-medium">{platformData.name}</span>
              <span className="font-mono">
                Safe: {CANVAS_W - deadZone.left - deadZone.right}&times;
                {CANVAS_H - deadZone.top - deadZone.bottom}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={resetTemplateLayout}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
