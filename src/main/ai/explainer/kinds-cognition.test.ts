import { describe, expect, it } from 'vitest';
import {
  COGNITION_KINDS,
  COGNITION_PRESETS,
  type CognitionScene,
} from '../../remotion/compositions/explainer/cognition/types';
import { TECHNOLOGY_LAYOUTS } from '../../remotion/compositions/explainer/technology/types';
import { collectSceneTimes, mapSceneTimes } from '../../remotion/compositions/explainer/types';
import { parseExplainerPlan, toSceneRelative } from '../explainer-scenes';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { COGNITION_KIND_SPECS } from './kinds-cognition';
import { buildShortlist } from './shortlist';

type Preset = CognitionScene['preset'];
const PHASES = ['setup', 'action', 'response', 'check', 'resolve'] as const;
type Phase = (typeof PHASES)[number];
interface Example {
  kind: CognitionScene['kind'];
  preset: Preset;
  fields: Rec;
  clauses: Record<Phase, string>;
}
const examples: Example[] = [
  ...(['parallel-specialists', 'contractor-crew'] as const).map((preset): Example => {
    const contractor = preset === 'contractor-crew';
    const subject = contractor ? 'home renovation' : 'launch report';
    const roles = contractor ? ['plumber', 'electrician'] : ['analyst', 'writer'];
    return {
      kind: 'agent-team',
      preset,
      fields: { label: subject, subject, roles, outcome: 'combined results' },
      clauses: {
        setup: `The ${contractor ? 'contractor crew' : 'agent team'} owns the ${subject}.`,
        action: `The coordinator assigns research to ${roles[0]} for ${subject}${contractor ? '' : ' in parallel'}; the coordinator assigns delivery to ${roles[1]} for ${subject}.`,
        response: `${roles[0]} returns results; ${roles[1]} delivers results.`,
        check: `The coordinator combines ${roles[0]} results and ${roles[1]} results for ${subject}.`,
        resolve: `The ${subject} has combined results.`,
      },
    };
  }),
  ...(['replan', 'fixed-vs-adaptive'] as const).map((preset): Example => {
    const subject = preset === 'replan' ? 'route plan' : 'adaptive plan';
    return {
      kind: 'agent-plan',
      preset,
      fields: {
        label: subject,
        subject,
        obstacleLabel: 'bridge closure',
        revisedLabel: 'ferry crossing',
        outcome: 'uses ferry crossing',
      },
      clauses: {
        setup: `The ${subject} starts with the original route.`,
        action: `The bridge closure blocks the ${subject}.`,
        response: `The ${subject} switches to ferry crossing.`,
        check: `The ${subject} follows ferry crossing.${preset === 'fixed-vs-adaptive' ? ' The fixed plan keeps the original route.' : ''}`,
        resolve: `The ${subject} uses ferry crossing.`,
      },
    };
  }),
  ...(['stop', 'request-more'] as const).map(
    (preset): Example => ({
      kind: 'agent-budget',
      preset,
      fields: {
        label: 'token budget',
        subject: 'report agent',
        resourceLabel: 'token budget',
        actionLabel: 'search',
        outcome: preset === 'stop' ? 'remains stopped' : 'request stays pending',
      },
      clauses: {
        setup: 'The report agent has a finite token budget.',
        action: 'The report agent spends token budget on search.',
        response: 'The token budget is exhausted.',
        check:
          preset === 'stop'
            ? 'The report agent stops search.'
            : 'The report agent requests more token budget.',
        resolve:
          preset === 'stop' ? 'The report agent remains stopped.' : 'The request stays pending.',
      },
    }),
  ),
  ...(['train-then-use', 'examples-correction'] as const).map(
    (preset): Example => ({
      kind: 'model-training',
      preset,
      fields: {
        label: 'small model',
        subject: 'small model',
        exampleLabel: 'training examples',
        inputLabel: 'new question',
        outcome: 'stays unchanged',
      },
      clauses: {
        setup: 'The small model starts training with training examples.',
        action:
          preset === 'train-then-use'
            ? 'Training on training examples updates small model.'
            : 'Corrections to training examples update small model during training.',
        response: 'The small model finishes training.',
        check: 'The small model answers new question during inference.',
        resolve: 'The small model stays unchanged during inference.',
      },
    }),
  ),
  ...(['same-tests', 'tradeoffs'] as const).map(
    (preset): Example => ({
      kind: 'model-evaluation',
      preset,
      fields: {
        label: 'model comparison',
        subject: 'model comparison',
        approaches: ['draft model', 'tuned model'],
        criteria: ['speed', 'accuracy'],
        outcome: preset === 'same-tests' ? 'same checks' : 'no universal winner',
      },
      clauses: {
        setup: 'The model comparison uses draft model and tuned model.',
        action:
          preset === 'same-tests'
            ? 'We test draft model and tuned model on the same checks: speed and accuracy.'
            : 'We compare draft model and tuned model on speed and accuracy.',
        response:
          preset === 'same-tests'
            ? 'We record speed and accuracy for draft model and tuned model.'
            : 'The draft model favors speed over accuracy; the tuned model favors accuracy over speed.',
        check:
          preset === 'same-tests'
            ? 'We compare draft model and tuned model on speed and accuracy.'
            : 'The model comparison preserves tradeoffs.',
        resolve:
          preset === 'same-tests'
            ? 'The model comparison keeps the same checks.'
            : 'The model comparison has no universal winner.',
      },
    }),
  ),
  ...(['unresolved', 'human-review'] as const).map(
    (preset): Example => ({
      kind: 'evidence-conflict',
      preset,
      fields: {
        label: 'permit decision',
        subject: 'permit decision',
        sources: ['city record', 'site report'],
        claims: ['permit is valid', 'permit is invalid'],
        outcome: 'remains unresolved',
      },
      clauses: {
        setup: 'The permit decision compares city record and site report.',
        action: 'The city record says permit is valid.',
        response: 'The site report says permit is invalid.',
        check: `The claims conflict.${preset === 'human-review' ? ' We refer permit decision to a human reviewer.' : ''}`,
        resolve: 'The permit decision remains unresolved.',
      },
    }),
  ),
];

function example(preset: Preset): Example {
  const value = examples.find((entry) => entry.preset === preset);
  if (!value) throw new Error(`Missing ${preset}`);
  return structuredClone(value);
}
interface Story {
  raw: Rec;
  words: PlannerWord[];
  duration: number;
  kind: CognitionScene['kind'];
}
function story(
  value: Example,
  changes: Partial<Record<Phase, string>> = {},
  times = [0, 1.8, 3.6, 5.4, 7.2],
  duration = 9.3,
): Story {
  const raw: Rec = {
    kind: value.kind,
    preset: value.preset,
    ...value.fields,
    layout: 'stack',
    startWord: 0,
  };
  const words: PlannerWord[] = [];
  PHASES.forEach((phase, n) => {
    raw[`${phase}Word`] = words.length;
    const tokens = (changes[phase] ?? value.clauses[phase]).split(/\s+/);
    const start = times[n];
    const end = times[n + 1] ?? duration;
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: start + ((end - start) * i) / tokens.length,
        end: start + ((end - start) * (i + 1)) / tokens.length,
      });
    });
  });
  raw.endWord = words.length - 1;
  return { raw, words, duration, kind: value.kind };
}
function spec(kind: CognitionScene['kind']) {
  const value = COGNITION_KIND_SPECS.find((entry) => entry.kind === kind);
  if (!value) throw new Error(`Missing ${kind}`);
  return value;
}
function parse(value: Story) {
  const ctx = makeParseContext(value.words, {
    startWord: 0,
    endWord: value.words.length - 1,
    startTime: 0,
    endTime: value.duration,
  });
  const scene = spec(value.kind).parse(value.raw, ctx);
  return { scene, ctx };
}
function rejected(value: Story): void {
  const { scene, ctx } = parse(value);
  expect(scene).toBeNull();
  expect(ctx.issues.length).toBeGreaterThan(0);
}
function renamed(value: Example, from: string, to: string): Example {
  return JSON.parse(JSON.stringify(value).replaceAll(from, to)) as Example;
}

const EXTRA_PAYLOAD = {
  laterStamp: { text: 'PROVEN', word: 0 },
  dimWord: 0,
  reactions: [{ word: 0, strength: 'shake' }],
  annotation: { kind: 'circle', word: 0 },
  bursts: [{ word: 0 }],
};

describe('cognition authored source contracts', () => {
  it('covers exactly the six kinds and twelve authored presets', () => {
    expect(COGNITION_KIND_SPECS.map((entry) => entry.kind)).toEqual(COGNITION_KINDS);
    expect(examples.map((entry) => `${entry.kind}/${entry.preset}`).sort()).toEqual(
      Object.entries(COGNITION_PRESETS)
        .flatMap(([kind, presets]) => presets.map((preset) => `${kind}/${preset}`))
        .sort(),
    );
  });
  it.each(examples)('$kind/$preset derives all five absolute beats from source words', (value) => {
    const { scene, ctx } = parse(story(value));
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual({
      kind: value.kind,
      preset: value.preset,
      ...value.fields,
      setupAt: 0.3,
      actionAt: 1.8,
      responseAt: 3.6,
      checkAt: 5.4,
      resolveAt: 7.2,
    });
  });
  it.each(
    examples,
  )('$kind/$preset ignores known planner extras but returns only authored fields', (value) => {
    const input = story(value);
    const expected = parse(input).scene;
    Object.assign(input.raw, EXTRA_PAYLOAD);
    expect(parse(input).scene).toEqual(expected);
    expect(parse(input).ctx.issues).toEqual([]);
  });
  it.each(examples)('$kind/$preset preserves the complete source condition', (value) => {
    const condition = 'If the premise holds';
    const input = story(value, { setup: `${condition}, ${value.clauses.setup}` });
    rejected(input);
    input.raw.condition = condition;
    expect(parse(input).scene?.condition).toBe(condition);
    expect(parse(input).ctx.issues).toEqual([]);
    input.raw.condition = 'If the premise';
    rejected(input);
  });
  it('retains negation and compound prerequisites rather than shortening them', () => {
    const value = example('stop');
    const condition = 'If the budget is finite and funding is not approved';
    const input = story(value, { setup: `${condition}, ${value.clauses.setup}` });
    input.raw.condition = condition;
    expect(parse(input).scene?.condition).toBe(condition);
    input.raw.condition = 'If the budget is finite';
    rejected(input);
    input.raw.condition = 'funding is not approved';
    rejected(input);
  });
  it('rejects multiple, invented and overlong conditions', () => {
    const value = example('replan');
    const input = story(value, {
      setup: `If ready, ${value.clauses.setup}`,
      resolve: `If cleared, ${value.clauses.resolve}`,
    });
    input.raw.condition = 'If ready';
    rejected(input);
    const absent = story(value);
    absent.raw.condition = 'route plan';
    rejected(absent);
    const condition = `If ${'x'.repeat(54)}`;
    const long = story(value, { setup: `${condition}, ${value.clauses.setup}` });
    long.raw.condition = condition;
    rejected(long);
  });

  const negatives: [Preset, Phase, string][] = [
    [
      'parallel-specialists',
      'action',
      'The coordinator mentions analyst and writer for launch report in parallel.',
    ],
    [
      'parallel-specialists',
      'action',
      'The coordinator never assigns research to analyst for launch report in parallel; the coordinator assigns delivery to writer for launch report.',
    ],
    [
      'parallel-specialists',
      'action',
      'The coordinator assigns research to analyst for launch report; the coordinator assigns delivery to writer for launch report.',
    ],
    [
      'parallel-specialists',
      'response',
      'The analyst never returns results; the writer delivers results.',
    ],
    [
      'parallel-specialists',
      'response',
      'The analyst returns results for another task; the writer delivers results.',
    ],
    [
      'parallel-specialists',
      'check',
      'The coordinator mentions combined analyst results and writer results for launch report.',
    ],
    ['parallel-specialists', 'resolve', 'The launch report has no combined results.'],
    ['contractor-crew', 'action', 'The plumber and electrician visit home renovation.'],
    [
      'contractor-crew',
      'response',
      'The plumber returns results; the electrician unsuccessfully delivers results.',
    ],
    ['replan', 'action', 'The bridge closure is discussed beside the route plan.'],
    ['replan', 'action', 'The bridge closure never blocks the route plan.'],
    ['replan', 'response', 'The route plan might switch to ferry crossing.'],
    [
      'replan',
      'response',
      'The route plan stays on the original route and mentions ferry crossing.',
    ],
    ['replan', 'response', 'Another plan switches to ferry crossing.'],
    ['replan', 'check', 'The route plan never follows ferry crossing.'],
    ['replan', 'resolve', 'The route plan does not use ferry crossing.'],
    [
      'fixed-vs-adaptive',
      'check',
      'The adaptive plan follows ferry crossing; the fixed plan switches to ferry crossing.',
    ],
    [
      'fixed-vs-adaptive',
      'check',
      'The adaptive plan follows ferry crossing; the fixed plan may keep the original route.',
    ],
    ['stop', 'setup', 'The report agent merely mentions a finite token budget.'],
    ['stop', 'action', 'The report agent saves token budget during search.'],
    ['stop', 'action', 'The report agent never spends token budget on search.'],
    ['stop', 'response', 'The token budget is not exhausted.'],
    ['stop', 'response', 'Another budget is exhausted; token budget remains available.'],
    ['stop', 'check', 'The report agent continues search.'],
    ['stop', 'resolve', 'The report agent never remains stopped.'],
    ['request-more', 'check', 'The report agent receives more token budget.'],
    ['request-more', 'check', 'The report agent may request more token budget.'],
    ['request-more', 'resolve', 'The request is approved and the report agent resumes search.'],
    ['request-more', 'resolve', 'The request stays pending but the report agent continues search.'],
    ['train-then-use', 'action', 'Training examples are shown to small model during training.'],
    ['train-then-use', 'action', 'Training on training examples never updates small model.'],
    ['train-then-use', 'action', 'Training on training examples fails to update small model.'],
    [
      'train-then-use',
      'action',
      'Training on other examples updates small model; training examples are mentioned.',
    ],
    ['train-then-use', 'response', 'The small model has not finished training.'],
    ['train-then-use', 'check', 'A different model answers new question during inference.'],
    [
      'train-then-use',
      'check',
      'The small model answers new question during inference and learns from it.',
    ],
    [
      'train-then-use',
      'resolve',
      'The small model stays unchanged during inference but retrains on new question.',
    ],
    ['examples-correction', 'action', 'Training on training examples updates small model.'],
    [
      'examples-correction',
      'action',
      'Corrections are mentioned; training on training examples updates small model.',
    ],
    [
      'same-tests',
      'action',
      'We test draft model and tuned model on different checks: speed and accuracy.',
    ],
    [
      'same-tests',
      'action',
      'We mention draft model and tuned model and test names for the same checks speed and accuracy.',
    ],
    ['same-tests', 'response', 'We mention speed and accuracy for draft model and tuned model.'],
    ['same-tests', 'check', 'We never compare draft model and tuned model on speed and accuracy.'],
    [
      'tradeoffs',
      'response',
      'The draft model mentions speed over accuracy; the tuned model favors accuracy over speed.',
    ],
    [
      'tradeoffs',
      'response',
      'The draft model favors speed over accuracy; the tuned model favors speed over accuracy.',
    ],
    [
      'tradeoffs',
      'response',
      'The draft model may favor speed over accuracy; the tuned model favors accuracy over speed.',
    ],
    [
      'tradeoffs',
      'check',
      'The model comparison proves draft model is the best; tradeoffs are mentioned.',
    ],
    ['unresolved', 'action', 'The city record never says permit is valid.'],
    ['unresolved', 'action', 'The site report says permit is valid.'],
    ['unresolved', 'response', 'The site report says permit is invalid but that claim is false.'],
    ['unresolved', 'check', 'The claims never conflict.'],
    [
      'unresolved',
      'resolve',
      'The permit decision remains unresolved but the city record is proven correct.',
    ],
    [
      'human-review',
      'check',
      'The claims conflict; we refer permit decision to an automated model.',
    ],
    [
      'human-review',
      'check',
      'The claims conflict; we never refer permit decision to a human reviewer.',
    ],
    ['human-review', 'check', 'The claims conflict; we refer another subject to a human reviewer.'],
    ['human-review', 'resolve', 'The permit decision is resolved by the human reviewer.'],
  ];
  it.each(negatives)('rejects unsupported %s %s: %s', (preset, phase, text) =>
    rejected(story(example(preset), { [phase]: text })));

  it('requires contractor roles, not forced construction geometry for an agent team', () => {
    const value = example('parallel-specialists');
    value.preset = 'contractor-crew';
    rejected(story(value));
    const nonTrades = renamed(
      renamed(example('contractor-crew'), 'plumber', 'analyst'),
      'electrician',
      'writer',
    );
    rejected(story(nonTrades));
  });
  it('allows three separately assigned, delivering and reunited roles', () => {
    const value = example('parallel-specialists');
    value.fields.roles = ['analyst', 'writer', 'reviewer'];
    value.clauses.action += ' The coordinator assigns checking to reviewer for launch report.';
    value.clauses.response += ' The reviewer returns results.';
    value.clauses.check =
      'The coordinator combines analyst results and writer results and reviewer results for launch report.';
    expect(parse(story(value)).scene).not.toBeNull();
  });
  it('keeps a request explicitly not granted, never relabeling it as granted', () => {
    const value = example('request-more');
    value.fields.outcome = 'not granted';
    value.clauses.resolve = 'The request is not granted.';
    expect(parse(story(value)).scene?.outcome).toBe('not granted');
    value.fields.outcome = 'granted';
    rejected(story(value));
  });
  it('preserves explicit nonlearning rather than dropping the negation', () => {
    const value = example('train-then-use');
    value.fields.outcome = 'does not learn';
    value.clauses.resolve = 'The small model does not learn during inference.';
    expect(parse(story(value)).scene?.outcome).toBe('does not learn');
    value.fields.outcome = 'learn';
    rejected(story(value));
  });
  it('accepts paired negative claims without declaring either one true', () => {
    const value = renamed(example('human-review'), 'permit is invalid', 'permit is not valid');
    expect(parse(story(value)).scene?.kind).toBe('evidence-conflict');
    value.fields.claims = ['permit is valid', 'valid'];
    rejected(story(value));
  });
  it.each([
    ['permit is valid', 'inspection is invalid'],
    ['permit is valid', 'permit is available'],
    ['permit might be valid', 'permit might be invalid'],
    ['permit is sometimes valid', 'permit is sometimes invalid'],
  ])('rejects distinct but not demonstrably opposite claims: %s / %s', (a, b) => {
    const value = example('unresolved');
    value.fields.claims = [a, b];
    value.clauses.action = `City record says ${a}.`;
    value.clauses.response = `Site report says ${b}.`;
    rejected(story(value));
  });

  it.each(
    examples,
  )('$kind/$preset rejects all missing, invented, nonstring and overlong labels', (value) => {
    const fields = Object.entries(value.fields)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([field]) => field);
    for (const field of fields) {
      for (const bad of [undefined, '', null, 3, {}, 'invented 99% gain', 'x'.repeat(23)]) {
        const input = story(value);
        input.raw[field] = bad;
        rejected(input);
      }
    }
  });
  const listCases: [Preset, string, number][] = [
    ['parallel-specialists', 'roles', 3],
    ['same-tests', 'approaches', 2],
    ['same-tests', 'criteria', 2],
    ['unresolved', 'sources', 2],
    ['unresolved', 'claims', 2],
  ];
  it.each(
    listCases,
  )('%s %s rejects undersized, oversized, duplicate and malformed entries', (preset, field, max) => {
    const value = example(preset);
    const original = value.fields[field] as string[];
    for (const bad of [
      null,
      {},
      [],
      original.slice(0, 1),
      Array(max + 1).fill(original[0]),
      [original[0], original[0].toUpperCase()],
      [original[0], `${original[0]}!`],
      [original[0], undefined],
      [original[0], { label: original[1] }],
      [original[0], 'invented'],
      [original[0], 'x'.repeat(field === 'claims' ? 41 : 23)],
    ]) {
      const input = story(value);
      input.raw[field] = bad;
      rejected(input);
    }
  });
  it('accepts 22-character labels and rejects a source-backed 23rd character', () => {
    for (const length of [22, 23]) {
      const value = renamed(example('parallel-specialists'), 'analyst', 'a'.repeat(length));
      const input = story(value, { setup: `${value.clauses.setup} ${'b'.repeat(length)}.` });
      input.raw.label = 'b'.repeat(length);
      if (length === 22) expect(parse(input).scene).not.toBeNull();
      else rejected(input);
    }
    const value = example('parallel-specialists');
    value.fields.outcome = 'keeps combined results';
    value.clauses.resolve = 'The launch report keeps combined results.';
    expect(String(value.fields.outcome)).toHaveLength(22);
    expect(parse(story(value)).scene).not.toBeNull();
  });
  it('accepts 40-character claims but not 41, even when fully source-backed', () => {
    for (const length of [40, 41]) {
      const prefix = `${'a'.repeat(length - 15)} permit is `;
      const value = example('unresolved');
      value.fields.claims = [`${prefix}open`, `${prefix}shut`];
      value.clauses.action = `City record says ${prefix}open.`;
      value.clauses.response = `Site report says ${prefix}shut.`;
      expect((value.fields.claims as string[])[0]).toHaveLength(length);
      if (length === 40) expect(parse(story(value)).scene).not.toBeNull();
      else rejected(story(value));
    }
  });
  it.each([
    '<svg/>',
    'https://example.com',
    'asset.glb',
    'eval(1)',
    '`code`',
  ])('rejects source-backed executable/asset label %s', (label) => {
    const value = example('stop');
    const input = story(value, { setup: `${value.clauses.setup} ${label}` });
    input.raw.label = label;
    rejected(input);
  });
  it('does not strip numeric sign or invent units in source phrases', () => {
    const value = example('stop');
    const input = story(value, { setup: `${value.clauses.setup} The change is -50%.` });
    input.raw.label = '-50%';
    expect(parse(input).scene?.label).toBe('-50%');
    for (const label of ['50%', '50', '-50 dollars']) {
      input.raw.label = label;
      rejected(input);
    }
  });
  it.each(
    examples,
  )('$kind/$preset rejects non-authored payloads and wrong preset/kind/envelope', (value) => {
    for (const key of [
      'mesh',
      'geometry',
      'position',
      'code',
      'asset',
      'url',
      'score',
      'amount',
      'setupAt',
      'unknown',
    ]) {
      const input = story(value);
      input.raw[key] = {};
      rejected(input);
    }
    for (const [key, bad] of [
      ['preset', 'automatic-success'],
      ['kind', 'flow'],
      ['layout', 'pip'],
      ['startWord', -1],
      ['endWord', 0],
    ]) {
      const input = story(value);
      input.raw[String(key)] = bad;
      rejected(input);
    }
  });
  it.each(PHASES)('requires an explicit integer %sWord', (phase) => {
    for (const bad of [undefined, -1, 10000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
      const input = story(example('stop'));
      input.raw[`${phase}Word`] = bad;
      rejected(input);
    }
  });
  it('rejects reversed, compressed, outside-window and nonfinite source times, including nonbeat words', () => {
    const reverse = story(example('stop'));
    reverse.raw.checkWord = reverse.raw.responseWord;
    rejected(reverse);
    for (const bad of [0, 1.79, 2, 10, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = story(example('stop'));
      input.words[Number(input.raw.responseWord)].start = bad;
      rejected(input);
    }
    const badEnd = story(example('stop'));
    badEnd.words[2].end = Number.NaN;
    rejected(badEnd);
    const badMiddle = story(example('stop'));
    badMiddle.words[2].start = Number.POSITIVE_INFINITY;
    rejected(badMiddle);
    const shortHold = story(example('stop'));
    shortHold.words[Number(shortHold.raw.resolveWord)].start = shortHold.duration - 0.79;
    rejected(shortHold);
    for (const duration of [4.99, 12.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const input = story(example('stop'));
      input.duration = duration;
      rejected(input);
    }
  });
  it('accepts exact timing bounds and a nonzero absolute timeline', () => {
    for (const duration of [5, 12]) {
      const input = story(example('stop'), {}, [0, 0.9, 1.9, 2.9, duration - 0.8], duration);
      expect(parse(input).scene).not.toBeNull();
      const shifted = input.words.map((word) => ({
        ...word,
        start: word.start + 30,
        end: word.end + 30,
      }));
      const ctx = makeParseContext(shifted, {
        startWord: 0,
        endWord: shifted.length - 1,
        startTime: 30,
        endTime: duration + 30,
      });
      const scene = spec(input.kind).parse(input.raw, ctx);
      expect(ctx.issues).toEqual([]);
      expect(scene?.setupAt).toBeCloseTo(30.3);
      expect(scene?.resolveAt).toBeCloseTo(duration + 29.2);
    }
  });
});

describe('cognition through the registered planner and shortlist', () => {
  it.each(
    examples,
  )('$kind/$preset preserves five mapped times, layouts, cues and omitted extras at +30s', (value) => {
    const input = story(value);
    const direct = parse(input).scene;
    expect(direct).not.toBeNull();
    if (!direct) return;
    const shifted = input.words.map((word) => ({
      ...word,
      start: word.start + 30,
      end: word.end + 30,
    }));
    for (const layout of TECHNOLOGY_LAYOUTS) {
      const result = parseExplainerPlan(
        { scenes: [{ ...input.raw, ...EXTRA_PAYLOAD, layout }] },
        shifted,
        { minStart: 0, maxEnd: 90 },
        { emphasisTimes: [33] },
      );
      expect(result).toHaveLength(1);
      const [planned] = result;
      // The shared planner may downgrade takeover for its duration/coverage budget.
      expect(TECHNOLOGY_LAYOUTS).toContain(planned.layout);
      const expected = mapSceneTimes(direct, (time) => time + 30);
      expected.setupAt = Math.max(
        shifted[Number(input.raw.setupWord)].start,
        planned.startTime + 0.3,
      );
      expect(mapSceneTimes(planned.scene, () => 0)).toEqual(mapSceneTimes(expected, () => 0));
      const times = collectSceneTimes(planned.scene);
      expect(times).toHaveLength(5);
      collectSceneTimes(expected).forEach((time, i) => {
        expect(times[i]).toBeCloseTo(time, 9);
      });
      for (const extra of ['pulses', 'overlayStamp', 'dimAt', 'annotation', 'reactions', 'bursts'])
        expect(planned.scene).not.toHaveProperty(extra);
      expect(planned.cues.length).toBeGreaterThan(0);
      expect(
        planned.cues.every(
          (cue) =>
            ['tick', 'flip', 'thump'].includes(cue.kind) &&
            cue.at >= planned.startTime &&
            cue.at <= planned.endTime,
        ),
      ).toBe(true);
      expect(toSceneRelative(planned.scene, planned.startTime)).toEqual(
        mapSceneTimes(expected, (time) =>
          Math.max(0, Math.round((time - planned.startTime) * 1000) / 1000),
        ),
      );
    }
  });
  it.each(examples)('$kind/$preset rejects clipping setup or the protected final hold', (value) => {
    const input = story(value);
    const shifted = input.words.map((word) => ({
      ...word,
      start: word.start + 30,
      end: word.end + 30,
    }));
    expect(
      parseExplainerPlan({ scenes: [input.raw] }, shifted, { minStart: 30.6, maxEnd: 90 }),
    ).toEqual([]);
    expect(
      parseExplainerPlan({ scenes: [input.raw] }, shifted, { minStart: 0, maxEnd: 37.6 }),
    ).toEqual([]);
  });
  it.each(COGNITION_KINDS)('shortlists %s from at least one supported positive source', (kind) => {
    const matches = examples
      .filter((entry) => entry.kind === kind)
      .map((entry) => buildShortlist(story(entry).words));
    expect(
      matches.some(
        (list) => (list.scores[kind] ?? 0) > 0 && list.kinds.some((entry) => entry.kind === kind),
      ),
    ).toBe(true);
  });
  it('does not trigger these stories from plain tool/retrieval/flow mentions', () => {
    const text =
      'The agent calls a tool and checks its result. Retrieval finds documents. A process flows from start to finish.';
    const words = text.split(' ').map((word, i) => ({ text: word, start: i, end: i + 0.8 }));
    const list = buildShortlist(words);
    COGNITION_KINDS.forEach((kind) => {
      expect(list.scores[kind] ?? 0).toBe(0);
    });
  });
});
