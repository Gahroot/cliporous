import {
  SPATIAL_PRESETS,
  type SpatialScene,
} from '../../remotion/compositions/explainer/spatial/types';
import {
  TECHNOLOGY_LAYOUTS,
  TECHNOLOGY_LIMITS,
  type TechnologyStory,
} from '../../remotion/compositions/explainer/technology/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import type { AnyKindSpec, KindSpec, ParseContext } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import {
  type SpatialEvidence,
  spatialLabel,
  spatialLabels,
  spatialPreset,
  spatialRelationship,
  spatialStory,
  spatialText,
} from './spatial-contract';

const LIMITS =
  'label ≤32, subject ≤24, outcome ≤40, condition ≤56; every visible string must be a contiguous source phrase. Preserve the complete source condition. Five integer source word indices setupWord/actionWord/responseWord/checkWord/resolveWord; 5–12s, gaps ≥0.6/1/1/1s, final hold ≥0.8s. Setup identifies the subject; action/response demonstrate the named relationship; check/resolve establish the same subject’s outcome. No invented improvements, amounts, forecasts, coordinates, geometry, URLs or extra fields.';

function schema(kind: SpatialScene['kind'], fields: string): string {
  return `{"kind":"${kind}","preset":"${SPATIAL_PRESETS[kind].join('|')}","label":"source phrase","subject":"source subject",${fields},"outcome":"source outcome phrase","condition":"complete source condition, only if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}`;
}

function cues(scene: TechnologyStory): SceneCue[] {
  return [
    { kind: 'flip', at: scene.actionAt, gain: 0.4 },
    { kind: 'tick', at: scene.checkAt, gain: 0.4 },
  ];
}

function complete<S extends SpatialScene>(
  scene: S,
  evidence: SpatialEvidence,
  ctx: ParseContext,
): S | null {
  return spatialRelationship(scene, evidence, ctx) ? scene : null;
}

const COMMON = {
  layouts: TECHNOLOGY_LAYOUTS,
  durationSec: [TECHNOLOGY_LIMITS.minDuration, TECHNOLOGY_LIMITS.maxDuration] as const,
  cues,
};

const CUTAWAY: KindSpec<'house-cutaway'> = {
  ...COMMON,
  kind: 'house-cutaway',
  family: 'object',
  describe:
    'Open a recognizable house to explain its anatomy: rooms exposes named interior spaces; utilities traces named systems carrying or connecting services through it. This is a reveal, not an upgrade.',
  schema: schema('house-cutaway', '"parts":["source room/system","source room/system"]'),
  limits: `${LIMITS} parts: 2–3 distinct strings ≤22 each. Rooms need a source reveal/containment relationship; utilities need an explicit route, flow, supply or connection, not room names alone.`,
  triggers: [
    /\b(?:house|home|building)\b.{0,90}\b(?:rooms?|interior|inside|cutaway)\b/,
    /\b(?:plumbing|wiring|utilities|pipes)\b.{0,90}\b(?:runs?|flows?|connect\w*|suppl\w*)\b/,
    /\b(?:roof|front)\b.{0,60}\b(?:opens?|lifts?|reveals?)\b/,
  ],
  avoid:
    'Not construction, improvements, room names without anatomy, or utility nouns without a service relationship.',
  parse(raw, ctx) {
    const preset = spatialPreset('house-cutaway', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'house-cutaway', ['parts']);
    const parts = spatialLabels(raw.parts, ctx, 2, 3);
    return preset && e && parts
      ? complete({ kind: 'house-cutaway', preset, ...e.story, parts }, e, ctx)
      : null;
  },
};

const BUILD: KindSpec<'house-build'> = {
  ...COMMON,
  kind: 'house-build',
  family: 'process',
  describe:
    'A blueprint guides foundation, walls and roof. construct needs a built house matching the named plan; plan-mismatch keeps the source-backed deviation visible, never silently fixes it.',
  schema: schema('house-build', '"planLabel":"source plan"'),
  limits: `${LIMITS} planLabel ≤22. Narration must describe actual assembly and the final match or mismatch to this named plan. A proposed build is not a completed one.`,
  triggers: [
    /\b(?:blueprint|building plan|house plan)\b/,
    /\b(?:build\w*|construct\w*)\b.{0,90}\b(?:foundation|walls?|roof|house)\b/,
    /\b(?:house|home|building)\b.{0,90}\b(?:matches?|deviat\w*|mismatch)\b/,
  ],
  avoid:
    'Not a plan mention without construction, an unmet condition presented as success, or a mismatch turned into a match.',
  parse(raw, ctx) {
    const preset = spatialPreset('house-build', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'house-build', ['planLabel']);
    const planLabel = spatialLabel(raw.planLabel, ctx);
    return preset && e && planLabel
      ? complete({ kind: 'house-build', preset, ...e.story, planLabel }, e, ctx)
      : null;
  },
};

const RENOVATION: KindSpec<'house-renovation'> = {
  ...COMMON,
  kind: 'house-renovation',
  family: 'process',
  describe:
    'cosmetic changes a named surface finish; structural exposes and repairs/replaces a named load-bearing part. The narration must establish its support role. Neither branch predicts property value.',
  schema: schema('house-renovation', '"partLabel":"source treated part"'),
  limits: `${LIMITS} partLabel ≤22. Ground the treatment AND its surface/support role in the source. Resolve with the actual treatment, not a price or profit claim.`,
  triggers: [
    /\b(?:renovat\w*|cosmetic|load[- ]bearing|structural repair)\b/,
    /\b(?:house|home|wall|beam)\b.{0,90}\b(?:repaint\w*|repair\w*|reinforc\w*|replac\w*)\b/,
  ],
  avoid:
    'Not a cosmetic coat implying structural repair, a repaired object with no support role, or an invented valuation gain.',
  parse(raw, ctx) {
    const preset = spatialPreset('house-renovation', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'house-renovation', ['partLabel']);
    const partLabel = spatialLabel(raw.partLabel, ctx);
    return preset && e && partLabel
      ? complete({ kind: 'house-renovation', preset, ...e.story, partLabel }, e, ctx)
      : null;
  },
};

const ACCESS: KindSpec<'property-access'> = {
  ...COMMON,
  kind: 'property-access',
  family: 'framework',
  describe:
    'A scoped key opens only the source-authorized room and leaves a named restricted room closed. revoked-key explicitly withdraws that access and leaves even the formerly allowed room closed; a request is not permission.',
  schema: schema(
    'property-access',
    '"allowedLabel":"source allowed room","restrictedLabel":"source restricted room"',
  ),
  limits: `${LIMITS} allowedLabel/restrictedLabel ≤22 and distinct. Require explicit allowed/denied relationships to these rooms. revoked-key requires withdrawal of this key’s permission and a denied final outcome.`,
  triggers: [
    /\b(?:key|credential|permission|access)\b.{0,90}\b(?:room|door|unlock\w*|revok\w*|restrict\w*)\b/,
    /\b(?:room|door)\b.{0,80}\b(?:locked|permission|access)\b/,
  ],
  avoid:
    'Not a generic approval gate, a key mention without scoped permission, a denial turned into a grant, or a revoked key still opening the room.',
  parse(raw, ctx) {
    const preset = spatialPreset('property-access', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'property-access', ['allowedLabel', 'restrictedLabel']);
    const allowedLabel = spatialLabel(raw.allowedLabel, ctx);
    const restrictedLabel = spatialLabel(raw.restrictedLabel, ctx);
    if (!preset || !e || !allowedLabel || !restrictedLabel) return null;
    if (spatialText(allowedLabel) === spatialText(restrictedLabel))
      return mechanismIssue(ctx, 'allowed and restricted rooms must be distinct source labels');
    return complete(
      { kind: 'property-access', preset, ...e.story, allowedLabel, restrictedLabel },
      e,
      ctx,
    );
  },
};

const NEIGHBORHOOD: KindSpec<'neighborhood'> = {
  ...COMMON,
  kind: 'neighborhood',
  family: 'framework',
  describe:
    'replicate repeats the same home/template into an illustrative bounded block; context keeps the home unchanged while two named surroundings differ. Copies are not market counts or a forecast.',
  schema: schema(
    'neighborhood',
    '"contextLabels":["source template/context","source template/context"]',
  ),
  limits: `${LIMITS} contextLabels: exactly 2 distinct strings ≤22 each. Link both labels to replication, or to changed surroundings with an explicitly unchanged house.`,
  triggers: [
    /\b(?:house|home|design|template)\b.{0,90}\b(?:replicat\w*|repeat\w*|copied|copies|neighbou?rhood)\b/,
    /\b(?:same|unchanged)\b.{0,35}\b(?:house|home)\b.{0,90}\b(?:surroundings|context|street|setting)\b/,
  ],
  avoid:
    'Not unsupported scale counts, different homes mislabeled as one home, or a changed house presented as changed surroundings.',
  parse(raw, ctx) {
    const preset = spatialPreset('neighborhood', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'neighborhood', ['contextLabels']);
    const contextLabels = spatialLabels(raw.contextLabels, ctx, 2, 2);
    return preset && e && contextLabels
      ? complete({ kind: 'neighborhood', preset, ...e.story, contextLabels }, e, ctx)
      : null;
  },
};

const FIT: KindSpec<'floorplan-fit'> = {
  ...COMMON,
  kind: 'floorplan-fit',
  family: 'object',
  describe:
    'Recognizable furniture fits inside a fixed room, or is explicitly rearranged within it. Narration establishes containment and the relation of the named items; walls never move or get crossed.',
  schema: schema('floorplan-fit', '"items":["source furniture","source furniture"]'),
  limits: `${LIMITS} items: 2–3 distinct source strings ≤22 each. fits is containment, not a claim of rearrangement; rearrange needs actual repositioning within the same room and a grounded final arrangement.`,
  triggers: [
    /\b(?:furniture|sofa|table|desk|chair|bed)\b.{0,90}\b(?:fits?|rearrang\w*|room|floorplan)\b/,
    /\b(?:rearrang\w*|reposition\w*)\b.{0,90}\b(?:room|furniture|sofa|table)\b/,
  ],
  avoid: 'Not a noun list, hypothetical fit, room expansion, or furniture moving through walls.',
  parse(raw, ctx) {
    const preset = spatialPreset('floorplan-fit', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'floorplan-fit', ['items']);
    const items = spatialLabels(raw.items, ctx, 2, 3);
    return preset && e && items
      ? complete({ kind: 'floorplan-fit', preset, ...e.story, items }, e, ctx)
      : null;
  },
};

const OPTIONS: KindSpec<'house-options'> = {
  ...COMMON,
  kind: 'house-options',
  family: 'compare',
  describe:
    'Show two source-backed alternative treatments of the same house without choosing a winner. compare juxtaposes options; tradeoff needs explicit gains/costs or exchanged qualities for each alternative.',
  schema: schema('house-options', '"options":["source alternative","source alternative"]'),
  limits: `${LIMITS} options: exactly 2 distinct strings ≤22 each. Both must be compared for this home. Keep the final choice unresolved; no unsupported winner, price, profit or forecast.`,
  triggers: [
    /\b(?:house|home|property)\b.{0,90}\b(?:options?|alternatives?|trade[- ]offs?|compare|versus)\b/,
    /\b(?:renovat\w*|extension|layout)\b.{0,90}\b(?:trade[- ]off|alternative|choice)\b/,
  ],
  avoid:
    'Not different properties, a single treatment, or a comparison that declares a winner; costs/benefits must be spoken, never fabricated.',
  parse(raw, ctx) {
    const preset = spatialPreset('house-options', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'house-options', ['options']);
    const options = spatialLabels(raw.options, ctx, 2, 2);
    return preset && e && options
      ? complete({ kind: 'house-options', preset, ...e.story, options }, e, ctx)
      : null;
  },
};

const LIFECYCLE: KindSpec<'property-lifecycle'> = {
  ...COMMON,
  kind: 'property-lifecycle',
  family: 'process',
  describe:
    'A property becomes occupied as tenants move in, receives maintenance after wear/damage, or receives income while paying expenses in separate streams. Rent is never relabeled profit.',
  schema: schema(
    'property-lifecycle',
    '"stageLabels":["source initial stage","source final stage"]',
  ),
  limits: `${LIMITS} stageLabels: 2–3 distinct strings ≤22 each, chronological, final label in the resolution. cash-flow requires exactly 2 source labels in income-then-expense order (for example rent and repairs), with explicit incoming and outgoing relationships; no net-profit inference.`,
  triggers: [
    /\b(?:house|home|property)\b.{0,110}\b(?:tenants?|occupied|maintenance|income|expense|cash[- ]flow)\b/,
    /\b(?:tenants?|rent|repairs?)\b.{0,80}\b(?:move in|occupied|income|expense|maintained)\b/,
  ],
  avoid:
    'Not occupancy from tenant mentions alone, repairs from damage mentions alone, or income treated as profit; show only the supported lifecycle branch.',
  parse(raw, ctx) {
    const preset = spatialPreset('property-lifecycle', raw.preset, ctx);
    const e = spatialStory(raw, ctx, 'property-lifecycle', ['stageLabels']);
    const stageLabels = spatialLabels(raw.stageLabels, ctx, 2, preset === 'cash-flow' ? 2 : 3);
    return preset && e && stageLabels
      ? complete({ kind: 'property-lifecycle', preset, ...e.story, stageLabels }, e, ctx)
      : null;
  },
};

export const SPATIAL_KIND_SPECS = [
  CUTAWAY,
  BUILD,
  RENOVATION,
  ACCESS,
  NEIGHBORHOOD,
  FIT,
  OPTIONS,
  LIFECYCLE,
] as const satisfies readonly AnyKindSpec[];
