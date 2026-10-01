import { describe, expect, it } from 'vitest';
import {
  fixtureContext,
  inferenceFixtures,
  parseFixture,
} from '../../remotion/compositions/explainer/concepts/inference/fixtures.test-data';
import {
  INFERENCE_LAYOUTS,
  INFERENCE_PRESETS,
} from '../../remotion/compositions/explainer/concepts/inference/types';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import { inferenceEvidence } from './concept-inference-contract';
import { isRec, type Rec } from './kind-spec';
import { getKindSpec } from './kinds';
import { CONCEPT_INFERENCE_SPECS } from './kinds-concept-inference';

function nested(raw: Rec, key: string): Rec {
  const value = raw[key];
  if (!isRec(value)) throw new Error(`expected ${key}`);
  return value;
}
function expert(raw: Rec, index: number): Rec {
  if (!Array.isArray(raw.experts) || !isRec(raw.experts[index])) throw new Error('expected expert');
  return raw.experts[index];
}
const byPreset = (preset: string) => {
  const fixture = inferenceFixtures.find((item) => item.plannerInput.preset === preset);
  if (!fixture) throw new Error(preset);
  return fixture;
};

describe('concept inference source-bound parsers', () => {
  for (const fixture of inferenceFixtures) {
    it(`${fixture.name}: real parser exactly matches direct-scene fixture`, () => {
      const { scene, ctx } = parseFixture(fixture);
      expect(scene, ctx.issues.join('; ')).toEqual(fixture.scene);
      expect(ctx.issues).toEqual([]);
      expect(
        getKindSpec(String(fixture.plannerInput.kind))?.parse(
          fixture.plannerInput,
          fixtureContext(fixture),
        ),
      ).toEqual(scene);
    });
    it(`${fixture.name}: padded speech preserves exact body/window parity through the production planner`, () => {
      const ctx = fixtureContext(fixture);
      expect(ctx.words[0].start).toBe(0.25);
      expect(ctx.words[ctx.words.length - 1].end).toBeCloseTo(fixture.durationSec - 0.35, 9);
      const result = parsePlanWithDiagnostics({ scenes: [fixture.plannerInput] }, ctx.words, {
        minStart: 0,
        maxEnd: 60,
      });
      expect(result.rejected).toEqual([]);
      expect(result.omitted).toEqual([]);
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].scene).toEqual(fixture.scene);
      expect(result.accepted[0].startTime).toBe(0);
      expect(result.accepted[0].endTime).toBeCloseTo(fixture.durationSec, 9);
    });
    it(`${fixture.name}: five source-word storyboards and semantic samples`, () => {
      const ctx = fixtureContext(fixture);
      expect(fixture.plannerInput.startWord).toBe(0);
      expect(fixture.plannerInput.endWord).toBe(ctx.words.length - 1);
      expect(fixture.plannerInput.layout).toBe('stack');
      expect(fixture.storyboard).toHaveLength(5);
      expect(fixture.samples).toHaveLength(5);
      for (const beat of fixture.storyboard) {
        expect(typeof beat.word).toBe('number');
        if (typeof beat.word !== 'number') throw new Error('word');
        expect(beat.at).toBe(ctx.at(beat.word));
        expect(fixture.scene[`${beat.beat}At`]).toBe(beat.at);
        expect(fixture.sourceText).toContain(beat.source);
      }
      for (const sample of fixture.samples) {
        expect(Number.isInteger(sample.frame)).toBe(true);
        expect(sample.frame).toBeLessThan(fixture.durationSec * 30);
      }
      expect(new Set(fixture.cases.map((entry) => entry.layout))).toEqual(
        new Set(INFERENCE_LAYOUTS),
      );
    });
    it(`${fixture.name}: preserves large absolute time offsets`, () => {
      const spec = CONCEPT_INFERENCE_SPECS.find(
        (entry) => entry.kind === fixture.plannerInput.kind,
      );
      const scene = spec?.parse(
        fixture.plannerInput,
        fixtureContext(fixture, fixture.sourceText, 2000),
      );
      expect(scene).not.toBeNull();
      for (const beat of ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'] as const) {
        expect(scene?.[beat]).toBeCloseTo(Number(fixture.scene[beat]) + 2000, 8);
      }
    });
    for (const [name, patch] of [
      ['unknown preset', { preset: 'invented' }],
      ['missing label', { label: null }],
      ['invented outcome', { outcome: 'guaranteed privacy' }],
      ['overlong label', { label: 'x'.repeat(33) }],
      ['NaN beat', { actionWord: Number.NaN }],
      ['infinite beat', { checkWord: Number.POSITIVE_INFINITY }],
      ['outside beat', { responseWord: 99999 }],
      ['reversed beats', { responseWord: 0 }],
      ['invented condition', { condition: 'if it works' }],
    ] satisfies [string, Rec][]) {
      it(`${fixture.name}: rejects ${name}`, () => {
        const result = parseFixture(fixture, { ...fixture.plannerInput, ...patch });
        expect(result.scene).toBeNull();
        expect(result.ctx.issues.length).toBeGreaterThan(0);
      });
    }
  }

  it('covers exactly three kinds and all six presets with restrained source-time cues', () => {
    expect(inferenceFixtures.map((item) => item.name).sort()).toEqual(
      Object.entries(INFERENCE_PRESETS)
        .flatMap(([kind, presets]) => presets.map((preset) => `${kind}-${preset}`))
        .sort(),
    );
    for (const fixture of inferenceFixtures) {
      const { scene } = parseFixture(fixture);
      if (!scene) throw new Error('fixture');
      const spec = CONCEPT_INFERENCE_SPECS.find((item) => item.kind === scene.kind);
      expect(spec?.layouts).toEqual(INFERENCE_LAYOUTS);
      expect(spec?.cues(scene).map((cue) => cue.at)).toEqual([
        scene.actionAt,
        scene.responseAt,
        scene.checkAt,
      ]);
    }
  });

  for (const [name, change] of [
    [
      'invented candidates',
      (raw: Rec) => {
        raw.candidates = ['truth', 'fiction'];
      },
    ],
    [
      'oversized candidates',
      (raw: Rec) => {
        raw.candidates = ['flies', 'falls', 'waits', 'sings'];
      },
    ],
    [
      'duplicate candidates',
      (raw: Rec) => {
        raw.candidates = ['flies', 'flies'];
      },
    ],
    [
      'malformed candidates',
      (raw: Rec) => {
        raw.candidates = [null, 'flies'];
      },
    ],
    [
      'unoffered selection',
      (raw: Rec) => {
        raw.selected = 'like';
      },
    ],
    [
      'borrowed next evidence',
      (raw: Rec) => {
        raw.nextEvidence = raw.candidateEvidence;
      },
    ],
    [
      'cropped evidence',
      (raw: Rec) => {
        nested(raw, 'selectionEvidence').fromWord =
          Number(nested(raw, 'selectionEvidence').fromWord) + 1;
      },
    ],
    [
      'nonfinite evidence',
      (raw: Rec) => {
        nested(raw, 'selectionEvidence').toWord = Number.POSITIVE_INFINITY;
      },
    ],
    [
      'noninteger evidence',
      (raw: Rec) => {
        nested(raw, 'selectionEvidence').fromWord = 1.5;
      },
    ],
  ] satisfies [string, (raw: Rec) => void][]) {
    it(`word selection rejects ${name}`, () => {
      const fixture = byPreset('next-token');
      const raw = structuredClone(fixture.plannerInput);
      change(raw);
      expect(parseFixture(fixture, raw).scene).toBeNull();
    });
  }
  for (const [from, to] of [
    [
      'writer selects flies after Time as a continuation.',
      'reader selects flies after Time as a continuation.',
    ],
    [
      'writer selects flies after Time as a continuation.',
      'writer never selects flies after Time as continuation.',
    ],
    [
      'writer selects flies after Time as a continuation.',
      'writer might select flies after Time as continuation.',
    ],
    [
      'writer selects flies after Time as a continuation.',
      'writer proposes selecting flies after Time as continuation.',
    ],
    [
      'writer considers like and above after flies.',
      'writer considers like and above after falls.',
    ],
  ]) {
    it(`rejects actor/negation/speculation mismatch: ${to}`, () => {
      const fixture = byPreset('next-token');
      expect(
        parseFixture(fixture, fixture.plannerInput, fixture.sourceText.replace(from, to)).scene,
      ).toBeNull();
    });
  }
  it('cannot erase uncertainty or select a confident preset for a tentative continuation', () => {
    const fixture = byPreset('uncertain-choice');
    for (const patch of [
      { uncertainty: undefined },
      { outcome: 'continuation' },
      { preset: 'next-token', uncertainty: undefined },
    ]) {
      expect(parseFixture(fixture, { ...fixture.plannerInput, ...patch }).scene).toBeNull();
    }
  });

  for (const [name, change] of [
    [
      'all experts activated',
      (raw: Rec) => {
        expert(raw, 1).selected = true;
      },
    ],
    [
      'inactive contribution',
      (raw: Rec) => {
        expert(raw, 1).contribution = 'sum';
      },
    ],
    [
      'borrowed assignment',
      (raw: Rec) => {
        expert(raw, 0).evidence = expert(raw, 1).evidence;
      },
    ],
    [
      'missing return',
      (raw: Rec) => {
        delete expert(raw, 0).returnEvidence;
      },
    ],
    [
      'invented contribution',
      (raw: Rec) => {
        expert(raw, 0).contribution = 'perfect answer';
      },
    ],
    [
      'false role',
      (raw: Rec) => {
        expert(raw, 0).role = 'code';
      },
    ],
    [
      'duplicate experts',
      (raw: Rec) => {
        raw.experts = [expert(raw, 0), expert(raw, 0)];
      },
    ],
    [
      'oversized experts',
      (raw: Rec) => {
        raw.experts = Array.from({ length: 4 }, () => expert(raw, 0));
      },
    ],
    [
      'string selection',
      (raw: Rec) => {
        expert(raw, 0).selected = 'true';
      },
    ],
  ] satisfies [string, (raw: Rec) => void][]) {
    it(`expert selection rejects ${name}`, () => {
      const fixture = byPreset('single-specialist');
      const raw = structuredClone(fixture.plannerInput);
      change(raw);
      expect(parseFixture(fixture, raw).scene).toBeNull();
    });
  }
  it('rejects a return to a different task and a selection verb assigned to someone else', () => {
    const fixture = byPreset('single-specialist');
    expect(
      parseFixture(
        fixture,
        fixture.plannerInput,
        fixture.sourceText.replace(
          'math expert returns sum to invoice task',
          'math expert returns sum to refund task',
        ),
      ).scene,
    ).toBeNull();
    expect(
      parseFixture(
        fixture,
        fixture.plannerInput,
        fixture.sourceText.replace(
          'invoice task selects math expert.',
          'refund task selects math expert.',
        ),
      ).scene,
    ).toBeNull();
  });

  for (const [name, change] of [
    [
      'invented device',
      (raw: Rec) => {
        raw.device = 'server';
      },
    ],
    [
      'swapped local evidence',
      (raw: Rec) => {
        raw.localEvidence = raw.localResultEvidence;
      },
    ],
    [
      'missing remote return',
      (raw: Rec) => {
        delete nested(raw, 'remote').returnEvidence;
      },
    ],
    [
      'outbound work substitution',
      (raw: Rec) => {
        nested(raw, 'remote').work = 'photo';
      },
    ],
    [
      'service impersonation',
      (raw: Rec) => {
        nested(raw, 'remote').service = 'phone';
      },
    ],
    [
      'local preset with transfer',
      (raw: Rec) => {
        raw.preset = 'local-processing';
      },
    ],
  ] satisfies [string, (raw: Rec) => void][]) {
    it(`edge/cloud rejects ${name}`, () => {
      const fixture = byPreset('split-processing');
      const raw = structuredClone(fixture.plannerInput);
      change(raw);
      expect(parseFixture(fixture, raw).scene).toBeNull();
    });
  }
  for (const [from, to] of [
    ['phone processes photo locally', 'cloud processes photo locally'],
    [
      'phone sends only search request to cloud service.',
      'phone sends only search request from cloud service.',
    ],
    ['cloud service returns matches to phone.', 'cloud service returns matches to camera.'],
    ['phone produces crop from photo locally', 'phone produces crop from photo remotely'],
  ]) {
    it(`edge/cloud rejects direction/actor mismatch: ${to}`, () => {
      const fixture = byPreset('split-processing');
      expect(
        parseFixture(fixture, fixture.plannerInput, fixture.sourceText.replace(from, to)).scene,
      ).toBeNull();
    });
  }
  it('full-clause evidence cannot crop a leading negation or combine two actors', () => {
    const fixture = byPreset('next-token');
    const ctx = fixtureContext(fixture);
    expect(
      inferenceEvidence(
        {
          fromWord: fixture.plannerInput.actionWord,
          toWord: Number(fixture.plannerInput.responseWord) + 4,
        },
        ctx,
      ),
    ).toBeNull();
    expect(inferenceEvidence({ fromWord: -1, toWord: 3 }, ctx)).toBeNull();
    expect(inferenceEvidence(null, ctx)).toBeNull();
  });
});
