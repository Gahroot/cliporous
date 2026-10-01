import { describe, expect, it } from 'vitest';
import type { PlanningEvent } from './planning-diagnostics';
import { selectQuoteWindows } from './quote-selection';

const words =
  'Today we tested the idea and learned test the need before building anything new tomorrow'
    .split(' ')
    .map((text, i) => ({ text, start: i * 0.7, end: i * 0.7 + 0.6 }));
const bounds = { minStart: 2, maxEnd: 12 };
const quote = {
  startWord: 7,
  endWord: 11,
  text: 'test the need before building',
  reason: 'takeaway',
};

describe('source-backed optional full-screen emphasis', () => {
  it('accepts zero selections without creating a quote from uppercase or stressed words', () => {
    expect(selectQuoteWindows({ quotes: [] }, words, bounds)).toEqual([]);
    expect(selectQuoteWindows({ scenes: [] }, words, bounds)).toEqual([]);
  });
  it('binds exact words and derives timing instead of trusting returned seconds', () => {
    const result = selectQuoteWindows({ quotes: [quote] }, words, bounds);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(quote);
    expect(result[0].startTime).toBeCloseTo(4.9);
    expect(result[0].endTime).toBeCloseTo(8.3);
  });
  it.each([
    { ...quote, text: 'TEST THE NEED BEFORE BUILDING' },
    { ...quote, text: 'invented central lesson' },
    { ...quote, reason: 'uppercase' },
    { ...quote, startWord: 0, endWord: 4, text: 'Today we tested the idea' },
    { ...quote, startWord: 7.2 },
    { ...quote, endWord: 999 },
    { ...quote, startTime: 4, endTime: 9 },
    { ...quote, endWord: 14, text: 'test the need before building anything new tomorrow' },
  ])('rejects unsupported, opening, excessive or manually timed candidate %#', (candidate) => {
    expect(selectQuoteWindows({ quotes: [candidate] }, words, bounds)).toEqual([]);
  });
  it('rejects overlap with animation windows without modifying valid scenes', () => {
    const scenes = [{ startTime: 4, endTime: 9 }];
    expect(selectQuoteWindows({ quotes: [quote] }, words, bounds, scenes)).toEqual([]);
    expect(scenes).toEqual([{ startTime: 4, endTime: 9 }]);
  });
  it('caps quotes without imposing a quota and diagnoses every extra', () => {
    const events: PlanningEvent[] = [];
    const result = selectQuoteWindows(
      { quotes: [quote, quote, quote] },
      words,
      bounds,
      [],
      (event) => events.push(event),
    );
    expect(result).toHaveLength(1);
    expect(events.filter((e) => e.action === 'rejected')).toHaveLength(2);
  });
  it('requires separation on longer clips and never exceeds the versioned ceiling', () => {
    const repeated = Array.from({ length: 240 }, (_, i) => ({
      text: `w${i}`,
      start: i,
      end: i + 0.8,
    }));
    const q = (startWord: number) => ({
      startWord,
      endWord: startWord + 3,
      text: repeated
        .slice(startWord, startWord + 4)
        .map((w) => w.text)
        .join(' '),
      reason: 'central-claim',
    });
    const result = selectQuoteWindows({ quotes: [q(4), q(10), q(30), q(60), q(90)] }, repeated, {
      minStart: 2,
      maxEnd: 240,
    });
    expect(result.map((q) => q.startWord)).toEqual([4, 30, 60]);
  });
});
