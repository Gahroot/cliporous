import { BUILTIN_PALETTES } from '@shared/palettes';
import { describe, expect, it } from 'vitest';
import { deriveExplainerPalette, luminance, mixHex, withAlpha } from './palette';

describe('deriveExplainerPalette', () => {
  it('keeps the palette accent and derives a dark stage for every built-in palette', () => {
    for (const p of BUILTIN_PALETTES) {
      const out = deriveExplainerPalette(p);
      expect(out.accent).toBe(p.accent);
      expect(luminance(out.bgOuter)).toBeLessThan(0.2);
      expect(luminance(out.text)).toBeGreaterThan(luminance(out.bgInner));
      expect(out.clay).toHaveLength(3);
      for (const c of [out.bgOuter, out.card, out.paper, ...out.clay]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('uses accent2 when given, and derives one otherwise', () => {
    expect(
      deriveExplainerPalette({
        background: '#000000',
        foreground: '#ffffff',
        accent: '#ff0000',
        accent2: '#00ff00',
      }).accent2,
    ).toBe('#00ff00');
    expect(
      deriveExplainerPalette({ background: '#000000', foreground: '#ffffff', accent: '#ff0000' })
        .accent2,
    ).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('flips light palettes to a dark stage', () => {
    const out = deriveExplainerPalette({
      background: '#fafafa',
      foreground: '#111111',
      accent: '#2563eb',
    });
    expect(luminance(out.bgOuter)).toBeLessThan(0.1);
  });

  it('falls back to the default accent for invalid colours', () => {
    const out = deriveExplainerPalette({
      background: '#000000',
      foreground: '#ffffff',
      accent: 'not-a-colour',
    });
    expect(out.accent).toBe('#9f75ff');
  });
});

describe('colour helpers', () => {
  it.each([
    ['#000000', '#ffffff', 0.5, '#808080'],
    ['#ff0000', '#0000ff', 0, '#ff0000'],
    ['#ff0000', '#0000ff', 1, '#0000ff'],
  ])('mixHex(%s, %s, %s) = %s', (a, b, t, expected) => {
    expect(mixHex(a, b, t)).toBe(expected);
  });

  it('withAlpha clamps alpha', () => {
    expect(withAlpha('#ffffff', 2)).toBe('rgba(255, 255, 255, 1)');
  });
});
