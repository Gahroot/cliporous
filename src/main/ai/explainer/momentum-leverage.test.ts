import { describe, expect, it } from 'vitest';
import { collectSceneTimes, mapSceneTimes } from '../../remotion/compositions/explainer/types';
import {
  buildExplainerPrompt,
  buildReviewPrompt,
  parseExplainerPlan,
  parsePlanWithRejections,
} from '../explainer-scenes';
import type { PlannerWord, Rec } from './kind-spec';
import { ALL_KIND_SPECS, getKindSpec } from './kinds';

const FIXTURES = [
  {
    kind: 'momentum',
    text: 'First push then repeated pushes build momentum until the flywheel drives output and coasts to a quiet stop',
    label: 'Repeated pushes',
    fields: ['pushWord', 'repeatWord', 'engageWord', 'coastWord'],
    indexes: [0, 3, 10, 13],
    times: [10.05, 11.05, 13.5, 14.55],
    gaps: [0.45, 0.65, 0.9],
    finalHold: 1.1,
    minDuration: 3.5,
    cues: [
      { kind: 'tick', at: 10.05, gain: 0.4 },
      { kind: 'tick', at: 13.5, gain: 0.55 },
    ],
  },
  {
    kind: 'leverage',
    text: 'Effort alone barely moves it so shift the fulcrum then lift the load and hold it steady now',
    label: 'Lift the load',
    fields: ['effortWord', 'pivotWord', 'liftWord', 'holdWord'],
    indexes: [0, 6, 10, 14],
    times: [10.05, 12.1, 13.5, 14.9],
    gaps: [0.45, 0.5, 0.65],
    finalHold: 0.5,
    minDuration: 3,
    cues: [
      { kind: 'thump', at: 10.05, gain: 0.35 },
      { kind: 'slide', at: 12.1, gain: 0.4 },
      { kind: 'tick', at: 14.9, gain: 0.5 },
    ],
  },
] as const;
const bounds = { minStart: 0, maxEnd: 60 };

describe.each(FIXTURES)('$kind through the production planner parser', (fixture) => {
  const { kind, fields, indexes, gaps, finalHold, minDuration } = fixture;
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

  // Interpolate intervening words too, so valid timing fixtures stay chronological.
  function withTimes(times: readonly number[], firstIndex = 0): PlannerWord[] {
    const positions = [firstIndex, ...indexes.slice(1)];
    return words.map((word, i) => {
      const next = positions.findIndex((index) => index >= i);
      if (next < 0 || (next === 0 && i < firstIndex)) return { ...word };
      const previous = Math.max(0, next - 1);
      const fraction =
        next === 0 ? 0 : (i - positions[previous]) / (positions[next] - positions[previous]);
      const start = times[previous] + (times[next] - times[previous]) * fraction;
      return { ...word, start, end: start + 0.05 };
    });
  }

  it('parses only the four absolute source beats and sparse phase-contact cues', () => {
    const result = plan();
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.scene).toEqual(expectedScene);
    expect(p.startTime).toBe(9.75);
    expect(p.cues).toEqual(fixture.cues);
    expect(p.cues.length).toBeLessThanOrEqual(3);
    for (const time of [p.startTime, p.endTime, ...collectSceneTimes(p.scene)]) {
      expect(Number.isFinite(time)).toBe(true);
    }
    for (const cue of p.cues) {
      expect(Number.isFinite(cue.at)).toBe(true);
      expect(cue.at).toBeGreaterThanOrEqual(p.startTime);
      expect(cue.at).toBeLessThan(p.endTime);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(0.6);
    }
  });

  it('rebases every phase through mapSceneTimes without mutating the source scene', () => {
    const p = plan()[0];
    const local = mapSceneTimes(p.scene, (time) => time - p.startTime);
    const times = collectSceneTimes(local);
    expect(times).toHaveLength(4);
    fixture.times.forEach((time, i) => {
      expect(times[i]).toBeCloseTo(time - p.startTime);
      expect(Number.isFinite(times[i])).toBe(true);
    });
    expect(mapSceneTimes(local, (time) => time + p.startTime)).toEqual(p.scene);
    expect(local).toMatchObject({ kind, label: fixture.label });
    expect(p.scene).toEqual(expectedScene);
  });

  it.each(['stack', 'stack-flipped', 'over'])('permits layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe(layout);
  });

  it.each(['takeover', 'pip', 'unknown', null])('falls back to stack for layout %s', (layout) => {
    expect(plan({ layout })[0].layout).toBe('stack');
  });

  it.each(['9:16', '16:9'] as const)('uses the existing registry and %s prompt', (aspect) => {
    expect(ALL_KIND_SPECS.filter((spec) => spec.kind === kind)).toHaveLength(1);
    const spec = getKindSpec(kind);
    expect(spec).toMatchObject({
      family: 'object',
      durationSec: [minDuration, 8],
      layouts: ['stack', 'stack-flipped', 'over'],
    });
    if (!spec) throw new Error('missing spec');
    const prompt = buildExplainerPrompt(words, bounds, aspect);
    expect(prompt).toContain(spec.schema);
    expect(prompt).toContain(spec.limits);
    expect(prompt).toContain(spec.avoid);
    expect(prompt).toContain('preserve signed numbers and units');
    expect(prompt).toContain('no invented outcomes or numeric promises');
    if (kind === 'momentum') {
      expect(prompt).toContain('coastWord begins shared deceleration');
      expect(prompt).toContain('wheel and output still engaged');
      expect(prompt).toContain('0.6s coasting + 0.5s static');
    }
  });

  it('ignores unknown mechanism options and raw timestamps instead of passing them to render', () => {
    const patch = {
      speed: Number.POSITIVE_INFINITY,
      ratio: '10x',
      preset: 'unbounded',
      tokenCount: 1000,
      geometry: { url: 'https://invalid.example/model' },
      cues: [{ kind: 'tick', at: Number.NaN }],
      ...Object.fromEntries(phaseFields.map((field) => [field, Number.NaN])),
    };
    expect(plan(patch)).toEqual(plan());
    fields.forEach((field, i) => {
      expect(rejected({ [field]: undefined, [phaseFields[i]]: fixture.times[i] })).toContain(
        `${field} must be an integer index`,
      );
    });
  });

  it.each([
    undefined,
    null,
    '3',
    3.5,
    -1,
    100,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects malformed required indexes %s with field-specific repair reasons', (value) => {
    for (const field of fields) {
      expect(rejected({ [field]: value })).toContain(
        `${field} must be an integer index inside this scene window`,
      );
    }
  });

  it.each([
    { startWord: undefined },
    { startWord: 0.5 },
    { startWord: -1 },
    { endWord: '17' },
    { endWord: 100 },
    { startWord: 5, endWord: 4 },
  ])('rejects malformed scene-window indexes: %j', (patch) => {
    expect(rejected(patch)).toContain('valid indices');
  });

  it('requires even valid transcript indexes to be inside this scene window', () => {
    expect(rejected({ startWord: 1 })).toContain(`${fields[0]} must be an integer index`);
    expect(rejected({ endWord: indexes[3] - 1 })).toContain(
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

  it('rejects equal or reversed source times despite increasing indexes', () => {
    for (let i = 1; i < fields.length; i++) {
      for (const delta of [0, -0.01]) {
        const times = indexes.map((index) => words[index].start);
        times[i] = times[i - 1] + delta;
        expect(rejected({}, withTimes(times))).toContain(
          `${fields[i]} source time must strictly increase`,
        );
      }
    }
  });

  it('rejects each compressed gap instead of clamping phases together', () => {
    gaps.forEach((gap, i) => {
      const times = indexes.map((index) => words[index].start);
      times[i + 1] = fixture.times[i] + gap - 0.001;
      expect(rejected({}, withTimes(times))).toContain(
        `${fields[i + 1]} must be at least ${gap}s after ${fields[i]}; phases are too compressed`,
      );
    });
  });

  it('accepts exact gap, duration and final-hold minima, but rejects a shorter scene', () => {
    const endTime = 9.75 + minDuration;
    const firstAt = endTime - finalHold - gaps.reduce((sum, gap) => sum + gap, 0);
    const times = [firstAt];
    for (const gap of gaps) times.push(times[times.length - 1] + gap);
    const patch = { [fields[0]]: 1 }; // Leave room before the first action, not after the hold.
    const limits = { minStart: 0, maxEnd: endTime };
    const result = plan(patch, withTimes(times, 1), limits);
    expect(result).toHaveLength(1);
    const beats = collectSceneTimes(result[0].scene);
    gaps.forEach((gap, i) => {
      expect(beats[i + 1] - beats[i]).toBeCloseTo(gap);
    });
    expect(result[0].endTime - beats[3]).toBeCloseTo(finalHold);
    expect(result[0].endTime - result[0].startTime).toBeCloseTo(minDuration);
    expect(
      rejected(
        patch,
        withTimes(
          times.map((time) => time - 0.1),
          1,
        ),
        {
          ...limits,
          maxEnd: endTime - 0.01,
        },
      ),
    ).toContain(`${kind} scene must last ${minDuration}..8s`);
  });

  it('accepts exactly eight seconds but rejects longer scene windows', () => {
    const source = words.map((word, i) => (i === words.length - 1 ? { ...word, end: 17.4 } : word));
    expect(plan({}, source)).toHaveLength(1);
    source[source.length - 1].end += 0.001;
    expect(rejected({}, source)).toContain(`${kind} scene must last ${minDuration}..8s`);
  });

  it('rejects a late final beat and clipped hold, and feeds the reason into review', () => {
    const times = indexes.map((index) => words[index].start);
    times[3] = plan()[0].endTime - finalHold + 0.001;
    const reason = `${fields[3]} must leave at least ${finalHold}s of final hold`;
    expect(rejected({}, withTimes(times))).toContain(reason);
    expect(
      rejected({}, words, { minStart: 0, maxEnd: fixture.times[3] + finalHold - 0.001 }),
    ).toContain(reason);
    const failures = parsePlanWithRejections({ scenes: [candidate] }, withTimes(times), bounds);
    expect(buildReviewPrompt(withTimes(times), [candidate], bounds, '9:16', failures)).toContain(
      `Problems: ${reason}`,
    );
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects nonfinite source times %s, including non-beat and boundary words', (bad) => {
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
    'Revenue doubles',
    '10x more output',
  ])('rejects invalid labels and invented promises: %s', (label) => {
    expect(rejected({ label })).toContain('label');
  });

  it('requires a contiguous whole-word source quote within this window', () => {
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

  it('allows 26 characters and normalizes only whitespace, case and sentence punctuation', () => {
    const label = 'Repeated effort pays later';
    expect(label).toHaveLength(26);
    const source = words.map((word, i) => (i === 2 ? { ...word, text: label } : word));
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
