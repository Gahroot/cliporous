import { describe, expect, it } from 'vitest';
import { expansionFixtureSpeech } from '../../../../../ai/explainer/expansion-fixture-words';
import {
  parseArgumentMapReasonsObjections,
  parseConditionalComparisonAssumptionToggle,
} from '../../../../../ai/explainer/expansion-reasoning-argument-contract';
import { makeParseContext, type Rec } from '../../../../../ai/explainer/kind-spec';
import { argumentPose } from './argument-poses';
import {
  argumentScenes,
  argumentStressScenes,
  oversizedArgument,
  oversizedComparison,
} from './argument-poses.fixtures';

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
