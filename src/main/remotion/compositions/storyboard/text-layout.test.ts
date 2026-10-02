import { describe, expect, it } from 'vitest';
import { counterText, textAdvance, wrapBoardText } from './text-layout';

describe('authored text and source-exact counters', () => {
  it('keeps values and units exact without locale-dependent formatting or a fabricated count origin', () => {
    expect(counterText(12345.67, 'credits')).toBe('12345.67 credits');
    expect(counterText(-2.5, 'percent')).toBe('-2.5 percent');
    expect(counterText(0, '')).toBe('0');
    expect(counterText(-0, 'units')).toBe('0 units');
    for (const value of [NaN, Infinity, -Infinity])
      expect(() => counterText(value, 'units')).toThrow(/finite/);
  });
  it('wraps bounded words, explicit newlines, long tokens and Unicode without discarding facts', () => {
    for (const text of [
      'A bounded comparison with a long label',
      'longunbrokentokenthatmustwrap',
      'model\ntraining',
      '住宅の説明とモデル',
    ]) {
      for (const mono of [false, true]) {
        const lines = wrapBoardText(text, 30, 160, mono);
        expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
        expect(lines.every((line) => textAdvance(line, 30, mono) <= 160)).toBe(true);
        expect(wrapBoardText(text, 30, 160, mono)).toEqual(lines);
      }
    }
    expect(wrapBoardText('one\n\ntwo', 30)).toEqual(['one', '', 'two']);
    expect(() => wrapBoardText('unsafe bounds', 30, 5)).toThrow(/width/);
  });
});
