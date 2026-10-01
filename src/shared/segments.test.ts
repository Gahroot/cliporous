import { describe, expect, it } from 'vitest';
import { assignArchetypesDeterministic, splitIntoSegments } from './segments';
import type { Archetype, SegmentStyleCategory, WordTimestamp } from './types';

function ordinaryWords(start: number, sentences = 15): WordTimestamp[] {
  const sentence = ['Next', 'we', 'review', 'the', 'current', 'process.'];
  return Array.from({ length: sentences * sentence.length }, (_, i) => ({
    text: sentence[i % sentence.length],
    start: start + i * 0.5,
    end: start + (i + 1) * 0.5,
  }));
}

// segmentingStage passes source-time words; stitchedSegmentingPass passes words
// remapped from disjoint source ranges onto a concatenated, clip-local timeline.
const routeFixtures = [
  { route: 'contiguous', words: ordinaryWords(120), start: 120, end: 165 },
  {
    route: 'stitched',
    words: [
      ...ordinaryWords(120, 7).map((word) => ({
        ...word,
        start: word.start - 120,
        end: word.end - 120,
      })),
      ...ordinaryWords(360, 8).map((word) => ({
        ...word,
        start: 21 + word.start - 360,
        end: 21 + word.end - 360,
      })),
    ],
    start: 0,
    end: 45,
  },
];

const categories: Record<Archetype, SegmentStyleCategory> = {
  'talking-head': 'main-video',
  'tight-punch': 'main-video',
  'wide-breather': 'main-video',
  'quote-lower': 'main-video-text',
  'split-image': 'main-video-images',
  'fullscreen-image': 'fullscreen-image',
  'fullscreen-quote': 'fullscreen-text',
};

const legacyWithMedia: Archetype[] = [
  'tight-punch',
  'split-image',
  'fullscreen-quote',
  'talking-head',
  'split-image',
  'fullscreen-image',
  'tight-punch',
  'wide-breather',
  'split-image',
  'split-image',
  'fullscreen-quote',
  'talking-head',
  'tight-punch',
  'fullscreen-image',
  'talking-head',
];
const legacyWithoutMedia: Archetype[] = [
  'tight-punch',
  'fullscreen-quote',
  'fullscreen-quote',
  'talking-head',
  'tight-punch',
  'fullscreen-quote',
  'tight-punch',
  'wide-breather',
  'quote-lower',
  'quote-lower',
  'tight-punch',
  'fullscreen-quote',
  'tight-punch',
  'wide-breather',
  'talking-head',
];

describe.each(routeFixtures)('$route route helper input', ({ route, words, start, end }) => {
  it('never assigns a fullscreen quote to ordinary speech merely by rotation', () => {
    const raw = splitIntoSegments(route, words);
    const segments = assignArchetypesDeterministic(raw, true);
    const archetypes = segments.map((segment) => segment.archetype);

    expect(segments).toHaveLength(15);
    expect(segments[0].startTime).toBe(start);
    expect(segments.at(-1)?.endTime).toBe(end);
    expect(segments.flatMap((segment) => segment.words)).toEqual(words);
    expect(archetypes).not.toContain('fullscreen-quote');
    expect(archetypes).toEqual(
      expect.arrayContaining(['split-image', 'fullscreen-image', 'wide-breather']),
    );
    expect(archetypes[0]).toBe('tight-punch');
    expect(archetypes.at(-1)).toBe('talking-head');
  });

  it('keeps media-disabled fallback usable without fullscreen quotes or unavailable b-roll', () => {
    const segments = assignArchetypesDeterministic(splitIntoSegments(route, words), false);
    const archetypes = segments.map((segment) => segment.archetype);

    expect(segments).toHaveLength(15);
    expect(segments.flatMap((segment) => segment.words)).toEqual(words);
    for (const archetype of archetypes) {
      expect(['talking-head', 'tight-punch', 'wide-breather', 'quote-lower']).toContain(archetype);
    }
    expect(archetypes).toContain('quote-lower');
    expect(archetypes).toContain('wide-breather');
    expect(archetypes[0]).toBe('tight-punch');
    expect(archetypes.at(-1)).toBe('talking-head');
  });

  it.each([
    true,
    false,
  ])('defaults to deterministic content-led assignment (media: %s)', (media) => {
    const raw = splitIntoSegments(route, words);
    const before = structuredClone(raw);
    const segments = assignArchetypesDeterministic(raw, media);

    expect(segments).toEqual(assignArchetypesDeterministic(raw, media, 'content-led'));
    expect(segments).toEqual(assignArchetypesDeterministic(raw, media));
    expect(raw).toEqual(before);
    segments.forEach((segment, i) => {
      expect(segment).not.toBe(raw[i]);
      expect(segment).toEqual({
        ...raw[i],
        archetype: segment.archetype,
        segmentStyleCategory: categories[segment.archetype],
      });
    });
  });

  it.each([
    { media: true, expected: legacyWithMedia },
    { media: false, expected: legacyWithoutMedia },
  ])('preserves the complete legacy opening and body with explicit baseline (media: $media)', ({
    media,
    expected,
  }) => {
    const segments = assignArchetypesDeterministic(
      splitIntoSegments(route, words),
      media,
      'baseline',
    );
    expect(segments.map((segment) => segment.archetype)).toEqual(expected);
    expect(segments.map((segment) => segment.segmentStyleCategory)).toEqual(
      expected.map((archetype) => categories[archetype]),
    );
  });
});

describe.each(['baseline', 'content-led'] as const)('%s safety', (policy) => {
  it.each([
    true,
    false,
  ])('keeps short-clip endpoints and long rotations safe (media: %s)', (media) => {
    const template = splitIntoSegments('clip', ordinaryWords(0, 1))[0];
    for (const count of [0, 1, 2, 3, 5, 15, 60]) {
      const raw = Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `segment-${index}`,
        index,
        startTime: index * 3,
        endTime: (index + 1) * 3,
        words: template.words.map((word) => ({
          ...word,
          start: word.start + index * 3,
          end: word.end + index * 3,
        })),
      }));
      const segments = assignArchetypesDeterministic(raw, media, policy);
      expect(segments).toHaveLength(count);
      if (count > 0) expect(segments.at(-1)?.archetype).toBe('talking-head');
      if (count > 1) expect(segments[0].archetype).toBe('tight-punch');
      if (policy === 'content-led') {
        expect(segments.map((segment) => segment.archetype)).not.toContain('fullscreen-quote');
      }
      if (!media) {
        expect(segments.map((segment) => segment.archetype)).not.toContain('split-image');
        expect(segments.map((segment) => segment.archetype)).not.toContain('fullscreen-image');
      }
      // The forced talking-head close is exempt from the category streak guard.
      for (let i = 2; i < count - 1; i++) {
        expect(
          new Set(segments.slice(i - 2, i + 1).map((segment) => segment.segmentStyleCategory)).size,
        ).toBeGreaterThan(1);
      }
    }
  });
});
