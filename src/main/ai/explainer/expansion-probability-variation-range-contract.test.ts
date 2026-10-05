import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionProbabilityVariationRangeScene } from '../../remotion/compositions/explainer/expansion/probability/variation-range-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionQualifiedInterval,
  parseExpansionRepeatedSamples,
} from './expansion-probability-variation-range-contract';
import { makeParseContext, type Rec } from './kind-spec';

const document = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/probability/variation-range.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};
const clauses13 = [
  'Sample review compares Sample A and Sample B from town residents during March.',
  'Sample A response count is 4 count during March among town residents with denominator 10.',
  'Sample B response count is 6 count during March among town residents with denominator 10.',
  'Sample A and Sample B are supplied samples from town residents during March.',
  'For town residents during March, sample counts vary across the supplied samples.',
];
const clauses14 = [
  'Interval review reviews Project A interval from district homes during March.',
  'Project A lower bound is 4 count during March among district homes with denominator 10.',
  'Project A upper bound is 8 count during March among district homes with denominator 10.',
  'Project A interval is an estimated range during March among district homes.',
  'Project A interval remains an estimated range during March among district homes.',
];
function fixtureFor(id: '13' | '14'): ExpansionSourceFixture {
  const fixture = document.stories.find((story) => story.id === id);
  if (!fixture) throw new Error(`Missing raw JSON fixture ${id}`);
  return fixture;
}
function parse(fixture: ExpansionSourceFixture, proposal: Rec = fixture.proposal) {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.id === '13'
      ? parseExpansionRepeatedSamples(proposal, ctx)
      : parseExpansionQualifiedInterval(proposal, ctx);
  return { scene, issues: ctx.issues };
}
function accepted(
  fixture: ExpansionSourceFixture,
  proposal: Rec = fixture.proposal,
): ExpansionProbabilityVariationRangeScene {
  const result = parse(fixture, proposal);
  expect(result.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error(`Rejected positive ${fixture.id}`);
  return result.scene;
}
function both(fixture: ExpansionSourceFixture): ExpansionProbabilityVariationRangeScene {
  const scene = accepted(fixture);
  expect(accepted(fixture, { ...fixture.proposal, visualMode: 'hybrid' })).toEqual({
    ...scene,
    visualMode: 'hybrid',
  });
  return scene;
}
function quantity(proposal: Rec, id: '13' | '14', index = 0): Rec {
  return id === '13'
    ? ((proposal.samples as Rec[])[index]?.quantity as Rec)
    : (proposal[index === 0 ? 'lower' : 'upper'] as Rec);
}
function setBasis(value: Rec, period: string, population: string, denominator = 10): void {
  value.basis = {
    unit: 'count',
    period,
    population,
    denominator: { numerator: denominator, denominator: 1 },
  };
}
function setValue(value: Rec, numerator: number, denominator = 1): void {
  value.amount = { kind: 'rational', value: { numerator, denominator } };
}
function reauthor(
  id: '13' | '14',
  clauses: readonly string[],
  mutate: (proposal: Rec) => void = () => {},
): ExpansionSourceFixture {
  const speech = expansionFixtureSpeech(clauses, 10);
  const proposal = structuredClone(fixtureFor(id).proposal);
  const [setup, action, response, check, resolve] = speech.spans;
  if (!setup || !action || !response || !check || !resolve)
    throw new Error('Five clauses required');
  Object.assign(proposal, {
    startWord: 0,
    endWord: speech.window.endWord,
    setupWord: setup.fromWord,
    actionWord: action.fromWord,
    responseWord: response.fromWord,
    checkWord: check.fromWord,
    resolveWord: resolve.fromWord,
  });
  (proposal.population as Rec).evidence = setup;
  const entities = proposal.entities as Rec[];
  for (const [index, entity] of entities.entries())
    entity.evidence = id === '13' && index !== 0 ? (index === 1 ? action : response) : setup;
  quantity(proposal, id).evidence = action;
  quantity(proposal, id, 1).evidence = response;
  (proposal.meaning as Rec).evidence = check;
  proposal.resolutionEvidence = resolve;
  mutate(proposal);
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}

describe('step 9 finite samples and source-qualified interval contracts', () => {
  it('accepts source-grounded May periods while retaining exact sample/endpoint values and qualifications', () => {
    for (const id of ['13', '14'] as const) {
      const text = (id === '13' ? clauses13 : clauses14).map((clause) =>
        clause.replaceAll('March', 'May'),
      );
      const fixture = reauthor(id, text, (proposal) => {
        (proposal.population as Rec).period = 'May';
        const population = id === '13' ? 'town residents' : 'district homes';
        setBasis(quantity(proposal, id), 'May', population);
        setBasis(quantity(proposal, id, 1), 'May', population);
      });
      expect(text[4], `story ${id}: authored resolve`).toContain(String(fixture.proposal.outcome));
      expect(
        fixture.words
          .slice(Number(fixture.proposal.resolveWord))
          .map(({ text }) => text)
          .join(' '),
        `story ${id}: positioned resolve`,
      ).toContain(String(fixture.proposal.outcome));
      const scene = both(fixture);
      expect(scene.period).toBe('May');
      expect(scene).not.toHaveProperty('confidence');
      if (scene.storyId === '13')
        expect(scene.samples.map(({ quantity }) => quantity.basis.period)).toEqual(['May', 'May']);
      else expect([scene.lower.basis.period, scene.upper.basis.period]).toEqual(['May', 'May']);
    }
  });
  it('reads actual versioned source JSON and exact production-padded concrete words', () => {
    expect(document.version).toBe(1);
    expect(document.pack).toBe('probability');
    expect(document.stories.map((fixture) => fixture.id)).toEqual(['13', '14']);
    for (const fixture of document.stories) {
      expect(fixture.words.map((word) => word.text).join(' ')).toBe(fixture.sourceText);
      expect(fixture.words).toEqual(conceptFixtureWords(fixture.sourceText, 10));
      expect(fixture.window).toEqual({
        startWord: 0,
        endWord: fixture.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(fixture.negatives.length).toBeGreaterThan(45);
    }
  });
  for (const fixture of document.stories) {
    it(`story ${fixture.id}: both modes and repeated parses preserve exact facts, identities and source times`, () => {
      const before = structuredClone(fixture);
      const scene = both(fixture);
      expect(accepted(fixture)).toEqual(scene);
      expect(accepted(fixture, structuredClone(fixture.proposal))).toEqual(scene);
      expect(fixture).toEqual(before);
      expect(scene.entities.map((entity) => entity.id)).toEqual(
        scene.entities.map((_, index) => `expansion-${fixture.id}-entity-${index}`),
      );
      const fields = [
        'setupWord',
        'actionWord',
        'responseWord',
        'checkWord',
        'resolveWord',
      ] as const;
      const sourceTimes = fields.map(
        (field) => fixture.words[fixture.proposal[field] as number]?.start,
      );
      const times = [
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
        scene.resolveAt,
      ];
      expect(times).toEqual(
        sourceTimes.map((time, index) => (index === 0 ? Math.max(0.3, time ?? -1) : time)),
      );
      expect(
        times.every(
          (time, index) =>
            Number.isFinite(time) && (index === 0 || time > (times[index - 1] ?? Infinity)),
        ),
      ).toBe(true);
      expect(10 - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(accepted(fixture, { ...fixture.proposal, layout: 'stack-flipped' })).toEqual(scene);
      for (const field of ['treatment', 'distribution', 'confidence', 'seed', 'derived'])
        expect(scene).not.toHaveProperty(field);
    });
    for (const negative of fixture.negatives) {
      it(`story ${fixture.id}: rejects raw JSON ${negative.name} with diagnostics`, () => {
        const local = {
          ...fixture,
          proposal: negative.proposal,
          words: negative.words ?? fixture.words,
          window: negative.window ?? fixture.window,
          sourceText: negative.sourceText ?? fixture.sourceText,
        };
        if (negative.sourceText)
          expect(local.words.map((word) => word.text).join(' ')).toBe(negative.sourceText);
        const modes =
          negative.proposal.visualMode === 'diagram'
            ? ['diagram', 'hybrid']
            : [negative.proposal.visualMode];
        for (const visualMode of modes) {
          const result = parse(local, { ...negative.proposal, visualMode });
          expect(result.scene, `${negative.name} (${String(visualMode)})`).toBeNull();
          expect(result.issues.length, negative.name).toBeGreaterThan(0);
        }
      });
    }
  }
  it('retains actor-owned supplied count operands and exact population, period and denominator', () => {
    const scene = both(fixtureFor('13'));
    if (scene.storyId !== '13') throw new Error('Expected samples');
    expect(scene.populationId).toBe('expansion-13-entity-0');
    expect(scene.samples.map((sample) => sample.id)).toEqual([
      'expansion-13-sample-0',
      'expansion-13-sample-1',
    ]);
    expect(scene.samples.map((sample) => sample.entityId)).toEqual([
      'expansion-13-entity-1',
      'expansion-13-entity-2',
    ]);
    for (const [index, sample] of scene.samples.entries()) {
      expect(sample.quantity).toMatchObject({
        actor: index === 0 ? 'Sample A' : 'Sample B',
        state: 'known',
        amount: { kind: 'rational', value: { numerator: index === 0 ? 4 : 6, denominator: 1 } },
        basis: {
          unit: 'count',
          period: 'March',
          population: 'town residents',
          denominator: { numerator: 10, denominator: 1 },
        },
      });
      expect(sample.quantity).not.toHaveProperty('confidence');
      expect(sample.quantity).not.toHaveProperty('derived');
    }
    expect(scene.meaning.qualification).toBe('supplied samples');
  });
  it('retains supplied interval operands and explicit estimate meaning, not statistical confidence', () => {
    const scene = both(fixtureFor('14'));
    if (scene.storyId !== '14') throw new Error('Expected interval');
    expect(scene.actorId).toBe('expansion-14-entity-1');
    expect(scene.lower).toMatchObject({
      actor: 'Project A',
      claim: 'lower bound',
      state: 'known',
      amount: { kind: 'rational', value: { numerator: 4, denominator: 1 } },
    });
    expect(scene.upper).toMatchObject({
      actor: 'Project A',
      claim: 'upper bound',
      state: 'known',
      amount: { kind: 'rational', value: { numerator: 8, denominator: 1 } },
    });
    expect(scene.lower.basis).toEqual(scene.upper.basis);
    expect(scene.meaning).toMatchObject({ kind: 'estimate', qualification: 'an estimated range' });
    expect(scene.outcome).toBe('interval remains an estimated range');
    expect(scene).not.toHaveProperty('confidence');
  });
  it.each([
    'illustrative',
    'simulated',
  ] as const)('preserves explicitly supplied %s teaching counts rather than measured observations', (state) => {
    const qualifier = state === 'illustrative' ? 'teaching example' : 'simulation';
    const teaching = clauses13.map((text, index) =>
      index < 3
        ? `In this ${qualifier}, ${text}`
        : text.replace('supplied samples', 'teaching samples'),
    );
    const fixture = reauthor('13', teaching, (proposal) => {
      proposal.evidence = 'illustrative';
      (proposal.meaning as Rec).qualification = 'teaching samples';
      for (const index of [0, 1])
        Object.assign(quantity(proposal, '13', index), { state, qualifier });
    });
    const scene = both(fixture);
    if (scene.storyId !== '13') throw new Error('Expected samples');
    expect(scene.evidence).toBe('illustrative');
    expect(scene.samples.every((sample) => sample.quantity.state === state)).toBe(true);
    expect(scene.samples[0]?.quantity).toMatchObject({
      state,
      qualifier,
      amount: { value: { numerator: 4, denominator: 1 } },
    });
    const promoted = structuredClone(fixture.proposal);
    for (const index of [0, 1]) {
      const value = quantity(promoted, '13', index);
      value.state = 'known';
      delete value.qualifier;
    }
    expect(parse(fixture, promoted).scene).toBeNull();
    expect(parse(fixture, promoted).issues.length).toBeGreaterThan(0);
  });
  it('accepts realistic sample paraphrases with period-first locally owned quantities', () => {
    const fixture = reauthor(
      '13',
      [
        'Sample audit reviews Batch East and Batch West among registered voters during April.',
        'During April, Batch East reported response count of 3 count among registered voters with denominator 12.',
        'During April, Batch West reported response count of 7 count among registered voters with denominator 12.',
        'Batch East and Batch West are supplied samples among registered voters during April.',
        'Among registered voters during April, sample counts differ across the supplied samples.',
      ],
      (proposal) => {
        Object.assign(proposal, {
          label: 'Sample audit',
          subject: 'registered voters',
          outcome: 'sample counts differ',
        });
        Object.assign(proposal.population as Rec, { entity: 'registered voters', period: 'April' });
        const labels = ['registered voters', 'Batch East', 'Batch West'];
        (proposal.entities as Rec[]).forEach((entity, index) => {
          entity.label = labels[index];
        });
        for (const [index, label] of ['Batch East', 'Batch West'].entries()) {
          (proposal.samples as Rec[])[index].entity = label;
          const value = quantity(proposal, '13', index);
          value.actor = label;
          setBasis(value, 'April', 'registered voters', 12);
          setValue(value, index === 0 ? 3 : 7);
        }
      },
    );
    const scene = both(fixture);
    expect(scene).toMatchObject({
      period: 'April',
      meaning: { qualification: 'supplied samples' },
    });
  });
  it('accepts realistic uncertain-range paraphrases with exact decimal rational operands', () => {
    const fixture = reauthor(
      '14',
      [
        'Budget note tracks Project B interval among local homes during April.',
        'During April, Project B reported lower bound of 2.5 count among local homes with denominator 12.',
        'During April, Project B reported upper bound of 7.5 count among local homes with denominator 12.',
        'For local homes during April, Project B interval is an uncertain range.',
        'Project B interval stays an uncertain range among local homes during April.',
      ],
      (proposal) => {
        Object.assign(proposal, {
          label: 'Budget note',
          subject: 'Project B',
          actor: 'Project B',
          outcome: 'interval stays an uncertain range',
        });
        Object.assign(proposal.population as Rec, { entity: 'local homes', period: 'April' });
        (proposal.entities as Rec[])[0].label = 'local homes';
        (proposal.entities as Rec[])[1].label = 'Project B';
        for (const index of [0, 1]) {
          const value = quantity(proposal, '14', index);
          value.actor = 'Project B';
          setBasis(value, 'April', 'local homes', 12);
          setValue(value, index === 0 ? 5 : 15, 2);
        }
        Object.assign(proposal.meaning as Rec, {
          kind: 'uncertain',
          qualification: 'an uncertain range',
        });
      },
    );
    const scene = both(fixture);
    if (scene.storyId !== '14') throw new Error('Expected interval');
    expect(scene.lower).toMatchObject({
      amount: { value: { numerator: 5, denominator: 2 }, notation: '2.5' },
    });
    expect(scene.upper).toMatchObject({
      amount: { value: { numerator: 15, denominator: 2 }, notation: '7.5' },
    });
    expect(scene.meaning).toMatchObject({ kind: 'uncertain', qualification: 'an uncertain range' });
  });
  it('allows source-supplied equal ordered endpoints without inventing confidence', () => {
    const fixture = reauthor(
      '14',
      clauses14.map((text, index) => (index === 2 ? text.replace('8 count', '4 count') : text)),
      (proposal) => setValue(quantity(proposal, '14', 1), 4),
    );
    const scene = both(fixture);
    if (scene.storyId !== '14') throw new Error('Expected interval');
    expect(scene.lower).toMatchObject({ amount: { value: { numerator: 4, denominator: 1 } } });
    expect(scene.upper).toMatchObject({ amount: { value: { numerator: 4, denominator: 1 } } });
    expect(scene.meaning.kind).toBe('estimate');
  });
  it('allows the exact 100-display-mark cap without producing arbitrary draws', () => {
    const fixture = reauthor(
      '13',
      clauses13.map((text) => text.replace('denominator 10', 'denominator 50')),
      (proposal) => {
        for (const index of [0, 1])
          setBasis(quantity(proposal, '13', index), 'March', 'town residents', 50);
      },
    );
    const scene = both(fixture);
    if (scene.storyId !== '13') throw new Error('Expected samples');
    expect(scene.samples.map((sample) => sample.quantity.basis.denominator)).toEqual([
      { numerator: 50, denominator: 1 },
      { numerator: 50, denominator: 1 },
    ]);
    expect(scene.samples).toHaveLength(2);
  });
  it.each([
    NaN,
    Infinity,
    -Infinity,
  ])('rejects non-JSON nonfinite operand %s with diagnostics', (numerator) => {
    for (const id of ['13', '14'] as const) {
      const proposal = structuredClone(fixtureFor(id).proposal);
      setValue(quantity(proposal, id), numerator);
      const result = parse(fixtureFor(id), proposal);
      expect(result.scene).toBeNull();
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
