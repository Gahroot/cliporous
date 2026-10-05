import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseArgumentMapReasonsObjections,
  parseConditionalComparisonAssumptionToggle,
} from '../../../../../ai/explainer/expansion-reasoning-argument-contract';
import {
  type TemporalFixtureSeed,
  temporalSourceFixtures,
} from '../../../../../ai/explainer/expansion-temporal-fixtures';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { argumentPose } from './argument-poses';
import type { ExpansionReasoningArgumentScene } from './argument-types';

const packet = JSON.parse(
  readFileSync(
    'scripts/explainer-stills/fixtures/expansion/reasoning/argument.source.json',
    'utf8',
  ),
) as { stories: TemporalFixtureSeed[] };
export const argumentScenes: ExpansionReasoningArgumentScene[] = temporalSourceFixtures(
  packet.stories,
).map((fixture) => {
  const ctx = makeParseContext(fixture.words, fixture.window);
  const scene =
    fixture.id === '03'
      ? parseArgumentMapReasonsObjections(fixture.proposal, ctx)
      : parseConditionalComparisonAssumptionToggle(fixture.proposal, ctx);
  if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
  return scene;
});

// Reachable maxima, not global array caps: five clauses admit four nodes,
// three tree edges and eight used entities; comparison admits two effects and
// five used entities (comparing actor plus two distinct effect owners).
const label = (prefix: string): string => prefix.padEnd(28, 'x');
const claim = (prefix: string): string => prefix.padEnd(96, 'x');
export const argumentCondition = claim('If permits remain delayed under ');
const actors = ['Ada', 'Bea', 'Cia', 'Dee'].map(label);
const names = ['Pilot', 'Retention', 'Cost', 'Review'].map(label);
const statements = [
  'we should not certify ',
  'monthly churn may decline ',
  'long term cost is unknown ',
  'the outcome is not proven ',
].map(claim);
const roles = ['claim', 'premise', 'objection', 'premise'];
const states = ['qualified', 'negated', 'unknown'];
const qualifiers = ['may', 'does not', 'unknown'];
const verbs = ['may support', 'does not rebut', 'has unknown support for'];
const mapSpeech = expansionFixtureSpeech([
  `${actors[0]}'s claim ${names[0]} says "${statements[0]}".`,
  ...[1, 2, 3].map(
    (i) =>
      `${i === 1 ? `${argumentCondition}, ` : ''}${actors[i]}'s ${roles[i]} ${names[i]} says "${statements[i]}" and ${verbs[i - 1]} claim ${names[0]}.`,
  ),
  `${actors[0]}'s claim ${names[0]} remains disputed.`,
]);
const alternatives = ['Plan A', 'Plan B'].map(label);
const effects = ['opening may not proceed ', 'long term cost is unknown '].map(claim);
const comparisonSpeech = expansionFixtureSpeech([
  `${actors[0]}'s comparison compares ${alternatives[0]} and ${alternatives[1]}.`,
  `${argumentCondition}, ${actors[1]}'s alternative ${alternatives[0]} has effect "${effects[0]}" and ${actors[2]}'s alternative ${alternatives[1]} has effect "${effects[1]}".`,
  `${actors[0]} keeps the stated condition for ${actors[0]}'s comparison.`,
  `${actors[0]} assigns no scores or winner to ${actors[0]}'s comparison.`,
  `${actors[0]}'s comparison remains unresolved.`,
]);

export function argumentStressScenes(
  mode: 'diagram' | 'hybrid',
  mapResolution: 'disputed' | 'unknown' = 'disputed',
): ExpansionReasoningArgumentScene[] {
  const sourceMap =
    mapResolution === 'disputed'
      ? mapSpeech
      : expansionFixtureSpeech(
          mapSpeech.spans.map((span, i) => {
            const clause = mapSpeech.words
              .slice(span.fromWord, span.toWord + 1)
              .map((word) => word.text)
              .join(' ');
            return i === 4 ? clause.replace('remains disputed', 'remains unknown') : clause;
          }),
        );
  return [sourceMap, comparisonSpeech].map((speech, index) => {
    const raw: Rec = {
      kind: index === 0 ? 'argument-map' : 'conditional-comparison',
      preset: index === 0 ? 'reasons-objections' : 'assumption-toggle',
      visualMode: mode,
      label: index === 0 ? names[0] : 'comparison',
      subject: actors[0],
      outcome: index === 0 ? mapResolution : 'unresolved',
      evidence: 'source-stated',
      condition: argumentCondition,
      layout: 'stack',
      startWord: 0,
      endWord: speech.window.endWord,
      ...Object.fromEntries(
        ['setup', 'action', 'response', 'check', 'resolve'].map((phase, i) => [
          `${phase}Word`,
          speech.spans[i].fromWord,
        ]),
      ),
      ...(index === 0
        ? {
            claim: names[0],
            resolution: mapResolution,
            entities: names.flatMap((name, i) => [
              { label: name, evidence: speech.spans[i] },
              { label: actors[i], evidence: speech.spans[i] },
            ]),
            nodes: names.map((name, i) => ({
              entity: name,
              actor: actors[i],
              role: roles[i],
              statement: statements[i],
              evidence: speech.spans[i],
              ...(i === 1 ? { condition: argumentCondition } : {}),
            })),
            edges: [1, 2, 3].map((i) => ({
              from: names[i],
              to: names[0],
              role: i === 2 ? 'rebuttal' : 'support',
              state: states[i - 1],
              qualifier: qualifiers[i - 1],
              ...(i === 1 ? { condition: argumentCondition } : {}),
              evidence: speech.spans[i],
            })),
          }
        : {
            actor: actors[0],
            alternatives,
            resolution: 'unresolved',
            entities: [
              ...actors
                .slice(0, 3)
                .map((actor, i) => ({ label: actor, evidence: speech.spans[i === 0 ? 0 : 1] })),
              ...alternatives.map((name) => ({ label: name, evidence: speech.spans[0] })),
            ],
            effects: alternatives.map((alternative, i) => ({
              alternative,
              actor: actors[i + 1],
              text: effects[i],
              condition: argumentCondition,
              evidence: speech.spans[1],
            })),
          }),
    };
    const ctx = makeParseContext(speech.words, speech.window);
    const scene =
      index === 0
        ? parseArgumentMapReasonsObjections(raw, ctx)
        : parseConditionalComparisonAssumptionToggle(raw, ctx);
    if (!scene || ctx.issues.length) throw new Error(JSON.stringify(ctx.issues));
    return scene;
  });
}

// Probe the advertised array caps using complete, genuinely actor-owned source clauses.
// One reused actor keeps even seven propositions within the eight-entity cap.
function oversizedArgument(count: number) {
  const nodeNames = Array.from({ length: count }, (_, i) => `Point ${i}`);
  const nodeRoles = nodeNames.map((_, i) =>
    i === 0 ? 'claim' : i === 2 ? 'objection' : 'premise',
  );
  const speech = expansionFixtureSpeech([
    ...nodeNames.map(
      (name, i) =>
        `Ada's ${nodeRoles[i]} ${name} says "statement ${i}"${i ? ` and ${i === 2 ? 'rebuts' : 'supports'} claim Point 0` : ''}.`,
    ),
    "Ada's claim Point 0 remains disputed.",
  ]);
  const raw: Rec = {
    kind: 'argument-map',
    preset: 'reasons-objections',
    visualMode: 'diagram',
    label: nodeNames[0],
    subject: 'Ada',
    outcome: 'disputed',
    evidence: 'source-stated',
    layout: 'stack',
    startWord: 0,
    endWord: speech.window.endWord,
    // Keep all extra propositions inside check, rather than truncating the source window.
    ...Object.fromEntries(
      ['setup', 'action', 'response', 'check', 'resolve'].map((phase, i) => [
        `${phase}Word`,
        speech.spans[i === 4 ? count : i].fromWord,
      ]),
    ),
    claim: nodeNames[0],
    resolution: 'disputed',
    entities: [
      { label: 'Ada', evidence: speech.spans[0] },
      ...nodeNames.map((name, i) => ({ label: name, evidence: speech.spans[i] })),
    ],
    nodes: nodeNames.map((name, i) => ({
      entity: name,
      actor: 'Ada',
      role: nodeRoles[i],
      statement: `statement ${i}`,
      evidence: speech.spans[i],
    })),
    edges: nodeNames.slice(1).map((name, i) => ({
      from: name,
      to: nodeNames[0],
      role: i === 1 ? 'rebuttal' : 'support',
      state: 'stated',
      evidence: speech.spans[i + 1],
    })),
  };
  return { speech, raw };
}

function oversizedComparison(count: number) {
  const condition = 'If permits remain delayed';
  const speech = expansionFixtureSpeech([
    "Ada's comparison compares Plan A and Plan B.",
    `${condition}, Ada's alternative Plan A has effect "opening may not proceed" and Ada's alternative Plan B has effect "cost is unknown".`,
    "Ada keeps the stated condition for Ada's comparison.",
    "Ada assigns no scores or winner to Ada's comparison.",
    "Ada's comparison remains unresolved.",
  ]);
  const raw: Rec = {
    kind: 'conditional-comparison',
    preset: 'assumption-toggle',
    visualMode: 'diagram',
    label: 'comparison',
    subject: 'Ada',
    outcome: 'unresolved',
    evidence: 'source-stated',
    condition,
    layout: 'stack',
    startWord: 0,
    endWord: speech.window.endWord,
    ...Object.fromEntries(
      ['setup', 'action', 'response', 'check', 'resolve'].map((phase, i) => [
        `${phase}Word`,
        speech.spans[i].fromWord,
      ]),
    ),
    actor: 'Ada',
    alternatives: ['Plan A', 'Plan B'],
    resolution: 'unresolved',
    entities: ['Ada', 'Plan A', 'Plan B'].map((name) => ({
      label: name,
      evidence: speech.spans[0],
    })),
    effects: Array.from({ length: count }, (_, i) => ({
      alternative: i % 2 ? 'Plan B' : 'Plan A',
      actor: 'Ada',
      text: i % 2 ? 'cost is unknown' : 'opening may not proceed',
      condition,
      evidence: speech.spans[1],
    })),
  };
  return { speech, raw };
}

describe('real parser reachable caps, not nominal array limits', () => {
  it('accepts four propositions with one reused actor and no issues', () => {
    const { speech, raw } = oversizedArgument(4);
    const ctx = makeParseContext(speech.words, speech.window);
    const scene = parseArgumentMapReasonsObjections(raw, ctx);
    expect(ctx.issues).toEqual([]);
    expect(scene?.nodes).toHaveLength(4);
    expect(scene?.entities).toHaveLength(5);
    expect(scene?.edges).toHaveLength(3);
  });

  for (const count of [5, 7, 8]) {
    it(`rejects ${count} complete propositions: check cannot contain multiple clauses`, () => {
      const { speech, raw } = oversizedArgument(count);
      const ctx = makeParseContext(speech.words, speech.window);
      expect(parseArgumentMapReasonsObjections(raw, ctx)).toBeNull();
      expect(JSON.stringify(ctx.issues)).toContain(
        'evidence must retain the complete local clause',
      );
      expect(JSON.stringify(ctx.issues)).toContain(
        'each of the five beats must begin a separate complete local clause',
      );
    });
  }

  it('cannot cram two declarations into one source clause to evade the five-beat rule', () => {
    const { speech: original, raw } = oversizedArgument(5);
    const clauses = original.spans.map((span) =>
      original.words
        .slice(span.fromWord, span.toWord + 1)
        .map((word) => word.text)
        .join(' '),
    );
    const speech = expansionFixtureSpeech([
      ...clauses.slice(0, 3),
      `${clauses[3].slice(0, -1)} and ${clauses[4]}`,
      clauses[5],
    ]);
    raw.endWord = speech.window.endWord;
    for (const [i, phase] of ['setup', 'action', 'response', 'check', 'resolve'].entries())
      raw[`${phase}Word`] = speech.spans[i].fromWord;
    (raw.nodes as Rec[]).forEach((node, i) => {
      node.evidence = speech.spans[Math.min(i, 3)];
    });
    (raw.edges as Rec[]).forEach((edge, i) => {
      edge.evidence = speech.spans[Math.min(i + 1, 3)];
    });
    (raw.entities as Rec[]).forEach((entry, i) => {
      entry.evidence = speech.spans[Math.max(0, Math.min(i - 1, 3))];
    });
    const ctx = makeParseContext(speech.words, speech.window);
    expect(parseArgumentMapReasonsObjections(raw, ctx)).toBeNull();
    expect(JSON.stringify(ctx.issues)).toContain(
      'each complete proposition must be attributed to its exact actor',
    );
  });

  it('accepts two actor-reused effects, including modal/unknown text, without issues', () => {
    const { speech, raw } = oversizedComparison(2);
    const ctx = makeParseContext(speech.words, speech.window);
    const scene = parseConditionalComparisonAssumptionToggle(raw, ctx);
    expect(ctx.issues).toEqual([]);
    expect(scene?.effects).toHaveLength(2);
    expect(scene?.entities).toHaveLength(3);
    expect(scene?.effects.map((effect) => effect.text)).toEqual([
      'opening may not proceed',
      'cost is unknown',
    ]);
  });

  for (const count of [5, 12]) {
    it(`rejects ${count} effects even with reused actors and alternatives`, () => {
      const { speech, raw } = oversizedComparison(count);
      const ctx = makeParseContext(speech.words, speech.window);
      expect(parseConditionalComparisonAssumptionToggle(raw, ctx)).toBeNull();
      expect(JSON.stringify(ctx.issues)).toContain(
        'include one explicitly stated effect for each alternative',
      );
    });
  }
});

function finite(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
  } else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

describe('approved argument packets through the real parser and temporalSourceFixtures', () => {
  for (const scene of [
    ...argumentScenes,
    ...argumentStressScenes('diagram'),
    ...argumentStressScenes('hybrid'),
  ]) {
    it(`${scene.storyId}: full-frame, shuffled and repeated seekable finite poses`, () => {
      const poses = Array.from({ length: 301 }, (_, frame) => argumentPose(scene, frame / 30));
      poses.forEach((pose) => {
        finite(pose);
        for (const value of [
          pose.reveal,
          pose.action,
          pose.response,
          pose.check,
          pose.resolve,
          pose.conditionHighlight,
        ]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(pose.stations.map((station) => station.id)).toEqual(
          scene.kind === 'argument-map'
            ? scene.nodes.map((node) => node.entityId)
            : scene.effects.map((effect) => effect.alternativeId),
        );
      });
      for (let index = 0; index < 301; index++) {
        const frame = (index * 113) % 301;
        expect(argumentPose(scene, frame / 30)).toEqual(poses[frame]);
      }
      // The hold starts after the source resolve beat's authored 0.24s ramp,
      // not at a fixed frame that can still be inside the final source clause.
      const holdFrame = Math.ceil((scene.resolveAt + 0.24) * 30);
      expect(holdFrame).toBeLessThanOrEqual(300);
      expect(argumentPose(scene, scene.resolveAt).resolve).toBe(0);
      expect(poses[holdFrame].resolve).toBe(1);
      for (let frame = holdFrame; frame <= 300; frame++) expect(poses[frame]).toEqual(poses[300]);
      for (const t of [NaN, Infinity, -Infinity, -20, 100]) finite(argumentPose(scene, t));
      expect(argumentPose(scene, 0).stations.every((station) => station.reveal === 0)).toBe(true);
      expect(argumentPose(scene, 10).stations.every((station) => station.reveal === 1)).toBe(true);
    });
  }
});
