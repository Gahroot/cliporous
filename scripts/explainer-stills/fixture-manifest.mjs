/** Approved deliverable matrix, not a list of implemented renderers. */
import { HERO_CATALOG } from '../../src/main/remotion/compositions/explainer/hero-catalog.ts';
import { stageCanvasFor } from '../../src/main/remotion/compositions/explainer/types.ts';
import { createRenderPlan, normalizeFixtures } from './fixture-schema.mjs';
import { digest } from './harness-runtime.mjs';
export const FIXTURE_MANIFEST = {
  prop: [
    'flywheel',
    'lever',
    'pulley',
    'spring',
    'ratchet',
    'conveyor',
    'valve',
    'pressure-gauge',
    'rail-switch',
    'prism',
    'aperture',
    'magnifying-glass',
    'telescope',
    'bridge',
    'arch',
    'vault',
    'wallet',
    'card-reader',
    'calculator',
    'parcel',
    'filing-cabinet',
    'reservoir',
    'microphone',
    'camera',
    'clapperboard',
    'metronome',
    'watering-can',
    'wrench',
  ],
  treatment: [
    'letterpress',
    'embossed',
    'peel-back',
    'redaction',
    'magnified-inset',
    'tracked-callout',
    'measurement',
    'focus-isolation',
    'mechanical-number',
    'semantic-text',
  ],
  kind: [
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
    'agent-workflow',
    'retrieval-grounding',
    'context-window',
    'software-release',
    'request-routing',
    'house-cutaway',
    'house-build',
    'house-renovation',
    'property-access',
    'neighborhood',
    'floorplan-fit',
    'house-options',
    'property-lifecycle',
    'agent-team',
    'agent-plan',
    'agent-budget',
    'model-training',
    'model-evaluation',
    'evidence-conflict',
    'system-layers',
    'semantic-sort',
    'information-transform',
    'token-choice',
    'expert-selection',
    'edge-cloud',
    'resource-allocation',
    'market-exchange',
    'unit-economics',
    'population-distribution',
    'customer-cohort',
    'inventory-demand',
    'scale-hierarchy',
    'possible-futures',
    'digital-twin',
    'collective-pattern',
    'robot-perception',
    'modular-machine',
  ],
  explanation: [
    'house-cutaway/rooms',
    'house-cutaway/utilities',
    'house-build/construct',
    'house-build/plan-mismatch',
    'house-renovation/cosmetic',
    'house-renovation/structural',
    'property-access/scoped-key',
    'property-access/revoked-key',
    'neighborhood/replicate',
    'neighborhood/context',
    'floorplan-fit/fits',
    'floorplan-fit/rearrange',
    'house-options/compare',
    'house-options/tradeoff',
    'property-lifecycle/occupancy',
    'property-lifecycle/maintenance',
    'property-lifecycle/cash-flow',
    'agent-team/parallel-specialists',
    'agent-team/contractor-crew',
    'agent-plan/replan',
    'agent-plan/fixed-vs-adaptive',
    'agent-budget/stop',
    'agent-budget/request-more',
    'model-training/train-then-use',
    'model-training/examples-correction',
    'model-evaluation/same-tests',
    'model-evaluation/tradeoffs',
    'evidence-conflict/unresolved',
    'evidence-conflict/human-review',
    'system-layers/business-stack',
    'system-layers/device-stack',
    'semantic-sort/topic-clusters',
    'semantic-sort/closest-match',
    'semantic-sort/skill-match',
    'information-transform/structured-report',
    'information-transform/multimodal-fusion',
    'token-choice/next-token',
    'token-choice/uncertain-choice',
    'expert-selection/single-specialist',
    'expert-selection/specialist-team',
    'edge-cloud/local-processing',
    'edge-cloud/split-processing',
    'resource-allocation/reallocate',
    'resource-allocation/constrained-projects',
    'market-exchange/direct-sale',
    'market-exchange/platform-fee',
    'market-exchange/unmatched-market',
    'unit-economics/positive-margin',
    'unit-economics/break-even',
    'unit-economics/negative-margin',
    'population-distribution/customer-concentration',
    'population-distribution/workload-spread',
    'population-distribution/average-hides-tail',
    'customer-cohort/retention',
    'customer-cohort/churn',
    'inventory-demand/surplus',
    'inventory-demand/shortage',
    'inventory-demand/balanced',
    'scale-hierarchy/chip-to-center',
    'scale-hierarchy/customer-to-market',
    'possible-futures/branching-scenarios',
    'possible-futures/forecast-range',
    'digital-twin/mirror-state',
    'digital-twin/simulated-change',
    'collective-pattern/network-clusters',
    'collective-pattern/adoption-wave',
    'collective-pattern/coordinated-swarm',
    'robot-perception/recognized-target',
    'robot-perception/uncertain-target',
    'modular-machine/reconfigure',
    'modular-machine/incompatible-module',
  ],
  technology: [
    'agent-workflow/tool-success',
    'agent-workflow/tool-retry',
    'agent-workflow/approval-gate',
    'retrieval-grounding/evidence-found',
    'retrieval-grounding/no-evidence',
    'retrieval-grounding/two-sources',
    'context-window/overflow',
    'context-window/summarisation',
    'context-window/memory-retrieval',
    'software-release/fix-pass',
    'software-release/regression-rollback',
    'software-release/parallel-release',
    'request-routing/cache-hit',
    'request-routing/cache-miss',
    'request-routing/timeout-fallback',
  ],
  relay: [
    'unlock',
    'nurture',
    'attract-process',
    'power-insight',
    'complete-system',
    'idea-process-result',
  ],
};

export const REQUIRED_TARGET_COUNT = Object.values(FIXTURE_MANIFEST).flat().length;

/** Fixture declarations are coverage intentions; only render reports prove execution. */
export function fixtureCoverage(fixtures) {
  const found = new Map();
  for (const fixture of fixtures) {
    for (const entry of fixture.covers ?? []) {
      if (
        !entry ||
        !Object.hasOwn(FIXTURE_MANIFEST, entry.category) ||
        !FIXTURE_MANIFEST[entry.category].includes(entry.id)
      ) {
        throw new Error(`${fixture.name}: unknown coverage target ${JSON.stringify(entry)}`);
      }
      const key = `${entry.category}:${entry.id}`;
      const names = found.get(key) ?? [];
      names.push(fixture.name);
      found.set(key, names);
    }
  }
  return Object.entries(FIXTURE_MANIFEST).flatMap(([category, ids]) =>
    ids.map((id) => ({
      category,
      id,
      fixtures: [...new Set(found.get(`${category}:${id}`) ?? [])].sort(),
    })),
  );
}

/** Deliberately contrasting second palette; full production palette shape, not a seed. */
export const CONTRAST_PALETTE = Object.freeze({
  bgOuter: '#e6ece8',
  bgInner: '#fafcf9',
  card: '#ffffff',
  cardRaised: '#eaf1ec',
  cardBorder: '#a7b8ad',
  text: '#16291f',
  muted: '#51685b',
  accent: '#216950',
  accent2: '#bd641f',
  accentSoft: '#d8eadd',
  positive: '#267747',
  negative: '#a32c3b',
  paper: '#fff9ee',
  paperText: '#241c13',
  clay: ['#77ae8c', '#ebbf82', '#afbbc9'],
});

/** Every numeric input must be finite; timestamp fields must remain inside the explicit scene span. */
export function sceneBeats(scene, durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0)
    throw new Error('durationSec must be finite and positive');
  const beats = [];
  const visit = (value, key, at) => {
    const isTime = key === 'at' || key.endsWith('At');
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error(`${at}: non-finite input`);
    if (isTime) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value >= durationSec
      ) {
        throw new Error(`${at}: beat must be finite and in [0, ${durationSec})`);
      }
      beats.push({ name: at, at: value });
    } else if (value && typeof value === 'object') {
      for (const [child, nested] of Object.entries(value)) visit(nested, child, `${at}.${child}`);
    }
  };
  visit(scene, 'scene', 'scene');
  if (scene.kind === 'hero') {
    const info = HERO_CATALOG[scene.prop];
    const impact = scene.tone === 'down' ? info?.downImpactSec : info?.impactSec;
    if (!Number.isFinite(impact))
      throw new Error(`${scene.prop}: missing catalog impact for tone ${scene.tone ?? 'up'}`);
    const at = scene.at + impact;
    if (!Number.isFinite(at) || at >= durationSec - 0.15)
      throw new Error(`${scene.prop}: signature impact has no final hold`);
    beats.push({ name: 'catalog-impact', at });
  }
  if (beats.length === 0) throw new Error(`${scene.kind}: no timed critical beats`);
  return beats;
}

/** Finite, reproducible set: authored samples, setup/result, before/on/after each beat and catalog impact. */
export function criticalFrames(fixture) {
  const frames = new Map();
  const count = Math.round(fixture.durationSec * 30);
  const add = (frame, name) => {
    if (frame < 0 || frame >= count) return; // Boundary neighbours outside the video do not exist.
    frames.set(frame, [...(frames.get(frame) ?? []), name]);
  };
  add(0, 'setup');
  add(count - 1, 'final-hold');
  for (const sample of fixture.samples) add(sample.frame, `authored:${sample.name}`);
  for (const beat of sceneBeats(fixture.scene, fixture.durationSec)) {
    const center = Math.round(beat.at * 30);
    for (const delta of [-1, 0, 1])
      add(center + delta, `${beat.name}${delta < 0 ? ':before' : delta > 0 ? ':after' : ':on'}`);
  }
  return [...frames]
    .sort(([a], [b]) => a - b)
    .map(([frame, reasons]) => ({ name: `critical-f${frame}`, frame, reasons }));
}

export function targetMatchesScene(target, scene) {
  if (
    !Object.hasOwn(FIXTURE_MANIFEST, target.category) ||
    !FIXTURE_MANIFEST[target.category].includes(target.id)
  )
    return false;
  if (target.category === 'technology' || target.category === 'explanation')
    return target.id === `${scene.kind}/${scene.preset}`;
  const presets = [...FIXTURE_MANIFEST.technology, ...FIXTURE_MANIFEST.explanation];
  if (target.category === 'kind' && presets.some((id) => id.startsWith(`${scene.kind}/`)))
    return scene.kind === target.id && presets.includes(`${scene.kind}/${scene.preset}`);
  if (target.category === 'prop') return scene.kind === 'hero' && scene.prop === target.id;
  if (target.category === 'kind') return scene.kind === target.id;
  if (target.category === 'relay') return scene.kind === 'relay' && scene.preset === target.id;
  if (target.category !== 'treatment') return false;
  switch (target.id) {
    case 'letterpress':
    case 'embossed':
      return scene.kind === 'stamp' && scene.finish === target.id;
    case 'peel-back':
    case 'redaction':
      return ['hero', 'statement'].includes(scene.kind) && scene.labelTreatment?.kind === target.id;
    case 'magnified-inset':
    case 'tracked-callout':
    case 'measurement':
    case 'focus-isolation':
      return scene.kind === 'exploded-view' && scene.detail?.kind === target.id;
    case 'mechanical-number':
      return scene.kind === 'number' && ['odometer', 'split-flap'].includes(scene.presentation);
    case 'semantic-text':
      return (
        scene.kind === 'statement' &&
        ['compress', 'separate', 'align'].includes(scene.semanticText?.kind)
      );
    default:
      return false;
  }
}

/** Matrix expansion belongs to the verifier, not agents' authored fixtures. Native dimensions only. */
export function verificationPlan(fixtures, { matrix = true } = {}) {
  const normalized = normalizeFixtures(fixtures);
  fixtureCoverage(normalized); // Reject unknown declarations, never silently accept misspelled IDs.
  return normalized.flatMap((fx) => {
    for (const target of fx.covers ?? []) {
      if (!targetMatchesScene(target, fx.scene))
        throw new Error(
          `${fx.name}: ${target.category}:${target.id} does not match the rendered scene`,
        );
    }
    const cases = [...fx.cases];
    if (matrix) {
      if (!cases.some((c) => c.layout === 'stack' && c.aspect === '9:16'))
        cases.push({ name: 'verify-stack', layout: 'stack', aspect: '9:16' });
      if (!cases.some((c) => c.layout === 'over' && c.aspect === '16:9' && c.palette)) {
        cases.push({
          name: 'verify-compact-contrast',
          layout: 'over',
          aspect: '16:9',
          palette: CONTRAST_PALETTE,
        });
      }
    }
    return createRenderPlan([{ ...fx, cases, samples: criticalFrames(fx) }]).map((entry, index) => {
      const canvas = stageCanvasFor(entry.inputProps.layout, entry.inputProps.aspect);
      const composition = { ...entry.composition, width: canvas.width, height: canvas.height };
      const inputHash = digest({ inputProps: entry.inputProps, composition });
      return {
        ...entry,
        composition,
        fixtureName: fx.name,
        caseName: cases[index].name,
        covers: fx.covers ?? [],
        inputHash,
        id: `${fx.name}:${cases[index].name ?? 'default'}:${inputHash}`,
        transparent: canvas.transparent,
      };
    });
  });
}
