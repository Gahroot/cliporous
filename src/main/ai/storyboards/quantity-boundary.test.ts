import { describe, expect, it } from 'vitest';
import { compileStoryboardSpec } from './compiler';
import { boardFixture } from './fixtures';

function quantity(
  source: string,
  value: number,
  evidence?: string,
): ReturnType<typeof compileStoryboardSpec> {
  const fixture = boardFixture('quantity');
  const panel = fixture.spec.panels[0];
  if (panel.kind !== 'quantity') throw new Error('Expected quantity fixture');
  fixture.words[panel.evidence.startWord].text = source;
  panel.evidence.text = evidence ?? `${source} minutes`;
  panel.value = value;
  return compileStoryboardSpec(fixture.spec, fixture.words, {
    clipStart: 0,
    clipEnd: fixture.duration,
  });
}

describe('exact source quantity characters', () => {
  it('does not drop a Unicode minus sign and invert the source fact', () => {
    expect(quantity('−12', 12).ok).toBe(false);
    expect(quantity('−12', -12).ok).toBe(true);
  });
  it('preserves meaningful signs in ordinary source-bound text too', () => {
    const fixture = boardFixture('statement');
    const panel = fixture.spec.panels[0];
    if (panel.kind !== 'statement') throw new Error('Expected statement fixture');
    fixture.words[panel.body.startWord].text = '1.2';
    panel.body.text = '1 2 related ideas on one canvas';
    expect(
      compileStoryboardSpec(fixture.spec, fixture.words, {
        clipStart: 0,
        clipEnd: fixture.duration,
      }).ok,
    ).toBe(false);
  });
  it('does not let normalized model labels erase a source sign', () => {
    expect(quantity('-12', 12, '12 minutes').ok).toBe(false);
    expect(quantity('-12', -12, '12 minutes').ok).toBe(false);
  });
  it('rejects numeric precision loss instead of rendering a rounded invented value', () => {
    expect(quantity('9007199254740993', Number('9007199254740993')).ok).toBe(false);
    expect(quantity('0.1234567890123456789', Number('0.1234567890123456789')).ok).toBe(false);
    expect(quantity('12.50', 12.5).ok).toBe(true);
    expect(quantity('1,200', 1200).ok).toBe(true);
  });
  it('does not extract an ASCII suffix from a different Unicode numeral', () => {
    expect(quantity('１2', 2).ok).toBe(false);
    expect(quantity('½2', 2).ok).toBe(false);
  });
});
