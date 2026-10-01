import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PALETTES } from '../../../shared/palettes';
import { deriveExplainerPalette } from '../../remotion/compositions/explainer/palette';
import { agentWorkflowPose } from '../../remotion/compositions/explainer/technology/agent-workflow';
import {
  type AgentWorkflowScene,
  TECHNOLOGY_LIMITS,
} from '../../remotion/compositions/explainer/technology/types';
import type {
  ExplainerLayout,
  ExplainerPalette,
} from '../../remotion/compositions/explainer/types';
import { EXPLAINER_LIMITS, parseExplainerPlan, toSceneRelative } from '../explainer-scenes';
import { makeParseContext, type PlannerWord, type Rec } from './kind-spec';
import { AGENT_WORKFLOW_SPEC } from './kinds-agent-workflow';

const path = 'scripts/explainer-stills/fixtures/technology-boundaries.json';
const phases = ['setup', 'action', 'response', 'check', 'resolve'] as const;
const limits = { label: 32, subject: 24, outcome: 40, toolLabel: 22, condition: 56 } as const;
type LabelField = keyof typeof limits;
interface BoundaryFixture {
  name: string;
  description: string;
  durationSec: number;
  planBounds: { minStart: number; maxEnd: number };
  scene: AgentWorkflowScene;
  raw: Rec;
  words: PlannerWord[];
  sourceText: string;
  cases: {
    name: string;
    layout: ExplainerLayout;
    aspect: '9:16' | '16:9';
    palette?: ExplainerPalette;
  }[];
  samples: { name: string; frame: number }[];
  covers: { category: string; id: string }[];
}
const fixtures: BoundaryFixture[] = JSON.parse(readFileSync(path, 'utf8'));

function direct(value: BoundaryFixture) {
  const ctx = makeParseContext(value.words, {
    startWord: 0,
    endWord: value.words.length - 1,
    startTime: 0,
    endTime: value.durationSec,
  });
  return { scene: AGENT_WORKFLOW_SPEC.parse(value.raw, ctx), ctx };
}

function production(value: BoundaryFixture, layout: ExplainerLayout = 'stack-flipped') {
  // A single example occupies <55% of its clip; normal planner variety rules remain active.
  // Padding, not bounds-clamping, sets the 11.6-second scene window inside the 24-second clip.
  return parseExplainerPlan({ scenes: [{ ...value.raw, layout }] }, value.words, value.planBounds);
}

function maximum(field: LabelField): BoundaryFixture {
  const value = fixtures.find((f) => f.scene[field]?.length === limits[field]);
  if (!value) throw new Error(`Missing maximum ${field} fixture`);
  return structuredClone(value);
}

// The over-limit negative remains a contiguous source phrase with the same word count/timing.
function replaceLabel(value: BoundaryFixture, field: LabelField, replacement: string) {
  const original = value.scene[field];
  if (!original) throw new Error(`Missing ${field}`);
  const tokens = value.sourceText.replaceAll(original, replacement).split(/\s+/);
  expect(tokens).toHaveLength(value.words.length);
  value.words = value.words.map((word, i) => ({ ...word, text: tokens[i] }));
  value.sourceText = tokens.join(' ');
  value.raw[field] = replacement;
}

describe('technology boundary examples', () => {
  it('adds two explicitly authored examples without changing the five three-preset families', () => {
    expect(fixtures).toHaveLength(2);
    expect(new Set(fixtures.map((value) => value.name)).size).toBe(2);
    for (const value of fixtures) {
      expect(value.name).toMatch(/^boundary-/);
      expect(value.description).toContain('not a recorded event');
      expect(value.scene.kind).toBe('agent-workflow');
      expect(['tool-success', 'approval-gate']).toContain(value.scene.preset);
      expect(value.covers).toEqual([
        { category: 'kind', id: 'agent-workflow' },
        { category: 'technology', id: `agent-workflow/${value.scene.preset}` },
      ]);
    }
    for (const family of [
      'agent-workflow',
      'context-window',
      'request-routing',
      'retrieval-grounding',
      'software-release',
    ]) {
      const existing: { name: string }[] = JSON.parse(
        readFileSync(`scripts/explainer-stills/fixtures/technology-${family}.json`, 'utf8'),
      );
      expect(existing).toHaveLength(3);
      for (const value of fixtures) expect(existing.map((f) => f.name)).not.toContain(value.name);
    }
  });

  it('uses the existing render-fixture schema and produces all native cases without rendering', () => {
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { readFileSync } from 'node:fs';
      import { normalizeFixtures, createRenderPlan } from './scripts/explainer-stills/fixture-schema.mjs';
      const fixtures = normalizeFixtures(JSON.parse(readFileSync('${path}', 'utf8')));
      const plan = createRenderPlan(fixtures);
      console.log(JSON.stringify({ fixtures: fixtures.length, cases: plan.length }));
    `,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(result)).toEqual({ fixtures: 2, cases: 4 });
  });

  it.each(
    fixtures,
  )('$name survives direct and full production parsing with exact source metadata', (value) => {
    const { scene, ctx } = direct(value);
    expect(ctx.issues).toEqual([]);
    expect(scene).toEqual(value.scene);
    expect(value.sourceText).toBe(value.words.map((word) => word.text).join(' '));
    expect(value.raw.startWord).toBe(0);
    expect(value.raw.endWord).toBe(value.words.length - 1);
    expect(value.durationSec).toBeGreaterThanOrEqual(5);
    expect(value.durationSec).toBeLessThanOrEqual(12);
    expect(
      value.durationSec / (value.planBounds.maxEnd - value.planBounds.minStart),
    ).toBeLessThanOrEqual(0.55);
    expect(value.cases.map(({ name, layout, aspect }) => ({ name, layout, aspect }))).toEqual([
      { name: 'vertical-stack-flipped', layout: 'stack-flipped', aspect: '9:16' },
      { name: 'landscape-over', layout: 'over', aspect: '16:9' },
    ]);
    for (const variant of value.cases) {
      const parsed = production(value, variant.layout);
      expect(parsed).toHaveLength(1);
      const planned = parsed[0];
      expect(planned.layout).toBe(variant.layout);
      expect(planned.startTime).toBeCloseTo(value.words[0].start - EXPLAINER_LIMITS.leadInSec, 8);
      expect(planned.startTime).toBe(0);
      expect(planned.endTime).toBeCloseTo(
        value.words[value.words.length - 1].end + EXPLAINER_LIMITS.tailSec,
        8,
      );
      expect(planned.endTime - planned.startTime).toBeCloseTo(value.durationSec, 8);
      expect(planned.endTime - value.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
      expect(planned.scene).toEqual(value.scene);
      expect(toSceneRelative(planned.scene, planned.startTime)).toEqual(value.scene);
    }
    for (const [i, phase] of phases.entries()) {
      const wordIndex = value.raw[`${phase}Word`];
      if (typeof wordIndex !== 'number') throw new Error(`Missing ${phase}Word`);
      expect(Number.isInteger(wordIndex)).toBe(true);
      // strictMechanismBeats permits the entrance's existing 0.3-second safe-edge clamp.
      const expectedAt =
        phase === 'setup'
          ? Math.max(0.3, value.words[wordIndex].start)
          : value.words[wordIndex].start;
      expect(expectedAt).toBe(value.scene[`${phase}At`]);
      const next = phases[i + 1];
      if (next)
        expect(value.scene[`${next}At`] - value.scene[`${phase}At`]).toBeGreaterThanOrEqual(
          TECHNOLOGY_LIMITS.minGaps[i],
        );
    }
  });

  it.each([
    'label',
    'subject',
    'outcome',
    'toolLabel',
    'condition',
  ] as const)('retains maximum valid %s without truncation in both parsers', (field) => {
    const value = maximum(field);
    const expected = value.scene[field];
    expect(expected).toHaveLength(limits[field]);
    expect(value.sourceText).toContain(expected);
    const { scene, ctx } = direct(value);
    expect(ctx.issues).toEqual([]);
    expect(scene?.[field]).toBe(expected);
    const parsed = production(value);
    expect(parsed).toHaveLength(1);
    const body = parsed[0].scene;
    if (body.kind !== 'agent-workflow') throw new Error('Wrong production kind');
    expect(body[field]).toBe(expected);
  });

  it.each([
    ['label', 'Quarterly summary reports example'],
    ['subject', 'quarterly overview report'],
    ['outcome', 'agent completes the task for their review'],
    ['toolLabel', 'documents indexing tool'],
    ['condition', 'If this reviewer has access to the current source records'],
  ] as const)('rejects source-backed %s at maximum plus one in both parsers', (field, replacement) => {
    const value = maximum(field);
    expect(replacement).toHaveLength(limits[field] + 1);
    replaceLabel(value, field, replacement);
    expect(value.sourceText).toContain(replacement);
    const { scene, ctx } = direct(value);
    expect(scene).toBeNull();
    expect(ctx.issues.length).toBeGreaterThan(0);
    expect(production(value)).toEqual([]);
  });

  it('retains all 56 condition characters and never certifies the hypothetical approval', () => {
    const value = maximum('condition');
    const parsed = production(value);
    expect(parsed).toHaveLength(1);
    const scene = parsed[0].scene;
    if (scene.kind !== 'agent-workflow') throw new Error('Wrong production kind');
    expect(scene.condition).toBe('If the reviewer has access to the current source records');
    for (let frame = 0; frame < Math.round(value.durationSec * 30); frame++) {
      const pose = agentWorkflowPose(scene, frame / 30);
      expect(pose).toMatchObject({
        conditional: true,
        verified: false,
        completed: false,
        approvalGranted: false,
      });
      expect(pose.toolStatus).not.toBe('passed');
      expect(pose.checkStatus).not.toBe('passed');
    }
    delete value.raw.condition;
    expect(direct(value).scene).toBeNull();
    expect(production(value)).toEqual([]);
  });

  it.each(
    fixtures,
  )('$name has bounded before/on/after evidence for all five beats and a static final hold', (value) => {
    expect(value.samples.length).toBeLessThanOrEqual(32);
    expect(new Set(value.samples.map((s) => s.name)).size).toBe(value.samples.length);
    for (const phase of phases) {
      const on = Math.round(value.scene[`${phase}At`] * 30);
      for (const [suffix, delta] of [
        ['before', -1],
        ['on', 0],
        ['after', 1],
      ] as const) {
        expect(value.samples.find((s) => s.name === `${phase}-${suffix}`)?.frame).toBe(on + delta);
      }
    }
    const final = agentWorkflowPose(value.scene, value.scene.resolveAt);
    for (const sample of value.samples) {
      expect(Number.isInteger(sample.frame)).toBe(true);
      expect(sample.frame).toBeGreaterThanOrEqual(0);
      expect(sample.frame).toBeLessThan(Math.round(value.durationSec * 30));
      if (sample.name.startsWith('final-hold'))
        expect(agentWorkflowPose(value.scene, sample.frame / 30)).toEqual(final);
    }
    expect(value.samples.filter((sample) => sample.name.startsWith('final-hold'))).toHaveLength(2);
    expect(value.durationSec - value.scene.resolveAt).toBeGreaterThanOrEqual(0.8);
  });

  it('uses the actual shipped EZ Coder palette, not an invented seed or palette id', () => {
    const seed = BUILTIN_PALETTES.find((palette) => palette.id === 'ezcoder');
    if (!seed) throw new Error('Missing shipped EZ Coder palette');
    for (const value of fixtures) {
      expect(value.cases[0].palette).toBeUndefined();
      expect(value.cases[1].palette).toEqual(deriveExplainerPalette(seed));
      expect(value.cases[1]).not.toHaveProperty('paletteId');
    }
  });
});
