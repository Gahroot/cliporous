import { describe, expect, it } from 'vitest';
import {
  DECISIONS_ACCEPTED_VARIANTS,
  DECISIONS_SOURCE_FIXTURES,
  decisionsSourceContext,
} from '../../remotion/compositions/explainer/business/decisions/fixtures';
import type { KindSpec } from './kind-spec';
import {
  MEASUREMENT_FRAME_SPEC,
  STAGED_DECISION_SPEC,
  UNCERTAINTY_ALBUM_SPEC,
} from './kinds-business-decisions';

const specs = [STAGED_DECISION_SPEC, MEASUREMENT_FRAME_SPEC, UNCERTAINTY_ALBUM_SPEC];
describe('decisions concrete specs', () => {
  it.each(
    DECISIONS_SOURCE_FIXTURES,
  )('$id is discoverable from its actual authored words', (fixture) => {
    const spec = specs.find((spec) => spec.kind === fixture.raw.kind);
    expect(spec).toBeDefined();
    expect(
      spec?.triggers.some((trigger) =>
        trigger.test(fixture.words.map((word) => word.text).join(' ')),
      ),
    ).toBe(true);
  });
  it.each([
    ...DECISIONS_SOURCE_FIXTURES,
    ...DECISIONS_ACCEPTED_VARIANTS,
  ])('$fixtureId parses through its concrete exported spec and supplies neutral seconds cues', (fixture) => {
    const ctx = decisionsSourceContext(fixture);
    if (fixture.raw.kind === 'staged-decision') {
      const scene = STAGED_DECISION_SPEC.parse(fixture.raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      if (!scene) throw Error('scene');
      expect(STAGED_DECISION_SPEC.cues(scene)).toEqual([
        { kind: 'tick', at: scene.setupAt, gain: 0.16 },
        { kind: 'flip', at: scene.actionAt, gain: 0.16 },
        { kind: 'tick', at: scene.responseAt, gain: 0.16 },
        { kind: 'flip', at: scene.checkAt, gain: 0.16 },
      ]);
    } else if (fixture.raw.kind === 'measurement-frame') {
      const scene = MEASUREMENT_FRAME_SPEC.parse(fixture.raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      if (!scene) throw Error('scene');
      expect(MEASUREMENT_FRAME_SPEC.cues(scene).map((cue) => cue.at)).toEqual([
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
      ]);
    } else {
      const scene = UNCERTAINTY_ALBUM_SPEC.parse(fixture.raw, ctx);
      expect(scene, ctx.issues.join('; ')).not.toBeNull();
      if (!scene) throw Error('scene');
      expect(UNCERTAINTY_ALBUM_SPEC.cues(scene).map((cue) => cue.at)).toEqual([
        scene.setupAt,
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
      ]);
    }
  });
  it('metadata matches current KindSpec fields without a cast or registration', () => {
    for (const spec of specs) {
      const metadata: Pick<
        KindSpec,
        | 'family'
        | 'layouts'
        | 'durationSec'
        | 'describe'
        | 'schema'
        | 'limits'
        | 'triggers'
        | 'avoid'
      > = spec;
      expect(metadata.durationSec).toEqual([5, 12]);
      expect(metadata.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'pip', 'over']);
      expect(metadata.limits).toContain('24px');
      expect(metadata.limits).toContain('>=1.5s');
      expect(metadata.limits).toContain('>=0.8s');
      expect(metadata.schema).toContain('"fromWord"');
      expect(metadata.schema).toContain('"modelSource"');
    }
  });
  it.each(
    DECISIONS_SOURCE_FIXTURES,
  )('$id schema embeds exactly its accepted raw example', (fixture) => {
    expect(specs.find((spec) => spec.kind === fixture.raw.kind)?.schema).toContain(
      JSON.stringify(fixture.raw),
    );
  });
  it.each([
    'The weather is nice today.',
    'We adopted a puppy from the shelter.',
    'Here is a family album with my grandmother.',
    'Make a decision about dinner tonight.',
  ])('avoids irrelevant trigger: %s', (text) => {
    expect(specs.some((spec) => spec.triggers.some((trigger) => trigger.test(text)))).toBe(false);
  });
  it('schemas explicitly distinguish modes and unresolved meanings', () => {
    expect(MEASUREMENT_FRAME_SPEC.schema).toContain('firms-functions-workers: diagram default');
    expect(MEASUREMENT_FRAME_SPEC.schema).toContain('No cross-frame summation');
    expect(STAGED_DECISION_SPEC.schema).toContain('never source-stated approval');
    expect(UNCERTAINTY_ALBUM_SPEC.limits).toContain('No invented numbers, winners, probabilities');
    expect(UNCERTAINTY_ALBUM_SPEC.schema).toContain('sum to one');
  });
});
