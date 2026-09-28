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

  it('moves a mid-sentence start back to the start of its sentence', () => {
    // Starting on "a" would open with "a complete thought."
    const boundary = stabilizeShortFormClipBoundary(1.8, 2.9, words, 10);

    expect(boundary.startTime).toBe(0.9);
  });

  it('keeps a start that already begins a sentence', () => {
    expect(stabilizeShortFormClipBoundary(3.5, 3.8, words, 10).startTime).toBeCloseTo(3.38, 2);
  });

  it('does not pull a start back further than six seconds', () => {
    const runOn: WordTimestamp[] = Array.from({ length: 40 }, (_, i) => ({
      text: `w${i}`,
      start: i * 0.3,
      end: i * 0.3 + 0.25,
    }));
    // No sentence start within 6s of word 30 (t=9.0) — keep the requested word.
    expect(stabilizeShortFormClipBoundary(9.0, 10, runOn, 20).startTime).toBeCloseTo(8.975, 3);
  });

  describe('real stitched range ("The objective is not to remove people…")', () => {
    const transcript: WordTimestamp[] = [
      { text: 'matters.', start: 524.8, end: 525.2 },
      { text: 'The', start: 525.44, end: 525.6 },
      { text: 'objective', start: 525.6, end: 526.16 },
      { text: 'is', start: 526.16, end: 526.48 },
      { text: 'not', start: 526.48, end: 526.72 },
      { text: 'to', start: 526.72, end: 526.88 },
      { text: 'remove', start: 526.88, end: 527.44 },
      { text: 'people', start: 527.44, end: 527.76 },
      { text: 'asking,', start: 538.08, end: 538.48 },
      { text: 'where', start: 538.72, end: 538.88 },
      { text: 'can', start: 539.04, end: 539.2 },
      { text: 'we', start: 539.2, end: 539.36 },
      { text: 'even', start: 539.36, end: 539.6 },
      { text: 'use', start: 539.6, end: 539.84 },
      { text: 'AI?', start: 539.84, end: 540.32 },
      { text: "I'd", start: 540.48, end: 540.8 },
      { text: 'ask,', start: 540.8, end: 541.12 },
      { text: 'where', start: 541.28, end: 541.44 },
      { text: 'are', start: 541.6, end: 541.84 },
      { text: 'expensive', start: 541.84, end: 542.48 },
      { text: 'people', start: 542.48, end: 542.72 },
      { text: 'repeatedly', start: 542.72, end: 543.44 },
      { text: 'just', start: 543.44, end: 543.68 },
      { text: 'chasing', start: 543.68, end: 544.24 },
      { text: 'information?', start: 544.24, end: 544.8 },
      { text: "Where's", start: 544.96, end: 545.44 },
      { text: 'the', start: 545.44, end: 545.6 },
      { text: 'same', start: 545.6, end: 545.92 },
      { text: 'information', start: 545.92, end: 546.48 },
      { text: 'being', start: 546.48, end: 546.8 },
      { text: 'reconstructed', start: 546.8, end: 547.44 },
    ];

    it('opens on "The objective", not "remove people"', () => {
      const b = stabilizeShortFormClipBoundary(526.88, 540.4, transcript, 600);
      expect(b.startTime).toBeCloseTo(525.32, 2);
    });

    it('keeps the answer after a closing question when it ends the clip', () => {
      const b = stabilizeShortFormClipBoundary(526.88, 540.4, transcript, 600, {
        finalRange: true,
      });
      // Through "…chasing information?" — the next sentence runs past the budget.
      expect(b.endTime).toBeCloseTo(544.88, 2);
    });

    it('stops on the question when more ranges follow', () => {
      const b = stabilizeShortFormClipBoundary(526.88, 540.4, transcript, 600);
      expect(b.endTime).toBeCloseTo(540.4, 2);
    });
  });

  it('leaves ranges without overlapping words unchanged', () => {
    expect(stabilizeShortFormClipBoundary(8, 9, words, 10)).toEqual({
      startTime: 8,
      endTime: 9,
    });
  });
});
