/**
 * ClipDetail — reusable clip inspector rendered as a narrow Sheet or wide panel.
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
 *   ├────── Brand accent (preview) ──────────┤
 *   │ swatch #9f75ff + tooltip (read-only)   │
 *   ├────────────────────────────────────────┤
 *   │ SheetFooter — Reject / Approve         │
 *   └────────────────────────────────────────┘
 *
 * State strategy:
 *   - Trim and hook text are debounced into the store via the existing
 *     `updateClipTrim` / `updateClipHookText` actions so undo/redo works.
 *   - Captions mode is persisted as a per-clip render override
 *     (`overrides.captionMode` via `setClipOverride`) and forwarded to the
 *     render pipeline, so the chosen mode is actually burned in.
 *   - Brand accent is a fixed, read-only preview (not a per-clip control in
 *     this version).
 */

import { CAPTION_MAX_WIDTH_FRACTION } from '@shared/caption-layout';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Combine,
  FileVideo,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ClipScoreReading } from '@/components/ClipRescore';
import { DirectorsNote } from '@/components/DirectorsNote';
import { EditorialPlayer } from '@/components/EditorialPlayer';
import { HistoryControls } from '@/components/HistoryControls';
import { OfflineMediaPlaceholder } from '@/components/OfflineMediaPlaceholder';
import { RenderedPreviewStatus } from '@/components/RenderedPreviewStatus';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { WaveformTrim } from '@/components/WaveformTrim';
import {
  clearRenderedPreviewCache,
  type RenderedPreviewState,
  type RenderPreviewConfig,
  useRenderedPreview,
} from '@/hooks/useRenderedPreview';
import { cn } from '@/lib/utils';
import { inspectorWidthPixels, useDisplayPreferences } from '@/services/display-preferences';
import { PRESTYJ_CAPTION_STYLE } from '@/services/render-defaults';
import { showUndoFeedback } from '@/services/review-feedback';
import { useStore } from '@/store';
import type {
  ClipCandidate,
  CropRegion,
  CropTimelineEntry,
  SourceVideo,
  StitchedClipCandidate,
  TemplateLayout,
} from '@/store/types';

/** Either a regular or a stitched clip in the detail sheet. */
export type DetailClip = ClipCandidate | StitchedClipCandidate;

function isStitched(clip: DetailClip): clip is StitchedClipCandidate {
  return 'sourceRanges' in clip;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Brand accent — also defined in main/edit-styles/shared/brand.ts. */
const BRAND_ACCENT = '#9f75ff';

/** Step the trim slider in 0.1 s increments — matches existing trim UX. */
const TRIM_SLIDER_STEP = 0.1;

/** Soft cap for the hook-text counter. The Input itself has no maxLength. */
const HOOK_TEXT_TARGET = 80;

/** Caption modes — values match the main-side V2 caption builder exactly. */
type CaptionsMode = 'standard' | 'emphasis' | 'emphasis_highlight';

const CAPTIONS_MODE_LABELS: Record<CaptionsMode, string> = {
  standard: 'Standard',
  emphasis: 'Emphasis',
  emphasis_highlight: 'Emphasis + Highlight',
};

/**
 * Default caption mode shown when a clip has no explicit override. Mirrors
 * `PRESTYJ_CAPTION_STYLE.captionMode` in render-defaults.ts, which is what the
 * render path actually applies — so the control reflects the real output.
 */
const DEFAULT_CAPTIONS_MODE: CaptionsMode = 'emphasis_highlight';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a playable URL from a native OS path or an already-safe media URL. */
function toFileUrl(nativePath: string): string {
  if (/^(?:file|https?|blob|data):/i.test(nativePath)) return nativePath;
  const normalised = nativePath.replace(/\\/g, '/');
  const withLead = normalised.startsWith('/') ? normalised : `/${normalised}`;
  return `file://${encodeURI(withLead).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

/** Round to one decimal place — keeps slider/input values tidy. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Format seconds as `m:ss.s` (or `h:mm:ss.s` past an hour).
 * Examples: 7.3 → "0:07.3", 73.4 → "1:13.4", 3725 → "1:02:05.0".
 */
function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const tenths = Math.round(totalSeconds * 10) / 10;
  const h = Math.floor(tenths / 3600);
  const m = Math.floor((tenths % 3600) / 60);
  const s = tenths - h * 3600 - m * 60;
  const sStr = s.toFixed(1).padStart(4, '0'); // "07.3" or "13.4"
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${sStr}`;
  return `${m}:${sStr}`;
}

/**
 * Parse a timecode string back to seconds. Accepts:
 *   - bare seconds: "73.4" → 73.4
 *   - m:ss(.s): "1:13.4" → 73.4
 *   - h:mm:ss(.s): "1:02:05" → 3725
 * Returns the fallback for unparseable input.
 */
function parseTimecode(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const n = Number(parts[0]);
    return Number.isFinite(n) ? n : fallback;
  }
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return fallback;
  const [a = 0, b = 0, c = 0] = nums;
  if (nums.length === 2) return a * 60 + b;
  if (nums.length === 3) return a * 3600 + b * 60 + c;
  return fallback;
}

// ---------------------------------------------------------------------------
// Framing preview helpers
//
// The clip preview plays the raw 16:9 source letterboxed (object-contain). The
// final burn-in, though, is a 9:16 crop of that source with captions + a hook
// title overlaid. These helpers reconstruct an approximation of that framing so
// a user can trust a clip before committing to a multi-minute render.
// ---------------------------------------------------------------------------

/** A crop rectangle in source-video pixels. */
interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The target output aspect ratio (locked 9:16). */
const OUTPUT_ASPECT = 9 / 16;

/** Centre 9:16 crop of a source frame, in source pixels — the render fallback. */
function centerCropRect(sourceW: number, sourceH: number): PixelRect {
  let width = sourceH * OUTPUT_ASPECT;
  let height = sourceH;
  if (width > sourceW) {
    width = sourceW;
    height = sourceW / OUTPUT_ASPECT;
  }
  return { x: (sourceW - width) / 2, y: (sourceH - height) / 2, width, height };
}

/**
 * Resolve the crop rect active at `timeSec` (source-absolute seconds), matching
 * the render pipeline's precedence: `cropTimeline` (per-scene) → `cropRegion`
 * (static) → centre crop.
 */
function resolveCropRect(
  timeSec: number,
  sourceW: number,
  sourceH: number,
  cropRegion?: CropRegion,
  cropTimeline?: CropTimelineEntry[],
): PixelRect {
  if (cropTimeline && cropTimeline.length > 0) {
    const e =
      cropTimeline.find((c) => timeSec >= c.startTime && timeSec < c.endTime) ?? cropTimeline[0];
    if (e) return { x: e.x, y: e.y, width: e.width, height: e.height };
  }
  if (cropRegion) {
    return {
      x: cropRegion.x,
      y: cropRegion.y,
      width: cropRegion.width,
      height: cropRegion.height,
    };
  }
  return centerCropRect(sourceW, sourceH);
}

/**
 * Map a source-pixel crop rect to a box expressed in percentages of the 9:16
 * preview container, accounting for the object-contain letterboxing of the raw
 * source inside that container.
 */
function computeCropBox(
  sourceW: number,
  sourceH: number,
  crop: PixelRect,
): { left: number; top: number; width: number; height: number } {
  const sourceAspect = sourceW / sourceH;
  let vW: number;
  let vH: number;
  let vLeft: number;
  let vTop: number;
  if (sourceAspect >= OUTPUT_ASPECT) {
    // Wider than the container — letterboxed top/bottom (the 16:9 case).
    vW = 100;
    vH = (OUTPUT_ASPECT / sourceAspect) * 100;
    vLeft = 0;
    vTop = (100 - vH) / 2;
  } else {
    // Taller than the container — pillarboxed left/right.
    vH = 100;
    vW = (sourceAspect / OUTPUT_ASPECT) * 100;
    vTop = 0;
    vLeft = (100 - vW) / 2;
  }
  return {
    left: vLeft + (crop.x / sourceW) * vW,
    top: vTop + (crop.y / sourceH) * vH,
    width: (crop.width / sourceW) * vW,
    height: (crop.height / sourceH) * vH,
  };
}

/** First few transcript words, used as a representative caption mock. */
function captionSnippet(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean).slice(0, 3);
}

/**
 * Overlay drawn on top of the letterboxed video: a 9:16 crop framing box with
 * representative title and subtitle blocks. Both use the same percentage
 * center-anchor contract as the 1080×1920 libass render.
 */
function FramingOverlay({
  box,
  layout,
  hookText,
  captionWords,
  emphasize,
}: {
  box: { left: number; top: number; width: number; height: number };
  layout: TemplateLayout;
  hookText: string;
  captionWords: string[];
  emphasize: boolean;
}): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-[2px]"
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        // Dim everything outside the crop box so the 9:16 framing reads clearly.
        boxShadow: '0 0 0 9999px rgba(35,16,12,0.55)',
        outline: `1px solid ${BRAND_ACCENT}`,
      }}
    >
      {hookText.trim() && (
        <div
          className="absolute flex w-[92%] -translate-x-1/2 -translate-y-1/2 justify-center"
          style={{ left: `${layout.titleText.x}%`, top: `${layout.titleText.y}%` }}
        >
          <span
            className="max-w-full truncate rounded-full px-1.5 py-0.5 text-center text-[7px] font-bold leading-tight text-white shadow"
            style={{ backgroundColor: BRAND_ACCENT }}
          >
            {hookText}
          </span>
        </div>
      )}
      {captionWords.length > 0 && (
        <div
          className="absolute flex -translate-x-1/2 -translate-y-full flex-wrap items-center justify-center gap-x-1"
          style={{
            left: `${layout.subtitles.x}%`,
            top: `${layout.subtitles.y}%`,
            width: `${CAPTION_MAX_WIDTH_FRACTION * 100}%`,
          }}
        >
          {captionWords.map((word, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: Static caption mock words have no stable ids and never reorder.
              key={`${i}-${word}`}
              className="text-[9px] font-extrabold uppercase leading-none tracking-tight"
              style={{
                color: emphasize && i === captionWords.length - 1 ? BRAND_ACCENT : '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)',
              }}
            >
              {word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClipDetailProps {
  clip: DetailClip | null;
  source: SourceVideo | null;
  open: boolean;
  presentation?: 'sheet' | 'panel';
  position?: number;
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onDecision?: (status: ClipCandidate['status']) => void;
  onEditCommitted?: () => void;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClipDetail({
  clip,
  source,
  open,
  presentation = 'sheet',
  position,
  total,
  onPrevious,
  onNext,
  onDecision,
  onEditCommitted,
  onOpenChange,
}: ClipDetailProps): React.JSX.Element {
  const updateClipTrim = useStore((s) => s.updateClipTrim);
  const updateClipHookText = useStore((s) => s.updateClipHookText);
  const updateClipStatus = useStore((s) => s.updateClipStatus);
  const rescoreClip = useStore((s) => s.rescoreClip);
  const resetClipBoundaries = useStore((s) => s.resetClipBoundaries);
  const setClipOverride = useStore((s) => s.setClipOverride);
  const updateStitchedClipStatus = useStore((s) => s.updateStitchedClipStatus);
  const templateLayout = useStore((s) => s.settings.templateLayout);
  const autoZoom = useStore((s) => s.settings.autoZoom);
  const hookTitleOverlay = useStore((s) => s.settings.hookTitleOverlay);
  const rehookOverlay = useStore((s) => s.settings.rehookOverlay);
  const _geminiApiKey = useStore((s) => s.settings.geminiApiKey);
  const transcriptions = useStore((s) => s.transcriptions);
  const inspectorTab = useStore((s) => s.workspace.inspectorTab);
  const previewPlayheadByClip = useStore((s) => s.workspace.previewPlayheadByClip);
  const setWorkspaceInspectorTab = useStore((s) => s.setWorkspaceInspectorTab);
  const setWorkspacePlayhead = useStore((s) => s.setWorkspacePlayhead);
  const { inspectorWidth } = useDisplayPreferences();

  const stitched = clip !== null && isStitched(clip);
  const regularClip = clip !== null && !stitched ? (clip as ClipCandidate) : null;
  const stitchedClip = stitched ? (clip as StitchedClipCandidate) : null;
  const regularClipId = regularClip?.id ?? null;
  const stitchedClipId = stitchedClip?.id ?? null;
  const savedPlayhead = regularClipId ? previewPlayheadByClip[regularClipId] : undefined;
  const savedStitchedPlayhead = stitchedClipId ? previewPlayheadByClip[stitchedClipId] : undefined;

  // Source bounds for the trim slider — fall back to clip range if no source.
  const sourceMax = source?.duration ?? (regularClip ? regularClip.endTime : 0);

  // ---- Local working copies (committed to store on commit handlers) -------
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [startInput, setStartInput] = useState('0:00.0');
  const [endInput, setEndInput] = useState('0:00.0');
  const [hookText, setHookText] = useState('');
  const [rehookText, setRehookText] = useState('');
  const [rehookEnabled, setRehookEnabled] = useState(true);
  const [captionsMode, setCaptionsMode] = useState<CaptionsMode>(DEFAULT_CAPTIONS_MODE);

  // Sync local state whenever the active clip changes.
  useEffect(() => {
    if (!regularClip) return;
    const start = round1(regularClip.startTime);
    const end = round1(regularClip.endTime);
    setTrim([start, end]);
    setStartInput(formatTimecode(start));
    setEndInput(formatTimecode(end));
    setHookText(regularClip.hookText ?? '');
    setRehookText(regularClip.overrides?.rehookText ?? '');
    setRehookEnabled(regularClip.overrides?.enableRehook ?? true);
    // Captions mode is persisted as a per-clip render override. Fall back to
    // the PRESTYJ default the render path applies when the clip has no choice.
    setCaptionsMode(regularClip.overrides?.captionMode ?? DEFAULT_CAPTIONS_MODE);
  }, [regularClip]);

  // ---- Video preview ------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceOffline = source?.mediaStatus === 'offline';
  const sourceChecking = source?.mediaStatus === 'checking';
  const sourceUrl = useMemo(
    () => (source && !sourceOffline && !sourceChecking ? toFileUrl(source.path) : null),
    [source, sourceChecking, sourceOffline],
  );

  // Live source-absolute playhead for the active clip's instant layout guide.
  const [livePlayhead, setLivePlayhead] = useState<{ clipId: string | null; time: number }>({
    clipId: null,
    time: 0,
  });
  const [failedRenderedPreviewPath, setFailedRenderedPreviewPath] = useState<string | null>(null);

  const previewWords = useMemo(() => {
    if (!regularClip) return [];
    const words = regularClip.wordTimestamps ?? transcriptions[regularClip.sourceId]?.words ?? [];
    return words.filter((word) => word.end >= trim[0] && word.start <= trim[1]);
  }, [regularClip, transcriptions, trim]);
  const previewConfig = useMemo<RenderPreviewConfig | null>(() => {
    if (!regularClip || !source || sourceOffline || sourceChecking || trim[1] <= trim[0]) {
      return null;
    }
    const accentColor = regularClip.overrides?.accentColor ?? BRAND_ACCENT;
    return {
      sourceVideoPath: source.path,
      startTime: trim[0],
      endTime: trim[1],
      ...(regularClip.cropRegion
        ? {
            cropRegion: {
              x: regularClip.cropRegion.x,
              y: regularClip.cropRegion.y,
              width: regularClip.cropRegion.width,
              height: regularClip.cropRegion.height,
            },
          }
        : {}),
      ...(regularClip.cropTimeline ? { cropTimeline: regularClip.cropTimeline } : {}),
      wordTimestamps: previewWords,
      hookTitleText: hookText,
      rehookText: rehookText || undefined,
      captionsEnabled: regularClip.overrides?.enableCaptions ?? true,
      templateLayout,
      captionStyle: {
        ...PRESTYJ_CAPTION_STYLE,
        captionMode: captionsMode,
        accentColor,
        highlightColor: accentColor,
        emphasisColor: accentColor,
        supersizeColor: accentColor,
      },
      hookTitleOverlay: {
        ...hookTitleOverlay,
        enabled: regularClip.overrides?.enableHookTitle ?? hookTitleOverlay.enabled,
      },
      rehookOverlay: {
        ...rehookOverlay,
        enabled: rehookOverlay.enabled && rehookEnabled,
      },
      autoZoom: {
        ...autoZoom,
        enabled: regularClip.overrides?.enableAutoZoom ?? autoZoom.enabled,
      },
      accentColor,
    };
  }, [
    autoZoom,
    captionsMode,
    hookText,
    hookTitleOverlay,
    previewWords,
    regularClip,
    rehookEnabled,
    rehookOverlay,
    rehookText,
    source,
    sourceChecking,
    sourceOffline,
    templateLayout,
    trim,
  ]);
  const { state: renderedPreview, retry: retryRenderedPreview } = useRenderedPreview({
    clipId: regularClipId,
    config: previewConfig,
    enabled: Boolean(sourceUrl && (open || presentation === 'panel')),
  });
  const renderedPreviewPlaybackFailed =
    renderedPreview.status === 'ready' && failedRenderedPreviewPath === renderedPreview.previewPath;
  const showingRenderedPreview =
    renderedPreview.status === 'ready' && !renderedPreviewPlaybackFailed;
  const renderedPreviewForStatus: RenderedPreviewState = renderedPreviewPlaybackFailed
    ? {
        status: 'failed',
        previewPath: null,
        cached: false,
        error: 'The rendered preview could not be played',
      }
    : renderedPreview;
  const previewPlayerUrl =
    showingRenderedPreview && renderedPreview.status === 'ready'
      ? toFileUrl(renderedPreview.previewPath)
      : sourceUrl;
  const previewSelectionStart = showingRenderedPreview ? 0 : trim[0];
  const previewSelectionEnd = showingRenderedPreview ? Math.max(0.001, trim[1] - trim[0]) : trim[1];
  const sourcePlayheadForPreview =
    livePlayhead.clipId === regularClipId ? livePlayhead.time : (savedPlayhead ?? trim[0]);
  const previewInitialTime = showingRenderedPreview
    ? Math.max(0, sourcePlayheadForPreview - trim[0])
    : sourcePlayheadForPreview;

  useEffect(() => {
    if (presentation === 'sheet' && !open && regularClipId) {
      clearRenderedPreviewCache(regularClipId);
    }
  }, [open, presentation, regularClipId]);

  useEffect(() => {
    if (!regularClipId) return;
    return () => clearRenderedPreviewCache(regularClipId);
  }, [regularClipId]);

  const lastPersistedPlayheadRef = useRef(0);

  const handleRegularPreviewTime = (time: number): void => {
    if (!regularClipId) return;
    const sourceTime = showingRenderedPreview ? trim[0] + time : time;
    setLivePlayhead({ clipId: regularClipId, time: sourceTime });
    if (Math.abs(sourceTime - lastPersistedPlayheadRef.current) >= 0.5) {
      lastPersistedPlayheadRef.current = sourceTime;
      setWorkspacePlayhead(regularClipId, sourceTime);
    }
  };

  // Whether we have usable source pixel dimensions to derive crop framing.
  const hasSourceDims = !!source && source.width > 0 && source.height > 0;

  // Crop framing box (percentages of the preview container) for a regular clip.
  const regularCropBox = useMemo(() => {
    if (!regularClip || !source || !hasSourceDims) return null;
    const activePlayhead = livePlayhead.clipId === regularClip.id ? livePlayhead.time : trim[0];
    const crop = resolveCropRect(
      activePlayhead,
      source.width,
      source.height,
      regularClip.cropRegion,
      regularClip.cropTimeline,
    );
    return computeCropBox(source.width, source.height, crop);
  }, [regularClip, source, hasSourceDims, livePlayhead, trim]);

  // ---- Stitched preview (sequential range playback) -----------------------
  // A stitched clip is composed of N non-contiguous source ranges. We play them
  // back-to-back from one source <video>: seek to range[0].start, and on each
  // range end advance to the next range's start, so the user can judge content.
  const stitchedVideoRef = useRef<HTMLVideoElement | null>(null);
  const [stitchedRangeIdx, setStitchedRangeIdx] = useState(0);
  const stitchedRanges = stitchedClip?.sourceRanges ?? [];
  const stitchedRangesRef = useRef(stitchedRanges);
  const stitchedIdxRef = useRef(0);

  // Persist the exact media position before a Sheet/panel recomposition swaps
  // the underlying video element. The ClipDetail component itself stays mounted,
  // so local trim and hook edits remain intact while the player remounts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: presentation intentionally triggers cleanup before a Sheet/panel swap.
  useLayoutEffect(() => {
    // Capture the mounted players so cleanup can read them before the responsive
    // wrapper swaps and React points the refs at replacement elements.
    const regularPlayer = videoRef.current;
    const stitchedPlayer = stitchedVideoRef.current;
    return () => {
      if (regularPlayer && regularClipId) {
        const sourceTime = showingRenderedPreview
          ? trim[0] + regularPlayer.currentTime
          : regularPlayer.currentTime;
        setWorkspacePlayhead(regularClipId, sourceTime);
      }
      if (stitchedPlayer && stitchedClipId) {
        setWorkspacePlayhead(stitchedClipId, stitchedPlayer.currentTime);
      }
    };
  }, [
    presentation,
    regularClipId,
    setWorkspacePlayhead,
    showingRenderedPreview,
    stitchedClipId,
    trim,
  ]);
  useEffect(() => {
    stitchedRangesRef.current = stitchedRanges;
  }, [stitchedRanges]);
  useEffect(() => {
    stitchedIdxRef.current = stitchedRangeIdx;
  }, [stitchedRangeIdx]);

  // Restore the exact range and source-time playhead when the stitched clip loads.
  useEffect(() => {
    const v = stitchedVideoRef.current;
    if (!v || !stitchedClipId || stitchedRanges.length === 0) return;
    const restoredIndex =
      savedStitchedPlayhead === undefined
        ? -1
        : stitchedRanges.findIndex(
            (range) =>
              savedStitchedPlayhead >= range.startTime && savedStitchedPlayhead < range.endTime,
          );
    const targetIndex = restoredIndex >= 0 ? restoredIndex : 0;
    const targetRange = stitchedRanges[targetIndex];
    if (!targetRange) return;
    const targetTime =
      restoredIndex >= 0 ? (savedStitchedPlayhead ?? targetRange.startTime) : targetRange.startTime;
    stitchedIdxRef.current = targetIndex;
    setStitchedRangeIdx(targetIndex);
    const seek = (): void => {
      try {
        v.currentTime = targetTime;
      } catch {
        /* metadata not ready — loadedmetadata will retry */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [stitchedClipId, savedStitchedPlayhead, stitchedRanges]);

  const lastPersistedStitchedPlayheadRef = useRef(0);

  // Advance through ranges in sequence and persist the stitched preview playhead.
  // sourceUrl intentionally rebinds listeners when a relink mounts the video element.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The ref target changes when sourceUrl mounts/unmounts the video.
  useEffect(() => {
    const v = stitchedVideoRef.current;
    if (!v || !stitchedClipId) return;
    const persistExactPlayhead = (): void => {
      if (!stitchedClipId) return;
      lastPersistedStitchedPlayheadRef.current = v.currentTime;
      setWorkspacePlayhead(stitchedClipId, v.currentTime);
    };
    const persistPlayhead = (): void => {
      if (Math.abs(v.currentTime - lastPersistedStitchedPlayheadRef.current) < 0.5) return;
      persistExactPlayhead();
    };
    const onPlay = (): void => {
      const ranges = stitchedRangesRef.current;
      const range = ranges[stitchedIdxRef.current] ?? ranges[0];
      if (!range) return;
      // Restart the current range if playback is outside its source window.
      if (v.currentTime < range.startTime - 0.05 || v.currentTime >= range.endTime) {
        try {
          v.currentTime = range.startTime;
        } catch {
          /* noop */
        }
      }
    };
    const onTimeUpdate = (): void => {
      persistPlayhead();
      const ranges = stitchedRangesRef.current;
      if (ranges.length === 0) return;
      const index = stitchedIdxRef.current;
      const range = ranges[index];
      if (!range || v.currentTime < range.endTime - 0.02) return;

      const nextIndex = index + 1;
      const nextRange = ranges[nextIndex];
      if (nextRange) {
        stitchedIdxRef.current = nextIndex;
        setStitchedRangeIdx(nextIndex);
        try {
          v.currentTime = nextRange.startTime;
        } catch {
          /* noop */
        }
        return;
      }

      // Last range done — pause and rewind to the beginning for replay/resume.
      v.pause();
      stitchedIdxRef.current = 0;
      setStitchedRangeIdx(0);
      const first = ranges[0];
      if (first) {
        try {
          v.currentTime = first.startTime;
          setWorkspacePlayhead(stitchedClipId, first.startTime);
        } catch {
          /* noop */
        }
      }
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('pause', persistExactPlayhead);
    v.addEventListener('seeked', persistExactPlayhead);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('pause', persistExactPlayhead);
      v.removeEventListener('seeked', persistExactPlayhead);
    };
  }, [sourceUrl, stitchedClipId, setWorkspacePlayhead]);

  // Crop framing box for the stitched preview — per-range rect when available,
  // else the clip's fallback cropRegion, else centre crop.
  const stitchedCropBox = useMemo(() => {
    if (!stitchedClip || !source || !hasSourceDims) return null;
    const rangeRect = stitchedClip.rangeCropRects?.[stitchedRangeIdx];
    const crop: PixelRect = rangeRect
      ? rangeRect
      : stitchedClip.cropRegion
        ? {
            x: stitchedClip.cropRegion.x,
            y: stitchedClip.cropRegion.y,
            width: stitchedClip.cropRegion.width,
            height: stitchedClip.cropRegion.height,
          }
        : centerCropRect(source.width, source.height);
    return computeCropBox(source.width, source.height, crop);
  }, [stitchedClip, source, hasSourceDims, stitchedRangeIdx]);

  // ---- Commit helpers -----------------------------------------------------
  const commitTrim = (next: [number, number]): void => {
    if (!regularClip) return;
    const [start, end] = next;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (end <= start) return;
    if (start === regularClip.startTime && end === regularClip.endTime) return;
    updateClipTrim(regularClip.sourceId, regularClip.id, start, end);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-edit-${regularClip.id}`,
      message: 'Trim updated',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  const handleResetTrim = (): void => {
    if (!regularClip) return;
    const autoStart = round1(regularClip.aiStartTime ?? regularClip.startTime);
    const autoEnd = round1(regularClip.aiEndTime ?? regularClip.endTime);
    if (trim[0] === autoStart && trim[1] === autoEnd) return;
    setTrim([autoStart, autoEnd]);
    setStartInput(formatTimecode(autoStart));
    setEndInput(formatTimecode(autoEnd));
    resetClipBoundaries(regularClip.sourceId, regularClip.id);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-edit-${regularClip.id}`,
      message: 'Trim reset to the AI-selected range',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  const commitHookText = (next: string): void => {
    if (!regularClip) return;
    if (next === regularClip.hookText) return;
    updateClipHookText(regularClip.sourceId, regularClip.id, next);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-edit-${regularClip.id}`,
      message: 'Hook updated',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  const _applyHookText = (next: string): void => {
    setHookText(next);
    commitHookText(next);
  };

  const _applyFreshScore = (reading: ClipScoreReading): void => {
    if (!regularClip) return;
    rescoreClip(
      regularClip.sourceId,
      regularClip.id,
      reading.score,
      reading.reasoning,
      reading.hookText || undefined,
    );
    if (reading.hookText) setHookText(reading.hookText);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-rescore-${regularClip.id}`,
      message: 'Fresh score, note, and hook applied',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  const commitRehookText = (next: string): void => {
    if (!regularClip) return;
    if ((regularClip.overrides?.rehookText ?? '') === next) return;
    setClipOverride(regularClip.sourceId, regularClip.id, 'rehookText', next);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-rehook-${regularClip.id}`,
      message: next.trim() ? 'Re-hook updated' : 'Automatic re-hook restored',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  const _handleRehookEnabledChange = (enabled: boolean): void => {
    setRehookEnabled(enabled);
    if (!regularClip || (regularClip.overrides?.enableRehook ?? true) === enabled) return;
    setClipOverride(regularClip.sourceId, regularClip.id, 'enableRehook', enabled);
    onEditCommitted?.();
    showUndoFeedback({
      id: `clip-rehook-${regularClip.id}`,
      message: enabled ? 'Re-hook enabled for this clip' : 'Re-hook disabled for this clip',
      scope: { sourceId: regularClip.sourceId, clipId: regularClip.id },
    });
  };

  // Persist the chosen caption mode onto the clip as a render override so the
  // render pipeline (captions.feature.ts) burns the selected mode. Stored even
  // when it equals the default, so the choice survives a default change later.
  const handleCaptionsModeChange = (next: CaptionsMode): void => {
    setCaptionsMode(next);
    if (!regularClip) return;
    if (regularClip.overrides?.captionMode === next) return;
    setClipOverride(regularClip.sourceId, regularClip.id, 'captionMode', next);
    onEditCommitted?.();
  };

  // ---- Review decisions --------------------------------------------------
  const handleDecision = (status: ClipCandidate['status']): void => {
    if (!clip || clip.status === status) return;
    if (regularClip) {
      // Flush in-flight edits before changing review state.
      commitTrim(trim);
      commitHookText(hookText);
      commitRehookText(rehookText);
    }
    if (onDecision) {
      onDecision(status);
      return;
    }
    if (stitched) updateStitchedClipStatus(clip.sourceId, clip.id, status);
    else updateClipStatus(clip.sourceId, clip.id, status);
    showUndoFeedback({
      id: 'review-decision',
      message:
        status === 'approved'
          ? 'Clip approved'
          : status === 'rejected'
            ? 'Clip rejected'
            : 'Clip returned to unreviewed',
      scope: 'global',
    });
  };

  // ---- Render -------------------------------------------------------------
  const duration = clip
    ? stitched
      ? (clip as StitchedClipCandidate).duration
      : Math.max(0, trim[1] - trim[0])
    : 0;

  const inspectorHeadingId = `clip-inspector-heading-${clip?.id ?? 'empty'}`;
  const inspectorSummary = clip
    ? `${regularClip?.scoreSource === 'manual' ? 'Not scored' : `Score ${Math.round(clip.score)}`} · ${duration.toFixed(1)}s`
    : 'No clip selected.';
  const inspectorContent = (
    <>
      {/* Header --------------------------------------------------------- */}
      <header className="shrink-0 border-b border-border p-4">
        <div
          className={cn(
            'flex gap-3',
            presentation === 'sheet' ? 'flex-col' : 'items-start justify-between',
          )}
        >
          <div className="min-w-0 flex-1">
            {presentation === 'sheet' ? (
              <SheetTitle className="line-clamp-3 pr-8 text-left">
                {clip?.hookText || 'Clip details'}
              </SheetTitle>
            ) : (
              <h2 id={inspectorHeadingId} className="line-clamp-2 text-lg font-semibold">
                {clip?.hookText || 'Clip inspector'}
              </h2>
            )}
            {presentation === 'sheet' ? (
              <SheetDescription className="mt-1 text-left">{inspectorSummary}</SheetDescription>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{inspectorSummary}</p>
            )}
          </div>
          {clip && (
            <div
              className={cn(
                'flex shrink-0 items-center gap-1',
                presentation === 'sheet' && 'self-end',
              )}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onPrevious}
                disabled={!onPrevious}
                aria-label="Previous clip"
                aria-keyshortcuts="ArrowLeft J"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span
                className="min-w-14 text-center text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {position && total ? `${position} of ${total}` : 'Outside filter'}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next clip"
                aria-keyshortcuts="ArrowRight K"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        {clip && (
          <HistoryControls
            scope={{ sourceId: clip.sourceId, clipId: clip.id }}
            compact
            className="mt-2"
          />
        )}
      </header>

      <Tabs
        value={inspectorTab}
        onValueChange={(value) => setWorkspaceInspectorTab(value as 'edit' | 'transcript')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-3 grid shrink-0 grid-cols-2" aria-label="Inspector view">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>

        {/* Scrollable body ----------------------------------------------- */}
        <TabsContent value="edit" className="mt-0 min-h-0 flex-1 overflow-y-auto">
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
                <p className="text-foreground text-sm font-medium">No clip selected</p>
                <p className="text-muted-foreground text-xs">
                  Pick a clip from the grid to edit it here.
                </p>
              </Card>
            </div>
          )}

          {stitchedClip && (
            <>
              {/* Sequential range preview ----------------------------------- */}
              <div className="bg-black">
                <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px]">
                  {sourceUrl ? (
                    <>
                      {/* biome-ignore lint/a11y/useMediaCaption: The adjacent Transcript tab provides the saved transcript for this discontinuous source-range preview. */}
                      <video
                        ref={stitchedVideoRef}
                        data-review-player="true"
                        src={sourceUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-contain"
                      />
                      {stitchedCropBox && (
                        <FramingOverlay
                          box={stitchedCropBox}
                          layout={templateLayout}
                          hookText={stitchedClip.hookText}
                          captionWords={captionSnippet(stitchedClip.text)}
                          emphasize={
                            (stitchedClip.overrides?.captionMode ?? DEFAULT_CAPTIONS_MODE) !==
                            'standard'
                          }
                        />
                      )}
                      {stitchedRanges.length > 1 && (
                        <span className="absolute right-1.5 top-1.5 z-20 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-foreground">
                          Range {stitchedRangeIdx + 1}/{stitchedRanges.length}
                        </span>
                      )}
                    </>
                  ) : sourceOffline || sourceChecking ? (
                    <OfflineMediaPlaceholder
                      fileName={source?.name ?? 'Source media'}
                      status={sourceChecking ? 'checking' : 'offline'}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No source video
                    </div>
                  )}
                </div>
                <p className="px-4 pb-2 text-center text-[10px] leading-tight text-muted-foreground">
                  Plays each source range in sequence with an approximate 9:16 layout guide. Final
                  burn-in may vary slightly.
                </p>
              </div>
              <div className="flex flex-col gap-6 p-4">
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Combine className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <Label className="text-sm font-medium">Stitched clip</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Range editing isn’t supported yet. Approve to render or reject.
                  </p>
                </section>

                <Separator />
                <DirectorsNote
                  score={stitchedClip.score}
                  originalScore={stitchedClip.originalScore}
                  reasoning={stitchedClip.reasoning}
                />

                <Separator />

                <section className="flex flex-col gap-2">
                  <Label className="text-sm font-medium">
                    Source ranges ({stitchedClip.sourceRanges.length})
                  </Label>
                  <ul className="flex flex-col gap-2">
                    {stitchedClip.sourceRanges.map((r, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: Persisted source ranges are immutable and have no ids.
                        key={`${r.startTime}-${r.endTime}-${i}`}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs tabular-nums',
                          i === stitchedRangeIdx
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-muted/40',
                        )}
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
            </>
          )}

          {regularClip && (
            <>
              {/* Real rendered preview with an immediate layout-guide fallback. */}
              <div className="bg-black">
                {previewPlayerUrl ? (
                  <>
                    <EditorialPlayer
                      src={previewPlayerUrl}
                      label={`Preview of ${regularClip.hookText || 'selected clip'}`}
                      selectionStart={previewSelectionStart}
                      selectionEnd={previewSelectionEnd}
                      initialTime={previewInitialTime}
                      videoRef={videoRef}
                      layout="responsive"
                      onTimeChange={handleRegularPreviewTime}
                      onMediaError={
                        renderedPreview.status === 'ready'
                          ? () => setFailedRenderedPreviewPath(renderedPreview.previewPath)
                          : undefined
                      }
                    >
                      {!showingRenderedPreview && regularCropBox && (
                        <FramingOverlay
                          box={regularCropBox}
                          layout={templateLayout}
                          hookText={hookText}
                          captionWords={captionSnippet(regularClip.text)}
                          emphasize={captionsMode !== 'standard'}
                        />
                      )}
                    </EditorialPlayer>
                    <RenderedPreviewStatus
                      state={renderedPreviewForStatus}
                      onRetry={retryRenderedPreview}
                    />
                    <p className="px-4 pb-2 text-center text-[10px] leading-tight text-white/55">
                      {showingRenderedPreview
                        ? 'Low-quality render for editorial review. Final export can include additional enabled effects.'
                        : renderedPreviewForStatus.status === 'failed'
                          ? 'Live layout guide shown after the rendered preview failed.'
                          : 'Live layout guide shown immediately while the rendered preview is prepared.'}
                    </p>
                  </>
                ) : sourceOffline || sourceChecking ? (
                  <div className="mx-auto aspect-[9/16] w-full max-w-[260px]">
                    <OfflineMediaPlaceholder
                      fileName={source?.name ?? 'Source media'}
                      status={sourceChecking ? 'checking' : 'offline'}
                    />
                  </div>
                ) : (
                  <div className="mx-auto flex aspect-[9/16] w-full max-w-[260px] items-center justify-center text-xs text-white/65">
                    No source video
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6 p-4">
                <DirectorsNote
                  score={regularClip.score}
                  originalScore={regularClip.originalScore}
                  loopScore={regularClip.loopScore}
                  reasoning={regularClip.reasoning}
                  scoreSource={regularClip.scoreSource}
                />

                <Separator />

                {/* Section 1: Trim */}
                <section className="flex flex-col gap-3" aria-labelledby="trim-heading">
                  <div className="flex items-baseline justify-between">
                    <h3 id="trim-heading" className="text-sm font-medium">
                      Trim
                    </h3>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {duration.toFixed(1)}s
                    </span>
                  </div>

                  {source && (
                    <WaveformTrim
                      sourcePath={source.path}
                      sourceDuration={Math.max(sourceMax, trim[1])}
                      value={trim}
                      step={TRIM_SLIDER_STEP}
                      words={previewWords}
                      fillerSegments={regularClip.fillerSegments}
                      autoRange={[
                        regularClip.aiStartTime ?? regularClip.startTime,
                        regularClip.aiEndTime ?? regularClip.endTime,
                      ]}
                      onValueChange={(next) => {
                        const start = round1(next[0]);
                        const end = round1(next[1]);
                        setTrim([start, end]);
                        setStartInput(formatTimecode(start));
                        setEndInput(formatTimecode(end));
                      }}
                      onValueCommit={(next) => {
                        commitTrim([round1(next[0]), round1(next[1])]);
                      }}
                      onResetAuto={handleResetTrim}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="trim-start" className="text-xs text-muted-foreground">
                        Start
                      </Label>
                      <Input
                        id="trim-start"
                        type="text"
                        inputMode="numeric"
                        value={startInput}
                        placeholder="0:00.0"
                        onChange={(e) => {
                          setStartInput(e.target.value);
                          const parsed = parseTimecode(e.target.value, trim[0]);
                          setTrim(([, end]) => [round1(parsed), end]);
                        }}
                        onBlur={() => {
                          const parsed = parseTimecode(startInput, trim[0]);
                          const start = Math.max(0, Math.min(parsed, trim[1] - TRIM_SLIDER_STEP));
                          const tidy: [number, number] = [round1(start), trim[1]];
                          setTrim(tidy);
                          setStartInput(formatTimecode(tidy[0]));
                          commitTrim(tidy);
                        }}
                        className="tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="trim-end" className="text-xs text-muted-foreground">
                        End
                      </Label>
                      <Input
                        id="trim-end"
                        type="text"
                        inputMode="numeric"
                        value={endInput}
                        placeholder="0:00.0"
                        onChange={(e) => {
                          setEndInput(e.target.value);
                          const parsed = parseTimecode(e.target.value, trim[1]);
                          setTrim(([start]) => [start, round1(parsed)]);
                        }}
                        onBlur={() => {
                          const parsed = parseTimecode(endInput, trim[1]);
                          const end = Math.max(
                            trim[0] + TRIM_SLIDER_STEP,
                            Math.min(parsed, sourceMax || parsed),
                          );
                          const tidy: [number, number] = [trim[0], round1(end)];
                          setTrim(tidy);
                          setEndInput(formatTimecode(tidy[1]));
                          commitTrim(tidy);
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
                          : 'text-muted-foreground',
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
                    onValueChange={(v) => handleCaptionsModeChange(v as CaptionsMode)}
                  >
                    <SelectTrigger id="captions-mode">
                      <SelectValue placeholder="Select captions mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{CAPTIONS_MODE_LABELS.standard}</SelectItem>
                      <SelectItem value="emphasis">{CAPTIONS_MODE_LABELS.emphasis}</SelectItem>
                      <SelectItem value="emphasis_highlight">
                        {CAPTIONS_MODE_LABELS.emphasis_highlight}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <Separator />

                {/* Section 4 — Brand accent (preview, not editable) ---------- */}
                <section className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <Label>Brand accent</Label>
                    <span className="text-xs text-muted-foreground">Preview</span>
                  </div>
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
                      <TooltipContent>
                        Fixed brand accent applied to every clip — not editable.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-xs text-muted-foreground">
                    Applied to every clip. Not editable in this version.
                  </p>
                </section>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="transcript" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
          {clip ? (
            <section aria-labelledby="clip-transcript-heading">
              <h3 id="clip-transcript-heading" className="text-sm font-semibold">
                Clip transcript
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {clip.text || 'No transcript text is available for this clip.'}
              </p>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Select a clip to view its transcript.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer --------------------------------------------------------- */}
      <footer className="flex shrink-0 flex-nowrap justify-end gap-2 border-t border-border p-4">
        <Button
          type="button"
          size="sm"
          variant={clip?.status === 'pending' ? 'outline' : 'ghost'}
          onClick={() => handleDecision('pending')}
          disabled={!clip || clip.status === 'pending'}
        >
          <CircleDashed aria-hidden="true" />
          Unreviewed
        </Button>
        <Button
          type="button"
          size="sm"
          variant={clip?.status === 'rejected' ? 'destructive' : 'secondary'}
          onClick={() => handleDecision('rejected')}
          disabled={!clip || clip.status === 'rejected'}
          aria-keyshortcuts="X"
        >
          <X aria-hidden="true" />
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => handleDecision('approved')}
          disabled={!clip || clip.status === 'approved'}
          aria-keyshortcuts="A"
        >
          <Check aria-hidden="true" />
          Approve
        </Button>
      </footer>
    </>
  );

  if (presentation === 'panel') {
    return (
      <aside
        data-review-inspector="true"
        data-history-scope="clip"
        data-state={clip ? 'open' : 'closed'}
        data-source-id={clip?.sourceId}
        data-clip-id={clip?.id}
        className="flex min-h-0 w-full flex-col overflow-hidden border-l border-border bg-background"
        aria-labelledby={inspectorHeadingId}
      >
        {inspectorContent}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-review-inspector="true"
        data-history-scope="clip"
        data-source-id={clip?.sourceId}
        data-clip-id={clip?.id}
        className="flex w-full max-w-none flex-col gap-0 overflow-hidden p-0"
        style={{ width: `min(100vw, ${inspectorWidthPixels(inspectorWidth)}px)` }}
      >
        {inspectorContent}
      </SheetContent>
    </Sheet>
  );
}
