import { describe, expect, it } from 'vitest';
import {
  type ArchetypeWindow,
  buildAssLines,
  buildCaptionASSDocument,
  type CaptionStyleInput,
  DEFAULT_ACCENT,
  FANCY_FONT,
  type ShotCaptionOverride,
  type WordInput,
} from './captions';
import { MIN_EMPHASIS_DWELL_SECONDS } from './emphasis-dwell';

const STYLE: CaptionStyleInput = {
  captionMode: 'standard',
  accentColor: DEFAULT_ACCENT,
  fontSize: 0.065,
  wordsPerLine: 4,
};

const MODE_FIXTURE: WordInput[] = [
  { text: 'this', start: 0, end: 0.3, emphasis: 'normal' },
  { text: 'is', start: 0.3, end: 0.5, emphasis: 'emphasis' },
  { text: 'very', start: 0.5, end: 0.9, emphasis: 'emphasis' },
  { text: 'cool', start: 0.9, end: 1.4, emphasis: 'normal' },
];

const ORDINARY_ARCHETYPES = [
  'talking-head',
  'tight-punch',
  'wide-breather',
  'quote-lower',
  'split-image',
  'fullscreen-image',
] as const;

function dialogueLines(document: string): string[] {
  return document.split('\n').filter((line) => line.startsWith('Dialogue:'));
}

function eventPayload(line: string): string {
  return line.split(',').slice(9).join(',');
}

function plainEventText(line: string): string {
  return eventPayload(line)
    .replace(/\{[^}]*\}/g, '')
    .replaceAll('\\N', ' ');
}

function assTimeSeconds(value: string): number {
  const [hours, minutes, seconds] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function eventTimes(line: string): { start: number; end: number } {
  const fields = line.split(',');
  return { start: assTimeSeconds(fields[1]), end: assTimeSeconds(fields[2]) };
}

function expectNoEventOverlap(lines: string[]): void {
  for (let index = 0; index < lines.length - 1; index++) {
    expect(eventTimes(lines[index]).end).toBeLessThanOrEqual(eventTimes(lines[index + 1]).start);
  }
}

function timedWords(texts: string[], step = 1): WordInput[] {
  return texts.map((text, index) => ({
    text,
    start: index * step + 0.1,
    end: index * step + 0.35,
  }));
}

describe('caption visual modes', () => {
  it('keeps standard words on Inter without inline font or color swaps', () => {
    const [line] = buildAssLines(MODE_FIXTURE, 'standard', DEFAULT_ACCENT, 4);
    expect(line).not.toContain('\\fn');
    expect(line).not.toMatch(/\\1?c&H[0-9A-F]{6,8}/);
    expect(plainEventText(line)).toBe('this is very cool');
  });

  it('recolors only emphasized words in emphasis mode', () => {
    const [line] = buildAssLines(MODE_FIXTURE, 'emphasis', DEFAULT_ACCENT, 4);
    expect(line).toContain('\\1c&H00FF759F');
    expect(line).not.toContain(`\\fn${FANCY_FONT}`);
    expect(line).not.toMatch(/\\1c&H[0-9A-F]{6,8}\}this\b/);
    expect(line).not.toMatch(/\\1c&H[0-9A-F]{6,8}\}cool\b/);
  });

  it('recolors and swaps emphasized words to Bebas in emphasis-highlight mode', () => {
    const [line] = buildAssLines(MODE_FIXTURE, 'emphasis_highlight', DEFAULT_ACCENT, 4);
    expect(line).toContain(`\\fn${FANCY_FONT}\\1c&H00FF759F`);
    expect(line).not.toMatch(new RegExp(`\\\\fn${FANCY_FONT}[^}]*\\}this\\b`));
    expect(line).not.toMatch(new RegExp(`\\\\fn${FANCY_FONT}[^}]*\\}cool\\b`));
  });

  it.each([
    'standard',
    'emphasis',
    'emphasis_highlight',
  ] as const)('snapshots one complete %s dialogue event', (mode) => {
    expect(buildAssLines(MODE_FIXTURE, mode, DEFAULT_ACCENT, 4)[0]).toMatchSnapshot();
  });
});

describe('stable baseline geometry and deterministic wrapping', () => {
  it('uses the same bottom anchor for one-line and two-line ordinary events', () => {
    const oneLine = dialogueLines(
      buildCaptionASSDocument([{ text: 'Stable', start: 0, end: 0.3 }], STYLE, {
        position: { x: 42, y: 73 },
      }),
    )[0];
    const twoLine = dialogueLines(
      buildCaptionASSDocument(MODE_FIXTURE, STYLE, { position: { x: 42, y: 73 } }),
    )[0];

    expect(oneLine).toContain('\\an2\\pos(454,1402)');
    expect(twoLine).toContain('\\an2\\pos(454,1402)');
    expect(twoLine.match(/\\N/g)).toHaveLength(1);
  });

  it('locks libass to explicit wrapping and never emits a third line', () => {
    const words = timedWords(
      [
        'A',
        'conservatively',
        'measured',
        'subtitle',
        'event',
        'keeps',
        'every',
        'line',
        'predictable',
      ],
      0.35,
    );
    const document = buildCaptionASSDocument(words, { ...STYLE, wordsPerLine: 6 });
    expect(document).toContain('WrapStyle: 2');
    for (const line of dialogueLines(document)) {
      expect(line).toContain('\\q2');
      expect(line.match(/\\N/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    ['short', ['Go', 'now']],
    ['long', ['Conservative', 'typographic', 'measurement', 'stabilizes', 'captions']],
    ['punctuation', ['Wait...', 'what?!', '(Really)', 'yes—really.']],
    ['CJK', ['字幕', '位置', '始终', '稳定']],
    ['emoji', ['Make', 'it', 'stable', '🎬✨']],
  ])('wraps %s text into at most two explicit lines', (_name, texts) => {
    const document = buildCaptionASSDocument(timedWords(texts), {
      ...STYLE,
      wordsPerLine: 6,
    });
    const lines = dialogueLines(document);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.match(/\\N/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('keeps an oversized token in one event and scales only that event horizontally', () => {
    const token = 'W'.repeat(80);
    const lines = dialogueLines(
      buildCaptionASSDocument([{ text: token, start: 0.2, end: 0.6 }], STYLE),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('\\fscx');
    expect(lines[0]).not.toContain('\\N');
    expect(plainEventText(lines[0])).toBe(token);
  });
});

describe('archetype presentation windows', () => {
  it('keeps anchor and font size identical across every ordinary archetype', () => {
    const words = timedWords(
      ORDINARY_ARCHETYPES.map((_, index) => `word${index}`),
      1,
    );
    const archetypeWindows: ArchetypeWindow[] = ORDINARY_ARCHETYPES.map((archetype, index) => ({
      startTime: index,
      endTime: index + 1,
      archetype,
    }));
    const document = buildCaptionASSDocument(words, STYLE, {
      position: { x: 47, y: 79 },
      archetypeWindows,
    });
    const lines = dialogueLines(document);
    const styleFontSize = document.match(/Style: Default,Inter,(\d+)/)?.[1];

    expect(lines).toHaveLength(ORDINARY_ARCHETYPES.length);
    expect(styleFontSize).toBe('106');
    for (const line of lines) {
      expect(line).toContain('\\an2\\pos(508,1517)');
      expect(line).not.toMatch(/\\fs\d/);
      expect(line).not.toContain('Instrument Serif');
    }
  });

  it('keeps fullscreen-quote as the sole centered serif hero exception', () => {
    const words: WordInput[] = [
      { text: 'ordinary', start: 0.1, end: 0.4 },
      { text: 'hero', start: 1.1, end: 1.4, emphasis: 'emphasis' },
      { text: 'returns', start: 2.1, end: 2.4 },
    ];
    const archetypeWindows: ArchetypeWindow[] = [
      { startTime: 0, endTime: 1, archetype: 'talking-head' },
      { startTime: 1, endTime: 2, archetype: 'fullscreen-quote' },
      { startTime: 2, endTime: 3, archetype: 'fullscreen-image' },
    ];
    const lines = dialogueLines(
      buildCaptionASSDocument(
        words,
        { ...STYLE, captionMode: 'emphasis' },
        {
          position: { x: 42, y: 73 },
          archetypeWindows,
        },
      ),
    );

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('\\an2\\pos(454,1402)');
    expect(lines[1]).toContain('\\an5\\pos(540,960)');
    expect(lines[1]).toContain('\\fs155');
    expect(lines[1]).toContain('\\fnInstrument Serif\\i1\\1c&H000C1023\\bord0');
    expect(lines[1]).toContain('\\blur0');
    expect(lines[1]).not.toContain(DEFAULT_ACCENT.replace('#', ''));
    expect(lines[2]).toContain('\\an2\\pos(454,1402)');
    expect(lines[2]).not.toContain('\\fs');
    expectNoEventOverlap(lines);
  });

  it('uses half-open adjacent windows and the most recently started overlapping window', () => {
    const adjacent = dialogueLines(
      buildCaptionASSDocument([{ text: 'boundary', start: 0.9, end: 1.1 }], STYLE, {
        archetypeWindows: [
          { startTime: 0, endTime: 1, archetype: 'talking-head' },
          { startTime: 1, endTime: 2, archetype: 'fullscreen-quote' },
        ],
      }),
    )[0];
    expect(adjacent).toContain('\\fnInstrument Serif');

    const overlapping = dialogueLines(
      buildCaptionASSDocument(
        [
          { text: 'latest', start: 1.1, end: 1.3 },
          { text: 'fallback', start: 1.6, end: 1.8 },
        ],
        STYLE,
        {
          archetypeWindows: [
            { startTime: 1, endTime: 1.5, archetype: 'fullscreen-quote' },
            { startTime: 0, endTime: 2, archetype: 'talking-head' },
          ],
        },
      ),
    );
    expect(overlapping[0]).toContain('\\fnInstrument Serif');
    expect(overlapping[1]).not.toContain('\\fnInstrument Serif');
  });
});

describe('single-pass timing', () => {
  it('never overlaps across ordinary/hero boundaries or shot-style changes', () => {
    const words: WordInput[] = [
      { text: 'one', start: 0.1, end: 0.35 },
      { text: 'two', start: 0.4, end: 0.65, emphasis: 'emphasis' },
      { text: 'quote', start: 0.7, end: 0.95 },
      { text: 'back', start: 1, end: 1.2 },
      { text: 'accent', start: 1.25, end: 1.45, emphasis: 'emphasis' },
    ];
    const archetypeWindows: ArchetypeWindow[] = [
      { startTime: 0, endTime: 0.68, archetype: 'talking-head' },
      { startTime: 0.68, endTime: 0.98, archetype: 'fullscreen-quote' },
      { startTime: 0.98, endTime: 2, archetype: 'fullscreen-image' },
    ];
    const shotOverrides: ShotCaptionOverride[] = [
      {
        startTime: 1.2,
        endTime: 2,
        style: { ...STYLE, captionMode: 'emphasis_highlight', accentColor: '#ff0000' },
      },
    ];
    const lines = dialogueLines(
      buildCaptionASSDocument(
        words,
        { ...STYLE, captionMode: 'emphasis' },
        {
          archetypeWindows,
          shotOverrides,
        },
      ),
    );

    expect(lines.length).toBeGreaterThanOrEqual(4);
    expectNoEventOverlap(lines);
  });

  it('applies lead-in, lead-out, and minimum emphasis dwell once', () => {
    const standardLines = buildAssLines(
      [
        { text: 'first', start: 1, end: 1.2 },
        { text: 'second', start: 2, end: 2.1 },
      ],
      'standard',
      DEFAULT_ACCENT,
      1,
    );
    expect(eventTimes(standardLines[0])).toEqual({ start: 0.92, end: 1.4 });
    expect(eventTimes(standardLines[1])).toEqual({ start: 1.92, end: 2.3 });

    const [emphasisLine] = buildAssLines(
      [{ text: 'fast', start: 0.1, end: 0.15, emphasis: 'emphasis' }],
      'emphasis',
      DEFAULT_ACCENT,
      1,
    );
    expect(eventTimes(emphasisLine).start).toBe(0.02);
    expect(eventTimes(emphasisLine).end).toBe(0.1 + MIN_EMPHASIS_DWELL_SECONDS);
  });

  it('snapshots a complete ordinary-to-hero document', () => {
    const document = buildCaptionASSDocument(
      [
        { text: 'stable', start: 0.1, end: 0.4 },
        { text: 'quote', start: 1.1, end: 1.4 },
      ],
      STYLE,
      {
        position: { x: 45, y: 80 },
        archetypeWindows: [
          { startTime: 0, endTime: 1, archetype: 'talking-head' },
          { startTime: 1, endTime: 2, archetype: 'fullscreen-quote' },
        ],
      },
    );
    expect(document).toMatchSnapshot();
  });
});
