import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COGNITION_PRESETS } from '../../src/main/remotion/compositions/explainer/cognition/types.ts';
import { luminance } from '../../src/main/remotion/compositions/explainer/palette.ts';
import { SPATIAL_PRESETS } from '../../src/main/remotion/compositions/explainer/spatial/types.ts';
import { TECHNOLOGY_LIMITS } from '../../src/main/remotion/compositions/explainer/technology/types.ts';
import { createRenderPlan, FPS, normalizeFixtures } from './fixture-schema.mjs';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const spatial = load('clay-spatial');
const cognition = load('clay-cognition');
const continuity = load('clay-continuity');
const primary = [...spatial, ...cognition];
const all = [...primary, ...continuity];
const presets = { ...SPATIAL_PRESETS, ...COGNITION_PRESETS };
const beats = ['setupAt', 'actionAt', 'responseAt', 'checkAt', 'resolveAt'];
const pair = ({ scene }) => `${scene.kind}/${scene.preset}`;
const phrase = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Per-kind label fields from the frozen contracts; tuple bounds are array lengths.
const fields = {
  'house-cutaway': { parts: [2, 3] },
  'house-build': { planLabel: null },
  'house-renovation': { partLabel: null },
  'property-access': { allowedLabel: null, restrictedLabel: null },
  neighborhood: { contextLabels: [2, 2] },
  'floorplan-fit': { items: [2, 3] },
  'house-options': { options: [2, 2] },
  'property-lifecycle': { stageLabels: [2, 3] },
  'agent-team': { roles: [2, 3] },
  'agent-plan': { obstacleLabel: null, revisedLabel: null },
  'agent-budget': { resourceLabel: null, actionLabel: null },
  'model-training': { exampleLabel: null, inputLabel: null },
  'model-evaluation': { approaches: [2, 2], criteria: [2, 2] },
  'evidence-conflict': { sources: [2, 2], claims: [2, 2] },
};

function assertLabel(fixture, key, value, max) {
  const where = `${fixture.name}.${key}`;
  assert.equal(typeof value, 'string', where);
  assert.ok(value.length > 0 && value.length <= max, `${where}: 1..${max} characters`);
  assert.equal(value, value.trim(), where);
  assert.doesNotMatch(
    value,
    /https?:|file:|data:|[\\/]|\b(?:TODO|placeholder|lorem ipsum)\b/i,
    where,
  );
  assert.ok(
    ` ${phrase(fixture.sourceText)} `.includes(` ${phrase(value)} `),
    `${where}: must appear as a phrase in the synthetic source`,
  );
}

test('all new files use the existing direct-scene schema with collision-free render plans', () => {
  for (const rows of [spatial, cognition, continuity]) {
    assert.doesNotThrow(() => normalizeFixtures(rows));
  }
  const copy = structuredClone(all);
  const normalized = normalizeFixtures(all);
  const plans = createRenderPlan(normalized);
  assert.deepEqual(all, copy, 'normalization must not mutate fixture data');
  assert.equal(plans.length, 32);
  assert.equal(
    plans.reduce((count, plan) => count + plan.samples.length, 0),
    160,
  );
  for (const [index, plan] of plans.entries()) {
    assert.deepEqual(plan.inputProps.scene, all[index].scene);
    assert.deepEqual(plan.inputProps.palette, all[index].palette);
    assert.equal(plan.composition.durationInFrames, 216);
  }
});

test('exactly one primary fixture covers each of the 14 kinds and 29 frozen presets', () => {
  assert.equal(Object.keys(presets).length, 14);
  assert.equal(primary.length, 29);
  for (const [rows, contract] of [
    [spatial, SPATIAL_PRESETS],
    [cognition, COGNITION_PRESETS],
  ]) {
    const expected = Object.entries(contract).flatMap(([kind, values]) =>
      values.map((preset) => `${kind}/${preset}`),
    );
    assert.deepEqual(rows.map(pair).sort(), expected.sort());
  }
  assert.equal(new Set(primary.map((fixture) => fixture.scene.label)).size, primary.length);
  for (const fixture of primary) {
    assert.equal(fixture.name, `${fixture.scene.kind}-${fixture.scene.preset}`);
    assert.equal(fixture.cases.length, 1, fixture.name);
    assert.deepEqual(
      fixture.covers,
      [
        { category: 'kind', id: fixture.scene.kind },
        { category: 'explanation', id: pair(fixture) },
      ],
      fixture.name,
    );
  }
});

test('finite scene-local beats and setup/main/distinction/final samples stay within the scene', () => {
  for (const fixture of normalizeFixtures(all)) {
    const { scene, samples, durationSec, name } = fixture;
    assert.equal(durationSec, 7.2, name);
    assert.ok(
      durationSec >= TECHNOLOGY_LIMITS.minDuration && durationSec <= TECHNOLOGY_LIMITS.maxDuration,
      name,
    );
    assert.deepEqual(
      beats.map((key) => scene[key]),
      [0.3, 1.5, 3, 4.5, 6],
      name,
    );
    for (const [index, key] of beats.entries()) {
      assert.ok(
        Number.isFinite(scene[key]) && scene[key] >= 0 && scene[key] < durationSec,
        `${name}.${key}`,
      );
      if (index > 0)
        assert.ok(
          scene[key] - scene[beats[index - 1]] >= TECHNOLOGY_LIMITS.minGaps[index - 1],
          `${name}.${key}: spacing`,
        );
    }
    assert.ok(durationSec - scene.resolveAt >= TECHNOLOGY_LIMITS.finalHold, name);
    const times = Object.fromEntries(samples.map(({ name, frame }) => [name, frame / FPS]));
    assert.equal(new Set(samples.map((sample) => sample.frame)).size, samples.length, name);
    for (const sample of samples) {
      assert.ok(Number.isSafeInteger(sample.frame) && Number.isFinite(times[sample.name]), name);
      assert.ok(sample.frame >= 0 && sample.frame < fixture.durationInFrames, name);
    }
    assert.ok(times.setup >= scene.setupAt && times.setup < scene.actionAt, `${name}: setup`);
    assert.ok(times.main >= scene.responseAt && times.main < scene.checkAt, `${name}: main`);
    assert.ok(
      times.distinction >= scene.checkAt && times.distinction < scene.resolveAt,
      `${name}: distinction`,
    );
    assert.ok(
      times['final-hold-start'] > scene.resolveAt,
      `${name}: final hold starts after resolution`,
    );
    assert.ok(
      times['final-hold-end'] > times['final-hold-start'] && times['final-hold-end'] < durationSec,
      `${name}: final hold`,
    );
  }
});

test('scene-specific labels are bounded and grounded in explicitly synthetic source text', () => {
  for (const fixture of all) {
    const { scene, name } = fixture;
    assert.match(fixture.description, /^Synthetic /, name);
    assert.ok(presets[scene.kind]?.includes(scene.preset), name);
    const common = {
      label: TECHNOLOGY_LIMITS.label,
      subject: TECHNOLOGY_LIMITS.subject,
      outcome: TECHNOLOGY_LIMITS.outcome,
    };
    if (scene.condition !== undefined) common.condition = TECHNOLOGY_LIMITS.condition;
    for (const [key, max] of Object.entries(common)) assertLabel(fixture, key, scene[key], max);
    for (const [key, bounds] of Object.entries(fields[scene.kind])) {
      const value = scene[key];
      if (bounds === null) {
        assertLabel(fixture, key, value, TECHNOLOGY_LIMITS.actorLabel);
      } else {
        assert.ok(Array.isArray(value), `${name}.${key}`);
        assert.ok(
          value.length >= bounds[0] && value.length <= bounds[1],
          `${name}.${key}: bounded array`,
        );
        assert.equal(
          new Set(value.map(phrase)).size,
          value.length,
          `${name}.${key}: distinct labels`,
        );
        value.forEach((label, index) => {
          assertLabel(fixture, `${key}[${index}]`, label, TECHNOLOGY_LIMITS.actorLabel);
        });
      }
    }
    // Direct fixtures contain only the frozen story fields: no assets, coordinates or score payloads.
    assert.deepEqual(
      Object.keys(scene).sort(),
      [
        'kind',
        'preset',
        ...beats,
        ...Object.keys(common),
        ...Object.keys(fields[scene.kind]),
      ].sort(),
      name,
    );
  }
  assert.ok(
    primary.some(({ scene }) => scene.label.length === TECHNOLOGY_LIMITS.label),
    'include a maximum-length title',
  );
});

test('all kinds cover stack 9:16 and over 16:9 with contrasting light/dark palette families', () => {
  for (const kind of Object.keys(presets)) {
    const plans = createRenderPlan(
      normalizeFixtures(primary.filter((fixture) => fixture.scene.kind === kind)),
    );
    assert.ok(
      plans.some(
        ({ inputProps: props }) =>
          props.layout === 'stack' &&
          props.aspect === '9:16' &&
          luminance(props.palette.bgOuter) > 0.4,
      ),
      kind,
    );
    assert.ok(
      plans.some(
        ({ inputProps: props }) =>
          props.layout === 'over' &&
          props.aspect === '16:9' &&
          luminance(props.palette.bgOuter) < 0.1,
      ),
      kind,
    );
    assert.ok(new Set(plans.map(({ inputProps }) => inputProps.palette.accent)).size >= 2, kind);
  }
});

test('blocked, financial, comparative and unresolved stories do not acquire invented success', () => {
  const scene = (name) => {
    const fixture = primary.find((fixture) => fixture.name === name);
    assert.ok(fixture, name);
    return fixture.scene;
  };
  assert.match(scene('house-build-plan-mismatch').outcome, /mismatch remains/i);
  assert.match(scene('property-access-revoked-key').outcome, /doors stay closed/i);
  assert.notEqual(
    scene('property-access-scoped-key').allowedLabel,
    scene('property-access-scoped-key').restrictedLabel,
  );
  assert.match(scene('neighborhood-replicate').outcome, /not a count/i);
  assert.match(scene('house-options-compare').outcome, /neither option is selected/i);
  assert.match(scene('house-options-tradeoff').outcome, /tradeoff/i);
  const cash = scene('property-lifecycle-cash-flow');
  assert.deepEqual(cash.stageLabels, ['rental income', 'repair expense']);
  assert.doesNotMatch(
    [cash.label, cash.outcome, ...cash.stageLabels].join(' '),
    /profit|net income|return on investment|[$%\d]/i,
  );
  assert.match(scene('agent-budget-stop').outcome, /no actions after the limit/i);
  assert.match(scene('agent-budget-request-more').outcome, /ungranted/i);
  assert.ok(scene('agent-budget-request-more').condition);
  assert.match(scene('model-training-train-then-use').outcome, /does not retrain/i);
  assert.match(scene('model-evaluation-same-tests').outcome, /no declared winner/i);
  assert.match(scene('model-evaluation-tradeoffs').outcome, /tradeoff/i);
  for (const preset of ['unresolved', 'human-review']) {
    const conflict = scene(`evidence-conflict-${preset}`);
    assert.deepEqual(conflict.claims, ['door is open', 'door is closed']);
    assert.match(conflict.outcome, /unresolved/i);
  }
  assert.match(scene('evidence-conflict-human-review').outcome, /referred to a person/i);
});

test('ordered continuity rows retain the same house, palette and layout across existing fade transitions', () => {
  assert.deepEqual(continuity.map(pair), [
    'agent-team/contractor-crew',
    'property-access/scoped-key',
    'neighborhood/context',
  ]);
  assert.deepEqual(
    continuity.map((fixture) => fixture.name),
    [
      'continuity-maple-house-contractor',
      'continuity-maple-house-access',
      'continuity-maple-house-neighborhood',
    ],
  );
  assert.deepEqual(
    continuity.map((fixture) => fixture.transition),
    ['fade', 'fade', undefined],
  );
  for (const fixture of continuity) {
    assert.equal(fixture.scene.subject, 'Maple house', fixture.name);
    assert.deepEqual(fixture.palette, continuity[0].palette, fixture.name);
    assert.deepEqual(fixture.cases, continuity[0].cases, fixture.name);
    assert.equal(fixture.covers, undefined, 'continuity duplicates do not inflate preset coverage');
  }
  // The normal harness renders these rows independently. The parent owns the opt-in
  // ExplainerSequence renderer; these assertions make no joined-render/transition claim.
  for (const plan of createRenderPlan(normalizeFixtures(continuity))) {
    assert.equal(plan.inputProps.scene.subject, 'Maple house');
    assert.deepEqual(plan.inputProps.palette, continuity[0].palette);
  }
});
