import { describe, expect, it } from 'vitest';
import { deriveExplainerPalette } from '../../remotion/compositions/explainer/palette';
import {
  collectSceneTimes,
  KEYSTONE_WITHDRAW_SECONDS,
  mapSceneTimes,
} from '../../remotion/compositions/explainer/types';
import { buildGroupRenderPlan, groupPlannedScenes } from '../../render/explainer-scenes';
import {
  buildExplainerPrompt,
  buildReviewPrompt,
  parseExplainerPlan,
  parsePlanWithRejections,
  sceneCues,
  toSceneRelative,
} from '../explainer-scenes';
import type { PlannerWord, Rec } from './kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';

const FIXTURES = [
  {
    kind: 'keystone',
    text: 'Temporary supports hold blocks while we seat the wedges then the keystone locks the arch before we withdraw supports and it stands',
    labels: [{ field: 'label', text: 'Keystone locks the arch', max: 26 }],
    options: {},
    fields: ['supportsWord', 'blocksWord', 'lockWord', 'withdrawWord'],
    indexes: [0, 6, 12, 17],
    times: [10.05, 11.8, 13.6, 15.1],
    fixtureTimes: [0.3, 1.1, 2.75, 3.6],
    gaps: [0.4, 0.9, 0.45],
    finalHold: 0.95,
    cues: [
      { kind: 'slide', at: 11.8, gain: 0.3 },
      { kind: 'thump', at: 13.6, gain: 0.4 },
    ],
    timingNotes: [
      'Supports are visible first at supportsAt',
      'blocks seat after blocksAt',
      'the keystone contacts exactly lockAt',
      'support withdrawal starts at withdrawAt and lasts 0.45s',
    ],
  },
  {
    kind: 'switchyard',
    text: 'Tokens approach the junction then the switch seats toward Express not Review before we commit them and they arrive at Express safely',
    labels: [
      { field: 'label', text: 'Arrive at Express', max: 26 },
      { field: 'leftLabel', text: 'Express', max: 16 },
      { field: 'rightLabel', text: 'Review', max: 16 },
    ],
    options: { route: 'left' },
    fields: ['approachWord', 'seatWord', 'commitWord', 'arriveWord'],
    indexes: [0, 7, 14, 18],
    times: [10.05, 12.1, 14.2, 15.4],
    fixtureTimes: [0.3, 1.4, 2.1, 3.7],
    gaps: [0.55, 0.35, 1],
    finalHold: 0.6,
    cues: [
      { kind: 'tick', at: 12.1, gain: 0.35 },
      { kind: 'thump', at: 15.4, gain: 0.3 },
    ],
    timingNotes: [
      'Three fixed illustrative persistent tokens, not a claimed quantity',
      'approachAt starts approach',
      'during the last 0.3s before seatAt the tongue moves and contacts exactly seatAt',
      'movement beyond the junction starts at commitAt',
      'the first token finishes the route at arriveAt, highlighting the result',
    ],
  },
] as const;
type Fixture = (typeof FIXTURES)[number];
const BOUNDS = { minStart: 0, maxEnd: 60 };

function sourceWords(fixture: Fixture, start = 10): PlannerWord[] {
  return fixture.text.split(' ').map((text, i) => ({
    text,
    start: (start * 100 + i * 30) / 100,
    end: (start * 100 + i * 30 + 25) / 100,
  }));
}

function candidateFor(fixture: Fixture, offset = 0): Rec {
  return {
    kind: fixture.kind,
    startWord: offset,
    endWord: offset + fixture.text.split(' ').length - 1,
    ...Object.fromEntries(fixture.labels.map(({ field, text }) => [field, text])),
    ...fixture.options,
    ...Object.fromEntries(fixture.fields.map((field, i) => [field, fixture.indexes[i] + offset])),
  };
}

function relative(time: number, start: number): number {
  return Math.max(0, Math.round((time - start) * 1000) / 1000);
}

describe.each(FIXTURES)('$kind through the production planner and render props', (fixture) => {
  const { kind, fields, indexes, gaps, finalHold, labels } = fixture;
  const words = sourceWords(fixture);
  const candidate = candidateFor(fixture);
  const phaseFields = fields.map((field) => field.replace(/Word$/, 'At'));
  const expectedScene = {
    kind,
    ...Object.fromEntries(labels.map(({ field, text }) => [field, text])),
    ...fixture.options,
    ...Object.fromEntries(phaseFields.map((field, i) => [field, fixture.times[i]])),
  };

  function plan(patch: Rec = {}, source = words, bounds = BOUNDS) {
    return parseExplainerPlan({ scenes: [{ ...candidate, ...patch }] }, source, bounds);
  }

  function rejected(patch: Rec = {}, source = words, bounds = BOUNDS) {
    expect(plan(patch, source, bounds)).toEqual([]);
    const failures = parsePlanWithRejections(
      { scenes: [{ ...candidate, ...patch }] },
      source,
      bounds,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].problems.length).toBeGreaterThan(0);
    expect(failures[0].problems.length).toBeLessThanOrEqual(4);
    return failures[0].problems.join(' ');
  }

  // Interpolate non-beat words too so valid boundary fixtures remain chronological.
  function retime(starts: readonly number[], firstIndex = 0): PlannerWord[] {
    const positions = [firstIndex, ...indexes.slice(1)];
    return words.map((word, i) => {
      const next = positions.findIndex((index) => index >= i);
      if (next < 0 || i < firstIndex) return { ...word };
      const previous = Math.max(0, next - 1);
      const fraction =
        next === 0 ? 0 : (i - positions[previous]) / (positions[next] - positions[previous]);
      const start = starts[previous] + (starts[next] - starts[previous]) * fraction;
      return { ...word, start, end: start + 0.05 };
    });
  }

  it('maps exactly four source beats and two quiet contact cues without invented parameters', () => {
    const result = plan();
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.scene).toEqual(expectedScene);
    expect(p.startTime).toBe(9.75);
    expect(p.endTime).toBeCloseTo(16.9);
    expect(p.layout).toBe('stack');
    expect(collectSceneTimes(p.scene)).toEqual(fixture.times);
    expect(p.cues).toEqual(fixture.cues);
    expect(p.cues).toHaveLength(2);
    expect(p.cues.map((cue) => cue.at)).toEqual(
      [...p.cues.map((cue) => cue.at)].sort((a, b) => a - b),
    );
    expect(parsePlanWithRejections({ scenes: [candidate] }, words, BOUNDS)).toEqual([]);
    for (const time of [p.startTime, p.endTime, ...collectSceneTimes(p.scene)]) {
      expect(Number.isFinite(time)).toBe(true);
    }
    for (const cue of p.cues) {
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeGreaterThanOrEqual(p.startTime);
      expect(cue.at).toBeLessThan(p.endTime);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(0.4);
    }
    if (p.scene.kind === 'keystone') {
      expect(KEYSTONE_WITHDRAW_SECONDS).toBe(0.45);
      expect(p.endTime - p.scene.withdrawAt - KEYSTONE_WITHDRAW_SECONDS).toBeGreaterThanOrEqual(
        0.5,
      );
    }
  });

  it('rebases every phase and contact cue exactly through toSceneRelative without mutation', () => {
    const p = plan()[0];
    const local = toSceneRelative(p.scene, p.startTime);
    expect(local).toEqual({
      ...expectedScene,
      ...Object.fromEntries(
        phaseFields.map((field, i) => [field, relative(fixture.times[i], p.startTime)]),
      ),
    });
    expect(collectSceneTimes(local)).toEqual(
      fixture.times.map((time) => relative(time, p.startTime)),
    );
    expect(sceneCues({ scene: local, chained: false })).toEqual(
      p.cues.map((cue) => ({ ...cue, at: relative(cue.at, p.startTime) })),
    );
    expect(mapSceneTimes(local, (time) => time + p.startTime)).toEqual(p.scene);
    expect(p.scene).toEqual(expectedScene);
  });

  it('preserves the authored visual fixture timings through production parsing and sequence props', () => {
    const starts = fixture.fixtureTimes.map((time) => 9.75 + time);
    // The first word retains the standard entrance clamp to scene-relative 0.3s.
    starts[0] = words[0].start;
    const parsed = plan({}, retime(starts));
    expect(parsed).toHaveLength(1);
    const local = toSceneRelative(parsed[0].scene, parsed[0].startTime);
    expect(collectSceneTimes(local)).toEqual(fixture.fixtureTimes);
    expect(local).toEqual({
      ...expectedScene,
      ...Object.fromEntries(phaseFields.map((field, i) => [field, fixture.fixtureTimes[i]])),
    });
    expect(sceneCues({ scene: local, chained: false })).toEqual(
      kind === 'keystone'
        ? [
            { kind: 'slide', at: 1.1, gain: 0.3 },
            { kind: 'thump', at: 2.75, gain: 0.4 },
          ]
        : [
            { kind: 'tick', at: 1.4, gain: 0.35 },
            { kind: 'thump', at: 3.7, gain: 0.3 },
          ],
    );
    const groups = groupPlannedScenes(parsed);
    expect(groups).toHaveLength(1);
    const render = buildGroupRenderPlan(groups[0], groups[0], deriveExplainerPalette());
    expect(render.props.scenes).toHaveLength(1);
    expect(render.props.scenes[0].scene).toEqual(local);
  });

  it.each([
    'stack',
    'stack-flipped',
    'over',
  ])('builds real %s sequence props after window adjustment', (layout) => {
    const parsed = plan({ layout });
    const groups = groupPlannedScenes(parsed);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.layout).toBe(layout);
    const window = { startTime: group.startTime + 0.017, endTime: group.endTime };
    const render = buildGroupRenderPlan(group, window, deriveExplainerPalette());
    expect(render.props.layout).toBe(layout);
    expect(render.props.scenes).toHaveLength(1);
    expect(render.props.scenes[0].scene).toEqual(
      toSceneRelative(parsed[0].scene, window.startTime),
    );
    expect(collectSceneTimes(render.props.scenes[0].scene)).toEqual(
      fixture.times.map((time) => relative(time, window.startTime)),
    );
    expect(render.props.transitions).toEqual([]);
    expect(render.cues).toEqual([
      { kind: 'whoosh', at: window.startTime + 0.02, gain: 0.45 },
      ...fixture.cues,
    ]);
    expect(parsed[0].scene).toEqual(expectedScene);
  });

  it.each([
    'takeover',
    'pip',
    'unknown',
    '__proto__',
    null,
    { layout: 'over' },
  ])('falls back to stack for unsupported layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe('stack');
  });

  it.each([
    '9:16',
    '16:9',
  ] as const)('offers causal constraints in the real %s planning and review prompts', (aspect) => {
    expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
    const spec = getKindSpec(kind);
    expect(spec).toMatchObject({
      family: 'object',
      durationSec: [3.5, 8],
      layouts: ['stack', 'stack-flipped', 'over'],
    });
    if (!spec) throw new Error('missing assembly spec');
    for (const prompt of [
      buildExplainerPrompt(words, BOUNDS, aspect),
      buildReviewPrompt(words, [candidate], BOUNDS, aspect),
    ]) {
      expect(prompt).toContain(`- "${kind}": ${spec.describe}`);
      expect(prompt).toContain(spec.schema);
      expect(prompt).toContain(spec.limits);
      expect(prompt).toContain(spec.avoid);
      expect(prompt).toContain('Layouts: stack, stack-flipped, over.');
      expect(prompt).toContain('preserve signed numbers and units');
      expect(prompt).toContain('no invented outcomes or numeric promises');
      for (const note of fixture.timingNotes) expect(prompt).toContain(note);
    }
  });

  it('ignores unknown geometry, targets, counts, raw timestamps and supplied cues', () => {
    expect(
      plan({
        ...JSON.parse(
          '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
        ),
        tokenCount: 1000000,
        targets: [{ x: Number.NaN, y: Number.POSITIVE_INFINITY }],
        coordinates: [999999, -999999],
        target: 'invented destination',
        outcome: '100% guaranteed',
        geometry: { url: 'https://invalid.example/model', path: '../../secret' },
        options: { iterations: 1000000 },
        script: 'process.exit(1)',
        svg: '<svg onload="alert(1)"/>',
        cues: [{ kind: 'thump', at: Number.NaN, gain: 100 }],
        ...Object.fromEntries(phaseFields.map((field) => [field, Number.NaN])),
      }),
    ).toEqual(plan());
    expect({}).not.toHaveProperty('polluted');
    fields.forEach((field, i) => {
      expect(rejected({ [field]: undefined, [phaseFields[i]]: fixture.times[i] })).toContain(
        `${field} must be an integer index`,
      );
    });
    for (const tokenCount of [null, '3', 3, -1, Number.NaN, { arbitrary: true }]) {
      expect(plan({ tokenCount })).toEqual(plan());
    }
  });

  it.each([
    undefined,
    null,
    true,
    '4',
    4.5,
    -1,
    100,
    [[]],
    { index: 4 },
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects malformed required indexes %s', (value) => {
    for (const field of fields) {
      expect(rejected({ [field]: value })).toContain(
        `${field} must be an integer index inside this scene window`,
      );
    }
  });

  it.each([
    { startWord: undefined },
    { startWord: null },
    { startWord: 0.5 },
    { startWord: -1 },
    { startWord: Number.NaN },
    { endWord: Number.POSITIVE_INFINITY },
    { endWord: '21' },
    { endWord: 100 },
    { startWord: 5, endWord: 4 },
  ])('rejects malformed window indexes: %j', (patch) => {
    expect(rejected(patch)).toContain('valid indices');
  });

  it('requires every beat inside this window and strictly increasing source indices', () => {
    expect(rejected({ startWord: 1 })).toContain(`${fields[0]} must be an integer index`);
    expect(rejected({ endWord: indexes[3] - 1, label: words[1].text })).toContain(
      `${fields[3]} must be an integer index`,
    );
    for (let i = 1; i < fields.length; i++) {
      expect(rejected({ [fields[i]]: indexes[i - 1] })).toContain('source index order');
      expect(rejected({ [fields[i - 1]]: indexes[i], [fields[i]]: indexes[i - 1] })).toContain(
        'source index order',
      );
    }
  });

  it('rejects reversed times and each compressed gap rather than repairing phases', () => {
    for (let i = 1; i < fields.length; i++) {
      for (const delta of [0, -0.01]) {
        const starts = indexes.map((index) => words[index].start);
        starts[i] = starts[i - 1] + delta;
        expect(rejected({}, retime(starts))).toContain(
          `${fields[i]} source time must strictly increase`,
        );
      }
      const starts = indexes.map((index) => words[index].start);
      starts[i] = fixture.times[i - 1] + gaps[i - 1] - 0.001;
      expect(rejected({}, retime(starts))).toContain(
        `${fields[i]} must be at least ${gaps[i - 1]}s after ${fields[i - 1]}; phases are too compressed`,
      );
    }
  });

  it('accepts exact phase, duration and hold minima but rejects shorter scenes', () => {
    const endTime = 9.75 + 3.5;
    const starts = [endTime - finalHold - gaps.reduce((sum, gap) => sum + gap, 0)];
    for (const gap of gaps) starts.push(starts[starts.length - 1] + gap);
    const patch = { [fields[0]]: 1 };
    const bounds = { minStart: 0, maxEnd: endTime };
    const parsed = plan(patch, retime(starts, 1), bounds);
    expect(parsed).toHaveLength(1);
    const beats = collectSceneTimes(parsed[0].scene);
    gaps.forEach((gap, i) => {
      expect(beats[i + 1] - beats[i]).toBeCloseTo(gap);
    });
    expect(parsed[0].endTime - beats[3]).toBeCloseTo(finalHold);
    expect(parsed[0].endTime - parsed[0].startTime).toBe(3.5);
    expect(
      rejected(
        patch,
        retime(
          starts.map((time) => time - 0.1),
          1,
        ),
        { ...bounds, maxEnd: endTime - 0.01 },
      ),
    ).toContain(`${kind} scene must last 3.5..8s`);
  });

  it('accepts exactly eight seconds but rejects an overlong window', () => {
    const source = words.map((word, i) => (i === words.length - 1 ? { ...word, end: 17.4 } : word));
    expect(plan({}, source)).toHaveLength(1);
    source[source.length - 1].end += 0.001;
    expect(rejected({}, source)).toContain(`${kind} scene must last 3.5..8s`);
  });

  it('rejects a clipped final hold and supplies actionable review feedback', () => {
    const starts = indexes.map((index) => words[index].start);
    starts[3] = plan()[0].endTime - finalHold + 0.001;
    const reason = `${fields[3]} must leave at least ${finalHold}s of final hold`;
    expect(rejected({}, retime(starts))).toContain(reason);
    expect(
      rejected({}, words, { minStart: 0, maxEnd: fixture.times[3] + finalHold - 0.001 }),
    ).toContain(reason);
    const failures = parsePlanWithRejections({ scenes: [candidate] }, retime(starts), BOUNDS);
    expect(buildReviewPrompt(retime(starts), [candidate], BOUNDS, '9:16', failures)).toContain(
      `Problems: ${reason}`,
    );
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects nonfinite source times %s, including non-beats and boundaries', (bad) => {
    for (const index of [0, indexes[1], 2, words.length - 1]) {
      for (const field of ['start', 'end'] as const) {
        const source = words.map((word, i) => (i === index ? { ...word, [field]: bad } : word));
        expect(rejected({}, source)).toMatch(/finite|valid indices/);
      }
    }
  });

  it.each([
    undefined,
    null,
    42,
    '',
    'x'.repeat(27),
    'Guaranteed win',
    '100% success',
    '<svg/onload=x>',
  ])('independently rejects invalid or invented copy in every label: %s', (label) => {
    for (const { field } of labels) expect(rejected({ [field]: label })).toContain('label');
  });

  it('requires every label to quote a contiguous whole-word phrase inside this window', () => {
    for (const { field, text } of labels) {
      expect(rejected({ [field]: `${words[0].text} ${words[10].text}` })).toContain(
        'label must quote',
      );
      expect(rejected({ [field]: text.slice(1) })).toContain('label must quote');
      const source = [{ text: 'Outside', start: 0, end: 0.3 }, ...words];
      expect(rejected({ ...candidateFor(fixture, 1), [field]: 'Outside' }, source)).toContain(
        'scene window',
      );
    }
  });

  it('enforces each label cap even for source copy while allowing case and sentence punctuation', () => {
    for (const { field, text, max } of labels) {
      const label = 'x'.repeat(max);
      const source = words.map((word, i) => (i === 2 ? { ...word, text: `${label}x` } : word));
      expect(rejected({ [field]: `${label}x` }, source)).toContain(`max ${max}`);
      source[2].text = label;
      expect(plan({ [field]: label }, source)[0].scene).toMatchObject({ [field]: label });
      const phrase = text.split(' ').slice(0, 2).join(' ');
      const punctuated = `  ${phrase.toUpperCase().replaceAll(' ', '—\t')}!  `;
      const normalized = punctuated.replace(/\s+/g, ' ').trim();
      expect(normalized.length).toBeLessThanOrEqual(max);
      expect(plan({ [field]: punctuated })[0].scene).toMatchObject({ [field]: normalized });
    }
  });

  it.each([
    ['-50%', '50%'],
    ['+50%', '50%'],
    ['−50%', '50%'],
    ['50%', '50'],
    ['-$50', '$50'],
    ['50kg', '50'],
    ['1.5x', '15x'],
  ])('preserves signed amount and unit fidelity for all labels: %s cannot become %s', (spoken, invented) => {
    const source = words.map((word, i) => (i === 2 ? { ...word, text: spoken } : word));
    for (const { field } of labels) {
      expect(rejected({ [field]: invented }, source)).toContain('label must quote');
      expect(plan({ [field]: spoken }, source)[0].scene).toMatchObject({ [field]: spoken });
    }
  });

  if (kind === 'switchyard') {
    it.each([
      'left',
      'right',
    ])('keeps the explicit %s route and independently sourced branch names', (route) => {
      const branches =
        route === 'left'
          ? { leftLabel: 'Express', rightLabel: 'Review' }
          : { leftLabel: 'Review', rightLabel: 'Express' };
      expect(plan({ route, ...branches })[0].scene).toEqual({
        ...expectedScene,
        route,
        ...branches,
      });
    });

    it.each([
      undefined,
      null,
      true,
      0,
      'Left',
      'RIGHT',
      ' left ',
      'straight',
      'both',
      '__proto__',
      'constructor',
      ['left'],
      { route: 'left' },
    ])('rejects hostile route enum %s without a default', (route) => {
      expect(rejected({ route })).toContain('route must be left or right; no default route');
    });

    it.each([
      'Express',
      'EXPRESS!',
      '  ExPrEsS  ',
      'Ｅｘｐｒｅｓｓ',
    ])('rejects identical normalized branches: %s', (rightLabel) => {
      expect(rejected({ leftLabel: 'Express', rightLabel })).toContain(
        'leftLabel and rightLabel must differ after normalization',
      );
    });

    it('normalizes branch punctuation and spacing without conflating signed amounts', () => {
      const source = words.map((word, i) =>
        i === 2 ? { ...word, text: 'Review lane −50% +50%' } : word,
      );
      expect(
        rejected({ leftLabel: 'Review—lane', rightLabel: ' REVIEW \tlane! ' }, source),
      ).toContain('must differ after normalization');
      expect(rejected({ leftLabel: '−50%', rightLabel: '-50%' }, source)).toContain(
        'must differ after normalization',
      );
      expect(plan({ leftLabel: '-50%', rightLabel: '+50%' }, source)[0].scene).toMatchObject({
        leftLabel: '-50%',
        rightLabel: '+50%',
      });
    });
  }
});

it('chains production keystone and switchyard plans into one sequence with exact local beats and sorted absolute cues', () => {
  const firstWords = sourceWords(FIXTURES[0]);
  const words = [...firstWords, ...sourceWords(FIXTURES[1], 17)];
  const parsed = parseExplainerPlan(
    {
      scenes: [
        candidateFor(FIXTURES[0]),
        {
          ...candidateFor(FIXTURES[1], firstWords.length),
          continues: true,
          transition: 'slide',
          layout: 'takeover',
        },
      ],
    },
    words,
    BOUNDS,
  );
  expect(parsed).toHaveLength(2);
  expect(parsed[1].startTime).toBe(parsed[0].endTime);
  expect(parsed[1].chained).toBe(true);
  const groups = groupPlannedScenes(parsed);
  expect(groups).toHaveLength(1);
  expect(groups[0].scenes).toHaveLength(2);
  const render = buildGroupRenderPlan(groups[0], groups[0], deriveExplainerPalette());
  expect(render.props.layout).toBe('stack');
  expect(render.props.scenes.map(({ scene }) => scene)).toEqual(
    parsed.map((p) => toSceneRelative(p.scene, p.startTime)),
  );
  render.props.scenes.forEach(({ scene }, i) => {
    expect(collectSceneTimes(scene)).toEqual(
      FIXTURES[i].times.map((time) => relative(time + i * 7, parsed[i].startTime)),
    );
  });
  expect(render.props.transitions).toEqual([{ kind: 'slide', durationInFrames: 14 }]);
  expect(render.props.scenes[0].durationInFrames - 14).toBe(
    Math.round((parsed[1].startTime - parsed[0].startTime) * 30),
  );
  expect(render.cues).toEqual([
    { kind: 'whoosh', at: parsed[0].startTime + 0.02, gain: 0.45 },
    ...parsed.flatMap((p) => p.cues),
  ]);
  expect(render.cues.map((cue) => cue.at)).toEqual(
    [...render.cues.map((cue) => cue.at)].sort((a, b) => a - b),
  );
});
