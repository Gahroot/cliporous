/**
 * TemplateEditor — drag-to-position editor for the two on-screen text overlays
 * burned into every clip: the hook title and the reserved subtitle block.
 *
 * Coordinates are stored in `settings.templateLayout` as percentages of the
 * locked 1080×1920 canvas, measured from the top-left. Captions use the point
 * as a stable ASS bottom-center anchor; hook and rehook use a center anchor.
 *
 * Ported from the ultra-clip TemplateEditor with the "media" element removed
 * (BatchClip ships only single-source clips \u2014 no per-segment image / B-roll
 * placement here) and the rehook indicator collapsed into the hook title (the
 * mid-clip pattern interrupt always mirrors the title position).
 */

import { DndContext, type DragEndEvent, type DragMoveEvent, useDraggable } from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { CANVAS_HEIGHT, CANVAS_WIDTH, PLATFORM_SAFE_ZONES } from '@shared/safe-zones';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Captions,
  Heart,
  LayoutTemplate,
  MessageCircle,
  RotateCcw,
  Share2,
  Type,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useStore } from '@/store';
import type { Platform, TemplateLayout } from '@/store/types';

const CANVAS_W = CANVAS_WIDTH;
const CANVAS_H = CANVAS_HEIGHT;
const SNAP_THRESHOLD_PX = 8;

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'universal', label: 'Universal' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reels', label: 'Reels' },
  { value: 'shorts', label: 'Shorts' },
];

type DraggableId = keyof TemplateLayout;

function DraggableElement({
  id,
  label,
  position,
  onNudge,
  verticalAnchor = 'center',
  children,
}: {
  id: DraggableId;
  label: string;
  position: { x: number; y: number };
  onNudge: (axis: 'x' | 'y', amount: number) => void;
  verticalAnchor?: 'center' | 'bottom';
  children: React.ReactNode;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, ${verticalAnchor === 'bottom' ? '-100%' : '-50%'})${
          transform ? ` translate(${transform.x}px, ${transform.y}px)` : ''
        }`,
        cursor: 'grab',
        touchAction: 'none',
        zIndex: transform ? 10 : 1,
      }}
      {...listeners}
      {...attributes}
      aria-label={`${label}. Position ${Math.round(position.x)} percent horizontally, ${Math.round(position.y)} percent vertically. Use arrow keys to move; hold Shift for larger steps.`}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 5 : 1;
        if (event.key === 'ArrowLeft') onNudge('x', -amount);
        else if (event.key === 'ArrowRight') onNudge('x', amount);
        else if (event.key === 'ArrowUp') onNudge('y', -amount);
        else if (event.key === 'ArrowDown') onNudge('y', amount);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}

interface TemplateEditorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function TemplateEditor({
  open,
  onOpenChange,
  showTrigger = true,
}: TemplateEditorProps = {}): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const snappedRef = useRef({ x: false, y: false });
  const [isSnapped, setIsSnapped] = useState({ x: false, y: false });
  const [positionAnnouncement, setPositionAnnouncement] = useState('');

  const templateLayout = useStore((s) => s.settings.templateLayout);
  const setTemplateLayout = useStore((s) => s.setTemplateLayout);
  const targetPlatform = useStore((s) => s.settings.targetPlatform);
  const setTargetPlatform = useStore((s) => s.setTargetPlatform);
  const resetTemplateLayout = useStore((s) => s.resetTemplateLayout);
  const activeSourceId = useStore((s) => s.activeSourceId);
  const sourceThumbnail = useStore(
    (s) => s.sources.find((source) => source.id === activeSourceId)?.thumbnail,
  );

  const canvasHeight = 420;
  const canvasWidth = Math.round(canvasHeight * (9 / 16));

  const platformData = PLATFORM_SAFE_ZONES[targetPlatform];
  const deadZone = platformData.deadZones;

  const scaleX = canvasWidth / CANVAS_W;
  const scaleY = canvasHeight / CANVAS_H;

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
    [canvasWidth, deadZone, scaleX, scaleY],
  );

  /** Safe zone outline in preview pixels. */
  const safeRect = useMemo(
    () => ({
      left: deadZone.left * scaleX,
      top: deadZone.top * scaleY,
      width: (CANVAS_W - deadZone.left - deadZone.right) * scaleX,
      height: (CANVAS_H - deadZone.top - deadZone.bottom) * scaleY,
    }),
    [deadZone, scaleX, scaleY],
  );

  // Snap-to-centre dnd-kit modifier. Must be pure (only writes ref).
  const snapToCenter = useCallback(
    ({
      active,
      transform,
    }: {
      active: { id: string | number } | null;
      transform: { x: number; y: number; scaleX: number; scaleY: number };
    }) => {
      if (!canvasRef.current || !active) return transform;

      const rect = canvasRef.current.getBoundingClientRect();
      const key = active.id as DraggableId;
      const pos = templateLayout[key];

      const result = { ...transform };
      let sx = false;
      let sy = false;

      const startX = (pos.x / 100) * rect.width;
      const projectedX = startX + transform.x;
      if (Math.abs(projectedX - rect.width / 2) < SNAP_THRESHOLD_PX) {
        result.x = rect.width / 2 - startX;
        sx = true;
      }

      const startY = (pos.y / 100) * rect.height;
      const projectedY = startY + transform.y;
      if (Math.abs(projectedY - rect.height / 2) < SNAP_THRESHOLD_PX) {
        result.y = rect.height / 2 - startY;
        sy = true;
      }

      snappedRef.current = { x: sx, y: sy };
      return result;
    },
    [templateLayout],
  );

  const handleDragMove = useCallback((_event: DragMoveEvent) => {
    const snap = snappedRef.current;
    setIsSnapped((prev) =>
      prev.x === snap.x && prev.y === snap.y ? prev : { x: snap.x, y: snap.y },
    );
  }, []);

  const safeBounds = useMemo(
    () => ({
      minX: (deadZone.left / CANVAS_W) * 100,
      maxX: ((CANVAS_W - deadZone.right) / CANVAS_W) * 100,
      minY: (deadZone.top / CANVAS_H) * 100,
      maxY: ((CANVAS_H - deadZone.bottom) / CANVAS_H) * 100,
    }),
    [deadZone],
  );

  const updatePosition = useCallback(
    (key: DraggableId, axis: 'x' | 'y', requestedValue: number): void => {
      const bounds =
        axis === 'x'
          ? { min: safeBounds.minX, max: safeBounds.maxX }
          : { min: safeBounds.minY, max: safeBounds.maxY };
      const value = Math.max(bounds.min, Math.min(bounds.max, requestedValue));
      const next = {
        ...templateLayout[key],
        [axis]: value,
      };
      setTemplateLayout({ ...templateLayout, [key]: next });
      const label = key === 'titleText' ? 'Hook title' : 'Subtitles';
      const snapped = Math.abs(value - 50) < 0.001;
      setPositionAnnouncement(
        `${label} ${axis === 'x' ? 'horizontal' : 'vertical'} position ${Math.round(value)} percent${snapped ? ', snapped to center' : ''}.`,
      );
    },
    [safeBounds, setTemplateLayout, templateLayout],
  );

  const nudgePosition = useCallback(
    (key: DraggableId, axis: 'x' | 'y', amount: number): void => {
      updatePosition(key, axis, templateLayout[key][axis] + amount);
    },
    [templateLayout, updatePosition],
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, delta } = event;
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const deltaXPct = (delta.x / rect.width) * 100;
    const deltaYPct = (delta.y / rect.height) * 100;

    const key = active.id as DraggableId;
    const current = templateLayout[key];

    let newX = snappedRef.current.x ? 50 : current.x + deltaXPct;
    let newY = snappedRef.current.y ? 50 : current.y + deltaYPct;

    // Clamp to safe-zone bounds (% of canvas).
    newX = Math.max(safeBounds.minX, Math.min(safeBounds.maxX, newX));
    newY = Math.max(safeBounds.minY, Math.min(safeBounds.maxY, newY));

    setTemplateLayout({
      ...templateLayout,
      [key]: { x: newX, y: newY },
    });
    const label = key === 'titleText' ? 'Hook title' : 'Subtitles';
    setPositionAnnouncement(
      `${label} moved to ${Math.round(newX)} percent horizontally and ${Math.round(newY)} percent vertically.`,
    );

    snappedRef.current = { x: false, y: false };
    setIsSnapped({ x: false, y: false });
  };

  const dialogProps = open === undefined ? {} : onOpenChange ? { open, onOpenChange } : { open };

  return (
    <Dialog {...dialogProps}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <LayoutTemplate className="w-4 h-4" />
            Template
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5" />
            Template Editor
          </DialogTitle>
          <DialogDescription>
            Position hook titles and subtitles inside the selected platform safe zone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Platform preview selector */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {PLATFORMS.map((p) => (
              <button
                type="button"
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
              {/* Real project media when available; neutral framing geometry otherwise. */}
              {sourceThumbnail ? (
                <img
                  src={sourceThumbnail}
                  alt="Current source frame"
                  className="absolute inset-0 h-full w-full object-cover opacity-55"
                  draggable={false}
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center opacity-10"
                  aria-hidden="true"
                >
                  <div className="h-52 w-24 rounded-full bg-white" />
                </div>
              )}

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
                <div className="flex h-full flex-col items-center justify-center gap-2 text-white opacity-40">
                  <Heart className="h-3 w-3" aria-hidden />
                  <MessageCircle className="h-3 w-3" aria-hidden />
                  <Share2 className="h-3 w-3" aria-hidden />
                  <Bookmark className="h-3 w-3" aria-hidden />
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
                  borderColor: isSnapped.x ? 'hsl(var(--accent))' : 'rgba(255,255,255,0.15)',
                }}
              />
              <div
                className="absolute left-0 right-0 top-1/2 h-px -translate-y-px transition-colors duration-75"
                style={{
                  borderTop: '1px dashed',
                  borderColor: isSnapped.y ? 'hsl(var(--accent))' : 'rgba(255,255,255,0.15)',
                }}
              />

              {/* Hook / title text */}
              <DraggableElement
                id="titleText"
                label="Hook title position"
                position={templateLayout.titleText}
                onNudge={(axis, amount) => nudgePosition('titleText', axis, amount)}
              >
                <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-lg select-none">
                  <Type className="h-3.5 w-3.5" aria-hidden="true" />
                  Hook Title
                </div>
              </DraggableElement>

              {/* Subtitles */}
              <DraggableElement
                id="subtitles"
                label="Subtitles position"
                position={templateLayout.subtitles}
                onNudge={(axis, amount) => nudgePosition('subtitles', axis, amount)}
                verticalAnchor="bottom"
              >
                <div className="flex items-center gap-1.5 whitespace-nowrap text-lg font-bold text-white drop-shadow-lg select-none">
                  <Captions className="h-4 w-4" aria-hidden="true" />
                  Subtitles
                </div>
              </DraggableElement>
            </div>
          </DndContext>

          <div className="grid w-full gap-3 sm:grid-cols-2">
            {(
              [
                ['titleText', 'Hook title'],
                ['subtitles', 'Subtitles'],
              ] as const
            ).map(([key, label]) => (
              <fieldset key={key} className="rounded-lg border bg-muted/30 p-3">
                <legend className="px-1 text-xs font-semibold">{label} position</legend>
                <div className="mt-1 grid grid-cols-[1fr_auto] items-end gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y'] as const).map((axis) => (
                      <label key={axis} className="grid gap-1 text-[11px] text-muted-foreground">
                        {axis === 'x' ? 'Horizontal %' : 'Vertical %'}
                        <input
                          type="number"
                          min={axis === 'x' ? safeBounds.minX : safeBounds.minY}
                          max={axis === 'x' ? safeBounds.maxX : safeBounds.maxY}
                          step="1"
                          value={Math.round(templateLayout[key][axis] * 10) / 10}
                          onChange={(event) =>
                            updatePosition(key, axis, Number.parseFloat(event.target.value) || 0)
                          }
                          className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </label>
                    ))}
                  </div>
                  <fieldset className="grid grid-cols-3 grid-rows-2 gap-1">
                    <legend className="sr-only">{label} nudge controls</legend>
                    <span />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${label.toLowerCase()} up`}
                      onClick={() => nudgePosition(key, 'y', -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <span />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${label.toLowerCase()} left`}
                      onClick={() => nudgePosition(key, 'x', -1)}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${label.toLowerCase()} down`}
                      onClick={() => nudgePosition(key, 'y', 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${label.toLowerCase()} right`}
                      onClick={() => nudgePosition(key, 'x', 1)}
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </fieldset>
                </div>
              </fieldset>
            ))}
          </div>

          <p className="sr-only" aria-live="polite">
            {positionAnnouncement}
          </p>

          <div className="flex w-full flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>Drag, use arrow keys, or edit coordinates</span>
              <span className="font-medium text-success">{platformData.name}</span>
              <span className="font-mono">
                Safe: {CANVAS_W - deadZone.left - deadZone.right}&times;
                {CANVAS_H - deadZone.top - deadZone.bottom}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                resetTemplateLayout();
                setPositionAnnouncement('Template positions reset to defaults.');
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
