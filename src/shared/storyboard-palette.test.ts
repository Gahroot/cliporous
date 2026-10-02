import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './palette-contrast';
import { BUILTIN_PALETTES, type Palette } from './palettes';
import { resolveStoryboardPalette } from './storyboard-palette';
import { STORYBOARD_STYLES } from './storyboards';

const custom: Palette[] = [
  {
    id: 'light',
    name: 'Light',
    background: '#fafafa',
    foreground: '#151515',
    accent: '#00ffff',
    accent2: '#ffeeee',
    builtin: false,
  },
  {
    id: 'low',
    name: 'Low contrast',
    background: '#777777',
    foreground: '#777777',
    accent: '#777777',
    builtin: false,
  },
  {
    id: 'white',
    name: 'White',
    background: '#ffffff',
    foreground: '#ffffff',
    accent: '#ffffff',
    builtin: false,
  },
  {
    id: 'black',
    name: 'Black',
    background: '#000000',
    foreground: '#000000',
    accent: '#000000',
    builtin: false,
  },
];
describe.each(STORYBOARD_STYLES)('%s storyboard material', (style) => {
  it.each([
    ...BUILTIN_PALETTES,
    ...custom,
  ])('uses readable tokens for $id without changing stored colors', (palette) => {
    const before = structuredClone(palette);
    const tokens = resolveStoryboardPalette(style, palette);
    for (const surface of [tokens.canvas, tokens.paper, tokens.card, tokens.cardRaised]) {
      for (const color of [tokens.ink, tokens.muted, tokens.accent, tokens.accent2]) {
        expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(tokens.stroke, surface)).toBeGreaterThanOrEqual(3);
    }
    for (const [text, surface] of [
      [tokens.markerText, tokens.marker],
      [tokens.noteText, tokens.note],
      [tokens.tapeText, tokens.tape],
    ]) {
      expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
    }
    for (const color of tokens.clay)
      expect(contrastRatio(color, tokens.canvas)).toBeGreaterThanOrEqual(3);
    expect(palette).toEqual(before);
    if (style === 'ink') expect(relativeLuminance(tokens.canvas)).toBeGreaterThan(0.8);
    else expect(tokens.canvas).toBe(palette.background.toLowerCase());
  });
});
it('rejects CSS at the color boundary', () => {
  expect(() =>
    resolveStoryboardPalette('ink', { ...BUILTIN_PALETTES[0], accent: 'url(example)' }),
  ).toThrow('six-digit');
});
it('a non-violet theme changes all derived color roles', () => {
  const violet = resolveStoryboardPalette('polish', BUILTIN_PALETTES[0]);
  const emerald = resolveStoryboardPalette(
    'polish',
    BUILTIN_PALETTES.find((palette) => palette.id === 'slate-emerald') ?? BUILTIN_PALETTES[0],
  );
  expect(emerald.accent).not.toBe(violet.accent);
  expect(emerald.clay).not.toEqual(violet.clay);
  expect(emerald.marker).not.toEqual(violet.marker);
});
