#!/usr/bin/env node
/** Layout-only text probes. No planner calls, builds, renders, or writes to source fixtures.
 * Run with Node >=22.18: node scripts/explainer-stills/concept-stress-fixtures.mjs
 * Prints the JSON path in a newly created OS temporary directory.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADAPTIVE_LIMITS as A } from '../../src/main/remotion/compositions/explainer/concepts/adaptive/types.ts';
import { BUSINESS_OPERATIONS_LIMITS as B } from '../../src/main/remotion/compositions/explainer/concepts/business-operations/types.ts';
import { BUSINESS_POPULATIONS_LIMITS as D } from '../../src/main/remotion/compositions/explainer/concepts/business-populations/types.ts';
import { INFERENCE_LIMITS as I } from '../../src/main/remotion/compositions/explainer/concepts/inference/types.ts';
import { INFORMATION_LIMITS as F } from '../../src/main/remotion/compositions/explainer/concepts/information/types.ts';
import { PERSPECTIVE_LIMITS as P } from '../../src/main/remotion/compositions/explainer/concepts/perspective/types.ts';
import { deriveExplainerPalette } from '../../src/main/remotion/compositions/explainer/palette.ts';
import { TECHNOLOGY_LIMITS } from '../../src/main/remotion/compositions/explainer/technology/types.ts';
import { BUILTIN_PALETTES } from '../../src/shared/palettes.ts';
import { normalizeFixtures } from './fixture-schema.mjs';

const fields = (max, ...paths) => Object.fromEntries(paths.map((path) => [path, max]));

// [pack, kind, preset, explicit scene paths]. Array indices deliberately match these real fixtures.
// Each concept-*-contract.ts delegates its common story fields to technologyStory (32/24/40/56).
// Family actor limits come from informationLabel, inferenceLabel, businessPhrase, populationLabel,
// localPhrase and adaptiveLabel. The two literal overrides below are in the kind parsers themselves.
export const SELECTIONS = [
  [
    'information',
    'system-layers',
    'business-stack',
    fields(F.actorLabel, 'layers.0.label', 'layers.1.label', 'layers.2.label'),
  ],
  [
    'information',
    'semantic-sort',
    'topic-clusters',
    fields(
      F.actorLabel,
      'targets.0.label',
      'targets.1.label',
      'items.0.label',
      'items.1.label',
      'items.2.label',
    ),
  ],
  [
    'information',
    'information-transform',
    'multimodal-fusion',
    {
      ...fields(
        F.actorLabel,
        'resultLabel',
        'inputs.0.label',
        'inputs.1.label',
        'inputs.2.label',
        'inputs.0.field',
        'inputs.1.field',
        'inputs.2.field',
      ),
      ...fields(F.detail, 'inputs.0.detail', 'inputs.1.detail', 'inputs.2.detail'),
    },
  ],
  [
    'inference',
    'token-choice',
    'uncertain-choice',
    {
      ...fields(I.sentence, 'sentence'),
      ...fields(
        I.word,
        'candidates.0.label',
        'candidates.1.label',
        'candidates.2.label',
        'nextCandidates.0.label',
        'nextCandidates.1.label',
      ),
      // kinds-concept-inference.ts: parseTokenChoice calls inferenceLabel(raw.uncertainty, ctx, 32).
      ...fields(32, 'uncertainty'),
    },
  ],
  [
    'inference',
    'expert-selection',
    'specialist-team',
    fields(
      I.actor,
      'experts.0.label',
      'experts.1.label',
      'experts.2.label',
      'experts.0.contribution',
      'experts.1.contribution',
    ),
  ],
  [
    'inference',
    'edge-cloud',
    'split-processing',
    fields(I.actor, 'localWork', 'localResult', 'remote.service', 'remote.work', 'remote.result'),
  ],
  [
    'business-operations',
    'resource-allocation',
    'constrained-projects',
    fields(B.actorLabel, 'projects.0.label', 'projects.1.label'),
  ],
  [
    'business-operations',
    'market-exchange',
    'platform-fee',
    fields(B.actorLabel, 'seller.label', 'buyer.label', 'product', 'platform.label'),
  ],
  [
    'business-operations',
    'unit-economics',
    'negative-margin',
    {
      ...fields(B.actorLabel, 'costs.0.label', 'costs.1.label'),
      // kinds-concept-business-operations.ts: parseUnitEconomics uses businessPhrase(..., ctx, 28).
      ...fields(28, 'saleUnit'),
    },
  ],
  [
    'business-populations',
    'population-distribution',
    'average-hides-tail',
    fields(D.actorLabel, 'members.0.label', 'members.1.label', 'members.2.label'),
  ],
  [
    'business-populations',
    'customer-cohort',
    'retention',
    {
      ...fields(D.actorLabel, 'members.0.label', 'members.1.label', 'arrivals.0.label'),
      ...fields(D.periodLabel, 'startPeriod', 'endPeriod'),
    },
  ],
  [
    'business-populations',
    'inventory-demand',
    'shortage',
    fields(D.actorLabel, 'productLabel', 'stockLabel', 'demandLabel'),
  ],
  [
    'perspective',
    'scale-hierarchy',
    'chip-to-center',
    fields(P.actorLabel, 'levels.0.label', 'levels.1.label', 'levels.2.label'),
  ],
  [
    'perspective',
    'possible-futures',
    'branching-scenarios',
    {
      ...fields(
        P.actorLabel,
        'alternatives.0.label',
        'alternatives.1.label',
        'alternatives.2.label',
      ),
      ...fields(
        P.qualifier,
        'alternatives.0.qualifier',
        'alternatives.1.qualifier',
        'alternatives.2.qualifier',
        'uncertainty',
      ),
    },
  ],
  [
    'perspective',
    'digital-twin',
    'simulated-change',
    {
      ...fields(P.actorLabel, 'physical.label', 'model.label', 'partLabel'),
      ...fields(P.qualifier, 'qualifier'),
    },
  ],
  [
    'adaptive',
    'collective-pattern',
    'network-clusters',
    fields(A.actorLabel, 'actors.0.label', 'actors.1.label', 'actors.2.label', 'actors.3.label'),
  ],
  [
    'adaptive',
    'robot-perception',
    'uncertain-target',
    fields(A.actorLabel, 'target.label', 'distractor.label', 'boundaryLabel'),
  ],
  [
    'adaptive',
    'modular-machine',
    'incompatible-module',
    fields(A.actorLabel, 'current.label', 'candidate.label', 'jobLabel'),
  ],
];

// A library-wide sampler, NOT a palette × kind × layout Cartesian-product claim.
const LAYOUT_SAMPLES = [
  ['stack', '9:16'],
  ['stack-flipped', '9:16'],
  ['takeover', '9:16'],
  ['takeover', '16:9'],
  ['over', '9:16'],
];

function lengthen(value, max, path) {
  assert(typeof value === 'string' && value.length > 0, `Missing display label: ${path}`);
  assert(value.length <= max, `${path} already exceeds its contract limit ${max}`);
  const remaining = max - value.length;
  // Keep the original prefix (including numbers and recognizable product names). Wide ASCII
  // filler probes wrapping at exactly the character cap, not a font's theoretical widest glyphs.
  const suffix = ' WIDE WORDS'.repeat(Math.ceil(remaining / 11)).slice(0, remaining);
  return value + suffix.replace(/ $/, 'W');
}

export function generateConceptStressFixtures() {
  const packs = new Map();
  const fixtures = SELECTIONS.map(([pack, kind, preset, extraFields], index) => {
    const sourceFile = `fixtures/concept-${pack}.json`;
    if (!packs.has(pack)) {
      packs.set(
        pack,
        normalizeFixtures(JSON.parse(readFileSync(new URL(sourceFile, import.meta.url), 'utf8'))),
      );
    }
    const base = packs.get(pack).find((fx) => fx.name === `${kind}-${preset}`);
    assert(
      base && base.scene.kind === kind && base.scene.preset === preset,
      `Missing ${kind}/${preset}`,
    );
    const scene = structuredClone(base.scene);
    const textLimits = {
      label: TECHNOLOGY_LIMITS.label,
      subject: TECHNOLOGY_LIMITS.subject,
      outcome: TECHNOLOGY_LIMITS.outcome,
      ...extraFields,
      ...(scene.condition === undefined ? {} : { condition: TECHNOLOGY_LIMITS.condition }),
    };
    for (const [path, max] of Object.entries(textLimits)) {
      const parts = path.split('.');
      const key = parts.pop();
      const parent = parts.reduce((value, part) => value?.[part], scene);
      assert(parent && Object.hasOwn(parent, key), `Missing explicit scene path: ${kind}.${path}`);
      parent[key] = lengthen(parent[key], max, `${kind}.${path}`);
    }
    // Reuse the fixture's actual full light/dark palettes, resolving case inheritance first.
    const cases = ['light', 'dark'].map((mode) => {
      const palette = base.cases.find((entry) => entry.name.includes(mode))?.palette;
      assert(palette, `${base.name}: no existing ${mode} palette`);
      return {
        name: `over-16x9-${mode}`,
        layout: 'over',
        aspect: '16:9',
        palette: structuredClone(palette),
      };
    });
    const seed = BUILTIN_PALETTES[index % BUILTIN_PALETTES.length];
    const [layout, aspect] = LAYOUT_SAMPLES[index % LAYOUT_SAMPLES.length];
    cases.push({
      name: `sample-${seed.id}-${layout}-${aspect.replace(':', 'x')}`,
      layout,
      aspect,
      palette: deriveExplainerPalette(seed),
    });
    return {
      name: `${kind}-max-text`,
      description:
        'LAYOUT-ONLY maximum-length display text. Not transcript/planner evidence. Retained scene evidence belongs only to the original fixture; synthetic suffixes are not source claims.',
      stress: {
        layoutOnly: true,
        sourceFile,
        sourceFixture: base.name,
        textLimits,
        samplePalette: seed.id,
      },
      durationSec: base.durationSec,
      scene,
      samples: structuredClone(base.samples),
      cases,
    };
  });
  // Validates case palettes, durations, native dimensions, frames, names and output collisions.
  // The fixture schema deliberately does NOT validate scene semantics or source grounding.
  normalizeFixtures(fixtures);
  return fixtures;
}

export function writeConceptStressFixtures() {
  const fixtures = generateConceptStressFixtures();
  const directory = mkdtempSync(join(tmpdir(), 'clay-concept-stress-'));
  const file = join(directory, 'concept-stress-fixtures.json');
  writeFileSync(file, `${JSON.stringify(fixtures, null, 2)}\n`, { flag: 'wx' });
  return file;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(
    process.argv.length,
    2,
    'Usage: node scripts/explainer-stills/concept-stress-fixtures.mjs',
  );
  console.log(writeConceptStressFixtures());
}
