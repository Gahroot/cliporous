import { describe, expect, it } from 'vitest';
import { stabilizeShortFormClipBoundary } from './clip-boundaries';
import type { WordTimestamp } from './types';

const words: WordTimestamp[] = [
  { text: 'Earlier.', start: 0, end: 0.8 },
  { text: 'This', start: 1, end: 1.3 },
  { text: 'is', start: 1.4, end: 1.6 },
  { text: 'a', start: 1.8, end: 2 },
  { text: 'complete', start: 2.1, end: 2.5 },
  { text: 'thought.', start: 2.6, end: 3 },
  { text: 'Next', start: 3.5, end: 3.8 },
];

describe('stabilizeShortFormClipBoundary', () => {
  it('snaps off mid-word timestamps and keeps onset/tail room', () => {
    expect(stabilizeShortFormClipBoundary(1.05, 2.9, words, 10)).toEqual({
      startTime: 0.9,
      endTime: 3.25,
    });
  });

  it('extends an unfinished ending to the next complete thought', () => {
    const boundary = stabilizeShortFormClipBoundary(1, 2, words, 10);

    expect(boundary.endTime).toBe(3.25);
  });

  it('never extends beyond the source duration', () => {
    const boundary = stabilizeShortFormClipBoundary(1, 2.9, words, 3.1);

    expect(boundary.endTime).toBe(3.1);
  });

  it('leaves ranges without overlapping words unchanged', () => {
    expect(stabilizeShortFormClipBoundary(8, 9, words, 10)).toEqual({
      startTime: 8,
      endTime: 9,
    });
  });
});
