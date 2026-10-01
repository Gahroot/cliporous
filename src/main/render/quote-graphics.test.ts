import { describe, expect, it, vi } from 'vitest';
import { pickQuoteProp, quotePropAppearSec, quotePropCues } from './quote-graphics';

const words = (text: string, start = 10, step = 0.3) =>
  text
    .split(' ')
    .map((w, i) => ({ text: w, start: start + i * step, end: start + i * step + 0.25 }));

describe('pickQuoteProp', () => {
  it('labels deterministic quote-card motifs separately from planner choices', () => {
    const observe = vi.fn();
    expect(
      pickQuoteProp(words('AI drives this business'), { startTime: 10, endTime: 20 }, observe)
        ?.prop,
    ).toBe('chip');
    expect(observe).toHaveBeenCalledWith({
      stage: 'quote-prop',
      action: 'accepted',
      reason: 'deterministic-keyword',
      prop: 'chip',
    });
    expect(JSON.stringify(observe.mock.calls)).not.toContain('business');
  });
  it.each([
    ['That one idea changed everything', 'lightbulb', 2],
    ['Stop chasing money and build a system', 'coins', 2],
    ['Every deadline is a choice you made', 'hourglass', 1],
    ['The secret is that nobody knows', 'key', 1],
  ])('"%s" → %s on word %i', (text, prop, wordIdx) => {
    const ws = words(text);
    const pick = pickQuoteProp(ws, { startTime: 10, endTime: 20 });
    expect(pick?.prop).toBe(prop);
    expect(pick?.wordStart).toBe(ws[wordIdx]?.start);
  });

  it('returns null when nothing in the quote names a prop', () => {
    expect(
      pickQuoteProp(words('Just keep going no matter what'), { startTime: 10, endTime: 20 }),
    ).toBeNull();
  });

  it('only reads words inside the window', () => {
    const ws = [...words('idea', 5), ...words('just keep going', 10)];
    expect(pickQuoteProp(ws, { startTime: 10, endTime: 20 })).toBeNull();
  });

  it('picks the reversed action for burnout words', () => {
    const pick = pickQuoteProp(words('I was completely drained by it'), {
      startTime: 10,
      endTime: 20,
    });
    expect(pick).toMatchObject({ prop: 'battery', tone: 'down' });
  });
});

describe('quotePropAppearSec', () => {
  it('keeps the named word time inside the card', () => {
    expect(quotePropAppearSec(12.5, { startTime: 10, endTime: 16 })).toBe(2.5);
  });
  it('never pops in on the cut frame', () => {
    expect(quotePropAppearSec(10, { startTime: 10, endTime: 16 })).toBe(0.15);
  });
  it('leaves room for the entrance before the card ends', () => {
    expect(quotePropAppearSec(15.9, { startTime: 10, endTime: 16 })).toBe(5.4);
  });
});

describe('quotePropCues', () => {
  it('drops the impact cue if it would land after the card', () => {
    const cues = quotePropCues({ prop: 'coins', wordStart: 0 }, 15.8, 16);
    expect(cues.map((c) => c.kind)).toEqual(['whoosh']);
  });
});
