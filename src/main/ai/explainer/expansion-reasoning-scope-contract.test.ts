import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { expansionStory } from '../../remotion/compositions/explainer/expansion/catalog';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionSameFacts,
  parseExpansionScopedStatements,
} from './expansion-reasoning-scope-contract';
import { isRec, makeParseContext, type Rec } from './kind-spec';

const source = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/expansion/reasoning/scope.source.json', 'utf8'),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};
const beats = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
function fixture(id: '07' | '08'): ExpansionSourceFixture {
  const found = source.stories.find((story) => story.id === id);
  if (!found) throw new Error(`Missing source fixture ${id}`);
  return found;
}
function rec(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected a real fixture record');
  return value;
}
function records(value: unknown): Rec[] {
  if (!Array.isArray(value)) throw new Error('Expected a real fixture record array');
  return value.map(rec);
}
function clauses(story: ExpansionSourceFixture): string[] {
  const starts = beats.map((field) => {
    const index = story.proposal[field];
    if (typeof index !== 'number') throw new Error('Missing fixture beat');
    return index;
  });
  return starts.map((start, index) =>
    story.words
      .slice(start, starts[index + 1] ?? story.words.length)
      .map((word) => word.text)
      .join(' '),
  );
}
function parse(story: ExpansionSourceFixture, proposal = story.proposal) {
  const ctx = makeParseContext(story.words, story.window);
  const scene =
    story.id === '07'
      ? parseExpansionScopedStatements(proposal, ctx)
      : parseExpansionSameFacts(proposal, ctx);
  return { ctx, scene };
}
/** Remap every local span when separately authored source wording changes its word counts. */
function rewritten(id: '07' | '08', text: string[]): ExpansionSourceFixture {
  const original = fixture(id);
  const speech = expansionFixtureSpeech(text, 10);
  const proposal = structuredClone(original.proposal);
  beats.forEach((field, index) => {
    proposal[field] = speech.spans[index].fromWord;
  });
  proposal.startWord = speech.window.startWord;
  proposal.endWord = speech.window.endWord;
  if (id === '07') {
    const statements = records(proposal.statements);
    statements.forEach((statement, index) => {
      statement.evidence = speech.spans[index + 1];
    });
    records(proposal.actors).forEach((actor, index) => {
      actor.evidence = speech.spans[index];
    });
  } else {
    records(proposal.facts).forEach((fact, index) => {
      rec(fact.quantity).evidence = speech.spans[index + 1];
    });
    records(proposal.actors).forEach((actor) => {
      actor.evidence = speech.spans[0];
    });
    records(proposal.frames).forEach((frame) => {
      frame.evidence = speech.spans[3];
    });
  }
  records(proposal.relations).forEach((relation) => {
    relation.evidence = speech.spans[3];
  });
  rec(proposal.result).evidence = speech.spans[4];
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}

describe('expansion reasoning scope production-source fixtures', () => {
  it('contains the two approved stories with concrete production-padded speech and five complete beats', () => {
    expect(source.version).toBe(1);
    expect(source.pack).toBe('reasoning');
    expect(source.stories.map((story) => story.id)).toEqual(['07', '08']);
    for (const story of source.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      const speech = expansionFixtureSpeech(clauses(story), 10);
      expect(story.words).toEqual(speech.words);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(story.window).toEqual(speech.window);
      expect(story.words[0].start).toBe(0.25);
      expect(story.words[story.words.length - 1].end).toBe(9.65);
      expect(story.negatives.length).toBeGreaterThanOrEqual(30);
    }
  });

  for (const story of source.stories) {
    describe(`story ${story.id}`, () => {
      it('preserves identical factual data in both modes, repeats deterministically and does not mutate the proposal', () => {
        const before = structuredClone(story);
        const diagram = parse(story, { ...story.proposal, visualMode: 'diagram' });
        const hybrid = parse(story, { ...story.proposal, visualMode: 'hybrid' });
        expect(diagram.ctx.issues).toEqual([]);
        expect(hybrid.ctx.issues).toEqual([]);
        expect(diagram.scene).not.toBeNull();
        expect(hybrid.scene).toEqual({ ...diagram.scene, visualMode: 'hybrid' });
        expect(parse(story).scene).toEqual(diagram.scene);
        expect(parse(story).scene).toEqual(diagram.scene);
        expect(story).toEqual(before);
        if (!diagram.scene) throw new Error('Expected production parse');
        expect(diagram.scene.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
        expect(
          [
            diagram.scene.setupAt,
            diagram.scene.actionAt,
            diagram.scene.responseAt,
            diagram.scene.checkAt,
            diagram.scene.resolveAt,
          ].every(Number.isFinite),
        ).toBe(true);
      });
      it.each(story.negatives)('rejects $name with real parser diagnostics', (negative) => {
        const variant = {
          ...story,
          sourceText: negative.sourceText ?? story.sourceText,
          words: negative.words ?? story.words,
          window: negative.window ?? story.window,
        };
        expect(variant.words.map((word) => word.text).join(' ')).toBe(variant.sourceText);
        const result = parse(variant, negative.proposal);
        expect(result.scene, negative.name).toBeNull();
        expect(result.ctx.issues.length, negative.name).toBeGreaterThan(0);
      });
    });
  }

  it('07 retains every statement owner, source, version, period, scope, uncertainty and exact numeric spelling', () => {
    const story = fixture('07');
    const ctx = makeParseContext(story.words, story.window);
    const scene = parseExpansionScopedStatements(story.proposal, ctx);
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Expected scoped statements');
    expect(scene.actors.map((actor) => actor.id)).toEqual(
      [0, 1, 2].map((index) => expansionEntityId('07', index)),
    );
    expect(scene.statements).toEqual([
      {
        id: expansionEntityId('07', 8),
        label: 'Morning',
        actorId: scene.actors[0].id,
        sourceId: scene.actors[1].id,
        version: 'V1',
        period: 'April',
        scope: 'weekday access',
        claim: 'doors might open at 2.50 hours',
        status: 'disputed',
        condition: 'If the permit is granted',
        evidence: records(story.proposal.statements)[0].evidence,
      },
      {
        id: expansionEntityId('07', 9),
        label: 'Evening',
        actorId: scene.actors[0].id,
        sourceId: scene.actors[2].id,
        version: 'V2',
        period: 'May',
        scope: 'weekend access',
        claim: 'doors remain closed until 3.00 hours',
        status: 'unresolved',
        evidence: records(story.proposal.statements)[1].evidence,
      },
    ]);
    expect(scene.relations).toEqual([
      {
        fromId: scene.statements[0].id,
        toId: scene.statements[1].id,
        role: 'scope-distinction',
        dimension: 'scope',
        status: 'disputed',
        evidence: records(story.proposal.relations)[0].evidence,
      },
    ]);
    expect(scene.result.status).toBe('disputed');
    expect(scene).not.toHaveProperty('winner');
  });

  it('07 accepts a separately worded attribution and distinction without losing the condition', () => {
    const story = rewritten('07', [
      'Library scoped statements preserve Bulletin and Notice alongside their named owners, recorded versions, reporting periods and different access scopes.',
      'If the permit is granted, for weekday access during April, Bulletin attributes Morning to Library under version V1 with disputed status: doors might open at 2.50 hours.',
      'Within weekend access in May, Notice assigns Evening to Library under version V2 with unresolved status: doors remain closed until 3.00 hours.',
      'The scope of Morning differs from Evening and the comparison stays disputed.',
      'The Morning and Evening comparison stays disputed after checking their scopes.',
    ]);
    story.proposal.outcome = 'stays disputed';
    const parsed = parse(story);
    expect(parsed.ctx.issues).toEqual([]);
    expect(parsed.scene?.kind).toBe('evidence-conflict');
    if (parsed.scene?.kind !== 'evidence-conflict')
      throw new Error('Expected scoped statements paraphrase');
    const baseline = parse(fixture('07')).scene;
    if (baseline?.kind !== 'evidence-conflict')
      throw new Error('Expected baseline scoped statements');
    expect(
      parsed.scene.statements.map(
        ({ actorId, sourceId, version, period, scope, claim, status, condition }) => ({
          actorId,
          sourceId,
          version,
          period,
          scope,
          claim,
          status,
          condition,
        }),
      ),
    ).toEqual(
      baseline.statements.map(
        ({ actorId, sourceId, version, period, scope, claim, status, condition }) => ({
          actorId,
          sourceId,
          version,
          period,
          scope,
          claim,
          status,
          condition,
        }),
      ),
    );
    expect(parsed.scene.relations[0]).toMatchObject({
      role: 'scope-distinction',
      dimension: 'scope',
      status: 'disputed',
    });
  });

  it('07 reported means exact source attribution, not truth or certainty of modal or negative claims', () => {
    const story = rewritten('07', [
      'Library scoped statements preserve Bulletin and Notice alongside their named owners, recorded versions, reporting periods and different access scopes.',
      'Bulletin reports Morning by Library in version V1 during April for weekday access as reported: doors may open at 2.50 hours.',
      'Notice records Evening from Library under version V2 in May within weekend access with reported status: doors did not open at 3.00 hours.',
      'The scope of Morning differs from Evening and the comparison stays disputed.',
      'The Morning and Evening comparison stays disputed after checking their scopes.',
    ]);
    delete story.proposal.condition;
    const entries = records(story.proposal.statements);
    delete entries[0].condition;
    entries[0].status = 'reported';
    entries[0].claim = 'doors may open at 2.50 hours';
    entries[1].status = 'reported';
    entries[1].claim = 'doors did not open at 3.00 hours';
    story.proposal.outcome = 'stays disputed';
    const parsed = parse(story);
    expect(parsed.ctx.issues).toEqual([]);
    if (parsed.scene?.kind !== 'evidence-conflict')
      throw new Error('Expected attributed source statements');
    expect(parsed.scene.statements.map(({ claim, status }) => ({ claim, status }))).toEqual([
      { claim: 'doors may open at 2.50 hours', status: 'reported' },
      { claim: 'doors did not open at 3.00 hours', status: 'reported' },
    ]);
    expect(parsed.scene.result.status).toBe('disputed');
    expect(parsed.scene).not.toHaveProperty('winner');
  });
  it('07 accepts only explicitly stated same-context conflict and leaves it unresolved', () => {
    const story = rewritten('07', [
      'Library scoped statements preserve Bulletin and Notice alongside their named owners, recorded versions, reporting periods and clearly specified access scopes.',
      'Bulletin reports Morning by Library in version V1 during April for weekday access as disputed: doors are open at 2.50 hours.',
      'Notice records Evening from Library under version V1 in April within weekday access with unresolved status: doors are not open at 2.50 hours.',
      'Morning conflicts with Evening for weekday access and the comparison remains unresolved.',
      'The Morning and Evening comparison stays unresolved after checking the statements.',
    ]);
    delete story.proposal.condition;
    const statements = records(story.proposal.statements);
    delete statements[0].condition;
    statements[0].claim = 'doors are open at 2.50 hours';
    Object.assign(statements[1], {
      version: 'V1',
      period: 'April',
      scope: 'weekday access',
      claim: 'doors are not open at 2.50 hours',
    });
    const relation = records(story.proposal.relations)[0];
    delete relation.dimension;
    Object.assign(relation, { role: 'conflict', status: 'unresolved' });
    rec(story.proposal.result).status = 'unresolved';
    story.proposal.outcome = 'stays unresolved';
    const result = parse(story);
    expect(result.ctx.issues).toEqual([]);
    if (result.scene?.kind !== 'evidence-conflict') throw new Error('Expected explicit conflict');
    expect(result.scene.relations[0]).toMatchObject({ role: 'conflict', status: 'unresolved' });
    expect(result.scene.statements[1].claim).toBe('doors are not open at 2.50 hours');
    expect(result.scene.result.status).toBe('unresolved');
    expect(result.scene).not.toHaveProperty('winner');
  });

  it('08 uses one complete shared identity pool and retains source precision/denominators without deriving anything', () => {
    expect(expansionStory('08').allowedDerivations).toEqual([]);
    const story = fixture('08');
    const ctx = makeParseContext(story.words, story.window);
    const scene = parseExpansionSameFacts(story.proposal, ctx);
    expect(ctx.issues).toEqual([]);
    if (!scene) throw new Error('Expected same facts');
    const ids = [expansionEntityId('08', 8), expansionEntityId('08', 9)];
    expect(scene.facts.map((fact) => fact.id)).toEqual(ids);
    expect(scene.frames.map((frame) => frame.factIds)).toEqual([ids, ids]);
    expect(scene.frames.map((frame) => frame.referenceFactId)).toEqual(ids);
    expect(scene.facts.map((fact) => fact.quantity)).toEqual(
      records(story.proposal.facts).map((fact, index) => ({
        ...rec(fact.quantity),
        amount: { ...rec(rec(fact.quantity).amount), notation: index === 0 ? '100.00' : '60.00' },
      })),
    );
    expect(scene.facts.map((fact) => fact.actorId)).toEqual([
      scene.actors[0].id,
      scene.actors[0].id,
    ]);
    expect(scene.relations[0]).toEqual({
      fromId: scene.frames[0].id,
      toId: scene.frames[1].id,
      role: 'reference-change',
      fromReferenceId: ids[0],
      toReferenceId: ids[1],
      evidence: records(story.proposal.relations)[0].evidence,
    });
    expect(scene.result.status).toBe('unchanged');
    expect(scene).not.toHaveProperty('ratio');
    expect(scene).not.toHaveProperty('derived');
  });

  it('08 accepts realistic alternative reference wording with exactly the same factual content', () => {
    const story = rewritten('08', [
      'Clinic framing comparison retains Whole and Reviewed alongside the same patient records, keeping every reported quantity and identity in both views.',
      'During June, Clinic recorded total patients of 100.00 items among V1 patient records with denominator 200.',
      'During June, Clinic recorded reviewed patients of 60.00 items among V1 patient records with denominator 200.',
      'Across Whole and Reviewed, total patients and reviewed patients stay identical while the reference switches from total patients to reviewed patients.',
      'After switching the reference, Whole and Reviewed still retain the same total patients and reviewed patients.',
    ]);
    story.proposal.outcome = 'same total patients';
    const result = parse(story);
    expect(result.ctx.issues).toEqual([]);
    if (result.scene?.kind !== 'framing-comparison')
      throw new Error('Expected reference paraphrase');
    const baseline = parse(fixture('08')).scene;
    if (baseline?.kind !== 'framing-comparison') throw new Error('Expected baseline same facts');
    expect(result.scene.facts.map((fact) => ({ ...fact.quantity, evidence: undefined }))).toEqual(
      baseline.facts.map((fact) => ({
        ...fact.quantity,
        evidence: undefined,
      })),
    );
  });

  it('08 preserves an unknown denominator reference without inventing zero, one hundred or a percentage', () => {
    const text = clauses(fixture('08'));
    text[2] = text[2].replace('60.00', 'unknown');
    text[3] = text[3].replace('reference', 'denominator');
    text[4] = text[4].replace('reference', 'denominator');
    const story = rewritten('08', text);
    const quantity = rec(records(story.proposal.facts)[1].quantity);
    delete quantity.amount;
    Object.assign(quantity, { state: 'unknown', qualifier: 'unknown' });
    records(story.proposal.relations)[0].role = 'denominator-change';
    const result = parse(story);
    expect(result.ctx.issues).toEqual([]);
    if (result.scene?.kind !== 'framing-comparison')
      throw new Error('Expected unknown denominator');
    expect(result.scene.facts[1].quantity).toMatchObject({
      state: 'unknown',
      qualifier: 'unknown',
    });
    expect(result.scene.facts[1].quantity).not.toHaveProperty('amount');
    expect(result.scene.frames[1].referenceFactId).toBe(result.scene.facts[1].id);
    expect(result.scene.relations[0].role).toBe('denominator-change');
    expect(result.scene).not.toHaveProperty('ratio');
    expect(result.scene).not.toHaveProperty('derived');
  });

  it.each([
    'percent',
    'percentage-point',
    'percent-change',
  ] as const)('08 retains explicit %s rather than changing its numeric meaning', (unit) => {
    const text = clauses(fixture('08')).map((clause) => clause.replace(' count ', ` ${unit} `));
    const story = rewritten('08', text);
    records(story.proposal.facts).forEach((fact) => {
      rec(rec(fact.quantity).basis).unit = unit;
    });
    const result = parse(story);
    expect(result.ctx.issues).toEqual([]);
    if (result.scene?.kind !== 'framing-comparison')
      throw new Error('Expected explicit percent unit');
    expect(result.scene.facts.map((fact) => fact.quantity.basis.unit)).toEqual([unit, unit]);
    expect(
      result.scene.facts.map((fact) => ('amount' in fact.quantity ? fact.quantity.amount : null)),
    ).toEqual([
      { kind: 'rational', value: { numerator: 100, denominator: 1 }, notation: '100.00' },
      { kind: 'rational', value: { numerator: 60, denominator: 1 }, notation: '60.00' },
    ]);
  });
});
