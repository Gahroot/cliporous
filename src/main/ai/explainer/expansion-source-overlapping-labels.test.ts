import { describe, expect, it } from 'vitest';
import { expansionAssertedRelation } from './expansion-source-contract';

const labels = ['Actor', 'result', 'disputed', 'revealed', 'not-revealed'];
const body = /Actor states result is disputed between revealed and not-revealed/iu;
describe('source-bound overlapping names do not become grammar after partial masking', () => {
  for (const order of [labels, [...labels].reverse()]) {
    it(`retains the complete authored negative status with ${order[0]} first`, () => {
      expect(
        expansionAssertedRelation(
          'Actor states result is disputed between revealed and not-revealed.',
          body,
          undefined,
          order,
        ),
      ).toBe(true);
    });
  }
  it('still rejects an extra modal outside the validated source names', () => {
    expect(
      expansionAssertedRelation(
        'Actor may states result is disputed between revealed and not-revealed.',
        /Actor(?: may)? states result is disputed between revealed and not-revealed/iu,
        undefined,
        labels,
      ),
    ).toBe(false);
  });
  it('still rejects genuine negation outside the authored status name', () => {
    expect(
      expansionAssertedRelation(
        'Actor states result is not disputed between revealed and not-revealed.',
        /Actor states result is(?: not)? disputed between revealed and not-revealed/iu,
        undefined,
        labels,
      ),
    ).toBe(false);
  });
});
