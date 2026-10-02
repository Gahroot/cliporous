import { contrastRatio, relativeLuminance } from './palette-contrast';
import type { Palette } from './palettes';
import { isStoryboardStyle, type StoryboardStyle } from './storyboards';

export interface StoryboardPalette {
  canvas: string;
  paper: string;
  card: string;
  cardRaised: string;
  ink: string;
  muted: string;
  stroke: string;
  accent: string;
  accent2: string;
  marker: string;
  markerText: string;
  note: string;
  noteText: string;
  tape: string;
  tapeText: string;
  shadow: string;
  clay: [string, string, string];
}

/** Inputs have already crossed the strict six-digit palette boundary. */
export function mixStoryboardColor(first: string, second: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const a = Number.parseInt(first.slice(offset, offset + 2), 16);
    const b = Number.parseInt(second.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * Math.min(1, Math.max(0, amount)))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function readable(seed: string, surfaces: readonly string[], minimum: number): string {
  const endpoints = ['#000000', '#ffffff'];
  const endpoint = endpoints.sort(
    (a, b) =>
      Math.min(...surfaces.map((surface) => contrastRatio(b, surface))) -
      Math.min(...surfaces.map((surface) => contrastRatio(a, surface))),
  )[0];
  for (let step = 0; step <= 100; step++) {
    const color = mixStoryboardColor(seed, endpoint, step / 100);
    if (surfaces.every((surface) => contrastRatio(color, surface) >= minimum)) return color;
  }
  throw new Error('Storyboard surfaces cannot meet the required contrast.');
}

/** One React-free source of export and picker colors. Never mutates saved palette seeds. */
export function resolveStoryboardPalette(
  style: StoryboardStyle,
  palette: Palette,
): StoryboardPalette {
  if (!isStoryboardStyle(style)) throw new Error('Unsupported storyboard style.');
  const seeds = [
    palette.background,
    palette.foreground,
    palette.accent,
    palette.accent2 ?? palette.accent,
  ];
  if (seeds.some((seed) => typeof seed !== 'string' || !/^#[0-9a-f]{6}$/i.test(seed)))
    throw new Error('Storyboard palette requires six-digit hex colors.');
  const canvas =
    style === 'ink'
      ? mixStoryboardColor('#ffffff', palette.background, 0.055)
      : palette.background.toLowerCase();
  const light = relativeLuminance(canvas) > 0.179;
  const surfaceEndpoint = light ? '#ffffff' : '#000000';
  const paper = mixStoryboardColor(canvas, surfaceEndpoint, 0.18);
  const card = mixStoryboardColor(canvas, surfaceEndpoint, 0.1);
  const cardRaised = mixStoryboardColor(canvas, surfaceEndpoint, 0.25);
  const surfaces = [canvas, paper, card, cardRaised];
  const ink = readable(style === 'ink' ? '#000000' : palette.foreground, surfaces, 4.5);
  const muted = readable(mixStoryboardColor(ink, canvas, 0.4), surfaces, 4.5);
  const accent = readable(palette.accent, surfaces, 4.5);
  const accent2 = readable(palette.accent2 ?? palette.accent, surfaces, 4.5);
  const marker = mixStoryboardColor(canvas, palette.accent, 0.25);
  const note = mixStoryboardColor(paper, palette.accent2 ?? palette.accent, 0.07);
  const tape = mixStoryboardColor(paper, palette.accent, 0.22);
  return {
    canvas,
    paper,
    card,
    cardRaised,
    ink,
    muted,
    stroke: readable(palette.accent, surfaces, 3),
    accent,
    accent2,
    marker,
    markerText: readable(ink, [marker], 4.5),
    note,
    noteText: readable(ink, [note], 4.5),
    tape,
    tapeText: readable(ink, [tape], 4.5),
    shadow: light ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.4)',
    clay: [
      readable(mixStoryboardColor(palette.accent, '#ffffff', 0.32), [canvas], 3),
      readable(mixStoryboardColor(palette.accent2 ?? palette.accent, '#ffffff', 0.48), [canvas], 3),
      readable(mixStoryboardColor(palette.accent, canvas, 0.28), [canvas], 3),
    ],
  };
}
