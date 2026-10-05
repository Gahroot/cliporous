/** Approved inventory, not runtime registration or evidence of completed rendering. */
import type { ExplanationVisualMode } from '../diagrams/types';
import type { ExpansionDerivation } from './value-types';

export const EXPANSION_PACKS = [
  'reasoning',
  'probability',
  'quantities',
  'decisions',
  'relationships',
  'temporal',
  'representations',
  'geometry',
  'computing',
  'physical',
] as const;
export type ExpansionPack = (typeof EXPANSION_PACKS)[number];

export const EXPANSION_KITS = [
  {
    id: 'evidence',
    assets: 'Documents, claim plaques, scope/version tabs, typed links, missing slots',
  },
  {
    id: 'population',
    assets: 'Count trays, stable member marks, sampling aperture, aggregate legends',
  },
  { id: 'plots', assets: 'Axes, bands, bins, signed scales, baselines, partitions, ranked tracks' },
  { id: 'constraints', assets: 'Candidates, requirements, elimination slots, retained choices' },
  { id: 'temporal', assets: 'Intervals, tasks, joins, deadline shutters, state badges' },
  { id: 'relationships', assets: 'Containers, entity cards, approval stations, typed connectors' },
  { id: 'geometry', assets: 'Sectionable assemblies, planes, nets, clearance/dimension guides' },
  {
    id: 'representations',
    assets: 'Tiles, matrices, vectors, projection references, correspondence',
  },
  { id: 'computing', assets: 'Packets/caches, IDs, buffers, replicas, versions/effects' },
  { id: 'product', assets: 'Original form/table/result/invoice/task shapes' },
  { id: 'signals', assets: 'Seekable waves, exact planar plots, restrained instruments' },
  { id: 'infrastructure', assets: 'Supply modules, reservoirs/filters, energy carriers' },
] as const;
export type ExpansionKitId = (typeof EXPANSION_KITS)[number]['id'];

/** Stable research ID, title, kind, literal preset, mandatory source meaning. */
const STORY_ROUTES = [
  [
    '01',
    'Evidence-to-claim trace',
    'retrieval-grounding',
    'trace-chain',
    'Named source/excerpt, claim and explicit support/provenance; citation is not proof',
  ],
  [
    '02',
    'Claim versus evidence',
    'evidence-conflict',
    'claim-source-board',
    'Named statements/sources and actual conflict; no invented adjudication',
  ],
  [
    '03',
    'Argument tree',
    'argument-map',
    'reasons-objections',
    'Claim, premises/objections and typed support/rebuttal',
  ],
  [
    '04',
    'Assumption switch',
    'conditional-comparison',
    'assumption-toggle',
    'Explicit condition, alternatives and stated effects',
  ],
  [
    '05',
    'Correlation versus causation',
    'relationship-analysis',
    'confounder',
    'Association, described third factor and qualified causal status',
  ],
  [
    '06',
    'Missing-information map',
    'retrieval-grounding',
    'missing-evidence-map',
    'Known versus expressly missing information; missing is not false',
  ],
  [
    '07',
    'Scoped contradiction',
    'evidence-conflict',
    'scoped-statements',
    'Actor/version/period/scope for each statement',
  ],
  [
    '08',
    'Different framing, same facts',
    'framing-comparison',
    'same-facts',
    'Identical facts and explicit denominator/reference change',
  ],
  [
    '09',
    'Base-rate microscope',
    'probability-workbench',
    'base-rate',
    'Population, prevalence and compatible test/selection counts or rates',
  ],
  [
    '10',
    'Belief update',
    'probability-workbench',
    'bayes-update',
    'Prior and likelihood/evidence for the stated hypothesis',
  ],
  [
    '11',
    'Conditional subset',
    'probability-workbench',
    'conditioning',
    'Original population, event, subset and denominator',
  ],
  [
    '12',
    'Sample versus population',
    'sampling-frame',
    'selection-bias',
    'Inclusion rule and represented/excluded groups',
  ],
  [
    '13',
    'Sampling variation',
    'probability-workbench',
    'repeated-samples',
    'Supplied samples or explicitly illustrative bounded teaching case',
  ],
  [
    '14',
    'Uncertainty range',
    'uncertainty-range',
    'qualified-interval',
    'Endpoints and uncertainty meaning; not invented statistical confidence',
  ],
  [
    '15',
    'Probability versus impact',
    'quadrant',
    'risk-matrix',
    'Events and separate supported likelihood/impact dimensions',
  ],
  [
    '16',
    'Calibration',
    'probability-workbench',
    'calibration',
    'Predictions, observations and comparable denominators/periods',
  ],
  [
    '17',
    'Distribution/long tail',
    'distribution-view',
    'histogram',
    'Ordered bins/counts or bounded observations; no invented smoothing',
  ],
  [
    '18',
    'Subgroup reversal',
    'distribution-view',
    'subgroup-reversal',
    'Complete subgroup numerators/denominators and aggregate basis',
  ],
  [
    '19',
    'Absolute versus relative',
    'quantity-comparison',
    'denominator',
    'Amounts and reference totals/periods',
  ],
  [
    '20',
    'Part-to-whole',
    'composition-view',
    'partition',
    'Total/parts with unknown remainder preserved',
  ],
  [
    '21',
    'Ranking change',
    'ranking',
    'rank-change',
    'Same identities and comparable ordered states',
  ],
  [
    '22',
    'Calendar/seasonality',
    'temporal-pattern',
    'calendar-seasonality',
    'Explicit periods/events/values; no unsupported extrapolation',
  ],
  [
    '23',
    'Deviation',
    'quantity-comparison',
    'deviation',
    'Target, observation and matching unit/basis',
  ],
  [
    '24',
    'Small multiples',
    'quantity-comparison',
    'small-multiples',
    'Shared units/domain and explicitly compatible comparisons',
  ],
  [
    '25',
    'Constraint sieve',
    'constraint-choice',
    'sieve',
    'Options and requirements/pass-fail conditions',
  ],
  [
    '26',
    'Trade-off frontier',
    'tradeoff-frontier',
    'pareto',
    'Comparable criteria/candidates; nondominance is not universal superiority',
  ],
  [
    '27',
    'Priority change',
    'constraint-choice',
    'weighted-criteria',
    'Stated weights or qualitative priorities; no fabricated weights',
  ],
  [
    '28',
    'Decision tree',
    'conditional-choice',
    'decision-tree',
    'Conditions, branches and outcomes; preserve unknown branches',
  ],
  [
    '29',
    'Search frontier/route',
    'spatial-search',
    'frontier-route',
    'Authored map, obstacles/goal/cost rules or qualified illustration',
  ],
  [
    '30',
    'Local/global optimum',
    'optimization-landscape',
    'local-global',
    'Allowed teaching function/template and qualified objective',
  ],
  [
    '31',
    'Explore/exploit',
    'adaptive-choice',
    'explore-exploit',
    'Named options and explicit behavior; no invented rewards',
  ],
  [
    '32',
    'Evidence gathering',
    'conditional-choice',
    'sequential-evidence',
    'Ordered tests and known/unresolved results',
  ],
  ['33', 'Taxonomy', 'relation-structure', 'taxonomy', 'Explicit categories/membership/parents'],
  [
    '34',
    'Ownership/control',
    'ownership-change',
    'dual-rights',
    'Separate grounded rights; exact shares only if supplied',
  ],
  [
    '35',
    'Responsibility/approval',
    'agent-team',
    'approval-handoff',
    'Owner, approver and actual authorization state',
  ],
  [
    '36',
    'Dependency/flow',
    'relation-structure',
    'dependency',
    'Typed dependency, distinct from transfer/time order',
  ],
  [
    '37',
    'Matrix/links',
    'relation-structure',
    'matrix-links',
    'Same entities and explicit pair relations',
  ],
  [
    '38',
    'Capacity matching',
    'semantic-sort',
    'capacity-match',
    'Candidates, eligibility/capacity and unresolved matches',
  ],
  [
    '39',
    'Set operations',
    'venn',
    'set-operations',
    'Membership and selected intersection/union/exclusion',
  ],
  [
    '40',
    'Network resilience',
    'collective-pattern',
    'topology',
    'Authored topology, supplied links and failure condition',
  ],
  [
    '41',
    'Concurrent tasks',
    'temporal-structure',
    'parallel-lanes',
    'Task identities/durations or explicit qualitative concurrency',
  ],
  [
    '42',
    'Critical path',
    'temporal-structure',
    'critical-path',
    'Acyclic dependencies and complete supplied durations',
  ],
  [
    '43',
    'Reversible states',
    'state-transition',
    'reversible',
    'States, allowed transitions and conditions',
  ],
  [
    '44',
    'Expiry/windows',
    'temporal-structure',
    'expiry',
    'Validity/deadline and attempted event timing',
  ],
  [
    '45',
    'Delay/throughput',
    'temporal-structure',
    'delay-throughput',
    'Distinct latency/rate values or qualified comparison',
  ],
  [
    '46',
    'Cycle/phase',
    'synchronization',
    'periodic-phase',
    'Periodic relationship or qualified teaching signals',
  ],
  [
    '47',
    'Hysteresis',
    'state-transition',
    'hysteresis',
    'Enter/leave conditions or explicitly retained history',
  ],
  [
    '48',
    'Aligned states',
    'digital-twin',
    'aligned-state-comparison',
    'Same subject and supplied conditions/states; simulation stays qualified',
  ],
  [
    '49',
    'Unit conversion',
    'representation-transform',
    'unit-conversion',
    'Quantity, compatible units and allowed conversion',
  ],
  [
    '50',
    'Equivalent views',
    'representation-transform',
    'equivalence',
    'Supplied ratio/operands and equivalent set/area/length',
  ],
  [
    '51',
    'Aggregation/lost detail',
    'information-transform',
    'aggregation-loss',
    'Inputs, grouping and retained/omitted information',
  ],
  [
    '52',
    'Compression',
    'information-transform',
    'compression-loss',
    'Authored pixels/records and stated lossless/lossy behavior',
  ],
  [
    '53',
    'Projection/coordinates',
    'geometry-projection',
    'coordinates',
    'Authored template, axes/reference frames and projection relation',
  ],
  [
    '54',
    'Matrix product',
    'linear-algebra',
    'matrix-product',
    'Bounded operands and compatible dimensions',
  ],
  [
    '55',
    'Vector basis',
    'linear-algebra',
    'vector-basis',
    'Vector/basis with sign and direction preserved',
  ],
  [
    '56',
    'Factorization',
    'equation',
    'factorization',
    'Operands and authored algebra template; no arbitrary evaluator',
  ],
  [
    '57',
    'Section scanner',
    'section-view',
    'scan',
    'Recognizable authored solid/house/assembly and interior parts',
  ],
  ['58', 'Solid unfolding', 'geometry-projection', 'unfold', 'Allowed solid and matched faces/net'],
  [
    '59',
    'Packing/clearance',
    'floorplan-fit',
    'packing-clearance',
    'Allowed container/parts and dimensions or qualified fit example',
  ],
  [
    '60',
    'Linked scale',
    'scale-hierarchy',
    'linked-scale',
    'Tracked identity/enclosing levels; schematic unless measured',
  ],
  [
    '61',
    'Occlusion',
    'robot-perception',
    'viewpoint-occlusion',
    'Target/occluder and authored viewpoint; hidden is not absent',
  ],
  [
    '62',
    'Reachability',
    'property-access',
    'reachability',
    'Place/routes/access conditions; no invented travel/geography',
  ],
  [
    '63',
    'Region boundaries',
    'region-relation',
    'overlap',
    'Authored regions and explicit memberships/restrictions',
  ],
  [
    '64',
    'Length/area/volume',
    'geometry-projection',
    'dimensional-scaling',
    'Scale/units and explicit worked relationship',
  ],
  [
    '65',
    'Cache freshness',
    'request-routing',
    'cache-freshness',
    'Version/freshness condition and stated cache action',
  ],
  [
    '66',
    'Batch/stream',
    'computing-flow',
    'batch-stream',
    'Input identities and grouping/arrival/processing behavior',
  ],
  [
    '67',
    'Idempotent retry',
    'agent-workflow',
    'idempotent-retry',
    'Request identity, attempts and supplied effects/idempotency',
  ],
  [
    '68',
    'Product walkthrough',
    'product-walkthrough',
    'form-result',
    'Actions/fields/result in original neutral UI',
  ],
  [
    '69',
    'Replica conflict',
    'version-state',
    'replica-merge',
    'Replicas, versions and actual merge/unresolved state',
  ],
  [
    '70',
    'Software permissions',
    'property-access',
    'software-scope',
    'Actor, resource, operation and allowed/denied condition',
  ],
  [
    '71',
    'Generalization',
    'model-training',
    'held-out-generalization',
    'Training/held-out examples and comparable supplied results',
  ],
  [
    '72',
    'Evaluation drift',
    'model-evaluation',
    'population-drift',
    'Same basis, changed population/condition and known/unknown results',
  ],
  [
    '73',
    'Supply/inventory',
    'inventory-demand',
    'supply-chain',
    'Stages, inventory and transfers/replacement',
  ],
  [
    '74',
    'Incentives/externalities',
    'market-exchange',
    'incentive-externality',
    'Actors paying/benefiting and explicit effects',
  ],
  [
    '75',
    'Shared resource',
    'resource-allocation',
    'shared-resource',
    'Resource limit and requests/access rules',
  ],
  [
    '76',
    'Diffusion/filter',
    'material-process',
    'diffusion-filter',
    'Allowed qualitative model or supplied material relation',
  ],
  [
    '77',
    'Interference',
    'signal-composition',
    'interference',
    'Allowed analytic waves and source parameters/illustrative qualifier',
  ],
  ['78', 'State cycle', 'material-process', 'state-cycle', 'States and source conditions'],
  [
    '79',
    'Energy budget',
    'conservation-flow',
    'energy-budget',
    'Compatible quantities/transfers; unknown loss is unknown',
  ],
  [
    '80',
    'Directional field',
    'field-map',
    'directional-field',
    'Allowed analytic/authored teaching field and qualification',
  ],
] as const;
export type ExpansionStoryId = (typeof STORY_ROUTES)[number][0];
export type ExpansionKind = (typeof STORY_ROUTES)[number][2];
export type ExpansionPreset = (typeof STORY_ROUTES)[number][3];

interface PackAssets {
  readonly primary: ExplanationVisualMode;
  readonly kits: readonly ExpansionKitId[];
  readonly templates: readonly string[];
}
const PACK_ASSETS: Readonly<Record<ExpansionPack, PackAssets>> = {
  reasoning: {
    primary: 'diagram',
    kits: ['evidence', 'relationships'],
    templates: ['evidence-board', 'argument-tree', 'scope-board', 'framing-board'],
  },
  probability: {
    primary: 'diagram',
    kits: ['population', 'plots'],
    templates: ['population-tray', 'subset-lens', 'interval-rail', 'risk-grid', 'calibration-bins'],
  },
  quantities: {
    primary: 'diagram',
    kits: ['plots', 'population'],
    templates: [
      'ordered-bins',
      'subgroup-board',
      'partition-strip',
      'rank-tracks',
      'calendar-grid',
      'shared-axes',
    ],
  },
  decisions: {
    primary: 'diagram',
    kits: ['constraints', 'plots'],
    templates: [
      'constraint-board',
      'pareto-plane',
      'decision-tree',
      'grid-route',
      'two-hill-landscape',
      'choice-ledger',
    ],
  },
  relationships: {
    primary: 'diagram',
    kits: ['relationships', 'constraints', 'representations'],
    templates: [
      'nested-categories',
      'dual-rights-board',
      'approval-stations',
      'matrix-links',
      'matching-slots',
      'member-sets',
      'topology-board',
    ],
  },
  temporal: {
    primary: 'diagram',
    kits: ['temporal', 'signals', 'computing'],
    templates: [
      'task-lanes',
      'dependency-join',
      'state-rail',
      'expiry-window',
      'throughput-lanes',
      'phase-traces',
      'history-loop',
      'aligned-traces',
    ],
  },
  representations: {
    primary: 'diagram',
    kits: ['representations', 'geometry', 'plots'],
    templates: [
      'unit-rail',
      'fraction-views',
      'aggregation-tiles',
      'pixel-mosaic',
      'orthographic-frame',
      'matrix-workbench',
      'vector-axes',
      'algebra-tiles',
    ],
  },
  geometry: {
    primary: 'hybrid',
    kits: ['geometry', 'representations', 'relationships'],
    templates: [
      'section-assembly',
      'cube-net',
      'clearance-box',
      'enclosing-levels',
      'occlusion-rig',
      'route-board',
      'region-board',
      'scaled-cube',
    ],
  },
  computing: {
    primary: 'diagram',
    kits: ['computing', 'product', 'relationships', 'plots'],
    templates: [
      'version-cache',
      'buffer-lanes',
      'effect-ledger',
      'neutral-form',
      'replica-board',
      'permission-stations',
      'held-out-trays',
      'drift-board',
    ],
  },
  physical: {
    primary: 'hybrid',
    kits: ['infrastructure', 'signals', 'computing', 'plots'],
    templates: [
      'supply-modules',
      'incentive-board',
      'resource-slots',
      'filter-channel',
      'analytic-waves',
      'material-cycle',
      'energy-carriers',
      'authored-field',
    ],
  },
};

/** Empty unless this exact authored preset permits derivation. Never a general calculator. */
const DERIVATIONS: Partial<Readonly<Record<ExpansionStoryId, readonly ExpansionDerivation[]>>> = {
  '09': ['ratio'],
  '10': ['ratio'],
  '11': ['ratio'],
  '16': ['ratio'],
  '18': ['subgroup-total', 'ratio'],
  '19': ['ratio', 'difference', 'percent-change'],
  '23': ['difference'],
  '26': ['pareto'],
  '42': ['critical-path'],
  '49': ['unit-conversion'],
  '50': ['ratio'],
  '54': ['matrix-product'],
  '56': ['factorization'],
  '64': ['dimensional-scaling'],
  '77': ['signal-sum'],
};

export interface ExpansionCatalogEntry {
  readonly id: ExpansionStoryId;
  readonly pack: ExpansionPack;
  readonly title: string;
  readonly kind: ExpansionKind;
  readonly preset: ExpansionPreset;
  readonly purpose: string;
  readonly sourceRequirements: string;
  readonly modes: readonly ['diagram', 'hybrid'];
  /** Long complete stories are speaker-visible in shorts; no portrait takeover. */
  readonly layouts: readonly ['stack', 'stack-flipped'];
  readonly presentations: readonly ['speaker-side', 'speaker-pip', 'full-frame'];
  readonly primary: ExplanationVisualMode;
  readonly kits: readonly ExpansionKitId[];
  readonly templates: readonly string[];
  readonly allowedDerivations: readonly ExpansionDerivation[];
  readonly triggerHints: readonly string[];
  readonly avoidHint: string;
  readonly canonicalFixture: string;
  readonly sourceFixture: string;
  readonly renderFixture: string;
  readonly bundleSources: readonly string[];
  readonly acceptance: {
    readonly durationSec: readonly [5, 12];
    readonly beatCount: 5;
    readonly finalHoldSec: 0.8;
    readonly requiresSourceParity: true;
    readonly requiresProductionProof: true;
    readonly requiresNativeMedia: true;
  };
}

export const EXPANSION_CATALOG: readonly ExpansionCatalogEntry[] = STORY_ROUTES.map(
  (row, index) => {
    const [id, title, kind, preset, sourceRequirements] = row;
    const pack = EXPANSION_PACKS[Math.floor(index / 8)];
    if (!pack) throw new Error('Approved expansion inventory has an invalid pack index');
    const assets = PACK_ASSETS[pack];
    const dir = `src/main/remotion/compositions/explainer/expansion/${pack}`;
    return {
      id,
      pack,
      title,
      kind,
      preset,
      purpose: title,
      sourceRequirements,
      modes: ['diagram', 'hybrid'],
      layouts: ['stack', 'stack-flipped'],
      presentations: ['speaker-side', 'speaker-pip', 'full-frame'],
      primary: assets.primary,
      kits: assets.kits,
      templates: assets.templates,
      allowedDerivations: DERIVATIONS[id] ?? [],
      triggerHints: [title.toLowerCase(), preset.replaceAll('-', ' ')],
      avoidHint: `Not a generic statement or unsupported illustration. Require: ${sourceRequirements}.`,
      canonicalFixture: `expansion-${id}-${preset}`,
      sourceFixture: `scripts/explainer-stills/fixtures/expansion/${pack}.source.json`,
      renderFixture: `scripts/explainer-stills/fixtures/expansion/${pack}.json`,
      bundleSources: [
        `${dir}/types.ts`,
        `${dir}/poses.ts`,
        `${dir}/models.tsx`,
        `${dir}/Diagram.tsx`,
        `${dir}/Scene.tsx`,
        `src/main/ai/explainer/expansion-${pack}-contract.ts`,
        `src/main/ai/explainer/kinds-expansion-${pack}.ts`,
        ...assets.kits.map(
          (kit) => `src/main/remotion/compositions/explainer/expansion/kits/${kit}.tsx`,
        ),
      ],
      acceptance: {
        durationSec: [5, 12],
        beatCount: 5,
        finalHoldSec: 0.8,
        requiresSourceParity: true,
        requiresProductionProof: true,
        requiresNativeMedia: true,
      },
    };
  },
);

export function expansionEntry(kind: unknown, preset: unknown): ExpansionCatalogEntry | null {
  return EXPANSION_CATALOG.find((entry) => entry.kind === kind && entry.preset === preset) ?? null;
}
export function expansionStory(id: ExpansionStoryId): ExpansionCatalogEntry {
  const entry = EXPANSION_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('Approved expansion story ID has no catalog entry');
  return entry;
}

export const EXPANSION_TREATMENTS = [
  {
    id: 'belief-microscope',
    stories: ['09', '10', '11'],
    kits: ['population', 'plots'],
    required:
      'Retained population identities, explicit subset and prior/evidence/update denominator',
    behavior: 'Population to subset to update with a retained context rail',
  },
  {
    id: 'evidence-constellation',
    stories: ['01', '02', '03', '07'],
    kits: ['evidence', 'relationships'],
    required: 'Every document, claim and support/rebuttal/provenance relation separately evidenced',
    behavior: 'Documents expand into an authored typed map; no force solver',
  },
  {
    id: 'constraint-sculpture',
    stories: ['25', '26', '27', '28'],
    kits: ['constraints', 'plots'],
    required: 'Explicit requirement effects and retained unresolved/valid alternatives',
    behavior: 'Requirements eliminate invalid options without inventing a winner',
  },
  {
    id: 'time-loom',
    stories: ['41', '42', '43', '44'],
    kits: ['temporal'],
    required: 'Task identity, supplied waiting/joins/dependencies and represented timing',
    behavior: 'Stable aligned task lanes retain context through waiting and joins',
  },
  {
    id: 'section-scanner',
    stories: ['57', '59', '61'],
    kits: ['geometry', 'representations'],
    required: 'Authored slice/clearance/viewpoint and matched visible/interior parts',
    behavior: 'Linked analytic section, clearance guides and bounded viewpoint',
  },
  {
    id: 'representation-bridge',
    stories: ['37', '49', '50', '51', '52', '53', '54', '55', '56', '58'],
    kits: ['representations', 'geometry', 'relationships'],
    required: 'Exact correspondence of eligible authored views and explicit retained/omitted facts',
    behavior: 'Matched identities connect two representations with an intermediate hold',
  },
  {
    id: 'signal-studio',
    stories: ['46', '77', '80'],
    kits: ['signals', 'infrastructure'],
    required: 'Allowed analytic signal/field parameters and qualification; no telemetry inference',
    behavior: 'Restrained instrument to exact linked planar traces',
  },
  {
    id: 'version-permission-theater',
    stories: ['65', '66', '67', '68', '69', '70'],
    kits: ['computing', 'product', 'relationships'],
    required: 'Request identity, versions, rights, actual effects and retained records',
    behavior: 'Bounded request/version/permission events retain their effect ledger',
  },
] as const satisfies readonly {
  id: string;
  stories: readonly ExpansionStoryId[];
  kits: readonly ExpansionKitId[];
  required: string;
  behavior: string;
}[];
export type ExpansionTreatmentId = (typeof EXPANSION_TREATMENTS)[number]['id'];

export const EXPANSION_MOTION_TREATMENTS = [
  'linked-views',
  'camera-bookmarks',
  'retained-context',
  'progressive-reveal',
  'grounded-counterfactual-twins',
  'detail-lenses',
  'restrained-state-cues',
  'explicit-unknown-incompatible',
  'comparable-small-multiples',
  'meaning-preserving-match-cuts',
  'stable-final-snapshots',
  'exact-aligned-time-anchors',
] as const;
