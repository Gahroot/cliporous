import { BUILTIN_PALETTES, DEFAULT_PALETTE_ID, type Palette } from './palettes';

export function isLongformPalette(value: unknown): value is Palette {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const palette = value as Record<string, unknown>;
  const color = (input: unknown): boolean =>
    typeof input === 'string' && /^#[0-9a-f]{6}$/i.test(input);
  return (
    typeof palette.id === 'string' &&
    /^[a-zA-Z0-9_-]{1,160}$/.test(palette.id) &&
    typeof palette.name === 'string' &&
    palette.name.length <= 160 &&
    typeof palette.builtin === 'boolean' &&
    color(palette.background) &&
    color(palette.foreground) &&
    color(palette.accent) &&
    (palette.accent2 === undefined || color(palette.accent2))
  );
}

export function validLongformPalettes(value: unknown): value is Palette[] {
  return Array.isArray(value) && value.length <= 128 && value.every(isLongformPalette);
}

/** Unknown IDs fail closed, rather than previewing different colors than the saved edit. */
export function findLongformPalette(
  id: string | undefined,
  custom: Palette[] = [],
): Palette | undefined {
  const key = id ?? DEFAULT_PALETTE_ID;
  return (
    custom.find((palette) => palette.id === key) ??
    BUILTIN_PALETTES.find((palette) => palette.id === key)
  );
}
