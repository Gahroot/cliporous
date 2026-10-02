import type { Palette } from './palettes';

export const TEXT_CONTRAST_MIN = 4.5;
export const GRAPHIC_CONTRAST_MIN = 3;
export interface PaletteContrastResult {
  foreground: number;
  accent: number;
  accent2: number | null;
  warnings: string[];
}
const HEX_COLOR = /^#([0-9a-f]{6})$/i;
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}
export function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  const prefixed = /^[0-9a-f]{6}$/i.test(trimmed) ? `#${trimmed}` : trimmed;
  return isHexColor(prefixed) ? prefixed.toUpperCase() : value;
}
function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match?.[1]) return 0;
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}
export function contrastRatio(first: string, second: string): number {
  if (!isHexColor(first) || !isHexColor(second)) return 1;
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}
function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}
export function evaluatePaletteContrast(
  palette: Pick<Palette, 'background' | 'foreground' | 'accent' | 'accent2'>,
): PaletteContrastResult {
  const foreground = contrastRatio(palette.foreground, palette.background);
  const accent = contrastRatio(palette.accent, palette.background);
  const accent2 = palette.accent2 ? contrastRatio(palette.accent2, palette.background) : null;
  const warnings: string[] = [];
  if (foreground < TEXT_CONTRAST_MIN) {
    warnings.push(
      `Foreground is ${formatRatio(foreground)} against the background. Body text needs at least 4.5:1.`,
    );
  }
  if (accent < GRAPHIC_CONTRAST_MIN) {
    warnings.push(
      `Accent is ${formatRatio(accent)} against the background. Meaningful marks need at least 3:1.`,
    );
  }
  if (accent2 !== null && accent2 < GRAPHIC_CONTRAST_MIN) {
    warnings.push(
      `Accent 2 is ${formatRatio(accent2)} against the background. Meaningful marks need at least 3:1.`,
    );
  }
  return { foreground, accent, accent2, warnings };
}
