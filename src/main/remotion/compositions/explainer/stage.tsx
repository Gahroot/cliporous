/**
 * Shared look + context + timing helpers for explainer scenes.
 *
 * Visual language: a calm dark "stage" with soft raised cards and one accent,
 * all derived from the user's selected palette (see palette.ts). Every motion
 * is derived from the Remotion frame clock so renders are deterministic.
 *
 * Scene components read colours with `useStage()` and the canvas/layout with
 * `useLayout()`; both come from <ExplainerProvider>, which the sequence
 * composition mounts once. Components rendered outside a provider (tests,
 * the legacy single-scene composition) get the default navy/violet look.
 */

import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { getLongformLayout, type LongformLayout } from '../../../../shared/longform-layout';
import type { LongformPresentation } from '../../../../shared/longform-scenes';
import { EASE } from '../../shared/easing';
import {
  type EditorialSlot,
  fitEditorialText,
  longformTextRegions,
  modelSpaceTransform,
} from './longform-stage-layout';
import { motionProgress } from './motion-tokens';
import { deriveExplainerPalette } from './palette';
import {
  type ExplainerAspect,
  type ExplainerLayout,
  type ExplainerPalette,
  type SceneExtras,
  type StageSafeBox,
  stageCanvasFor,
  stageSafeBox,
} from './types';

export const UI_FONT = "'Inter', system-ui, sans-serif";
export const SERIF_FONT = "'Instrument Serif', Georgia, serif";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ExplainerContextValue {
  palette: ExplainerPalette;
  layout: ExplainerLayout;
  aspect: ExplainerAspect;
  presentation?: LongformPresentation;
  /** SceneFrame opts modern family owners into native landscape regions. */
  nativeStage?: boolean;
  /** Content box override; `stageSafeBox(layout, aspect)` when absent. */
  safe?: StageSafeBox | undefined;
  /** Extras of the scene currently rendering (pulses, overlay stamp …). */
  extras: SceneExtras;
}

const DEFAULT_CONTEXT: ExplainerContextValue = {
  palette: deriveExplainerPalette(),
  layout: 'stack',
  aspect: '9:16',
  extras: {},
};

const ExplainerContext = createContext<ExplainerContextValue>(DEFAULT_CONTEXT);

export const ExplainerProvider: React.FC<{
  value: Partial<ExplainerContextValue>;
  // Optional so createElement callers can pass children positionally (which
  // noChildrenProp requires) without needing a props-object `children` key.
  children?: React.ReactNode;
}> = ({ value, children }) => {
  const parent = useContext(ExplainerContext);
  const merged = useMemo(() => ({ ...parent, ...value }), [parent, value]);
  return <ExplainerContext.Provider value={merged}>{children}</ExplainerContext.Provider>;
};

export function useExplainerContext(): ExplainerContextValue {
  return useContext(ExplainerContext);
}

/**
 * Stage colours. Same keys as the v1 `STAGE` constant (plus the palette's
 * accents), so scenes read `S.card`, `S.text`, `S.accent`, `S.font`, …
 */
export interface StageStyle extends ExplainerPalette {
  /** v1 alias for `positive`. */
  done: string;
  font: string;
  serif: string;
}

export function useStage(): StageStyle {
  const { palette } = useContext(ExplainerContext);
  return useMemo(
    () => ({ ...palette, done: palette.positive, font: UI_FONT, serif: SERIF_FONT }),
    [palette],
  );
}

export interface LayoutInfo {
  layout: ExplainerLayout;
  aspect: ExplainerAspect;
  width: number;
  height: number;
  /** Box the content must stay inside (canvas px). */
  safe: StageSafeBox;
  /** Uniform scale for content designed on the 1080×960 stage. */
  unit: number;
  /** True for the transparent `over` layout (no backdrop, glass card). */
  floating: boolean;
  /** Absolute shared compositor rectangles, only for explicit landscape presentations. */
  longform?: LongformLayout;
}

export function useLayout(): LayoutInfo {
  const { layout, aspect, safe: safeOverride, presentation } = useContext(ExplainerContext);
  return useMemo(() => {
    const canvas = stageCanvasFor(layout, aspect);
    const longform =
      presentation && aspect === '16:9' ? getLongformLayout(presentation) : undefined;
    const safe = longform?.explanation ?? safeOverride ?? stageSafeBox(layout, aspect);
    const unit = Math.min(safe.width / 960, safe.height / 840);
    return {
      layout,
      aspect,
      width: canvas.width,
      height: canvas.height,
      safe,
      unit: Math.max(0.55, Math.min(1.25, unit)),
      floating: !longform && layout === 'over',
      longform,
    };
  }, [layout, aspect, safeOverride, presentation]);
}

/** Only modern family owners use this. Older art remains a deliberately contained composition. */
export function useWideStage(): LongformLayout | undefined {
  const { nativeStage } = useExplainerContext();
  const { longform } = useLayout();
  return nativeStage ? longform : undefined;
}

/**
 * Leave the authored anchor coordinate system to draw in real composition pixels.
 * The inverse transform cancels SceneFrame's model-anchor mapping. This keeps one
 * genuinely rectangular WebGL viewport while existing model labels track exactly.
 */
export const StageSpace: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wide = useWideStage();
  if (!wide) return <>{children}</>;
  const m = modelSpaceTransform(wide.model);
  return (
    <div
      style={{
        position: 'absolute',
        left: -m.x / m.scale,
        top: -m.y / m.scale,
        width: wide.width,
        height: wide.height,
        transform: `scale(${1 / m.scale})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>
  );
};

/** Palette/font-preserving editorial rail with deterministic, non-truncating long-label wrapping. */
export const WideStageText: React.FC<{
  slot: EditorialSlot;
  text: string;
  size?: number;
  opacity?: number;
  marker?: React.ReactNode;
}> = ({ slot, text, size = 36, opacity = 1, marker }) => {
  const wide = useWideStage();
  const S = useStage();
  if (!wide) return null;
  const region = longformTextRegions(wide)[slot];
  const fit = fitEditorialText(text, { ...region, width: region.width - (marker ? 56 : 0) }, size);
  return (
    <StageSpace>
      <div
        data-longform-text={slot}
        style={{
          position: 'absolute',
          left: region.x,
          top: region.y,
          width: region.width,
          fontFamily: S.font,
          fontSize: fit.fontSize,
          fontWeight: slot === 'title' ? 750 : 650,
          lineHeight: 1.16,
          color: slot === 'evidence' ? S.muted : S.text,
          opacity,
          overflowWrap: 'anywhere',
          display: 'flex',
          gap: 20,
        }}
      >
        {marker && <div style={{ width: 36, flexShrink: 0 }}>{marker}</div>}
        <div style={{ whiteSpace: 'pre-line' }}>{fit.lines.join('\n')}</div>
      </div>
    </StageSpace>
  );
};

/** v1 constant, kept for code that has no provider (default palette). */
export const STAGE = {
  ...DEFAULT_CONTEXT.palette,
  done: DEFAULT_CONTEXT.palette.positive,
  font: UI_FONT,
} as const;

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/** Seconds elapsed since the scene started. */
export function useSceneTime(): { t: number; frame: number; fps: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { t: frame / fps, frame, fps };
}

/** 0→1 spring that starts at `atSec`. Soft settle with a small overshoot. */
export function usePop(atSec: number, stiffness?: number, damping = 15): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (stiffness === undefined) return motionProgress(frame, fps, atSec);
  return spring({
    frame: frame - Math.round(atSec * fps),
    fps,
    config: { stiffness, damping, mass: 0.9 },
  });
}

/** Clamped eased 0→1 progress over [atSec, atSec + durSec]. */
export function ramp(t: number, atSec: number, durSec: number): number {
  return interpolate(t, [atSec, atSec + durSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.outExpo,
  });
}

/** Mix a hex colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  const mix = (c: number): number => Math.round(c + (target - c) * a);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Scene entrance: fade + short rise over the first 0.4s. */
export function useEntrance(): React.CSSProperties {
  const { t } = useSceneTime();
  const p = ramp(t, 0, 0.4);
  return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
}

// ---------------------------------------------------------------------------
// Fonts + backdrop
// ---------------------------------------------------------------------------

/**
 * Loads Inter + Instrument Serif before the first frame is captured. A failed
 * load falls back to the system font instead of aborting the render.
 */
export const ExplainerFonts: React.FC = () => {
  const [handle] = useState(() => delayRender('Loading explainer fonts'));
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      [
        "600 40px 'Inter'",
        "800 40px 'Inter'",
        "400 40px 'Instrument Serif'",
        "italic 400 40px 'Instrument Serif'",
      ].map((q) => document.fonts.load(q).catch(() => undefined)),
    )
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <style>{`
    @font-face {
      font-family: 'Inter';
      src: url('${staticFile('fonts/Inter.ttf')}') format('truetype');
      font-weight: 100 900;
      font-display: block;
    }
    @font-face {
      font-family: 'Instrument Serif';
      src: url('${staticFile('fonts/InstrumentSerif-Regular.ttf')}') format('truetype');
      font-style: normal;
      font-weight: 400;
      font-display: block;
    }
    @font-face {
      font-family: 'Instrument Serif';
      src: url('${staticFile('fonts/InstrumentSerif-Italic.ttf')}') format('truetype');
      font-style: italic;
      font-weight: 400;
      font-display: block;
    }
  `}</style>
  );
};

/**
 * Stage backdrop: palette radial gradient with a slowly drifting key light so
 * the stage never looks frozen. Transparent for the floating `over` layout.
 */
export const StageBackground: React.FC = () => {
  const S = useStage();
  const { floating } = useLayout();
  const { t } = useSceneTime();
  if (floating) return null;
  // ~14 s orbit of the light centre; amplitude small enough to stay subtle.
  const lx = 50 + Math.sin(t * 0.45) * 9;
  const ly = 44 + Math.cos(t * 0.33) * 6;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: [
          `radial-gradient(ellipse 45% 38% at ${lx}% ${ly}%, ${S.accentSoft} 0%, rgba(0,0,0,0) 70%)`,
          `radial-gradient(ellipse 72% 62% at 50% 48%, ${S.bgInner} 0%, ${S.bgOuter} 100%)`,
        ].join(', '),
      }}
    />
  );
};
