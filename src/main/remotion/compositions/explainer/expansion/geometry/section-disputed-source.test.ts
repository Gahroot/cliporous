import { expect, it } from 'vitest';
import { isRec } from '../../../../../ai/explainer/kind-spec';
import { sectionAccepted, sectionMaximum } from './section-unfold-test-fixtures';

it('authored disputed section alternatives are two distinct permitted values, not a resolved value', () => {
  const source = sectionMaximum('box', 'disputed');
  const raw = source.proposal;
  const records = [...(Array.isArray(raw.parts) ? raw.parts : []), raw.section, raw.result];
  for (const record of records) {
    expect(isRec(record)).toBe(true);
    if (!isRec(record)) throw new Error('Missing authored fact');
    expect(record.value, String(record.claim)).toBeUndefined();
    expect(record.alternatives, String(record.claim)).toHaveLength(2);
    expect(new Set(record.alternatives as string[]).size, String(record.claim)).toBe(2);
  }
  if (!isRec(raw.result) || !isRec(raw.result.evidence))
    throw new Error('Missing result source span');
  const span = raw.result.evidence;
  if (typeof span.fromWord !== 'number' || typeof span.toWord !== 'number')
    throw new Error('Malformed span');
  const clause = source.words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
  expect(clause).toContain('disputed between revealed and not-revealed');
  expect(sectionAccepted(source).storyId).toBe('57');
});
