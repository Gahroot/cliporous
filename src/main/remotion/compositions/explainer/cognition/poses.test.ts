import { describe, expect, it } from 'vitest';
import { type CognitionPose, cognitionPose, revisedPlanPath } from './poses';
import { COGNITION_KINDS, COGNITION_PRESETS, type CognitionScene } from './types';

const story = {
  label: 'Source explanation',
  subject: 'The work',
  outcome: 'Source-stated outcome',
  setupAt: 0.5,
  actionAt: 1.5,
  responseAt: 3.5,
  checkAt: 5.5,
  resolveAt: 7.5,
};
const scenes: CognitionScene[] = [
  ...COGNITION_PRESETS['agent-team'].map((preset) => ({
    ...story,
    kind: 'agent-team' as const,
    preset,
    roles: ['Designer', 'Researcher', 'Builder'],
  })),
  ...COGNITION_PRESETS['agent-plan'].map((preset) => ({
    ...story,
    kind: 'agent-plan' as const,
    preset,
    obstacleLabel: 'New information',
    revisedLabel: 'Revised plan',
  })),
  ...COGNITION_PRESETS['agent-budget'].map((preset) => ({
    ...story,
    kind: 'agent-budget' as const,
    preset,
    resourceLabel: 'Allowance',
    actionLabel: 'Work',
  })),
  ...COGNITION_PRESETS['model-training'].map((preset) => ({
    ...story,
    kind: 'model-training' as const,
    preset,
    exampleLabel: 'Examples',
    inputLabel: 'Later input',
  })),
  ...COGNITION_PRESETS['model-evaluation'].map((preset) => ({
    ...story,
    kind: 'model-evaluation' as const,
    preset,
    approaches: ['Approach A', 'Approach B'],
    criteria: ['Speed', 'Detail'],
  })),
  ...COGNITION_PRESETS['evidence-conflict'].map((preset) => ({
    ...story,
    kind: 'evidence-conflict' as const,
    preset,
    sources: ['First source', 'Second source'],
    claims: ['Supported claim', 'Conflicting claim'],
  })),
];

function pose<K extends CognitionScene['kind']>(
  kind: K,
  preset: string,
  time: number,
): Extract<CognitionPose, { kind: K }> {
  const scene = scenes.find((candidate) => candidate.kind === kind && candidate.preset === preset);
  if (!scene) throw new Error(`Missing fixture ${kind}/${preset}`);
  const result = cognitionPose(scene, time);
  if (result.kind !== kind) throw new Error('Pose kind changed');
  return result as Extract<CognitionPose, { kind: K }>;
}
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

it('covers all six kinds and all twelve prescribed presets', () => {
  expect(scenes).toHaveLength(12);
  expect(new Set(scenes.map((scene) => scene.kind))).toEqual(new Set(COGNITION_KINDS));
  for (const kind of COGNITION_KINDS) {
    expect(scenes.filter((scene) => scene.kind === kind).map((scene) => scene.preset)).toEqual(
      COGNITION_PRESETS[kind],
    );
  }
});

describe.each(scenes.map((scene) => ({ name: `${scene.kind}/${scene.preset}`, scene })))('$name', ({
  scene,
}) => {
  it('is finite and bounded over the whole window and clamped outside it', () => {
    const times = [
      -Infinity,
      -100,
      ...Array.from({ length: 81 }, (_, i) => i / 8),
      1e6,
      Infinity,
      NaN,
    ];
    for (const time of times) {
      const result = cognitionPose(scene, time);
      expect(result.kind).toBe(scene.kind);
      expect(result.preset).toBe(scene.preset);
      for (const value of numbers(result)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThanOrEqual(3.2);
      }
    }
  });

  it('has an exact still setup before action and an exact final hold', () => {
    const setup = cognitionPose(scene, scene.setupAt);
    for (const t of [-100, 0, scene.actionAt]) expect(cognitionPose(scene, t)).toEqual(setup);
    const final = cognitionPose(scene, scene.resolveAt);
    for (const t of [scene.resolveAt + 1 / 30, scene.resolveAt + 0.8, scene.resolveAt + 5, 1e6]) {
      expect(cognitionPose(scene, t)).toEqual(final);
    }
    expect(final).not.toEqual(setup);
  });

  it('is deterministic under nonsequential seeks without mutating the story', () => {
    const input = structuredClone(scene);
    for (const value of Object.values(input)) if (Array.isArray(value)) Object.freeze(value);
    Object.freeze(input);
    const times = [0, 1.5, 2.4, 3.5, 4.7, 5.5, 6.2, 7.5, 100];
    const expected = times.map((time) => cognitionPose(input, time));
    for (const i of [8, 2, 6, 0, 4, 7, 1, 5, 3, 0, 7, 4]) {
      expect(cognitionPose(input, times[i])).toEqual(expected[i]);
    }
    expect(input).toEqual(scene);
  });

  it('uses beat-relative timing rather than hard-coded scene seconds', () => {
    const shifted = {
      ...scene,
      setupAt: scene.setupAt + 10,
      actionAt: scene.actionAt + 10,
      responseAt: scene.responseAt + 10,
      checkAt: scene.checkAt + 10,
      resolveAt: scene.resolveAt + 10,
    };
    for (const time of [0, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 9]) {
      const actual = cognitionPose(shifted, time + 10);
      const original = cognitionPose(scene, time);
      const actualNumbers = numbers(actual);
      expect(actualNumbers).toHaveLength(numbers(original).length);
      numbers(original).forEach((number, index) => {
        expect(actualNumbers[index]).toBeCloseTo(number, 12);
      });
    }
  });

  it('does not turn source conditions into a success signal', () => {
    const conditional = { ...scene, condition: 'Only if the source condition holds' };
    expect(cognitionPose(conditional, 8)).toEqual(cognitionPose(scene, 8));
    for (const key of ['success', 'passed', 'approved', 'score', 'winner', 'resolved']) {
      expect(cognitionPose(conditional, 8)).not.toHaveProperty(key);
    }
  });
});

describe.each(COGNITION_PRESETS['agent-team'])('team %s', (preset) => {
  it('fans out before work and rejoins only after work stops', () => {
    const dispatched = pose('agent-team', preset, 3.5);
    expect(dispatched.fan).toBe(1);
    expect(dispatched.work).toBe(0);
    expect(dispatched.join).toBe(0);
    expect(dispatched.toolAngle).toBe(0);
    dispatched.papers.forEach((paper, index) => {
      expect(paper.position).toEqual([
        dispatched.desks[index][0],
        -0.415,
        dispatched.desks[index][2] + 0.14,
      ]);
    });
    const working = pose('agent-team', preset, 4.5);
    expect(working.papers).toEqual(dispatched.papers);
    expect(working.toolAngle).toBeLessThan(0);
    expect(working.join).toBe(0);
    const worked = pose('agent-team', preset, 5.5);
    expect(worked.work).toBe(1);
    expect(worked.join).toBe(0);
    expect(worked.toolAngle).toBe(0);
    const joined = pose('agent-team', preset, 7.5);
    expect(joined.join).toBe(1);
    expect(joined.papers).toHaveLength(3);
    expect(new Set(joined.papers.map((paper) => paper.position[0])).size).toBe(3);
    expect(joined.papers.every((paper) => paper.position[2] === -1.25)).toBe(true);
  });
});

it('uses the source-backed two or three specialists, with a bounded number of desks', () => {
  const scene = scenes.find((scene) => scene.kind === 'agent-team');
  if (scene?.kind !== 'agent-team') throw new Error('Missing team');
  for (const count of [2, 3, 20]) {
    const result = cognitionPose(
      { ...scene, roles: Array.from({ length: count }, (_, i) => `Role ${i}`) },
      4.5,
    );
    if (result.kind !== 'agent-team') throw new Error('Wrong pose');
    expect(result.desks).toHaveLength(Math.min(3, count));
    expect(result.papers).toHaveLength(Math.min(3, count));
  }
});

describe.each(COGNITION_PRESETS['agent-plan'])('plan %s', (preset) => {
  it('stops at new information, revises while paused, then travels on the revised path', () => {
    const contact = pose('agent-plan', preset, 3.5);
    expect(contact.information).toBe(1);
    expect(contact.revision).toBe(0);
    expect(contact.travel).toBe(0);
    const revising = pose('agent-plan', preset, 4.5);
    expect(revising.adaptive).toEqual(contact.adaptive);
    expect(revising.revision).toBeGreaterThan(0);
    expect(revising.travel).toBe(0);
    const ready = pose('agent-plan', preset, 5.5);
    expect(ready.revision).toBe(1);
    expect(ready.adaptive).toEqual(revisedPlanPath(ready.adaptiveX)[0]);
    for (let frame = 0; frame <= 120; frame++) {
      const traveling = pose('agent-plan', preset, 5.5 + frame / 60);
      const [x, , z] = traveling.adaptive;
      // Includes the paper footprint, not just its center, in the obstacle exclusion zone.
      expect(Math.abs(x - traveling.adaptiveX) < 0.5 && Math.abs(z - 0.04) < 0.4).toBe(false);
    }
    const final = pose('agent-plan', preset, 7.5);
    expect(final.adaptive).toEqual(revisedPlanPath(final.adaptiveX).at(-1));
    if (preset === 'fixed-vs-adaptive') {
      expect(final.fixed).toEqual(contact.fixed);
      expect(final.fixed?.[2]).toBe(-0.62);
      expect(final.adaptive[2]).toBe(1.12);
    } else {
      expect(final.fixed).toBeNull();
    }
  });
});

describe.each(COGNITION_PRESETS['agent-budget'])('budget %s', (preset) => {
  it('continuously spends the allowance and stops work without replenishing it', () => {
    let previous = 1;
    for (let frame = 0; frame <= 120; frame++) {
      const result = pose('agent-budget', preset, 1.5 + frame / 30);
      expect(result.remaining + result.spent).toBeCloseTo(1, 14);
      expect(result.remaining).toBeLessThanOrEqual(previous);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.request).toBe(0);
      previous = result.remaining;
    }
    const partial = pose('agent-budget', preset, 2.2);
    expect(partial.spent).toBeGreaterThan(0);
    expect(partial.spent).toBeLessThan(1);
    const empty = pose('agent-budget', preset, 5.5);
    expect(empty.remaining).toBe(0);
    expect(empty.press).toBe(0);
    const final = pose('agent-budget', preset, 7.5);
    expect(final.spent).toBe(1);
    expect(final.remaining).toBe(0);
    expect(final.press).toBe(0);
    expect(final.workPaper).toEqual(empty.workPaper);
    expect(final.gate).toBe(1);
    expect(final.request).toBe(preset === 'request-more' ? 1 : 0);
    expect(final).not.toHaveProperty('granted');
  });
});

describe.each(COGNITION_PRESETS['model-training'])('training %s', (preset) => {
  it('changes only after examples arrive, then freezes the model for later use', () => {
    expect(pose('model-training', preset, 3).modelChange).toBe(0);
    const contact = pose('model-training', preset, 3.5);
    expect(contact.example.visible).toBe(false);
    expect(contact.modelChange).toBe(0);
    expect(contact.inference).toBe(0);
    const trained = pose('model-training', preset, 5.5);
    expect(trained.modelChange).toBe(1);
    expect(trained.trainingClosed).toBe(true);
    expect(trained.inference).toBe(0);
    expect(trained.input.position).toEqual(contact.input.position);
    for (let frame = 0; frame <= 60; frame++) {
      const using = pose('model-training', preset, 5.5 + frame / 30);
      expect(using.modelChange).toBe(trained.modelChange);
      expect(using.correctionChange).toBe(trained.correctionChange);
      expect(using.trainingClosed).toBe(true);
      expect(using.input.visible).not.toBe(using.output.visible);
    }
  });
});

it('waits for the corrective example before making the second training change', () => {
  const beforeCorrection = pose('model-training', 'examples-correction', 4.5);
  expect(beforeCorrection.modelChange).toBeCloseTo(0.45);
  expect(beforeCorrection.correctionChange).toBe(0);
  expect(beforeCorrection.correction.visible).toBe(true);
  const afterCorrection = pose('model-training', 'examples-correction', 5);
  expect(afterCorrection.correction.visible).toBe(false);
  expect(afterCorrection.modelChange).toBeGreaterThan(0.45);
  expect(afterCorrection.correctionChange).toBeGreaterThan(0);
  expect(afterCorrection.inference).toBe(0);
  const ordinary = pose('model-training', 'train-then-use', 5);
  expect(ordinary.correction.visible).toBe(false);
  expect(ordinary.correctionChange).toBe(0);
});

describe.each(COGNITION_PRESETS['model-evaluation'])('evaluation %s', (preset) => {
  it('gives both approaches the same test sequence, without scores or pass/fail', () => {
    expect(pose('model-evaluation', preset, 1.5).tests).toEqual([0, 0]);
    expect(pose('model-evaluation', preset, 3.5).tests).toEqual([1, 0]);
    expect(pose('model-evaluation', preset, 5.5).tests).toEqual([1, 1]);
    for (const time of [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]) {
      const result = pose('model-evaluation', preset, time);
      expect(result.benches).toHaveLength(2);
      const [left, right] = result.benches;
      expect(left.papers).toHaveLength(2);
      expect(right.papers).toHaveLength(2);
      left.papers.forEach((paper, index) => {
        expect(paper.position.slice(1)).toEqual(right.papers[index].position.slice(1));
        expect(paper.tilt).toBe(right.papers[index].tilt);
      });
      expect(result).not.toHaveProperty('score');
      expect(result).not.toHaveProperty('passed');
    }
    expect(pose('model-evaluation', preset, 5.5).separation).toBe(0);
    const final = pose('model-evaluation', preset, 7.5);
    expect(final.separation).toBe(preset === 'tradeoffs' ? 1 : 0);
    for (const bench of final.benches) {
      expect(bench.papers[0].position[0]).toBeLessThan(bench.papers[1].position[0]);
      expect(Math.abs(bench.papers[0].position[0] - bench.x)).toBeLessThan(0.5);
    }
  });
});

describe.each(COGNITION_PRESETS['evidence-conflict'])('conflict %s', (preset) => {
  it('keeps both sources physically distinct, including after human referral', () => {
    for (let frame = 0; frame <= 240; frame++) {
      const result = pose('evidence-conflict', preset, frame / 30);
      const [left, right] = result.papers;
      expect(result.papers).toHaveLength(2);
      expect(left.visible && right.visible).toBe(true);
      expect(right.position[0] - left.position[0]).toBeGreaterThanOrEqual(2.24);
      expect(result).not.toHaveProperty('resolved');
      expect(result).not.toHaveProperty('success');
    }
    expect(pose('evidence-conflict', preset, 3.5).divider).toBe(0);
    const ready = pose('evidence-conflict', preset, 5.5);
    expect(ready.divider).toBe(1);
    expect(ready.referral).toBe(0);
    const final = pose('evidence-conflict', preset, 7.5);
    expect(final.referral).toBe(preset === 'human-review' ? 1 : 0);
    expect(final.papers.map((paper) => paper.position[0])).toEqual(
      ready.papers.map((paper) => paper.position[0]),
    );
    expect(final.papers[0].position[2]).toBe(preset === 'human-review' ? -0.6 : 0.85);
  });
});
