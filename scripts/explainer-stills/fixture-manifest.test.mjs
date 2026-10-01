import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COGNITION_PRESETS } from '../../src/main/remotion/compositions/explainer/cognition/types.ts';
import { ADAPTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/adaptive/types.ts';
import { BUSINESS_OPERATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-operations/types.ts';
import { BUSINESS_POPULATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-populations/types.ts';
import { INFERENCE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/inference/types.ts';
import { INFORMATION_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/information/types.ts';
import { PERSPECTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/perspective/types.ts';
import { SPATIAL_PRESETS } from '../../src/main/remotion/compositions/explainer/spatial/types.ts';
import { TECHNOLOGY_PRESETS } from '../../src/main/remotion/compositions/explainer/technology/types.ts';
import {
  FIXTURE_MANIFEST,
  fixtureCoverage,
  REQUIRED_TARGET_COUNT,
  targetMatchesScene,
  verificationPlan,
} from './fixture-manifest.mjs';
import { executionCoverage } from './verification-evidence.mjs';
import {
  loadFixtures,
  parseVerificationArgs,
  selectVerificationPlan,
} from './verification-options.mjs';

test('approved deliverables remain exact and unique', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(FIXTURE_MANIFEST).map(([key, ids]) => [key, ids.length])),
    {
      prop: 28,
      treatment: 10,
      kind: 47,
      explanation: 71,
      technology: 15,
      relay: 6,
    },
  );
  for (const ids of Object.values(FIXTURE_MANIFEST)) assert.equal(new Set(ids).size, ids.length);
  assert.equal(REQUIRED_TARGET_COUNT, 177);
  assert.deepEqual(
    FIXTURE_MANIFEST.explanation,
    Object.entries({
      ...SPATIAL_PRESETS,
      ...COGNITION_PRESETS,
      ...INFORMATION_PRESETS,
      ...INFERENCE_PRESETS,
      ...BUSINESS_OPERATIONS_PRESETS,
      ...BUSINESS_POPULATIONS_PRESETS,
      ...PERSPECTIVE_PRESETS,
      ...ADAPTIVE_PRESETS,
    }).flatMap(([kind, presets]) => presets.map((preset) => `${kind}/${preset}`)),
  );
  assert.deepEqual(FIXTURE_MANIFEST.kind.slice(0, 10), [
    'bottleneck',
    'momentum',
    'leverage',
    'resource-leak',
    'feedback-control',
    'exploded-view',
    'keystone',
    'switchyard',
    'synchronization',
    'relay',
  ]);
  assert.deepEqual(
    FIXTURE_MANIFEST.technology,
    Object.entries(TECHNOLOGY_PRESETS).flatMap(([kind, presets]) =>
      presets.map((preset) => `${kind}/${preset}`),
    ),
  );
});

test('all technology presets are selectable in both modes with strict kind/preset coverage', () => {
  for (const mode of ['motion', 'systems']) {
    for (const id of FIXTURE_MANIFEST.technology) {
      const { plan } = selectVerificationPlan(
        parseVerificationArgs(['--select', `technology:${id}`], mode),
        mode,
      );
      const expectedNames = [id.replace('/', '-')];
      if (id === 'agent-workflow/tool-success') {
        expectedNames.push('boundary-agent-workflow-success-labels-max');
      }
      if (id === 'agent-workflow/approval-gate') {
        expectedNames.push('boundary-agent-workflow-approval-condition56');
      }
      if (id.startsWith('software-release/')) {
        expectedNames.push(id.replace('software-release/', 'software-conditional-'));
      }
      assert.deepEqual([...new Set(plan.map((p) => p.fixtureName))].sort(), expectedNames.sort());
      assert(plan.some((p) => p.inputProps.layout === 'stack' && p.inputProps.aspect === '9:16'));
      assert(
        plan.some(
          (p) =>
            p.inputProps.layout === 'over' &&
            p.inputProps.aspect === '16:9' &&
            p.inputProps.palette,
        ),
      );
      assert(
        plan.every((p) => targetMatchesScene({ category: 'technology', id }, p.inputProps.scene)),
      );
    }
  }
});

test('all explanation presets are selectable with valid layout and exact kind/preset coverage', () => {
  for (const mode of ['motion', 'systems']) {
    for (const id of FIXTURE_MANIFEST.explanation) {
      const { plan } = selectVerificationPlan(
        parseVerificationArgs(['--select', `explanation:${id}`], mode),
        mode,
      );
      assert.equal(new Set(plan.map((p) => p.fixtureName)).size, 1);
      assert(plan.some((p) => p.inputProps.layout === 'stack' && p.inputProps.aspect === '9:16'));
      assert(plan.some((p) => p.inputProps.layout === 'over' && p.inputProps.aspect === '16:9'));
      assert(
        plan.every((p) => targetMatchesScene({ category: 'explanation', id }, p.inputProps.scene)),
      );
      const scene = plan[0].inputProps.scene;
      assert.equal(
        targetMatchesScene({ category: 'kind', id: scene.kind }, { ...scene, preset: 'unknown' }),
        false,
      );
    }
  }
});

test('unknown IDs and cross-family or mismatched presets fail closed', () => {
  const fx = loadFixtures(['technology-agent-workflow.json']).fixtures[0];
  for (const id of [
    'agent-workflow/tool-retry',
    'request-routing/cache-hit',
    'agent-workflow/cache-hit',
  ]) {
    const target = { category: 'technology', id };
    assert.equal(targetMatchesScene(target, fx.scene), false);
    assert.throws(
      () => verificationPlan([{ ...fx, covers: [target] }]),
      /unknown coverage|does not match/,
    );
  }
  assert.throws(
    () => verificationPlan([{ ...fx, scene: { ...fx.scene, preset: 'unknown' } }]),
    /does not match/,
  );
});

test('actual declarations cover the full manifest but execute nothing', () => {
  const { fixtures } = loadFixtures();
  const plan = verificationPlan(fixtures.filter((fx) => fx.covers?.length));
  const targets = executionCoverage(plan);
  assert.equal(targets.length, REQUIRED_TARGET_COUNT);
  assert(targets.every((row) => row.declared && !row.criticalFramesExecuted));
  assert(!FIXTURE_MANIFEST.kind.includes('loop'));
  assert(!FIXTURE_MANIFEST.kind.includes('receipt'));
});

test('coverage reports omissions honestly and sorts fixture names', () => {
  const report = fixtureCoverage([
    { name: 'z', covers: [{ category: 'prop', id: 'flywheel' }] },
    { name: 'a', covers: [{ category: 'prop', id: 'flywheel' }] },
  ]);
  assert.deepEqual(report[0], { category: 'prop', id: 'flywheel', fixtures: ['a', 'z'] });
  assert.equal(report.filter((row) => row.fixtures.length === 0).length, REQUIRED_TARGET_COUNT - 1);
  for (const [category, id] of [
    ['prop', '../x'],
    ['constructor', 'x'],
    ['technology', 'request-routing/unknown'],
    ['technology', 'unknown/cache-hit'],
    ['explanation', 'house-build/scoped-key'],
    ['explanation', 'unknown/construct'],
  ]) {
    assert.throws(
      () => fixtureCoverage([{ name: 'bad', covers: [{ category, id }] }]),
      /bad: unknown coverage/,
    );
  }
});
