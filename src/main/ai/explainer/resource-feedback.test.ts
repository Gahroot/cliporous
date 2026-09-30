import { describe, expect, it } from 'vitest';
import { collectSceneTimes, mapSceneTimes } from '../../remotion/compositions/explainer/types';
import {
  buildExplainerPrompt,
  buildReviewPrompt,
  parseExplainerPlan,
  parsePlanWithRejections,
  sceneCues,
} from '../explainer-scenes';
import type { PlannerWord, Rec } from './kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';

const FIXTURES = [
  {
    kind: 'resource-leak',
    text: 'Water flows in but leaks drain the tank until we seal the leaks and retain more water in reserve',
    label: 'Retain more water',
    fields: ['inflowWord', 'leakWord', 'sealWord', 'retainWord'],
    indexes: [0, 4, 10, 14],
    times: [10.05, 11.4, 13.5, 14.9],
    gaps: [0.55, 0.75, 1],
    finalHold: 0.5,
    cues: [
      { kind: 'slide', at: 10.05, gain: 0.35 },
      { kind: 'tick', at: 13.82, gain: 0.5 },
    ],
    timingNotes: [
      'inflowAt starts inflow',
      'leakAt opens visible leaks',
      'sealAt starts closing both outlet taps, seating exactly 0.32s later',
      'retained level rises until retainAt, then inflow stops',
    ],
  },
  {
    kind: 'feedback-control',
    text: 'Pressure rises above target then the sensor responds and the valve corrects flow until the gauge settles at target',
    label: 'Above target',
    fields: ['exceedWord', 'senseWord', 'correctWord', 'settleWord'],
    indexes: [0, 6, 10, 16],
    times: [10.05, 12.1, 13.5, 15.6],
    gaps: [0.55, 0.55, 1],
    finalHold: 0.6,
    cues: [
      { kind: 'tick', at: 12.1, gain: 0.35 },
      { kind: 'slide', at: 13.5, gain: 0.4 },
    ],
    timingNotes: [
      'exceedAt starts the over-target gauge rise before senseAt',
      'senseAt is the sensor response',
      'correctAt starts valve correction',
      'settleAt reaches the exact stable target and holds',
    ],
  },
] as const;
const bounds = { minStart: 0, maxEnd: 60 };

describe.each(FIXTURES)('$kind through the production planner parser', (fixture) => {
  const { kind, fields, indexes, gaps, finalHold } = fixture;
  const words: PlannerWord[] = fixture.text.split(' ').map((text, i) => ({
    text,
    start: (1000 + i * 35) / 100,
    end: (1030 + i * 35) / 100,
  }));
  const phaseFields = fields.map((field) => field.replace(/Word$/, 'At'));
  const candidate: Rec = {
    kind,
    startWord: 0,
    endWord: words.length - 1,
    label: fixture.label,
    ...Object.fromEntries(fields.map((field, i) => [field, indexes[i]])),
  };
  const expectedScene = {
    kind,
    label: fixture.label,
    ...Object.fromEntries(phaseFields.map((field, i) => [field, fixture.times[i]])),
  };

  function plan(patch: Rec = {}, source = words, limits = bounds) {
    return parseExplainerPlan({ scenes: [{ ...candidate, ...patch }] }, source, limits);
  }

  function rejected(patch: Rec = {}, source = words, limits = bounds) {
    expect(plan(patch, source, limits)).toEqual([]);
    const failures = parsePlanWithRejections(
      { scenes: [{ ...candidate, ...patch }] },
      source,
      limits,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].problems.length).toBeGreaterThan(0);
    expect(failures[0].problems.length).toBeLessThanOrEqual(4);
    return failures[0].problems.join(' ');
  }

  // Interpolate the intervening words so boundary fixtures remain chronological.
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

  it('parses exactly four absolute beats with two quiet causal cues', () => {
    const result = plan();
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.scene).toEqual(expectedScene);
    expect(p.startTime).toBe(9.75);
    expect(p.layout).toBe('stack');
    expect(p.cues).toEqual(fixture.cues);
    expect(p.cues).toHaveLength(2);
    expect(parsePlanWithRejections({ scenes: [candidate] }, words, bounds)).toEqual([]);
    for (const time of [p.startTime, p.endTime, ...collectSceneTimes(p.scene)]) {
      expect(Number.isFinite(time)).toBe(true);
    }
    for (const cue of p.cues) {
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeGreaterThanOrEqual(p.startTime);
      expect(cue.at).toBeLessThan(p.endTime);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(0.5);
    }
    if (p.scene.kind === 'resource-leak') {
      expect(p.cues[1].at - p.scene.sealAt).toBeCloseTo(0.32);
      expect(p.cues[1].at).toBeLessThan(p.scene.retainAt);
    }
  });

  it('rebases every phase and regenerates matching local cues without mutating the scene', () => {
    const p = plan()[0];
    const local = mapSceneTimes(p.scene, (time) => time - p.startTime);
    const times = collectSceneTimes(local);
    expect(times).toHaveLength(4);
    fixture.times.forEach((time, i) => {
      expect(times[i]).toBeCloseTo(time - p.startTime);
    });
    const localCues = sceneCues({ scene: local, chained: false });
    expect(localCues).toHaveLength(2);
    localCues.forEach((cue, i) => {
      expect(cue).toMatchObject({ kind: p.cues[i].kind, gain: p.cues[i].gain });
      expect(cue.at).toBeCloseTo(p.cues[i].at - p.startTime);
    });
    expect(mapSceneTimes(local, (time) => time + p.startTime)).toEqual(p.scene);
    expect(local).toMatchObject({ kind, label: fixture.label });
    expect(p.scene).toEqual(expectedScene);
  });

  it.each(['stack', 'stack-flipped', 'over'])('supports layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe(layout);
  });

  it.each(['takeover', 'pip', 'unknown', null])('falls back to stack for layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe('stack');
  });

  it.each([
    '9:16',
    '16:9',
  ] as const)('reaches the real %s planning and review prompts', (aspect) => {
    expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
    const spec = getKindSpec(kind);
    expect(spec).toMatchObject({
      family: 'object',
      durationSec: [3.5, 8],
      layouts: ['stack', 'stack-flipped', 'over'],
    });
    if (!spec) throw new Error('missing spec');
    for (const prompt of [
      buildExplainerPrompt(words, bounds, aspect),
      buildReviewPrompt(words, [candidate], bounds, aspect),
    ]) {
      expect(prompt).toContain(`- "${kind}": ${spec.describe}`);
      expect(prompt).toContain(spec.schema);
      expect(prompt).toContain(spec.limits);
      expect(prompt).toContain(spec.avoid);
      expect(prompt).toContain('Layouts: stack, stack-flipped, over.');
      expect(prompt).toContain('preserve signed numbers and units');
      expect(prompt).toContain('no invented outcomes or numeric promises');
      expect(prompt).toContain('No extra mechanism options.');
      for (const note of fixture.timingNotes) expect(prompt).toContain(note);
    }
  });

  it('omits malicious unknown fields and never trusts raw timestamps or supplied cues', () => {
    const patch = {
      ...JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
      ),
      flowRate: Number.POSITIVE_INFINITY,
      particleCount: 1000000,
      target: Number.NaN,
      feedbackGain: Number.NEGATIVE_INFINITY,
      options: { preset: 'unbounded', iterations: 1000000 },
      geometry: { url: 'https://invalid.example/model', path: '../../secret' },
      script: 'process.exit(1)',
      svg: '<svg onload="alert(1)"/>',
      cues: [{ kind: 'tick', at: Number.NaN, gain: 100 }],
      ...Object.fromEntries(phaseFields.map((field) => [field, Number.NaN])),
    };
    expect(plan(patch)).toEqual(plan());
    expect({}).not.toHaveProperty('polluted');
    fields.forEach((field, i) => {
      expect(rejected({ [field]: undefined, [phaseFields[i]]: fixture.times[i] })).toContain(
        `${field} must be an integer index`,
      );
    });
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
  ])('rejects malformed required indexes %s with actionable reasons', (value) => {
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
    { endWord: '18' },
    { endWord: 100 },
    { startWord: 5, endWord: 4 },
  ])('rejects malformed scene-window indexes: %j', (patch) => {
    expect(rejected(patch)).toContain('valid indices');
  });

  it('requires all beats to stay inside the selected scene window', () => {
    expect(rejected({ startWord: 1 })).toContain(`${fields[0]} must be an integer index`);
    expect(rejected({ endWord: indexes[3] - 1, label: words[1].text })).toContain(
      `${fields[3]} must be an integer index`,
    );
  });

  it('rejects repeated or reversed source indexes at every phase', () => {
    for (let i = 1; i < fields.length; i++) {
      expect(rejected({ [fields[i]]: indexes[i - 1] })).toContain('source index order');
      expect(rejected({ [fields[i - 1]]: indexes[i], [fields[i]]: indexes[i - 1] })).toContain(
        'source index order',
      );
    }
  });

  it('rejects non-increasing beat times despite increasing indexes', () => {
    for (let i = 1; i < fields.length; i++) {
      for (const delta of [0, -0.01]) {
        const starts = indexes.map((index) => words[index].start);
        starts[i] = starts[i - 1] + delta;
        expect(rejected({}, retime(starts))).toContain(
          `${fields[i]} source time must strictly increase`,
        );
      }
    }
  });

  it('rejects each tight gap rather than silently clamping phases together', () => {
    gaps.forEach((gap, i) => {
      const starts = indexes.map((index) => words[index].start);
      starts[i + 1] = fixture.times[i] + gap - 0.001;
      expect(rejected({}, retime(starts))).toContain(
        `${fields[i + 1]} must be at least ${gap}s after ${fields[i]}; phases are too compressed`,
      );
    });
  });

  it('accepts exact gap, duration and hold minima, but rejects a shorter scene', () => {
    const endTime = 9.75 + 3.5;
    const starts = [endTime - finalHold - gaps.reduce((sum, gap) => sum + gap, 0)];
    for (const gap of gaps) starts.push(starts[starts.length - 1] + gap);
    const patch = { [fields[0]]: 1 }; // Keep a lead-in before the first action.
    const limits = { minStart: 0, maxEnd: endTime };
    const result = plan(patch, retime(starts, 1), limits);
    expect(result).toHaveLength(1);
    const beats = collectSceneTimes(result[0].scene);
    gaps.forEach((gap, i) => {
      expect(beats[i + 1] - beats[i]).toBeCloseTo(gap);
    });
    expect(result[0].endTime - beats[3]).toBeCloseTo(finalHold);
    expect(result[0].endTime - result[0].startTime).toBe(3.5);
    expect(
      rejected(
        patch,
        retime(
          starts.map((time) => time - 0.1),
          1,
        ),
        {
          ...limits,
          maxEnd: endTime - 0.01,
        },
      ),
    ).toContain(`${kind} scene must last 3.5..8s`);
  });

  it('accepts exactly eight seconds but rejects an overlong window', () => {
    const source = words.map((word, i) => (i === words.length - 1 ? { ...word, end: 17.4 } : word));
    expect(plan({}, source)).toHaveLength(1);
    source[source.length - 1].end += 0.001;
    expect(rejected({}, source)).toContain(`${kind} scene must last 3.5..8s`);
  });

  it('rejects a late final beat or clipped hold and carries the repair reason into review', () => {
    const starts = indexes.map((index) => words[index].start);
    starts[3] = plan()[0].endTime - finalHold + 0.001;
    const reason = `${fields[3]} must leave at least ${finalHold}s of final hold`;
    expect(rejected({}, retime(starts))).toContain(reason);
    expect(
      rejected({}, words, { minStart: 0, maxEnd: fixture.times[3] + finalHold - 0.001 }),
    ).toContain(reason);
    const failures = parsePlanWithRejections({ scenes: [candidate] }, retime(starts), bounds);
    for (const aspect of ['9:16', '16:9'] as const) {
      expect(buildReviewPrompt(retime(starts), [candidate], bounds, aspect, failures)).toContain(
        `Problems: ${reason}`,
      );
    }
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects nonfinite source times %s on beat, non-beat and boundary words', (bad) => {
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
    '100% retained',
    'Guaranteed control',
    '<svg/onload=alert(1)>',
  ])('rejects invalid, oversized or invented labels: %s', (label) =>
    expect(rejected({ label })).toContain('label'));

  it('requires a contiguous whole-word source quote inside this window', () => {
    expect(rejected({ label: `${words[0].text} ${words[10].text}` })).toContain('label must quote');
    expect(rejected({ label: fixture.label.slice(1) })).toContain('label must quote');
    const source = [{ text: 'Profit', start: 0, end: 0.3 }, ...words];
    expect(
      rejected(
        {
          startWord: 1,
          endWord: words.length,
          label: 'Profit',
          ...Object.fromEntries(fields.map((field, i) => [field, indexes[i] + 1])),
        },
        source,
      ),
    ).toContain('scene window');
  });

  it('accepts 26 characters but rejects 27 even when source-supported', () => {
    const label = 'The retained resource pool';
    expect(label).toHaveLength(26);
    const source = words.map((word, i) => (i === 2 ? { ...word, text: `${label}s` } : word));
    expect(rejected({ label: `${label}s` }, source)).toContain('max 26');
    source[2].text = label;
    expect(plan({ label }, source)[0].scene).toMatchObject({ label });
    const punctuated = `  ${fixture.label.toUpperCase().replaceAll(' ', '—\t')}!  `;
    expect(plan({ label: punctuated })[0].scene).toMatchObject({
      label: punctuated.replace(/\s+/g, ' ').trim(),
    });
  });

  it.each([
    ['-50%', '50%'],
    ['+50%', '50%'],
    ['50%', '50'],
    ['-$50', '$50'],
    ['50kg', '50'],
    ['1.5x', '15x'],
  ])('preserves a spoken sign or unit: %s cannot become %s', (spoken, label) => {
    const source = words.map((word, i) => (i === 2 ? { ...word, text: spoken } : word));
    expect(rejected({ label }, source)).toContain('label must quote');
    expect(plan({ label: spoken }, source)[0].scene).toMatchObject({ label: spoken });
  });
});
