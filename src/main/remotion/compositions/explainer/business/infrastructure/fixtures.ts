import {
  makeParseContext,
  type ParseContext,
  type PlannerWord,
  type Rec,
  type SceneWindow,
} from '../../../../../ai/explainer/kind-spec';
import type { BusinessIdentity, BusinessWordSpan } from '../types';
import type { InfrastructureState } from './types';

export const INFRASTRUCTURE_RECIPE_IDS = [
  'OP-35',
  'OP-63',
  'OP-65',
  'OP-66',
  'OP-67',
  'OP-68',
  'OP-69',
  'OP-70',
  'OP-71',
  'OP-72',
] as const;
export type InfrastructureRecipeId = (typeof INFRASTRUCTURE_RECIPE_IDS)[number];
const RECIPES = {
  'OP-35': ['capacity-map', 'installed-used-reserved'],
  'OP-63': ['operating-lineage', 'evidence-and-missing-information'],
  'OP-65': ['capacity-map', 'physical-readiness'],
  'OP-66': ['capacity-map', 'bounded-request-capacity'],
  'OP-67': ['capacity-map', 'resource-states'],
  'OP-68': ['capacity-map', 'declared-processing-scope'],
  'OP-69': ['operating-lineage', 'provider-transition'],
  'OP-70': ['operating-lineage', 'versioned-provenance'],
  'OP-71': ['operating-lineage', 'evaluation-periods'],
  'OP-72': ['capacity-map', 'end-to-end-periods'],
} as const;
export interface InfrastructureSourceFixture {
  id: InfrastructureRecipeId;
  fixtureId: string;
  words: PlannerWord[];
  raw: Rec;
}
interface SourceBuilder {
  span: (text: string) => BusinessWordSpan;
  identity: (id: string, label: string, clause: string) => BusinessIdentity;
  fact: (state: string, clause: string) => Rec;
  quantity: (
    state: InfrastructureState,
    value: number | null,
    operation: string,
    clause: string,
    unit?: string | null,
  ) => Rec;
}
/** Authored speech with production lead-in/tail and five actual indexed paragraph starts. */
export function makeInfrastructureSourceFixture(
  id: InfrastructureRecipeId,
  paragraphs: [string, string, string, string, string],
  fields: (s: SourceBuilder) => Rec,
  options: { subject?: string; condition?: string; fixtureId?: string } = {},
): InfrastructureSourceFixture {
  const starts = [0.35, 1.5, 3, 7, 10.2],
    ends = [1.45, 2.95, 6.95, 10.15, 11.4];
  const words: PlannerWord[] = [],
    indices: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    indices.push(words.length);
    const tokens = paragraph.trim().split(/\s+/u),
      stride = (ends[index] - starts[index]) / tokens.length;
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: starts[index] + stride * i,
        end: starts[index] + stride * (i + 0.95),
      });
    });
  });
  const span = (text: string): BusinessWordSpan => {
    const tokens = text.trim().split(/\s+/u);
    const fromWord = words.findIndex((_, i) =>
      tokens.every((token, j) => token === words[i + j]?.text),
    );
    if (fromWord < 0) throw new Error(`Missing authored ${id} source: ${text}`);
    return { fromWord, toWord: fromWord + tokens.length - 1 };
  };
  const source: SourceBuilder = {
    span,
    identity: (identityId, label, clause) => ({ id: identityId, label, source: span(clause) }),
    fact: (state, clause) => ({ state, source: span(clause) }),
    quantity: (state, value, _operation, clause, unit = 'jobs') => {
      const full = span(clause),
        body =
          options.condition && state === 'conditional'
            ? { ...full, fromWord: full.fromWord + options.condition.split(/\s+/u).length }
            : { ...full };
      return {
        state,
        value,
        unit,
        period: 'June',
        source: full,
        basis:
          value === null
            ? null
            : {
                subjectId:
                  options.subject === 'Model'
                    ? 'model'
                    : options.subject === 'Panel'
                      ? 'panel'
                      : 'rack',
                population: unit === 'points' ? 'cases' : unit === 'ms' ? 'requests' : unit,
                unit,
                period: 'June',
                denominator: 10,
                source: body,
              },
      };
    },
  };
  const [kind, preset] = RECIPES[id],
    outcome = paragraphs[4].replace(/[.!?]$/u, '');
  return {
    id,
    fixtureId: options.fixtureId ?? `${id}:primary`,
    words,
    raw: {
      kind,
      preset,
      visualMode: 'diagram',
      evidence: 'source-stated',
      label: paragraphs[0].split(/\s+/u)[0],
      subject:
        options.subject ??
        (id === 'OP-63' || id === 'OP-70'
          ? 'Archive'
          : id === 'OP-71'
            ? 'Model'
            : id === 'OP-68' || id === 'OP-69' || id === 'OP-72'
              ? 'Panel'
              : 'Rack'),
      outcome,
      period: 'June',
      modelSource: null,
      startWord: 0,
      endWord: words.length - 1,
      layout: 'stack',
      setupWord: indices[0],
      actionWord: indices[1],
      responseWord: indices[2],
      checkWord: indices[3],
      resolveWord: indices[4],
      factEvidence: { state: 'source-stated', label: outcome, source: span(paragraphs[4]) },
      ...(options.condition ? { condition: options.condition } : {}),
      ...fields(source),
    },
  };
}
export function infrastructureSourceWindow(fixture: InfrastructureSourceFixture): SceneWindow {
  const first = fixture.words[0],
    last = fixture.words.at(-1);
  if (!first || !last) throw new Error('Infrastructure fixtures need real source words');
  return {
    startWord: 0,
    endWord: fixture.words.length - 1,
    startTime: first.start - 0.25,
    endTime: last.end + 0.35,
  };
}
export function infrastructureSourceContext(fixture: InfrastructureSourceFixture): ParseContext {
  return makeParseContext(fixture.words, infrastructureSourceWindow(fixture));
}
function qText(
  actor: string,
  operation: string,
  state: InfrastructureState,
  value: number | null,
  unit = 'jobs',
  condition?: string,
) {
  const population = unit === 'ms' ? 'requests' : unit === 'points' ? 'cases' : unit;
  return state === 'source-stated'
    ? `${actor} reports ${operation} of ${value} ${unit} during June per 10 ${population}.`
    : state === 'conditional'
      ? `${condition}, ${actor} may report ${operation} of ${value} ${unit} during June per 10 ${population}.`
      : `${actor} ${operation} in ${unit} is ${state} during June.`;
}
export function installedSourceFixture(
  state: InfrastructureState = 'source-stated',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Rack records installed capacity during June.',
    model =
      nativeClause === undefined
        ? 'Rack illustrates a data-center rack during June.'
        : nativeClause,
    installed = qText('Rack', 'installed capacity', 'source-stated', 10),
    condition = state === 'conditional' ? 'If power arrives' : undefined;
  const value = state === 'source-stated' || state === 'conditional' ? 4 : null,
    used = qText('Rack', 'used capacity', state, value, 'jobs', condition),
    reserved = qText('Rack', 'reserved capacity', 'source-stated', 2);
  const partition =
    'Rack declares used capacity and reserved capacity nonoverlapping within installed capacity during June.';
  return makeInfrastructureSourceFixture(
    'OP-35',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      installed,
      `${used} ${reserved}`,
      partition,
      'Facts remain separate.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('rack', 'Rack', intro),
      installed: s.quantity('source-stated', 10, 'installed', installed),
      used: s.quantity(state, value, 'used', used),
      reserved: s.quantity('source-stated', 2, 'reserved', reserved),
      partition: { source: s.span(partition) },
    }),
    { condition, fixtureId: `OP-35:${state}` },
  );
}
export function evidenceSourceFixture(
  state: InfrastructureState = 'unknown',
  count = 2,
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const labels = Array.from({ length: count }, (_, i) =>
      i === 0 ? 'Ledger' : i === 1 ? 'Permit' : `Record${i + 1}`,
    ),
    intro = `Archive names ${labels.join(' and ')} during June.`,
    model =
      nativeClause === undefined
        ? `Archive illustrates a playbook binder for inspecting ${labels.map((label, index) => `${label} version v${index + 1}`).join(' and ')} during June.`
        : nativeClause,
    condition = state === 'conditional' ? 'If records arrive' : undefined;
  const facts = labels.map((label, index) => {
    const target = `${label} version v${index + 1} dated 2026-06-0${index + 1} during June`,
      localState = index === 1 ? state : 'source-stated';
    return localState === 'source-stated'
      ? `Archive holds ${target}.`
      : localState === 'negative'
        ? `Archive does not hold ${target}.`
        : localState === 'pending'
          ? `Archive receipt of ${target} is pending.`
          : localState === 'conditional'
            ? `${condition}, Archive may hold ${target}.`
            : `Archive status of ${target} is unknown.`;
  });
  return makeInfrastructureSourceFixture(
    'OP-63',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      facts[0],
      facts.slice(1).join(' ') || 'Archive records remain named.',
      'Missing evidence is not approval.',
      'Records remain distinct.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      owner: s.identity('archive', 'Archive', intro),
      items: labels.map((label, index) => ({
        entry: {
          identity: s.identity(`record-${index + 1}`, label, facts[index]),
          version: `v${index + 1}`,
          source: s.span(facts[index]),
        },
        date: `2026-06-0${index + 1}`,
        fact: s.fact(index === 1 ? state : 'source-stated', facts[index]),
      })),
    }),
    { condition, fixtureId: `OP-63:${state}:${count}` },
  );
}
export function readinessSourceFixture(
  state: InfrastructureState = 'negative',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Rack names Funding, Power and Cooling during June.',
    model =
      nativeClause === undefined
        ? 'Rack illustrates a data-center rack with Power power-readiness architecture and Cooling cooling-loop architecture during June.'
        : nativeClause,
    money = 'Funding for Rack is ready during June.',
    condition = state === 'conditional' ? 'If tests pass' : undefined;
  const power =
    state === 'source-stated'
      ? 'Power for Rack is ready during June.'
      : state === 'negative'
        ? 'Power for Rack is not ready during June.'
        : state === 'conditional'
          ? `${condition}, Power for Rack may be ready during June.`
          : `Power for Rack is ${state} during June.`;
  const cooling = 'Cooling for Rack is pending during June.';
  return makeInfrastructureSourceFixture(
    'OP-65',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      money,
      power,
      cooling,
      'Readiness remains separate.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('rack', 'Rack', intro),
      funding: s.identity('funding', 'Funding', intro),
      power: s.identity('power', 'Power', intro),
      cooling: s.identity('cooling', 'Cooling', intro),
      moneyReady: s.fact('source-stated', money),
      powerReady: s.fact(state, power),
      coolingReady: s.fact('pending', cooling),
    }),
    { condition, fixtureId: `OP-65:${state}` },
  );
}
export function requestSourceFixture(
  state: InfrastructureState = 'source-stated',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Rack handles Inference during June.',
    model =
      nativeClause === undefined
        ? 'Rack illustrates a data-center rack during June.'
        : nativeClause,
    condition = state === 'conditional' ? 'If requests arrive' : undefined,
    value = state === 'source-stated' || state === 'conditional' ? 6 : null;
  const queued = qText(
      'Rack',
      'queued requests for Inference',
      state,
      value,
      'requests',
      condition,
    ),
    capacity = qText('Rack', 'available capacity for Inference', 'source-stated', 4, 'requests');
  return makeInfrastructureSourceFixture(
    'OP-66',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      queued,
      capacity,
      'A queue is not completed inference.',
      'Facts remain separate.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('rack', 'Rack', intro),
      task: s.identity('inference', 'Inference', intro),
      queued: s.quantity(state, value, 'queue', queued, 'requests'),
      capacity: s.quantity('source-stated', 4, 'capacity', capacity, 'requests'),
    }),
    { condition, fixtureId: `OP-66:${state}` },
  );
}
export function resourcesSourceFixture(
  state: InfrastructureState = 'source-stated',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Rack names Cooling during June.',
    model =
      nativeClause === undefined
        ? 'Rack illustrates a data-center rack with Cooling cooling-loop architecture during June.'
        : nativeClause,
    condition = state === 'conditional' ? 'If demand arrives' : undefined,
    value = state === 'source-stated' || state === 'conditional' ? 2 : null;
  const installed = qText('Rack', 'installed capacity', 'source-stated', 10),
    idle = qText('Rack', 'idle allocation', 'source-stated', 3),
    reserved = qText('Rack', 'reserved allocation', 'source-stated', 4),
    burst = qText('Rack', 'burst allocation', state, value, 'jobs', condition),
    cooling = 'Cooling for Rack is unknown during June.';
  const partition =
    'Rack declares idle allocation, reserved allocation and burst allocation nonoverlapping within installed capacity during June.';
  return makeInfrastructureSourceFixture(
    'OP-67',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      `${installed} ${idle}`,
      `${reserved} ${burst}`,
      `${cooling} ${partition}`,
      'Allocations remain separate.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('rack', 'Rack', intro),
      cooling: s.identity('cooling', 'Cooling', intro),
      installed: s.quantity('source-stated', 10, 'installed', installed),
      idle: s.quantity('source-stated', 3, 'idle', idle),
      reserved: s.quantity('source-stated', 4, 'reserved', reserved),
      burst: s.quantity(state, value, 'burst', burst),
      coolingReady: s.fact('unknown', cooling),
      partition: { source: s.span(partition) },
    }),
    { condition, fixtureId: `OP-67:${state}` },
  );
}
export function scopeSourceFixture(
  state: InfrastructureState = 'conditional',
  boundaryLabel = 'Zone',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = `Panel names Records and ${boundaryLabel} during June.`,
    model =
      nativeClause === undefined
        ? `Panel illustrates a provider connector panel at ${boundaryLabel} for inspecting Records processing during June.`
        : nativeClause,
    condition = state === 'conditional' ? 'If consent holds' : undefined,
    tail = `Records within ${boundaryLabel} during June`;
  const processing =
    state === 'source-stated'
      ? `Panel processes ${tail}.`
      : state === 'negative'
        ? `Panel does not process ${tail}.`
        : state === 'conditional'
          ? `${condition}, Panel may process ${tail}.`
          : `Panel processing ${tail} is ${state}.`;
  return makeInfrastructureSourceFixture(
    'OP-68',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      processing,
      'Processing is not compliance certification.',
      'No monitoring is claimed.',
      'Scope remains declared.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('panel', 'Panel', intro),
      item: s.identity('records', 'Records', intro),
      boundary: s.identity('zone', boundaryLabel, intro),
      processing: s.fact(state, processing),
    }),
    {
      subject: 'Panel',
      condition,
      fixtureId: `OP-68:${state}:${boundaryLabel === 'Zone' ? 'primary' : 'wide'}`,
    },
  );
}
export function transitionSourceFixture(
  state: 'completed' | 'pending' | 'blocked' | 'conditional' | 'unknown' = 'pending',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Panel names Old, New and Export during June.',
    model =
      nativeClause === undefined
        ? 'Panel illustrates a provider connector panel for inspecting the switch from Old to New requiring Export during June.'
        : nativeClause,
    condition = state === 'conditional' ? 'If export arrives' : undefined,
    tail = 'transition of Export from Old to New during June';
  const transition =
    state === 'completed'
      ? `Panel completed ${tail}.`
      : state === 'conditional'
        ? `${condition}, Panel may complete ${tail}.`
        : `Panel ${tail} is ${state}.`;
  return makeInfrastructureSourceFixture(
    'OP-69',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      transition,
      'A dependency is not a new provider.',
      'No performance improvement is claimed.',
      'Providers remain distinct.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('panel', 'Panel', intro),
      fromProvider: s.identity('old', 'Old', intro),
      toProvider: s.identity('new', 'New', intro),
      dependency: s.identity('export', 'Export', intro),
      transition: s.fact(state, transition),
    }),
    { subject: 'Panel', condition, fixtureId: `OP-69:${state}` },
  );
}
export function provenanceSourceFixture(
  state: InfrastructureState = 'source-stated',
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const intro = 'Archive records Data and Table during June.',
    model =
      nativeClause === undefined
        ? 'Archive illustrates a playbook binder for inspecting Data version v1 and Table version v2 with a provenance connector at the Data version v1 version-record boundary during June.'
        : nativeClause,
    from = 'Archive names Data version v1 during June.',
    to = 'Archive names Table version v2 during June.',
    condition = state === 'conditional' ? 'If records arrive' : undefined,
    tail = 'Table version v2 from Data version v1 during June';
  const edge =
    state === 'source-stated'
      ? `Archive derives ${tail}.`
      : state === 'negative'
        ? `Archive does not derive ${tail}.`
        : state === 'conditional'
          ? `${condition}, Archive may derive ${tail}.`
          : `Archive derivation of ${tail} is ${state}.`;
  return makeInfrastructureSourceFixture(
    'OP-70',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      `${from} ${to}`,
      edge,
      'A declared source edge is not model training.',
      'Records remain distinct.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      owner: s.identity('archive', 'Archive', intro),
      entries: [
        { identity: s.identity('data', 'Data', from), version: 'v1', source: s.span(from) },
        { identity: s.identity('table', 'Table', to), version: 'v2', source: s.span(to) },
      ],
      edges: [{ fromId: 'data', toId: 'table', ...s.fact(state, edge) }],
    }),
    { condition, fixtureId: `OP-70:${state}` },
  );
}
export function evaluationSourceFixture(unknown = false): InfrastructureSourceFixture {
  const intro = 'Model evaluates Classify during June.',
    a = qText(
      'Model',
      'score for Classify version v1 dated 2026-06-01',
      'source-stated',
      8,
      'points',
    ),
    b = qText(
      'Model',
      'score for Classify version v2 dated 2026-06-08',
      unknown ? 'unknown' : 'source-stated',
      unknown ? null : 7,
      'points',
    );
  return makeInfrastructureSourceFixture(
    'OP-71',
    [intro, a, b, 'Snapshots are not live drift telemetry.', 'Snapshots remain separate.'],
    (s) => ({
      owner: s.identity('model', 'Model', intro),
      task: s.identity('classify', 'Classify', intro),
      snapshots: [
        {
          version: 'v1',
          date: '2026-06-01',
          source: s.span(a),
          quantity: s.quantity('source-stated', 8, 'score', a, 'points'),
        },
        {
          version: 'v2',
          date: '2026-06-08',
          source: s.span(b),
          quantity: s.quantity(
            unknown ? 'unknown' : 'source-stated',
            unknown ? null : 7,
            'score',
            b,
            'points',
          ),
        },
      ],
    }),
    { subject: 'Model', fixtureId: `OP-71:${unknown ? 'unknown' : 'primary'}` },
  );
}
export function latencySourceFixture(
  unknown = false,
  count = 2,
  nativeClause?: string | null,
): InfrastructureSourceFixture {
  const labels = Array.from({ length: count }, (_, i) =>
      i === 0 ? 'Decode' : i === 1 ? 'Execute' : `Stage${i + 1}`,
    ),
    intro = `Panel names Request and ${labels.join(' and ')} during June.`,
    model =
      nativeClause === undefined
        ? 'Panel illustrates a provider connector panel at its system boundary for inspecting Request latency during June.'
        : nativeClause,
    amounts = labels.map((_, index) => (count === 2 ? index + 2 : 1));
  const facts = labels.map((label, index) =>
      qText(
        'Panel',
        `latency for Request stage ${label}`,
        unknown ? 'unknown' : 'source-stated',
        unknown ? null : amounts[index],
        'ms',
      ),
    ),
    total = qText(
      'Panel',
      'end-to-end latency for Request',
      unknown ? 'unknown' : 'source-stated',
      unknown ? null : amounts.reduce((sum, n) => sum + n, 0),
      'ms',
    );
  const aggregation = unknown
    ? 'Panel aggregation for Request is unknown during June.'
    : `Panel declares ${labels.join(' then ')} sequential with no overlap for Request during June.`;
  return makeInfrastructureSourceFixture(
    'OP-72',
    [
      `${intro}${model === null ? '' : ` ${model}`}`,
      facts.join(' '),
      total,
      aggregation,
      'Latency remains stated.',
    ],
    (s) => ({
      modelSource: model === null ? null : s.span(model),
      resource: s.identity('panel', 'Panel', intro),
      task: s.identity('request', 'Request', intro),
      stages: labels.map((label, index) => ({
        identity: s.identity(`stage-${index + 1}`, label, facts[index]),
        quantity: s.quantity(
          unknown ? 'unknown' : 'source-stated',
          unknown ? null : amounts[index],
          'latency',
          facts[index],
          'ms',
        ),
      })),
      total: s.quantity(
        unknown ? 'unknown' : 'source-stated',
        unknown ? null : amounts.reduce((sum, n) => sum + n, 0),
        'total',
        total,
        'ms',
      ),
      aggregation: { state: unknown ? 'unknown' : 'sequential', source: s.span(aggregation) },
    }),
    { subject: 'Panel', fixtureId: `OP-72:${unknown ? 'unknown' : 'sequential'}:${count}` },
  );
}
export const INFRASTRUCTURE_SOURCE_FIXTURES: readonly InfrastructureSourceFixture[] = [
  installedSourceFixture(),
  evidenceSourceFixture(),
  readinessSourceFixture(),
  requestSourceFixture(),
  resourcesSourceFixture(),
  scopeSourceFixture(),
  transitionSourceFixture(),
  provenanceSourceFixture(),
  evaluationSourceFixture(),
  latencySourceFixture(),
];
/** Re-authored source words and spans, not scenes cloned from supported native illustrations. */
export const INFRASTRUCTURE_NO_NATIVE_SOURCE_FIXTURES: readonly InfrastructureSourceFixture[] = [
  installedSourceFixture('source-stated', null),
  evidenceSourceFixture('unknown', 2, null),
  readinessSourceFixture('negative', null),
  requestSourceFixture('source-stated', null),
  resourcesSourceFixture('source-stated', null),
  scopeSourceFixture('conditional', 'Zone', null),
  transitionSourceFixture('pending', null),
  provenanceSourceFixture('source-stated', null),
  evaluationSourceFixture(),
  latencySourceFixture(false, 2, null),
];
export const INFRASTRUCTURE_ADDITIONAL_SOURCE_FIXTURES: readonly InfrastructureSourceFixture[] = [
  installedSourceFixture('unknown'),
  installedSourceFixture('pending'),
  installedSourceFixture('negative'),
  installedSourceFixture('conditional'),
  evidenceSourceFixture('source-stated', 7),
  evidenceSourceFixture('pending'),
  evidenceSourceFixture('negative'),
  evidenceSourceFixture('conditional'),
  readinessSourceFixture('source-stated'),
  readinessSourceFixture('unknown'),
  readinessSourceFixture('conditional'),
  requestSourceFixture('pending'),
  requestSourceFixture('conditional'),
  resourcesSourceFixture('conditional'),
  scopeSourceFixture('source-stated'),
  scopeSourceFixture('negative'),
  scopeSourceFixture('unknown'),
  scopeSourceFixture('source-stated', 'W'.repeat(28)),
  transitionSourceFixture('completed'),
  transitionSourceFixture('blocked'),
  transitionSourceFixture('conditional'),
  transitionSourceFixture('unknown'),
  provenanceSourceFixture('pending'),
  provenanceSourceFixture('negative'),
  provenanceSourceFixture('unknown'),
  provenanceSourceFixture('conditional'),
  evaluationSourceFixture(true),
  latencySourceFixture(true),
  latencySourceFixture(false, 6),
];
