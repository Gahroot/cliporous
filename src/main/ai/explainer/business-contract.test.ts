import { describe, expect, it } from 'vitest';
import type {
  BusinessIdentity,
  QuantityBasis,
} from '../../remotion/compositions/explainer/business/types';
import {
  boundedBusinessInput,
  businessEvidence,
  businessIdentity,
  businessSpan,
  compatibleQuantityBases,
  quantityBasis,
  taskOwnership,
  versionedIdentity,
} from './business-contract';
import { financeClaim, moneyPattern } from './finance-contract';
import { makeParseContext } from './kind-spec';

function context(text: string) {
  const words = text.split(/\s+/u).map((word, index) => ({
    text: word,
    start: index * 0.12,
    end: index * 0.12 + 0.1,
  }));
  return makeParseContext(words, {
    startWord: 0,
    endWord: words.length - 1,
    startTime: 0,
    endTime: Math.max(8, words.length * 0.12),
  });
}
const source = (toWord: number) => ({ fromWord: 0, toWord });
const identity = (id: string, label: string): BusinessIdentity => ({
  id,
  label,
  source: source(0),
});

const OWNERSHIP_TEXT =
  'Ada performs Review. Bo approves Review. Cy remains accountable for Review.';
const PEOPLE = [
  identity('review', 'Review'),
  identity('ada', 'Ada'),
  identity('bo', 'Bo'),
  identity('cy', 'Cy'),
];
function ownership() {
  return {
    taskId: 'review',
    performerId: 'ada',
    approverId: 'bo',
    accountableOwnerId: 'cy',
    source: source(10),
  };
}

const BASIS_TEXT = 'Desk uses tasks per 10 requests in October.';
function basis() {
  return {
    subjectId: 'desk',
    population: 'requests',
    unit: 'tasks',
    period: 'October',
    denominator: 10,
    source: source(7),
  };
}

const PARSED_BASIS: QuantityBasis = {
  ...basis(),
};

describe('business JSON boundary', () => {
  it('accepts finite JSON without coercing or interpreting graphics', () => {
    expect(boundedBusinessInput({ label: 'Desk', states: [1, true, null] }, context('Desk'))).toBe(
      true,
    );
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
    undefined,
    1n,
    () => 1,
    Symbol('x'),
  ])('rejects non-JSON or nonfinite value %s', (value) =>
    expect(boundedBusinessInput({ value }, context('Desk'))).toBe(false));
  it('bounds depth, nodes, arrays, labels and serialized bytes', () => {
    const deep = { next: { next: { next: { next: { next: { next: { next: 1 } } } } } } };
    expect(boundedBusinessInput(deep, context('Desk'))).toBe(false);
    expect(
      boundedBusinessInput(
        Array.from({ length: 13 }, () => 0),
        context('Desk'),
      ),
    ).toBe(false);
    expect(boundedBusinessInput({ text: 'x'.repeat(513) }, context('Desk'))).toBe(false);
    const wide = Object.fromEntries(Array.from({ length: 520 }, (_, n) => [`key-${n}`, 1]));
    expect(boundedBusinessInput(wide, context('Desk'))).toBe(false);
    const bytes = Object.fromEntries(
      Array.from({ length: 40 }, (_, n) => [`key-${n}`, 'x'.repeat(500)]),
    );
    expect(boundedBusinessInput(bytes, context('Desk'))).toBe(false);
  });
  it('rejects cycles, sparse arrays, prototypes, keys and accessors without executing them', () => {
    const cycle: Record<string, unknown> = {};
    cycle.child = cycle;
    let read = false;
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        read = true;
        return 1;
      },
    });
    for (const raw of [
      cycle,
      new Date(),
      new Array(2),
      accessor,
      Object.defineProperty({}, 'unsupported', { value: 'hidden' }),
      JSON.parse('{"__proto__":{}}'),
    ])
      expect(boundedBusinessInput(raw, context('Desk'))).toBe(false);
    expect(read).toBe(false);
  });
});

describe('business source spans and identities', () => {
  it('requires own local labels and rejects actor evidence swaps and arbitrary fields', () => {
    const ctx = context('Ada owns Review. Bo owns Booking.');
    expect(businessIdentity({ id: 'ada', label: 'Ada', source: source(2) }, ctx)?.id).toBe('ada');
    expect(businessIdentity({ id: 'bo', label: 'Bo', source: source(2) }, ctx)).toBeNull();
    expect(businessIdentity({ id: 'Ada', label: 'Ada', source: source(2) }, ctx)).toBeNull();
    expect(
      businessIdentity({ id: 'ada', label: 'Ada', source: source(2), url: 'asset' }, ctx),
    ).toBeNull();
  });
  it.each([
    { fromWord: -1, toWord: 1 },
    { fromWord: 2, toWord: 1 },
    { fromWord: 0, toWord: Infinity },
    { fromWord: 0, toWord: '1' },
    { fromWord: 0, toWord: 100 },
    { fromWord: 0, toWord: 1, code: 'x' },
  ])('rejects malformed source span %s', (raw) => {
    expect(businessSpan(raw, context('Ada owns Review.'))).toBeNull();
  });
  it('caps evidence locality independently of whole-scene words', () => {
    expect(
      businessSpan(source(64), context(Array.from({ length: 70 }, () => 'Ada').join(' '))),
    ).toBeNull();
  });
});

describe('separate task roles', () => {
  it('accepts supported roles and refuses to infer approval or accountability', () => {
    const parsed = taskOwnership(ownership(), PEOPLE, context(OWNERSHIP_TEXT));
    expect(parsed).toEqual(ownership());
    for (const change of [
      { performerId: 'bo' },
      { approverId: 'ada' },
      { accountableOwnerId: 'ada' },
    ])
      expect(
        taskOwnership({ ...ownership(), ...change }, PEOPLE, context(OWNERSHIP_TEXT)),
      ).toBeNull();
    expect(
      taskOwnership({ ...ownership(), approverId: null }, PEOPLE, context(OWNERSHIP_TEXT)),
    ).toBeNull();
  });
  it('permits one named actor to fill multiple roles only with explicit separate source claims', () => {
    const ctx = context(
      'Ada performs Review. Ada approves Review. Ada remains accountable for Review.',
    );
    expect(
      taskOwnership({ ...ownership(), approverId: 'ada', accountableOwnerId: 'ada' }, PEOPLE, ctx),
    ).not.toBeNull();
  });
  it('preserves explicit absence of approval, but no implication from capability', () => {
    const ctx = context(
      'Ada performs Review. Review requires no approval. Cy remains accountable for Review.',
    );
    expect(
      taskOwnership({ ...ownership(), approverId: null, source: source(11) }, PEOPLE, ctx),
    ).not.toBeNull();
    const capable = context(
      'Ada can perform Review. Bo approves Review. Cy remains accountable for Review.',
    );
    expect(taskOwnership({ ...ownership(), source: source(11) }, PEOPLE, capable)).toBeNull();
  });
  it.each([
    'Ada never performs Review. Bo approves Review. Cy remains accountable for Review.',
    'Ada may perform Review. Bo approves Review. Cy remains accountable for Review.',
    'Ada performs Booking. Bo approves Review. Cy remains accountable for Review.',
    'Ada performs Review. Bo reviews Review. Cy remains accountable for Review.',
    'Bo performs Review. Ada approves Review. Cy remains accountable for Review.',
  ])('rejects unsupported actor/task relation %s', (text) => {
    expect(
      taskOwnership(
        { ...ownership(), source: source(text.split(' ').length - 1) },
        PEOPLE,
        context(text),
      ),
    ).toBeNull();
  });
});

describe('quantity bases', () => {
  it('binds subject, population, unit, denominator and period locally', () => {
    expect(quantityBasis(basis(), [identity('desk', 'Desk')], context(BASIS_TEXT))).toEqual(
      PARSED_BASIS,
    );
    expect(
      quantityBasis(
        { ...basis(), denominator: 100 },
        [identity('desk', 'Desk')],
        context(BASIS_TEXT),
      ),
    ).toBeNull();
    expect(
      quantityBasis(
        { ...basis(), denominator: 0 },
        [identity('desk', 'Desk')],
        context(BASIS_TEXT),
      ),
    ).toBeNull();
    expect(
      quantityBasis(
        { ...basis(), denominator: null },
        [identity('desk', 'Desk')],
        context(BASIS_TEXT),
      ),
    ).toBeNull();
  });
  it('does not borrow another subject or an unrelated numeric clause', () => {
    const ctx = context('Desk uses tasks in October. Other uses tasks per 10 requests in October.');
    expect(
      quantityBasis({ ...basis(), source: source(12) }, [identity('desk', 'Desk')], ctx),
    ).toBeNull();
  });
  it('accepts explicit unknown denominators but refuses numeric comparison', () => {
    const parsed = quantityBasis(
      { ...basis(), denominator: null },
      [identity('desk', 'Desk')],
      context('Desk uses tasks per unknown requests in October.'),
    );
    expect(parsed?.denominator).toBeNull();
    expect(parsed).not.toBeNull();
    if (parsed) expect(compatibleQuantityBases(parsed, parsed)).toBe(false);
  });
  it.each([
    { subjectId: 'other' },
    { population: 'firms' },
    { unit: 'tokens' },
    { period: 'November' },
    { denominator: 100 },
    { denominator: null },
  ])('does not silently compare incompatible bases %s', (change) => {
    expect(compatibleQuantityBases(PARSED_BASIS, { ...PARSED_BASIS, ...change })).toBe(false);
  });
  it('accepts only the same numeric basis', () => {
    expect(compatibleQuantityBases(PARSED_BASIS, { ...PARSED_BASIS, period: 'october' })).toBe(
      true,
    );
  });
});

describe('exact fractional money stays in its own source clause', () => {
  it('retains the supported basis around a fractional amount', () => {
    const value = 'Desk records 10.25 USD among 2 requests during June.';
    expect(
      quantityBasis(
        {
          subjectId: 'desk',
          population: 'requests',
          unit: 'USD',
          period: 'June',
          denominator: 2,
          source: source(8),
        },
        [identity('desk', 'Desk')],
        context(value),
      )?.denominator,
    ).toBe(2);
  });

  it('preserves cents without joining actors or discarding a negative claim', () => {
    const text = 'Desk paid 10.25 USD. Other never paid 20.25 USD.';
    expect(
      financeClaim(text, `\\bDesk paid ${moneyPattern({ minorUnits: 1025, currency: 'USD' })}`),
    ).toBe(true);
    expect(
      financeClaim(text, `\\bDesk paid ${moneyPattern({ minorUnits: 2025, currency: 'USD' })}`),
    ).toBe(false);
    expect(
      financeClaim(
        text,
        `\\bOther never paid ${moneyPattern({ minorUnits: 2025, currency: 'USD' })}`,
      ),
    ).toBe(false);
  });
});

describe('conditional quantity bases remain qualified data', () => {
  const text = 'If approved, Desk may record 100 USD among 2 requests during June.';
  const lastWord = text.split(/\s+/u).length - 1;
  const raw = {
    subjectId: 'desk',
    population: 'requests',
    unit: 'USD',
    period: 'June',
    denominator: 2,
    source: { fromWord: 2, toWord: lastWord },
  };
  const qualification = {
    state: 'conditional' as const,
    condition: 'If approved',
    source: source(lastWord),
  };

  it('retains a stated conditional basis without changing the strict default', () => {
    expect(quantityBasis(raw, [identity('desk', 'Desk')], context(text))).toBeNull();
    expect(quantityBasis(raw, [identity('desk', 'Desk')], context(text), qualification)).toEqual(
      raw,
    );
  });

  it('keeps a supplied denominator without inventing an unknown numerator', () => {
    const value = 'If approved, Desk might record unknown USD among 2 requests during June.';
    const parsed = quantityBasis(raw, [identity('desk', 'Desk')], context(value), qualification);
    expect(parsed?.denominator).toBe(2);
    expect(parsed).toEqual(raw); // A basis carries no numerator or observed-state claim.
  });

  it('does not confuse the literal month May with the modal verb', () => {
    const value = text.replace('June', 'May');
    expect(
      quantityBasis(
        { ...raw, period: 'May' },
        [identity('desk', 'Desk')],
        context(value),
        qualification,
      ),
    ).toEqual({ ...raw, period: 'May' });
  });

  it.each([
    { ...qualification, condition: 'If funded' },
    { ...qualification, source: { fromWord: 2, toWord: lastWord } },
    { ...qualification, source: source(lastWord - 1) },
    { ...qualification, code: 'unsupported' },
  ])('rejects missing, cropped or unsupported qualification %s', (evidence) => {
    const ctx = context(text);
    expect(quantityBasis(raw, [identity('desk', 'Desk')], ctx, evidence)).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it.each([
    { ...raw, subjectId: 'other' },
    { ...raw, unit: 'tokens' },
    { ...raw, period: 'July' },
    { ...raw, denominator: 3 },
    { ...raw, source: { fromWord: 4, toWord: lastWord } },
  ])('retains actor, unit, period, denominator and body binding %s', (value) => {
    expect(
      quantityBasis(value, [identity('desk', 'Desk')], context(text), qualification),
    ).toBeNull();
  });

  it.each([
    'If approved, Desk may not record 100 USD among 2 requests during June.',
    'If approved, Desk might record 100 USD among unknown requests during June.',
    'If approved, Desk may record 100 USD among 2 requests during June but may not pay.',
  ])('does not remove negative, unknown or nested qualifications: %s', (value) => {
    const end = value.split(/\s+/u).length - 1;
    expect(
      quantityBasis(
        { ...raw, source: { fromWord: 2, toWord: end } },
        [identity('desk', 'Desk')],
        context(value),
        { ...qualification, source: source(end) },
      ),
    ).toBeNull();
  });
});

describe('explicit evidence and versions', () => {
  it.each([
    ['source-stated', 'Review is pending'],
    ['unknown', 'cash is unknown'],
    ['illustrative', 'illustrative task map'],
    ['scenario', 'possible alternative'],
  ])('accepts locally source-bound %s evidence', (state, label) => {
    const ctx = context(`${label}.`);
    expect(businessEvidence({ state, label, source: source(ctx.win.endWord) }, ctx)?.state).toBe(
      state,
    );
  });
  it('rejects unsupported status, evidence swaps and relabelled unknowns', () => {
    const ctx = context('cash is unknown. Review is pending.');
    for (const raw of [
      { state: 'observed', label: 'cash is unknown', source: source(2) },
      { state: 'source-stated', label: 'cash is unknown', source: source(2) },
      { state: 'unknown', label: 'Review is pending', source: source(2) },
      { state: 'illustrative', label: 'Review is pending', source: { fromWord: 3, toWord: 5 } },
    ])
      expect(businessEvidence(raw, ctx)).toBeNull();
  });
  it('pairs revisions with the stated identity instead of borrowing another record version', () => {
    const ctx = context('Playbook version one is approved. Checklist version two is pending.');
    const raw = {
      identity: { id: 'playbook', label: 'Playbook', source: source(4) },
      version: 'version one',
      source: source(4),
    };
    expect(versionedIdentity(raw, ctx)?.version).toBe('version one');
    expect(
      versionedIdentity({ ...raw, version: 'version two', source: source(9) }, ctx),
    ).toBeNull();
  });
});
