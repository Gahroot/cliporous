import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_PHASES,
  type AdaptiveFixture,
  type AdaptivePhase,
  adaptiveFixture,
  adaptiveFixtureContext,
  adaptiveFixtures,
  rewriteAdaptive,
} from '../../remotion/compositions/explainer/concepts/adaptive/test-fixtures';
import {
  ADAPTIVE_LAYOUTS,
  ADAPTIVE_PRESETS,
  type AdaptiveScene,
} from '../../remotion/compositions/explainer/concepts/adaptive/types';
import { conceptFixtureWords } from '../../remotion/compositions/explainer/concepts/fixture-words';
import { parsePlanWithDiagnostics } from '../explainer-scenes';
import { isRec, type Rec } from './kind-spec';
import { CONCEPT_ADAPTIVE_SPECS } from './kinds-concept-adaptive';
import { buildShortlist, SHORTLIST_LIMITS } from './shortlist';

function parse(fixture: AdaptiveFixture) {
  const spec = CONCEPT_ADAPTIVE_SPECS.find((entry) => entry.kind === fixture.plannerInput.kind);
  if (!spec) throw new Error('Missing owned spec');
  const ctx = adaptiveFixtureContext(fixture);
  return { scene: spec.parse(fixture.plannerInput, ctx), ctx };
}
function record(value: unknown): Rec {
  if (!isRec(value)) throw new Error('Expected test record');
  return value;
}
function edges(raw: Rec): Rec[] {
  if (!Array.isArray(raw.relationships)) throw new Error('Expected relationship array');
  return raw.relationships.map(record);
}
function expectRejected(fixture: AdaptiveFixture) {
  const result = parse(fixture);
  expect(result.scene).toBeNull();
  expect(result.ctx.issues.length).toBeGreaterThan(0);
}

describe('Pack F actual source parser and fixture parity', () => {
  it('covers exactly three kinds/seven presets with supported longform over', () => {
    expect(adaptiveFixtures).toHaveLength(7);
    expect(new Set(adaptiveFixtures.map((fx) => `${fx.scene.kind}/${fx.scene.preset}`))).toEqual(
      new Set(
        Object.entries(ADAPTIVE_PRESETS).flatMap(([kind, presets]) =>
          presets.map((preset) => `${kind}/${preset}`),
        ),
      ),
    );
    expect(ADAPTIVE_LAYOUTS).toEqual(['stack', 'stack-flipped', 'takeover', 'over']);
    expect(CONCEPT_ADAPTIVE_SPECS).toHaveLength(3);
  });
  it.each(adaptiveFixtures)('$name exactly matches the real indexed parser', (fixture) => {
    const { scene, ctx } = parse(fixture);
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual(fixture.scene);
    expect(fixture.plannerInput.startWord).toBe(0);
    expect(fixture.plannerInput.endWord).toBe(fixture.sourceText.split(/\s+/).length - 1);
    expect(fixture.plannerInput.layout).toBe('stack');
    expect(fixture.samples).toHaveLength(5);
    expect(new Set(fixture.samples.map((sample) => sample.frame)).size).toBe(5);
    expect(fixture.storyboard.map((beat) => beat.beat)).toEqual(ADAPTIVE_PHASES);
    for (const [index, phase] of ADAPTIVE_PHASES.entries()) {
      const word = fixture.plannerInput[`${phase}Word`];
      expect(fixture.storyboard[index].word).toBe(word);
      expect(fixture.storyboard[index].at).toBe(fixture.scene[`${phase}At`]);
      expect(fixture.storyboard[index].description.length).toBeGreaterThan(15);
      expect(fixture.samples[index].frame / 30).toBeGreaterThan(fixture.scene[`${phase}At`]);
      expect(fixture.samples[index].frame).toBeLessThan(fixture.durationSec * 30);
    }
    expect(fixture.durationSec - fixture.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(fixture.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layout: 'over', aspect: '16:9' }),
        expect.objectContaining({ layout: 'takeover', aspect: '16:9' }),
      ]),
    );
    expect(
      fixture.cases.some(
        (entry) => entry.palette?.text !== undefined && entry.palette.text !== fixture.palette.text,
      ),
    ).toBe(true);
    const spec = CONCEPT_ADAPTIVE_SPECS.find((entry) => entry.kind === fixture.scene.kind);
    expect(spec?.layouts).toContain('over');
  });

  for (const fixture of adaptiveFixtures) {
    it.each(
      ADAPTIVE_LAYOUTS,
    )(`${fixture.scene.preset} preserves exact full-plan parity in %s`, (layout) => {
      const words = conceptFixtureWords(fixture.sourceText, fixture.durationSec);
      const result = parsePlanWithDiagnostics(
        { scenes: [{ ...fixture.plannerInput, layout }] },
        words,
        { minStart: 0, maxEnd: 60 },
      );
      expect(result.rejected).toEqual([]);
      expect(result.omitted).toEqual([]);
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].scene).toEqual(fixture.scene);
      expect(result.accepted[0].startTime).toBe(0);
      expect(result.accepted[0].endTime).toBeCloseTo(fixture.durationSec, 8);
    });
  }
  it.each(
    adaptiveFixtures,
  )('$name is shortlisted from its actual source with unchanged menu caps', (fixture) => {
    const shortlist = buildShortlist(conceptFixtureWords(fixture.sourceText, fixture.durationSec));
    expect(shortlist.kinds.map((spec) => spec.kind)).toContain(fixture.scene.kind);
    expect(shortlist.scores[fixture.scene.kind]).toBeGreaterThan(0);
    expect(shortlist.kinds.length).toBeLessThanOrEqual(16);
    expect(shortlist.heroProps.length).toBeLessThanOrEqual(10);
    expect(SHORTLIST_LIMITS.maxKinds).toBe(16);
    expect(SHORTLIST_LIMITS.maxProps).toBe(10);
  });

  const malformed: [string, (raw: Rec) => void][] = [
    [
      'unknown preset',
      (raw) => {
        raw.preset = 'guaranteed-success';
      },
    ],
    [
      'missing setup',
      (raw) => {
        delete raw.setupWord;
      },
    ],
    [
      'fractional beat',
      (raw) => {
        raw.actionWord = 1.5;
      },
    ],
    [
      'nonfinite beat',
      (raw) => {
        raw.responseWord = Number.NaN;
      },
    ],
    [
      'out of window beat',
      (raw) => {
        raw.checkWord = 10000;
      },
    ],
    [
      'reversed beat',
      (raw) => {
        raw.checkWord = raw.actionWord;
      },
    ],
    [
      'collapsed beats',
      (raw) => {
        raw.resolveWord = raw.checkWord;
      },
    ],
    [
      'invented label',
      (raw) => {
        raw.label = 'Invented guaranteed success';
      },
    ],
    [
      'oversize label',
      (raw) => {
        raw.label = 'x'.repeat(33);
      },
    ],
    [
      'invented outcome',
      (raw) => {
        raw.outcome = 'Accuracy rises to 99 percent';
      },
    ],
    [
      'invented condition',
      (raw) => {
        raw.condition = 'If everyone succeeds';
      },
    ],
  ];
  for (const fixture of adaptiveFixtures) {
    it.each(malformed)(`${fixture.scene.preset} rejects %s`, (_name, mutate) => {
      const changed = structuredClone(fixture);
      mutate(changed.plannerInput);
      expectRejected(changed);
    });
    it(`${fixture.scene.preset} rejects invalid durations and source timestamps`, () => {
      const ctx = adaptiveFixtureContext(fixture);
      const spec = CONCEPT_ADAPTIVE_SPECS.find((entry) => entry.kind === fixture.scene.kind);
      for (const durationSec of [4.9, 12.1, Number.POSITIVE_INFINITY]) {
        expect(
          spec?.parse(fixture.plannerInput, { ...ctx, win: { ...ctx.win, endTime: durationSec } }),
        ).toBeNull();
      }
      ctx.words[Number(fixture.plannerInput.actionWord)].start = Number.NaN;
      expect(spec?.parse(fixture.plannerInput, ctx)).toBeNull();
    });
  }

  const adversarial: [AdaptiveScene['preset'], AdaptivePhase, string][] = [
    ['network-clusters', 'setup', 'Local team mentions people Ada, Ben, Cora and Dax.'],
    ['network-clusters', 'action', 'Ada mentions Ben.'],
    ['network-clusters', 'action', 'Ada never connects with Ben.'],
    ['network-clusters', 'action', 'Ada may connect with Ben.'],
    ['network-clusters', 'action', 'Cora connects with Ben.'],
    ['network-clusters', 'action', 'Ada connects with Ben but the link fails.'],
    ['network-clusters', 'resolve', 'Local team doubles its network size.'],
    ['adoption-wave', 'action', 'Ada adopts from Ben.'],
    ['adoption-wave', 'action', 'Ben hopes to adopt from Ada.'],
    ['adoption-wave', 'response', 'Cora adopts from Ada.'],
    ['adoption-wave', 'response', 'Cora does not adopt from Ben.'],
    ['coordinated-swarm', 'setup', 'Robot fleet includes people Scout, Porter and Rover.'],
    ['coordinated-swarm', 'action', 'Porter plans to follow Scout.'],
    ['coordinated-swarm', 'response', 'Rover mentions Porter.'],
    ['coordinated-swarm', 'response', 'Porter follows Rover.'],
    ['recognized-target', 'setup', 'Scout is a person.'],
    ['recognized-target', 'action', 'Scout mentions parcel and cone inside safety line.'],
    ['recognized-target', 'response', 'Scout cannot distinguish parcel from cone.'],
    ['recognized-target', 'response', 'Scout recognizes cone inside safety line.'],
    ['recognized-target', 'response', 'Scout might recognize parcel inside safety line.'],
    ['recognized-target', 'check', 'Scout moves toward cone.'],
    ['recognized-target', 'resolve', 'Scout crosses safety line.'],
    ['uncertain-target', 'response', 'Scout recognizes parcel inside safety line.'],
    ['uncertain-target', 'response', 'Scout cannot distinguish cone from cylinder.'],
    ['uncertain-target', 'check', 'Scout moves toward parcel.'],
    ['uncertain-target', 'resolve', 'Scout completes action.'],
    ['reconfigure', 'setup', 'Press is a machine near roller.'],
    ['reconfigure', 'action', 'Press mentions roller and drill for drilling.'],
    ['reconfigure', 'response', 'Drill does not fit Press.'],
    ['reconfigure', 'response', 'Drill might fit Press.'],
    ['reconfigure', 'check', 'Press uses roller for drilling.'],
    ['reconfigure', 'check', 'Press never uses drill for drilling.'],
    ['incompatible-module', 'response', 'Gripper fits Press.'],
    ['incompatible-module', 'response', 'Roller does not fit Press.'],
    ['incompatible-module', 'check', 'Press uses gripper for flattening.'],
    ['incompatible-module', 'resolve', 'Gripper becomes compatible.'],
  ];
  it.each(adversarial)('%s rejects unsupported %s: %s', (preset, phase, source) => {
    expectRejected(rewriteAdaptive(adaptiveFixture(preset), { [phase]: source }));
  });

  it.each([
    'recognized-target',
    'uncertain-target',
    'reconfigure',
    'incompatible-module',
  ] as const)('%s rejects cherry-picked, swapped and oversized evidence', (preset) => {
    const fixture = adaptiveFixture(preset);
    const field = fixture.scene.kind === 'robot-perception' ? 'recognition' : 'compatibility';
    for (const span of [
      { fromWord: -1, toWord: 5 },
      { fromWord: 0.5, toWord: 5 },
      { fromWord: 0, toWord: 100 },
      { fromWord: Number.NaN, toWord: 3 },
    ]) {
      const changed = structuredClone(fixture);
      changed.plannerInput[field] = span;
      expectRejected(changed);
    }
    const chopped = structuredClone(fixture);
    record(chopped.plannerInput[field]).fromWord =
      Number(record(chopped.plannerInput[field]).fromWord) + 1;
    expectRejected(chopped);
    const unrelated = structuredClone(fixture);
    unrelated.plannerInput[field] = {
      fromWord: 0,
      toWord: Number(unrelated.plannerInput.actionWord) - 1,
    };
    expectRejected(unrelated);
  });

  it('retains a complete source condition and rejects omission or shortening', () => {
    const fixture = rewriteAdaptive(adaptiveFixture('recognized-target'), {
      response: 'If visibility is clear, Scout recognizes parcel inside safety line.',
    });
    fixture.plannerInput.condition = 'If visibility is clear';
    const accepted = parse(fixture);
    expect(accepted.ctx.issues).toEqual([]);
    expect(accepted.scene?.condition).toBe('If visibility is clear');
    delete fixture.plannerInput.condition;
    expectRejected(fixture);
    fixture.plannerInput.condition = 'If visibility';
    expectRejected(fixture);
  });

  it('rejects unbounded/duplicate participants, cycles, unknown endpoints and invented links', () => {
    const mutations: ((raw: Rec) => void)[] = [
      (raw) => {
        raw.actors = Array.from({ length: 7 }, () => ({ label: 'Ada' }));
      },
      (raw) => {
        raw.actors = [{ label: 'Ada' }, { label: 'Ada' }, { label: 'Cora' }];
      },
      (raw) => {
        edges(raw)[0].fromActor = 99;
      },
      (raw) => {
        edges(raw)[0].toActor = 0;
      },
      (raw) => {
        edges(raw)[0].toActor = 0.5;
      },
      (raw) => {
        edges(raw)[1].word = edges(raw)[0].word;
      },
      (raw) => {
        raw.relationships = [edges(raw)[0]];
      },
      (raw) => {
        raw.relationships = Array(6).fill(edges(raw)[0]);
      },
      (raw) => {
        edges(raw)[1].toActor = 0;
      },
      (raw) => {
        edges(raw)[1].fromActor = 2;
      },
    ];
    for (const mutate of mutations) {
      const fixture = adaptiveFixture('adoption-wave');
      mutate(fixture.plannerInput);
      expectRejected(fixture);
    }
  });

  it('rejects shapes or jobs not grounded in the named source actor', () => {
    const robot = adaptiveFixture('recognized-target');
    record(robot.plannerInput.target).form = 'cone';
    expectRejected(robot);
    const machine = adaptiveFixture('reconfigure');
    record(machine.plannerInput.candidate).role = 'gripper';
    expectRejected(machine);
    machine.plannerInput.candidate = { label: 'drill', role: 'drill' };
    machine.plannerInput.jobLabel = 'welding';
    expectRejected(machine);
  });
});
