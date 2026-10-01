import { describe, expect, it } from 'vitest';
import { LONGFORM_SECTION_POLICY, partitionLongformSections } from './longform-sections';

function words(count: number, step = 0.5, punctuation = true) {
  return Array.from({ length: count }, (_, index) => ({
    text: `word${index}${punctuation && index % 20 === 19 ? '.' : ''}`,
    start: index * step,
    end: index * step + step * 0.8,
  }));
}

describe('bounded long-form sections', () => {
  it.each([
    0.05, 0.25, 0.5, 2,
  ])('owns every global word once with bounded context at %ss/word', (step) => {
    const source = words(2_000, step);
    const sections = partitionLongformSections(source);
    expect(
      sections.flatMap((section) =>
        Array.from(
          { length: section.endWord - section.startWord + 1 },
          (_, i) => section.startWord + i,
        ),
      ),
    ).toEqual(source.map((_, i) => i));
    for (const section of sections) {
      expect(section.endTime - section.startTime).toBeLessThanOrEqual(120);
      expect(section.endWord - section.startWord + 1).toBeLessThanOrEqual(600);
      expect(section.startWord - section.contextStartWord).toBeLessThanOrEqual(80);
      expect(section.contextEndWord - section.endWord).toBeLessThanOrEqual(80);
      expect(section.startTime - source[section.contextStartWord].start).toBeLessThanOrEqual(15);
      expect(source[section.contextEndWord].end - section.endTime).toBeLessThanOrEqual(15);
    }
    expect(partitionLongformSections(source)).toEqual(sections);
  });
  it('prefers a sentence near 90 seconds, and a pause without punctuation', () => {
    const source = words(1_000);
    expect(partitionLongformSections(source)[0].endWord).toBe(179);
    const paused = words(1_000, 0.5, false).map((word, i) => ({
      ...word,
      start: word.start + (i >= 180 ? 1 : 0),
      end: word.end + (i >= 180 ? 1 : 0),
    }));
    expect(partitionLongformSections(paused)[0].endWord).toBe(179);
  });
  it('bounds uninterrupted speech by both hard limits and returns no empty sections', () => {
    for (const step of [0.05, 0.5]) {
      const source = words(1_300, step, false);
      for (const section of partitionLongformSections(source)) {
        expect(section.endWord - section.startWord + 1).toBeLessThanOrEqual(
          LONGFORM_SECTION_POLICY.hardWords,
        );
        expect(section.endTime - section.startTime).toBeLessThanOrEqual(
          LONGFORM_SECTION_POLICY.hardSeconds,
        );
      }
    }
    expect(partitionLongformSections([])).toEqual([]);
  });
});
