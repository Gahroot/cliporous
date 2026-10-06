import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import type { ExpansionReasoningInformationScene } from '../../remotion/compositions/explainer/expansion/reasoning/information-types';
import { type ExpansionSourceFixture, expansionFixtureSpeech } from './expansion-fixture-words';
import {
  parseExpansionConfounder,
  parseExpansionMissingEvidenceMap,
} from './expansion-reasoning-information-contract';
import { makeParseContext, type Rec } from './kind-spec';

const document = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/reasoning/information.source.json',
    'utf8',
  ),
) as {
  version: number;
  pack: string;
  stories: ExpansionSourceFixture[];
};

function parse(fixture: ExpansionSourceFixture, proposal: Rec = fixture.proposal) {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.id === '05'
      ? parseExpansionConfounder(proposal, ctx)
      : parseExpansionMissingEvidenceMap(proposal, ctx);
  return { scene, issues: ctx.issues };
}

function accepted(
  fixture: ExpansionSourceFixture,
  proposal: Rec = fixture.proposal,
): ExpansionReasoningInformationScene {
  const result = parse(fixture, proposal);
  expect(result.issues).toEqual([]);
  expect(result.scene).not.toBeNull();
  if (!result.scene) throw new Error(`Rejected positive story ${fixture.id}`);
  return result.scene;
}

function fixtureFor(id: '05' | '06'): ExpansionSourceFixture {
  const fixture = document.stories.find((story) => story.id === id);
  if (!fixture) throw new Error(`Missing actual JSON story ${id}`);
  return fixture;
}

function reauthor(
  id: '05' | '06',
  clauses: readonly string[],
  change: (proposal: Rec) => void,
): ExpansionSourceFixture {
  const original = fixtureFor(id);
  const speech = expansionFixtureSpeech(clauses, 10);
  const proposal = structuredClone(original.proposal);
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
  if (id === '05') {
    proposal.entities = [
      { label: 'training', evidence: setup },
      { label: 'recovery', evidence: setup },
      { label: 'sleep', evidence: response },
    ];
    proposal.association = { from: 'training', to: 'recovery', evidence: action };
    proposal.factor = {
      entity: 'sleep',
      affects: ['training', 'recovery'],
      certainty: 'possible',
      qualification: 'could',
      condition: 'If rosters change',
      evidence: response,
    };
    proposal.causalStatus = {
      from: 'training',
      to: 'recovery',
      qualification: 'has not been shown',
      evidence: check,
    };
    proposal.resolutionEvidence = resolve;
  } else {
    proposal.entities = [{ label: 'North clinic', evidence: setup }];
    proposal.records = [
      {
        owner: 'North clinic',
        topic: 'visit status',
        state: 'known',
        content: 'recorded',
        evidence: action,
      },
      {
        owner: 'North clinic',
        topic: 'consent status',
        state: 'unknown',
        qualification: 'not known',
        evidence: response,
      },
    ];
    proposal.nonFalse = { record: 1, qualification: 'not a false result', evidence: check };
    proposal.resolution = { record: 1, status: 'unresolved', evidence: resolve };
  }
  change(proposal);
  return {
    id,
    sourceText: speech.sourceText,
    words: speech.words,
    window: speech.window,
    proposal,
    negatives: [],
  };
}

const paraphrase05 = () =>
  reauthor(
    '05',
    [
      'Hospital audit examines training and recovery among shift workers.',
      'Among shift workers, training and recovery move together.',
      'If rosters change, sleep could affect both training and recovery among shift workers.',
      'Training has not been shown to cause recovery among shift workers.',
      'The causal question stays open among shift workers.',
    ],
    (proposal) =>
      Object.assign(proposal, {
        label: 'Hospital audit',
        subject: 'training',
        scope: 'shift workers',
        condition: 'If rosters change',
        outcome: 'causal question stays open',
      }),
  );

const paraphrase06 = () =>
  reauthor(
    '06',
    [
      'Patient review examines visit status and consent status for North clinic.',
      'For North clinic in Patient review, visit status is recorded.',
      'For North clinic in Patient review, consent status is not known.',
      'Unknown consent status for North clinic in Patient review is not a false result.',
      'For North clinic in Patient review, consent status stays unresolved.',
    ],
    (proposal) =>
      Object.assign(proposal, {
        label: 'Patient review',
        subject: 'North clinic',
        scope: 'Patient review',
        outcome: 'consent status stays unresolved',
      }),
  );

describe('expansion reasoning information production-source contracts', () => {
  it('reads actual versioned raw fixtures with concrete production-padded source words', () => {
    expect(document.version).toBe(1);
    expect(document.pack).toBe('reasoning');
    expect(document.stories.map((fixture) => fixture.id)).toEqual(['05', '06']);
    for (const fixture of document.stories) {
      expect(fixture.words.map((word) => word.text).join(' ')).toBe(fixture.sourceText);
      expect(fixture.words).toEqual(conceptFixtureWords(fixture.sourceText, 10));
      expect(fixture.window).toEqual({
        startWord: 0,
        endWord: fixture.words.length - 1,
        startTime: 0,
        endTime: 10,
      });
      expect(fixture.negatives.length).toBeGreaterThan(30);
    }
  });

  for (const fixture of document.stories) {
    it(`story ${fixture.id}: both modes keep exact IDs/facts/qualifications and source beat times`, () => {
      const before = structuredClone(fixture);
      const diagram = accepted(fixture);
      const hybrid = accepted(fixture, { ...fixture.proposal, visualMode: 'hybrid' });
      expect(hybrid).toEqual({ ...diagram, visualMode: 'hybrid' });
      expect(accepted(fixture)).toEqual(diagram);
      expect(accepted(fixture, structuredClone(fixture.proposal))).toEqual(diagram);
      expect(fixture).toEqual(before);
      expect(diagram.entities.map((entity) => entity.id)).toEqual(
        diagram.entities.map((_, index) => `expansion-${fixture.id}-entity-${index}`),
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
        diagram.setupAt,
        diagram.actionAt,
        diagram.responseAt,
        diagram.checkAt,
        diagram.resolveAt,
      ];
      expect(times).toEqual(
        sourceTimes.map((time, index) => (index === 0 ? Math.max(0.3, time ?? -1) : time)),
      );
      expect(times.every((time) => Number.isFinite(time) && time >= 0 && time <= 10)).toBe(true);
      expect(
        times.every((time, index) => index === 0 || time > (times[index - 1] ?? Infinity)),
      ).toBe(true);
      expect(10 - diagram.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(accepted(fixture, { ...fixture.proposal, layout: 'stack-flipped' })).toEqual(diagram);
      expect(diagram).not.toHaveProperty('treatment');
    });

    for (const negative of fixture.negatives) {
      it(`story ${fixture.id}: rejects JSON negative ${negative.name} with diagnostics`, () => {
        const local = {
          ...fixture,
          sourceText: negative.sourceText ?? fixture.sourceText,
          words: negative.words ?? fixture.words,
          window: negative.window ?? fixture.window,
          proposal: negative.proposal,
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

  it('preserves possibility, condition and unestablished status without inventing causal proof', () => {
    const scene = accepted(fixtureFor('05'));
    if (scene.storyId !== '05') throw new Error('Expected confounder');
    expect(scene.association).toMatchObject({
      fromId: 'expansion-05-entity-0',
      toId: 'expansion-05-entity-1',
      role: 'association',
    });
    expect(scene.factor).toMatchObject({
      entityId: 'expansion-05-entity-2',
      affectsIds: ['expansion-05-entity-0', 'expansion-05-entity-1'],
      certainty: 'possible',
      qualification: 'may',
      condition: 'if schedules change',
    });
    expect(scene.causalStatus).toMatchObject({
      status: 'unestablished',
      qualification: 'not established',
    });
    expect(scene.outcome).toBe('causal direction remains unresolved');
    expect(scene.factor).not.toHaveProperty('value');
  });

  it('preserves known content versus missing/not-false/unresolved rather than zero or false', () => {
    const scene = accepted(fixtureFor('06'));
    if (scene.storyId !== '06') throw new Error('Expected evidence map');
    expect(scene.records.map((record) => record.id)).toEqual([
      'expansion-06-record-0',
      'expansion-06-record-1',
    ]);
    expect(scene.records[0]).toMatchObject({
      ownerId: 'expansion-06-entity-0',
      state: 'known',
      content: 'complete',
    });
    expect(scene.records[1]).toMatchObject({
      ownerId: 'expansion-06-entity-0',
      state: 'missing',
      qualification: 'missing',
    });
    expect(scene.records[1]).not.toHaveProperty('content');
    expect(scene.records[1]).not.toHaveProperty('value');
    expect(scene.focusRecordId).toBe('expansion-06-record-1');
    expect(scene.nonFalse).toMatchObject({
      recordId: scene.focusRecordId,
      qualification: 'not false information',
    });
    expect(scene.resolution).toMatchObject({ recordId: scene.focusRecordId, status: 'unresolved' });
  });

  it('accepts realistic independent association/factor/causal paraphrases in both modes', () => {
    const fixture = paraphrase05();
    const diagram = accepted(fixture);
    expect(accepted(fixture, { ...fixture.proposal, visualMode: 'hybrid' })).toEqual({
      ...diagram,
      visualMode: 'hybrid',
    });
    expect(diagram).toMatchObject({
      scope: 'shift workers',
      factor: { certainty: 'possible', qualification: 'could', condition: 'If rosters change' },
      causalStatus: { status: 'unestablished', qualification: 'has not been shown' },
    });
  });

  it('accepts expressly stated factor effects without manufacturing a modal or condition', () => {
    const fixture = reauthor(
      '05',
      [
        'Hospital audit examines training and recovery among shift workers.',
        'Among shift workers, training and recovery move together.',
        'Sleep influences both training and recovery among shift workers.',
        'Training has not been shown to cause recovery among shift workers.',
        'The causal question stays open among shift workers.',
      ],
      (proposal) => {
        Object.assign(proposal, {
          label: 'Hospital audit',
          subject: 'training',
          scope: 'shift workers',
          outcome: 'causal question stays open',
        });
        delete proposal.condition;
        const factor = proposal.factor as Rec;
        factor.certainty = 'stated';
        delete factor.condition;
        delete factor.qualification;
      },
    );
    const scene = accepted(fixture);
    expect(scene).toMatchObject({ factor: { certainty: 'stated' } });
    if (scene.storyId !== '05') throw new Error('Expected confounder');
    expect(scene.factor).not.toHaveProperty('qualification');
    expect(scene.factor).not.toHaveProperty('condition');
    expect(accepted(fixture, { ...fixture.proposal, visualMode: 'hybrid' })).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
  });

  it('accepts unknown/not-known paraphrases without converting them to missing or false', () => {
    const fixture = paraphrase06();
    const scene = accepted(fixture);
    if (scene.storyId !== '06') throw new Error('Expected evidence map');
    expect(scene.records[1]).toMatchObject({ state: 'unknown', qualification: 'not known' });
    expect(scene.records[1]).not.toHaveProperty('content');
    expect(scene.nonFalse.qualification).toBe('not a false result');
    expect(accepted(fixture, { ...fixture.proposal, visualMode: 'hybrid' })).toEqual({
      ...scene,
      visualMode: 'hybrid',
    });
  });

  it.each([
    '0',
    'false',
  ])('accepts known %s only as explicitly actor-owned source content', (content) => {
    const fixture = reauthor(
      '06',
      [
        'Patient review examines visit status and consent status for North clinic.',
        `For North clinic in Patient review, visit status is ${content}.`,
        'For North clinic in Patient review, consent status is not known.',
        'Unknown consent status for North clinic in Patient review is not a false result.',
        'For North clinic in Patient review, consent status stays unresolved.',
      ],
      (proposal) => {
        Object.assign(proposal, {
          label: 'Patient review',
          subject: 'North clinic',
          scope: 'Patient review',
          outcome: 'consent status stays unresolved',
        });
        (proposal.records as Rec[])[0] = { ...(proposal.records as Rec[])[0], content };
      },
    );
    const scene = accepted(fixture);
    if (scene.storyId !== '06') throw new Error('Expected evidence map');
    expect(scene.records[0]).toMatchObject({ state: 'known', content });
    expect(scene.records[1]).not.toHaveProperty('content');
  });
});
