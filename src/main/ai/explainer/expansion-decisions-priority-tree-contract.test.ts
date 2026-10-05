import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type {
  ExpansionDecisionTreeScene,
  ExpansionWeightedCriteriaScene,
} from '../../remotion/compositions/explainer/expansion/decisions/priority-tree-types';
import { expansionEntityId } from '../../remotion/compositions/explainer/expansion/scene-types';
import {
  parseExpansionDecisionTree,
  parseExpansionWeightedCriteria,
} from './expansion-decisions-priority-tree-contract';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import { makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

const packet = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/decisions/priority-tree.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: ExpansionSourceFixture[] };
function fixtureStory(id: string): ExpansionSourceFixture {
  const story = packet.stories.find((value) => value.id === id);
  if (!story) throw new Error(`Required approved story ${id} is missing`);
  return story;
}
const weighted = fixtureStory('27'),
  tree = fixtureStory('28');
const BEATS = ['setupWord', 'actionWord', 'responseWord', 'checkWord', 'resolveWord'] as const;
const TIMES = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const;
function parse(id: '27' | '28', proposal: Rec, words: readonly PlannerWord[], window: SceneWindow) {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '27'
      ? parseExpansionWeightedCriteria(proposal, ctx)
      : parseExpansionDecisionTree(proposal, ctx);
  return { scene, ctx };
}
function clauses(story: ExpansionSourceFixture) {
  return story.sourceText.split(/(?<=\.)\s+(?=[A-Z])/u);
}
function paraphrase(
  story: ExpansionSourceFixture,
  source: readonly string[],
  indices: readonly number[] = [0, 1, 2, 3, source.length - 1],
) {
  const speech = expansionFixtureSpeech(source, 10),
    previous = expansionFixtureSpeech(clauses(story), 10);
  function rebase(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rebase);
    if (value && typeof value === 'object') {
      const record = value as Rec;
      if (Object.keys(record).length === 2 && 'fromWord' in record && 'toWord' in record) {
        const index = previous.spans.findIndex(
          (span) => span.fromWord === record.fromWord && span.toWord === record.toWord,
        );
        if (index < 0) throw new Error('Fixture evidence must retain a whole source clause');
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
    proposal[field] = speech.spans[indices[index]].fromWord;
  });
  return { ...speech, proposal };
}
function positive27(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionWeightedCriteriaScene {
  const result = parse('27', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('constraint-choice');
  const hybrid = parse('27', { ...proposal, visualMode: 'hybrid' }, words, window);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(hybrid.scene).toEqual({ ...result.scene, visualMode: 'hybrid' });
  return result.scene as ExpansionWeightedCriteriaScene;
}
function positive28(
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): ExpansionDecisionTreeScene {
  const result = parse('28', proposal, words, window);
  expect(result.ctx.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  expect(result.scene?.kind).toBe('conditional-choice');
  const hybrid = parse('28', { ...proposal, visualMode: 'hybrid' }, words, window);
  expect(hybrid.ctx.issues).toEqual([]);
  expect(hybrid.scene).toEqual({ ...result.scene, visualMode: 'hybrid' });
  return result.scene as ExpansionDecisionTreeScene;
}
function effects(proposal: Rec) {
  return proposal.effects as Rec[];
}
function nodes(proposal: Rec) {
  return proposal.nodes as Rec[];
}
function criteria(proposal: Rec) {
  return proposal.criteria as { entity: string; weight?: Rec }[];
}
function rationalAmount(n: number) {
  return { kind: 'rational', value: { numerator: n, denominator: 1 } };
}
function quantity(claim: string, n: number, evidence: Rec, unit = 'percent') {
  return {
    actor: 'Ada',
    claim,
    state: 'known',
    amount: rationalAmount(n),
    basis: { unit, period: 'March', population: 'priorities' },
    evidence,
  };
}
function weightCase() {
  const source = [
    `Ada's priorities include criteria Cost and Speed.`,
    `Ada Cost weight is 20 percent during March among priorities.`,
    `Ada Speed weight is 80 percent during March among priorities.`,
    clauses(weighted)[1],
    clauses(weighted)[2],
    clauses(weighted)[4],
  ];
  const next = paraphrase(weighted, source, [0, 1, 2, 3, 5]);
  delete next.proposal.priorities;
  for (const [index, entry] of criteria(next.proposal).entries())
    entry.weight = quantity(`${entry.entity} weight`, index === 0 ? 20 : 80, next.spans[index + 1]);
  for (const effect of effects(next.proposal))
    effect.evidence = next.spans[effect.candidate === 'Plan A' ? 3 : 4];
  for (const entity of next.proposal.entities as { label: string; evidence: Rec }[])
    if (entity.label === 'Plan A' || entity.label === 'Plan B')
      entity.evidence = next.spans[entity.label === 'Plan A' ? 3 : 4];
  return next;
}
function assertTree(scene: ExpansionDecisionTreeScene) {
  expect(scene.branches).toHaveLength(scene.nodes.length - 1);
  expect(scene.branches.some((branch) => branch.toId === scene.rootId)).toBe(false);
  for (const node of scene.nodes)
    if (node.entityId !== scene.rootId)
      expect(scene.branches.filter((branch) => branch.toId === node.entityId)).toHaveLength(1);
  const visited = new Set<string>();
  function walk(id: string, ancestors: ReadonlySet<string>) {
    expect(ancestors.has(id)).toBe(false);
    visited.add(id);
    const next = new Set([...ancestors, id]);
    for (const branch of scene.branches.filter((branch) => branch.fromId === id)) {
      expect(branch.role).toBe('conditional');
      expect(scene.nodes.some((node) => node.entityId === branch.toId)).toBe(true);
      walk(branch.toId, next);
    }
  }
  walk(scene.rootId, new Set());
  expect(visited.size).toBe(scene.nodes.length);
  for (const node of scene.nodes) {
    const count = scene.branches.filter((branch) => branch.fromId === node.entityId).length;
    if (node.role === 'condition') expect(count).toBeGreaterThanOrEqual(2);
    else expect(count).toBe(0);
  }
}

describe('decision priorities/tree source packets', () => {
  it('reads both actual raw packets with production speech padding, exact joined source and explicit negatives', () => {
    expect(packet.version).toBe(1);
    expect(packet.pack).toBe('decisions');
    expect(packet.stories.map((story) => story.id)).toEqual(['27', '28']);
    expect(packet.stories.map((story) => story.negatives.length)).toEqual([57, 54]);
    for (const story of packet.stories) {
      expect(story.words.map((word) => word.text).join(' ')).toBe(story.sourceText);
      expect(story.words).toEqual(conceptFixtureWords(story.sourceText, 10));
      expect(expansionFixtureSpeech(clauses(story), 10).words).toEqual(story.words);
      expect(story.words[0].start).toBe(0.25);
      expect(story.words.at(-1)?.end).toBe(9.65);
      expect(story.window).toEqual({
        startWord: 0,
        endWord: story.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
    }
  });
  for (const story of packet.stories) {
    const id = story.id as '27' | '28';
    describe(`story ${id}`, () => {
      it('preserves source facts, IDs, qualification and all five beat times across modes, layouts and repeated parses', () => {
        const diagram = parse(
            id,
            { ...story.proposal, visualMode: 'diagram' },
            story.words,
            story.window,
          ),
          hybrid = parse(
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
        if (!scene) throw new Error('Expected complete source-grounded scene');
        expect(scene.entities.map((entity) => entity.id)).toEqual(
          scene.entities.map((_, index) => expansionEntityId(id, index)),
        );
        expect(scene.entities.map((entity) => entity.label)).toEqual(
          (story.proposal.entities as { label: string }[]).map((entity) => entity.label),
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
        if (scene.kind === 'conditional-choice') assertTree(scene);
      });
      for (const negative of story.negatives)
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
            expect(result.ctx.issues.length, `${id}/${negative.name}/${mode}`).toBeGreaterThan(0);
          }
        });
    });
  }
  it('retains explicit before/after priorities and actor-owned candidate effects without numeric weights, scores or winner', () => {
    const scene = positive27(weighted.proposal, weighted.words, weighted.window);
    expect(
      scene.priorities?.before.order.map(
        (id) => scene.entities.find((entity) => entity.id === id)?.label,
      ),
    ).toEqual(['Cost', 'Speed']);
    expect(
      scene.priorities?.after.order.map(
        (id) => scene.entities.find((entity) => entity.id === id)?.label,
      ),
    ).toEqual(['Speed', 'Cost']);
    expect(scene.effects.map((effect) => [effect.text, effect.state, effect.qualifier])).toEqual([
      ['cost is unknown', 'unknown', 'unknown'],
      ['delivery may improve', 'conditional', 'may'],
      ['cost may fall', 'conditional', 'may'],
      ['delivery is disputed', 'disputed', 'disputed'],
    ]);
    expect(scene.criteria.every((criterion) => criterion.weight === undefined)).toBe(true);
    expect(scene.scores).toEqual([]);
    expect(scene.resolution.state).toBe('unresolved');
    for (const field of ['derived', 'computedScores', 'winner', 'chosenId'])
      expect(scene).not.toHaveProperty(field);
  });
  it('retains source supplied weight operands and basis without normalizing or calculating candidate scores', () => {
    const next = weightCase(),
      scene = positive27(next.proposal, next.words, next.window);
    expect(scene.priorities).toBeUndefined();
    expect(scene.criteria.map((criterion) => criterion.weight?.state)).toEqual(['known', 'known']);
    expect(scene.criteria.map((criterion) => criterion.weight)).toMatchObject([
      {
        actor: 'Ada',
        claim: 'Cost weight',
        amount: rationalAmount(20),
        basis: { unit: 'percent', period: 'March', population: 'priorities' },
      },
      {
        actor: 'Ada',
        claim: 'Speed weight',
        amount: rationalAmount(80),
        basis: { unit: 'percent', period: 'March', population: 'priorities' },
      },
    ]);
    expect(scene.scores).toEqual([]);
    expect(scene.resolution.state).toBe('unresolved');
    expect(scene).not.toHaveProperty('derived');
  });
  it('accepts independently worded priority/effect paraphrases while preserving the same facts and identities', () => {
    const source = clauses(weighted);
    source[0] = `Ada's priorities place Cost before Speed.`;
    source[1] = source[1]
      .replace('has Cost effect', 'carries Cost effect')
      .replace(' and Speed', ' while Speed');
    source[2] = source[2].replace('has Cost effect', 'has the Cost effect');
    source[3] = `Ada's priorities now place Speed before Cost.`;
    source[4] = `Ada's choice is still unresolved for both candidates.`;
    const next = paraphrase(weighted, source),
      scene = positive27(next.proposal, next.words, next.window);
    expect(scene.effects.map((effect) => effect.text)).toEqual(
      effects(weighted.proposal).map((effect) => effect.text),
    );
    expect(scene.entities.map((entity) => entity.id)).toEqual(
      positive27(weighted.proposal, weighted.words, weighted.window).entities.map(
        (entity) => entity.id,
      ),
    );
  });
  it.each([
    'unknown',
    'missing',
    'disputed',
  ] as const)('retains a %s source weight without fabricated zero or calculated scores', (state) => {
    const next = weightCase();
    const source = next.sourceText.split(/(?<=\.)\s+(?=[A-Z])/u);
    source[2] = source[2].replace(
      '80 percent',
      state === 'disputed' ? 'disputed between 70 and 90 percent' : `${state} percent`,
    );
    const candidate = paraphrase(
      {
        ...weighted,
        proposal: next.proposal,
        sourceText: next.sourceText,
        words: next.words,
        window: next.window,
      },
      source,
      [0, 1, 2, 3, 5],
    );
    const weight = criteria(candidate.proposal)[1].weight;
    if (!weight) throw new Error('Explicit weight required');
    weight.state = state;
    weight.qualifier = state;
    delete weight.amount;
    if (state === 'disputed') weight.alternatives = [rationalAmount(70), rationalAmount(90)];
    const scene = positive27(candidate.proposal, candidate.words, candidate.window);
    expect(scene.criteria[1].weight?.state).toBe(state);
    expect(scene.criteria[1].weight).not.toHaveProperty('amount');
    expect(scene.scores).toEqual([]);
    expect(scene.resolution.state).toBe('unresolved');
  });
  it('preserves only explicit source scores, including unknown scores, without filling weights or deriving a winner', () => {
    const source = clauses(weighted);
    source.splice(
      4,
      0,
      `Ada Plan A score is 10 count during March among priorities.`,
      `Ada Plan B score is unknown count during March among priorities.`,
    );
    const next = paraphrase(weighted, source, [0, 1, 2, 3, 6]);
    const a = quantity('Plan A score', 10, next.spans[4], 'count'),
      b = {
        actor: 'Ada',
        claim: 'Plan B score',
        state: 'unknown',
        qualifier: 'unknown',
        basis: { unit: 'count', period: 'March', population: 'priorities' },
        evidence: next.spans[5],
      };
    next.proposal.scores = [
      { candidate: 'Plan A', quantity: a },
      { candidate: 'Plan B', quantity: b },
    ];
    const scene = positive27(next.proposal, next.words, next.window);
    expect(scene.scores.map((score) => score.quantity.state)).toEqual(['known', 'unknown']);
    expect(scene.scores[0].quantity).toMatchObject({ amount: rationalAmount(10) });
    expect(scene.scores[1].quantity).not.toHaveProperty('amount');
    expect(scene.resolution.state).toBe('unresolved');
    expect(scene).not.toHaveProperty('derived');
  });
  it('retains actual predicates, negation, conditional outcomes and unknown branches without evaluating the root or choosing a winner', () => {
    const scene = positive28(tree.proposal, tree.words, tree.window);
    assertTree(scene);
    expect(scene.branches.map((branch) => branch.test)).toEqual([
      'permit approved',
      'permit not approved',
    ]);
    expect(scene.nodes.map((node) => [node.role, node.text, node.state])).toEqual([
      ['condition', 'permit approved', 'known'],
      ['outcome', 'launch may proceed', 'conditional'],
      ['outcome', 'decision is unknown', 'unknown'],
    ]);
    expect(scene.resolution.state).toBe('unresolved');
    for (const field of ['winner', 'selectedBranch', 'evaluatedCondition', 'derived'])
      expect(scene).not.toHaveProperty(field);
  });
  it('accepts independently authored definition/outcome/branch paraphrases without changing predicates or states', () => {
    const source = clauses(tree);
    source[0] = `Ada's decision tree gives condition Permit as "permit approved".`;
    source[1] = source[1].replace('leads to', 'routes to').replace('on branch', 'for case');
    source[2] = source[2].replace('leads to', 'routes to');
    source[3] = source[3]
      .replace('gives outcome', 'defines outcome')
      .replace(' and outcome', ' while outcome');
    source[4] = `Ada's choice stays unresolved for both candidates.`;
    const next = paraphrase(tree, source),
      scene = positive28(next.proposal, next.words, next.window);
    expect(scene.branches.map((branch) => branch.test)).toEqual([
      'permit approved',
      'permit not approved',
    ]);
    expect(scene.nodes.map((node) => node.state)).toEqual(['known', 'conditional', 'unknown']);
    assertTree(scene);
  });
  it.each([
    ['missing', 'decision is missing', 'missing'],
    ['disputed', 'decision is disputed', 'disputed'],
    ['simulated', 'simulation predicts a delay', 'simulation'],
    ['illustrative', 'example predicts a delay', 'example'],
  ] as const)('retains a %s leaf instead of asserting a certain result', (state, text, qualifier) => {
    const source = clauses(tree);
    source[3] = source[3].replace('decision is unknown', text);
    const next = paraphrase(tree, source);
    Object.assign(nodes(next.proposal)[2], { state, text, qualifier });
    if (state === 'simulated' || state === 'illustrative') next.proposal.evidence = 'illustrative';
    const scene = positive28(next.proposal, next.words, next.window);
    expect(scene.nodes[2]).toMatchObject({ state, text, qualifier });
    expect(scene.resolution.state).toBe('unresolved');
    assertTree(scene);
  });
  it('permits a source-chosen outcome only when the source explicitly supplies both its known result and actual choice', () => {
    const source = clauses(tree);
    source[3] = source[3].replace('launch may proceed', 'launch proceeds');
    source[4] = `Ada's choice is Launch.`;
    const next = paraphrase(tree, source);
    Object.assign(nodes(next.proposal)[1], { text: 'launch proceeds', state: 'known' });
    delete nodes(next.proposal)[1].qualifier;
    next.proposal.outcome = 'Launch';
    next.proposal.resolution = { state: 'source-chosen', choice: 'Launch' };
    const scene = positive28(next.proposal, next.words, next.window);
    expect(scene.resolution).toMatchObject({
      state: 'source-chosen',
      choiceId: scene.nodes[1].entityId,
    });
    assertTree(scene);
  });
});
