import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type {
  ArgumentMapReasonsObjectionsScene,
  ConditionalComparisonAssumptionToggleScene,
} from '../../remotion/compositions/explainer/expansion/reasoning/argument-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseArgumentMapReasonsObjections,
  parseConditionalComparisonAssumptionToggle,
} from './expansion-reasoning-argument-contract';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

const fixtures = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/reasoning/argument.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
const story03 = fixtures.stories.find((story) => story.id === '03');
const story04 = fixtures.stories.find((story) => story.id === '04');
if (!story03 || !story04) throw new Error('Both approved argument stories must be present');

function parse(id: '03' | '04', proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '03'
      ? parseArgumentMapReasonsObjections(proposal, ctx)
      : parseConditionalComparisonAssumptionToggle(proposal, ctx);
  return { scene, ctx };
}

function clauses(story: ExpansionSourceFixture): string[] {
  return BEATS.map((field, index) => {
    const from = Number(story.proposal[field]);
    const to = index === 4 ? story.window.endWord : Number(story.proposal[BEATS[index + 1]]) - 1;
    return story.words
      .slice(from, to + 1)
      .map((word) => word.text)
      .join(' ');
  });
}

/** Rebase only word evidence/timing when authoring a genuinely different source paraphrase. */
function paraphrase(story: ExpansionSourceFixture, sourceClauses: readonly string[]) {
  const speech = expansionFixtureSpeech(sourceClauses, 10);
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
        if (index < 0) throw new Error('Fixture evidence must retain a full clause');
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
  return { proposal, ...speech };
}

function positive03(proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const result = parse('03', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  return result.scene as ArgumentMapReasonsObjectionsScene;
}
function positive04(proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const result = parse('04', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  return result.scene as ConditionalComparisonAssumptionToggleScene;
}

function assertTree(scene: ArgumentMapReasonsObjectionsScene) {
  expect(scene.edges).toHaveLength(scene.nodes.length - 1);
  expect(scene.nodes.filter((node) => node.role === 'claim').map((node) => node.entityId)).toEqual([
    scene.claimId,
  ]);
  expect(scene.edges.some((edge) => edge.fromId === scene.claimId)).toBe(false);
  for (const node of scene.nodes) {
    let current = node.entityId;
    const visited = new Set<string>();
    while (current !== scene.claimId) {
      expect(visited.has(current)).toBe(false);
      visited.add(current);
      const outgoing = scene.edges.filter((edge) => edge.fromId === current);
      expect(outgoing).toHaveLength(1);
      const edge = outgoing[0];
      const from = scene.nodes.find((candidate) => candidate.entityId === current);
      expect(from?.role).toBe(edge.role === 'support' ? 'premise' : 'objection');
      expect(scene.nodes.some((candidate) => candidate.entityId === edge.toId)).toBe(true);
      current = edge.toId;
    }
  }
}

describe('expansion reasoning argument source fixtures', () => {
  it('contains exactly stories 03–04 with real production-padded source speech', () => {
    expect(fixtures.version).toBe(1);
    expect(fixtures.pack).toBe('reasoning');
    expect(fixtures.stories.map((story) => story.id)).toEqual(['03', '04']);
    for (const story of fixtures.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(clauses(story), 10).words).toEqual(story.words);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(clauses(story)).toHaveLength(5);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      expect(story.negatives.length).toBeGreaterThanOrEqual(40);
    }
  });

  for (const story of fixtures.stories) {
    const id = story.id as '03' | '04';
    describe(`story ${id}`, () => {
      it('retains identical facts, generated IDs and source beat times across modes, layouts and repeated parses', () => {
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
        if (!scene) throw new Error('Expected a complete source scene');
        expect(scene.entities.map((entry) => entry.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(id, index)),
        );
        expect(scene.entities.map((entry) => entry.label)).toEqual(
          (story.proposal.entities as { label: string }[]).map((entry) => entry.label),
        );
        expect(scene.resolveAt).toBeLessThanOrEqual(story.window.endTime - 0.8);
        expect(TIMES.map((field) => scene[field])).toEqual(
          BEATS.map((field, index) =>
            index === 0 ? 0.3 : story.words[Number(story.proposal[field])].start,
          ),
        );
        expect(parse(id, structuredClone(story.proposal), story.words, story.window).scene).toEqual(
          scene,
        );
        expect(
          parse(id, { ...story.proposal, layout: 'stack-flipped' }, story.words, story.window)
            .scene,
        ).toEqual(scene);
        expect(scene).not.toHaveProperty('treatment');
        if (scene.kind === 'argument-map') assertTree(scene);
      });
      for (const negative of story.negatives) {
        it(`rejects ${negative.name} with diagnostics in both modes`, () => {
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

  it('represents premises and objections as argumentation, not proof or adjudicated truth', () => {
    const scene = positive03(story03.proposal, story03.words, story03.window);
    assertTree(scene);
    expect(scene.edges.map((edge) => [edge.role, edge.state])).toEqual([
      ['support', 'stated'],
      ['rebuttal', 'stated'],
    ]);
    expect(scene.nodes.map((node) => node.statement)).toEqual([
      'we should keep the pilot',
      'monthly churn fell by 2.50%',
      'long-term cost is unknown',
    ]);
    expect(scene.resolution).toBe('disputed');
    for (const field of ['truth', 'proven', 'verified', 'winner', 'score'])
      expect(scene).not.toHaveProperty(field);
    for (const node of scene.nodes) expect(node).not.toHaveProperty('verified');
  });

  it('accepts a nested objection against a premise while preserving a rooted directed tree', () => {
    const source = clauses(story03);
    source[2] = source[2].replace('rebuts claim Pilot', 'rebuts premise Retention');
    const next = paraphrase(story03, source);
    (next.proposal.edges as Rec[])[1].to = 'Retention';
    const scene = positive03(next.proposal, next.words, next.window);
    assertTree(scene);
    expect(scene.edges[1].toId).toBe(scene.nodes.find((node) => node.role === 'premise')?.entityId);
  });

  it('accepts realistic separate source-attribution and relation paraphrases without changing facts', () => {
    const source = clauses(story03);
    source[0] = `Ada presents claim Pilot as "we should keep the pilot".`;
    source[1] = `Ada describes premise Retention as "monthly churn fell by 2.50%" and is a reason for claim Pilot.`;
    source[2] = `Ada states objection Cost as "long-term cost is unknown" and challenges claim Pilot.`;
    source[3] = `Ada examines the premises and objections about claim Pilot.`;
    source[4] = `The claim Pilot is still disputed.`;
    const next = paraphrase(story03, source);
    const scene = positive03(next.proposal, next.words, next.window);
    expect(scene.nodes.map((node) => node.statement)).toEqual(
      (story03.proposal.nodes as { statement: string }[]).map((node) => node.statement),
    );
    expect(scene.edges.map((edge) => edge.role)).toEqual(['support', 'rebuttal']);
    expect(scene.resolution).toBe('disputed');
  });

  it.each([
    ['qualified', 'might', 'might support'],
    ['unknown', undefined, 'has unknown support for'],
    ['disputed', undefined, 'has disputed support for'],
    ['negated', 'does not', 'does not support'],
    ['negated', 'Never', 'Never supports'],
  ])('retains %s relationship status and its exact source qualification %s', (state, qualifier, predicate) => {
    const source = clauses(story03);
    source[1] = source[1].replace('and supports', `and ${predicate}`);
    const next = paraphrase(story03, source);
    const edge = (next.proposal.edges as Rec[])[0];
    edge.state = state;
    if (qualifier !== undefined) edge.qualifier = qualifier;
    const scene = positive03(next.proposal, next.words, next.window);
    expect(scene.edges[0].state).toBe(state);
    expect(scene.edges[0].qualifier).toBe(qualifier ?? state);
    expect(scene.nodes[1].statement).toBe('monthly churn fell by 2.50%');
    expect(scene.resolution).toBe('disputed');
    assertTree(scene);
  });

  it('retains a proposition and support edge only within their explicit local condition', () => {
    const source = clauses(story03);
    const condition = 'If permits are delayed';
    source[1] = `${condition}, ${source[1]}`;
    const next = paraphrase(story03, source);
    next.proposal.condition = condition;
    (next.proposal.nodes as Rec[])[1].condition = condition;
    (next.proposal.edges as Rec[])[0].condition = condition;
    const scene = positive03(next.proposal, next.words, next.window);
    expect(scene.condition).toBe(condition);
    expect(scene.nodes[1].condition).toBe(condition);
    expect(scene.edges[0].condition).toBe(condition);
    expect(scene.nodes[0]).not.toHaveProperty('condition');
    expect(scene.edges[1]).not.toHaveProperty('condition');
  });

  it('preserves exact alternatives, condition, modal and unknown effects without invented outcomes', () => {
    const scene = positive04(story04.proposal, story04.words, story04.window);
    expect(scene.condition).toBe('If permits are delayed');
    expect(
      scene.alternativeIds.map((id) => scene.entities.find((entry) => entry.id === id)?.label),
    ).toEqual(['Plan A', 'Plan B']);
    expect(scene.effects.map((effect) => effect.text)).toEqual([
      'opening may slip',
      'long-term cost is unknown',
    ]);
    expect(scene.effects.map((effect) => effect.condition)).toEqual([
      scene.condition,
      scene.condition,
    ]);
    expect(scene.effects.map((effect) => effect.alternativeId)).toEqual(scene.alternativeIds);
    expect(scene.effects.map((effect) => effect.actorId)).toEqual([scene.actorId, scene.actorId]);
    expect(scene.resolution).toBe('unresolved');
    for (const field of ['winner', 'scores', 'counterfactualResult'])
      expect(scene).not.toHaveProperty(field);
    for (const effect of scene.effects) {
      expect(effect).not.toHaveProperty('value');
      expect(effect).not.toHaveProperty('score');
    }
  });

  it('accepts separate comparison paraphrases and preserves unless rather than reversing the condition', () => {
    const source = clauses(story04);
    const condition = 'Unless permits are delayed';
    source[0] = `Ada's comparison considers options Plan A and Plan B.`;
    source[1] = source[1]
      .replace('If permits are delayed', condition)
      .replace(' and Ada', ' while Ada');
    source[2] = `Ada keeps the stated assumption for Ada's comparison.`;
    source[3] = `Ada checks the stated effects for Ada's comparison without ranking the alternatives.`;
    source[4] = `Ada's comparison is still unresolved.`;
    const next = paraphrase(story04, source);
    next.proposal.condition = condition;
    for (const effect of next.proposal.effects as Rec[]) effect.condition = condition;
    const scene = positive04(next.proposal, next.words, next.window);
    expect(scene.condition).toBe(condition);
    expect(scene.effects.map((effect) => effect.text)).toEqual([
      'opening may slip',
      'long-term cost is unknown',
    ]);
    expect(scene.effects.every((effect) => effect.condition === condition)).toBe(true);
    expect(scene.resolution).toBe('unresolved');
  });
});
