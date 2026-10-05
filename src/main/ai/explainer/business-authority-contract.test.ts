import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_NO_APPROVER_TRANSFER_FIXTURE,
  AUTHORITY_RAW_FIXTURES,
  AUTHORITY_UNKNOWN_COST_FIXTURE,
  type AuthorityRawFixture,
  authorityFixtureContext,
  parseAuthorityFixture,
} from '../../remotion/compositions/explainer/business/authority/fixtures';
import {
  AUTHORITY_SOURCE_NEGATIVES,
  authorityFixture,
  authorityRawAt,
  authoritySource,
  rewriteAuthoritySource,
} from '../../remotion/compositions/explainer/business/authority/negative-fixtures';
import { BUSINESS_RECIPES } from '../../remotion/compositions/explainer/business/catalog';
import {
  parseAuthorityHandoff,
  parseConstraintCheck,
  parseDelegationScope,
} from './business-authority-contract';

/** Replace only the final source sentence with literal tokens, retaining the five beat indices. */
function outcomeFixture(recipeId: string, outcome: string): AuthorityRawFixture {
  const fixture = authorityFixture(recipeId);
  const index = fixture.raw.resolveWord;
  if (typeof index !== 'number') throw new Error('Missing source resolve beat');
  const start = fixture.words[index].start;
  const end = fixture.words[fixture.words.length - 1].end;
  const tokens = `Bot Send report ${outcome}.`.split(/\s+/u);
  const step = (end - start) / tokens.length;
  fixture.words.splice(
    index,
    fixture.words.length - index,
    ...tokens.map((text, offset) => ({
      text,
      start: start + offset * step,
      end: start + (offset + 0.8) * step,
    })),
  );
  fixture.window.endWord = fixture.words.length - 1;
  fixture.raw.endWord = fixture.window.endWord;
  fixture.raw.outcome = outcome;
  if (outcome.includes('if reviewed')) fixture.raw.condition = 'if reviewed';
  return fixture;
}

describe('authority raw-source contract acceptance', () => {
  it('covers exactly the eight owned recipes, excluding the existing OP-10 contract', () => {
    expect(AUTHORITY_RAW_FIXTURES.map((fixture) => fixture.recipeId)).toEqual([
      'OP-09',
      'OP-11',
      'OP-12',
      'OP-13',
      'OP-14',
      'OP-15',
      'OP-16',
      'OP-74',
    ]);
  });

  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId accepts authored RAW + words/window in catalog modes', (fixture) => {
    const recipe = BUSINESS_RECIPES.find((entry) => entry.id === fixture.recipeId);
    if (!recipe) throw new Error('Missing frozen recipe');
    for (const visualMode of recipe.modes) {
      const input = { ...fixture, raw: { ...structuredClone(fixture.raw), visualMode } };
      const { scene, issues } = parseAuthorityFixture(input);
      expect(issues).toEqual([]);
      if (!scene)
        throw new Error(`${fixture.recipeId} rejected authored source: ${issues.join('; ')}`);
      expect(scene.kind).toBe(fixture.raw.kind);
      expect(scene.preset).toBe(fixture.raw.preset);
      expect(scene.visualMode).toBe(visualMode);
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      expect(times.every(Number.isFinite)).toBe(true);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(new Set(times).size).toBe(5);
      expect(fixture.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    }
  });

  for (const parse of [parseDelegationScope, parseAuthorityHandoff, parseConstraintCheck]) {
    it(`${parse.name} bounds JSON before touching accessor properties`, () => {
      const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === 'OP-09');
      if (!fixture) throw new Error('Missing context');
      let invoked = false;
      const input = Object.defineProperty({}, 'preset', {
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error('Unsafe getter');
        },
      });
      expect(parse(input, authorityFixtureContext(fixture))).toBeNull();
      expect(invoked).toBe(false);
    });
  }

  it.each(
    AUTHORITY_SOURCE_NEGATIVES,
  )('$recipeId rejects $name through the concrete RAW contract', ({ fixture }) => {
    const before = structuredClone(fixture);
    expect(parseAuthorityFixture(fixture).scene).toBeNull();
    expect(fixture).toEqual(before);
  });

  it.each([
    AUTHORITY_NO_APPROVER_TRANSFER_FIXTURE,
    AUTHORITY_UNKNOWN_COST_FIXTURE,
  ])('$recipeId accepts the dedicated absence-state RAW fixture in both presentations', (fixture) => {
    for (const visualMode of ['diagram', 'hybrid']) {
      const input = structuredClone(fixture);
      input.raw.visualMode = visualMode;
      const before = structuredClone(input);
      const { scene, issues } = parseAuthorityFixture(input);
      expect(issues).toEqual([]);
      expect(scene).not.toBeNull();
      if (scene?.preset === 'accountable-transfer') {
        expect(scene.roles.approverId).toBeNull();
        expect(scene.transfer.state).toBe('accepted');
        expect(scene.roles.performerId).toBe('bot');
        expect(scene.roles.accountableOwnerId).toBe('owner');
      } else if (scene?.preset === 'exception-review') {
        expect(scene.reviewCost).toMatchObject({ state: 'unknown', amount: null });
        expect(scene.retryCost).toMatchObject({ state: 'unknown', amount: null });
        expect(scene.reviewCost).not.toHaveProperty('basis');
        expect(scene.retryCost).not.toHaveProperty('basis');
        expect(scene.review.state).toBe('pending');
      } else throw new Error('Unexpected absence-state preset');
      expect(input).toEqual(before);
    }
  });

  it.each([
    'OP-09',
    'OP-11',
    'OP-16',
    'OP-74',
  ])('%s cannot promote unresolved authority to affirmative success on the final source beat', (recipeId) => {
    for (const outcome of [
      'Approved',
      'Completed',
      'Accepted',
      'Resolved',
      'Successful',
      'Fulfilled',
      'Not approved but completed',
    ])
      expect(parseAuthorityFixture(outcomeFixture(recipeId, outcome)).scene, outcome).toBeNull();
  });

  it.each([
    'OP-11',
    'OP-74',
  ])('%s preserves explicitly negative, conditional and unresolved narratives', (recipeId) => {
    for (const outcome of [
      'Not approved',
      'Not yet completed',
      'Never accepted',
      'Approval unresolved',
      'Not resolved',
      'No successful transfer',
      'Approved if reviewed',
    ]) {
      const { scene, issues } = parseAuthorityFixture(outcomeFixture(recipeId, outcome));
      expect(issues, outcome).toEqual([]);
      expect(scene?.outcome, outcome).toBe(outcome);
    }
  });

  it('keeps an explicit unresolved conflict narrative even when it mentions negated approval', () => {
    const { scene, issues } = parseAuthorityFixture(
      outcomeFixture('OP-16', 'Unresolved not approved'),
    );
    expect(issues).toEqual([]);
    expect(scene?.preset).toBe('conflicting-limits');
  });

  it('unknown permission is not a grant, even when the final beat contains approval words', () => {
    const fixture = outcomeFixture('OP-11', 'Approved');
    fixture.raw.permission = 'unknown';
    rewriteAuthoritySource(
      fixture,
      authoritySource(fixture, 'decisionSource'),
      'is pending',
      'is unknown',
    );
    expect(parseAuthorityFixture(fixture).scene).toBeNull();
    const negative = outcomeFixture('OP-11', 'Not approved');
    negative.raw.permission = 'unknown';
    rewriteAuthoritySource(
      negative,
      authoritySource(negative, 'decisionSource'),
      'is pending',
      'is unknown',
    );
    expect(parseAuthorityFixture(negative).scene?.preset).toBe('action-limits');
  });

  it.each([
    'Lead Send report uses',
    'Bot Release funds uses',
  ])('OP-74 rejects an otherwise valid Playbook R1 source for %s', (replacement) => {
    const fixture = authorityFixture('OP-74');
    expect(parseAuthorityFixture(fixture).scene?.preset).toBe('dated-conditions');
    rewriteAuthoritySource(
      fixture,
      authoritySource(fixture, 'policy', 'source'),
      'Bot Send report uses',
      replacement,
    );
    const result = parseAuthorityFixture(fixture);
    expect(result.scene).toBeNull();
    expect(authorityRawAt(fixture, 'policy').version).toBe('R1');
    expect(authorityRawAt(fixture, 'policy', 'identity').label).toBe('Playbook');
  });

  it.each(
    AUTHORITY_RAW_FIXTURES,
  )('$recipeId rejects hostile metadata and malformed source spans before presentation', (original) => {
    const mutations: [string, (f: AuthorityRawFixture) => void][] = [
      [
        'unsupported geometry',
        (f) => {
          f.raw.geometry = 'arbitrary';
        },
      ],
      [
        'unsupported URL',
        (f) => {
          f.raw.url = 'https://example.invalid';
        },
      ],
      [
        'unsupported code',
        (f) => {
          f.raw.code = 'execute()';
        },
      ],
      [
        'unsupported style',
        (f) => {
          f.raw.style = 'arbitrary';
        },
      ],
      [
        'unsupported observed state',
        (f) => {
          authorityRawAt(f, 'factEvidence').state = 'observed';
        },
      ],
      [
        'unsupported nested source key',
        (f) => {
          authorityRawAt(f, 'factEvidence', 'source').extra = true;
        },
      ],
      [
        'source array',
        (f) => {
          authorityRawAt(f, 'factEvidence').source = [];
        },
      ],
      [
        'fractional index',
        (f) => {
          authorityRawAt(f, 'factEvidence', 'source').fromWord = 0.5;
        },
      ],
      [
        'out-of-window source',
        (f) => {
          authorityRawAt(f, 'factEvidence').source = {
            fromWord: f.window.endWord + 1,
            toWord: f.window.endWord + 1,
          };
        },
      ],
      [
        'nonfinite index',
        (f) => {
          authorityRawAt(f, 'factEvidence', 'source').fromWord = NaN;
        },
      ],
      [
        'nonfinite beat',
        (f) => {
          f.raw.resolveWord = Infinity;
        },
      ],
      [
        'oversized label',
        (f) => {
          f.raw.subject = 'X'.repeat(201);
        },
      ],
      [
        'oversized array',
        (f) => {
          const field = [
            'permissions',
            'limits',
            'actors',
            'events',
            'requirements',
            'conditions',
          ].find((key) => Array.isArray(f.raw[key]));
          if (!field) throw new Error('Missing bounded authority array');
          const entries = f.raw[field];
          if (!Array.isArray(entries)) throw new Error('Not an array');
          f.raw[field] = Array.from({ length: 33 }, () => structuredClone(entries[0]));
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
      const fixture = structuredClone(original);
      mutate(fixture);
      expect(parseAuthorityFixture(fixture).scene, `${original.recipeId}: ${name}`).toBeNull();
    }
  });

  it('accepts eight audit identities and twelve declared event edges but rejects a ninth identity', () => {
    const fixture = authorityFixture('OP-13');
    const actors = fixture.raw.actors;
    if (!Array.isArray(actors)) throw new Error('Missing audit actors');
    actors.push({
      id: 'lead',
      label: 'Lead',
      source: authoritySource(fixture, 'actors', 0, 'source'),
    });
    const { scene, issues } = parseAuthorityFixture(fixture);
    expect(issues).toEqual([]);
    if (scene?.preset !== 'declared-audit-chain') throw new Error('Maximum audit source rejected');
    expect(scene.actors.length + 1 + 1 + scene.events.length).toBe(8);
    expect(scene.events.length * 3).toBe(12);
    actors.push({
      id: 'owner',
      label: 'Owner',
      source: authoritySource(fixture, 'actors', 0, 'source'),
    });
    expect(parseAuthorityFixture(fixture).scene).toBeNull();
  });

  it('retains four condition holds and literal/unknown dates after moving the source window by 100 seconds', () => {
    const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === 'OP-74');
    if (!fixture) throw new Error('Missing dated source');
    const original = parseAuthorityFixture(fixture).scene;
    const moved = parseAuthorityFixture({
      ...fixture,
      window: {
        ...fixture.window,
        startTime: fixture.window.startTime + 100,
        endTime: fixture.window.endTime + 100,
      },
      words: fixture.words.map((word) => ({
        ...word,
        start: word.start + 100,
        end: word.end + 100,
      })),
    }).scene;
    if (original?.preset !== 'dated-conditions' || moved?.preset !== 'dated-conditions')
      throw new Error('Dated conditions rejected');
    expect(original.conditions).toHaveLength(4);
    expect(moved.conditions).toEqual(original.conditions);
    expect(moved.relationship.state).toBe('unresolved');
    expect(moved.resolveAt).toBeCloseTo(original.resolveAt + 100);
    expect(original.conditions.map((entry) => entry.state)).toEqual([
      'pending',
      'pending',
      'unknown',
      'blocked',
    ]);
    expect(original.conditions.map((entry) => entry.date.value)).toEqual([
      '20 June 2026',
      '30 June 2026',
      null,
      '31 December 2026',
    ]);
  });
});
