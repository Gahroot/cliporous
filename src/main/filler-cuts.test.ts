import { describe, expect, it } from 'vitest';
import { buildAppliedCutSegments, buildKeepSegments, remapWordTimestamps } from './filler-cuts';
import type { FillerSegment } from './filler-detection';

const detectedSilence: FillerSegment = {
  start: 12,
  end: 14,
  type: 'silence',
  label: '2.00s pause',
};

describe('applied filler-cut timeline', () => {
  it('remaps against the padded cut that was encoded, not the raw detection', () => {
    const keepSegments = buildKeepSegments(10, 20, [detectedSilence], {
      paddingHead: 0.1,
      paddingTail: 0.2,
      mergeGapThreshold: 0.3,
    });
    const appliedCuts = buildAppliedCutSegments(10, 20, keepSegments);

    expect(appliedCuts).toEqual([
      { start: 12.2, end: 13.9, type: 'silence', label: 'applied edit' },
    ]);

    const [word] = remapWordTimestamps(
      [{ text: 'after', start: 14.2, end: 14.6 }],
      10,
      20,
      appliedCuts,
    );
    expect(word.start).toBeCloseTo(2.5, 6);
    expect(word.end).toBeCloseTo(2.9, 6);
  });

  it('returns no applied cut when micro-cut merging keeps the gap', () => {
    const keepSegments = buildKeepSegments(10, 20, [detectedSilence], {
      paddingHead: 0.1,
      paddingTail: 0.2,
      mergeGapThreshold: 2,
    });

    expect(buildAppliedCutSegments(10, 20, keepSegments)).toEqual([]);
  });
});
