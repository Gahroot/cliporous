/**
 * Derive the explainer stage palette from the user's selected app palette
 * (`Palette` in src/shared/palettes.ts). Pure + JSX-free: used by the main
 * process (planning/render glue) and inside Remotion compositions.
 *
 * A palette only carries background / foreground / accent (/ accent2), but a
 * premium stage needs surfaces, muted text and three clay tones for 3D props.
 * Everything else is mixed from those seeds in a perceptually sane way:
 * surfaces are the background lifted toward the foreground, clay tones are the
 * accent pulled toward a warm light so props read as soft material instead of
 * neon plastic (the reference edit's peach/tan props on navy).
 */

import type { ExplainerPalette } from './types';

export interface PaletteSeed {
  background: string;
  foreground: string;
  accent: string;
  accent2?: string;
}

/** The v1 look (navy stage, violet accent) — used when no palette is given. */
export const DEFAULT_PALETTE_SEED: PaletteSeed = {
  background: '#0a0f1f',
  foreground: '#eef1f8',
  accent: '#9f75ff',
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.length === 8
        ? h.slice(0, 6)
        : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number): string =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Mix two hex colours; `t` = 0 → a, 1 → b. Invalid input falls back to `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra) return a;
  if (!rb) return toHex(ra);
  return toHex(mixRgb(ra, rb, t));
}

/** `rgba()` string for a hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex) ?? { r: 255, g: 255, b: 255 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/** WCAG relative luminance (0–1). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

const WARM_LIGHT = '#fff4e8';
const POSITIVE = '#6fbf8a';
const NEGATIVE = '#e0735f';

/**
 * Build the full stage palette from a seed. Light-background palettes are
 * flipped to a dark stage (the stage must contrast with a live speaker and
 * white captions), keeping the palette's accent identity.
 */
export function deriveExplainerPalette(seed: PaletteSeed = DEFAULT_PALETTE_SEED): ExplainerPalette {
  const lightBg = luminance(seed.background) > 0.4;
  const bg = lightBg ? mixHex(seed.foreground, '#000000', 0.25) : seed.background;
  const fg = lightBg ? seed.background : seed.foreground;
  const accent = parseHex(seed.accent) ? seed.accent : DEFAULT_PALETTE_SEED.accent;
  const accent2 =
    seed.accent2 && parseHex(seed.accent2) ? seed.accent2 : mixHex(accent, WARM_LIGHT, 0.35);

  const bgOuter = mixHex(bg, '#000000', 0.25);
  const bgInner = mixHex(bg, fg, 0.09);
  return {
    bgOuter,
    bgInner,
    card: mixHex(bg, fg, 0.07),
    cardRaised: mixHex(bg, fg, 0.13),
    cardBorder: withAlpha(fg, 0.09),
    text: mixHex(fg, '#ffffff', 0.2),
    muted: mixHex(fg, bg, 0.45),
    accent,
    accent2,
    accentSoft: withAlpha(accent, 0.18),
    positive: POSITIVE,
    negative: NEGATIVE,
    paper: mixHex(fg, '#ffffff', 0.6),
    paperText: mixHex(bg, '#000000', 0.3),
    clay: [
      mixHex(accent, WARM_LIGHT, 0.45),
      mixHex(accent2, WARM_LIGHT, 0.62),
      mixHex(mixHex(accent, bg, 0.35), WARM_LIGHT, 0.25),
    ],
  };
}
