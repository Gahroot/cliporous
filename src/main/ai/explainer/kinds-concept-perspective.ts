import {
  type DigitalTwinScene,
  PERSPECTIVE_LAYOUTS,
  PERSPECTIVE_PRESETS,
  type PossibleFuturesScene,
  type ScaleHierarchyScene,
} from '../../remotion/compositions/explainer/concepts/perspective/types';
import type { TechnologyStory } from '../../remotion/compositions/explainer/technology/types';
import type { SceneCue } from '../../remotion/compositions/explainer/types';
import { parseBusinessAlternatives } from './business-futures-contract';
import {
  containsActor,
  escaped,
  exactKeys,
  hasPhrase,
  localPhrase,
  perspectiveEvidence,
  perspectiveStory,
  perspectiveText,
  UNACHIEVED,
} from './concept-perspective-contract';
import { type AnyKindSpec, isRec, type KindSpec, type ParseContext, type Rec } from './kind-spec';
import { mechanismIssue } from './mechanism-contract';
import { technologyClause, technologySource } from './technology-contract';

const LIMITS =
  'Five source word beats setupWord/actionWord/responseWord/checkWord/resolveWord; 5–12s with gaps ≥0.6/1/1/1s and final hold ≥0.8s. label≤32, subject≤24, outcome≤40, condition≤56. Every string quotes the source; preserve complete conditions. Evidence indices cover one entire local sentence. No extra fields, numbers, odds, winner, coordinates or telemetry.';
const COMMON = {
  layouts: PERSPECTIVE_LAYOUTS,
  durationSec: [5, 12] as const,
  cues: (scene: TechnologyStory): SceneCue[] => [
    { kind: 'flip', at: scene.actionAt, gain: 0.3 },
    { kind: 'tick', at: scene.checkAt, gain: 0.25 },
  ],
};

export function parseScaleHierarchy(raw: Rec, ctx: ParseContext): ScaleHierarchyScene | null {
  if (raw.preset !== 'chip-to-center' && raw.preset !== 'customer-to-market')
    return mechanismIssue(ctx, 'unknown scale-hierarchy preset');
  const story = perspectiveStory(raw, ctx, ['levels']);
  const chip = raw.preset === 'chip-to-center';
  if (!story || !Array.isArray(raw.levels) || raw.levels.length !== (chip ? 3 : 2))
    return mechanismIssue(ctx, 'chip needs server/rack/center; customer needs segment/market');
  if (!(chip ? /\bchip\b/i : /\bcustomer\b/i).test(story.subject))
    return mechanismIssue(ctx, 'the tracked subject must match the authored chip/customer');
  const roles = chip
    ? [/\bserver\b/i, /\brack\b/i, /\bdata cent(?:er|re)\b/i]
    : [/\b(?:segment|group|cohort)\b/i, /\bmarket\b/i];
  const levels: ScaleHierarchyScene['levels'] = [];
  let inner = story.subject;
  for (const [index, entry] of raw.levels.entries()) {
    if (!isRec(entry) || !exactKeys(entry, ['label', 'evidenceStartWord', 'evidenceEndWord'], ctx))
      return mechanismIssue(ctx, 'malformed hierarchy entry');
    const evidence = perspectiveEvidence(entry, ctx);
    const label = evidence && localPhrase(entry.label, evidence, ctx);
    if (
      !evidence ||
      !label ||
      !roles[index]?.test(label) ||
      !containsActor(evidence, inner, label) ||
      levels.some((level) => level.label.toLowerCase() === label.toLowerCase())
    )
      return mechanismIssue(
        ctx,
        'each level needs explicit directed containment of the preceding actor, not noun presence or a proposal',
      );
    levels.push({ id: `level-${index}`, label });
    inner = label;
  }
  const resolution = technologyClause(ctx, raw.resolveWord);
  if (
    UNACHIEVED.test(resolution) ||
    !hasPhrase(resolution, story.subject) ||
    !hasPhrase(resolution, inner) ||
    !/\b(?:remains|stays|same|identif\w*|tracked)\b/i.test(resolution)
  )
    return mechanismIssue(
      ctx,
      'resolution must retain the same original chip/customer in the outer system',
    );
  return {
    kind: 'scale-hierarchy',
    preset: raw.preset,
    ...story,
    trackedId: 'tracked-subject',
    levels,
  };
}

const SCALE: KindSpec<'scale-hierarchy'> = {
  ...COMMON,
  kind: 'scale-hierarchy',
  family: 'framework',
  describe:
    'Reveal a tracked chip inside a server, rack and data center, or the same customer within a segment and market. Authored illustrative scale, never counts or measured size.',
  schema: `{"kind":"scale-hierarchy","preset":"${PERSPECTIVE_PRESETS['scale-hierarchy'].join('|')}","label":"source","subject":"source chip/customer","levels":[{"label":"server/segment","evidenceStartWord":N,"evidenceEndWord":N}],"outcome":"source retained identity","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}`,
  limits: `${LIMITS} levels are 3 server/rack/data center entries or 2 segment/market entries, each label≤22. Each locally contains the preceding actor, in that direction. Final sentence identifies original subject and outer system.`,
  triggers: [
    /\bchip\b.{0,100}\b(?:server|rack|data cent(?:er|re))\b/,
    /\bcustomer\b.{0,90}\b(?:segment|market)\b/,
  ],
  avoid:
    'No unsupported nesting, reversed containment, numerical market size, or losing the original actor.',
  parse: parseScaleHierarchy,
};

const POSSIBLE = /\b(?:could|may|might|possible|possibly)\b/i;
const NEGATED =
  /\b(?:not|never|cannot|can't|couldn't|won't|isn't|doesn't|without|impossible|ruled out)\b/i;
const CHANGE = {
  reduced: /\b(?:lower|reduced|less|slower)\b.{0,24}\b(?:capacity|output|production)\b/i,
  steady: /\b(?:steady|unchanged|same)\b.{0,24}\b(?:capacity|output|production)\b/i,
  expanded: /\b(?:higher|expanded|greater|more)\b.{0,24}\b(?:capacity|output|production)\b/i,
};

export function parsePossibleFutures(raw: Rec, ctx: ParseContext): PossibleFuturesScene | null {
  if (raw.preset !== 'branching-scenarios' && raw.preset !== 'forecast-range')
    return mechanismIssue(ctx, 'unknown possible-futures preset');
  const optedIn = Object.hasOwn(raw, 'businessAlternatives');
  const legacyRaw = optedIn
    ? Object.fromEntries(
        Object.entries(raw).filter(
          ([key]) => key !== 'businessAlternatives' && key !== 'visualMode',
        ),
      )
    : raw;
  const story = perspectiveStory(legacyRaw, ctx, ['alternatives', 'uncertainty']);
  if (!story || !/\b(?:line|factory|plant|workshop|production)\b/i.test(story.subject))
    return mechanismIssue(
      ctx,
      'futures use an explicitly named production system, not arbitrary forecast geometry',
    );
  if (
    !Array.isArray(raw.alternatives) ||
    raw.alternatives.length < 2 ||
    raw.alternatives.length > 3 ||
    (raw.preset === 'forecast-range' && raw.alternatives.length !== 2)
  )
    return mechanismIssue(
      ctx,
      'futures need 2–3 alternatives; a qualitative range needs exactly two endpoints',
    );
  const resolution = technologyClause(ctx, raw.resolveWord);
  const uncertainty = localPhrase(raw.uncertainty, resolution, ctx, 40);
  if (
    !uncertainty ||
    !/\b(?:uncertain|unresolved|not certain|no outcome is certain|no winner|no single forecast)\b/i.test(
      uncertainty,
    ) ||
    !hasPhrase(resolution, story.subject)
  )
    return mechanismIssue(
      ctx,
      'final source sentence must retain uncertainty for this same production system',
    );
  if (
    /\d|%|\b(?:odds|percent|probability|guaranteed|certain winner)\b/i.test(
      [story.label, story.subject, story.outcome, uncertainty].join(' '),
    )
  )
    return mechanismIssue(
      ctx,
      'qualitative futures cannot encode quantities, probabilities or guaranteed winners',
    );
  const alternatives: PossibleFuturesScene['alternatives'] = [];
  let previousEnd = -1;
  for (const [index, entry] of raw.alternatives.entries()) {
    if (
      !isRec(entry) ||
      !exactKeys(
        entry,
        ['label', 'change', 'qualifier', 'evidenceStartWord', 'evidenceEndWord'],
        ctx,
      )
    )
      return mechanismIssue(ctx, 'malformed alternative');
    if (entry.change !== 'reduced' && entry.change !== 'steady' && entry.change !== 'expanded')
      return mechanismIssue(ctx, 'unsupported qualitative production change');
    const evidence = perspectiveEvidence(entry, ctx);
    const label = evidence && localPhrase(entry.label, evidence, ctx);
    const qualifier = evidence && localPhrase(entry.qualifier, evidence, ctx, 40);
    const first = ctx.inWin(entry.evidenceStartWord);
    const last = ctx.inWin(entry.evidenceEndWord);
    if (
      !evidence ||
      !label ||
      !qualifier ||
      first === null ||
      last === null ||
      first <= previousEnd ||
      !CHANGE[entry.change].test(label) ||
      !POSSIBLE.test(qualifier) ||
      NEGATED.test(evidence) ||
      !hasPhrase(qualifier, label) ||
      /\d|%|\b(?:odds|percent|probability)\b/i.test(evidence)
    )
      return mechanismIssue(
        ctx,
        'each alternative needs a separate ordered local possibility, its matching qualitative change and complete qualifier, never odds or negation',
      );
    const relation = new RegExp(
      `\\b${escaped(story.subject)}\\b (?:could|may|might) (?:have|retain|reach|show|see) (?:a |the )?${escaped(label)}\\b`,
    );
    if (
      !relation.test(perspectiveText(evidence)) ||
      alternatives.some(
        (a) => a.change === entry.change || perspectiveText(a.label) === perspectiveText(label),
      )
    )
      return mechanismIssue(
        ctx,
        'possibility must belong to this actor and differ from the other alternatives',
      );
    alternatives.push({ id: `alternative-${index}`, label, change: entry.change, qualifier });
    previousEnd = last;
  }
  if (raw.preset === 'forecast-range') {
    const check = technologyClause(ctx, raw.checkWord);
    if (
      alternatives[0]?.change !== 'reduced' ||
      alternatives[1]?.change !== 'expanded' ||
      !/\b(?:range|between)\b/i.test(check) ||
      NEGATED.test(check) ||
      !alternatives.every((a) => hasPhrase(check, a.label))
    )
      return mechanismIssue(
        ctx,
        'range endpoints need explicit lower-to-higher source support; no quantitative band or implied distribution',
      );
  }
  // A later winner or definitive forecast must not be laundered into an unresolved diagram.
  if (
    /\b(?:will|definitely|guaranteed|chosen|selected|wins?|certain winner)\b/i.test(resolution) ||
    /\b(?:no|not)\s+(?:longer\s+)?uncertain\b/i.test(resolution)
  )
    return mechanismIssue(
      ctx,
      'do not present a resolved or guaranteed source outcome as uncertain alternatives',
    );
  const legacy: PossibleFuturesScene = {
    kind: 'possible-futures',
    preset: raw.preset,
    ...story,
    alternatives,
    uncertainty,
  };
  if (!optedIn) return legacy;
  const lens = parseBusinessAlternatives(raw, ctx, legacy);
  return lens ? { ...legacy, businessAlternatives: lens } : null;
}

function gateState(source: string, actor: string, part: string, state: 'open' | 'closed'): boolean {
  const text = perspectiveText(source);
  return (
    !UNACHIEVED.test(source) &&
    (new RegExp(
      `\\b${escaped(actor)}\\b (?:has|keeps) (?:a |the )?${state} ${escaped(part)}\\b`,
    ).test(text) ||
      new RegExp(`\\b${escaped(actor)}\\b (?:remains|stays|is) ${state}\\b`).test(text))
  );
}

export function parseDigitalTwin(raw: Rec, ctx: ParseContext): DigitalTwinScene | null {
  if (raw.preset !== 'mirror-state' && raw.preset !== 'simulated-change')
    return mechanismIssue(ctx, 'unknown digital-twin preset');
  const story = perspectiveStory(raw, ctx, [
    'physical',
    'model',
    'partLabel',
    'qualifier',
    'intervention',
  ]);
  if (!story || !isRec(raw.physical) || !isRec(raw.model))
    return mechanismIssue(ctx, 'digital twin needs separate physical and model actors');
  if (
    !exactKeys(raw.physical, ['label', 'state', 'evidenceStartWord', 'evidenceEndWord'], ctx) ||
    !exactKeys(raw.model, ['label', 'evidenceStartWord', 'evidenceEndWord'], ctx)
  )
    return null;
  const physicalEvidence = perspectiveEvidence(raw.physical, ctx);
  const modelEvidence = perspectiveEvidence(raw.model, ctx);
  const physicalLabel = physicalEvidence && localPhrase(raw.physical.label, physicalEvidence, ctx);
  const modelLabel = modelEvidence && localPhrase(raw.model.label, modelEvidence, ctx);
  const partLabel = physicalEvidence && localPhrase(raw.partLabel, physicalEvidence, ctx);
  const physicalState = raw.physical.state;
  if (
    !physicalEvidence ||
    !modelEvidence ||
    !physicalLabel ||
    !modelLabel ||
    !partLabel ||
    (physicalState !== 'open' && physicalState !== 'closed')
  )
    return mechanismIssue(ctx, 'physical gate needs a local source-backed open/closed state');
  if (
    perspectiveText(physicalLabel) !== perspectiveText(story.subject) ||
    !/\b(?:conveyor|line)\b/i.test(physicalLabel) ||
    !/\b(?:physical|actual|real)\b/i.test(physicalLabel) ||
    !/\b(?:model|twin)\b/i.test(modelLabel) ||
    !/\bgate\b/i.test(partLabel) ||
    !gateState(physicalEvidence, physicalLabel, partLabel, physicalState)
  )
    return mechanismIssue(
      ctx,
      'the authored gate must belong to the named actual conveyor, not another actor or a proposed state',
    );
  const correspondence = new RegExp(
    `\\b${escaped(modelLabel)}\\b (?:mirrors|represents|corresponds to) (?:the )?${escaped(physicalLabel)}(?: s)? ${escaped(partLabel)}\\b`,
  );
  if (UNACHIEVED.test(modelEvidence) || !correspondence.test(perspectiveText(modelEvidence)))
    return mechanismIssue(
      ctx,
      'model must explicitly correspond to this physical gate, never noun presence or reversed telemetry',
    );
  const check = technologyClause(ctx, raw.checkWord);
  const qualifier = localPhrase(raw.qualifier, check, ctx, 40);
  if (
    !qualifier ||
    !/\b(?:illustrative|simulation only|simulated only|not live telemetry)\b/i.test(qualifier)
  )
    return mechanismIssue(
      ctx,
      'retain an explicit illustration/simulation qualifier, not a live telemetry claim',
    );
  const resolution = technologyClause(ctx, raw.resolveWord);
  if (!hasPhrase(resolution, physicalLabel) || !hasPhrase(resolution, modelLabel))
    return mechanismIssue(ctx, 'resolve must distinguish the same physical system and model');
  let simulatedState: DigitalTwinScene['simulatedState'];
  if (raw.preset === 'simulated-change') {
    if (
      !isRec(raw.intervention) ||
      !exactKeys(raw.intervention, ['state', 'evidenceStartWord', 'evidenceEndWord'], ctx)
    )
      return mechanismIssue(ctx, 'simulated change needs local model-only intervention evidence');
    const evidence = perspectiveEvidence(raw.intervention, ctx);
    const target = raw.intervention.state;
    if (
      !evidence ||
      (target !== 'open' && target !== 'closed') ||
      target === physicalState ||
      !hasPhrase(evidence, modelLabel) ||
      !hasPhrase(evidence, partLabel) ||
      !/\b(?:simulat\w*|proposed|test)\b/i.test(evidence) ||
      NEGATED.test(evidence)
    )
      return mechanismIssue(ctx, 'intervention changes only the named model gate in simulation');
    const intervention = (state: 'open' | 'closed'): RegExp =>
      new RegExp(
        `\\b${escaped(modelLabel)}\\b (?:simulates|tests|would simulate) (?:an? )?(?:${state === 'open' ? 'opening|open' : 'closing|closed'}) (?:of )?(?:the )?${escaped(partLabel)}\\b`,
      );
    const interventionSource = perspectiveText(evidence);
    if (
      !intervention(target).test(interventionSource) ||
      intervention(target === 'open' ? 'closed' : 'open').test(interventionSource) ||
      !gateState(resolution, physicalLabel, partLabel, physicalState)
    )
      return mechanismIssue(
        ctx,
        'simulation direction and unchanged physical state must both be explicit',
      );
    if (
      !new RegExp(
        `\\b${escaped(modelLabel)}\\b (?:is |stays |remains )?(?:simulated|hypothetical)\\b`,
      ).test(perspectiveText(resolution))
    )
      return mechanismIssue(
        ctx,
        'final model outcome must remain explicitly simulated, never an observed change',
      );
    simulatedState = target;
  } else {
    if (
      raw.intervention !== undefined ||
      !new RegExp(
        `\\b${escaped(physicalLabel)} and (?:the )?${escaped(modelLabel)} (?:remain|stay|are) ${physicalState}\\b`,
      ).test(perspectiveText(resolution)) ||
      UNACHIEVED.test(resolution)
    )
      return mechanismIssue(
        ctx,
        'mirror-state must retain the same supported state, without a simulated intervention',
      );
  }
  if (
    /\b(?:live telemetry|real time|real-time)\b/i.test(technologySource(ctx)) &&
    !/\bnot live telemetry\b/i.test(qualifier)
  )
    return mechanismIssue(ctx, 'this authored illustration is not actual telemetry');
  return {
    kind: 'digital-twin',
    preset: raw.preset,
    ...story,
    physical: { id: 'physical-line', label: physicalLabel },
    model: { id: 'model-line', label: modelLabel },
    partLabel,
    physicalState,
    ...(simulatedState ? { simulatedState } : {}),
    qualifier,
  };
}

const FUTURES: KindSpec<'possible-futures'> = {
  ...COMMON,
  kind: 'possible-futures',
  family: 'compare',
  describe:
    'Illustrative production-line alternatives diverge from one present. Branches retain equal visual weight and no winner; forecast-range shows explicitly qualitative lower/higher capacity endpoints, never odds or measured probability geometry.',
  schema:
    '{"kind":"possible-futures","preset":"branching-scenarios|forecast-range","label":"source","subject":"named production line","alternatives":[{"label":"lower capacity","change":"reduced|steady|expanded","qualifier":"could have lower capacity","evidenceStartWord":N,"evidenceEndWord":N}],"uncertainty":"source unresolved phrase","outcome":"source","condition":"complete source condition if present","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits: `${LIMITS} 2–3 separate source sentences attach could/may/might have/retain/reach/show/see to the SAME subject and a distinct qualitative capacity/output label≤22; qualifier≤40 quotes the modal and label. range: exactly reduced then expanded; check sentence names both endpoints as a range. Final sentence identifies subject and uncertainty≤40. No numeric ranges in this qualitative preset. Optional OP-75 snapshot only for fully accepted branching-scenarios: add visualMode:"diagram"|"hybrid" AND businessAlternatives:{version:1,evidence:{state:"illustrative",label,source:{fromWord,toWord}},baseline:{identity:{id,label,source},subject:{id,label,source},period,revision,source},records:[{alternativeId:"alternative-0",baselineId,subjectId,period,revision,identity:{id,label,source},source}],native:null|{assembly:"A-03",baselineId,subjectId,period,revision,source}}. Exactly one record per existing alternative, same actual baseline/subject/period/revision, complete positive local setup/action clauses retain each existing possibility qualifier and describe illustrative alternative records, not achieved output. Hybrid requires independent source-backed A-03 record assembly; diagram may explicitly use native:null. Equal area/exposure, no winner, numbers or probability; complete fixed-font pages must fit. Neither optional field is permitted alone; absent opt-in preserves the historical renderer.`,
  triggers: [
    /\b(?:possible futures|branching scenarios|forecast range)\b/,
    /\b(?:line|production|factory|plant)\b.{0,100}\b(?:could|might|may|uncertain)\b/,
  ],
  avoid:
    'No actual outcomes, fabricated probability bands, a selected winner, non-production nouns substituted onto factory geometry, or one precise forecast.',
  parse: parsePossibleFutures,
};

const TWIN: KindSpec<'digital-twin'> = {
  ...COMMON,
  kind: 'digital-twin',
  family: 'compare',
  describe:
    'Separate clay conveyor and miniature model correspond at a named safety gate. mirror-state is an illustrative correspondence, not live telemetry. simulated-change changes ONLY the model gate, preserving the explicitly unchanged physical state.',
  schema:
    '{"kind":"digital-twin","preset":"mirror-state|simulated-change","label":"source","subject":"actual conveyor","physical":{"label":"actual conveyor","state":"open|closed","evidenceStartWord":N,"evidenceEndWord":N},"model":{"label":"digital model","evidenceStartWord":N,"evidenceEndWord":N},"partLabel":"safety gate","qualifier":"illustrative only|simulation only|not live telemetry","intervention":{"state":"open|closed","evidenceStartWord":N,"evidenceEndWord":N},"outcome":"source","setupWord":N,"actionWord":N,"responseWord":N,"checkWord":N,"resolveWord":N}',
  limits: `${LIMITS} physical/model/part labels≤22, qualifier≤40 in check sentence. physical explicitly actual/physical/real conveyor/line with a supported gate state. Model explicitly mirrors/represents/corresponds to that actor's gate. intervention ONLY for simulated-change: model simulates opening/closing the gate; resolve separately states physical remains open/closed and model remains simulated. Mirror resolve states both remain in the supported state.`,
  triggers: [
    /\b(?:digital twin|digital model)\b/,
    /\b(?:conveyor|safety gate)\b.{0,100}\b(?:simulat\w*|mirrors?|model)\b/,
  ],
  avoid:
    'No real telemetry, observed improvement inferred from a simulation, physical intervention, invented performance, or a model unbound to its physical counterpart.',
  parse: parseDigitalTwin,
};

export const CONCEPT_PERSPECTIVE_SPECS = [
  SCALE,
  FUTURES,
  TWIN,
] as const satisfies readonly AnyKindSpec[];
