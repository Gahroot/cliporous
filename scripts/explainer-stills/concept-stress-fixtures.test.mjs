import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADAPTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/adaptive/types.ts';
import { BUSINESS_OPERATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-operations/types.ts';
import { BUSINESS_POPULATIONS_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/business-populations/types.ts';
import { INFERENCE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/inference/types.ts';
import { INFORMATION_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/information/types.ts';
import { PERSPECTIVE_PRESETS } from '../../src/main/remotion/compositions/explainer/concepts/perspective/types.ts';
import {
  deriveExplainerPalette,
  luminance,
} from '../../src/main/remotion/compositions/explainer/palette.ts';
import {
  stageCanvasFor,
  stageSafeBox,
} from '../../src/main/remotion/compositions/explainer/types.ts';
import { BUILTIN_PALETTES } from '../../src/shared/palettes.ts';
import { generateConceptStressFixtures } from './concept-stress-fixtures.mjs';
import { createRenderPlan, normalizeFixtures } from './fixture-schema.mjs';

const packs = {
  information: INFORMATION_PRESETS,
  inference: INFERENCE_PRESETS,
  'business-operations': BUSINESS_OPERATIONS_PRESETS,
  'business-populations': BUSINESS_POPULATIONS_PRESETS,
  perspective: PERSPECTIVE_PRESETS,
  adaptive: ADAPTIVE_PRESETS,
};
const sourceBytes = Object.fromEntries(
  Object.keys(packs).map((pack) => [
    `fixtures/concept-${pack}.json`,
    readFileSync(new URL(`fixtures/concept-${pack}.json`, import.meta.url), 'utf8'),
  ]),
);
const sources = Object.fromEntries(
  Object.entries(sourceBytes).map(([file, bytes]) => [file, normalizeFixtures(JSON.parse(bytes))]),
);
const fixtures = generateConceptStressFixtures();

// Independent cap expectations, not copied from the generator's metadata. These deliberately
// distinguish 18-char population names, 16-char token words, 28-char details/sale denominator,
// 32-char token uncertainty, and 40-char perspective qualifiers. Unit strings are enums, not labels.
const expected = {
  'system-layers': { 22: ['layers.*.label'] },
  'semantic-sort': { 22: ['targets.*.label', 'items.*.label'] },
  'information-transform': {
    22: ['resultLabel', 'inputs.*.label', 'inputs.*.field'],
    28: ['inputs.*.detail'],
  },
  'token-choice': {
    16: ['candidates.*.label', 'nextCandidates.*.label'],
    32: ['sentence', 'uncertainty'],
  },
  'expert-selection': {
    22: ['experts.*.label', 'experts.0.contribution', 'experts.1.contribution'],
  },
  'edge-cloud': {
    22: ['localWork', 'localResult', 'remote.service', 'remote.work', 'remote.result'],
  },
  'resource-allocation': { 22: ['projects.*.label'] },
  'market-exchange': { 22: ['seller.label', 'buyer.label', 'product', 'platform.label'] },
  'unit-economics': { 22: ['costs.*.label'], 28: ['saleUnit'] },
  'population-distribution': { 18: ['members.*.label'] },
  'customer-cohort': { 18: ['members.*.label', 'arrivals.*.label', 'startPeriod', 'endPeriod'] },
  'inventory-demand': { 18: ['productLabel', 'stockLabel', 'demandLabel'] },
  'scale-hierarchy': { 22: ['levels.*.label'] },
  'possible-futures': {
    22: ['alternatives.*.label'],
    40: ['alternatives.*.qualifier', 'uncertainty'],
  },
  'digital-twin': { 22: ['physical.label', 'model.label', 'partLabel'], 40: ['qualifier'] },
  'collective-pattern': { 22: ['actors.*.label'] },
  'robot-perception': { 22: ['target.label', 'distractor.label', 'boundaryLabel'] },
  'modular-machine': { 22: ['current.label', 'candidate.label', 'jobLabel'] },
};

const get = (object, path) => path.split('.').reduce((value, part) => value[part], object);
const sourceFor = (fx) =>
  sources[fx.stress.sourceFile].find((base) => base.name === fx.stress.sourceFixture);

function expectedLimits(scene) {
  const limits = { label: 32, subject: 24, outcome: 40 };
  for (const [max, patterns] of Object.entries(expected[scene.kind])) {
    for (const pattern of patterns) {
      const paths = pattern.includes('*')
        ? scene[pattern.split('.')[0]].map((_, index) => pattern.replace('*', String(index)))
        : [pattern];
      for (const path of paths) limits[path] = Number(max);
    }
  }
  return limits;
}

test('one real representative for every one of the existing 18 kinds / 42 presets', () => {
  const presets = Object.assign({}, ...Object.values(packs));
  assert.equal(Object.keys(presets).length, 18);
  assert.equal(Object.values(presets).flat().length, 42);
  assert.equal(Object.values(sources).flat().length, 42);
  assert.equal(fixtures.length, 18);
  assert.equal(new Set(fixtures.map((fx) => fx.scene.kind)).size, 18);
  assert.deepEqual(fixtures.map((fx) => fx.scene.kind).sort(), Object.keys(presets).sort());
  for (const fx of fixtures) {
    const base = sourceFor(fx);
    assert(base, fx.name);
    assert(presets[fx.scene.kind].includes(fx.scene.preset));
    assert.equal(fx.scene.preset, base.scene.preset);
  }
});

for (const kind of Object.keys(expected)) {
  test(`${kind}: exact selected caps; every non-display field and scene shape preserved`, () => {
    const fx = fixtures.find((entry) => entry.scene.kind === kind);
    const base = sourceFor(fx);
    const limits = expectedLimits(base.scene);
    assert.deepEqual(fx.stress.textLimits, limits);
    const restored = structuredClone(fx.scene);
    for (const [path, max] of Object.entries(limits)) {
      const original = get(base.scene, path);
      const value = get(fx.scene, path);
      assert.equal(value.length, max, path);
      assert(value.startsWith(original), `${path}: do not erase original words/numbers`);
      assert.equal(value.trim(), value, `${path}: trailing whitespace is not text stress`);
      const parts = path.split('.');
      const key = parts.pop();
      const parent = parts.reduce((object, part) => object[part], restored);
      parent[key] = original;
    }
    // Deep comparison includes IDs/references, enums/roles/units, numbers/times, evidence phrases,
    // selection booleans, array order/length, counts, quantities and optional-field presence.
    assert.deepEqual(restored, base.scene);
    assert.equal(fx.durationSec, base.durationSec);
    assert.deepEqual(fx.samples, base.samples);
    assert(fx.samples.some((sample) => sample.frame / 30 >= fx.scene.resolveAt));
  });
}

test('layout-only metadata never poses as new planner/transcript or preset coverage evidence', () => {
  for (const fx of fixtures) {
    assert.equal(fx.stress.layoutOnly, true);
    assert.match(fx.description, /LAYOUT-ONLY.*Not transcript\/planner evidence/);
    for (const key of ['plannerInput', 'sourceText', 'sourceBeats', 'storyboard', 'covers']) {
      assert.equal(Object.hasOwn(fx, key), false, key);
    }
    // The 56-character condition cap exists, but none of these real representatives has one.
    // Do not invent an optional condition or claim it was probed.
    assert.equal(Object.hasOwn(fx.scene, 'condition'), false);
  }
});

test('schema-valid native over 16:9 light/dark for all 18, plus shipped palettes/layout samples', () => {
  const normalized = normalizeFixtures(fixtures);
  const plans = createRenderPlan(normalized);
  assert.equal(plans.length, 54);
  const native = plans.filter((plan) => /--over-16x9-(light|dark)-sheet/.test(plan.sheet));
  assert.equal(native.length, 36);
  assert.deepEqual(stageSafeBox('over', '16:9'), { x: 1250, y: 170, width: 610, height: 600 });
  const scale = (layout, aspect) => {
    const box = stageSafeBox(layout, aspect);
    return Math.min(box.width / 1080, box.height / 960);
  };
  for (const plan of plans) {
    const { layout, aspect } = plan.inputProps;
    const { width, height } = stageCanvasFor(layout, aspect);
    assert.equal(plan.composition.width, width);
    assert.equal(plan.composition.height, height);
    assert.equal(plan.composition.fps, 30);
    assert(scale(layout, aspect) >= scale('over', '16:9'));
  }
  for (const fx of normalized) {
    const base = sourceFor(fx);
    for (const [index, mode] of ['light', 'dark'].entries()) {
      const entry = fx.cases[index];
      assert.equal(entry.layout, 'over');
      assert.equal(entry.aspect, '16:9');
      assert.deepEqual(entry.palette, base.cases.find((c) => c.name.includes(mode)).palette);
      assert.equal(luminance(entry.palette.bgOuter) > 0.4, mode === 'light');
    }
    const seed = BUILTIN_PALETTES.find((palette) => palette.id === fx.stress.samplePalette);
    assert.deepEqual(fx.cases[2].palette, deriveExplainerPalette(seed));
  }
  assert.deepEqual(
    new Set(fixtures.map((fx) => fx.stress.samplePalette)),
    new Set(BUILTIN_PALETTES.map((p) => p.id)),
  );
  assert.deepEqual(
    new Set(plans.map((p) => p.inputProps.layout)),
    new Set(['over', 'stack', 'stack-flipped', 'takeover']),
  );
  assert.deepEqual(new Set(plans.map((p) => p.inputProps.aspect)), new Set(['9:16', '16:9']));
});

test('deterministic generation leaves all six existing fixture files byte-for-byte unchanged', () => {
  assert.deepEqual(generateConceptStressFixtures(), fixtures);
  for (const [file, bytes] of Object.entries(sourceBytes)) {
    assert.equal(readFileSync(new URL(file, import.meta.url), 'utf8'), bytes);
  }
});

test('CLI works outside the repo and writes identical valid JSON into a fresh OS temp directory', () => {
  const script = fileURLToPath(new URL('./concept-stress-fixtures.mjs', import.meta.url));
  const file = execFileSync(process.execPath, [script], { cwd: tmpdir(), encoding: 'utf8' }).trim();
  assert.equal(basename(file), 'concept-stress-fixtures.json');
  assert.equal(resolve(dirname(dirname(file))), resolve(tmpdir()));
  assert.match(basename(dirname(file)), /^clay-concept-stress-/);
  try {
    const generated = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(generated, fixtures);
    assert.equal(normalizeFixtures(generated).length, 18);
  } finally {
    rmSync(dirname(file), { recursive: true, force: true });
  }
});
