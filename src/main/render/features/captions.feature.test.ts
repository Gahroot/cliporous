import { describe, expect, it } from 'vitest';
import type { WordInput } from '../../captions';
import { resolveCaptionMode } from './captions.feature';

const emphasized: WordInput[] = [{ text: 'big', start: 0, end: 0.4, emphasis: 'emphasis' }];
const base = { fontSize: 0.065, wordsPerLine: 4 };

describe('resolveCaptionMode', () => {
  it.each([
    'standard',
    'emphasis',
    'emphasis_highlight',
    'editorial',
  ] as const)('keeps an explicit %s mode', (captionMode) => {
    expect(resolveCaptionMode({ ...base, captionMode, accentColor: '#9f75ff' }, emphasized)).toBe(
      captionMode,
    );
  });

  it('infers emphasis_highlight from an accent when no mode is set', () => {
    expect(resolveCaptionMode({ ...base, accentColor: '#9f75ff' }, emphasized)).toBe(
      'emphasis_highlight',
    );
  });
});
