import { describe, expect, it } from 'vitest';
import {
  appendOrganizationClause,
  organizationRawAt as at,
  ORGANIZATION_SOURCE_FIXTURES,
  type OrganizationSourceFixture,
  organizationFixture,
  organizationFixtureWindow,
  parseOrganizationFixture,
  rewriteOrganizationSource as rewrite,
  organizationSource as source,
} from '../../remotion/compositions/explainer/business/organization/fixtures';
import {
  OrganizationLayoutError,
  organizationPages,
  organizationPresentation,
} from '../../remotion/compositions/explainer/business/organization/presentation';
import { BUSINESS_INPUT_LIMITS } from '../../remotion/compositions/explainer/business/types';
import {
  parseOrganizationMapScene,
  parseSystemReconciliationScene,
} from './business-organization-contract';
import { MAX_MINOR_UNITS } from './finance-contract';
import { makeParseContext, type Rec } from './kind-spec';

function text(fixture: OrganizationSourceFixture, ...path: readonly (string | number)[]): string {
  const span = source(fixture.raw, ...path);
  return fixture.words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
}
function refuse(fixture: OrganizationSourceFixture, diagnostic?: RegExp): void {
  const { scene, issues } = parseOrganizationFixture(fixture);
  expect(scene).toBeNull();
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.length).toBeLessThanOrEqual(4);
  if (diagnostic) expect(issues.join(' ')).toMatch(diagnostic);
}
function accept(fixture: OrganizationSourceFixture) {
  const parsed = parseOrganizationFixture(fixture);
  expect(parsed.issues).toEqual([]);
  expect(parsed.scene).not.toBeNull();
  if (!parsed.scene) throw new Error('Expected source-valid organization scene');
  return parsed.scene;
}

describe('strict bounded organization parser boundary', () => {
  const malformed: readonly [string, (fixture: OrganizationSourceFixture) => void][] = [
    [
      'unknown root field',
      (f) => {
        f.raw.customRenderer = 'graph';
      },
    ],
    [
      'unknown nested field',
      (f) => {
        at(f.raw, 'units', 0).hiddenRole = 'approver';
      },
    ],
    [
      'unknown span field',
      (f) => {
        at(f.raw, 'responsibilities', 0, 'source').url = 'remote';
      },
    ],
    [
      'nonfinite number',
      (f) => {
        f.raw.actionWord = Number.NaN;
      },
    ],
    [
      'nonfinite positive number',
      (f) => {
        f.raw.responseWord = Number.POSITIVE_INFINITY;
      },
    ],
    [
      'uppercase ID',
      (f) => {
        at(f.raw, 'units', 0).id = 'BIRCH';
      },
    ],
    [
      'oversized ID',
      (f) => {
        at(f.raw, 'units', 0).id = 'a'.repeat(25);
      },
    ],
    [
      'duplicate identity',
      (f) => {
        at(f.raw, 'units', 1).id = 'birch';
      },
    ],
    [
      'missing reference',
      (f) => {
        at(f.raw, 'responsibilities', 0).unitId = 'absent';
      },
    ],
    [
      'empty semantic array',
      (f) => {
        f.raw.units = [];
      },
    ],
    [
      'oversized semantic array',
      (f) => {
        f.raw.units = Array.from({ length: 9 }, () => structuredClone(at(f.raw, 'units', 0)));
      },
    ],
    [
      'oversized JSON array',
      (f) => {
        f.raw.extra = Array.from({ length: BUSINESS_INPUT_LIMITS.array + 1 }, () => null);
      },
    ],
    [
      'oversized JSON string',
      (f) => {
        f.raw.label = 'x'.repeat(BUSINESS_INPUT_LIMITS.string + 1);
      },
    ],
    [
      'excessive depth',
      (f) => {
        let nested: unknown = null;
        for (let index = 0; index < BUSINESS_INPUT_LIMITS.depth + 2; index++)
          nested = { next: nested };
        f.raw.extra = nested;
      },
    ],
    [
      'cyclic object',
      (f) => {
        f.raw.extra = f.raw;
      },
    ],
    [
      'reused JSON object',
      (f) => {
        f.raw.extra = at(f.raw, 'units', 0);
      },
    ],
    [
      'non-JSON prototype',
      (f) => {
        f.raw.extra = new Date(0);
      },
    ],
    [
      'sparse array',
      (f) => {
        f.raw.extra = new Array(2);
      },
    ],
    [
      'symbol property',
      (f) => {
        Object.defineProperty(f.raw, Symbol('hidden'), { value: true });
      },
    ],
    [
      'accessor property',
      (f) => {
        Object.defineProperty(f.raw, 'extra', {
          enumerable: true,
          get: () => {
            throw new Error('must not execute accessor');
          },
        });
      },
    ],
    [
      'actor/source swap',
      (f) => {
        at(f.raw, 'responsibilities', 0).unitId = 'pine';
      },
    ],
    [
      'task/source swap',
      (f) => {
        at(f.raw, 'responsibilities', 0).taskId = 'audit';
      },
    ],
    [
      'relationship/source swap',
      (f) => {
        at(f.raw, 'responsibilities', 1).sharedWithId = 'pine';
      },
    ],
    [
      'local evidence swap',
      (f) => {
        at(f.raw, 'responsibilities', 0).source = structuredClone(
          at(f.raw, 'responsibilities', 1, 'source'),
        );
      },
    ],
    [
      'identity evidence swap',
      (f) => {
        at(f.raw, 'units', 0).source = structuredClone(at(f.raw, 'units', 1, 'source'));
      },
    ],
    [
      'resolve evidence swap',
      (f) => {
        at(f.raw, 'factEvidence').source = structuredClone(at(f.raw, 'organization', 'source'));
      },
    ],
    [
      'unordered beat',
      (f) => {
        f.raw.responseWord = f.raw.actionWord;
      },
    ],
    [
      'invented condition',
      (f) => {
        f.raw.condition = 'If approved';
      },
    ],
  ];
  it.each(malformed)('refuses %s with diagnostics and no exception', (_, mutate) => {
    const fixture = organizationFixture('OP-25');
    mutate(fixture);
    refuse(fixture);
  });

  it.each([
    { name: 'null', raw: null },
    { name: 'array', raw: [] },
    { name: 'number', raw: 4 },
    { name: 'boolean', raw: true },
    { name: 'string', raw: 'scene' },
  ])('rejects non-object payload $name in both entry points', ({ raw }) => {
    const f = organizationFixture('OP-25');
    for (const parse of [parseOrganizationMapScene, parseSystemReconciliationScene]) {
      const ctx = makeParseContext(f.words, f.window);
      expect(parse(raw as unknown as Rec, ctx)).toBeNull();
      expect(ctx.issues.length).toBeGreaterThan(0);
    }
  });

  it('refuses serialized byte excess before reading recipe fields', () => {
    const f = organizationFixture('OP-25');
    const raw: Rec = {};
    // A wide, shallow tree stays under node/depth/individual-string bounds.
    const count = Math.ceil((BUSINESS_INPUT_LIMITS.bytes + 1) / BUSINESS_INPUT_LIMITS.string);
    for (let index = 0; index < count; index++)
      raw[`field${index}`] = 'x'.repeat(BUSINESS_INPUT_LIMITS.string);
    expect(new TextEncoder().encode(JSON.stringify(raw)).byteLength).toBeGreaterThan(
      BUSINESS_INPUT_LIMITS.bytes,
    );
    const ctx = makeParseContext(f.words, f.window);
    expect(parseOrganizationMapScene(raw, ctx)).toBeNull();
    expect(ctx.issues.join(' ')).toMatch(/byte budget/u);
  });

  it('refuses nonfinite speech times', () => {
    const f = organizationFixture('OP-25');
    f.words[2].end = Number.NaN;
    refuse(f);
  });

  it.each(ORGANIZATION_SOURCE_FIXTURES)('$id refuses undeclared visual mode', (fixture) => {
    const f = structuredClone(fixture);
    f.raw.visualMode = 'model-only';
    refuse(f);
  });

  it('keeps OP31 diagram-only even with source-valid use', () => {
    const f = organizationFixture('OP-31');
    f.raw.visualMode = 'hybrid';
    refuse(f, /diagram only/u);
  });

  it.each([
    'diagram',
    'hybrid',
  ])('rejects insufficient complete production page window in %s', (mode) => {
    const f = organizationFixture('OP-30');
    f.raw.visualMode = mode;
    // Source-valid natural density requires more pages; font and limits stay fixed.
    const payer = 'Shared Services Treasury',
      period = 'July reporting cycle',
      population = 'verified service requests';
    rewrite(f, source(f.raw, 'payer'), text(f, 'payer').replace('Treasury', payer));
    at(f.raw, 'payer').label = payer;
    for (const path of [
      ['total'],
      ['allocations', 0],
      ['allocations', 1],
      ['remainder'],
    ] as const) {
      rewrite(
        f,
        source(f.raw, ...path),
        text(f, ...path)
          .replace('Treasury', payer)
          .replace('July', period)
          .replace('requests', population),
      );
      at(f.raw, ...path, 'basis').period = period;
      at(f.raw, ...path, 'basis').population = population;
    }
    const fields = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'];
    const indices = fields.map((field) => Number(f.raw[field]));
    const starts = [0.5, 1.3, 2.4, 3.5, 4.6];
    for (let phase = 0; phase < 5; phase++) {
      const end = indices[phase + 1] ?? f.words.length;
      const step = (phase === 4 ? 1.1 : 0.4) / (end - indices[phase]);
      for (let word = indices[phase]; word < end; word++) {
        f.words[word].start = starts[phase] + (word - indices[phase]) * step;
        f.words[word].end = f.words[word].start + 0.8 * step;
      }
    }
    f.window = organizationFixtureWindow(f.words);
    expect(f.window.endTime - f.window.startTime).toBeGreaterThanOrEqual(5);
    expect(f.window.endTime - f.words[indices[4]].start).toBeGreaterThanOrEqual(0.8);
    refuse(f, /every fixed-font page needs >=1.5s/u);
  });

  it('has a dedicated expected layout failure, not silent truncation', () => {
    expect(() =>
      organizationPages([
        { id: 'too-dense', cells: ['a '.repeat(800), 'Fact', 'unknown'], state: 'unknown' },
      ]),
    ).toThrow(OrganizationLayoutError);
  });
});

describe('source roles for authored organization assets', () => {
  it.each([
    'Brook can decide Fee locally within Crest.',
    'Brook is able to decide Fee locally within Crest.',
    'Brook decided Fee locally within Crest.',
  ])('refuses capability or observation as permission: %s', (claim) => {
    const f = organizationFixture('OP-26');
    rewrite(f, source(f.raw, 'rights', 0), claim);
    refuse(f);
  });
  it.each([
    'missing',
    'system-source',
    'organization-source',
    'negated',
  ] as const)('refuses reconciliation owner %s', (caseName) => {
    const f = organizationFixture('OP-29');
    if (caseName === 'missing') delete f.raw.owner;
    if (caseName === 'system-source')
      f.raw.owner = structuredClone(at(f.raw, 'systems', 0, 'identity'));
    if (caseName === 'organization-source')
      f.raw.owner = structuredClone(at(f.raw, 'organization'));
    if (caseName === 'negated')
      rewrite(f, source(f.raw, 'owner'), 'Mara is not responsible for reconciliation at Union.');
    refuse(f, /named responsible owner/u);
  });
  it('retains the named reconciliation owner ID and responsibility', () => {
    const scene = accept(organizationFixture('OP-29'));
    if (scene.preset !== 'merge-identities') throw new Error('Expected reconciliation');
    expect(scene.owner.id).toBe('mara');
    expect(
      organizationPresentation(scene)
        .rows.find((row) => row.id === 'owner:mara')
        ?.cells.join(' '),
    ).toContain('Mara Responsible for reconciliation at Union');
  });
});

describe('local state and qualifier preservation', () => {
  it.each([
    ['negative', 'Birch does not have local responsibility for Dispatch within Grove.'],
    ['unknown', 'Whether Birch has local responsibility for Dispatch within Grove is unknown.'],
    ['conditional', 'If reviewed, Birch has local responsibility for Dispatch within Grove.'],
  ])('retains %s responsibility as a distinct source fact', (state, claim) => {
    const f = organizationFixture('OP-25');
    rewrite(f, source(f.raw, 'responsibilities', 0), claim);
    at(f.raw, 'responsibilities', 0).state = state;
    if (state === 'conditional') f.raw.condition = 'If reviewed';
    const scene = accept(f);
    if (scene.preset !== 'federated-units') throw new Error('Expected federated units');
    expect(scene.responsibilities[0].state).toBe(state);
  });

  it('refuses a cropped condition despite the correct labels and positive tail', () => {
    const f = organizationFixture('OP-25');
    rewrite(
      f,
      source(f.raw, 'responsibilities', 0),
      'If reviewed, Birch has local responsibility for Dispatch within Grove.',
    );
    f.raw.condition = 'If reviewed';
    at(f.raw, 'responsibilities', 0).state = 'conditional';
    const span = at(f.raw, 'responsibilities', 0, 'source');
    span.fromWord = Number(span.fromWord) + 2;
    refuse(f, /complete local clause/u);
  });

  it('refuses a cropped negating prefix', () => {
    const f = organizationFixture('OP-25');
    rewrite(
      f,
      source(f.raw, 'responsibilities', 0),
      'It is false that Birch has local responsibility for Dispatch within Grove.',
    );
    const span = at(f.raw, 'responsibilities', 0, 'source');
    span.fromWord = Number(span.fromWord) + 4;
    refuse(f, /complete local clause/u);
  });

  it('refuses a condition attached to another actor rather than this source clause', () => {
    const f = organizationFixture('OP-25');
    rewrite(
      f,
      source(f.raw, 'responsibilities', 1),
      'If reviewed, Pine has shared responsibility for Audit with Birch within Grove.',
    );
    f.raw.condition = 'If reviewed';
    at(f.raw, 'responsibilities', 1).state = 'conditional';
    at(f.raw, 'responsibilities', 0).state = 'conditional';
    refuse(f, /actual actor/u);
  });

  it('refuses contradictory positive and negative local assertions', () => {
    const f = organizationFixture('OP-25');
    appendOrganizationClause(
      f,
      'Birch does not have local responsibility for Dispatch within Grove.',
    );
    refuse(f, /contradictory source states/u);
  });

  it('accepts declared shared rights without inventing an observed decision', () => {
    const f = organizationFixture('OP-26');
    rewrite(
      f,
      source(f.raw, 'rights', 0),
      'Brook is permitted to decide Fee jointly with Board within Crest.',
    );
    at(f.raw, 'rights', 0).scope = 'shared';
    at(f.raw, 'rights', 0).sharedWithId = 'board';
    const scene = accept(f);
    if (scene.preset !== 'decision-rights') throw new Error('Expected rights');
    expect(scene.rights[0].scope).toBe('shared');
    expect(scene.rights[1].permission).toBe('pending');
    expect(scene).not.toHaveProperty('observedDecision');
  });

  it.each([
    ['paused', 2],
    ['rolled-back', 3],
  ] as const)('refuses collapsing %s into negative', (_, index) => {
    const f = organizationFixture('OP-27');
    at(f.raw, 'rings', index).state = 'negative';
    refuse(f);
  });

  it('binds rollout date to its own unit snapshot', () => {
    const f = organizationFixture('OP-27');
    at(f.raw, 'rings', 0).date = 'August';
    refuse(f);
  });

  it.each([
    'allowed',
    'denied',
    'unknown',
  ])('keeps observed informal use separate from %s declaration', (state) => {
    const f = organizationFixture('OP-31');
    rewrite(
      f,
      source(f.raw, 'tools', 0),
      `Harbor declares Slate ${state === 'unknown' ? 'status unknown' : state} for Bay.`,
    );
    at(f.raw, 'tools', 0).state = state;
    const scene = accept(f);
    if (scene.preset !== 'declared-tool-boundaries') throw new Error('Expected tools');
    expect(scene.tools[0].state).toBe(state);
    expect(scene.uses[0].state).toBe('observed');
  });

  it('preserves unknown worker use alongside an unapproved boundary', () => {
    const f = organizationFixture('OP-31');
    rewrite(
      f,
      source(f.raw, 'uses', 0),
      'Whether Harbor observed informal use of Slate by Mira in Bay is unknown.',
    );
    at(f.raw, 'uses', 0).state = 'unknown';
    const scene = accept(f);
    if (scene.preset !== 'declared-tool-boundaries') throw new Error('Expected tools');
    expect(scene.uses[0].state).toBe('unknown');
    expect(scene.tools[0].state).toBe('unapproved');
  });

  it('refuses borrowing worker or declaration evidence for use', () => {
    const f = organizationFixture('OP-31');
    at(f.raw, 'uses', 0).source = structuredClone(at(f.raw, 'workers', 0, 'identity', 'source'));
    refuse(f);
  });

  it('retains both literal identities even for an explicitly matched pair', () => {
    const f = organizationFixture('OP-29');
    rewrite(
      f,
      source(f.raw, 'collisions', 0),
      text(f, 'collisions', 0).replace('has an unresolved identity conflict with', 'matches'),
    );
    at(f.raw, 'collisions', 0).state = 'matched';
    const scene = accept(f);
    if (scene.preset !== 'merge-identities') throw new Error('Expected reconciliation');
    expect(scene.records.map((record) => record.sourceId)).toEqual(['A17', 'B91']);
    expect(scene.records).toHaveLength(2);
    expect(scene).not.toHaveProperty('mergedIdentity');
  });
});

describe('exact cost-only chargeback evidence', () => {
  const badMoney: readonly [string, (fixture: OrganizationSourceFixture) => void][] = [
    [
      'fractional minor units',
      (f) => {
        at(f.raw, 'total', 'amount').minorUnits = 10000.5;
      },
    ],
    [
      'unsafe integer money',
      (f) => {
        at(f.raw, 'total', 'amount').minorUnits = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'finance money limit',
      (f) => {
        at(f.raw, 'total', 'amount').minorUnits = MAX_MINOR_UNITS + 1;
      },
    ],
    [
      'negative money',
      (f) => {
        at(f.raw, 'allocations', 0, 'amount').minorUnits = -1;
      },
    ],
    [
      'nonfinite money',
      (f) => {
        at(f.raw, 'total', 'amount').minorUnits = Number.POSITIVE_INFINITY;
      },
    ],
    [
      'unsupported currency',
      (f) => {
        at(f.raw, 'total', 'amount').currency = 'CAD';
      },
    ],
    [
      'wrong period',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').period = 'August';
      },
    ],
    [
      'wrong population',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').population = 'workers';
      },
    ],
    [
      'wrong subject',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').subjectId = 'north';
      },
    ],
    [
      'wrong unit',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').unit = 'EUR';
      },
    ],
    [
      'missing denominator',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').denominator = null;
      },
    ],
    [
      'unsafe denominator',
      (f) => {
        at(f.raw, 'total', 'basis').denominator = Number.MAX_SAFE_INTEGER;
      },
    ],
    [
      'unknown numeric key',
      (f) => {
        at(f.raw, 'total', 'amount').net = true;
      },
    ],
    [
      'basis evidence swap',
      (f) => {
        at(f.raw, 'allocations', 0, 'basis').source = structuredClone(at(f.raw, 'total', 'source'));
      },
    ],
    [
      'duplicate allocation',
      (f) => {
        f.raw.allocations = [
          structuredClone(at(f.raw, 'allocations', 0)),
          structuredClone(at(f.raw, 'allocations', 0)),
        ];
      },
    ],
  ];
  it.each(badMoney)('refuses %s without inventing cost facts', (_, mutate) => {
    const f = organizationFixture('OP-30');
    mutate(f);
    refuse(f);
  });

  it('refuses mixed currencies even when each amount is locally source-stated', () => {
    const f = organizationFixture('OP-30');
    rewrite(f, source(f.raw, 'allocations', 0), text(f, 'allocations', 0).replace('USD', 'EUR'));
    at(f.raw, 'allocations', 0, 'amount').currency = 'EUR';
    at(f.raw, 'allocations', 0, 'basis').unit = 'EUR';
    refuse(f);
  });

  it('refuses unconserved amounts even when each amount is locally source-stated', () => {
    const f = organizationFixture('OP-30');
    rewrite(
      f,
      source(f.raw, 'allocations', 0),
      text(f, 'allocations', 0).replace('30 USD', '31 USD'),
    );
    at(f.raw, 'allocations', 0, 'amount').minorUnits = 3100;
    refuse(f, /conserve/u);
  });

  it('refuses unconserved allocation components without proportional-cost inference', () => {
    const f = organizationFixture('OP-30');
    rewrite(
      f,
      source(f.raw, 'allocations', 0),
      text(f, 'allocations', 0).replace('for 3 of', 'for 4 of'),
    );
    at(f.raw, 'allocations', 0).components = 4;
    refuse(f, /conserve/u);
  });

  it.each([
    ['total', 'total', 0, '100.01 USD', '101.01 USD'],
    ['allocation amount', 'allocations', 0, '30 USD', '31 USD'],
    ['allocation currency', 'allocations', 0, '30 USD', '30 EUR'],
    ['allocation components', 'allocations', 0, 'for 3 of', 'for 4 of'],
    ['allocation denominator', 'allocations', 0, 'of 10 requests', 'of 20 requests'],
    ['remainder', 'remainder', 0, '20.01 USD', '21.01 USD'],
  ] as const)('refuses same-subject/period numeric disagreement: %s', (_, key, index, before, after) => {
    const f = organizationFixture('OP-30');
    const claim = key === 'allocations' ? text(f, key, index) : text(f, key);
    appendOrganizationClause(f, claim.replace(before, after));
    refuse(f, /conflicting numeric/u);
  });

  function unknownRemainder(): OrganizationSourceFixture {
    const f = organizationFixture('OP-30');
    rewrite(
      f,
      source(f.raw, 'remainder'),
      "Sol states Treasury's chargeback remainder for Hub is unknown during July per 10 requests.",
    );
    f.raw.remainder = {
      state: 'unknown',
      amount: null,
      components: null,
      source: source(f.raw, 'remainder'),
    };
    return f;
  }
  it('retains an explicit unknown remainder without deriving money or components', () => {
    const f = unknownRemainder();
    const scene = accept(f);
    if (scene.preset !== 'stated-chargeback') throw new Error('Expected chargeback');
    expect(scene.remainder.amount).toBeNull();
    expect(scene.remainder.components).toBeNull();
    const row = organizationPresentation(scene).rows.find((entry) => entry.id === 'remainder');
    expect(row?.cells[1]).toContain('Amount and components unknown');
    for (const basis of ['Treasury', 'Hub', 'Sol', 'unit USD', 'July', 'per 10 requests'])
      expect(row?.cells[1]).toContain(basis);
    expect(row?.cells[1]).not.toContain('20.01');
  });

  it('refuses a numeric amount smuggled into an unknown remainder', () => {
    const f = unknownRemainder();
    at(f.raw, 'remainder').amount = { minorUnits: 2001, currency: 'USD' };
    refuse(f);
  });

  it('refuses simultaneously unknown and numerically stated remainder evidence', () => {
    const f = unknownRemainder();
    appendOrganizationClause(
      f,
      "Sol states Treasury's chargeback remainder for Hub is 20.01 USD for 2 of 10 requests during July.",
    );
    refuse(f, /contradictory/u);
  });
});
