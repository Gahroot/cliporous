import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseExpansionConfounder,
  parseExpansionMissingEvidenceMap,
} from '../../../../../ai/explainer/expansion-reasoning-information-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { informationPose } from './information-poses';

import type { ExpansionReasoningInformationScene } from './information-types';

export function informationSourceScenes(
  visualMode: 'diagram' | 'hybrid' = 'hybrid',
): ExpansionReasoningInformationScene[] {
  const packet = JSON.parse(
    readFileSync(
      'scripts/explainer-stills/fixtures/expansion/reasoning/information.source.json',
      'utf8',
    ),
  ) as { stories: TemporalFixtureSeed[] };
  return temporalSourceFixtures([...packet.stories, ...informationMaximumSources()]).map(
    (fixture) => {
      const ctx = makeParseContext(fixture.words, fixture.window);
      const scene =
        fixture.id === '05'
          ? parseExpansionConfounder({ ...fixture.proposal, visualMode }, ctx)
          : parseExpansionMissingEvidenceMap({ ...fixture.proposal, visualMode }, ctx);
      expect(ctx.issues, `${fixture.id}: ${fixture.proposal.label}`).toEqual([]);
      if (!scene) throw new Error(`Rejected source ${fixture.id}`);
      expect(scene.visualMode).toBe(visualMode);
      expect(scene.resolveAt).toBe(fixture.words[fixture.proposal.resolveWord as number].start);
      expect(fixture.words[fixture.window.endWord].end).toBeGreaterThanOrEqual(
        scene.resolveAt + 0.2,
      );
      return scene;
    },
  );
}

export function informationMaximumSources(): TemporalFixtureSeed[] {
  const scope = `${'W'.repeat(39)}M`;
  const owners = Array.from(
    { length: 8 },
    (_, i) => `${'W'.repeat(27)}${String.fromCharCode(65 + i)}`,
  );
  const longTopic = 'T'.repeat(96),
    extraTopic = 'X'.repeat(96),
    focusTopic = 'insurance evidence';
  const value = `${'W'.repeat(95)}M`;
  const known = [
    ...owners.slice(0, 6).map((owner) => ({ owner, topic: longTopic, content: value })),
    ...owners.slice(0, 4).map((owner, i) => ({
      owner,
      topic: extraTopic,
      content: i === 0 ? 'false' : i === 1 ? 'zero' : value,
    })),
  ];
  const clauses06 = [
    `${scope} reviews ${longTopic}, ${extraTopic}, and ${focusTopic} for ${owners.slice(0, -1).join(', ')}, and ${owners[7]}.`,
    ...known.map(
      (record) => `${record.owner} reports ${record.topic} as ${record.content} in ${scope}.`,
    ),
    `${owners[6]}'s ${focusTopic} is not supplied in ${scope}.`,
    `${owners[7]}'s ${focusTopic} is not determined in ${scope}.`,
    `Missing ${focusTopic} for ${owners[6]} in ${scope} is not a zero or false value.`,
    `${owners[6]}'s ${focusTopic} remains unresolved in ${scope}.`,
  ];
  const seed = (
    id: '05' | '06',
    clauses: string[],
    phaseClauses: number[],
    make: (spans: readonly { fromWord: number; toWord: number }[]) => Rec,
  ): TemporalFixtureSeed => {
    const speech = expansionFixtureSpeech(clauses, 12);
    const starts = [0.25, 1.1, 4.8, 7.4, 9.4, 11.65];
    for (let phase = 0; phase < 5; phase++) {
      const first = speech.spans[phaseClauses[phase]].fromWord;
      const last = speech.spans[(phaseClauses[phase + 1] ?? clauses.length) - 1].toWord;
      for (let index = first; index <= last; index++) {
        speech.words[index].start =
          starts[phase] +
          ((starts[phase + 1] - starts[phase] - 0.05) * (index - first)) / (last - first + 1);
        speech.words[index].end =
          starts[phase] +
          ((starts[phase + 1] - starts[phase] - 0.05) * (index - first + 1)) / (last - first + 1);
      }
    }
    const proposal = make(speech.spans);
    Object.assign(proposal, {
      visualMode: 'hybrid',
      evidence: 'source-stated',
      startWord: 0,
      endWord: speech.window.endWord,
      layout: 'stack',
      setupWord: speech.spans[phaseClauses[0]].fromWord,
      actionWord: speech.spans[phaseClauses[1]].fromWord,
      responseWord: speech.spans[phaseClauses[2]].fromWord,
      checkWord: speech.spans[phaseClauses[3]].fromWord,
      resolveWord: speech.spans[phaseClauses[4]].fromWord,
    });
    return { id, ...speech, proposal, negatives: [] };
  };
  const maximum06 = seed('06', clauses06, [0, 1, 11, 13, 14], (spans) => ({
    kind: 'retrieval-grounding',
    preset: 'missing-evidence-map',
    label: scope,
    subject: owners[6],
    scope,
    outcome: `${focusTopic} remains unresolved`,
    entities: owners.map((label) => ({ label, evidence: spans[0] })),
    records: [
      ...known.map((record, i) => ({ ...record, state: 'known', evidence: spans[i + 1] })),
      {
        owner: owners[6],
        topic: focusTopic,
        state: 'missing',
        qualification: 'not supplied',
        evidence: spans[11],
      },
      {
        owner: owners[7],
        topic: focusTopic,
        state: 'unknown',
        qualification: 'not determined',
        evidence: spans[12],
      },
    ],
    focusRecord: 10,
    nonFalse: { record: 10, qualification: 'not a zero or false value', evidence: spans[13] },
    resolution: { record: 10, status: 'unresolved', evidence: spans[14] },
  }));
  const [x, y, factor] = owners;
  const label = 'L'.repeat(48),
    condition = `if ${'W'.repeat(92)}M`;
  const maximum05 = seed(
    '05',
    [
      `${label} tracks ${x} and ${y} among ${scope}.`,
      `${x} is associated with ${y} among ${scope}.`,
      `${factor} could influence both ${x} and ${y} among ${scope} ${condition}.`,
      `${x} has not been demonstrated to cause ${y} among ${scope}.`,
      `Causal direction remains unresolved among ${scope}.`,
    ],
    [0, 1, 2, 3, 4],
    (spans) => ({
      kind: 'relationship-analysis',
      preset: 'confounder',
      label,
      subject: x,
      scope,
      condition,
      outcome: 'Causal direction remains unresolved',
      entities: [x, y, factor].map((name, i) => ({
        label: name,
        evidence: spans[i === 2 ? 2 : 0],
      })),
      association: { from: x, to: y, evidence: spans[1] },
      factor: {
        entity: factor,
        affects: [x, y],
        certainty: 'possible',
        qualification: 'could',
        condition,
        evidence: spans[2],
      },
      causalStatus: {
        from: x,
        to: y,
        qualification: 'has not been demonstrated',
        evidence: spans[3],
      },
      resolutionEvidence: spans[4],
    }),
  );
  return [maximum05, maximum06];
}

describe('information frame-seekable source poses', () => {
  it('keeps every frame finite, bounded, identical after shuffled seeks and in final hold', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        const frames = Array.from(
          { length: Math.ceil((scene.resolveAt + 1) * 30) + 1 },
          (_, i) => i / 30,
        );
        const expected = frames.map((t) => informationPose(scene, t));
        for (const i of frames.map((_, i) => i).sort((a, b) => (a % 7) - (b % 7) || b - a)) {
          const pose = informationPose(scene, frames[i]);
          expect(pose).toEqual(expected[i]);
          for (const key of ['reveal', 'action', 'response', 'check', 'resolve'] as const) {
            expect(Number.isFinite(pose[key])).toBe(true);
            expect(pose[key]).toBeGreaterThanOrEqual(0);
            expect(pose[key]).toBeLessThanOrEqual(1);
            if (i > 0) expect(pose[key]).toBeGreaterThanOrEqual(expected[i - 1][key]);
          }
          expect(pose.entities.map((entity) => entity.id)).toEqual(
            scene.entities.map((entity) => entity.id),
          );
          expect(pose.records.map((record) => record.id)).toEqual(
            scene.storyId === '06' ? scene.records.map((record) => record.id) : [],
          );
          if (scene.storyId === '06') {
            expect(pose.detailIndex).toBeGreaterThanOrEqual(0);
            expect(pose.detailIndex).toBeLessThan(scene.records.length);
            if (frames[i] >= scene.resolveAt)
              expect(scene.records[pose.detailIndex].id).toBe(scene.focusRecordId);
          }
        }
        expect(informationPose(scene, scene.resolveAt + 0.2)).toEqual(
          informationPose(scene, scene.resolveAt + 1),
        );
        for (const invalid of [NaN, Infinity, -Infinity])
          expect(informationPose(scene, invalid)).toEqual(informationPose(scene, 0));
      }
  });
  it('accepts actual maximum raw records, entities and unbroken labels without truncation', () => {
    for (const mode of ['diagram', 'hybrid'] as const) {
      const [confounder, missing] = informationSourceScenes(mode).slice(-2);
      expect(confounder.entities.map((entry) => entry.label.length)).toEqual([28, 28, 28]);
      expect(confounder.label).toHaveLength(48);
      expect(confounder.scope).toHaveLength(40);
      expect(confounder.condition).toHaveLength(96);
      expect(missing.entities).toHaveLength(8);
      if (missing.storyId !== '06') throw new Error('Wrong maximum fixture');
      expect(missing.records).toHaveLength(12);
      expect(missing.records.filter((entry) => entry.topic.length === 96)).toHaveLength(10);
      expect(
        missing.records.filter((entry) => entry.state === 'known' && entry.content.length === 96),
      ).toHaveLength(8);
      expect(
        missing.records.filter((entry) => entry.state === 'known').map((entry) => entry.content),
      ).toContain('false');
      expect(
        missing.records.filter((entry) => entry.state === 'known').map((entry) => entry.content),
      ).toContain('zero');
    }
  });
  it('does not fabricate numeric effects or missing values', () => {
    for (const mode of ['diagram', 'hybrid'] as const)
      for (const scene of informationSourceScenes(mode)) {
        if (scene.storyId === '05') expect(scene.causalStatus.status).toBe('unestablished');
        else {
          expect(scene.resolution.status).toBe('unresolved');
          for (const record of scene.records.filter((entry) => entry.state !== 'known'))
            expect(record).not.toHaveProperty('content');
        }
      }
  });
});
