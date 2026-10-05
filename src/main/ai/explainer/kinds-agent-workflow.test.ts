import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentWorkflowPose } from '../../remotion/compositions/explainer/technology/agent-workflow';
import type { AgentWorkflowScene } from '../../remotion/compositions/explainer/technology/types';
import { makeParseContext, type ParseContext, type PlannerWord, type Rec } from './kind-spec';
import { AGENT_WORKFLOW_SPEC } from './kinds-agent-workflow';

type Preset = AgentWorkflowScene['preset'];
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
type Phase = (typeof phases)[number];
interface Fixture {
  name: string;
  durationSec: number;
  sourceText: string;
  raw: Rec;
  words: PlannerWord[];
  scene: AgentWorkflowScene;
  cases: { name: string; layout: string; aspect: string }[];
  covers: { category: string; id: string }[];
  samples: { name: string; frame: number }[];
}
const fixtures: Fixture[] = JSON.parse(
  readFileSync('scripts/explainer-stills/fixtures/technology-agent-workflow.json', 'utf8'),
);

function fixture(preset: Preset): Fixture {
  const value = fixtures.find((item) => item.scene.preset === preset);
  if (!value) throw new Error(`Missing fixture ${preset}`);
  return structuredClone(value);
}

function index(raw: Rec, field: string): number {
  const value = raw[field];
  if (typeof value !== 'number') throw new Error(`Missing ${field}`);
  return value;
}

function parse(value: Fixture): { scene: AgentWorkflowScene | null; ctx: ParseContext } {
  const ctx = makeParseContext(value.words, {
    startWord: 0,
    endWord: value.words.length - 1,
    startTime: 0,
    endTime: value.durationSec,
  });
  return { scene: AGENT_WORKFLOW_SPEC.parse(value.raw, ctx), ctx };
}

/** Re-time edited transcript clauses, never bypass the actual word-index parser. */
function story(preset: Preset, changes: Partial<Record<Phase, string>> = {}): Fixture {
  const value = fixture(preset);
  const original = value.words;
  const originalRaw = { ...value.raw };
  value.words = [];
  for (const [n, phase] of phases.entries()) {
    const from = index(originalRaw, `${phase}Word`);
    const to = phases[n + 1] ? index(originalRaw, `${phases[n + 1]}Word`) : original.length;
    const tokens = (
      changes[phase] ??
      original
        .slice(from, to)
        .map((word) => word.text)
        .join(' ')
    ).split(/\s+/);
    const at = value.scene[`${phase}At`];
    const next = phases[n + 1];
    const end = next ? value.scene[`${next}At`] : value.durationSec;
    value.raw[`${phase}Word`] = value.words.length;
    tokens.forEach((text, i) => {
      value.words.push({
        text,
        start: at + ((end - at - 0.08) * i) / tokens.length,
        end: at + ((end - at - 0.08) * (i + 1)) / tokens.length,
      });
    });
  }
  value.raw.endWord = value.words.length - 1;
  value.sourceText = value.words.map((word) => word.text).join(' ');
  return value;
}

describe('agent-workflow source contracts and render fixtures', () => {
  it.each([
    'diagram',
    'hybrid',
  ] as const)('approval-gate %s is opt-in without changing grant or completion evidence', (visualMode) => {
    const original = fixture('approval-gate');
    const opted = parse({ ...original, raw: { ...original.raw, visualMode } });
    expect(opted.ctx.issues).toEqual([]);
    expect(opted.scene).toEqual({ ...original.scene, visualMode });
    for (const change of [
      { check: 'Human approval is pending.' },
      { check: 'The agent approved the task.' },
      { resolve: 'The agent might complete the task.' },
    ]) {
      const unsupported = story('approval-gate', change);
      const result = parse({ ...unsupported, raw: { ...unsupported.raw, visualMode } });
      expect(result.scene).toBeNull();
      expect(result.ctx.issues.length).toBeGreaterThan(0);
    }
  });
  it('keeps all historical omission defaults and rejects unsupported mode/preset combinations', () => {
    for (const item of fixtures) expect(parse(item).scene).toEqual(item.scene);
    for (const preset of ['tool-success', 'tool-retry'] as const) {
      const original = fixture(preset);
      expect(
        parse({ ...original, raw: { ...original.raw, visualMode: 'diagram' } }).scene,
      ).toBeNull();
    }
    const gate = fixture('approval-gate');
    expect(parse({ ...gate, raw: { ...gate.raw, visualMode: 'arbitrary' } }).scene).toBeNull();
  });
  it.each(fixtures)('$name is the real indexed parser result', (value) => {
    const { scene, ctx } = parse(value);
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual(value.scene);
    expect(value.sourceText).toBe(value.words.map((word) => word.text).join(' '));
    expect(value.raw.endWord).toBe(value.words.length - 1);
    expect(value.name).toBe(`agent-workflow-${value.scene.preset}`);
    expect(value.durationSec).toBeGreaterThanOrEqual(5);
    expect(value.durationSec).toBeLessThanOrEqual(12);
    expect(value.durationSec - value.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
    expect(value.cases).toEqual([
      { name: 'vertical-stack', layout: 'stack', aspect: '9:16' },
      { name: 'landscape-over', layout: 'over', aspect: '16:9' },
    ]);
    expect(value.covers).toEqual([
      { category: 'kind', id: 'agent-workflow' },
      { category: 'technology', id: `agent-workflow/${value.scene.preset}` },
    ]);
    for (const contact of ['call', 'response', 'check', 'resolve']) {
      expect(value.samples.map((sample) => sample.name)).toEqual(
        expect.arrayContaining([`${contact}-before`, contact, `${contact}-after`]),
      );
    }
    expect(
      value.samples.every((sample) => sample.frame >= 0 && sample.frame < value.durationSec * 30),
    ).toBe(true);
  });

  it('has sparse existing contact/validation cues, never speculative success before validation', () => {
    for (const value of fixtures) {
      const cues = AGENT_WORKFLOW_SPEC.cues(value.scene);
      expect(cues.length).toBeLessThanOrEqual(5);
      expect(cues[0].at).toBe(value.scene.actionAt);
      expect(cues.at(-1)?.at).toBe(value.scene.resolveAt);
      expect(
        cues.every(
          (cue) =>
            ['tick', 'thump', 'flip'].includes(cue.kind) &&
            cue.at >= value.scene.actionAt &&
            cue.at <= value.scene.resolveAt,
        ),
      ).toBe(true);
    }
    expect(AGENT_WORKFLOW_SPEC.layouts).toEqual(['stack', 'stack-flipped', 'takeover', 'over']);
  });

  const rejects: [Preset, Phase, string][] = [
    ['tool-success', 'setup', 'A person receives a report task.'],
    ['tool-success', 'setup', 'An agent never receives a report task.'],
    ['tool-success', 'action', 'The agent mentions the lookup tool.'],
    ['tool-success', 'action', 'The agent calls the lookup tool for another task.'],
    ['tool-success', 'action', 'The agent calls the lookup tool for a different report task.'],
    ['tool-success', 'action', 'The person calls the lookup tool.'],
    ['tool-success', 'action', 'The agent never calls the lookup tool.'],
    ['tool-success', 'action', 'The agent plans to call the lookup tool.'],
    ['tool-success', 'response', 'Another tool returns a result.'],
    ['tool-success', 'response', 'The lookup tool never returns a result.'],
    ['tool-success', 'response', 'The lookup tool returns no result.'],
    ['tool-success', 'response', 'The lookup tool returns a result but the call fails.'],
    ['tool-success', 'check', 'The agent mentions the result; the result passes the check.'],
    ['tool-success', 'check', 'The agent checks the result; the result never passes the check.'],
    ['tool-success', 'check', 'The agent checks the result; the result fails the check.'],
    ['tool-success', 'resolve', 'The agent never completes the report task.'],
    ['tool-success', 'resolve', 'The person completes the report task.'],
    [
      'tool-success',
      'resolve',
      'The agent completes another task. The report task remains waiting.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent proposes a retry; the lookup tool returns a result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent never retries the lookup tool; the lookup tool returns a result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent retries the lookup tool unsuccessfully; the lookup tool returns a result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent retries the lookup tool; the retry fails; the lookup tool returns a result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent retries the lookup tool; the lookup tool returns no result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call never fails; the agent retries the lookup tool; the lookup tool returns a result.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the lookup tool returns a result; the agent retries the lookup tool.',
    ],
    [
      'tool-retry',
      'response',
      'The first call fails; the agent retries a different tool; the lookup tool returns a result.',
    ],
    ['tool-retry', 'check', 'The agent checks the result; the returned result fails the check.'],
    [
      'approval-gate',
      'response',
      'The lookup tool returns a result; the task waits for human approval; the agent checks the result; the result passes the check.',
    ],
    [
      'approval-gate',
      'response',
      'The lookup tool returns a result; the agent checks the result; the agent requests human approval; the result passes the check.',
    ],
    ['approval-gate', 'check', 'The person requests approval for the task.'],
    ['approval-gate', 'check', 'The person denies approval for the task.'],
    ['approval-gate', 'check', 'The person never approves the task.'],
    ['approval-gate', 'check', 'The person has not approved the task.'],
    ['approval-gate', 'check', 'The person may approve the task.'],
    ['approval-gate', 'check', 'The agent approves the task.'],
    ['approval-gate', 'check', 'The person approves another task.'],
    ['approval-gate', 'check', 'The person approves the task but approval is denied.'],
    ['approval-gate', 'check', 'The person approves the result but rejects the task.'],
    [
      'approval-gate',
      'response',
      'The lookup tool returns a result; the agent checks the result; the result passes the check.',
    ],
  ];
  it.each(rejects)('rejects unsupported %s %s: %s', (preset, phase, text) => {
    const { scene, ctx } = parse(story(preset, { [phase]: text }));
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
  });

  it('keeps first-call failure local; a later actual retry is allowed', () => {
    const { scene, ctx } = parse(fixture('tool-retry'));
    expect(scene?.preset).toBe('tool-retry');
    expect(ctx.issues).toEqual([]);
  });

  it.each([
    'tool-success',
    'tool-retry',
    'approval-gate',
  ] as const)('retains the complete condition without verified marks: %s', (preset) => {
    const value = story(preset, {
      setup: 'If access is available, an agent receives a report task.',
    });
    expect(parse(value).scene).toBeNull();
    value.raw.condition = 'If access is available';
    const { scene, ctx } = parse(value);
    expect(ctx.issues).toEqual([]);
    expect(scene?.condition).toBe('If access is available');
    if (!scene) throw new Error('Expected supported conditional scene');
    const final = agentWorkflowPose(scene, scene.resolveAt + 1);
    expect(final).toMatchObject({
      conditional: true,
      verified: false,
      completed: false,
      approvalGranted: false,
      outcomeOpacity: 1,
    });
    expect(final.toolStatus).not.toBe('passed');
    expect(final.checkStatus).not.toBe('passed');
    value.raw.condition = 'If access';
    expect(parse(value).scene).toBeNull();
  });

  it.each([
    'label',
    'subject',
    'outcome',
    'toolLabel',
    'condition',
  ])('rejects invented %s', (field) => {
    const value = fixture('tool-success');
    value.raw[field] = 'invented 99% fact';
    expect(parse(value).scene).toBeNull();
  });

  it.each([
    'label',
    'subject',
    'outcome',
    'toolLabel',
    'condition',
  ])('rejects overlong %s', (field) => {
    const value = fixture('tool-success');
    value.raw[field] = 'a'.repeat(80);
    expect(parse(value).scene).toBeNull();
  });

  it('rejects markup and URLs even if present in the source', () => {
    for (const label of ['<svg/>', 'https://example.com']) {
      const value = story('tool-success', { setup: `An agent receives a report task. ${label}` });
      value.raw.label = label;
      expect(parse(value).scene).toBeNull();
    }
  });

  it('rejects an unknown preset and missing tool', () => {
    const value = fixture('tool-success');
    value.raw.preset = 'automatic-approval';
    expect(parse(value).scene).toBeNull();
    value.raw.preset = 'tool-success';
    delete value.raw.toolLabel;
    expect(parse(value).scene).toBeNull();
  });

  it.each(phases)('requires an explicit valid %sWord', (phase) => {
    for (const invalid of [undefined, -1, 10000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const value = fixture('tool-success');
      value.raw[`${phase}Word`] = invalid;
      expect(parse(value).scene).toBeNull();
    }
  });

  it('rejects reversed, compressed, nonfinite beats and insufficient final hold', () => {
    const reversed = fixture('tool-success');
    reversed.raw.checkWord = reversed.raw.responseWord;
    expect(parse(reversed).scene).toBeNull();
    const compressed = fixture('tool-success');
    compressed.words[index(compressed.raw, 'checkWord')].start = compressed.scene.responseAt + 0.99;
    expect(parse(compressed).scene).toBeNull();
    for (const badTime of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const invalid = fixture('tool-success');
      invalid.words[index(invalid.raw, 'actionWord')].start = badTime;
      expect(parse(invalid).scene).toBeNull();
    }
    const badEnd = fixture('tool-success');
    badEnd.words[2].end = Number.NaN;
    expect(parse(badEnd).scene).toBeNull();
    const shortHold = fixture('tool-success');
    shortHold.words[index(shortHold.raw, 'resolveWord')].start = shortHold.durationSec - 0.79;
    expect(parse(shortHold).scene).toBeNull();
    for (const duration of [4.99, 12.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid = fixture('tool-success');
      invalid.durationSec = duration;
      expect(parse(invalid).scene).toBeNull();
    }
  });

  it('keeps nonzero source timestamps absolute without clamping or rebasing claims', () => {
    const value = fixture('tool-retry');
    const shift = 37;
    const ctx = makeParseContext(
      value.words.map((w) => ({ ...w, start: w.start + shift, end: w.end + shift })),
      {
        startWord: 0,
        endWord: value.words.length - 1,
        startTime: shift,
        endTime: value.durationSec + shift,
      },
    );
    const expected = { ...value.scene };
    for (const phase of phases) expected[`${phase}At`] += shift;
    expect(AGENT_WORKFLOW_SPEC.parse(value.raw, ctx)).toEqual(expected);
    expect(ctx.issues).toEqual([]);
  });
});
