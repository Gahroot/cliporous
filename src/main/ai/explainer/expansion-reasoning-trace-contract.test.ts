import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONCEPT_FIXTURE_PADDING,
  conceptFixtureWords,
} from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ReasoningTraceScene } from '../../remotion/compositions/explainer/expansion/reasoning/trace-types';
import type { ExpansionEvidenceSpan } from '../../remotion/compositions/explainer/expansion/value-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseClaimSourceBoard,
  parseEvidenceToClaimTrace,
} from './expansion-reasoning-trace-contract';
import { isRec, makeParseContext, type PlannerWord, type Rec, type SceneWindow } from './kind-spec';

type TraceFixture = Omit<ExpansionSourceFixture, 'id'> & { readonly id: '01' | '02' };
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/explainer-stills/fixtures/expansion/reasoning/trace.source.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: number; pack: string; stories: TraceFixture[] };

const CLAUSES = {
  '01': [
    'Return claim is traced to Returns guide and Policy excerpt.',
    'Returns guide contains Policy excerpt stating returns may be accepted within thirty days.',
    'Return claim states returns may be accepted within thirty days.',
    'Policy excerpt from Returns guide supports Return claim.',
    'Return claim retains its citation as provenance, not proof.',
  ],
  '02': [
    'Delivery dispute compares Dispatch statement from Shipping log and Arrival statement from Warehouse note.',
    'Shipping log reports Dispatch statement stating parcel is sealed.',
    'Warehouse note records Arrival statement stating parcel is not sealed.',
    'Dispatch statement from Shipping log conflicts with Arrival statement from Warehouse note.',
    'Delivery dispute remains unresolved.',
  ],
} as const;
const BEATS = ['setup', 'action', 'response', 'check', 'resolve'] as const;

function parse(
  id: TraceFixture['id'],
  proposal: Rec,
  words: readonly PlannerWord[],
  window: SceneWindow,
): { scene: ReasoningTraceScene | null; issues: string[] } {
  const ctx = makeParseContext(words, window);
  const scene =
    id === '01' ? parseEvidenceToClaimTrace(proposal, ctx) : parseClaimSourceBoard(proposal, ctx);
  return { scene, issues: ctx.issues };
}
function requiredScene(result: ReturnType<typeof parse>): ReasoningTraceScene {
  expect(result.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error(`Valid source rejected: ${result.issues.join('; ')}`);
  return result.scene;
}
function clause(words: readonly PlannerWord[], span: ExpansionEvidenceSpan): string {
  return words
    .slice(span.fromWord, span.toWord + 1)
    .map((word) => word.text)
    .join(' ');
}
function records(raw: unknown): Rec[] {
  if (!Array.isArray(raw) || !raw.every(isRec))
    throw new Error('Fixture records must be raw objects');
  return raw;
}
function at(spans: readonly ExpansionEvidenceSpan[], index: number): ExpansionEvidenceSpan {
  const span = spans[index];
  if (!span) throw new Error(`Missing fixture clause ${index}`);
  return span;
}
function alternate(story: TraceFixture, clauses: readonly string[]) {
  const speech = expansionFixtureSpeech(clauses, 10);
  const proposal = structuredClone(story.proposal);
  proposal.endWord = speech.window.endWord;
  for (const [index, beat] of BEATS.entries())
    proposal[`${beat}Word`] = at(speech.spans, index).fromWord;
  for (const entity of records(proposal.entities)) entity.evidence = at(speech.spans, 0);
  for (const [index, record] of records(proposal.records).entries())
    record.evidence = at(speech.spans, index + 1);
  for (const [index, relation] of records(proposal.relations).entries()) {
    relation.evidence = at(
      speech.spans,
      index === 0 ? 1 : story.id === '02' && index === 1 ? 2 : 3,
    );
  }
  return { ...speech, proposal };
}
function fixture(id: TraceFixture['id']): TraceFixture {
  const story = fixtures.stories.find((entry) => entry.id === id);
  if (!story) throw new Error(`Missing story ${id}`);
  return story;
}

function expectSpeech(
  sourceText: string,
  words: readonly PlannerWord[],
  window: SceneWindow,
): void {
  expect(sourceText).toBe(words.map((word) => word.text).join(' '));
  expect(words).toEqual(conceptFixtureWords(sourceText, 10));
  expect(window).toEqual({ startWord: 0, endWord: words.length - 1, startTime: 0, endTime: 10 });
  expect(words[0]?.start).toBe(CONCEPT_FIXTURE_PADDING.leadInSec);
  expect(words.at(-1)?.end).toBe(10 - CONCEPT_FIXTURE_PADDING.tailSec);
}

describe('reasoning trace raw source fixtures', () => {
  it('contains only approved stories, concrete production-padded words and explicit negative proposals', () => {
    expect(fixtures.version).toBe(1);
    expect(fixtures.pack).toBe('reasoning');
    expect(fixtures.stories.map((story) => story.id)).toEqual(['01', '02']);
    for (const story of fixtures.stories) {
      expect(story.sourceText).toBe(CLAUSES[story.id].join(' '));
      expectSpeech(story.sourceText, story.words, story.window);
      expect(story.negatives.length).toBeGreaterThanOrEqual(39);
      expect(new Set(story.negatives.map((negative) => negative.name)).size).toBe(
        story.negatives.length,
      );
      expect(story.negatives.map((negative) => negative.name)).toEqual(
        expect.arrayContaining([
          'invented-endpoint',
          'invented-content',
          'invented-relation',
          'wrong-attributing-actor',
          'wrong-source-scope',
          'missing-content-fact',
          'missing-provenance',
          'qualification-or-negation-stripping',
          'invalid-preset',
          'invalid-mode',
          'raw-entity-id',
          'raw-record-id',
          'raw-relation-id',
          'model-provided-pattern',
          'svg-directive',
          'url-directive',
          'code-directive',
          'coordinate-directive',
          'illegitimate-treatment',
          'entity-cap',
          'record-cap',
          'relation-cap',
          'repeated-beat',
          'out-of-window-beat',
          'insufficient-final-hold',
        ]),
      );
      for (const negative of story.negatives) {
        expect(isRec(negative.proposal), negative.name).toBe(true);
        expectSpeech(
          negative.sourceText ?? story.sourceText,
          negative.words ?? story.words,
          negative.window ?? story.window,
        );
      }
    }
  });
});

for (const story of fixtures.stories) {
  describe(`story ${story.id} complete local contract`, () => {
    for (const visualMode of ['diagram', 'hybrid'] as const) {
      it(`preserves concrete facts, IDs, source spans and times in ${visualMode}`, () => {
        const before = structuredClone(story.proposal);
        const proposal = { ...story.proposal, visualMode };
        const scene = requiredScene(parse(story.id, proposal, story.words, story.window));
        const speech = expansionFixtureSpeech(CLAUSES[story.id], 10);
        expect(scene.storyId).toBe(story.id);
        expect(scene.visualMode).toBe(visualMode);
        expect(scene.label).toBe(story.id === '01' ? 'Return claim' : 'Delivery dispute');
        expect(scene.subject).toBe(scene.label);
        expect(scene.evidence).toBe('source-stated');
        expect(scene).not.toHaveProperty('treatment');
        expect(scene.sourceSpans).toEqual(
          Object.fromEntries(BEATS.map((beat, index) => [beat, at(speech.spans, index)])),
        );
        for (const [index, beat] of BEATS.entries()) {
          const span = scene.sourceSpans[beat];
          expect(clause(story.words, span)).toBe(CLAUSES[story.id][index]);
          const expectedTime = index === 0 ? 0.3 : story.words[span.fromWord]?.start;
          expect(scene[`${beat}At`]).toBe(expectedTime);
        }
        expect(story.window.endTime - scene.resolveAt).toBeGreaterThanOrEqual(0.8);
        const labels =
          story.id === '01'
            ? ['Returns guide', 'Policy excerpt', 'Return claim']
            : ['Shipping log', 'Dispatch statement', 'Warehouse note', 'Arrival statement'];
        expect(scene.entities).toEqual(
          labels.map((label, index) => ({
            id: `expansion-${story.id}-entity-${index}`,
            label,
            evidence: at(speech.spans, 0),
          })),
        );
        if (scene.storyId === '01') {
          expect(scene.kind).toBe('retrieval-grounding');
          expect(scene.preset).toBe('trace-chain');
          expect(scene.outcome).toBe('provenance');
          expect(scene.citationMeaning).toBe('provenance-not-proof');
          expect(scene.records).toEqual([
            {
              entityId: 'expansion-01-entity-1',
              role: 'excerpt',
              sourceId: 'expansion-01-entity-0',
              content: 'returns may be accepted within thirty days',
              evidence: at(speech.spans, 1),
            },
            {
              entityId: 'expansion-01-entity-2',
              role: 'claim',
              content: 'returns may be accepted within thirty days',
              evidence: at(speech.spans, 2),
            },
          ]);
          expect(scene.relations).toEqual([
            {
              fromId: 'expansion-01-entity-0',
              toId: 'expansion-01-entity-1',
              role: 'provenance',
              evidence: at(speech.spans, 1),
            },
            {
              fromId: 'expansion-01-entity-1',
              toId: 'expansion-01-entity-2',
              role: 'support',
              evidence: at(speech.spans, 3),
            },
          ]);
          expect(scene).not.toHaveProperty('truth');
        } else {
          expect(scene.kind).toBe('evidence-conflict');
          expect(scene.preset).toBe('claim-source-board');
          expect(scene.state).toBe('unresolved');
          expect(scene.outcome).toBe('unresolved');
          expect(scene.records).toEqual([
            {
              entityId: 'expansion-02-entity-1',
              role: 'statement',
              sourceId: 'expansion-02-entity-0',
              content: 'parcel is sealed',
              evidence: at(speech.spans, 1),
            },
            {
              entityId: 'expansion-02-entity-3',
              role: 'statement',
              sourceId: 'expansion-02-entity-2',
              content: 'parcel is not sealed',
              evidence: at(speech.spans, 2),
            },
          ]);
          expect(scene.relations).toEqual([
            {
              fromId: 'expansion-02-entity-0',
              toId: 'expansion-02-entity-1',
              role: 'provenance',
              evidence: at(speech.spans, 1),
            },
            {
              fromId: 'expansion-02-entity-2',
              toId: 'expansion-02-entity-3',
              role: 'provenance',
              evidence: at(speech.spans, 2),
            },
            {
              fromId: 'expansion-02-entity-1',
              toId: 'expansion-02-entity-3',
              role: 'rebuttal',
              evidence: at(speech.spans, 3),
            },
          ]);
          expect(scene).not.toHaveProperty('winner');
        }
        expect(requiredScene(parse(story.id, proposal, story.words, story.window))).toEqual(scene);
        expect(story.proposal).toEqual(before);
      });
    }
    it('changes only visualMode between diagram and hybrid; stack-flipped does not change facts', () => {
      const diagram = requiredScene(
        parse(story.id, { ...story.proposal, visualMode: 'diagram' }, story.words, story.window),
      );
      const hybrid = requiredScene(
        parse(story.id, { ...story.proposal, visualMode: 'hybrid' }, story.words, story.window),
      );
      expect(hybrid).toEqual({ ...diagram, visualMode: 'hybrid' });
      const flipped = requiredScene(
        parse(story.id, { ...story.proposal, layout: 'stack-flipped' }, story.words, story.window),
      );
      expect(flipped).toEqual(diagram);
    });
    for (const negative of story.negatives) {
      for (const visualMode of ['diagram', 'hybrid'] as const) {
        it(`rejects ${negative.name} (${visualMode}) with bounded diagnostics`, () => {
          // Preserve a fixture's deliberately invalid/missing mode instead of repairing it.
          const proposal = structuredClone(negative.proposal);
          if (proposal.visualMode === 'diagram') proposal.visualMode = visualMode;
          const result = parse(
            story.id,
            proposal,
            negative.words ?? story.words,
            negative.window ?? story.window,
          );
          expect(result.scene, `${negative.name}: ${result.issues.join('; ')}`).toBeNull();
          expect(result.issues.length, negative.name).toBeGreaterThan(0);
          expect(result.issues.length, negative.name).toBeLessThanOrEqual(4);
        });
      }
    }
  });
}

describe('independent realistic wording, without invented facts', () => {
  it('accepts passive excerpt attribution and active support while preserving negative content', () => {
    const story = fixture('01');
    const speech = alternate(story, [
      'Return claim draws on Returns guide and Policy excerpt.',
      'Policy excerpt in Returns guide reads refunds are not promised without a receipt.',
      'Return claim says refunds are not promised without a receipt.',
      'Return claim draws support from Policy excerpt in Returns guide.',
      'Return claim keeps its source reference.',
    ]);
    for (const record of records(speech.proposal.records))
      record.content = 'refunds are not promised without a receipt';
    speech.proposal.outcome = 'source reference';
    const diagram = requiredScene(parse('01', speech.proposal, speech.words, speech.window));
    expect(diagram.storyId).toBe('01');
    expect(diagram.records.map((record) => record.content)).toEqual([
      'refunds are not promised without a receipt',
      'refunds are not promised without a receipt',
    ]);
    expect(diagram.relations.at(-1)?.role).toBe('support');
    expect(clause(speech.words, diagram.sourceSpans.action)).toBe(
      'Policy excerpt in Returns guide reads refunds are not promised without a receipt.',
    );
    expect(
      requiredScene(
        parse('01', { ...speech.proposal, visualMode: 'hybrid' }, speech.words, speech.window),
      ),
    ).toEqual({ ...diagram, visualMode: 'hybrid' });
  });
  it('accepts paraphrased source attribution and direct past-tense opposition, ending disputed', () => {
    const story = fixture('02');
    const speech = alternate(story, [
      'Delivery dispute contrasts Dispatch statement in Shipping log and Arrival statement in Warehouse note.',
      'According to Shipping log, Dispatch statement says parcel arrived before noon.',
      'Arrival statement in Warehouse note states parcel did not arrive before noon.',
      'Dispatch statement in Shipping log and Arrival statement in Warehouse note contradict each other.',
      'Delivery dispute stays disputed.',
    ]);
    const rawRecords = records(speech.proposal.records);
    const first = rawRecords[0];
    const second = rawRecords[1];
    if (!first || !second) throw new Error('Expected paired statement records');
    first.content = 'parcel arrived before noon';
    second.content = 'parcel did not arrive before noon';
    speech.proposal.state = 'disputed';
    speech.proposal.outcome = 'disputed';
    const diagram = requiredScene(parse('02', speech.proposal, speech.words, speech.window));
    expect(diagram.storyId).toBe('02');
    if (diagram.storyId !== '02') throw new Error('Wrong story route');
    expect(diagram.state).toBe('disputed');
    expect(diagram.records.map((record) => record.content)).toEqual([
      'parcel arrived before noon',
      'parcel did not arrive before noon',
    ]);
    expect(diagram.relations.at(-1)?.role).toBe('rebuttal');
    expect(diagram).not.toHaveProperty('winner');
    expect(
      requiredScene(
        parse('02', { ...speech.proposal, visualMode: 'hybrid' }, speech.words, speech.window),
      ),
    ).toEqual({ ...diagram, visualMode: 'hybrid' });
  });
  it('retains a complete local support condition rather than silently promoting it to unconditional support', () => {
    const story = fixture('01');
    const clauses: string[] = [...CLAUSES['01']];
    clauses[3] =
      'If intake approval is granted, Policy excerpt from Returns guide supports Return claim.';
    const speech = alternate(story, clauses);
    const condition = 'If intake approval is granted';
    speech.proposal.condition = condition;
    const relation = records(speech.proposal.relations).at(-1);
    if (!relation) throw new Error('Expected support relation');
    relation.condition = condition;
    const scene = requiredScene(parse('01', speech.proposal, speech.words, speech.window));
    expect(scene.condition).toBe(condition);
    expect(scene.relations.at(-1)).toEqual({
      fromId: 'expansion-01-entity-1',
      toId: 'expansion-01-entity-2',
      role: 'support',
      evidence: at(speech.spans, 3),
      condition,
    });
    expect(clause(speech.words, scene.sourceSpans.check)).toBe(clauses[3]);
  });
});
