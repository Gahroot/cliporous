import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type {
  ExpansionConditioningScene,
  ExpansionSelectionBiasScene,
} from '../../remotion/compositions/explainer/expansion/probability/conditioning-sampling-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionConditioning,
  parseExpansionSelectionBias,
} from './expansion-probability-conditioning-sampling-contract';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/probability/conditioning-sampling.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
const conditioning = fixture.stories.find((story) => story.id === '11');
const sampling = fixture.stories.find((story) => story.id === '12');
if (!conditioning || !sampling)
  throw new Error('Both approved conditioning/sampling stories must be present');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;

function parse(id: '11' | '12', proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '11'
      ? parseExpansionConditioning(proposal, ctx)
      : parseExpansionSelectionBias(proposal, ctx);
  return { scene, ctx };
}
function sourceClauses(story: ExpansionSourceFixture): string[] {
  return BEATS.map((field, index) =>
    story.words
      .slice(
        Number(story.proposal[field]),
        index === 4 ? story.window.endWord + 1 : Number(story.proposal[BEATS[index + 1]]),
      )
      .map((word) => word.text)
      .join(' '),
  );
}
function paraphrase(story: ExpansionSourceFixture, clauses: readonly string[]) {
  const speech = expansionFixtureSpeech(clauses, 10);
  const previous = BEATS.map((field, index) => ({
    fromWord: Number(story.proposal[field]),
    toWord: index === 4 ? story.window.endWord : Number(story.proposal[BEATS[index + 1]]) - 1,
  }));
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const record = value as Rec;
      if (Object.keys(record).length === 2 && 'fromWord' in record && 'toWord' in record) {
        const index = previous.findIndex(
          (span) => span.fromWord === record.fromWord && span.toWord === record.toWord,
        );
        if (index < 0) throw new Error('Evidence must retain its complete authored clause');
        return { ...speech.spans[index] };
      }
      return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, rebase(entry)]));
    }
    return value;
  }
  const proposal = rebase(story.proposal) as Rec;
  proposal.startWord = speech.window.startWord;
  proposal.endWord = speech.window.endWord;
  BEATS.forEach((field, index) => {
    proposal[field] = speech.spans[index].fromWord;
  });
  return { ...speech, proposal };
}
function positive11(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionConditioningScene {
  const result = parse('11', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('probability-workbench');
  return result.scene as ExpansionConditioningScene;
}
function positive12(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionSelectionBiasScene {
  const result = parse('12', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('sampling-frame');
  return result.scene as ExpansionSelectionBiasScene;
}
function counts(proposal: Rec) {
  return proposal.counts as Record<string, { quantity: Rec; display?: Rec }>;
}
function amounts(values: readonly number[]) {
  return values.map((numerator) => ({ kind: 'rational', value: { numerator, denominator: 1 } }));
}

describe('expansion probability conditioning and selection source contracts', () => {
  it('reads exactly stories 11–12 with five production-padded source sentences and explicit raw negatives', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.pack).toBe('probability');
    expect(fixture.stories.map((story) => story.id)).toEqual(['11', '12']);
    for (const story of fixture.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(sourceClauses(story), 10).words).toEqual(story.words);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(sourceClauses(story)).toHaveLength(5);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      expect(story.negatives.length).toBeGreaterThanOrEqual(50);
    }
  });
  for (const story of fixture.stories) {
    const id = story.id as '11' | '12';
    describe(`story ${id}`, () => {
      it('preserves identical facts, IDs and exact source beat times across modes, repeats and portrait layouts', () => {
        const diagram = parse(
          id,
          { ...story.proposal, visualMode: 'diagram' },
          story.words,
          story.window,
        );
        const hybrid = parse(
          id,
          { ...story.proposal, visualMode: 'hybrid' },
          story.words,
          story.window,
        );
        expect(diagram.ctx.issues).toEqual([]);
        expect(hybrid.ctx.issues).toEqual([]);
        expect(diagram.scene).not.toBeNull();
        expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
        const scene = diagram.scene;
        if (!scene) throw new Error('Expected complete grounded scene');
        expect(scene.entities.map((entry) => entry.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(id, index)),
        );
        expect(scene.entities.map((entry) => entry.label)).toEqual(
          (story.proposal.entities as { label: string }[]).map((entry) => entry.label),
        );
        expect(TIMES.map((field) => scene[field])).toEqual(
          BEATS.map((field, index) =>
            index === 0 ? 0.3 : story.words[Number(story.proposal[field])].start,
          ),
        );
        expect(scene.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
        expect(parse(id, structuredClone(story.proposal), story.words, story.window).scene).toEqual(
          scene,
        );
        expect(
          parse(id, { ...story.proposal, layout: 'stack-flipped' }, story.words, story.window)
            .scene,
        ).toEqual(scene);
        expect(scene).not.toHaveProperty('treatment');
      });
      for (const negative of story.negatives) {
        it(`rejects ${negative.name} with actual diagnostics in both modes`, () => {
          if (negative.sourceText) {
            expect(negative.words?.map((word) => word.text).join(' ')).toBe(negative.sourceText);
            expect(negative.words).toEqual(conceptFixtureWords(negative.sourceText, 10));
          }
          for (const mode of ['diagram', 'hybrid']) {
            const proposal = structuredClone(negative.proposal);
            if (proposal.visualMode === 'diagram' || proposal.visualMode === 'hybrid')
              proposal.visualMode = mode;
            const result = parse(
              id,
              proposal,
              negative.words ?? story.words,
              negative.window ?? story.window,
            );
            expect(result.scene, `${id}/${negative.name}/${mode}`).toBeNull();
            expect(
              result.ctx.issues.length,
              `${id}/${negative.name}/${mode} diagnostic`,
            ).toBeGreaterThan(0);
          }
        });
      }
    });
  }
  it('uses the subset denominator, retaining source operands and explicitly marked exact ratio', () => {
    const scene = positive11(conditioning.proposal, conditioning.words, conditioning.window);
    expect(scene.denominatorId).toBe(scene.subsetId);
    expect(scene.denominatorId).not.toBe(scene.populationId);
    expect(scene.entities.find((entry) => entry.id === scene.subsetId)?.label).toBe('night shift');
    expect(scene.derived).toEqual({
      state: 'derived',
      operation: 'ratio',
      operands: [
        { numerator: 20, denominator: 1 },
        { numerator: 80, denominator: 1 },
      ],
      result: { numerator: 1, denominator: 4 },
      basis: {
        unit: 'ratio',
        period: 'March',
        population: 'night shift',
        denominator: { numerator: 80, denominator: 1 },
      },
      evidence: [scene.counts.event.quantity.evidence, scene.counts.subset.quantity.evidence],
    });
    expect(scene.inclusion.rule).toBe('night shift membership');
    expect(Object.values(scene.counts).map((record) => record.quantity.actor)).toEqual([
      "Ada's workforce",
      "Ada's workforce",
      "Ada's workforce",
    ]);
    expect(scene.counts.event.quantity.basis.population).toBe('night shift');
    expect(scene.resolutionText).toContain('night shift, not workforce');
    expect(
      Object.values(scene.counts).reduce(
        (total, record) => total + (record.display?.marks ?? 0),
        0,
      ),
    ).toBe(100);
    expect(scene.counts.population.display).toEqual({
      mode: 'aggregate',
      marks: 40,
      membersPerMark: { numerator: 5, denominator: 1 },
    });
    expect(scene.counts.subset.display).toEqual({
      mode: 'aggregate',
      marks: 40,
      membersPerMark: { numerator: 2, denominator: 1 },
    });
  });
  it('allows grounded count/inclusion paraphrases without changing identities or arithmetic', () => {
    const source = sourceClauses(conditioning);
    source[0] = `Ada's workforce selects the night shift subset by rule "night shift membership" for the certification event.`;
    source[1] = `Ada's workforce recorded population count of 200 count during March for workforce.`;
    source[2] = `During March, Ada's workforce subset count totals 80 count among night shift.`;
    source[4] = `Ada's denominator for certification remains night shift, not workforce.`;
    const next = paraphrase(conditioning, source);
    const scene = positive11(next.proposal, next.words, next.window);
    expect(scene.denominatorId).toBe(scene.subsetId);
    expect(scene.derived?.result).toEqual({ numerator: 1, denominator: 4 });
    expect(scene.entities.map((entry) => entry.id)).toEqual(
      positive11(conditioning.proposal, conditioning.words, conditioning.window).entities.map(
        (entry) => entry.id,
      ),
    );
  });
  it.each([
    'unknown',
    'missing',
    'disputed',
  ] as const)('retains %s subset information without default zero or a derived ratio', (state) => {
    const source = sourceClauses(conditioning);
    source[2] =
      state === 'disputed'
        ? `Ada's workforce subset count is disputed between 70 and 90 count during March among night shift.`
        : source[2].replace('80 count', `${state} count`);
    const next = paraphrase(conditioning, source);
    delete next.proposal.derive;
    const record = counts(next.proposal).subset;
    delete record.quantity.amount;
    delete record.display;
    record.quantity.state = state;
    record.quantity.qualifier = state;
    if (state === 'disputed') record.quantity.alternatives = amounts([70, 90]);
    const scene = positive11(next.proposal, next.words, next.window);
    expect(scene.counts.subset.quantity.state).toBe(state);
    expect(scene.counts.subset).not.toHaveProperty('display');
    expect(scene.counts.subset.quantity).not.toHaveProperty('amount');
    expect(scene).not.toHaveProperty('derived');
    if (scene.counts.subset.quantity.state === 'disputed')
      expect(scene.counts.subset.quantity.alternatives).toEqual([
        { ...amounts([70])[0], notation: '70' },
        { ...amounts([90])[0], notation: '90' },
      ]);
    const attempted = parse('11', { ...next.proposal, derive: 'ratio' }, next.words, next.window);
    expect(attempted.scene).toBeNull();
    expect(attempted.ctx.issues.length).toBeGreaterThan(0);
  });
  it('distinguishes explicit known zero from absence, deriving zero only with a known positive denominator', () => {
    const source = sourceClauses(conditioning);
    source[3] = source[3].replace('20 count', '0 count');
    const next = paraphrase(conditioning, source);
    (
      counts(next.proposal).event.quantity.amount as { value: { numerator: number } }
    ).value.numerator = 0;
    counts(next.proposal).event.display = { mode: 'individual', marks: 0 };
    const scene = positive11(next.proposal, next.words, next.window);
    expect(scene.counts.event.quantity.state).toBe('known');
    expect(scene.counts.event.display?.marks).toBe(0);
    expect(scene.derived?.result).toEqual({ numerator: 0, denominator: 1 });
    expect(scene.derived?.operands).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 80, denominator: 1 },
    ]);
  });
  it.each([
    ['illustrative', 'teaching example'],
    ['simulated', 'simulation'],
  ])('retains %s counts as qualified source information, not measured marks', (state, qualifier) => {
    const source = sourceClauses(conditioning);
    source[2] = `In this ${qualifier}, ${source[2]}`;
    const next = paraphrase(conditioning, source);
    next.proposal.evidence = 'illustrative';
    delete next.proposal.derive;
    const record = counts(next.proposal).subset;
    record.quantity.state = state;
    record.quantity.qualifier = qualifier;
    delete record.display;
    const scene = positive11(next.proposal, next.words, next.window);
    expect(scene.counts.subset.quantity.state).toBe(state);
    expect(scene.counts.subset.quantity).toHaveProperty('qualifier', qualifier);
    expect(scene.counts.subset).not.toHaveProperty('display');
    expect(scene).not.toHaveProperty('derived');
  });
  it('retains conditional counts within the exact assumption without deriving an observed rate', () => {
    const source = sourceClauses(conditioning),
      condition = 'If permits are approved';
    source[2] = `${condition}, ${source[2]}`;
    const next = paraphrase(conditioning, source);
    next.proposal.condition = condition;
    delete next.proposal.derive;
    const record = counts(next.proposal).subset;
    record.quantity.state = 'conditional';
    record.quantity.condition = condition;
    delete record.display;
    const scene = positive11(next.proposal, next.words, next.window);
    expect(scene.counts.subset.quantity.state).toBe('conditional');
    expect(scene.counts.subset.quantity).toHaveProperty('condition', condition);
    expect(scene.counts.subset).not.toHaveProperty('display');
    expect(scene).not.toHaveProperty('derived');
  });
  it('keeps excluded groups outside this sampling frame, never absent from the world or a fabricated zero rate', () => {
    const scene = positive12(sampling.proposal, sampling.words, sampling.window);
    expect(
      scene.representedIds.map((id) => scene.entities.find((entry) => entry.id === id)?.label),
    ).toEqual(['online households']);
    expect(
      scene.excludedIds.map((id) => scene.entities.find((entry) => entry.id === id)?.label),
    ).toEqual(['offline households']);
    expect(
      scene.eligibility.every(
        (record) =>
          record.scope === 'sampling-frame' &&
          record.ownerId === scene.ownerId &&
          record.frameId === scene.frameId &&
          record.rule === 'email access',
      ),
    ).toBe(true);
    expect(scene.resolveGroupId).toBe(scene.excludedIds[0]);
    expect(scene.resolutionText).toContain('not absent from the population');
    expect(scene.measurements[0].quantity.state).toBe('unknown');
    expect(scene.measurements[0].quantity).not.toHaveProperty('amount');
    expect(scene.measurements[0]).not.toHaveProperty('display');
    for (const field of ['derived', 'absentIds', 'missingDemographics', 'inferredRate'])
      expect(scene).not.toHaveProperty(field);
  });
  it('accepts frame-local eligibility paraphrases while preserving negated coverage as exclusion', () => {
    const source = sourceClauses(sampling);
    source[0] = `Ada's Survey follows rule "email access".`;
    source[1] = `Ada's Survey covers online households using rule "email access".`;
    source[2] = `Ada's Survey does not cover offline households under selection rule "email access".`;
    source[4] = `Ada's Survey leaves offline households excluded from Survey, not absent from the world.`;
    const next = paraphrase(sampling, source);
    const scene = positive12(next.proposal, next.words, next.window);
    expect(scene.eligibility.map((record) => record.status)).toEqual(['represented', 'excluded']);
    expect(scene.resolutionText).toContain('not absent from the world');
    expect(scene.measurements[0].quantity.state).toBe('unknown');
  });
  it.each([
    'missing',
    'disputed',
  ] as const)('retains %s sampling rates without inventing a measured rate', (state) => {
    const source = sourceClauses(sampling);
    source[3] = source[3].replace(
      'unknown percent',
      state === 'disputed' ? 'disputed between 40 and 60 percent' : 'missing percent',
    );
    const next = paraphrase(sampling, source);
    const quantity = (next.proposal.measurements as { quantity: Rec }[])[0].quantity;
    quantity.state = state;
    quantity.qualifier = state;
    if (state === 'disputed') quantity.alternatives = amounts([40, 60]);
    const scene = positive12(next.proposal, next.words, next.window);
    expect(scene.measurements[0].quantity.state).toBe(state);
    expect(scene.measurements[0].quantity).not.toHaveProperty('amount');
    expect(scene).not.toHaveProperty('derived');
  });
  it('aggregates a large explicitly stated sampling count exactly, without inferring demographics or rates', () => {
    const source = sourceClauses(sampling);
    source[3] = `Ada's Survey member count is 200 count during March among offline households.`;
    const next = paraphrase(sampling, source);
    const record = (next.proposal.measurements as { quantity: Rec; display?: Rec }[])[0];
    record.quantity.claim = 'member count';
    record.quantity.state = 'known';
    delete record.quantity.qualifier;
    (record.quantity.basis as Rec).unit = 'count';
    record.quantity.amount = amounts([200])[0];
    record.display = { mode: 'aggregate', marks: 100 };
    const scene = positive12(next.proposal, next.words, next.window);
    expect(scene.measurements[0].display).toEqual({
      mode: 'aggregate',
      marks: 100,
      membersPerMark: { numerator: 2, denominator: 1 },
    });
    expect(scene.measurements[0].groupId).toBe(scene.excludedIds[0]);
    expect(scene).not.toHaveProperty('derived');
  });
});
