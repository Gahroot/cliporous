/**
 * Segment Layout Filter Builders
 *
 * Creates FFmpeg filter_complex strings for each archetype's per-segment
 * visual layout. Archetypes are self-contained — there are no style
 * variants underneath them.
 *
 * Layouts:
 *   - talking-head      — face-centered 9:16 crop
 *   - tight-punch       — 1.15× speaker zoom
 *   - wide-breather     — 0.9× speaker over blurred bg
 *   - quote-lower       — same as talking-head (captions hero)
 *   - split-image       — b-roll video on top half + speaker on bottom half
 *                          (explainer scenes may pick another stage layout via
 *                          `explainerLayout`: stack-flipped / takeover / pip / over)
 *   - fullscreen-image  — b-roll video fills the frame
 *   - fullscreen-quote  — solid sand BRAND_FG color source (captions hero,
 *                          dark-brown serif italic captions on top)
 *
 * All layouts produce a `[outv]` output label with pixel format yuv420p
 * and SAR 1:1, ready for encoding.
 */

import type { Archetype } from '@shared/types';
import { BRAND_FG } from '../edit-styles/shared/brand';
import type { ExplainerLayout } from '../remotion/compositions/explainer/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SegmentLayoutParams {
  width: number; // 1080
  height: number; // 1920
  segmentDuration: number;
  /** Output framerate — used to lock media inputs to the video's rate so
   *  vstack/overlay don't drop frames from the slower stream. */
  fps?: number;
  /** Path to the contextual media (b-roll mp4) for split-image /
   *  fullscreen-image layouts. The encoder wires this as the second -i
   *  input, so layouts read from `[1:v]`. */
  mediaPath?: string;
  /** Source video width (for crop calculations). */
  sourceWidth?: number;
  /** Source video height (for crop calculations). */
  sourceHeight?: number;
  /** Face-detection crop rect (x, y, width, height on source). */
  cropRect?: { x: number; y: number; width: number; height: number };
  /**
   * split-image only: where the explainer stage (`mediaPath`, input 1) sits
   * relative to the speaker. `undefined` / `'stack'` is the classic split
   * (stage top, speaker bottom) and emits the historical filter graph
   * unchanged. `'over'` expects a transparent (alpha) stage.
   */
  explainerLayout?: ExplainerLayout;
  /**
   * Zoom filter chain (from `zoom-filters.ts`, sized width×height) applied to
   * the full-frame speaker BEFORE the stage is composited. Only consumed by
   * the `'over'` explainer layout, so the zoom never scales the overlay card.
   */
  speakerZoomFilter?: string;
}

export interface SegmentLayoutResult {
  /** Complete FFmpeg filter_complex string with output label [outv]. */
  filterComplex: string;
  /**
   * Number of -i inputs the caller must supply:
   *   0 = generated color source (no -i needed)
   *   1 = source video only
   *   2 = source video + b-roll video
   */
  inputCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensures pixel dimensions are even (required by most video codecs). */
function roundEven(n: number): number {
  const v = Math.round(n);
  return v % 2 === 0 ? v : v - 1;
}

/** Convert CSS hex (#RRGGBB or #RGB) to FFmpeg color format (0xRRGGBB). */
function hexToFFmpeg(hex: string): string {
  let clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  return `0x${clean}`;
}

/** Standard finalization: SAR 1:1 + yuv420p pixel format. */
function finalize(label: string): string {
  return `[${label}]setsar=1,format=yuv420p[outv]`;
}

/**
 * High-quality scaling flags. Lanczos with accurate rounding + full-chroma
 * interpolation matches the base-render path and is materially sharper than
 * FFmpeg's default bilinear, especially on faces and high-frequency detail
 * like text-in-frame.
 */
const SCALE_FLAGS = 'lanczos+accurate_rnd+full_chroma_int';

/**
 * Builds the crop+scale chain for the speaker video.
 * If cropRect is provided (from face detection), crops to that region first.
 */
function buildSpeakerCropScale(
  params: SegmentLayoutParams,
  targetW: number,
  targetH: number,
  scaleFactor: number = 1.0,
  /** Vertical anchor (0 = top, 1 = bottom) of the aspect sub-crop. Centered
   *  (and emitted without offsets) when omitted. */
  anchorY?: number,
): string {
  const srcW = params.sourceWidth ?? targetW;
  const srcH = params.sourceHeight ?? targetH;
  const crop = params.cropRect;

  const parts: string[] = [];

  // Step 1 — Apply face-detection crop if available.
  if (crop) {
    parts.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }

  // Step 2 — Aspect-correct sub-crop. After step 1 the available frame may
  // have any aspect ratio (face boxes are not 9:16); cropping it to the
  // target's aspect first prevents the next scale from stretching pixels.
  const availW = crop?.width ?? srcW;
  const availH = crop?.height ?? srcH;
  const targetAspect = targetW / targetH;
  const availAspect = availW / availH;

  if (Math.abs(availAspect - targetAspect) > 0.01) {
    let cw: number, ch: number;
    if (availAspect > targetAspect) {
      ch = availH;
      cw = roundEven(Math.round(availH * targetAspect));
    } else {
      cw = availW;
      ch = roundEven(Math.round(availW / targetAspect));
    }
    if (anchorY === undefined) {
      parts.push(`crop=${cw}:${ch}`);
    } else {
      const cx = Math.max(0, Math.round((availW - cw) / 2));
      const cy = Math.max(0, Math.round((availH - ch) * Math.max(0, Math.min(1, anchorY))));
      parts.push(`crop=${cw}:${ch}:${cx}:${cy}`);
    }
  }

  // Step 3 — Scale to the target box. After step 2 the aspect already
  // matches, so this is a uniform resize (no distortion).
  if (scaleFactor > 1.0) {
    // Tight-punch path: oversize, then center-crop back to target.
    const scaledW = roundEven(Math.round(targetW * scaleFactor));
    const scaledH = roundEven(Math.round(targetH * scaleFactor));
    parts.push(`scale=${scaledW}:${scaledH}:flags=${SCALE_FLAGS}`);
    const cropX = Math.max(0, Math.round((scaledW - targetW) / 2));
    const cropY = Math.max(0, Math.round((scaledH - targetH) / 2));
    parts.push(`crop=${targetW}:${targetH}:${cropX}:${cropY}`);
  } else {
    parts.push(`scale=${targetW}:${targetH}:flags=${SCALE_FLAGS}`);
  }

  return parts.join(',');
}

// ---------------------------------------------------------------------------
// Layout builders (one per archetype)
// ---------------------------------------------------------------------------

/** talking-head: face-centered 9:16 crop. Also used by quote-lower. */
function buildTalkingHead(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const chain = buildSpeakerCropScale(params, w, h, 1.0);
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`;
  return { filterComplex: fc, inputCount: 1 };
}

/** tight-punch: 1.15× scale (closer on the face) then crop to frame. */
function buildTightPunch(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const chain = buildSpeakerCropScale(params, w, h, 1.15);
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`;
  return { filterComplex: fc, inputCount: 1 };
}

/**
 * wide-breather: 1.0× framing — the pulled-back counterpart to tight-punch's
 * 1.15× zoom-in. Visually identical to talking-head; the difference is the
 * pacing role (relief beat) and the crossfade transition-in.
 */
function buildWideBreather(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const chain = buildSpeakerCropScale(params, w, h, 1.0);
  const fc = `[0:v]${chain}[scaled];${finalize('scaled')}`;
  return { filterComplex: fc, inputCount: 1 };
}

/**
 * split-image: contextual b-roll video fills the top half, speaker fills the
 * bottom half. Input 0: speaker (source video), Input 1: b-roll video.
 *
 * Both streams have native framerates, so we normalize them to the output
 * fps (`fps=FPS`) and SAR before vstacking. Two non-obvious bits:
 *
 *   1. The b-roll input is `-stream_loop -1`'d at the encoder so it can
 *      cover any segment length. Each loop restarts the demuxer's PTS at
 *      zero — `fps=` is a rate converter that expects monotonically
 *      increasing PTS, so on every loop boundary it stalls and either
 *      duplicates the last frame indefinitely or discards "old" frames.
 *      `setpts=N/FR/TB` rewrites every frame's PTS from its index, making
 *      the stream monotonic across loop joins.
 *
 *   2. No `shortest=1` on vstack. Both inputs are duration-clamped by the
 *      output `-t` at the encoder; `shortest=1` plus the b-roll's looped
 *      PTS rewind made vstack EOF early, which made the encoder hold the
 *      last decoded frame as a still while the output `-t` continued to
 *      drain audio — the "two stills, audio keeps playing" freeze on
 *      split-image segments.
 */
function buildSplitImage(params: SegmentLayoutParams): SegmentLayoutResult {
  switch (params.explainerLayout) {
    case 'stack-flipped':
      return buildStageStackFlipped(params);
    case 'takeover':
      return buildStageTakeover(params);
    case 'pip':
      return buildStagePip(params);
    case 'over':
      return buildStageOver(params);
    default:
      break;
  }
  const w = params.width;
  const h = params.height;
  const fps = params.fps ?? 30;
  const halfH = roundEven(h / 2);

  const speakerChain = buildSpeakerCropScale(params, w, halfH, 1.0);

  const parts: string[] = [
    `[1:v]scale=${w}:${halfH}:force_original_aspect_ratio=increase:flags=${SCALE_FLAGS},crop=${w}:${halfH},setpts=N/FR/TB,fps=${fps},setsar=1[top]`,
    `[0:v]${speakerChain},setpts=N/FR/TB,fps=${fps},setsar=1[bottom]`,
    `[top][bottom]vstack=inputs=2[composed]`,
    finalize('composed'),
  ];

  return { filterComplex: parts.join(';'), inputCount: 2 };
}

// ---------------------------------------------------------------------------
// Explainer stage layouts (split-image + `explainerLayout`)
// ---------------------------------------------------------------------------
//
// Input 0 is always the source video (audio is mapped from it at the encode
// site, so the speaker is heard even when not shown); input 1 is the Remotion
// stage render, `-stream_loop -1`'d like any b-roll — hence the same
// `setpts=N/FR/TB,fps=` normalisation as `buildSplitImage`.

/** Pip speaker window geometry (output px at 1080×1920). */
export const PIP_WINDOW = {
  width: 400,
  height: 520,
  radius: 48,
  margin: 48,
  border: 3,
  /** Slide-in duration from the right edge, eased out (seconds). */
  slideSeconds: 0.35,
} as const;

/** Soft drop shadow under the pip window. */
const PIP_SHADOW = {
  /** Transparent padding around the window so the blur tail isn't clipped. */
  pad: 44,
  offsetY: 14,
  alpha: 0.42,
  /** Gaussian-ish falloff width (px) outside the shadow's rounded rect. */
  spread: 18,
} as const;

/** Border ring opacity (white). */
const PIP_BORDER_ALPHA = 0.55;

/** Vertical anchor of the pip face crop — slightly above centre (eyes-line). */
const PIP_FACE_ANCHOR_Y = 0.4;

/**
 * Signed distance (px) from pixel (X, Y) to a rounded rectangle centred at
 * (cx, cy) with half-extents (hx, hy) and corner radius r. Negative inside.
 * Evaluated at the pixel centre. FFmpeg expression (contains commas — only
 * used inside single-quoted `geq` options).
 */
function roundedRectSdfExpr(cx: number, cy: number, hx: number, hy: number, r: number): string {
  const qx = `(abs(X+0.5-${cx})-${hx - r})`;
  const qy = `(abs(Y+0.5-${cy})-${hy - r})`;
  return `(hypot(max(${qx},0),max(${qy},0))+min(max(${qx},${qy}),0)-${r})`;
}

/** Anti-aliased coverage (0–1) of an SDF: 1px soft edge. */
function coverageExpr(sdf: string): string {
  return `clip(0.5-${sdf},0,1)`;
}

/**
 * Stage scaled to fill width×height (letterboxed only if the render's aspect
 * differs — the Remotion stage is rendered at exactly the output size for the
 * full-frame layouts, so this is normally a no-op scale).
 */
function stageFullFrameChain(w: number, h: number, fps: number): string {
  return (
    `[1:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=${SCALE_FLAGS},` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setpts=N/FR/TB,fps=${fps},setsar=1`
  );
}

/**
 * Comma-free eased x for the pip slide-in: `rest + dist·(1−q)³` where
 * q = min(t/slide, 1) (easeOutCubic, since 1−easeOutCubic(q) = (1−q)³).
 * `min(a, 1)` is written `(a+1−|a−1|)/2` to stay comma-free.
 */
export function pipSlideXExpr(rest: number, dist: number, slideSeconds: number): string {
  const a = `t/${slideSeconds.toFixed(3)}`;
  const rem = `(1-(${a}+1-abs(${a}-1))/2)`;
  return `${rest}+${dist}*${rem}*${rem}*${rem}`;
}

/** stack-flipped: speaker top half, stage bottom half. */
function buildStageStackFlipped(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const fps = params.fps ?? 30;
  const halfH = roundEven(h / 2);
  const speakerChain = buildSpeakerCropScale(params, w, halfH, 1.0);
  const parts = [
    `[0:v]${speakerChain},setpts=N/FR/TB,fps=${fps},setsar=1[top]`,
    `[1:v]scale=${w}:${halfH}:force_original_aspect_ratio=increase:flags=${SCALE_FLAGS},crop=${w}:${halfH},setpts=N/FR/TB,fps=${fps},setsar=1[bottom]`,
    `[top][bottom]vstack=inputs=2[composed]`,
    finalize('composed'),
  ];
  return { filterComplex: parts.join(';'), inputCount: 2 };
}

/**
 * takeover: the stage fills the frame. The speaker is not drawn, but input 0
 * stays wired so the encoder's `[0:a]` chain keeps the speaker's audio.
 */
function buildStageTakeover(params: SegmentLayoutParams): SegmentLayoutResult {
  const fps = params.fps ?? 30;
  const fc = `${stageFullFrameChain(params.width, params.height, fps)}[composed];${finalize('composed')}`;
  return { filterComplex: fc, inputCount: 2 };
}

/**
 * pip: stage fills the frame; the speaker sits in a rounded window in the
 * bottom-right corner with a soft drop shadow and a subtle light border, and
 * slides in from the right edge over the first `PIP_WINDOW.slideSeconds`.
 *
 * Everything is procedural (no external files): the shadow + border "chrome"
 * and the speaker's rounded alpha mask are each ONE generated frame (`color`
 * + `geq`), repeated for the whole segment by overlay/alphamerge framesync
 * (`eof_action=repeat`), so `geq` runs once per segment, not per frame.
 *
 * Layer order (bottom → top): stage, chrome (shadow + white ring plate),
 * speaker (inset by the border width, rounded with radius − border).
 */
function buildStagePip(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const fps = params.fps ?? 30;
  const oneFrame = (1 / fps).toFixed(4);
  const { width: pw, height: ph, radius, margin, border, slideSeconds } = PIP_WINDOW;
  const { pad, offsetY, alpha: shadowAlpha, spread } = PIP_SHADOW;

  // Window rest position (top-left of the bordered window).
  const restX = w - margin - pw;
  const restY = h - margin - ph;

  // Chrome canvas: window centred with `pad` transparent px on every side.
  const cw = pw + 2 * pad;
  const ch = ph + 2 * pad;
  const plateSdf = roundedRectSdfExpr(cw / 2, ch / 2, pw / 2, ph / 2, radius);
  const shadowSdf = roundedRectSdfExpr(cw / 2, ch / 2 + offsetY, pw / 2, ph / 2, radius);
  const ringA = `(${PIP_BORDER_ALPHA}*${coverageExpr(plateSdf)})`;
  const shadowA = `(${shadowAlpha}*exp(-pow(max(${shadowSdf},0)/${spread},2)))`;
  // Porter-Duff: white ring OVER black shadow.
  const outA = `(${ringA}+${shadowA}*(1-${ringA}))`;
  const rgb = `255*${ringA}/max(${outA},0.0001)`;
  const chrome =
    `color=c=black@0:s=${cw}x${ch}:r=${fps}:d=${oneFrame},format=rgba,` +
    `geq=r='${rgb}':g='${rgb}':b='${rgb}':a='255*${outA}'[pipchrome]`;

  // Speaker: face crop sized to the window interior, rounded via alphamerge.
  const iw = pw - 2 * border;
  const ih = ph - 2 * border;
  const innerSdf = roundedRectSdfExpr(iw / 2, ih / 2, iw / 2, ih / 2, radius - border);
  const mask =
    `color=c=black:s=${iw}x${ih}:r=${fps}:d=${oneFrame},format=gray,` +
    `geq=lum='255*${coverageExpr(innerSdf)}'[pipmask]`;
  const speakerChain = buildSpeakerCropScale(params, iw, ih, 1.0, PIP_FACE_ANCHOR_Y);
  const speaker = `[0:v]${speakerChain},setpts=N/FR/TB,fps=${fps},setsar=1,format=yuva420p[pipspkraw]`;

  // Slide in from fully off-frame (chrome's left edge at the right border).
  const dist = w - (restX - pad);
  const chromeX = pipSlideXExpr(restX - pad, dist, slideSeconds);
  const speakerX = pipSlideXExpr(restX + border, dist, slideSeconds);

  const parts = [
    `${stageFullFrameChain(w, h, fps)}[pipstage]`,
    chrome,
    mask,
    speaker,
    `[pipspkraw][pipmask]alphamerge[pipspk]`,
    `[pipstage][pipchrome]overlay=x='${chromeX}':y=${restY - pad}[pipbg]`,
    `[pipbg][pipspk]overlay=x='${speakerX}':y=${restY + border}[composed]`,
    finalize('composed'),
  ];
  return { filterComplex: parts.join(';'), inputCount: 2 };
}

/**
 * over: the speaker renders exactly like talking-head (full frame, face crop,
 * optional zoom via `speakerZoomFilter`), and the transparent stage render
 * (ProRes 4444, yuva444p10le) is alpha-composited on top. The stage keeps
 * its alpha through `format=yuva420p` so `overlay` blends it.
 */
function buildStageOver(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const fps = params.fps ?? 30;
  const speakerChain = buildSpeakerCropScale(params, w, h, 1.0);
  const zoom = params.speakerZoomFilter ? `,${params.speakerZoomFilter}` : '';
  const parts = [
    `[0:v]${speakerChain},setsar=1${zoom}[overspk]`,
    `[1:v]format=yuva420p,scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=${SCALE_FLAGS},` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setpts=N/FR/TB,fps=${fps},setsar=1[overstage]`,
    `[overspk][overstage]overlay=0:0:format=auto[composed]`,
    finalize('composed'),
  ];
  return { filterComplex: parts.join(';'), inputCount: 2 };
}

/**
 * fullscreen-image: b-roll video fills the entire frame. Input 0: source
 * clip (kept only so `-map 0:a` still pulls the speaker's audio). Input 1:
 * b-roll video, looped via `-stream_loop -1` at the encoder. `setpts=N/FR/TB`
 * monotonises PTS across loop boundaries so `fps=` doesn't stall the rate
 * converter on the demuxer's PTS rewind — same fix as split-image.
 */
function buildFullscreenImage(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const fps = params.fps ?? 30;

  const fc =
    `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=${SCALE_FLAGS},crop=${w}:${h},setpts=N/FR/TB,fps=${fps},setsar=1[composed];` +
    finalize('composed');

  return { filterComplex: fc, inputCount: 2 };
}

/**
 * fullscreen-quote: solid sand (BRAND_FG) color source for the segment
 * duration. No baked text — captions are the hero. This archetype inverts
 * the brand palette (sand bg, dark-brown text) so a quote moment doesn't
 * read like the video has cut to black. Audio still comes from input 0
 * (the source video) at the encode site.
 */
function buildFullscreenQuote(params: SegmentLayoutParams): SegmentLayoutResult {
  const w = params.width;
  const h = params.height;
  const dur = params.segmentDuration;
  const bgColor = hexToFFmpeg(BRAND_FG);

  const bg = `color=c=${bgColor}:s=${w}x${h}:d=${dur.toFixed(3)}:r=30`;
  const fc = `${bg}[composed];${finalize('composed')}`;
  return { filterComplex: fc, inputCount: 0 };
}

// ---------------------------------------------------------------------------
// Public API — Dispatcher
// ---------------------------------------------------------------------------

/**
 * Build the FFmpeg `filter_complex` for the given archetype.
 *
 * The returned filter_complex produces an output stream labeled `[outv]`
 * with pixel format yuv420p and SAR 1:1, ready for direct encoding.
 *
 * @param archetype  The segment archetype (from `Archetype`).
 * @param params     Layout parameters (dimensions, image path, crop rect).
 * @returns          `{ filterComplex, inputCount }` ready for FFmpeg.
 */
export function buildArchetypeLayout(
  archetype: Archetype,
  params: SegmentLayoutParams,
): SegmentLayoutResult {
  switch (archetype) {
    case 'talking-head':
    case 'quote-lower':
      return buildTalkingHead(params);
    case 'tight-punch':
      return buildTightPunch(params);
    case 'wide-breather':
      return buildWideBreather(params);
    case 'split-image':
      return buildSplitImage(params);
    case 'fullscreen-image':
      return buildFullscreenImage(params);
    case 'fullscreen-quote':
      return buildFullscreenQuote(params);
    default:
      return buildTalkingHead(params);
  }
}
