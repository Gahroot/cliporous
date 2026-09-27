/**
 * Shared look + motion helpers for explainer scenes.
 *
 * Visual language: a calm navy "stage" with soft raised cards, one accent
 * colour, Inter UI type. Every motion is derived from the Remotion frame clock
 * so renders are deterministic.
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import {
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { EASE } from '../../shared/easing';

export const STAGE = {
  bgInner: '#1b2036',
  bgOuter: '#0a0f1f',
  card: '#1a2340',
  cardRaised: '#223052',
  cardBorder: 'rgba(255,255,255,0.08)',
  text: '#eef1f8',
  muted: '#8b94ae',
  done: '#6fbf8a',
  paper: '#f4f4f6',
  paperText: '#1c2130',
  font: "'Inter', system-ui, sans-serif",
} as const;

/** Seconds elapsed since the scene started. */
export function useSceneTime(): { t: number; frame: number; fps: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { t: frame / fps, frame, fps };
}

/** 0→1 spring that starts at `atSec`. Soft settle with a small overshoot. */
export function usePop(atSec: number, stiffness = 170, damping = 15): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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

/**
 * Loads Inter before the first frame is captured (same gating approach as
 * `PrestyjFonts`, but scoped to the explainer stage). A failed load falls back
 * to the system font instead of aborting the render.
 */
export const ExplainerFonts: React.FC = () => {
  const [handle] = useState(() => delayRender('Loading explainer fonts'));
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      ["600 40px 'Inter'", "800 40px 'Inter'"].map((q) =>
        document.fonts.load(q).catch(() => undefined),
      ),
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
  `}</style>
  );
};

/** Navy radial stage background. */
export const StageBackground: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(ellipse 70% 60% at 50% 48%, ${STAGE.bgInner} 0%, ${STAGE.bgOuter} 100%)`,
    }}
  />
);
